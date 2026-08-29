# -*- coding: utf-8 -*-
"""O Hot Folder virou botao proprio, com ladrilhos de pasta (29/08/2026).

Pedido do usuario: *"no painel de producao, ao editar o pedido, vamos tirar as
opcoes de Hot Folder de dentro das configuracoes de impressao, sera um botao a
parte, ao clicar e selecionar ele ja estara ativo e vai mostrar abaixo do botao
icones de pastas coloridas e com nomes das pastas, selecionalas escolhe o hot
folder"*.

O layout, as cores e o comportamento do clique sao medidos DESENHANDO, no
harness em Chrome. O que este arquivo cobre e o que se le no codigo-fonte e nao
se ve na tela -- em especial o caminho da impressao, que esta aprovado e rodando
na grafica e nao pode regredir por causa de uma mudanca de interface.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "hot_folder_ladrilhos_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_dos_ladrilhos_passa():
    assert os.path.exists(HARNESS), "o harness dos ladrilhos sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_envio_continua_lendo_as_mesmas_duas_funcoes():
    """A interface mudou; o caminho da impressao NAO pode ter mudado.

    `_hotFolderAtivo()` e `_hotFolderPath()` sao lidas em quatro pontos do envio
    -- o `options.hot_folder_path`, o ramo do `sendPrintJob`, o salvar por
    produto e a trava do botao Imprimir. Trocar essas funcoes por uma variavel
    nova obrigaria a mexer nos quatro, e e' o material da grafica que paga um
    engano ali. Elas ficaram com o mesmo nome e o mesmo contrato de proposito:
    o que mudou por dentro foi apenas de onde vem o "ativo".
    """
    js = _ler("frontend/script.js")
    for fn in ("_hotFolderAtivo", "_hotFolderPath"):
        assert "function " + fn + "(" in js, fn + " sumiu — o envio a chama"

    assert "options.hot_folder_path = _hotFolderPath()" in js, (
        "o envio deixou de carregar a pasta escolhida"
    )
    assert "hot_folder_path: hotFolderAtivo ? _hotFolderPath() : ''" in js, (
        "o salvar por produto deixou de gravar a pasta"
    )


def test_ativo_passou_a_ser_ter_pasta_escolhida():
    """Um estado so, em vez de dois que podiam discordar.

    Antes eram uma caixa "ativar" e um caminho, guardados separados: caixa
    marcada sem pasta atravessava a tela inteira e so' era barrada no botao
    Imprimir. Agora escolher a pasta E' ativar, e o estado impossivel deixou de
    existir.
    """
    js = _ler("frontend/script.js")
    corpo = js[js.index("function _hotFolderAtivo() {"):]
    corpo = corpo[:corpo.index("\n}") + 2]
    assert "_hotFolderPath()" in corpo, (
        "o ativo voltou a depender de outra coisa que nao a pasta escolhida"
    )
    assert "ped-hotfolder-enabled" not in js, (
        "a caixa de ativar voltou ao codigo"
    )


def test_o_hot_folder_saiu_da_configuracao_de_impressao():
    html = _ler("frontend/index.html")

    i_hot = html.index('id="jg-hotfolder"')
    i_cfg = html.index('id="jg-config"')
    assert i_hot < i_cfg, (
        "o Hot Folder tem de vir ANTES da Configuracao de Impressao: ele decide "
        "para onde o material vai, e o resto daquele grupo depende dessa escolha"
    )

    corpo_cfg = html[i_cfg:html.index('id="jg-cores"')]
    assert "ped-hotfolder" not in corpo_cfg, (
        "sobrou hot folder dentro da Configuracao de Impressao"
    )


def test_a_saida_de_colar_o_caminho_continua_existindo():
    """Estacao sem agente precisa poder apontar uma pasta.

    O seletor nativo depende do agente local. Sem ele -- agente parado, painel
    servido pela nuvem --, os ladrilhos nascem vazios; se o campo de colar
    tambem sumisse, nao restaria forma nenhuma de escolher a pasta, e a tela
    seria uma trava sem saida.
    """
    html = _ler("frontend/index.html")
    assert 'id="ped-hotfolder-colar"' in html, "o campo de colar o caminho sumiu"
    assert "adicionarHotFolderColada" in _ler("frontend/script.js")


def test_a_lista_da_estacao_ganhou_rota_e_a_autorizacao_continua_valendo():
    """A lista existia; faltava a casca HTTP.

    O `hot_folders.json` e' o que autoriza gravar numa pasta: sem ele, qualquer
    pagina aberta no navegador do operador poderia escrever arquivos na estacao.
    Mostrar a lista na tela NAO pode afrouxar isso -- o /drop continua exigindo
    que a pasta esteja registrada, e o registro continua saindo so' do seletor
    nativo ou da validacao explicita.
    """
    app = _ler("app.py")
    assert '@app.get("/api/hotfolder/listar")' in app
    assert '@app.post("/api/hotfolder/esquecer")' in app

    drop = app[app.index('@app.post("/api/hotfolder/drop")'):]
    drop = drop[:drop.index("@app.post", 10)] if "@app.post" in drop[10:] else drop
    assert "db.hot_folder_registrada(folder)" in drop, (
        "o /drop deixou de conferir se a pasta esta autorizada"
    )

    db = _ler("db.py")
    assert "def esquecer_hot_folder(" in db
    assert "def list_hot_folders(" in db


def test_listar_as_pastas_tem_prazo_e_nao_segura_a_janela():
    """Pasta de rede fora do ar nao pode segurar a abertura do modelo.

    `os.path.isdir` num caminho de rede cujo servidor nao responde NAO devolve
    False -- ele trava ate o timeout do SMB. Medido nesta maquina com um IP
    inalcancavel: **26,64 s**. A tela espera esta rota ao abrir o modelo, e o
    operador esta de pe na frente da impressora.

    Duas coisas o teste trava, e a segunda foi a que quase escapou:

    1. ha prazo;
    2. o pool NAO e' usado com `with`. O `__exit__` chama `shutdown(wait=True)`
       e espera todas as threads -- inclusive a travada --, entao a primeira
       versao tinha o prazo e mesmo assim demorava os 26 s inteiros.

    E pasta que nao respondeu a tempo devolve `None`, e nao `False`: "nao sei"
    e' diferente de "nao existe", e acusar de sumida uma pasta que apenas
    demorou seria mentir para o operador.
    """
    import time

    import app
    import db

    guardado = db.list_hot_folders
    isdir_real = app.os.path.isdir
    try:
        db.list_hot_folders = lambda: [
            {"path": r"C:\Rapida", "registrada_em": ""},
            {"path": r"\\servidor\rip\travada", "registrada_em": ""},
        ]

        def isdir_lento(caminho):
            if "travada" in caminho:
                time.sleep(30)      # o SMB desistindo
                return True
            return True

        app.os.path.isdir = isdir_lento

        t = time.time()
        r = app.hotfolder_listar()
        levou = time.time() - t
    finally:
        db.list_hot_folders = guardado
        app.os.path.isdir = isdir_real

    assert levou < 5, (
        "listar as pastas levou %.1fs: a janela do modelo ficaria parada esse "
        "tempo todo por causa de uma pasta de rede fora do ar" % levou
    )

    por_nome = {p["nome"]: p for p in r["pastas"]}
    assert por_nome["Rapida"]["existe"] is True
    assert por_nome["travada"]["existe"] is None, (
        "pasta que nao respondeu a tempo foi dada como inexistente; ela apenas "
        "demorou, e a tela a marcaria como quebrada sem motivo"
    )


def test_o_nome_da_pasta_e_o_mesmo_no_agente_e_na_tela():
    """Duas funcoes respondem a mesma pergunta, e elas nao podem divergir.

    O `nome` que o ladrilho mostra vem do agente (`hotfolder.nome_curto`) para
    as pastas da lista, e do frontend (`_nomeDaPasta`) para a pasta gravada num
    produto que a estacao nao lista -- estacao trocada, agente parado.

    A armadilha que este teste guarda: numa RAIZ DE COMPARTILHAMENTO
    (`\\\\servidor\\travada`) o Windows trata o caminho inteiro como raiz e o
    `os.path.basename` devolve string vazia. O agente caia no caminho completo
    enquanto a tela dizia "travada" -- a mesma pasta com dois nomes, dependendo
    de onde a resposta veio.
    """
    import hotfolder

    casos = {
        r"C:\RIP\Epson\Sublimacao 160g": "Sublimacao 160g",
        "C:/RIP/Epson/Foto Brilho/": "Foto Brilho",
        r"\\servidor\rip\Vinil": "Vinil",
        r"\\servidor\travada": "travada",     # raiz de compartilhamento
        "D:\\": "D:",                          # raiz de unidade
        "": "",
    }
    for caminho, esperado in casos.items():
        assert hotfolder.nome_curto(caminho) == esperado, caminho

    # E o frontend responde igual. A regra dele esta em _nomeDaPasta: separar
    # por barra e pegar o ultimo trecho nao vazio -- e' esta a regra que o
    # agente passou a espelhar, e nao o contrario.
    js = _ler("frontend/script.js")
    corpo = js[js.index("function _nomeDaPasta(caminho) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]
    assert "split(" in corpo, (
        "o frontend mudou de regra para achar o nome; o agente ficou espelhando "
        "uma regra que nao existe mais"
    )


def test_a_cor_do_ladrilho_e_derivada_do_caminho():
    """Sem campo novo para alguem preencher.

    Cor guardada seria mais um dado a manter, mais uma tela para edita-lo, e um
    valor a menos que a estacao responde sozinha. Derivada do caminho, a mesma
    pasta tem sempre a mesma cor -- e e' isso que faz o operador reconhecer o
    ladrilho sem ler.
    """
    js = _ler("frontend/script.js")
    corpo = js[js.index("function _corDaPasta(caminho) {"):]
    corpo = corpo[:corpo.index("\n}") + 2]
    assert "toLowerCase()" in corpo, (
        "a cor voltou a depender da caixa do caminho, e no Windows o mesmo "
        "caminho aparece escrito de varios jeitos"
    )
    assert "charCodeAt" in corpo, "a cor deixou de sair do proprio caminho"
