# Aplicativo único — Fase 1: a casca

> **Para quem executar com agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam caixas (`- [ ]`).

**Objetivo:** juntar as três telas do cliente e do portão — reivindicar, configurar e portaria — num aplicativo instalável só, `app.html`, com a câmera do **+ Novo Evento** funcionando por dentro dele.

**Arquitetura:** nasce `frontend/app.html`, uma página com as três telas e um roteador que decide pela querystring que já existe (`?t=`, `?e=`, `?evento=`). As três páginas de hoje viram redirecionamentos que preservam a querystring, então o QR do Pedido que já circula continua valendo. Escopo `/app.html`, estreito de propósito.

**Spec:** [2026-08-16-aplicativo-unico-design.md](../specs/2026-08-16-aplicativo-unico-design.md)

**Stack:** HTML/CSS/JavaScript ES5 puro, sem framework. Python + pytest e puppeteer para os testes. Vercel serve; Supabase Edge Functions respondem.

## Restrições globais

- **Nada de CDN em `app.html`.** É a regra que a portaria já tem escrita no próprio comentário, e agora vale para o aplicativo inteiro: a página precisa abrir sem rede, e resposta de outra origem é opaca para o cache.
- **JavaScript no estilo dos arquivos**: `var`, `function`, IIFE com `'use strict'`. Nada de `const`, arrow, `async/await` ou template string nos arquivos do aplicativo.
- **O service worker nunca guarda API.** Só a casca.
- **Cor base `#0a0f1e`** no manifesto, no `theme-color` e no fundo dos ícones.
- **`publicar.ps1` renumera só `.js?v=` e `.css?v=`** nos `frontend/*.html`. Manifesto e ícones não levam `?v=`.
- **A Fase 1 não muda o pareamento.** O código de seis caracteres continua como está; quem o substitui é a Fase 2.
- **Publicar o site obriga a publicar o agente**, com número novo.

## Mapa dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `frontend/supabase-js.min.js` | **criar** — o SDK do Supabase servido daqui, no lugar do CDN |
| `frontend/qrcode-generator.min.js` | **criar** — o gerador de QR servido daqui |
| `frontend/app.html` | **criar** — a casca: as três telas e o registro do service worker |
| `frontend/app.js` | **criar** — o roteador: decide a tela pela querystring, na ordem certa |
| `frontend/app-instalar.js` | **criar** — o convite para instalar (Android e iPhone) |
| `frontend/app.css` | **criar** — o que é da casca: casa, cartões de evento, faixa de instalar |
| `frontend/portaria.css` | **criar** — o `<style>` de `portaria.html`, extraído e prefixado |
| `frontend/evento.css` | **criar** — o `<style>` de `evento.html`, extraído e prefixado |
| `frontend/app.webmanifest` | **criar** — identidade do aplicativo |
| `frontend/sw-app.js` | **criar** — service worker do aplicativo; substitui o `sw.js` |
| `frontend/portaria.html`, `evento.html`, `controle.html` | **modificar** — viram redirecionamentos |
| `frontend/sw.js` | **remover** — o novo assume |
| `frontend/portaria-camera.js` | **modificar** — `ligar(aoLer)` em vez de chamar a portaria pelo nome |
| `frontend/portaria.js`, `evento.js`, `controle.js` | **modificar** — expõem uma função de abertura em vez de arrancar sozinhos |
| `frontend/controle.css` | **modificar** — regras prefixadas |
| `security_config.py` | **modificar** — `PAINEL_ARQUIVOS` ganha os arquivos novos |
| `acesso_api.py`, `supabase/functions/acesso-pedido/` | **modificar** — o QR do Pedido passa a apontar para `app.html` |
| `tests/test_aplicativo_unico.py` | **criar** — estrutura e navegador |

---

## Tarefa 1: O CDN sai do caminho

**Por que primeiro:** enquanto `controle.html` e `evento.html` buscarem script de fora, juntar as telas põe o CDN no caminho do portão — e a página deixa de abrir sem rede.

**Arquivos:**
- Criar: `frontend/supabase-js.min.js`, `frontend/qrcode-generator.min.js`
- Modificar: `frontend/controle.html:128,135`, `frontend/evento.html:255`, `security_config.py:81-113`
- Teste: `tests/test_aplicativo_unico.py`

**Interfaces:**
- Consome: nada.
- Produz: `window.supabase` (o SDK) e `window.qrcode`, os mesmos nomes globais que o CDN definia — nenhum arquivo que os usa muda.

- [ ] **Passo 1: escrever o teste que falha**

Crie `tests/test_aplicativo_unico.py`:

```python
# -*- coding: utf-8 -*-
"""O aplicativo unico: as tres telas do cliente e do portao numa pagina so.

O que estes testes protegem: que a pagina ABRA SEM REDE (nenhum arquivo de
fora), que o roteador leve cada QR a tela certa, e que o endereco que ja
circula por WhatsApp continue valendo.
"""

import json
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")

PAGINAS_DO_APLICATIVO = ("app.html", "controle.html", "evento.html", "portaria.html")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_nenhuma_tela_do_aplicativo_carrega_arquivo_de_fora():
    """A regra que a portaria ja tinha, valendo para o aplicativo inteiro.

    Um `<script>` de outra origem que nao carrega derruba a pagina -- e cache
    nao salva, porque resposta de outra origem e opaca.
    """
    for nome in PAGINAS_DO_APLICATIVO:
        html = _ler("frontend/" + nome)
        externos = re.findall(
            r'<(?:script|link|img)[^>]+(?:src|href)=["\'](?:https?:)?//[^"\']+',
            html, flags=re.IGNORECASE)
        assert not externos, nome + " carrega arquivo de fora: " + str(externos)


def test_o_sdk_e_o_gerador_de_qr_sao_servidos_daqui():
    for nome in ("supabase-js.min.js", "qrcode-generator.min.js"):
        caminho = os.path.join(FRENTE, nome)
        assert os.path.exists(caminho), nome + " nao foi vendorizado"
        assert os.path.getsize(caminho) > 1000, nome + " veio vazio ou truncado"


def test_a_estacao_sincroniza_os_arquivos_novos():
    """Sem isto, a estacao serve uma tela que referencia arquivo que ela nao
    tem -- e a pagina abre quebrada so na maquina da grafica."""
    import security_config

    for nome in ("supabase-js.min.js", "qrcode-generator.min.js"):
        assert nome in security_config.PAINEL_ARQUIVOS, nome
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -v`
Esperado: FALHA nos três — `app.html` ainda não existe (o primeiro teste quebra ao abrir o arquivo) e os dois vendorizados não existem.

> Se o primeiro teste falhar com `FileNotFoundError` em vez de `AssertionError`, está certo: `app.html` só nasce na Tarefa 2. Este é o único momento do plano em que um teste falha por arquivo ausente de outra tarefa.

- [ ] **Passo 3: baixar os dois arquivos**

```powershell
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' -OutFile 'frontend\supabase-js.min.js'
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js' -OutFile 'frontend\qrcode-generator.min.js'
Get-ChildItem frontend\supabase-js.min.js, frontend\qrcode-generator.min.js | Select-Object Name, Length
```

Confira que o `supabase-js.min.js` passa de 100 KB e o `qrcode-generator.min.js` de 3 KB. Arquivo pequeno demais quase sempre é uma página de erro do CDN salva com nome de script.

- [ ] **Passo 4: trocar as tags**

Em `frontend/controle.html`, troque a linha 128 e a 135:

```html
<script src="/supabase-js.min.js?v=609"></script>
```
```html
<script src="/qrcode-generator.min.js?v=609"></script>
```

Em `frontend/evento.html`, troque a linha 255:

```html
<script src="/supabase-js.min.js?v=609"></script>
```

O `?v=` entra porque o `publicar.ps1` renumera `.js?v=` — sem ele, o navegador guardaria a versão de hoje para sempre.

- [ ] **Passo 5: pôr na lista que a estação sincroniza**

Em `security_config.py`, dentro de `PAINEL_ARQUIVOS`, ao lado de `"pdf-lib.min.js"`:

```python
    "supabase-js.min.js",
    "qrcode-generator.min.js",
```

- [ ] **Passo 6: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -k "sdk or estacao" -v`
Esperado: os dois PASSAM. O primeiro teste continua falhando até a Tarefa 2.

- [ ] **Passo 7: conferir no navegador que as telas ainda sobem**

```powershell
.\venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 9123
```

Abra `http://127.0.0.1:9123/controle.html` e `http://127.0.0.1:9123/evento.html?t=x`. O console **não** pode ter erro de `supabase is not defined`. A tela de login tem de aparecer.

- [ ] **Passo 8: commit**

```powershell
git add frontend/supabase-js.min.js frontend/qrcode-generator.min.js frontend/controle.html frontend/evento.html security_config.py tests/test_aplicativo_unico.py
git commit -m "app(fase1): o SDK do Supabase e o gerador de QR passam a ser servidos daqui"
```

---

## Tarefa 2: As três folhas de estilo passam a conviver

**O problema:** as três telas definem as mesmas classes. `portaria.html` tem `<style>` inline com `.aviso`, `button`, `input`; `evento.html` tem outro `<style>` com `.cartao`, `.aviso`; `controle.css` repete as cores do `evento.html` de propósito. Numa página só, a última regra vence e as três telas saem trocadas.

**A saída:** cada tela ganha um `<section>` com id próprio, e as regras de cada folha passam a ser prefixadas por esse id. Regra de mesmo peso deixa de existir porque o seletor deixa de ser o mesmo.

**Arquivos:**
- Criar: `frontend/portaria.css` (o `<style>` de `portaria.html`, prefixado), `frontend/evento.css` (idem)
- Modificar: `frontend/controle.css` (prefixar)
- Teste: `tests/test_aplicativo_unico.py`

**Interfaces:**
- Produz: três ids de seção que a Tarefa 3 usa como raiz de cada tela — `#v-portaria`, `#v-evento`, `#v-controle`.

- [ ] **Passo 1: escrever o teste que falha**

```python
FOLHAS = (("frontend/portaria.css", "#v-portaria"),
          ("frontend/evento.css", "#v-evento"),
          ("frontend/controle.css", "#v-controle"))


def test_cada_folha_so_pinta_a_propria_tela():
    """Tres telas numa pagina so: sem prefixo, a ultima regra vence e as telas
    saem trocadas. As cores do evento.html repetem as do controle.css DE
    PROPOSITO -- e por isso que elas colidem."""
    for caminho, raiz in FOLHAS:
        css = _ler(caminho)
        # Tira comentarios antes de olhar: comentario cheio de `{` confundiria
        # a varredura, e estas folhas sao comentadas de proposito.
        limpo = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
        for bloco in re.findall(r"([^{}]+)\{", limpo):
            seletor = bloco.strip().splitlines()[-1].strip()
            if not seletor or seletor.startswith("@") or seletor.startswith(":root"):
                continue
            for parte in seletor.split(","):
                parte = parte.strip()
                if not parte:
                    continue
                assert parte.startswith(raiz), (
                    caminho + ": o seletor " + repr(parte) + " nao comeca com " + raiz
                )
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -k folha -v`
Esperado: FALHA — as folhas ainda não existem.

- [ ] **Passo 3: extrair e prefixar**

Trabalho mecânico, e é assim que se faz sem errar:

1. **`frontend/portaria.css`** — recorte o conteúdo do `<style>` de `portaria.html` (hoje das linhas 42 a 114). Prefixe **cada seletor** com `#v-portaria `. O `:root` sai do prefixo e vira `#v-portaria` direto, porque as variáveis precisam valer dentro da seção:

```css
/* As variaveis moram na propria secao: a casa e as outras telas tem as
   suas, e um `:root` global faria a ultima folha carregada mandar em todas. */
#v-portaria {
    --bg: #0a0f1e; --card: #1e293b; --border: rgba(148,163,184,0.25);
    --text: #e2e8f0; --dim: #94a3b8;
    --verde: #16a34a; --vermelho: #b91c1c; --laranja: #c2410c; --teal: #14b8a6;
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 16px; line-height: 1.5; -webkit-font-smoothing: antialiased;
}
#v-portaria .folha { max-width: 520px; margin: 0 auto; padding: 14px; }
#v-portaria .topo { … }
#v-portaria button { … }
```

   O que era `body { … }` vira propriedade da própria seção, como acima. O `* { box-sizing: border-box; }` **sobe para o `app.css`** (Tarefa 3): ele vale para a página inteira e não é de tela nenhuma.

2. **`frontend/evento.css`** — o mesmo com o `<style>` de `evento.html`, prefixo `#v-evento `.

3. **`frontend/controle.css`** — prefixe as regras existentes com `#v-controle `. O arquivo tem `input { width: 100% }`, que a documentação já registra como causa de um defeito visual na tela do dono; prefixá-lo é o que impede que ele alcance os campos da portaria e do evento.

- [ ] **Passo 4: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -k folha -v`
Esperado: PASSA.

- [ ] **Passo 5: commit**

```powershell
git add frontend/portaria.css frontend/evento.css frontend/controle.css tests/test_aplicativo_unico.py
git commit -m "app(fase1): cada tela com a sua folha, prefixada pela raiz"
```

---

## Tarefa 3: A casca e o roteador

**Arquivos:**
- Criar: `frontend/app.html`, `frontend/app.css`, `frontend/app.js`
- Modificar: `frontend/portaria.js`, `frontend/evento.js`, `frontend/controle.js` (deixam de arrancar sozinhos)
- Teste: `tests/test_aplicativo_unico.py`

**Interfaces:**
- Consome: as três folhas da Tarefa 2.
- Produz:
  - `window.portaria.abrir(eventoDaUrl)` — abre a tela do portão; devolve `Promise`
  - `window.eventoQR.abrir(token)` — abre a reivindicação
  - `window.controleEvento.abrir(eventoId)` — abre a configuração; `eventoId` nulo abre a lista
  - cada um **só toca no DOM depois de chamado**

- [ ] **Passo 1: escrever os testes que falham**

```python
def test_o_roteador_decide_antes_de_perguntar_a_sessao():
    """O porteiro abre sem rede e sem conta.

    `controle.js` comeca perguntando a sessao ao Supabase, que e ida a rede.
    Se o roteador nao decidir ANTES disso, o portao passa a depender de rede --
    a unica coisa que ele nao pode fazer.
    """
    js = _ler("frontend/app.js")
    assert js.index("ideal_portaria_token") < js.index("sessao"), (
        "o roteador pergunta a sessao antes de olhar se o aparelho esta pareado"
    )


def test_as_tres_telas_deixaram_de_arrancar_sozinhas():
    """Numa pagina so, tres modulos que arrancam ao carregar disputam a tela."""
    for arquivo, nome in (("frontend/portaria.js", "portaria"),
                          ("frontend/evento.js", "eventoQR"),
                          ("frontend/controle.js", "controleEvento")):
        js = _ler(arquivo)
        assert "abrir:" in js or "abrir =" in js, arquivo + " nao expoe `abrir`"


def test_a_casca_tem_as_tres_secoes():
    html = _ler("frontend/app.html")
    for raiz in ("v-portaria", "v-evento", "v-controle", "v-casa"):
        assert 'id="' + raiz + '"' in html, raiz


def test_a_casca_registra_o_service_worker_no_escopo_estreito():
    """Escopo `/` capturaria index.html e producao.html -- as telas da
    grafica -- dentro do aplicativo do cliente."""
    html = _ler("frontend/app.html")
    assert "sw-app.js" in html
    assert "scope: '/app.html'" in html
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -k "roteador or telas or casca" -v`
Esperado: FALHA — `app.js` e `app.html` ainda não existem.

- [ ] **Passo 3: escrever o roteador**

Crie `frontend/app.js`:

```javascript
/**
 * O roteador do aplicativo.
 *
 * Uma pagina, quatro telas. Quem decide qual abrir e a QUERYSTRING que ja
 * existia nas tres paginas separadas -- nao ha rota nova a inventar:
 *
 *     ?t=<token>      o QR do Pedido      -> reivindicar
 *     ?e=<evento_id>  o QR do portao      -> portaria
 *     ?evento=<id>                        -> configurar
 *     nada                                -> a casa
 *
 * A ORDEM importa mais que o despacho. O porteiro abre sem rede e sem conta;
 * `controleEvento.abrir` comeca perguntando a sessao ao Supabase, que e ida a
 * rede. Por isso o aparelho pareado e a PRIMEIRA pergunta, antes de qualquer
 * coisa que dependa de sinal.
 */
(function () {
    'use strict';

    var CHAVE_TOKEN = 'ideal_portaria_token';

    function $(id) { return document.getElementById(id); }

    function mostrar(qual) {
        ['casa', 'portaria', 'evento', 'controle'].forEach(function (t) {
            $('v-' + t).classList.toggle('sumindo', t !== qual);
        });
    }

    function pareado() {
        try { return !!localStorage.getItem(CHAVE_TOKEN); } catch (e) { return false; }
    }

    function parametro(nome) {
        return new URLSearchParams(window.location.search).get(nome) || '';
    }

    function irPara(tela, valor) {
        mostrar(tela);
        if (tela === 'portaria') return window.portaria.abrir(valor);
        if (tela === 'evento') return window.eventoQR.abrir(valor);
        if (tela === 'controle') return window.controleEvento.abrir(valor);
        return window.appCasa.abrir();
    }

    function rotear() {
        // 1. Aparelho ja pareado abre no portao, SEM tocar em autenticacao.
        //    Vale mesmo com `?t=` na URL: um porteiro que leia por engano o QR
        //    do Pedido nao pode cair na tela de cadastro do dono.
        if (pareado()) return irPara('portaria', parametro('e'));

        // 2. Nao pareado: a querystring decide.
        if (parametro('t')) return irPara('evento', parametro('t'));
        if (parametro('e')) return irPara('portaria', parametro('e'));
        if (parametro('evento')) return irPara('controle', parametro('evento'));

        // 3. A casa. E so aqui que a sessao do Supabase entra em cena.
        return irPara('casa', null);
    }

    window.appRoteador = { rotear: rotear, irPara: irPara, mostrar: mostrar };
    document.addEventListener('DOMContentLoaded', rotear);
})();
```

- [ ] **Passo 4: fazer as três telas deixarem de arrancar sozinhas**

Em `frontend/portaria.js`, o bloco de partida (hoje no fim do arquivo, o `eventoDaUrl()` seguido do `localStorage.getItem(CHAVE_TOKEN)`) vira o corpo de uma função:

```javascript
    function abrir(eventoDaUrlDoRoteador) {
        if (eventoDaUrlDoRoteador) {
            try { localStorage.setItem(CHAVE_EVENTO, eventoDaUrlDoRoteador); } catch (e) { }
        }
        eventoDaUrl();

        estado.token = localStorage.getItem(CHAVE_TOKEN);
        if (!estado.token) { mostrar('pareando'); return Promise.resolve(); }
        return D.lerCarga().then(function (c) {
            if (c) { estado.carga = c; entrarEmLeitura(); sincronizar(); }
            else { return baixarCarga().catch(function () { mostrar('pareando'); }); }
        });
    }
```

E o objeto exportado ganha `abrir: abrir`. **Nada mais muda** em `portaria.js` — a validação, a fila e o depósito ficam como estão, porque estão aprovados e rodando.

Faça o equivalente em `evento.js` (o token do QR passa a vir por argumento, em vez de sair da URL) e em `controle.js` (o `abrir()` que já existe passa a receber o `evento_id` em vez de lê-lo de `location.search`).

- [ ] **Passo 5: escrever a casca**

Crie `frontend/app.html` com esta estrutura — o conteúdo de cada seção é o `<body>` da página correspondente, movido para dentro:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Ideal Control</title>
    <meta name="theme-color" content="#0a0f1e">
    <meta name="description" content="Seus eventos e a leitura no portão. Funciona sem rede.">
    <link rel="manifest" href="/app.webmanifest">
    <link rel="icon" href="/icones/portaria-192.png" type="image/png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Ideal Control">

    <link rel="stylesheet" href="/app.css?v=609">
    <link rel="stylesheet" href="/portaria.css?v=609">
    <link rel="stylesheet" href="/evento.css?v=609">
    <link rel="stylesheet" href="/controle.css?v=609">
</head>
<body>
<section id="v-casa"></section>
<section id="v-portaria" class="sumindo"><!-- o corpo do portaria.html --></section>
<section id="v-evento"   class="sumindo"><!-- o corpo do evento.html   --></section>
<section id="v-controle" class="sumindo"><!-- o corpo do controle.html --></section>

<!-- Nenhum arquivo de fora. Ver o teste
     `test_nenhuma_tela_do_aplicativo_carrega_arquivo_de_fora`. -->
<script src="/jsqr.min.js?v=609"></script>
<script src="/qr-ideal-hash.js?v=609"></script>
<script src="/portaria-validacao.js?v=609"></script>
<script src="/portaria-deposito.js?v=609"></script>
<script src="/portaria-camera.js?v=609"></script>
<script src="/portaria.js?v=609"></script>
<script src="/supabase-js.min.js?v=609"></script>
<script src="/supabase-config.js?v=609"></script>
<script src="/acesso-conta.js?v=609"></script>
<script src="/evento.js?v=609"></script>
<script src="/qrcode-generator.min.js?v=609"></script>
<script src="/qr-canvas.js?v=609"></script>
<script src="/controle.js?v=609"></script>
<script src="/app-casa.js?v=609"></script>
<script src="/app-instalar.js?v=609"></script>
<script src="/app.js?v=609"></script>
<script>
    // Registrar depois de tudo carregar: um service worker que instala no meio
    // do carregamento pode guardar resposta pela metade.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            // scope: '/app.html' -- escopo `/` capturaria index.html e
            // producao.html, que sao as telas da GRAFICA. O porteiro tocaria
            // num link e cairia no painel de producao.
            navigator.serviceWorker.register('/sw-app.js?v=609', { scope: '/app.html' })
                .catch(function (e) {
                    console.error('service worker do aplicativo nao registrou -- nao vai abrir sem rede:', e);
                });
        });
    }
</script>
</body>
</html>
```

O `app.js` é o **último** dos módulos de tela e roteia no `DOMContentLoaded`, então todas as funções `abrir` já existem quando ele decide.

- [ ] **Passo 6: escrever a casa**

Crie `frontend/app-casa.js`. A casa mostra o que o aparelho **é**, e não um modo escolhido:

```javascript
/**
 * A casa do aplicativo.
 *
 * Nao ha seletor de modo: o que a tela oferece sai do estado do aparelho.
 * Pedir login ao porteiro seria travar o portao numa credencial que ninguem
 * lhe deu -- por isso "Ler um QR" existe antes de qualquer conta.
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function abrir() {
        $('casa-ler').onclick = function () { window.appCamera.abrir(); };
        // A lista de eventos so faz sentido com conta. Sem sessao, a casa
        // oferece entrar -- e nada mais.
        return window.controleEvento.sessaoAtual().then(function (s) {
            $('casa-eventos').classList.toggle('sumindo', !s);
            $('casa-entrar').classList.toggle('sumindo', !!s);
            $('casa-sair').classList.toggle('sumindo', !s);
            if (s) { return window.controleEvento.listarNaCasa($('casa-eventos')); }
        }).catch(function () {
            // Sem rede na casa nao e erro: o aparelho pode estar no portao.
            $('casa-entrar').classList.remove('sumindo');
        });
    }

    window.appCasa = { abrir: abrir };
})();
```

E o marcador correspondente dentro de `#v-casa`:

```html
    <div class="folha">
        <h1>Ideal Control</h1>
        <div id="casa-instalar" class="sumindo"></div>
        <button id="casa-ler">+ Novo Evento</button>
        <div id="casa-eventos" class="sumindo"></div>
        <button id="casa-entrar" class="secundario sumindo">Entrar com a conta do Vibe</button>
        <button id="casa-sair" class="secundario sumindo">Sair da conta</button>
    </div>
```

- [ ] **Passo 7: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -v`
Esperado: TODOS PASSAM, inclusive o `test_nenhuma_tela_do_aplicativo_carrega_arquivo_de_fora` da Tarefa 1.

- [ ] **Passo 8: commit**

```powershell
git add frontend/app.html frontend/app.css frontend/app.js frontend/app-casa.js frontend/portaria.js frontend/evento.js frontend/controle.js tests/test_aplicativo_unico.py
git commit -m "app(fase1): a casca, o roteador e a casa"
```

---

## Tarefa 4: Os apelidos, e os dois construtores de URL

**Arquivos:**
- Modificar: `frontend/portaria.html`, `frontend/evento.html`, `frontend/controle.html` (viram redirecionamentos), `acesso_api.py:505`, `supabase/functions/acesso-pedido/index.ts`, `frontend/controle.js:948`, `security_config.py`
- Remover: `frontend/sw.js`
- Teste: `tests/test_aplicativo_unico.py`

- [ ] **Passo 1: escrever os testes que falham**

```python
def test_as_tres_paginas_viraram_apelidos_que_preservam_a_querystring():
    """O QR do Pedido ja circula por WhatsApp apontando para evento.html, e o
    endereco do portao ja foi passado a porteiro. Redirecionar sem levar a
    querystring perderia o token e o evento."""
    for nome in ("evento.html", "portaria.html", "controle.html"):
        html = _ler("frontend/" + nome)
        assert "location.replace" in html, nome + " nao redireciona"
        assert "location.search" in html, nome + " perde a querystring"
        assert "/app.html" in html, nome


def test_o_qr_do_pedido_passa_a_apontar_para_o_aplicativo():
    assert "/app.html?t=" in _ler("acesso_api.py")
    assert "/app.html?t=" in _ler("supabase/functions/acesso-pedido/index.ts")


def test_o_endereco_do_portao_passa_a_apontar_para_o_aplicativo():
    assert "/app.html?e=" in _ler("frontend/controle.js")


def test_o_service_worker_antigo_da_portaria_saiu():
    """Dois service workers com escopos que se encavalam na mesma origem
    brigam pelo controle da pagina."""
    assert not os.path.exists(os.path.join(FRENTE, "sw.js"))
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -k "apelido or qr_do_pedido or portao or antigo" -v`
Esperado: os quatro FALHAM.

- [ ] **Passo 3: transformar as três páginas em apelidos**

O conteúdo inteiro de `frontend/evento.html` passa a ser:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Ideal Control</title>
<!--
    Apelido. Esta pagina foi a tela onde o QR do Pedido caia, e o endereco dela
    ja circula por WhatsApp e nao volta atras -- por isso ela continua
    existindo, redirecionando, em vez de sumir.

    `location.replace`, e nao `href`: assim o apelido nao entra no historico, e
    o botao "voltar" do celular nao devolve o cliente para ca num laco.
-->
<script>
    (function () {
        var sw = navigator.serviceWorker;
        function ir() { location.replace('/app.html' + location.search + location.hash); }
        // O service worker antigo da portaria vivia no escopo /portaria.html.
        // Deixa-lo registrado poria dois service workers disputando a mesma
        // origem. Tira primeiro, mas nunca espera mais que um instante: o
        // porteiro nao pode ficar preso numa tela em branco por causa disto.
        if (!sw || !sw.getRegistrations) { return ir(); }
        var seguiu = false;
        function seguirUmaVez() { if (!seguiu) { seguiu = true; ir(); } }
        setTimeout(seguirUmaVez, 1500);
        sw.getRegistrations().then(function (regs) {
            return Promise.all(regs.map(function (r) {
                return r.scope.indexOf('/portaria.html') >= 0 ? r.unregister() : null;
            }));
        }).then(seguirUmaVez, seguirUmaVez);
    })();
</script>
</head>
<body></body>
</html>
```

`portaria.html` e `controle.html` ficam **idênticas** a esta — o redirecionamento é o mesmo, e o que muda é só a querystring que cada uma recebe, que é copiada tal como veio.

- [ ] **Passo 4: trocar os dois construtores**

Em `acesso_api.py:505`:

```python
    return f"{base.rstrip('/')}/app.html?t={token}"
```

O mesmo na Edge Function `acesso-pedido`, que é quem gera o QR hoje.

Em `frontend/controle.js:948`:

```javascript
        return location.origin + '/app.html?e=' + encodeURIComponent(eventoId);
```

- [ ] **Passo 5: apagar o service worker antigo e ajustar a lista da estação**

```powershell
git rm frontend/sw.js
```

Em `security_config.py`, acrescente `"app.html"`, `"app.js"`, `"app-casa.js"`, `"app-instalar.js"`, `"app.css"`, `"portaria.css"`, `"evento.css"` à `PAINEL_ARQUIVOS`.

- [ ] **Passo 6: rodar a suíte inteira**

Rode: `.\venv\Scripts\python.exe -m pytest tests -q`
Esperado: sem falha nova. **Atenção ao `tests/test_portaria_fonte.py`**: ele lê `frontend/portaria.html` e `frontend/sw.js`. Os dois mudaram de papel, então aqueles testes precisam passar a ler `app.html` e `sw-app.js` — o que eles protegem continua valendo, só mudou de arquivo.

- [ ] **Passo 7: commit**

```powershell
git add -u
git add frontend/evento.html frontend/portaria.html frontend/controle.html
git commit -m "app(fase1): as tres paginas viram apelidos, e as URLs apontam para o aplicativo"
```

---

## Tarefa 5: Manifesto e service worker

**Arquivos:**
- Criar: `frontend/app.webmanifest`, `frontend/sw-app.js`
- Teste: `tests/test_aplicativo_unico.py`

- [ ] **Passo 1: escrever os testes que falham**

```python
def test_o_manifesto_do_aplicativo_tem_escopo_estreito():
    m = json.loads(_ler("frontend/app.webmanifest"))
    assert m["scope"] == "/app.html"
    assert m["start_url"] == "/app.html"
    assert m["display"] == "standalone"
    assert m["theme_color"] == "#0a0f1e"


def test_o_service_worker_do_aplicativo_nunca_guarda_api():
    """Configuracao de evento servida de cache mentiria sobre o que esta no
    banco -- e neste projeto o banco e a origem da verdade."""
    sw = _ler("frontend/sw-app.js")
    assert "self.location.origin" in sw
    assert sw.count("ignoreSearch") == 1, (
        "casamento exato nos subrecursos; ignorar a query prende o aparelho "
        "no codigo da geracao em que instalou"
    )


def test_o_pre_cache_cobre_as_tres_telas():
    sw = _ler("frontend/sw-app.js")
    for arquivo in ("/app.html", "/app.js", "/portaria.js", "/evento.js",
                    "/controle.js", "/supabase-js.min.js", "/jsqr.min.js"):
        assert arquivo in sw, arquivo + " ficou fora do pre-cache"
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -k "manifesto_do_aplicativo or nunca_guarda_api or pre_cache" -v`
Esperado: FALHAM.

- [ ] **Passo 3: escrever o manifesto**

Crie `frontend/app.webmanifest`:

```json
{
  "id": "/app.html",
  "name": "Ideal Control",
  "short_name": "Ideal Control",
  "description": "Seus eventos e a leitura no portão. Funciona sem rede.",
  "lang": "pt-BR",
  "dir": "ltr",
  "start_url": "/app.html",
  "scope": "/app.html",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0a0f1e",
  "background_color": "#0a0f1e",
  "categories": ["business", "utilities"],
  "prefer_related_applications": false,
  "icons": [
    { "src": "/icones/portaria-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icones/portaria-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icones/portaria-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icones/portaria-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Passo 4: escrever o service worker**

`frontend/sw-app.js` é o `sw.js` de hoje com a lista de arquivos maior e o nome do cache trocado para `app-`. As três decisões dele continuam valendo palavra por palavra, e o comentário tem de continuar dizendo por quê:

- **navegação network-first**, com o cache só no `catch` — senão o aparelho fica preso na versão do dia em que instalou;
- **subrecursos com casamento exato** da URL, `?v=` incluído — ignorar a query serviria `app.js?v=610` com o `?v=609` guardado, e o aplicativo rodaria código antigo sob HTML novo;
- **outra origem passa direto** — a API é Edge Function do Supabase, e resposta de controle de acesso servida de cache faria o aparelho recusar ingresso que existe.

A lista de pré-cache é a dos `<script>` e `<link>` de `app.html`, mais o manifesto e os quatro ícones.

- [ ] **Passo 5: acrescentar o Content-Type do manifesto na Vercel**

Em `vercel.json` e `frontend/vercel.json` a regra de `.webmanifest` já existe desde a v608 e cobre o arquivo novo. Confira que cobre — ela casa `/(.*\.webmanifest)`.

- [ ] **Passo 6: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 7: commit**

```powershell
git add frontend/app.webmanifest frontend/sw-app.js tests/test_aplicativo_unico.py
git commit -m "app(fase1): manifesto e service worker do aplicativo"
```

---

## Tarefa 6: A câmera, e o + Novo Evento

**Arquivos:**
- Modificar: `frontend/portaria-camera.js` (`ligar(aoLer)`), `frontend/portaria.js` (passa a própria função)
- Criar: `frontend/app-camera.js`
- Teste: `tests/test_aplicativo_unico.py`

**Interfaces:**
- Consome: `window.portariaCamera.ligar(aoLer)` → `Promise`, onde `aoLer(texto)` recebe o conteúdo lido.
- Produz: `window.appCamera.abrir()`, que liga a câmera e despacha pelo tipo de QR.

- [ ] **Passo 1: escrever os testes que falham**

```python
def test_a_camera_entrega_a_leitura_a_quem_a_ligou():
    """Sem isto, seriam dois leitores de camera quase iguais, e o segundo
    herdaria os defeitos que o primeiro ja corrigiu."""
    js = _ler("frontend/portaria-camera.js")
    assert "window.portaria.validarTexto" not in js, (
        "a camera ainda chama a portaria pelo nome"
    )
    assert "function ligar(aoLer" in js


def test_o_qr_de_fora_e_recusado():
    """Um QR qualquer de rua nao pode abrir um fluxo com dado estranho
    dentro."""
    js = _ler("frontend/app-camera.js")
    assert "location.origin" in js
    assert "não é do Ideal Control" in js
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -k "camera or qr_de_fora" -v`
Esperado: FALHAM.

- [ ] **Passo 3: a câmera passa a receber quem chamar**

Em `frontend/portaria-camera.js`, troque a assinatura e o `achou`:

```javascript
    var aoLerAtual = null;

    function ligar(aoLer) {
        if (rodando) return Promise.resolve();
        aoLerAtual = aoLer || null;
        rodando = true;
        // … o resto como está
    }
```

```javascript
    function achou(texto) {
        var agora = Date.now();
        // O mesmo codigo fica na frente da camera por segundos. Sem esta trava
        // a tela dispararia dezenas de leituras iguais.
        if (texto === ultimo && agora - ultimoEm < 3000) return;
        ultimo = texto; ultimoEm = agora;
        desligar();
        // Quem ligou a camera e que decide o que fazer com o texto. Chamar a
        // portaria pelo nome daqui fazia deste arquivo um leitor de UMA tela
        // so -- e o aplicativo tem duas que leem QR.
        if (aoLerAtual) { aoLerAtual(texto); }
    }
```

Em `frontend/portaria.js`, o `ligarCamera()` passa a mandar a função:

```javascript
        window.portariaCamera.ligar(window.portaria.validarTexto).then(function () {
```

- [ ] **Passo 4: escrever o despacho do QR**

Crie `frontend/app-camera.js`:

```javascript
/**
 * O "+ Novo Evento": uma camera, dois tipos de QR.
 *
 * Nao existe seletor de modo -- o proprio QR diz o que ele e. O do Pedido leva
 * `?t=`; o do portao leva `?e=`. Isso e o mesmo despacho que o roteador faz na
 * abertura da pagina, de proposito: um caminho so para acertar ou errar.
 */
(function () {
    'use strict';

    function abrir() {
        window.appRoteador.mostrar('casa');
        document.getElementById('casa-camera').classList.remove('sumindo');
        return window.portariaCamera.ligar(function (texto) {
            document.getElementById('casa-camera').classList.add('sumindo');
            despachar(texto);
        });
    }

    function despachar(texto) {
        var url;
        // Um QR qualquer de rua nao e URL nossa -- e nao pode abrir fluxo
        // nenhum com dado estranho dentro.
        try { url = new URL(texto, window.location.origin); } catch (e) { return recusar(); }
        if (url.origin !== window.location.origin) { return recusar(); }

        var t = url.searchParams.get('t');
        if (t) { return window.appRoteador.irPara('evento', t); }
        var e = url.searchParams.get('e');
        if (e) { return window.appRoteador.irPara('portaria', e); }
        return recusar();
    }

    function recusar() {
        var aviso = document.getElementById('casa-erro');
        aviso.textContent = 'Este QR não é do Ideal Control. Leia o QR que a gráfica enviou.';
        aviso.classList.remove('sumindo');
    }

    window.appCamera = { abrir: abrir, despachar: despachar };
})();
```

E o marcador dentro de `#v-casa`, junto dos outros:

```html
        <div id="casa-camera" class="sumindo">
            <video id="cam" class="cam" playsinline muted></video>
            <button id="btn-lanterna" class="secundario sumindo" type="button">Lanterna</button>
        </div>
        <div id="casa-erro" class="aviso sumindo" role="alert"></div>
```

> O `<video id="cam">` é **um só** na página: `portaria-camera.js` o procura por id. Ele mora na casa, e a tela da portaria o reposiciona — duas tags com o mesmo id fariam a câmera abrir na tela errada.

- [ ] **Passo 5: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 6: commit**

```powershell
git add frontend/portaria-camera.js frontend/portaria.js frontend/app-camera.js frontend/app.html tests/test_aplicativo_unico.py
git commit -m "app(fase1): uma camera, dois tipos de QR"
```

---

## Tarefa 7: O convite para instalar

**Arquivos:**
- Criar: `frontend/app-instalar.js`
- Teste: `tests/test_aplicativo_unico.py`

- [ ] **Passo 1: escrever o teste que falha**

```python
def test_o_convite_para_instalar_so_aparece_onde_cabe():
    """Botao morto e pior que botao nenhum, e no iPhone nao existe evento de
    instalacao -- so instrucao."""
    js = _ler("frontend/app-instalar.js")
    assert "beforeinstallprompt" in js
    assert "display-mode: standalone" in js, (
        "o convite continuaria aparecendo depois de instalado"
    )
    assert "Compartilhar" in js, "falta o caminho do iPhone"
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -k convite -v`
Esperado: FALHA.

- [ ] **Passo 3: implementar**

Crie `frontend/app-instalar.js`:

```javascript
/**
 * O convite para instalar.
 *
 * Nao existe "link que instala": o link e a URL, e quem instala e o navegador.
 * O que falta e a tela PEDIR -- sem isso a pessoa precisa saber abrir o menu do
 * navegador e procurar a opcao, e no iPhone saber que o caminho e o botao de
 * compartilhar. Numa grafica, isso vira uma ligacao para o dono.
 */
(function () {
    'use strict';

    var guardado = null;

    function jaInstalado() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    function ehIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    function caixa() { return document.getElementById('casa-instalar'); }

    window.addEventListener('beforeinstallprompt', function (e) {
        // Segurar o evento e o que permite oferecer no NOSSO botao, na hora em
        // que a pessoa esta olhando a casa -- e nao numa faixa do navegador que
        // aparece e some.
        e.preventDefault();
        guardado = e;
        if (jaInstalado()) return;
        var c = caixa();
        c.innerHTML = '';
        var b = document.createElement('button');
        b.textContent = 'Instalar aplicativo';
        b.onclick = function () {
            guardado.prompt();
            guardado.userChoice.then(function () { c.classList.add('sumindo'); guardado = null; });
        };
        c.appendChild(b);
        c.classList.remove('sumindo');
    });

    window.addEventListener('appinstalled', function () {
        caixa().classList.add('sumindo');
        guardado = null;
    });

    // O iPhone nao dispara evento nenhum: ou se escreve o caminho, ou a pessoa
    // nao descobre. So no Safari de iOS, e so fora do aplicativo instalado.
    document.addEventListener('DOMContentLoaded', function () {
        if (!ehIOS() || jaInstalado()) return;
        var c = caixa();
        c.textContent = 'Para instalar: toque em Compartilhar e depois em '
            + '"Adicionar à Tela de Início".';
        c.className = 'aviso';
    });
})();
```

- [ ] **Passo 4: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_aplicativo_unico.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 5: commit**

```powershell
git add frontend/app-instalar.js tests/test_aplicativo_unico.py
git commit -m "app(fase1): o convite para instalar, no Android e no iPhone"
```

---

## Tarefa 8: Conferir no navegador e no aparelho

- [ ] **Passo 1: a suíte inteira**

Rode: `.\venv\Scripts\python.exe -m pytest tests -q`
Esperado: sem falha. Os testes de `test_portaria_fonte.py` e `test_portaria_pwa.py` foram redirecionados para `app.html`/`sw-app.js` na Tarefa 4 — confira que continuam verdes, porque é o que eles protegem que importa, não o nome do arquivo.

- [ ] **Passo 2: dirigir no navegador**

Suba o servidor na 9123 e confira, com puppeteer, cada caminho do roteador:

| Endereço | Tem de abrir | E não pode |
|---|---|---|
| `/app.html` | a casa | pedir login |
| `/app.html?t=abc` | a reivindicação | — |
| `/app.html?e=<uuid>` | a portaria | fazer requisição de autenticação |
| `/evento.html?t=abc` | redirecionar para `/app.html?t=abc` | perder o `t` |
| `/portaria.html?e=<uuid>` | redirecionar preservando o `e` | — |

E com token de aparelho semeado no `localStorage`, `/app.html?t=abc` tem de abrir **a portaria**, não a reivindicação — é a regra 1 do roteador.

Console limpo em todos.

- [ ] **Passo 3: publicar**

Quando o usuário mandar:

```powershell
.\publicar.ps1 "Ideal Control: um aplicativo so, instalavel" -Sim
.\publicar_agente.ps1 <versão nova>
```

- [ ] **Passo 4: conferir no celular**

No Android: instalar pelo botão da própria casa; ler o QR do Pedido pelo **+ Novo Evento**; parear um portão; ler um ingresso; modo avião e confirmar que continua validando. No iPhone: o caminho do compartilhar, e o ícone com o nome **Ideal Control**.

- [ ] **Passo 5: registrar no CHANGELOG e commitar**

---

## Fora desta fase, de propósito

- **A configuração no próprio aparelho, com uma senha só** — é a Fase 2, e tem plano próprio. Até lá o pareamento continua sendo o código de seis caracteres.
- **Trazer `index.html` e `producao.html`** para o aplicativo. Outro público, outro escopo.
- **Funcionar sem rede na configuração.** Só a portaria decide offline.
