"""Somente bundles sinteticos em tmp_path; nenhuma limpeza do TEMP real."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import pytest

import newprod_mei as mei


def bundle(raiz, nome="_MEI123", idade=172800, assinatura=mei.ASSINATURA):
    pasta = raiz / nome
    pasta.mkdir()
    (pasta / "lib").mkdir()
    (pasta / "lib" / "modulo.dll").write_bytes(b"sintetico")
    marcador = pasta / mei.MARCADOR
    if assinatura is not None:
        marcador.write_bytes(assinatura)
        antes = time.time() - idade
        os.utime(marcador, (antes, antes))
    return pasta


def test_remove_so_identificados_antigos(tmp_path):
    alvo = bundle(tmp_path)
    recentes = bundle(tmp_path, "_MEI456", idade=60)
    antigo_sem_marca = bundle(tmp_path, "_MEI789", assinatura=None)
    outro_app = bundle(tmp_path, "_MEIabc", assinatura=b"Outro produto")
    fora = bundle(tmp_path, "documentos")
    r = mei.limpar_abandonados(tmp_path)
    assert r["pastas_removidas"] == 1 and r["bytes_removidos"] == 9
    assert r["recentes"] == 1 and r["sem_identificacao"] == 2
    assert not alvo.exists()
    assert all(p.exists() for p in (recentes, antigo_sem_marca, outro_app, fora))
    assert str(tmp_path) not in json.dumps(r)


def test_bundle_atual_sempre_preservado(tmp_path, monkeypatch):
    pasta = bundle(tmp_path)
    monkeypatch.setattr(sys, "_MEIPASS", str(pasta), raising=False)
    assert mei.limpar_abandonados(tmp_path)["ativos"] == 1
    assert pasta.exists()


def test_locks_compartilhados_protegem_todos_os_processos(tmp_path):
    pasta = bundle(tmp_path)
    codigo = (
        "import sys; import newprod_mei as m; "
        f"h=open({str(pasta / mei.MARCADOR)!r},'r+b'); "
        "m._travar(h,False); print('pronto',flush=True); input()"
    )
    processos = []
    try:
        for _ in range(2):
            p = subprocess.Popen([sys.executable, "-c", codigo],
                                 cwd=Path(__file__).resolve().parents[1],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True)
            processos.append(p)
            assert p.stdout.readline().strip() == "pronto"
        assert mei.limpar_abandonados(tmp_path)["ativos"] == 1
        processos[0].communicate("\n", timeout=10)
        assert mei.limpar_abandonados(tmp_path)["ativos"] == 1
        processos[1].kill()  # Queda tambem libera a trava no sistema operacional.
        processos[1].communicate(timeout=10)
        assert mei.limpar_abandonados(tmp_path)["pastas_removidas"] == 1
    finally:
        for p in processos:
            if p.poll() is None:
                p.kill()
                p.communicate(timeout=10)


def test_runtime_registra_apenas_o_proprio_bundle(tmp_path, monkeypatch):
    pasta = bundle(tmp_path, assinatura=None)
    outro = bundle(tmp_path, "_MEI456", assinatura=None)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(pasta), raising=False)
    monkeypatch.setattr(mei.tempfile, "gettempdir", lambda: str(tmp_path))
    monkeypatch.setattr(mei, "_handles", [])
    try:
        assert mei.registrar_runtime()
        assert mei.registrar_runtime()  # Compartilha lock, nao sobrescreve marcador.
        assert not (outro / mei.MARCADOR).exists()
        monkeypatch.delattr(sys, "_MEIPASS")
        assert mei.limpar_abandonados(tmp_path, agora=time.time()+172800)["ativos"] == 1
    finally:
        for h in mei._handles:
            h.close()


def test_runtime_fora_do_temp_ou_nao_frozen_nao_marca(tmp_path, monkeypatch):
    pasta = bundle(tmp_path, assinatura=None)
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(pasta), raising=False)
    assert not mei.registrar_runtime()
    monkeypatch.setattr(sys, "frozen", True)
    monkeypatch.setattr(mei.tempfile, "gettempdir", lambda: str(tmp_path / "outro"))
    assert not mei.registrar_runtime()
    assert not (pasta / mei.MARCADOR).exists()


def test_link_impede_remocao_inteira(tmp_path):
    pasta = bundle(tmp_path)
    fora = tmp_path / "externo"
    fora.mkdir()
    (fora / "preservar.txt").write_bytes(b"preservado")
    link = pasta / "atalho"
    try:
        link.symlink_to(fora, target_is_directory=True)
    except OSError:
        if os.name != "nt":
            raise
        import _winapi
        _winapi.CreateJunction(str(fora), str(link))
    assert mei.limpar_abandonados(tmp_path)["erros"] == 1
    assert (pasta / "lib" / "modulo.dll").exists()
    assert (fora / "preservar.txt").read_bytes() == b"preservado"


def test_hardlink_preserva_bundle(tmp_path):
    pasta = bundle(tmp_path)
    os.link(pasta / "lib" / "modulo.dll", tmp_path / "externo.dll")
    assert mei.limpar_abandonados(tmp_path)["erros"] == 1
    assert pasta.exists()


def test_falha_parcial_contabiliza_e_permite_retry(tmp_path, monkeypatch):
    pasta = bundle(tmp_path)
    extra = pasta / "extra.dll"
    extra.write_bytes(b"1234")
    original = Path.unlink
    def falhar(p, *args, **kwargs):
        if p.name == "modulo.dll":
            raise PermissionError("bloqueio sintetico")
        return original(p, *args, **kwargs)
    with monkeypatch.context() as m:
        m.setattr(Path, "unlink", falhar)
        r = mei.limpar_abandonados(tmp_path)
    assert r["erros"] == 1 and r["bytes_removidos"] == 4
    assert (pasta / mei.MARCADOR).exists()
    assert mei.limpar_abandonados(tmp_path)["pastas_removidas"] == 1


def test_limite_de_inventario_preserva_pasta(tmp_path, monkeypatch):
    pasta = bundle(tmp_path)
    monkeypatch.setattr(mei, "LIMITE_ENTRADAS", 1)
    assert mei.limpar_abandonados(tmp_path)["erros"] == 1
    assert (pasta / "lib" / "modulo.dll").exists()


def test_build_inclui_runtime_hook():
    raiz = Path(__file__).resolve().parents[1]
    assert "runtime_hooks=['newprod_mei_runtime.py']" in (raiz / "agent_tray.spec").read_text()


def test_marcador_futuro_preservado(tmp_path):
    pasta = bundle(tmp_path, idade=-86400)
    assert mei.limpar_abandonados(tmp_path)["recentes"] == 1
    assert pasta.exists()


def test_runtime_sem_espaco_para_criar_marcador(tmp_path, monkeypatch):
    pasta = bundle(tmp_path, assinatura=None)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(pasta), raising=False)
    monkeypatch.setattr(mei.tempfile, "gettempdir", lambda: str(tmp_path))
    def cheio(*args, **kwargs):
        raise OSError("sem espaco")
    monkeypatch.setattr(mei, "open", cheio, raising=False)
    assert not mei.registrar_runtime()
    assert not (pasta / mei.MARCADOR).exists()


def test_marcador_invalido_nao_e_reescrito(tmp_path, monkeypatch):
    pasta = bundle(tmp_path, assinatura=b"outro")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(pasta), raising=False)
    monkeypatch.setattr(mei.tempfile, "gettempdir", lambda: str(tmp_path))
    assert not mei.registrar_runtime()
    assert (pasta / mei.MARCADOR).read_bytes() == b"outro"


def test_execucao_de_desenvolvimento_nao_limpa_temp(tmp_path, monkeypatch):
    pasta = bundle(tmp_path)
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    monkeypatch.setattr(mei.tempfile, "gettempdir", lambda: str(tmp_path))
    assert mei.limpar_abandonados()["estado"] == "nao_empacotado"
    assert pasta.exists()


def test_erro_de_trava_nao_e_reportado_como_processo_ativo(tmp_path, monkeypatch):
    pasta = bundle(tmp_path)
    def falhar(*args, **kwargs):
        raise OSError("falha de API")
    monkeypatch.setattr(mei, "_travar", falhar)
    r = mei.limpar_abandonados(tmp_path)
    assert r["erros"] == 1 and r["ativos"] == 0
    assert pasta.exists()


def test_falha_no_flush_nao_impede_inicio_nem_libera_limpeza(tmp_path, monkeypatch):
    pasta = bundle(tmp_path, assinatura=None)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(pasta), raising=False)
    monkeypatch.setattr(mei.tempfile, "gettempdir", lambda: str(tmp_path))
    original = open
    class SemEspaco:
        def __init__(self, handle):
            self.handle = handle
        def write(self, data):
            return self.handle.write(data)
        def flush(self):
            self.handle.flush()  # Assinatura completa pode ter chegado ao disco.
            raise OSError("disco cheio")
        def close(self):
            self.handle.close()
    def abrir(path, modo):
        h = original(path, modo)
        return SemEspaco(h) if Path(path).name == mei.MARCADOR else h
    with monkeypatch.context() as m:
        m.setattr(mei, "open", abrir, raising=False)
        assert not mei.registrar_runtime()
    monkeypatch.delattr(sys, "_MEIPASS")
    assert (pasta / mei.INCOMPLETO).exists()
    r = mei.limpar_abandonados(tmp_path, agora=time.time() + 172800)
    assert r["sem_identificacao"] == 1 and pasta.exists()


def test_marcador_vazio_existente_nao_e_adotado(tmp_path, monkeypatch):
    pasta = bundle(tmp_path, assinatura=b"")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(pasta), raising=False)
    monkeypatch.setattr(mei.tempfile, "gettempdir", lambda: str(tmp_path))
    assert not mei.registrar_runtime()
    assert (pasta / mei.MARCADOR).read_bytes() == b""

