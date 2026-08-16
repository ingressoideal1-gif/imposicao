# -*- coding: utf-8 -*-
"""Proxy de arquivos e catálogo de fontes: quem serve a página decide o destino.

## A regra que este arquivo vigia

Três coisas mudaram de endereço em 16/08/2026, e as três têm o MESMO critério:

    página servida pela ESTAÇÃO  ->  o agente local, sempre
    página servida pela NUVEM    ->  Edge Function (ou a tabela, na leitura)

O critério não é estético. A estação tem o arquivo em cache no disco e o
catálogo de fontes em disco; ler o catálogo é passo obrigatório de toda
imposição, e o operador está de pé na frente da impressora. Mandar a estação à
internet para buscar o que está do lado dela é o oposto da razão de o agente
existir.

E o contrário também quebra: na Vercel, `/api/proxy` relativo só chegava a
algum lugar por causa de um desvio no `vercel.json` para o Render. Enquanto a
Fase 4 não remove aquele desvio, um caminho relativo esconde a dependência —
depois dela, quebra a tela de aprovação do cliente.

## Por que num navegador de verdade

`urlDoProxy`, `urlDeEscritaDeFontes` e `lerCatalogoDeFontes` decidem a partir de
`API_BASE_URL`, que por sua vez sai de `window.location`. Não há como exercitar
isso sem uma origem real: em `about:blank` o `localStorage` do
`supabase-config.js` levanta SecurityError e o arquivo inteiro morre antes de
definir qualquer função.
"""
import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ARNES = r"""
const puppeteer = require('puppeteer');
const path = require('path');
const REPO = process.argv[2];
const PAGINA = process.argv[3];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));

  const CORS = { 'Access-Control-Allow-Origin': '*',
                 'Access-Control-Allow-Methods': '*',
                 'Access-Control-Allow-Headers': '*' };

  await page.setRequestInterception(true);
  page.on('request', req => {
    const alvo = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
    if (alvo === PAGINA) {
      return req.respond({ status: 200, contentType: 'text/html',
                           body: '<!doctype html><html><body></body></html>' });
    }
    // A leitura do catálogo pelo caminho do agente cai aqui.
    if (alvo.includes('/api/fontes')) {
      return req.respond({ status: 200, contentType: 'application/json', headers: CORS,
                           body: '[{"nome":"do agente"}]' });
    }
    return req.respond({ status: 200, contentType: 'application/json',
                         headers: CORS, body: '{}' });
  });

  await page.goto(PAGINA);

  await page.evaluate(() => {
    // O SDK fingido: `from(...).select(...).order(...)` devolve uma fonte que
    // só existe na TABELA, para dar para distinguir de onde a lista veio.
    window.__consultas = [];
    window.supabase = {
      createClient: () => ({
        auth: { getSession: async () => ({ data: { session: null } }) },
        from: (tabela) => ({
          select: () => ({
            order: async () => {
              window.__consultas.push(tabela);
              return { data: [{ nome: 'da tabela' }], error: null };
            }
          })
        })
      })
    };
  });

  await page.addScriptTag({ path: path.join(REPO, 'frontend', 'supabase-config.js') });

  const r = await page.evaluate(async () => {
    const catalogo = await lerCatalogoDeFontes();
    return {
      proxy: urlDoProxy('https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/x.pdf'),
      escritaFontes: urlDeEscritaDeFontes(),
      escritaFonteId: urlDeEscritaDeFontes('/abc'),
      catalogo: (catalogo[0] || {}).nome,
      consultas: window.__consultas,
    };
  });

  console.log(JSON.stringify({ ...r, erros }));
  await browser.close();
})();
"""

FUNCAO_ARQUIVO = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/arquivo"
FUNCAO_PAINEL = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/painel"


def _rodar(tmp_path, pagina):
    if not os.path.exists(os.path.join(RAIZ, "node_modules", "puppeteer")):
        pytest.skip("puppeteer não instalado (npm install)")
    script = tmp_path / "arnes.js"
    script.write_text(ARNES, encoding="utf-8")
    ambiente = dict(os.environ, NODE_PATH=os.path.join(RAIZ, "node_modules"))
    r = subprocess.run(["node", str(script), RAIZ, pagina], capture_output=True,
                       text=True, timeout=180, cwd=RAIZ, env=ambiente)
    assert r.returncode == 0, f"o arnês falhou:\n{r.stderr[-2000:]}"
    return json.loads(r.stdout.strip().splitlines()[-1])


@pytest.fixture(scope="module")
def nuvem(tmp_path_factory):
    return _rodar(tmp_path_factory.mktemp("nuvem"), "https://imposicao.vercel.app/")


@pytest.fixture(scope="module")
def estacao(tmp_path_factory):
    """A porta 9000 é a do agente, e é o que `supabase-config.js` reconhece
    como "esta página veio da estação"."""
    return _rodar(tmp_path_factory.mktemp("estacao"), "http://localhost:9000/")


# ─── Na nuvem ─────────────────────────────────────────────────────────────────


def test_na_nuvem_o_proxy_vai_para_a_edge_function(nuvem):
    assert nuvem["erros"] == []
    assert nuvem["proxy"].startswith(FUNCAO_ARQUIVO + "/api/proxy?url=")


def test_na_nuvem_a_escrita_de_fonte_vai_para_o_painel(nuvem):
    """A função `painel` exige sessão. É o que fecha a escrita anônima no
    catálogo, medida aberta em 16/08/2026."""
    assert nuvem["escritaFontes"] == FUNCAO_PAINEL + "/api/fontes"
    assert nuvem["escritaFonteId"] == FUNCAO_PAINEL + "/api/fontes/abc"


def test_na_nuvem_o_catalogo_vem_da_tabela(nuvem):
    """Sem escala pelo Render, que fazia exatamente esta consulta e devolvia o
    mesmo JSON."""
    assert nuvem["catalogo"] == "da tabela"
    assert nuvem["consultas"] == ["catalogo_fontes"]


# ─── Na estação ───────────────────────────────────────────────────────────────


def test_na_estacao_tudo_continua_no_agente(estacao):
    """A garantia de tempo: disco, sem rede. Se um dia estes três passarem a
    apontar para a nuvem, a imposição ganha a internet no caminho."""
    assert estacao["erros"] == []
    assert estacao["proxy"].startswith("/api/proxy?url=")
    assert estacao["escritaFontes"] == "/api/fontes"
    assert estacao["escritaFonteId"] == "/api/fontes/abc"


def test_na_estacao_o_catalogo_vem_do_agente_e_nao_da_tabela(estacao):
    assert estacao["catalogo"] == "do agente"
    assert estacao["consultas"] == [], "a estação foi à tabela ler o catálogo"


# ─── Nenhum ponto monta o endereço na mão ─────────────────────────────────────


def test_ninguem_mais_monta_api_proxy_a_mao():
    """Cinco pontos montavam, e três deles relativos. Um só lugar decide agora."""
    for arquivo in ("script.js", "cliente.js", "criador-arte.js"):
        with open(os.path.join(RAIZ, "frontend", arquivo), encoding="utf-8") as f:
            fonte = f.read()
        for linha in fonte.splitlines():
            if "/api/proxy?url=" in linha and "function urlDoProxy" not in linha:
                pytest.fail(f"{arquivo}: monta o proxy à mão -> {linha.strip()[:90]}")
