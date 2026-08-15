# Parte 3b — o aparelho da portaria — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entregar `portaria.html` — a tela que o porteiro usa no portão, que lê o ingresso pela câmera, decide sozinha se pode entrar e registra a entrada sem depender de rede.

**Architecture:** o aparelho pareia com um código de 6 caracteres, baixa o evento inteiro para o IndexedDB e passa a validar localmente com seis regras puras. As leituras entram numa fila local e sobem quando houver rede, com chave de idempotência. O aparelho nunca fala com o Supabase: só com o Render, por um token próprio e revogável.

**Tech Stack:** FastAPI (`acesso_portaria.py`), JavaScript sem framework (padrão do projeto), IndexedDB, `crypto.subtle` (PBKDF2, já implementado em `frontend/qr-ideal-hash.js`), `BarcodeDetector` com `jsQR` vendorizado como reserva, Service Worker. Testes: pytest + puppeteer (`node_modules` do próprio repositório).

**Spec:** [docs/superpowers/specs/2026-08-15-controle-acesso-parte3b-design.md](../specs/2026-08-15-controle-acesso-parte3b-design.md)

## Global Constraints

- **Recusa é recusa.** Nenhuma tela desta parte pode oferecer "deixar entrar mesmo assim". Decisão do usuário, 15/08/2026.
- **Nenhuma chave de banco no aparelho.** O aparelho autentica com um token próprio; a `SUPABASE_SERVICE_KEY` continua saindo por uma porta só, `acesso_api.supabase()`.
- **Nada de CDN.** `portaria.html` não pode ter `<script src>` para host externo: a CSP proíbe e o offline quebraria. Bibliotecas são vendorizadas em `frontend/`, como `pdf-lib.min.js` já é.
- **O aparelho nunca vê código em claro de QR Ideal.** A nuvem manda hash; o aparelho calcula o hash do que leu e compara.
- **`tipo_uso` vale `unico` ou `reentrada`** — os dois únicos valores que `acesso_config.TIPOS_DE_USO` aceita.
- **Bloqueio é inclusivo nos dois extremos:** `de = ate = 7` bloqueia o ingresso 7 e mais nenhum.
- **`abre_em`/`fecha_em` são momentos absolutos** (TIMESTAMPTZ), não horas do dia: a comparação é ISO direta, sem virada de meia-noite.
- **A regra 2 (`setor_nao_autorizado`) precisa ser visualmente diferente da regra 1 (`desconhecido`).** Confundi-las faz o porteiro devolver ingresso bom achando que é falso.
- **Português do Brasil** em toda mensagem de tela e de erro. Comentários de código explicam **por quê**, no estilo dos arquivos existentes.
- **Trabalho direto na `main`.** Sem worktree, sem branch de feature.
- Rodar `venv/Scripts/python.exe -m pytest tests/ -q` antes de cada commit. A suíte está em **548 passando**; nenhum commit pode reduzir esse número.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `frontend/portaria-validacao.js` | as seis regras, funções **puras**, sem rede, sem DOM, sem IndexedDB | 1 |
| `tests/test_portaria_validacao.py` + `tests/portaria_validacao_harness.js` | as regras num navegador de verdade, com dados de mesa | 1 |
| `frontend/portaria-deposito.js` | IndexedDB: carga, fila, entradas já registradas | 2 |
| `tests/test_portaria_deposito.py` + `tests/portaria_deposito_harness.js` | o depósito num navegador de verdade | 2 |
| `acesso_portaria.py` | `POST /portaria/entrar`, `GET /portaria/faixa`, `POST /portaria/leituras` | 3 |
| `tests/test_acesso_portaria.py` | os três endpoints com `FakeBanco` | 3 |
| `app.py` | montar o router novo | 3 |
| `frontend/portaria.html` | a tela e o CSS próprio | 4 |
| `frontend/portaria.js` | pareamento, carga, orquestração, sincronização | 4 |
| `frontend/jsqr.min.js` | leitura de QR onde não há `BarcodeDetector` | 5 |
| `frontend/sw.js` | abrir sem rede | 5 |
| `frontend/controle.html` + `controle.js` | mostrar o endereço de pareamento como QR na tela do dono | 6 |
| `tests/test_portaria_fonte.py` | guardas de fonte: sem CDN, sem escape na recusa, o SW só guarda o que é dele | 6 |
| `docs/controle_acesso.md`, `docs/STATUS_PROJETO.md` | a parte 3b deixa de ser "não começou" | 7 |

**Por que `portaria-validacao.js` é um arquivo só dele:** são seis regras cuja **ordem é a resposta**, e é onde mora a decisão de deixar alguém entrar. Puro, ele se testa com dados de mesa — sem câmera, sem IndexedDB, sem rede. É a mesma razão de `acesso_publicacao.numeracao_do_modelo` ser uma função isolada.

---

### Task 1: As seis regras

**Files:**
- Create: `frontend/portaria-validacao.js`
- Create: `tests/test_portaria_validacao.py`
- Create: `tests/portaria_validacao_harness.js`

**Interfaces:**
- Consumes: nada. Este arquivo não importa nada e não toca em rede, DOM ou IndexedDB.
- Produces: `window.portariaValidacao` com duas funções puras:
  - `saisParaTentar(texto, carga) -> string[]` — os sais (hex de 64) a tentar, na ordem. Para QR Ideal devolve **um**; para código comum devolve o de cada pedido mais o do evento.
  - `decidir({hashes, carga, agora, entradas, setorEscolhido}) -> veredito`
    - `hashes`: `string[]` — os hashes já calculados pelo chamador
    - `carga`: o objeto que o `GET /portaria/faixa` devolve, com `credenciais`, `setores`, `bloqueios`, `aparelho.setores`
    - `agora`: `string` ISO
    - `entradas`: `{[credencial_id]: momentoISO}` — entradas permitidas já registradas neste aparelho
    - `setorEscolhido`: `string|null` — o `setor_id` que o porteiro tocou na tela de ambiguidade
    - veredito é um destes três:
      - `{estado: 'permitido', credencial_id, numero, setor}`
      - `{estado: 'ambiguo', candidatos: [{credencial_id, numero, setor}]}`
      - `{estado: 'negado', motivo, credencial_id|null, numero|null, setor|null, detalhe}`
      - `motivo` ∈ `'desconhecido' | 'setor_nao_autorizado' | 'fora_da_janela' | 'bloqueado' | 'ja_entrou'`
      - `detalhe` traz o que a tela precisa dizer: `{setoresDoAparelho}`, `{abre_em}`, `{fecha_em}`, `{motivoBloqueio}`, `{momentoAnterior}`

- [ ] **Step 1: Escrever o harness do navegador**

Espelha `tests/qr_ideal_hash_harness.js`, que já existe e resolve o problema de contexto seguro.

Criar `tests/portaria_validacao_harness.js`:

```js
// Roda as seis regras da portaria dentro de um navegador de verdade.
//
// Elas decidem se uma pessoa entra ou nao. Testa-las com dados de mesa e o
// unico jeito de cobrir a ORDEM -- um ingresso pode falhar por dois motivos, e
// o porteiro precisa ouvir o mais util.
//
// Recebe o caso pelo stdin em JSON: {chamada, argumentos}. Imprime o resultado
// em JSON no stdout. Sai 1 se o arquivo nao carregar.

const path = require('path');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

let bruto = '';
process.stdin.on('data', d => (bruto += d));
process.stdin.on('end', () => rodar(JSON.parse(bruto)));

async function rodar(caso) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().startsWith('http://localhost/')) {
            return req.respond({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: '<!doctype html><meta charset="utf-8"><title>portaria</title>',
            });
        }
        req.continue();
    });
    await page.goto('http://localhost/portaria-validacao-test');
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'portaria-validacao.js') });

    const ok = await page.evaluate(() => typeof window.portariaValidacao === 'object');
    if (!ok) {
        console.error('portaria-validacao.js nao registrou window.portariaValidacao');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate(
        (c) => window.portariaValidacao[c.chamada].apply(null, c.argumentos), caso);
    await browser.close();
    console.log(JSON.stringify(saida));
}
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `tests/test_portaria_validacao.py`:

```python
# -*- coding: utf-8 -*-
"""As seis regras que decidem se uma pessoa entra no evento.

A ORDEM e a resposta. Um ingresso pode falhar por dois motivos ao mesmo tempo --
ser de outro setor E cair numa faixa bloqueada -- e o porteiro precisa ouvir o
mais util dos dois. Trocar a ordem nao quebra nada visivelmente: so faz a tela
dizer a coisa errada, na frente da fila.

Roda o arquivo de verdade dentro de um navegador, pelo mesmo motivo do
tests/test_qr_ideal_hash.py: e la que ele vai rodar.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "portaria_validacao_harness.js")

PISTA = "11111111-1111-1111-1111-111111111111"
VIP = "22222222-2222-2222-2222-222222222222"


def chamar(nome, *argumentos):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"chamada": nome, "argumentos": list(argumentos)}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def carga(**mudancas):
    base = {
        "evento": {"id": "e1", "nome": "Festa", "sal": "aa" * 32},
        "aparelho": {"id": "d1", "nome": "Portao A", "setores": [PISTA]},
        "sais": {"18560": "bb" * 32},
        "setores": [
            {"id": PISTA, "nome": "PISTA", "quantidade": 600,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None},
            {"id": VIP, "nome": "VIP", "quantidade": 500,
             "tipo_uso": "reentrada", "abre_em": None, "fecha_em": None},
        ],
        "bloqueios": [],
        "credenciais": [
            {"h": "h-pista-1", "s": PISTA, "n": 1, "id": "c-pista-1"},
            {"h": "h-vip-9", "s": VIP, "n": 9, "id": "c-vip-9"},
        ],
    }
    base.update(mudancas)
    return base


def decidir(hashes, c=None, agora="2026-08-20T22:00:00Z", entradas=None, escolhido=None):
    return chamar("decidir", {
        "hashes": hashes, "carga": c or carga(), "agora": agora,
        "entradas": entradas or {}, "setorEscolhido": escolhido,
    })


def test_regra_1_codigo_que_nao_e_do_evento_e_desconhecido():
    r = decidir(["h-de-outro-evento"])
    assert r["estado"] == "negado"
    assert r["motivo"] == "desconhecido"


def test_regra_2_ingresso_bom_no_portao_errado_NAO_e_desconhecido():
    """O erro mais caro desta tela. O ingresso e legitimo e esta na porta
    errada; chama-lo de desconhecido faz o porteiro devolver ingresso bom
    achando que e falso. Por isso a carga traz o evento inteiro."""
    r = decidir(["h-vip-9"])
    assert r["estado"] == "negado"
    assert r["motivo"] == "setor_nao_autorizado"
    assert r["setor"]["nome"] == "VIP"
    assert r["detalhe"]["setoresDoAparelho"] == ["PISTA"]


def test_regra_3_fora_da_janela_do_setor():
    c = carga()
    c["setores"][0]["abre_em"] = "2026-08-20T23:00:00Z"
    r = decidir(["h-pista-1"], c, agora="2026-08-20T22:00:00Z")
    assert r["motivo"] == "fora_da_janela"
    assert r["detalhe"]["abre_em"] == "2026-08-20T23:00:00Z"


def test_regra_3_depois_de_fechar_tambem_e_fora_da_janela():
    c = carga()
    c["setores"][0]["fecha_em"] = "2026-08-20T21:00:00Z"
    r = decidir(["h-pista-1"], c, agora="2026-08-20T22:00:00Z")
    assert r["motivo"] == "fora_da_janela"
    assert r["detalhe"]["fecha_em"] == "2026-08-20T21:00:00Z"


def test_regra_4_faixa_bloqueada_leva_o_motivo_junto():
    """O motivo e o que o porteiro le em voz alta -- foi para isso que a coluna
    nasceu obrigatoria na parte 3a."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 50,
                          "motivo": "lote extraviado na entrega"}])
    r = decidir(["h-pista-1"], c)
    assert r["motivo"] == "bloqueado"
    assert r["detalhe"]["motivoBloqueio"] == "lote extraviado na entrega"


def test_regra_4_a_faixa_e_inclusiva_nos_dois_extremos():
    """`de = ate = 1` bloqueia o ingresso 1 e mais nenhum. Um intervalo meio
    aberto deixaria um ingresso passando na ponta sem ninguem entender."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 1, "motivo": "x"}])
    assert decidir(["h-pista-1"], c)["motivo"] == "bloqueado"
    c["bloqueios"] = [{"setor_id": PISTA, "de": 2, "ate": 9, "motivo": "x"}]
    assert decidir(["h-pista-1"], c)["estado"] == "permitido"


def test_regra_4_bloqueio_de_OUTRO_setor_nao_alcanca_este():
    c = carga(bloqueios=[{"setor_id": VIP, "de": 1, "ate": 600, "motivo": "x"}])
    assert decidir(["h-pista-1"], c)["estado"] == "permitido"


def test_regra_5_ja_entrou_so_vale_para_setor_de_entrada_unica():
    entradas = {"c-pista-1": "2026-08-20T21:14:00Z"}
    r = decidir(["h-pista-1"], entradas=entradas)
    assert r["motivo"] == "ja_entrou"
    assert r["detalhe"]["momentoAnterior"] == "2026-08-20T21:14:00Z"


def test_regra_5_setor_de_reentrada_deixa_entrar_de_novo():
    c = carga()
    c["aparelho"]["setores"] = [VIP]
    r = decidir(["h-vip-9"], c, entradas={"c-vip-9": "2026-08-20T21:14:00Z"})
    assert r["estado"] == "permitido"


def test_regra_6_permitido_diz_o_setor_e_o_numero():
    r = decidir(["h-pista-1"])
    assert r["estado"] == "permitido"
    assert r["setor"]["nome"] == "PISTA"
    assert r["numero"] == 1
    assert r["credencial_id"] == "c-pista-1"


def test_a_ORDEM_das_regras_setor_errado_vence_faixa_bloqueada():
    """As duas falham. O porteiro precisa ouvir 'e VIP, aqui e PISTA', que ele
    resolve mandando a pessoa para a outra porta -- e nao 'lote extraviado',
    que o mandaria chamar o dono do evento a toa."""
    c = carga(bloqueios=[{"setor_id": VIP, "de": 1, "ate": 600, "motivo": "lote extraviado"}])
    assert decidir(["h-vip-9"], c)["motivo"] == "setor_nao_autorizado"


def test_a_ORDEM_das_regras_bloqueio_vence_ja_entrou():
    """Bloqueio e decisao do dono e tem motivo para ler em voz alta; 'ja entrou'
    e consequencia. Dizer 'ja entrou' esconderia que aquele lote esta suspenso."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 50, "motivo": "suspenso"}])
    r = decidir(["h-pista-1"], c, entradas={"c-pista-1": "2026-08-20T21:14:00Z"})
    assert r["motivo"] == "bloqueado"


def test_ambiguidade_o_mesmo_hash_em_dois_setores_autorizados_pergunta():
    """Com numeracao comum o 0001 do VIP e o do CAMAROTE tem o mesmo texto, o
    mesmo sal (o sal e por pedido) e portanto o MESMO hash. O aparelho nao
    escolhe: pergunta."""
    c = carga()
    c["aparelho"]["setores"] = [PISTA, VIP]
    c["credenciais"] = [
        {"h": "h-igual", "s": PISTA, "n": 1, "id": "c-p"},
        {"h": "h-igual", "s": VIP, "n": 1, "id": "c-v"},
    ]
    r = decidir(["h-igual"], c)
    assert r["estado"] == "ambiguo"
    assert sorted(x["setor"]["nome"] for x in r["candidatos"]) == ["PISTA", "VIP"]


def test_ambiguidade_com_o_setor_escolhido_decide_normalmente():
    c = carga()
    c["aparelho"]["setores"] = [PISTA, VIP]
    c["credenciais"] = [
        {"h": "h-igual", "s": PISTA, "n": 1, "id": "c-p"},
        {"h": "h-igual", "s": VIP, "n": 1, "id": "c-v"},
    ]
    r = decidir(["h-igual"], c, escolhido=VIP)
    assert r["estado"] == "permitido"
    assert r["credencial_id"] == "c-v"


def test_ambiguidade_nao_pergunta_quando_so_um_setor_e_autorizado():
    """O aparelho de PISTA nao deve perguntar nada: o candidato do VIP nem e
    dele. Perguntar aqui poria o porteiro para escolher uma porta que ele nao
    atende."""
    c = carga()
    c["credenciais"] = [
        {"h": "h-igual", "s": PISTA, "n": 1, "id": "c-p"},
        {"h": "h-igual", "s": VIP, "n": 1, "id": "c-v"},
    ]
    r = decidir(["h-igual"], c)
    assert r["estado"] == "permitido"
    assert r["credencial_id"] == "c-p"


def test_o_sal_do_QR_IDEAL_sai_do_pedido_escrito_no_proprio_codigo():
    """O conteudo e `pedido invertido + 8 caracteres`. 06581 invertido e 18560,
    que e um pedido deste evento -- entao ha um sal certo e nao se tenta outro."""
    r = chamar("saisParaTentar", "06581ABCDEFGH", carga())
    assert r == ["bb" * 32]


def test_codigo_comum_tenta_o_sal_de_cada_pedido_e_o_do_evento():
    """`000001` nao diz de que pedido e. Sao poucos pedidos por evento, e cada
    tentativa custa milissegundos."""
    r = chamar("saisParaTentar", "000001", carga())
    assert r == ["bb" * 32, "aa" * 32]
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `venv/Scripts/python.exe -m pytest tests/test_portaria_validacao.py -q`
Expected: FAIL — `portaria-validacao.js nao registrou window.portariaValidacao` (o arquivo ainda não existe).

- [ ] **Step 4: Escrever `frontend/portaria-validacao.js`**

```js
/**
 * As seis regras que decidem se uma pessoa entra no evento.
 *
 * PURO de proposito: nada de rede, DOM ou IndexedDB aqui. E onde mora a decisao
 * de deixar alguem entrar, e queremos poder testa-la com dados de mesa, sem
 * camera e sem navegador de verdade -- do jeito que o
 * `tests/test_portaria_validacao.py` faz.
 *
 * A ORDEM DAS REGRAS E A RESPOSTA. Um ingresso pode falhar por dois motivos ao
 * mesmo tempo, e o porteiro precisa ouvir o que ele consegue resolver:
 *
 *   1. desconhecido          -- nao e deste evento
 *   2. setor_nao_autorizado  -- e deste evento, mas de outra porta
 *   3. fora_da_janela        -- o setor ainda nao abriu, ou ja fechou
 *   4. bloqueado             -- o dono suspendeu esta faixa, e disse por que
 *   5. ja_entrou             -- so para setor de entrada unica
 *   6. permitido
 *
 * Trocar essa ordem nao quebra nada visivelmente: so faz a tela dizer a coisa
 * errada, na frente da fila.
 */
(function () {
    'use strict';

    /** O pedido escrito no comeco do QR Ideal, ao contrario. "06581" -> "18560". */
    function pedidoDoConteudo(texto) {
        if (typeof texto !== 'string' || texto.length < 9) return null;
        // O codigo do pool tem SEMPRE 8 caracteres; o resto, invertido, e o pedido.
        return texto.slice(0, texto.length - 8).split('').reverse().join('');
    }

    /**
     * Os sais a tentar, na ordem.
     *
     * QR Ideal carrega o pedido dentro do proprio codigo, entao ha um sal certo
     * e um hash so. Codigo comum e apenas `000001`: nao diz de que pedido e, e o
     * aparelho tenta o sal de cada pedido do evento mais o do evento (que e o
     * dos codigos que o cliente importou). Sao poucos por evento.
     */
    function saisParaTentar(texto, carga) {
        var sais = carga.sais || {};
        var doPedido = pedidoDoConteudo(texto);
        if (doPedido && sais[doPedido]) return [sais[doPedido]];

        var todos = Object.keys(sais).map(function (p) { return sais[p]; });
        if (carga.evento && carga.evento.sal) todos.push(carga.evento.sal);
        return todos;
    }

    function setorPorId(carga, id) {
        var achados = (carga.setores || []).filter(function (s) { return s.id === id; });
        return achados.length ? achados[0] : null;
    }

    function nomesDosSetoresDoAparelho(carga) {
        return ((carga.aparelho || {}).setores || []).map(function (id) {
            var s = setorPorId(carga, id);
            return s ? s.nome : id;
        });
    }

    function negado(motivo, cand, setor, detalhe) {
        return {
            estado: 'negado',
            motivo: motivo,
            credencial_id: cand ? cand.id : null,
            numero: cand ? cand.n : null,
            setor: setor || null,
            detalhe: detalhe || {},
        };
    }

    function decidir(entrada) {
        var carga = entrada.carga;
        var hashes = entrada.hashes || [];
        var agora = entrada.agora;
        var entradas = entrada.entradas || {};
        var escolhido = entrada.setorEscolhido || null;
        var autorizados = (carga.aparelho || {}).setores || [];

        // 1. Nao e deste evento.
        var todos = (carga.credenciais || []).filter(function (c) {
            return hashes.indexOf(c.h) !== -1;
        });
        if (!todos.length) return negado('desconhecido', null, null, {});

        // 2. E deste evento, mas de outra porta. A carga traz o evento INTEIRO
        //    justamente para este caso existir: se trouxesse so os setores
        //    autorizados, cairia na regra 1 e o porteiro devolveria ingresso bom
        //    achando que e falso.
        var meus = todos.filter(function (c) { return autorizados.indexOf(c.s) !== -1; });
        if (!meus.length) {
            var alheio = todos[0];
            return negado('setor_nao_autorizado', alheio, setorPorId(carga, alheio.s), {
                setoresDoAparelho: nomesDosSetoresDoAparelho(carga),
            });
        }

        // Ambiguidade: o mesmo hash em mais de um setor que ESTE aparelho valida.
        // Acontece com numeracao comum, onde o `0001` de dois setores do mesmo
        // pedido tem o mesmo texto e o mesmo sal. O aparelho nao escolhe.
        if (escolhido) {
            meus = meus.filter(function (c) { return c.s === escolhido; });
            if (!meus.length) return negado('desconhecido', null, null, {});
        } else {
            var setoresDistintos = [];
            meus.forEach(function (c) {
                if (setoresDistintos.indexOf(c.s) === -1) setoresDistintos.push(c.s);
            });
            if (setoresDistintos.length > 1) {
                return {
                    estado: 'ambiguo',
                    candidatos: meus.map(function (c) {
                        return {
                            credencial_id: c.id, numero: c.n,
                            setor: setorPorId(carga, c.s),
                        };
                    }),
                };
            }
        }

        var cand = meus[0];
        var setor = setorPorId(carga, cand.s) || {};

        // 3. O setor tem janela e agora esta fora dela. `abre_em` e `fecha_em`
        //    sao momentos absolutos, nao horas do dia: comparacao ISO direta.
        if (setor.abre_em && agora < setor.abre_em) {
            return negado('fora_da_janela', cand, setor, { abre_em: setor.abre_em });
        }
        if (setor.fecha_em && agora > setor.fecha_em) {
            return negado('fora_da_janela', cand, setor, { fecha_em: setor.fecha_em });
        }

        // 4. Faixa bloqueada. Vem antes de `ja_entrou` porque bloqueio e decisao
        //    do dono, com motivo para ler em voz alta; "ja entrou" e consequencia
        //    e esconderia que aquele lote esta suspenso.
        var bloqueios = (carga.bloqueios || []).filter(function (b) {
            return b.setor_id === cand.s && cand.n >= b.de && cand.n <= b.ate;
        });
        if (bloqueios.length) {
            return negado('bloqueado', cand, setor, { motivoBloqueio: bloqueios[0].motivo });
        }

        // 5. Ja entrou -- so onde o dono configurou entrada unica.
        var anterior = entradas[cand.id];
        if (setor.tipo_uso === 'unico' && anterior) {
            return negado('ja_entrou', cand, setor, { momentoAnterior: anterior });
        }

        // 6. Passou por todas.
        return { estado: 'permitido', credencial_id: cand.id, numero: cand.n, setor: setor };
    }

    window.portariaValidacao = { saisParaTentar: saisParaTentar, decidir: decidir };
})();
```

- [ ] **Step 5: Rodar e ver passar**

Run: `venv/Scripts/python.exe -m pytest tests/test_portaria_validacao.py -q`
Expected: PASS, 17 testes.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `venv/Scripts/python.exe -m pytest tests/ -q`
Expected: 565 passed (548 + 17).

- [ ] **Step 7: Commit**

```bash
git add frontend/portaria-validacao.js tests/test_portaria_validacao.py tests/portaria_validacao_harness.js
git commit -m "portaria: as seis regras que decidem se a pessoa entra

Puras, num arquivo so delas, testadas num navegador de verdade com dados de
mesa. A ordem e a resposta: um ingresso pode falhar por dois motivos, e o
porteiro precisa ouvir o que ele consegue resolver -- 'e VIP, aqui e PISTA'
manda a pessoa para a outra porta; 'lote extraviado' faria chamar o dono a toa.

setor_nao_autorizado e uma regra separada de desconhecido, e por isso a carga
traz o evento inteiro: com so os setores autorizados, um ingresso bom na porta
errada seria chamado de falso.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: O depósito (IndexedDB)

**Files:**
- Create: `frontend/portaria-deposito.js`
- Create: `tests/test_portaria_deposito.py`
- Create: `tests/portaria_deposito_harness.js`

**Interfaces:**
- Consumes: nada.
- Produces: `window.portariaDeposito`, todas devolvendo Promise:
  - `gravarCarga(carga) -> Promise<void>` — substitui a carga inteira
  - `lerCarga() -> Promise<Object|null>`
  - `enfileirar(leitura) -> Promise<void>` — `leitura` tem `id_local` (chave)
  - `lerFila(limite) -> Promise<Array>` — as mais antigas primeiro
  - `removerDaFila(idsLocais) -> Promise<void>`
  - `contarFila() -> Promise<number>`
  - `entradasPermitidas() -> Promise<Object>` — `{credencial_id: momentoISO}`, só de leituras `permitido`
  - `limpar() -> Promise<void>` — apaga tudo (usado ao desparear)

- [ ] **Step 1: Escrever o harness**

Criar `tests/portaria_deposito_harness.js`. Idêntico ao de Task 1, trocando o arquivo carregado e a execução — aqui o roteiro é assíncrono:

```js
// Roda o deposito (IndexedDB) da portaria num navegador de verdade.
//
// A fila e o que impede a gráfica de perder leitura quando a rede cai no
// portao. Testa-la sem navegador seria testar outra coisa: IndexedDB nao existe
// no Node.
//
// Recebe pelo stdin {roteiro: "<corpo de funcao async>"} e imprime o que ele
// devolver, em JSON.

const path = require('path');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

let bruto = '';
process.stdin.on('data', d => (bruto += d));
process.stdin.on('end', () => rodar(JSON.parse(bruto)));

async function rodar(caso) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().startsWith('http://localhost/')) {
            return req.respond({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: '<!doctype html><meta charset="utf-8"><title>deposito</title>',
            });
        }
        req.continue();
    });
    // IndexedDB precisa de origem de verdade: `about:blank` tem origem opaca.
    await page.goto('http://localhost/portaria-deposito-test');
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'portaria-deposito.js') });

    const ok = await page.evaluate(() => typeof window.portariaDeposito === 'object');
    if (!ok) {
        console.error('portaria-deposito.js nao registrou window.portariaDeposito');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate(
        corpo => new Function('d', 'return (async () => { ' + corpo + ' })()')
            (window.portariaDeposito),
        caso.roteiro);
    await browser.close();
    console.log(JSON.stringify(saida === undefined ? null : saida));
}
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `tests/test_portaria_deposito.py`:

```python
# -*- coding: utf-8 -*-
"""A carga e a fila do aparelho da portaria.

A FILA E O QUE IMPEDE A GRAFICA DE PERDER LEITURA. O celular fica tres horas sem
rede no portao, acumula centenas de entradas, e depois manda tudo. Se uma linha
se perder ali, a contagem que o cliente pagou para ter sai errada -- e ninguem
descobre, porque nao ha com o que comparar.

Roda num navegador de verdade porque IndexedDB nao existe no Node.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "portaria_deposito_harness.js")


def rodar(roteiro):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"roteiro": roteiro}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def test_a_carga_volta_igual_ao_que_entrou():
    assert rodar("""
        await d.gravarCarga({evento: {id: 'e1', nome: 'Festa'}, credenciais: [{h: 'x'}]});
        const c = await d.lerCarga();
        return c.evento.nome + '/' + c.credenciais.length;
    """) == "Festa/1"


def test_sem_carga_gravada_a_leitura_devolve_nulo():
    """O aparelho recem-pareado tem de saber que ainda nao baixou nada, em vez
    de operar com uma carga vazia achando que todo ingresso e desconhecido."""
    assert rodar("return await d.lerCarga();") is None


def test_gravar_de_novo_SUBSTITUI_a_carga_inteira():
    """Recarregar depois de o dono mudar um setor nao pode deixar credencial
    velha convivendo com nova."""
    assert rodar("""
        await d.gravarCarga({evento: {id: 'e1'}, credenciais: [{h: 'a'}, {h: 'b'}]});
        await d.gravarCarga({evento: {id: 'e1'}, credenciais: [{h: 'c'}]});
        const c = await d.lerCarga();
        return c.credenciais.map(x => x.h).join(',');
    """) == "c"


def test_a_fila_sai_na_ordem_em_que_entrou():
    """Primeira a entrar, primeira a subir: se a rede cair no meio do envio, o
    que fica para tras e o mais recente, que e o mais facil de reconstituir."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:00:00Z'});
        await d.enfileirar({id_local: 'b', momento: '2026-08-20T21:01:00Z'});
        await d.enfileirar({id_local: 'c', momento: '2026-08-20T21:02:00Z'});
        const f = await d.lerFila(2);
        return f.map(x => x.id_local).join(',');
    """) == "a,b"


def test_enfileirar_o_mesmo_id_local_duas_vezes_nao_duplica():
    """`id_local` e a chave de idempotencia que o servidor tambem usa. Duplicar
    aqui inflaria a lotacao antes mesmo de sair do celular."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:00:00Z'});
        await d.enfileirar({id_local: 'a', momento: '2026-08-20T21:00:00Z'});
        return await d.contarFila();
    """) == 1


def test_remover_da_fila_tira_so_o_que_o_servidor_confirmou():
    """A linha so sai depois da confirmacao. Remover antes seria perder leitura
    quando a resposta se perde no caminho."""
    assert rodar("""
        await d.enfileirar({id_local: 'a'});
        await d.enfileirar({id_local: 'b'});
        await d.enfileirar({id_local: 'c'});
        await d.removerDaFila(['a', 'c']);
        const f = await d.lerFila(10);
        return f.map(x => x.id_local).join(',');
    """) == "b"


def test_entradas_permitidas_ignora_as_negadas():
    """A regra 5 (`ja_entrou`) so pode olhar para quem entrou. Contar recusa
    faria a segunda tentativa de um ingresso bom ser recusada por 'ja entrou'."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', credencial_id: 'c1',
                            resultado: 'permitido', momento: '2026-08-20T21:14:00Z'});
        await d.enfileirar({id_local: 'b', credencial_id: 'c2',
                            resultado: 'negado', momento: '2026-08-20T21:15:00Z'});
        const e = await d.entradasPermitidas();
        return Object.keys(e).join(',') + '|' + e['c1'];
    """) == "c1|2026-08-20T21:14:00Z"


def test_entradas_permitidas_sobrevive_ao_envio_para_o_servidor():
    """A regra 5 tem de continuar valendo depois de a fila esvaziar: a pessoa
    entrou as 21h, a fila subiu as 21h05, e as 22h ela tenta entrar de novo."""
    assert rodar("""
        await d.enfileirar({id_local: 'a', credencial_id: 'c1',
                            resultado: 'permitido', momento: '2026-08-20T21:14:00Z'});
        await d.removerDaFila(['a']);
        const e = await d.entradasPermitidas();
        return e['c1'] || 'PERDEU';
    """) == "2026-08-20T21:14:00Z"


def test_limpar_apaga_carga_e_fila():
    """Despareamento nao pode deixar o evento anterior no celular."""
    assert rodar("""
        await d.gravarCarga({evento: {id: 'e1'}});
        await d.enfileirar({id_local: 'a'});
        await d.limpar();
        const c = await d.lerCarga();
        return (c === null ? 'sem-carga' : 'SOBROU') + '/' + await d.contarFila();
    """) == "sem-carga/0"
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `venv/Scripts/python.exe -m pytest tests/test_portaria_deposito.py -q`
Expected: FAIL — `portaria-deposito.js nao registrou window.portariaDeposito`.

- [ ] **Step 4: Escrever `frontend/portaria-deposito.js`**

Atenção ao teste `test_entradas_permitidas_sobrevive_ao_envio_para_o_servidor`: as entradas permitidas moram numa loja **própria**, que o `removerDaFila` não toca. A fila é o que falta enviar; as entradas são o que já aconteceu.

```js
/**
 * O que o aparelho da portaria guarda no proprio celular.
 *
 * Tres lojas, e cada uma existe por um motivo diferente:
 *
 *   carga    -- o evento inteiro, baixado uma vez. E o que permite decidir sem
 *               rede, que e a razao de a parte 2 existir.
 *   fila     -- as leituras que AINDA NAO subiram. Encolhe quando o servidor
 *               confirma. Se uma linha se perder aqui, a contagem que o cliente
 *               pagou para ter sai errada e ninguem descobre.
 *   entradas -- quem ja entrou, por credencial. Separada da fila DE PROPOSITO:
 *               a fila esvazia quando a rede volta, e a regra `ja_entrou` tem de
 *               continuar valendo depois disso. A pessoa entrou as 21h, a fila
 *               subiu as 21h05, e as 22h ela tenta de novo.
 */
(function () {
    'use strict';

    var NOME = 'ideal-portaria';
    var VERSAO = 1;
    var bd = null;

    function abrir() {
        if (bd) return Promise.resolve(bd);
        return new Promise(function (ok, erro) {
            var req = indexedDB.open(NOME, VERSAO);
            req.onupgradeneeded = function () {
                var b = req.result;
                if (!b.objectStoreNames.contains('carga')) b.createObjectStore('carga');
                if (!b.objectStoreNames.contains('fila')) {
                    b.createObjectStore('fila', { keyPath: 'id_local' });
                }
                if (!b.objectStoreNames.contains('entradas')) b.createObjectStore('entradas');
            };
            req.onsuccess = function () { bd = req.result; ok(bd); };
            req.onerror = function () { erro(req.error); };
        });
    }

    function comLoja(nome, modo, tarefa) {
        return abrir().then(function (b) {
            return new Promise(function (ok, erro) {
                var t = b.transaction(nome, modo);
                var resultado;
                tarefa(t.objectStore(nome), function (v) { resultado = v; });
                t.oncomplete = function () { ok(resultado); };
                t.onerror = function () { erro(t.error); };
            });
        });
    }

    function gravarCarga(carga) {
        return comLoja('carga', 'readwrite', function (loja) {
            loja.clear();                 // substitui a carga INTEIRA
            loja.put(carga, 'unica');
        });
    }

    function lerCarga() {
        return comLoja('carga', 'readonly', function (loja, devolver) {
            var r = loja.get('unica');
            r.onsuccess = function () { devolver(r.result === undefined ? null : r.result); };
        });
    }

    function enfileirar(leitura) {
        return comLoja('fila', 'readwrite', function (loja) {
            loja.put(leitura);            // `keyPath: id_local` ignora o repetido
        }).then(function () {
            if (leitura.resultado !== 'permitido' || !leitura.credencial_id) return;
            return comLoja('entradas', 'readwrite', function (loja) {
                loja.put(leitura.momento, leitura.credencial_id);
            });
        });
    }

    function lerFila(limite) {
        return comLoja('fila', 'readonly', function (loja, devolver) {
            var r = loja.getAll(undefined, limite);
            r.onsuccess = function () {
                // Mais antigas primeiro: se a rede cair no meio do envio, o que
                // fica para tras e o mais recente.
                devolver((r.result || []).sort(function (a, b) {
                    return String(a.momento || '').localeCompare(String(b.momento || ''));
                }));
            };
        });
    }

    function removerDaFila(idsLocais) {
        return comLoja('fila', 'readwrite', function (loja) {
            (idsLocais || []).forEach(function (id) { loja.delete(id); });
        });
    }

    function contarFila() {
        return comLoja('fila', 'readonly', function (loja, devolver) {
            var r = loja.count();
            r.onsuccess = function () { devolver(r.result); };
        });
    }

    function entradasPermitidas() {
        return comLoja('entradas', 'readonly', function (loja, devolver) {
            var chaves = loja.getAllKeys();
            var valores = loja.getAll();
            valores.onsuccess = function () {
                var mapa = {};
                (chaves.result || []).forEach(function (k, i) { mapa[k] = valores.result[i]; });
                devolver(mapa);
            };
        });
    }

    function limpar() {
        return Promise.all(['carga', 'fila', 'entradas'].map(function (nome) {
            return comLoja(nome, 'readwrite', function (loja) { loja.clear(); });
        })).then(function () { });
    }

    window.portariaDeposito = {
        gravarCarga: gravarCarga, lerCarga: lerCarga,
        enfileirar: enfileirar, lerFila: lerFila,
        removerDaFila: removerDaFila, contarFila: contarFila,
        entradasPermitidas: entradasPermitidas, limpar: limpar,
    };
})();
```

- [ ] **Step 5: Rodar e ver passar**

Run: `venv/Scripts/python.exe -m pytest tests/test_portaria_deposito.py -q`
Expected: PASS, 9 testes.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `venv/Scripts/python.exe -m pytest tests/ -q`
Expected: 574 passed.

- [ ] **Step 7: Commit**

```bash
git add frontend/portaria-deposito.js tests/test_portaria_deposito.py tests/portaria_deposito_harness.js
git commit -m "portaria: a carga e a fila dentro do celular

Tres lojas no IndexedDB. As entradas ja registradas ficam SEPARADAS da fila de
envio de proposito: a fila esvazia quando a rede volta, e a regra ja_entrou tem
de continuar valendo depois disso -- a pessoa entrou as 21h, a fila subiu as
21h05, e as 22h ela tenta de novo.

A linha so sai da fila depois que o servidor confirmou. Perder uma leitura e
perder a contagem que o cliente pagou para ter.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Os três endpoints

**Files:**
- Create: `acesso_portaria.py`
- Create: `tests/test_acesso_portaria.py`
- Modify: `app.py` (montar o router, junto dos outros dois)

**Interfaces:**
- Consumes: `acesso_api.supabase`, `acesso_api.contar`, `qr_ideal.hash_codigo`, `qr_ideal.gerar_sal`.
- Produces: router com prefixo `/api/acesso/portaria` e três rotas:
  - `POST /entrar` — corpo `{evento_id, codigo}` → `{token, aparelho: {id, nome, setores}, evento: {id, nome}}`
  - `GET /faixa?desde=<int>` — cabeçalho `Authorization: Bearer <token>` → a carga (ver spec)
  - `POST /leituras` — cabeçalho `Authorization: Bearer <token>`, corpo `{leituras: [...]}` → `{gravadas: n}`
  - Helper exportado para os testes: `_aparelho_do_token(cabecalho) -> dict`

**Prefixo `/api/acesso/portaria` e não `/api/acesso/aparelhos`**, para não disputar rota com o `acesso_config.py`, que já registra `POST /api/acesso/aparelhos/{aparelho_id}/codigo`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/test_acesso_portaria.py`. O `FakeBanco` segue o padrão de `tests/test_acesso_config.py`:

```python
# -*- coding: utf-8 -*-
"""Os tres endpoints que o aparelho da portaria usa.

Sao a UNICA porta entre o celular do porteiro e o banco. O aparelho nao tem
conta do cliente nem chave do Supabase: ele troca um codigo de 6 caracteres por
um token proprio, revogavel um a um pela tela do dono.
"""

import hashlib

import pytest
from fastapi import HTTPException

import acesso_portaria as ap
import qr_ideal

SAL = "aa" * 32
PISTA = "11111111-1111-1111-1111-111111111111"
VIP = "22222222-2222-2222-2222-222222222222"


class FakeBanco:
    """Um Supabase de mentira, que guarda em dicionario o que foi gravado."""

    def __init__(self):
        self.eventos = [{"id": "e1", "nome": "Festa", "sal": SAL}]
        self.aparelhos = [{
            "id": "d1", "evento_id": "e1", "nome": "Portao A", "status": "ativo",
            "codigo_hash": qr_ideal.hash_codigo("ABC234", SAL), "token_hash": None,
        }]
        self.vinculos = [{"dispositivo_id": "d1", "setor_id": PISTA}]
        self.setores = [
            {"id": PISTA, "evento_id": "e1", "nome": "PISTA", "quantidade": 600,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None, "pedido_id_int": 18560},
            {"id": VIP, "evento_id": "e1", "nome": "VIP", "quantidade": 500,
             "tipo_uso": "reentrada", "abre_em": None, "fecha_em": None, "pedido_id_int": 18560},
        ]
        self.bloqueios = []
        self.credenciais = [
            {"id": "c1", "codigo_hash": "h1", "setor_id": PISTA, "numero": 1},
            {"id": "c2", "codigo_hash": "h2", "setor_id": VIP, "numero": 9},
        ]
        self.pedidos = [{"pedido_id_int": 18560, "sal": "bb" * 32, "evento_id": "e1"}]
        self.leituras = []
        self.chamadas = []

    def __call__(self, method, path, body=None, prefer=None):
        self.chamadas.append((method, path))
        if path.startswith("producao_acesso_eventos"):
            return list(self.eventos)
        if path.startswith("producao_acesso_dispositivo_setores"):
            return list(self.vinculos)
        if path.startswith("producao_acesso_dispositivos"):
            if method == "GET":
                if "token_hash=eq." in path:
                    alvo = path.split("token_hash=eq.", 1)[1].split("&", 1)[0]
                    return [a for a in self.aparelhos
                            if a.get("token_hash") == alvo and a["status"] == "ativo"]
                return [a for a in self.aparelhos if a["status"] == "ativo"]
            if method == "PATCH":
                for a in self.aparelhos:
                    a.update(body)
                return self.aparelhos
        if path.startswith("producao_acesso_setores"):
            return list(self.setores)
        if path.startswith("producao_acesso_bloqueios"):
            return list(self.bloqueios)
        if path.startswith("producao_acesso_pedidos"):
            return list(self.pedidos)
        if path.startswith("producao_acesso_credenciais"):
            return list(self.credenciais)
        if path.startswith("producao_acesso_leituras"):
            if method == "POST":
                vistos = {(l["dispositivo_id"], l["id_local"]) for l in self.leituras}
                for linha in body:
                    chave = (linha["dispositivo_id"], linha["id_local"])
                    if chave not in vistos:
                        self.leituras.append(linha)
                        vistos.add(chave)
                return []
        return []


@pytest.fixture
def banco(monkeypatch):
    b = FakeBanco()
    monkeypatch.setattr(ap, "supabase", b)
    ap._FALHAS.clear()
    return b


def entrar(codigo="ABC234", evento="e1"):
    return ap._entrar({"evento_id": evento, "codigo": codigo})


def test_o_codigo_certo_devolve_token_e_o_nome_do_aparelho(banco):
    r = entrar()
    assert len(r["token"]) == 64
    assert r["aparelho"]["nome"] == "Portao A"
    assert r["aparelho"]["setores"] == [PISTA]
    assert r["evento"]["nome"] == "Festa"


def test_o_token_fica_gravado_como_HASH_nunca_em_claro(banco):
    """Vazamento do banco nao pode entregar aparelho nenhum."""
    r = entrar()
    assert banco.aparelhos[0]["token_hash"] == hashlib.sha256(
        r["token"].encode("utf-8")).hexdigest()
    assert r["token"] not in str(banco.aparelhos)


def test_codigo_errado_nao_diz_se_o_evento_existe(banco):
    """Responder diferente contaria a um estranho quais eventos existem."""
    with pytest.raises(HTTPException) as e:
        entrar(codigo="ZZZZZZ")
    assert e.value.status_code == 401


def test_aparelho_revogado_nao_pareia(banco):
    banco.aparelhos[0]["status"] = "revogado"
    with pytest.raises(HTTPException) as e:
        entrar()
    assert e.value.status_code == 401


def test_dez_erros_seguidos_fecham_o_pareamento_daquele_evento(banco):
    """Sao 31^6 codigos, mas forca bruta e ataque de repeticao: parar depois de
    dez erros custa nada a quem digitou certo e muito a quem esta tentando."""
    for _ in range(10):
        with pytest.raises(HTTPException):
            entrar(codigo="ZZZZZZ")
    with pytest.raises(HTTPException) as e:
        entrar(codigo="ABC234")          # ate o codigo CERTO e recusado agora
    assert e.value.status_code == 429


def token_de(banco):
    return "Bearer " + entrar()["token"]


def test_a_faixa_traz_o_evento_INTEIRO_e_marca_os_setores_do_aparelho(banco):
    """Se trouxesse so os setores autorizados, um ingresso de outro setor
    cairia em 'desconhecido' e o porteiro devolveria ingresso bom achando que e
    falso. O aparelho precisa conhecer o evento todo para distinguir."""
    r = ap._faixa(token_de(banco), 0)
    assert sorted(s["nome"] for s in r["setores"]) == ["PISTA", "VIP"]
    assert r["aparelho"]["setores"] == [PISTA]
    assert sorted(c["s"] for c in r["credenciais"]) == sorted([PISTA, VIP])


def test_a_faixa_traz_o_sal_de_cada_pedido_e_o_do_evento(banco):
    """Sem eles o aparelho nao consegue calcular o hash do que leu -- a nuvem
    nunca manda codigo, so hash."""
    r = ap._faixa(token_de(banco), 0)
    assert r["sais"]["18560"] == "bb" * 32
    assert r["evento"]["sal"] == SAL


def test_a_faixa_pagina_e_diz_onde_continuar(banco, monkeypatch):
    monkeypatch.setattr(ap, "POR_PAGINA", 1)
    r = ap._faixa(token_de(banco), 0)
    assert len(r["credenciais"]) == 1
    assert r["proxima"] == 1
    fim = ap._faixa(token_de(banco), 1)
    assert fim["proxima"] is None


def test_token_desconhecido_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        ap._faixa("Bearer nao-existe", 0)
    assert e.value.status_code == 401


def test_revogar_derruba_quem_ja_estava_pareado(banco):
    """E o unico jeito de tirar um aparelho de circulacao: gerar codigo novo nao
    derruba ninguem, porque quem esta pareado ja nao usa o codigo."""
    cabecalho = token_de(banco)
    banco.aparelhos[0]["status"] = "revogado"
    with pytest.raises(HTTPException) as e:
        ap._faixa(cabecalho, 0)
    assert e.value.status_code == 401


def test_as_leituras_sobem_e_o_reenvio_nao_duplica(banco):
    """O celular que ficou tres horas offline reenvia a fila inteira. A chave
    unica (dispositivo_id, id_local) e o que transforma reenvio em nada."""
    cabecalho = token_de(banco)
    lote = {"leituras": [
        {"id_local": "a", "momento": "2026-08-20T21:00:00Z", "credencial_id": "c1",
         "setor_id": PISTA, "resultado": "permitido", "motivo": None},
        {"id_local": "b", "momento": "2026-08-20T21:01:00Z", "credencial_id": None,
         "setor_id": None, "resultado": "negado", "motivo": "desconhecido"},
    ]}
    assert ap._leituras(cabecalho, lote)["gravadas"] == 2
    ap._leituras(cabecalho, lote)
    assert len(banco.leituras) == 2


def test_a_leitura_NEGADA_tambem_sobe(banco):
    """E ela que responde 'por que a fila parou as 22h'. Sem ela o relatorio
    mostraria um evento sem problema nenhum, que nunca e verdade."""
    ap._leituras(token_de(banco), {"leituras": [
        {"id_local": "n", "momento": "2026-08-20T22:00:00Z", "credencial_id": None,
         "setor_id": None, "resultado": "negado", "motivo": "bloqueado"},
    ]})
    assert banco.leituras[0]["resultado"] == "negado"
    assert banco.leituras[0]["motivo"] == "bloqueado"


def test_a_leitura_nunca_confia_no_dispositivo_id_que_o_corpo_mandar(banco):
    """O aparelho e quem o TOKEN diz que e. Aceitar o id do corpo deixaria um
    aparelho gravar leitura no nome de outro."""
    ap._leituras(token_de(banco), {"leituras": [
        {"id_local": "a", "momento": "2026-08-20T21:00:00Z", "resultado": "permitido",
         "credencial_id": "c1", "setor_id": PISTA, "dispositivo_id": "OUTRO"},
    ]})
    assert banco.leituras[0]["dispositivo_id"] == "d1"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python.exe -m pytest tests/test_acesso_portaria.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'acesso_portaria'`.

- [ ] **Step 3: Escrever `acesso_portaria.py`**

```python
# -*- coding: utf-8 -*-
"""Os tres endpoints do aparelho da portaria.

Separado do `acesso_config.py` porque quem entra aqui e OUTRA pessoa: la e o
dono, com a conta do Vibe e a senha; aqui e o porteiro, com um codigo de seis
caracteres e um celular que pode estar offline ha horas. As duas portas nao se
misturam.

O que NAO se separou foi a chave: este modulo importa a `supabase()` do
`acesso_api` em vez de abrir a propria conexao, para que a pergunta "quem tem a
chave-mestra do banco na mao?" continue tendo um arquivo so por resposta.

## O que o aparelho pode

Ler ingresso e registrar entrada. Nada mais. Configurar o evento exige a senha
do dono e passa pelo `acesso_config.py` -- decisao do usuario em 13/08/2026.
"""

import hashlib
import hmac
import secrets
import time

from fastapi import APIRouter, Header, HTTPException

import qr_ideal
from acesso_api import supabase

router = APIRouter(prefix="/api/acesso/portaria", tags=["acesso"])

# Quantas credenciais por pagina da carga. Um evento de 30.000 sao ~3,5 MB de
# JSON; mandar de uma vez castiga o 4G do portao e estoura memoria em celular
# velho.
POR_PAGINA = 5000

# Quantas leituras o servidor aceita por chamada. O aparelho manda em lotes.
MAXIMO_LEITURAS = 500

# Forca bruta no pareamento: 31^6 sao 887 milhoes de codigos, e cada tentativa
# ja custa um PBKDF2 de 10.000 voltas. Isto aqui e o segundo freio.
#
# LIMITE CONHECIDO, registrado de proposito: a contagem vive na memoria do
# processo. Nao sobrevive a um reinicio do Render nem a duas instancias. Hoje o
# Render roda uma instancia so, e o dono pode revogar o aparelho a qualquer
# momento. Endereca-lo de verdade e assunto da parte 3c.
MAXIMO_FALHAS = 10
JANELA_DE_FALHAS = 300          # segundos
_FALHAS = {}                    # {evento_id: [momento, ...]}


def _conferir_forca_bruta(evento_id: str):
    agora = time.time()
    recentes = [t for t in _FALHAS.get(evento_id, []) if agora - t < JANELA_DE_FALHAS]
    _FALHAS[evento_id] = recentes
    if len(recentes) >= MAXIMO_FALHAS:
        raise HTTPException(
            status_code=429,
            detail="muitas tentativas; espere cinco minutos e tente de novo",
        )


def _anotar_falha(evento_id: str):
    _FALHAS.setdefault(evento_id, []).append(time.time())


def _recusar_pareamento(evento_id: str):
    """A MESMA resposta para codigo errado, aparelho revogado e evento que nao
    existe. Responder diferente contaria a um estranho o que existe do outro
    lado."""
    _anotar_falha(evento_id)
    raise HTTPException(status_code=401, detail="codigo invalido")


def _hash_do_token(token: str) -> str:
    """SHA-256 puro, sem sal e sem KDF lento -- ao contrario do codigo de seis
    caracteres, que precisa de PBKDF2. Aqui a entrada tem 32 bytes sorteados:
    nao ha dicionario que ataque isso, e o token e conferido a cada requisicao
    do aparelho, onde 10.000 voltas seriam desperdicio puro."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _setores_do_aparelho(dispositivo_id: str) -> list:
    return [v["setor_id"] for v in (supabase(
        "GET",
        f"producao_acesso_dispositivo_setores?dispositivo_id=eq.{dispositivo_id}"
        "&select=setor_id",
    ) or [])]


def _entrar(corpo: dict) -> dict:
    """Troca o codigo de seis caracteres por um token do aparelho."""
    evento_id = str((corpo or {}).get("evento_id") or "").strip()
    codigo = str((corpo or {}).get("codigo") or "").strip().upper()
    if not evento_id or not codigo:
        raise HTTPException(status_code=422, detail="informe o evento e o codigo")

    _conferir_forca_bruta(evento_id)

    evento = (supabase(
        "GET", f"producao_acesso_eventos?id=eq.{evento_id}&select=id,nome_evento,sal",
    ) or [None])[0]
    if not evento:
        _recusar_pareamento(evento_id)

    # UM PBKDF2 para a tentativa inteira: o hash depende do codigo e do sal do
    # evento, e nao do aparelho. Comparar contra cada aparelho depois disso e
    # de graca.
    tentativa = qr_ideal.hash_codigo(codigo, evento["sal"])

    aparelhos = supabase(
        "GET",
        f"producao_acesso_dispositivos?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,nome,codigo_hash",
    ) or []
    achado = None
    for a in aparelhos:
        if hmac.compare_digest(str(a.get("codigo_hash") or ""), tentativa):
            achado = a
            break
    if not achado:
        _recusar_pareamento(evento_id)

    token = secrets.token_hex(32)
    supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{achado['id']}",
             {"token_hash": _hash_do_token(token), "ultimo_visto": "now()"},
             prefer="return=minimal")

    _FALHAS.pop(evento_id, None)
    return {
        "token": token,
        "aparelho": {"id": achado["id"], "nome": achado["nome"],
                     "setores": _setores_do_aparelho(achado["id"])},
        "evento": {"id": evento["id"], "nome": evento.get("nome_evento")},
    }


def _aparelho_do_token(cabecalho: str | None) -> dict:
    """Quem esta falando. Revogar o aparelho na tela do dono zera o `token_hash`
    e faz esta funcao recusar na requisicao seguinte -- e o unico jeito de tirar
    um aparelho de circulacao."""
    valor = (cabecalho or "").strip()
    if not valor.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="aparelho nao pareado")
    achados = supabase(
        "GET",
        f"producao_acesso_dispositivos?token_hash=eq.{_hash_do_token(valor[7:].strip())}"
        "&status=eq.ativo&select=id,evento_id,nome",
    ) or []
    if not achados:
        raise HTTPException(status_code=401, detail="aparelho nao pareado ou revogado")
    return achados[0]


def _faixa(cabecalho: str | None, desde: int) -> dict:
    """A carga do evento: tudo o que o aparelho precisa para decidir sem rede."""
    aparelho = _aparelho_do_token(cabecalho)
    evento_id = aparelho["evento_id"]
    desde = max(0, int(desde or 0))

    evento = (supabase(
        "GET", f"producao_acesso_eventos?id=eq.{evento_id}&select=id,nome_evento,sal",
    ) or [None])[0]
    if not evento:
        raise HTTPException(status_code=409, detail="evento nao existe mais")

    setores = supabase(
        "GET",
        f"producao_acesso_setores?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em&order=nome.asc",
    ) or []
    bloqueios = supabase(
        "GET",
        f"producao_acesso_bloqueios?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=setor_id,de,ate,motivo",
    ) or []
    pedidos = supabase(
        "GET",
        f"producao_acesso_pedidos?evento_id=eq.{evento_id}&select=pedido_id_int,sal",
    ) or []

    # O evento INTEIRO, e nao so os setores deste aparelho. E o que torna a
    # regra `setor_nao_autorizado` possivel: com so os setores autorizados, um
    # ingresso de outra porta cairia em `desconhecido` e o porteiro devolveria
    # ingresso bom achando que e falso.
    pagina = supabase(
        "GET",
        f"producao_acesso_credenciais?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,codigo_hash,setor_id,numero&order=id.asc"
        f"&offset={desde}&limit={POR_PAGINA}",
    ) or []

    return {
        "evento": {"id": evento["id"], "nome": evento.get("nome_evento"),
                   "sal": evento["sal"]},
        "aparelho": {"id": aparelho["id"], "nome": aparelho["nome"],
                     "setores": _setores_do_aparelho(aparelho["id"])},
        "sais": {str(p["pedido_id_int"]): p["sal"] for p in pedidos},
        "setores": setores,
        "bloqueios": bloqueios,
        # Nomes curtos de proposito: sao 30.000 objetos numa rede de portao, e
        # `codigo_hash`/`setor_id`/`numero` por extenso somariam ~1 MB so de
        # nomes de campo.
        "credenciais": [{"h": c["codigo_hash"], "s": c["setor_id"],
                         "n": c["numero"], "id": c["id"]} for c in pagina],
        "proxima": (desde + POR_PAGINA) if len(pagina) == POR_PAGINA else None,
    }


RESULTADOS = ("permitido", "negado")


def _leituras(cabecalho: str | None, corpo: dict) -> dict:
    """Recebe a fila que o aparelho acumulou."""
    aparelho = _aparelho_do_token(cabecalho)
    itens = (corpo or {}).get("leituras") or []
    if len(itens) > MAXIMO_LEITURAS:
        raise HTTPException(
            status_code=422,
            detail=f"mande no maximo {MAXIMO_LEITURAS} leituras por vez",
        )
    if not itens:
        return {"gravadas": 0}

    linhas = []
    for i in itens:
        resultado = str(i.get("resultado") or "")
        if resultado not in RESULTADOS:
            raise HTTPException(status_code=422, detail="resultado invalido")
        if not i.get("id_local") or not i.get("momento"):
            raise HTTPException(status_code=422, detail="leitura sem id_local ou momento")
        linhas.append({
            "evento_id": aparelho["evento_id"],
            # O aparelho e quem o TOKEN diz que e. Aceitar o id do corpo
            # deixaria um aparelho gravar leitura no nome de outro.
            "dispositivo_id": aparelho["id"],
            "credencial_id": i.get("credencial_id"),
            "setor_id": i.get("setor_id"),
            "id_local": str(i["id_local"]),
            "momento": i["momento"],
            "tipo": "entrada",
            "resultado": resultado,
            "motivo": i.get("motivo"),
        })

    # `(dispositivo_id, id_local)` e a chave unica que ja existe no esquema
    # desde 13/08, criada exatamente para isto: o celular que ficou tres horas
    # offline reenvia a fila inteira, e nada duplica.
    supabase(
        "POST", "producao_acesso_leituras?on_conflict=dispositivo_id,id_local",
        linhas, prefer="resolution=ignore-duplicates,return=minimal",
    )
    supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{aparelho['id']}",
             {"ultimo_visto": "now()"}, prefer="return=minimal")
    return {"gravadas": len(linhas)}


@router.post("/entrar")
def entrar(corpo: dict):
    return _entrar(corpo)


@router.get("/faixa")
def faixa(desde: int = 0, authorization: str = Header(None)):
    return _faixa(authorization, desde)


@router.post("/leituras")
def leituras(corpo: dict, authorization: str = Header(None)):
    return _leituras(authorization, corpo)
```

- [ ] **Step 4: Montar o router no `app.py`**

Em `app.py`, no bloco que já monta os outros dois (por volta da linha 59):

```python
import acesso_api
import acesso_config
import acesso_portaria
if acesso_api.disponivel():
    app.include_router(acesso_api.router)
    app.include_router(acesso_config.router)
    app.include_router(acesso_portaria.router)
```

- [ ] **Step 5: Rodar e ver passar**

Run: `venv/Scripts/python.exe -m pytest tests/test_acesso_portaria.py -q`
Expected: PASS, 14 testes.

- [ ] **Step 6: Conferir que o motor ainda sobe**

Run: `venv/Scripts/python.exe -c "import app; print('motor ok')"`
Expected: `motor ok`

- [ ] **Step 7: Rodar a suíte inteira e commitar**

Run: `venv/Scripts/python.exe -m pytest tests/ -q` — Expected: 588 passed.

```bash
git add acesso_portaria.py tests/test_acesso_portaria.py app.py
git commit -m "portaria: os tres endpoints do aparelho

entrar (codigo de seis caracteres -> token), faixa (a carga do evento) e
leituras (a fila acumulada). Arquivo separado do acesso_config porque quem entra
aqui e outra pessoa: la e o dono com a senha, aqui e o porteiro com um celular
que pode estar offline ha horas.

O token e gravado como sha256 -- 32 bytes sorteados nao precisam de KDF lento, e
sao conferidos a cada requisicao. O codigo de seis caracteres continua com
PBKDF2, e o pareamento para por cinco minutos depois de dez erros.

A faixa traz o evento INTEIRO e marca quais setores este aparelho valida.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: A tela e o pareamento

**Files:**
- Create: `frontend/portaria.html`
- Create: `frontend/portaria.js`

**Interfaces:**
- Consumes: `window.portariaValidacao` (Task 1), `window.portariaDeposito` (Task 2), `window.qrIdealHash` (já existe em `frontend/qr-ideal-hash.js`), e os três endpoints (Task 3).
- Produces: a tela funcionando com **entrada digitada**. A câmera entra na Task 5.
  - `window.portaria` expõe, para a Task 5 e para depuração: `{estado, validarTexto(texto), sincronizar(), parear(codigo), desparear()}`

**Estados da tela** (um `<div>` por estado, um visível por vez):
`pareando` · `carregando` · `lendo` · `permitido` · `negado` · `ambiguo`

- [ ] **Step 1: Escrever `frontend/portaria.html`**

Auto-contida como `evento.html`: **não** carrega o `style.css` do painel. Sem `<script src>` externo.

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Portaria — Ideal Control</title>
    <meta name="theme-color" content="#0a0f1e">
    <!--
        A tela do porteiro. Uma mao, no escuro, com sol de refletor na cara e a
        fila andando. Por isso: alvos de toque grandes, cor ocupando a tela
        inteira na resposta, e nenhuma decisao escondida atras de menu.

        Auto-contida como o evento.html, e por um motivo a mais: esta pagina
        precisa ABRIR SEM REDE. Todo arquivo que ela usa e local e esta no
        sw.js — nao ha CDN nenhum aqui, e nao pode haver.
    -->
    <style>
        :root {
            --bg: #0a0f1e; --card: #1e293b; --border: rgba(148,163,184,0.25);
            --text: #e2e8f0; --dim: #94a3b8;
            --verde: #16a34a; --vermelho: #b91c1c; --laranja: #c2410c; --teal: #14b8a6;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0; background: var(--bg); color: var(--text);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 16px; line-height: 1.5; -webkit-font-smoothing: antialiased;
            padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
        }
        .folha { max-width: 520px; margin: 0 auto; padding: 14px; }
        .topo {
            display: flex; justify-content: space-between; align-items: baseline;
            gap: 10px; font-size: 0.82rem; color: var(--dim); margin-bottom: 12px;
        }
        .topo strong { color: var(--text); font-size: 0.95rem; }
        h1 { font-size: 1.25rem; margin: 0 0 6px; }
        .sumindo { display: none !important; }

        input {
            width: 100%; padding: 14px; font-size: 1.15rem; letter-spacing: 0.08em;
            background: rgba(0,0,0,0.32); border: 1px solid var(--border);
            border-radius: 8px; color: var(--text); font-family: inherit;
            text-align: center; text-transform: uppercase;
        }
        button {
            width: 100%; padding: 16px; font-size: 1.05rem; font-weight: 700;
            font-family: inherit; border: 0; border-radius: 10px;
            background: var(--teal); color: #06231f; margin-top: 14px;
            min-height: 56px; cursor: pointer;
        }
        button.discreto { background: transparent; color: var(--dim); border: 1px solid var(--border); }
        button:disabled { opacity: 0.5; }

        /* A resposta ocupa a tela: o porteiro le de longe, com o celular na mao
           esticada e a pessoa esperando. */
        .resposta { border-radius: 14px; padding: 28px 20px; text-align: center; }
        .resposta.ok       { background: var(--verde); }
        .resposta.recusa   { background: var(--vermelho); }
        /* Laranja, e nao vermelho: ingresso bom na porta errada NAO e a mesma
           coisa que ingresso estranho ao evento. Confundir os dois faz o
           porteiro devolver ingresso legitimo achando que e falso. */
        .resposta.porta    { background: var(--laranja); }
        .resposta .marca   { font-size: 3.2rem; line-height: 1; }
        .resposta .titulo  { font-size: 1.5rem; font-weight: 800; margin: 8px 0 4px; }
        .resposta .detalhe { font-size: 1.05rem; opacity: 0.95; }
        /* O motivo do bloqueio e o que o porteiro le em voz alta. */
        .resposta .motivo  { font-size: 1.35rem; font-weight: 700; margin-top: 10px; }
        .resposta .grande  { font-size: 2.1rem; font-weight: 800; margin-top: 6px; }

        .escolha { display: grid; gap: 12px; margin-top: 16px; }
        .escolha button { margin: 0; font-size: 1.25rem; padding: 22px; }

        .aviso {
            font-size: 0.85rem; padding: 12px 14px; border-radius: 8px;
            background: rgba(245,158,11,0.12); border-left: 3px solid #f59e0b;
            color: var(--dim); margin-top: 12px;
        }
        .cam { width: 100%; border-radius: 12px; background: #000; aspect-ratio: 4/3; }
    </style>
</head>
<body>
<div class="folha">
    <div class="topo">
        <span><strong id="topo-aparelho">Portaria</strong><br><span id="topo-setores"></span></span>
        <span id="topo-fila"></span>
    </div>

    <div id="tela-pareando">
        <h1>Ligar este aparelho</h1>
        <p style="color:var(--dim);font-size:0.9rem;">
            Peça o código de 6 caracteres a quem organiza o evento.
        </p>
        <input id="campo-codigo" maxlength="6" autocomplete="off"
               autocapitalize="characters" placeholder="ABC234">
        <button id="btn-parear">Ligar</button>
        <div id="erro-pareamento" class="aviso sumindo"></div>
    </div>

    <div id="tela-carregando" class="sumindo">
        <h1>Baixando o evento</h1>
        <p style="color:var(--dim);" id="carregando-conta">…</p>
        <div class="aviso">
            Depois disso o aparelho funciona sem internet. Espere terminar antes
            de ir para o portão.
        </div>
    </div>

    <div id="tela-lendo" class="sumindo">
        <video id="cam" class="cam" playsinline muted></video>
        <button id="btn-digitar" class="discreto">Digitar o número</button>
        <div id="caixa-digitar" class="sumindo">
            <input id="campo-numero" inputmode="numeric" placeholder="000001">
            <button id="btn-conferir">Conferir</button>
        </div>
    </div>

    <div id="tela-resposta" class="sumindo">
        <div class="resposta" id="resposta-caixa">
            <div class="marca" id="resposta-marca"></div>
            <div class="titulo" id="resposta-titulo"></div>
            <div class="detalhe" id="resposta-detalhe"></div>
            <div class="grande" id="resposta-grande"></div>
            <div class="motivo" id="resposta-motivo"></div>
        </div>
        <button id="btn-proximo">Ler o próximo</button>
    </div>

    <div id="tela-ambiguo" class="sumindo">
        <h1>Qual setor?</h1>
        <p style="color:var(--dim);font-size:0.9rem;">
            Este número existe em mais de um setor que este aparelho atende.
        </p>
        <div class="escolha" id="escolha-setores"></div>
    </div>
</div>

<script src="/qr-ideal-hash.js?v=582"></script>
<script src="/portaria-validacao.js?v=582"></script>
<script src="/portaria-deposito.js?v=582"></script>
<script src="/portaria.js?v=582"></script>
</body>
</html>
```

- [ ] **Step 2: Escrever `frontend/portaria.js`**

```js
/**
 * O aparelho da portaria: pareamento, carga, leitura e fila.
 *
 * A decisao de deixar entrar NAO mora aqui -- mora no `portaria-validacao.js`,
 * que e puro e testado com dados de mesa. Este arquivo orquestra: pega o texto
 * lido, calcula os hashes, pergunta ao validador, pinta a tela e enfileira.
 *
 * REGRA QUE GOVERNA ESTA TELA: recusa e recusa. Nao existe "deixar entrar mesmo
 * assim" -- decisao do usuario em 15/08/2026. Quem for recusado procura o dono
 * do evento.
 */
(function () {
    'use strict';

    var D = window.portariaDeposito;
    var V = window.portariaValidacao;
    var CHAVE_TOKEN = 'ideal_portaria_token';

    var estado = { carga: null, token: null, pendente: null };

    function $(id) { return document.getElementById(id); }
    function mostrar(qual) {
        ['pareando', 'carregando', 'lendo', 'resposta', 'ambiguo'].forEach(function (t) {
            $('tela-' + t).classList.toggle('sumindo', t !== qual);
        });
    }

    function base() {
        // Servida pela Vercel, a pagina fala com o motor do Render. Servida pelo
        // agente (localhost:9000) nao ha router de acesso, entao tambem e o
        // Render — o aparelho da portaria nunca usa o agente.
        return 'https://imposicao.onrender.com';
    }

    function api(caminho, opcoes) {
        opcoes = opcoes || {};
        opcoes.headers = opcoes.headers || {};
        if (estado.token) opcoes.headers['Authorization'] = 'Bearer ' + estado.token;
        if (opcoes.body) opcoes.headers['Content-Type'] = 'application/json';
        return fetch(base() + '/api/acesso/portaria' + caminho, opcoes).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (corpo) {
                if (!r.ok) {
                    var e = new Error(corpo.detail || ('erro ' + r.status));
                    e.status = r.status;
                    throw e;
                }
                return corpo;
            });
        });
    }

    // ── Pareamento ──────────────────────────────────────────────────────────

    function eventoDaUrl() {
        return new URLSearchParams(window.location.search).get('e') || '';
    }

    function parear(codigo) {
        return api('/entrar', {
            method: 'POST',
            body: JSON.stringify({ evento_id: eventoDaUrl(), codigo: codigo }),
        }).then(function (r) {
            estado.token = r.token;
            localStorage.setItem(CHAVE_TOKEN, r.token);
            return baixarCarga();
        });
    }

    function desparear() {
        localStorage.removeItem(CHAVE_TOKEN);
        estado.token = null;
        estado.carga = null;
        return D.limpar().then(function () { mostrar('pareando'); });
    }

    // ── A carga ─────────────────────────────────────────────────────────────

    function baixarCarga() {
        mostrar('carregando');
        var acumulada = null;
        function pagina(desde) {
            return api('/faixa?desde=' + desde).then(function (p) {
                if (!acumulada) acumulada = p;
                else acumulada.credenciais = acumulada.credenciais.concat(p.credenciais);
                $('carregando-conta').textContent =
                    acumulada.credenciais.length.toLocaleString('pt-BR') + ' ingressos';
                if (p.proxima !== null && p.proxima !== undefined) return pagina(p.proxima);
                return D.gravarCarga(acumulada).then(function () {
                    estado.carga = acumulada;
                    entrarEmLeitura();
                });
            });
        }
        return pagina(0);
    }

    function entrarEmLeitura() {
        var c = estado.carga;
        $('topo-aparelho').textContent = c.aparelho.nome;
        $('topo-setores').textContent = c.aparelho.setores.map(function (id) {
            var s = c.setores.filter(function (x) { return x.id === id; })[0];
            return s ? s.nome : id;
        }).join(' · ');
        atualizarFila();
        mostrar('lendo');
        if (window.portariaCamera) window.portariaCamera.ligar();
    }

    function atualizarFila() {
        return D.contarFila().then(function (n) {
            // Fila que cresce e o sinal de que a rede caiu. O porteiro precisa
            // ver isso sem procurar.
            $('topo-fila').textContent = n ? (n + ' na fila') : '';
        });
    }

    // ── A leitura ───────────────────────────────────────────────────────────

    function validarTexto(texto, setorEscolhido) {
        var carga = estado.carga;
        var sais = V.saisParaTentar(texto, carga);
        return Promise.all(sais.map(function (s) { return window.qrIdealHash(texto, s); }))
            .then(function (hashes) {
                return D.entradasPermitidas().then(function (entradas) {
                    return V.decidir({
                        hashes: hashes, carga: carga,
                        agora: new Date().toISOString(),
                        entradas: entradas, setorEscolhido: setorEscolhido || null,
                    });
                });
            })
            .then(function (v) {
                if (v.estado === 'ambiguo') {
                    estado.pendente = { texto: texto };
                    return perguntarSetor(v.candidatos);
                }
                return registrar(v).then(function () { return pintar(v); });
            });
    }

    function perguntarSetor(candidatos) {
        var caixa = $('escolha-setores');
        caixa.innerHTML = '';
        candidatos.forEach(function (c) {
            var b = document.createElement('button');
            b.textContent = c.setor.nome;
            b.onclick = function () {
                mostrar('lendo');
                validarTexto(estado.pendente.texto, c.setor.id);
            };
            caixa.appendChild(b);
        });
        mostrar('ambiguo');
    }

    function uuid() {
        // `crypto.randomUUID` nao existe em Safari antigo, e este id e a chave
        // de idempotencia: sem ele a fila reenviada duplicaria a lotacao.
        if (crypto.randomUUID) return crypto.randomUUID();
        var b = crypto.getRandomValues(new Uint8Array(16));
        return Array.prototype.map.call(b, function (x) {
            return x.toString(16).padStart(2, '0');
        }).join('');
    }

    function registrar(v) {
        return D.enfileirar({
            id_local: uuid(),
            momento: new Date().toISOString(),
            credencial_id: v.credencial_id || null,
            setor_id: (v.setor && v.setor.id) || null,
            resultado: v.estado === 'permitido' ? 'permitido' : 'negado',
            motivo: v.motivo || null,
        }).then(atualizarFila).then(function () { sincronizar(); });
    }

    var TITULOS = {
        desconhecido: 'NÃO É DESTE EVENTO',
        setor_nao_autorizado: 'OUTRA PORTA',
        fora_da_janela: 'FORA DO HORÁRIO',
        bloqueado: 'FAIXA BLOQUEADA',
        ja_entrou: 'JÁ ENTROU',
    };

    function hora(iso) {
        try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return iso; }
    }

    function pintar(v) {
        var caixa = $('resposta-caixa');
        var d = v.detalhe || {};
        caixa.className = 'resposta ' + (
            v.estado === 'permitido' ? 'ok' :
            v.motivo === 'setor_nao_autorizado' ? 'porta' : 'recusa');
        $('resposta-marca').textContent = v.estado === 'permitido' ? '✓' : '✕';
        $('resposta-titulo').textContent = v.estado === 'permitido'
            ? 'PODE ENTRAR' : TITULOS[v.motivo] || 'RECUSADO';
        $('resposta-grande').textContent = '';
        $('resposta-motivo').textContent = '';

        if (v.estado === 'permitido') {
            $('resposta-detalhe').textContent = v.setor.nome;
            $('resposta-grande').textContent = 'nº ' + v.numero;
        } else if (v.motivo === 'setor_nao_autorizado') {
            $('resposta-detalhe').textContent =
                'Este ingresso é ' + v.setor.nome + '. Este aparelho lê ' +
                (d.setoresDoAparelho || []).join(', ') + '.';
        } else if (v.motivo === 'fora_da_janela') {
            $('resposta-detalhe').textContent = d.abre_em
                ? (v.setor.nome + ' abre às ' + hora(d.abre_em))
                : (v.setor.nome + ' fechou às ' + hora(d.fecha_em));
        } else if (v.motivo === 'bloqueado') {
            $('resposta-detalhe').textContent = v.setor.nome + ' · nº ' + v.numero;
            $('resposta-motivo').textContent = d.motivoBloqueio;
        } else if (v.motivo === 'ja_entrou') {
            $('resposta-detalhe').textContent =
                v.setor.nome + ' · nº ' + v.numero + ' — entrou às ' + hora(d.momentoAnterior);
        } else {
            $('resposta-detalhe').textContent = 'Este código não é deste evento.';
        }
        mostrar('resposta');
    }

    // ── A fila sobe ─────────────────────────────────────────────────────────

    var sincronizando = false;

    function sincronizar() {
        if (sincronizando || !estado.token || !navigator.onLine) return Promise.resolve();
        sincronizando = true;
        return D.lerFila(200).then(function (lote) {
            if (!lote.length) return;
            return api('/leituras', {
                method: 'POST', body: JSON.stringify({ leituras: lote }),
            }).then(function () {
                // So AGORA sai da fila. Remover antes seria perder leitura
                // quando a resposta se perde no caminho.
                return D.removerDaFila(lote.map(function (l) { return l.id_local; }));
            }).then(atualizarFila);
        }).catch(function (e) {
            if (e.status === 401) return desparear();
        }).then(function () { sincronizando = false; });
    }

    window.addEventListener('online', sincronizar);
    setInterval(sincronizar, 30000);

    // ── Amarração da tela ───────────────────────────────────────────────────

    $('btn-parear').onclick = function () {
        var codigo = ($('campo-codigo').value || '').trim().toUpperCase();
        $('erro-pareamento').classList.add('sumindo');
        $('btn-parear').disabled = true;
        parear(codigo).catch(function (e) {
            $('erro-pareamento').textContent = e.message;
            $('erro-pareamento').classList.remove('sumindo');
        }).then(function () { $('btn-parear').disabled = false; });
    };

    $('btn-proximo').onclick = function () {
        mostrar('lendo');
        if (window.portariaCamera) window.portariaCamera.ligar();
    };

    $('btn-digitar').onclick = function () {
        $('caixa-digitar').classList.toggle('sumindo');
        $('campo-numero').focus();
    };

    $('btn-conferir').onclick = function () {
        var t = ($('campo-numero').value || '').trim();
        if (!t) return;
        $('campo-numero').value = '';
        // Passa pelas MESMAS seis regras. Digitar nao e atalho -- e outra forma
        // de entrada, para o ingresso rasgado e para o codigo de barras que o
        // navegador do iPhone nao le.
        validarTexto(t);
    };

    // ── Partida ─────────────────────────────────────────────────────────────

    estado.token = localStorage.getItem(CHAVE_TOKEN);
    if (!estado.token) {
        mostrar('pareando');
    } else {
        D.lerCarga().then(function (c) {
            if (c) { estado.carga = c; entrarEmLeitura(); sincronizar(); }
            else { baixarCarga().catch(function () { mostrar('pareando'); }); }
        });
    }

    window.portaria = {
        estado: estado, validarTexto: validarTexto,
        sincronizar: sincronizar, parear: parear, desparear: desparear,
    };
})();
```

- [ ] **Step 3: Conferir a sintaxe dos dois arquivos**

Run:
```bash
node -e "new Function(require('fs').readFileSync('frontend/portaria.js','utf8')); console.log('js ok')"
```
Expected: `js ok`

- [ ] **Step 4: Rodar a suíte inteira e commitar**

Run: `venv/Scripts/python.exe -m pytest tests/ -q` — Expected: 588 passed (nenhum teste novo nesta task; as guardas de fonte vêm na Task 6).

```bash
git add frontend/portaria.html frontend/portaria.js
git commit -m "portaria: a tela do porteiro, com entrada digitada

Pareamento pelo codigo de seis caracteres, carga paginada para o IndexedDB, as
seis regras pintando a tela, e a fila subindo sozinha. A camera vem na proxima.

A decisao de deixar entrar nao mora aqui: mora no portaria-validacao.js, que e
puro. Este arquivo orquestra e pinta.

Sem 'deixar entrar mesmo assim' -- decisao do usuario. E o laranja de OUTRA
PORTA e diferente do vermelho de NAO E DESTE EVENTO de proposito.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: A câmera e o abrir sem rede

**Files:**
- Create: `frontend/jsqr.min.js` (vendorizado)
- Create: `frontend/portaria-camera.js`
- Create: `frontend/sw.js`
- Modify: `frontend/portaria.html` (carregar os dois novos, registrar o service worker)

**Interfaces:**
- Consumes: `window.portaria.validarTexto(texto)` (Task 4).
- Produces: `window.portariaCamera = { ligar(), desligar() }`. `ligar()` é idempotente.

- [ ] **Step 1: Vendorizar o jsQR**

```bash
npm install jsqr --no-save
cp node_modules/jsqr/dist/jsQR.js frontend/jsqr.min.js
```

Conferir que o arquivo registra `jsQR` global e tem menos de 100 KB:

```bash
node -e "const s=require('fs').readFileSync('frontend/jsqr.min.js','utf8'); console.log(s.length, /jsQR/.test(s))"
```
Expected: um número abaixo de 100000 e `true`.

- [ ] **Step 2: Escrever `frontend/portaria-camera.js`**

```js
/**
 * A camera do aparelho da portaria.
 *
 * Dois leitores, porque nenhum sozinho cobre os celulares da grafica:
 *
 *   BarcodeDetector -- nativo, rapido, e le CODIGO DE BARRAS alem de QR. Existe
 *                      no Chrome do Android. Nao existe no Safari do iPhone.
 *   jsQR            -- reserva, vendorizada aqui dentro (a CSP e o offline
 *                      proibem CDN). So le QR.
 *
 * No iPhone, portanto, codigo de barras nao e lido pela camera -- e para isso
 * existe o "Digitar o numero" na tela, que passa pelas mesmas seis regras.
 */
(function () {
    'use strict';

    var video = null, canvas = null, ctx = null, detector = null;
    var rodando = false, ultimo = '', ultimoEm = 0;

    function ligar() {
        if (rodando) return;
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

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, audio: false,
        }).then(function (fluxo) {
            video.srcObject = fluxo;
            return video.play();
        }).then(quadro).catch(function () {
            rodando = false;   // sem camera a tela continua util pelo "Digitar o numero"
        });
    }

    function desligar() {
        rodando = false;
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(function (t) { t.stop(); });
            video.srcObject = null;
        }
    }

    function achou(texto) {
        var agora = Date.now();
        // O mesmo ingresso fica na frente da camera por segundos. Sem esta
        // trava a tela dispararia dezenas de leituras iguais e a fila encheria
        // de lixo.
        if (texto === ultimo && agora - ultimoEm < 3000) return;
        ultimo = texto; ultimoEm = agora;
        desligar();
        window.portaria.validarTexto(texto);
    }

    function quadro() {
        if (!rodando) return;
        if (video.readyState < 2) return requestAnimationFrame(quadro);

        if (detector) {
            detector.detect(video).then(function (achados) {
                if (achados && achados.length) achou(achados[0].rawValue);
            }).catch(function () { }).then(function () {
                if (rodando) requestAnimationFrame(quadro);
            });
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var r = window.jsQR ? window.jsQR(img.data, img.width, img.height) : null;
        if (r && r.data) achou(r.data);
        requestAnimationFrame(quadro);
    }

    window.portariaCamera = { ligar: ligar, desligar: desligar };
})();
```

- [ ] **Step 3: Escrever `frontend/sw.js`**

```js
/**
 * O service worker da tela da portaria.
 *
 * Existe por um motivo so: a pagina precisa ABRIR sem rede. Depois de aberta,
 * quem decide e o IndexedDB — este arquivo nao guarda dado nenhum do evento.
 *
 * O nome do cache carrega a versao, que vem do `?v=` com que o portaria.html
 * registra este arquivo — o mesmo numero que o `publicar.ps1` bumpa em todas as
 * paginas a cada release. Publicar troca o cache sozinho, e nao existe o "meu
 * celular esta preso na versao antiga" que assombra service worker.
 */
const VERSAO = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'portaria-' + VERSAO;

const ARQUIVOS = [
    '/portaria.html',
    '/qr-ideal-hash.js?v=' + VERSAO,
    '/portaria-validacao.js?v=' + VERSAO,
    '/portaria-deposito.js?v=' + VERSAO,
    '/portaria-camera.js?v=' + VERSAO,
    '/portaria.js?v=' + VERSAO,
    '/jsqr.min.js?v=' + VERSAO,
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(nomes => Promise.all(
                nomes.filter(n => n.startsWith('portaria-') && n !== CACHE)
                     .map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    // A API NUNCA vem do cache: uma carga velha faria o aparelho recusar
    // ingresso que ja existe, ou aceitar um que foi cancelado.
    if (url.pathname.startsWith('/api/')) return;
    if (e.request.method !== 'GET') return;
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

- [ ] **Step 4: Ligar tudo no `portaria.html`**

Trocar o bloco de scripts no fim do `body` por:

```html
<script src="/jsqr.min.js?v=582"></script>
<script src="/qr-ideal-hash.js?v=582"></script>
<script src="/portaria-validacao.js?v=582"></script>
<script src="/portaria-deposito.js?v=582"></script>
<script src="/portaria-camera.js?v=582"></script>
<script src="/portaria.js?v=582"></script>
<script>
    // Registrar DEPOIS de tudo carregar: um service worker que instala no meio
    // do carregamento pode guardar resposta pela metade.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js?v=582');
        });
    }
</script>
```

- [ ] **Step 5: Conferir a sintaxe e rodar a suíte**

Run:
```bash
node -e "['portaria-camera.js','sw.js'].forEach(f => new Function(require('fs').readFileSync('frontend/'+f,'utf8'))); console.log('js ok')"
venv/Scripts/python.exe -m pytest tests/ -q
```
Expected: `js ok` e 588 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/jsqr.min.js frontend/portaria-camera.js frontend/sw.js frontend/portaria.html
git commit -m "portaria: a camera e o abrir sem rede

BarcodeDetector onde existe (Android le tambem codigo de barras), jsQR
vendorizado como reserva (a CSP e o offline proibem CDN). No iPhone, barras nao
sai pela camera -- e para isso existe o 'Digitar o numero'.

O service worker guarda so a casca da tela; dado do evento e IndexedDB. O nome
do cache carrega o ?v= que o publicar.ps1 bumpa, entao publicar troca o cache
sozinho e ninguem fica preso na versao antiga.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: O pareamento na tela do dono, e as guardas

**Files:**
- Modify: `frontend/controle.html` (a caixa dos aparelhos)
- Modify: `frontend/controle.js` (mostrar o endereço e o QR)
- Create: `tests/test_portaria_fonte.py`

**Interfaces:**
- Consumes: `window.renderQRCodeOnCtx(ctx, texto, x, y, tamanho, cor, corDeFundo)`, exportada por `frontend/qr-canvas.js` (linha 208). Ela depende do global `qrcode` da biblioteca `qrcode-generator`, que `index.html`, `cliente.html` e `producao.html` já carregam — **o `controle.html` ainda não**, e a Task 6 precisa acrescentar os dois `<script>`.
- Produces: nada que outra task consuma.

**Por que reusar `renderQRCodeOnCtx` em vez de escrever dez linhas próprias:** este projeto já se queimou várias vezes com cópias divergentes da mesma regra — a numeração em quatro lugares, a sondagem do agente em dois. "Desenhar um QR num canvas" tem uma função no projeto, e é essa.

- [ ] **Step 1: Escrever as guardas que falham**

Criar `tests/test_portaria_fonte.py`:

```python
# -*- coding: utf-8 -*-
"""Regras da tela da portaria que so se conferem lendo os arquivos.

Sao tres coisas que quebram em silencio e so aparecem no portao, com a fila
andando: um CDN que nao carrega sem rede, um botao de escape que a decisao do
usuario proibiu, e um service worker guardando resposta de API.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"


def _texto(nome):
    return (FRONT / nome).read_text(encoding="utf-8")


def test_a_tela_da_portaria_nao_carrega_nada_de_fora():
    """Um `<script src>` para CDN faz a tela nao abrir sem rede -- que e a unica
    razao de ela existir -- e ainda esbarra na CSP."""
    externos = re.findall(r'<script[^>]+src=["\'](https?:)?//[^"\']+',
                          _texto("portaria.html"))
    assert not externos, f"a portaria carrega arquivo de fora: {externos}"


def test_a_recusa_nao_oferece_escape():
    """Decisao do usuario, 15/08/2026: recusa e recusa. Quem for recusado
    procura o dono do evento."""
    junto = _texto("portaria.html") + _texto("portaria.js")
    for frase in ("mesmo assim", "liberar", "forcar", "forçar"):
        assert frase not in junto.lower(), (
            f"a tela da portaria oferece escape na recusa ({frase!r})"
        )


def test_o_service_worker_nunca_guarda_resposta_de_api():
    """Uma carga velha em cache faria o aparelho recusar ingresso que ja existe,
    ou aceitar um que foi cancelado."""
    sw = _texto("sw.js")
    assert "/api/" in sw and "return" in sw, (
        "o sw.js nao exclui as chamadas de API do cache"
    )


def test_o_service_worker_so_guarda_arquivos_da_portaria():
    """Guardar o script.js do painel (1 MB) num celular de portao e desperdicio,
    e guardar a pagina de outra tela faz o cache brigar com o do painel."""
    sw = _texto("sw.js")
    alvos = re.findall(r"'(/[^']+\.(?:html|js)[^']*)'", sw)
    intrusos = [a for a in alvos
                if not re.search(r"portaria|jsqr|qr-ideal-hash", a)]
    assert not intrusos, f"o sw.js guarda arquivo que nao e da portaria: {intrusos}"


def test_a_tela_do_dono_mostra_o_endereco_de_pareamento():
    """Sem ele o dono tem um codigo de seis caracteres e nenhum lugar para
    digita-lo — o aparelho nunca sai do lugar."""
    junto = _texto("controle.html") + _texto("controle.js")
    assert "portaria.html" in junto, (
        "a tela do dono nao diz por onde o porteiro abre o aparelho"
    )
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `venv/Scripts/python.exe -m pytest tests/test_portaria_fonte.py -q`
Expected: FAIL em `test_a_tela_do_dono_mostra_o_endereco_de_pareamento` (as outras já passam, porque as Tasks 4 e 5 fizeram certo).

- [ ] **Step 3: Carregar a biblioteca de QR no `controle.html`**

Antes de `<script src="/controle.js?v=582"></script>`, acrescentar os dois — a mesma
biblioteca e a mesma versão que `cliente.html` já usa:

```html
<!-- O QR do endereço de pareamento. Mesma biblioteca do cliente.html e do
     index.html; o `qr-canvas.js` traz o `renderQRCodeOnCtx`, que é a função de
     "desenhar um QR num canvas" deste projeto. -->
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<script src="/qr-canvas.js?v=582"></script>
```

- [ ] **Step 4: Mostrar o endereço de pareamento na tela do dono**

Em `frontend/controle.js`, acrescentar as duas funções e chamar `caixaDePareamento(evento.id)`
uma vez, no fim da seção de aparelhos (logo depois do último cartão de aparelho):

```js
// O porteiro precisa de DOIS dados: onde abrir e qual o codigo. Mostrar so o
// codigo deixa o aparelho parado, porque ninguem adivinha a URL. O QR existe
// porque digitar 60 caracteres num celular, num portao, e pedir erro.
function enderecoDaPortaria(eventoId) {
    return location.origin + '/portaria.html?e=' + encodeURIComponent(eventoId);
}

function caixaDePareamento(eventoId) {
    const caixa = document.createElement('div');
    caixa.className = 'pareamento';

    const url = enderecoDaPortaria(eventoId);
    const texto = document.createElement('p');
    texto.className = 'config-ajuda';
    texto.textContent = 'No celular do porteiro, abra este endereço e digite o código do aparelho:';

    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    link.target = '_blank';
    link.rel = 'noopener';

    const tela = document.createElement('canvas');
    tela.width = tela.height = 220;
    if (typeof window.renderQRCodeOnCtx === 'function') {
        // Fundo branco explicito: o painel e escuro, e QR preto sobre escuro
        // nao e lido por leitor nenhum.
        window.renderQRCodeOnCtx(tela.getContext('2d'), url, 0, 0, 220, '#000000', '#ffffff');
    }

    caixa.appendChild(texto);
    caixa.appendChild(link);
    caixa.appendChild(tela);
    return caixa;
}
```

- [ ] **Step 5: O CSS da caixa**

Em `frontend/controle.css`, acrescentar:

```css
.pareamento { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.pareamento a { display: block; word-break: break-all; font-size: 0.82rem; margin: 6px 0 10px; }
.pareamento canvas { background: #fff; border-radius: 8px; padding: 8px; }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `venv/Scripts/python.exe -m pytest tests/test_portaria_fonte.py -q`
Expected: PASS, 5 testes.

- [ ] **Step 7: Conferir a tela do dono num navegador**

Suba um servidor local numa porta livre e confira que a caixa aparece e o QR é desenhado:

```bash
(venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 9123 > /dev/null 2>&1 &)
timeout 60 bash -c 'until curl -sf http://127.0.0.1:9123/app/controle.html -o /dev/null; do sleep 1; done'
```

Abra `http://127.0.0.1:9123/app/controle.html`, confira o desenho, e derrube o servidor.

- [ ] **Step 8: Rodar a suíte inteira e commitar**

Run: `venv/Scripts/python.exe -m pytest tests/ -q` — Expected: 593 passed.

```bash
git add frontend/controle.js frontend/controle.html frontend/controle.css tests/test_portaria_fonte.py
git commit -m "portaria: o dono mostra por onde o porteiro liga o aparelho

O codigo de seis caracteres ja existia e nao servia para nada sozinho: ninguem
adivinha a URL. Agora a tela do dono mostra o endereco e um QR dele, porque
digitar 60 caracteres num celular, num portao, e pedir erro.

Guardas de fonte: a tela da portaria nao carrega nada de fora (sem rede ela nao
abriria), a recusa nao oferece escape, e o service worker nao guarda resposta de
API nem arquivo de outra tela.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: A documentação passa a dizer a verdade

**Files:**
- Modify: `docs/controle_acesso.md`
- Modify: `docs/STATUS_PROJETO.md`

**Interfaces:** nenhuma.

- [ ] **Step 1: Reescrever a seção "O que falta" do `controle_acesso.md`**

Trocar o parágrafo que começa com *"O que falta é o aplicativo da PORTARIA (parte 3b)"* por uma seção nova, **antes** dele:

```markdown
## A portaria (parte 3b)

`portaria.html` é a tela do porteiro. Depois de pareada, ela **decide sem rede**.

O porteiro abre o endereço que a tela do dono mostra — `portaria.html?e=<evento_id>`,
também como QR — e digita o código de 6 caracteres daquele aparelho. O servidor troca o
código por um token próprio, guardado como `sha256` na coluna `token_hash` que existe desde
13/08. **Revogar o aparelho é o único jeito de derrubá-lo**: gerar um código novo não
desconecta ninguém, porque quem já pareou não usa mais o código.

Em seguida o aparelho baixa a carga — o evento **inteiro**, em páginas de 5.000 — para o
IndexedDB: hashes, sais de cada pedido, setores, bloqueios, e quais setores este aparelho
valida. O evento inteiro, e não só os setores autorizados, porque é isso que permite
distinguir "não é deste evento" de "é deste evento, mas de outra porta" — e chamar o segundo
de primeiro faz o porteiro devolver ingresso bom achando que é falso.

As seis regras vivem em `frontend/portaria-validacao.js`, puras, e a **ordem é a resposta**:

| # | Regra | O que o porteiro vê |
|---|---|---|
| 1 | `desconhecido` | vermelho — não é deste evento |
| 2 | `setor_nao_autorizado` | **laranja** — "é VIP, este aparelho lê PISTA" |
| 3 | `fora_da_janela` | o setor abre às 20h / fechou às 2h |
| 4 | `bloqueado` | vermelho, **com o motivo em corpo grande** |
| 5 | `ja_entrou` | só onde `tipo_uso = unico` |
| 6 | permitido | verde, setor e número |

Casando em mais de um setor autorizado — o mesmo `0001` do VIP e do Camarote —, o aparelho
**pergunta qual**, mostrando só os que casaram.

**Recusa é recusa.** Decisão do usuário em 15/08/2026: não existe "deixar entrar mesmo
assim". Quem for recusado procura o dono do evento.

Cada leitura entra numa fila no IndexedDB **antes** de a tela mudar de cor, e só sai de lá
depois que o servidor confirmou. O reenvio da fila inteira não duplica nada, porque a chave
`(dispositivo_id, id_local)` existe no esquema desde 13/08 exatamente para isso. **Leitura
negada também sobe** — é ela que responde "por que a fila parou às 22h".

Os três endpoints são `POST /api/acesso/portaria/entrar`, `GET .../faixa?desde=` e
`POST .../leituras`, em `acesso_portaria.py`. Arquivo separado do `acesso_config.py` porque
quem entra ali é outra pessoa: lá é o dono, com a conta do Vibe e a senha; aqui é o porteiro,
com um celular que pode estar offline há horas.
```

- [ ] **Step 2: Atualizar o cabeçalho e o "o que falta"**

No `controle_acesso.md`, linha 7, trocar por:

```markdown
Estado em 15/08/2026: **partes 2, 3a e 3b no ar**. A parte 3c — painel ao vivo e
relatórios — ainda não começou.
```

E, na seção final, deixar como pendente da 3c apenas: painel ao vivo, relatórios, cancelar
credencial, desvincular pedido, reativar aparelho revogado, limpeza dos setores órfãos.

- [ ] **Step 3: Atualizar o `STATUS_PROJETO.md`**

Trocar `### ⏳ Parte 3b — a portaria (**não começou**)` por `### ✅ Parte 3b — a portaria`,
com um resumo de três linhas e o link para a spec.

- [ ] **Step 4: Rodar a guarda da documentação**

Run: `venv/Scripts/python.exe -m pytest tests/test_documentacao_do_acesso.py -q`
Expected: PASS, 5 testes (os links novos precisam apontar para arquivos que existem).

- [ ] **Step 5: Rodar a suíte inteira e commitar**

Run: `venv/Scripts/python.exe -m pytest tests/ -q` — Expected: 593 passed.

```bash
git add docs/controle_acesso.md docs/STATUS_PROJETO.md
git commit -m "docs: a parte 3b existe

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Depois do plano: o que só o usuário pode fazer

1. **Publicar**, com o agente na mesma leva:
   ```powershell
   .\publicar.ps1 "A portaria le ingresso"
   .\publicar_agente.ps1 1.2.82
   ```
2. **Testar com um celular de verdade**, que é a única prova que vale: parear, desligar o
   Wi-Fi e os dados, ler um ingresso do pedido 18560 (modelo 1000110 tem QR Ideal), conferir
   o verde, e religar a rede para ver a fila esvaziar.
3. **Ler um ingresso do modelo 1000107 (VIP) num aparelho configurado só para PISTA** — é o
   caso que prova a regra 2, o mais importante da tela.

## Autorrevisão do plano

**Cobertura da spec:** pareamento (Task 3+4), carga paginada (3+4), seis regras (1), ordem
das regras (1), ambiguidade (1+4), fila e idempotência (2+3+4), abrir sem rede (5), câmera
com reserva (5), digitar o número (4), QR de pareamento na tela do dono (6), sem escape na
recusa (4+6), documentação (7). Os riscos aceitos da spec estão registrados em comentário no
código que os carrega (`_FALHAS` no `acesso_portaria.py`; a duplicidade entre aparelhos no
`portaria-validacao.js`).

**Sem marcadores:** todos os passos de código trazem o código; nenhum "TBD" ou "similar à
Task N".

**Consistência de nomes:** `saisParaTentar` e `decidir` (Task 1) são chamadas com esses
nomes na Task 4; `gravarCarga`/`lerCarga`/`enfileirar`/`lerFila`/`removerDaFila`/
`contarFila`/`entradasPermitidas`/`limpar` (Task 2) idem; `_entrar`/`_faixa`/`_leituras`/
`_aparelho_do_token`/`POR_PAGINA`/`_FALHAS` (Task 3) são os nomes que o teste da própria
Task 3 usa; `window.portariaCamera.ligar` (Task 5) é chamado pela Task 4 sempre atrás de
`if (window.portariaCamera)`, então a ordem das duas tasks não quebra nada.

**Nomes conferidos no código antes de escrever o plano**, e não supostos:
`window.renderQRCodeOnCtx` existe em `frontend/qr-canvas.js:208` com a assinatura
`(ctx, text, x, y, sz, color, bgColor)`; `controle.html` **não** carregava biblioteca de QR
nenhuma, e por isso a Task 6 acrescenta os dois `<script>`; `qr_ideal.hash_codigo(conteudo,
sal)` e `window.qrIdealHash(conteudo, sal)` são o par que `tests/test_qr_ideal_hash.py` já
prova equivalente; `TIPOS_DE_USO = ("unico", "reentrada")` está em `acesso_config.py:241`; a
chave `uq_acesso_leitura_do_aparelho UNIQUE (dispositivo_id, id_local)` está em
`sql/schema_acesso.sql`.

**Contagem de testes ao longo do plano:** 548 hoje → 565 (Task 1) → 574 (Task 2) → 588
(Task 3) → 593 (Task 6). As Tasks 4, 5 e 7 não acrescentam teste; a 4 e a 5 são cobertas
pelas guardas de fonte da 6 e pelo teste no celular, que só o usuário pode fazer.
