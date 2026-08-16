# Portaria como PWA — Plano de Implementação

> **Para quem executar com agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam caixas (`- [ ]`) para marcar progresso.

**Objetivo:** transformar a tela da portaria (`/portaria.html`) num PWA instalável de verdade — ícone próprio na tela do celular, abre sem barra de navegador, abre sem rede, tela que não apaga durante a fila e lanterna para ler no escuro.

**Arquitetura:** a portaria já tem service worker e banco local (IndexedDB); o que falta é o *web app manifest*, os ícones e os ajustes de comportamento que só fazem sentido depois que o app está instalado (restaurar o evento sem `?e=` na URL, avisar de atualização sem botão de recarregar, manter a tela acesa). O service worker existente ganha o manifesto e os ícones no pré-cache e passa a casar as versões de forma exata, para o aparelho instalado não ficar preso em JavaScript antigo.

**Stack:** HTML/CSS/JavaScript ES5 puro (sem framework, sem CDN — a página tem de abrir sem rede), Python + Pillow para gerar os ícones, pytest + puppeteer para os testes, Vercel para servir, Supabase Edge Functions para a API.

## Restrições globais

- **Nenhum CDN, nenhum arquivo remoto.** `portaria.html` declara isso no próprio comentário: todo arquivo que ela usa é local, e não pode haver exceção. A página precisa abrir sem rede.
- **JavaScript no estilo do arquivo:** `var`, `function`, `'use strict'` dentro de IIFE. Nada de `const`, arrow function, `async/await` ou template string nos arquivos da portaria — o alvo inclui navegadores de celular antigo da gráfica.
- **O `publicar.ps1` renumera apenas `.js?v=` e `.css?v=`** nos `frontend/*.html` (regex `\.(js|css)\?v=\d+`). Portanto: o manifesto e os ícones **não podem** depender de `?v=` para atualizar — eles são servidos com `no-cache` pela Vercel, e o pré-cache do service worker já carrega a versão no nome.
- **Recusa é recusa.** Nada neste plano cria caminho de exceção na validação de entrada (regra do usuário, 15/08/2026).
- **Segredo não vai para a tela.** Nenhum texto novo pode explicar como o código do QR Ideal é gerado.
- **Cor base `#0a0f1e`** (o `--bg` da `portaria.html`) é o fundo dos ícones, o `theme_color` e o `background_color` do manifesto — os três iguais, para a tela de abertura não piscar.
- **O Render não existe mais.** A API da portaria é `https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria`. Nenhum arquivo tocado por este plano pode reintroduzir `onrender.com`.
- **Publicar o site obriga a publicar o agente** (`.\publicar_agente.ps1 <versão nova>`), mesmo sendo mudança só de frontend.

## Mapa dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `ferramentas/gerar_icones_pwa.py` | **criar** — gera os cinco PNGs quadrados a partir de um logo único, com proporção constante |
| `frontend/icones/portaria-192.png`, `-512.png`, `-192-maskable.png`, `-512-maskable.png` | **criar** — ícones do manifesto (gerados) |
| `frontend/apple-touch-icon.png` | **criar** — ícone do iPhone (gerado) |
| `frontend/portaria.webmanifest` | **criar** — identidade do app: nome, escopo, ícones, cores |
| `frontend/portaria.html` | **modificar** — `<link rel="manifest">`, metas do iOS, barra de atualização, botão da lanterna |
| `frontend/portaria.js` | **modificar** — lembrar o evento, registrar a atualização, acender/apagar a tela |
| `frontend/portaria-camera.js` | **modificar** — expor a trilha de vídeo para a lanterna |
| `frontend/sw.js` | **modificar** — pré-cachear manifesto e ícones, ignorar outra origem, casar versão exata |
| `vercel.json` e `frontend/vercel.json` | **modificar** — `Content-Type` correto do manifesto |
| `tests/test_portaria_pwa.py` | **criar** — testes de estrutura e de navegador |

---

## Tarefa 1: Os ícones

**Por que primeiro:** o manifesto referencia arquivos que precisam existir; um manifesto apontando para ícone inexistente faz o Chrome recusar a instalação sem dizer por quê.

**Arquivos:**
- Criar: `ferramentas/gerar_icones_pwa.py`
- Criar (gerados): `frontend/icones/portaria-192.png`, `frontend/icones/portaria-512.png`, `frontend/icones/portaria-192-maskable.png`, `frontend/icones/portaria-512-maskable.png`, `frontend/apple-touch-icon.png`
- Teste: `tests/test_portaria_pwa.py`

**Interfaces:**
- Consome: um PNG de origem. Padrão: `frontend/logo.png` (hoje 530×410, RGBA). Se o usuário entregar outro arquivo, ele entra como `frontend/icone-portaria-origem.png` e o script o prefere automaticamente.
- Produz: os cinco caminhos acima, todos **quadrados** e **opacos**, que a Tarefa 2 referencia por nome.

- [ ] **Passo 1: escrever o teste que falha**

Crie `tests/test_portaria_pwa.py`:

```python
# -*- coding: utf-8 -*-
"""A portaria como aplicativo instalado no celular do porteiro.

O que estes testes protegem: que o aparelho INSTALE (manifesto e icones
validos), que ele ABRA SEM REDE depois de instalado, e que uma publicacao nova
chegue ao aparelho em vez de ficar presa na versao do dia da instalacao.
"""

import json
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── Icones ──────────────────────────────────────────────────────────────────

ICONES_ESPERADOS = [
    ("frontend/icones/portaria-192.png", 192),
    ("frontend/icones/portaria-512.png", 512),
    ("frontend/icones/portaria-192-maskable.png", 192),
    ("frontend/icones/portaria-512-maskable.png", 512),
    ("frontend/apple-touch-icon.png", 180),
]


@pytest.mark.parametrize("caminho,lado", ICONES_ESPERADOS)
def test_o_icone_existe_e_e_quadrado(caminho, lado):
    from PIL import Image

    completo = os.path.join(RAIZ, caminho)
    assert os.path.exists(completo), (
        caminho + " nao existe. Rode: .\\venv\\Scripts\\python.exe "
        "ferramentas\\gerar_icones_pwa.py"
    )
    with Image.open(completo) as im:
        assert im.size == (lado, lado), f"{caminho} deveria ser {lado}x{lado}"


@pytest.mark.parametrize("caminho,_lado", ICONES_ESPERADOS)
def test_o_icone_e_opaco(caminho, _lado):
    """Sem canal alfa, de proposito.

    Um "maskable" com fundo transparente aparece como marca solta e cortada
    dentro da mascara do Android; o icone do iPhone com transparencia e
    composto sobre PRETO, e a marca escura some.
    """
    from PIL import Image

    with Image.open(os.path.join(RAIZ, caminho)) as im:
        assert im.mode == "RGB", f"{caminho} deveria ser opaco (RGB), veio {im.mode}"
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: FALHA nos dez testes, com a mensagem "…/portaria-192.png nao existe".

- [ ] **Passo 3: escrever o gerador**

Crie `ferramentas/gerar_icones_pwa.py`:

```python
# -*- coding: utf-8 -*-
"""Gera os icones do PWA da portaria a partir de um PNG unico.

Por que um script, e nao cinco arquivos feitos a mao: a marca muda, e refazer
cinco PNGs mantendo a mesma proporcao e exatamente onde o erro entra. Aqui a
proporcao e constante e o `tests/test_portaria_pwa.py` confere o resultado.

Rode: .\\venv\\Scripts\\python.exe ferramentas\\gerar_icones_pwa.py
"""

import os

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")

# Se o usuario entregar um icone proprio, ele entra aqui e tem preferencia.
ORIGEM_PREFERIDA = os.path.join(FRENTE, "icone-portaria-origem.png")
ORIGEM_PADRAO = os.path.join(FRENTE, "logo.png")

FUNDO = (10, 15, 30)  # #0a0f1e -- o mesmo --bg da portaria.html

# (caminho de saida, lado em pixels, fracao do lado que a marca ocupa)
#
# 0.86 nos icones comuns: quase cheio, que e como o Android desenha quando NAO
#      aplica mascara.
# 0.60 nos "maskable": a mascara pode comer ate 20% de cada borda, e o circulo
#      seguro tem 80% do lado. 0.60 cabe com folga em qualquer mascara --
#      circulo, quadrado arredondado ou gota.
# 0.80 no do iPhone: o iOS arredonda os cantos por conta, sem mascara agressiva.
SAIDAS = [
    (os.path.join(FRENTE, "icones", "portaria-192.png"), 192, 0.86),
    (os.path.join(FRENTE, "icones", "portaria-512.png"), 512, 0.86),
    (os.path.join(FRENTE, "icones", "portaria-192-maskable.png"), 192, 0.60),
    (os.path.join(FRENTE, "icones", "portaria-512-maskable.png"), 512, 0.60),
    (os.path.join(FRENTE, "apple-touch-icon.png"), 180, 0.80),
]


def origem():
    if os.path.exists(ORIGEM_PREFERIDA):
        return ORIGEM_PREFERIDA
    return ORIGEM_PADRAO


def gerar(marca, caminho, lado, fracao):
    """Centraliza a marca num quadrado opaco, sem distorcer.

    `min()` nas duas escalas, e nao `resize((lado, lado))`: a marca nao e
    quadrada (530x410 hoje), e esticar para caber deformaria a logomarca.
    """
    tela = Image.new("RGBA", (lado, lado), FUNDO + (255,))
    alvo = lado * fracao
    escala = min(alvo / marca.width, alvo / marca.height)
    novo = (max(1, int(round(marca.width * escala))),
            max(1, int(round(marca.height * escala))))
    reduzida = marca.resize(novo, Image.LANCZOS)
    tela.paste(reduzida, ((lado - novo[0]) // 2, (lado - novo[1]) // 2), reduzida)

    pasta = os.path.dirname(caminho)
    if not os.path.isdir(pasta):
        os.makedirs(pasta)
    # convert("RGB") achata sobre o FUNDO: os icones saem OPACOS de proposito
    # (ver o teste `test_o_icone_e_opaco`).
    tela.convert("RGB").save(caminho, "PNG", optimize=True)
    return caminho


def main():
    caminho_origem = origem()
    print("origem: " + os.path.relpath(caminho_origem, RAIZ))
    with Image.open(caminho_origem) as bruta:
        marca = bruta.convert("RGBA")
        for caminho, lado, fracao in SAIDAS:
            gerar(marca, caminho, lado, fracao)
            print("  " + os.path.relpath(caminho, RAIZ) + f"  {lado}x{lado}")


if __name__ == "__main__":
    main()
```

- [ ] **Passo 4: gerar os ícones e rodar o teste**

Rode:
```powershell
.\venv\Scripts\python.exe ferramentas\gerar_icones_pwa.py
.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v
```
Esperado: o script imprime os cinco caminhos; os dez testes PASSAM.

- [ ] **Passo 5: olhar os ícones**

Abra `frontend/icones/portaria-512-maskable.png` e confira a olho: a marca precisa estar **inteira e centralizada**, com folga generosa nas bordas. Se estiver colada na borda, a máscara do Android vai cortá-la — reduza a fração de `0.60`.

- [ ] **Passo 6: commit**

```powershell
git add ferramentas/gerar_icones_pwa.py frontend/icones frontend/apple-touch-icon.png tests/test_portaria_pwa.py
git commit -m "portaria(pwa): os icones do aplicativo, gerados por script"
```

---

## Tarefa 2: O manifesto e a cabeça da página

**Arquivos:**
- Criar: `frontend/portaria.webmanifest`
- Modificar: `frontend/portaria.html` (o `<head>`, entre a linha 7 e o `<style>`)
- Modificar: `vercel.json`, `frontend/vercel.json`
- Teste: `tests/test_portaria_pwa.py`

**Interfaces:**
- Consome: os cinco ícones da Tarefa 1.
- Produz: `start_url` e `scope` iguais a `/portaria.html` — a Tarefa 3 depende disso, porque o `start_url` **não leva `?e=<evento>`**.

- [ ] **Passo 1: escrever os testes que falham**

Acrescente a `tests/test_portaria_pwa.py`:

```python
# ── Manifesto ───────────────────────────────────────────────────────────────

def _manifesto():
    return json.loads(_ler("frontend/portaria.webmanifest"))


def test_o_manifesto_e_json_valido_com_os_campos_que_o_chrome_exige():
    m = _manifesto()
    assert m["name"]
    assert m["short_name"]
    assert m["start_url"] == "/portaria.html"
    assert m["display"] == "standalone"
    assert m["icons"]


def test_o_escopo_e_so_a_portaria():
    """Escopo largo capturaria producao.html, controle.html e evento.html.

    O service worker ja e registrado com `scope: '/portaria.html'` pelo mesmo
    motivo. Um manifesto com escopo '/' faria o aplicativo instalado abrir a
    tela da GRAFICA quando o porteiro tocasse num link do painel.
    """
    m = _manifesto()
    assert m["scope"] == "/portaria.html"
    assert m["start_url"].startswith(m["scope"])


def test_o_manifesto_aponta_para_icones_que_existem():
    for icone in _manifesto()["icons"]:
        caminho = os.path.join(RAIZ, "frontend", icone["src"].lstrip("/"))
        assert os.path.exists(caminho), icone["src"] + " nao existe"


def test_ha_icone_maskable_nos_dois_tamanhos():
    """Sem `purpose: maskable` o Android desenha o icone dentro de um quadrado
    branco com sombra -- feio e, pior, sem a marca ocupando o espaco."""
    mascaraveis = [i for i in _manifesto()["icons"] if "maskable" in i.get("purpose", "")]
    assert {i["sizes"] for i in mascaraveis} == {"192x192", "512x512"}


def test_as_tres_cores_sao_a_mesma():
    """theme_color, background_color e o --bg da pagina.

    Diferentes, a tela de abertura pisca de uma cor para outra na frente do
    porteiro toda vez que o aplicativo abre.
    """
    m = _manifesto()
    assert m["theme_color"] == "#0a0f1e"
    assert m["background_color"] == "#0a0f1e"
    assert 'content="#0a0f1e"' in _ler("frontend/portaria.html")


# ── Cabeca da pagina ────────────────────────────────────────────────────────

def test_a_pagina_declara_o_manifesto():
    assert 'rel="manifest"' in _ler("frontend/portaria.html")
    assert "portaria.webmanifest" in _ler("frontend/portaria.html")


def test_o_manifesto_nao_leva_versao_na_url():
    """O publicar.ps1 so renumera `.js?v=` e `.css?v=`.

    Um `portaria.webmanifest?v=605` ficaria congelado no 605 para sempre, e o
    aparelho instalado nunca veria icone novo.
    """
    texto = _ler("frontend/portaria.html")
    assert "portaria.webmanifest?v=" not in texto


def test_a_pagina_tem_as_metas_do_iphone():
    """O iOS ignora o manifesto: ele so obedece a estas tres metas."""
    texto = _ler("frontend/portaria.html")
    assert 'rel="apple-touch-icon"' in texto
    assert 'name="apple-mobile-web-app-capable"' in texto
    assert 'name="apple-mobile-web-app-title"' in texto


def test_a_vercel_serve_o_manifesto_com_o_tipo_certo():
    """Servido como text/plain, o Chrome ignora o manifesto em silencio."""
    for arquivo in ("vercel.json", "frontend/vercel.json"):
        conf = json.loads(_ler(arquivo))
        regras = [h for h in conf["headers"] if "webmanifest" in h["source"]]
        assert regras, arquivo + " nao declara o tipo do manifesto"
        tipos = [c["value"] for r in regras for c in r["headers"]
                 if c["key"].lower() == "content-type"]
        assert tipos == ["application/manifest+json"], arquivo
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: FALHA com `FileNotFoundError: …portaria.webmanifest`.

- [ ] **Passo 3: escrever o manifesto**

Crie `frontend/portaria.webmanifest`:

```json
{
  "id": "/portaria.html",
  "name": "Portaria — Ideal Control",
  "short_name": "Portaria",
  "description": "Leitura de ingressos no portão. Funciona sem rede.",
  "lang": "pt-BR",
  "dir": "ltr",
  "start_url": "/portaria.html",
  "scope": "/portaria.html",
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

Notas de projeto, para quem revisar:
- **`id` fixo** — sem ele a identidade do app é a `start_url`, e mudar a `start_url` um dia criaria um segundo ícone na tela do porteiro em vez de atualizar o que existe.
- **`display: "standalone"`, e não `"fullscreen"`** — em fullscreen o relógio e a bateria somem, e o turno do porteiro dura horas.
- **`orientation: "portrait"`** — a leitura é com uma mão só.

- [ ] **Passo 4: escrever a cabeça da página**

Em `frontend/portaria.html`, logo depois da linha `<meta name="theme-color" content="#0a0f1e">` (linha 7), insira:

```html
    <meta name="description" content="Leitura de ingressos no portão. Funciona sem rede.">
    <link rel="manifest" href="/portaria.webmanifest">
    <link rel="icon" href="/icones/portaria-192.png" type="image/png">

    <!--
        O iOS NAO le o manifesto: nome, icone e "abrir sem barra do Safari"
        so saem destas metas. Sem elas, "Adicionar a Tela de Inicio" no iPhone
        cria um atalho com print da pagina no lugar do icone, e abre dentro do
        Safari com a barra ocupando a tela.

        `black-translucent` combina com o `viewport-fit=cover` e o
        `env(safe-area-inset-*)` que o `body` ja usa: a cor da pagina sobe ate
        embaixo do relogio, e nada de util fica escondido pelo entalhe.

        Um efeito colateral que vale saber: instalado na tela de inicio, o iOS
        deixa de apagar o armazenamento do site depois de 7 dias sem uso. A
        carga do evento e a fila de leituras que ainda nao subiram vivem no
        IndexedDB -- sem instalar, um celular parado entre um evento e outro
        pode acordar vazio.
    -->
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Portaria">
```

- [ ] **Passo 5: escrever o tipo do manifesto na Vercel**

Em **`vercel.json`** e em **`frontend/vercel.json`**, acrescente ao array `headers`, **antes** da regra genérica `"/(.*)"`:

```json
    {
      "source": "/(.*\\.webmanifest)",
      "headers": [
        { "key": "Content-Type", "value": "application/manifest+json" },
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    },
```

O `no-cache` aqui é de propósito: o manifesto não carrega `?v=`, então é a única forma de um ícone novo chegar a quem já instalou.

- [ ] **Passo 6: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 7: commit**

```powershell
git add frontend/portaria.webmanifest frontend/portaria.html vercel.json frontend/vercel.json tests/test_portaria_pwa.py
git commit -m "portaria(pwa): manifesto, metas do iPhone e Content-Type na Vercel"
```

---

## Tarefa 3: Lembrar o evento

**O problema:** o `start_url` do manifesto é `/portaria.html`, sem `?e=<evento_id>`. Hoje `eventoDaUrl()` lê o evento **só** da querystring, e o pareamento envia esse valor. Um porteiro que instale o aplicativo **antes** de parear abre o ícone, digita o código e recebe erro — porque o `evento_id` foi embora com a URL.

Depois de pareado o aparelho já funciona sem `?e=`: o boot lê o token do `localStorage` e a carga do IndexedDB (`portaria.js:367-375`). O buraco é só o primeiro pareamento.

**Arquivos:**
- Modificar: `frontend/portaria.js:70-72` (`eventoDaUrl`)
- Teste: `tests/test_portaria_pwa.py`

**Interfaces:**
- Consome: nada de tarefas anteriores.
- Produz: chave `ideal_portaria_evento` no `localStorage`, gravada assim que a página abre com `?e=`.

- [ ] **Passo 1: escrever o teste que falha**

Acrescente a `tests/test_portaria_pwa.py`:

```python
# ── O evento sobrevive ao start_url sem querystring ─────────────────────────

def test_o_evento_e_lembrado_fora_da_url():
    """O `start_url` do manifesto nao leva `?e=`.

    Quem instalar o aplicativo ANTES de parear abriria o icone e mandaria
    `evento_id: ''` ao servidor.
    """
    js = _ler("frontend/portaria.js")
    assert "ideal_portaria_evento" in js
    assert "CHAVE_EVENTO" in js
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py::test_o_evento_e_lembrado_fora_da_url -v`
Esperado: FALHA em `assert "ideal_portaria_evento" in js`.

- [ ] **Passo 3: implementar**

Em `frontend/portaria.js`, na linha 17, ao lado de `CHAVE_TOKEN`:

```javascript
    var CHAVE_TOKEN = 'ideal_portaria_token';
    var CHAVE_EVENTO = 'ideal_portaria_evento';
```

E substitua a função `eventoDaUrl` (linhas 70-72) por:

```javascript
    function eventoDaUrl() {
        // O `start_url` do manifesto e `/portaria.html`, SEM `?e=`. Tem de ser
        // assim: o endereco que o dono compartilha carrega o evento, mas o
        // icone na tela de inicio e um so, e um `?e=` cravado nele prenderia o
        // aparelho no primeiro evento para sempre.
        //
        // Depois de pareado nada disso importa -- o token e que manda, e o
        // boot le carga do IndexedDB. O caso que esta linha cobre e o porteiro
        // que INSTALA antes de parear: ele abre o icone, a URL vem limpa, e
        // sem esta memoria o `parear` mandaria `evento_id: ''`.
        var daUrl = new URLSearchParams(window.location.search).get('e') || '';
        if (daUrl) {
            try { localStorage.setItem(CHAVE_EVENTO, daUrl); } catch (e) { /* modo privado */ }
            return daUrl;
        }
        try { return localStorage.getItem(CHAVE_EVENTO) || ''; } catch (e) { return ''; }
    }
```

O `try/catch` não é decoração: em aba privada do Safari o `localStorage.setItem` **lança**, e um throw aqui derrubaria o pareamento inteiro.

- [ ] **Passo 4: rodar o teste**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 5: commit**

```powershell
git add frontend/portaria.js tests/test_portaria_pwa.py
git commit -m "portaria(pwa): lembrar o evento, porque o start_url nao leva ?e="
```

---

## Tarefa 4: O service worker de aplicativo instalado

Três mudanças no `frontend/sw.js`, todas pelo mesmo motivo: quando a portaria é um ícone na tela de início, não há barra de endereço para recarregar nem aba para fechar.

**a) Pré-cachear o manifesto e os ícones.** Sem isso, abrir o aplicativo sem rede funciona, mas o Android não consegue reler o manifesto e o ícone pode aparecer genérico.

**b) Deixar passar o que é de outra origem.** A regra atual (`if (url.pathname.startsWith('/api/')) return;`) foi escrita quando a API era `/api/…` no mesmo domínio, via Render. **Hoje a API é `…supabase.co/functions/v1/portaria`** — outra origem, que não casa com aquele `if` e cai no ramo cache-first. Hoje isso é inofensivo (o cache nunca tem a URL e o `fetch` acontece), mas é uma consulta a cache em cada leitura de ingresso e uma armadilha esperando um nome colidir.

**c) Casar a versão de forma exata nos subrecursos.** É o defeito mais sério para um aplicativo instalado. Hoje o `match(..., { ignoreSearch: true })` no ramo cache-first faz um pedido de `/portaria.js?v=606` **casar com o `/portaria.js?v=605` guardado**. O HTML novo chega (a navegação é network-first), mas o JavaScript continua o antigo até o service worker se trocar. Com casamento exato, o offline continua garantido — offline a navegação cai no HTML **do cache**, que pede exatamente os `?v=` daquela mesma geração — e online o arquivo novo é buscado na rede. O `ignoreSearch` continua onde nasceu: na navegação, por causa do `?e=<evento>`.

**Arquivos:**
- Modificar: `frontend/sw.js`
- Teste: `tests/test_portaria_pwa.py`

**Interfaces:**
- Consome: os caminhos dos ícones (Tarefa 1) e do manifesto (Tarefa 2).
- Produz: nada que outra tarefa consuma.

- [ ] **Passo 1: escrever os testes que falham**

Acrescente a `tests/test_portaria_pwa.py`:

```python
# ── Service worker ──────────────────────────────────────────────────────────

def test_o_pre_cache_inclui_o_manifesto_e_os_icones():
    sw = _ler("frontend/sw.js")
    assert "/portaria.webmanifest" in sw
    assert "/icones/portaria-192.png" in sw
    assert "/icones/portaria-512.png" in sw
    assert "/apple-touch-icon.png" in sw


def test_o_service_worker_ignora_outra_origem():
    """A API vive em outro dominio (Edge Function do Supabase).

    Sem esta saida, cada leitura de ingresso passa por uma consulta ao cache
    antes de ir a rede -- e um nome que colida um dia devolveria resposta velha
    a uma pergunta de controle de acesso.
    """
    sw = _ler("frontend/sw.js")
    assert "self.location.origin" in sw


def test_o_ignoreSearch_so_vale_para_a_navegacao():
    """Com ignoreSearch nos subrecursos, um pedido de `portaria.js?v=606` casa
    com o `?v=605` guardado, e o aparelho instalado fica preso no codigo do dia
    em que instalou."""
    sw = _ler("frontend/sw.js")
    assert sw.count("ignoreSearch") == 1


def test_o_pre_cache_e_o_html_pedem_a_mesma_versao():
    """O `publicar.ps1` renumera os dois no mesmo passo; se um dia deixarem de
    combinar, a instalacao guarda um arquivo que a pagina nunca pede."""
    import re

    html = _ler("frontend/portaria.html")
    versoes = set(re.findall(r"\.js\?v=(\d+)", html))
    assert len(versoes) == 1, f"portaria.html tem versoes misturadas: {sorted(versoes)}"
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: FALHAM `test_o_pre_cache_inclui_o_manifesto_e_os_icones`, `test_o_service_worker_ignora_outra_origem` e `test_o_ignoreSearch_so_vale_para_a_navegacao` (este último com `2 == 1`).

- [ ] **Passo 3: implementar**

Em `frontend/sw.js`, troque a lista `ARQUIVOS` (linhas 26-34) por:

```javascript
const ARQUIVOS = [
    '/portaria.html',
    '/qr-ideal-hash.js?v=' + VERSAO,
    '/portaria-validacao.js?v=' + VERSAO,
    '/portaria-deposito.js?v=' + VERSAO,
    '/portaria-camera.js?v=' + VERSAO,
    '/portaria.js?v=' + VERSAO,
    '/jsqr.min.js?v=' + VERSAO,
    // Sem versao, de proposito: o `publicar.ps1` so renumera `.js?v=` e
    // `.css?v=`. Estes quatro sao servidos com `no-cache` pela Vercel, entao a
    // instalacao seguinte ja pega o arquivo novo.
    '/portaria.webmanifest',
    '/icones/portaria-192.png',
    '/icones/portaria-512.png',
    '/apple-touch-icon.png',
];
```

Depois troque o corpo do `fetch` (linhas 50-98) por:

```javascript
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Outra ORIGEM nunca passa por aqui: a API da portaria e uma Edge Function
    // do Supabase (`…supabase.co/functions/v1/portaria`), em outro dominio.
    // Uma resposta de controle de acesso servida de cache faria o aparelho
    // recusar ingresso que existe, ou aceitar um que foi cancelado.
    if (url.origin !== self.location.origin) return;
    if (e.request.method !== 'GET') return;

    if (e.request.mode === 'navigate') {
        // SO a navegacao (abrir/recarregar portaria.html) e network-first.
        // Cache-first aqui prenderia a pagina na versao do dia em que o
        // aparelho pareou -- para sempre, mesmo publicando de novo. "Abrir sem
        // rede" continua garantido: o catch so cai no cache quando a rede
        // falha de verdade.
        //
        // Ignorar a query AQUI, e so aqui: o endereco que o dono compartilha
        // e "/portaria.html?e=<evento_id>", mas o install guardou a chave sem
        // query. Sem isso, o match falharia bem no caso que este arquivo
        // existe para cobrir -- reabrir sem rede.
        e.respondWith(
            fetch(e.request).catch(() =>
                caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })))
        );
        return;
    }

    // Os arquivos que a pagina referencia: CACHE-FIRST, com casamento EXATO da
    // URL (o `?v=` incluido). Rede so quando o cache nao tem.
    //
    // Por que exato, e nao ignoreSearch como a navegacao: ignorando a query, um
    // pedido de `/portaria.js?v=606` casaria com o `/portaria.js?v=605`
    // guardado, e o aparelho instalado rodaria codigo antigo sob HTML novo.
    // Numa portaria isso e a pior forma de bug: a regra de validacao publicada
    // hoje nao seria a regra que decide na porta.
    //
    // E o "abrir sem rede" continua de pe -- reparar que as duas pontas usam a
    // MESMA geracao. Sem rede, a navegacao cai no HTML do cache, e esse HTML
    // pede exatamente os `?v=` que o install daquela geracao guardou. Com rede,
    // o HTML novo pede `?v=` novo, o cache nao tem, e a rede responde.
    e.respondWith(
        caches.open(CACHE)
            .then(c => c.match(e.request))
            .then(r => r || fetch(e.request))
    );
});
```

E atualize o comentário do topo do arquivo (linhas 17-21), que hoje descreve o `ignoreSearch` valendo para os dois ramos:

```javascript
 * A saida esta no `fetch` abaixo: a NAVEGACAO (abrir ou recarregar
 * portaria.html) e network-first, entao toda abertura pega o HTML mais
 * novo -- que ja chega com os `?v=` novos nas tags `<script>`, e com o
 * `register('/sw.js?v=NNN')` novo, que e o que faz o proprio service worker
 * se trocar. Os outros arquivos continuam cache-first, casando a URL
 * INTEIRA (`?v=` incluido), que e o que garante "abrir sem rede" sem
 * prender o aparelho no codigo de uma geracao anterior.
```

- [ ] **Passo 4: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 5: commit**

```powershell
git add frontend/sw.js tests/test_portaria_pwa.py
git commit -m "portaria(pwa): pre-cache do manifesto, outra origem passa direto, versao casa exata"
```

---

## Tarefa 5: O aviso de atualização

Instalado, o aplicativo não tem barra de endereço: o porteiro não consegue recarregar. Quando uma versão nova é publicada, o service worker novo instala em segundo plano — mas a tela em uso continua com o código antigo até alguém fechar e abrir.

**Recarregar sozinho está fora de questão:** o porteiro pode estar com a câmera aberta e a fila andando. A tela avisa, e ele decide a hora.

**Arquivos:**
- Modificar: `frontend/portaria.html` (uma faixa nova, e o bloco `<script>` do registro nas linhas 147-166)
- Teste: `tests/test_portaria_pwa.py`

- [ ] **Passo 1: escrever o teste que falha**

```python
def test_a_tela_avisa_quando_ha_versao_nova():
    """Instalado, o aplicativo nao tem barra de endereco: sem este aviso o
    porteiro nao tem como recarregar."""
    html = _ler("frontend/portaria.html")
    assert 'id="faixa-atualizacao"' in html
    assert "updatefound" in html


def test_a_atualizacao_nunca_recarrega_sozinha():
    """Recarregar no meio de uma leitura perde a fila da tela e assusta quem
    esta com a fila andando na frente."""
    html = _ler("frontend/portaria.html")
    assert "location.reload" in html
    # A recarga tem de estar pendurada num clique, nunca solta no fluxo.
    trecho = html[html.index("faixa-atualizacao"):]
    assert "onclick" in trecho or "addEventListener('click'" in trecho
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -k atualiza -v`
Esperado: FALHA em `assert 'id="faixa-atualizacao"' in html`.

- [ ] **Passo 3: acrescentar a faixa**

Em `frontend/portaria.html`, dentro da `<div class="folha">`, como **primeiro** elemento (antes da `.topo`), insira:

```html
    <!-- Fica escondida ate existir versao nova instalada e esperando. -->
    <button id="faixa-atualizacao" class="sumindo" type="button">
        Atualização disponível — toque para aplicar
    </button>
```

E no `<style>`, junto das outras regras de `button`:

```css
        /* A faixa de atualizacao NAO e um botao de acao: menor, discreta, e
           acima de tudo -- ela nao pode competir com o alvo de toque que o
           porteiro procura no escuro. */
        #faixa-atualizacao {
            margin: 0 0 12px; padding: 10px; min-height: 0;
            font-size: 0.85rem; font-weight: 600;
            background: rgba(20,184,166,0.14); color: var(--teal);
            border: 1px solid rgba(20,184,166,0.4);
        }
```

- [ ] **Passo 4: reescrever o bloco do registro**

Troque o `<script>` final de `frontend/portaria.html` (linhas 147-166) por:

```html
<script>
    // Registrar DEPOIS de tudo carregar: um service worker que instala no meio
    // do carregamento pode guardar resposta pela metade.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            // scope: '/portaria.html' -- sem isto o escopo padrao seria a
            // origin inteira ('/'), e o self.clients.claim() do sw.js faria
            // este service worker assumir TAMBEM producao.html, controle.html
            // e evento.html. Ele foi pensado so para a portaria; abas de
            // outra tela nao podem ter seu fetch interceptado por ele.
            navigator.serviceWorker.register('/sw.js?v=605', { scope: '/portaria.html' })
                .then(function (reg) {
                    // Instalado na tela de inicio, o aplicativo nao tem barra
                    // de endereco: sem este aviso o porteiro nao tem COMO
                    // recarregar, e ficaria na versao do dia da instalacao ate
                    // alguem desinstalar.
                    //
                    // Nunca recarregar sozinho: a camera pode estar aberta e a
                    // fila andando. A tela avisa; a hora e dele.
                    var faixa = document.getElementById('faixa-atualizacao');
                    if (!faixa) return;

                    faixa.addEventListener('click', function () { location.reload(); });

                    function vigiar(trabalhador) {
                        if (!trabalhador) return;
                        trabalhador.addEventListener('statechange', function () {
                            // `navigator.serviceWorker.controller` existir e o
                            // que separa ATUALIZACAO de PRIMEIRA instalacao --
                            // sem esse teste, a faixa apareceria na primeira
                            // vez que o aparelho abre a portaria, oferecendo
                            // recarregar uma pagina que acabou de carregar.
                            if (trabalhador.state === 'installed' && navigator.serviceWorker.controller) {
                                faixa.classList.remove('sumindo');
                            }
                        });
                    }

                    vigiar(reg.installing);
                    reg.addEventListener('updatefound', function () { vigiar(reg.installing); });
                })
                .catch(function (e) {
                    // Silencioso aqui seria o pior lugar para silenciar: "por
                    // que este aparelho nao abre offline" e a pergunta que
                    // esta tela existe para responder.
                    console.error('service worker da portaria nao registrou -- o aparelho nao vai abrir sem rede:', e);
                });
        });
    }
</script>
```

- [ ] **Passo 5: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 6: commit**

```powershell
git add frontend/portaria.html tests/test_portaria_pwa.py
git commit -m "portaria(pwa): faixa de atualizacao, porque instalado nao ha como recarregar"
```

---

## Tarefa 6: A tela não apaga

O celular apaga a tela sozinho em 30 segundos. No portão, isso significa o porteiro desbloqueando o aparelho entre uma pessoa e outra — com a fila andando.

A `Screen Wake Lock` resolve, e é um dos poucos recursos que só existem em página segura e fazem diferença de verdade aqui. Precisa ser **pedida de novo** quando o aplicativo volta do segundo plano: o sistema solta a trava sozinho ao minimizar.

**Arquivos:**
- Modificar: `frontend/portaria.js` (função `mostrar`, linhas 22-26, e a partida)
- Teste: `tests/test_portaria_pwa.py`

**Interfaces:**
- Consome: a função `mostrar(qual)` existente, que já é o ponto único de troca de tela.
- Produz: nada que outra tarefa consuma.

- [ ] **Passo 1: escrever o teste que falha**

```python
def test_a_tela_fica_acesa_enquanto_le():
    """30 segundos de inatividade apagariam a tela entre uma pessoa e outra."""
    js = _ler("frontend/portaria.js")
    assert "wakeLock" in js
    assert "visibilitychange" in js, (
        "o sistema solta a trava ao minimizar; sem repedir, ela nao volta"
    )
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -k acesa -v`
Esperado: FALHA em `assert "wakeLock" in js`.

- [ ] **Passo 3: implementar**

Em `frontend/portaria.js`, logo depois da função `mostrar` (linha 26), acrescente:

```javascript
    // ── A tela nao apaga ────────────────────────────────────────────────────
    // No portao o aparelho fica na mao, lendo um ingresso a cada poucos
    // segundos -- e mesmo assim o celular apaga a tela sozinho em 30s, porque
    // ler QR nao conta como "uso" para o sistema. Cada apagada custa um
    // desbloqueio com a fila parada.
    var trava = null;

    function acenderTela() {
        if (!('wakeLock' in navigator) || trava) return;
        navigator.wakeLock.request('screen').then(function (t) {
            trava = t;
            // O sistema pode soltar por conta propria (bateria fraca, tela
            // desligada pelo botao). Zerar aqui e o que permite repedir.
            t.addEventListener('release', function () { trava = null; });
        }).catch(function () {
            // Recusa e normal: navegador sem suporte, bateria em economia,
            // aba em segundo plano. A portaria funciona igual -- so apaga a
            // tela como qualquer site. Nao vale incomodar o porteiro com isso.
        });
    }

    function apagarPermitido() {
        if (trava) { trava.release(); trava = null; }
    }

    document.addEventListener('visibilitychange', function () {
        // Voltar do segundo plano SEMPRE solta a trava, sem avisar. Sem este
        // repedido, a tela fica acesa ate a primeira vez que o porteiro atende
        // uma ligacao -- e nunca mais.
        if (document.visibilityState === 'visible' && !$('tela-lendo').classList.contains('sumindo')) {
            acenderTela();
        }
    });
```

E dentro da função `mostrar`, ao final:

```javascript
    function mostrar(qual) {
        ['pareando', 'carregando', 'lendo', 'resposta', 'ambiguo'].forEach(function (t) {
            $('tela-' + t).classList.toggle('sumindo', t !== qual);
        });
        // A trava vale nas telas de trabalho -- ler o codigo e mostrar a
        // resposta. Nas telas de pareamento e carga o aparelho pode dormir.
        if (qual === 'lendo' || qual === 'resposta' || qual === 'ambiguo') acenderTela();
        else apagarPermitido();
    }
```

- [ ] **Passo 4: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 5: commit**

```powershell
git add frontend/portaria.js tests/test_portaria_pwa.py
git commit -m "portaria(pwa): a tela nao apaga enquanto o porteiro le"
```

---

## Tarefa 7: A lanterna

O comentário no topo da `portaria.html` descreve a cena: *"uma mão, no escuro, com sol de refletor na cara e a fila andando"*. Ingresso escuro em portão sem luz é onde a leitura falha — e a lanterna do próprio aparelho resolve, sem sair da câmera.

Só existe no Chrome/Android (o iPhone não expõe a lanterna a página nenhuma). O botão **aparece somente onde funciona** — botão morto na tela é pior do que botão ausente.

**Arquivos:**
- Modificar: `frontend/portaria-camera.js`
- Modificar: `frontend/portaria.html` (o botão, dentro da tela de leitura)
- Teste: `tests/test_portaria_pwa.py`

**Interfaces:**
- Consome: o `getUserMedia` já existente em `portaria-camera.js:35-42`, e a função `desligar()` (linhas 45-51).
- Produz, no `window.portariaCamera`:
  - `ligar()` → `Promise<void>` — **hoje devolve `undefined`**; passa a devolver a promessa, porque o botão da lanterna só pode ser decidido depois que a câmera abriu de verdade.
  - `temLanterna()` → `boolean`
  - `alternarLanterna()` → `Promise<boolean>` (o novo estado)

- [ ] **Passo 1: escrever o teste que falha**

```python
def test_a_lanterna_so_aparece_onde_funciona():
    """Botao morto na tela e pior que botao ausente -- o porteiro toca no
    escuro e conclui que o aparelho travou."""
    js = _ler("frontend/portaria-camera.js")
    assert "torch" in js
    assert "temLanterna" in js
    html = _ler("frontend/portaria.html")
    assert 'id="btn-lanterna"' in html
    assert "sumindo" in html


def test_o_ligar_da_camera_devolve_promessa():
    """Perguntar pela lanterna antes de o getUserMedia resolver responde
    sempre "nao tem" -- e o botao nunca apareceria em aparelho que tem."""
    js = _ler("frontend/portaria-camera.js")
    assert "return navigator.mediaDevices.getUserMedia" in js
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -k lanterna -v`
Esperado: FALHA em `assert "torch" in js`.

- [ ] **Passo 3: guardar o fluxo e devolver a promessa**

Hoje o `portaria-camera.js` só guarda o fluxo dentro de `video.srcObject`, e o `ligar()` não devolve nada. A lanterna precisa das duas coisas: a trilha de vídeo, e um jeito de saber **quando** ela existe (o `getUserMedia` é assíncrono — perguntar pela lanterna logo depois de chamar `ligar()` responderia sempre "não tem").

Em `frontend/portaria-camera.js`, troque a linha 17-18 por:

```javascript
    var video = null, canvas = null, ctx = null, detector = null;
    var rodando = false, ultimo = '', ultimoEm = 0;
    // O fluxo em variavel propria, e nao so em `video.srcObject`: o `desligar`
    // precisa apagar a lanterna DEPOIS de soltar o video da tela e ANTES de
    // parar a trilha, e nesse meio o `srcObject` ja foi a nulo.
    var fluxo = null, acesa = false;
```

Troque o `ligar()` (linhas 20-43) por — repare no `return` novo em três pontos:

```javascript
    function ligar() {
        if (rodando) return Promise.resolve();
        rodando = true;
        video = document.getElementById('cam');
        canvas = canvas || document.createElement('canvas');
        ctx = ctx || canvas.getContext('2d', { willReadFrequently: true });

        if (!detector && window.BarcodeDetector) {
            try {
                detector = new window.BarcodeDetector({
                    formats: ['qr_code', 'code_128', 'ean_13'],
                });
            } catch (e) { detector = null; }
        }

        // Devolve a promessa: quem chama precisa saber QUANDO a camera abriu,
        // para so entao perguntar se este aparelho tem lanterna.
        return navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, audio: false,
        }).then(function (f) {
            fluxo = f;
            video.srcObject = f;
            return video.play();
        }).then(quadro).catch(function () {
            rodando = false;   // sem camera a tela continua util pelo "Digitar o numero"
        });
    }
```

Troque o `desligar()` (linhas 45-51) por:

```javascript
    function desligar() {
        rodando = false;
        var f = fluxo;
        fluxo = null;
        if (video && video.srcObject) video.srcObject = null;
        if (!f) return;

        // Apagar a lanterna ANTES de parar a trilha, e esperar de verdade:
        // parar a trilha com a luz acesa deixa a lanterna do celular ligada em
        // varios aparelhos Android, e nao sobra tela nenhuma para apaga-la.
        var apagando = Promise.resolve();
        if (acesa) {
            var t = f.getVideoTracks()[0];
            if (t && t.applyConstraints) {
                try {
                    apagando = t.applyConstraints({ advanced: [{ torch: false }] });
                } catch (e) { /* aparelho que nao aceita: a parada resolve */ }
            }
        }
        acesa = false;
        apagando.catch(function () { }).then(function () {
            f.getTracks().forEach(function (t) { t.stop(); });
        });
    }
```

Acrescente a lanterna, logo depois do `desligar()`:

```javascript
    // ── Lanterna ────────────────────────────────────────────────────────────
    // So o Chrome no Android expoe isto (`torch` nas capacidades da trilha).
    // No iPhone nao existe para pagina nenhuma -- e por isso `temLanterna()`
    // e uma pergunta, e nao uma suposicao: quem chama tem de perguntar antes
    // de mostrar botao.
    function temLanterna() {
        var t = fluxo ? fluxo.getVideoTracks()[0] : null;
        if (!t || !t.getCapabilities) return false;
        return !!t.getCapabilities().torch;
    }

    function alternarLanterna() {
        if (!temLanterna()) return Promise.resolve(false);
        var t = fluxo.getVideoTracks()[0];
        var alvo = !acesa;
        return t.applyConstraints({ advanced: [{ torch: alvo }] })
            .then(function () { acesa = alvo; return acesa; })
            .catch(function () { return acesa; });
    }
```

E troque a linha 86 (o objeto exportado) por:

```javascript
    window.portariaCamera = {
        ligar: ligar, desligar: desligar,
        temLanterna: temLanterna, alternarLanterna: alternarLanterna,
    };
```

- [ ] **Passo 4: implementar na tela**

Em `frontend/portaria.html`, dentro de `#tela-lendo`, logo abaixo do vídeo:

```html
            <button id="btn-lanterna" class="discreto sumindo" type="button">Lanterna</button>
```

Em `frontend/portaria.js` há **dois** lugares que ligam a câmera (`entrarEmLeitura`, linha 142, e o `btn-proximo`, linha 324). Em vez de repetir o ajuste do botão nos dois, crie uma função só — logo antes de `entrarEmLeitura` (linha 133):

```javascript
    function ligarCamera() {
        if (!window.portariaCamera) return;
        // O rotulo volta ao repouso a cada abertura: o `desligar` apaga a
        // lanterna depois de cada leitura, e um botao dizendo "acesa" com a
        // luz apagada e pior do que botao nenhum.
        $('btn-lanterna').textContent = 'Lanterna';
        window.portariaCamera.ligar().then(function () {
            // So AGORA da para perguntar: antes de o getUserMedia resolver,
            // nao ha trilha de video e a resposta seria sempre "nao tem".
            //
            // O botao so aparece onde a lanterna existe de verdade -- Chrome
            // no Android. Botao morto no escuro faz o porteiro concluir que o
            // aparelho travou, e ele nao tem como saber que nao e isso.
            $('btn-lanterna').classList.toggle('sumindo', !window.portariaCamera.temLanterna());
        });
    }
```

Troque as duas chamadas por `ligarCamera();`:

```javascript
        mostrar('lendo');
        ligarCamera();
```

E acrescente o clique, junto dos outros:

```javascript
    $('btn-lanterna').onclick = function () {
        window.portariaCamera.alternarLanterna().then(function (acesa) {
            // O rotulo diz o ESTADO, nao a acao: no escuro, com a fila
            // andando, "Lanterna acesa" se le mais rapido que "Apagar".
            $('btn-lanterna').textContent = acesa ? 'Lanterna acesa' : 'Lanterna';
        });
    };
```

- [ ] **Passo 5: rodar os testes**

Rode: `.\venv\Scripts\python.exe -m pytest tests\test_portaria_pwa.py -v`
Esperado: TODOS PASSAM.

- [ ] **Passo 6: commit**

```powershell
git add frontend/portaria-camera.js frontend/portaria.html frontend/portaria.js tests/test_portaria_pwa.py
git commit -m "portaria(pwa): lanterna, onde o aparelho tem"
```

---

## Tarefa 8: Conferir no aparelho e publicar

Testes de estrutura não provam que o Chrome aceita instalar. Esta tarefa é a única que precisa de um celular na mão.

**Arquivos:** nenhum — é conferência e publicação.

- [ ] **Passo 1: a suíte inteira**

Rode: `.\venv\Scripts\python.exe -m pytest -q`
Esperado: as 183 que já passavam **mais** as novas, sem nenhuma falha nova.

- [ ] **Passo 2: conferência do projeto**

Rode: `.\ferramentas\conferir.ps1`
Esperado: nenhum ponto de atenção novo além dos já conhecidos (estações atrasadas).

- [ ] **Passo 3: publicar**

O usuário decide a hora. Quando ele mandar:

```powershell
.\publicar.ps1 "Portaria instalavel: manifesto, icones, tela acesa e lanterna" -Sim
.\publicar_agente.ps1 1.2.101
```

O agente sai junto porque o executável embute uma cópia do frontend — uma estação recém-instalada nasceria com o painel da versão anterior.

- [ ] **Passo 4: instalar num Android e conferir**

No Chrome do Android, abrir `https://<domínio>/portaria.html?e=<evento_id>`:

1. O menu oferece **"Instalar aplicativo"** (e não "Adicionar à tela inicial"). Se oferecer só a segunda, o manifesto foi recusado — abra `chrome://inspect` ou o DevTools remoto, aba **Application → Manifest**, e leia o erro.
2. O ícone na tela de início é a marca, **sem** moldura branca em volta.
3. Abrir pelo ícone: **sem barra de endereço**, cor `#0a0f1e` até em cima.
4. Parear, ler um ingresso, e então **ligar o modo avião**: o aplicativo tem de abrir e continuar validando pela carga local.
5. Deixar a tela de leitura aberta por dois minutos sem tocar: a tela **não** apaga.
6. O botão **Lanterna** aparece e acende a luz.

- [ ] **Passo 5: conferir num iPhone**

Safari → Compartilhar → **Adicionar à Tela de Início**:

1. O ícone é a marca (não um print da página).
2. O nome sob o ícone é **Portaria**.
3. Abrir pelo ícone: sem barra do Safari, e nada de útil escondido pelo entalhe.
4. A lanterna **não** aparece — está correto, o iOS não a expõe.

- [ ] **Passo 6: registrar**

Acrescente ao `CHANGELOG.md` a entrada da versão publicada, dizendo o que muda para quem opera: a portaria vira aplicativo instalável, a tela não apaga durante a leitura, e há lanterna no Android.

```powershell
git add CHANGELOG.md
git commit -m "docs: a portaria virou aplicativo instalavel"
```

---

## Fora deste plano, de propósito

- **Background Sync** (subir a fila com o aplicativo fechado). Exigiria mover o token do `localStorage` para o IndexedDB, porque service worker não enxerga `localStorage` — e o iOS não implementa a API. A portaria já sincroniza no evento `online` e a cada 30s com a tela aberta (`portaria.js:307-308`), que cobre a situação real: o porteiro está com o aparelho na mão.
- **Notificação push.** Não há nada que o servidor precise contar ao porteiro sem que ele pergunte.
- **Atalhos do manifesto (`shortcuts`)**, **`share_target`**, **capturas de tela na loja**. A portaria tem uma tela só e não recebe conteúdo compartilhado.
- **Instalar o painel da gráfica (`index.html`, `producao.html`) como PWA.** Outro escopo, outro público, e as estações já rodam o NewProd.
