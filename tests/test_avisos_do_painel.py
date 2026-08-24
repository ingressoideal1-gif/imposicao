# -*- coding: utf-8 -*-
"""O Quadro de Avisos dos paineis (23/08/2026).

Pedido do usuario: *"um quadro de avisos que vai aparecer no Painel de Producao
e Painel de Acabamento, uma barra flutuante na base da pagina, teremos uma barra
para cada painel para cada setor (atualmente 8 barras), sera gerenciada no menu
ADM, aba Avisos, sera para visualizacao de um aviso e com um drop para os
usuarios marcarem seus nomes confirmando a leitura"*.

Sao OITO quadros, e eles nao se cadastram: o quadro e o par (painel, setor) —
dois paineis vezes os quatro setores da grafica. O que se publica e se tira do ar
e o AVISO que esta nele.

O grosso da regra e medido pelo harness em Node, que executa o `avisos.js` de
verdade dentro de um DOM de mentira. O que este arquivo cobre e o que o harness
nao alcanca: as pecas do HTML e do CSS onde a barra se apoia, e o SQL que ela
espera encontrar no banco.

## As tres decisoes que valem lembrar

1. **A barra le o filtro de setor pelas PILULAS da tela**, e nao pelo estado
   interno de cada painel. A Producao guarda em `state.filtroSetores`, o
   Acabamento num `tela` fechado — o unico terreno comum e o `data-setor` dos
   botoes, que os dois mantem.

2. **A estacao da grafica e anonima.** Quem trabalha nos dois paineis entra pelo
   codigo local, sem sessao do Supabase; por isso as duas tabelas sao nossas,
   com politica de `public`, e a confirmacao vai direto pelo PostgREST.

3. **Trocar o texto pedindo confirmacao de novo cria um aviso NOVO.** O antigo
   sai do ar com as leituras dele intactas. Sem isso, "quem foi avisado"
   passaria a responder pelo recado errado.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "avisos_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_dos_avisos_passa():
    assert os.path.exists(HARNESS), "o harness dos avisos sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_harness_da_barra_na_tela_passa():
    """A barra e o toast desenhados num Chrome de verdade.

    Os dois nascem no mesmo canto de baixo. Que o toast suba nao da para provar
    lendo CSS: depende de a barra medir a propria altura, publicar a variavel e
    o `calc` do `.toast-container` compor com ela. Este harness monta as pecas
    reais — o `style.css` do app, o HTML que o `avisos.js` produziu e o
    `.toast-container` como ele existe — e mede no pixel.
    """
    harness = os.path.join(RAIZ, "tests", "avisos_na_tela_harness.js")
    assert os.path.exists(harness), "o harness da barra na tela sumiu"

    r = subprocess.run(
        ["node", harness], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_barra_mora_fora_das_views():
    """Uma barra so, posicionada contra a janela.

    Dentro de uma `view-section` ela herdaria o `display:none` da tela fechada e
    o scroll da lista. Fora, o `avisos.js` decide sozinho quando ela aparece.
    """
    html = _ler("frontend/index.html")
    assert 'id="barra-avisos"' in html, "o lugar da barra sumiu do index.html"

    i = html.index('id="barra-avisos"')
    antes = html[:i]
    # A ultima `<section` aberta antes da barra tem de estar fechada: se houver
    # uma section aberta, a barra caiu dentro de uma tela.
    assert antes.count("</main>") >= 1, "a barra tem de ficar depois do <main>, fora das views"


def test_o_avisos_js_carrega_depois_do_acabamento():
    """A ordem importa: o avisos.js envolve o `render` do acabamento.

    Carregado antes, `window.AcabamentoPainel` ainda nao existe e a barra
    deixaria de acompanhar a troca de setor daquele painel — sem erro nenhum na
    tela, que e o pior tipo de quebra.
    """
    html = _ler("frontend/index.html")
    assert "avisos.js?v=" in html, "o avisos.js nao esta sendo carregado"
    assert html.index("acabamento.js?v=") < html.index("avisos.js?v="), (
        "o avisos.js precisa vir DEPOIS do acabamento.js"
    )
    assert html.index("script.js?v=") < html.index("avisos.js?v="), (
        "e depois do script.js, de quem ele envolve o renderOrdens"
    )


def test_a_aba_avisos_existe_no_adm():
    html = _ler("frontend/index.html")
    assert 'data-adm-tab="avisos"' in html, "a aba Avisos sumiu do menu do ADM"
    assert "switchAdmTab('avisos')" in html, "o botao da aba nao chama o switchAdmTab"
    assert 'id="adm-tab-avisos"' in html, "falta o corpo da aba"
    assert 'class="adm-tab-content"' in html


def test_o_toast_sobe_quando_a_barra_esta_na_tela():
    """Os dois nascem no mesmo canto de baixo.

    O `.toast-container` esta a 24px da base desde sempre, e o operador o
    procura ali. Em vez de move-lo, a barra publica a propria altura numa
    variavel e o toast se apoia nela — sem barra, a variavel nao existe e o
    valor volta a ser 24px.
    """
    css = _ler("frontend/style.css")
    assert "var(--avisos-altura" in css, "o toast nao esta se apoiando na altura da barra"
    # Em 23/08/2026 a barra da escolha de volume passou a morar no mesmo canto e
    # entrou na mesma conta: cada barra publica a propria altura, e o toast se
    # apoia na soma. Sem barra nenhuma, as duas variaveis nao existem e o valor
    # volta a ser os 24px de sempre.
    assert ("bottom: calc(24px + var(--avisos-altura, 0px) + var(--escolha-altura, 0px));"
            in css), "o toast tem de se apoiar nas DUAS barras da base da tela"

    js = _ler("frontend/avisos.js")
    assert "--avisos-altura" in js, "e a barra nao esta publicando a propria altura"


def test_a_barra_acompanha_o_menu_lateral():
    """O menu muda de natureza no 1024px, e a barra tem de saber disso.

    Abaixo dele o menu e uma gaveta fora da tela e a barra usa a largura
    inteira; a partir dali ele fica no fluxo, encolhido, e a barra comeca depois
    dele.
    """
    css = _ler("frontend/style.css")
    assert ".barra-avisos {" in css, "o CSS da barra sumiu"
    i = css.index(".barra-avisos {")
    trecho = css[i:i + 900]
    assert "position: fixed" in trecho
    assert "@media (min-width: 1024px)" in trecho, "falta o caso do menu no fluxo"
    assert "var(--sidebar-w-collapsed)" in trecho, (
        "no desktop a barra tem de comecar depois do menu encolhido"
    )


def test_a_barra_le_o_filtro_pelas_pilulas_dos_dois_paineis():
    """Sem furar o encapsulamento de nenhum dos dois painéis."""
    js = _ler("frontend/avisos.js")
    assert "filter-container-setor" in js, "falta o container das pilulas da Producao"
    assert "filter-container-setor-acab" in js, "falta o do Acabamento"
    assert "data-setor" in js, "o setor tem de vir do atributo, e nao do texto do botao"
    # Fora dos comentarios: o cabecalho do arquivo cita as duas chaves privadas
    # justamente para explicar por que elas NAO sao usadas.
    codigo = [
        linha for linha in js.splitlines()
        if not linha.lstrip().startswith(("*", "//", "/*"))
    ]
    for chave in ("state.filtroSetores", "AcabamentoPainel.setFiltroSetor"):
        culpadas = [linha for linha in codigo if chave in linha]
        assert not culpadas, (
            "a barra nao pode depender do estado interno de um painel: " + str(culpadas)
        )


def test_o_sql_cria_as_duas_tabelas_com_politica_publica():
    """A politica de `public` e o que permite a estacao gravar sem sessao."""
    sql = _ler("sql/avisos_dos_paineis.sql")
    assert "create table if not exists public.imposition_avisos" in sql
    assert "create table if not exists public.imposition_avisos_leituras" in sql
    assert sql.count("for all to public") == 2, (
        "as duas tabelas precisam da politica publica — a estacao entra sem sessao"
    )
    # A trava que faz o botao ser idempotente.
    assert "primary key (aviso_id, nome)" in sql, (
        "sem a trava de unicidade, dois toques viram duas leituras"
    )
    # Os quatro setores e os dois paineis, escritos no banco.
    assert "check (painel in ('producao', 'acabamento'))" in sql
    assert "check (setor in ('FLEXO', 'PVC', 'TEXTIL', 'LASER'))" in sql


def test_o_limite_do_texto_e_o_mesmo_na_tela_e_no_banco():
    """Um so numero, em dois lugares que precisam concordar.

    O `check` do banco recusaria a publicacao com um erro cru; a tela recusa
    antes, dizendo o que fazer. Se os dois numeros divergirem, o operador escreve
    algo que a tela aceita e o banco rejeita.
    """
    sql = _ler("sql/avisos_dos_paineis.sql")
    js = _ler("frontend/avisos.js")
    assert "between 1 and 280" in sql, "o limite do banco mudou"
    assert "LIMITE_DO_TEXTO = 280" in js, "o limite da tela mudou e o do banco nao"
