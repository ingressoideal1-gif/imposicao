# -*- coding: utf-8 -*-
"""O terceiro Modo de Impressão do painel: FxVersoUnico (usuário, 31/08/2026).

> "Na lista de numeração, vamos criar mais um tipo de Modo de Impressão, já
> temos Frente, FxVerso, e agora teremos FxVersoUnico. Neste modo de impressão
> teremos a frente sendo um pdf Multi-páginas e o verso uma página única que
> deverá ser repetida para todas as frentes."

O motor tem o seu próprio teste (`test_pdf_duplex_unico.py`). Este arquivo
cuida do painel, e roda o harness em node
(`tests/fxversounico_harness.js`), que lê as funções de dentro do `script.js`
em vez de copiá-las.

## A armadilha que estes testes existem para pegar

Até 31/08/2026 o painel perguntava `print_mode === 'duplex'` para responder a
DUAS coisas diferentes:

* **"este trabalho tem verso?"** — verdadeira nos dois modos duplex;
* **"como o arquivo é paginado?"** — só aqui o FxVerso e o FxVersoUnico diferem.

Um `=== 'duplex'` do primeiro tipo deixado para trás não quebra nada na tela:
ele simplesmente some com o verso, e quem descobre é o operador, no papel. O
harness mantém um inventário das comparações cruas que sobraram e reprova
quando aparece uma nova sem classificação.

## O que NÃO pode regredir

Quase nenhuma das numerações cadastradas tem `print_mode` duplex — o
levantamento de 25/08/2026 achou zero em 86. Por isso a numeração só é
consultada para ACRESCENTAR o FxVersoUnico: um modelo que o ERP marca como
frente e verso continua com verso mesmo que a numeração dele diga `front`.
Fazer a numeração mandar em tudo apagaria o verso de quase todo o cadastro.
"""
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "fxversounico_harness.js")
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")
PEDIDO = os.path.join(RAIZ, "frontend", "pedido.js")


def _texto(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def test_o_harness_do_fxversounico_passa():
    assert os.path.exists(HARNESS), "o harness do FxVersoUnico sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida


def test_o_upload_do_verso_reaparece_no_modo_pdf():
    """É por ali que entra o PDF de uma página que se repete em todas as peças.

    A linha "🖼️ Verso" do card some quando o modelo está em modo PDF, porque
    ali o verso sempre saiu das páginas pares do próprio arquivo. No
    FxVersoUnico ela precisa voltar — sem ela o operador não tem por onde
    mandar o verso.
    """
    texto = _texto(SCRIPT)
    assert "item.modo_pdf && !versoUnico(modoDeVersoDoModelo(item))" in texto, (
        "a linha de upload do Verso voltou a sumir em TODO modo PDF — no "
        "FxVersoUnico ela e a unica porta de entrada do arquivo de verso"
    )


def test_o_arquivo_do_verso_vai_junto_ao_motor():
    """Um modelo sozinho não passa por multi_artes: manda a arte como upload."""
    for caminho in (SCRIPT, PEDIDO):
        texto = _texto(caminho)
        assert "versoUnico(payload.print_mode)" in texto, (
            os.path.basename(caminho) + " parou de decidir pelo modo se manda o "
            "arquivo de verso"
        )
        assert "formData.append('file_verso'" in texto, (
            os.path.basename(caminho) + " parou de enviar o arquivo do verso — o "
            "motor receberia o trabalho sem verso nenhum"
        )


def test_a_previa_do_verso_unico_nao_desenha_a_frente_no_lugar_do_verso():
    """Sem arquivo de verso a célula fica vazia — a tela não pode inventar."""
    texto = _texto(PEDIDO)
    assert "activePdfDoc = state.pedArtVersoPdfDoc || null;" in texto, (
        "a previa do Pedido voltou a desenhar o verso a partir do arquivo da "
        "frente — no FxVersoUnico o verso mora em OUTRO arquivo"
    )
    assert "pageNum >= 1" in texto, (
        "sumiu a guarda de pagina zero da previa do Pedido; `getPage(0)` estoura"
    )


def test_a_numeracao_so_acrescenta_o_terceiro_modo():
    """Ela não pode rebaixar a verso um modelo que o ERP diz ter verso."""
    texto = _texto(SCRIPT)
    i = texto.index("function modoDeVersoDoModelo(")
    corpo = texto[i:texto.index("\n}", i) + 2]
    assert "if (versoUnico(num && num.print_mode)) return 'duplex_unico';" in corpo, (
        "o modoDeVersoDoModelo parou de reconhecer o FxVersoUnico da numeracao"
    )
    assert re.search(r"item\.verso === true \|\| \(item\.verso_tipo", corpo), (
        "o modoDeVersoDoModelo parou de cair no `verso` do ERP — quase nenhuma "
        "numeracao cadastrada tem print_mode duplex, e sem esta linha os modelos "
        "de frente e verso perderiam o verso"
    )


def test_o_nome_nao_colide_com_o_modo_sequencial_ou_blocado():
    """`modoDeImpressaoDoModelo` já existia e responde outra coisa.

    Ela devolve 'sequencial' ou 'blocado'. Definir uma segunda função com o
    mesmo nome faria a última declarada vencer no navegador, e todas as
    chamadas do verso passariam a receber a resposta da paginação.
    """
    texto = _texto(SCRIPT)
    assert texto.count("function modoDeImpressaoDoModelo(") == 1, (
        "voltou a existir mais de uma funcao chamada modoDeImpressaoDoModelo"
    )
    assert texto.count("function modoDeVersoDoModelo(") == 1
    i = texto.index("function modoDeImpressaoDoModelo(")
    corpo = texto[i:texto.index("\n}", i) + 2]
    assert "sequencial" in corpo and "blocado" in corpo, (
        "a modoDeImpressaoDoModelo deixou de ser a da paginacao — confira se os "
        "dois nomes nao trocaram de significado"
    )
