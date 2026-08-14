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


def test_a_tela_do_QR_leva_a_tela_do_dono():
    """A promessa da ultima tela do evento.html passa a ter porta."""
    assert "controle.html" in _ler("frontend/evento.html")


def test_a_porta_carrega_o_evento_recem_cadastrado():
    """Cair na lista de eventos depois de cadastrar um seria mandar o cliente
    procurar o que ele acabou de criar."""
    assert "controle.html?evento=" in _ler("frontend/evento.js")


def test_o_status_do_projeto_conhece_a_tela_nova():
    texto = _ler("docs/STATUS_PROJETO.md")
    assert "controle.html" in texto
    assert "ACESSO_ELEVACAO_SEGREDO" in texto


# ── No navegador ────────────────────────────────────────────────────────────

PAINEL_FALSO = {
    "evento": {"id": "ev-1", "nome_evento": "Baile do Hawaii",
               "data_evento": None, "local_evento": "Clube"},
    # Sem `lotacao` e sem `publicadas`: o `_painel` real parou de devolver as
    # duas em 14/08/2026, e uma fixture mais generosa que o servidor deixaria
    # a tela poder ler um campo que nunca chega em producao.
    "setores": [
        {"id": "s1", "nome": "PISTA", "quantidade": 5000,
         "tipo_uso": "unico", "pedido_id_int": 18560, "modelo_id": 1000110},
        {"id": "s2", "nome": "VIP", "quantidade": 800,
         "tipo_uso": "reentrada", "pedido_id_int": 18560, "modelo_id": 1000111},
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

    `aceitar_dialogo=True` faz o `window.confirm`/`window.prompt` responder OK
    em vez de Cancelar -- é o único jeito de exercitar o caminho em que o dono
    ACEITA a confirmação de "Revogar", e não só o caminho em que recusa.
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


def test_gerar_outro_codigo_mostra_o_codigo_novo_na_caixa():
    """`novoCodigo` e a acao que o cartao do aparelho oferece de verdade --
    sem este teste, ela ficava exportada e nunca chamada por nada."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle._pedirParaTeste = async () => ({ codigo: 'ZZZ999' });
        await Controle.novoCodigo('a1');
        return {
            codigo: document.getElementById('codigo-valor').textContent,
            visivel: !document.getElementById('caixa-codigo').classList.contains('sumindo'),
        };
    """)
    assert saida["codigo"] == "ZZZ999"
    assert saida["visivel"] is True


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
            novoCodigo: document.getElementById('aparelho-novo-codigo-a1').disabled,
            revogar: document.getElementById('aparelho-revogar-a1').disabled,
            rotulos: {
                salvar: document.getElementById('aparelho-salvar-a1').textContent.trim(),
                novoCodigo: document.getElementById('aparelho-novo-codigo-a1').textContent.trim(),
                revogar: document.getElementById('aparelho-revogar-a1').textContent.trim(),
            },
        };
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const comSenha = {
            nome: document.getElementById('aparelho-nome-a1').disabled,
            salvar: document.getElementById('aparelho-salvar-a1').disabled,
            novoCodigo: document.getElementById('aparelho-novo-codigo-a1').disabled,
            revogar: document.getElementById('aparelho-revogar-a1').disabled,
        };
        return { semSenha, comSenha };
    """)
    assert len(saida["semSenha"]["rotulos"]["salvar"]) > 3
    assert len(saida["semSenha"]["rotulos"]["novoCodigo"]) > 3
    assert len(saida["semSenha"]["rotulos"]["revogar"]) > 3
    assert saida["semSenha"]["nome"] is True
    assert saida["semSenha"]["salvar"] is True
    assert saida["semSenha"]["novoCodigo"] is True
    assert saida["semSenha"]["revogar"] is True
    assert saida["comSenha"]["nome"] is False
    assert saida["comSenha"]["salvar"] is False
    assert saida["comSenha"]["novoCodigo"] is False
    assert saida["comSenha"]["revogar"] is False


def test_revogar_pelo_botao_pede_confirmacao_antes_de_desligar():
    """O `dialog` do Chrome e sempre descartado pelo arnes (equivale a tocar
    em Cancelar). Se o clique chamasse `revogarAparelho` sem passar por um
    `confirm()`, a chamada aconteceria mesmo assim -- aqui ela nao pode."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        let chamou = false;
        Controle._pedirParaTeste = async () => { chamou = true; return { ok: true }; };
        document.getElementById('aparelho-revogar-a1').click();
        await new Promise(r => setTimeout(r, 50));
        return { chamou };
    """)
    assert saida["chamou"] is False


def test_salvar_manda_so_os_setores_quando_so_o_setor_muda():
    """Dirige o controle de verdade -- marca uma caixa no cartao do
    aparelho e clica em "Salvar" -- em vez de chamar `trocarSetoresDoAparelho`
    direto. Um teste que so chama a funcao nao pega o botao desligado: foi
    essa a licao da rodada anterior, e era exatamente este ramo do handler
    que continuava sem nenhum teste tocando nele."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();

        // O aparelho a1 comeca validando so o setor s1; o dono marca o s2
        // tambem, sem tocar no nome.
        document.getElementById('aparelho-setor-a1-s2').checked = true;

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
    assert sorted(chamada["corpo"]["setores"]) == ["s1", "s2"]
    assert "nome" not in chamada["corpo"]


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
        await new Promise(r => setTimeout(r, 50));
        return { enviado };
    """, aceitar_dialogo=True)
    assert saida["enviado"] is not None
    assert saida["enviado"]["caminho"] == "/aparelhos/a1"
    assert saida["enviado"]["corpo"]["status"] == "revogado"


def test_o_cartao_do_setor_nao_tem_campo_de_lotacao_nem_botao_de_salvar():
    """Regra do usuario, 14/08/2026: "a lotacao sera sempre a contratada, sem
    campo para digitar lotacao nem botao de salvar".

    Le o DOM montado, e nao o texto do arquivo: um campo que sobrevivesse
    escondido atras de outro nome continuaria sendo um segundo numero que
    discorda do contrato.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const cartao = document.getElementById('setor-configurar-s1').parentElement;
        return {
            campos: cartao.querySelectorAll('input[type="number"], input[type="text"]').length,
            lotacaoPorId: !!document.getElementById('lotacao-s1'),
            salvarPorId: !!document.getElementById('setor-salvar-s1'),
            texto: cartao.textContent,
        };
    """)
    assert saida["campos"] == 0
    assert saida["lotacaoPorId"] is False
    assert saida["salvarPorId"] is False
    assert "lotação" not in saida["texto"].lower()
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


def test_elevacao_e_restaurada_do_sessionstorage_ao_abrir():
    """IMPORTANT da revisao final: a elevacao era gravada no sessionStorage
    e nunca lida de volta. '<- Meus eventos' e todo link de evento sao
    recarga de pagina inteira, entao o dono digitava a senha de novo em
    toda navegacao -- o storage so custava usabilidade, sem comprar nada."""
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) + 900, evento_id: 'ev-1'
        }));
        const url = new URL(location.href);
        url.searchParams.set('evento', 'ev-1');
        history.replaceState(null, '', url);
        await Controle.abrir();
        return {
            elevado: Controle.elevado(),
            somenteLeitura: document.body.classList.contains('somente-leitura'),
        };
    """)
    assert saida["elevado"] is True
    assert saida["somenteLeitura"] is False


def test_elevacao_de_outro_evento_no_storage_nao_e_restaurada():
    """O `navegador` ja impede um bilhete de outro navegador; isto impede um
    bilhete de outro EVENTO no MESMO navegador -- a aba trocou de evento sem
    fechar, o storage ainda tem o token antigo."""
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) + 900, evento_id: 'outro-evento'
        }));
        const url = new URL(location.href);
        url.searchParams.set('evento', 'ev-1');
        history.replaceState(null, '', url);
        await Controle.abrir();
        return { elevado: Controle.elevado() };
    """)
    assert saida["elevado"] is False


def test_elevacao_vencida_no_storage_e_descartada_ao_abrir():
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) - 5, evento_id: 'ev-1'
        }));
        const url = new URL(location.href);
        url.searchParams.set('evento', 'ev-1');
        history.replaceState(null, '', url);
        await Controle.abrir();
        return { elevado: Controle.elevado(),
                 guardado: sessionStorage.getItem('acesso_elevacao') };
    """)
    assert saida["elevado"] is False
    assert saida["guardado"] is None


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


def test_a_caixa_do_codigo_mostra_o_nome_do_aparelho_ao_criar():
    """Achado da revisao final: com varios aparelhos configurados, gerar um
    codigo novo antes de fechar a caixa do anterior e como um codigo acaba
    digitado no celular errado -- o titulo generico "Codigo deste aparelho"
    nao dizia QUAL aparelho."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle._pedirParaTeste = async () => ({ id: 'a2', nome: 'Portao B', codigo: 'ABC234' });
        await Controle.criarAparelho('Portao B', ['s1']);
        return { titulo: document.getElementById('codigo-titulo').textContent };
    """)
    assert "Portao B" in saida["titulo"]


def test_a_caixa_do_codigo_mostra_o_nome_do_aparelho_ao_gerar_outro():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle._pedirParaTeste = async () => ({ codigo: 'ZZZ999' });
        await Controle.novoCodigo('a1');
        return { titulo: document.getElementById('codigo-titulo').textContent };
    """)
    assert "Portao A" in saida["titulo"]


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
