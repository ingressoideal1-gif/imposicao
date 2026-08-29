# -*- coding: utf-8 -*-
"""A Montagem: refazer celulas de pedidos DIFERENTES numa folha so (29/08/2026).

Pedido do usuario: *"vai se chamar Montagem, ela sera utilizada para refazer
celulas de um mesmo produto (triband, Mobi, pvc, etc...) mesmo quando elas sao
de pedidos diferentes"*.

O "Refazer Celula" da tela do Pedido ja repoe o item que estragou, mas a folha
dele e' de UM modelo de UM pedido. A grafica estraga uma celula aqui, outra ali,
e acaba gastando uma folha inteira de PVC para repor tres cartoes.

Os harnesses cobram a tradução das posições (montagem_harness.js) e o desenho
da tela (montagem_tela_harness.js). O que este arquivo cobre e' o que se le no
codigo-fonte e nao se ve na tela — em especial as duas coisas que, erradas,
so' apareceriam na portaria com a fila na porta.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _rodar(harness):
    caminho = os.path.join(RAIZ, "tests", harness)
    assert os.path.exists(caminho), harness + " sumiu"
    r = subprocess.run(
        ["node", caminho], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_harness_do_nucleo_passa():
    _rodar("montagem_harness.js")


def test_o_harness_da_tela_passa():
    _rodar("montagem_tela_harness.js")


def test_o_motor_nao_foi_tocado():
    """A Montagem NAO mudou o Python, e isso e' o ponto.

    O motor ja monta folha com modelos de pedidos diferentes desde 18/08/2026
    (o `multi_artes` do aproveitamento de folha), e o `refazer_celulas` dele ja
    indexa o `multi_map` — a lista ordenada dos itens do trabalho inteiro, em
    que cada entrada carrega o seu modelo, o seu pedido e a sua linha do banco.

    A tela so' TRADUZ. Se algum dia este teste falhar, alguem mexeu no caminho
    de impressao por causa da Montagem, e ai vale reler por que ele nao precisou
    mudar antes de aceitar que precisa agora.
    """
    engine = _ler("engine.py")

    # As tres pecas de que a Montagem depende, e que ja existiam.
    assert "def _pedido_do_item(" in engine, (
        "o motor deixou de saber o pedido de cada item — numa folha que junta "
        "pedidos, o QR sairia com a coluna do pool de outro pedido"
    )
    assert '"pedido": art.get("pedido")' in engine, (
        "o item do multi_map perdeu o pedido da sua arte"
    )
    assert "multi_map[c - 1] for c in r_cels" in engine, (
        "o refazer por celula deixou de indexar o multi_map: as posicoes da "
        "Montagem apontariam para o item errado"
    )


def test_a_traducao_das_posicoes_desloca_pela_tiragem():
    """O erro que custaria caro, travado no proprio codigo.

    O motor monta o `multi_map` percorrendo as artes na ordem em que chegaram, e
    cada arte leva a TIRAGEM INTEIRA. A posicao 6 do segundo modelo nao e' 6, e'
    `qtd do primeiro + 6`.

    Deslocar pelo numero de CELULAS PEDIDAS em vez da tiragem faria o motor
    imprimir os itens errados — com os codigos de QR de outros ingressos, o que
    so' se descobre na portaria.
    """
    js = _ler("frontend/montagem.js")
    corpo = js[js.index("function posicoesCombinadas(grupos) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]

    assert "base += parseInt(g.qtd)" in corpo, (
        "o deslocamento deixou de ser a TIRAGEM do modelo anterior"
    )
    assert "g.posicoes.length" not in corpo, (
        "o deslocamento passou a usar o numero de celulas pedidas — e' o erro "
        "que este teste existe para impedir"
    )


def test_a_arte_leva_a_tiragem_inteira_no_payload():
    """Recortar o banco seria mais leve e estaria ERRADO.

    O indice do item e' o que decide o codigo do QR Ideal
    (`indice(pedido, modelo, item)`). Mandar so' as linhas pedidas embaralharia
    todos os indices, e cada celula refeita sairia com o codigo de outro
    ingresso.
    """
    js = _ler("frontend/montagem.js")
    corpo = js[js.index("function payloadDaMontagem(grupos) {"):]
    corpo = corpo[:corpo.index("\n}\n") + 3]

    assert "qtd: g.qtd" in corpo, "a arte deixou de levar a tiragem inteira"
    assert "layout_schema: 'multi_artes'" in corpo
    assert "refazer_celulas: posicoesCombinadas(grupos)" in corpo
    assert "modelo: g.itemId" in corpo and "pedido: g.pedidoNumero" in corpo, (
        "a arte parou de declarar o seu modelo ou o seu pedido — sem os dois o "
        "motor recusa a folha, e com razao"
    )


def test_a_montagem_resolve_o_formato_por_conta_propria():
    """O defeito que so' apareceu em producao, em 29/08/2026.

    `formato_id` NAO existe em `pedidos_modelos`: quem o preenche na memoria e' o
    DESENHO da fila do Pedido (`renderPedOSQueue`), a partir do produto do ERP. A
    Montagem carrega os modelos com o `loadOSItens` e nunca desenha aquela fila,
    entao os itens chegavam SEM FORMATO.

    Deu duas falhas, e a segunda e' pior que a primeira:

      1. o payload ia com `formato: null` e o motor recusou — o operador viu
         "Erro 500: 400: Formato nao encontrado";
      2. o `porQueNaoCabeNaMontagem` comparava '' com '' e devolvia "cabe"
         SEMPRE. A regra de compatibilidade que o usuario decidiu estava
         INERTE, e uma folha com dois materiais diferentes teria passado sem
         nenhum aviso — descoberta na impressora.

    A tela passou a resolver o formato pela MESMA regra do desenho da fila:
    produto do item -> `id_formato` do produto -> o formato cujo `id_formato_num`
    casa.
    """
    js = _ler("frontend/montagem.js")

    assert "function formatoDoItem(" in js, "a resolucao do formato sumiu"
    corpo = js[js.index("function formatoDoItem(item) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]
    assert "_vibe_id_produto" in corpo and "id_formato_num" in corpo, (
        "a resolucao deixou de seguir o produto do ERP, que e' a regra do "
        "desenho da fila"
    )
    assert "autoSaveOSItemField" not in corpo, (
        "a Montagem passou a GRAVAR o formato no pedido; ela e' tela de leitura "
        "e nao tem por que carimbar o pedido de ninguem"
    )

    # A guarda que faltava: peca sem formato nao passa.
    conf = js[js.index("function porQueNaoCabeNaMontagem(a, b) {"):]
    conf = conf[:conf.index("\n}") + 2]
    assert "if (!a.formato_id)" in conf and "if (!b.formato_id)" in conf, (
        "voltou a comparar formato vazio com formato vazio, e a regra inteira "
        "fica inerte de novo"
    )


def test_a_montagem_nao_tem_caminho_para_a_nuvem():
    """Impressao so' acontece pela estacao da grafica.

    Nao e' so' desempenho: e' seguranca, e por isso nao existe plano B. Sem
    agente respondendo, a resposta certa ao operador e' que nao da'.
    """
    js = _ler("frontend/montagem.js")
    assert "onrender.com" not in js and "MOTOR_NUVEM" not in js
    assert "127.0.0.1:9000" in js or "localhost:8080" in js


def test_a_regra_de_compatibilidade_e_a_decidida():
    """Formato + cor + saida + face; modo de impressao NAO.

    O usuario abriu o pedido dizendo que a unica condicao seria o mesmo formato.
    Tres das quatro conferencias sao impossibilidade fisica da folha — cor
    (o material), saida (o tamanho) e face (o verso existe ou nao) —, e ele
    decidiu manter as quatro em 29/08/2026.

    Sequencial x Blocado ficou de FORA de proposito: aqui nao ha pilha para
    cortar, e recusar por isso barraria combinacao legitima sem proteger nada.
    """
    js = _ler("frontend/montagem.js")
    corpo = js[js.index("function porQueNaoCabeNaMontagem(a, b) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]

    for campo in ("formato_id", "saida_id"):
        assert campo in corpo, campo + " saiu da conferencia"
    assert "cor" in corpo and "padrao" in corpo, "a cor saiu da conferencia"
    assert "verso_tipo" in corpo, "a face saiu da conferencia"

    assert "modoDeImpressaoDoModelo" not in corpo, (
        "Sequencial x Blocado voltou a impedir a montagem; aqui nao ha pilha"
    )
    assert "modo_pdf" not in corpo, "o modo PDF voltou a impedir a montagem"

    # As duas grafias convivem no banco — o pedido 20495 tem as duas.
    assert "'SÓ FRENTE'" in corpo, (
        "a grafia 'SÓ FRENTE' saiu: modelos que a usam seriam recusados contra "
        "os que usam 'Frente', sendo a mesma coisa"
    )
