# -*- coding: utf-8 -*-
"""O Painel do Acabamento, pedido pelo usuario em 20/08/2026.

Um menu novo para o setor que recebe o material DEPOIS da imposicao e da
impressao. E um espelho do Painel de Producao — mesmo layout, mesmos cards,
mesmos filtros, mesma lista — com tres diferencas que estes testes protegem:

1. **Somente leitura.** Nada de imposicao, impressora, PDF, agente local,
   seletor de numeracao ou campo digitavel. As unicas duas escolhas sao o
   estagio do acabamento e o responsavel, por modelo.

2. **A amostra do link do cliente**, em bom tamanho, para conferir o papel
   contra o que foi aprovado. Amostra em PDF continua saindo como atalho para o
   arquivo: rasterizar a arte do cliente esta fora de cogitacao neste projeto.

3. **Campos proprios no banco.** `acabamento_status`, `acabamento_responsavel` e
   `acabamento_foto_url` sao colunas novas de `pedidos_modelos`. O
   `status_impressao`, que e do setor de impressao, e LIDO para derivar o
   estagio de partida e nunca escrito — sao dois setores com dois vocabularios.

4. **A foto do material** (20/08/2026, segunda rodada). Um botao de camera por
   modelo abre a webcam da estacao; a foto vai para o bucket `artes`, prefixo
   `acabamento-fotos/`. Bucket novo com escrita anonima ja falhou neste projeto
   antes, e ha teste travando essa escolha.

O grosso das regras e medido pelo harness em Node, que executa o
`frontend/acabamento.js` de verdade. O que fica aqui e a LIGACAO: a tela existe
no HTML, a permissao existe nos dois lados, o arquivo vai para a estacao, e o
SQL que sustenta tudo isso esta escrito.
"""
import io
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "acabamento_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_do_acabamento_passa():
    assert os.path.exists(HARNESS), "o harness do acabamento sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_harness_do_titulo_em_duas_linhas_passa():
    """O titulo do pedido aberto, medido num Chrome de verdade.

    Pedido do usuario em 23/08/2026: duas linhas -- em cima o numero e o evento,
    embaixo o nome e o numero do cliente, 20% menores e em amarelo.

    Este harness existe por causa de uma armadilha que nenhum teste de texto
    pega: o <h1> do cabecalho pinta o texto com o degrade de `.page-header-text
    h1`, por `-webkit-background-clip: text` e `-webkit-text-fill-color:
    transparent`. Esse transparente e herdado, e o degrade se recorta tambem no
    texto dos filhos -- uma segunda linha so com `color: #fbbf24` sairia CINZA,
    com o amarelo todo certo no codigo. O harness mede a cor no pixel, e desenha
    ao lado o controle que prova a armadilha.
    """
    harness = os.path.join(RAIZ, "tests", "titulo_do_acabamento_harness.js")
    assert os.path.exists(harness), "o harness do titulo do acabamento sumiu"

    r = subprocess.run(
        ["node", harness], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_menu_e_a_tela_existem_no_painel():
    html = _ler("frontend/index.html")

    assert 'id="nav-acabamento"' in html, "o botao do menu nao esta no index.html"
    assert 'data-view="view-acabamento"' in html, "o botao nao aponta para a tela"
    assert "Painel do Acabamento" in html, "o menu nao tem o nome que o usuario pediu"
    assert 'id="view-acabamento"' in html, "a tela nao esta no index.html"
    assert 'src="acabamento.js' in html, "o index.html nao carrega o acabamento.js"

    # A tela e um espelho da Producao: as mesmas classes de layout.
    secao = html[html.index('id="view-acabamento"'):]
    secao = secao[:secao.index("</section>")]
    for classe in ("prod-panel-container", "prod-top-bar", "prod-table-card",
                   "prod-side-metrics", "prod-metric-card", "prod-sectors-grid"):
        assert classe in secao, "a tela do acabamento nao usa " + classe

    # Os quatro estagios, nos filtros da coluna lateral.
    for estagio in ("Aguardando", "Impresso", "Em acabamento", "Pronto"):
        assert "setFiltroStatus('" + estagio + "')" in secao, (
            "o estagio " + estagio + " nao da para filtrar na coluna lateral"
        )


def test_a_tela_do_acabamento_nao_fala_com_o_agente_nem_com_a_impressora():
    """A tela do acabamento nao imprime, nao impoe e nao consulta a estacao.

    O bloco de versao do NewProd, que a coluna de metricas da Producao tem no
    rodape, NAO pode aparecer aqui: ele pergunta ao agente local qual versao
    esta instalada, e este menu, por pedido do usuario, nao tem ligacao nenhuma
    com o agente.
    """
    html = _ler("frontend/index.html")
    secao = html[html.index('id="view-acabamento"'):]
    secao = secao[:secao.index("</section>")]

    for proibido in ("newprod-version", "verificarAtualizacaoAgente", "runImposition",
                     "abrirImposicaoDoPedido", "Gerar PDF", "Imprimir",
                     "enviarParaPedido", "impressora"):
        assert proibido not in secao, (
            "a tela do acabamento traz '" + proibido + "', que e do agente ou da impressao"
        )

    # E nao ha campo digitavel nenhum na marcacao, so a busca da lista.
    inputs = re.findall(r"<input[^>]*>", secao)
    assert len(inputs) == 1, "esperava so o campo de busca, achei %d inputs" % len(inputs)
    assert 'id="os-search-acabamento"' in inputs[0], "o unico input tem de ser a busca"


def test_os_ids_da_tela_nova_nao_colidem_com_os_da_producao():
    """As duas telas moram no MESMO documento.

    Um id repetido faria `getElementById` devolver o elemento da outra tela — e
    o painel de um setor escreveria no do outro. O mesmo vale para o atributo
    `data-prazo`, que o `updateFiltroPrazoBotoes` da Producao varre no documento
    inteiro.
    """
    html = _ler("frontend/index.html")
    ids = re.findall(r'\bid="([^"]+)"', html)
    repetidos = sorted({i for i in ids if ids.count(i) > 1})
    assert not repetidos, "ids repetidos no index.html: " + ", ".join(repetidos)

    secao = html[html.index('id="view-acabamento"'):]
    secao = secao[:secao.index("</section>")]
    assert 'data-prazo="' not in secao, (
        "os botoes de prazo do acabamento usam data-prazo, e o painel de Producao "
        "repintaria todos eles: use data-prazo-acab"
    )
    assert secao.count("data-prazo-acab=") == 4, "esperava os quatro recortes de prazo"


def test_a_permissao_do_modulo_existe_dos_dois_lados():
    js = _ler("frontend/script.js")

    assert "perm_acabamento_view:  ['nav-acabamento']," in js, "falta o mapa do botao"
    assert "perm_acabamento_view:  ['view-acabamento']," in js, "falta o mapa da tela"
    assert "key: 'acabamento'" in js, "o modulo nao aparece na tela de Usuarios"

    # TODO perfil ve E edita o Acabamento. Ate 22/08/2026 o acabamento espelhava
    # a producao (quem via uma via a outra; quem editava uma editava a outra), e
    # o resultado foi o atendimento e o designer sem poder marcar o estagio do
    # material. Decisao do usuario naquele dia: "o Menu Painel do Acabamento deve
    # aparecer e ser editavel a todos os usuarios".
    perfis = re.findall(
        r"perm_acabamento_view:(true|false), perm_acabamento_edit:(true|false),", js)
    assert len(perfis) == 8, "esperava os 8 perfis com a chave do acabamento, achei %d" % len(perfis)
    for av, ae in perfis:
        assert av == "true" and ae == "true", (
            "todo perfil ve e edita o Acabamento; achei view=%s edit=%s" % (av, ae)
        )

    # O servidor decide o que o BANCO recebe no primeiro acesso: sem as duas
    # chaves aqui, quem entra pela primeira vez nasce sem o menu novo -- e, desde
    # 22/08/2026, nasce com as duas LIGADAS, nos dois perfis que o primeiro
    # acesso produz.
    ts = _ler("supabase/functions/painel/index.ts")
    assert ts.count("perm_acabamento_view: true, perm_acabamento_edit: true,") == 2, (
        "as duas grades padrao da Edge Function precisam do acabamento ligado (ver e editar)"
    )


def test_o_perfil_acabamento_existe_e_abre_no_painel_do_acabamento():
    """O perfil do setor, pedido pelo usuario em 22/08/2026 para o Acesso Local.

    Ele so ve o Painel do Acabamento -- o harness da grade prova que nenhuma
    outra permissao vem ligada. Aqui ficam as tres ligacoes que fazem o perfil
    aparecer e funcionar: o rotulo (sem ele o seletor de perfil nao o oferece, e
    a barra lateral mostra "perfil quebrado"), a tela em que ele abre o dia (sem
    ela cai no Painel de Producao, que ele nao pode ver) e o filtro do seletor de
    responsavel.
    """
    js = _ler("frontend/script.js")

    assert "acabamento: { label: 'Acabamento'" in js, "o perfil nao tem rotulo em ROLE_LABELS"
    assert "acabamento:   'view-acabamento'," in js, "o perfil nao abre no Painel do Acabamento"

    acab = _ler("frontend/acabamento.js")
    assert "const PERFIL_DO_RESPONSAVEL = 'acabamento';" in acab, (
        "o seletor de responsavel precisa filtrar pelo perfil"
    )
    assert "o.role === PERFIL_DO_RESPONSAVEL" in acab, "o filtro nao esta sendo aplicado"


def test_o_harness_da_grade_do_acesso_local_passa():
    """Quem entra pela estacao tem a grade do ACESSO LOCAL, nao a do site.

    Tres acessos locais tinham a grade gravada antes de o modulo Acabamento
    existir, e chave ausente valia "nao" -- o menu sumia na estacao por mais que
    o administrador marcasse caixas na grade dos usuarios do site. O harness
    prova que chave ausente agora segue o padrao do perfil, e que chave presente
    continua mandando.
    """
    harness = os.path.join(RAIZ, "tests", "grade_do_acesso_local_harness.js")
    assert os.path.exists(harness), "o harness da grade do acesso local sumiu"

    r = subprocess.run(
        ["node", harness], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_sql_liga_o_acabamento_para_todos_sem_tocar_no_resto_da_grade():
    """O ajuste pedido em 22/08/2026 e um SQL completo, pronto para colar.

    Ele liga VER e EDITAR do Acabamento em todo mundo -- na grade dos usuarios
    do site E no JSON dos acessos locais, que e a grade que a estacao aplica --
    e nao encosta em nenhuma outra caixa: o usuario edita a grade ao vivo, e
    reescrever o resto a partir do ROLE_DEFAULTS apagaria ajustes feitos a mao.
    """
    sql = _ler("sql/acabamento_para_todos.sql")

    assert "UPDATE public.imposition_user_permissions" in sql, "falta a grade dos usuarios do site"
    assert "UPDATE public.imposition_acessos_locais" in sql, "falta a grade dos acessos locais"

    comandos = []
    for c in re.split(r";\s*\n", sql):
        sem_comentario = "\n".join(l for l in c.splitlines() if not l.strip().startswith("--"))
        if re.search(r"^\s*UPDATE\b", sem_comentario, re.M):
            comandos.append(sem_comentario)
    assert len(comandos) == 2, "esperava exatamente dois UPDATE (site e estacao)"
    for sem_comentario in comandos:
        chaves = set(re.findall(r"\bperm_[a-z_]+", sem_comentario))
        assert chaves == {"perm_acabamento_view", "perm_acabamento_edit"}, (
            "o UPDATE so pode tocar nas duas chaves do acabamento; achei %s" % sorted(chaves)
        )


def test_a_estacao_sincroniza_o_arquivo_da_tela_nova():
    """Sem isto o `index.html` novo chega a estacao pedindo um script que da 404,
    e o menu abre em branco SO na maquina da grafica."""
    import sys
    sys.path.insert(0, RAIZ)
    import security_config

    assert "acabamento.js" in security_config.PAINEL_ARQUIVOS, (
        "acabamento.js ficou de fora do PAINEL_ARQUIVOS"
    )


def test_o_sql_cria_as_colunas_a_view_e_a_permissao():
    sql = _ler("sql/painel_do_acabamento.sql")

    assert "ALTER TABLE pedidos_modelos" in sql
    assert "acabamento_status" in sql and "acabamento_responsavel" in sql

    # A view existe e entrega SO o nome: a tabela por tras dela guarda os
    # codigos de acesso das estacoes em texto claro.
    assert "CREATE OR REPLACE VIEW public.imposition_operadores" in sql
    corpo = sql[sql.index("CREATE OR REPLACE VIEW"):sql.index("COMMENT ON VIEW")]
    assert "codigo" not in corpo, "a view NAO pode expor o codigo de acesso"
    assert "permissoes" not in corpo, "a view NAO pode expor a grade de permissoes"

    # REVOKE antes de GRANT: sem isso o GRANT e decorativo, porque o Supabase ja
    # concedeu ALL ao papel `authenticated` por privilegio padrao do esquema.
    pos_revoke = sql.index("REVOKE ALL ON public.imposition_operadores FROM authenticated")
    pos_grant = sql.index("GRANT SELECT ON public.imposition_operadores TO authenticated")
    assert pos_revoke < pos_grant, "o REVOKE tem de vir antes do GRANT"

    assert "perm_acabamento_view" in sql and "perm_acabamento_edit" in sql, (
        "o SQL precisa criar as colunas de permissao: mandar uma coluna que nao "
        "existe faz o PostgREST recusar a gravacao INTEIRA com 400"
    )


def test_a_tela_nova_nao_mexeu_no_painel_de_producao():
    """A tela do acabamento se pendura no que existe, sem reescrever nada.

    `renderOrdens` e `showView` continuam sendo os do `script.js`; o
    `acabamento.js` os EMBRULHA, chamando o original primeiro e inteiro.
    """
    js = _ler("frontend/acabamento.js")

    assert "const original = window.renderOrdens;" in js, "o embrulho do renderOrdens sumiu"
    assert "const original = window.showView;" in js, "o embrulho do showView sumiu"
    assert js.count("original.apply(this, arguments)") == 2, (
        "os dois embrulhos precisam chamar o original, e chamar primeiro"
    )

    # E o Painel de Producao segue intacto no ponto que mais importa: o clique
    # da linha continua abrindo a imposicao do pedido.
    script = _ler("frontend/script.js")
    assert 'onclick="abrirImposicaoDoPedido(' in script, (
        "o clique da linha do Painel de Producao mudou"
    )
    assert "id=\"tbody-impressao\"" in _ler("frontend/index.html"), (
        "a tabela do Painel de Producao mudou de id"
    )


def test_o_sql_da_foto_cria_a_coluna_e_nao_cria_bucket():
    """A foto do material, pedida em 20/08/2026 depois de o usuario ver a tela.

    Bucket novo com escrita anonima ja foi tentado neste projeto e nao
    funcionou -- `sql/criar_bucket_previews.sql` comeca com "NAO EXECUTE ESTE
    ARQUIVO". A saida de la, e a daqui, e usar o `artes` com um prefixo.
    """
    sql = _ler("sql/acabamento_foto_do_modelo.sql")

    assert "ALTER TABLE pedidos_modelos" in sql
    assert "acabamento_foto_url" in sql
    for proibido in ("create bucket", "insert into storage.buckets", "create policy"):
        assert proibido not in sql.lower(), (
            "o SQL da foto nao deve criar bucket nem politica: achei " + proibido
        )

    js = _ler("frontend/acabamento.js")
    assert "const BUCKET_DA_FOTO = 'artes';" in js, "a foto tem de ir para o bucket artes"
    assert "const PASTA_DA_FOTO = 'acabamento-fotos';" in js, "num prefixo proprio"


def test_a_camera_tem_saida_que_nao_depende_do_navegador():
    """Regra do usuario: nenhuma solucao pode depender de configuracao de
    navegador -- cada estacao da grafica usa um.

    A camera pede permissao, e isso e inerente a qualquer webcam. O que NAO pode
    faltar e a outra porta: escolher um arquivo, que no celular abre a camera do
    aparelho e no computador o seletor de arquivos, sem permissao nenhuma.
    """
    js = _ler("frontend/acabamento.js")

    assert 'type="file"' in js, "falta a saida por arquivo"
    assert 'accept="image/*"' in js
    assert "Escolher arquivo" in js, "a saida precisa estar escrita na tela"

    # E a tela explica o caso do endereco sem https, em vez de virar um botao
    # que nao faz nada.
    assert "navigator.mediaDevices" in js
    assert "127.0.0.1" in js, "a tela diz em que endereco a camera funciona"

    # A camera e desligada: webcam acesa depois de fechar a janela e defeito.
    assert "desligarCamera" in js
    assert "t.stop()" in js, "as trilhas da camera precisam ser paradas"


def test_a_paleta_do_acabamento_nao_repinta_o_painel_de_producao():
    """As duas telas usam as MESMAS classes `prod-*`, de proposito.

    Por isso a paleta do Acabamento mora em regras presas ao id da secao. Uma
    regra `prod-*` solta aqui repintaria a tela que a grafica usa todo dia.

    A paleta ja mudou duas vezes -- marrom em 20/08/2026, azul em 21/08 -- e o
    que este teste protege nao e a cor: e o ESCOPO. Ele continua valendo qualquer
    que seja a proxima.
    """
    css = _ler("frontend/style.css")

    marca = "PAINEL DO ACABAMENTO"
    assert marca in css, "o bloco da paleta do acabamento sumiu do style.css"
    # Sem os comentarios: eles explicam a regra e citam `prod-*` no meio da
    # prosa, e uma linha de texto que termina em virgula parece um seletor.
    bloco = re.sub(r"/\*.*?\*/", "", css[css.index(marca) - 200:], flags=re.S)

    # Toda regra do bloco tem de comecar presa a secao.
    seletores = [
        linha.strip()
        for linha in bloco.splitlines()
        if linha.strip().endswith("{") or linha.strip().endswith(",")
    ]
    assert seletores, "nao achei seletor nenhum no bloco"
    for sel in seletores:
        assert sel.startswith("#view-acabamento"), (
            "regra do acabamento sem o id da secao, e ela repinta a Producao: " + sel
        )

    # E a Producao continua com a superficie que sempre teve.
    antes = css[:css.index(marca)]
    assert "#1e293b" in antes, "a superficie da Producao mudou"

    # A paleta azul de 21/08/2026, nos tokens -- os cinco tons que o usuario
    # entregou, do mais escuro ao mais claro.
    tokens = css[css.index("#view-acabamento {"):]
    tokens = tokens[:tokens.index("}")]
    # Sem o comentario: ele cita os tons da Producao justamente para dizer que
    # eles nao entram, e a busca crua acharia a citacao.
    tokens = re.sub(r"/\*.*?\*/", "", tokens, flags=re.S)
    for tom in ("#001249", "#123a99", "#2b32af", "#4589d7", "#4cc8f0"):
        assert tom in tokens, "o tom " + tom + " da paleta sumiu dos tokens"

    # E nenhum tom da Producao entrou nos tokens: agora que as duas telas sao
    # azuis, e a familia do azul que as separa.
    for tom in ("#3b82f6", "#2563eb", "#334155", "#1e293b", "#0f172a"):
        assert tom not in tokens, "tom da Producao dentro dos tokens: " + tom

    # As chaves seguem equilibradas: um `{` sem par faz o navegador descartar o
    # resto do arquivo em silencio.
    assert css.count("{") == css.count("}"), "chaves desequilibradas no style.css"


def test_as_imagens_do_acabamento_nao_tem_moldura():
    """Pedido do usuario: imagens centradas na altura, sem canto arredondado e
    sem fio de contorno, como nas outras janelas de imagem do projeto."""
    js = _ler("frontend/acabamento.js")

    for tag in re.findall(r"<img[^>]*/>", js):
        assert "border-radius" not in tag, "imagem com canto arredondado: " + tag[:90]
        assert not re.search(r"border:\s*1px", tag), "imagem com fio: " + tag[:90]

    assert "align-items: stretch" in js, "a linha do modelo precisa esticar"


def test_o_encerrado_como_teste_e_lido_por_fora_do_carregamento_da_producao():
    """Pedido do usuario em 20/08/2026: ignorar na lista as propostas cuja
    coluna `encerrado_teste_em` esta preenchida.

    A leitura e uma consulta PROPRIA desta tela, e nao uma coluna a mais no
    `loadOrdensFromVibecode`. O motivo e o mesmo do estagio do acabamento: aquele
    carregamento pede colunas nomeadas de `propostas` e alimenta o Painel de
    Producao e a Lista de Arte. Uma coluna que sumisse ali derrubaria as tres
    telas; aqui, derruba nada.
    """
    js = _ler("frontend/acabamento.js")

    assert "carregarEncerradosComoTeste" in js
    assert "'encerrado_teste_em', 'is', null" in js, (
        "o filtro tem de ser do lado do banco, e nao trazer 8 mil propostas"
    )
    assert "encerradosTeste.has(String(os.numero))" in js, (
        "o recorte da fila precisa descartar o que foi encerrado como teste"
    )

    # O carregamento compartilhado continua sem a coluna nova.
    script = _ler("frontend/script.js")
    for trecho in re.findall(r"\.from\('propostas'\)\s*\.select\([^)]*\)", script):
        assert "encerrado_teste_em" not in trecho, (
            "a coluna nova entrou no carregamento compartilhado: " + trecho
        )


def test_o_ultimo_estagio_se_chama_pronto():
    """Pedido do usuario em 21/08/2026: "Revisado" passou a se chamar "Pronto".

    A coluna `pedidos_modelos.acabamento_status` guarda o proprio rotulo em
    texto -- foi assim que a tela nasceu, para nao criar uma tabela de dominio
    de quatro valores. O preco e que renomear o rotulo exige reescrever as
    linhas ja gravadas, e e por isso que ha uma migracao.
    """
    js = _ler("frontend/acabamento.js")
    html = _ler("frontend/index.html")
    secao = html[html.index('id="view-acabamento"'):]
    secao = secao[:secao.index("</section>")]

    assert "'Em acabamento', 'Pronto'" in js, "o estagio novo nao entrou na lista"
    assert "setFiltroStatus('Pronto')" in secao, "o filtro lateral nao virou Pronto"
    assert "data-prazo-acab=\"prontos\"" in secao, "o recorte da fila nao virou prontos"

    # Nenhum rotulo antigo sobrou na tela.
    assert "Revisado" not in secao, "sobrou 'Revisado' na tela do acabamento"
    assert "Revisados" not in secao, "sobrou 'Revisados' na metrica"

    # A COR do estagio nao muda junto com o nome, e nao se escolhe aqui: ela diz
    # estado, e quem a define e o usuario. Estas quatro vieram dele em
    # 22/08/2026; antes disso ele ja tinha mandado devolver as que eu unifiquei
    # com a paleta.
    for estagio, cor in [("Aguardando", "#003768"), ("Impresso", "#001249"),
                         ("Em acabamento", "#000000"), ("Pronto", "#00471c")]:
        assert ("'%s':" % estagio) in js and cor in js, (
            "a cor do estagio %s mudou (esperava %s)" % (estagio, cor)
        )

    # O nome antigo continua LEGIVEL, para o intervalo entre publicar e migrar,
    # e para a estacao que ainda tem a versao anterior em cache.
    assert "NOME_ANTIGO" in js and "'revisado': 'Pronto'" in js, (
        "sem traducao do nome antigo, o que ja estava concluido sai da conta"
    )

    # E a migracao existe, e reescreve as linhas.
    sql = _ler("sql/acabamento_status_pronto.sql")
    assert "UPDATE pedidos_modelos" in sql
    assert "SET acabamento_status = 'Pronto'" in sql
    assert "ILIKE 'Revisado'" in sql


def test_o_menu_do_acabamento_volta_para_a_pagina_inicial():
    """Pedido do usuario em 21/08/2026: clicar no menu traz a lista de volta.

    Sem isto, quem abrisse um pedido, saisse para outra tela e voltasse pelo
    menu caia direto no detalhe daquele pedido -- sem topo, sem filtros e sem
    lista --, e precisava achar o botao VOLTAR para chegar onde o menu prometia.
    """
    js = _ler("frontend/acabamento.js")

    corpo = js[js.index("aoAbrir() {"):]
    corpo = corpo[:corpo.index("mostrarLista();")]
    assert "tela.pedidoAberto = null" in corpo, (
        "abrir a tela pelo menu tem de fechar o pedido que ficou aberto"
    )
    assert "fecharCamera()" in corpo, (
        "a camera pertence ao detalhe: deixa-la ligada mantem a webcam acesa"
    )


def test_a_escrita_na_tabela_do_parceiro_e_estreita():
    """O peso por setor (21/08/2026) e a UNICA escrita numa tabela do parceiro.

    `propostas_os_setores` e a ficha de conferencia de expedicao que o ERP mantem
    para a grafica preencher -- `peso_real_kg`, `qtd_volumes`, `tipo_volume`,
    `responsavel_conferencia`. O usuario abriu a excecao a regra de ouro do
    REGRAS_BANCO em 21/08/2026, e ela so continua legitima enquanto for ESTREITA:
    o peso e a data, e nada mais da linha.

    Este teste existe para que um recurso futuro nao alargue a excecao sem que
    alguem repare.
    """
    js = _ler("frontend/acabamento.js")

    assert "propostas_os_setores" in js, "a tela perdeu a gravacao do peso"

    # O trecho que grava, do comeco da funcao ate o fim dela.
    i = js.index("async function gravarPeso(")
    corpo = js[i:js.index("\n    }\n", i)]

    # As colunas que o UPDATE toca.
    assert "update({ peso_real_kg: peso, updated_at: agora })" in corpo, (
        "o update tem de tocar SO o peso e a data"
    )

    # Nenhuma coluna do parceiro entra na conversa.
    for coluna in ("status_producao", "prazo", "hora", "qtd_volumes",
                   "tipo_volume", "responsavel_conferencia"):
        assert coluna not in corpo, (
            "a gravacao do peso encostou em " + coluna + ", que e do parceiro"
        )

    # E nenhuma outra tabela e escrita em lugar nenhum do arquivo. O alvo do
    # `.from()` pode vir como texto ou como constante, entao as duas formas sao
    # colhidas e a constante e resolvida pelo valor dela.
    import re
    assert "const TABELA_DE_SETORES = 'propostas_os_setores';" in js

    alvos = re.findall(r"\.from\(([^)]+)\)\s*\.(?:update|insert|delete|upsert)\(", js)
    tabelas = sorted({
        a.strip().strip("'")
         .replace("TABELA_DE_ITENS_DO_VOLUME", "producao_volume_itens")
         .replace("TABELA_DE_SETORES", "propostas_os_setores")
         .replace("TABELA_DE_VOLUMES", "producao_volumes")
        for a in alvos
    })
    assert tabelas == ["pedidos_modelos", "producao_volume_itens", "producao_volumes",
                       "propostas", "propostas_os_setores"], (
        "o acabamento escreve em tabela inesperada: " + ", ".join(tabelas)
    )

    # As duas que entraram em 23/08/2026 sao NOSSAS -- prefixo `producao_`. Foi
    # a decisao do usuario naquele dia: os volumes ficam do nosso lado, e a
    # excecao aberta na tabela do parceiro continua sendo so a do peso.
    do_parceiro = [t for t in tabelas if not t.startswith("producao_")]
    assert do_parceiro == ["pedidos_modelos", "propostas", "propostas_os_setores"], (
        "um recurso novo alargou a escrita em tabela do parceiro: " + ", ".join(do_parceiro)
    )

    # `propostas` entrou em 21/08/2026 com o botao EXPEDICAO, e a escrita ali e a
    # mais estreita que existe: uma coluna, um valor. E a tabela PRINCIPAL do
    # parceiro -- qualquer outra coluna aqui e alargar a excecao sem pedir.
    escritas = re.findall(r"\.from\('propostas'\)\s*\.update\(([^)]*)\)", js)
    assert escritas == ["{ status_interno: 'EXPEDICAO' }"], (
        "a escrita em propostas deixou de ser so o status_interno: " + ", ".join(escritas)
    )


def test_o_peso_nao_aparece_sem_sessao():
    """Na estacao o operador e anonimo, e a tabela tem RLS de `authenticated`.

    Conferido com a chave publica em 21/08/2026: a leitura volta `[]` com HTTP
    200 -- vazia e sem erro. Campo que nao gravaria nada e pior do que campo
    nenhum, entao o box pergunta pela sessao antes e, sem ela, diz o que fazer.
    """
    js = _ler("frontend/acabamento.js")

    assert "temSessaoDoSupabase" in js
    assert "auth.getSession()" in js, "a tela precisa perguntar se ha sessao"
    assert "entre com a sua conta" in js, "o box precisa dizer o que fazer"

    # So o SIM fica guardado: quem entrar no meio do caminho nao pode ficar preso
    # a uma resposta de antes.
    i = js.index("async function temSessaoDoSupabase()")
    corpo = js[i:js.index("\n    }\n", i)]
    assert "tela.temSessao === true" in corpo, (
        "o 'nao' nao pode ficar em cache: o painel tem tela de login"
    )


def test_o_setor_do_peso_e_um_dos_quatro_que_o_banco_aceita():
    """`propostas_os_setores_setor_check` so aceita PVC, LASER, FLEXO e TEXTIL.

    Oferecer campo para um quinto setor seria prometer o que o banco recusa com
    23514 na hora de gravar.
    """
    js = _ler("frontend/acabamento.js")
    assert "SETORES_DO_BANCO = ['FLEXO', 'PVC', 'TEXTIL', 'LASER']" in js

    # E a lista e a MESMA dos cards da fila, nos dois paineis.
    html = _ler("frontend/index.html")
    for setor in ("FLEXO", "PVC", "TEXTIL", "LASER"):
        assert html.count('data-setor="' + setor + '"') == 2, (
            "o setor " + setor + " precisa estar nos cards dos dois paineis"
        )


def test_a_excecao_esta_escrita_na_regra_de_banco():
    """Regra que passou a ter excecao e regra que precisa dizer isso.

    Sou responsavel por manter a documentacao verdadeira: quem ler o REGRAS_BANCO
    e vir "NUNCA escrever em tabela do parceiro" sem ver esta excecao vai achar
    que o codigo esta errado -- ou, pior, vai abrir a segunda excecao sem
    perceber que esta abrindo uma.
    """
    regras = _ler("docs/REGRAS_BANCO.md")

    assert "peso_real_kg" in regras, "a excecao nao esta documentada onde a regra mora"
    assert "propostas_os_setores" in regras
    assert "21/08/2026" in regras, "a excecao precisa dizer quando e por quem foi aberta"

    # A lista do que NAO pode ser tocado precisa continuar la.
    for coluna in ("status_producao", "qtd_volumes", "responsavel_conferencia"):
        assert coluna in regras, (
            "o limite da excecao precisa nomear " + coluna
        )


# ─── A hora do Pronto e o peso que fecha o setor (23/08/2026) ────────────────
#
# Pedido do usuario: "ao marcar o ultimo modelo como pronto deve exigir indicar a
# informacao do peso do setor que esta pronto, so alterar status apos o peso real
# for indicado. Modelos prontos devem indicar a hora em que ficaram prontos".
#
# O comportamento da tela e exercitado pelo harness em Node, que roda o
# acabamento.js inteiro. O que fica aqui e a MIGRACAO -- a coluna e o gatilho que
# a alimentam.

MIGRACAO_DA_HORA = "sql/hora_do_pronto_no_acabamento.sql"


def test_a_migracao_da_hora_cria_a_coluna_e_o_gatilho():
    sql = _ler(MIGRACAO_DA_HORA)

    assert "ADD COLUMN IF NOT EXISTS acabamento_pronto_em timestamptz" in sql
    assert "CREATE OR REPLACE FUNCTION public.carimba_acabamento_pronto_em()" in sql
    assert "BEFORE INSERT OR UPDATE OF acabamento_status ON public.pedidos_modelos" in sql, (
        "o gatilho precisa ser BEFORE (para gravar junto) e escutar SO a coluna do estagio -- "
        "senao trocar a foto do material renovaria a hora da conclusao"
    )


def test_o_gatilho_da_hora_so_age_quando_o_estagio_muda():
    sql = _ler(MIGRACAO_DA_HORA)

    assert "NEW.acabamento_status IS DISTINCT FROM OLD.acabamento_status" in sql, (
        "sem essa guarda, reclicar no Pronto que ja estava aceso renova a hora"
    )
    assert "NEW.acabamento_pronto_em := NULL" in sql, (
        "sair do Pronto precisa apagar a hora, senao o card mostra uma conclusao desfeita"
    )


def test_a_migracao_da_hora_nao_inventa_historico():
    """Modelo marcado Pronto antes de 23/08/2026 fica SEM hora, de proposito.

    A hora aparece no card, ao lado do estagio. Uma hora aproximada, tirada do
    `updated_at`, seria lida como a de verdade pelo operador que esta de pe na
    estacao -- e `updated_at` muda a cada foto, responsavel ou observacao.
    """
    sql = _ler(MIGRACAO_DA_HORA)

    assert not re.search(r"^\s*UPDATE\s+(public\.)?pedidos_modelos", sql, re.IGNORECASE | re.MULTILINE), (
        "a migracao da hora nao deve preencher historico com um UPDATE em massa"
    )
    assert "NAO preenche historico" in sql, "e a escolha precisa estar escrita no arquivo"


def test_a_coluna_da_hora_chega_a_tela():
    js = _ler("frontend/acabamento.js")

    assert "acabamento_pronto_em" in js, "a tela precisa ler a coluna"
    i = js.index("'id, id_int, acabamento_status")
    assert "acabamento_pronto_em" in js[i:i + 200], (
        "o select do estagio dos modelos nao traz a hora"
    )


def test_a_trava_do_peso_esta_na_unica_porta_do_status():
    """`mudarEstagio` e a unica porta por onde `acabamento_status` e gravado --
    botao cinza nao impede ninguem de chamar a funcao pelo console."""
    js = _ler("frontend/acabamento.js")

    i = js.index("mudarEstagio(itemId, osId, valor) {")
    corpo = js[i:i + 1800]
    assert "pesoExigidoAntesDoPronto" in corpo, "a trava precisa estar dentro do mudarEstagio"
    assert "abrirPopupDoPeso()" in corpo, "e precisa abrir a saida na propria tela"


def test_a_trava_do_peso_tem_saida_quando_nao_ha_onde_gravar():
    """Sem estacao e sem sessao do Vibe o campo de peso nem existe na tela.
    Cobrar o peso ali seria trancar o Pronto sem saida -- e o material continuaria
    pronto na mesa, com a tela dizendo o contrario."""
    js = _ler("frontend/acabamento.js")

    i = js.index("function pesoExigidoAntesDoPronto")
    corpo = js[i:js.index("\n    }", i)]
    assert "haComoGravarPeso()" in corpo


# ─── Os volumes (23/08/2026) ────────────────────────────────────────────────
#
# Pedido do usuario, logo depois de o peso por setor entrar: um modelo grande
# feito por varios responsaveis, varios modelos pesados juntos, e o mesmo modelo
# repartido em varias caixas -- "nada disso invalida o campo ja existente onde
# precisa informar o peso total do setor".
#
# As regras sao medidas pelo harness em Node, que executa o `acabamento.js` de
# verdade. O que fica aqui e a LIGACAO: o SQL existe e diz o que precisa dizer,
# e as duas decisoes que o usuario tomou naquele dia estao travadas no codigo.

SQL_DOS_VOLUMES = "sql/volumes_do_acabamento.sql"


def test_o_sql_dos_volumes_cria_as_duas_tabelas():
    sql = _ler(SQL_DOS_VOLUMES)

    assert "create table if not exists public.producao_volumes" in sql
    assert "create table if not exists public.producao_volume_itens" in sql
    # V1, V2, V3 sao por (pedido, setor): dois operadores criando o volume 3 ao
    # mesmo tempo dariam dois "V3" que ninguem distingue na hora de conferir.
    assert "unique (id_int, setor, numero)" in sql


def test_um_volume_pertence_a_um_setor_so():
    """O peso e conferido por setor. Uma caixa com Laser e PVC dentro nao teria
    como ser somada em nenhum dos dois."""
    sql = _ler(SQL_DOS_VOLUMES)

    assert "check (setor in ('FLEXO', 'PVC', 'TEXTIL', 'LASER'))" in sql, (
        "o setor do volume precisa aceitar os mesmos quatro nomes do banco"
    )


def test_a_quantidade_e_o_que_reparte_o_modelo():
    """Sem `qtd` na ligacao, "dividir o modelo em tres caixas" nao teria como ser
    dito, e a tela nao saberia dizer quanto do modelo ainda esta fora de volume.
    """
    sql = _ler(SQL_DOS_VOLUMES)

    i = sql.index("create table if not exists public.producao_volume_itens")
    corpo = sql[i:sql.index(");", i)]
    assert "qtd" in corpo, "a ligacao volume/modelo precisa carregar quantidade"
    assert "primary key (volume_id, modelo_id)" in corpo, (
        "o mesmo modelo duas vezes no MESMO volume seria contado duas vezes"
    )
    assert "on delete cascade" in corpo, "excluir o volume leva os itens junto"


def test_os_volumes_nao_tocam_na_ficha_do_erp():
    """Decisao do usuario em 23/08/2026: os volumes ficam so do nosso lado.

    A ficha `propostas_os_setores` tem `qtd_volumes` e `tipo_volume`, e daria
    para gravar ali. Ele decidiu que nao -- continuam sendo preenchidas pela
    tela do Vibe, e a unica escrita nossa em tabela do parceiro continua sendo
    a do peso (`docs/REGRAS_BANCO.md`).
    """
    # O cabecalho do arquivo CITA a ficha, para explicar por que ela nao e
    # tocada. O que a regra proibe e o comando.
    sql = _ler(SQL_DOS_VOLUMES)
    comandos = "\n".join(
        l for l in sql.split("\n") if not l.lstrip().startswith("--")
    )
    assert "propostas_os_setores" not in comandos, (
        "o SQL dos volumes nao pode encostar na ficha do parceiro"
    )
    assert "propostas" not in comandos, "nem em `propostas`"

    # E a tela tambem nao. Os comentarios do arquivo CITAM as duas colunas para
    # explicar por que nao sao escritas; o que a regra proibe e o codigo.
    js = _ler("frontend/acabamento.js")
    codigo = re.sub(r"/\*.*?\*/", " ", js, flags=re.DOTALL)
    codigo = "\n".join(l for l in codigo.split("\n") if not re.match(r"^\s*(//|\*)", l))
    assert "qtd_volumes" not in codigo, "o codigo da tela nao escreve qtd_volumes"
    assert "tipo_volume" not in codigo, "nem tipo_volume"


def test_as_tabelas_sao_nossas_para_a_estacao_conseguir_gravar():
    """O motivo pratico de as tabelas serem nossas.

    A ficha do parceiro tem RLS de `authenticated`, e na estacao da grafica o
    operador entra pelo codigo local, sem sessao do Supabase -- e por isso que o
    peso precisa do desvio pelo agente e da Edge Function. Em tabela nossa, com
    politica de `public`, a estacao grava direto pelo PostgREST.
    """
    sql = _ler(SQL_DOS_VOLUMES)

    assert "for all to public" in sql, (
        "sem politica de `public` a estacao, que e anonima, nao gravaria nada"
    )
    assert sql.count("enable row level security") == 2, "as duas tabelas com RLS ligado"


def test_o_volume_nao_abre_rota_nova_no_agente():
    """A tela fala com o agente por quatro rotas e por mais nenhuma. Os volumes
    nao acrescentaram uma quinta -- eles nem passam por la."""
    js = _ler("frontend/acabamento.js")

    rotas = set(re.findall(r"urlDaEstacao\('([a-z0-9-]+)'", js))
    assert rotas == {"peso-setores", "setor-concluido", "expedicao", "senha-liberacao"}, (
        "as rotas do agente mudaram: " + ", ".join(sorted(rotas))
    )


def test_o_campo_do_peso_do_setor_continua_de_pe():
    """"nada disso invalida o campo ja existente onde precisa informar o peso
    total do setor" -- as palavras do usuario, 23/08/2026."""
    js = _ler("frontend/acabamento.js")

    i = js.index("function boxDePesos(")
    corpo = js[i:js.index("\n    }", i)]
    assert 'id="acab-peso-${setor}"' in corpo, "o campo do peso por setor continua no box"
    assert "AcabamentoPainel.mudarPeso(" in corpo, "e continua gravando pelo caminho de sempre"
    assert "faixaDeVolumes(setor, itens, numeroDoPedido)" in corpo, (
        "a faixa dos volumes entra ABAIXO dele, sem substitui-lo"
    )

    # E adotar a soma passa pelo `gravarPeso`, que e quem conhece a regra dos
    # 5 % e a senha de liberacao. Um atalho aqui furaria a senha.
    i = js.index("function usarSomaDosVolumes(")
    assert "gravarPeso(" in js[i:js.index("\n    }", i)]


def test_setor_sem_volume_continua_sendo_um_volume_unico():
    """O pedido simples, que e a maioria, nao pode ganhar cadastro nenhum."""
    js = _ler("frontend/acabamento.js")

    i = js.index("function faixaDeVolumes(")
    corpo = js[i:js.index("\n    }", i)]
    assert "1 volume único" in corpo, "sem volume, a tela diz o que vai acontecer"
    assert "Dividir em volumes" in corpo, "e oferece a saida na propria tela"
