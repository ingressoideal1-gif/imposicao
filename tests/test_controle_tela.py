# -*- coding: utf-8 -*-
"""A tela do dono, no navegador de verdade.

O que estes testes protegem não é a aparência: é que a tela não minta. Ela
mostra números que vêm do ERP e números que vêm da publicação, e o dono toma
decisão de produção olhando para eles.
"""

import json
import os
import re
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── Estrutura, sem navegador ────────────────────────────────────────────────

def test_os_tres_arquivos_estao_na_lista_que_as_estacoes_baixam():
    import security_config
    for nome in ("controle.html", "controle.js", "controle.css"):
        assert nome in security_config.PAINEL_ARQUIVOS


def test_a_pagina_carrega_o_login_compartilhado_ANTES_do_controle():
    texto = _ler("frontend/controle.html")
    assert texto.index("acesso-conta.js") < texto.index("controle.js")


def test_a_versao_dos_scripts_e_uma_so():
    versoes = set(re.findall(r'\.(?:js|css)\?v=(\d+)', _ler("frontend/controle.html")))
    assert len(versoes) == 1, f"controle.html tem versoes misturadas: {sorted(versoes)}"


def test_a_tela_nunca_explica_como_o_codigo_do_QR_e_gerado():
    """Regra do usuario: e segredo de Estado.

    A tela do dono e a que mais tenta explicar, porque e onde ele configura. Uma
    frase sobre pool, hash ou sal aqui vira documentacao publica do mecanismo.
    """
    proibidas = ["pbkdf2", "pool", "hash do codigo", "sal do evento", "iteracoes"]
    for arquivo in ("frontend/controle.html", "frontend/controle.js"):
        texto = _ler(arquivo).lower()
        for palavra in proibidas:
            assert palavra not in texto, f"{arquivo} explica o mecanismo: '{palavra}'"


# A UNICA excecao a regra do rotulo em texto, nomeada uma a uma de proposito.
#
# O `+` redondo da tela inicial nao tem palavra dentro dele, e mesmo assim nao
# obriga o dono a adivinhar coisa nenhuma: ele e o segundo alvo de toque de uma
# acao cujo rotulo, "Meus Pedidos", esta escrito na MESMA linha, doze pixels a
# esquerda. Ele existe para fechar a coluna da direita, onde cada linha de
# evento tem a sua engrenagem -- e sai da imagem que o usuario mandou.
#
# Nomeado por id, e nao liberado por `aria-label`: liberar pelo atributo
# transformaria a regra em "todo botao precisa de rotulo, menos os que nao
# tiverem", e o proximo botao so-com-icone entraria calado. Acrescentar um id
# aqui obriga quem for faze-lo a escrever por que aquele caso tambem tem a
# palavra a vista em outro lugar.
BOTOES_SEM_TEXTO_COM_MOTIVO = {
    "btn-meus-pedidos-mais": 'a barra "Meus Pedidos" esta na mesma linha, ao lado',
    # O olho dos menus gerais, pedido pelo usuario em 17/08/2026. Mora na
    # coluna da direita do cabecalho, encostado na borda -- exatamente onde a
    # engrenagem de cada evento mora --, e um rotulo em texto ali comeria a
    # largura do titulo "Ideal Control". A tela que ele abre se anuncia com
    # titulo em texto ("Eventos finalizados"), que e onde a regra do projeto
    # realmente se cumpre: o dono nao precisa adivinhar depois de tocar.
    "btn-menu-geral": "mora na coluna da direita do cabecalho, ao lado do titulo",
}


def test_todo_botao_tem_rotulo_em_texto():
    """Regra do projeto: controle novo precisa de rotulo em texto.

    Um botao so com icone obriga o dono a adivinhar, e ele esta no celular,
    talvez na porta do evento.
    """
    html = _ler("frontend/controle.html")
    for aberta, dentro in re.findall(r"<button([^>]*)>(.*?)</button>", html, re.S):
        casou = re.search(r'id="([^"]+)"', aberta)
        if casou and casou.group(1) in BOTOES_SEM_TEXTO_COM_MOTIVO:
            continue
        sem_tag = re.sub(r"<[^>]+>", "", dentro)
        letras = re.sub(r"[^A-Za-zÀ-ÿ]", "", sem_tag)
        assert len(letras) >= 3, f"botao sem rotulo em texto: {dentro.strip()[:60]}"


def test_o_botao_sem_texto_pelo_menos_se_anuncia_a_quem_nao_ve():
    """A excecao acima e sobre o rotulo VISIVEL. O rotulo acessivel continua
    obrigatorio -- sem ele, o botao e um simbolo mudo para leitor de tela."""
    html = _ler("frontend/controle.html")
    for id_ in BOTOES_SEM_TEXTO_COM_MOTIVO:
        casou = re.search(r"<button[^>]*id=\"" + id_ + r"\"[^>]*>", html)
        assert casou, f"o botao {id_} sumiu da tela; tire-o da lista de excecoes"
        assert "aria-label" in casou.group(0), f"{id_} nao tem aria-label"


def test_o_status_do_projeto_conhece_a_tela_nova():
    texto = _ler("docs/STATUS_PROJETO.md")
    assert "controle.html" in texto
    assert "ACESSO_ELEVACAO_SEGREDO" in texto


# ── A engrenagem ────────────────────────────────────────────────────────────
#
# Desde 16/08/2026 o `controle.js` faz uma coisa so: a configuracao atras de
# uma senha. A lista de eventos mudou-se para o `lista-eventos.js`, e o momento
# em que este celular vira portao, para o `virar-portao.js`.

def test_a_engrenagem_pede_email_e_senha_numa_vez_so():
    """Login relampago: uma senha faz login E libera os 15 minutos.

    Duas digitacoes no portao, com o dono de pe na frente do aparelho, e o que
    a decisao de 15/08/2026 ja proibia.
    """
    assert "entrarEElevar" in _ler("frontend/controle.js")


def test_a_engrenagem_lembra_o_email_e_NUNCA_a_senha():
    texto = _ler("frontend/controle.js")
    assert "ideal_control_email" in texto
    assert "setItem('acesso_senha" not in texto


def test_ao_fechar_a_engrenagem_a_conta_sai_do_aparelho():
    """O celular fica com o porteiro. Sessao esquecida ali entrega a conta
    inteira do cliente -- eventos, configuracao, tudo."""
    texto = _ler("frontend/controle.js")
    assert "signOut" in texto


def test_a_engrenagem_tem_os_quatro_blocos():
    texto = _ler("frontend/controle.html")
    for id_ in ("bloco-evento", "bloco-aparelhos", "bloco-setores", "bloco-este-aparelho"):
        assert 'id="' + id_ + '"' in texto


def test_da_para_inativar_o_evento_e_a_tela_avisa_o_limite():
    """Portao SEM REDE so descobre a inativacao quando sincronizar. Guardar o
    celular achando que os portoes pararam no mesmo segundo e o erro que esta
    frase evita."""
    texto = _ler("frontend/controle.js") + _ler("frontend/controle.html")
    assert "Inativar" in texto
    assert "sem internet" in texto or "sem rede" in texto


# ── O vocabulário: um evento TERMINA, ele não deixa de ter existido ─────────
#
# Decisão do usuário em 16/08/2026, corrigindo o meu termo: não é "excluir", é
# "finalizar". Apagar de verdade não existe como função desta tela — nem o
# `excluido` que o esquema conhece tem caminho aqui, de propósito.
#
# Isto é teste, e não convenção de comentário, porque a palavra errada não
# quebra nada: ela só ensina ao dono que o botão faz algo que ele não faz, e
# quem descobre a diferença é ele, depois de tocar.

TRES_PALAVRAS = ("excluir", "apagar", "remover")
TELAS_DO_CONTROLE = ("frontend/controle.html", "frontend/controle.js",
                     "frontend/lista-eventos.js")


def test_nenhuma_das_tres_telas_fala_em_excluir_apagar_nem_remover():
    for arquivo in TELAS_DO_CONTROLE:
        texto = _ler(arquivo)
        for palavra in TRES_PALAVRAS:
            achado = re.search(r"\b" + palavra + r"\b", texto, re.IGNORECASE)
            assert not achado, (
                f"{arquivo} fala em '{palavra}': " + repr(
                    texto[max(0, achado.start() - 60):achado.end() + 60])
            )


def test_o_codigo_das_telas_nao_guarda_nem_a_familia_da_palavra():
    """Mais apertado que o teste acima, e de propósito: "apagaria", "exclusão"
    e "apagado" ensinam a mesma coisa errada a quem for mexer aqui depois.

    "remov" fica de fora desta versão porque `classList.remove` e
    `localStorage.removeItem` são nomes do navegador, não palavras da nossa
    interface — a forma em português, "remover", já é proibida acima.
    """
    for arquivo in ("frontend/controle.js", "frontend/lista-eventos.js"):
        texto = _ler(arquivo).lower()
        for familia in ("apag", "exclu"):
            assert familia not in texto, f"{arquivo} tem a família '{familia}'"


def test_o_texto_que_o_dono_LE_na_tela_nao_tem_nenhuma_das_tres():
    """Lido do HTML sem as tags e sem os comentários: o que sobra é o que
    aparece na tela do celular."""
    html = re.sub(r"<!--.*?-->", " ", _ler("frontend/controle.html"), flags=re.S)
    visivel = re.sub(r"<[^>]+>", " ", html).lower()
    for familia in ("apag", "exclu", "remov"):
        assert familia not in visivel, f"a tela escreve '{familia}'"


def test_da_para_bloquear_o_setor_inteiro_com_motivo():
    texto = _ler("frontend/controle.js")
    assert "bloqueado_motivo" in texto


def test_os_portoes_de_TODOS_os_aparelhos_aparecem():
    """Decisao do usuario: todos os portoes aparecem em todos os aparelhos."""
    assert "aparelhos" in _ler("frontend/controle.js")


def test_nao_sobrou_nenhum_caminho_de_codigo():
    texto = _ler("frontend/controle.js") + _ler("frontend/controle.html")
    for proibido in ("Gerar outro código", "caixa-codigo", "Criar aparelho",
                     "caixaDePareamento", "Código deste aparelho"):
        assert proibido not in texto, f"sobrou o caminho de codigo: {proibido}"


# ── No navegador ────────────────────────────────────────────────────────────

PAINEL_FALSO = {
    "evento": {"id": "ev-1", "nome_evento": "Baile do Hawaii",
               "data_evento": None, "local_evento": "Clube"},
    # Sem `lotacao` e sem `publicadas`: o `_painel` real parou de devolver as
    # duas em 14/08/2026, e uma fixture mais generosa que o servidor deixaria
    # a tela poder ler um campo que nunca chega em producao.
    # `numero_de`/`numero_ate` sao a faixa IMPRESSA, que o `_painel` passou a
    # devolver em 15/08/2026 lendo `pedidos_modelos` do ERP. O VIP nao comeca
    # em 1 de proposito: uma fixture que so tivesse faixas 1..N nao pegaria uma
    # tela que ignorasse o inicio e escrevesse "de 0001" para todo mundo.
    "setores": [
        {"id": "s1", "nome": "PISTA", "quantidade": 5000,
         "tipo_uso": "unico", "abre_em": None, "fecha_em": None,
         "bloqueios": [], "pedido_id_int": 18560, "modelo_id": 1000110,
         "numero_de": 1, "numero_ate": 5000, "codigos_cliente": 0},
        {"id": "s2", "nome": "VIP", "quantidade": 800,
         "tipo_uso": "reentrada", "abre_em": None, "fecha_em": None,
         "bloqueios": [{"id": "b1", "setor_id": "s2", "de": 100, "ate": 150,
                        "motivo": "lote nao pago pelo PDV Centro"}],
         "pedido_id_int": 18560, "modelo_id": 1000111,
         "numero_de": 201, "numero_ate": 1000, "codigos_cliente": 42},
    ],
    "aparelhos": [{"id": "a1", "nome": "Portao A", "status": "ativo",
                   "ultimo_visto": None, "setores": ["s1"]}],
    "pedidos": [{"pedido_id_int": 18560, "publicado_em": "2026-08-14T00:00:00Z",
                 "total_credenciais": 5640}],
    "codigos_cliente": 42,
}


def _no_navegador(script_extra, aceitar_dialogo=False):
    """Abre o controle.html num Chrome de verdade, com o backend interceptado.

    O `controle.html` referencia os scripts por caminho ABSOLUTO (`/controle.js`),
    que é como o Vercel e a estação os servem. Sob `file://` isso apontaria para
    a raiz do disco, e a página carregaria vazia — sem erro nenhum, o que é o
    pior modo de falhar num teste. Por isso o driver intercepta cada pedido e
    responde com o arquivo lido de `frontend/`.

    `aceitar_dialogo=True` faz um `window.confirm`/`window.prompt` responder OK
    em vez de Cancelar. Desde 17/08/2026 NENHUM teste desta tela precisa disso:
    as caixas nativas saíram porque não respondem no aplicativo instalado, e as
    perguntas agora são DOM — o teste toca em `#btn-confirmar-sim` como o dono
    tocaria. O parâmetro fica como rede: uma página de terceiro (o SDK do
    Supabase, um `beforeunload`) ainda pode abrir diálogo, e sem tratar o evento
    o CDP prende a página esperando alguém decidir.
    """
    driver = f"""
const fs = require('fs');
const path = require('path');
const REPO = {json.dumps(RAIZ)};
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));
const PAINEL = {json.dumps(PAINEL_FALSO)};

const TIPOS = {{ '.js': 'application/javascript', '.css': 'text/css',
                '.html': 'text/html' }};

(async () => {{
  const browser = await puppeteer.launch({{ args: ['--no-sandbox'] }});
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));

  // `abrirCaixaDeSenha()` usa `window.prompt`, e o botão de revogar usa
  // `window.confirm` -- de propósito, são as únicas caixas que o navegador
  // não guarda em preenchimento automático. Sem tratar o evento `dialog`, o
  // CDP prende a página esperando alguém decidir, e o teste trava. Por
  // padrão descartamos (equivale a tocar em "Cancelar": o caminho que o
  // dono segue quando não tem a senha em mãos, ou quando desiste de
  // revogar); `aceitar_dialogo=True` inverte para "OK", para o teste que
  // precisa exercitar quem aceita a confirmação de verdade.
  page.on('dialog', dialog => {json.dumps(bool(aceitar_dialogo))}
    ? dialog.accept() : dialog.dismiss());

  // Sob `file://` a página tem origem "null", que nenhum backend real permite —
  // é um artefato só deste arnês. O backend de verdade libera CORS pela lista
  // em `security_config.ALLOWED_ORIGINS`; aqui simulamos a mesma liberação
  // para o pedido chegar como chegaria vindo de uma origem cadastrada.
  const CORS = {{ 'Access-Control-Allow-Origin': '*',
                 'Access-Control-Allow-Methods': '*',
                 'Access-Control-Allow-Headers': '*' }};

  await page.setRequestInterception(true);
  page.on('request', req => {{
    const url = req.url();

    // 16/08/2026: a tela do dono passou a falar com as Edge Functions
    // `acesso-conta` e `acesso-evento`, e nao mais com `/api/acesso` no Render.
    // O arnes intercepta pelo nome da FUNCAO: e o que este teste tem de seguir,
    // porque e o endereco que a pagina realmente chama.
    if (url.includes('/functions/v1/acesso-') && req.method() === 'OPTIONS') {{
      return req.respond({{ status: 204, headers: CORS }});
    }}
    if (url.includes('/acesso-conta/eventos/')) {{
      return req.respond({{ status: 200, contentType: 'application/json',
                           headers: CORS, body: JSON.stringify(PAINEL) }});
    }}
    if (url.includes('/acesso-conta/meus-eventos')) {{
      return req.respond({{ status: 200, contentType: 'application/json',
                           headers: CORS, body: JSON.stringify({{ eventos: [] }}) }});
    }}
    // O SDK do Supabase não é exercitado aqui: a sessão é semeada à mão. Mas o
    // `abrir()` da página roda sozinho no DOMContentLoaded e chama
    // `AcessoConta.sessao()` ANTES do `page.evaluate` do teste rodar — um
    // `supabaseClient` null quebraria esse arranque automático com um erro que
    // não existe na página real, onde o SDK sempre entrega um client, mesmo
    // sem sessão.
    if (url.includes('cdn.jsdelivr') || url.includes('supabase-config')) {{
      return req.respond({{ status: 200, contentType: 'application/javascript',
                           body: 'window.supabaseClient = {{ auth: {{ getSession: '
                               + 'async () => ({{ data: {{ session: null }} }}) }} }};' }});
    }}

    // Caminho absoluto do site vira arquivo de frontend/.
    const nome = decodeURIComponent(url.split('?')[0].split('/').pop());
    const arquivo = path.join(REPO, 'frontend', nome);
    if (nome && fs.existsSync(arquivo) && TIPOS[path.extname(nome)]) {{
      return req.respond({{ status: 200, contentType: TIPOS[path.extname(nome)],
                           body: fs.readFileSync(arquivo, 'utf8') }});
    }}
    // NADA sai daqui para a producao. O `req.continue()` abaixo cobre os
    // `file://` desta pagina; um endereco http que chegue ate aqui e um pedido
    // que ninguem simulou, e deixa-lo passar mandaria o teste falar com o
    // servidor de verdade. O `POST /portaria/leituras` desta tela e o caso
    // concreto: um 401 de la ja apagou fila no meio de uma execucao antes.
    if (url.indexOf('http') === 0) {{
      return req.abort();
    }}
    req.continue();
  }});

  await page.goto('file://' + path.join(REPO, 'frontend', 'controle.html').replace(/\\\\/g, '/'),
                  {{ waitUntil: 'networkidle0' }});
  await page.waitForFunction(() => window.Controle && window.AcessoConta);

  const saida = await page.evaluate(async () => {{
    window.supabaseClient = {{ auth: {{
      getSession: async () => ({{ data: {{ session: {{ access_token: 'jwt-de-teste' }} }} }})
    }} }};
    {script_extra}
  }});

  await browser.close();
  console.log(JSON.stringify({{ saida, erros }}));
}})();
"""
    # `encoding='utf-8'` explicito, e nao so `text=True`: sem isto, o Python
    # decodifica o stdout do Node com `locale.getpreferredencoding()`, que
    # numa maquina Windows em cp1252 troca cada acento por dois caracteres
    # errados -- silencioso, porque cp1252 aceita qualquer byte. O `console.log`
    # do driver sempre escreve UTF-8, e por isso a leitura tem de ser UTF-8 na
    # mesma moeda, nao a da configuracao regional da estacao que roda o teste.
    r = subprocess.run(["node", "-e", driver], capture_output=True,
                        encoding="utf-8", cwd=RAIZ)
    if r.returncode != 0:
        raise AssertionError(r.stderr[:800])
    resultado = json.loads(r.stdout.strip().splitlines()[-1])
    assert not resultado["erros"], resultado["erros"]
    return resultado["saida"]


def test_a_tela_desenha_setores_aparelhos_e_codigos():
    """A contagem de codigos e POR SETOR desde 15/08/2026.

    Ela morava numa secao propria no fim da tela, com um `<select>` de setor ao
    lado; o usuario tirou a janela e mandou carregar os codigos no momento
    certo. O momento certo e o "Configurar" do setor, onde o setor ja esta
    escolhido -- por isso o 42 do VIP aparece dentro do cartao do VIP.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        return {
            titulo: document.getElementById('nome-evento-titulo').textContent,
            setores: document.querySelectorAll('#setores .cartao').length,
            aparelhos: document.querySelectorAll('#aparelhos .cartao').length,
            codigos_vip: document.getElementById('codigos-total-s2').textContent,
            codigos_pista: document.getElementById('codigos-total-s1').textContent,
            secao_antiga: !!document.getElementById('codigos-total'),
            select_antigo: !!document.getElementById('codigos-setor'),
        };
    """)
    assert saida["titulo"] == "Baile do Hawaii"
    assert saida["setores"] == 2
    assert saida["aparelhos"] == 1
    assert "42" in saida["codigos_vip"]
    assert "0" in saida["codigos_pista"]
    # A janela global saiu inteira: contador e seletor de setor.
    assert saida["secao_antiga"] is False
    assert saida["select_antigo"] is False


def test_o_setor_mostra_a_quantidade_contratada_EM_TEXTO():
    """O VIP contratou 800 ingressos, e esse numero E a lotacao do setor.

    Ele aparece em texto e nao so como numero solto: "800" sozinho nao diz ao
    dono o que esta contando. Formatado em pt-BR, porque e assim que o resto da
    tela escreve numero.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const vip = document.querySelectorAll('#setores .cartao')[1];
        return { texto: vip.textContent.replace(/\\s+/g, ' ') };
    """)
    assert "800 ingressos contratados" in saida["texto"]
    assert "VIP" in saida["texto"]


def test_o_setor_mostra_a_FAIXA_impressa_com_zeros_a_esquerda():
    """Pedido do usuario, 15/08/2026: "CAMAROTE / 400 ingressos contratados -
    de 0005 a 0500".

    So a quantidade nao identifica o lote: dois setores de 400 sao iguais na
    tela, e o que o dono tem na mao para conferir e um ingresso com um numero
    escrito. Com zeros a esquerda porque e assim que o numero sai no papel --
    "de 201 a 1000" mandaria o dono procurar um ingresso "201" que nao existe.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const linha = i => document.querySelectorAll('#setores .cartao')[i]
                             .querySelector('.contratado').textContent;
        const antes = { pista: linha(0), vip: linha(1) };

        // O exemplo literal do usuario: um setor cujo ultimo numero tem TRES
        // digitos. Sem o piso de quatro, a tela escreveria "de 005 a 500" para
        // um ingresso que esta impresso "0005".
        Controle.estado.painel.setores[1].numero_de = 5;
        Controle.estado.painel.setores[1].numero_ate = 500;
        Controle.desenhar();
        return { antes, curto: linha(1) };
    """)
    assert "5.000 ingressos contratados" in saida["antes"]["pista"]
    assert "de 0001 a 5000" in saida["antes"]["pista"]
    # O VIP nao comeca em 1: a tela tem de mostrar o INICIO de verdade.
    assert "800 ingressos contratados" in saida["antes"]["vip"]
    assert "de 0201 a 1000" in saida["antes"]["vip"]
    # E o piso de quatro digitos, que e como o numero sai no papel.
    assert "de 0005 a 0500" in saida["curto"]


def test_setor_sem_faixa_cadastrada_nao_inventa_numero():
    """Modelo sem faixa no ERP fica sem a linha. "de 0000 a 0000" seria um
    numero que nao existe em ingresso nenhum, e o dono iria procura-lo."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.painel.setores[0].numero_de = null;
        Controle.estado.painel.setores[0].numero_ate = null;
        Controle.desenhar();
        return { pista: document.querySelector('#setores .contratado').textContent };
    """)
    assert saida["pista"].strip() == "5.000 ingressos contratados"
    assert "de " not in saida["pista"]


def test_o_setor_diz_que_sem_data_e_hora_ja_esta_valendo():
    """Pedido do usuario, 15/08/2026: "Se nao configurar Data e Hora ja esta
    valendo".

    O titulo dizia "(vazio = sempre)" entre parenteses, e o dono lia aquilo
    como instrucao do que ele PRECISA preencher -- justamente no caso comum,
    que e a festa de uma noite so, sem horario de corte.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('setor-configurar-s1').click();
        return { texto: document.getElementById('setor-config-s1')
                          .textContent.replace(/\\s+/g, ' ') };
    """)
    assert "não configurar data e hora" in saida["texto"]
    assert "já está valendo" in saida["texto"]


def test_a_quantidade_impressa_nao_e_editavel():
    """Quem manda na tiragem e o ERP."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const campos = [...document.querySelectorAll('#setores input')].map(i => i.id);
        return { campos };
    """)
    assert not any("quantidade" in c for c in saida["campos"])


def test_sem_elevacao_a_tela_anuncia_que_esta_somente_leitura():
    """Uma tela que aceita o toque e nao grava e pior que uma que se declara."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        return {
            somenteLeitura: document.body.classList.contains('somente-leitura'),
            aviso: (document.getElementById('aviso-leitura').textContent || '').trim(),
        };
    """)
    assert saida["somenteLeitura"] is True
    assert len(saida["aviso"]) > 10


def test_somente_leitura_desabilita_os_campos_de_verdade():
    """A opacidade em CSS so avisa aos olhos.

    Sem `disabled`, o campo aceita o toque e nao grava nada -- a mesma
    armadilha que o cabecalho do arquivo condena. O dono muda o uso do
    ingresso, ve o radio marcar, e nada persiste.

    O botao "Configurar" fica de FORA da trava de proposito: abrir o painel e
    so mostrar, e travar isso esconderia do dono qual uso o setor tem hoje ate
    ele digitar a senha. Quem recusa o toque sao os radios la dentro.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const semSenha = {
            nome: document.getElementById('campo-nome-evento').disabled,
            uso: document.getElementById('uso-s1-unico').disabled,
            configurar: document.getElementById('setor-configurar-s1').disabled,
            gravar: document.getElementById('btn-gravar-evento').disabled,
            elevar: document.getElementById('btn-elevar').disabled,
        };
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const comSenha = {
            nome: document.getElementById('campo-nome-evento').disabled,
            uso: document.getElementById('uso-s1-unico').disabled,
            gravar: document.getElementById('btn-gravar-evento').disabled,
        };
        return { semSenha, comSenha };
    """)
    assert saida["semSenha"]["nome"] is True
    assert saida["semSenha"]["uso"] is True
    assert saida["semSenha"]["configurar"] is False
    assert saida["semSenha"]["gravar"] is True
    assert saida["semSenha"]["elevar"] is False
    assert saida["comSenha"]["nome"] is False
    assert saida["comSenha"]["uso"] is False
    assert saida["comSenha"]["gravar"] is False


def test_a_faixa_de_configuracao_some_de_verdade_sem_elevacao():
    """A faixa ambar dizia "Modo configuracao" o tempo TODO, inclusive em modo
    leitura -- e ainda oferecia "Sair do modo configuracao".

    A causa e de especificidade, nao de logica: `desenharFaixa()` poe a classe
    `sumindo` certinho, mas `.sumindo { display: none }` (0,1,0) perde para
    `#faixa-elevacao { display: flex }` (1,0,0), e o navegador ignora o none em
    silencio. Nenhum teste pegava porque todos perguntavam pela CLASSE, que
    estava la, em vez de perguntar se o elemento sumiu.

    Por isso este teste le o estilo COMPUTADO, e varre todo elemento que usa
    `sumindo` -- a proxima regra de id com `display` cairia na mesma armadilha.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const visiveis = [...document.querySelectorAll('.sumindo')]
            .filter(el => getComputedStyle(el).display !== 'none')
            .map(el => el.id || el.className);
        return {
            visiveis,
            faixaTemAClasse: document.getElementById('faixa-elevacao')
                .classList.contains('sumindo'),
        };
    """)
    assert saida["faixaTemAClasse"] is True
    assert saida["visiveis"] == []


def test_a_faixa_de_configuracao_mostra_o_tempo_e_um_botao_de_sair():
    """Uma trava que se desarma calada e pior que trava nenhuma."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const faixa = document.getElementById('faixa-elevacao');
        return {
            visivel: !faixa.classList.contains('sumindo'),
            texto: faixa.textContent.replace(/\\s+/g, ' ').trim(),
            temBotaoSair: !!document.getElementById('btn-sair-config'),
            somenteLeitura: document.body.classList.contains('somente-leitura'),
        };
    """)
    assert saida["visivel"] is True
    assert "14" in saida["texto"] or "15" in saida["texto"]
    assert saida["temBotaoSair"] is True
    assert saida["somenteLeitura"] is False


def test_sair_da_configuracao_apaga_a_elevacao_na_hora():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.sairDaConfiguracao();
        return {
            elevacao: Controle.estado.elevacao,
            somenteLeitura: document.body.classList.contains('somente-leitura'),
            guardado: sessionStorage.getItem('acesso_elevacao'),
        };
    """)
    assert saida["elevacao"] is None
    assert saida["somenteLeitura"] is True
    assert saida["guardado"] is None


def test_elevacao_vencida_nao_conta_como_elevada():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) - 1 };
        Controle.desenhar();
        return { elevado: Controle.elevado(),
                 somenteLeitura: document.body.classList.contains('somente-leitura') };
    """)
    assert saida["elevado"] is False
    assert saida["somenteLeitura"] is True


def test_elevacao_vencida_no_meio_da_edicao_NAO_perde_o_que_foi_digitado():
    """O caso que faz o cliente desistir da tela.

    A gravacao volta 401, a tela pede a senha, e repete a MESMA gravacao. O que
    estava na caixa de texto continua la o tempo todo.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('campo-nome-evento').value = 'Nome que eu digitei';

        // A primeira gravacao volta 401 de elevacao vencida.
        let tentativas = 0;
        Controle._pedirParaTeste = async () => {
            tentativas++;
            if (tentativas === 1) {
                const e = new Error('venceu');
                e.status = 401;
                e.corpo = { codigo: 'elevacao_expirada' };
                throw e;
            }
            return { ok: true };
        };
        Controle._pedirSenhaParaTeste = async () => {
            Controle.estado.elevacao = { token: 'novo',
                                         expira_em: Math.floor(Date.now()/1000) + 900 };
        };

        const r = await Controle.gravar('/eventos/ev-1', { nome_evento: 'x' }, 'PATCH');
        return {
            ok: !!r.ok,
            tentativas,
            digitado: document.getElementById('campo-nome-evento').value,
        };
    """)
    assert saida["ok"] is True
    assert saida["tentativas"] == 2
    assert saida["digitado"] == "Nome que eu digitei"


def test_falha_de_rede_avisa_e_mantem_o_que_foi_digitado():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('campo-nome-evento').value = 'Nome que eu digitei';
        Controle._pedirParaTeste = async () => { throw new TypeError('Failed to fetch'); };
        let erro = null;
        try { await Controle.gravar('/eventos/ev-1', { nome_evento: 'x' }, 'PATCH'); }
        catch (e) { erro = e.message; }
        return {
            erro,
            aviso: document.getElementById('aviso-gravacao').textContent,
            digitado: document.getElementById('campo-nome-evento').value,
        };
    """)
    assert saida["digitado"] == "Nome que eu digitei"
    assert len(saida["aviso"]) > 10


def test_gravar_com_sucesso_anuncia_que_gravou():
    """Regra do projeto: o que o sistema faz sozinho se anuncia."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle._pedirParaTeste = async () => ({ ok: true });
        await Controle.gravar('/eventos/ev-1', { nome_evento: 'x' }, 'PATCH');
        return { aviso: document.getElementById('aviso-gravacao').textContent };
    """)
    assert "grav" in saida["aviso"].lower()


def test_cancelar_o_pedido_de_senha_avisa_e_nao_perde_o_que_foi_digitado():
    """O caso que a revisao pegou: cancelar nao e o mesmo que errar a senha,
    nem que ficar sem rede -- os outros dois ja tem frase propria, essa era a
    que faltava. Sem aviso, o dono guarda o celular achando que gravou.

    Nao substitui `_pedirSenhaParaTeste`: o teste toca no "Cancelar" da caixa
    DE VERDADE, para exercitar o caminho real de `abrirCaixaDeSenha()` e nao
    uma simulacao dele.

    Ate 17/08/2026 quem cancelava era o driver, descartando um `window.prompt`.
    A caixa nativa saiu porque no aplicativo instalado ela nao responde -- e a
    elevacao vence no meio de uma gravacao justamente quando o dono esta no
    portao, que e onde ele usa o aplicativo instalado."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('campo-nome-evento').value = 'Nome que eu digitei';

        Controle._pedirParaTeste = async () => {
            const e = new Error('venceu');
            e.status = 401;
            e.corpo = { codigo: 'elevacao_expirada' };
            throw e;
        };

        // A gravacao NAO e esperada aqui: ela fica pendurada na caixa de senha
        // ate alguem responder. Esperar por ela antes de tocar em "Cancelar"
        // seria esperar para sempre.
        let erro = null;
        const gravando = Controle.gravar('/eventos/ev-1', { nome_evento: 'x' }, 'PATCH')
            .catch((e) => { erro = e.message; });

        await new Promise(r => setTimeout(r, 120));
        const pediu = !document.getElementById('caixa-entrar-config')
                            .classList.contains('sumindo');
        document.getElementById('btn-cancelar-entrar-config').click();
        await gravando;

        return {
            erro, pediu,
            aviso: document.getElementById('aviso-gravacao').textContent,
            digitado: document.getElementById('campo-nome-evento').value,
        };
    """)
    assert saida["pediu"] is True, "a senha nao foi pedida na propria pagina"
    assert saida["erro"] == "cancelado"
    assert len(saida["aviso"]) > 10
    assert "cancel" in saida["aviso"].lower()
    assert "digitou" in saida["aviso"].lower() or "continua" in saida["aviso"].lower()
    assert saida["digitado"] == "Nome que eu digitei"


def test_o_setor_do_aparelho_e_botao_e_nao_caixa_de_marcar():
    """Regra do usuario, 15/08/2026: "sem checkbox, cada setor e um botao".

    A caixa de marcar nao era so feia: a regra `input { width: 100% }` da folha
    a esticava por toda a linha e jogava o nome do setor para o extremo
    direito. Este teste MEDE, e nao so conta elementos -- foi a medida
    (385px x 13px, com o rotulo a 400px de distancia) que revelou o defeito.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        document.getElementById('engrenagem').classList.remove('sumindo');

        const medir = el => { const r = el.getBoundingClientRect();
                              return { w: Math.round(r.width), h: Math.round(r.height) }; };
        const botoes = [...document.querySelectorAll('#aparelho-setores-a1 button')];
        return {
            caixas_de_marcar: document.querySelectorAll(
                '[id^="aparelho-setores-"] input').length,
            rotulos: botoes.map(b => b.textContent),
            medidas: botoes.map(medir),
            largura_da_folha: Math.round(
                document.querySelector('.folha').getBoundingClientRect().width),
        };
    """)
    # Nenhuma caixa de marcar sobrou, nos dois lugares.
    assert saida["caixas_de_marcar"] == 0
    # O rotulo E o botao: o nome do setor esta no alvo do toque.
    assert saida["rotulos"] == ["PISTA", "VIP"]
    for m in saida["medidas"]:
        # Nao estica pela linha inteira -- era exatamente esse o defeito.
        assert m["w"] < saida["largura_da_folha"] * 0.7, m
        # E e um alvo de toque de verdade, nao um risco de 13px.
        assert m["h"] >= 36, m


def test_a_tranca_fica_a_vista_enquanto_o_evento_esta_so_para_olhar():
    """Foi assim que "criar aparelho" virou "nao esta funcionando".

    A explicacao de por que os botoes estao apagados morava no alto de uma
    pagina de tres telas de altura. O dono rolava ate os aparelhos, tocava num
    botao apagado, e nao acontecia nada -- sem uma palavra a vista dizendo o
    porque. `position: sticky` e o que garante que ela continue em tela.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('engrenagem').classList.remove('sumindo');
        const tranca = document.getElementById('tranca');
        const leitura = {
            visivel: !tranca.classList.contains('sumindo'),
            grudada: getComputedStyle(tranca).position,
            texto: tranca.textContent.replace(/\\s+/g, ' '),
            botao_travado: document.getElementById('btn-elevar').disabled,
            esqueci_travado: document.getElementById('btn-esqueci-config').disabled,
        };

        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        return { leitura, some_com_a_senha: tranca.classList.contains('sumindo') };
    """)
    assert saida["leitura"]["visivel"] is True
    assert saida["leitura"]["grudada"] == "sticky"
    # Os dois botoes da tranca nunca podem ser travados pela propria trava:
    # seria exigir a senha para poder digitar a senha.
    assert saida["leitura"]["botao_travado"] is False
    assert saida["leitura"]["esqueci_travado"] is False
    # E ela sai da frente assim que nao ha mais o que destrancar.
    assert saida["some_com_a_senha"] is True


def test_a_tela_nao_fala_mais_em_senha_do_dono():
    """Pedido do usuario, 15/08/2026: "Digitar a senha do dono" deve ser
    "Digitar a Senha Cadastrada", e com "esqueci minha senha".

    "A senha do dono" se lia como uma SEGUNDA senha, especial, que o cliente
    nunca recebeu -- e e a mesma com que ele acabou de entrar na tela.
    """
    html = _ler("frontend/controle.html")
    assert "Digitar a Senha Cadastrada" in html
    assert "senha do dono" not in html
    assert 'id="btn-esqueci-config"' in html

    # As DUAS frases que o dono le, lidas da tela e nao do arquivo: o aviso de
    # somente leitura e a caixa que o botao abre. Ler o fonte pegaria tambem os
    # comentarios que EXPLICAM a troca, e um teste que reprova por causa do
    # proprio comentario nao esta medindo o que o dono ve.
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('btn-elevar').click();
        await new Promise(r => setTimeout(r, 120));
        return { perguntado: document.getElementById('caixa-entrar-config').textContent,
                 aviso: document.getElementById('aviso-leitura').textContent };
    """)
    # Ate 17/08/2026 a frase era lida de dentro de um `window.prompt`. A caixa
    # nativa saiu porque nao responde no aplicativo instalado; a frase que o
    # dono le e a mesma, e agora ela e DOM que da para inspecionar.
    assert "senha do dono" not in saida["perguntado"]
    # Ate 17/08/2026 a caixa dizia "a mesma conta do Vibe". A conta continua
    # sendo a mesma; o que mudou e de quem o cliente a recebe -- ele nao cria
    # acesso em lugar nenhum, e quem libera o e-mail dele e passa a senha
    # provisoria e a grafica. "Vibe" mandava-o procurar uma senha que talvez
    # nunca tenha escolhido; "a grafica liberou" nomeia quem ele pode chamar.
    assert "a gráfica liberou" in saida["perguntado"]
    assert "Vibe" not in saida["perguntado"]
    assert "senha do dono" not in saida["aviso"]
    assert "Senha Cadastrada" in saida["aviso"]


def test_o_esqueci_da_tranca_manda_falar_com_a_grafica():
    """A saida de quem nao lembra a senha, dentro da engrenagem.

    Ate 17/08/2026 ela pedia um `resetPasswordForEmail` ao Supabase e prometia
    um link por e-mail. A promessa era falsa: o projeto nao tem SMTP, e o link
    nunca saia -- o dono esperava por uma mensagem que nao existia, que e pior
    do que nao oferecer saida nenhuma. Quem recupera e a GRAFICA, com uma senha
    provisoria nova que derruba a anterior.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste',
                                   user: { email: 'dono@exemplo.com' } };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('engrenagem').classList.remove('sumindo');

        let pedido = null;
        window.supabaseClient.auth.resetPasswordForEmail = async (email) => {
            pedido = email; return {};
        };
        document.getElementById('btn-esqueci-config').click();
        await new Promise(r => setTimeout(r, 60));
        return { pedido,
                 aviso: document.getElementById('aviso-gravacao').textContent };
    """)
    assert saida["pedido"] is None, "a tela ainda promete um e-mail que nao chega"
    assert "gráfica" in saida["aviso"]
    assert "link" not in saida["aviso"].lower()


def test_importar_codigos_quebra_o_texto_colado_em_linhas():
    """O cliente cola de uma planilha. Linha vazia nao e erro dele."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        let enviado = null;
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            enviado = JSON.parse(opcoes.body);
            return { gravados: 3 };
        };
        await Controle.importarCodigos('STAFF01\\n\\nSTAFF02\\r\\n  STAFF03  \\n', 's1');
        return enviado;
    """)
    assert saida["codigos"] == ["STAFF01", "STAFF02", "STAFF03"]
    assert saida["setor_id"] == "s1"


def test_importar_anuncia_QUANTOS_entraram():
    """Regra do projeto: importar dados tem de produzir resultado visivel."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle._pedirParaTeste = async () => ({ gravados: 3 });
        await Controle.importarCodigos('A\\nB\\nC', 's1');
        return { aviso: document.getElementById('aviso-gravacao').textContent };
    """)
    assert "3" in saida["aviso"]


def test_revogar_manda_status_revogado():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        let enviado = null;
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            enviado = { caminho, corpo: JSON.parse(opcoes.body) };
            return { ok: true };
        };
        await Controle.revogarAparelho('a1');
        return enviado;
    """)
    assert saida["caminho"] == "/aparelhos/a1"
    assert saida["corpo"]["status"] == "revogado"


def test_renomear_manda_o_nome():
    """O backend ja aceita `nome` no PATCH; faltava alguma funcao do
    frontend mandar esse campo."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        let enviado = null;
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            enviado = { caminho, corpo: JSON.parse(opcoes.body) };
            return { ok: true };
        };
        await Controle.renomearAparelho('a1', 'Portao A renomeado');
        return enviado;
    """)
    assert saida["caminho"] == "/aparelhos/a1"
    assert saida["corpo"]["nome"] == "Portao A renomeado"


def test_os_controles_do_aparelho_existem_com_rotulo_e_entram_na_trava():
    """O revisor pediu para conferir isto especificamente: um botao de
    revogar que funciona sem elevacao seria pior que a tela sem revogar
    nenhuma."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const semSenha = {
            nome: document.getElementById('aparelho-nome-a1').disabled,
            salvar: document.getElementById('aparelho-salvar-a1').disabled,
            revogar: document.getElementById('aparelho-revogar-a1').disabled,
            rotulos: {
                salvar: document.getElementById('aparelho-salvar-a1').textContent.trim(),
                revogar: document.getElementById('aparelho-revogar-a1').textContent.trim(),
            },
            // O "Gerar outro codigo" saiu em 16/08/2026 junto com todo o
            // caminho de codigo de seis caracteres.
            novoCodigo: !!document.getElementById('aparelho-novo-codigo-a1'),
        };
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const comSenha = {
            nome: document.getElementById('aparelho-nome-a1').disabled,
            salvar: document.getElementById('aparelho-salvar-a1').disabled,
            revogar: document.getElementById('aparelho-revogar-a1').disabled,
        };
        return { semSenha, comSenha };
    """)
    assert len(saida["semSenha"]["rotulos"]["salvar"]) > 3
    assert len(saida["semSenha"]["rotulos"]["revogar"]) > 3
    assert saida["semSenha"]["novoCodigo"] is False
    assert saida["semSenha"]["nome"] is True
    assert saida["semSenha"]["salvar"] is True
    assert saida["semSenha"]["revogar"] is True
    assert saida["comSenha"]["nome"] is False
    assert saida["comSenha"]["salvar"] is False
    assert saida["comSenha"]["revogar"] is False


def test_revogar_pelo_botao_pede_confirmacao_antes_de_desligar():
    """Revogar DESLIGA o aparelho na hora, no meio do evento. O toque no botao
    nao pode desligar nada sozinho.

    O teste toca em "Cancelar" na caixa de verdade, e confere que a caixa
    APARECEU antes disso. Sem essa segunda asercao ele passaria por vazio no dia
    em que a confirmacao sumisse de tela: "ninguem confirmou, logo nada foi
    enviado" e verdade tanto quando a pergunta existe quanto quando ela some."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        let chamou = false;
        Controle._pedirParaTeste = async () => { chamou = true; return { ok: true }; };
        document.getElementById('aparelho-revogar-a1').click();
        await new Promise(r => setTimeout(r, 80));
        const pergunta = document.getElementById('texto-confirmar');
        const texto = pergunta ? pergunta.textContent : null;
        if (pergunta) { document.getElementById('btn-confirmar-nao').click(); }
        await new Promise(r => setTimeout(r, 120));
        return { chamou, texto };
    """)
    assert saida["texto"], "a confirmacao nao apareceu na propria pagina"
    assert "DESLIGA o aparelho agora" in saida["texto"]
    assert saida["chamou"] is False


def test_tocar_no_setor_do_aparelho_grava_na_hora():
    """Regra do usuario, 15/08/2026: "cada setor e um botao, ao clicar ascende
    e passa a valer".

    "Passa a valer" e a metade que da para implementar pela metade: um botao
    que so acende e espera um "Salvar" deixa o dono sair da tela achando que
    configurou o portao. Dirige o clique de verdade, e nao
    `trocarSetoresDoAparelho`, porque o que se esta provando E o clique.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            return { ok: true };
        };

        // O aparelho a1 comeca validando so o setor s1; o dono toca no s2.
        const botao = document.getElementById('aparelho-setores-a1-s2');
        const antes = botao.getAttribute('aria-pressed');
        botao.click();
        await new Promise(r => setTimeout(r, 60));

        return { chamadas, antes, depois: botao.getAttribute('aria-pressed'),
                 salvo: !document.getElementById('aparelho-salvo-a1')
                            .classList.contains('sumindo') };
    """)
    # Acendeu...
    assert saida["antes"] == "false"
    assert saida["depois"] == "true"
    # ...e passou a valer, sem ninguem tocar em "Salvar".
    chamadas = [c for c in saida["chamadas"] if c["caminho"] == "/aparelhos/a1"]
    assert len(chamadas) == 1
    assert sorted(chamadas[0]["corpo"]["setores"]) == ["s1", "s2"]
    assert "nome" not in chamadas[0]["corpo"]
    # E disse que gravou: gravar sozinho nao pode ser gravar calado.
    assert saida["salvo"] is True


def test_apagar_um_setor_do_aparelho_tambem_grava_na_hora():
    """O outro sentido do mesmo botao. Um toggle que so sabe acender deixa o
    dono sem como TIRAR um setor de um portao -- e tirar e a metade perigosa,
    porque e ela que impede o aparelho da pista de liberar o camarote."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            return { ok: true };
        };
        document.getElementById('aparelho-setores-a1-s1').click();
        await new Promise(r => setTimeout(r, 60));
        return { chamadas };
    """)
    assert len(saida["chamadas"]) == 1
    assert saida["chamadas"][0]["corpo"]["setores"] == []


def test_salvar_manda_so_o_nome_quando_so_o_nome_muda():
    """O outro ramo do mesmo handler: aqui o dono so mexe no campo de nome,
    sem tocar nas caixas de setor -- `trocarSetoresDoAparelho` nao pode ser
    chamada."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        document.getElementById('aparelho-nome-a1').value = 'Portao A renomeado';

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            return { ok: true };
        };
        document.getElementById('aparelho-salvar-a1').click();
        await new Promise(r => setTimeout(r, 50));
        return { chamadas };
    """)
    assert len(saida["chamadas"]) == 1
    chamada = saida["chamadas"][0]
    assert chamada["caminho"] == "/aparelhos/a1"
    assert chamada["corpo"]["nome"] == "Portao A renomeado"
    assert "setores" not in chamada["corpo"]


def test_salvar_nao_manda_nada_quando_nada_mudou():
    """O terceiro ramo: o dono abre o formulario e clica em Salvar sem
    editar nada. Nenhum PATCH vazio."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            return { ok: true };
        };
        document.getElementById('aparelho-salvar-a1').click();
        await new Promise(r => setTimeout(r, 50));
        return { chamadas };
    """)
    assert saida["chamadas"] == []


def test_revogar_aceito_manda_status_revogado_pelo_botao():
    """O teste anterior so provava o Cancelar. Aqui o `dialog` do arnes
    ACEITA -- `page.on('dialog', d => d.accept())` -- para provar que quem
    confirma de verdade desliga o aparelho de verdade."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        let enviado = null;
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            enviado = { caminho, corpo: JSON.parse(opcoes.body) };
            return { ok: true };
        };
        document.getElementById('aparelho-revogar-a1').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 150));
        return { enviado };
    """)
    assert saida["enviado"] is not None
    assert saida["enviado"]["caminho"] == "/aparelhos/a1"
    assert saida["enviado"]["corpo"]["status"] == "revogado"


def test_o_cartao_do_setor_nao_tem_campo_de_lotacao_nem_botao_de_salvar():
    """Regra do usuario, 14/08/2026: "a lotacao sera sempre a contratada, sem
    campo para digitar lotacao nem botao de salvar".

    Le o DOM montado, e nao o texto do arquivo: um campo que sobrevivesse
    escondido atras de outro nome continuaria sendo um segundo numero que
    discorda do contrato.

    NAO conta campos por tipo. O cartao tem campos legitimos -- nome, e o "de/a"
    do bloqueio de faixa --, e uma contagem cega reprovaria a cada opcao nova de
    configuracao, sem nada a ver com lotacao. O que este teste guarda e a
    AUSENCIA da lotacao, dita de tres formas independentes.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('setor-configurar-s1').click();
        const cartao = document.getElementById('setor-configurar-s1').parentElement;
        return {
            porId: [...cartao.querySelectorAll('input, button')]
                       .map(e => e.id).filter(id => /lota|salvar/i.test(id)),
            lotacaoPorId: !!document.getElementById('lotacao-s1'),
            salvarPorId: !!document.getElementById('setor-salvar-s1'),
            texto: cartao.textContent,
        };
    """)
    assert saida["porId"] == []
    assert saida["lotacaoPorId"] is False
    assert saida["salvarPorId"] is False
    assert "lotação" not in saida["texto"].lower()
    assert "salvar" not in saida["texto"].lower()
    assert "5.000 ingressos contratados" in saida["texto"]


def test_o_cartao_do_setor_nao_mostra_mais_a_comparacao_com_o_publicado():
    """Decisao do usuario, 14/08/2026: a linha laranja saiu.

    Ela acendia sozinha pelo motivo mais banal — cada modelo publica quando e
    impresso, entao um pedido pela metade diverge legitimamente —, e mandava o
    dono "conferir com a grafica" quase sempre.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        return {
            divergentes: document.querySelectorAll('.divergente, .confere').length,
            texto: document.getElementById('setores').textContent,
        };
    """)
    assert saida["divergentes"] == 0
    assert "no ar" not in saida["texto"]
    assert "gráfica" not in saida["texto"]


def test_configurar_abre_e_fecha_o_painel_do_setor():
    """O rotulo tem de acompanhar o estado: um botao que continua dizendo
    "Configurar" com o painel ja aberto convida o dono a toca-lo de novo, e o
    proximo toque FECHA o que ele veio configurar."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const botao = document.getElementById('setor-configurar-s1');
        const painel = document.getElementById('setor-config-s1');
        const fechado = { some: painel.classList.contains('sumindo'), rotulo: botao.textContent };
        botao.click();
        const aberto = { some: painel.classList.contains('sumindo'), rotulo: botao.textContent,
                         aria: botao.getAttribute('aria-expanded') };
        botao.click();
        const defechado = { some: painel.classList.contains('sumindo'), rotulo: botao.textContent };
        return { fechado, aberto, defechado };
    """)
    assert saida["fechado"]["some"] is True
    assert saida["fechado"]["rotulo"] == "Configurar"
    assert saida["aberto"]["some"] is False
    assert saida["aberto"]["rotulo"] == "Fechar"
    assert saida["aberto"]["aria"] == "true"
    assert saida["defechado"]["some"] is True
    assert saida["defechado"]["rotulo"] == "Configurar"


def test_escolher_o_uso_grava_sozinho_sem_botao_de_salvar():
    """Nao ha botao de confirmar: escolher o radio E a gravacao.

    Manda so `tipo_uso` -- `lotacao` nao existe mais nem como campo do corpo,
    e o backend recusaria em silencio (ignora a chave) se ela voltasse.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.body) {
                chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s1').click();
        const radio = document.getElementById('uso-s1-reentrada');
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 80));
        return { chamadas };
    """)
    assert len(saida["chamadas"]) == 1
    assert saida["chamadas"][0]["caminho"] == "/setores/s1"
    assert saida["chamadas"][0]["corpo"] == {"tipo_uso": "reentrada"}


def test_escolher_o_uso_que_ja_estava_marcado_nao_grava_nada():
    """Sem esta guarda, um redesenho que remarca o radio dispararia um PATCH a
    cada vez -- e o dono que so abre o painel para olhar escreveria no banco."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.body) {
                chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s1').click();
        const radio = document.getElementById('uso-s1-unico');   // ja e o atual
        radio.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 80));
        return { chamadas };
    """)
    assert saida["chamadas"] == []


def test_o_painel_do_setor_continua_aberto_depois_de_gravar():
    """Gravar chama `carregarPainel()`, que reconstroi o cartao inteiro.

    Sem restaurar o estado aberto, o painel se fecharia no instante seguinte ao
    toque do dono -- e o "✓ salvo" apareceria dentro de um painel que ninguem
    ve mais. O aviso e procurado pelo id DEPOIS do redesenho, que e onde ele
    passa a existir.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        Controle._pedirParaTeste = async (caminho, opcoes) => ({ ok: true });
        document.getElementById('setor-configurar-s1').click();

        // Antes de gravar o aviso NAO pode estar na tela: um "✓ salvo" que ja
        // nasce aceso nao confirma nada. Estilo computado, e nao a classe --
        // foi exatamente assim que a faixa de elevacao enganou os testes.
        const antes = getComputedStyle(document.getElementById('setor-salvo-s1')).display;

        const radio = document.getElementById('uso-s1-reentrada');
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 120));

        const painel = document.getElementById('setor-config-s1');
        const aviso = document.getElementById('setor-salvo-s1');
        return {
            aberto: !painel.classList.contains('sumindo'),
            rotulo: document.getElementById('setor-configurar-s1').textContent,
            avisoAntes: antes,
            avisoDepois: aviso ? getComputedStyle(aviso).display : 'sem-elemento',
            avisoTexto: aviso ? aviso.textContent : '',
            outroFechado: document.getElementById('setor-config-s2').classList.contains('sumindo'),
        };
    """)
    assert saida["aberto"] is True
    assert saida["rotulo"] == "Fechar"
    assert saida["avisoAntes"] == "none"
    assert saida["avisoDepois"] != "none"
    assert "salvo" in saida["avisoTexto"]
    assert saida["outroFechado"] is True


def test_navegador_id_e_memorizado_quando_o_localstorage_falha_ao_escrever():
    """Achado da revisao final: sem memorizar em variavel de modulo, cada
    chamada com o localStorage bloqueado (aba anonima do iOS, quota
    estourada) sorteava um UUID NOVO. `elevar()` assina com o id A e o
    `gravar()` seguinte manda o id B -- a assinatura nunca bate, e o dono
    digita a senha certa duas vezes so para ver "digite a senha do dono"
    de novo."""
    saida = _no_navegador("""
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new Error('quota'); };
        try {
            const a = AcessoConta.navegadorId();
            const b = AcessoConta.navegadorId();
            return { a, b, iguais: a === b };
        } finally {
            Storage.prototype.setItem = original;
        }
    """)
    assert saida["iguais"] is True


def test_elevacao_ainda_viva_dispensa_a_senha_ao_reabrir_a_engrenagem():
    """IMPORTANT da revisao final: a elevacao era gravada no sessionStorage e
    nunca lida de volta, e o dono digitava a senha de novo a cada navegacao.

    Com a engrenagem, o mesmo vale dentro de uma sessao da pagina: fechar a
    configuracao de um evento e abrir a de outro nao pode cobrar a senha duas
    vezes dentro dos 15 minutos que ela ja comprou.
    """
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) + 900, evento_id: 'ev-1'
        }));
        let perguntou = false;
        window.prompt = () => { perguntou = true; return null; };
        await Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        return {
            perguntou,
            elevado: Controle.elevado(),
            somenteLeitura: document.body.classList.contains('somente-leitura'),
            engrenagemAberta: !document.getElementById('engrenagem')
                .classList.contains('sumindo'),
            listaEscondida: document.getElementById('lista')
                .classList.contains('sumindo'),
        };
    """)
    assert saida["perguntou"] is False
    assert saida["elevado"] is True
    assert saida["somenteLeitura"] is False
    assert saida["engrenagemAberta"] is True
    assert saida["listaEscondida"] is True


# -- "Entrar libera 15 minutos": a engrenagem sem senha ----------------------
#
# Decisao do usuario, 18/08/2026. O bilhete de CONTA diz que a senha do dono foi
# digitada ha pouco NESTE navegador. Ele nao abre escrita nenhuma sozinho -- o
# servidor recusa um bilhete de conta em qualquer gravacao de evento, porque a
# assinatura e recalculada sobre o id do evento e nao bate. O que ele faz e
# dispensar a DIGITACAO no `POST /eventos/{id}/elevar`, que devolve o bilhete DO
# EVENTO: o mesmo que a senha devolveria, com o mesmo prazo e as mesmas amarras.
#
# Tudo de melhor esforco: qualquer falha cai no caminho de sempre, a caixa
# pedindo a senha.

_BILHETE_DA_CONTA = """
    sessionStorage.setItem('ideal_control_elevacao_conta', JSON.stringify({
        token: 'bilhete-da-conta', expira_em: Math.floor(Date.now() / 1000) + 900 }));
    window.supabaseClient.auth.getSession = async () => ({
        data: { session: { access_token: 'jwt-de-teste' } } });
    window.__elevar = null;
    const _real = AcessoConta.pedir;
"""


def test_a_engrenagem_abre_SEM_SENHA_com_o_bilhete_de_conta():
    saida = _no_navegador(_BILHETE_DA_CONTA + """
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (caminho.endsWith('/elevar')) {
                window.__elevar = { caminho, headers: opcoes.headers,
                                    corpo: JSON.parse(opcoes.body) };
                return { token: 'bilhete-do-evento', minutos: 15,
                         expira_em: Math.floor(Date.now() / 1000) + 900 };
            }
            return _real(caminho, opcoes);
        };
        await Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        return {
            elevar: window.__elevar,
            pediuSenha: !document.getElementById('caixa-entrar-config')
                .classList.contains('sumindo'),
            engrenagemAberta: !document.getElementById('engrenagem')
                .classList.contains('sumindo'),
            elevado: Controle.elevado(),
            somenteLeitura: document.body.classList.contains('somente-leitura'),
            guardado: JSON.parse(sessionStorage.getItem('acesso_elevacao') || 'null'),
        };
    """)
    assert saida["elevar"], "a engrenagem nem tentou trocar o bilhete de conta"
    assert saida["elevar"]["caminho"] == "/eventos/ev-1/elevar"
    assert saida["elevar"]["headers"]["X-Elevacao"] == "bilhete-da-conta"
    assert saida["elevar"]["headers"]["X-Navegador"] == saida["elevar"]["corpo"]["navegador"], (
        "o navegador do cabecalho e o do corpo divergem; o servidor recusa"
    )
    assert "senha" not in saida["elevar"]["corpo"], "mandou uma senha que ninguem digitou"
    assert saida["pediuSenha"] is False, "pediu a senha dentro dos 15 minutos ja comprados"
    assert saida["engrenagemAberta"] is True
    assert saida["elevado"] is True
    assert saida["somenteLeitura"] is False
    assert saida["guardado"]["token"] == "bilhete-do-evento", (
        "guardou o bilhete DA CONTA no lugar do bilhete DO EVENTO"
    )
    assert saida["guardado"]["evento_id"] == "ev-1"


def test_o_bilhete_de_conta_recusado_cai_na_caixa_de_senha_de_sempre():
    """Bilhete vencido, evento de outra conta, rede ruim: nao ha promessa a
    quebrar, porque o dono nunca soube que esta troca foi tentada. O caminho de
    hoje continua inteiro atras dela."""
    saida = _no_navegador(_BILHETE_DA_CONTA + """
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (caminho.endsWith('/elevar')) {
                const e = new Error('senha nao confere'); e.status = 401; throw e;
            }
            return _real(caminho, opcoes);
        };
        // Sem `await`: a caixa fica na tela ate alguem tocar num botao dela.
        var indo = Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        await new Promise(r => setTimeout(r, 150));
        var medido = {
            caixaApareceu: !document.getElementById('caixa-entrar-config')
                .classList.contains('sumindo'),
            engrenagemEscondida: document.getElementById('engrenagem')
                .classList.contains('sumindo'),
            elevado: Controle.elevado(),
        };
        document.getElementById('btn-cancelar-entrar-config').click();
        await indo;
        return medido;
    """)
    assert saida["caixaApareceu"] is True, "a recusa deixou o dono sem caminho nenhum"
    assert saida["engrenagemEscondida"] is True
    assert saida["elevado"] is False


def test_sem_bilhete_de_conta_a_engrenagem_nao_tenta_elevar_calada():
    """Uma chamada a menos no 4G de quem abriu o aplicativo, e o comportamento
    de antes de 18/08/2026 intacto: sem liberacao, a caixa pede a senha."""
    saida = _no_navegador("""
        window.supabaseClient.auth.getSession = async () => ({
            data: { session: { access_token: 'jwt-de-teste' } } });
        window.__tentou = false;
        const _real = AcessoConta.pedir;
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (caminho.endsWith('/elevar')) { window.__tentou = true; }
            return _real(caminho, opcoes);
        };
        var indo = Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        await new Promise(r => setTimeout(r, 150));
        var medido = { tentou: window.__tentou,
                       caixaApareceu: !document.getElementById('caixa-entrar-config')
                           .classList.contains('sumindo') };
        document.getElementById('btn-cancelar-entrar-config').click();
        await indo;
        return medido;
    """)
    assert saida["tentou"] is False
    assert saida["caixaApareceu"] is True


def test_a_engrenagem_aberta_pelo_bilhete_de_conta_NAO_desloga_o_dono_ao_fechar():
    """A conta ja estava aberta neste aparelho antes de a engrenagem ser tocada
    -- e o celular do proprio dono. O `signOut` do `fecharEngrenagem` existe
    para a sessao relampago do celular do PORTEIRO, aquela que a caixa de senha
    abre; deslogar aqui tiraria a conta de quem nunca a emprestou."""
    saida = _no_navegador(_BILHETE_DA_CONTA + """
        window.__saiu = false;
        window.supabaseClient.auth.signOut = async () => { window.__saiu = true; return {}; };
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (caminho.endsWith('/elevar')) {
                return { token: 'bilhete-do-evento', minutos: 15,
                         expira_em: Math.floor(Date.now() / 1000) + 900 };
            }
            return _real(caminho, opcoes);
        };
        await Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        await Controle.fecharEngrenagem();
        await new Promise(r => setTimeout(r, 80));
        return { saiu: window.__saiu,
                 elevado: Controle.elevado(),
                 listaNaTela: !document.getElementById('lista').classList.contains('sumindo') };
    """)
    assert saida["saiu"] is False, "deslogou o dono do proprio celular"
    assert saida["elevado"] is False, "a elevacao do evento sobreviveu ao fechamento"
    assert saida["listaNaTela"] is True


def test_elevacao_de_um_evento_nao_libera_a_engrenagem_de_outro():
    """O bilhete de 15 minutos e assinado para UM evento -- o servidor recusa o
    do evento A numa escrita do evento B.

    Ate 17/08/2026 o `elevado()` olhava so o prazo, e isso bastava enquanto a
    unica forma de haver elevacao era o `abrirEngrenagem` grava-la para o evento
    que acabou de abrir. O `receberElevacao`, que aceita elevacao vinda de FORA
    desta tela, abriu a porta: a engrenagem do evento B abriria sem pedir senha
    nenhuma por causa de um bilhete comprado para o evento A -- e a pessoa so
    descobriria ao gravar, quando o servidor recusasse.
    """
    saida = _no_navegador("""
        Controle.receberElevacao('outro-evento', {
            token: 't', expira_em: Math.floor(Date.now()/1000) + 900
        });
        const doOutro = Controle.elevado();
        Controle.estado.evento_id = 'outro-evento';
        return { doOutro, doMesmo: Controle.elevado() };
    """)
    assert saida["doOutro"] is False, "o bilhete de outro evento liberou esta tela"
    assert saida["doMesmo"] is True, "o bilhete do proprio evento parou de valer"


def test_elevacao_de_outro_evento_no_storage_nao_e_restaurada():
    """O `navegador` ja impede um bilhete de outro navegador; isto impede um
    bilhete de outro EVENTO no MESMO navegador -- a engrenagem trocou de evento
    e o storage ainda tem o token antigo."""
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) + 900, evento_id: 'outro-evento'
        }));
        // Sem `await` na abertura: desde 16/08/2026 a senha e pedida numa caixa
        // da propria pagina, que fica esperando um toque. O que o teste mede e
        // o que aconteceu com o bilhete guardado ATE esse ponto.
        var indo = Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        await new Promise(r => setTimeout(r, 80));
        var elevado = Controle.elevado();
        document.getElementById('btn-cancelar-entrar-config').click();
        await indo;
        return { elevado };
    """)
    assert saida["elevado"] is False


def test_elevacao_vencida_no_storage_e_descartada_ao_abrir_a_engrenagem():
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) - 5, evento_id: 'ev-1'
        }));
        // Ver a nota do teste anterior: a caixa de senha espera um toque, e o
        // que se mede aqui e o estado do bilhete ANTES de qualquer decisao.
        var indo = Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        await new Promise(r => setTimeout(r, 80));
        var medido = { elevado: Controle.elevado(),
                       guardado: sessionStorage.getItem('acesso_elevacao') };
        document.getElementById('btn-cancelar-entrar-config').click();
        await indo;
        return medido;
    """)
    assert saida["elevado"] is False
    assert saida["guardado"] is None


def test_cancelar_a_senha_deixa_a_lista_na_tela_e_nao_abre_a_engrenagem():
    """A configuracao nao pode aparecer antes da senha.

    Mostrar os setores, a lista de portoes e o nome do evento e SO ENTAO pedir a
    senha entregaria tudo isso a quem estiver com o celular do porteiro na mao.

    Desde 16/08/2026 o "Cancelar" e um botao da propria pagina, e nao mais o
    Cancelar de um `window.prompt`. O que o teste mede continua sendo o mesmo:
    desistir da senha devolve o dono a lista, com a engrenagem intacta.
    """
    saida = _no_navegador("""
        // Sem `await`: a promessa so resolve ou rejeita quando alguem toca num
        // dos botoes da caixa. Esperar por ela aqui prenderia o teste para
        // sempre -- que e exatamente o que a caixa faz de proposito, ficar na
        // tela ate a pessoa decidir.
        var indo = Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        await new Promise(r => setTimeout(r, 80));
        var caixaApareceu = !document.getElementById('caixa-entrar-config')
            .classList.contains('sumindo');

        document.getElementById('btn-cancelar-entrar-config').click();
        await indo;
        return {
            caixaApareceu,
            caixaFechou: document.getElementById('caixa-entrar-config')
                .classList.contains('sumindo'),
            engrenagemEscondida: document.getElementById('engrenagem')
                .classList.contains('sumindo'),
            listaNaTela: !document.getElementById('lista')
                .classList.contains('sumindo'),
            setores: document.getElementById('setores').children.length,
        };
    """)
    assert saida["caixaApareceu"] is True
    assert saida["caixaFechou"] is True
    assert saida["engrenagemEscondida"] is True
    assert saida["listaNaTela"] is True
    assert saida["setores"] == 0


def test_senha_que_nao_confere_APARECE_na_tela():
    """O defeito que o usuario encontrou no celular em 16/08/2026.

    A senha errada rejeitava a promessa, o `.catch` de `abrirEngrenagem`
    engolia, e a tela nao dizia NADA -- ele digitava e o aparelho nao reagia.
    Provado no navegador antes de consertar: a engrenagem nao abria e nenhum
    elemento visivel recebia uma palavra.

    O que este teste exige e so o resultado: a recusa vira texto A VISTA, e a
    caixa FICA aberta para ele tentar de novo.
    """
    saida = _no_navegador("""
        window.supabaseClient.auth.signInWithPassword = async () => ({
            error: { message: 'Invalid login credentials' }
        });
        window.supabaseClient.auth.getSession = async () => ({
            data: { session: null }
        });

        var indo = Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('entrar-config-email').value = 'dono@exemplo.com';
        document.getElementById('entrar-config-senha').value = 'errada';
        document.getElementById('btn-entrar-config').click();
        await new Promise(r => setTimeout(r, 300));

        var erro = document.getElementById('erro-entrar-config');
        return {
            erroVisivel: !erro.classList.contains('sumindo'),
            erroTexto: erro.textContent,
            caixaContinuaAberta: !document.getElementById('caixa-entrar-config')
                .classList.contains('sumindo'),
            engrenagemEscondida: document.getElementById('engrenagem')
                .classList.contains('sumindo'),
            botaoLiberado: !document.getElementById('btn-entrar-config').disabled,
        };
    """)
    assert saida["erroVisivel"] is True, "a senha errada nao disse nada na tela"
    assert saida["erroTexto"].strip(), "o aviso apareceu vazio"
    # A frase e a do `acesso-conta.js`, em portugues e dizendo QUAL conta usar
    # -- a do Supabase vem em ingles falando de "credentials".
    assert "Vibe" in saida["erroTexto"] or "senha" in saida["erroTexto"].lower()
    assert saida["caixaContinuaAberta"] is True, (
        "fechar a caixa devolveria o dono a lista sem uma palavra"
    )
    assert saida["engrenagemEscondida"] is True
    assert saida["botaoLiberado"] is True, (
        "o botao ficou travado e ele nao consegue tentar de novo"
    )


def test_a_caixa_da_senha_oferece_o_esqueci_e_ele_manda_falar_com_a_grafica():
    """A saida que faltava, e o motivo de o `window.prompt` ter de sair: nao ha
    onde caber um terceiro botao num prompt do navegador.

    O que ela FAZ mudou em 17/08/2026 (ver `test_o_esqueci_da_tranca_...`): nao
    ha e-mail a mandar, entao nem o campo dela e lido. A resposta aparece no
    mesmo lugar do erro, que e onde o dono esta olhando.
    """
    saida = _no_navegador("""
        window.supabaseClient.auth.getSession = async () => ({
            data: { session: null }
        });
        var pedido = null;
        window.supabaseClient.auth.resetPasswordForEmail = async (email) => {
            pedido = email; return {};
        };

        var indo = Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('entrar-config-email').value = 'dono@exemplo.com';
        document.getElementById('btn-esqueci-entrar-config').click();
        await new Promise(r => setTimeout(r, 200));

        var erro = document.getElementById('erro-entrar-config');
        var saida = { pedido, resposta: erro.textContent,
                      respostaVisivel: !erro.classList.contains('sumindo') };
        document.getElementById('btn-cancelar-entrar-config').click();
        try { await indo; } catch (e) { /* cancelado, e o esperado */ }
        return saida;
    """)
    assert saida["pedido"] is None, "a caixa ainda promete um e-mail que nao chega"
    assert saida["respostaVisivel"] is True
    assert "gráfica" in saida["resposta"]


def test_desenhar_de_novo_nao_apaga_os_dados_do_evento_sendo_digitados():
    """IMPORTANT da revisao final: `elevar()` chama `desenhar()`, e todo
    `criarAparelho`/`novoCodigo`/`importarCodigos`/`renomearAparelho` chama
    `carregarPainel()`. O arquivo ja resolve isto para os cartoes de
    aparelho (`edicoesDeAparelhoAntes`); os campos do evento precisavam do
    mesmo tratamento -- sem ele, o dono digitando um nome novo via a senha
    vencer no meio da edicao e recuperava o texto ANTIGO."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('campo-nome-evento').value = 'Nome novo que eu digitei';
        document.getElementById('campo-local').value = 'Local novo';
        Controle.desenhar();
        return {
            nome: document.getElementById('campo-nome-evento').value,
            local: document.getElementById('campo-local').value,
        };
    """)
    assert saida["nome"] == "Nome novo que eu digitei"
    assert saida["local"] == "Local novo"


def test_o_fuso_vai_e_volta_sem_mover_o_horario():
    """A unica logica desta tela que da para errar sem nada parecer errado: um
    horario tres horas fora ainda e um horario.

    O `datetime-local` nao tem fuso -- ele entrega a hora do RELOGIO de quem
    digitou. A coluna e TIMESTAMPTZ. Mandar cru faz o Postgres ler como UTC, e
    no Brasil o portao passaria a abrir tres horas antes.
    """
    saida = _no_navegador("""
        const iso = Controle.doCampoParaISO('2026-09-28T20:00');
        const d = new Date(iso);
        return {
            terminaEmZ: iso.endsWith('Z'),
            // O instante tem de ser as 20:00 do RELOGIO local, seja qual for o
            // fuso da maquina que roda o teste.
            horaLocal: d.getHours(),
            minutoLocal: d.getMinutes(),
            // E a volta tem de devolver exatamente o que foi digitado.
            volta: Controle.deISOParaCampo(iso),
            vazioVira: Controle.doCampoParaISO(''),
            nuloVira: Controle.deISOParaCampo(null),
        };
    """)
    assert saida["terminaEmZ"] is True
    assert saida["horaLocal"] == 20
    assert saida["minutoLocal"] == 0
    assert saida["volta"] == "2026-09-28T20:00"
    assert saida["vazioVira"] is None
    assert saida["nuloVira"] == ""


def test_a_janela_do_setor_grava_o_horario_convertido():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.body) {
                chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s1').click();
        const campo = document.getElementById('setor-abre_em-s1');
        campo.value = '2026-09-28T20:00';
        campo.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 80));
        return { chamadas, esperado: new Date('2026-09-28T20:00').toISOString() };
    """)
    assert len(saida["chamadas"]) == 1
    assert saida["chamadas"][0]["caminho"] == "/setores/s1"
    assert saida["chamadas"][0]["corpo"] == {"abre_em": saida["esperado"]}


def test_o_nome_na_portaria_grava_ao_sair_do_campo():
    """O nome nasce do nome do modelo no ERP -- "PISTA 2026 FRENTE VERNIZ". Quem
    esta na porta precisa ler "PISTA". O PATCH ja aceitava `nome` desde a parte
    3a e nenhuma tela chamava."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.body) {
                chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s1').click();
        const campo = document.getElementById('setor-nome-s1');
        const valorDeFabrica = campo.value;
        campo.value = 'Pista';
        campo.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 80));
        return { chamadas, valorDeFabrica };
    """)
    assert saida["valorDeFabrica"] == "PISTA"
    assert len(saida["chamadas"]) == 1
    assert saida["chamadas"][0]["corpo"] == {"nome": "Pista"}


def test_o_nome_igual_ao_que_ja_esta_nao_grava():
    """Sair do campo sem ter mudado nada e o gesto mais comum do mundo."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.body) { chamadas.push(caminho); }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s1').click();
        const campo = document.getElementById('setor-nome-s1');
        campo.dispatchEvent(new Event('change'));
        campo.value = '   ';                 // apagar o nome nao e renomear
        campo.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 80));
        return { chamadas };
    """)
    assert saida["chamadas"] == []


def test_bloquear_uma_faixa_manda_os_tres_campos_e_limpa_o_formulario():
    """Limpar importa: sem isso o dono ve a faixa recem-bloqueada ainda escrita
    no formulario, e o convite e bloquea-la de novo."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.method === 'POST') {
                chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s1').click();
        document.getElementById('bloq-de-s1').value = '1000';
        document.getElementById('bloq-ate-s1').value = '1500';
        document.getElementById('bloq-motivo-s1').value = 'lote nao pago';
        document.getElementById('bloq-criar-s1').click();
        await new Promise(r => setTimeout(r, 150));
        return {
            chamadas,
            de: document.getElementById('bloq-de-s1').value,
            ate: document.getElementById('bloq-ate-s1').value,
            motivo: document.getElementById('bloq-motivo-s1').value,
            aindaAberto: !document.getElementById('setor-config-s1')
                .classList.contains('sumindo'),
        };
    """)
    assert len(saida["chamadas"]) == 1
    assert saida["chamadas"][0]["caminho"] == "/setores/s1/bloqueios"
    assert saida["chamadas"][0]["corpo"] == {"de": "1000", "ate": "1500",
                                             "motivo": "lote nao pago"}
    assert saida["de"] == ""
    assert saida["ate"] == ""
    assert saida["motivo"] == ""
    assert saida["aindaAberto"] is True


def test_a_lista_mostra_a_faixa_bloqueada_com_o_motivo():
    """O motivo e o que a portaria le em voz alta. Escondido, o dono nao sabe o
    que bloqueou nem como desfazer -- e um lote bloqueado por engano so
    apareceria na porta, com a fila esperando."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('setor-configurar-s2').click();
        return {
            texto: document.getElementById('bloq-lista-s2').textContent.replace(/\\s+/g,' '),
            temLiberar: !!document.getElementById('bloq-liberar-b1'),
            semBloqueio: document.getElementById('bloq-lista-s1').textContent,
        };
    """)
    assert "100 a 150" in saida["texto"]
    assert "lote nao pago pelo PDV Centro" in saida["texto"]
    assert saida["temLiberar"] is True
    assert "Nenhum ingresso bloqueado" in saida["semBloqueio"]


def test_liberar_pede_confirmacao_e_manda_DELETE():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.method === 'DELETE') { chamadas.push(caminho); }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s2').click();
        document.getElementById('bloq-liberar-b1').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 150));
        return { chamadas };
    """)
    assert saida["chamadas"] == ["/setores/s2/bloqueios/b1"]


def test_liberar_recusado_na_confirmacao_nao_manda_nada():
    """Liberar devolve a entrada a um lote roubado. Cancelar tem de cancelar."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.method === 'DELETE') { chamadas.push(caminho); }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s2').click();
        document.getElementById('bloq-liberar-b1').click();
        await new Promise(r => setTimeout(r, 150));
        return { chamadas };
    """)
    assert saida["chamadas"] == []


def test_bloquear_e_liberar_entram_na_trava_de_senha():
    """Sao as duas escritas mais perigosas desta tela: uma recusa um lote na
    porta, a outra devolve a entrada a um lote roubado."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const semSenha = {
            criar: document.getElementById('bloq-criar-s2').disabled,
            liberar: document.getElementById('bloq-liberar-b1').disabled,
            de: document.getElementById('bloq-de-s2').disabled,
            nome: document.getElementById('setor-nome-s2').disabled,
            abre: document.getElementById('setor-abre_em-s2').disabled,
        };
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const comSenha = {
            criar: document.getElementById('bloq-criar-s2').disabled,
            liberar: document.getElementById('bloq-liberar-b1').disabled,
            de: document.getElementById('bloq-de-s2').disabled,
            nome: document.getElementById('setor-nome-s2').disabled,
            abre: document.getElementById('setor-abre_em-s2').disabled,
        };
        return { semSenha, comSenha };
    """)
    for campo in ("criar", "liberar", "de", "nome", "abre"):
        assert saida["semSenha"][campo] is True, campo
        assert saida["comSenha"][campo] is False, campo


def test_desenhar_de_novo_nao_apaga_o_bloqueio_sendo_digitado():
    """O dono digita tres campos seguidos. Um redesenho disparado por OUTRO
    cartao no meio disso apagaria os tres, sem ele ter tocado neste
    formulario."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('setor-configurar-s1').click();
        document.getElementById('bloq-de-s1').value = '1000';
        document.getElementById('bloq-ate-s1').value = '1500';
        document.getElementById('bloq-motivo-s1').value = 'lote nao pago';
        Controle.desenhar();
        return {
            de: document.getElementById('bloq-de-s1').value,
            ate: document.getElementById('bloq-ate-s1').value,
            motivo: document.getElementById('bloq-motivo-s1').value,
        };
    """)
    assert saida["de"] == "1000"
    assert saida["ate"] == "1500"
    assert saida["motivo"] == "lote nao pago"


def test_bloquear_o_setor_INTEIRO_manda_o_motivo_junto():
    """Diferente de bloquear uma FAIXA, logo acima no mesmo painel: aqui a
    porta para de receber.

    O motivo vai junto porque e ele que o porteiro le em voz alta. Bloqueio
    mudo vira "nao sei, o sistema nao deixou" na frente da fila -- e o servidor
    recusa esta gravacao sem ele, de proposito.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.body) {
                chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            }
            return { ok: true };
        };
        document.getElementById('setor-configurar-s1').click();
        document.getElementById('setor-bloq-motivo-s1').value =
            'camarote interditado pelos bombeiros';
        document.getElementById('setor-bloquear-s1').click();
        await new Promise(r => setTimeout(r, 120));
        return { chamadas };
    """)
    assert len(saida["chamadas"]) == 1
    assert saida["chamadas"][0]["caminho"] == "/setores/s1"
    assert saida["chamadas"][0]["corpo"] == {
        "bloqueado": True,
        "bloqueado_motivo": "camarote interditado pelos bombeiros",
    }


def test_o_setor_bloqueado_mostra_o_motivo_e_o_botao_de_liberar():
    """Sem o botao, o dono bloqueia a porta e nao tem como reabri-la -- com a
    fila esperando do outro lado."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.estado.painel.setores[0].bloqueado = true;
        Controle.estado.painel.setores[0].bloqueado_motivo = 'camarote interditado';
        Controle.desenhar();
        document.getElementById('setor-configurar-s1').click();

        // Lido ANTES do clique: liberar termina em `carregarPainel()`, que
        // reconstroi o cartao inteiro a partir do painel do servidor -- e ali o
        // setor ja volta desbloqueado.
        const texto = document.getElementById('setor-config-s1')
                        .textContent.replace(/\\s+/g, ' ');
        // Com o setor bloqueado nao ha por que oferecer bloquea-lo de novo.
        const temBotaoDeBloquear = !!document.getElementById('setor-bloquear-s1');

        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.body) {
                chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            }
            return { ok: true };
        };
        document.getElementById('setor-liberar-s1').click();
        await new Promise(r => setTimeout(r, 120));
        return { texto, temBotaoDeBloquear, chamadas };
    """)
    assert "camarote interditado" in saida["texto"]
    assert saida["temBotaoDeBloquear"] is False
    assert len(saida["chamadas"]) == 1
    # Sem `bloqueado_motivo`: quem apaga o motivo velho e o servidor, para que
    # ele nao reapareca numa recusa de um bloqueio que ja acabou.
    assert saida["chamadas"][0]["corpo"] == {"bloqueado": False}


# O preparo comum de "estou na engrenagem, com a senha ja dada".
_NA_ENGRENAGEM = """
    Controle.estado.sessao = { access_token: 'jwt-de-teste' };
    Controle.estado.evento_id = 'ev-1';
    await Controle.carregarPainel();
    Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
    Controle.estado.painel.evento.status = 'ativo';
    Controle.desenhar();
    const chamadas = [];
    Controle._pedirParaTeste = async (caminho, opcoes) => {
        if (opcoes && opcoes.body) {
            chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
        }
        return { ok: true };
    };
"""


def test_inativar_o_evento_pede_confirmacao_e_manda_encerrado():
    """Desligar o evento para TODOS os portoes de uma vez nao pode acontecer
    com um toque solto no meio da tela.

    A confirmacao e a caixa DESENHADA NA PAGINA, e o teste toca nos botoes dela
    -- e nao num dialogo do navegador. Ate 17/08/2026 era `window.confirm`, e
    este teste passava assim mesmo, porque no Chrome de teste o dialogo
    responde. Ele provava a logica; o que falhava no celular do dono era o
    mecanismo."""
    recusou = _no_navegador(_NA_ENGRENAGEM + """
        const botao = document.getElementById('btn-ativar-evento');
        const rotulo = botao.textContent;
        botao.click();
        await new Promise(r => setTimeout(r, 80));
        const pergunta = document.getElementById('texto-confirmar');
        const texto = pergunta ? pergunta.textContent : null;
        document.getElementById('btn-confirmar-nao').click();
        await new Promise(r => setTimeout(r, 80));
        return { chamadas, rotulo, texto,
                 sobrou: !!document.getElementById('fundo-confirmar') };
    """)
    assert recusou["rotulo"] == "Inativar este evento"
    assert recusou["texto"], "a confirmacao nao apareceu na propria pagina"
    assert "Inativar" in recusou["texto"]
    assert recusou["chamadas"] == [], "cancelar mandou a gravacao assim mesmo"
    assert recusou["sobrou"] is False, "a caixa ficou na tela depois de fechada"

    aceitou = _no_navegador(_NA_ENGRENAGEM + """
        document.getElementById('btn-ativar-evento').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 150));
        return { chamadas };
    """)
    assert aceitou["chamadas"][0]["caminho"] == "/eventos/ev-1"
    assert aceitou["chamadas"][0]["corpo"] == {"status": "encerrado"}


def test_finalizar_o_evento_confirma_NA_PAGINA_e_manda_finalizado():
    """O defeito que o dono relatou em 17/08/2026: "Finalizar Evento e Inativar
    Evento nao funcionam".

    As duas comecavam com `window.confirm`, que no aplicativo INSTALADO nao
    responde -- e confirmacao que nao responde vale por "cancelar": a funcao
    devolvia na primeira linha e nada acontecia, sem nenhum aviso, porque
    cancelar nao E um erro.

    A prova de que era o mecanismo, e nao a logica: "ATIVAR este evento"
    funcionava na MESMA linha de codigo, porque ligar nao pede confirmacao."""
    saida = _no_navegador(_NA_ENGRENAGEM + """
        document.getElementById('btn-finalizar-evento').click();
        await new Promise(r => setTimeout(r, 80));
        const texto = document.getElementById('texto-confirmar').textContent;
        const rotuloSim = document.getElementById('btn-confirmar-sim').textContent;
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 150));
        return { chamadas, texto, rotuloSim };
    """)
    assert "Eventos finalizados" in saida["texto"]
    assert saida["rotuloSim"] == "Finalizar"
    assert saida["chamadas"][0]["caminho"] == "/eventos/ev-1"
    assert saida["chamadas"][0]["corpo"] == {"status": "finalizado"}


def test_cancelar_a_finalizacao_nao_grava_nada():
    saida = _no_navegador(_NA_ENGRENAGEM + """
        document.getElementById('btn-finalizar-evento').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-nao').click();
        await new Promise(r => setTimeout(r, 150));
        return { chamadas };
    """)
    assert saida["chamadas"] == []


def test_a_confirmacao_nasce_com_o_foco_em_cancelar():
    """Quem confirma por engano perde dado; quem cancela por engano toca de
    novo. Um "Enter" solto no teclado do celular nao pode finalizar evento."""
    saida = _no_navegador(_NA_ENGRENAGEM + """
        document.getElementById('btn-finalizar-evento').click();
        await new Promise(r => setTimeout(r, 80));
        return { focado: document.activeElement.id };
    """)
    assert saida["focado"] == "btn-confirmar-nao"


def test_a_tela_do_Ideal_Control_NAO_usa_caixa_nativa_do_navegador():
    """A trava que impede o defeito de voltar.

    `window.confirm`, `window.prompt` e `window.alert` nao respondem no
    aplicativo instalado. Ja custaram dois defeitos: a senha muda da engrenagem
    em 16/08/2026 e o "Finalizar/Inativar" em 17/08. Toda pergunta desta tela
    tem de ser DOM da propria pagina."""
    for arquivo in ("frontend/controle.js", "frontend/virar-portao.js",
                    "frontend/lista-eventos.js", "frontend/fila-presa.js",
                    "frontend/portaria.js"):
        js = _ler(arquivo)
        for proibida in ("window.confirm(", "window.prompt(", "window.alert("):
            assert proibida not in js, (
                arquivo + " voltou a usar " + proibida + " -- no aplicativo "
                "instalado essa caixa nao responde"
            )


def test_reativar_o_evento_NAO_pede_confirmacao():
    """Ligar de volta nao para fila nenhuma: cobrar uma confirmacao por isso
    ensinaria o dono a confirmar sem ler, e a proxima confirmacao e a que
    desliga o evento."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.estado.painel.evento.status = 'encerrado';
        Controle.desenhar();
        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            if (opcoes && opcoes.body) {
                chamadas.push({ caminho, corpo: JSON.parse(opcoes.body) });
            }
            return { ok: true };
        };
        const rotulo = document.getElementById('btn-ativar-evento').textContent;
        document.getElementById('btn-ativar-evento').click();
        await new Promise(r => setTimeout(r, 120));
        return { chamadas, rotulo };
    """)
    assert saida["rotulo"] == "Ativar este evento"
    assert saida["chamadas"][0]["corpo"] == {"status": "ativo"}


def test_o_portao_DESTE_aparelho_vem_marcado_na_lista_de_portoes():
    """Todos os portoes do evento aparecem em todos os celulares -- decisao do
    usuario. Sem a marca, o dono renomeia ou REVOGA o errado, e revogar desliga
    o aparelho na hora, no meio do evento."""
    saida = _no_navegador("""
        localStorage.setItem('ideal_control_portoes', JSON.stringify([{
            evento_id: 'ev-1', nome_evento: 'Baile do Hawaii',
            aparelho_id: 'a1', nome_portao: 'Portão 1', token: 't-1'
        }]));
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const meu = document.querySelector('#aparelhos .cartao').textContent;

        // O mesmo painel, num celular que NAO e portao deste evento: ali a
        // marca nao pode aparecer, senao ela nao distingue nada.
        localStorage.removeItem('ideal_control_portoes');
        Controle.desenhar();
        return { meu, outro: document.querySelector('#aparelhos .cartao').textContent };
    """)
    assert "★" in saida["meu"]
    assert "★" not in saida["outro"]


def test_o_motivo_do_bloqueio_e_TEXTO_nunca_HTML():
    """O motivo e escrito pelo dono do evento, e a tela do dono e a tela de um
    cliente -- nao nossa. Um `<img onerror>` no motivo rodaria no navegador de
    quem abrisse o cartao."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.painel.setores[0].bloqueios = [
            { id: 'bx', setor_id: 's1', de: 1, ate: 2,
              motivo: '<img src=x onerror="window.__invadiu=1">' }
        ];
        Controle.desenhar();
        document.getElementById('setor-configurar-s1').click();
        const lista = document.getElementById('bloq-lista-s1');
        return {
            temImg: lista.querySelectorAll('img').length,
            invadiu: !!window.__invadiu,
            texto: lista.textContent,
        };
    """)
    assert saida["temImg"] == 0
    assert saida["invadiu"] is False
    assert "onerror" in saida["texto"]      # aparece como texto, nao como tag


def test_desenhar_de_novo_nao_fecha_o_painel_nem_desmarca_o_uso():
    """Mesmo achado, no cartao de setor.

    Um redesenho disparado por OUTRO cartao desta tela nao pode fechar o painel
    de configuracao que o dono deixou aberto, nem devolver o radio ao valor do
    servidor por baixo da escolha dele.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('setor-configurar-s1').click();
        document.getElementById('uso-s1-reentrada').checked = true;
        Controle.desenhar();
        return {
            aberto: !document.getElementById('setor-config-s1').classList.contains('sumindo'),
            rotulo: document.getElementById('setor-configurar-s1').textContent,
            reentrada: document.getElementById('uso-s1-reentrada').checked,
        };
    """)
    assert saida["aberto"] is True
    assert saida["rotulo"] == "Fechar"
    assert saida["reentrada"] is True


def test_sem_supabase_a_casa_ainda_desenha_a_lista_deste_aparelho():
    """`supabaseClient` fica nulo sem rede, sem o CDN, ou no modo offline
    deliberado do `supabase-config.js` (`?offline=true` / `offline_mode`).

    Antes de 16/08/2026 isso dava uma tela EM BRANCO: `AcessoConta.sessao()`
    LANCA em vez de resolver "sem sessao", a excecao morria calada no
    `DOMContentLoaded`, e os tres blocos de estado nasciam todos com "sumindo".

    Agora a casa nao depende disso para existir. O chaveiro e sincrono e nao
    fala com ninguem: a lista dos portoes que ESTE aparelho ja le sai na tela
    de qualquer jeito -- que e exatamente o celular do porteiro no dia do
    evento, sem sinal e sem a conta do dono.
    """
    saida = _no_navegador("""
        window.supabaseClient = null;
        localStorage.setItem('ideal_control_portoes', JSON.stringify([{
            evento_id: 'ev-1', nome_evento: 'Baile do Hawaii',
            aparelho_id: 'a1', nome_portao: 'Portão 1', token: 't-1'
        }]));
        await window.listaEventos.arrancar();
        return {
            barras: document.querySelectorAll('#eventos .barra-evento').length,
            texto: document.getElementById('eventos').textContent,
            verde: document.querySelectorAll('#eventos .luz.acesa').length,
        };
    """)
    assert saida["barras"] == 1
    assert "Baile do Hawaii" in saida["texto"]
    assert saida["verde"] == 1


# ── A porta da configuração: a senha, o erro, e a saída de quem esqueceu ────
#
# Estes testes nasceram de um defeito que o usuário encontrou no celular, em
# 16/08/2026: "ao clicar na barra ou engrenagem, abre modal da senha, mas não
# funciona e nem dá erro e nem esqueci minha senha".
#
# Não era um defeito, eram três somados, e o resultado dos três era SILÊNCIO:
#
#   1. o `.catch` de `abrirEngrenagem` engolia qualquer falha, e o comentário
#      dele afirmava que outra função avisaria — o que só era verdade no ramo
#      em que JÁ havia sessão;
#   2. o `avisar()` escreve no `#aviso-gravacao`, que vive DENTRO de
#      `#engrenagem` — ainda escondida nesse momento. Mesmo o ramo que avisava
#      escrevia numa caixa invisível;
#   3. o `virarPortao.abrir` não tinha `catch` nenhum: tocar na barra do evento
#      virava uma promessa rejeitada e nada mais.
#
# E o `window.prompt` do navegador não tem onde caber um terceiro botão, então
# "Esqueci minha senha" não tinha como existir enquanto a senha fosse pedida
# por ele.


def test_a_senha_da_configuracao_e_pedida_em_campo_e_nao_no_prompt():
    """O `prompt` do navegador não tem onde caber "Esqueci minha senha".

    Ele também não mostra erro nenhum, e há navegador embutido de aplicativo
    que simplesmente não o exibe. A porta da configuração precisa ser uma caixa
    da própria página.
    """
    html = _ler("frontend/controle.html")
    assert 'id="caixa-entrar-config"' in html
    assert 'id="entrar-config-email"' in html
    assert 'id="entrar-config-senha"' in html
    assert 'id="btn-entrar-config"' in html


def test_a_caixa_da_senha_fica_FORA_da_engrenagem():
    """Dentro dela, a mensagem de erro nasceria escondida.

    Foi metade do defeito de 16/08/2026: o aviso existia, era escrito, e vivia
    dentro de um bloco com `sumindo`. Ninguém nunca o viu.
    """
    html = _ler("frontend/controle.html")
    inicio = html.index('id="engrenagem"')
    fim = html.index('id="caixa-entrar-config"')
    assert fim < inicio, (
        "a caixa da senha está dentro da engrenagem; o erro dela nasceria escondido"
    )


def test_quem_esqueceu_a_senha_tem_saida_ANTES_de_entrar():
    """Já havia um "Esqueci minha senha" — dentro da engrenagem, alcançável só
    depois de entrar. Ou seja: exatamente onde quem esqueceu a senha não chega.
    """
    html = _ler("frontend/controle.html")
    caixa = html[html.index('id="caixa-entrar-config"'):]
    caixa = caixa[:caixa.index("</div>\n\n") if "</div>\n\n" in caixa else 1500]
    assert "Esqueci minha senha" in caixa


def test_o_toque_na_barra_do_evento_nao_falha_calado():
    """`virarPortao.abrir` chama `Controle.comSenha`, que pode rejeitar. Sem
    tratamento, a rejeição não vira nada na tela — e o dono toca no evento, o
    modal aparece, ele digita, e o aparelho simplesmente não reage."""
    js = _ler("frontend/virar-portao.js")
    trecho = js[js.index("Controle.comSenha"):]
    assert ".catch(" in trecho[:600], (
        "o toque na barra não trata a falha da senha"
    )


# ── A casa precisa dizer que chegou versão nova ─────────────────────────────
#
# Nasceu de um relato do usuário em 16/08/2026: depois de eu publicar o
# conserto da senha, ele continuou vendo o defeito consertado. O código no ar
# estava certo — provado dirigindo a produção num Chrome limpo. O aparelho DELE
# é que seguia numa versão anterior.
#
# A causa é uma assimetria que passou despercebida: o `sw-registro.js` só avisa
# de atualização se a página declarar `id="faixa-atualizacao"`, e ele documenta
# isso como opcional. O `portaria.html` declarava. O `controle.html` — a CASA do
# aplicativo, a primeira tela de todo mundo — não.
#
# Instalado na tela de início, o aplicativo não tem barra de endereço: sem esse
# aviso, não existe gesto nenhum que o usuário possa fazer para saber que há
# versão nova. Ele fica na do dia da instalação, e cada conserto publicado
# parece não ter funcionado.


def test_a_casa_avisa_quando_chega_versao_nova():
    """Sem a faixa, o aplicativo instalado nunca conta que se atualizou."""
    assert 'id="faixa-atualizacao"' in _ler("frontend/controle.html")


def test_a_casa_se_recarrega_quando_o_service_worker_novo_assume():
    """A casa pode fazer o que a portaria NÃO pode.

    Na portaria, recarregar sozinho é proibido: a câmera pode estar aberta e a
    fila andando, então lá a faixa avisa e a hora é do porteiro. Aqui não há
    leitura em curso nem fila — o pior que a recarga interrompe é uma senha
    sendo digitada, e por isso ela espera a caixa de senha estar fechada.
    """
    js = _ler("frontend/controle.js") + _ler("frontend/lista-eventos.js")
    assert "controllerchange" in js, (
        "a casa não percebe quando o service worker novo assume"
    )


def test_a_recarga_automatica_NAO_atropela_quem_esta_digitando_a_senha():
    js = _ler("frontend/controle.js") + _ler("frontend/lista-eventos.js")
    trecho = js[js.index("controllerchange"):][:900]
    assert "caixa-entrar-config" in trecho, (
        "a recarga automática não confere se há senha sendo digitada"
    )


# ── A zona de risco, e a lista dos eventos que acabaram ─────────────────────
#
# Decisão do usuário, 16/08/2026: o dono precisava de duas ações que faltavam —
# recomeçar a contagem de um evento de teste, e arquivar um evento que acabou.
# Nenhuma das duas é "excluir": zerar mexe SÓ nas entradas, e finalizar apenas
# tira o evento de "Meus Eventos".


def test_a_zona_de_risco_fica_no_FIM_da_engrenagem_e_separada():
    """Depois de "Este aparelho", e não no meio da configuração: a distância até
    ela é parte da proteção. O dono não pode esbarrar em "Zerar as entradas"
    enquanto rola a página procurando um setor."""
    html = _ler("frontend/controle.html")
    assert html.index('id="bloco-este-aparelho"') < html.index('id="bloco-zona-de-risco"')
    assert 'id="btn-zerar-entradas"' in html
    assert 'id="btn-finalizar-evento"' in html
    # Vermelha, e é a única parte vermelha da configuração.
    css = _ler("frontend/controle.css")
    assert ".zona-de-risco" in css
    assert "var(--red)" in css[css.index(".zona-de-risco"):]


def test_zerar_diz_o_que_recomeca_E_o_que_continua_valendo():
    """Sem a segunda metade, o dono lê "zerar" e entende que perde os ingressos
    impressos — e não toca no botão, ou toca achando que vai perder tudo."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        return { texto: document.getElementById('cartao-zerar-entradas')
                          .textContent.replace(/\\s+/g, ' ') };
    """)
    texto = saida["texto"].lower()
    # O que recomeça.
    assert "contagem" in texto and "zero" in texto
    # E o que fica de pé, dito com todas as letras.
    assert "ingressos" in texto
    assert "setores" in texto
    assert "aparelhos" in texto
    # E o aviso de que a senha vem de novo.
    assert "senha" in texto


def test_finalizar_diz_que_sai_da_lista_que_os_portoes_param_e_que_da_para_voltar():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        return { texto: document.getElementById('cartao-finalizar-evento')
                          .textContent.replace(/\\s+/g, ' ') };
    """)
    texto = saida["texto"].lower()
    assert "meus eventos" in texto
    assert "portões param" in texto or "param de aceitar" in texto
    assert "reabrir" in texto
    assert "inativo" in texto        # volta desligado, e isso precisa estar dito
    assert "sem internet" in texto   # o portão sem rede só sabe quando sincroniza


def test_zerar_recusado_na_confirmacao_nao_pede_senha_nem_manda_nada():
    """A ordem importa: confirma primeiro, senha depois. Pedir a senha a quem
    ainda vai desistir ensina o dono a digitá-la sem ler."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        let pediuSenha = 0;
        Controle._pedirSenhaParaTeste = async () => { pediuSenha++; };
        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            chamadas.push(caminho); return { ok: true };
        };
        document.getElementById('btn-zerar-entradas').click();
        await new Promise(r => setTimeout(r, 120));
        return { pediuSenha, chamadas };
    """)
    assert saida["pediuSenha"] == 0
    assert saida["chamadas"] == []


def test_zerar_pede_a_senha_DE_NOVO_mesmo_com_os_15_minutos_ja_liberados():
    """A única ação desta tela que desfaz dado que o cliente pagou para ter.

    A elevação que o dono comprou meia hora antes para renomear um setor não
    pode servir de autorização para isto — o celular pode estar na mão do
    porteiro desde então.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const estavaElevado = Controle.elevado();
        let pediuSenha = 0;
        Controle._pedirSenhaParaTeste = async () => { pediuSenha++; };
        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            chamadas.push({ caminho, metodo: opcoes.method });
            return { zerado_em: '2026-08-16T12:00:00Z' };
        };
        document.getElementById('btn-zerar-entradas').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 250));
        return { estavaElevado, pediuSenha, chamadas,
                 aviso: document.getElementById('aviso-gravacao').textContent };
    """)
    assert saida["estavaElevado"] is True, "o teste precisa começar JÁ elevado"
    assert saida["pediuSenha"] == 1, "zerou sem pedir a senha de novo"
    assert saida["chamadas"] == [{"caminho": "/eventos/ev-1/zerar-entradas",
                                  "metodo": "POST"}]
    # Regra do projeto: o que o sistema faz sozinho se anuncia.
    assert "zero" in saida["aviso"].lower()


def test_finalizar_fecha_a_engrenagem_e_devolve_a_lista():
    """O que acontece DEPOIS da gravacao.

    A confirmacao em si e o corpo do PATCH estao em
    `test_finalizar_o_evento_confirma_NA_PAGINA_e_manda_finalizado`; aqui o que
    se prova e que a engrenagem se fecha sozinha. Ela e a configuracao de um
    evento que acabou de sair da lista, e deixa-la aberta convidaria o dono a
    continuar mexendo no que ele arquivou.

    O rotulo do botao vem junto porque e por ele que o dono acha a acao."""
    saida = _no_navegador(_NA_ENGRENAGEM + """
        document.getElementById('engrenagem').classList.remove('sumindo');
        const rotulo = document.getElementById('btn-finalizar-evento').textContent;
        document.getElementById('btn-finalizar-evento').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 250));
        return {
            chamadas, rotulo,
            engrenagemFechou: document.getElementById('engrenagem')
                .classList.contains('sumindo'),
            listaNaTela: !document.getElementById('lista').classList.contains('sumindo'),
        };
    """)
    assert saida["rotulo"] == "Finalizar evento"
    assert saida["chamadas"][0]["corpo"] == {"status": "finalizado"}
    # A configuração de um evento que acabou de sair da lista não fica aberta.
    assert saida["engrenagemFechou"] is True
    assert saida["listaNaTela"] is True


def test_as_duas_acoes_da_zona_de_risco_entram_na_trava_de_senha():
    """São as escritas mais pesadas da tela: uma recomeça a contagem, a outra
    para todos os portões de uma vez."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const semSenha = {
            zerar: document.getElementById('btn-zerar-entradas').disabled,
            finalizar: document.getElementById('btn-finalizar-evento').disabled,
        };
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const comSenha = {
            zerar: document.getElementById('btn-zerar-entradas').disabled,
            finalizar: document.getElementById('btn-finalizar-evento').disabled,
        };
        return { semSenha, comSenha };
    """)
    assert saida["semSenha"] == {"zerar": True, "finalizar": True}
    assert saida["comSenha"] == {"zerar": False, "finalizar": False}


def test_a_lista_de_finalizados_so_aparece_quando_ha_evento_finalizado():
    """Um título "Eventos finalizados" sobre o vazio faria o dono procurar o que
    ele nunca finalizou.

    A linha diz nome, data e quanta gente entrou -- e NÃO tem luz nem o ícone de
    ler: evento finalizado não é portão, e tocar nele não pode abrir a câmera.
    """
    saida = _no_navegador("""
        const bloco = document.getElementById('bloco-finalizados');
        window.listaEventos.desenharFinalizados([]);
        const vazio = getComputedStyle(bloco).display;

        window.listaEventos.desenharFinalizados([
            { id: 'ev-9', nome: 'Baile do Hawaii',
              data: '2026-08-01T23:00:00Z', entradas: 4812 }
        ]);
        const linha = document.getElementById('finalizado-ev-9');
        return {
            vazio,
            comUm: getComputedStyle(bloco).display,
            texto: linha.textContent.replace(/\\s+/g, ' ').trim(),
            etiqueta: linha.tagName,
            temLuz: !!linha.querySelector('.luz'),
            temIconeDeLer: !!linha.querySelector('.icone-ler'),
            temReabrir: !!document.getElementById('reabrir-ev-9'),
            rotuloDoReabrir: document.getElementById('reabrir-ev-9').textContent,
        };
    """)
    assert saida["vazio"] == "none"
    assert saida["comUm"] != "none"
    assert "Baile do Hawaii" in saida["texto"]
    assert "4.812 entraram" in saida["texto"]
    assert re.search(r"\d{2}/\d{2}/\d{4}", saida["texto"]), saida["texto"]
    # A linha não é botão: tocar no nome de um evento que acabou não leva a lugar
    # nenhum.
    assert saida["etiqueta"] != "BUTTON"
    assert saida["temLuz"] is False
    assert saida["temIconeDeLer"] is False
    assert saida["temReabrir"] is True
    assert saida["rotuloDoReabrir"] == "Reabrir"


def test_reabrir_devolve_o_evento_como_INATIVO_e_nao_como_ativo():
    """Decisão do usuário: reabrir quase sempre é para corrigir ou consultar.
    Religar os portões de um evento que já acabou é uma segunda decisão, que ele
    toma no "Ativar este evento" — reabrir e ativar juntos abririam a portaria
    de um evento encerrado sem ninguém ter pedido."""
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) + 900, evento_id: 'ev-9'
        }));
        window.listaEventos.desenharFinalizados([
            { id: 'ev-9', nome: 'Baile do Hawaii',
              data: '2026-08-01T23:00:00Z', entradas: 4812 }
        ]);
        const chamadas = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            chamadas.push({ caminho, metodo: opcoes.method,
                            corpo: JSON.parse(opcoes.body) });
            return { ok: true };
        };
        document.getElementById('reabrir-ev-9').click();
        await new Promise(r => setTimeout(r, 300));
        return { chamadas };
    """)
    assert len(saida["chamadas"]) == 1, saida["chamadas"]
    assert saida["chamadas"][0]["caminho"] == "/eventos/ev-9"
    assert saida["chamadas"][0]["metodo"] == "PATCH"
    assert saida["chamadas"][0]["corpo"] == {"status": "encerrado"}


# ── A tela diz em que versão está, e sabe se desentalar ─────────────────────
#
# Custou um dia. Em 16/08/2026 o dono relatou TRÊS vezes que um defeito
# consertado continuava acontecendo. Eu dirigi a produção num navegador limpo
# três vezes, e ela funcionava nas três. O celular dele estava numa versão
# anterior — e não havia como nenhum dos dois saber disso: aplicativo instalado
# não tem barra de endereço, e a tela não dizia a versão em lugar nenhum.
#
# Sem esse número, "o conserto não funcionou" e "o conserto não chegou" são
# indistinguíveis, e a conversa inteira vira adivinhação.


def test_a_tela_mostra_em_que_versao_esta():
    assert 'id="versao-do-app"' in _ler("frontend/controle.html")


def test_a_versao_e_lida_da_tag_e_nao_escrita_a_mao():
    """Constante aqui é constante que ninguém lembra de trocar — e uma versão
    escrita à mão que envelhece mente com mais confiança do que não ter versão
    nenhuma."""
    js = _ler("frontend/controle.js")
    trecho = js[js.index("function versaoDestaTela"):][:700]
    assert "currentScript" in trecho
    assert "v=" in trecho


def test_ha_como_desentalar_o_aplicativo_de_uma_versao_velha():
    js = _ler("frontend/controle.js")
    assert "unregister" in js and "caches.delete" in js


def test_forcar_a_atualizacao_NAO_apaga_o_chaveiro_nem_a_fila():
    """O que o botão limpa é CACHE. O chaveiro dos portões vive no
    `localStorage` e a fila de leituras no IndexedDB — as duas são do dono, e
    perdê-las custaria a contagem que o cliente pagou para ter."""
    js = _ler("frontend/controle.js")
    trecho = js[js.index("function forcarAtualizacao"):][:1600]
    assert "localStorage.clear" not in trecho
    assert "indexedDB.deleteDatabase" not in trecho
    assert "portariaDeposito.limpar" not in trecho


def test_o_botao_de_atualizar_NAO_existe_na_portaria():
    """Lá a câmera pode estar aberta e a fila andando. A portaria tem a faixa
    de atualização, que avisa e deixa a hora com o porteiro."""
    assert "btn-forcar-atualizacao" not in _ler("frontend/portaria.html")


# ── A volta muda da portaria ────────────────────────────────────────────────


def test_a_barra_do_evento_NAO_confia_so_na_chave_do_evento():
    """A raiz do defeito de 16/08/2026, que o dono relatou tres vezes.

    `ideal_portaria_evento` sozinho nao prova portao nenhum -- a portaria
    escreve essa chave como memoria de qual evento se trata, sem token, ao abrir
    `portaria.html?e=<evento>` e depois de o dono revogar o aparelho. A tela
    inicial lia isso como "ja esta carregado", decidia `'ler'`, e mandava o
    celular para uma portaria que voltava na hora por falta de token.

    O toque na barra do evento nao fazia NADA. Sem erro e sem palavra."""
    js = _ler("frontend/chaveiro.js")
    trecho = js[js.index("function carregado"):][:400]
    assert "CHAVE_TOKEN" in trecho, (
        "carregado() voltou a acreditar na chave do evento sozinha"
    )


def test_a_volta_por_falta_de_token_vira_frase_na_tela_inicial():
    """A portaria sai de la com `location.replace`, que nao deixa rastro. Sem
    esta frase, a tela pisca e o dono volta para a lista sem uma palavra --
    exatamente a imagem que fez "o conserto nao funcionou" e "este aparelho nao
    e portao deste evento" ficarem indistinguiveis por um dia."""
    saida = _no_navegador("""
        localStorage.setItem('ideal_portaria_sem_token', '1');
        listaEventos.explicarVoltaDaPortaria();
        const aviso = document.getElementById('erro-arranque');
        return {
            visivel: !aviso.classList.contains('sumindo'),
            texto: aviso.textContent,
            marcaDepois: localStorage.getItem('ideal_portaria_sem_token'),
        };
    """)
    assert saida["visivel"] is True
    assert "ainda não lê" in saida["texto"]
    assert saida["marcaDepois"] is None, (
        "a marca ficou pendurada e vai acusar a proxima abertura do aplicativo"
    )


# ── A fila que trava o dono, e as saidas dela ───────────────────────────────
#
# A trava esta certa: leitura enfileirada sob o token do evento A, enviada
# depois de o aparelho virar portao do B, sobe contada no B. O que estava errado
# era nao haver SAIDA. Quem envia a fila e o `sincronizar()` da tela de leitura,
# e a trava impede de chegar la -- o dono ficou preso num circulo, com uma
# leitura pendente e nada para tocar. Ver o cabecalho do `fila-presa.js`.


_SEMEAR_FILA = """
    localStorage.setItem('ideal_control_portoes', JSON.stringify([{
        evento_id: 'ev-1', nome_evento: 'Baile do Hawaii',
        aparelho_id: 'a1', nome_portao: 'Portão 1', token: 't-1'
    }]));
    await portariaDeposito.esquecerFila();
    await portariaDeposito.enfileirar({
        id_local: 'L1', momento: '2026-08-17T08:00:00Z',
        credencial_id: 'c-1', resultado: 'permitido'
    });
"""


def test_a_fila_presa_sobe_sozinha_antes_de_travar_o_dono():
    """Na maioria das vezes a fila esta parada so porque nada a cutucou: quem
    envia e a tela de leitura, e o dono nem chegou la. Tentar o envio antes de
    mostrar a trava resolve o caso comum sem o dono precisar entender nada."""
    saida = _no_navegador(_SEMEAR_FILA + """
        localStorage.setItem('ideal_portaria_token', 't-9');
        localStorage.setItem('ideal_portaria_evento', 'ev-outro');
        let postou = null;
        window.fetch = async (url, opcoes) => {
            postou = { url: String(url), corpo: JSON.parse(opcoes.body) };
            return { ok: true, status: 200, json: async () => ({ gravadas: 1 }) };
        };
        // O evento pedido NAO e o carregado: e a troca que a trava vigia.
        await virarPortao.abrir('ev-1', 'Baile do Hawaii', false);
        return {
            postou,
            filaDepois: await portariaDeposito.contarFila(),
        };
    """)
    assert saida["postou"]["url"].endswith("/portaria/leituras")
    assert saida["postou"]["corpo"]["leituras"][0]["id_local"] == "L1"
    assert saida["filaDepois"] == 0, "a fila subiu mas nao saiu do aparelho"


def test_a_fila_so_sai_do_aparelho_depois_de_o_servidor_confirmar():
    """Remover antes perderia leitura toda vez que a resposta se perdesse no
    caminho — que no portao, com 4G, e o caso comum. A contagem que o cliente
    pagou para ter nao pode depender de a rede ser boa."""
    saida = _no_navegador(_SEMEAR_FILA + """
        localStorage.setItem('ideal_portaria_token', 't-9');
        window.fetch = async () => ({ ok: false, status: 500,
                                      json: async () => ({}) });
        await virarPortao.abrir('ev-1', 'Baile do Hawaii', false);
        return { filaDepois: await portariaDeposito.contarFila() };
    """)
    assert saida["filaDepois"] == 1, "o servidor recusou e a leitura sumiu"


def test_sem_token_a_tela_NAO_oferece_enviar_de_novo():
    """Sem token a fila nao sobe NUNCA — o dono revogou este aparelho, e o
    sistema apaga o token de proposito para nao perder as leituras. Oferecer
    "Enviar agora" ali seria mandar o dono repetir um gesto que nao tem como dar
    certo, que e o circulo em que ele ficou preso."""
    saida = _no_navegador(_SEMEAR_FILA + """
        localStorage.removeItem('ideal_portaria_token');
        await virarPortao.abrir('ev-1', 'Baile do Hawaii', false);
        const aviso = document.getElementById('erro-arranque');
        return {
            visivel: !aviso.classList.contains('sumindo'),
            texto: aviso.textContent,
            temEnviar: !!document.getElementById('btn-enviar-fila'),
            temDescartar: !!document.getElementById('btn-descartar-fila'),
        };
    """)
    assert saida["visivel"] is True
    assert saida["temEnviar"] is False
    assert saida["temDescartar"] is True, "o dono ficou sem saida nenhuma"
    assert "desligado deste evento" in saida["texto"]


def test_descartar_a_fila_exige_a_senha_do_dono():
    """Descartar PERDE leitura, para sempre. O porteiro esta com este celular na
    mao; sem a senha, um toque errado apagaria a contagem que o cliente pagou
    para ter. Aqui a confirmacao e aceita e a senha NAO — a fila tem de ficar."""
    saida = _no_navegador(_SEMEAR_FILA + """
        localStorage.removeItem('ideal_portaria_token');
        await virarPortao.abrir('ev-1', 'Baile do Hawaii', false);
        document.getElementById('btn-descartar-fila').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 300));
        return {
            pediuSenha: !document.getElementById('caixa-entrar-config')
                            .classList.contains('sumindo'),
            filaDepois: await portariaDeposito.contarFila(),
        };
    """)
    assert saida["pediuSenha"] is True
    assert saida["filaDepois"] == 1, "a fila foi descartada sem a senha do dono"


def test_a_frase_da_fila_presa_nunca_manda_so_esperar():
    """A frase antiga dizia "espere a fila zerar antes de trocar de evento" — e
    esperar era exatamente o que NAO resolvia, porque nada na tela inicial
    enviava a fila. Foi essa frase que prendeu o dono em 17/08/2026."""
    js = _ler("frontend/fila-presa.js")
    trecho = js[js.index("function frase"):js.index("function semVolta")]
    assert "espere" not in trecho.lower(), (
        "a frase voltou a mandar o dono esperar por algo que nao acontece"
    )
    # Cada motivo tem de dizer o que FAZER, e os dois verbos sao os dos botoes.
    assert "Enviar agora" in trecho and "descartá-las" in trecho


# ── O menu geral, atras do olho do cabecalho ────────────────────────────────


def test_o_olho_abre_o_menu_e_tira_a_tela_inicial_INTEIRA_do_caminho():
    """A barra do topo fica FORA do `#lista` de propósito -- o porteiro não tem
    conta, e ela precisa aparecer acima do login. Sem escondê-la junto, ela
    sobrava em cima dos eventos finalizados, oferecendo "Meus Pedidos" numa tela
    que não é a dos pedidos."""
    saida = _no_navegador("""
        // A casa abre na tela de entrar quando nao ha aparelho nem sessao, e o
        // olho e mudo ali de proposito. O menu se exercita a partir da tela
        // inicial, que e onde ele existe.
        window.conta.esconderEntrar();
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 120));
        const sumiu = (id) => document.getElementById(id).classList.contains('sumindo');
        return {
            menuAberto: !sumiu('menu-geral'),
            listaSumiu: sumiu('lista'),
            novoEventoSumiu: sumiu('bloco-novo-evento'),
        };
    """)
    assert saida["menuAberto"] is True
    assert saida["listaSumiu"] is True
    assert saida["novoEventoSumiu"] is True, (
        'a barra "Meus Pedidos" sobrou por cima do menu'
    )


def test_o_olho_ALTERNA_e_o_voltar_tambem_traz_a_tela_inicial_de_volta():
    """Quem entrou pelo ícone tenta sair por ele. O "← Voltar" continua
    existindo porque é o rótulo em TEXTO, e nem todo mundo percebe que um ícone
    é um interruptor."""
    saida = _no_navegador("""
        // A casa abre na tela de entrar quando nao ha aparelho nem sessao, e o
        // olho e mudo ali de proposito. O menu se exercita a partir da tela
        // inicial, que e onde ele existe.
        window.conta.esconderEntrar();
        const sumiu = (id) => document.getElementById(id).classList.contains('sumindo');
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 80));
        const peloOlho = { menu: sumiu('menu-geral'), lista: sumiu('lista'),
                           novo: sumiu('bloco-novo-evento') };

        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-voltar-menu').click();
        await new Promise(r => setTimeout(r, 80));
        const peloVoltar = { menu: sumiu('menu-geral'), lista: sumiu('lista'),
                             novo: sumiu('bloco-novo-evento') };
        return { peloOlho, peloVoltar };
    """)
    for caminho in ("peloOlho", "peloVoltar"):
        assert saida[caminho]["menu"] is True, f"{caminho}: o menu ficou aberto"
        assert saida[caminho]["lista"] is False, f"{caminho}: a lista nao voltou"
        assert saida[caminho]["novo"] is False, f"{caminho}: a barra do topo nao voltou"


def test_abrir_o_menu_TIRA_MEUS_PEDIDOS_do_caminho():
    """Este teste era "abrir o menu desliga a camera do QR", que existia para o
    aparelho não ficar filmando num painel onde não há o que ler. A câmera saiu
    da casa em 17/08/2026, e o que ficou atrás da mesma barra é "Meus Pedidos" —
    a mesma regra, outro morador: o olho é tocável de dentro dos pedidos, e sem
    isto o menu nasceria por cima deles, com as duas telas empilhadas."""
    saida = _no_navegador("""
        // A casa abre na tela de entrar quando nao ha aparelho nem sessao, e o
        // olho e mudo ali de proposito. O menu se exercita a partir da tela
        // inicial, que e onde ele existe.
        window.conta.esconderEntrar();
        document.getElementById('meus-pedidos').classList.remove('sumindo');
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 120));
        const sumiu = (id) => document.getElementById(id).classList.contains('sumindo');
        return { menuAberto: !sumiu('menu-geral'), pedidosSumiram: sumiu('meus-pedidos') };
    """)
    assert saida["menuAberto"] is True
    assert saida["pedidosSumiram"] is True, (
        "o menu abriu por cima de Meus Pedidos, com as duas telas empilhadas"
    )


# ── O rodape do menu: quem esta logado, e qual versao esta rodando ─────────


def test_o_menu_mostra_o_email_da_sessao_aberta():
    saida = _no_navegador("""
        window.conta.esconderEntrar();
        window.supabaseClient = { auth: { getSession: async () => ({
            data: { session: { access_token: 'jwt', user: { email: 'dono@x.com' } } }
        }) } };
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 150));
        return document.getElementById('menu-conta-email').textContent;
    """)
    assert saida == "Conta: dono@x.com"


def test_o_email_do_menu_fica_num_strong_e_e_sempre_TEXTO():
    """O e-mail vem do login: `textContent`, nunca `innerHTML` -- regra do
    projeto para tudo que vem de fora. Um e-mail com `<b>` dentro nao pode
    virar tag de verdade na tela."""
    saida = _no_navegador("""
        window.conta.esconderEntrar();
        window.supabaseClient = { auth: { getSession: async () => ({
            data: { session: { access_token: 'jwt', user: { email: '<b>x</b>@x.com' } } }
        }) } };
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 150));
        const p = document.getElementById('menu-conta-email');
        const forte = p.querySelector('strong');
        return {
            textoForte: forte ? forte.textContent : null,
            tagCrua: p.innerHTML.indexOf('<b>x</b>') !== -1,
        };
    """)
    assert saida["textoForte"] == "<b>x</b>@x.com"
    assert saida["tagCrua"] is False, "o e-mail virou HTML em vez de ficar como texto"


def test_o_menu_sem_sessao_diz_que_nao_ha_conta_neste_aparelho():
    saida = _no_navegador("""
        window.conta.esconderEntrar();
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 150));
        return document.getElementById('menu-conta-email').textContent;
    """)
    assert saida == "Sem conta neste aparelho"


def test_o_menu_mostra_a_mesma_versao_que_o_rodape():
    """`copiar o texto dele ao abrir o menu` -- e nao reler o `?v=` do proprio
    script, que duplicaria a regra que o `controle.js` ja resolve."""
    saida = _no_navegador("""
        window.conta.esconderEntrar();
        document.getElementById('btn-menu-geral').click();
        await new Promise(r => setTimeout(r, 150));
        return {
            rodape: document.getElementById('versao-do-app').textContent,
            menu: document.getElementById('menu-versao').textContent,
        };
    """)
    assert saida["rodape"], "o rodape nao tinha versao nenhuma para copiar"
    assert saida["menu"] == "Ideal Control · " + saida["rodape"]


# ── O que muda na engrenagem tem de aparecer na home ───────────────────────


def test_inativar_o_evento_APAGA_o_verde_na_home_ao_voltar():
    """O defeito relatado em 17/08/2026: "inativado ainda nao sinaliza inativado
    na home, e segue verde".

    A engrenagem gravava certo e o painel dela se atualizava; a LISTA nao. Ela e
    montada no arranque da pagina, e `fecharEngrenagem()` apenas voltava a
    mostra-la -- com os dados de quando a tela abriu. O `finalizarEvento`
    recarregava por conta propria, e o "Inativar" nao."""
    saida = _no_navegador("""
        // A conta responde o que o SERVIDOR sabe agora. O `status` muda quando
        // a gravacao acontece, como aconteceria de verdade.
        // Este aparelho E portao do evento -- e por isso que a barra esta
        // VERDE, e e a situacao em que o dono relatou o defeito.
        localStorage.setItem('ideal_control_portoes', JSON.stringify([{
            evento_id: 'ev-1', nome_evento: 'Click', aparelho_id: 'a1',
            nome_portao: 'Portão 1', token: 't-1'
        }]));
        let status = 'ativo';
        const painelFalso = () => ({
            evento: { id: 'ev-1', nome_evento: 'Click', status },
            setores: [], aparelhos: [],
        });
        AcessoConta.pedir = async (caminho) => {
            if (caminho === '/meus-eventos') {
                return { eventos: [{ id: 'ev-1', nome_evento: 'Click', status }] };
            }
            return painelFalso();
        };
        await listaEventos.recarregar();
        const antes = document.querySelector('#evento-ev-1 .luz').className;

        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        await Controle.carregarPainel();
        Controle.estado.painel.evento.status = 'ativo';
        Controle.desenhar();

        Controle._pedirParaTeste = async () => { status = 'encerrado'; return { ok: true }; };
        document.getElementById('btn-ativar-evento').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 200));

        await Controle.fecharEngrenagem();
        await new Promise(r => setTimeout(r, 200));
        const linha = document.querySelector('#evento-ev-1');
        return {
            antes,
            depois: linha.querySelector('.luz').className,
            texto: linha.textContent,
        };
    """)
    assert "acesa" in saida["antes"], "o cenario precisa comecar VERDE"
    assert "inativa" in saida["depois"], "a barra continuou verde depois de inativar"
    assert "acesa" not in saida["depois"]
    assert "inativo" in saida["texto"]


def test_a_lista_se_refaz_ANTES_de_a_sessao_sair():
    """A ordem e o ponto. Recarregar depois do `signOut` traria a lista sem
    conta -- e sem conta ela so enxerga o chaveiro deste aparelho, que nao
    guarda situacao e assume ativo. O evento voltaria VERDE, que e exatamente o
    sintoma que o conserto elimina."""
    saida = _no_navegador("""
        const ordem = [];
        window.supabaseClient = { auth: {
            getSession: async () => ({ data: { session: { access_token: 'jwt' } } }),
            signOut: async () => { ordem.push('signOut'); return {}; },
        } };
        AcessoConta.pedir = async (caminho) => {
            if (caminho === '/meus-eventos') {
                ordem.push('meus-eventos');
                return { eventos: [] };
            }
            return {};
        };
        // A bandeira que faz o fechamento derrubar a sessao -- o celular do
        // porteiro, onde a conta chegou so para configurar.
        Controle.estado.sessaoDaEngrenagem = true;
        await Controle.fecharEngrenagem();
        await new Promise(r => setTimeout(r, 200));
        return { ordem };
    """)
    assert saida["ordem"] == ["meus-eventos", "signOut"], (
        "a lista se refez sem conta, ou nem se refez"
    )


def test_inativar_um_evento_NAO_encosta_no_outro():
    """O dono relatou em 17/08/2026 que ativar ou inativar mexia em TODOS.

    O banco desmentiu (os eventos dele tinham status diferentes entre si), mas
    "nao reproduzi" nao e prova. Este teste e a prova: com dois eventos na
    lista, inativar um tem de mandar UMA gravacao, para UM id, e a barra do
    outro tem de continuar como estava."""
    saida = _no_navegador("""
        localStorage.setItem('ideal_control_portoes', JSON.stringify([
            { evento_id: 'ev-1', nome_evento: 'Click', aparelho_id: 'a1',
              nome_portao: 'Portão 1', token: 't-1' },
            { evento_id: 'ev-2', nome_evento: 'Teste 2', aparelho_id: 'a2',
              nome_portao: 'Portão 1', token: 't-2' },
        ]));
        const status = { 'ev-1': 'ativo', 'ev-2': 'ativo' };
        AcessoConta.pedir = async (caminho) => {
            if (caminho === '/meus-eventos') {
                return { eventos: [
                    { id: 'ev-1', nome_evento: 'Click', status: status['ev-1'] },
                    { id: 'ev-2', nome_evento: 'Teste 2', status: status['ev-2'] },
                ] };
            }
            return { evento: { id: 'ev-1', nome_evento: 'Click', status: status['ev-1'] },
                     setores: [], aparelhos: [] };
        };
        await listaEventos.recarregar();
        const antes2 = document.querySelector('#evento-ev-2 .luz').className;

        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        await Controle.carregarPainel();
        Controle.estado.painel.evento.status = 'ativo';
        Controle.desenhar();

        const gravacoes = [];
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            gravacoes.push({ caminho, corpo: JSON.parse(opcoes.body) });
            // O servidor muda SO o evento pedido -- e o que a Edge Function faz.
            const id = caminho.split('/').pop();
            status[id] = JSON.parse(opcoes.body).status;
            return { ok: true };
        };
        document.getElementById('btn-ativar-evento').click();
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('btn-confirmar-sim').click();
        await new Promise(r => setTimeout(r, 200));
        await Controle.fecharEngrenagem();
        await new Promise(r => setTimeout(r, 250));

        return {
            gravacoes, antes2,
            luz1: document.querySelector('#evento-ev-1 .luz').className,
            luz2: document.querySelector('#evento-ev-2 .luz').className,
            texto2: document.querySelector('#evento-ev-2').textContent,
        };
    """)
    assert len(saida["gravacoes"]) == 1, (
        "mandou mais de uma gravacao: " + str(saida["gravacoes"])
    )
    assert saida["gravacoes"][0]["caminho"] == "/eventos/ev-1"
    assert saida["gravacoes"][0]["corpo"] == {"status": "encerrado"}
    assert "inativa" in saida["luz1"], "o evento inativado nao ficou vermelho"
    assert saida["luz2"] == saida["antes2"], "a barra do OUTRO evento mudou"
    assert "inativo" not in saida["texto2"], "o outro evento foi marcado inativo"
