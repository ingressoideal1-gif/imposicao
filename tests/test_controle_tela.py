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
# acao cujo rotulo, "Novo Evento", esta escrito na MESMA linha, doze pixels a
# esquerda. Ele existe para fechar a coluna da direita, onde cada linha de
# evento tem a sua engrenagem -- e sai da imagem que o usuario mandou.
#
# Nomeado por id, e nao liberado por `aria-label`: liberar pelo atributo
# transformaria a regra em "todo botao precisa de rotulo, menos os que nao
# tiverem", e o proximo botao so-com-icone entraria calado. Acrescentar um id
# aqui obriga quem for faze-lo a escrever por que aquele caso tambem tem a
# palavra a vista em outro lugar.
BOTOES_SEM_TEXTO_COM_MOTIVO = {
    "btn-ler-qr-mais": 'a barra "Novo Evento" esta na mesma linha, ao lado',
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
    for id_ in ("bloco-evento", "bloco-portoes", "bloco-setores", "bloco-este-aparelho"):
        assert 'id="' + id_ + '"' in texto


def test_da_para_inativar_o_evento_e_a_tela_avisa_o_limite():
    """Portao SEM REDE so descobre a inativacao quando sincronizar. Guardar o
    celular achando que os portoes pararam no mesmo segundo e o erro que esta
    frase evita."""
    texto = _ler("frontend/controle.js") + _ler("frontend/controle.html")
    assert "Inativar" in texto
    assert "sem internet" in texto or "sem rede" in texto


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
        let perguntado = null;
        window.prompt = (texto) => { perguntado = texto; return null; };
        document.getElementById('btn-elevar').click();
        return { perguntado,
                 aviso: document.getElementById('aviso-leitura').textContent };
    """)
    assert "senha do dono" not in saida["perguntado"]
    assert "senha cadastrada" in saida["perguntado"].lower()
    assert "mesma com que você entrou" in saida["perguntado"]
    assert "senha do dono" not in saida["aviso"]
    assert "Senha Cadastrada" in saida["aviso"]


def test_esqueci_minha_senha_usa_o_email_de_quem_ja_entrou():
    """Sem campo de e-mail: quem esta nesta tela ja entrou. Pedir para digitar
    de novo o e-mail com que acabou de entrar e uma chance de errar sem
    nenhum ganho."""
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
    assert saida["pedido"] == "dono@exemplo.com"
    assert "link" in saida["aviso"].lower()


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


def test_elevacao_de_outro_evento_no_storage_nao_e_restaurada():
    """O `navegador` ja impede um bilhete de outro navegador; isto impede um
    bilhete de outro EVENTO no MESMO navegador -- a engrenagem trocou de evento
    e o storage ainda tem o token antigo."""
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) + 900, evento_id: 'outro-evento'
        }));
        await Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        return { elevado: Controle.elevado() };
    """)
    assert saida["elevado"] is False


def test_elevacao_vencida_no_storage_e_descartada_ao_abrir_a_engrenagem():
    saida = _no_navegador("""
        sessionStorage.setItem('acesso_elevacao', JSON.stringify({
            token: 't', expira_em: Math.floor(Date.now()/1000) - 5, evento_id: 'ev-1'
        }));
        await Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        return { elevado: Controle.elevado(),
                 guardado: sessionStorage.getItem('acesso_elevacao') };
    """)
    assert saida["elevado"] is False
    assert saida["guardado"] is None


def test_cancelar_a_senha_deixa_a_lista_na_tela_e_nao_abre_a_engrenagem():
    """A configuracao nao pode aparecer antes da senha.

    Mostrar os setores, a lista de portoes e o nome do evento e SO ENTAO pedir a
    senha entregaria tudo isso a quem estiver com o celular do porteiro na mao.
    """
    saida = _no_navegador("""
        await Controle.abrirEngrenagem('ev-1', 'Baile do Hawaii');
        return {
            engrenagemEscondida: document.getElementById('engrenagem')
                .classList.contains('sumindo'),
            listaNaTela: !document.getElementById('lista')
                .classList.contains('sumindo'),
            setores: document.getElementById('setores').children.length,
        };
    """)
    assert saida["engrenagemEscondida"] is True
    assert saida["listaNaTela"] is True
    assert saida["setores"] == 0


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
        await new Promise(r => setTimeout(r, 150));
        return { chamadas };
    """, aceitar_dialogo=True)
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


def test_inativar_o_evento_pede_confirmacao_e_manda_encerrado():
    """Desligar o evento para TODOS os portoes de uma vez nao pode acontecer
    com um toque solto no meio da tela."""
    recusou = _no_navegador("""
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
        const botao = document.getElementById('btn-ativar-evento');
        const rotulo = botao.textContent;
        botao.click();
        await new Promise(r => setTimeout(r, 80));
        return { chamadas, rotulo };
    """)
    assert recusou["rotulo"] == "Inativar este evento"
    assert recusou["chamadas"] == []

    aceitou = _no_navegador("""
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
        document.getElementById('btn-ativar-evento').click();
        await new Promise(r => setTimeout(r, 120));
        return { chamadas };
    """, aceitar_dialogo=True)
    assert aceitou["chamadas"][0]["caminho"] == "/eventos/ev-1"
    assert aceitou["chamadas"][0]["corpo"] == {"status": "encerrado"}


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
