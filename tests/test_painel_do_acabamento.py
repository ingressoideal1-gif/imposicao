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

    # Um perfil que ve a Producao ve o Acabamento; um que a edita, edita.
    perfis = re.findall(
        r"perm_producao_view:(true|false), perm_producao_edit:(true|false),\s*\n"
        r"\s*perm_acabamento_view:(true|false), perm_acabamento_edit:(true|false),",
        js)
    assert len(perfis) == 7, "esperava os 7 perfis espelhados, achei %d" % len(perfis)
    for pv, pe, av, ae in perfis:
        assert pv == av and pe == ae, (
            "o acabamento nao espelha a producao neste perfil: %s/%s vs %s/%s" % (pv, pe, av, ae)
        )

    # O servidor decide o que o BANCO recebe no primeiro acesso: sem as duas
    # chaves aqui, quem entra pela primeira vez nasce sem o menu novo.
    ts = _ler("supabase/functions/painel/index.ts")
    assert ts.count("perm_acabamento_view:") == 2, (
        "as duas grades padrao da Edge Function precisam da permissao nova"
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
    for tom in ("#0a2472", "#123a99", "#2b32af", "#4589d7", "#4cc8f0"):
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

    # A COR do estagio nao muda junto com o nome: ela diz estado, e o usuario
    # ja mandou devolve-la uma vez quando eu a unifiquei com a paleta.
    assert "'Pronto':        '#14301f'" in js, "a cor do ultimo estagio mudou"

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
        a.strip().strip("'").replace("TABELA_DE_SETORES", "propostas_os_setores")
        for a in alvos
    })
    assert tabelas == ["pedidos_modelos", "propostas_os_setores"], (
        "o acabamento escreve em tabela inesperada: " + ", ".join(tabelas)
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
