# Ideal Control — novo fluxo do aplicativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o `/ic/` numa lista de eventos onde um toque na barra vira o portão daquele evento, com toda a configuração recolhida atrás de uma engrenagem com senha e sem nenhum código de seis caracteres na tela.

**Architecture:** O `controle.js` (1.430 linhas, hoje faz lista + configuração) se parte em quatro arquivos com uma responsabilidade cada: `chaveiro.js` (puro, guarda os portões deste aparelho), `parede-pwa.js` (exige o aplicativo instalado), `lista-eventos.js` (a tela inicial) e `virar-portao.js` (criar portão e trocar de evento). O `controle.js` fica só com a engrenagem. No servidor, duas colunas novas em `producao_acesso_setores` e a coluna `status` do evento passam a ser configuráveis, e a portaria ganha duas recusas.

**Tech Stack:** JavaScript ES5 em IIFE (`(function () { 'use strict'; … })()`) sem framework e sem build, servido direto pela Vercel; Deno/TypeScript nas Edge Functions do Supabase; testes em pytest, sendo os de frontend um harness Node/puppeteer chamado pelo pytest; PowerShell nos scripts de publicação.

## Global Constraints

- **Português em tudo o que o usuário lê.** Rótulos, avisos, mensagens de erro, comentários e nomes de função. Sem exceção.
- **Nenhum arquivo de outra origem.** Estas telas precisam abrir sem rede; toda dependência é servida de `frontend/`. Nada de CDN.
- **ES5 em IIFE.** Sem `let`, `const`, arrow function, template string ou `class` nos arquivos de `frontend/`. É o padrão de todos os arquivos vizinhos e o que roda no navegador antigo de uma estação.
- **Texto, nunca HTML.** Nome de evento, de setor, de portão e motivo de bloqueio são escritos por pessoas: sempre `textContent`, nunca `innerHTML`.
- **A tela nunca explica o mecanismo do QR.** Proibidas as palavras `pbkdf2`, `pool`, `hash do codigo`, `sal do evento`, `iteracoes` em `frontend/controle.html` e nos JS da tela do dono — há teste que falha (`tests/test_controle_tela.py`).
- **Todo botão tem rótulo em texto.** Ícone sozinho não passa; há teste que falha.
- **A versão dos scripts é uma só por página.** Todo `?v=` de um mesmo HTML tem o mesmo número; há teste que falha. A versão desta leva é **613**.
- **Arquivo novo em `frontend/` que a tela do dono usa entra em `security_config.PAINEL_ARQUIVOS`.** Sem isso a estação da gráfica serve uma tela que referencia arquivo que ela não tem.
- **Rodar os testes:** `.\venv\Scripts\python.exe -m pytest tests/<arquivo> -v` a partir da raiz do repositório.
- **Publicar:** `.\publicar.ps1 "<mensagem>"` e, na mesma leva, `.\publicar_agente.ps1 <versão nova>`. Nunca `-SemFreio`.

---

### Task 1: As duas colunas de setor bloqueado, no banco

**Files:**
- Create: `sql/schema_acesso_setor_bloqueado.sql`
- Test: `tests/test_schema_acesso_setor_bloqueado.py`

**Interfaces:**
- Consumes: nada.
- Produces: as colunas `bloqueado BOOLEAN NOT NULL DEFAULT false` e `bloqueado_motivo TEXT` na tabela `producao_acesso_setores`. As Tasks 2, 3 e 4 dependem delas.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/test_schema_acesso_setor_bloqueado.py`:

```python
# -*- coding: utf-8 -*-
"""As colunas que bloqueiam um setor inteiro.

Bloquear FAIXA de numeros ja existia. Bloquear o setor inteiro e outra coisa:
o dono desliga a porta no meio do evento e escreve o motivo que o porteiro le
em voz alta.

Por que coluna nova, e nao a coluna `status` que ja existe: o painel do dono
filtra os setores por `status=eq.ativo`. Marcar o setor como bloqueado ali o
faria SUMIR da tela -- o dono bloquearia e perderia o botao de desbloquear.
"""

import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, "sql", "schema_acesso_setor_bloqueado.sql")


def _sql():
    with open(SQL, encoding="utf-8") as f:
        return f.read()


def test_o_arquivo_existe():
    assert os.path.exists(SQL)


def test_cria_as_duas_colunas_na_tabela_de_setores():
    texto = _sql().lower()
    assert "alter table producao_acesso_setores" in texto
    assert "bloqueado" in texto
    assert "bloqueado_motivo" in texto


def test_e_repetivel():
    """Rodar duas vezes no editor do Supabase nao pode quebrar nada."""
    assert "if not exists" in _sql().lower()


def test_o_padrao_e_desbloqueado():
    """Coluna nova nao pode desligar setor que ja esta trabalhando."""
    texto = _sql().lower()
    assert "default false" in texto


def test_nao_toca_na_coluna_status():
    """A razao de a coluna ser nova esta escrita no proprio arquivo."""
    corpo = "\n".join(
        l for l in _sql().splitlines() if not l.lstrip().startswith("--")
    ).lower()
    assert "status" not in corpo


def test_diz_como_desfazer():
    assert "desfazer" in _sql().lower()
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_schema_acesso_setor_bloqueado.py -v`
Expected: FAIL — `test_o_arquivo_existe` acusa que o arquivo não existe.

- [ ] **Step 3: Escrever o SQL**

Crie `sql/schema_acesso_setor_bloqueado.sql`. Ele sai **completo e pronto para colar** no editor do Supabase — é a regra deste projeto, e um SQL entregue em pedaços é um SQL colado pela metade:

```sql
-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — bloquear um SETOR inteiro
-- Prefixo: producao_acesso_
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-16
-- Spec: docs/superpowers/specs/2026-08-16-ideal-control-fluxo-pwa-design.md
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O QUE ESTE ARQUIVO FAZ
--
--   Acrescenta DUAS colunas a uma tabela que ja existe. Nao cria tabela, nao
--   apaga nada, nao mexe em linha nenhuma. Pode ser rodado mais de uma vez.
--
--   Supabase -> SQL Editor -> cole tudo -> Run. Leva menos de um segundo.
--
-- POR QUE ELE EXISTE
--
--   Ja dava para bloquear uma FAIXA DE NUMEROS dentro do setor (o lote que o
--   PDV nao pagou, por exemplo). Nao havia como desligar o setor INTEIRO -- e
--   e isso que o dono precisa quando decide, no meio do evento, que aquela
--   porta para de receber gente.
--
-- POR QUE COLUNA NOVA, E NAO A COLUNA `status` QUE JA EXISTE
--
--   O painel do dono le os setores com `status=eq.ativo`. Marcar o setor como
--   bloqueado naquela coluna o faria SUMIR da tela: o dono bloquearia o setor
--   e perderia o proprio botao de desbloquear, sem uma palavra que explicasse.
--
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE producao_acesso_setores
    -- `NOT NULL DEFAULT false` de proposito: a coluna nasce em tabela que ja
    -- tem setores trabalhando em evento de verdade, e nenhum deles pode
    -- acordar desligado por causa de uma migracao.
    ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN NOT NULL DEFAULT false,
    -- O motivo e o que o porteiro le em voz alta para a pessoa na fila. Sem
    -- ele, a recusa vira "nao sei, o sistema nao deixou".
    ADD COLUMN IF NOT EXISTS bloqueado_motivo TEXT;


-- ══════════════════════════════════════════════════════════════════════════════
-- COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
--
--   ALTER TABLE producao_acesso_setores
--       DROP COLUMN IF EXISTS bloqueado,
--       DROP COLUMN IF EXISTS bloqueado_motivo;
--
-- ══════════════════════════════════════════════════════════════════════════════
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_schema_acesso_setor_bloqueado.py -v`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add sql/schema_acesso_setor_bloqueado.sql tests/test_schema_acesso_setor_bloqueado.py
git commit -m "banco: as duas colunas que bloqueiam um setor inteiro"
```

---

### Task 2: O servidor aceita setor bloqueado e evento inativo

**Files:**
- Modify: `supabase/functions/_compartilhado/configuracao.ts` (`aplicarEvento` ~linha 157, `aplicarSetor` ~linha 182)
- Modify: `supabase/functions/acesso-conta/index.ts` (`painel()` ~linha 207, rota `/meus-eventos` ~linha 458)
- Test: `supabase/functions/_compartilhado/configuracao_test.ts`

**Interfaces:**
- Consumes: as colunas da Task 1.
- Produces:
  - `PATCH /setores/{id}` aceita `{ bloqueado: boolean, bloqueado_motivo: string | null }`.
  - `PATCH /eventos/{id}` aceita `{ status: "ativo" | "encerrado" }`.
  - `GET /eventos/{id}` (painel) devolve `evento.status` e, em cada setor, `bloqueado` e `bloqueado_motivo`.
  - `GET /meus-eventos` devolve também os eventos com `status = 'encerrado'`, cada um com o campo `status`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `supabase/functions/_compartilhado/configuracao_test.ts` (siga o estilo dos testes que já estão lá — mesmos helpers de dublê do banco):

```typescript
Deno.test("aplicarEvento aceita status ativo e encerrado", async () => {
  for (const valor of ["ativo", "encerrado"]) {
    const r = await aplicarEvento("e1", { status: valor });
    assertEquals(r.gravado, ["status"]);
  }
});

Deno.test("aplicarEvento RECUSA status excluido", async () => {
  // Apagar evento nao e o que a engrenagem oferece. Aceitar aqui abriria
  // caminho para isso por engano, e nao ha volta.
  await assertRejects(() => aplicarEvento("e1", { status: "excluido" }), Recusa);
});

Deno.test("aplicarEvento RECUSA status desconhecido", async () => {
  await assertRejects(() => aplicarEvento("e1", { status: "pausado" }), Recusa);
});

Deno.test("aplicarSetor aceita bloquear com motivo", async () => {
  const r = await aplicarSetor(
    { id: "s1", evento_id: "e1", abre_em: null, fecha_em: null },
    { bloqueado: true, bloqueado_motivo: "Camarote interditado pelos bombeiros" },
  );
  assertEquals(r.gravado, ["bloqueado", "bloqueado_motivo"]);
});

Deno.test("aplicarSetor RECUSA bloquear sem dizer por que", () => {
  // O motivo e o que o porteiro le em voz alta. Bloqueio mudo vira
  // "nao sei, o sistema nao deixou" na frente da fila.
  return assertRejects(
    () =>
      aplicarSetor(
        { id: "s1", evento_id: "e1", abre_em: null, fecha_em: null },
        { bloqueado: true, bloqueado_motivo: "  " },
      ),
    Recusa,
  );
});

Deno.test("aplicarSetor desbloqueia e apaga o motivo junto", async () => {
  // Motivo velho grudado num setor liberado apareceria na proxima recusa,
  // falando de um bloqueio que ja acabou.
  const r = await aplicarSetor(
    { id: "s1", evento_id: "e1", abre_em: null, fecha_em: null },
    { bloqueado: false },
  );
  assertEquals(r.gravado, ["bloqueado", "bloqueado_motivo"]);
});

Deno.test("aplicarSetor RECUSA bloqueado que nao e booleano", () => {
  return assertRejects(
    () =>
      aplicarSetor(
        { id: "s1", evento_id: "e1", abre_em: null, fecha_em: null },
        { bloqueado: "sim" },
      ),
    Recusa,
  );
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\node_modules\.bin\deno test --allow-all supabase/functions/_compartilhado/configuracao_test.ts`
Expected: FAIL — os campos novos são ignorados, `gravado` volta vazio.

- [ ] **Step 3: Implementar no `configuracao.ts`**

Em `aplicarEvento`, depois da linha do `data_evento`:

```typescript
  // `excluido` NAO entra, e a coluna aceita. Apagar evento nao e o que a
  // engrenagem oferece, e um valor a mais aqui e a diferenca entre "o dono
  // desligou o evento" e "o evento sumiu da conta dele".
  if ("status" in corpo) {
    const s = String(corpo.status ?? "").trim();
    if (s !== "ativo" && s !== "encerrado") {
      throw new Recusa(422, "status do evento: ativo ou encerrado");
    }
    mudanca.status = s;
  }
```

Em `aplicarSetor`, depois da linha do `fecha_em`:

```typescript
  // Bloquear o setor INTEIRO. Diferente do bloqueio de faixa, que mora em
  // outra tabela: aqui a porta para de receber, e nao um lote de numeros.
  if ("bloqueado" in corpo) {
    if (typeof corpo.bloqueado !== "boolean") {
      throw new Recusa(422, "bloqueado: verdadeiro ou falso");
    }
    mudanca.bloqueado = corpo.bloqueado;
    if (corpo.bloqueado) {
      // Bloqueio mudo vira "nao sei, o sistema nao deixou" na frente da fila.
      mudanca.bloqueado_motivo = texto(
        corpo.bloqueado_motivo,
        "motivo do bloqueio",
        1,
        200,
      );
    } else {
      // Liberou, o motivo vai junto: motivo velho grudado num setor liberado
      // reapareceria na proxima recusa, falando de um bloqueio que ja acabou.
      mudanca.bloqueado_motivo = null;
    }
  }
```

- [ ] **Step 4: Ajustar o `painel()` e o `/meus-eventos`**

Em `supabase/functions/acesso-conta/index.ts`, no `select` dos setores dentro de `painel()`, acrescente as duas colunas:

```typescript
      "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em,pedido_id_int,modelo_id," +
      "bloqueado,bloqueado_motivo" +
```

E na rota `/meus-eventos`, tire o filtro de status e traga a coluna:

```typescript
    // Sem `status=eq.ativo`. Com o filtro, inativar o evento o fazia sumir da
    // lista do proprio dono -- e nao havia mais tela nenhuma de onde reativar.
    // A lista MOSTRA o inativo, com a palavra `inativo` ao lado do nome.
    eventos: (await banco(
      "GET",
      `producao_acesso_eventos?dono_auth_id=eq.${usuario.id}` +
        "&status=neq.excluido&select=id,nome_evento,data_evento,status" +
        "&order=created_at.desc",
    )) ?? [],
```

- [ ] **Step 5: Rodar os testes**

Run: `.\node_modules\.bin\deno test --allow-all supabase/functions/_compartilhado/configuracao_test.ts`
Expected: PASS, incluindo os sete novos.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_compartilhado/configuracao.ts supabase/functions/_compartilhado/configuracao_test.ts supabase/functions/acesso-conta/index.ts
git commit -m "servidor: setor bloqueado e evento inativo passam a ser configuraveis"
```

---

### Task 3: A carga da portaria carrega evento inativo e setor bloqueado

**Files:**
- Modify: `supabase/functions/portaria/index.ts` (`carga()` ~linhas 205-255)
- Test: `tests/test_acesso_portaria.py`

**Interfaces:**
- Consumes: as colunas da Task 1.
- Produces: a carga que o aparelho baixa passa a trazer `evento.ativo` (booleano) e, em cada item de `setores`, `bloqueado` (booleano) e `bloqueado_motivo` (texto ou nulo). A Task 4 consome os dois.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente a `tests/test_acesso_portaria.py`, no estilo dos testes que já estão lá:

```python
def test_a_carga_diz_se_o_evento_esta_ativo():
    """Sem este campo, inativar o evento nao chega ao portao.

    A decisao no portao e tomada com a carga guardada no celular. Se ela nao
    disser o estado do evento, o aparelho continua deixando gente entrar num
    evento que o dono desligou.
    """
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "ativo:" in texto and "status" in texto


def test_a_carga_traz_o_bloqueio_de_setor():
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "bloqueado" in texto
    assert "bloqueado_motivo" in texto
```

Se `_ler` ainda não existir nesse arquivo, acrescente:

```python
def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_portaria.py -v -k carga`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `supabase/functions/portaria/index.ts`, dentro de `carga()`:

No `select` do evento, acrescente `status`:

```typescript
    `producao_acesso_eventos?id=eq.${eventoId}&select=id,nome_evento,sal,status`,
```

No `select` dos setores, acrescente as duas colunas novas ao que já é lido.

E no objeto devolvido:

```typescript
    evento: {
      id: evento.id,
      nome: evento.nome_evento,
      sal: evento.sal,
      // Booleano, e nao o texto do status: quem le e o `portaria-validacao.js`,
      // que decide sem rede e nao pode ficar sabendo dos valores do banco.
      ativo: evento.status === "ativo",
    },
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_portaria.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/portaria/index.ts tests/test_acesso_portaria.py
git commit -m "portaria: a carga leva ao portao se o evento esta ativo e o setor bloqueado"
```

---

### Task 4: As duas recusas novas na decisão do portão

**Files:**
- Modify: `frontend/portaria-validacao.js:73-160` (a função `decidir`)
- Modify: `frontend/portaria.js` (a função `pintar`, onde os motivos viram tela)
- Test: `tests/test_portaria_validacao.py`

**Interfaces:**
- Consumes: `carga.evento.ativo` e `setor.bloqueado` / `setor.bloqueado_motivo`, da Task 3.
- Produces: `decidir()` passa a devolver `{ estado: 'negado', motivo: 'evento_inativo' }` e `{ estado: 'negado', motivo: 'setor_bloqueado', detalhe: { motivoBloqueio } }`.

**A ordem nova das regras**, e ela é a resposta:

```
0. evento_inativo        -- o dono desligou o evento inteiro   (NOVO)
1. desconhecido          -- nao e deste evento
2. setor_nao_autorizado  -- e deste evento, mas de outra porta
3. setor_bloqueado       -- o dono desligou ESTA porta          (NOVO)
4. fora_da_janela        -- o setor ainda nao abriu, ou fechou
5. bloqueado             -- faixa de numeros suspensa
6. ja_entrou
7. permitido
```

`evento_inativo` vem antes de tudo porque é a resposta para qualquer ingresso e é a única que explica por que a fila parou. `setor_bloqueado` entra logo depois de `setor_nao_autorizado` — as duas dizem "esta porta não é para você agora", e é o que o porteiro consegue resolver. Nenhuma regra que já existia mudou de posição relativa às outras.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/test_portaria_validacao.py`, acrescente:

```python
def test_regra_0_evento_inativo_recusa_qualquer_ingresso():
    """O dono desligou o evento. Nenhum ingresso entra, nem o bom."""
    c = carga()
    c["evento"] = dict(c["evento"], ativo=False)
    r = decidir(["h-pista-1"], c)
    assert r["estado"] == "negado"
    assert r["motivo"] == "evento_inativo"


def test_evento_sem_o_campo_ativo_continua_deixando_entrar():
    """Carga antiga, baixada antes desta versao, nao pode travar o portao.

    O celular pode estar com uma carga de ontem, sem o campo novo. Tratar a
    ausencia como "inativo" pararia um evento inteiro sem que ninguem tivesse
    desligado nada.
    """
    r = decidir(["h-pista-1"])           # a carga base nao tem `ativo`
    assert r["estado"] == "permitido"


def test_regra_3_setor_bloqueado_recusa_e_diz_o_motivo():
    c = carga()
    c["setores"] = [
        dict(s, bloqueado=True, bloqueado_motivo="Camarote interditado")
        if s["id"] == PISTA else s
        for s in c["setores"]
    ]
    r = decidir(["h-pista-1"], c)
    assert r["estado"] == "negado"
    assert r["motivo"] == "setor_bloqueado"
    assert r["detalhe"]["motivoBloqueio"] == "Camarote interditado"


def test_setor_bloqueado_vem_ANTES_de_fora_da_janela():
    """As duas valem ao mesmo tempo, e o porteiro precisa ouvir a do dono.

    "Fechou as 22h" e automatico e o porteiro nao resolve. "O dono interditou
    o camarote" ele resolve: chama o dono.
    """
    c = carga()
    c["setores"] = [
        dict(s, bloqueado=True, bloqueado_motivo="Interditado",
             fecha_em="2026-08-20T21:00:00Z")
        if s["id"] == PISTA else s
        for s in c["setores"]
    ]
    r = decidir(["h-pista-1"], c, agora="2026-08-20T22:00:00Z")
    assert r["motivo"] == "setor_bloqueado"


def test_evento_inativo_vem_ANTES_de_desconhecido():
    """Com o evento desligado, ate o QR de rua ouve o motivo certo."""
    c = carga()
    c["evento"] = dict(c["evento"], ativo=False)
    r = decidir(["h-de-outro-evento"], c)
    assert r["motivo"] == "evento_inativo"


def test_setor_bloqueado_nao_atrapalha_o_setor_vizinho():
    """Bloquear o CAMAROTE nao pode fechar a PISTA."""
    c = carga()
    c["setores"] = [
        dict(s, bloqueado=True, bloqueado_motivo="Interditado")
        if s["id"] == VIP else s
        for s in c["setores"]
    ]
    r = decidir(["h-pista-1"], c)
    assert r["estado"] == "permitido"
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_portaria_validacao.py -v`
Expected: FAIL nos seis novos; os antigos continuam passando.

- [ ] **Step 3: Implementar em `portaria-validacao.js`**

Atualize o comentário do topo do arquivo com a ordem nova (as oito linhas do bloco acima). Em `decidir`, logo depois de `var autorizados = …`:

```javascript
        // 0. O dono desligou o evento inteiro. Vem antes de tudo: e a resposta
        //    para qualquer ingresso, e a unica frase que explica ao porteiro
        //    por que a fila parou.
        //
        //    `=== false` e nao `!carga.evento.ativo`: uma carga baixada ANTES
        //    desta versao nao tem o campo, e tratar a ausencia como desligado
        //    pararia um evento que ninguem desligou.
        if (carga.evento && carga.evento.ativo === false) {
            return negado('evento_inativo', null, null, {});
        }
```

E, depois de `var setor = setorPorId(carga, cand.s) || {};` (antes da regra 3 atual):

```javascript
        // 3. O dono desligou ESTA porta. Antes da janela de propósito: as duas
        //    podem valer ao mesmo tempo, e "o dono interditou o camarote" e o
        //    que o porteiro resolve -- ele chama o dono. "Fechou as 22h" e
        //    automatico e nao ha o que fazer com essa informacao na fila.
        if (setor.bloqueado) {
            return negado('setor_bloqueado', cand, setor, {
                motivoBloqueio: setor.bloqueado_motivo || ''
            });
        }
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_portaria_validacao.py -v`
Expected: PASS, todos.

- [ ] **Step 5: Pintar as duas recusas na tela do porteiro**

Em `frontend/portaria.js`, na função `pintar`, acrescente os dois motivos ao lado dos que já existem. Os dois em **vermelho** (`recusa`), não laranja — laranja é "ingresso bom na porta errada", e nestes dois casos o ingresso não entra em porta nenhuma:

```javascript
        if (r.motivo === 'evento_inativo') {
            return {
                classe: 'recusa', marca: '✕',
                titulo: 'EVENTO INATIVO',
                detalhe: 'Este evento foi desligado pelo organizador. Procure-o.'
            };
        }
        if (r.motivo === 'setor_bloqueado') {
            return {
                classe: 'recusa', marca: '✕',
                titulo: 'SETOR BLOQUEADO',
                detalhe: (r.setor && r.setor.nome) || '',
                motivo: (r.detalhe || {}).motivoBloqueio || ''
            };
        }
```

Confira contra as recusas vizinhas do arquivo e siga a forma exata que elas usam — o objeto acima é o formato do `bloqueado` de faixa, que já existe logo ali.

- [ ] **Step 6: Rodar a suite de tela da portaria**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_portaria_tela.py tests/test_portaria_validacao.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/portaria-validacao.js frontend/portaria.js tests/test_portaria_validacao.py
git commit -m "portao: recusa quando o evento esta inativo ou o setor foi bloqueado"
```

---

### Task 5: O chaveiro — os portões deste aparelho

**Files:**
- Create: `frontend/chaveiro.js`
- Create: `tests/chaveiro_harness.js`
- Test: `tests/test_chaveiro.py`

**Interfaces:**
- Consumes: nada. Puro: só `localStorage`, sem rede e sem DOM.
- Produces: `window.chaveiro` com:
  - `listar()` → `Array<{evento_id, nome_evento, aparelho_id, nome_portao, token}>`
  - `procurar(evento_id)` → a entrada ou `null`
  - `guardar(entrada)` → grava (substituindo a do mesmo `evento_id`) e devolve a lista
  - `esquecer(evento_id)` → remove e devolve a lista
  - `carregado()` → o `evento_id` do evento cuja carga está no aparelho, ou `''`
  - `carregar(evento_id)` → aponta `ideal_portaria_token`/`ideal_portaria_evento` para aquele portão; devolve `true`, ou `false` se o evento não estiver no chaveiro
  - `migrar()` → converte a instalação antiga (uma chave só) numa entrada do chaveiro; devolve `true` se migrou algo

  As Tasks 7, 8, 9 e 10 consomem tudo isso.

- [ ] **Step 1: Escrever o harness**

Crie `tests/chaveiro_harness.js`, no molde exato do `tests/portaria_validacao_harness.js` (copie-o e troque três coisas): o arquivo carregado passa a ser `frontend/chaveiro.js`, o objeto conferido passa a ser `window.chaveiro`, e a chamada passa a poder **semear o `localStorage` antes**:

```javascript
    // O chaveiro vive no localStorage. Semear ANTES de carregar o arquivo e o
    // que permite testar a migracao da instalacao antiga -- que so acontece
    // uma vez, no primeiro arranque.
    await page.evaluate((semente) => {
        localStorage.clear();
        Object.keys(semente || {}).forEach(function (k) {
            localStorage.setItem(k, semente[k]);
        });
    }, caso.localStorage || {});

    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'chaveiro.js') });

    const saida = await page.evaluate((c) => {
        var r = window.chaveiro[c.chamada].apply(null, c.argumentos);
        // O estado FINAL do localStorage volta junto: metade destes testes e
        // sobre o que ficou guardado, nao sobre o que a funcao devolveu.
        var guardado = {};
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            guardado[k] = localStorage.getItem(k);
        }
        return { resultado: r, localStorage: guardado };
    }, caso);
```

- [ ] **Step 2: Escrever os testes que falham**

Crie `tests/test_chaveiro.py`:

```python
# -*- coding: utf-8 -*-
"""O chaveiro: quais eventos ESTE aparelho ja le.

E ele que acende as luzes verdes da tela inicial sem rede e sem conta -- que e
a situacao do celular do porteiro no dia do evento.

Duas coisas aqui nao podem errar:

  1. A MIGRACAO. Todo celular que ja e portao hoje tem a chave antiga e nenhum
     chaveiro. Sem converter, ele acorda com o evento apagado na lista e o
     porteiro chama o dono no meio do evento.

  2. UM PORTAO POR APARELHO. Abrir o mesmo evento duas vezes no mesmo celular
     nao pode criar dois portoes -- decisao do usuario em 16/08/2026.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "chaveiro_harness.js")

CHAVE = "ideal_control_portoes"
CHAVE_TOKEN = "ideal_portaria_token"
CHAVE_EVENTO = "ideal_portaria_evento"


def chamar(nome, *argumentos, guardado=None):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({
            "chamada": nome,
            "argumentos": list(argumentos),
            "localStorage": guardado or {},
        }),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


PORTAO_A = {
    "evento_id": "e-1", "nome_evento": "Click",
    "aparelho_id": "d-1", "nome_portao": "Portão 1", "token": "t-1",
}
PORTAO_B = {
    "evento_id": "e-2", "nome_evento": "Festa da Uva",
    "aparelho_id": "d-2", "nome_portao": "Portão 1", "token": "t-2",
}


def com(*portoes):
    return {CHAVE: json.dumps(list(portoes))}


# ── Listar e procurar ───────────────────────────────────────────────────────

def test_aparelho_novo_tem_chaveiro_vazio():
    assert chamar("listar")["resultado"] == []


def test_chaveiro_corrompido_nao_derruba_a_tela():
    """JSON invalido no localStorage vira lista vazia, e nao excecao.

    A tela inicial e a primeira coisa que abre. Uma excecao aqui e uma tela em
    branco, sem uma palavra do porque -- exatamente o que o `abrir()` do
    controle.js ja aprendeu a evitar.
    """
    assert chamar("listar", guardado={CHAVE: "{nao e json"})["resultado"] == []


def test_procurar_acha_pelo_evento():
    r = chamar("procurar", "e-2", guardado=com(PORTAO_A, PORTAO_B))
    assert r["resultado"]["token"] == "t-2"


def test_procurar_evento_que_nao_esta_devolve_nulo():
    r = chamar("procurar", "e-9", guardado=com(PORTAO_A))
    assert r["resultado"] is None


# ── Guardar: um portao por aparelho ─────────────────────────────────────────

def test_guardar_acrescenta():
    r = chamar("guardar", PORTAO_B, guardado=com(PORTAO_A))
    assert len(r["resultado"]) == 2


def test_guardar_o_MESMO_evento_substitui_em_vez_de_duplicar():
    """Decisao do usuario: um portao por aparelho, nao um por carregamento."""
    outro = dict(PORTAO_A, token="t-novo", nome_portao="Portão renomeado")
    r = chamar("guardar", outro, guardado=com(PORTAO_A))
    assert len(r["resultado"]) == 1
    assert r["resultado"][0]["token"] == "t-novo"


def test_esquecer_tira_so_o_pedido():
    r = chamar("esquecer", "e-1", guardado=com(PORTAO_A, PORTAO_B))
    assert [p["evento_id"] for p in r["resultado"]] == ["e-2"]


# ── Migracao da instalacao antiga ───────────────────────────────────────────

def test_migrar_converte_a_instalacao_antiga():
    r = chamar("migrar", guardado={CHAVE_TOKEN: "t-velho", CHAVE_EVENTO: "e-velho"})
    assert r["resultado"] is True
    guardado = json.loads(r["localStorage"][CHAVE])
    assert len(guardado) == 1
    assert guardado[0]["evento_id"] == "e-velho"
    assert guardado[0]["token"] == "t-velho"


def test_migrar_NAO_apaga_as_chaves_antigas():
    """A portaria continua lendo `ideal_portaria_token` como sempre leu.

    O chaveiro e camada nova por cima; apagar embaixo dela desligaria o portao
    que esta trabalhando agora.
    """
    r = chamar("migrar", guardado={CHAVE_TOKEN: "t-velho", CHAVE_EVENTO: "e-velho"})
    assert r["localStorage"][CHAVE_TOKEN] == "t-velho"


def test_migrar_nao_faz_nada_em_aparelho_que_nunca_foi_portao():
    r = chamar("migrar")
    assert r["resultado"] is False
    assert CHAVE not in r["localStorage"]


def test_migrar_duas_vezes_nao_duplica():
    r = chamar("migrar", guardado={
        CHAVE_TOKEN: "t-velho", CHAVE_EVENTO: "e-velho",
        CHAVE: json.dumps([dict(PORTAO_A, evento_id="e-velho", token="t-velho")]),
    })
    assert r["resultado"] is False
    assert len(json.loads(r["localStorage"][CHAVE])) == 1


def test_migrar_sem_o_evento_guardado_nao_inventa_entrada():
    """Token sem evento nao da portao: a lista mostraria uma barra sem nome."""
    r = chamar("migrar", guardado={CHAVE_TOKEN: "t-velho"})
    assert r["resultado"] is False


# ── Qual evento esta carregado ──────────────────────────────────────────────

def test_carregado_le_a_chave_que_a_portaria_usa():
    r = chamar("carregado", guardado={CHAVE_EVENTO: "e-1"})
    assert r["resultado"] == "e-1"


def test_carregar_aponta_as_chaves_da_portaria_para_o_portao_pedido():
    r = chamar("carregar", "e-2", guardado=com(PORTAO_A, PORTAO_B))
    assert r["resultado"] is True
    assert r["localStorage"][CHAVE_TOKEN] == "t-2"
    assert r["localStorage"][CHAVE_EVENTO] == "e-2"


def test_carregar_evento_que_nao_esta_no_chaveiro_recusa():
    r = chamar("carregar", "e-9", guardado=com(PORTAO_A))
    assert r["resultado"] is False
```

- [ ] **Step 3: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_chaveiro.py -v`
Expected: FAIL — `frontend/chaveiro.js` não existe.

- [ ] **Step 4: Escrever o `chaveiro.js`**

```javascript
/**
 * Os portoes que ESTE aparelho ja sabe ler.
 *
 * E o chaveiro que acende as luzes verdes da tela inicial sem rede e sem conta
 * -- a situacao do celular do porteiro no dia do evento, que e a unica que
 * importa quando a fila esta andando.
 *
 * PURO de proposito: so `localStorage`, sem DOM e sem rede. As duas coisas que
 * nao podem errar aqui -- a migracao da instalacao antiga e "um portao por
 * aparelho" -- sao testaveis com dados de mesa, do jeito que o
 * `tests/test_chaveiro.py` faz.
 *
 * ## O que este arquivo NAO faz
 *
 * Ele nao guarda a carga do evento. A carga (credenciais, setores, fila de
 * leituras) continua no IndexedDB, de UM evento por vez, no
 * `portaria-deposito.js`. O chaveiro sabe de varios eventos; o aparelho tem um
 * carregado. Quem faz a troca e o `virar-portao.js`.
 *
 * ## Por que as chaves antigas continuam existindo
 *
 * A portaria le `ideal_portaria_token` desde o primeiro dia, e ha portao
 * trabalhando com essa chave agora, na gracha. O chaveiro e camada NOVA por
 * cima: `carregar()` aponta as chaves antigas para o portao escolhido, e o
 * `portaria.js` continua sem saber que o chaveiro existe.
 */
(function () {
    'use strict';

    var CHAVE = 'ideal_control_portoes';
    var CHAVE_TOKEN = 'ideal_portaria_token';
    var CHAVE_EVENTO = 'ideal_portaria_evento';

    /**
     * Ler do `localStorage` sem nunca lancar.
     *
     * Aba anonima do iOS lanca no `getItem`, e JSON corrompido lanca no
     * `parse`. Os dois, aqui, sao a PRIMEIRA coisa que a tela inicial chama:
     * uma excecao vira tela em branco, sem uma palavra do porque.
     */
    function listar() {
        var bruto = null;
        try { bruto = localStorage.getItem(CHAVE); } catch (e) { return []; }
        if (!bruto) { return []; }
        var lista;
        try { lista = JSON.parse(bruto); } catch (e) { return []; }
        return Object.prototype.toString.call(lista) === '[object Array]' ? lista : [];
    }

    function escrever(lista) {
        try { localStorage.setItem(CHAVE, JSON.stringify(lista)); }
        catch (e) { /* aba anonima ou cota estourada: vale so nesta sessao */ }
        return lista;
    }

    function procurar(evento_id) {
        var achados = listar().filter(function (p) {
            return p && p.evento_id === evento_id;
        });
        return achados.length ? achados[0] : null;
    }

    /**
     * Um portao por aparelho, e nao um por carregamento -- decisao do usuario.
     * Guardar o mesmo evento de novo SUBSTITUI: sem isto, abrir o evento duas
     * vezes no mesmo celular criaria dois portoes na lista do dono, com o mesmo
     * nome, e ele nao teria como saber qual desligar.
     */
    function guardar(entrada) {
        if (!entrada || !entrada.evento_id) { return listar(); }
        var lista = listar().filter(function (p) {
            return p && p.evento_id !== entrada.evento_id;
        });
        lista.push(entrada);
        return escrever(lista);
    }

    function esquecer(evento_id) {
        return escrever(listar().filter(function (p) {
            return p && p.evento_id !== evento_id;
        }));
    }

    /** O evento cuja carga esta neste aparelho agora. */
    function carregado() {
        try { return localStorage.getItem(CHAVE_EVENTO) || ''; }
        catch (e) { return ''; }
    }

    /**
     * Aponta as chaves que a portaria le para o portao deste evento.
     *
     * NAO baixa carga e NAO limpa fila: quem cuida disso e o `virar-portao.js`,
     * que sabe recusar a troca com leitura pendente. Chamar isto sozinho, com
     * fila cheia, faria as leituras do evento anterior subirem contadas no
     * evento novo.
     */
    function carregar(evento_id) {
        var p = procurar(evento_id);
        if (!p) { return false; }
        try {
            localStorage.setItem(CHAVE_TOKEN, p.token);
            localStorage.setItem(CHAVE_EVENTO, p.evento_id);
        } catch (e) { return false; }
        return true;
    }

    /**
     * A instalacao antiga vira uma entrada do chaveiro.
     *
     * Todo celular que ja e portao hoje tem `ideal_portaria_token` e nenhum
     * chaveiro. Sem esta conversao, ele acorda com o evento APAGADO na lista --
     * e quem descobre isso e o porteiro, no portao, chamando o dono.
     *
     * Nao apaga as chaves antigas: a portaria continua lendo dali.
     *
     * @returns true se converteu alguma coisa agora.
     */
    function migrar() {
        if (listar().length) { return false; }   // ja migrado, ou ja tem portao
        var token = null, evento = null;
        try {
            token = localStorage.getItem(CHAVE_TOKEN);
            evento = localStorage.getItem(CHAVE_EVENTO);
        } catch (e) { return false; }
        // Token sem evento nao da portao: a lista mostraria uma barra sem nome
        // e sem destino. Melhor deixar o dono carregar o evento de novo.
        if (!token || !evento) { return false; }
        escrever([{
            evento_id: evento,
            // O nome verdadeiro chega no primeiro `/meus-eventos` com sessao,
            // ou na primeira carga. Ate la, alguma palavra e melhor que barra
            // vazia.
            nome_evento: 'Evento',
            aparelho_id: null,
            nome_portao: 'Este portão',
            token: token
        }]);
        return true;
    }

    window.chaveiro = {
        listar: listar, procurar: procurar, guardar: guardar,
        esquecer: esquecer, carregado: carregado, carregar: carregar,
        migrar: migrar
    };
})();
```

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_chaveiro.py -v`
Expected: PASS, 16 testes.

- [ ] **Step 6: Commit**

```bash
git add frontend/chaveiro.js tests/chaveiro_harness.js tests/test_chaveiro.py
git commit -m "chaveiro: os portoes que este aparelho ja sabe ler"
```

---

### Task 6: A parede do PWA

**Files:**
- Create: `frontend/parede-pwa.js`
- Test: `tests/test_parede_pwa.py`

**Interfaces:**
- Consumes: nada.
- Produces: `window.paredePwa` com `instalado()` → booleano, `ehIphone()` → booleano, e `decidir(opcoes)` → `'nada' | 'prompt' | 'iphone'`. Puro o bastante para teste; o desenho da parede fica no mesmo arquivo, atrás de `montar()`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/test_parede_pwa.py`:

```python
# -*- coding: utf-8 -*-
"""A exigencia de instalar o aplicativo, e a ressalva que evita trancar alguem.

Decisao do usuario em 16/08/2026: "exige instalar sempre", com a ressalva
"deixar passar so nesse caso" quando o navegador nao souber instalar. As duas
metades importam. Sem a primeira o pedido nao foi atendido; sem a segunda,
quem abre no Firefox do PC fica olhando uma parede que nunca sai.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_reconhece_o_aplicativo_instalado_nos_dois_sistemas():
    """Android e PC respondem `display-mode`; o iPhone so `navigator.standalone`."""
    texto = _ler("frontend/parede-pwa.js")
    assert "display-mode: standalone" in texto
    assert "navigator.standalone" in texto


def test_o_iphone_recebe_a_instrucao_em_texto():
    """Safari nunca dispara `beforeinstallprompt`. Sem a frase, o iPhone
    ficaria diante de uma parede sem saida."""
    texto = _ler("frontend/parede-pwa.js")
    assert "Tela de Início" in texto
    assert "Compartilhar" in texto


def test_navegador_que_nao_sabe_instalar_NAO_leva_parede():
    """A ressalva do usuario, e ela precisa estar escrita no codigo."""
    texto = _ler("frontend/parede-pwa.js")
    assert "'nada'" in texto or '"nada"' in texto


def test_a_espera_pelo_beforeinstallprompt_tem_teto():
    """Sem teto, o navegador que nunca dispara o evento deixa a tela travada
    esperando para sempre."""
    assert re.search(r"setTimeout\([^)]*,\s*1[0-9]{3}\s*\)", _ler("frontend/parede-pwa.js"))


def test_a_parede_nao_e_fechavel():
    """Enquanto ela estiver ali o aplicativo nao e usavel -- e o ponto dela."""
    texto = _ler("frontend/parede-pwa.js")
    assert "Fechar" not in texto and "Agora não" not in texto


def test_o_arquivo_entra_na_lista_que_as_estacoes_baixam():
    import security_config
    assert "parede-pwa.js" in security_config.PAINEL_ARQUIVOS
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_parede_pwa.py -v`
Expected: FAIL.

- [ ] **Step 3: Escrever o `parede-pwa.js`**

```javascript
/**
 * O Ideal Control so trabalha instalado.
 *
 * Decisao do usuario em 16/08/2026: "exige instalar sempre", com a ressalva
 * "deixar passar so nesse caso" quando o navegador nao souber instalar.
 *
 * As duas metades importam. A primeira e o pedido. A segunda existe porque
 * Firefox no PC, Safari no Mac e navegador embutido de outro aplicativo nao
 * instalam PWA -- e uma parede que nunca sai tranca o dono do lado de fora do
 * evento dele.
 *
 * ## Por que instalar importa de verdade, e nao e so estetica
 *
 * Instalado, o iOS DEIXA DE APAGAR o armazenamento do site depois de 7 dias
 * sem uso. A carga do evento e a fila de leituras que ainda nao subiram vivem
 * no IndexedDB: um celular parado entre um evento e outro pode acordar vazio.
 * O mesmo raciocinio ja esta escrito no `portaria.html`.
 */
(function () {
    'use strict';

    /** Ja instalado? Android e PC respondem pelo `display-mode`; o iPhone nao. */
    function instalado() {
        try {
            if (window.matchMedia
                && window.matchMedia('(display-mode: standalone)').matches) {
                return true;
            }
        } catch (e) { /* navegador sem matchMedia: cai no teste do iOS */ }
        // O Safari do iPhone nao implementa `display-mode`. Este e o unico
        // sinal que ele da de que o atalho da tela de inicio foi usado.
        return navigator.standalone === true;
    }

    function ehIphone() {
        var ua = navigator.userAgent || '';
        // `MSStream` exclui o Edge antigo do Windows Phone, que mentia dizendo
        // ser iPhone no user agent.
        return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    }

    /**
     * O que fazer, dado o que se sabe do aparelho.
     *
     *   'nada'   -- ja instalado, ou navegador que nao sabe instalar
     *   'prompt' -- da para instalar com um toque (Android, Chrome/Edge no PC)
     *   'iphone' -- so pelo menu Compartilhar, com instrucao em texto
     */
    function decidir(opcoes) {
        opcoes = opcoes || {};
        if (opcoes.instalado) { return 'nada'; }
        if (opcoes.temPrompt) { return 'prompt'; }
        if (opcoes.iphone) { return 'iphone'; }
        return 'nada';                 // a ressalva do usuario
    }

    var promptGuardado = null;

    function montar(modo) {
        var parede = document.createElement('div');
        parede.id = 'parede-pwa';
        // Estilo inline, e nao no `controle.css`: esta parede precisa aparecer
        // mesmo que a folha de estilo nao tenha carregado -- e sem folha a
        // tela por baixo dela ficaria visivel e clicavel.
        parede.setAttribute('style',
            'position:fixed;inset:0;z-index:9999;background:#0a0f1e;color:#e2e8f0;'
            + 'display:flex;flex-direction:column;align-items:center;'
            + 'justify-content:center;gap:16px;padding:32px;text-align:center;'
            + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;');

        var titulo = document.createElement('h1');
        titulo.textContent = 'Instale o Ideal Control';
        titulo.setAttribute('style', 'font-size:1.4rem;margin:0;');
        parede.appendChild(titulo);

        var frase = document.createElement('p');
        frase.setAttribute('style', 'font-size:.95rem;color:#94a3b8;margin:0;max-width:34ch;');
        frase.textContent = 'No portão o aparelho trabalha sem internet, e para '
            + 'isso ele precisa estar instalado neste celular. É rápido e não '
            + 'ocupa espaço.';
        parede.appendChild(frase);

        if (modo === 'iphone') {
            var passos = document.createElement('p');
            passos.setAttribute('style', 'font-size:1rem;margin:0;max-width:34ch;');
            // Em texto, e nao em icone: o icone de compartilhar do iPhone muda
            // de desenho entre versoes do iOS, e o dono esta lendo isto uma
            // vez so, com pressa.
            passos.textContent = 'Toque em Compartilhar, na barra de baixo do '
                + 'Safari, e escolha "Adicionar à Tela de Início".';
            parede.appendChild(passos);
        } else {
            var botao = document.createElement('button');
            botao.type = 'button';
            botao.textContent = 'Instalar agora';
            botao.setAttribute('style',
                'padding:16px 24px;font-size:1.05rem;font-weight:700;border:0;'
                + 'border-radius:10px;background:#14b8a6;color:#06231f;cursor:pointer;');
            botao.addEventListener('click', function () {
                if (!promptGuardado) { return; }
                promptGuardado.prompt();
            });
            parede.appendChild(botao);
        }

        document.body.appendChild(parede);
    }

    /**
     * Espera pelo `beforeinstallprompt` COM TETO.
     *
     * O evento chega logo depois do carregamento nos navegadores que o tem, e
     * nunca nos outros. Sem o teto de 1,5 s, quem nao dispara deixaria a
     * decisao pendurada para sempre -- e a tela ficaria usavel por acidente
     * num caso e travada no outro, sem regra.
     */
    function vigiar() {
        if (instalado()) { return; }

        window.addEventListener('beforeinstallprompt', function (ev) {
            ev.preventDefault();
            promptGuardado = ev;
        });

        setTimeout(function () {
            var modo = decidir({
                instalado: instalado(),
                temPrompt: !!promptGuardado,
                iphone: ehIphone()
            });
            if (modo !== 'nada') { montar(modo); }
        }, 1500);
    }

    window.paredePwa = {
        instalado: instalado, ehIphone: ehIphone,
        decidir: decidir, montar: montar
    };
    document.addEventListener('DOMContentLoaded', vigiar);
})();
```

- [ ] **Step 4: Pôr o arquivo na lista das estações**

Em `security_config.py`, acrescente `"parede-pwa.js"` ao `PAINEL_ARQUIVOS`, junto de `"chaveiro.js"`, `"lista-eventos.js"` e `"virar-portao.js"` (os três chegam nas Tasks 5, 7 e 8; se ainda não existirem, acrescente todos agora — a lista é conferida por teste, não pelo disco).

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_parede_pwa.py -v`
Expected: PASS, 6 testes.

- [ ] **Step 6: Commit**

```bash
git add frontend/parede-pwa.js tests/test_parede_pwa.py security_config.py
git commit -m "pwa: a parede que exige o aplicativo instalado, e a ressalva que nao tranca ninguem"
```

---

### Task 7: A tela inicial — a lista de eventos

**Files:**
- Create: `frontend/lista-eventos.js`
- Modify: `frontend/controle.html` (o corpo inteiro do bloco de lista, e os `<script>`)
- Modify: `frontend/controle.css`
- Test: `tests/test_lista_eventos.py`

**Interfaces:**
- Consumes: `window.chaveiro` (Task 5), `window.AcessoConta` (existe), `window.virarPortao` (Task 8 — a lista chama `virarPortao.abrir(evento_id)` no toque).
- Produces: `window.listaEventos` com `unir(doChaveiro, daConta)` → a lista desenhável, ordenada, sem duplicata; e `desenhar()`, que preenche `#eventos`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/test_lista_eventos.py`. A função `unir` é pura e vai pelo harness (copie o `tests/chaveiro_harness.js` e troque o arquivo e o objeto); o resto é leitura de arquivo:

```python
# -*- coding: utf-8 -*-
"""A tela inicial: a lista de eventos da imagem que o usuario mandou.

A luz verde significa UMA coisa, decidida por ele em 16/08/2026: este aparelho
ja e portao daquele evento. Nao e "o evento esta ativo" -- essa informacao vai
em texto, ao lado do nome.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "lista_eventos_harness.js")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def unir(do_chaveiro, da_conta):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"chamada": "unir", "argumentos": [do_chaveiro, da_conta]}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)["resultado"]


P = {"evento_id": "e-1", "nome_evento": "Click", "aparelho_id": "d-1",
     "nome_portao": "Portão 1", "token": "t-1"}
E1 = {"id": "e-1", "nome_evento": "Click", "status": "ativo"}
E2 = {"id": "e-2", "nome_evento": "Fenachamp", "status": "ativo"}


def test_evento_que_esta_nas_duas_fontes_aparece_uma_vez_e_verde():
    linhas = unir([P], [E1])
    assert len(linhas) == 1
    assert linhas[0]["ehPortao"] is True


def test_evento_so_da_conta_aparece_com_a_luz_apagada():
    linhas = unir([], [E2])
    assert linhas[0]["ehPortao"] is False


def test_evento_so_do_chaveiro_aparece_verde_SEM_a_conta():
    """O celular do porteiro: sem rede, sem sessao, e a lista tem de sair."""
    linhas = unir([P], [])
    assert len(linhas) == 1
    assert linhas[0]["ehPortao"] is True
    assert linhas[0]["nome"] == "Click"


def test_os_verdes_vem_primeiro():
    """Quem esta no portao procura o evento que ele le, nao os outros."""
    linhas = unir([P], [E2, E1])
    assert linhas[0]["id"] == "e-1"


def test_o_nome_da_conta_vence_o_do_chaveiro():
    """O chaveiro guarda uma copia; o servidor e a verdade.

    Regra deste projeto: dado do parceiro manda sempre. O dono renomeia o
    evento no ERP e a barra tem de mudar.
    """
    velho = dict(P, nome_evento="Nome antigo")
    linhas = unir([velho], [E1])
    assert linhas[0]["nome"] == "Click"


def test_evento_inativo_e_marcado_em_texto():
    linhas = unir([], [dict(E2, status="encerrado")])
    assert linhas[0]["ativo"] is False


# ── A tela ──────────────────────────────────────────────────────────────────

def test_a_barra_de_novo_evento_e_o_mais_fazem_a_mesma_coisa():
    texto = _ler("frontend/controle.html")
    assert 'id="btn-ler-qr"' in texto
    assert 'id="btn-ler-qr-mais"' in texto


def test_a_engrenagem_fica_FORA_da_barra_do_evento():
    """Como na imagem. Dentro, o toque no evento cairia na configuracao."""
    texto = _ler("frontend/lista-eventos.js")
    assert "linha-evento" in texto and "botao-engrenagem" in texto


def test_nao_sobrou_nenhuma_opcao_de_gerar_codigo():
    """Decisao do usuario: retirar TODAS as opcoes de gerar codigo."""
    for arquivo in ("frontend/controle.html", "frontend/controle.js",
                    "frontend/lista-eventos.js"):
        texto = _ler(arquivo)
        assert "Gerar outro código" not in texto
        assert "caixa-codigo" not in texto
        assert "Criar aparelho" not in texto


def test_todo_botao_da_lista_tem_rotulo_em_texto():
    """Regra do projeto: icone sozinho obriga a adivinhar."""
    texto = _ler("frontend/lista-eventos.js")
    assert "aria-label" in texto


def test_o_arquivo_entra_na_lista_que_as_estacoes_baixam():
    import security_config
    assert "lista-eventos.js" in security_config.PAINEL_ARQUIVOS
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_lista_eventos.py -v`
Expected: FAIL.

- [ ] **Step 3: Criar o harness**

Crie `tests/lista_eventos_harness.js` copiando `tests/chaveiro_harness.js` e trocando o arquivo carregado para `frontend/lista-eventos.js` e o objeto conferido para `window.listaEventos`.

- [ ] **Step 4: Escrever o `lista-eventos.js`**

A função `unir` primeiro (é ela que os testes exercitam), e depois o desenho:

```javascript
/**
 * A tela inicial do Ideal Control: os eventos, com a luz de cada um.
 *
 * A LUZ VERDE SIGNIFICA UMA COISA SO: este aparelho ja e portao daquele
 * evento. Decisao do usuario em 16/08/2026, contra as alternativas "o evento
 * esta ativo" e "as duas juntas". Se o evento estiver desligado, isso vai em
 * TEXTO ao lado do nome -- duas informacoes na mesma luz seriam duas
 * informacoes perdidas.
 *
 * A lista soma duas fontes, e a ordem delas e o ponto:
 *
 *   o chaveiro deste aparelho  -- sempre, sem rede e sem conta
 *   `/meus-eventos` da conta   -- so quando ha sessao aberta
 *
 * A primeira e o celular do porteiro no dia do evento, sem sinal e sem a conta
 * do dono. E a unica que nao pode falhar.
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    /**
     * As duas fontes viram uma lista desenhavel.
     *
     * @param doChaveiro  o que `chaveiro.listar()` devolveu
     * @param daConta     o que `/meus-eventos` devolveu (vazio sem sessao)
     * @returns [{ id, nome, ativo, ehPortao, nomePortao }]
     */
    function unir(doChaveiro, daConta) {
        var porId = {};

        (doChaveiro || []).forEach(function (p) {
            if (!p || !p.evento_id) { return; }
            porId[p.evento_id] = {
                id: p.evento_id,
                nome: p.nome_evento || 'Evento',
                // Sem a conta nao da para saber se o evento foi desligado. Um
                // "inativo" chutado na barra seria pior que silencio: o dono
                // desligaria um portao que esta trabalhando.
                ativo: true,
                ehPortao: true,
                nomePortao: p.nome_portao || ''
            };
        });

        (daConta || []).forEach(function (ev) {
            if (!ev || !ev.id) { return; }
            var ja = porId[ev.id];
            porId[ev.id] = {
                id: ev.id,
                // O servidor vence a copia do chaveiro. Regra deste projeto: o
                // que o parceiro escreve no banco e a origem da verdade, e um
                // nome guardado aqui envelhece assim que o dono o troca la.
                nome: ev.nome_evento || (ja ? ja.nome : 'Evento'),
                ativo: ev.status !== 'encerrado',
                ehPortao: !!ja,
                nomePortao: ja ? ja.nomePortao : ''
            };
        });

        var linhas = Object.keys(porId).map(function (k) { return porId[k]; });
        // Os verdes primeiro: quem esta no portao procura o evento que ESTE
        // aparelho le, e nao os outros da conta.
        linhas.sort(function (a, b) {
            if (a.ehPortao !== b.ehPortao) { return a.ehPortao ? -1 : 1; }
            return a.nome.localeCompare(b.nome, 'pt-BR');
        });
        return linhas;
    }

    // ── Os icones, desenhados aqui ──────────────────────────────────────────
    //
    // SVG embutido, e nao PNG: esta tela precisa abrir sem rede, e cada arquivo
    // de imagem e mais uma requisicao que pode faltar. Alem disso o SVG segue a
    // cor do tema; um PNG de cor fixa nao segue.

    function svg(caminhos, rotulo) {
        var el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.setAttribute('viewBox', '0 0 24 24');
        el.setAttribute('width', '24');
        el.setAttribute('height', '24');
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', 'currentColor');
        el.setAttribute('stroke-width', '2');
        el.setAttribute('stroke-linecap', 'round');
        el.setAttribute('stroke-linejoin', 'round');
        el.setAttribute('aria-hidden', 'true');
        caminhos.forEach(function (d) {
            var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            el.appendChild(p);
        });
        if (rotulo) { el.setAttribute('role', 'img'); }
        return el;
    }

    function iconeCelularQR() {
        return svg([
            'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
            'M9 7h2v2H9z', 'M13 7h2v2h-2z', 'M9 11h2v2H9z', 'M13 11h2v2h-2z',
            'M12 18h.01'
        ]);
    }

    function iconeEngrenagem() {
        return svg([
            'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
            'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06'
            + 'a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09'
            + 'A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83'
            + 'l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09'
            + 'A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83'
            + 'l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09'
            + 'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83'
            + 'l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09'
            + 'a1.65 1.65 0 0 0-1.51 1z'
        ]);
    }

    /** Uma barra de evento, com a engrenagem ao lado dela — e nao dentro. */
    function linhaDeEvento(ev) {
        var linha = document.createElement('div');
        linha.className = 'linha-evento';

        var barra = document.createElement('button');
        barra.type = 'button';
        barra.className = 'barra-evento';
        barra.id = 'evento-' + ev.id;

        var luz = document.createElement('span');
        luz.className = 'luz' + (ev.ehPortao ? ' acesa' : '');
        // A luz e cor, e cor sozinha nao e rotulo. Quem usa leitor de tela --
        // ou quem nao distingue as duas -- precisa da palavra.
        luz.setAttribute('aria-hidden', 'true');
        barra.appendChild(luz);

        var nome = document.createElement('span');
        nome.className = 'nome-evento';
        nome.textContent = ev.nome;          // digitado por pessoas: TEXTO
        barra.appendChild(nome);

        if (!ev.ativo) {
            // Em texto, e nao na luz: a luz ja diz outra coisa. Sem esta
            // palavra, um evento desligado fica identico a um ligado na tela de
            // quem vai abrir o portao.
            var marca = document.createElement('span');
            marca.className = 'marca-inativo';
            marca.textContent = 'inativo';
            barra.appendChild(marca);
        }

        var icone = document.createElement('span');
        icone.className = 'icone-ler';
        icone.appendChild(iconeCelularQR());
        barra.appendChild(icone);

        barra.setAttribute('aria-label',
            ev.ehPortao
                ? ('Ler ingressos de ' + ev.nome)
                : ('Usar este aparelho no portão de ' + ev.nome));
        barra.addEventListener('click', function () {
            window.virarPortao.abrir(ev.id, ev.nome);
        });
        linha.appendChild(barra);

        var engrenagem = document.createElement('button');
        engrenagem.type = 'button';
        engrenagem.className = 'botao-engrenagem';
        engrenagem.id = 'config-' + ev.id;
        engrenagem.appendChild(iconeEngrenagem());
        engrenagem.setAttribute('aria-label', 'Configurar ' + ev.nome);
        engrenagem.title = 'Configurar ' + ev.nome;
        engrenagem.addEventListener('click', function () {
            window.Controle.abrirEngrenagem(ev.id, ev.nome);
        });
        linha.appendChild(engrenagem);

        return linha;
    }

    function desenhar(linhas) {
        var caixa = $('eventos');
        caixa.innerHTML = '';
        linhas.forEach(function (ev) { caixa.appendChild(linhaDeEvento(ev)); });
        $('sem-eventos').classList.toggle('sumindo', linhas.length > 0);
    }

    /**
     * Junta as duas fontes e desenha.
     *
     * A do chaveiro e sincrona e nao falha; a da conta e rede e pode falhar. A
     * lista sai com o que houver -- prender a tela inteira na resposta do
     * servidor deixaria o porteiro sem lista por causa de um 4G ruim.
     */
    function carregar(sessao) {
        var doChaveiro = window.chaveiro.listar();
        desenhar(unir(doChaveiro, []));      // a tela ja aparece, sem esperar

        if (!sessao) { return Promise.resolve(); }
        return window.AcessoConta.pedir('/meus-eventos', {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        }).then(function (d) {
            desenhar(unir(doChaveiro, d.eventos || []));
        }).catch(function () {
            // A lista do chaveiro ja esta na tela. Aqui so avisamos que o resto
            // nao veio -- silencio faria o dono achar que perdeu um evento.
            var aviso = $('erro-arranque');
            aviso.textContent = 'Não consegui buscar os seus outros eventos '
                + 'agora. Os que este aparelho já lê estão na lista.';
            aviso.classList.remove('sumindo');
        });
    }

    window.listaEventos = { unir: unir, desenhar: desenhar, carregar: carregar };
})();
```

- [ ] **Step 5: Reescrever o corpo do `controle.html`**

Troque o bloco `#ler-qr` e o `#lista-eventos` pelo layout da imagem, e ponha os `<script>` novos. O bloco `#evento` inteiro sai daqui — ele vira a engrenagem, na Task 9.

```html
<div class="folha">
    <header class="cabecalho">
        <img src="Logo Ideal Dark.png" alt="Ingresso Ideal">
        <div class="titulos">
            <strong>Ideal Control</strong>
            <span>Controle de Acesso</span>
        </div>
    </header>

    <div id="erro-arranque" class="aviso erro sumindo" role="alert"></div>

    <!-- Duas portas para a MESMA acao: a barra é o rótulo em texto (regra do
         projeto: nada só com ícone) e o `+` fecha a coluna da direita, onde
         cada linha de evento tem a sua engrenagem. -->
    <div class="linha-evento">
        <button id="btn-ler-qr" class="barra-evento destaque">
            <span class="nome-evento">Novo Evento</span>
        </button>
        <button id="btn-ler-qr-mais" class="botao-engrenagem"
                aria-label="Novo Evento" title="Novo Evento">+</button>
    </div>

    <div id="caixa-qr" class="sumindo">
        <video id="cam" playsinline muted class="cam-qr"></video>
        <button id="btn-lanterna-qr" class="secundario sumindo" type="button">Lanterna</button>
        <button id="btn-fechar-qr" class="secundario">Cancelar</button>
    </div>
    <div id="erro-qr" class="aviso erro sumindo" role="alert"></div>

    <!-- Envolve a lista inteira para a engrenagem poder escondê-la de uma vez.
         `#engrenagem` (Task 9) e `#lista` são os dois estados desta página, e
         nunca aparecem juntos. -->
    <div id="lista">
        <h1 class="rotulo-secao">Meus Eventos</h1>
        <div id="eventos"></div>
        <p id="sem-eventos" class="aviso sumindo">
            Nenhum evento aqui ainda. Toque em <strong>Novo Evento</strong> e leia o
            QR que a gráfica enviou.
        </p>
    </div>

    <div id="bloco-entrar" class="cartao sumindo">
        <!-- O formulário de login não muda: mesmos ids (`email`, `senha`,
             `btn-entrar`, `btn-esqueci`, `erro-login`) e mesmas frases que
             estão hoje no arquivo. Ele continua sendo a porta de quem abre o
             aplicativo sem nenhum portão guardado. -->
    </div>

    <p class="rodape">Ingresso Ideal</p>
</div>
```

Nos `<script>`, acrescente na ordem — `chaveiro` antes de quem o usa, `parede-pwa` por último para não competir com o arranque:

```html
<script src="chaveiro.js?v=613"></script>
<script src="lista-eventos.js?v=613"></script>
<script src="virar-portao.js?v=613"></script>
<script src="controle.js?v=613"></script>
<script src="parede-pwa.js?v=613"></script>
```

E troque **todos** os `?v=612` do arquivo por `?v=613` — há teste que exige uma versão só por página.

- [ ] **Step 6: Escrever o CSS das barras**

Em `frontend/controle.css`, acrescente:

```css
/* ── A tela inicial ──────────────────────────────────────────────────────── */

.cabecalho { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.cabecalho img { height: 46px; }
.cabecalho .titulos { display: flex; flex-direction: column; line-height: 1.15; }
.cabecalho .titulos strong { font-size: 1.5rem; }
.cabecalho .titulos span { font-size: 1.05rem; color: var(--dim); }

.rotulo-secao {
    font-size: 1.15rem; color: var(--dim); text-align: center;
    margin: 24px 0 12px; font-weight: 700;
}

/* A engrenagem fica FORA da barra, como na imagem que o usuário mandou. Dentro
   dela, o toque no evento cairia na configuração por engano -- e no portão isso
   é a fila parada enquanto alguém procura o botão de voltar. */
.linha-evento { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }

.barra-evento {
    flex: 1; display: flex; align-items: center; gap: 14px;
    /* 64px: o alvo de toque de quem está de pé, no escuro, com uma mão. */
    min-height: 64px; padding: 12px 18px;
    background: var(--card); border: 1px solid var(--border); border-radius: 14px;
    color: var(--text); font-family: inherit; font-size: 1.25rem; font-weight: 700;
    text-align: left; cursor: pointer;
}
.barra-evento.destaque { justify-content: center; }
.barra-evento .nome-evento { flex: 1; }
.barra-evento .icone-ler { color: #60a5fa; display: flex; }

.luz {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid var(--dim); background: transparent; flex: none;
}
.luz.acesa { background: #16a34a; border-color: #16a34a; }

.marca-inativo {
    font-size: .78rem; font-weight: 600; color: var(--dim);
    border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px;
}

.botao-engrenagem {
    width: 52px; height: 52px; flex: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: var(--card); border: 1px solid var(--border);
    color: var(--dim); font-size: 1.6rem; font-family: inherit; cursor: pointer;
    margin: 0; padding: 0;
}

.cam-qr { width: 100%; border-radius: 12px; background: #000; aspect-ratio: 4/3; margin-top: 12px; }
```

- [ ] **Step 7: Rodar os testes**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_lista_eventos.py tests/test_controle_tela.py -v`
Expected: PASS. Se `test_controle_tela.py` acusar algo que saiu da tela (um id que ele procurava no bloco `#evento`), atualize aquele teste — o bloco mudou de arquivo na Task 9, e o teste tem de acompanhar.

- [ ] **Step 8: Commit**

```bash
git add frontend/lista-eventos.js frontend/controle.html frontend/controle.css tests/lista_eventos_harness.js tests/test_lista_eventos.py tests/test_controle_tela.py security_config.py
git commit -m "tela inicial: a lista de eventos com a luz de cada portao"
```

---

### Task 8: Virar portão, e trocar de evento

**Files:**
- Create: `frontend/virar-portao.js`
- Test: `tests/test_virar_portao.py`

**Interfaces:**
- Consumes: `window.chaveiro` (Task 5), `window.aparelhoAqui` (existe), `window.portariaDeposito` (existe), `window.AcessoConta` (existe).
- Produces: `window.virarPortao` com:
  - `decidirTroca({ pedido, carregado, naFila })` → `'ler' | 'trocar' | 'fila-cheia' | 'criar'` — **pura, e é o que os testes exercitam**
  - `abrir(evento_id, nome)` → executa a decisão
  - `criar(evento_id, sessao, elevacao)` → cria o portão no servidor e chama `aparelhoAqui.assumir(token, nome, dados)`

**Ordem:** este arquivo chama `window.Controle.comSenha` (Task 9) e
`window.aparelhoAqui.assumir` com três argumentos (Task 10) — os dois chegam
depois. Os testes desta task exercitam só `decidirTroca`, que é pura, então ela
fecha sozinha; o caminho completo só roda de ponta a ponta na Task 12.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/test_virar_portao.py` (harness igual ao da Task 5, apontando para `frontend/virar-portao.js` e `window.virarPortao`):

```python
# -*- coding: utf-8 -*-
"""O que acontece ao tocar na barra de um evento.

A trava da fila e o unico ponto aqui que perde dinheiro do cliente se errar:
trocar de evento com leitura pendente faz o que ficou para tras subir contado
no evento NOVO, e a contagem que o cliente pagou para ter sai errada sem que
ninguem descubra.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "virar_portao_harness.js")


def decidir(**caso):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"chamada": "decidirTroca", "argumentos": [caso]}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)["resultado"]


def test_evento_ja_carregado_neste_aparelho_vai_direto_para_a_leitura():
    """O caso do dia do evento: um toque, e a camera."""
    assert decidir(pedido="e-1", carregado="e-1", naFila=0) == "ler"


def test_evento_ja_carregado_vai_ler_MESMO_com_fila_pendente():
    """A fila e do proprio evento. Trava-la aqui pararia o portao por causa de
    um 4G ruim, que e exatamente quando a fila cresce."""
    assert decidir(pedido="e-1", carregado="e-1", naFila=40) == "ler"


def test_outro_evento_do_chaveiro_com_fila_zerada_troca():
    assert decidir(pedido="e-2", carregado="e-1", naFila=0) == "trocar"


def test_outro_evento_com_leitura_pendente_RECUSA():
    """O que ficou para tras subiria contado no evento novo."""
    assert decidir(pedido="e-2", carregado="e-1", naFila=1) == "fila-cheia"


def test_aparelho_que_ainda_nao_e_portao_cria():
    assert decidir(pedido="e-9", carregado="", naFila=0) == "criar"


def test_aparelho_novo_com_fila_de_outro_evento_ainda_recusa():
    """Fila sem evento carregado nao existe na pratica, mas se existir e a
    mesma perda: nao deixe passar."""
    assert decidir(pedido="e-9", carregado="e-1", naFila=3) == "fila-cheia"
```

E os testes de forma, no mesmo arquivo:

```python
def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_o_portao_nasce_com_TODOS_os_setores():
    """Portao sem setor recusa tudo na porta, com o laranja de 'outra porta',
    e o porteiro nao teria como saber por que. Restringir e escolha da
    engrenagem, feita depois."""
    assert "todosOsSetores" in _ler("frontend/virar-portao.js")


def test_o_nome_automatico_conta_os_portoes_que_ja_existem():
    """Decisao do usuario: nasce nomeado e ja le; renomear e na engrenagem."""
    texto = _ler("frontend/virar-portao.js")
    assert "'Portão '" in texto or '"Portão "' in texto


def test_a_sessao_e_encerrada_pelo_aparelho_js():
    """A ordem (token, signOut, navegar) ja esta resolvida la, e inverte-la nao
    da erro na tela: da um aparelho inutil no meio de um evento."""
    assert "aparelhoAqui.assumir" in _ler("frontend/virar-portao.js")
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_virar_portao.py -v`
Expected: FAIL.

- [ ] **Step 3: Criar o harness**

`tests/virar_portao_harness.js`, cópia do da Task 5 apontando para `frontend/virar-portao.js` e `window.virarPortao`. Ele precisa carregar `frontend/chaveiro.js` **antes**, porque o arquivo o referencia no arranque.

- [ ] **Step 4: Escrever o `virar-portao.js`**

```javascript
/**
 * O toque na barra do evento.
 *
 * Tres caminhos, e a decisao entre eles e pura -- `decidirTroca` -- porque o
 * unico que perde dinheiro do cliente se errar e o da troca de evento com fila
 * pendente. Leitura enfileirada sob o token do evento A, enviada depois de o
 * aparelho virar portao do evento B, sobe contada no B: a contagem que o
 * cliente pagou para ter sai errada e ninguem descobre.
 *
 * Por que o portao nasce validando TODOS os setores: um portao sem setor
 * recusa tudo na porta, com o laranja de "outra porta", e o porteiro nao tem
 * como saber por que. O dono acabou de dizer que quer ler -- restringir e
 * escolha da engrenagem, feita depois e com calma.
 */
(function () {
    'use strict';

    /**
     * @param caso.pedido     o evento em que o dono tocou
     * @param caso.carregado  o evento cuja carga esta neste aparelho ('' se nenhum)
     * @param caso.naFila     quantas leituras ainda nao subiram
     * @returns 'ler' | 'trocar' | 'fila-cheia' | 'criar'
     */
    function decidirTroca(caso) {
        caso = caso || {};
        // Mesmo evento: a fila e DELE. Travar aqui pararia o portao por causa
        // de um 4G ruim -- que e exatamente quando a fila cresce.
        if (caso.pedido && caso.pedido === caso.carregado) { return 'ler'; }
        if (caso.naFila > 0) { return 'fila-cheia'; }
        return window.chaveiro.procurar(caso.pedido) ? 'trocar' : 'criar';
    }

    function avisarFilaCheia(n) {
        var aviso = document.getElementById('erro-arranque');
        aviso.textContent = (n === 1
            ? 'Há 1 leitura que ainda não subiu'
            : 'Há ' + n + ' leituras que ainda não subiram')
            + ' para o servidor. Conecte este aparelho à internet e espere a '
            + 'fila zerar antes de trocar de evento: o que ficou para trás '
            + 'seria contado no evento errado.';
        aviso.classList.remove('sumindo');
    }

    /** Todos os setores do evento, para o portao nascer lendo. */
    function todosOsSetores(painel) {
        return (painel.setores || []).map(function (s) { return s.id; });
    }

    /**
     * Cria o portao deste aparelho e assume.
     *
     * `aparelhoAqui.assumir` e quem encerra a sessao, na ordem que ja esta
     * resolvida la: token, signOut, navegar. Inverte-la nao da erro na tela --
     * da um aparelho sem conta e sem token no meio de um evento.
     */
    function criar(evento_id, sessao, elevacao) {
        var cabecalhos = {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessao.access_token,
            'X-Elevacao': elevacao.token,
            'X-Navegador': window.AcessoConta.navegadorId()
        };
        return window.AcessoConta.pedir('/eventos/' + evento_id, {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        }).then(function (painel) {
            // O numero conta os portoes que ja existem NO EVENTO, e nao neste
            // aparelho: o dono ve a lista inteira na engrenagem, e dois
            // "Portão 1" ali seriam indistinguiveis.
            var nome = 'Portão ' + ((painel.aparelhos || []).length + 1);
            return window.AcessoConta.pedir(
                '/eventos/' + evento_id + '/aparelhos/aqui',
                {
                    method: 'POST', headers: cabecalhos,
                    body: JSON.stringify({
                        nome: nome, setores: todosOsSetores(painel)
                    })
                }
            ).then(function (r) {
                // O chaveiro NAO e gravado aqui: quem grava e o
                // `aparelhoAqui.assumir`, onde a ordem esta protegida --
                // chaveiro e token primeiro, `signOut` depois, navegar por
                // ultimo. Gravar aqui e assumir ali seriam dois lugares
                // decidindo a mesma ordem, e um deles acabaria errado.
                return window.aparelhoAqui.assumir(r.token, r.nome, {
                    evento_id: evento_id,
                    nome_evento: painel.evento.nome_evento,
                    aparelho_id: r.id,
                    nome_portao: r.nome,
                    token: r.token
                });
            });
        });
    }

    function irLer() { window.location.href = 'portaria.html'; }

    /**
     * O toque na barra. `criar` exige senha; os outros dois nao — o aparelho
     * ja provou que e portao daquele evento quando o token foi guardado.
     */
    function abrir(evento_id, nome) {
        return window.portariaDeposito.contarFila().catch(function () {
            return 0;                 // IndexedDB fora do ar: nao ha fila a proteger
        }).then(function (naFila) {
            var caminho = decidirTroca({
                pedido: evento_id,
                carregado: window.chaveiro.carregado(),
                naFila: naFila
            });

            if (caminho === 'ler') { return irLer(); }
            if (caminho === 'fila-cheia') { return avisarFilaCheia(naFila); }
            if (caminho === 'trocar') {
                window.chaveiro.carregar(evento_id);
                // A carga do evento anterior sai junto: ela e do OUTRO evento,
                // e a portaria abriria com o nome velho no topo recusando
                // ingresso bom como "OUTRA PORTA". A mesma marca que o
                // `aparelho.js` ja usa.
                try { localStorage.setItem('ideal_portaria_reconfigurado', '1'); }
                catch (e) { /* aba anonima */ }
                return window.portariaDeposito.esquecerFila().then(irLer, irLer);
            }
            return window.Controle.comSenha(evento_id, function (sessao, elevacao) {
                return criar(evento_id, sessao, elevacao);
            });
        });
    }

    window.virarPortao = { decidirTroca: decidirTroca, abrir: abrir, criar: criar };
})();
```

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_virar_portao.py -v`
Expected: PASS, 9 testes.

- [ ] **Step 6: Commit**

```bash
git add frontend/virar-portao.js tests/virar_portao_harness.js tests/test_virar_portao.py
git commit -m "portao: um toque na barra vira portao, com a trava da fila na troca de evento"
```

---

### Task 9: O `controle.js` vira só a engrenagem

**Files:**
- Modify: `frontend/controle.js` (arquivo inteiro reorganizado)
- Modify: `frontend/controle.html` (o bloco da engrenagem)
- Test: `tests/test_controle_tela.py`

**Interfaces:**
- Consumes: `window.AcessoConta`, `window.chaveiro`.
- Produces:
  - `window.Controle.abrirEngrenagem(evento_id, nome)` — a lista chama no toque na engrenagem
  - `window.Controle.comSenha(evento_id, tarefa)` — pede senha (login relâmpago se não houver sessão), roda `tarefa(sessao, elevacao)`, e sai da conta ao terminar se a sessão foi aberta por ela. `virar-portao.js` usa.
  - `window.Controle.fecharEngrenagem()`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `tests/test_controle_tela.py`:

```python
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
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py -v`
Expected: FAIL.

- [ ] **Step 3: Reescrever o `controle.js`**

O que **sai** do arquivo, inteiro: `mostrarCodigo`, `criarAparelho`, `novoCodigo`, `caixaDePareamento`, `enderecoDaPortaria`, `usarEsteAparelho`, `listarEventos`, `ehAparelhoDePortaria`, `abrir` e o desvio para a portaria.

O que **fica e continua igual**: `gravar` (com a repetição em elevação vencida), `gravarSetor`, `travarCampos`, `desenharFaixa`, `guardarElevacao`/`restaurarElevacao`, `doCampoParaISO`/`deISOParaCampo`, `cartaoDeSetor` e tudo o que ele monta, `cartaoDeAparelho` (menos os botões de código), `botoesDeSetor`, `setoresAcesos`, `importarCodigos`.

O que **entra**:

```javascript
    var CHAVE_EMAIL = 'ideal_control_email';

    /**
     * A senha, no aparelho que nao tem conta.
     *
     * No celular do porteiro nao existe sessao — ela foi encerrada quando o
     * aparelho virou portao, e e isso que impede quem ficar com ele de entrar
     * na conta do cliente. A engrenagem faz um login RELAMPAGO: entra, deixa
     * configurar por 15 minutos, e sai ao fechar.
     *
     * O e-mail fica lembrado; a senha, nunca. Ela vive no argumento desta
     * funcao e morre com ela — a mesma regra que o `entrarEElevar` ja segue.
     *
     * `prompt` de proposito para a senha: e a unica caixa de texto que o
     * navegador nao guarda em preenchimento automatico, e a senha do dono nao
     * pode ficar memorizada no celular do porteiro.
     */
    function comSenha(evento_id, tarefa) {
        return sessaoOuLogin(evento_id).then(function (r) {
            return tarefa(r.sessao, r.elevacao);
        });
    }

    function emailLembrado() {
        try { return localStorage.getItem(CHAVE_EMAIL) || ''; }
        catch (e) { return ''; }
    }

    function sessaoOuLogin(evento_id) {
        return window.AcessoConta.sessao().then(function (s) {
            if (s && elevado()) {
                return { sessao: s, elevacao: estado.elevacao };
            }
            var email = window.prompt(
                'E-mail da sua conta do Vibe — a mesma com que você acompanha '
                + 'os seus pedidos.', emailLembrado());
            if (!email) { return Promise.reject(new Error('cancelado')); }
            var senha = window.prompt('Senha desta conta. Ela libera as '
                + 'alterações por 15 minutos.');
            if (!senha) { return Promise.reject(new Error('cancelado')); }
            try { localStorage.setItem(CHAVE_EMAIL, email); } catch (e) { }
            return window.AcessoConta.entrarEElevar(email, senha, evento_id)
                .then(function (r) {
                    estado.sessao = r.sessao;
                    // A sessao foi aberta AQUI: e esta bandeira que faz o
                    // `fecharEngrenagem` saber que precisa desfaze-la. Uma
                    // sessao que ja existia (o dono no proprio celular) nao
                    // pode ser encerrada por fechar uma caixa de configuracao.
                    estado.sessaoDaEngrenagem = true;
                    guardarElevacao({
                        token: r.elevacao.token,
                        expira_em: r.elevacao.expira_em,
                        evento_id: evento_id
                    });
                    return { sessao: r.sessao, elevacao: r.elevacao };
                });
        });
    }

    function abrirEngrenagem(evento_id, nome) {
        estado.evento_id = evento_id;
        restaurarElevacao();
        return comSenha(evento_id, function () {
            document.getElementById('engrenagem').classList.remove('sumindo');
            document.getElementById('lista').classList.add('sumindo');
            document.getElementById('nome-evento-titulo').textContent = nome;
            return carregarPainel();
        }).catch(function () { /* cancelou: a lista continua na tela */ });
    }

    function fecharEngrenagem() {
        guardarElevacao(null);
        document.getElementById('engrenagem').classList.add('sumindo');
        document.getElementById('lista').classList.remove('sumindo');
        if (!estado.sessaoDaEngrenagem) { return Promise.resolve(); }
        estado.sessaoDaEngrenagem = false;
        estado.sessao = null;
        // A conta sai do aparelho. Este celular fica com o porteiro.
        return supabaseClient.auth.signOut().catch(function () { });
    }
```

No `cartaoDeSetor`, acrescente um grupo novo **antes** de `bloqueiosDoSetor`:

```javascript
    /**
     * Desligar o setor INTEIRO.
     *
     * Diferente de "Bloquear ingressos", logo abaixo, que suspende uma faixa de
     * numeros. Aqui a porta para de receber, e o motivo e o que o porteiro le
     * em voz alta para quem esta na fila.
     */
    function bloqueioDoSetorInteiro(s, edicaoAnterior) {
        var caixa = grupo('Bloquear este setor');

        var ajuda = document.createElement('p');
        ajuda.className = 'config-ajuda';
        ajuda.textContent = 'A portaria para de aceitar TODOS os ingressos deste '
            + 'setor e mostra o motivo que você escrever. Portão sem internet '
            + 'só recebe a mudança quando voltar a ter sinal.';
        caixa.appendChild(ajuda);

        if (s.bloqueado) {
            var agora = document.createElement('p');
            agora.className = 'config-ajuda';
            agora.textContent = 'Bloqueado: ' + (s.bloqueado_motivo || '');
            caixa.appendChild(agora);

            var liberar = document.createElement('button');
            liberar.type = 'button';
            liberar.className = 'secundario so-com-senha';
            liberar.id = 'setor-liberar-' + s.id;
            liberar.textContent = 'Liberar este setor';
            liberar.addEventListener('click', function () {
                gravarSetor(s.id, { bloqueado: false })
                    .then(function () { avisarSalvo(s.id); })
                    .catch(function () { /* `gravar()` ja avisou na tela */ });
            });
            caixa.appendChild(liberar);
            return caixa;
        }

        var rot = document.createElement('label');
        rot.setAttribute('for', 'setor-bloq-motivo-' + s.id);
        rot.textContent = 'Motivo (a portaria vai ler isto)';
        caixa.appendChild(rot);

        var motivo = document.createElement('input');
        motivo.type = 'text';
        motivo.id = 'setor-bloq-motivo-' + s.id;
        motivo.placeholder = 'Ex.: camarote interditado pelos bombeiros';
        motivo.value = edicaoAnterior ? (edicaoAnterior.setor_bloq_motivo || '') : '';
        caixa.appendChild(motivo);

        var botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'so-com-senha';
        botao.id = 'setor-bloquear-' + s.id;
        botao.textContent = 'Bloquear este setor';
        botao.addEventListener('click', function () {
            gravarSetor(s.id, {
                bloqueado: true, bloqueado_motivo: motivo.value
            }).then(function () { avisarSalvo(s.id); })
              .catch(function () { /* `gravar()` ja avisou na tela */ });
        });
        caixa.appendChild(botao);

        return caixa;
    }
```

Acrescente `setor_bloq_motivo: valor('setor-bloq-motivo')` à captura de `edicoesDeSetorAntes` dentro de `desenhar()` — sem isso, o dono digita o motivo e perde ao primeiro redesenho, como já acontecia com os outros campos do painel.

No bloco do evento, acrescente o botão de ativar/inativar:

```javascript
    function desenharAtivacao() {
        var botao = document.getElementById('btn-ativar-evento');
        var inativo = estado.painel.evento.status !== 'ativo';
        botao.textContent = inativo ? 'Ativar este evento' : 'Inativar este evento';
        botao.onclick = function () {
            if (!inativo && !window.confirm(
                    'Inativar "' + estado.painel.evento.nome_evento + '"? Todos '
                    + 'os portões param de aceitar ingresso. Portão sem internet '
                    + 'só recebe a mudança quando voltar a ter sinal.')) {
                return;
            }
            gravar('/eventos/' + estado.evento_id,
                   { status: inativo ? 'ativo' : 'encerrado' }, 'PATCH')
                .then(carregarPainel)
                .catch(function () { /* ja avisado */ });
        };
    }
```

Chame `desenharAtivacao()` no fim de `desenhar()`.

Em `cartaoDeAparelho`, apague o bloco inteiro de `btnNovoCodigo` (linhas 953-961 do arquivo de hoje) e acrescente a marca do portão deste aparelho, logo depois do título:

```javascript
        // Qual destes portoes e ESTE celular. Sem a marca, o dono renomeia ou
        // revoga o errado — e revogar desliga o aparelho na hora, no meio do
        // evento.
        var meu = window.chaveiro.procurar(estado.evento_id);
        if (meu && meu.aparelho_id === a.id) {
            var marca = document.createElement('p');
            marca.className = 'config-ajuda';
            marca.textContent = '★ Este é o portão deste aparelho.';
            el.appendChild(marca);
        }
```

Exporte no `window.Controle`: `abrirEngrenagem`, `fecharEngrenagem`, `comSenha`, além do que já está lá menos `mostrarCodigo`, `criarAparelho` e `novoCodigo`.

- [ ] **Step 4: Ajustar o `controle.html`**

O bloco `#evento` de hoje vira `#engrenagem`, com os quatro blocos nomeados. Sai o `#caixa-codigo` e sai o cartão "crie um aparelho para outro celular". O cartão "Usar ESTE aparelho na portaria" também sai — quem faz isso agora é o toque na barra.

```html
<div id="engrenagem" class="sumindo">
    <div id="faixa-elevacao" class="sumindo">
        <span id="faixa-tempo">Modo configuração</span>
        <button id="btn-sair-config" class="secundario">Fechar configuração</button>
    </div>

    <h1 id="nome-evento-titulo">Evento</h1>
    <div id="aviso-gravacao" class="aviso sumindo" role="status"></div>

    <div class="secao" id="bloco-evento">
        <h2>Evento</h2>
        <div class="cartao">
            <button id="btn-ativar-evento" class="so-com-senha">Inativar este evento</button>
            <label for="campo-nome-evento">Nome do evento</label>
            <input id="campo-nome-evento" type="text">
            <label for="campo-data">Data e hora</label>
            <input id="campo-data" type="datetime-local">
            <label for="campo-local">Local</label>
            <input id="campo-local" type="text">
            <button id="btn-gravar-evento" class="so-com-senha">Gravar dados do evento</button>
        </div>
    </div>

    <div class="secao" id="bloco-portoes">
        <h2>Portões</h2>
        <p class="config-ajuda">
            Todos os portões deste evento, de todos os celulares. O deste
            aparelho vem marcado com ★.
        </p>
        <div id="aparelhos"></div>
    </div>

    <div class="secao" id="bloco-setores">
        <h2>Setores</h2>
        <div id="setores"></div>
    </div>

    <div class="secao" id="bloco-este-aparelho">
        <h2>Este aparelho</h2>
        <button id="btn-sair-do-portao" class="secundario">Sair deste portão</button>
    </div>
</div>
```

O `#btn-sair-do-portao` chama `window.chaveiro.esquecer(evento_id)` e volta à lista. **Não apaga a fila** — a mesma regra do `desparear()` da portaria: o que a fila guarda é contagem que o cliente pagou para ter.

- [ ] **Step 5: Rodar os testes**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/controle.js frontend/controle.html tests/test_controle_tela.py
git commit -m "engrenagem: a configuracao inteira atras de uma senha, e sem nenhum codigo"
```

---

### Task 10: A portaria perde o pareamento por código, e o `aparelho.js` grava no chaveiro

**Files:**
- Modify: `frontend/portaria.html` (a tela `#tela-pareando`)
- Modify: `frontend/portaria.js` (`parear`, `irParaConfiguracao`)
- Modify: `frontend/aparelho.js`
- Test: `tests/test_portaria_tela.py`, `tests/test_aparelho_no_aparelho.py`

**Interfaces:**
- Consumes: `window.chaveiro` (Task 5).
- Produces: `aparelhoAqui.assumir` passa a aceitar um quinto dado e gravar no chaveiro antes de encerrar a sessão.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/test_portaria_tela.py`:

```python
def test_a_tela_de_digitar_codigo_saiu():
    """Decisao do usuario: retirar todas as opcoes de codigo.

    O caminho novo e o dono entrar com a conta dele NAQUELE celular e tocar na
    barra do evento. Nao ha mais codigo para anotar nem para digitar.
    """
    texto = _ler("frontend/portaria.html")
    assert "tela-pareando" not in texto


def test_o_botao_de_configurar_leva_a_lista_e_nao_ao_login():
    texto = _ler("frontend/portaria.js")
    assert "controle.html?configurar=1" not in texto


def test_a_trava_da_fila_continua_valendo_ao_sair_do_portao():
    """Ela protege a contagem que o cliente pagou para ter. Sair sem ela faz o
    que ficou para tras nunca subir."""
    assert "ainda não subiram" in _ler("frontend/portaria.js")
```

Em `tests/test_aparelho_no_aparelho.py`:

```python
def test_o_token_entra_no_chaveiro_ANTES_de_a_sessao_sair():
    """A ordem inteira deste arquivo existe por isso.

    Gravar o chaveiro depois do `signOut` deixaria o aparelho com token e sem
    entrada na lista: o evento sumiria da tela inicial do proprio portao que o
    esta lendo.
    """
    texto = _ler("frontend/aparelho.js")
    assert texto.index("chaveiro.guardar") < texto.index("signOut")
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_portaria_tela.py tests/test_aparelho_no_aparelho.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `frontend/portaria.html`, apague a `<div id="tela-pareando">` inteira e tire `'pareando'` da lista dentro de `mostrar()` no `portaria.js`. O aparelho que abrir sem token vai para a lista:

```javascript
    // Sem token, este celular nao e portao de nada. A casa e que resolve isso
    // agora -- o dono toca na barra do evento e o portao nasce ali. Nao ha
    // mais codigo para digitar.
    if (!estado.token) {
        window.location.replace('controle.html');
        return;
    }
```

Em `irParaConfiguracao`, troque o destino final:

```javascript
            // A lista, e nao mais a tela de login: a engrenagem e que pede a
            // senha agora, e ela mora la.
            window.location.href = 'controle.html';
```

Apague a função `parear` e o `#btn-parear` do HTML.

Em `frontend/aparelho.js`, dentro de `assumir`, logo depois do `setItem` do token e **antes** do `signOut`:

```javascript
            // O chaveiro, antes de a conta sair. Depois do `signOut` este
            // aparelho nao tem mais como saber o nome do evento -- e a barra
            // dele apareceria sem nome na tela inicial do proprio portao.
            if (window.chaveiro && dados) {
                window.chaveiro.guardar(dados);
            }
```

E acrescente `dados` como terceiro parâmetro de `assumir(token, nome, dados)`. O `virar-portao.js` da Task 8 já chama assim — este é o outro lado daquela chamada.

Atualize também o comentário de cabeçalho do arquivo, que hoje descreve três passos, para descrever os quatro: **token, chaveiro, `signOut`, navegar**. O token continua primeiro pela razão que já está escrita lá — é o que não dá para recuperar. O comentário é o que explica por que a ordem não pode mudar, e um comentário que descreve outra ordem é pior que nenhum.

- [ ] **Step 4: Rodar os testes**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_portaria_tela.py tests/test_aparelho_no_aparelho.py tests/test_virar_portao.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/portaria.html frontend/portaria.js frontend/aparelho.js tests/test_portaria_tela.py tests/test_aparelho_no_aparelho.py
git commit -m "portaria: sai a tela de digitar codigo; o chaveiro e gravado antes de a conta sair"
```

---

### Task 11: Manifesto, service worker, versão e a lista das estações

**Files:**
- Modify: `frontend/app.webmanifest`
- Modify: `frontend/sw.js`
- Modify: `security_config.py`
- Modify: `frontend/controle.html`, `frontend/portaria.html` (o `?v=`)
- Test: `tests/test_portaria_pwa.py`, `tests/test_aplicativo_unico.py`

**Interfaces:**
- Consumes: todos os arquivos novos das Tasks 5 a 8.
- Produces: o aplicativo instalado serve os arquivos novos sem rede.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/test_portaria_pwa.py`:

```python
def test_o_manifesto_e_standalone_e_nao_fullscreen():
    """A imagem de referencia mostra o relogio e a bateria no alto.

    `fullscreen` engole a barra de status do celular, e o porteiro perde as
    duas coisas que ele mais olha durante um evento.
    """
    with open(os.path.join(FRENTE, "app.webmanifest"), encoding="utf-8") as f:
        m = json.load(f)
    assert m["display"] == "standalone"


def test_o_service_worker_guarda_os_arquivos_novos():
    """Sem eles no cache, o aplicativo instalado abre a tela inicial sem a
    lista -- e a tela inicial e a unica que o porteiro ve sem rede."""
    texto = _ler("frontend/sw.js")
    for arquivo in ("chaveiro.js", "lista-eventos.js",
                    "virar-portao.js", "parede-pwa.js"):
        assert arquivo in texto
```

Em `tests/test_controle_tela.py` o teste `test_a_versao_dos_scripts_e_uma_so` já existe e vai acusar se algum `?v=` ficou para trás.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_portaria_pwa.py tests/test_controle_tela.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`app.webmanifest`: confirme `"display": "standalone"` (já está) e acrescente, para o navegador que suporta:

```json
  "display_override": ["standalone", "minimal-ui"],
```

`sw.js`: acrescente os quatro arquivos novos à lista de itens pré-cacheados, ao lado de `controle.js`, e **suba o número da versão do cache** — sem isso o aplicativo instalado serve a versão velha para sempre.

`security_config.py`: confirme que `PAINEL_ARQUIVOS` tem `chaveiro.js`, `lista-eventos.js`, `virar-portao.js` e `parede-pwa.js`.

`controle.html` e `portaria.html`: todo `?v=` vira `?v=613`.

- [ ] **Step 4: Rodar a suite inteira**

Run: `.\venv\Scripts\python.exe -m pytest tests/ -v`
Expected: PASS. Testes que pedem variável de ambiente (`test_portaria_paridade.py`) pulam, e isso é o esperado.

- [ ] **Step 5: Commit**

```bash
git add frontend/app.webmanifest frontend/sw.js frontend/controle.html frontend/portaria.html security_config.py tests/test_portaria_pwa.py
git commit -m "pwa: manifesto standalone, os arquivos novos no cache, versao 613"
```

---

### Task 12: Ver funcionando, e publicar

**Files:**
- Nenhum arquivo novo. Verificação e publicação.

**Interfaces:**
- Consumes: tudo.
- Produces: a mudança no ar, com o agente na mesma leva.

- [ ] **Step 1: Rodar o aplicativo e olhar a tela**

Use a skill `rodar-app`. Confira, com os próprios olhos:

1. `/ic/` abre na lista, com o cabeçalho, a barra "Novo Evento" com o `+`, o rótulo "Meus Eventos" e as barras de evento.
2. Um evento sem portão neste navegador tem a luz apagada; tocar nele pede a senha.
3. Depois de virar portão, recarregar `/ic/` mostra aquele evento **verde**, e tocar nele vai direto para a leitura.
4. A engrenagem pede e-mail e senha e abre os quatro blocos.
5. Não há, em tela nenhuma, a palavra "código" ligada a aparelho.

- [ ] **Step 2: Conferir o estado do repositório**

Run: `.\ferramentas\conferir.ps1`

Outra sessão pode ter deixado trabalho na pasta, e o `publicar.ps1` varre a pasta inteira. Resolva o que aparecer antes de seguir.

- [ ] **Step 3: Rodar o SQL da Task 1 no Supabase**

Abra `sql/schema_acesso_setor_bloqueado.sql`, cole no SQL Editor do Supabase e rode. **Antes** de publicar: o código que lê as colunas sobe agora, e sem elas o painel do dono volta erro.

- [ ] **Step 4: Publicar as Edge Functions**

Run: `.\node_modules\.bin\supabase functions deploy acesso-conta portaria --project-ref vwbtitjlpelrcnsytzqw`

- [ ] **Step 5: Publicar o site**

Run: `.\publicar.ps1 "Ideal Control: a lista de eventos, o portao por um toque e a engrenagem com senha"`

Nunca `-SemFreio`. Os freios conferem rascunho, segredo e se o motor sobe.

- [ ] **Step 6: Publicar o agente, na mesma leva**

Run: `.\publicar_agente.ps1 1.2.107`

**Não é opcional e não é "desta vez precisa".** O `NewProd.exe` embute uma cópia do frontend; a estação instalada depois desta publicação nasceria com o painel do build anterior — a tela velha, sem a lista. O número precisa ser **novo**: republicar um número existente é ignorado em silêncio por todas as estações.

- [ ] **Step 7: Conferir que chegou**

Run: `.\ferramentas\conferir.ps1`

Espere: nenhum commit pendente, agente em sincronia entre repositório, manifesto e máquina local.

---

## O que este plano NÃO faz

- **Não apaga as rotas de código do servidor.** `POST /eventos/{id}/aparelhos`, `POST /aparelhos/{id}/codigo` e `POST /portaria/entrar` continuam vivas. É a rede de segurança do release; a limpeza é de um release seguinte, depois de um evento de verdade.
- **Não chaveia a carga do IndexedDB por evento.** O chaveiro sabe de vários eventos, o aparelho tem um carregado. Trocar exige fila zerada.
- **Não mexe no `acesso_portaria.py`** nem no resto do Python do Render. O backend virou Edge Function em 16/08/2026; o Python é legado e o teste de paridade dele pula sem a variável de ambiente.
