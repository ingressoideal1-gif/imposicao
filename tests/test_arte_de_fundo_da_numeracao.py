# -*- coding: utf-8 -*-
"""A arte de fundo guardada na numeração exclusiva de cliente.

Pedido do usuário em 26/08/2026: *"quando a numeração for exclusiva do cliente e
for carregado uma arte de fundo, ao salvar a numeração deve salvar a arte de
fundo (referência), deve ser persistente"*.

## O que estava acontecendo

A "Arte de Fundo" do editor é a referência por baixo do canvas — é contra ela
que o operador posiciona a numeração. Ela nunca foi guardada. Havia dois jeitos
de ela aparecer, e nenhum sobrevivia ao save:

1. `autoLoadCorBg()` traz o PDF da cor mais antiga do formato base. Continua
   valendo e não muda: aquela arte é da COR, e já vive em `producao_cores`.
2. O upload manual pelo 🖼️ Arte de Fundo vivia só em memória. Reabrir a
   numeração trazia de volta a arte da cor, e a referência do operador sumia.

Numa numeração de cliente isso dói: a referência é a arte daquele cliente, não a
do catálogo de cores.

## As duas perguntas que o save faz

- **Esta numeração guarda fundo?** Só a exclusiva de cliente (`Cli_Num`).
- **O banco já sabe guardar?** Enquanto `sql/alter_producao_numeracoes_arte_de_fundo.sql`
  não rodar, mandar a coluna faria o PostgREST recusar o registro inteiro — e
  nenhuma numeração seria salva. Sem a coluna, o editor avisa em vez de fingir.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "arte_de_fundo_da_numeracao_harness.js")
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")
INDEX = os.path.join(RAIZ, "frontend", "index.html")
SQL = os.path.join(RAIZ, "sql", "alter_producao_numeracoes_arte_de_fundo.sql")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_arte_de_fundo_passa():
    """As funções da regra, recortadas do `script.js` e executadas de verdade."""
    assert os.path.exists(HARNESS), "o harness da arte de fundo sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida


def test_a_migracao_existe_e_e_aditiva():
    """Coluna nova em tabela viva se adiciona; não se recria a tabela."""
    assert os.path.exists(SQL), "o SQL da migração precisa acompanhar o código"
    sql = _ler(SQL)
    assert "ADD COLUMN IF NOT EXISTS bg_url" in sql
    assert "ADD COLUMN IF NOT EXISTS bg_filename" in sql
    assert "DROP" not in sql.upper(), "nada aqui apaga coluna nem tabela"


def test_o_arquivo_original_e_que_sobe():
    """Nunca a rasterização.

    A imagem do canvas é uma renderização feita para a tela. O que vai ao
    Storage é o arquivo como o cliente entregou — se um dia isto virar
    `state.bgImage`, o PDF vetorial do cliente vira imagem, que é justamente o
    que está fora de cogitação neste projeto.
    """
    fonte = _ler(SCRIPT)
    i = fonte.index("const guardaFundo = !!cliNumFinal")
    bloco = fonte[i:i + 1200]
    assert "uploadToStorage(\n                state.bgFile" in bloco or "state.bgFile, state.bgFile.name" in bloco, (
        "o que sobe é o File original, não o state.bgImage do canvas"
    )
    assert "state.bgImage" not in bloco, (
        "o canvas não tem nada a ver com o que fica gravado"
    )


def test_a_barra_tem_onde_dizer_o_que_acontece():
    """Comportamento que muda sozinho precisa de uma frase na tela."""
    html = _ler(INDEX)
    assert 'id="bg-persistencia-aviso"' in html
    i = html.index('id="bg-persistencia-aviso"')
    assert 'id="btn-remove-bg"' in html[i - 900:i], (
        "a frase fica na própria barra da Arte de Fundo, junto do que ela explica"
    )


def test_a_arte_guardada_vence_a_arte_da_cor():
    """Guardar sem carregar de volta não teria efeito nenhum."""
    fonte = _ler(SCRIPT)
    i = fonte.index("if (n.bg_url) {")
    trecho = fonte[i:i + 400]
    assert "carregarBgSalvo(n)" in trecho, "a arte da numeração vem primeiro"
    assert "autoLoadCorBg" in trecho, (
        "e a da cor continua sendo o caminho de quem não tem arte própria — "
        "inclusive quando o carregamento da guardada falha"
    )


def test_a_copia_leva_o_fundo_mas_no_arquivo_dela():
    """A cópia precisa da mesma referência para o operador seguir editando.

    O que ela não pode é apontar para o objeto do original: trocar o fundo de
    uma trocaria o da outra — o defeito que o `preview_jpg` já ensinou a evitar.
    Por isso os bytes são reenviados sob o id da cópia.
    """
    fonte = _ler(SCRIPT)
    i = fonte.index("window.duplicateCatalogNumeracao = async function")
    corpo = fonte[i:fonte.index("\n};", i)]

    assert "duplicarFundoNoStorage(n.bg_url" in corpo, (
        "o fundo vai junto, reenviado sob o id da cópia"
    )
    assert "clone.bg_url = n.bg_url" not in corpo, (
        "e NUNCA pela URL do original, que faria as duas dividirem um arquivo só"
    )
    assert "preview_jpg" not in corpo, "o preview continua fora: nasce no primeiro save"

    # O destino é o id da CÓPIA, e não o do original.
    j = fonte.index("async function duplicarFundoNoStorage")
    helper = fonte[j:fonte.index("\n}", j)]
    assert "fundos-numeracoes/${idDestino}." in helper


def test_salvar_com_outro_nome_duplica_a_numeracao_do_cliente():
    """Regra do usuário, 26/08/2026: salvar com o mesmo nome repassa; mudando o
    nome, duplica, sem alterar os modelos que usam a outra numeração."""
    fonte = _ler(SCRIPT)
    i = fonte.index("const copiandoPorNome =")
    trecho = fonte[i:i + 400]

    assert "registroEmEdicao.Cli_Num" in trecho, (
        "só a numeração de cliente duplica — na genérica, renomear é renomear"
    )
    assert "nomeDoRegistro !== name" in trecho, "o gatilho é o nome ter mudado"
    assert "id = '';" in fonte[i:i + 900], "e duplicar é virar INSERT"
