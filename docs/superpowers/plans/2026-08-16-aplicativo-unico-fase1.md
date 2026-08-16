# Aplicativo único — Fase 1: a casca

> **Para quem executar com agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Os passos usam caixas (`- [ ]`).

**Objetivo:** as telas do cliente e do portão passam a ser um aplicativo instalável só, sem que nenhuma delas seja reescrita.

**Arquitetura:** um prefixo comum, `/ic/`, criado por reescrita na Vercel — os arquivos ficam onde estão. Escopo `/ic/`, três páginas separadas (`controle.html`, `evento.html`, `portaria.html`) mais uma nova, `inicio.html`, que é a casa e a câmera. Navegação entre elas continua dentro do aplicativo instalado porque está dentro do escopo.

**Spec:** [2026-08-16-aplicativo-unico-design.md](../specs/2026-08-16-aplicativo-unico-design.md) — ver a nota de revisão: o desenho de "uma página só" foi abandonado no meio da execução, e por quê.

**Stack:** HTML/CSS/JavaScript ES5 puro. pytest e puppeteer para os testes. Vercel serve; Supabase Edge Functions respondem.

## Restrições globais

- **Nada de arquivo de fora** em nenhuma das quatro páginas. Resposta de outra origem é opaca: não há como o service worker guardá-la, e um aplicativo instalado que morre sem rede não é um aplicativo instalado.
- **Todo arquivo pedido por caminho relativo** (`controle.css?v=NNN`, sem barra na frente). Com barra, o arquivo cai fora do escopo `/ic/` e fora do alcance do service worker. Sem barra, resolve certo nos dois lugares: `/ic/` na Vercel e `/` na estação.
- **JavaScript no estilo dos arquivos**: `var`, `function`, IIFE com `'use strict'`.
- **O service worker nunca guarda API.**
- **`publicar.ps1` renumera só `.js?v=` e `.css?v=`** nos `frontend/*.html`. Manifesto e ícones não levam `?v=`.
- **A Fase 1 não muda o pareamento.** O código de seis caracteres continua; quem o substitui é a Fase 2.
- **Publicar o site obriga a publicar o agente**, com número novo.

## Mapa dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `vercel.json`, `frontend/vercel.json` | **modificar** — o prefixo `/ic/`, os redirecionamentos das URLs antigas, e o tipo do manifesto |
| `frontend/controle.html`, `evento.html`, `portaria.html` | **modificar** — só os caminhos, que viram relativos |
| `frontend/inicio.html` | **criar** — a casa: Meus Eventos, + Novo Evento, e o convite para instalar |
| `frontend/inicio.js` | **criar** — a casa e o despacho do QR |
| `frontend/inicio.css` | **criar** — o estilo da casa |
| `frontend/instalar.js` | **criar** — o convite para instalar (Android e iPhone) |
| `frontend/app.webmanifest` | **criar** — identidade do aplicativo, escopo `/ic/` |
| `frontend/sw.js` | **modificar** — pré-cache das quatro páginas; o escopo passa a vir do endereço de registro |
| `frontend/portaria-camera.js` | **modificar** — `ligar(aoLer)` em vez de chamar a portaria pelo nome |
| `frontend/portaria.js` | **modificar** — passa a própria função à câmera |
| `acesso_api.py`, `supabase/functions/acesso-pedido/` | **modificar** — o QR do Pedido aponta para `/ic/evento.html` |
| `frontend/controle.js` | **modificar** — o endereço do portão aponta para `/ic/portaria.html` |
| `security_config.py` | **modificar** — `PAINEL_ARQUIVOS` ganha os arquivos novos |
| `tests/test_aplicativo_unico.py` | **modificar** — os testes de cada tarefa |

---

## Tarefa 1 — CONCLUÍDA: o CDN sai do caminho

Feita em 16/08/2026, commit `e60f630`. `supabase-js` 2.112.3 e `qrcode-generator` 1.4.4
passaram a ser servidos daqui, com a versão congelada em vez de flutuar no `@2`. Conferido
no navegador: as duas telas sobem com `window.supabase` e o cliente criado, e o
`controle.html` faz zero requisição para fora.

---

## Tarefa 2: O prefixo `/ic/`, e os caminhos relativos

**Arquivos:**
- Modificar: `vercel.json`, `frontend/vercel.json`, `frontend/controle.html`, `frontend/evento.html`, `frontend/portaria.html`, `acesso_api.py`, `supabase/functions/acesso-pedido/index.ts`, `frontend/controle.js`
- Teste: `tests/test_aplicativo_unico.py`

**Interfaces:**
- Produz: as quatro páginas atendendo em `/ic/…`, e as URLs antigas redirecionando para lá.

- [ ] **Passo 1: escrever os testes que falham**

```python
def test_nenhuma_pagina_pede_arquivo_por_caminho_absoluto():
    """Com barra na frente, o arquivo cai FORA do escopo /ic/ -- e portanto
    fora do alcance do service worker, sem o qual a portaria nao abre sem rede.

    Sem barra, o mesmo texto resolve certo nos dois lugares: /ic/ na Vercel e
    / na estacao.
    """
    for nome in PAGINAS_DO_APLICATIVO:
        html = _ler("frontend/" + nome)
        absolutos = re.findall(
            r'<(?:script|link)[^>]+(?:src|href)="(/[^/][^"]*)"', html)
        assert not absolutos, nome + " pede por caminho absoluto: " + str(absolutos)


def test_a_vercel_serve_as_telas_sob_o_prefixo():
    for arquivo in ("vercel.json", "frontend/vercel.json"):
        conf = json.loads(_ler(arquivo))
        destinos = [r["destination"] for r in conf.get("rewrites", [])
                    if r["source"].startswith("/ic")]
        assert destinos, arquivo + " nao serve o prefixo /ic/"


def test_as_urls_antigas_continuam_valendo():
    """O QR do Pedido ja circula por WhatsApp, e o endereco do portao ja foi
    passado a porteiro. Nenhum dos dois volta atras."""
    for arquivo in ("vercel.json", "frontend/vercel.json"):
        conf = json.loads(_ler(arquivo))
        origens = [r["source"] for r in conf.get("redirects", [])]
        for antiga in ("/evento.html", "/portaria.html", "/controle.html"):
            assert antiga in origens, arquivo + " perdeu " + antiga


def test_os_dois_construtores_apontam_para_o_prefixo():
    assert "/ic/evento.html?t=" in _ler("acesso_api.py")
    assert "/ic/evento.html?t=" in _ler("supabase/functions/acesso-pedido/index.ts")
    assert "/ic/portaria.html?e=" in _ler("frontend/controle.js")
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -q`
Esperado: os quatro novos FALHAM.

- [ ] **Passo 3: a reescrita e os redirecionamentos**

Em **`vercel.json`**, antes da regra `/:path*` que já existe (a ordem é o que faz o prefixo
ser visto primeiro):

```json
    { "source": "/ic", "destination": "/frontend/inicio.html" },
    { "source": "/ic/", "destination": "/frontend/inicio.html" },
    { "source": "/ic/:path*", "destination": "/frontend/:path*" },
```

E um bloco `redirects` novo — ele roda **antes** das reescritas e antes do sistema de
arquivos, e a Vercel preserva a querystring por conta:

```json
  "redirects": [
    { "source": "/evento.html", "destination": "/ic/evento.html" },
    { "source": "/portaria.html", "destination": "/ic/portaria.html" },
    { "source": "/controle.html", "destination": "/ic/controle.html" }
  ],
```

O mesmo em `frontend/vercel.json`, com os destinos sem o `/frontend` (lá a raiz já é a
pasta).

- [ ] **Passo 4: os caminhos relativos**

Nas três páginas, tire a barra inicial de todo `src=` e `href=` que aponta para arquivo
nosso. Em `portaria.html` são sete `<script>`, o manifesto, os dois ícones e o registro do
service worker; em `controle.html`, a folha e seis `<script>`; em `evento.html`, quatro
`<script>`.

```html
<script src="portaria.js?v=609"></script>
<link rel="stylesheet" href="controle.css?v=609">
```

**Cuidado com o registro do service worker em `portaria.html`:** ele passa a ser

```javascript
navigator.serviceWorker.register('sw.js?v=609', { scope: './' })
```

`'sw.js'` relativo resolve para `/ic/sw.js`, e `scope: './'` para `/ic/` — que é o escopo do
aplicativo inteiro, e não mais só a portaria. É essa mudança de endereço que troca o escopo;
o arquivo continua sendo `frontend/sw.js`.

- [ ] **Passo 5: os dois construtores**

`acesso_api.py:505` e a Edge Function `acesso-pedido` passam a montar
`{base}/ic/evento.html?t={token}`; `controle.js:948`, `location.origin + '/ic/portaria.html?e=' + …`.

- [ ] **Passo 6: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 7: conferir no navegador**

O servidor local não tem as reescritas da Vercel, então ele confere a outra metade: que as
páginas continuam abrindo com os caminhos relativos, na raiz. Suba na 9123 e abra
`controle.html`, `evento.html?t=x` e `portaria.html`. Console limpo, login visível, e a
portaria registrando o service worker.

- [ ] **Passo 8: commit**

```powershell
git add vercel.json frontend/vercel.json frontend/controle.html frontend/evento.html frontend/portaria.html frontend/controle.js acesso_api.py supabase/functions/acesso-pedido/index.ts tests/test_aplicativo_unico.py
git commit -m "app(fase1): o prefixo /ic/, e os caminhos que viram relativos"
```

---

## Tarefa 2 — CONCLUÍDA, e Tarefa 3 — CONCLUÍDA

**Tarefa 2** (commit `94ca120`): o prefixo `/ic/` por reescrita na Vercel, as URLs antigas
redirecionando, e todos os caminhos das três páginas virando relativos. Dois ajustes que o
navegador exigiu e que não estavam previstos: o registro do service worker passou a
acontecer **só sob `/ic/`** (servida na raiz pela estação, a mesma página registraria com
escopo `/`, assumindo o painel de produção — que é justamente o que o escopo estreito sempre
existiu para impedir), e o `test_existe_uma_implementacao_so_de_login` passou a ignorar
`.min.js`, porque o SDK vendorizado contém `signInWithPassword` por ser quem **define** o
método.

**Tarefa 3** (commit `e457a86`): a casa **não** virou página nova. `controle.html`, sem
`?evento=`, já é a lista "Seus eventos" e já faz o login — uma casa em `inicio.html`
duplicaria os dois, e duplicata de login tranca o cliente para fora do evento dele. Então
`/ic/` abre o `controle.html`, e ele ganhou o botão **+ Novo Evento** com a câmera, num
módulo próprio ([frontend/ler-qr.js](../../../frontend/ler-qr.js)), acima e fora do bloco de
login. O arranque passou a mandar aparelho pareado direto ao portão, antes de qualquer coisa
que dependa de rede.

**Tarefa 4** (commit `beda272`): a câmera passou a entregar a leitura a quem a ligou.

O que segue abaixo é o plano original da casa, mantido só como registro do que foi
considerado. **O que valeu foi o parágrafo acima.**

## Tarefa 3 (plano original — não executado assim): A casa

**Arquivos:**
- Criar: `frontend/inicio.html`, `frontend/inicio.js`, `frontend/inicio.css`
- Modificar: `security_config.py`
- Teste: `tests/test_aplicativo_unico.py`

**Interfaces:**
- Consome: `AcessoConta` (o módulo de login já compartilhado por `evento.html` e `controle.html`) e o endpoint `/meus-eventos`, que já existe e responde.
- Produz: `window.inicio.despachar(texto)` — recebe o conteúdo de um QR e decide a tela.

- [ ] **Passo 1: escrever os testes que falham**

```python
def test_a_casa_manda_o_aparelho_de_portaria_direto_para_o_portao():
    """O porteiro abre sem rede e sem conta. A casa comeca perguntando a sessao
    ao Supabase, que e ida a rede -- entao a pergunta do token de aparelho vem
    ANTES de qualquer coisa que dependa de sinal."""
    js = _ler("frontend/inicio.js")
    assert js.index("ideal_portaria_token") < js.index("sessao"), (
        "a casa pergunta a sessao antes de olhar se o aparelho e de portaria"
    )


def test_o_qr_de_fora_e_recusado():
    """Um QR qualquer de rua nao pode abrir fluxo nenhum com dado estranho
    dentro."""
    js = _ler("frontend/inicio.js")
    assert "location.origin" in js
    assert "não é do Ideal Control" in js


def test_a_casa_nao_exige_conta_para_ler_um_QR():
    """Pedir login ao porteiro seria travar o portao numa credencial que
    ninguem lhe deu."""
    html = _ler("frontend/inicio.html")
    assert 'id="btn-ler"' in html
    assert 'id="btn-entrar"' in html
```

- [ ] **Passo 2: rodar e ver falhar**

Esperado: os três FALHAM — os arquivos não existem.

- [ ] **Passo 3: escrever a casa**

`frontend/inicio.html` é auto-contida no estilo das outras telas do cliente: sem CDN, campos
de 16px, alvos de toque de 48px. A marcação essencial:

```html
    <div class="folha">
        <div id="convite-instalar" class="sumindo"></div>

        <h1>Ideal Control</h1>

        <button id="btn-ler">+ Novo Evento</button>
        <p class="dica">Leia o QR que a gráfica enviou.</p>

        <div id="camera" class="sumindo">
            <video id="cam" class="cam" playsinline muted></video>
            <button id="btn-lanterna" class="secundario sumindo" type="button">Lanterna</button>
            <button id="btn-fechar-camera" class="secundario">Cancelar</button>
        </div>
        <div id="erro" class="aviso sumindo" role="alert"></div>

        <div id="meus-eventos" class="sumindo">
            <h2>Meus Eventos</h2>
            <div id="eventos"></div>
        </div>

        <button id="btn-entrar" class="secundario sumindo">Entrar com a conta do Vibe</button>
        <button id="btn-sair" class="secundario sumindo">Sair da conta</button>
    </div>
```

Os `<script>`, todos relativos: `jsqr.min.js`, `portaria-camera.js`, `supabase-js.min.js`,
`supabase-config.js`, `acesso-conta.js`, `instalar.js`, `inicio.js`.

- [ ] **Passo 4: escrever `inicio.js`**

```javascript
/**
 * A casa do aplicativo.
 *
 * Nao ha seletor de modo: o que a tela oferece sai do ESTADO do aparelho.
 *
 * A ordem das perguntas e o que importa aqui. O porteiro abre sem rede e sem
 * conta; perguntar a sessao ao Supabase e ida a rede. Por isso o token de
 * aparelho e a PRIMEIRA pergunta -- havendo um, este celular e um portao, e
 * nao ha nada a decidir.
 */
(function () {
    'use strict';

    var CHAVE_TOKEN = 'ideal_portaria_token';

    function $(id) { return document.getElementById(id); }

    function ehAparelhoDePortaria() {
        try { return !!localStorage.getItem(CHAVE_TOKEN); } catch (e) { return false; }
    }

    function despachar(texto) {
        var url;
        try { url = new URL(texto, window.location.href); }
        catch (e) { return recusar(); }
        // Origem nossa, sempre: um QR de rua nao pode abrir fluxo com dado
        // estranho dentro.
        if (url.origin !== window.location.origin) { return recusar(); }

        var t = url.searchParams.get('t');
        if (t) { location.href = 'evento.html?t=' + encodeURIComponent(t); return; }
        var e = url.searchParams.get('e');
        if (e) { location.href = 'portaria.html?e=' + encodeURIComponent(e); return; }
        return recusar();
    }

    function recusar() {
        $('erro').textContent = 'Este QR não é do Ideal Control. Leia o QR que a '
            + 'gráfica enviou.';
        $('erro').classList.remove('sumindo');
    }

    function abrirCamera() {
        $('erro').classList.add('sumindo');
        $('camera').classList.remove('sumindo');
        return window.portariaCamera.ligar(function (texto) {
            $('camera').classList.add('sumindo');
            despachar(texto);
        }).then(function () {
            $('btn-lanterna').classList.toggle('sumindo',
                !window.portariaCamera.temLanterna());
        });
    }

    function listarEventos(sessao) {
        return AcessoConta.pedir('/meus-eventos', {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        }).then(function (d) {
            var eventos = d.eventos || [];
            var caixa = $('eventos');
            caixa.innerHTML = '';
            eventos.forEach(function (ev) {
                var a = document.createElement('a');
                a.href = 'controle.html?evento=' + encodeURIComponent(ev.id);
                a.className = 'cartao';
                a.textContent = ev.nome_evento;   // digitado pelo cliente: TEXTO
                caixa.appendChild(a);
            });
            $('meus-eventos').classList.toggle('sumindo', !eventos.length);
        });
    }

    function arrancar() {
        $('btn-ler').onclick = abrirCamera;
        $('btn-fechar-camera').onclick = function () {
            window.portariaCamera.desligar();
            $('camera').classList.add('sumindo');
        };
        $('btn-lanterna').onclick = function () {
            window.portariaCamera.alternarLanterna().then(function (acesa) {
                $('btn-lanterna').textContent = acesa ? 'Lanterna acesa' : 'Lanterna';
            });
        };

        // ANTES de qualquer coisa que dependa de rede.
        if (ehAparelhoDePortaria()) { location.replace('portaria.html'); return; }

        return AcessoConta.sessao().then(function (s) {
            $('btn-entrar').classList.toggle('sumindo', !!s);
            $('btn-sair').classList.toggle('sumindo', !s);
            if (s) { return listarEventos(s); }
        }).catch(function () {
            // Sem rede na casa nao e erro: o aparelho pode estar a caminho do
            // portao. A camera continua funcionando.
            $('btn-entrar').classList.remove('sumindo');
        });
    }

    window.inicio = { despachar: despachar, abrirCamera: abrirCamera };
    document.addEventListener('DOMContentLoaded', arrancar);
})();
```

- [ ] **Passo 5: pôr na lista da estação**

`security_config.PAINEL_ARQUIVOS` ganha `inicio.html`, `inicio.js`, `inicio.css`,
`instalar.js`, `portaria.html`, `portaria.js`, `portaria-validacao.js`,
`portaria-deposito.js`, `portaria-camera.js`, `jsqr.min.js` — conferindo antes quais já
estão lá, para não duplicar.

- [ ] **Passo 6: rodar os testes e conferir no navegador**

Além dos testes, abra `inicio.html` na 9123: a casa aparece, "+ Novo Evento" abre a câmera,
e com `localStorage.ideal_portaria_token` semeado a página **vai direto** para a portaria.

- [ ] **Passo 7: commit**

```powershell
git add frontend/inicio.html frontend/inicio.js frontend/inicio.css security_config.py tests/test_aplicativo_unico.py
git commit -m "app(fase1): a casa -- Meus Eventos, + Novo Evento, e o portao na frente"
```

---

## Tarefa 4: A câmera entrega a leitura a quem a ligou

**Arquivos:**
- Modificar: `frontend/portaria-camera.js`, `frontend/portaria.js`
- Teste: `tests/test_aplicativo_unico.py`

- [ ] **Passo 1: escrever o teste que falha**

```python
def test_a_camera_entrega_a_leitura_a_quem_a_ligou():
    """Sem isto seriam dois leitores de camera quase iguais, e o segundo
    herdaria os defeitos que o primeiro ja corrigiu."""
    js = _ler("frontend/portaria-camera.js")
    assert "window.portaria.validarTexto" not in js
    assert "function ligar(aoLer" in js
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: implementar**

Em `portaria-camera.js`, `ligar` guarda o callback e `achou` o chama:

```javascript
    var aoLerAtual = null;

    function ligar(aoLer) {
        if (rodando) return Promise.resolve();
        aoLerAtual = aoLer || null;
        rodando = true;
        // … o resto como está
```

```javascript
        // Quem ligou a camera e que decide o que fazer com o texto. Chamar a
        // portaria pelo nome daqui fazia deste arquivo um leitor de UMA tela
        // so -- e o aplicativo tem duas que leem QR.
        if (aoLerAtual) { aoLerAtual(texto); }
```

Em `portaria.js`, o `ligarCamera()` passa a própria função:

```javascript
        window.portariaCamera.ligar(window.portaria.validarTexto).then(function () {
```

- [ ] **Passo 4: rodar os testes, e a suíte da portaria junto**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py tests\test_portaria_fonte.py tests\test_portaria_pwa.py -q`

- [ ] **Passo 5: commit**

---

## Tarefa 5: Manifesto, service worker e o convite para instalar

**Arquivos:**
- Criar: `frontend/app.webmanifest`, `frontend/instalar.js`
- Modificar: `frontend/sw.js`, as quatro páginas (o `<link rel="manifest">`), `vercel.json` e `frontend/vercel.json` (o tipo do manifesto já tem regra desde a v608 — conferir que cobre)
- Teste: `tests/test_aplicativo_unico.py`

- [ ] **Passo 1: escrever os testes que falham**

```python
def test_o_manifesto_tem_o_escopo_do_prefixo():
    m = json.loads(_ler("frontend/app.webmanifest"))
    assert m["scope"] == "/ic/"
    assert m["start_url"] == "/ic/"
    assert m["display"] == "standalone"


def test_o_pre_cache_cobre_as_quatro_paginas():
    sw = _ler("frontend/sw.js")
    for arquivo in ("inicio.html", "controle.html", "evento.html", "portaria.html"):
        assert arquivo in sw, arquivo + " ficou fora do pre-cache"


def test_o_convite_para_instalar_so_aparece_onde_cabe():
    js = _ler("frontend/instalar.js")
    assert "beforeinstallprompt" in js
    assert "display-mode: standalone" in js
    assert "Compartilhar" in js, "falta o caminho do iPhone"
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: o manifesto**

```json
{
  "id": "/ic/",
  "name": "Ideal Control",
  "short_name": "Ideal Control",
  "description": "Seus eventos e a leitura no portão. Funciona sem rede.",
  "lang": "pt-BR",
  "dir": "ltr",
  "start_url": "/ic/",
  "scope": "/ic/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0f1e",
  "background_color": "#0a0f1e",
  "categories": ["business", "utilities"],
  "prefer_related_applications": false,
  "icons": [
    { "src": "icones/portaria-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icones/portaria-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icones/portaria-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "icones/portaria-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Os `src` dos ícones são relativos ao manifesto, que fica em `/ic/app.webmanifest` — logo
resolvem para `/ic/icones/…`, dentro do escopo.

- [ ] **Passo 4: o service worker**

`frontend/sw.js` continua sendo o mesmo arquivo, com as mesmas três decisões, e o comentário
tem de continuar dizendo por quê:

- **navegação network-first**, cache só no `catch`;
- **subrecursos com casamento exato** da URL, `?v=` incluído;
- **outra origem passa direto**.

O que muda: o nome do cache vira `ideal-control-` + versão, e a lista de pré-cache passa a
ser **relativa** e a cobrir as quatro páginas com os arquivos de cada uma. Relativa porque o
`sw.js` agora é servido de `/ic/`, e `'./portaria.js?v=' + VERSAO` resolve para
`/ic/portaria.js?v=…` — que é exatamente o que as páginas pedem.

- [ ] **Passo 5: o convite para instalar**

`frontend/instalar.js`, carregado pela casa: segura o `beforeinstallprompt` para oferecer no
**nosso** botão, some com `appinstalled`, e no iPhone — onde não existe evento nenhum —
escreve o caminho do Compartilhar, só no Safari de iOS e só fora do aplicativo instalado.

- [ ] **Passo 6: rodar os testes**

- [ ] **Passo 7: commit**

---

## Tarefa 6: Conferir e publicar

- [ ] **Passo 1: a suíte inteira** — `.\venv\Scripts\python.exe -m pytest tests -q`

- [ ] **Passo 2: dirigir no navegador**, conferindo cada caminho:

| Caminho | Tem de | E não pode |
|---|---|---|
| `inicio.html` | mostrar a casa | pedir login |
| `inicio.html` com token semeado | ir direto para a portaria | fazer requisição de autenticação |
| QR do Pedido lido pela câmera | ir para `evento.html?t=…` | — |
| QR de outra origem | recusar com a mensagem | navegar |
| `portaria.html` | registrar o service worker no escopo do prefixo | — |

- [ ] **Passo 3: publicar** — quando o usuário mandar, `.\publicar.ps1` e `.\publicar_agente.ps1 <versão nova>`.

- [ ] **Passo 4: conferir na Vercel** — `/ic/` abre a casa; `/evento.html?t=x` redireciona para `/ic/evento.html?t=x` **com o `t` intacto**; o manifesto responde `application/manifest+json`.

- [ ] **Passo 5: conferir no celular** — instalar no Android pelo botão da casa, ler o QR do Pedido, parear um portão, ler um ingresso, modo avião. No iPhone, o caminho do Compartilhar.

- [ ] **Passo 6: CHANGELOG e commit.**

---

## Fora desta fase, de propósito

- **A configuração no próprio aparelho, com uma senha só** — é a Fase 2, com plano próprio.
- **Trazer `index.html` e `producao.html`** para o aplicativo. Outro público, outro escopo.
- **Funcionar sem rede na configuração.** Só a portaria decide offline.
