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
import re
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


def test_o_motor_so_mudou_para_repetir_celula():
    """O que a Montagem precisa do motor ja existia — menos uma chave.

    O motor ja monta folha com modelos de pedidos diferentes desde 18/08/2026
    (o `multi_artes` do aproveitamento de folha), e o `refazer_celulas` dele ja
    indexa o `multi_map` — a lista ordenada dos itens do trabalho inteiro, em
    que cada entrada carrega o seu modelo, o seu pedido e a sua linha do banco.

    A unica coisa que entrou POR CAUSA desta tela (03/09/2026) foi
    `refazer_repetir`: com ela, posicao repetida imprime duas vezes — e' o ⧉ da
    celula. Sem ela o motor continua tirando repetidas, que e' o certo para o
    Refazer Celula do Pedido, onde "1,1,6" e' engano de dedo. Ver
    tests/test_engine_refazer.py.
    """
    engine = _ler("engine.py")
    app = _ler("app.py")

    assert "refazer_repetir: bool = False" in engine, (
        "a chave que faz o motor aceitar celula repetida sumiu, ou deixou de "
        "nascer desligada"
    )
    assert 'refazer_repetir=bool(data.get("refazer_repetir"))' in app, (
        "o app.py deixou de repassar a chave ao motor — o ⧉ da Montagem "
        "imprimiria uma vez so', calado"
    )

    # E os tres campos do NUMERO DO MODELO (03/09/2026). Ate aqui so' a cor
    # (`nome_color`) passava pelo payload; tamanho, posicao e rotacao eram
    # constantes no proprio motor. Ver tests/test_numero_do_modelo.py.
    for chave in ('nome_size', 'nome_pos', 'nome_rot'):
        assert 'art.get("' + chave + '"' in engine, (
            "o multi_map deixou de levar " + chave + " — a escolha do operador "
            "nao chegaria ao item, e o numero sairia no padrao, calado"
        )

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
    corpo = js[js.index("function posicoesCombinadas(celulas, modelos) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]

    assert "base += parseInt(m.qtd)" in corpo, (
        "o deslocamento deixou de ser a TIRAGEM do modelo anterior"
    )
    assert ".length" not in corpo, (
        "o deslocamento passou a contar celulas — e' o erro que este teste "
        "existe para impedir"
    )
    # Desde o kanban (03/09/2026) o deslocamento vem dos MODELOS e a ordem da
    # saida vem das CELULAS. Arrastar celula nao pode mexer no indice de ninguem.
    assert "deslocamento[chaveDoModelo(c)]" in corpo, (
        "cada celula deixou de levar o deslocamento do SEU modelo"
    )


def test_a_arte_leva_a_tiragem_inteira_no_payload():
    """Recortar o banco seria mais leve e estaria ERRADO.

    O indice do item e' o que decide o codigo do QR Ideal
    (`indice(pedido, modelo, item)`). Mandar so' as linhas pedidas embaralharia
    todos os indices, e cada celula refeita sairia com o codigo de outro
    ingresso.
    """
    js = _ler("frontend/montagem.js")
    corpo = js[js.index("function payloadDaMontagem(celulas, modelos, artes) {"):]
    corpo = corpo[:corpo.index("\n}\n") + 3]

    assert "multi_artes: artes" in corpo, "o payload deixou de mandar as artes prontas"
    assert "schema: 'multi_artes'" in corpo, (
        "o payload deixou de mandar `schema` — e' a chave que o app.py le; "
        "`layout_schema` ele ignora"
    )
    assert "refazer_celulas: posicoesCombinadas(celulas, comTiragemDoMotor)" in corpo, (
        "o deslocamento deixou de usar a qtd da ARTE PRONTA — a tiragem "
        "guardada na lista pode ter envelhecido"
    )
    assert "refazer_repetir: true" in corpo, "o ⧉ deixou de chegar ao motor"

    # E a arte de cada modelo vem das funcoes da tela do Pedido: e' assim que
    # ela leva a tiragem inteira, o modelo e o pedido — como sempre levou la.
    prep = js[js.index("async function prepararArtesDaMontagem(modelos) {"):]
    prep = prep[:prep.index("\n}\n") + 3]
    assert "arteDoModeloParaFolha({ osId: m.osId, itemId: m.itemId }, null, { comPrevia: false })" in prep
    assert "arteParaOMotor(arte, true)" in prep, (
        "a arte deixou de passar pelo construtor do Pedido como folha combinada"
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


def test_a_linha_da_lista_volta_ao_modelo():
    """Pedido do usuario em 29/08/2026.

    Refazer celula e' trabalho de DESCOBERTA: o operador acha mais uma pulseira
    estragada depois de ja ter montado a folha. Sem isto ele teria de reescolher
    o pedido no seletor, esperar o `loadOSItens`, reescolher o modelo na lista e
    so' entao digitar. A linha ja sabe de qual pedido e de qual modelo se trata.

    Duas coisas ficam travadas aqui:

    - o X continua sendo o X. Ele mora DENTRO da linha, e sem parar a propagacao
      tirar um modelo tambem levaria o compositor de volta a ele — para um
      modelo que acabou de sair da lista;
    - a linha ativa e' DERIVADA do que o compositor mostra, e nao um indice
      guardado a parte. Um segundo estado ficaria mentindo assim que o operador
      escolhesse o modelo pelos seletores, ou assim que a lista perdesse um
      grupo — e digitar posicoes achando que sao de outro modelo e' erro que so'
      aparece no papel.
    """
    js = _ler("frontend/montagem.js")

    assert "function retomarDaMontagem(" in js, "a volta ao modelo pela linha sumiu"
    corpo = js[js.index("async function retomarDaMontagem(indice) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]
    assert "onMontagemPedidoChange()" in corpo, (
        "a volta parou de recarregar os modelos do pedido; o segundo seletor "
        "ficaria com os modelos do pedido anterior"
    )
    assert "campo.value = ''" in corpo, (
        "o campo de posicoes voltou a ser preenchido; o operador vem "
        "acrescentar, e a lista antiga no campo faz parecer que precisa apagar"
    )

    assert "event.stopPropagation(); removerDaMontagem(" in js, (
        "o X deixou de parar a propagacao: tirar um modelo levaria o compositor "
        "de volta ao modelo que acabou de sair da lista"
    )

    ativa = js[js.index("function _mtgLinhaAtiva(m) {"):]
    ativa = ativa[:ativa.index("\n}") + 2]
    assert "state.montagem.pedidoSel" in ativa and "state.montagem.modeloSel" in ativa, (
        "a linha ativa deixou de ser derivada do que o compositor mostra"
    )


def test_o_pdf_da_montagem_nao_depende_de_janela_nova():
    """O defeito de 29/08/2026: o PDF era gerado e sumia.

    A tela entregava com `window.open(blobUrl, '_blank')`. O navegador so' deixa
    abrir janela nova enquanto o gesto do operador ainda vale — no Chrome, cinco
    segundos —, e uma folha montada demora mais. O log do agente registrou as
    tres tentativas do dia, todas com as duas artes: o motor devolveu o PDF, e o
    painel o jogou fora sem dizer nada. O toast ainda dizia "montagem gerada".

    Os tres caminhos que entraram no lugar nao dependem de janela nenhuma:
    gravar na pasta da estacao, baixar por `<a download>`, e abrir na lightbox
    do proprio painel.
    """
    # SEM OS COMENTARIOS: a explicacao do defeito, logo acima da funcao, CITA o
    # `window.open`. Um teste que casa com a citacao em vez da chamada nao
    # guarda nada — foi assim que um teste meu passou a esmo tres vezes hoje.
    js = _ler("frontend/montagem.js")
    codigo = re.sub(r"^\s*//.*$", "", re.sub(r"/\*.*?\*/", "", js, flags=re.S), flags=re.M)

    assert "window.open(" not in codigo, (
        "a Montagem voltou a entregar o PDF por janela nova; o navegador a "
        "bloqueia e o trabalho some sem erro na tela"
    )
    assert "/api/hotfolder/drop" in js and "/api/hotfolder/escolher" in js, (
        "a gravacao na pasta saiu: quem enxerga o disco da estacao e' o agente, "
        "e nenhuma estacao da grafica usa o mesmo navegador"
    )
    assert "a.download = nome" in js, (
        "o plano que sempre funciona saiu — sem pasta escolhida o PDF nao teria "
        "para onde ir"
    )


def test_a_lightbox_aceita_o_tipo_dito():
    """Um `blob:` nao tem o nome do arquivo dentro do endereco.

    A lightbox dos anexos adivinhava o tipo pelo endereco (`.pdf`), o que
    funciona para o anexo guardado no Storage e NAO funciona para o PDF recem
    gerado da montagem: ele sairia como uma imagem quebrada. Quem sabe o tipo,
    diz.
    """
    js = _ler("frontend/script.js")
    assert "function openAnexoLightbox(url, name, tipo)" in js
    assert "const isPdf = tipo ? (tipo === 'pdf') : url.toLowerCase().includes('.pdf')" in js, (
        "a lightbox voltou a adivinhar o tipo so' pelo endereco"
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


def test_a_montagem_monta_a_arte_pelas_funcoes_do_pedido():
    """As sete divergencias de 03/09/2026, travadas de uma vez.

    A primeira versao montava a sua propria arte, e uma celula refeita saia
    diferente da original em sete coisas: sem o verso (lia `arte_verso_url`,
    campo que nao existe, e mandava `print_mode: 'simplex'`, valor que o motor
    nao conhece), com a amostra de aprovacao no lugar da arte (sem o filtro
    `arteParaImpor`), sem os bancos do pedido, com o `csv_data` inteiro em vez
    da fatia do modelo, sem a escala da arte, sem a rotacao da folha e com os
    elementos de Layout.

    O conserto nao foi copiar as sete regras: foi extrair da `runPedImposition`
    o construtor de arte (`arteDoModeloParaFolha` + `arteParaOMotor`) e fazer as
    duas telas chamarem o MESMO. Este teste cobra os dois lados.
    """
    js = _ler("frontend/montagem.js")
    pedido = _ler("frontend/pedido.js")

    # O lado do Pedido: as funcoes existem e a runPedImposition as usa.
    assert "function arteDoModeloParaFolha(s, numIdReserva, opcoes) {" in pedido
    assert "function arteParaOMotor(arte, isMultiSelected) {" in pedido
    assert "tempMultiArtes = state.selectedOSItems.map(s => arteDoModeloParaFolha(s, numId));" in pedido, (
        "a runPedImposition voltou a montar a arte por conta propria — as duas "
        "telas divergiriam de novo"
    )
    assert "payloadMultiArtes = artesList.map(arte => arteParaOMotor(arte, isMultiSelected));" in pedido

    # O lado da Montagem: nada de regra propria.
    codigo = re.sub(r"^\s*//.*$", "", re.sub(r"/\*.*?\*/", "", js, flags=re.S), flags=re.M)
    assert "arte_verso_url" not in codigo, "voltou a ler um campo de verso que nao existe"
    assert "'simplex'" not in codigo, "voltou a mandar um modo de impressao que o motor nao conhece"
    assert "it.arte_url" not in codigo and "item.arte_url" not in codigo, (
        "voltou a mandar a arte crua, sem o filtro da amostra de aprovacao"
    )
    # `arte_escala_h` (a reserva do trabalho, 100) e' legitima; o que nao pode
    # existir aqui e' a escala POR ARTE, que e' do construtor do Pedido.
    so_da_arte = codigo.replace("arte_escala_h", "").replace("arte_escala_v", "")
    assert "pdf_verso_url:" not in so_da_arte and "escala_h:" not in so_da_arte, (
        "a Montagem voltou a escrever campos da arte que sao do construtor do Pedido"
    )
    for chamada in ("garantirBancosDoTrabalho([osId])", "garantirCsvDoTrabalho(ids)",
                    "pedidosComBancoDesconhecido([osId])", "bancoVazioNoPayload(null, artes)",
                    "numeracaoSemElementosDeLayout(pronta.numeracao)",
                    "rotacaoDaFolhaDoFormato(fmt)", "print_mode: modoDaFolhaDaMontagem(modelos)"):
        assert chamada in js, "sumiu da Montagem: " + chamada


def test_a_rotacao_da_folha_vem_de_uma_funcao_so():
    """`rotacaoDaFolhaDoFormato` (script.js) e' lida pelas tres telas.

    Antes, a regra (page_rotate do formato, ou 90 se `default_rotate_page`)
    estava escrita duas vezes — no applyFormatoDefaults e no gemeo do
    pedido.js — e a Montagem mandava 0 fixo. Um formato que gira a folha
    chegava ao RIP deitado.
    """
    script = _ler("frontend/script.js")
    pedido = _ler("frontend/pedido.js")
    assert "function rotacaoDaFolhaDoFormato(fmt) {" in script
    assert script.count("fmt.default_rotate_page ? 90 : 0") == 1, (
        "a regra da rotacao voltou a ser escrita mais de uma vez no script.js"
    )
    assert "default_rotate_page ? 90 : 0" not in pedido, (
        "o pedido.js voltou a repetir a regra em vez de chamar a funcao"
    )
    assert "let rotVal = rotacaoDaFolhaDoFormato(fmt);" in script
    assert "let rotVal = rotacaoDaFolhaDoFormato(fmt);" in pedido


def test_o_kanban_tem_os_tres_gestos():
    """Pedido do usuario em 03/09/2026: repetir, tirar e arrastar a celula.

    O ⧉ e o × moram DENTRO da celula arrastavel, e por isso param a
    propagacao — sem isso, clicar no × comecaria um arrasto. E a dica da folha
    diz os tres gestos em texto: icone sem rotulo e' o que esta grafica nao
    aceita.
    """
    js = _ler("frontend/montagem.js")
    html = _ler("frontend/index.html")

    assert 'draggable="true"' in js, "a celula deixou de ser arrastavel"
    assert "function _mtgLigarArrasto() {" in js
    assert "event.stopPropagation(); duplicarCelulaDaMontagem(" in js
    assert "event.stopPropagation(); removerCelulaDaMontagem(" in js
    assert "'dragstart'" in js and "'dragover'" in js and "'drop'" in js, (
        "o arrasto deixou de usar os eventos nativos do HTML5 — e' o que "
        "funciona em todos os navegadores da grafica sem instalar nada"
    )

    # O texto dos gestos mora no rodape da folha (o `.mtg-atalhos`), que o
    # redesenho de 03/09/2026 pos no lugar da antiga dica da previa.
    view = html[html.index('id="view-montagem"'):html.index('id="view-impressoras"')]
    dica = view[view.index('mtg-atalhos'):]
    dica = dica[:dica.index('</p>')]
    assert "Arraste" in dica and "repete" in dica and "tira s&oacute; ela" in dica, (
        "a dica da folha deixou de explicar os tres gestos"
    )

    # O motor imprime a repetida SO' quando a tela pede.
    assert "refazer_repetir: true" in js


def test_a_folha_e_desenhada_na_grade_do_formato():
    """A previa deixou de ser uma pilha vertical (03/09/2026).

    Ate aqui ela empilhava as celulas numa coluna, sempre. Isso so' esta' certo
    num formato de UMA coluna — o Triband. Numa credencial PVC, que e' 2 x 2, a
    tela mostrava quatro linhas empilhadas e o papel saia em quadrado: a previa
    mentia sobre a posicao da peca.

    A conta de onde cada celula cai e' a do MOTOR, e nao uma escolha de desenho.
    No caminho compactado do engine.py:

        k = S * poses_per_sheet + P,  com  P = row * cols + col

    Linha primeiro, da esquerda para a direita. E a geometria da folha e' a
    mesma: `used_w = cols*item_w + (cols-1)*gap_h`, area centralizada no papel.
    """
    js = _ler("frontend/montagem.js")
    engine = _ler("engine.py")

    assert "function lugarDaCelulaNaFolha(" in js, "a conta de onde a celula cai sumiu"
    corpo = js[js.index("function lugarDaCelulaNaFolha(i, cols, rows) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]
    assert "Math.floor(p / c)" in corpo and "p % c" in corpo, (
        "a conta deixou de ser linha-primeiro; a previa voltaria a mentir sobre "
        "onde a peca cai num formato de mais de uma coluna"
    )

    # A conta do motor, do outro lado, continua sendo a que esta tela reproduz.
    assert "P = row * cols + col" in engine, (
        "o motor mudou a ordem em que consome as celulas da folha compactada; a "
        "previa passou a desenhar outra coisa"
    )

    geo = js[js.index("function geometriaDaFolha(peca, saida) {"):]
    geo = geo[:geo.index("\n}") + 2]
    assert "peca.cols * peca.item_w_mm + (peca.cols - 1) * peca.gap_h_mm" in geo, (
        "a largura usada deixou de seguir a formula do motor"
    )
    assert "(sheetW - usedW) / 2" in geo, "a area imposta deixou de ser centralizada na folha"

    # A peca carrega as medidas: sem elas nao ha folha para desenhar.
    peca = js[js.index("function pecaDaMontagem(item) {"):]
    peca = peca[:peca.index("\n}") + 2]
    for campo in ("cols", "rows", "item_w_mm", "item_h_mm", "gap_h_mm", "gap_v_mm"):
        assert campo in peca, "a peca perdeu " + campo + ", que a folha desenha"


def test_o_numero_do_modelo_tem_os_quatro_controles():
    """Pedido do usuario em 03/09/2026: posicao, rotacao, tamanho e cor.

    Dos quatro, so' a COR existia — o campo `nome_color`, que a Montagem
    mandava fixo em preto. Os outros tres eram constantes no engine.py.

    O que trava aqui e' o contrato entre a tela e o motor: os dois precisam
    sanear os mesmos valores, senao a previa mostra uma coisa e o papel sai
    outra. E o PADRAO tem de ser exatamente o que o motor sempre fez, senao
    ligar a caixa mudaria o papel de quem nunca pediu nada.
    """
    js = _ler("frontend/montagem.js")
    engine = _ler("engine.py")

    padrao = js[js.index("function numeroPadraoDaMontagem() {"):]
    padrao = padrao[:padrao.index("\n}") + 2]
    assert "imprimir: false" in padrao, (
        "o numero deixou de nascer desligado; novidade que muda o papel entra "
        "desligada"
    )
    assert "pos: 'esquerda'" in padrao and "rot: 90" in padrao \
        and "size: 14" in padrao and "cor: '#000000'" in padrao, (
        "o padrao deixou de ser o que o motor sempre fez (14 pt, borda esquerda, "
        "90 graus, preto) — ligar a caixa passaria a mudar o papel"
    )

    # O MESMO padrao do lado do motor. Se um dos dois mudar sozinho, a previa e
    # o papel divergem.
    assert "_NOME_CORPO_PADRAO = 14" in engine, "o corpo padrao do motor mudou"
    assert '_NOME_POSICOES' in engine and '_NOME_GIROS' in engine, (
        "o motor deixou de ter a lista de valores validos"
    )

    san = js[js.index("function numeroDaMontagemSaneado(n) {"):]
    san = san[:san.index("\n}") + 2]
    assert "MTG_POSICOES_DO_NUMERO.indexOf" in san and "MTG_ROTACOES_DO_NUMERO.indexOf" in san, (
        "a tela deixou de recusar valor fora da lista; ele iria ao motor e "
        "cairia no padrao la, sem a tela saber"
    )

    # E os quatro campos viajam na ARTE, que e' onde o motor os le.
    prep = js[js.index("async function prepararArtesDaMontagem(modelos) {"):]
    prep = prep[:prep.index("\n}\n") + 3]
    for campo in ("nome_color", "nome_size", "nome_pos", "nome_rot"):
        assert "pronta." + campo + " =" in prep, (
            campo + " deixou de ir no payload; o motor imprimiria o padrao, calado"
        )
    assert "numeroDaMontagemSaneado(state.montagem.numero)" in prep, (
        "o payload deixou de sanear os valores antes de mandar"
    )


def test_o_operador_tem_como_desfazer():
    """Era a falta mais grave da tela (03/09/2026).

    Um x no lugar errado apagava a celula sem volta, e repor custava reescolher
    o pedido, esperar o `loadOSItens`, reescolher o modelo e redigitar as
    posicoes. Todo gesto que mexe na folha passa a guardar um instantaneo antes.
    """
    js = _ler("frontend/montagem.js")

    assert "function guardarNaHistoria()" in js
    assert "function desfazerMontagem()" in js and "function refazerMontagem()" in js

    # Todo gesto que muda a folha guarda antes. Sem isto, o desfazer pula um
    # passo e o operador perde a confianca nele — que e' pior do que nao ter.
    for gesto in ("function adicionarNaMontagem()", "function removerDaMontagem(indice)",
                  "function duplicarCelulaDaMontagem(i)", "function removerCelulaDaMontagem(i)",
                  "function moverCelulaDaMontagem(de, para)", "function limparMontagem()",
                  "function completarAFolhaDaMontagem()", "function ordenarMontagem(criterio)"):
        corpo = js[js.index(gesto):]
        corpo = corpo[:corpo.index("\n}") + 2]
        assert "guardarNaHistoria()" in corpo, (
            gesto.split("(")[0].replace("function ", "") + " mexe na folha sem "
            "guardar o estado anterior — o desfazer pularia esse passo"
        )

    # Os modelos vao por REFERENCIA no instantaneo: cloná-los levaria junto o
    # `peca._item`, que e' o item vivo do state.osItens.
    inst = js[js.index("function _mtgInstantaneoAtual() {"):]
    inst = inst[:inst.index("\n}") + 2]
    assert "m.modelos.slice()" in inst, (
        "o instantaneo passou a clonar os modelos; isso duplicaria o item vivo "
        "do pedido dentro da peca"
    )

    # E o teclado nao pode agir enquanto o operador digita no compositor.
    tecl = js[js.index("function _mtgLigarTeclado() {"):]
    tecl = tecl[:tecl.index("\n}\n") + 3]
    assert "digitando" in tecl and "INPUT" in tecl, (
        "o teclado da folha deixou de ignorar os campos de digitacao; Delete "
        "apagaria a folha enquanto o operador corrige uma posicao"
    )


def test_a_folha_ocupa_o_lugar_nobre():
    """O redesenho de 03/09/2026, do lado do layout.

    A folha vivia numa coluna fixa de 380px na direita enquanto a tabela de
    modelos tomava a largura toda. Mas o trabalho do operador acontece NA
    FOLHA — e' la que ele arrasta, repete e tira celula.
    """
    css = _ler("frontend/style.css")
    html = _ler("frontend/index.html")

    bloco = css[css.index("/* ─── MONTAGEM"):css.index("   PAINEL DO ACABAMENTO")]
    assert ".mtg-folha-card" in bloco and "flex: 1 1 auto" in bloco, (
        "a folha deixou de ser a coluna elastica"
    )
    assert ".mtg-lado" in bloco, "a coluna de apoio sumiu"
    assert "flex: 0 0 380px" not in bloco, (
        "a folha voltou para a coluna fixa de 380px, que e' o que o redesenho "
        "desfez"
    )

    # A ordem no HTML: a folha vem antes da coluna de apoio.
    view = html[html.index('id="view-montagem"'):html.index('id="view-impressoras"')]
    assert view.index("mtg-folha-card") < view.index("mtg-lado"), (
        "a coluna de apoio passou a vir antes da folha"
    )

    # E os tres gestos estao escritos em TEXTO: icone sem rotulo nao vale nesta
    # grafica (ver interface-precisa-se-explicar-sozinha).
    atalhos = view[view.index("mtg-atalhos"):]
    atalhos = atalhos[:atalhos.index("</p>")]
    for palavra in ("Arraste", "repete", "tira s&oacute; ela", "Ctrl+Z"):
        assert palavra in atalhos, "o texto dos gestos perdeu: " + palavra
