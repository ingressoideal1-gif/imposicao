# -*- coding: utf-8 -*-
"""Toda chamada do painel ao nosso motor leva a sessão junto.

É a outra metade de `test_escrita_anonima_na_nuvem.py`. Aquele prova que o
servidor **recusa** quem não se identifica; este prova que o painel **se
identifica** — e sem os dois casados, fechar o servidor derrubaria a gráfica
inteira em vez de fechar um buraco.

## Por que num navegador de verdade

O embrulho mora em `frontend/supabase-config.js` e troca o `window.fetch`
global. Duas coisas nele só existem em navegador e não teriam como ser testadas
de outro jeito: o `Headers`, que mescla o cabeçalho sem apagar os que já
estavam, e a recursão do SDK — o próprio Supabase usa `fetch` para renovar a
sessão, então pedir a sessão de dentro do `fetch` chamaria `fetch` de novo, para
sempre. O corte que evita isso é uma linha, e é a linha que este arquivo vigia.
"""
import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A origem do arnês. Um `fetch('/api/ordens')` dela vira este endereço absoluto
# quando chega ao interceptador.
PAGINA_DO_ARNES = "https://imposicao.vercel.app/"
MOTOR = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/painel"

ARNES = r"""
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const REPO = process.argv[2];

// A página precisa de uma ORIGEM de verdade, e não `about:blank`: sem ela o
// `localStorage` do `supabase-config.js` levanta SecurityError na linha 10, o
// arquivo inteiro morre antes de instalar o embrulho, e o teste mediria o
// arnês.
const PAGINA = 'https://imposicao.vercel.app/';

// O motor a que o painel fala por endereço ABSOLUTO. Desde 17/08/2026 sobrou
// um só: a Edge Function `painel`, que é quem grava a grade de permissões e os
// códigos de acesso local. O servidor Python que ficava na nuvem — e que era o
// que este teste exercitava até então — saiu do ar.
// O endereco vem do Python (argv[3]): uma fonte so, para as duas pontas nao
// divergirem quando a Edge Function mudar de nome.
const MOTOR = process.argv[3];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));

  const CORS = { 'Access-Control-Allow-Origin': '*',
                 'Access-Control-Allow-Methods': '*',
                 'Access-Control-Allow-Headers': '*' };
  const capturados = [];
  let capturando = false;

  await page.setRequestInterception(true);
  page.on('request', req => {
    const alvo = req.url();
    // O `Authorization` obriga o navegador a mandar o preflight ANTES. Ele não
    // carrega cabeçalho nenhum, por definição — não é o que se quer medir.
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
    if (alvo === PAGINA) {
      return req.respond({ status: 200, contentType: 'text/html',
                           body: '<!doctype html><html><body></body></html>' });
    }
    // Nada sai desta máquina: o que interessa é o cabeçalho que a página
    // MONTOU, e não a resposta de servidor nenhum.
    if (alvo.includes('/api/')) {
      if (capturando) {
        capturados.push({ url: alvo, auth: req.headers()['authorization'] || null });
      }
      return req.respond({ status: 200, contentType: 'application/json',
                           headers: CORS, body: '{"ok":true}' });
    }
    if (alvo.includes('supabase.co')) {
      return req.respond({ status: 200, contentType: 'application/json',
                           headers: CORS, body: '{}' });
    }
    req.continue();
  });

  await page.goto(PAGINA);

  await page.evaluate(() => {
    // O SDK do Supabase, fingido: `createClient` devolve um cliente cuja
    // `getSession` conta quantas vezes foi chamada. É assim que a recursão
    // apareceria — como uma contagem que não para.
    window.__chamadasGetSession = 0;
    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: async () => {
            window.__chamadasGetSession++;
            // O SDK de verdade fala com o supabase.co aqui dentro.
            await fetch('https://vwbtitjlpelrcnsytzqw.supabase.co/auth/v1/token');
            return { data: { session: { access_token: 'jwt-do-painel' } } };
          }
        }
      })
    };
  });

  await page.addScriptTag({ path: path.join(REPO, 'frontend', 'supabase-config.js') });

  // NÃO dá para ler `API_BASE_URL` nem `supabaseClient` daqui: os dois são
  // `const`/`let` no topo de um script CLÁSSICO, e isso cria ligação no escopo
  // de script, não propriedade de `window`. É a mesma armadilha que já custou um
  // defeito nesta base (ver o comentário de `clienteDoPainel` em
  // `ideal-control.js`). O que se mede aqui é o efeito: o cabeçalho que sai.

  // O que interessa de verdade: os cabeçalhos que chegaram ao interceptador.
  capturando = true;

  await page.evaluate(async (MOTOR) => {
    await fetch(MOTOR + '/api/user/permissions');
    await fetch(MOTOR + '/api/acessos-locais', { method: 'POST', body: '{}' });
    await fetch(MOTOR + '/api/formatos', {
      headers: { 'Authorization': 'Bearer ja-tinha-o-meu' } });
    // Relativo: na estação é assim que `${API_BASE_URL}/api/…` sai.
    await fetch('/api/ordens');
    await fetch('http://127.0.0.1:9000/api/status');
    await fetch('https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/qualquer');
  }, MOTOR);

  const chamadas = await page.evaluate(() => window.__chamadasGetSession);
  console.log(JSON.stringify({ capturados, chamadas, erros }));
  await browser.close();
})();
"""


@pytest.fixture(scope="module")
def resultado(tmp_path_factory):
    node_modules = os.path.join(RAIZ, "node_modules", "puppeteer")
    if not os.path.exists(node_modules):
        pytest.skip("puppeteer não instalado (npm install)")
    script = tmp_path_factory.mktemp("arnes") / "arnes.js"
    script.write_text(ARNES, encoding="utf-8")
    # `NODE_PATH` porque o arnês roda de uma pasta temporária, e o `require`
    # procura `node_modules` subindo a partir do ARQUIVO, não do `cwd`.
    ambiente = dict(os.environ, NODE_PATH=os.path.join(RAIZ, "node_modules"))
    r = subprocess.run(["node", str(script), RAIZ, MOTOR], capture_output=True, text=True,
                       timeout=180, cwd=RAIZ, env=ambiente)
    assert r.returncode == 0, f"o arnês falhou:\n{r.stderr[-2000:]}"
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_a_pagina_carrega_sem_erro(resultado):
    assert resultado["erros"] == [], resultado["erros"]




def test_a_chamada_ao_motor_leva_a_sessao(resultado):
    """Sem isto, fechar o servidor derrubaria a gráfica em vez de fechar o buraco.

    A função `painel` mora em `supabase.co`, e o embrulho corta `supabase.co`
    por causa de recursão. Que ela passe MESMO ASSIM é o que este teste mede — é
    a ordem de duas linhas em `eDoNossoMotor`, e inverter as duas deixaria as
    rotas de permissões e de códigos de acesso saindo sem sessão.
    """
    do_motor = [c for c in resultado["capturados"] if c["url"].startswith(MOTOR)]
    assert do_motor, "nenhuma chamada ao motor foi capturada"
    for c in do_motor:
        if "formatos" in c["url"]:
            continue  # este mandou o dele; ver o teste seguinte
        assert c["auth"] == "Bearer jwt-do-painel", c


def test_o_caminho_relativo_do_painel_tambem_leva_a_sessao(resultado):
    """`${API_BASE_URL}/api/…` sai como `/api/…`, e é assim que dezenas de
    chamadas do painel falam com quem serviu a página. Se o embrulho parasse de
    reconhecer o caminho relativo, elas sairiam anônimas sem ninguém notar."""
    relativas = [c for c in resultado["capturados"]
                 if c["url"].startswith(PAGINA_DO_ARNES + "api/")]
    assert relativas, "a chamada relativa não foi capturada"
    assert relativas[0]["auth"] == "Bearer jwt-do-painel", relativas[0]


def test_quem_ja_tinha_cabecalho_proprio_mantem_o_dele(resultado):
    """O QR do Pedido e o Ideal Control montam o `Authorization` na mão, e o
    deles é o certo — sobrescrever seria trocar um token válido por outro."""
    seu = [c for c in resultado["capturados"] if "formatos" in c["url"]]
    assert seu and seu[0]["auth"] == "Bearer ja-tinha-o-meu", seu


def test_o_agente_local_nao_recebe_cabecalho(resultado):
    """O operador que entrou pelo código local, offline, não tem sessão para
    oferecer — e o agente na LAN não pede nenhuma."""
    local = [c for c in resultado["capturados"] if "127.0.0.1" in c["url"]]
    assert local, "a chamada ao agente local não foi capturada"
    assert local[0]["auth"] is None, local


def test_o_sdk_do_supabase_nao_entra_em_recursao(resultado):
    """A armadilha: o SDK usa `fetch` para renovar a sessão. Sem o corte, pedir
    a sessão de dentro do `fetch` chamaria `fetch` de novo, para sempre — e a
    página congelaria sem erro nenhum no console.

    Quatro chamadas ao motor, quatro leituras de sessão. O teto é folgado de
    propósito: o que se mede não é o número exato — é que ele TENHA teto. Se
    recursionasse, não teria.
    """
    assert resultado["chamadas"] <= 6, (
        f"getSession chamada {resultado['chamadas']} vezes — recursão"
    )
