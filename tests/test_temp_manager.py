"""Dados sinteticos, sem importar app/db/worker nem iniciar servicos reais."""
import ast
import asyncio
import base64
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from types import SimpleNamespace

import pytest

import newprod_temp as tm

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture
def raiz(tmp_path, monkeypatch):
    r = tmp_path / "gerenciados"
    monkeypatch.setattr(tm, "pasta_raiz", lambda: r)
    return r


def antigo(job):
    t = time.time() - 2 * tm.RETENCAO_SEGUNDOS
    os.utime(job.pasta / ".owner.lock", (t, t))


def test_trabalhos_concorrentes_nao_colidem_e_limpam_em_erro(raiz):
    with tm.TrabalhoTemporario() as a, tm.TrabalhoTemporario() as b:
        pa, pb = Path(a.caminho("mesmo.pdf")), Path(b.caminho("mesmo.pdf"))
        pa.write_bytes(b"A"); pb.write_bytes(b"B")
        assert pa != pb
        a.close()
        assert not pa.exists() and pb.read_bytes() == b"B"
    with pytest.raises(ValueError), tm.TrabalhoTemporario() as c:
        with c.arquivo() as f:
            f.write(b"incompleto")
        raise ValueError("falha sintetica")
    assert list(raiz.iterdir()) == []


def test_limpeza_respeita_trava_idade_marcador_e_arquivos_externos(raiz, tmp_path):
    a, recente, falso = (tm.TrabalhoTemporario() for _ in range(3))
    try:
        Path(a.caminho("arquivo.pdf")).write_bytes(b"1234")
        antigo(a)
        externo = tmp_path / "tmp_fonte.ttf"
        externo.write_bytes(b"nao e do gerenciador")
        r = tm.limpar_abandonados()
        assert r["ativos"] == 1 and r["trabalhos_removidos"] == 0
        a._handle.close()  # Simula processo encerrado sem finally.
        recente._handle.close()
        antigo(falso)
        falso._handle.close()
        (falso.pasta / ".owner.lock").write_bytes(b"outro programa")
        r = tm.limpar_abandonados()
        assert r["trabalhos_removidos"] == 1 and r["bytes_removidos"] == 4
        assert recente.pasta.exists() and falso.pasta.exists() and externo.exists()
    finally:
        for job in (a, recente, falso):
            job._handle.close()


def test_trava_protege_outra_instancia_e_recupera_apos_queda(raiz):
    codigo = (
        "import time; from pathlib import Path; import newprod_temp as t; "
        f"j=t.TrabalhoTemporario({str(raiz)!r}); "
        "Path(j.caminho('teste.pdf')).write_bytes(b'123'); "
        "print(j.pasta,flush=True); input()"
    )
    processo = subprocess.Popen([sys.executable, "-c", codigo], cwd=REPO,
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True)
    try:
        pasta = Path(processo.stdout.readline().strip())
        assert pasta.parent == raiz
        t = time.time() - 2 * tm.RETENCAO_SEGUNDOS
        os.utime(pasta / ".owner.lock", (t, t))
        assert tm.limpar_abandonados()["ativos"] == 1
        processo.communicate("\n", timeout=10)
        assert tm.limpar_abandonados()["trabalhos_removidos"] == 1
        assert not pasta.exists()
    finally:
        if processo.poll() is None:
            processo.kill()
            processo.communicate(timeout=10)


def test_falha_de_exclusao_preserva_marcador_para_nova_tentativa(raiz, monkeypatch):
    job = tm.TrabalhoTemporario()
    p = Path(job.caminho("bloqueado.pdf")); p.write_bytes(b"123")
    antigo(job)
    unlink = Path.unlink
    def bloqueado(path, *args, **kwargs):
        if path == p:
            raise PermissionError("sintetico")
        return unlink(path, *args, **kwargs)
    with monkeypatch.context() as m:
        m.setattr(Path, "unlink", bloqueado)
        job.close()
    assert p.exists() and (job.pasta / ".owner.lock").exists()
    assert tm.limpar_abandonados()["trabalhos_removidos"] == 1


def test_subpasta_inesperada_impede_exclusao(raiz):
    job = tm.TrabalhoTemporario()
    (job.pasta / "inesperada").mkdir()
    p = Path(job.caminho("arquivo.pdf")); p.write_bytes(b"123")
    antigo(job); job._handle.close()
    assert tm.limpar_abandonados()["erros"] == 1
    assert p.exists()


def test_link_para_fora_nunca_e_seguido(raiz, tmp_path):
    fora = tmp_path / "fora"; fora.mkdir()
    protegido = fora / "arquivo.pdf"; protegido.write_bytes(b"preservado")
    job = tm.TrabalhoTemporario()
    link = job.pasta / "link"
    try:
        os.symlink(fora, link, target_is_directory=True)
    except OSError:
        if os.name != "nt":
            raise
        import _winapi
        _winapi.CreateJunction(str(fora), str(link))
    antigo(job); job._handle.close()
    assert tm.limpar_abandonados()["erros"] == 1
    assert protegido.read_bytes() == b"preservado"
    assert tm.medir_pasta(job.pasta)["links_ignorados"] == 1


def test_nome_sugerido_fica_dentro_do_trabalho(raiz):
    with tm.TrabalhoTemporario() as job:
        for nome in ("../../fora.pdf", "C:\\fora.pdf", "/fora.pdf", "..", "saida.pdf:ads"):
            assert Path(job.caminho(nome)).parent == job.pasta
            assert ":" not in Path(job.caminho(nome)).name
        assert Path(job.caminho("CON.pdf")).name == "_CON.pdf"


def test_diagnostico_agrega_sem_ler_conteudo_e_indica_limite(tmp_path):
    (tmp_path / "tmp123.ttf").write_bytes(b"x" * 11)
    (tmp_path / "pedido_secreto.pdf").write_bytes(b"x" * 7)
    mei = tmp_path / "_MEI123"; mei.mkdir()
    (mei / "modulo.dll").write_bytes(b"x" * 3)
    r = tm.medir_pasta(tmp_path)
    assert r["bytes"] == 21 and r["arquivos"] == 3
    assert r["categorias"] == {"fontes_tmp": 11, "pdf": 7, "pacotes_mei": 3}
    assert "pedido_secreto" not in json.dumps(r)
    assert tm.medir_pasta(tmp_path, limite_arquivos=1)["parcial"]
    assert tm.medir_pasta(tmp_path / "ausente")["ausente"]


def carregar_funcao(arquivo, nome, namespace):
    """Executa a funcao real, sem efeitos colaterais dos imports do servidor."""
    arvore = ast.parse((REPO / arquivo).read_text(encoding="utf-8"))
    f = next(n for n in arvore.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nome)
    f.decorator_list = []
    for arg in f.args.args + f.args.kwonlyargs:
        arg.annotation = None
    f.returns = None
    f.args.defaults = [ast.Constant(None) for _ in f.args.defaults]
    modulo = ast.fix_missing_locations(ast.Module(body=[f], type_ignores=[]))
    exec(compile(modulo, arquivo, "exec"), namespace)
    return namespace[nome]


@pytest.mark.parametrize("falha", [False, True])
def test_impressao_direta_limpa_sucesso_e_falha(raiz, falha):
    from fastapi import HTTPException
    caminhos = []
    def enviar(**kw):
        p = Path(kw["pdf_path"]); caminhos.append(p)
        assert p.read_bytes() == b"PDF sintetico"
        return not falha, "sintetico"
    ns = dict(temp_manager=tm, shutil=__import__('shutil'), json=json, os=os,
              HTTPException=HTTPException, print_service=SimpleNamespace(send_print_job_windows=enviar))
    func = carregar_funcao("app.py", "submit_print_job", ns)
    async def rodar():
        return await func(SimpleNamespace(file=io.BytesIO(b"PDF sintetico"), filename="teste.pdf"), "simulada", "{}")
    if falha:
        with pytest.raises(HTTPException): asyncio.run(rodar())
    else:
        assert asyncio.run(rodar())["status"] == "success"
    assert caminhos and not caminhos[0].exists() and not list(raiz.iterdir())


@pytest.mark.parametrize("falha", ["download", "impressao", None])
def test_fila_limpa_download_incompleto_e_excecao(raiz, falha):
    caminhos = []
    def baixar(url, destino):
        p = Path(destino); p.write_bytes(b"parcial"); caminhos.append(p)
        return falha != "download"
    def enviar(**kw):
        if falha == "impressao": raise RuntimeError("sintetico")
        return True, "ok"
    def nuvem(metodo, *args):
        return [{"id": "sintetico", "file_url": "simulada", "printer_name": "simulada"}]
    ns = dict(temp_manager=tm, AGENT_ID="sintetico", _supabase_request=nuvem,
              download_file=baixar, print_service=SimpleNamespace(send_print_job_windows=enviar),
              titulo_do_job=lambda *_: "sintetico")
    carregar_funcao("agent_worker.py", "process_queue", ns)()
    assert caminhos and not caminhos[0].exists() and not list(raiz.iterdir())


def ambiente_impose(engine):
    from fastapi import HTTPException
    from starlette.responses import StreamingResponse
    return dict(temp_manager=tm, json=json, os=os, io=io, base64=base64,
                HTTPException=HTTPException, StreamingResponse=StreamingResponse,
                security_config=SimpleNamespace(is_cloud_runtime=lambda: False),
                _embed_system_fonts=lambda *_: None, _pool_qr_ou_none=lambda: None,
                log_diag=lambda *_: None,
                _publicar_faixa_qr_ideal=lambda *_: None, _IMPOSE_TASKS=set(),
                ImpositionConfig=lambda **kw: SimpleNamespace(**kw), ImpositionEngine=engine)


PAYLOAD = {"formato": {"name": "sintetico"}, "saida": {"name": "sintetico"},
           "numeracao": {"elements": []}, "suggested_filename": "mesmo.pdf"}


@pytest.mark.parametrize("antes_do_primeiro", [False, True])
def test_stream_desconectado_preserva_arquivos_ate_motor_terminar(raiz, antes_do_primeiro):
    inicio = threading.Event(); continuar = threading.Event(); terminou = threading.Event()
    caminhos = []
    class Motor:
        def __init__(self, cfg, on_file_generated=None):
            self.cfg = cfg; self.callback = on_file_generated
        def process(self):
            p = Path(self.cfg.out_pdf); caminhos.append(p)
            p.write_bytes(b"primeiro lote")
            self.callback({"path": str(p), "name": "teste.pdf", "type": "single"})
            inicio.set()
            try:
                assert continuar.wait(5)
                assert p.exists(), "apagou arquivo com motor em uso"
                p.write_bytes(b"segundo lote")
                self.callback({"path": str(p), "name": "teste.pdf", "type": "single"})
            finally:
                terminou.set()
    ns = ambiente_impose(Motor)
    func = carregar_funcao("app.py", "impose_file", ns)
    async def form(): return {}
    async def rodar():
        resposta = await func(SimpleNamespace(form=form), payload=json.dumps({**PAYLOAD, "stream": True}))
        if antes_do_primeiro:
            assert await asyncio.to_thread(inicio.wait, 5)
            await resposta.background()
        else:
            evento = await anext(resposta.body_iterator)
            assert "event: file" in evento and inicio.is_set()
            await resposta.body_iterator.aclose()
        assert caminhos[0].exists()
        continuar.set()
        await asyncio.gather(*ns['_IMPOSE_TASKS'])
        assert terminou.is_set() and not caminhos[0].exists()
    try:
        asyncio.run(rodar())
    finally:
        continuar.set()
    assert not list(raiz.iterdir())


@pytest.mark.parametrize("falha", [False, True])
def test_impose_sincrono_limpa_pdf_e_erro(raiz, falha):
    from fastapi import HTTPException
    class Motor:
        def __init__(self, cfg): self.cfg = cfg
        def process(self):
            Path(self.cfg.out_pdf).write_bytes(b"PDF sintetico")
            if falha: raise ValueError("falha sintetica")
    ns = ambiente_impose(Motor)
    func = carregar_funcao("app.py", "impose_file", ns)
    async def form(): return {}
    async def rodar():
        resposta = await func(SimpleNamespace(form=form), payload=json.dumps(PAYLOAD))
        return b"".join([v async for v in resposta.body_iterator])
    if falha:
        with pytest.raises(HTTPException) as erro: asyncio.run(rodar())
        assert erro.value.status_code == 400
        assert erro.value.detail == "falha sintetica"
    else:
        assert asyncio.run(rodar()) == b"PDF sintetico"
    assert not list(raiz.iterdir())


def test_fontes_reutilizadas_e_removidas_no_final_do_motor(raiz, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    import fitz
    import engine
    motor = engine.ImpositionEngine.__new__(engine.ImpositionEngine)
    motor._font_work = None; motor._embedded_font_paths = {}; motor._font_buffer_cache = {}
    encoded = base64.b64encode(fitz.Font("helv").buffer).decode()
    caminho, dados = motor._fonte_embutida(encoded)
    assert motor._fonte_embutida(encoded) == (caminho, dados)
    assert len(list(raiz.rglob("*.ttf"))) == 1
    def falhar(): raise RuntimeError("falha sintetica")
    motor._process = falhar
    with pytest.raises(RuntimeError): motor.process()
    assert not Path(caminho).exists() and not motor._font_buffer_cache


def test_relatorio_estacoes_distingue_ausencia_e_medicao_parcial():
    from ferramentas.estacoes import resumo_armazenamento
    assert "ainda nao informado" in resumo_armazenamento({})
    d = {"estado": "coletado", "coletado_em": 1, "disco_temp_livre_bytes": 1024**3,
         "disco_temp_critico": True, "temp_usuario": {"bytes": 2 * 1024**3, "parcial": True}}
    texto = resumo_armazenamento({"printers_json": json.dumps({"armazenamento": d})})
    assert ">=2.00 GiB" in texto and "POUCO ESPACO" in texto and "UTC" in texto


def test_diagnostico_carrega_no_heartbeat_sem_varrer_disco(monkeypatch):
    import datetime
    monkeypatch.setattr(tm, "_diagnostico", {"estado": "coletado", "gerenciados": {"bytes": 123}})
    snapshot = tm.diagnostico()
    snapshot["gerenciados"]["bytes"] = 999
    enviados = []
    ns = dict(temp_manager=tm, datetime=datetime, AGENT_ID="teste", AGENT_NAME="teste",
              print_service=SimpleNamespace(get_printers=lambda: []), versao_do_painel=lambda: {},
              get_local_ip=lambda: "127.0.0.1", _acesso_base=lambda: "",
              diagnostico_fontes=lambda: {}, diagnostico_impressao=lambda: {}, ultimo_update=lambda: {},
              _gravar_heartbeat=lambda payload, *_: enviados.append(payload))
    carregar_funcao("agent_worker.py", "sync_heartbeat", ns)()
    assert enviados[0]["printers_json"]["armazenamento"]["gerenciados"]["bytes"] == 123


def test_manutencao_coleta_em_fundo_e_falha_nao_vaza(monkeypatch):
    alvos = []
    class ThreadSimulada:
        def __init__(self, target, **kw): alvos.append(target)
        def start(self): pass
        def is_alive(self): return True
    monkeypatch.setattr(tm, "_thread", None)
    monkeypatch.setattr(tm.threading, "Thread", ThreadSimulada)
    monkeypatch.setattr(tm, "_diagnostico", {})
    monkeypatch.setattr(tm, "limpar_abandonados", lambda: {"trabalhos_removidos": 0})
    def falhar(): raise PermissionError("caminho que nao deve ser publicado")
    monkeypatch.setattr(tm, "coletar_diagnostico", falhar)
    class Parar(BaseException): pass
    def parar(_): raise Parar()
    monkeypatch.setattr(tm.time, "sleep", parar)
    tm.iniciar_manutencao(); tm.iniciar_manutencao()
    assert len(alvos) == 1
    with pytest.raises(Parar): alvos[0]()
    d = tm.diagnostico()
    assert d["estado"] == "falha na coleta" and d["erro_tipo"] == "PermissionError"
    assert "caminho que nao" not in json.dumps(d)


def test_coleta_informa_disco_e_cache_sem_excluir(raiz, tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    pasta_temp = tmp_path / "Temp"; pasta_temp.mkdir()
    monkeypatch.setattr(tm.tempfile, "gettempdir", lambda: str(pasta_temp))
    p = pasta_temp / "tmp_antigo.ttf"; p.write_bytes(b"123")
    antigo_ts = time.time() - 40 * 86400; os.utime(p, (antigo_ts, antigo_ts))
    monkeypatch.setattr(tm.shutil, "disk_usage", lambda *_: SimpleNamespace(total=1000, free=123))
    d = tm.coletar_diagnostico()
    assert d["disco_temp_critico"] and d["disco_temp_livre_bytes"] == 123
    assert d["temp_usuario"]["bytes_mais_30_dias"] == 3
    assert p.read_bytes() == b"123" and not raiz.exists()


def test_stream_falha_do_motor_tambem_limpa(raiz):
    class Motor:
        def __init__(self, cfg, **kw): self.cfg = cfg
        def process(self):
            Path(self.cfg.out_pdf).write_bytes(b"parcial")
            raise ValueError("falha sintetica")
    ns = ambiente_impose(Motor)
    func = carregar_funcao("app.py", "impose_file", ns)
    async def form(): return {}
    async def rodar():
        resposta = await func(SimpleNamespace(form=form), payload=json.dumps({**PAYLOAD, "stream": True}))
        eventos = [v async for v in resposta.body_iterator]
        await asyncio.gather(*ns['_IMPOSE_TASKS'])
        assert any("event: error" in v for v in eventos)
    asyncio.run(rodar())
    assert not list(raiz.iterdir())


def test_conversao_icc_fica_no_trabalho_e_preserva_perfil(raiz, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    import fitz
    import color_profiles as cp
    perfil = tmp_path / "sintetico.icm"
    perfil.write_bytes(cp.srgb_icc_bytes())
    with tm.TrabalhoTemporario() as job:
        entrada = job.caminho("entrada.pdf")
        with fitz.open() as doc:
            doc.new_page(); doc.save(entrada)
        saida = cp.pdf_com_output_intent(entrada, {"path": str(perfil), "nome": "sintetico", "classe": "RGB"})
        assert Path(saida).parent == job.pasta
        with fitz.open(saida) as doc:
            assert doc.xref_get_key(doc.pdf_catalog(), "OutputIntents")[0] == "array"
    assert perfil.exists() and not Path(saida).exists()
    assert tm.pasta_do_trabalho(perfil) is None


def test_conversao_ps_limpa_erro_sem_chamar_impressora(raiz):
    caminhos = []
    def mkstemp(**kw):
        caminhos.append(kw["dir"])
        return __import__('tempfile').mkstemp(**kw)
    def falhar(*args, **kw): raise RuntimeError("conversao sintetica falhou")
    ns = dict(temp_manager=tm, os=os, tempfile=SimpleNamespace(mkstemp=mkstemp),
              HAS_WIN32=True, _find_ghostscript=lambda: "simulado",
              color_profiles=SimpleNamespace(args_ghostscript=lambda _: []),
              subprocess=SimpleNamespace(run=falhar, TimeoutExpired=subprocess.TimeoutExpired))
    f = carregar_funcao("print_service.py", "_send_ps_ghostscript", ns)
    with tm.TrabalhoTemporario() as job:
        entrada = job.caminho("entrada.pdf"); Path(entrada).write_bytes(b"sintetico")
        ok, _ = f("simulada", entrada, None, "sintetico")
        assert not ok and caminhos == [str(job.pasta)]
        assert not list(job.pasta.glob("*.ps"))
