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


def _no_navegador(script_extra, aceitar_dialogo=False):
    """Abre a secao do index.html num Chrome de verdade, sem backend.

    A pagina hospedeira e minima de proposito: carregar o index.html inteiro
    traria fabric.js, pdf-lib, o SDK do Supabase e trinta mil linhas de
    script.js -- nada disso participa desta tela, e cada um deles e uma forma
    de o teste falhar por motivo que nao e o dele.
    """
    hospedeira = (
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">'
        '<link rel="stylesheet" href="/style.css"></head><body>'
        '<main class="main-content">' + _secao_do_index() + '</main>'
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
SERVIDOR = """
    const chamadas = [];
    IdealControl._pedirParaTeste = async (caminho, opcoes) => {
        chamadas.push({ caminho, metodo: (opcoes || {}).method || 'GET',
                        corpo: (opcoes || {}).body ? JSON.parse(opcoes.body) : null });
        if (caminho.startsWith('/pedidos?')) return { pedidos: [] };
        if (caminho.indexOf('/dashboard') >= 0) return window.DASHBOARD;
        if (caminho.startsWith('/pedidos/')) return window.PAINEL;
        return { ok: true };
    };
    window._chamadas = chamadas;
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


def test_criar_aparelho_leva_os_setores_acesos_e_mostra_o_codigo_uma_vez():
    saida = _no_navegador("""
        const chamadas = [];
        IdealControl._pedirParaTeste = async (caminho, opcoes) => {
            chamadas.push({ caminho, metodo: (opcoes || {}).method || 'GET',
                            corpo: (opcoes || {}).body ? JSON.parse(opcoes.body) : null });
            if (caminho.startsWith('/pedidos?')) return { pedidos: [] };
            if (caminho.indexOf('/dashboard') >= 0) return window.DASHBOARD;
            if (caminho.startsWith('/pedidos/')) return window.PAINEL;
            if (caminho.indexOf('/aparelhos') >= 0)
                return { id: 'a2', nome: 'Portao B', codigo: 'ABC234' };
            return { ok: true };
        };
        window._chamadas = chamadas;
    IdealControl.iniciar();
        await IdealControl.abrirPedido(18560);

        document.getElementById('ic-novo-ap-nome').value = 'Portao B';
        document.getElementById('ic-novo-ap-setores-s2').click();
        chamadas.length = 0;
        document.getElementById('ic-novo-ap-criar').click();
        await new Promise(r => setTimeout(r, 160));

        return { chamadas,
                 codigo: document.getElementById('ic-codigo-valor').textContent,
                 titulo: document.getElementById('ic-codigo-titulo').textContent,
                 caixa: document.getElementById('ic-codigo-caixa').style.display };
    """)
    criacao = [c for c in saida["chamadas"] if c["metodo"] == "POST"]
    assert criacao[0]["caminho"] == "/eventos/ev-1/aparelhos"
    assert criacao[0]["corpo"]["nome"] == "Portao B"
    assert criacao[0]["corpo"]["setores"] == ["s2"]
    assert saida["codigo"] == "ABC234"
    assert "Portao B" in saida["titulo"]
    assert saida["caixa"] != "none"


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
    """O caso mais comum na grafica: impresso e ainda nao reivindicado. A tela
    tem de dizer o proximo passo, e nao so ficar vazia."""
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
    assert "QR do Pedido" in saida["aviso"]
    assert saida["dashboard"] == "none"
    assert saida["setores"] == "none"
    # ...mas os modelos do ERP continuam a vista: e o que o pedido TEM.
    assert saida["modelos"] == 3


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
