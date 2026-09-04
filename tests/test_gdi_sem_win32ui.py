# -*- coding: utf-8 -*-
"""O modo GDI avisa quando falta o win32ui, em vez de estourar um traceback cru.

## O caso, 03/09/2026

No pedido 21524, ao tentar imprimir, o operador viu:

    Erro ao imprimir "...pdf": {"detail":"Erro na impressao GDI: DLL load
    failed while importing win32ui: Não foi possível encontrar o módulo
    especificado.\nTraceback (most recent call last):..."}

## Por que só o win32ui, e não a impressão inteira

`win32print` e `win32ui` são módulos DIFERENTES do pywin32, com dependências
nativas próprias. `win32print` mora em `site-packages/win32/`; `win32ui` mora
em `site-packages/pythonwin/`, só é importável porque o instalador do pywin32
acrescenta essa pasta ao `sys.path`, e o `.pyd` carrega uma DLL própria que o
`win32print` não usa. Uma estação pode ter `win32print` funcionando — o
catálogo de impressoras aparece normal, o painel abre — e `win32ui` falhando
só na hora de imprimir de verdade, porque é só o `_send_gdi_raster` (o
FALLBACK que a Produção usa por padrão, já que ela nunca manda `print_mode`)
quem o usa.

Até aqui só havia `HAS_WIN32`, testando `win32print`. Sem uma bandeira própria
para `win32ui`, o `ImportError` vazava cru para dentro do `except Exception`
genérico da função, e o operador via um traceback em inglês em vez de um
recado que ele pudesse agir.

## O que este arquivo trava

1. `HAS_WIN32UI` existe, é calculado uma vez no import do módulo, e é
   independente de `HAS_WIN32` — uma estação pode ter um True e o outro False.
2. Com `HAS_WIN32UI = False`, `_send_gdi_raster` (via `send_print_job_windows`,
   que é o que o `app.py` chama) devolve `(False, mensagem)`, nunca uma
   exceção, e a mensagem diz o que fazer — reiniciar o NewProd, reinstalar, ou
   instalar o Visual C++ Redistributável — em vez de "DLL load failed".
3. Isso não pode quebrar o caminho já existente: com `HAS_WIN32UI = True`
   (o normal, quando o pywin32 está íntegro), o comportamento de sempre
   continua valendo — este arquivo não testa a impressão real (isso não roda
   em CI, como o cabeçalho de `test_print_service_cores.py` já explica), só
   que a bandeira nova não interfere.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import print_service


def _pdf_min(tmp_path):
    import fitz
    p = str(tmp_path / "min.pdf")
    d = fitz.open()
    d.new_page()
    d.save(p)
    d.close()
    return p


def test_has_win32ui_existe_e_e_uma_bandeira_propria():
    """Não pode ser um alias de HAS_WIN32: as duas falham de formas diferentes."""
    assert hasattr(print_service, "HAS_WIN32UI"), (
        "sumiu a bandeira que distingue win32print de win32ui — sem ela o "
        "ImportError do win32ui volta a vazar cru para o operador"
    )
    assert isinstance(print_service.HAS_WIN32UI, bool)


def test_sem_win32ui_o_envio_avisa_em_vez_de_estourar(tmp_path, monkeypatch):
    monkeypatch.setattr(print_service, "HAS_WIN32", True)
    monkeypatch.setattr(print_service, "HAS_WIN32UI", False)

    # Não pode lançar. `send_print_job_windows` é o que o app.py chama
    # (endpoint /api/print/submit); se isto lançasse, o FastAPI devolveria um
    # 500 com o traceback cru — exatamente o que o operador viu no 21524.
    ok, msg = print_service.send_print_job_windows(
        "Qualquer Impressora", _pdf_min(tmp_path), {"print_mode": "gdi"})

    assert ok is False, "sem win32ui o trabalho nao pode ter sido enviado"
    assert "DLL load failed" not in msg, "o traceback cru nao pode chegar ao operador"
    assert "Traceback" not in msg
    assert "win32ui" in msg.lower(), "a mensagem precisa dizer o que faltou"
    # Toda trava deste projeto precisa oferecer a saida na propria tela.
    tem_saida = any(pista in msg for pista in ("NewProd", "Redistribu", "reinicie", "Reinicie"))
    assert tem_saida, f"a mensagem nao diz o que fazer: {msg!r}"


def test_com_win32ui_a_bandeira_nao_atrapalha_o_mock(tmp_path, monkeypatch):
    """HAS_WIN32=False (mock, sem impressora nenhuma) continua funcionando
    igual, independente do valor de HAS_WIN32UI -- o mock nem chega a olhar
    para ela."""
    monkeypatch.setattr(print_service, "HAS_WIN32", False)
    monkeypatch.setattr(print_service, "HAS_WIN32UI", False)
    ok, msg = print_service.send_print_job_windows(
        "Qualquer", _pdf_min(tmp_path), {"print_mode": "gdi"})
    assert ok is True
    assert "MOCK" in msg


# ---------------------------------------------------------------------------
# A CAUSA, encontrada em 04/09/2026: o executavel leva o win32ui.pyd, mas nao
# leva a DLL nativa que ele carrega.
#
# A correcao de 03/09 (1.2.299) poe 'win32ui' nos hiddenimports do
# `agent_tray.spec`, e com isso o `pythonwin\win32ui.pyd` passou a entrar no
# bundle. So que o `.pyd` NAO se basta: ele importa `mfc140u.dll` -- o runtime
# do MFC --, que nao acompanha o pywin32 (a pasta `pythonwin/` do
# site-packages nao tem a DLL) e nao faz parte do Windows. Ela chega na
# maquina pelo "Visual C++ 2015-2022 Redistributable (x64)", instalado por
# outros programas ao longo dos anos.
#
# Dai o sintoma que parecia versao do Windows: as estacoes antigas acumularam
# o runtime (Corel, Adobe, driver de impressora), e uma maquina recem-formatada
# nao tem nenhum deles. Quem decide nao e o Windows 10 ou 11 -- e se aquele
# runtime foi parar ali algum dia. Enquanto a DLL nao viajar DENTRO do
# executavel, a impressao da estacao depende do historico de instalacoes dela.
#
# O `MSVCP140.dll`, o `VCRUNTIME140.dll` e o `VCRUNTIME140_1.dll` ja viajam no
# bundle; faltava so o `mfc140u.dll`, e e o unico que o win32ui pede a mais.
# ---------------------------------------------------------------------------

def _raiz():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _spec():
    with open(os.path.join(_raiz(), "agent_tray.spec"), encoding="utf-8") as f:
        return f.read()


def test_o_mfc140u_viaja_dentro_do_executavel_do_agente():
    """Sem isto o agente COMPILA e so falha na estacao, no clique do operador.

    E falha em UMAS estacoes so -- as que nunca receberam o Visual C++
    Redistributable --, que e o disfarce mais caro que este defeito tem: parece
    problema da maquina, e nao do instalador que saiu daqui.
    """
    spec = _spec()
    assert "mfc140u.dll" in spec, (
        "o agent_tray.spec nao leva o mfc140u.dll: o win32ui.pyd vai para a "
        "estacao sem a DLL que ele carrega, e a impressao GDI so funciona "
        "onde por acaso alguem ja instalou o Visual C++ Redistributable"
    )
    assert "binaries=[]" not in spec, (
        "a lista de binaries voltou a ficar vazia -- o mfc140u.dll precisa "
        "entrar por ela"
    )


def test_o_mfc140u_fica_ao_lado_do_pyd_que_o_carrega():
    r"""Destino 'pythonwin', e nao a raiz do bundle.

    O CPython carrega extensao com `LoadLibraryExW(..., LOAD_WITH_ALTERED_SEARCH_PATH)`,
    e com essa flag o primeiro lugar em que o Windows procura as dependencias e
    a PASTA DO PROPRIO .pyd. Como o PyInstaller poe o win32ui em
    `pythonwin\win32ui.pyd`, a DLL ao lado dele e a colocacao que nao depende
    de o bootloader ter acrescentado a raiz do bundle ao caminho de busca.
    """
    linhas = [l for l in _spec().splitlines()
              if not l.lstrip().startswith("#")
              and "'pythonwin'" in l
              and ("mfc" in l.lower())]
    assert linhas, (
        "nenhuma linha do agent_tray.spec poe o mfc140u.dll na pasta "
        "'pythonwin': ao lado do win32ui.pyd e a colocacao que o "
        "LOAD_WITH_ALTERED_SEARCH_PATH do CPython acha com certeza"
    )


@pytest.mark.skipif(sys.platform != "win32", reason="dependencia nativa do Windows")
def test_o_win32ui_realmente_pede_o_mfc140u():
    """A prova de que a linha do spec nao e superstic~ao.

    Se um dia o pywin32 parar de depender do MFC, este teste passa a falhar e
    avisa que a DLL pode sair do bundle -- em vez de ela ficar la para sempre
    porque ninguem lembra por que entrou.
    """
    import importlib.util
    spec_pyd = importlib.util.find_spec("win32ui")
    if spec_pyd is None or not spec_pyd.origin or not os.path.exists(spec_pyd.origin):
        pytest.skip("win32ui.pyd nao esta nesta maquina")
    with open(spec_pyd.origin, "rb") as f:
        bruto = f.read()
    assert b"mfc140u.dll" in bruto.lower(), (
        "o win32ui.pyd desta maquina nao importa mais o mfc140u.dll -- "
        "conferir se a DLL ainda precisa viajar no bundle"
    )
