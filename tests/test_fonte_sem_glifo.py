# -*- coding: utf-8 -*-
"""O caractere que a fonte nao desenha — a tela mentia, o papel saia furado.

## O defeito

Quando falta um caractere na fonte, o NAVEGADOR troca de fonte so naquele
caractere, em silencio, e a tela mostra o nome inteiro. O PyMuPDF nao faz isso:
desenha o que a fonte tem e deixa o vao. Mesmo dado, mesma fonte, dois
resultados — e o unico que alguem ve antes de imprimir e o que mente.

Medido em 25/08/2026 no pedido 21146 (credenciais do FITNP/FIDAF): a Gotham Book
nao tem `ř`, `ě` nem `č`. A amostra que o cliente APROVOU mostra "Ondřej Pek"; o
PDF gerado com a mesma fonte volta "Ond ej Pek". Oito dos dez nomes tchecos
daquele modelo sairiam furados.

E ja tinha acontecido: o pedido 20495, mesma cliente e mesmo evento, imprimiu 185
credenciais em 11/08 com as mesmas fontes e os mesmos nomes, e dois modelos
voltaram REPROVADA_CLIENTE. O 21146 e o retrabalho deles.

Varrendo o acervo: 7 das 19 numeracoes com banco imprimiriam buraco. E das 273
fontes ativas do catalogo, 173 nao conseguem imprimir aquela planilha — as que
conseguem sao quase todas fontes do Windows.

## As quatro camadas

1. `frontend/fonte-glifos.js` le a tabela `cmap` do proprio arquivo e diz quais
   caracteres a fonte tem. Conferido contra o `has_glyph` do PyMuPDF nas 273
   fontes reais do catalogo: 271 identicas, 2 ilegiveis (que viram
   "desconhecida" e nao acusam ninguem).
2. `fonteSemGlifoDoModelo` TRANCA o PRONTO do card, como a regra de celulas e a
   de banco incompleto — o pedido so vira "Enviar Arte" com todos PRONTO.
3. A previa passa a mostrar o buraco (`comoSaiNoPapel` no `texto-ajuste.js`),
   no traco E na medida: o `ř` emprestado tem uma largura, o vao do papel tem
   outra, e e a medida que decide o shrink e a quebra de linha.
4. O motor grita no log (`_avisar_glifos_faltando`) — ultima defesa, para o
   caminho que nao passa pela tela.

A REGRA DE OURO, testada em toda parte: fonte que nao deu para ler NAO ACUSA
ninguem. Uma trava falsa pararia a grafica por causa de um arquivo que o leitor
nao entendeu, e isso e pior do que o defeito que ela conserta.
"""
import io
import os
import re
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "fonte_glifos_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


# ── 1. O leitor de glifos ───────────────────────────────────────────────────

def test_o_harness_do_fonte_glifos_passa():
    assert os.path.exists(HARNESS), "o harness do fonte-glifos sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_estacao_serve_o_fonte_glifos():
    """Fora da `PAINEL_ARQUIVOS`, a estacao serviria as tres paginas pedindo um
    script que da 404 — e a trava sumiria EM SILENCIO: nenhum erro na tela, so o
    modelo voltando a virar PRONTO e o `ř` sumindo no papel."""
    py = _ler("security_config.py")
    i = py.index("PAINEL_ARQUIVOS = [")
    j = py.index("]", i)
    assert '"fonte-glifos.js"' in py[i:j], (
        "fonte-glifos.js nao esta na PAINEL_ARQUIVOS do security_config.py"
    )


@pytest.mark.parametrize("pagina", ["frontend/index.html", "frontend/cliente.html",
                                    "frontend/producao.html"])
def test_as_tres_paginas_carregam_o_fonte_glifos_antes_de_quem_desenha(pagina):
    """Ele precisa existir antes do `texto-ajuste.js` e do `script.js`: os dois
    perguntam por `mapaDeCoberturas`. Chegando depois, a primeira pintura sai
    sem a verdade — e canvas nao reflui."""
    html = _ler(pagina)

    def _tag(nome):
        """A posicao da TAG <script src=...>, e nao a primeira mencao ao nome —
        `script.js` aparece em comentario no meio do HTML da producao.html."""
        m = re.search(r'<script src="[^"]*' + re.escape(nome) + r'[^"]*"', html)
        return m.start() if m else None

    i_glifos = _tag("fonte-glifos.js")
    assert i_glifos is not None, pagina + " nao carrega o fonte-glifos.js"
    for consome in ("texto-ajuste.js", "script.js"):
        i = _tag(consome)
        if i is not None:
            assert i_glifos < i, (
                pagina + ": o fonte-glifos.js precisa vir antes do " + consome
            )


# ── 2. A trava do card ──────────────────────────────────────────────────────

def test_a_regra_do_glifo_existe_e_esta_exposta():
    js = _ler("frontend/script.js")
    assert "function fonteSemGlifoDoModelo(item, coberturas)" in js, (
        "fonteSemGlifoDoModelo nao tem a assinatura (item, coberturas) — o segundo"
        " parametro e o que a deixa pura e testavel"
    )
    assert "window.fonteSemGlifoDoModelo" in js, "fonteSemGlifoDoModelo nao esta em window"
    assert "window.fontesDosModelosDoPedido" in js, "fontesDosModelosDoPedido nao esta em window"


def test_a_regra_do_glifo_nao_acusa_com_cobertura_desconhecida():
    """A regra de ouro, no codigo: sem mapa a funcao devolve null antes de olhar
    o modelo, e elemento com cobertura `null` e pulado."""
    js = _ler("frontend/script.js")
    i = js.index("function fonteSemGlifoDoModelo(item, coberturas)")
    corpo = js[i:js.index("\nwindow.fonteSemGlifoDoModelo", i)]
    assert "if (!mapa || !faltamNaFonte) return null;" in corpo, (
        "sem o mapa de coberturas a funcao precisa devolver null"
    )
    assert "if (!cob) return;" in corpo, (
        "elemento com cobertura desconhecida precisa ser pulado, nao acusado"
    )


def test_o_botao_pronto_do_card_trava_no_glifo():
    js = _ler("frontend/script.js")
    assert "const semGlifo = ehTelaDoCliente ? null : fonteSemGlifoDoModelo(item);" in js, (
        "o card nao chama fonteSemGlifoDoModelo"
    )
    assert "const travaDeGlifo = !!semGlifo;" in js, "falta a travaDeGlifo"
    assert "travaDeCelulas || travaDeBanco || travaDeGlifo ? 'disabled' : ''" in js, (
        "o botao PRONTO nao considera a trava de glifo"
    )
    assert "${faixaSemGlifo}" in js, "a faixa de aviso nao foi desenhada no card"


def test_a_trava_do_glifo_nao_vale_no_link_do_cliente():
    """Travar o cliente seria travar justamente quem nao tem como consertar a
    numeracao — a mesma regra das duas travas que ja existiam."""
    js = _ler("frontend/script.js")
    assert "ehTelaDoCliente ? null : fonteSemGlifoDoModelo(item)" in js, (
        "a trava de glifo precisa ser nula na tela do cliente"
    )


def test_o_pronto_e_o_lote_tambem_recusam():
    """O botao ja nasce desabilitado, mas o lote entra por `planoDaAcaoEmLote` e
    o caminho por modelo por `decisionAmostraItem`. Botao escondido sem funcao
    que recusa e metade da regra."""
    js = _ler("frontend/script.js")
    assert "const semGlifo = fonteSemGlifoDoModelo(itemAlvo);" in js, (
        "decisionAmostraItem nao confere o glifo antes de gravar PRONTO"
    )
    assert "divergencia(item) || bancoIncompleto(item) || semGlifo(item) || null" in js, (
        "planoDaAcaoEmLote nao considera o glifo entre os motivos"
    )
    assert "semGlifo: item => {" in js, "o ctx do lote nao passa a funcao semGlifo"


def test_a_faixa_do_card_diz_o_que_fazer():
    """Toda trava precisa oferecer, na propria tela, a saida dela."""
    js = _ler("frontend/script.js")
    i = js.index("const faixaSemGlifo =")
    faixa = js[i:js.index("`;", i)]
    assert "na tela o nome aparece inteiro, no papel sai com buraco" in faixa, (
        "a faixa precisa explicar POR QUE a tela nao mostrou o problema"
    )
    assert "troque a fonte do elemento" in faixa, "a faixa nao diz o que fazer"


# ── 3. A previa que mostra o buraco ─────────────────────────────────────────

def test_a_previa_desenha_o_texto_como_sai_no_papel():
    js = _ler("frontend/texto-ajuste.js")
    assert "function comoSaiNoPapel(texto, el)" in js, "falta o comoSaiNoPapel"
    assert "ajustarTextoNaLargura(medir, comoSaiNoPapel(label, el), fsBase, maxPx, modo)" in js, (
        "o desenharTextoAjustado precisa passar o texto JA traduzido — se a"
        " traducao viesse depois do ajuste, a MEDIDA continuaria a do navegador"
        " e o shrink/quebra sairiam diferentes do papel"
    )


def test_o_editor_pre_carrega_as_fontes_dos_elementos_certos():
    """`state.elements` nunca existiu no state: `fontesDosElementos` recebia
    undefined e o pre-carregamento inteiro era letra morta. E por ele que a
    cobertura de glifos chega ao editor."""
    js = _ler("frontend/script.js")
    assert "fontesDosElementos(state.numElements)" in js, (
        "o drawPreview precisa ler state.numElements"
    )
    assert "fontesDosElementos(state.elements)" not in js, (
        "sobrou o state.elements, que nao existe"
    )


def test_a_espera_das_fontes_tambem_espera_a_cobertura():
    """Ter a fonte no ar nao basta: sem a cobertura, a previa desenha o
    caractere emprestado de outra fonte e volta a mentir."""
    js = _ler("frontend/fonte-canvas.js")
    i = js.index("async function garantirFontesCarregadas(nomes)")
    corpo = js[i:js.index("\n    }", js.index("return novas;", i))]
    assert "escopo.garantirCoberturas" in corpo, (
        "garantirFontesCarregadas nao pede a cobertura de glifos"
    )
    assert "novasCoberturas" in corpo, (
        "a cobertura nova precisa entrar no retorno, senao ninguem redesenha"
    )


# ── 4. O motor ─────────────────────────────────────────────────────────────

def test_o_motor_avisa_no_log_e_nao_levanta(capsys):
    """Ultima defesa: pega o caminho que nao passa pela tela (hotfolder,
    reimpressao, API). Usa a Base-14 `helv`, que escreve em WinAnsi — sem rede,
    sem arquivo, e com exatamente a mesma fronteira da Gotham."""
    import engine

    engine._font_log_cache.clear()
    engine._glyph_font_cache.clear()
    engine._avisar_glifos_faltando("helv", "Helvetica", "Ondřej Pek")

    texto = capsys.readouterr().out
    assert "nao desenha" in texto, "o motor nao avisou: " + texto
    assert "U+0159" in texto, "o aviso nao diz qual caractere: " + texto


def test_o_aviso_do_motor_nao_repete_e_nao_acusa_o_que_existe(capsys):
    import engine

    engine._font_log_cache.clear()
    engine._glyph_font_cache.clear()

    # Duas voltas com o mesmo caractere: uma linha so.
    engine._avisar_glifos_faltando("helv", "Helvetica", "Ondřej")
    engine._avisar_glifos_faltando("helv", "Helvetica", "Jakub Voldřich")
    # Nome que a Base-14 desenha inteiro: nenhuma linha.
    engine._avisar_glifos_faltando("helv", "Helvetica", "Klára Bláhová")

    linhas = [l for l in capsys.readouterr().out.splitlines() if "nao desenha" in l]
    assert len(linhas) == 1, "esperava um aviso so, veio: " + repr(linhas)
    assert "Bláhová" not in "\n".join(linhas), "acusou um nome que a fonte desenha"


def test_a_base14_avisa_que_o_caractere_sai_TROCADO(capsys):
    """As Base-14 não deixam vão: elas trocam. Medido — `insert_text` com `helv`
    grava "Ond·ej Pek" no lugar de "Ondřej Pek". É pior que o buraco, porque
    ninguém estranha um ponto no meio do nome.

    E é por isso que a pergunta na Base-14 é o cp1252, e não o `has_glyph`: nesta
    versão do PyMuPDF `fitz.Font(fontname='helv')` devolve uma fonte completa,
    que TEM o `ř` — mas o que vai ao PDF é a Base-14 em WinAnsi, e ali ele não
    existe como byte."""
    import engine

    engine._font_log_cache.clear()
    engine._glyph_font_cache.clear()
    engine._avisar_glifos_faltando("helv", "Helvetica", "Ondřej")

    texto = capsys.readouterr().out
    assert "TROCADO" in texto, "o aviso da Base-14 precisa dizer que o caractere é trocado: " + texto

    # A prova de que o `has_glyph` seria o oráculo errado aqui.
    import fitz
    assert fitz.Font(fontname="helv").has_glyph(0x0159), (
        "se o fitz.Font passar a recusar o ř, este caminho pode voltar a usar has_glyph"
    )


def test_a_cobertura_base14_do_javascript_e_o_cp1252():
    """O motor pergunta ao cp1252 do Python; a tela pergunta à lista fixa do
    `fonte-glifos.js`. Se as duas divergirem, a tela volta a prometer o que o
    papel não entrega — que é o defeito inteiro."""
    cps = set()
    for b in range(0x20, 0x100):
        try:
            cps.add(ord(bytes([b]).decode("cp1252")))
        except Exception:
            pass
    # Controle não conta dos dois lados (o cp1252 mapeia 0x7F em U+007F).
    cps = {c for c in cps if not (c < 0x20 or c == 0x7F or 0x80 <= c <= 0x9F)}

    script = (
        "const g=require(process.argv[1]);"
        "const cob=g.coberturaBase14('helv');const out=[];"
        "for(let c=0x20;c<=0x2200;c++) if(g.temGlifo(cob,c)) out.push(c);"
        "console.log(JSON.stringify(out));"
    )
    r = subprocess.run(
        ["node", "-e", script, os.path.join(RAIZ, "frontend", "fonte-glifos.js")],
        cwd=RAIZ, timeout=60, capture_output=True, text=True, encoding="utf-8",
    )
    assert r.returncode == 0, r.stderr
    import json
    do_js = {c for c in json.loads(r.stdout)
             if not (c < 0x20 or c == 0x7F or 0x80 <= c <= 0x9F)}

    assert do_js == cps, (
        "a cobertura Base-14 do JS não bate com o cp1252 — só no JS: %s | só no Python: %s"
        % (sorted(do_js - cps), sorted(cps - do_js))
    )


def test_o_aviso_do_motor_nunca_levanta():
    """Um erro aqui pararia uma impressao que ia sair de qualquer jeito."""
    import engine
    engine._avisar_glifos_faltando("fonte-que-nao-existe", "X", "abc")
    engine._avisar_glifos_faltando(None, None, None)
    engine._avisar_glifos_faltando("helv", "Helvetica", "ok", b"nao sou uma fonte")


def test_o_motor_chama_o_aviso_fora_do_try_do_registro():
    """Fica fora do try que protege o `insert_font`: um aviso nunca pode ser o
    motivo de cair no fallback de fonte."""
    py = _ler("engine.py")
    assert "_avisar_glifos_faltando(" in py, "o motor nao chama o aviso"

    # A chamada do desenho e a que passa `insert_kwargs["fontname"]`. Ela tem de
    # estar na indentacao do `if font_file:` (12 espacos), e nao dentro do corpo
    # dele nem do try (16 ou 20) — e a indentacao que diz em qual bloco ela mora.
    m = re.search(r'^(\s*)_avisar_glifos_faltando\(\n\s*insert_kwargs\["fontname"\]',
                  py, re.MULTILINE)
    assert m, "nao achei a chamada do aviso no caminho do desenho"
    assert len(m.group(1)) == 12, (
        "o aviso ficou dentro do `if font_file:`/try do insert_font — indentacao %d"
        % len(m.group(1))
    )


def test_o_cache_de_fonte_do_motor_carrega_a_url():
    """Era `<familia>.ttf` puro e o motor nunca rebaixava: trocar o arquivo da
    fonte no catalogo — que e justamente o conserto de "esta fonte nao tem o
    `ř`" — nao chegava a nenhuma estacao que ja tivesse a versao velha."""
    py = _ler("engine.py")
    i = py.index("safe_name = re.sub(")
    linha = py[i:py.index("\n", i)]
    assert "_sufixo" in linha, (
        "o nome do cache da fonte nao carrega a URL: " + linha.strip()
    )
    assert 'hashlib.md5(font_url.encode("utf-8"))' in py, (
        "o sufixo do cache precisa sair da URL da fonte"
    )


# ── 5. O seletor de fontes, que e a saida da trava ─────────────────────────

def test_o_seletor_diz_quais_fontes_servem():
    js = _ler("frontend/script.js")
    assert "function caracteresDoBancoDaNumeracao()" in js, (
        "falta a conta dos caracteres que o banco exige"
    )
    assert "function vereditoDaFonteSobreOBanco(nomeDaFonte, caracteres)" in js, (
        "falta o veredito por fonte"
    )
    assert "🔤 Conferir quais fontes servem" in js, (
        "falta o botao que confere o catalogo inteiro"
    )


def test_o_seletor_nao_marca_de_verde_o_que_ninguem_leu():
    """Marcar como boa uma fonte nao conferida seria a mesma mentira que este
    trabalho inteiro existe para desfazer."""
    js = _ler("frontend/script.js")
    i = js.index("const v = caracteresDoBanco ? vereditoDaFonteSobreOBanco(fullName, caracteresDoBanco) : null;")
    trecho = js[i:i + 600]
    assert "const selo = !v ? ''" in trecho, (
        "fonte sem veredito precisa sair SEM selo nenhum"
    )


def test_o_veredito_devolve_null_quando_nao_sabe():
    js = _ler("frontend/script.js")
    i = js.index("function vereditoDaFonteSobreOBanco(nomeDaFonte, caracteres)")
    corpo = js[i:js.index("\nwindow.vereditoDaFonteSobreOBanco", i)]
    assert "if (!cob) return null;" in corpo, (
        "cobertura desconhecida precisa devolver null, e nao um veredito chutado"
    )


# ── 6. O nome do modelo no chat do cliente ─────────────────────────────────

def test_o_chat_do_cliente_acha_o_item_pelo_id_em_texto():
    """O `onclick` passa o id como TEXTO e o banco devolve NUMERO: o `===` cru
    nunca achava o item, e as tres aprovacoes do 21146 viraram tres linhas
    identicas dizendo `"Produto"`. O script.js ja tinha a correcao."""
    cli = _ler("frontend/cliente.js")
    assert "state.osItens[osId].find(i => String(i.id) === String(itemId))" in cli, (
        "cliente.js ainda compara i.id === itemId"
    )
    assert re.search(r"find\(i => i\.id === itemId\)", cli) is None, (
        "sobrou uma comparacao crua de id no cliente.js"
    )
