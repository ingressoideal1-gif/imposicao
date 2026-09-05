# -*- coding: utf-8 -*-
"""A tela do Ideal Control da grafica, num Chrome de verdade.

O arnes monta uma pagina hospedeira com o `<section id="view-ideal-control">`
RECORTADO DO index.html, e nao com uma copia escrita aqui. A diferenca importa:
uma copia envelheceria em silencio no dia em que alguem renomeasse um id no
index, e o teste continuaria verde medindo um HTML que nao existe mais.

O que estes testes protegem:

1. **O segredo.** A tela lista ingresso por ingresso; o codigo do QR Ideal nao
   pode aparecer em nenhum deles.
2. **A paginacao.** Um setor de 5.000 nao pode virar 5.000 linhas no
   navegador, e "Proximos" tem de percorrer a lista inteira.
3. **A pre-configuracao.** E a razao desta tela existir: o cliente recebe o
   evento pronto, com setor nomeado e aparelho criado.
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


def _secao_do_index():
    """O `<section id="view-ideal-control">` como ele esta no index.html."""
    html = _ler("frontend/index.html")
    inicio = html.index('<section id="view-ideal-control"')
    fim = html.index("</section>", inicio) + len("</section>")
    return html[inicio:fim].replace('class="view-section"',
                                    'class="view-section active"', 1)


# ── Estrutura, sem navegador ────────────────────────────────────────────────

def test_o_arquivo_entra_na_lista_que_as_estacoes_baixam():
    import security_config
    assert "ideal-control.js" in security_config.PAINEL_ARQUIVOS


def test_o_index_carrega_o_script_DEPOIS_do_script_principal():
    """`showView` mora no script.js e chama `window.IdealControl.iniciar()`.
    Carregar antes deixaria a tela sem quem a abre."""
    html = _ler("frontend/index.html")
    assert html.index("script.js?v=") < html.index("ideal-control.js?v=")


def test_a_versao_do_script_novo_acompanha_as_outras():
    html = _ler("frontend/index.html")
    versoes = set(re.findall(r'\.(?:js|css)\?v=(\d+)', html))
    assert len(versoes) == 1, f"index.html tem versoes misturadas: {sorted(versoes)}"


def test_a_tela_nunca_explica_como_o_codigo_do_QR_e_gerado():
    """Regra do usuario: e segredo de Estado."""
    proibidas = ["pbkdf2", "hash do codigo", "sal do evento", "iteracoes"]
    texto = _ler("frontend/ideal-control.js").lower()
    for palavra in proibidas:
        assert palavra not in texto, f"a tela explica o mecanismo: '{palavra}'"


def test_todo_botao_da_tela_tem_rotulo_em_texto():
    """Regra do projeto: controle novo precisa de rotulo em texto."""
    for botao in re.findall(r"<button[^>]*>(.*?)</button>", _secao_do_index(), re.S):
        sem_tag = re.sub(r"<[^>]+>", "", botao)
        letras = re.sub(r"[^A-Za-zÀ-ÿ]", "", sem_tag)
        assert len(letras) >= 3, f"botao sem rotulo em texto: {botao.strip()[:60]}"


def test_o_papel_que_abre_a_tela_e_o_MESMO_nos_dois_lados():
    """A tela esconde o botao; o backend recusa a rota. As duas listas tem de
    dizer a mesma coisa -- divergindo, ou o botao some para quem pode, ou
    aparece para quem leva 403 ao clicar."""
    import acesso_interno
    js = _ler("frontend/script.js")
    trecho = js[js.index("const PAPEIS_DO_IDEAL_CONTROL"):]
    trecho = trecho[:trecho.index("]") + 1]
    papeis_da_tela = set(re.findall(r"'([a-z]+)'", trecho))
    assert papeis_da_tela == set(acesso_interno.PAPEIS_QUE_CONFIGURAM)


def test_a_permissao_derivada_nao_entra_no_ROLE_DEFAULTS():
    """`perm_ideal_control_view` e DERIVADA do papel, nunca gravada.

    Se ela entrasse no ROLE_DEFAULTS, uma troca de perfil mandaria a coluna
    para o banco num `upsert` -- e a coluna nao existe. O usuario edita essa
    grade ao vivo; um erro de gravacao ali nao pode nascer daqui.
    """
    js = _ler("frontend/script.js")
    defaults = js[js.index("const ROLE_DEFAULTS"):js.index("const ROLE_LABELS")]
    assert "perm_ideal_control_view" not in defaults


# ── No navegador ────────────────────────────────────────────────────────────

PAINEL_FALSO = {
    "pedido": 18560,
    "modelos": [
        {"modelo_id": 1000109, "nome": "PISTA", "quantidade": 600,
         "numero_de": 1, "numero_ate": 600, "tipo_numeracao": "SEQUENCIAL",
         "sobe_ao_controle": True},
        {"modelo_id": 1000110, "nome": "CAMAROTE", "quantidade": 400,
         "numero_de": 5, "numero_ate": 500, "tipo_numeracao": "SEQUENCIAL",
         "sobe_ao_controle": True},
        {"modelo_id": 1000283, "nome": "VIP", "quantidade": 50,
         "numero_de": 1, "numero_ate": 50, "tipo_numeracao": "SEQUENCIAL",
         "sobe_ao_controle": False},
    ],
    "publicacao": {"existe": True, "aberta": True, "publicado_em": None,
                   "total_credenciais": 1000, "qr_gerado_em": "2026-08-15T00:00:00Z",
                   "qr_revogado_em": None},
    "evento": {"id": "ev-1", "nome_evento": "Baile do Hawaii",
               "data_evento": None, "local_evento": "Clube", "status": "ativo",
               "dono_auth_id": "cliente-1", "created_at": "2026-08-14T10:00:00Z"},
    # Sem `publicadas`/`entradas`/`codigos_cliente`: desde 16/08/2026 a abertura
    # do pedido NAO conta nada. Uma fixture mais generosa que o servidor deixaria
    # a tela poder ler um campo que nunca chega.
    "setores": [
        {"id": "s1", "nome": "PISTA", "quantidade": 600, "tipo_uso": "unico",
         "abre_em": None, "fecha_em": None, "pedido_id_int": 18560,
         "modelo_id": 1000109, "bloqueios": []},
        {"id": "s2", "nome": "CAMAROTE", "quantidade": 400, "tipo_uso": "reentrada",
         "abre_em": None, "fecha_em": None, "pedido_id_int": 18560,
         "modelo_id": 1000110,
         "bloqueios": [{"id": "b1", "setor_id": "s2", "de": 100, "ate": 150,
                        "motivo": "PDV Centro nao pagou",
                        "created_at": "2026-08-15T00:00:00Z"}]},
    ],
    "aparelhos": [{"id": "a1", "nome": "Portao A", "status": "ativo",
                   "ultimo_visto": None, "pareado": False,
                   "created_at": "2026-08-15T00:00:00Z", "setores": ["s1"]}],
    "tem_dashboard": True,
}

# O que `GET /clientes/{n}` devolve: quem e o cliente, as contas dele e os
# pedidos dele que tem controle de acesso. E por aqui que a tela entra desde
# 18/08/2026 -- a busca e pelo numero do cliente.
# Desde 04/09/2026 esta lista traz TODOS os pedidos do cliente, e nao so os que
# ja subiram ao controle -- decisao do usuario: "todos os pedidos devem ficar
# disponiveis para visualizacao e edicao pelo menu ideal control". Por isso a
# fixture tem os dois casos, e o `sem_modelo` dos que ficaram de fora.
CLIENTE_FALSO = {
    "cliente": {
        "id_cliente": 14, "nome": "DANIEL MOREIRA", "fantasia": "",
        "email": "daniel@exemplo.com.br", "contas": [],
    },
    "pedidos": [
        {"pedido_id_int": 18560, "evento_id": "ev-1", "publicado_em": None,
         "total_credenciais": 1000, "created_at": "2026-08-14T10:00:00Z",
         "nome_evento": "Baile do Hawaii", "data_evento": None,
         "local_evento": "Clube", "status_evento": "ativo",
         "no_controle": True, "modelos": 2, "quantidade": 1000},
        # Nunca passou pela publicacao: antes desta data ele nao aparecia em
        # lugar nenhum desta tela.
        {"pedido_id_int": 21708, "evento_id": None, "publicado_em": None,
         "total_credenciais": 0, "created_at": "2026-09-04T15:11:00Z",
         "nome_evento": None, "data_evento": None,
         "local_evento": None, "status_evento": None,
         "no_controle": False, "modelos": 2, "quantidade": 30},
    ],
    "sem_modelo": 3,
}

DASHBOARD_FALSO = {
        "publico": {"contratado": 1000, "publicado": 1000, "cortesias": 42,
                    "entraram": 150, "sairam": 10, "presentes": 140,
                    "recusadas": 7, "bloqueados": 51, "comparecimento_pct": 15.0},
        "por_setor": [
            {"setor_id": "s1", "nome": "PISTA", "contratado": 600,
             "publicado": 600, "entraram": 120, "ocupacao_pct": 20.0},
            {"setor_id": "s2", "nome": "CAMAROTE", "contratado": 400,
             "publicado": 400, "entraram": 30, "ocupacao_pct": 7.5},
        ],
        "recusas": [{"motivo": "ja_entrou", "rotulo": "Ingresso já usado", "quantas": 5},
                    {"motivo": "desconhecido",
                     "rotulo": "Código não existe neste evento", "quantas": 2}],
        "por_hora": [{"hora": "2026-08-15T22:00", "entradas": 100, "saidas": 0, "recusas": 2},
                     {"hora": "2026-08-15T23:00", "entradas": 50, "saidas": 10, "recusas": 5}],
        "pico": "2026-08-15T22:00",
    "grafico_truncado": False,
    "leituras_lidas": 167,
}


def _no_navegador(script_extra, aceitar_dialogo=False, config_real=False):
    """Abre a secao do index.html num Chrome de verdade, sem backend.

    A pagina hospedeira e minima de proposito: carregar o index.html inteiro
    traria fabric.js, pdf-lib, o SDK do Supabase e trinta mil linhas de
    script.js -- nada disso participa desta tela, e cada um deles e uma forma
    de o teste falhar por motivo que nao e o dele.
    """
    # `config_real=True` carrega o `supabase-config.js` DE VERDADE, com um SDK
    # de mentira no lugar do CDN. E o unico jeito de exercitar como o cliente
    # do Supabase de fato existe na pagina -- ver
    # `test_a_tela_acha_o_cliente_do_supabase_como_o_painel_o_declara`.
    config = (
        '<script>window.supabase = { createClient: () => ({ auth: {'
        ' getSession: async () => ({ data: { session: '
        '{ access_token: "jwt-do-painel" } } }) } }) };</script>'
        '<script src="/supabase-config.js"></script>'
    ) if config_real else ''

    hospedeira = (
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">'
        '<link rel="stylesheet" href="/style.css"></head><body>'
        '<main class="main-content">' + _secao_do_index() + '</main>'
        + config +
        '<script src="/ideal-control.js"></script></body></html>'
    )

    driver = f"""
const fs = require('fs');
const path = require('path');
const REPO = {json.dumps(RAIZ)};
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));
const HOSPEDEIRA = {json.dumps(hospedeira)};
const PAINEL = {json.dumps(PAINEL_FALSO)};

const TIPOS = {{ '.js': 'application/javascript', '.css': 'text/css',
                '.html': 'text/html' }};

(async () => {{
  const browser = await puppeteer.launch({{ args: ['--no-sandbox'] }});
  const page = await browser.newPage();
  await page.setViewport({{ width: 1440, height: 900 }});
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  page.on('console', m => {{
    if (m.type() !== 'error') return;
    // `[ideal-control]` e diagnostico DELIBERADO: a tela tratou o erro, mostrou
    // uma frase ao atendente, e deixou a pilha no console para quem for
    // investigar. Conta-lo como falha reprovaria justamente os testes que
    // provam que o erro foi bem tratado. Erro nao capturado (`pageerror`)
    // continua reprovando sempre -- e e ele que denuncia a tela travada.
    if (m.text().indexOf('[ideal-control]') >= 0) return;
    erros.push('console: ' + m.text());
  }});
  page.on('dialog', d => {json.dumps(bool(aceitar_dialogo))} ? d.accept() : d.dismiss());

  await page.setRequestInterception(true);
  page.on('request', req => {{
    const url = req.url();
    // SO a raiz. Um `startsWith` aqui devolvia a pagina hospedeira tambem
    // para `/ideal-control.js` e `/style.css` -- o navegador recebia HTML no
    // lugar do script, `window.IdealControl` nunca aparecia, e o unico
    // sintoma era um timeout de 30s sem nenhuma pista do motivo.
    if (url === 'http://arnes.local/' || url === 'http://arnes.local') {{
      return req.respond({{ status: 200, contentType: 'text/html', body: HOSPEDEIRA }});
    }}
    const nome = decodeURIComponent(url.split('?')[0].split('/').pop());
    const arquivo = path.join(REPO, 'frontend', nome);
    if (nome && fs.existsSync(arquivo) && TIPOS[path.extname(nome)]) {{
      return req.respond({{ status: 200, contentType: TIPOS[path.extname(nome)],
                           body: fs.readFileSync(arquivo, 'utf8') }});
    }}
    // Os dois pedidos que o navegador faz sozinho e que nao tem nada a ver
    // com esta tela: a fonte do Google (um `@import` do style.css) e o
    // favicon. Respondidos vazios em vez de abortados -- abortar os dois
    // enchia a lista de erros de console e escondia um erro de verdade no
    // meio.
    if (url.indexOf('fonts.googleapis.com') >= 0) {{
      return req.respond({{ status: 200, contentType: 'text/css', body: '' }});
    }}
    if (nome === 'favicon.ico') {{ return req.respond({{ status: 204 }}); }}
    // Nada mais pode sair desta pagina. Sem isto, um teste com um caminho
    // errado bateria na PRODUCAO de verdade -- e escreveria nela.
    return req.abort();
  }});

  await page.goto('http://arnes.local/', {{ waitUntil: 'domcontentloaded' }});
  await page.waitForFunction(() => window.IdealControl);

  const saida = await page.evaluate(async () => {{
    window.PAINEL = {json.dumps(PAINEL_FALSO)};
    window.DASHBOARD = {json.dumps(DASHBOARD_FALSO)};
    window.CLIENTE_COM_PEDIDO = {json.dumps(CLIENTE_FALSO)};
    window.toast = (t, tipo) => {{ (window._avisos = window._avisos || []).push([t, tipo]); }};
    {script_extra}
  }});

  await browser.close();
  console.log(JSON.stringify({{ saida, erros }}));
}})();
"""
    r = subprocess.run(["node", "-e", driver], capture_output=True,
                       encoding="utf-8", cwd=RAIZ)
    if r.returncode != 0:
        raise AssertionError(r.stderr[:1200])
    resultado = json.loads(r.stdout.strip().splitlines()[-1])
    assert not resultado["erros"], resultado["erros"]
    return resultado["saida"]


# Um backend de mentira que so responde ao painel e a lista de pedidos.
#
# `window.__respostas` e a porta para o resto: o teste poe ali a resposta de um
# caminho especifico -- `/clientes/14/contas`, por exemplo -- e o resto do
# arnes continua igual. Sem isso, cada teste de uma rota nova teria de
# reescrever o desvio inteiro, e um deles envelheceria em silencio no dia em
# que o formato do painel mudasse.
#
# `window.__painel` e o MESMO objeto que `window.PAINEL`, por `defineProperty`:
# alguns testes reatribuem um nome, outros mutam o outro, e um alias comum
# deixaria os dois discordando na metade dos casos.
SERVIDOR = """
    const chamadas = [];
    window.__respostas = {};
    Object.defineProperty(window, '__painel', {
        configurable: true,
        get: () => window.PAINEL,
        set: (v) => { window.PAINEL = v; }
    });
    IdealControl._pedirParaTeste = async (caminho, opcoes) => {
        chamadas.push({ caminho, metodo: (opcoes || {}).method || 'GET',
                        corpo: (opcoes || {}).body ? JSON.parse(opcoes.body) : null });
        if (Object.prototype.hasOwnProperty.call(window.__respostas, caminho)) {
            const r = window.__respostas[caminho];
            if (r instanceof Error) { throw r; }
            return r;
        }
        if (caminho.startsWith('/pedidos?')) return { pedidos: [] };
        if (caminho.indexOf('/dashboard') >= 0) return window.DASHBOARD;
        if (caminho.startsWith('/pedidos/')) return window.PAINEL;
        return { ok: true };
    };
    window._chamadas = chamadas;
    window.__chamadas = chamadas;
    IdealControl.iniciar();
"""


def test_a_tela_abre_um_pedido_e_desenha_tudo():
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        const antes = {
            titulo: document.getElementById('ic-titulo').textContent,
            selos: [...document.querySelectorAll('#ic-situacao .badge')]
                     .map(b => b.textContent),
            setores: document.querySelectorAll('#ic-setores .ic-setor').length,
            aparelhos: document.querySelectorAll('#ic-aparelhos .ic-aparelho').length,
            kpis: document.querySelectorAll('.ic-kpi').length,
            caminhos: window._chamadas.map(c => c.caminho),
        };

        // O painel de publico so vem quando alguem pede.
        document.getElementById('ic-dashboard-abrir').click();
        await new Promise(r => setTimeout(r, 120));
        const depois = [...document.querySelectorAll('.ic-kpi')].map(k =>
            k.querySelector('.ic-kpi-rotulo').textContent + '=' +
            k.querySelector('.ic-kpi-valor').textContent);
        return { antes, depois };
    """)
    a = saida["antes"]
    assert "18560" in a["titulo"]
    assert "Baile do Hawaii" in a["titulo"]
    assert a["setores"] == 2
    # Os cartoes de aparelho MAIS o formulario de criar um.
    assert a["aparelhos"] == 2
    assert any("1 sem código" in s for s in a["selos"])
    # Abrir o pedido NAO pede o painel de publico, e nao desenha KPI nenhum.
    assert a["kpis"] == 0
    assert not [c for c in a["caminhos"] if "/dashboard" in c]
    # E depois do toque, sim.
    assert "Entraram=150" in saida["depois"]
    assert "Presentes=140" in saida["depois"]
    assert "Comparecimento=15,0%" in saida["depois"]


def test_o_modelo_sem_codigo_aparece_marcado_e_nao_escondido():
    """Regra do usuario sobre o 1000283: ele nao sobe ao Ideal Control.

    Mas some-lo da tela da grafica seria pior: o atendente conta os setores,
    acha que falta um, e abre chamado sobre um ingresso que simplesmente nao
    tem codigo impresso.
    """
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        const linhas = [...document.querySelectorAll('#ic-modelos .ic-modelo')];
        return {
            quantos: linhas.length,
            vip: linhas.find(l => l.textContent.includes('VIP')).textContent,
            titulo: linhas.find(l => l.textContent.includes('VIP'))
                      .querySelector('.badge').title,
        };
    """)
    assert saida["quantos"] == 3
    assert "sem código" in saida["vip"]
    assert "não vira setor" in saida["titulo"]


def test_o_setor_mostra_a_faixa_impressa_com_o_mesmo_piso_de_quatro_digitos():
    """As duas telas mostram o mesmo lote. Escrever "de 5 a 500" aqui e
    "de 0005 a 0500" na tela do cliente faria os dois discordarem ao
    telefone sobre qual ingresso e qual."""
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        return {
            camarote: document.getElementById('ic-setor-s2').textContent,
            direto: IdealControl.faixaImpressa(5, 500),
            sem_faixa: IdealControl.faixaImpressa(null, null),
        };
    """)
    assert saida["direto"] == "de 0005 a 0500"
    assert "de 0005 a 0500" in saida["camarote"]
    assert saida["sem_faixa"] == ""


def test_o_dashboard_desenha_o_grafico_por_hora():
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-dashboard-abrir').click();
        await new Promise(r => setTimeout(r, 120));
        const colunas = [...document.querySelectorAll('#ic-por-hora .ic-coluna')];
        return {
            colunas: colunas.length,
            rotulos: colunas.map(c => c.querySelector('.ic-coluna-rotulo').textContent),
            pico: document.getElementById('ic-pico').textContent,
            aviso_visivel: document.getElementById('ic-grafico-aviso').style.display !== 'none',
            recusas: document.getElementById('ic-recusas').textContent,
        };
    """)
    assert saida["colunas"] == 2
    assert saida["rotulos"] == ["22h", "23h"]
    assert "22h" in saida["pico"]
    # `grafico_truncado: false` na fixture -> o aviso fica escondido.
    assert saida["aviso_visivel"] is False
    assert "Ingresso já usado" in saida["recusas"]


def test_o_grafico_avisa_na_TELA_quando_o_servidor_diz_que_truncou():
    """O servidor avisa; a tela tem de repetir. Um aviso que so existe no JSON
    nao avisa ninguem."""
    saida = _no_navegador(SERVIDOR + """
        window.DASHBOARD.grafico_truncado = true;
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-dashboard-abrir').click();
        await new Promise(r => setTimeout(r, 120));
        const el = document.getElementById('ic-grafico-aviso');
        return { visivel: el.style.display !== 'none', texto: el.textContent };
    """)
    assert saida["visivel"] is True
    assert "167" in saida["texto"]


# ── A lista de ingressos ────────────────────────────────────────────────────

INGRESSOS = """
    IdealControl._pedirParaTeste = async (caminho, opcoes) => {
        (window._chamadas = window._chamadas || []).push(
            { caminho, metodo: (opcoes || {}).method || 'GET' });
        if (caminho.startsWith('/pedidos?')) return { pedidos: [] };
        if (caminho.indexOf('/dashboard') >= 0) return window.DASHBOARD;
        if (caminho.startsWith('/pedidos/')) return window.PAINEL;
        if (caminho.indexOf('/ingressos') >= 0) {
            const p = new URLSearchParams(caminho.split('?')[1]);
            const pagina = parseInt(p.get('pagina'), 10);
            const busca = p.get('busca');
            const todos = [];
            for (let n = 1; n <= 1300; n++) {
                todos.push({ id: 'c' + n, numero: n, codigo: null,
                             origem: 'qr_ideal',
                             situacao: n === 7 ? 'entrou'
                                     : (n >= 100 && n <= 150 ? 'bloqueado' : 'disponivel'),
                             motivo_bloqueio: (n >= 100 && n <= 150)
                                              ? 'PDV Centro nao pagou' : null,
                             entrou_em: n === 7 ? '2026-08-15T22:10:00+00:00' : null });
            }
            const filtrados = busca ? todos.filter(t => String(t.numero) === busca) : todos;
            const fatia = filtrados.slice((pagina - 1) * 200, pagina * 200);
            return { setor: { id: 's1', nome: 'PISTA', quantidade: 600 },
                     pagina: pagina, por_pagina: 200,
                     ha_mais: filtrados.length > pagina * 200,
                     ingressos: fatia,
                     numeros: pagina === 1
                        ? { publicadas: 1300, entradas: 1, codigos_cliente: 0 } : null };
        }
        return { ok: true };
    };
"""


def test_a_lista_de_ingressos_abre_fechada_e_pagina():
    saida = _no_navegador(INGRESSOS + """
        await IdealControl.abrirPedido(18560);
        const antes = document.getElementById('ic-ingressos-s1').style.display;

        document.getElementById('ic-ingressos-abrir-s1').click();
        await new Promise(r => setTimeout(r, 120));
        const primeira = [...document.querySelectorAll('#ic-ingressos-s1 .ic-ingresso')]
                           .map(l => l.querySelector('.ic-ingresso-numero').textContent);

        document.getElementById('ic-pagina-proxima-s1').click();
        await new Promise(r => setTimeout(r, 120));
        const segunda = [...document.querySelectorAll('#ic-ingressos-s1 .ic-ingresso')]
                           .map(l => l.querySelector('.ic-ingresso-numero').textContent);

        return { antes, primeira, segunda,
                 tem_anterior: !!document.getElementById('ic-pagina-anterior-s1') };
    """)
    # Fechada ate alguem pedir: um setor de 5.000 nao pode desenhar sozinho.
    assert saida["antes"] == "none"
    assert len(saida["primeira"]) == 200
    assert saida["primeira"][0] == "1" and saida["primeira"][-1] == "200"
    # A segunda pagina continua de onde a primeira parou -- sem repetir nem pular.
    assert saida["segunda"][0] == "201" and saida["segunda"][-1] == "400"
    assert saida["tem_anterior"] is True


def test_a_lista_mostra_situacao_hora_de_entrada_e_motivo_do_bloqueio():
    """A hora sai no FUSO DE QUEM OLHA, e nao em UTC.

    O banco guarda `22:10+00:00`; quem esta na grafica precisa ler 19:10. O
    teste nao pode fixar "19:10", que so vale em Brasilia -- ele prova que o
    valor passou por uma formatacao de data (e nao foi impresso cru) comparando
    com o que o proprio navegador daria para aquele instante.
    """
    saida = _no_navegador(INGRESSOS + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-ingressos-abrir-s1').click();
        await new Promise(r => setTimeout(r, 120));
        const linha = n => [...document.querySelectorAll('#ic-ingressos-s1 .ic-ingresso')]
            .find(l => l.querySelector('.ic-ingresso-numero').textContent === String(n));
        return { entrou: linha(7).textContent, bloqueado: linha(100).textContent,
                 livre: linha(50).textContent,
                 esperado: new Date('2026-08-15T22:10:00+00:00').toLocaleString('pt-BR') };
    """)
    assert "Entrou" in saida["entrou"]
    assert saida["esperado"] in saida["entrou"]
    # E o valor CRU do banco nao aparece: se aparecesse, a hora estaria em UTC.
    assert "22:10:00+00:00" not in saida["entrou"]
    assert "Bloqueado" in saida["bloqueado"]
    assert "PDV Centro" in saida["bloqueado"]
    assert "Disponível" in saida["livre"]


def test_a_busca_por_numero_filtra_a_lista():
    saida = _no_navegador(INGRESSOS + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-ingressos-abrir-s1').click();
        await new Promise(r => setTimeout(r, 120));
        document.getElementById('ic-busca-ingresso-s1').value = '742';
        document.getElementById('ic-busca-ingresso-s1')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(r => setTimeout(r, 120));
        return {
            numeros: [...document.querySelectorAll('#ic-ingressos-s1 .ic-ingresso')]
                       .map(l => l.querySelector('.ic-ingresso-numero').textContent),
            caminhos: window._chamadas.map(c => c.caminho),
        };
    """)
    assert saida["numeros"] == ["742"]
    assert any("busca=742" in c for c in saida["caminhos"])


def test_a_lista_de_ingressos_NUNCA_mostra_codigo_de_qr_ideal():
    """A segunda barreira do segredo, no lado da tela.

    O servidor ja devolve `codigo: null` para o QR Ideal; aqui a fixture manda
    um codigo preenchido de proposito -- e a tela nao pode escreve-lo. Sem
    isso, o teste so provaria que nao havia nada para vazar.
    """
    saida = _no_navegador(INGRESSOS.replace("codigo: null,",
                                            "codigo: 'NAO-PODE-SAIR',") + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-ingressos-abrir-s1').click();
        await new Promise(r => setTimeout(r, 120));
        return { html: document.getElementById('ic-ingressos-s1').innerHTML };
    """)
    assert "NAO-PODE-SAIR" not in saida["html"]


# ── A pre-configuracao: a razao de a tela existir ───────────────────────────

def test_a_grafica_configura_o_setor_sem_pedir_senha_nenhuma():
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-setor-nome-s1').value = 'PISTA PREMIUM';
        document.getElementById('ic-setor-uso-s1').value = 'reentrada';
        document.getElementById('ic-setor-abre-s1').value = '2026-08-28T22:00';
        window._chamadas.length = 0;
        document.getElementById('ic-setor-salvar-s1').click();
        await new Promise(r => setTimeout(r, 120));
        return { chamadas: window._chamadas,
                 pediu_senha: (window._avisos || []).some(a => /senha/i.test(a[0])) };
    """)
    gravacao = [c for c in saida["chamadas"] if c["metodo"] == "PATCH"]
    assert len(gravacao) == 1
    assert gravacao[0]["caminho"] == "/setores/s1"
    assert gravacao[0]["corpo"]["nome"] == "PISTA PREMIUM"
    assert gravacao[0]["corpo"]["tipo_uso"] == "reentrada"
    # Convertido para ISO, e nao mandado cru: a coluna e TIMESTAMPTZ, e o cru
    # gravaria 22:00 UTC -- 19:00 em Brasilia, tres horas mais cedo.
    assert gravacao[0]["corpo"]["abre_em"].endswith("Z")
    assert saida["pediu_senha"] is False


def test_a_tela_NAO_cria_mais_aparelho_por_codigo_e_explica_como_se_cria():
    """O codigo de seis caracteres deixou de ter onde ser digitado em
    16/08/2026, quando a tela que o pedia saiu da portaria. Gerar um aqui
    produzia um segredo que nenhuma tela aceitava -- e o atendente so descobria
    na porta do evento.

    Quem poe um aparelho no ar hoje e o proprio cliente, no celular. A tela diz
    isso no lugar do formulario: um botao que some sem explicacao vira chamado."""
    saida = _no_navegador("""
        IdealControl.estado.painel = window.PAINEL;
        IdealControl.desenhar();
        return {
            formulario: !!document.getElementById('ic-novo-ap-criar'),
            codigoDoAparelho: !!document.getElementById('ic-ap-codigo-a1'),
            caixaDeCodigo: !!document.getElementById('ic-codigo-caixa'),
            comoCriar: (document.getElementById('ic-como-criar-aparelho') || {}).textContent,
        };
    """)
    assert saida["formulario"] is False
    assert saida["codigoDoAparelho"] is False
    assert saida["caixaDeCodigo"] is False
    assert saida["comoCriar"], "a tela precisa dizer como um aparelho entra hoje"
    assert "celular" in saida["comoCriar"]


def test_tocar_no_setor_de_um_aparelho_grava_na_hora():
    """Mesma regra da tela do cliente: "ao clicar acende e passa a valer"."""
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        const b = document.getElementById('ic-ap-setores-a1-s2');
        const antes = b.getAttribute('aria-pressed');
        window._chamadas.length = 0;
        b.click();
        await new Promise(r => setTimeout(r, 120));
        return { antes, depois: b.getAttribute('aria-pressed'),
                 chamadas: window._chamadas };
    """)
    assert saida["antes"] == "false"
    assert saida["depois"] == "true"
    gravacao = [c for c in saida["chamadas"] if c["metodo"] == "PATCH"]
    assert len(gravacao) == 1
    assert gravacao[0]["caminho"] == "/aparelhos/a1"
    assert sorted(gravacao[0]["corpo"]["setores"]) == ["s1", "s2"]


def test_bloquear_uma_faixa_manda_os_tres_campos():
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-bloq-de-s1').value = '10';
        document.getElementById('ic-bloq-ate-s1').value = '20';
        document.getElementById('ic-bloq-motivo-s1').value = 'lote roubado';
        window._chamadas.length = 0;
        document.getElementById('ic-bloq-criar-s1').click();
        await new Promise(r => setTimeout(r, 120));
        return { chamadas: window._chamadas };
    """)
    post = [c for c in saida["chamadas"] if c["metodo"] == "POST"][0]
    assert post["caminho"] == "/setores/s1/bloqueios"
    assert post["corpo"] == {"de": "10", "ate": "20", "motivo": "lote roubado"}


def test_o_bloqueio_existente_aparece_com_o_motivo_e_um_botao_de_liberar():
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        return { texto: document.getElementById('ic-setor-s2').textContent,
                 tem_botao: !!document.getElementById('ic-bloq-liberar-b1') };
    """)
    assert "100 a 150" in saida["texto"]
    assert "PDV Centro nao pagou" in saida["texto"]
    assert saida["tem_botao"] is True


def test_carregar_codigos_de_staff_quebra_o_texto_em_linhas():
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-codigos-s2').value =
            ' STAFF-1 \\n\\n STAFF-2 \\n';
        window._chamadas.length = 0;
        document.getElementById('ic-codigos-enviar-s2').click();
        await new Promise(r => setTimeout(r, 120));
        return { chamadas: window._chamadas };
    """)
    post = [c for c in saida["chamadas"] if c["metodo"] == "POST"][0]
    assert post["caminho"] == "/setores/s2/codigos"
    assert post["corpo"]["codigos"] == ["STAFF-1", "STAFF-2"]


def test_pedido_sem_evento_explica_o_que_falta():
    """O caso mais comum na grafica: impresso e o cliente ainda nao carregou o
    pedido no aplicativo. A tela tem de dizer o proximo passo, e nao so ficar
    vazia.

    Ate 17/08/2026 o proximo passo era o cliente abrir o QR do Pedido; a tela
    Ate 17/08/2026 o proximo passo era o cliente abrir o QR do Pedido; a tela
    saiu junto com ele. E desde 04/09/2026 o proximo passo pode ser dado AQUI:
    a grafica faz o evento nascer, para entregar setores, codigos e aparelhos
    ja configurados.
    """
    saida = _no_navegador(SERVIDOR + """
        window.PAINEL = JSON.parse(JSON.stringify(window.PAINEL));
        window.PAINEL.evento = null;
        window.PAINEL.setores = [];
        window.PAINEL.aparelhos = [];
        window.PAINEL.tem_dashboard = false;
        await IdealControl.abrirPedido(18560);
        return {
            aviso: document.getElementById('ic-sem-evento').textContent,
            aviso_visivel: document.getElementById('ic-sem-evento').style.display !== 'none',
            dashboard: document.getElementById('ic-dashboard-secao').style.display,
            setores: document.getElementById('ic-setores-secao').style.display,
            modelos: document.querySelectorAll('#ic-modelos .ic-modelo').length,
        };
    """)
    assert saida["aviso_visivel"] is True
    assert "ainda não virou evento" in saida["aviso"]
    # E o proximo passo e um BOTAO, e nao uma instrucao para outra pessoa fazer.
    assert "Criar o evento deste pedido" in saida["aviso"]
    assert saida["dashboard"] == "none"
    assert saida["setores"] == "none"
    # ...mas os modelos do ERP continuam a vista: e o que o pedido TEM.
    assert saida["modelos"] == 3


def test_a_grafica_cria_o_evento_do_pedido_sem_esperar_o_cliente():
    """Decisao do usuario, 04/09/2026: "precisamos do acesso no menu ideal
    control, antes do cliente fazer o acesso pelo pwa -- visualizar setores,
    codigos, todas as configuracoes".

    Sem evento nao existe setor, nem codigo, nem aparelho: a tela da grafica
    nao tinha o que configurar ate o cliente tocar em "Carregar" no aplicativo
    dele. O botao faz o evento nascer daqui, e a tela recarrega o pedido -- e a
    recarga que traz os setores e os aparelhos para a tela.
    """
    saida = _no_navegador(SERVIDOR + """
        const semEvento = JSON.parse(JSON.stringify(window.PAINEL));
        semEvento.evento = null;
        semEvento.setores = [];
        semEvento.aparelhos = [];
        window.PAINEL = semEvento;
        window.__respostas['/pedidos/18560/criar-evento'] = {
            evento_id: 'ev-1', nome_evento: 'Baile do Hawaii',
            setores: ['PISTA', 'CAMAROTE'],
        };
        await IdealControl.abrirPedido(18560);
        const antes = document.getElementById('ic-setores-secao').style.display;
        // A recarga tem de trazer o pedido JA com evento -- e o que o servidor
        // devolveria depois de criar.
        window.__respostas['/pedidos/18560'] = window.DEPOIS;
        document.getElementById('ic-criar-evento').click();
        await new Promise(r => setTimeout(r, 250));
        return {
            antes: antes,
            chamada: window.__chamadas.some(c =>
                c.caminho === '/pedidos/18560/criar-evento' && c.metodo === 'POST'),
            semEventoDepois: document.getElementById('ic-sem-evento').style.display,
            setoresDepois: document.getElementById('ic-setores-secao').style.display,
            eventoDepois: document.getElementById('ic-evento-secao').style.display,
            nome: document.getElementById('ic-ev-nome').value,
            avisos: (window._avisos || []).map(a => a[0]),
        };
    """.replace('window.DEPOIS', json.dumps(PAINEL_FALSO)))
    assert saida["antes"] == "none", "havia setor antes de o evento existir"
    assert saida["chamada"] is True
    assert saida["semEventoDepois"] == "none"
    assert saida["setoresDepois"] != "none"
    assert saida["eventoDepois"] != "none"
    assert saida["nome"] == "Baile do Hawaii"
    assert any("Evento criado" in a for a in saida["avisos"]), saida["avisos"]


def test_criar_o_evento_que_falha_devolve_o_botao_e_diz_o_motivo():
    """A recusa mais provavel: nenhum modelo com codigo que a portaria leia.
    O botao volta a funcionar, e o motivo aparece na tela -- nao so no console.
    """
    saida = _no_navegador(SERVIDOR + """
        const semEvento = JSON.parse(JSON.stringify(window.PAINEL));
        semEvento.evento = null;
        window.PAINEL = semEvento;
        const erro = new Error('nenhum modelo deste pedido tem codigo que a portaria leia');
        window.__respostas['/pedidos/18560/criar-evento'] = erro;
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-criar-evento').click();
        await new Promise(r => setTimeout(r, 200));
        const botao = document.getElementById('ic-criar-evento');
        const aviso = document.getElementById('ic-criar-evento-aviso');
        return { desabilitado: botao.disabled, rotulo: botao.textContent.trim(),
                 aviso: aviso.textContent, visivel: aviso.style.display !== 'none' };
    """)
    assert saida["desabilitado"] is False
    assert saida["rotulo"] == "Criar o evento deste pedido"
    assert saida["visivel"] is True
    assert "codigo que a portaria leia" in saida["aviso"]


def test_pedido_que_nao_existe_mostra_o_recado_e_nao_a_tela_anterior():
    saida = _no_navegador("""
        IdealControl._pedirParaTeste = async (caminho) => {
            if (caminho.startsWith('/pedidos?')) return { pedidos: [] };
            const e = new Error('o pedido 99999 nao tem modelos cadastrados no ERP');
            e.status = 404;
            throw e;
        };
        await IdealControl.abrirPedido(99999);
        return { vazio: document.getElementById('ic-vazio').textContent,
                 visivel: document.getElementById('ic-vazio').style.display !== 'none',
                 conteudo: document.getElementById('ic-conteudo').style.display };
    """)
    assert saida["visivel"] is True
    assert "99999" in saida["vazio"]
    assert saida["conteudo"] == "none"


def test_403_do_backend_vira_frase_de_permissao_na_lista_de_pedidos():
    """Quem nao e ADM nem Atendimento nao ve o botao -- mas pode chegar aqui
    por um link salvo. A tela tem de dizer o que fazer, e nao "Erro 403"."""
    saida = _no_navegador("""
        IdealControl._pedirParaTeste = async () => {
            const e = new Error('o Ideal Control da gráfica é para ADM e Atendimento');
            e.status = 403;
            throw e;
        };
        await IdealControl.listarRecentes();
        return { texto: document.getElementById('ic-recentes').textContent };
    """)
    assert "ADM e Atendimento" in saida["texto"]


def test_gravar_o_setor_nao_fecha_a_lista_de_ingressos_aberta():
    """Toda gravacao recarrega o pedido. Se isso jogasse fora a lista aberta, o
    atendente que estava procurando o ingresso 742 o perderia no instante
    seguinte a salvar o nome do setor -- sem ter tocado na lista."""
    saida = _no_navegador(INGRESSOS + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-ingressos-abrir-s1').click();
        await new Promise(r => setTimeout(r, 120));
        document.getElementById('ic-pagina-proxima-s1').click();
        await new Promise(r => setTimeout(r, 120));

        document.getElementById('ic-setor-salvar-s1').click();
        await new Promise(r => setTimeout(r, 200));

        const painel = document.getElementById('ic-ingressos-s1');
        return {
            visivel: painel.style.display !== 'none',
            primeiro: (painel.querySelector('.ic-ingresso-numero') || {}).textContent,
        };
    """)
    assert saida["visivel"] is True
    # Continua na SEGUNDA pagina, onde ele estava.
    assert saida["primeiro"] == "201"


def test_trocar_de_pedido_joga_fora_a_lista_do_anterior():
    """O outro lado da mesma regra: a lista do pedido A nao pode reaparecer
    dentro do pedido B."""
    saida = _no_navegador(INGRESSOS + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-ingressos-abrir-s1').click();
        await new Promise(r => setTimeout(r, 120));
        const antes = Object.keys(IdealControl.estado.ingressos).length;
        await IdealControl.abrirPedido(19999);
        return { antes, depois: Object.keys(IdealControl.estado.ingressos).length };
    """)
    assert saida["antes"] == 1
    assert saida["depois"] == 0


def test_abrir_a_tela_duas_vezes_nao_duplica_os_ouvintes():
    """`iniciar()` roda a cada abertura da view. Sem guarda, o segundo ouvinte
    faria cada clique gravar duas vezes -- e dois bloqueios iguais no banco."""
    saida = _no_navegador(SERVIDOR + """
        IdealControl.iniciar();
        IdealControl.iniciar();
        IdealControl.iniciar();
        await IdealControl.abrirPedido(18560);
        window._chamadas.length = 0;
        document.getElementById('ic-setor-salvar-s1').click();
        await new Promise(r => setTimeout(r, 120));
        return { gravacoes: window._chamadas.filter(c => c.metodo === 'PATCH').length };
    """)
    assert saida["gravacoes"] == 1


# ── A tela travada ──────────────────────────────────────────────────────────
#
# Em 16/08/2026, na primeira vez que o usuario abriu esta tela em producao, ela
# ficou tres minutos em "Carregando..." e NENHUMA requisicao chegou ao motor --
# conferido no log do Render. A causa: `supabase-config.js` deixa
# `window.supabaseClient` NULO quando o SDK do CDN nao carrega (ou em modo
# offline), e `cabecalhos()` chamava `supabaseClient.auth` direto. Isso LANCA na
# hora, em vez de rejeitar uma promessa -- e o throw sincrono escapa do
# `.catch()` de quem chamou, porque a corrente de promessas nem chegou a
# existir.
#
# Estes testes nao usam o desvio `_pedirParaTeste`: eles exercitam o caminho de
# rede DE VERDADE, que e onde o defeito morava.

SEM_REDE = """
    // Nada sai desta pagina: `fetch` falha na hora. E o que garante que o
    // teste mede o tratamento do erro, e nao uma ida a producao.
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
"""


def test_sem_o_login_do_painel_a_tela_DIZ_e_nao_fica_carregando():
    """O defeito de 16/08/2026, reproduzido.

    Com `supabaseClient` nulo, a tela tem de mostrar uma frase. Ficar
    "Carregando..." para sempre e o pior fim possivel: o atendente espera, e
    nao ha nada que ele possa fazer.
    """
    saida = _no_navegador(SEM_REDE + """
        window.supabaseClient = null;
        IdealControl.iniciar();
        await IdealControl.abrirPedido(18560);
        await new Promise(r => setTimeout(r, 60));
        return {
            carregando: document.getElementById('ic-carregando').style.display,
            vazio_visivel: document.getElementById('ic-vazio').style.display !== 'none',
            recado: document.getElementById('ic-vazio').textContent,
            conteudo: document.getElementById('ic-conteudo').style.display,
        };
    """)
    # O "Carregando..." SAIU da tela. E esta a asserção que reprova o defeito.
    assert saida["carregando"] == "none"
    assert saida["vazio_visivel"] is True
    assert saida["conteudo"] == "none"
    # E o recado diz o que fazer, em portugues.
    assert "login" in saida["recado"].lower()
    assert "recarregue" in saida["recado"].lower()


def test_supabase_sem_auth_tambem_e_tratado():
    """A outra forma do mesmo estado: o objeto existe, mas nao e um client.
    `supabaseClient.auth.getSession()` lancaria `TypeError` igual."""
    saida = _no_navegador(SEM_REDE + """
        window.supabaseClient = {};
        IdealControl.iniciar();
        await IdealControl.abrirPedido(18560);
        await new Promise(r => setTimeout(r, 60));
        return { carregando: document.getElementById('ic-carregando').style.display,
                 recado: document.getElementById('ic-vazio').textContent };
    """)
    assert saida["carregando"] == "none"
    assert "login" in saida["recado"].lower()


def test_sessao_vencida_manda_entrar_de_novo():
    """Client bom, sessao vazia. E outro conserto -- entrar de novo, e nao
    recarregar a pagina -- entao a frase tem de ser outra."""
    saida = _no_navegador(SEM_REDE + """
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        IdealControl.iniciar();
        await IdealControl.abrirPedido(18560);
        await new Promise(r => setTimeout(r, 60));
        return { carregando: document.getElementById('ic-carregando').style.display,
                 recado: document.getElementById('ic-vazio').textContent };
    """)
    assert saida["carregando"] == "none"
    assert "sessão expirou" in saida["recado"]


def test_rede_fora_no_meio_tambem_tira_o_carregando_da_tela():
    """Sessao boa, rede caindo. Qualquer que seja a falha, o fim e o mesmo: uma
    frase na tela, nunca um "Carregando..." eterno."""
    saida = _no_navegador(SEM_REDE + """
        window.supabaseClient = { auth: { getSession: async () => (
            { data: { session: { access_token: 'jwt' } } }) } };
        IdealControl.iniciar();
        await IdealControl.abrirPedido(18560);
        await new Promise(r => setTimeout(r, 80));
        return { carregando: document.getElementById('ic-carregando').style.display,
                 vazio_visivel: document.getElementById('ic-vazio').style.display !== 'none',
                 recado: document.getElementById('ic-vazio').textContent };
    """)
    assert saida["carregando"] == "none"
    assert saida["vazio_visivel"] is True
    assert saida["recado"].strip() != ""


def test_erro_ao_DESENHAR_tambem_tira_o_carregando():
    """O `.catch` cobre o `desenhar()` tambem, e nao so a ida a rede: um campo
    que o servidor deixasse de mandar travaria a tela do mesmo jeito."""
    saida = _no_navegador("""
        IdealControl._pedirParaTeste = async () => ({ /* resposta sem nada */ });
        IdealControl.iniciar();
        await IdealControl.abrirPedido(18560);
        await new Promise(r => setTimeout(r, 60));
        return { carregando: document.getElementById('ic-carregando').style.display,
                 vazio_visivel: document.getElementById('ic-vazio').style.display !== 'none' };
    """)
    assert saida["carregando"] == "none"
    assert saida["vazio_visivel"] is True


def test_os_numeros_do_setor_so_aparecem_quando_a_lista_e_aberta():
    """Decisao do usuario, 16/08/2026: "nao deve carregar de imediato os
    codigos, apenas se solicitado, cada setor de uma vez".

    Contar custa tres idas ao banco POR SETOR. Abrir o pedido para renomear um
    setor nao pode pagar por isso -- foi o que fez a tela demorar.
    """
    saida = _no_navegador(INGRESSOS + """
        await IdealControl.abrirPedido(18560);
        const antes = {
            linha: document.getElementById('ic-numeros-s1').textContent,
            caminhos: window._chamadas.map(c => c.caminho),
        };

        document.getElementById('ic-ingressos-abrir-s1').click();
        await new Promise(r => setTimeout(r, 140));
        return { antes, depois: document.getElementById('ic-numeros-s1').textContent };
    """)
    # Ao abrir o pedido: nenhuma contagem pedida, nenhum numero na tela.
    assert saida["antes"]["linha"] == ""
    assert not [c for c in saida["antes"]["caminhos"] if "/ingressos" in c]
    # Depois de abrir a lista DAQUELE setor: os numeros aparecem.
    assert "1.300 publicadas" in saida["depois"]
    assert "1 entraram" in saida["depois"]


def test_paginar_nao_apaga_os_numeros_do_setor():
    """O servidor so manda os numeros na primeira pagina -- repeti-los custaria
    tres idas ao banco por toque em "Proximos". A tela precisa guardar o que ja
    tem, senao a linha pisca para vazio."""
    saida = _no_navegador(INGRESSOS + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-ingressos-abrir-s1').click();
        await new Promise(r => setTimeout(r, 140));
        document.getElementById('ic-pagina-proxima-s1').click();
        await new Promise(r => setTimeout(r, 140));
        return { linha: document.getElementById('ic-numeros-s1').textContent };
    """)
    assert "1.300 publicadas" in saida["linha"]


# ── O cliente do Supabase, como ele existe DE VERDADE na pagina ─────────────

def test_o_painel_NAO_publica_o_cliente_do_supabase_em_window():
    """O fato que quebrou esta tela, medido e fixado.

    `supabase-config.js` faz `let supabaseClient = null;` no topo de um script
    classico. `let`/`const` ali criam a ligacao no ESCOPO DE SCRIPT, nunca em
    `window` -- so `var` cria propriedade no objeto global.

    Se um dia alguem trocar aquele `let` por `var`, este teste reprova e avisa:
    nao e um problema, mas e uma mudanca de contrato que esta tela depende de
    conhecer.
    """
    assert "let supabaseClient" in _ler("frontend/supabase-config.js")

    saida = _no_navegador("""
        return {
            em_window: typeof window.supabaseClient,
            window_tem_a_chave: Object.prototype.hasOwnProperty.call(window, 'supabaseClient'),
            nu: typeof supabaseClient,
            nu_tem_auth: !!(typeof supabaseClient !== 'undefined'
                            && supabaseClient && supabaseClient.auth),
        };
    """, config_real=True)
    assert saida["em_window"] == "undefined"
    assert saida["window_tem_a_chave"] is False
    assert saida["nu"] == "object"
    assert saida["nu_tem_auth"] is True


def test_a_tela_acha_o_cliente_do_supabase_como_o_painel_o_declara():
    """O teste que teria pego o defeito de 16/08/2026.

    Os outros testes semeiam `window.supabaseClient = ...` e passavam mesmo com
    a tela quebrada: sem o `let` do config real, o identificador nu cai na
    propriedade de `window` e tudo parece funcionar. O arnes era mais generoso
    que a pagina -- a mesma licao do dube de banco que era mais generoso que o
    Supabase.

    Aqui o `supabase-config.js` de verdade entra na pagina, e o `let` dele passa
    a sombrear `window`. So acha o cliente quem o procura pelo nome nu.
    """
    saida = _no_navegador("""
        let enviado = null;
        window.fetch = async (url, o) => {
            enviado = { url, auth: (o.headers || {})['Authorization'] };
            return { ok: true, json: async () => ({ pedidos: [] }) };
        };
        await IdealControl.listarRecentes();
        return { enviado,
                 recentes: document.getElementById('ic-recentes').textContent };
    """, config_real=True)
    # A requisicao SAIU, com o token do painel no cabecalho.
    assert saida["enviado"] is not None, "a tela nao chegou a chamar o motor"
    # 16/08/2026: o motor desta tela e a Edge Function `acesso-interno`, e nao
    # mais o `/api/acesso/interno` do Render. Ver o comentario do `BASE` em
    # `frontend/ideal-control.js`.
    assert "/functions/v1/acesso-interno/pedidos" in saida["enviado"]["url"]
    assert saida["enviado"]["auth"] == "Bearer jwt-do-painel"
    # E nada de "login nao carregou".
    assert "login" not in saida["recentes"].lower()


def test_o_caminho_inteiro_com_o_config_real_chega_ao_motor():
    """Do clique na busca ate a chamada, com o cliente do Supabase de verdade:
    e o que o usuario fez e nao funcionou, em 16/08/2026.

    A busca e por CLIENTE desde 18/08/2026, entao o caminho tem duas pernas --
    abrir o cliente, e tocar no pedido dele."""
    saida = _no_navegador("""
        const chamadas = [];
        window.fetch = async (url, o) => {
            chamadas.push(url);
            return { ok: true, json: async () => {
                if (url.indexOf('/clientes/') >= 0) { return window.CLIENTE_COM_PEDIDO; }
                if (url.indexOf('/pedidos/18560') >= 0) { return window.PAINEL; }
                return { pedidos: [] };
            } };
        };
        IdealControl.iniciar();
        document.getElementById('ic-busca').value = '14';
        document.getElementById('ic-buscar').click();
        await new Promise(r => setTimeout(r, 200));
        const doCliente = {
            secao: document.getElementById('ic-cliente-secao').style.display,
            nome: document.getElementById('ic-cliente-nome').textContent,
            pedidos: document.getElementById('ic-cliente-pedidos').textContent,
        };
        document.getElementById('ic-pedido-18560').click();
        await new Promise(r => setTimeout(r, 200));
        return { chamadas, doCliente,
                 carregando: document.getElementById('ic-carregando').style.display,
                 conteudo: document.getElementById('ic-conteudo').style.display,
                 titulo: document.getElementById('ic-titulo').textContent };
    """, config_real=True)
    assert any("/clientes/14" in c for c in saida["chamadas"]), saida["chamadas"]
    assert saida["doCliente"]["secao"] != "none"
    assert "DANIEL MOREIRA" in saida["doCliente"]["nome"]
    assert "18560" in saida["doCliente"]["pedidos"]
    assert "Baile do Hawaii" in saida["doCliente"]["pedidos"]
    # E o toque no pedido abre o painel de configuracao, como antes.
    assert any("/pedidos/18560" in c for c in saida["chamadas"]), saida["chamadas"]
    assert saida["carregando"] == "none"
    assert saida["conteudo"] != "none"
    assert "Baile do Hawaii" in saida["titulo"]


# ── Todo pedido alcancavel por este menu (04/09/2026) ───────────────────────
#
# Decisao do usuario: "todos os pedidos devem ficar disponiveis para
# visualizacao e edicao pelo menu ideal control".
#
# Nao estavam. As duas listas da tela -- os recentes e os pedidos do cliente --
# saiam de `producao_acesso_pedidos`, ou seja, so o que JA tinha subido ao
# controle. O cliente 11406, de verdade, tem quatro pedidos com modelo e a tela
# mostrava um. E a busca so aceitava numero de CLIENTE: quem digitasse o numero
# de um pedido abria a ficha de outra pessoa, porque as duas faixas de numero se
# cruzam -- 21524 e um pedido e tambem um cliente.


def test_a_lista_do_cliente_traz_tambem_o_pedido_que_nunca_subiu():
    saida = _no_navegador(SERVIDOR + """
        window.__respostas['/clientes/14'] = window.CLIENTE_COM_PEDIDO;
        await IdealControl.abrirCliente(14);
        return {
            pedidos: document.getElementById('ic-cliente-pedidos').textContent,
            botoes: document.querySelectorAll('#ic-cliente-pedidos button').length,
            semModelo: document.getElementById('ic-cliente-sem-modelo').textContent,
            semModeloVisivel:
                document.getElementById('ic-cliente-sem-modelo').style.display !== 'none',
        };
    """)
    assert "18560" in saida["pedidos"] and "21708" in saida["pedidos"]
    assert saida["botoes"] == 2
    # Cada linha diz em que pe o pedido esta -- senao os dois pareceriam iguais.
    assert "1.000 publicados" in saida["pedidos"]
    assert "ainda não publicado" in saida["pedidos"]
    # E os que ficaram de fora sao contados, em vez de sumirem calados.
    assert saida["semModeloVisivel"] is True
    assert "3 pedidos" in saida["semModelo"]


def test_abrir_pedido_pelo_numero_e_um_botao_separado_do_cliente():
    """O mesmo numero pode ser de um cliente e de um pedido.

    Adivinhar abriria a ficha de outra pessoa sem parecer erro: uma tela
    plausivel, com nome, e-mail e nenhum pedido. Por isso sao dois botoes -- e
    este teste prova que cada um vai para a sua rota.
    """
    saida = _no_navegador(SERVIDOR + """
        window.__respostas['/clientes/21524'] = window.CLIENTE_COM_PEDIDO;
        window.__respostas['/pedidos/21524'] = window.PAINEL;
        document.getElementById('ic-busca').value = '21524';
        document.getElementById('ic-buscar-pedido').click();
        await new Promise(r => setTimeout(r, 200));
        return {
            caminhos: window.__chamadas.map(c => c.caminho),
            conteudo: document.getElementById('ic-conteudo').style.display,
            titulo: document.getElementById('ic-titulo').textContent,
        };
    """)
    assert "/pedidos/21524" in saida["caminhos"], saida["caminhos"]
    assert "/clientes/21524" not in saida["caminhos"],         "o botao de pedido foi parar na rota de cliente"
    assert saida["conteudo"] != "none"
    assert "18560" in saida["titulo"] or "Baile do Hawaii" in saida["titulo"]


def test_o_botao_de_cliente_continua_indo_para_a_rota_de_cliente():
    saida = _no_navegador(SERVIDOR + """
        window.__respostas['/clientes/21524'] = window.CLIENTE_COM_PEDIDO;
        document.getElementById('ic-busca').value = '21524';
        document.getElementById('ic-buscar').click();
        await new Promise(r => setTimeout(r, 200));
        return window.__chamadas.map(c => c.caminho);
    """)
    assert "/clientes/21524" in saida, saida
    assert "/pedidos/21524" not in saida, saida


# ── Acesso do cliente ───────────────────────────────────────────────────────
#
# Decisao de 17/08/2026: o QR do Pedido saiu, e quem traz os pedidos para o
# aplicativo e a CONTA do cliente. O bloco abaixo e a porta que a grafica usa
# para abrir essa conta -- e a senha provisoria que sai dali aparece UMA vez.

CLIENTE = {"id_cliente": 14, "nome": "DANIEL MOREIRA", "email": "daniel@exemplo.com",
           "contas": [{"auth_user_id": "u-1", "email": "maria@exemplo.com", "criada_aqui": True,
                       "senha_provisoria": False, "criado_em": "2026-08-17T10:00:00Z"}]}


def test_o_bloco_acesso_do_cliente_mostra_o_cliente_e_as_contas():
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        await IdealControl.abrirPedido(20272);
        const bloco = document.getElementById('ic-acesso-secao');
        return { visivel: bloco.style.display !== 'none', texto: bloco.textContent,
                 email: document.getElementById('ic-acesso-email').value,
                 link: document.getElementById('ic-qr-link').textContent };
    """ % json.dumps(CLIENTE))
    assert saida["visivel"] is True
    assert "DANIEL MOREIRA" in saida["texto"] and "maria@exemplo.com" in saida["texto"]
    assert "Nova senha provisória" in saida["texto"]
    assert saida["email"] == "daniel@exemplo.com"
    assert saida["link"] == "https://ideal-imposition.vercel.app/ic/"


def test_liberar_acesso_mostra_a_senha_provisoria_uma_vez():
    """A senha tem de estar VISIVEL, e nao so escrita no documento.

    Este teste media `senha.style.display` -- do proprio quadro da senha -- e
    passava verde enquanto a tela mostrava um vazio. O defeito estava um nivel
    acima: a releitura chamava `desenharAcessoDoCliente()` SEM o cliente, a
    funcao entendia "pedido sem cliente no ERP" e escondia a SECAO inteira. O
    quadro da senha continuava com `display` vazio, dentro de um pai
    escondido.

    Custou o dia 04/09/2026: o acesso era liberado no servidor (a conta nasceu,
    o log mostra 200), o atendente nao via senha nenhuma, e sem senha ninguem
    entra no aplicativo para testar o pedido. Por isso a pergunta aqui passou a
    ser a do olho: `offsetParent` e altura maior que zero.
    """
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com', ja_tinha_conta: false, senha_provisoria: 'K7M2PQ9X' };
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 200));
        const senha = document.getElementById('ic-acesso-senha');
        return { visivel: senha.offsetParent !== null
                          && senha.getBoundingClientRect().height > 0,
                 secao: document.getElementById('ic-acesso-secao').style.display,
                 texto: senha.textContent,
                 corpo: window.__chamadas.find(c => c.caminho === '/clientes/14/contas').corpo };
    """ % json.dumps(CLIENTE))
    assert saida["secao"] != "none", "a secao inteira sumiu, levando a senha junto"
    assert saida["visivel"] and "K7M2PQ9X" in saida["texto"]
    assert saida["corpo"] == {"email": "daniel@exemplo.com"}


# A OUTRA PORTA. O bloco "Acesso do cliente" e desenhado por dois caminhos: a
# abertura de um pedido e a busca por numero do cliente -- e e pela busca que
# entra o cliente novo, justamente quem ainda nao tem pedido com controle e mais
# precisa do acesso liberado. Os testes acima so cobriam a primeira porta.

CLIENTE_SEM_CONTA = json.loads(json.dumps(CLIENTE_FALSO))
CLIENTE_SEM_CONTA["cliente"]["contas"] = []

CLIENTE_COM_CONTA_NOSSA = json.loads(json.dumps(CLIENTE_FALSO))
CLIENTE_COM_CONTA_NOSSA["cliente"]["contas"] = [
    {"auth_user_id": "u-1", "email": "maria@exemplo.com", "criada_aqui": True,
     "senha_provisoria": False, "criado_em": "2026-08-17T10:00:00Z"},
]


def test_liberar_acesso_pela_busca_por_cliente_tambem_mostra_a_senha():
    """Sem pedido aberto, a releitura nao pode ir a `/pedidos/null`.

    `estado.pedido` e nulo nesta porta. A releitura montava
    `/pedidos/null`, o servidor devolveria 422, e o atendente leria "nao
    consegui atualizar a lista de contas" logo depois de o acesso ter sido
    liberado de verdade.
    """
    saida = _no_navegador(SERVIDOR + """
        window.__respostas['/clientes/14'] = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com.br', ja_tinha_conta: false, senha_provisoria: 'K7M2PQ9X' };
        await IdealControl.abrirCliente(14);
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 200));
        const senha = document.getElementById('ic-acesso-senha');
        return { visivel: senha.offsetParent !== null
                          && senha.getBoundingClientRect().height > 0,
                 texto: senha.textContent,
                 caminhos: window.__chamadas.map(c => c.caminho) };
    """ % json.dumps(CLIENTE_SEM_CONTA))
    assert saida["visivel"] and "K7M2PQ9X" in saida["texto"]
    assert not [c for c in saida["caminhos"] if "null" in c or "undefined" in c],         saida["caminhos"]


def test_nova_senha_provisoria_pela_busca_por_cliente_aparece_na_tela():
    """A senha nova nasce ao custo da anterior -- entao ela TEM de aparecer.

    Nesta porta `estado.painel` e nulo, e era dele que saia o dono da conta.
    O `clienteAlvo` saia `undefined`, a conferencia "a tela ainda mostra este
    cliente?" respondia nao, e a tela avisava que o atendente tinha trocado de
    cliente -- com a senha anterior ja invalidada no servidor.
    """
    saida = _no_navegador(SERVIDOR + """
        window.__respostas['/clientes/14'] = %s;
        window.__respostas['/contas/u-1/nova-senha'] = { senha_provisoria: 'W4T8ZR2M' };
        await IdealControl.abrirCliente(14);
        document.querySelectorAll('#ic-acesso-contas button')[0].click();
        await new Promise(r => setTimeout(r, 20));
        [].slice.call(document.querySelectorAll('#ic-acesso-contas button'))
            .filter(b => b.textContent === 'Sim, gerar')[0].click();
        await new Promise(r => setTimeout(r, 200));
        const senha = document.getElementById('ic-acesso-senha');
        return { visivel: senha.offsetParent !== null
                          && senha.getBoundingClientRect().height > 0,
                 texto: senha.textContent,
                 avisos: (window._avisos || []).map(a => a[0]) };
    """ % json.dumps(CLIENTE_COM_CONTA_NOSSA))
    assert saida["visivel"] and "W4T8ZR2M" in saida["texto"]
    assert not saida["avisos"], saida["avisos"]


def test_liberar_acesso_tambem_poe_o_link_de_whatsapp():
    """O link nasce junto com a senha, com a MESMA mensagem que o atendente
    manda ao cliente -- e-mail, senha e URL de instalacao, todos codificados
    na query string do `wa.me`."""
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com', ja_tinha_conta: false, senha_provisoria: 'K7M2PQ9X' };
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 150));
        const link = document.getElementById('ic-acesso-whatsapp');
        const href = link.getAttribute('href');
        return {
            visivel: link.style.display !== 'none',
            texto: link.textContent,
            target: link.target,
            rel: link.rel,
            prefixo: href ? href.indexOf('https://wa.me/?text=') : -1,
            mensagem: href ? decodeURIComponent(href.split('?text=')[1]) : null,
        };
    """ % json.dumps(CLIENTE))
    assert saida["visivel"] is True
    assert saida["texto"] == "Enviar por WhatsApp"
    assert saida["target"] == "_blank"
    assert "noopener" in saida["rel"]
    assert saida["prefixo"] == 0
    assert saida["mensagem"] == (
        "Olá! Seu acesso ao Ideal Control (controle de acesso da Ingresso Ideal) "
        "está liberado.\n\n"
        "1) Instale o aplicativo: https://ideal-imposition.vercel.app/ic/\n"
        "2) Entre com o e-mail: daniel@exemplo.com\n"
        "3) Senha provisória: K7M2PQ9X\n\n"
        "No primeiro acesso o aplicativo pede para você escolher a sua senha."
    )


def test_email_que_ja_tinha_conta_so_liga_e_diz_isso():
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com', ja_tinha_conta: true, senha_provisoria: null };
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 60));
        return document.getElementById('ic-acesso-secao').textContent;
    """ % json.dumps(CLIENTE))
    assert "já tem conta" in saida and "senha que já usa" in saida


def test_conta_que_a_grafica_criou_manda_gerar_outra_senha_e_nao_a_do_vibe():
    """"Já tinha conta" sao duas situacoes bem diferentes.

    Se a conta e do Vibe, o cliente entra com a senha que ja usa. Se fomos NOS
    que a criamos, nao existe senha que ele conheca -- e mandar procurar uma e
    mandar procurar o que nao ha. Em 04/09/2026 esta era a unica frase, e ela
    saiu para dois clientes cuja senha ninguem tinha visto.
    """
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com', ja_tinha_conta: true, criada_aqui: true, senha_provisoria: null };
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 200));
        return document.getElementById('ic-acesso-aviso').textContent;
    """ % json.dumps(CLIENTE))
    assert "Nova senha provisória" in saida, saida
    assert "senha que já usa" not in saida, saida


def test_email_que_ja_tinha_conta_nao_mostra_link_de_whatsapp():
    """Sem senha provisoria nova, nao ha o que mandar -- o link fica escondido."""
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com', ja_tinha_conta: true, senha_provisoria: null };
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 150));
        const link = document.getElementById('ic-acesso-whatsapp');
        return { visivel: link.style.display !== 'none', href: link.getAttribute('href') };
    """ % json.dumps(CLIENTE))
    assert saida["visivel"] is False
    assert saida["href"] is None


def test_o_bloco_some_quando_o_pedido_nao_tem_cliente_no_erp():
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = null;
        await IdealControl.abrirPedido(20272);
        return document.getElementById('ic-acesso-secao').style.display;
    """)
    assert saida == "none"


# ── A senha provisoria e o pedido que esta na tela ──────────────────────────
#
# O pior defeito que este bloco poderia ter: a senha de um cliente aparecer
# embaixo do nome de outro. Basta a resposta demorar e o atendente abrir o
# proximo pedido enquanto espera -- e numa grafica ele faz exatamente isso.

OUTRO_PEDIDO = json.loads(json.dumps(PAINEL_FALSO))
OUTRO_PEDIDO["pedido"] = 20281
OUTRO_PEDIDO["cliente"] = {"id_cliente": 99, "nome": "OUTRA EMPRESA",
                           "email": "outra@exemplo.com", "contas": []}


def test_a_senha_provisoria_nunca_aparece_no_pedido_errado():
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        // O POST demora: da tempo de trocar de pedido antes de a resposta cair.
        window.__respostas['/clientes/14/contas'] = new Promise(function (ok) {
            setTimeout(function () { ok({ email: 'daniel@exemplo.com',
                ja_tinha_conta: false, senha_provisoria: 'K7M2PQ9X' }); }, 80);
        });
        window.__respostas['/pedidos/20281'] = %s;
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await IdealControl.abrirPedido(20281);
        await new Promise(r => setTimeout(r, 200));
        return {
            secao: document.getElementById('ic-acesso-secao').textContent,
            senha_visivel: document.getElementById('ic-acesso-senha').style.display !== 'none',
            valor: document.getElementById('ic-acesso-senha-valor').textContent,
            cliente: document.getElementById('ic-acesso-cliente').textContent,
            avisos: (window._avisos || []).map(function (a) { return a[1] + ': ' + a[0]; }),
        };
    """ % (json.dumps(CLIENTE), json.dumps(OUTRO_PEDIDO)))
    # A tela e a do pedido novo...
    assert "OUTRA EMPRESA" in saida["cliente"]
    # ...e a senha do pedido anterior NAO esta nela, em canto nenhum.
    assert saida["senha_visivel"] is False
    assert "K7M2PQ9X" not in saida["valor"]
    assert "K7M2PQ9X" not in saida["secao"]
    # O atendente e avisado, com o NOME DO CLIENTE de quem era a senha: desde
    # 18/08/2026 esta tela e aberta pelo numero do cliente, e mandar "abra o
    # pedido X de novo" apontaria para uma busca que nao existe mais.
    assert any("DANIEL MOREIRA" in a and a.startswith("warning")
               for a in saida["avisos"]), saida["avisos"]


def test_o_link_de_whatsapp_tambem_nao_vaza_para_o_pedido_errado():
    """A mesma fuga, pela porta do link: o `href` carrega e-mail e senha em
    claro, entao precisa sumir por inteiro -- nao so ficar escondido."""
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = new Promise(function (ok) {
            setTimeout(function () { ok({ email: 'daniel@exemplo.com',
                ja_tinha_conta: false, senha_provisoria: 'K7M2PQ9X' }); }, 80);
        });
        window.__respostas['/pedidos/20281'] = %s;
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await IdealControl.abrirPedido(20281);
        await new Promise(r => setTimeout(r, 200));
        const link = document.getElementById('ic-acesso-whatsapp');
        return { visivel: link.style.display !== 'none', href: link.getAttribute('href') };
    """ % (json.dumps(CLIENTE), json.dumps(OUTRO_PEDIDO)))
    assert saida["visivel"] is False
    assert saida["href"] is None


def test_a_nova_senha_tambem_nao_vaza_para_o_pedido_seguinte():
    """O mesmo buraco, pela outra porta: o botao 'Nova senha provisoria'."""
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/contas/u-1/nova-senha'] = new Promise(function (ok) {
            setTimeout(function () { ok({ senha_provisoria: 'ZZ9TOP44' }); }, 80);
        });
        window.__respostas['/pedidos/20281'] = %s;
        await IdealControl.abrirPedido(20272);
        const achar = (t) => [...document.querySelectorAll('#ic-acesso-contas button')]
            .find(b => b.textContent.indexOf(t) >= 0);
        achar('Nova senha').click();
        achar('Sim, gerar').click();
        await IdealControl.abrirPedido(20281);
        await new Promise(r => setTimeout(r, 200));
        return {
            secao: document.getElementById('ic-acesso-secao').textContent,
            senha_visivel: document.getElementById('ic-acesso-senha').style.display !== 'none',
            avisos: (window._avisos || []).map(function (a) { return a[1] + ': ' + a[0]; }),
        };
    """ % (json.dumps(CLIENTE), json.dumps(OUTRO_PEDIDO)))
    assert saida["senha_visivel"] is False
    assert "ZZ9TOP44" not in saida["secao"]
    assert any("DANIEL MOREIRA" in a and a.startswith("warning")
               for a in saida["avisos"]), saida["avisos"]


def test_o_link_de_whatsapp_tambem_nao_vaza_pela_porta_da_nova_senha():
    """O mesmo cuidado do teste acima, mas para o link: uma resposta de
    'nova senha' que chega depois de o atendente trocar de pedido nao pode
    deixar o `href` armado com a senha do cliente anterior."""
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/contas/u-1/nova-senha'] = new Promise(function (ok) {
            setTimeout(function () { ok({ senha_provisoria: 'ZZ9TOP44' }); }, 80);
        });
        window.__respostas['/pedidos/20281'] = %s;
        await IdealControl.abrirPedido(20272);
        const achar = (t) => [...document.querySelectorAll('#ic-acesso-contas button')]
            .find(b => b.textContent.indexOf(t) >= 0);
        achar('Nova senha').click();
        achar('Sim, gerar').click();
        await IdealControl.abrirPedido(20281);
        await new Promise(r => setTimeout(r, 200));
        const link = document.getElementById('ic-acesso-whatsapp');
        return { visivel: link.style.display !== 'none', href: link.getAttribute('href') };
    """ % (json.dumps(CLIENTE), json.dumps(OUTRO_PEDIDO)))
    assert saida["visivel"] is False
    assert saida["href"] is None


def test_nova_senha_provisoria_usa_o_email_da_conta_no_link_de_whatsapp():
    """A senha nova e de UMA conta especifica -- maria@exemplo.com, e nao do
    e-mail principal do cliente (daniel@exemplo.com). O link tem de mandar a
    senha para quem de fato vai usa-la para entrar."""
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/contas/u-1/nova-senha'] = { senha_provisoria: 'ZZ9TOP44' };
        await IdealControl.abrirPedido(20272);
        const achar = (t) => [...document.querySelectorAll('#ic-acesso-contas button')]
            .find(b => b.textContent.indexOf(t) >= 0);
        achar('Nova senha').click();
        achar('Sim, gerar').click();
        await new Promise(r => setTimeout(r, 60));
        const link = document.getElementById('ic-acesso-whatsapp');
        const href = link.getAttribute('href');
        return {
            visivel: link.style.display !== 'none',
            mensagem: href ? decodeURIComponent(href.split('?text=')[1]) : null,
        };
    """ % json.dumps(CLIENTE))
    assert saida["visivel"] is True
    assert "maria@exemplo.com" in saida["mensagem"]
    assert "ZZ9TOP44" in saida["mensagem"]
    assert "daniel@exemplo.com" not in saida["mensagem"]


def test_falha_ao_reler_o_pedido_nao_desmente_o_acesso_liberado():
    """O acesso FOI liberado e a senha esta na tela; so a releitura falhou.

    Dizer "nao consegui liberar o acesso" aqui faria o atendente jogar fora uma
    senha boa -- e ela nao aparece de novo.
    """
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com',
            ja_tinha_conta: false, senha_provisoria: 'K7M2PQ9X' };
        await IdealControl.abrirPedido(20272);
        // A releitura so passa a falhar DEPOIS de o pedido ja estar na tela.
        window.__respostas['/pedidos/20272'] = new Error('a rede caiu no meio');
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 120));
        return {
            visivel: document.getElementById('ic-acesso-senha').style.display !== 'none',
            valor: document.getElementById('ic-acesso-senha-valor').textContent,
            aviso: document.getElementById('ic-acesso-aviso').textContent,
            travado: document.getElementById('ic-acesso-liberar').disabled,
            avisos: (window._avisos || []).map(function (a) { return a[1] + ': ' + a[0]; }),
        };
    """ % json.dumps(CLIENTE))
    assert saida["visivel"] is True
    assert saida["valor"] == "K7M2PQ9X"
    assert "Não consegui liberar" not in saida["aviso"]
    # E o botao volta a funcionar: a tela nao fica travada por causa disso.
    assert saida["travado"] is False
    assert any("Acesso liberado" in a and a.startswith("warning")
               for a in saida["avisos"]), saida["avisos"]


def test_email_invalido_nem_chega_a_sair_da_tela():
    saida = _no_navegador(SERVIDOR + """
        window.__painel.cliente = %s;
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-email').value = 'daniel arroba exemplo';
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 60));
        return {
            aviso: document.getElementById('ic-acesso-aviso').textContent,
            visivel: document.getElementById('ic-acesso-aviso').style.display !== 'none',
            foi_a_rede: window.__chamadas.some(function (c) {
                return c.caminho.indexOf('/contas') >= 0; }),
        };
    """ % json.dumps(CLIENTE))
    assert saida["visivel"] is True
    assert saida["aviso"] == "Escreva um e-mail válido."
    assert saida["foi_a_rede"] is False


# ── O espelho: o que o cliente salva no aplicativo aparece aqui ─────────────
#
# Decisao do usuario em 18/08/2026: "Configuracoes salvas no aparelho devem ser
# espelhadas no menu ideal control do imposition, e vice versa". As duas coisas
# que faltavam eram a SITUACAO do evento (o cliente inativa e finaliza no
# celular dele) e o setor BLOQUEADO INTEIRO.


def test_a_situacao_do_evento_aparece_e_pode_ser_trocada_daqui():
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        const ativo = {
            frase: document.getElementById('ic-ev-situacao').textContent,
            ativar: document.getElementById('ic-ev-ativar').textContent,
            finalizar: document.getElementById('ic-ev-finalizar').textContent,
        };
        window._chamadas.length = 0;
        document.getElementById('ic-ev-ativar').click();
        await new Promise(r => setTimeout(r, 160));
        const inativou = window._chamadas.filter(c => c.metodo === 'PATCH');

        // Agora o evento volta do servidor FINALIZADO, como o cliente o
        // deixaria pela engrenagem do celular dele.
        window.PAINEL.evento.status = 'finalizado';
        await IdealControl.abrirPedido(18560);
        const finalizado = {
            frase: document.getElementById('ic-ev-situacao').textContent,
            ativarVisivel: document.getElementById('ic-ev-ativar').style.display,
            finalizar: document.getElementById('ic-ev-finalizar').textContent,
        };
        return { ativo, inativou, finalizado };
    """)
    assert "Ativo" in saida["ativo"]["frase"]
    assert saida["ativo"]["ativar"] == "Inativar este evento"
    assert saida["ativo"]["finalizar"] == "Finalizar este evento"
    # Inativar manda o MESMO status que a engrenagem do cliente manda.
    assert saida["inativou"][0]["caminho"] == "/eventos/ev-1"
    assert saida["inativou"][0]["corpo"]["status"] == "encerrado"
    # Finalizado: a frase diz onde ele foi parar, e "Inativar" some -- um evento
    # arquivado nao se inativa, ele se reabre.
    assert "Finalizado" in saida["finalizado"]["frase"]
    assert "finalizados" in saida["finalizado"]["frase"]
    assert saida["finalizado"]["ativarVisivel"] == "none"
    assert saida["finalizado"]["finalizar"] == "Reabrir este evento"


def test_o_setor_que_o_CLIENTE_bloqueou_inteiro_aparece_com_o_motivo():
    """O atendente atendia o telefone sem saber que o proprio dono tinha
    fechado aquele portao."""
    saida = _no_navegador(SERVIDOR + """
        window.PAINEL.setores[0].bloqueado = true;
        window.PAINEL.setores[0].bloqueado_motivo = 'obra na entrada norte';
        await IdealControl.abrirPedido(18560);
        const bloco = document.getElementById('ic-setor-bloqueio-s1');
        const antes = {
            texto: bloco.textContent,
            liberar: !!document.getElementById('ic-setor-liberar-s1'),
            formulario: !!document.getElementById('ic-setor-bloquear-s1'),
        };
        window._chamadas.length = 0;
        document.getElementById('ic-setor-liberar-s1').click();
        await new Promise(r => setTimeout(r, 160));
        return { antes, chamadas: window._chamadas.filter(c => c.metodo === 'PATCH') };
    """)
    assert "BLOQUEADO" in saida["antes"]["texto"]
    assert "obra na entrada norte" in saida["antes"]["texto"]
    assert saida["antes"]["liberar"] is True
    assert saida["antes"]["formulario"] is False, (
        "com o setor bloqueado, o que falta e liberar -- nao bloquear de novo")
    assert saida["chamadas"][0]["caminho"] == "/setores/s1"
    assert saida["chamadas"][0]["corpo"]["bloqueado"] is False


def test_a_grafica_tambem_pode_bloquear_o_setor_inteiro_com_motivo():
    saida = _no_navegador(SERVIDOR + """
        await IdealControl.abrirPedido(18560);
        document.getElementById('ic-setor-bloq-motivo-s1').value = 'lote nao pago';
        window._chamadas.length = 0;
        document.getElementById('ic-setor-bloquear-s1').click();
        await new Promise(r => setTimeout(r, 160));
        return { chamadas: window._chamadas.filter(c => c.metodo === 'PATCH') };
    """)
    assert saida["chamadas"][0]["caminho"] == "/setores/s1"
    assert saida["chamadas"][0]["corpo"]["bloqueado"] is True
    assert saida["chamadas"][0]["corpo"]["bloqueado_motivo"] == "lote nao pago"


def test_o_aparelho_pausado_pelo_cliente_aparece_como_pausado():
    """Pausar e excluir sao as opcoes do aplicativo do cliente desde
    18/08/2026, e as duas mexem na mesma linha que esta tela mostra."""
    saida = _no_navegador(SERVIDOR + """
        window.PAINEL.aparelhos[0].status = 'pausado';
        await IdealControl.abrirPedido(18560);
        const cartao = document.getElementById('ic-aparelhos').textContent;
        window._chamadas.length = 0;
        document.getElementById('ic-ap-pausar-a1').click();
        await new Promise(r => setTimeout(r, 160));
        return { cartao, chamadas: window._chamadas.filter(c => c.metodo === 'PATCH'),
                 rotulo: document.getElementById('ic-ap-pausar-a1').textContent };
    """)
    assert "Pausado" in saida["cartao"]
    # Pausado, o botao oferece a VOLTA -- e retomar nao pergunta nada.
    assert saida["rotulo"] == "Retomar"
    assert saida["chamadas"][0]["corpo"]["status"] == "ativo"


def test_excluir_o_aparelho_daqui_manda_um_DELETE():
    saida = _no_navegador("""
        window.confirm = () => true;
        %s
        await IdealControl.abrirPedido(18560);
        window._chamadas.length = 0;
        document.getElementById('ic-ap-excluir-a1').click();
        await new Promise(r => setTimeout(r, 160));
        return { chamadas: window._chamadas.filter(c => c.metodo === 'DELETE') };
    """ % SERVIDOR)
    assert saida["chamadas"][0]["caminho"] == "/aparelhos/a1"
