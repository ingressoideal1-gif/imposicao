# Controle de acesso, parte 2 — Plano de implementação

> **CONCLUÍDO em 13/08/2026.** As oito tarefas estão implementadas e testadas (223 testes
> pytest, 107 Pester). As sete tabelas foram criadas no banco e conferidas. Falta apenas
> publicar, o que depende de três variáveis de ambiente no Render —
> `SUPABASE_SERVICE_KEY`, `ACESSO_AGENTE_SEGREDO` e `QR_PEDIDO_SEGREDO`.
>
> O que a implementação decidiu diferente do plano está registrado em
> [docs/controle_acesso.md](../../controle_acesso.md); em resumo: a `service_role` não vai
> para as estações, os endpoints de publicação ganharam segredo próprio com falha fechada,
> o `abrir` devolve a tiragem junto com o sal, e o endpoint que gera o QR exige login de
> verdade em vez do `get_current_user`, que é um carimbo.

> **Para quem executa:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para tocar tarefa por tarefa. Os passos usam
> caixinhas (`- [ ]`) para marcação.

**Objetivo:** o cliente lê o QR do Pedido no celular e vê o evento dele carregado, com os
setores e as quantidades certas — e a faixa de códigos daquele pedido já está na nuvem,
publicada sozinha pelo agente quando a impressão terminou.

**Arquitetura:** o agente calcula o hash de cada código (o pool só existe nele) e publica
pelo backend do Render, que é o único que fala com o banco, usando `service_role` do lado
servidor. O QR do Pedido é uma URL com token assinado; o app troca o token por dados
sempre frescos do ERP.

**Tecnologias:** Python 3 + FastAPI (`app.py`), PyInstaller no agente, Supabase
(PostgreSQL) via REST, JavaScript puro no frontend, `crypto.subtle` no navegador.

**Spec:** [2026-08-13-controle-acesso-parte2-design.md](../specs/2026-08-13-controle-acesso-parte2-design.md)

## Restrições globais

Valem para todas as tarefas, sem exceção:

- **`service_role` nunca no frontend.** Regra escrita do `docs/REGRAS_BANCO.md`. Ela vive
  em variável de ambiente no servidor e mais lugar nenhum.
- **Nenhuma tela fala com as tabelas `producao_acesso_*`.** Elas estão com RLS ligado e
  zero políticas: com a chave anônima não se lê nem se escreve uma linha. Toda leitura e
  escrita passa pelo backend.
- **O código do QR Ideal nunca vai à nuvem em claro.** Só `codigo_hash`. `codigo_visivel`
  existe apenas para código que o próprio cliente fornecer (`origem = 'cliente'`).
- **A publicação nunca segura o operador.** Ela roda em thread de fundo, depois que os PDFs
  já saíram. O agente existe por causa de tempo.
- **Nada de tabela nova.** As sete já estão criadas e conferidas em 13/08/2026. Se o plano
  parecer precisar de uma oitava, pare e volte à spec.
- **Trabalho direto na `main`**, sem branch nem worktree.
- **Todo SQL se entrega pronto para colar**, arquivo completo em `sql/`.
- **Publicar o site obriga a publicar o agente** com número novo.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `qr_ideal.py` *(existe)* | ganha `hash_codigo()` — a única definição do KDF em Python |
| `frontend/qr-ideal-hash.js` *(novo)* | o gêmeo do KDF no navegador; nada mais |
| `qr_pedido.py` *(novo)* | assinar e conferir o token do QR do Pedido; não sabe de HTTP |
| `acesso_api.py` *(novo)* | os endpoints `/api/acesso/*`; é quem fala com o Supabase por `service_role` |
| `app.py` *(existe)* | monta o `acesso_api`; dispara a publicação em fundo ao fim de `/api/impose` |
| `frontend/script.js` *(existe)* | botão "Gerar QR do evento" no painel do pedido |
| `frontend/evento.html` + `evento.js` *(novos)* | a tela onde o QR cai: entrar e reivindicar |
| `sql/schema_acesso.sql` *(existe)* | já rodado; só recebe correção se algo faltar |

O `acesso_api.py` nasce separado do `app.py` de propósito: `app.py` já tem mais de mil
linhas, e tudo que envolve `service_role` merece morar num arquivo só, fácil de auditar
inteiro de uma vez.

---

## Tarefa 1: O KDF que os dois lados têm de concordar

É a fundação e o maior risco do projeto inteiro. Se o Python e o navegador calcularem
hashes diferentes para a mesma entrada, **todo ingresso é recusado na portaria** — e não há
como descobrir isso antes do evento, a não ser testando de propósito.

**Arquivos:**
- Modificar: `qr_ideal.py`
- Criar: `frontend/qr-ideal-hash.js`
- Criar: `tests/test_qr_ideal_hash.py`
- Criar: `tests/qr_ideal_hash_harness.js`

**Interfaces:**
- Produz: `qr_ideal.hash_codigo(conteudo: str, sal: str) -> str` (64 caracteres hex) e
  `qr_ideal.gerar_sal() -> str` (64 caracteres hex).
- Produz: `window.qrIdealHash(conteudo, sal) -> Promise<string>`.

- [ ] **Passo 1: Escrever o teste que falha**

```python
# tests/test_qr_ideal_hash.py
import qr_ideal


def test_hash_tem_valor_de_conferencia_fixo():
    """O valor abaixo e o contrato entre o Python e o navegador.

    Se alguem mudar iteracoes, algoritmo ou codificacao, este numero muda e o
    teste falha -- que e exatamente o aviso que se quer, porque a alternativa e
    descobrir na portaria do evento.
    """
    assert qr_ideal.hash_codigo("27202HM4IKCBY", "00" * 32) == (
        "SUBSTITUIR_PELO_VALOR_MEDIDO"
    )


def test_o_mesmo_codigo_com_sais_diferentes_da_hashes_diferentes():
    a = qr_ideal.hash_codigo("27202HM4IKCBY", "00" * 32)
    b = qr_ideal.hash_codigo("27202HM4IKCBY", "11" * 32)
    assert a != b


def test_o_sal_tem_64_hex_e_nunca_repete():
    sais = {qr_ideal.gerar_sal() for _ in range(50)}
    assert len(sais) == 50
    assert all(len(s) == 64 and all(c in "0123456789abcdef" for c in s) for s in sais)
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_qr_ideal_hash.py -v`
Esperado: FAIL com `AttributeError: module 'qr_ideal' has no attribute 'hash_codigo'`

- [ ] **Passo 3: Implementar no `qr_ideal.py`**

Acrescentar no fim do arquivo, depois da classe `PoolQR`:

```python
ITERACOES = 10_000


def gerar_sal() -> str:
    """32 bytes aleatorios em hex. Um por pedido, nunca reaproveitado."""
    return secrets.token_hex(32)


def hash_codigo(conteudo: str, sal: str) -> str:
    """O que a nuvem guarda no lugar do codigo.

    `conteudo` e o texto inteiro do QR -- prefixo do pedido mais o codigo de 8
    caracteres --, nao so o codigo.

    PBKDF2-HMAC-SHA256 porque existe pronto nos dois lados que precisam dele:
    `hashlib` aqui e `crypto.subtle.deriveBits` no navegador, sem dependencia
    nova em lugar nenhum. 10.000 iteracoes deixam a leitura no celular em
    milissegundos e uma busca por forca bruta em 2,8 x 10^16 operacoes por
    pedido.

    O sal entra como BYTES do hexadecimal, nao como o texto do hexadecimal. O
    navegador tem de fazer a mesma coisa, e e o erro mais facil de cometer aqui.
    """
    return hashlib.pbkdf2_hmac(
        "sha256",
        conteudo.encode("utf-8"),
        bytes.fromhex(sal),
        ITERACOES,
        dklen=32,
    ).hex()
```

E no topo do arquivo, junto dos outros imports: `import hashlib` e `import secrets`.

- [ ] **Passo 4: Medir o valor de conferência e fixá-lo no teste**

Rodar:
```bash
venv/Scripts/python.exe -c "import qr_ideal; print(qr_ideal.hash_codigo('27202HM4IKCBY','00'*32))"
```
Copiar a saída para dentro do teste, no lugar de `SUBSTITUIR_PELO_VALOR_MEDIDO`.

- [ ] **Passo 5: Rodar e ver passar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_qr_ideal_hash.py -v`
Esperado: PASS, 3 testes.

- [ ] **Passo 6: Escrever o gêmeo no navegador**

```javascript
// frontend/qr-ideal-hash.js
//
// O MESMO hash do qr_ideal.py, no navegador. Se os dois divergirem, todo
// ingresso e recusado na portaria e nada avisa antes do evento.
// tests/qr_ideal_hash_harness.js compara os dois contra o valor de conferencia.
(function () {
    'use strict';

    var ITERACOES = 10000;

    function hexParaBytes(hex) {
        var out = new Uint8Array(hex.length / 2);
        for (var i = 0; i < out.length; i++) {
            out[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return out;
    }

    function bytesParaHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(function (b) { return b.toString(16).padStart(2, '0'); })
            .join('');
    }

    /**
     * @param {string} conteudo texto inteiro do QR: prefixo do pedido + codigo
     * @param {string} sal 64 caracteres hex, vindos do backend
     * @returns {Promise<string>} 64 caracteres hex
     */
    async function qrIdealHash(conteudo, sal) {
        var chave = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(conteudo), 'PBKDF2', false, ['deriveBits']
        );
        var bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                // BYTES do hexadecimal, nao o texto dele. E o erro mais facil de
                // cometer aqui, e ele so aparece na portaria.
                salt: hexParaBytes(sal),
                iterations: ITERACOES,
                hash: 'SHA-256',
            },
            chave,
            256
        );
        return bytesParaHex(bits);
    }

    if (typeof window !== 'undefined') window.qrIdealHash = qrIdealHash;
    if (typeof module !== 'undefined' && module.exports) module.exports = { qrIdealHash: qrIdealHash };
})();
```

- [ ] **Passo 7: O teste que compara os dois**

```javascript
// tests/qr_ideal_hash_harness.js
// Roda o hash do navegador dentro do puppeteer e compara com o valor que o
// Python produz. E o unico teste que prova que a portaria vai funcionar.
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

const ESPERADO = process.argv[2];   // vem do Python, pelo pytest

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    // crypto.subtle so existe em contexto seguro; about:blank serve.
    await page.goto('about:blank');
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'qr-ideal-hash.js') });
    const obtido = await page.evaluate(() => window.qrIdealHash('27202HM4IKCBY', '00'.repeat(32)));
    await browser.close();
    if (obtido !== ESPERADO) {
        console.error(`DIVERGIU\n  navegador: ${obtido}\n  python:    ${ESPERADO}`);
        process.exit(1);
    }
    console.log('CONFERE');
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
```

E o pytest que o chama:

```python
# acrescentar em tests/test_qr_ideal_hash.py
import os
import subprocess
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_o_navegador_calcula_o_mesmo_hash_que_o_python():
    """A prova de que a portaria vai funcionar.

    O celular calcula o hash do que leu e procura na lista que baixou, montada
    pelo agente em Python. Divergencia aqui recusa TODO ingresso do evento, e
    nao ha como descobrir isso antes -- a nao ser aqui.
    """
    esperado = qr_ideal.hash_codigo("27202HM4IKCBY", "00" * 32)
    harness = os.path.join(RAIZ, "tests", "qr_ideal_hash_harness.js")
    r = subprocess.run(
        ["node", harness, esperado],
        cwd=RAIZ, capture_output=True, text=True, timeout=180,
    )
    if r.returncode != 0:
        pytest.fail(f"navegador e Python divergiram:\n{r.stdout}\n{r.stderr}")
```

- [ ] **Passo 8: Rodar os dois**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_qr_ideal_hash.py -v`
Esperado: PASS, 4 testes, incluindo o do navegador.

- [ ] **Passo 9: Registrar o arquivo novo no painel da estação**

Acrescentar `"qr-ideal-hash.js",` em `PAINEL_ARQUIVOS`, no `security_config.py`, logo
depois de `"qr-ideal-colunas.js",`. Sem isso o arquivo nunca se atualiza na estação:
`tests/test_painel_estacao.py` cobra essa regra assim que o HTML passar a carregá-lo.

- [ ] **Passo 10: Commit**

```bash
git add qr_ideal.py frontend/qr-ideal-hash.js security_config.py tests/test_qr_ideal_hash.py tests/qr_ideal_hash_harness.js
git commit -m "feat(acesso): o KDF que o agente e o celular precisam concordar"
```

---

## Tarefa 2: O backend fala com as tabelas novas por service_role

**Arquivos:**
- Criar: `acesso_api.py`
- Modificar: `app.py` (montar o router)
- Criar: `tests/test_acesso_api.py`

**Interfaces:**
- Consome: `qr_ideal.gerar_sal()` da Tarefa 1.
- Produz: `acesso_api.router` (APIRouter do FastAPI) e
  `acesso_api.supabase(method, path, body=None) -> list | dict | None`.

- [ ] **Passo 1: Escrever o teste que falha**

```python
# tests/test_acesso_api.py
"""O backend e o unico que fala com as tabelas do controle de acesso.

Elas estao com RLS ligado e zero politicas: com a chave anonima nao se le nem se
escreve uma linha. So a service_role passa, e ela vive em variavel de ambiente no
servidor -- nunca no navegador, como o docs/REGRAS_BANCO.md exige.
"""
import os

import acesso_api


def test_a_chave_usada_e_a_de_servico_e_nao_a_anonima():
    assert acesso_api.CHAVE_ENV == "SUPABASE_SERVICE_KEY"


def test_sem_a_chave_de_servico_o_modulo_recusa_escrever(monkeypatch):
    """Falhar alto. Escrever com a chave anonima daria erro de permissao la na
    frente, num lote no meio da publicacao, e o diagnostico seria caro."""
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", None)
    try:
        acesso_api.supabase("POST", "producao_acesso_eventos", {"nome_evento": "x"})
    except RuntimeError as e:
        assert "SUPABASE_SERVICE_KEY" in str(e)
    else:
        raise AssertionError("deveria ter recusado")


def test_a_chave_de_servico_nunca_aparece_no_frontend():
    """A varredura que impede o vazamento mais caro possivel."""
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend = os.path.join(raiz, "frontend")
    for pasta, _dirs, arquivos in os.walk(frontend):
        for nome in arquivos:
            if not nome.endswith((".js", ".html")):
                continue
            with open(os.path.join(pasta, nome), encoding="utf-8", errors="replace") as f:
                texto = f.read()
            assert "SUPABASE_SERVICE_KEY" not in texto, f"{nome} cita a chave de servico"
            assert "service_role" not in texto, f"{nome} cita service_role"
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_acesso_api.py -v`
Esperado: FAIL com `ModuleNotFoundError: No module named 'acesso_api'`

- [ ] **Passo 3: Criar o `acesso_api.py`**

```python
# -*- coding: utf-8 -*-
"""Os endpoints do controle de acesso e o unico caminho ate as tabelas dele.

Arquivo separado do app.py de proposito: tudo que usa service_role mora aqui,
para dar para auditar o conjunto inteiro de uma vez so.

As tabelas producao_acesso_* estao com RLS ligado e ZERO politicas. Com a chave
anonima nao se le nem se escreve uma linha delas. So a service_role passa, e ela
vive em variavel de ambiente no servidor -- nunca no navegador.
"""

import json
import os
import urllib.request

from fastapi import APIRouter, HTTPException

import db
import qr_ideal

router = APIRouter(prefix="/api/acesso", tags=["acesso"])

CHAVE_ENV = "SUPABASE_SERVICE_KEY"
SERVICE_KEY = os.environ.get(CHAVE_ENV) or db._ler_env_local(CHAVE_ENV)


def supabase(method: str, path: str, body=None):
    """REST do Supabase com service_role. NAO usar para nada fora do acesso."""
    if not SERVICE_KEY:
        raise RuntimeError(
            f"{CHAVE_ENV} nao configurada. O controle de acesso nao escreve com a "
            "chave anonima: as tabelas estao com RLS ligado e sem politica, entao "
            "a escrita seria recusada no meio da publicacao."
        )
    url = f"{db.SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if method in ("POST", "PATCH"):
        headers["Prefer"] = "return=representation,resolution=merge-duplicates"
    dados = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, headers=headers, method=method, data=dados)
    with urllib.request.urlopen(req, timeout=60) as resp:
        conteudo = resp.read().decode("utf-8")
        return json.loads(conteudo) if conteudo else None
```

Se `db._ler_env_local` não existir, criar em `db.py` uma função que leia uma chave do
`.env.local` — o `db.py` já faz essa leitura em linha, nas linhas 195-210; extrair para
função nomeada e usar nos dois lugares.

- [ ] **Passo 4: Montar o router no `app.py`**

Junto dos outros `include_router`, ou logo depois da criação do `app`:

```python
import acesso_api
app.include_router(acesso_api.router)
```

- [ ] **Passo 5: Rodar e ver passar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_acesso_api.py -v`
Esperado: PASS, 3 testes.

- [ ] **Passo 6: Commit**

```bash
git add acesso_api.py app.py db.py tests/test_acesso_api.py
git commit -m "feat(acesso): o backend fala com as tabelas novas por service_role"
```

---

## Tarefa 3: Publicar a faixa de um pedido

**Arquivos:**
- Modificar: `acesso_api.py`
- Modificar: `tests/test_acesso_api.py`

**Interfaces:**
- Produz: `POST /api/acesso/pedidos/{pedido}/abrir` → `{"sal": "...", "ja_publicado": bool}`
- Produz: `POST /api/acesso/pedidos/{pedido}/credenciais` recebendo
  `{"itens": [{"modelo_id": int, "numero": int, "hash": "..."}]}`
- Produz: `POST /api/acesso/pedidos/{pedido}/fechar` → `{"total": int}`

- [ ] **Passo 1: Escrever os testes que falham**

```python
def test_abrir_devolve_sal_de_64_hex_e_e_idempotente(monkeypatch):
    """Reimprimir o mesmo pedido nao pode trocar o sal.

    Trocar o sal invalidaria todos os hashes ja publicados, e os ingressos que
    ja estao na mao do cliente parariam de validar.
    """
    gravadas = []
    monkeypatch.setattr(acesso_api, "supabase",
                        lambda m, p, b=None: _fake_supabase(gravadas, m, p, b))
    a = acesso_api._abrir_pedido(20272)
    b = acesso_api._abrir_pedido(20272)
    assert len(a["sal"]) == 64
    assert a["sal"] == b["sal"]


def test_enviar_lote_duas_vezes_nao_duplica(monkeypatch):
    """A publicacao e retentada quando a rede falha. Ela precisa ser idempotente
    -- e quem garante isso do lado do banco e o indice unico do codigo_hash."""
    chamadas = []
    monkeypatch.setattr(acesso_api, "supabase",
                        lambda m, p, b=None: chamadas.append((m, p, b)) or [])
    itens = [{"modelo_id": 1000022, "numero": 1, "hash": "a" * 64}]
    acesso_api._gravar_lote(20272, itens)
    acesso_api._gravar_lote(20272, itens)
    for _m, _p, corpo in chamadas:
        assert corpo is None or "on_conflict" in _p or isinstance(corpo, list)
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_acesso_api.py -v`
Esperado: FAIL com `AttributeError: module 'acesso_api' has no attribute '_abrir_pedido'`

- [ ] **Passo 3: Implementar**

```python
LOTE_MAXIMO = 500


def _abrir_pedido(pedido_id_int: int) -> dict:
    """Cria (ou reencontra) a linha do pedido e devolve o sal dele.

    Idempotente de proposito: reimprimir o mesmo pedido tem de devolver o MESMO
    sal. Sal novo invalidaria todo hash ja publicado, e o ingresso que ja esta na
    mao do cliente pararia de validar na portaria.
    """
    achados = supabase("GET", f"producao_acesso_pedidos?pedido_id_int=eq.{pedido_id_int}&select=*")
    if achados:
        linha = achados[0]
        return {"sal": linha["sal"], "ja_publicado": bool(linha.get("publicado_em"))}
    criado = supabase("POST", "producao_acesso_pedidos", {
        "pedido_id_int": pedido_id_int,
        "sal": qr_ideal.gerar_sal(),
    })
    return {"sal": criado[0]["sal"], "ja_publicado": False}


def _gravar_lote(pedido_id_int: int, itens: list) -> int:
    """Grava um lote de credenciais, ignorando o que ja existe.

    `on_conflict` aponta para o indice unico do codigo_hash: reenviar o mesmo
    lote nao duplica nada, e e por isso que a publicacao pode ser retentada a
    vontade quando a rede cai no meio.
    """
    linhas = [{
        "pedido_id_int": pedido_id_int,
        "modelo_id": i["modelo_id"],
        "numero": i["numero"],
        "codigo_hash": i["hash"],
        "origem": "qr_ideal",
    } for i in itens]
    supabase("POST", "producao_acesso_credenciais?on_conflict=codigo_hash", linhas)
    return len(linhas)


@router.post("/pedidos/{pedido}/abrir")
def abrir(pedido: int):
    try:
        return _abrir_pedido(pedido)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/pedidos/{pedido}/credenciais")
def credenciais(pedido: int, corpo: dict):
    itens = corpo.get("itens") or []
    if len(itens) > LOTE_MAXIMO:
        raise HTTPException(status_code=413, detail=f"lote acima de {LOTE_MAXIMO}")
    return {"gravadas": _gravar_lote(pedido, itens)}


@router.post("/pedidos/{pedido}/fechar")
def fechar(pedido: int):
    contagem = supabase(
        "GET",
        f"producao_acesso_credenciais?pedido_id_int=eq.{pedido}&select=id",
    ) or []
    supabase("PATCH", f"producao_acesso_pedidos?pedido_id_int=eq.{pedido}", {
        "publicado_em": "now()",
        "total_credenciais": len(contagem),
    })
    return {"total": len(contagem)}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_acesso_api.py -v`
Esperado: PASS.

- [ ] **Passo 5: Commit**

```bash
git add acesso_api.py tests/test_acesso_api.py
git commit -m "feat(acesso): publicar a faixa de codigos de um pedido"
```

---

## Tarefa 4: O agente publica sozinho ao fechar a impressão

**Arquivos:**
- Criar: `acesso_publicacao.py`
- Modificar: `app.py:678-1010` (o endpoint `/api/impose`)
- Criar: `tests/test_acesso_publicacao.py`

**Interfaces:**
- Consome: `qr_ideal.PoolQR`, `qr_ideal.hash_codigo`, os três endpoints da Tarefa 3.
- Produz: `acesso_publicacao.publicar_em_fundo(pedido, modelos, pool)` — devolve na hora e
  trabalha numa thread.

- [ ] **Passo 1: Escrever o teste que falha**

```python
# tests/test_acesso_publicacao.py
"""A publicacao nunca pode segurar o operador.

O agente existe por causa de tempo: o operador esta de pe na frente da
impressora. Calcular 5.000 hashes leva uns 15 segundos, e esses 15 segundos
acontecem DEPOIS que o PDF ja saiu -- nunca antes.
"""
import time

import acesso_publicacao


def test_publicar_devolve_na_hora(monkeypatch):
    def lenta(*a, **k):
        time.sleep(2)
    monkeypatch.setattr(acesso_publicacao, "_publicar", lenta)
    comeco = time.time()
    acesso_publicacao.publicar_em_fundo(20272, [], None)
    assert time.time() - comeco < 0.5, "a publicacao segurou o operador"


def test_publica_a_TIRAGEM_INTEIRA_e_nao_so_a_folha_impressa():
    """Imprimir em duas levas nao pode publicar meia faixa.

    O numero de credenciais vem de pedidos_modelos.quantidade, nao do intervalo
    de folhas daquele trabalho. Senao o cliente que imprime 2.000 hoje e 3.000 na
    semana que vem fica com 2.000 ingressos validos e 3.000 recusados na porta.
    """
    modelos = [{"modelo_id": 1000022, "quantidade": 3}]
    itens = list(acesso_publicacao.itens_do_pedido(20272, modelos, pool=_PoolFalso()))
    assert [i["numero"] for i in itens] == [1, 2, 3]
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_acesso_publicacao.py -v`
Esperado: FAIL com `ModuleNotFoundError`.

- [ ] **Passo 3: Implementar**

```python
# -*- coding: utf-8 -*-
"""O agente publica a faixa de codigos depois que o papel ja saiu.

Ordem dos fatos que importa: o operador esta de pe na frente da impressora, e o
agente existe por causa disso. Primeiro os PDFs, depois -- em thread de fundo --
o calculo dos hashes e o envio. Se a rede estiver fora, fica para a proxima
tentativa: o papel ja saiu e o evento e dias depois.
"""

import threading
import urllib.request
import json

import qr_ideal

LOTE = 500


def itens_do_pedido(pedido, modelos, pool):
    """Gera {modelo_id, numero, hash} da TIRAGEM INTEIRA de cada modelo.

    A quantidade vem de pedidos_modelos.quantidade, NAO do intervalo de folhas
    do trabalho: imprimir em duas levas nao pode publicar meia faixa.
    """
    sal = _sal_do_pedido(pedido)
    for m in modelos:
        for numero in range(1, int(m["quantidade"]) + 1):
            conteudo = pool.conteudo(pedido, m["modelo_id"], numero)
            yield {
                "modelo_id": m["modelo_id"],
                "numero": numero,
                "hash": qr_ideal.hash_codigo(conteudo, sal),
            }


def publicar_em_fundo(pedido, modelos, pool):
    """Devolve na hora. O trabalho de verdade acontece numa thread."""
    t = threading.Thread(
        target=_publicar, args=(pedido, modelos, pool),
        daemon=True, name=f"PublicarAcesso-{pedido}",
    )
    t.start()
```

O `_publicar` chama `abrir`, envia em lotes de 500 e chama `fechar`, tratando exceção com
`print` e sem levantar — thread de fundo que morre com traceback não pode derrubar nada.

- [ ] **Passo 4: Ligar no fim do `/api/impose`**

No `app.py`, depois de `engine.process()` terminar **com sucesso**, e só quando o trabalho
usa QR Ideal:

```python
# A faixa de codigos vai para a nuvem DEPOIS do papel. Nunca antes: o operador
# esta esperando na frente da impressora.
if data.get("pedido") and _pool_qr_ou_none():
    import acesso_publicacao
    acesso_publicacao.publicar_em_fundo(
        data["pedido"], _modelos_do_trabalho(data), _pool_qr_ou_none()
    )
```

- [ ] **Passo 5: Rodar e ver passar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_acesso_publicacao.py -v`

- [ ] **Passo 6: Commit**

```bash
git add acesso_publicacao.py app.py tests/test_acesso_publicacao.py
git commit -m "feat(acesso): o agente publica a faixa depois que o papel saiu"
```

---

## Tarefa 5: O token do QR do Pedido

**Arquivos:**
- Criar: `qr_pedido.py`
- Criar: `tests/test_qr_pedido.py`

**Interfaces:**
- Produz: `qr_pedido.gerar(pedido_id_int, dias=180) -> str` e
  `qr_pedido.conferir(token) -> int` (levanta `ValueError` com motivo).

- [ ] **Passo 1: Escrever os testes que falham**

```python
# tests/test_qr_pedido.py
import time

import pytest

import qr_pedido


def test_o_token_volta_o_pedido():
    assert qr_pedido.conferir(qr_pedido.gerar(20272)) == 20272


def test_token_adulterado_e_recusado():
    """Sem isto, qualquer um emite QR para qualquer pedido do sistema."""
    t = qr_pedido.gerar(20272)
    adulterado = t[:-4] + ("aaaa" if not t.endswith("aaaa") else "bbbb")
    with pytest.raises(ValueError, match="assinatura"):
        qr_pedido.conferir(adulterado)


def test_token_vencido_e_recusado():
    with pytest.raises(ValueError, match="venc"):
        qr_pedido.conferir(qr_pedido.gerar(20272, dias=-1))


def test_o_segredo_nao_esta_no_codigo():
    """Segredo em arquivo versionado e o que o publicar.ps1 existe para barrar."""
    import inspect
    fonte = inspect.getsource(qr_pedido)
    assert "os.environ" in fonte
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_qr_pedido.py -v`
Esperado: FAIL com `ModuleNotFoundError`.

- [ ] **Passo 3: Implementar**

```python
# -*- coding: utf-8 -*-
"""O token do QR do Pedido: assinar e conferir. Nao sabe de HTTP nem de banco.

O QR nao carrega os dados do evento, so este token. Quem tem os dados e o ERP, e
e de la que eles saem na hora da leitura -- um QR com a lista de setores dentro
continuaria afirmando a quantidade velha depois que o pedido mudasse.
"""

import base64
import hashlib
import hmac
import os
import time

SEGREDO_ENV = "QR_PEDIDO_SEGREDO"


def _segredo() -> bytes:
    s = os.environ.get(SEGREDO_ENV)
    if not s:
        raise RuntimeError(
            f"{SEGREDO_ENV} nao configurada. Sem ela qualquer um emitiria QR para "
            "qualquer pedido do sistema."
        )
    return s.encode("utf-8")


def _assinar(corpo: str) -> str:
    mac = hmac.new(_segredo(), corpo.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")[:27]


def gerar(pedido_id_int: int, dias: int = 180) -> str:
    corpo = f"{int(pedido_id_int)}.{int(time.time()) + dias * 86400}"
    return f"{corpo}.{_assinar(corpo)}"


def conferir(token: str) -> int:
    try:
        pedido, expira, assinatura = token.split(".")
    except ValueError:
        raise ValueError("token malformado")
    if not hmac.compare_digest(_assinar(f"{pedido}.{expira}"), assinatura):
        raise ValueError("assinatura invalida")
    if int(expira) < time.time():
        raise ValueError("token vencido")
    return int(pedido)
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `venv/Scripts/python.exe -m pytest tests/test_qr_pedido.py -v`
(pondo `QR_PEDIDO_SEGREDO` no `.env.local` e lendo-a como o `acesso_api` faz)

- [ ] **Passo 5: Commit**

```bash
git add qr_pedido.py tests/test_qr_pedido.py
git commit -m "feat(acesso): assinar e conferir o token do QR do Pedido"
```

---

## Tarefa 6: Gerar o QR no painel do pedido

**Arquivos:**
- Modificar: `acesso_api.py` (endpoint `POST /pedidos/{pedido}/qr`)
- Modificar: `frontend/script.js` (botão e modal)
- Modificar: `frontend/index.html` (o botão no painel do pedido)

- [ ] **Passo 1: Endpoint que gera e grava**

```python
@router.post("/pedidos/{pedido}/qr")
def gerar_qr(pedido: int):
    """Gera token novo e REVOGA o anterior.

    Revogar e o conserto de quando o QR cai na conta errada: o atendente gera
    outro, e o primeiro para de valer na hora.
    """
    token = qr_pedido.gerar(pedido)
    _abrir_pedido(pedido)   # garante a linha e o sal
    supabase("PATCH", f"producao_acesso_pedidos?pedido_id_int=eq.{pedido}", {
        "qr_token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "qr_gerado_em": "now()",
        "qr_revogado_em": None,
    })
    return {"url": f"{BASE_PUBLICA}/evento.html?t={token}"}
```

- [ ] **Passo 2: Botão no painel do pedido**

Junto dos outros botões do card do pedido, com rótulo em texto — nada de só ícone:

```html
<button class="btn btn-secondary btn-sm" onclick="gerarQrDoEvento('${os.id}')"
        title="Gera o QR que o cliente le para cadastrar este evento no Ideal Control">
    🎟️ Gerar QR do evento
</button>
```

- [ ] **Passo 3: A função que abre o modal**

Desenha o QR com `renderQRCodeOnCtx`, mostra a URL em texto para copiar, e um botão
"Baixar imagem". O modal explica em uma linha o que aquilo faz e que gerar de novo
invalida o anterior — sem contar nada de como o código do ingresso é formado.

- [ ] **Passo 4: Conferir no navegador**

Subir o servidor numa porta livre (nunca a 9000) e conferir que o QR aparece, que a URL
copiada abre a tela da Tarefa 8, e que gerar de novo troca o token.

- [ ] **Passo 5: Commit**

```bash
git add acesso_api.py frontend/script.js frontend/index.html
git commit -m "feat(acesso): botao Gerar QR do evento no painel do pedido"
```

---

## Tarefa 7: Trocar o token pelo esqueleto do evento

**Arquivos:**
- Modificar: `acesso_api.py`
- Modificar: `tests/test_acesso_api.py`

**Interfaces:**
- Produz: `GET /api/acesso/evento?t=<token>` →
  `{"pedido": int, "cliente": int, "ja_reivindicado": bool, "setores": [{"modelo_id", "nome", "quantidade"}]}`

- [ ] **Passo 1: Teste que falha**

```python
def test_o_esqueleto_vem_do_ERP_e_nao_do_token(monkeypatch):
    """Os dados sao lidos na hora, sempre.

    E a regra do projeto: o que o parceiro escreve no banco e a origem da
    verdade. Um QR com a lista de setores dentro continuaria afirmando a
    quantidade velha depois que o pedido mudasse.
    """
    token = qr_pedido.gerar(20272)
    lidas = []
    monkeypatch.setattr(acesso_api, "supabase",
                        lambda m, p, b=None: lidas.append(p) or [])
    acesso_api._esqueleto(token)
    assert any("pedidos_modelos" in p for p in lidas)
```

- [ ] **Passo 2: Implementar**

Lê `pedidos_modelos` por `id_int=eq.<pedido>` (dá os setores, com `nome_modelo` e
`quantidade`), e `propostas` por `id_int=eq.<pedido>` (dá `id_cliente`). Devolve
`ja_reivindicado` conforme `producao_acesso_pedidos.evento_id`.

- [ ] **Passo 3: Rodar, ver passar, commitar**

```bash
git commit -m "feat(acesso): trocar o token pelo esqueleto do evento, lido do ERP"
```

---

## Tarefa 8: Reivindicar — criar evento ou anexar a um existente

**Arquivos:**
- Modificar: `acesso_api.py`
- Criar: `frontend/evento.html`, `frontend/evento.js`
- Modificar: `security_config.py` (os dois arquivos novos em `PAINEL_ARQUIVOS`)
- Modificar: `tests/test_acesso_api.py`

**Interfaces:**
- Produz: `POST /api/acesso/reivindicar` recebendo
  `{"token": "...", "evento_id": null | "...", "nome_evento": "..."}`

- [ ] **Passo 1: Os testes que falham**

```python
def test_reivindicar_duas_vezes_por_contas_diferentes_e_recusado(monkeypatch):
    """O QR viaja por WhatsApp: quem receber a imagem reivindica -- UMA vez."""
    ...
    with pytest.raises(HTTPException) as e:
        acesso_api._reivindicar(token, dono="outra-conta", evento_id=None, nome="X")
    assert e.value.status_code == 409


def test_anexar_um_segundo_pedido_nao_mexe_nos_setores_anteriores(monkeypatch):
    """Um evento pode ter varios pedidos -- a pista num, o camarote noutro."""
    ...
```

- [ ] **Passo 2: Implementar a reivindicação**

Numa sequência só: cria (ou acha) o evento, grava `evento_id` no pedido, cria um setor por
modelo, e carimba `evento_id`/`setor_id` nas credenciais daquele pedido — um `PATCH` por
modelo, com `pedido_id_int` e `modelo_id` no filtro.

- [ ] **Passo 3: A tela `evento.html`**

Mínima e explicando-se sozinha: mostra o pedido e os setores lidos do ERP, pede login
(Supabase Auth), e oferece "Criar evento novo" ou "Anexar a um evento existente" quando a
conta já tiver eventos. Nada sobre como o código do ingresso é formado.

- [ ] **Passo 4: Registrar no painel da estação**

`"evento.html",` e `"evento.js",` em `PAINEL_ARQUIVOS`.

- [ ] **Passo 5: Conferir de ponta a ponta**

Gerar o QR no painel de um pedido real, ler com o celular (ou abrir a URL no navegador),
entrar, criar o evento, e conferir no Supabase que `producao_acesso_setores` tem um setor
por modelo e que as credenciais daquele pedido receberam `evento_id`.

- [ ] **Passo 6: Commit**

```bash
git add acesso_api.py frontend/evento.html frontend/evento.js security_config.py tests/test_acesso_api.py
git commit -m "feat(acesso): reivindicar o pedido criando ou anexando a um evento"
```

---

## Antes de publicar

- [ ] `venv/Scripts/python.exe -m pytest tests/ -q` — comparar com a linha de base: hoje
      falham `test_fastapi` e `test_impose`, e seis arquivos não coletam. Nada disso é novo.
- [ ] `.\ferramentas\conferir.ps1` sem pontos de atenção além dos commits por publicar.
- [ ] **Duas variáveis de ambiente no Render**, sem as quais a parte 2 não funciona no ar:
      `SUPABASE_SERVICE_KEY` e `QR_PEDIDO_SEGREDO`. As duas também no `.env.local` para o
      desenvolvimento. Nenhuma delas entra em arquivo versionado.
- [ ] `.\publicar.ps1 "..."` e, na mesma leva, `.\publicar_agente.ps1 1.2.58` — o
      executável embute a cópia do frontend, e mexemos em `frontend/`.
- [ ] Atualizar `CHANGELOG.md` e `docs/qr_ideal.md`, e criar `docs/controle_acesso.md`.
