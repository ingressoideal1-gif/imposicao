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


def test_todo_botao_tem_rotulo_em_texto():
    """Regra do projeto: controle novo precisa de rotulo em texto.

    Um botao so com icone obriga o dono a adivinhar, e ele esta no celular,
    talvez na porta do evento.
    """
    html = _ler("frontend/controle.html")
    for botao in re.findall(r"<button[^>]*>(.*?)</button>", html, re.S):
        sem_tag = re.sub(r"<[^>]+>", "", botao)
        letras = re.sub(r"[^A-Za-zÀ-ÿ]", "", sem_tag)
        assert len(letras) >= 3, f"botao sem rotulo em texto: {botao.strip()[:60]}"


# ── No navegador ────────────────────────────────────────────────────────────

PAINEL_FALSO = {
    "evento": {"id": "ev-1", "nome_evento": "Baile do Hawaii",
               "data_evento": None, "local_evento": "Clube"},
    "setores": [
        {"id": "s1", "nome": "PISTA", "quantidade": 5000, "publicadas": 5000,
         "lotacao": None, "tipo_uso": "unico", "pedido_id_int": 18560, "modelo_id": 1000110},
        {"id": "s2", "nome": "VIP", "quantidade": 800, "publicadas": 640,
         "lotacao": 700, "tipo_uso": "reentrada", "pedido_id_int": 18560, "modelo_id": 1000111},
    ],
    "aparelhos": [{"id": "a1", "nome": "Portao A", "status": "ativo",
                   "ultimo_visto": None, "setores": ["s1"]}],
    "pedidos": [{"pedido_id_int": 18560, "publicado_em": "2026-08-14T00:00:00Z",
                 "total_credenciais": 5640}],
    "codigos_cliente": 42,
}


def _no_navegador(script_extra):
    """Abre o controle.html num Chrome de verdade, com o backend interceptado.

    O `controle.html` referencia os scripts por caminho ABSOLUTO (`/controle.js`),
    que é como o Vercel e a estação os servem. Sob `file://` isso apontaria para
    a raiz do disco, e a página carregaria vazia — sem erro nenhum, o que é o
    pior modo de falhar num teste. Por isso o driver intercepta cada pedido e
    responde com o arquivo lido de `frontend/`.
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

  // `abrirCaixaDeSenha()` usa `window.prompt`, de propósito -- é a única caixa
  // que o navegador não guarda em preenchimento automático. Sem tratar o
  // evento `dialog`, o CDP prende a página esperando alguém decidir, e o
  // teste trava. Descartar sempre equivale a tocar em "Cancelar": é o caminho
  // que o dono segue quando não tem a senha em mãos no momento.
  page.on('dialog', dialog => dialog.dismiss());

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

    if (url.includes('/api/acesso/') && req.method() === 'OPTIONS') {{
      return req.respond({{ status: 204, headers: CORS }});
    }}
    if (url.includes('/api/acesso/eventos/')) {{
      return req.respond({{ status: 200, contentType: 'application/json',
                           headers: CORS, body: JSON.stringify(PAINEL) }});
    }}
    if (url.includes('/api/acesso/meus-eventos')) {{
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
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        return {
            titulo: document.getElementById('nome-evento-titulo').textContent,
            setores: document.querySelectorAll('#setores .cartao').length,
            aparelhos: document.querySelectorAll('#aparelhos .cartao').length,
            codigos: document.getElementById('codigos-total').textContent,
        };
    """)
    assert saida["titulo"] == "Baile do Hawaii"
    assert saida["setores"] == 2
    assert saida["aparelhos"] == 1
    assert "42" in saida["codigos"]


def test_a_divergencia_entre_encomendado_e_publicado_aparece_EM_TEXTO():
    """O VIP tem 800 encomendados e 640 publicados.

    Esse numero e a unica pista visivel de que ou a impressao nao terminou de
    publicar, ou alguem publicou o que nao devia. Escondê-lo transformaria a
    tela num relatorio que confirma o que o dono ja acha.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const vip = document.querySelectorAll('#setores .cartao')[1];
        return { texto: vip.textContent.replace(/\\s+/g, ' ') };
    """)
    assert "640" in saida["texto"] and "800" in saida["texto"]
    assert "confer" in saida["texto"].lower() or "falta" in saida["texto"].lower()


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
    armadilha que o cabecalho do arquivo condena. O dono digita uma nova
    lotacao ou muda o uso do ingresso, ve a tela reagir, e nada persiste.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const semSenha = {
            nome: document.getElementById('campo-nome-evento').disabled,
            lotacao: document.getElementById('lotacao-s1').disabled,
            uso: document.getElementById('uso-s1-unico').disabled,
            gravar: document.getElementById('btn-gravar-evento').disabled,
            elevar: document.getElementById('btn-elevar').disabled,
        };
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const comSenha = {
            nome: document.getElementById('campo-nome-evento').disabled,
            lotacao: document.getElementById('lotacao-s1').disabled,
            uso: document.getElementById('uso-s1-unico').disabled,
            gravar: document.getElementById('btn-gravar-evento').disabled,
        };
        return { semSenha, comSenha };
    """)
    assert saida["semSenha"]["nome"] is True
    assert saida["semSenha"]["lotacao"] is True
    assert saida["semSenha"]["uso"] is True
    assert saida["semSenha"]["gravar"] is True
    assert saida["semSenha"]["elevar"] is False
    assert saida["comSenha"]["nome"] is False
    assert saida["comSenha"]["lotacao"] is False
    assert saida["comSenha"]["uso"] is False
    assert saida["comSenha"]["gravar"] is False


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

    Nao substitui `_pedirSenhaParaTeste`: o driver descarta o `window.prompt`
    de verdade (equivale a tocar em "Cancelar"), para exercitar o caminho
    real de `abrirCaixaDeSenha()`, e nao uma simulacao dele.
    """
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

        let erro = null;
        try {
            await Controle.gravar('/eventos/ev-1', { nome_evento: 'x' }, 'PATCH');
        } catch (e) { erro = e.message; }
        return {
            erro,
            aviso: document.getElementById('aviso-gravacao').textContent,
            digitado: document.getElementById('campo-nome-evento').value,
        };
    """)
    assert saida["erro"] == "cancelado"
    assert len(saida["aviso"]) > 10
    assert "cancel" in saida["aviso"].lower()
    assert "digitou" in saida["aviso"].lower() or "continua" in saida["aviso"].lower()
    assert saida["digitado"] == "Nome que eu digitei"


def test_o_codigo_novo_aparece_uma_vez_com_o_aviso_de_que_nao_volta():
    """Ele nao esta guardado em lugar nenhum. Se a tela nao avisar, o dono
    fecha a caixa achando que consulta depois."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.mostrarCodigo('K7M2QP');
        const caixa = document.getElementById('caixa-codigo');
        return {
            codigo: document.getElementById('codigo-valor').textContent,
            texto: caixa.textContent.replace(/\\s+/g, ' ').toLowerCase(),
        };
    """)
    assert saida["codigo"] == "K7M2QP"
    assert "não" in saida["texto"] and ("de novo" in saida["texto"] or "outra vez" in saida["texto"])


def test_a_tela_diz_que_gerar_outro_codigo_nao_derruba_a_portaria():
    """Sem essa frase o dono nao gera com medo, e fica sem o codigo.

    A frase tem de ser verdade no backend, e o
    `test_gerar_outro_codigo_NAO_desconecta_quem_ja_entrou` cobra o outro lado.
    """
    html = _ler("frontend/controle.html").lower()
    assert "não desconecta" in html or "nao desconecta" in html


def test_criar_aparelho_manda_a_lista_de_setores_escolhida():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        let enviado = null;
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            enviado = { caminho, corpo: JSON.parse(opcoes.body) };
            return { id: 'a2', nome: 'Portao B', codigo: 'ABC234' };
        };
        await Controle.criarAparelho('Portao B', ['s1', 's2']);
        return enviado;
    """)
    assert saida["caminho"] == "/eventos/ev-1/aparelhos"
    assert saida["corpo"]["nome"] == "Portao B"
    assert saida["corpo"]["setores"] == ["s1", "s2"]


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


def test_sem_supabase_a_tela_explica_em_vez_de_ficar_em_branco():
    """`supabaseClient` fica nulo sem rede, sem o CDN, ou no modo offline
    deliberado do `supabase-config.js` (`?offline=true` / `offline_mode`). Sem
    tratamento, `AcessoConta.sessao()` LANCA em vez de resolver "sem sessao"
    -- e como `abrir()` roda sozinho no DOMContentLoaded, essa excecao morre
    calada. Os tres blocos de estado nascem com "sumindo", entao o dono
    encara uma tela inteiramente em branco, sem uma palavra do porque.
    """
    saida = _no_navegador("""
        window.supabaseClient = null;
        await Controle.abrir();
        const caixa = document.getElementById('erro-arranque');
        return {
            escondido: caixa.classList.contains('sumindo'),
            texto: (caixa.textContent || '').trim(),
        };
    """)
    assert saida["escondido"] is False
    assert len(saida["texto"]) > 10
