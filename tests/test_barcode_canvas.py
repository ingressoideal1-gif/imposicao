# -*- coding: utf-8 -*-
"""O código de barras da tela é o mesmo que o do papel — módulo a módulo.

## Por que este arquivo existe

Até 27/08/2026 as dez janelas que desenham um ingresso pintavam, no lugar do
código de barras, um padrão FIXO de 40 barras: o mesmo desenho para qualquer
valor e qualquer simbologia. Tamanho e posição do bloco estavam certos, e é por
isso que ninguém notava — mas o operador não tinha como ver na tela se o Code 128
daquele número ficaria denso demais para a largura escolhida, nem se o EAN-13
aceitou os dígitos digitados.

O `frontend/barcode-canvas.js` desenha o código de verdade. Ele não pode usar
"um" algoritmo de Code 128: precisa usar EXATAMENTE o do `python-barcode`, que é
quem monta o papel. Duas implementações honestas divergem justamente na troca de
conjunto (A/B/C), e um número de módulos diferente muda a largura de cada barra
na tela — a tela voltaria a mentir, agora com um desenho convincente.

Estes testes comparam os dois lados valor a valor. Se alguém atualizar a
biblioteca do motor e a codificação mudar, é aqui que aparece.
"""
import json
import os
import subprocess

import barcode
import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULO = os.path.join(RAIZ, "frontend", "barcode-canvas.js")

# Um por simbologia, com os casos que exercitam as trocas de conjunto do Code 128
# (só dígitos, dígito ímpar sobrando, letras, mistura) e as normalizações.
CASOS = [
    ("code128", "12345678"),
    ("code128", "1234567"),          # digito impar sobrando -> troca para B no fim
    ("code128", "ABC123"),           # comeca em letra -> troca imediata
    ("code128", "A1234567890B"),     # letra, corrida de digitos, letra
    ("code128", "IDEAL-2026-000123"),
    ("code128", "0001"),
    ("code39", "ABC123"),
    ("code39", "IDEAL2026"),
    ("code39", "0001"),
    ("ean13", "123456789012"),
    ("ean13", "789100031234"),
    ("ean8", "1234567"),
    ("upca", "12345678901"),
    ("itf", "123456"),
    ("itf", "12345678901234"),
]


def _padroes_do_navegador(casos):
    """Roda o módulo do frontend num Node e devolve o padrão de cada caso."""
    script = (
        "globalThis.window = globalThis;\n"
        "require(%s);\n"
        "const casos = %s;\n"
        "const saida = casos.map(([fmt, dado]) => modulosDoBarcode(dado, fmt));\n"
        "console.log(JSON.stringify(saida));\n"
    ) % (json.dumps(MODULO), json.dumps(casos))
    r = subprocess.run(["node", "-e", script], capture_output=True, text=True,
                       cwd=RAIZ, encoding="utf-8", errors="replace")
    assert r.returncode == 0, r.stderr[:600]
    return json.loads(r.stdout.strip())


def _padrao_do_motor(fmt, dado):
    from engine import _modulos_do_barcode
    return _modulos_do_barcode(dado, fmt)


def test_o_modulo_existe_e_nao_depende_de_nada():
    with open(MODULO, encoding="utf-8") as f:
        texto = f.read()
    assert "import " not in texto
    assert "require(" not in texto


def test_cada_valor_desenha_o_mesmo_padrao_dos_dois_lados():
    """A conferência inteira numa chamada só de Node — a suíte roda em 1 minuto."""
    daqui = _padroes_do_navegador(CASOS)
    divergentes = []
    for (fmt, dado), tela in zip(CASOS, daqui):
        papel = _padrao_do_motor(fmt, dado)
        if tela != papel:
            divergentes.append(
                f"{fmt} {dado!r}: tela {len(tela)} modulos, papel {len(papel)}"
            )
    assert not divergentes, "a tela desenharia outro codigo:\n" + "\n".join(divergentes)


def test_o_dono_do_desenho_e_um_so():
    """Uma cópia por janela diverge — foi assim com o QR e com as fontes."""
    donos = []
    for nome in os.listdir(os.path.join(RAIZ, "frontend")):
        if not nome.endswith(".js"):
            continue
        with open(os.path.join(RAIZ, "frontend", nome), encoding="utf-8") as f:
            if "function renderBarcodeOnCtx" in f.read():
                donos.append(nome)
    assert donos == ["barcode-canvas.js"], f"mais de um dono do desenho: {donos}"


def test_nenhuma_janela_desenha_mais_o_padrao_falso():
    """O padrão de 40 barras era o mesmo em dez lugares. Não pode sobrar nenhum."""
    sobrou = []
    for nome in os.listdir(os.path.join(RAIZ, "frontend")):
        if not nome.endswith(".js"):
            continue
        with open(os.path.join(RAIZ, "frontend", nome), encoding="utf-8") as f:
            texto = f.read()
        if "const barW = bw / 40" in texto or "var barW = bw / 40" in texto:
            sobrou.append(nome)
    assert sobrou == [], f"ainda desenham o padrao falso de 40 barras: {sobrou}"


@pytest.mark.parametrize("pagina", ["frontend/index.html", "frontend/producao.html",
                                    "frontend/cliente.html"])
def test_as_paginas_carregam_o_modulo_antes_de_quem_desenha(pagina):
    with open(os.path.join(RAIZ, pagina), encoding="utf-8") as f:
        texto = f.read()
    assert "barcode-canvas.js" in texto, f"{pagina} nao carrega o modulo"
    pos = texto.index("barcode-canvas.js")
    for consumidor in ("script.js?v=", "pedido.js?v=", "cliente.js?v=", "criador-arte.js?v="):
        for prefixo in ('src="', 'src="/'):
            alvo = prefixo + consumidor
            if alvo in texto:
                assert pos < texto.index(alvo), (
                    f"{pagina} carrega {consumidor} antes do barcode-canvas.js")


def test_o_modulo_esta_na_lista_que_as_estacoes_baixam():
    """Fora dela a estacao da 404 e o painel congela — o defeito da v559."""
    import security_config
    assert "barcode-canvas.js" in security_config.PAINEL_ARQUIVOS
