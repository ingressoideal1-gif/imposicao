# Ideal Control — a conta do cliente traz os pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O QR vira só o convite para instalar o aplicativo; a gráfica libera o acesso do cliente com senha provisória; o cliente entra, vê os pedidos já impressos em "Meus Pedidos" e "Carregar" transforma o pedido em evento — sem QR do Pedido, sem `evento.html`, e com "Aparelho" no lugar de "Portão".

**Architecture:** No servidor, uma tabela nova `producao_acesso_contas` (conta ↔ `id_cliente`) e um módulo `_compartilhado/contas.ts` que fala com a admin API do GoTrue; a `acesso-conta` ganha posse por cliente, `/minha-conta`, `/meus-pedidos` e `/pedidos/{p}/carregar` (o `reivindicar` refatorado, sem token, devolvendo a elevação); a `acesso-interno` ganha o bloco "Acesso do cliente". No frontend, três arquivos novos na casa — `conta.js` (entrar, trocar senha, sair), `meus-pedidos.js` (a lista) e `carregar-pedido.js` (a caixa e a pergunta do aparelho) — e a barra "Novo Evento" vira "Meus Pedidos". Sai a câmera da casa, sai `evento.html`, sai o botão "QR do Evento".

**Tech Stack:** JavaScript ES5 em IIFE sem framework, servido pela Vercel; Deno/TypeScript nas Edge Functions do Supabase (testes com `npx deno test`); pytest + harness Node/puppeteer para o frontend; PowerShell para SQL (`ferramentas/rodar_sql.ps1`) e publicação.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-17-ideal-control-conta-do-cliente-design.md`. Em dúvida, ela manda.
- **Português em tudo o que o usuário lê** — rótulos, avisos, erros, comentários.
- **"Aparelho", nunca "Portão"** em texto de tela (rótulo, aviso, `aria-label`, nome automático). Nomes internos que já existem (`virar-portao.js`, `ideal_control_portoes`, `nome_portao`) **ficam** — trocar chave de `localStorage` em uso exige migração e não vale o risco.
- **ES5 em IIFE** nos arquivos de `frontend/`: sem `let`, `const`, arrow, template string, `class`.
- **Texto, nunca HTML**: nome de evento, setor, aparelho, cliente, e-mail — sempre `textContent`.
- **Nenhuma caixa nativa** (`prompt`/`confirm`/`alert`) — usar `caixaConfirmar.perguntar` ou DOM próprio.
- **Todo botão tem rótulo em texto**; a tela se explica sozinha; toda trava tem saída na própria tela.
- **Nenhum arquivo de outra origem** no PWA; nada de CDN.
- **`?v=` único por página**: toda tag nova em `controle.html` usa o mesmo número das outras (hoje `629`); o `publicar.ps1` renumera tudo na publicação.
- **Arquivo novo em `frontend/` que a casa usa entra em `security_config.PAINEL_ARQUIVOS`** e na lista `ARQUIVOS` do `frontend/sw.js`.
- **RLS ligado e zero políticas** em toda tabela `producao_acesso_*`; só a `service_role` das Edge Functions lê e escreve.
- **Segredo nunca vai para a tela**: hash, token, `service_role` não saem das rotas. A senha provisória sai uma vez, na resposta do POST que a criou.
- **Rodar os testes:** `.\venv\Scripts\python.exe -m pytest tests/<arquivo> -v` na raiz. Deno: `npx deno test --allow-env --allow-read supabase/functions/<caminho>_test.ts` (o `npx deno` já funciona nesta máquina, versão 2.9.5).
- **SQL sai como arquivo completo, pronto para colar**, com "COMO DESFAZER" no fim, e roda pelo `.\ferramentas\rodar_sql.ps1 sql\<arquivo>.sql`.
- **Commits diretos na `main`**, mensagem em português, sem publicar. Publicar é ação do usuário: `.\publicar.ps1 "<msg>" -Sim` e `.\publicar_agente.ps1 <versão nova>` na mesma leva.

## Mapa de arquivos

| Arquivo | Papel | Tarefa |
|---|---|---|
| `sql/schema_acesso_contas.sql` *(novo)* | tabela `producao_acesso_contas` + função `acesso_usuario_por_email` | 1 |
| `supabase/functions/_compartilhado/auth_admin.ts` *(novo)* | criar usuário, achar por e-mail, trocar senha — a admin API do GoTrue | 2 |
| `supabase/functions/_compartilhado/contas.ts` *(novo)* | senha provisória, ligar conta ↔ cliente, marcar troca | 2 |
| `supabase/functions/acesso-conta/puro.ts` | `pertenceAConta`, `montarMeusPedidos`, `nomeDaFicha` | 3, 4 |
| `supabase/functions/acesso-conta/index.ts` | posse por cliente, `/minha-conta`, `/minha-conta/senha`, `/meus-pedidos`, `/pedidos/{p}/carregar` | 3, 4, 5 |
| `supabase/functions/acesso-interno/puro.ts` | `URL_DE_INSTALACAO` | 6 |
| `supabase/functions/acesso-interno/index.ts` | `cliente` no painel, `/clientes/{id}/contas`, `/contas/{uid}/nova-senha`, `/instalacao` | 6 |
| `frontend/controle.html`, `lista-eventos.js`, `virar-portao.js`, `controle.js`, `portaria.html`, `portaria.js` | vocabulário Aparelho | 7 |
| `frontend/acesso-conta.js` | `minhaConta`, `trocarSenha`, `sair`, `esqueciSenha` sem e-mail | 8 |
| `frontend/conta.js` *(novo)* | tela de entrar, trocar senha, sair da conta, decisão de abertura | 8 |
| `frontend/meus-pedidos.js` *(novo)* | a lista de pedidos | 9 |
| `frontend/carregar-pedido.js` *(novo)* | a caixa do Carregar e a pergunta do aparelho | 10 |
| `frontend/controle.html`, `controle.css`, `menu-geral.js`, `sw.js`, `security_config.py` | barra Meus Pedidos, blocos novos, câmera fora, cache | 8–11 |
| `frontend/evento.html`, `evento.js`, `ler-qr.js`, `vercel.json`, `script.js`, `index.html` | o que sai | 11 |
| `frontend/ideal-control.js`, `index.html` | bloco "Acesso do cliente" + QR de instalação | 12 |
| `docs/controle_acesso.md`, `CHANGELOG.md` | documentação | 13 |

---

### Task 1: A tabela `producao_acesso_contas` e a função que acha a conta pelo e-mail

**Files:**
- Create: `sql/schema_acesso_contas.sql`
- Test: `tests/test_schema_acesso_contas.py`

**Interfaces:**
- Produces: tabela `producao_acesso_contas (auth_user_id uuid, id_cliente int, email text, criada_aqui bool, senha_provisoria_em timestamptz, criado_por uuid, criado_em timestamptz, ativo bool)` com PK `(auth_user_id, id_cliente)`; função `public.acesso_usuario_por_email(p_email text) returns uuid` (SECURITY DEFINER, só `service_role`).

- [ ] **Step 1: Escrever o teste do arquivo SQL**

`tests/test_schema_acesso_contas.py`:

```python
# -*- coding: utf-8 -*-
"""A tabela que liga a conta do cliente (auth.users) ao cliente do ERP.

Ate 17/08/2026 nao existia conta de cliente nenhuma: as 25 contas do projeto
eram a equipe do ERP. A grafica passa a liberar o acesso com senha provisoria,
e esta tabela e o unico lugar que sabe qual conta e de qual cliente.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, "sql", "schema_acesso_contas.sql")


def _sql():
    with open(SQL, encoding="utf-8") as f:
        return f.read()


def _sem_comentarios():
    return "\n".join(
        linha for linha in _sql().splitlines()
        if not linha.lstrip().startswith("--")
    )


def test_o_arquivo_existe():
    assert os.path.exists(SQL)


def test_cria_a_tabela_com_as_colunas_da_spec():
    s = _sem_comentarios()
    assert re.search(r"CREATE TABLE IF NOT EXISTS producao_acesso_contas", s, re.I)
    for coluna in ("auth_user_id", "id_cliente", "email", "criada_aqui",
                   "senha_provisoria_em", "criado_por", "criado_em", "ativo"):
        assert coluna in s, f"falta a coluna {coluna}"
    assert re.search(r"PRIMARY KEY \(auth_user_id, id_cliente\)", s, re.I), (
        "a chave e o par conta+cliente: uma conta pode servir a mais de um cliente"
    )


def test_rls_ligado_e_nenhuma_politica():
    s = _sem_comentarios()
    assert re.search(r"ALTER TABLE producao_acesso_contas ENABLE ROW LEVEL SECURITY", s, re.I)
    assert "CREATE POLICY" not in s.upper(), (
        "zero politicas: so a service_role das Edge Functions le e escreve"
    )


def test_a_funcao_que_acha_a_conta_pelo_email_e_security_definer_e_so_da_service_role():
    s = _sem_comentarios()
    assert re.search(r"FUNCTION public\.acesso_usuario_por_email\(p_email text\)", s, re.I)
    assert "SECURITY DEFINER" in s.upper()
    assert re.search(r"REVOKE ALL ON FUNCTION public\.acesso_usuario_por_email", s, re.I)
    assert re.search(r"GRANT EXECUTE ON FUNCTION public\.acesso_usuario_por_email\(text\) TO service_role", s, re.I)


def test_pode_rodar_mais_de_uma_vez():
    s = _sem_comentarios()
    assert "IF NOT EXISTS" in s.upper()
    assert "CREATE OR REPLACE FUNCTION" in s.upper()


def test_tem_como_desfazer_no_fim():
    assert "COMO DESFAZER" in _sql()
    assert "DROP TABLE IF EXISTS producao_acesso_contas" in _sql()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_schema_acesso_contas.py -v`
Expected: FAIL em `test_o_arquivo_existe`.

- [ ] **Step 3: Escrever o SQL**

`sql/schema_acesso_contas.sql`:

```sql
-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — a conta do cliente, ligada ao cliente do ERP
-- Prefixo: producao_acesso_
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-17
-- Spec: docs/superpowers/specs/2026-08-17-ideal-control-conta-do-cliente-design.md
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O QUE ESTE ARQUIVO FAZ
--
--   Cria UMA tabela e UMA funcao. Nao mexe em `clientes` nem em `auth.users`.
--   Pode ser rodado mais de uma vez.
--
--   Supabase -> SQL Editor -> cole tudo -> Run. Ou:
--   .\ferramentas\rodar_sql.ps1 sql\schema_acesso_contas.sql
--
-- POR QUE ELE EXISTE
--
--   Ate 17/08/2026 nao havia conta de cliente nenhuma: as 25 contas do projeto
--   sao a equipe do ERP. E o banco nao tinha coluna ligando conta a cliente.
--   A grafica passa a liberar o acesso do cliente com uma senha provisoria, e
--   esta tabela e o unico lugar que sabe QUAL conta e de QUAL cliente.
--
-- POR QUE A CHAVE E O PAR (conta, cliente)
--
--   Uma conta pode servir a mais de um cliente (a conta de teste da grafica) e
--   um cliente pode ter mais de uma pessoa com acesso. O caso comum e 1:1; a
--   chave composta so nao proibe o resto.
--
-- POR QUE `criada_aqui`
--
--   A grafica so redefine a senha de conta que ELA criou. Um e-mail que ja tinha
--   conta (um funcionario, alguem de outro cliente) e apenas LIGADO ao cliente,
--   e a senha dele fica em paz. Sem esta coluna nao daria para saber a
--   diferenca depois.
--
-- POR QUE `senha_provisoria_em`
--
--   Enquanto estiver preenchida, o aplicativo nao passa da tela "Escolha a sua
--   senha". Vira nula quando o cliente troca. "Nova senha provisoria" a preenche
--   de novo.
--
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS producao_acesso_contas (
    auth_user_id        UUID        NOT NULL,          -- auth.users.id
    id_cliente          INTEGER     NOT NULL,          -- clientes.id_cliente
    email               TEXT        NOT NULL,          -- copia, so para a tela
    criada_aqui         BOOLEAN     NOT NULL DEFAULT false,
    senha_provisoria_em TIMESTAMPTZ,                   -- nulo = ja trocou
    criado_por          UUID,                          -- quem liberou (auth.users.id)
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ativo               BOOLEAN     NOT NULL DEFAULT true,
    PRIMARY KEY (auth_user_id, id_cliente)
);

CREATE INDEX IF NOT EXISTS idx_acesso_contas_cliente
    ON producao_acesso_contas (id_cliente);

-- RLS ligado e NENHUMA politica: com a chave anonima nao se le nem se escreve
-- uma linha. So a service_role das Edge Functions passa.
ALTER TABLE producao_acesso_contas ENABLE ROW LEVEL SECURITY;

-- A conta pelo e-mail. `auth.users` nao esta exposta ao PostgREST, e a admin
-- API do GoTrue nao filtra por e-mail. Esta funcao e o unico caminho, e ela
-- devolve SO o id: nada mais de `auth.users` sai por aqui.
CREATE OR REPLACE FUNCTION public.acesso_usuario_por_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
    SELECT id FROM auth.users
     WHERE lower(email) = lower(trim(p_email))
     ORDER BY created_at ASC
     LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.acesso_usuario_por_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acesso_usuario_por_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.acesso_usuario_por_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_usuario_por_email(text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
--
--   DROP FUNCTION IF EXISTS public.acesso_usuario_por_email(text);
--   DROP TABLE IF EXISTS producao_acesso_contas;
--
-- ══════════════════════════════════════════════════════════════════════════════
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_schema_acesso_contas.py -v`
Expected: 6 passed.

- [ ] **Step 5: Rodar o SQL no banco**

Run: `.\ferramentas\rodar_sql.ps1 sql\schema_acesso_contas.sql`
Expected: `RODOU.` A tabela nasce vazia; nada mais muda.

- [ ] **Step 6: Commit**

```bash
git add sql/schema_acesso_contas.sql tests/test_schema_acesso_contas.py
git commit -m "banco: a tabela que liga a conta do cliente ao cliente do ERP, e a funcao que acha a conta pelo e-mail"
```

---

### Task 2: `auth_admin.ts` e `contas.ts` — criar conta, ligar, senha provisória

**Files:**
- Create: `supabase/functions/_compartilhado/auth_admin.ts`
- Create: `supabase/functions/_compartilhado/contas.ts`
- Test: `supabase/functions/_compartilhado/contas_test.ts`

**Interfaces:**
- Consumes: `banco(metodo, caminho, corpo?, prefer?)` de `banco.ts`; `Recusa(status, detail)` de `sessao.ts`; `ALFABETO_CODIGO` não é exportado — o alfabeto se repete aqui de propósito com o mesmo conteúdo.
- Produces:
  - `senhaProvisoria(): string` (8 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789`)
  - `emailLimpo(valor: unknown): string` (minúsculo, sem espaços; lança `Recusa(422)` se não parecer e-mail)
  - `clientesDaConta(userId: string): Promise<number[]>`
  - `contaPrecisaTrocarSenha(userId: string): Promise<boolean>`
  - `marcarSenhaTrocada(userId: string): Promise<void>`
  - `contasDoCliente(idCliente: number): Promise<{auth_user_id, email, criada_aqui, senha_provisoria, criado_em}[]>`
  - `liberarAcesso(idCliente: number, email: string, criadoPor: string): Promise<{email, ja_tinha_conta: boolean, senha_provisoria: string|null}>`
  - `novaSenhaProvisoria(authUserId: string): Promise<{senha_provisoria: string}>`
  - `auth_admin.ts`: `usuarioPorEmail(email): Promise<string|null>`, `criarUsuario(email, senha, metadata): Promise<{id: string}>`, `trocarSenhaDoUsuario(id, senha): Promise<void>`

- [ ] **Step 1: Escrever o teste das partes puras**

`supabase/functions/_compartilhado/contas_test.ts`:

```ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { ALFABETO_SENHA, emailLimpo, senhaProvisoria } from "./contas.ts";
import { Recusa } from "./sessao.ts";

Deno.test("senha provisoria: 8 simbolos, sem 0 O 1 I L", () => {
  for (let i = 0; i < 200; i++) {
    const s = senhaProvisoria();
    assertEquals(s.length, 8);
    for (const c of s) assert(ALFABETO_SENHA.includes(c), `simbolo fora do alfabeto: ${c}`);
    for (const proibido of "0O1Il") assert(!s.includes(proibido));
  }
});

Deno.test("senha provisoria: duas seguidas nao sao iguais", () => {
  assert(senhaProvisoria() !== senhaProvisoria());
});

Deno.test("e-mail: minusculo e sem espacos", () => {
  assertEquals(emailLimpo("  Daniel@Exemplo.com "), "daniel@exemplo.com");
});

Deno.test("e-mail: o que nao parece e-mail e recusado com 422", () => {
  for (const ruim of ["", "daniel", "daniel@", "@exemplo.com", null, undefined, "a b@c.d"]) {
    const e = assertThrows(() => emailLimpo(ruim), Recusa);
    assertEquals(e.status, 422);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx deno test --allow-env --allow-read supabase/functions/_compartilhado/contas_test.ts`
Expected: erro de módulo não encontrado (`contas.ts`).

- [ ] **Step 3: Escrever `auth_admin.ts`**

```ts
/**
 * A admin API do GoTrue, com a service_role que a Edge Function ja tem.
 *
 * Tres coisas, e so tres: achar uma conta pelo e-mail, criar uma conta com
 * senha, trocar a senha de uma conta. Nada aqui devolve token nem hash.
 *
 * `usuarioPorEmail` passa pelo banco (a funcao SQL `acesso_usuario_por_email`,
 * SECURITY DEFINER, so da service_role) porque `auth.users` nao esta exposta
 * ao PostgREST e a admin API nao filtra por e-mail -- listar todos os usuarios
 * para achar um seria pagina por pagina, e um dia sao milhares.
 */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";

function ambiente(): { url: string; chave: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chave) {
    throw new Recusa(503, "SUPABASE_SERVICE_ROLE_KEY nao esta no ambiente");
  }
  return { url, chave };
}

async function admin(metodo: string, caminho: string, corpo: unknown): Promise<any> {
  const { url, chave } = ambiente();
  const r = await fetch(`${url}/auth/v1/admin/${caminho}`, {
    method: metodo,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  if (!r.ok) {
    // O GoTrue responde `{msg}` ou `{error_description}`; nenhum dos dois
    // carrega segredo. Cortado, para nao virar um erro de tela quilometrico.
    throw new Recusa(502, `o servico de contas recusou (${r.status}): ${texto.slice(0, 200)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

export async function usuarioPorEmail(email: string): Promise<string | null> {
  const r = await banco("POST", "rpc/acesso_usuario_por_email", { p_email: email });
  return r ? String(r) : null;
}

export async function criarUsuario(
  email: string,
  senha: string,
  metadata: Record<string, unknown>,
): Promise<{ id: string }> {
  const u = await admin("POST", "users", {
    email,
    password: senha,
    // Confirmado na criacao: nao ha e-mail de confirmacao neste projeto (sem
    // SMTP), e a conta e criada pela grafica, que conhece o cliente.
    email_confirm: true,
    user_metadata: metadata,
  });
  if (!u?.id) throw new Recusa(502, "o servico de contas nao devolveu a conta criada");
  return { id: String(u.id) };
}

export async function trocarSenhaDoUsuario(id: string, senha: string): Promise<void> {
  await admin("PUT", `users/${encodeURIComponent(id)}`, { password: senha });
}
```

- [ ] **Step 4: Escrever `contas.ts`**

```ts
/**
 * A conta do cliente: quem e de qual cliente, senha provisoria, troca.
 *
 * Tudo o que toca `producao_acesso_contas` mora aqui, para a `acesso-conta`
 * (o cliente) e a `acesso-interno` (a grafica) lerem a MESMA definicao de
 * "conta ligada a cliente".
 */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import { criarUsuario, trocarSenhaDoUsuario, usuarioPorEmail } from "./auth_admin.ts";

// O mesmo alfabeto do codigo de pareamento: sem 0 O 1 I L, que se confundem
// quando ditados por telefone -- e a senha provisoria e ditada por telefone.
export const ALFABETO_SENHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO_SENHA = 8;

export function senhaProvisoria(): string {
  const bytes = new Uint8Array(TAMANHO_SENHA * 4);
  crypto.getRandomValues(bytes);
  let saida = "";
  let i = 0;
  while (saida.length < TAMANHO_SENHA) {
    const b = bytes[i++ % bytes.length];
    // Rejeicao do resto, como no sortearCodigo: sem vies para o comeco do alfabeto.
    if (b < 248) saida += ALFABETO_SENHA[b % ALFABETO_SENHA.length];
  }
  return saida;
}

const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailLimpo(valor: unknown): string {
  const e = String(valor ?? "").trim().toLowerCase();
  if (!PARECE_EMAIL.test(e)) throw new Recusa(422, "escreva um e-mail valido");
  return e;
}

export async function clientesDaConta(userId: string): Promise<number[]> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_contas?auth_user_id=eq.${userId}&ativo=eq.true&select=id_cliente`,
  )) ?? [];
  return [...new Set(linhas.map((l: any) => Number(l.id_cliente)).filter(Boolean))];
}

export async function contaPrecisaTrocarSenha(userId: string): Promise<boolean> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_contas?auth_user_id=eq.${userId}&ativo=eq.true` +
      "&select=senha_provisoria_em",
  )) ?? [];
  return linhas.some((l: any) => Boolean(l.senha_provisoria_em));
}

export async function marcarSenhaTrocada(userId: string): Promise<void> {
  await banco(
    "PATCH",
    `producao_acesso_contas?auth_user_id=eq.${userId}`,
    { senha_provisoria_em: null },
    "return=minimal",
  );
}

export async function contasDoCliente(idCliente: number): Promise<any[]> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_contas?id_cliente=eq.${idCliente}&ativo=eq.true` +
      "&select=auth_user_id,email,criada_aqui,senha_provisoria_em,criado_em&order=criado_em.asc",
  )) ?? [];
  return linhas.map((l: any) => ({
    auth_user_id: l.auth_user_id,
    email: l.email,
    criada_aqui: Boolean(l.criada_aqui),
    senha_provisoria: Boolean(l.senha_provisoria_em),
    criado_em: l.criado_em,
  }));
}

/**
 * Libera o acesso de um cliente para um e-mail.
 *
 * E-mail que JA tem conta: so liga, sem mexer na senha -- nunca redefinimos a
 * senha de uma conta que nao criamos. E-mail novo: cria com senha provisoria,
 * que sai UMA vez na resposta e nao e guardada em claro em lugar nenhum.
 */
export async function liberarAcesso(
  idCliente: number,
  email: string,
  criadoPor: string,
): Promise<{ email: string; ja_tinha_conta: boolean; senha_provisoria: string | null }> {
  const e = emailLimpo(email);
  const existente = await usuarioPorEmail(e);
  if (existente) {
    await banco("POST", "producao_acesso_contas?on_conflict=auth_user_id,id_cliente", {
      auth_user_id: existente,
      id_cliente: idCliente,
      email: e,
      criada_aqui: false,
      senha_provisoria_em: null,
      criado_por: criadoPor,
      ativo: true,
    }, "resolution=merge-duplicates,return=minimal");
    return { email: e, ja_tinha_conta: true, senha_provisoria: null };
  }
  const senha = senhaProvisoria();
  const criado = await criarUsuario(e, senha, { origem: "ideal-control", id_cliente: idCliente });
  await banco("POST", "producao_acesso_contas", {
    auth_user_id: criado.id,
    id_cliente: idCliente,
    email: e,
    criada_aqui: true,
    senha_provisoria_em: new Date().toISOString(),
    criado_por: criadoPor,
    ativo: true,
  }, "return=minimal");
  return { email: e, ja_tinha_conta: false, senha_provisoria: senha };
}

/** So para conta que a grafica criou. A anterior deixa de valer no mesmo ato. */
export async function novaSenhaProvisoria(authUserId: string): Promise<{ senha_provisoria: string }> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_contas?auth_user_id=eq.${authUserId}&criada_aqui=eq.true&select=auth_user_id`,
  )) ?? [];
  if (!linhas.length) {
    throw new Recusa(403, "esta conta nao foi criada pela grafica; a senha dela se recupera no Vibe");
  }
  const senha = senhaProvisoria();
  await trocarSenhaDoUsuario(authUserId, senha);
  await banco(
    "PATCH",
    `producao_acesso_contas?auth_user_id=eq.${authUserId}`,
    { senha_provisoria_em: new Date().toISOString() },
    "return=minimal",
  );
  return { senha_provisoria: senha };
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx deno test --allow-env --allow-read supabase/functions/_compartilhado/contas_test.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_compartilhado/auth_admin.ts supabase/functions/_compartilhado/contas.ts supabase/functions/_compartilhado/contas_test.ts
git commit -m "servidor: a conta do cliente -- criar, ligar ao cliente, senha provisoria (admin API do GoTrue)"
```

---
### Task 3: `acesso-conta` — posse por cliente, `/minha-conta` e `/minha-conta/senha`

**Files:**
- Modify: `supabase/functions/acesso-conta/puro.ts` (acrescentar `pertenceAConta`)
- Modify: `supabase/functions/acesso-conta/index.ts` (`eventoDoDono`, `meusEventos`, rotas novas)
- Test: `supabase/functions/acesso-conta/puro_test.ts` (criar se não existir)

**Interfaces:**
- Consumes: `clientesDaConta`, `contaPrecisaTrocarSenha`, `marcarSenhaTrocada` (Task 2); `trocarSenhaDoUsuario` de `auth_admin.ts`; `conferirSenha(email, senha)` já existe em `index.ts:136-149`.
- Produces: `pertenceAConta(evento: {dono_auth_id?, id_cliente?}, userId: string, clientes: number[]): boolean`; `GET /minha-conta` → `{ clientes: [{id_cliente, nome}], precisa_trocar_senha }`; `POST /minha-conta/senha { senha_atual, senha_nova }` → `{ ok: true }`.

- [ ] **Step 1: Teste da regra pura de posse**

Acrescentar em `supabase/functions/acesso-conta/puro_test.ts` (criar com o cabeçalho de import se o arquivo não existir):

```ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { pertenceAConta } from "./puro.ts";

Deno.test("posse: o evento e da conta que o criou, mesmo sem cliente ligado", () => {
  assert(pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u1", []));
});

Deno.test("posse: o evento e de toda conta ligada ao MESMO cliente", () => {
  assert(pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u2", [14, 60928]));
});

Deno.test("posse: outra conta, outro cliente -- nao", () => {
  assert(!pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u2", [8469]));
  assert(!pertenceAConta({ dono_auth_id: "u1", id_cliente: null }, "u2", [14]));
  assert(!pertenceAConta({}, "u2", []));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx deno test --allow-env --allow-read supabase/functions/acesso-conta/puro_test.ts`
Expected: FAIL — `pertenceAConta` não exportado.

- [ ] **Step 3: A função pura**

Em `supabase/functions/acesso-conta/puro.ts`, no fim:

```ts
/**
 * De quem e o evento.
 *
 * Duas portas, e basta uma: a conta que o criou (`dono_auth_id`, o que valia
 * ate 17/08/2026 e continua valendo para os eventos antigos) ou qualquer conta
 * ligada ao mesmo cliente do ERP (`id_cliente`). Decisao do usuario: duas
 * pessoas do mesmo cliente veem e configuram os mesmos eventos.
 */
export function pertenceAConta(
  evento: { dono_auth_id?: string | null; id_cliente?: number | null },
  userId: string,
  clientes: number[],
): boolean {
  if (evento?.dono_auth_id && String(evento.dono_auth_id) === String(userId)) return true;
  const c = Number(evento?.id_cliente);
  return Boolean(c) && clientes.includes(c);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx deno test --allow-env --allow-read supabase/functions/acesso-conta/puro_test.ts`
Expected: 3 passed.

- [ ] **Step 5: A posse no `index.ts`**

Nos imports de `supabase/functions/acesso-conta/index.ts`, acrescentar:

```ts
import { pertenceAConta } from "./puro.ts";
import {
  clientesDaConta, contaPrecisaTrocarSenha, marcarSenhaTrocada,
} from "../_compartilhado/contas.ts";
import { trocarSenhaDoUsuario } from "../_compartilhado/auth_admin.ts";
```

Substituir `eventoDoDono` (linhas ~95-105) por:

```ts
async function eventoDoDono(eventoId: string, usuario: { id: string }): Promise<any> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${uuid(eventoId)}` +
      "&select=id,dono_auth_id,id_cliente,nome_evento,data_evento,local_evento,status",
  )) ?? [])[0];
  if (!linha) throw new Recusa(403, "evento nao encontrado nesta conta");
  // A conta que criou passa sem ir ao banco de novo; as outras contas do
  // mesmo cliente passam pela tabela de contas.
  if (String(linha.dono_auth_id) === String(usuario.id)) return linha;
  const clientes = await clientesDaConta(usuario.id);
  if (!pertenceAConta(linha, usuario.id, clientes)) {
    throw new Recusa(403, "evento nao encontrado nesta conta");
  }
  return linha;
}
```

`setorDoDono` e `aparelhoDoDono` não mudam: já delegam a `eventoDoDono`.

Substituir `meusEventos` (linhas ~206-219) por:

```ts
async function meusEventos(donoId: string): Promise<any> {
  const clientes = await clientesDaConta(donoId);
  // `or=` do PostgREST: os eventos que esta conta criou OU os de qualquer
  // cliente ligado a ela. Sem cliente ligado, so o primeiro ramo.
  const filtro = clientes.length
    ? `or=(dono_auth_id.eq.${donoId},id_cliente.in.(${clientes.join(",")}))`
    : `dono_auth_id=eq.${donoId}`;
  const eventos = (await banco(
    "GET",
    `producao_acesso_eventos?${filtro}` +
      "&status=neq.excluido&select=id,nome_evento,data_evento,status,id_cliente" +
      "&order=created_at.desc",
  )) ?? [];
  for (const e of eventos) {
    e.entradas = await contar(
      `producao_acesso_leituras?evento_id=eq.${e.id}&resultado=eq.permitido`,
    );
  }
  return { eventos };
}
```

- [ ] **Step 6: `/minha-conta` e `/minha-conta/senha`**

Depois de `meusEventos`, acrescentar:

```ts
const SENHA_MINIMA = 8;

async function minhaConta(usuario: { id: string }): Promise<any> {
  const ids = await clientesDaConta(usuario.id);
  let clientes: any[] = [];
  if (ids.length) {
    clientes = ((await banco(
      "GET",
      `clientes?id_cliente=in.(${ids.join(",")})&select=id_cliente,nome`,
    )) ?? []).map((c: any) => ({ id_cliente: Number(c.id_cliente), nome: c.nome ?? "" }));
  }
  return { clientes, precisa_trocar_senha: await contaPrecisaTrocarSenha(usuario.id) };
}

/**
 * Trocar a senha. Uma rota so, para a marca de provisoria ser apagada no
 * MESMO ato em que a senha muda -- duas chamadas deixariam uma janela em que
 * a senha e a nova e o app ainda exige a troca.
 *
 * A senha atual e conferida SALVO quando a conta esta com senha provisoria: o
 * cliente acabou de entrar com ela, e pedir de novo so atrasa.
 */
async function trocarMinhaSenha(
  usuario: { id: string; email: string },
  corpo: any,
): Promise<any> {
  const nova = String(corpo?.senha_nova ?? "");
  if (nova.length < SENHA_MINIMA) {
    throw new Recusa(422, `a senha nova precisa ter pelo menos ${SENHA_MINIMA} caracteres`);
  }
  const provisoria = await contaPrecisaTrocarSenha(usuario.id);
  if (!provisoria) {
    if (!(await conferirSenha(usuario.email ?? "", String(corpo?.senha_atual ?? "")))) {
      throw new Recusa(401, "a senha atual nao confere");
    }
  }
  await trocarSenhaDoUsuario(usuario.id, nova);
  await marcarSenhaTrocada(usuario.id);
  return { ok: true };
}
```

E no `rotear`, logo depois do `meus-eventos`:

```ts
  if (metodo === "GET" && p.length === 1 && p[0] === "minha-conta") {
    return ok(await minhaConta(usuario));
  }
  if (metodo === "POST" && p.length === 2 && p[0] === "minha-conta" && p[1] === "senha") {
    return ok(await trocarMinhaSenha(usuario, await corpo()));
  }
```

- [ ] **Step 7: Conferir que o Deno compila a função inteira**

Run: `npx deno check supabase/functions/acesso-conta/index.ts`
Expected: sem erro.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/acesso-conta/puro.ts supabase/functions/acesso-conta/puro_test.ts supabase/functions/acesso-conta/index.ts
git commit -m "acesso-conta: o evento e do cliente (toda conta ligada a ele ve), /minha-conta e trocar senha sem e-mail"
```

---

### Task 4: `acesso-conta` — `GET /meus-pedidos`

**Files:**
- Modify: `supabase/functions/acesso-conta/puro.ts` (`montarMeusPedidos`, `nomeDaFicha`)
- Modify: `supabase/functions/acesso-conta/index.ts` (`meusPedidos` + rota)
- Test: `supabase/functions/acesso-conta/puro_test.ts`

**Interfaces:**
- Consumes: `clientesDaConta`; `numeracaoDoModelo(elements)` de `_compartilhado/modelos.ts`; `contar(caminho)` de `banco.ts`.
- Produces: `GET /meus-pedidos` → `{ pedidos: [{ pedido, id_cliente, data, nome_evento, data_evento, local_evento, setores: [{modelo_id, nome, quantidade, impresso}] }], sem_cliente: boolean }`; `montarMeusPedidos(entrada)`; `nomeDaFicha(ficha, pedido)`.

- [ ] **Step 1: Teste da montagem pura**

Acrescentar em `puro_test.ts`:

```ts
import { montarMeusPedidos, nomeDaFicha } from "./puro.ts";

const ENTRADA = {
  propostas: [
    { id_int: 20272, id_cliente: 14, created_at: "2026-08-12T10:00:00Z", status_interno: "APROVADO" },
    { id_int: 20281, id_cliente: 14, created_at: "2026-08-15T10:00:00Z", status_interno: "cancelado " },
    { id_int: 20300, id_cliente: 14, created_at: "2026-08-16T10:00:00Z", status_interno: null },
    { id_int: 20310, id_cliente: 14, created_at: "2026-08-17T10:00:00Z", status_interno: "NOVO" },
    { id_int: 20320, id_cliente: 14, created_at: "2026-08-17T11:00:00Z", status_interno: "NOVO" },
  ],
  legiveisPorPedido: {
    20272: [{ modelo_id: 1, nome: "PISTA", quantidade: 1500 }, { modelo_id: 2, nome: "VIP", quantidade: 300 }],
    20281: [{ modelo_id: 3, nome: "CAMAROTE", quantidade: 80 }],
    20300: [{ modelo_id: 4, nome: "PISTA", quantidade: 100 }],   // legivel, mas nada impresso
    20310: [],                                                       // sem modelo legivel
    20320: [{ modelo_id: 5, nome: "PISTA", quantidade: 10 }],    // ja carregado
  },
  credenciaisPorPedidoModelo: { "20272:1": 1500, "20272:2": 0, "20281:3": 80, "20320:5": 10 },
  fichasPorPedido: { 20272: { nome_evento: "Click", data_evento: "2026-09-12T22:00:00Z", local_evento: "Arena" } },
  carregados: [20320],
};

Deno.test("meus pedidos: so o impresso, legivel, nao cancelado, nao carregado", () => {
  const r = montarMeusPedidos(ENTRADA);
  assertEquals(r.map((p: any) => p.pedido), [20272]);
});

Deno.test("meus pedidos: o cartao traz a ficha e a situacao de impressao por modelo", () => {
  const p = montarMeusPedidos(ENTRADA)[0];
  assertEquals(p.nome_evento, "Click");
  assertEquals(p.local_evento, "Arena");
  assertEquals(p.data, "2026-08-12");
  assertEquals(p.setores.map((s: any) => [s.nome, s.impresso]), [["PISTA", true], ["VIP", false]]);
});

Deno.test("meus pedidos: do mais recente ao mais antigo", () => {
  const dois = montarMeusPedidos({ ...ENTRADA, carregados: [] });
  assertEquals(dois.map((p: any) => p.pedido), [20320, 20272]);
});

Deno.test("nome da ficha: vazio vira 'Pedido N'", () => {
  assertEquals(nomeDaFicha({ nome_evento: "  Click " }, 20272), "Click");
  assertEquals(nomeDaFicha({ nome_evento: "" }, 20272), "Pedido 20272");
  assertEquals(nomeDaFicha(null, 20272), "Pedido 20272");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx deno test --allow-env --allow-read supabase/functions/acesso-conta/puro_test.ts`
Expected: FAIL — `montarMeusPedidos` não exportado.

- [ ] **Step 3: As funções puras**

Em `puro.ts`:

```ts
export function nomeDaFicha(ficha: any, pedido: number): string {
  const nome = String(ficha?.nome_evento ?? "").trim();
  return nome || `Pedido ${pedido}`;
}

/**
 * O que entra em "Meus Pedidos". Decisao do usuario: SO os ja impressos.
 *
 *   1. nao cancelado no ERP (`status_interno`, o unico estado que importa la);
 *   2. com pelo menos um modelo legivel (QR Ideal, QR, barras);
 *   3. com pelo menos uma credencial publicada -- a grafica imprimiu. E a
 *      contagem de credenciais, NAO `publicado_em`: gerar QR e reimprimir a
 *      zeram, e ela esta nula em todos os pedidos de hoje;
 *   4. ainda nao carregado (sem `evento_id`).
 *
 * Puro: quem busca as cinco listas e o `meusPedidos` do index.ts.
 */
export function montarMeusPedidos(entrada: {
  propostas: any[];
  legiveisPorPedido: Record<string, any[]>;
  credenciaisPorPedidoModelo: Record<string, number>;
  fichasPorPedido: Record<string, any>;
  carregados: number[];
}): any[] {
  const carregados = new Set((entrada.carregados ?? []).map(Number));
  const saida: any[] = [];
  for (const p of entrada.propostas ?? []) {
    const pedido = Number(p.id_int);
    if (!pedido || carregados.has(pedido)) continue;
    if (String(p.status_interno ?? "").trim().toUpperCase() === "CANCELADO") continue;
    const legiveis = entrada.legiveisPorPedido?.[String(pedido)] ?? [];
    if (!legiveis.length) continue;
    const setores = legiveis.map((m: any) => ({
      modelo_id: Number(m.modelo_id),
      nome: m.nome,
      quantidade: Number(m.quantidade ?? 0),
      impresso: Number(entrada.credenciaisPorPedidoModelo?.[`${pedido}:${m.modelo_id}`] ?? 0) > 0,
    }));
    if (!setores.some((s: any) => s.impresso)) continue;
    const ficha = entrada.fichasPorPedido?.[String(pedido)] ?? null;
    saida.push({
      pedido,
      id_cliente: Number(p.id_cliente),
      data: String(p.created_at ?? "").slice(0, 10),
      criado_em: String(p.created_at ?? ""),
      nome_evento: nomeDaFicha(ficha, pedido),
      data_evento: ficha?.data_evento ?? null,
      local_evento: String(ficha?.local_evento ?? "").trim() || null,
      setores,
    });
  }
  saida.sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0));
  return saida.map(({ criado_em: _c, ...resto }) => resto);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx deno test --allow-env --allow-read supabase/functions/acesso-conta/puro_test.ts`
Expected: todos passando.

- [ ] **Step 5: `meusPedidos` no `index.ts`**

Imports adicionais:

```ts
import { montarMeusPedidos } from "./puro.ts";
import { numeracaoDoModelo } from "../_compartilhado/modelos.ts";
```

Depois de `minhaConta`:

```ts
const MAXIMO_PROPOSTAS = 100;

/**
 * Consultas por LOTE, nunca uma por pedido. A unica que se repete e a
 * contagem de credenciais por (pedido, modelo), porque a agregacao esta
 * desligada no PostgREST deste projeto e trazer as credenciais em si esbarra
 * no teto de 1.000 linhas.
 */
async function meusPedidos(usuario: { id: string }): Promise<any> {
  const clientes = await clientesDaConta(usuario.id);
  if (!clientes.length) return { pedidos: [], sem_cliente: true };

  const propostas = (await banco(
    "GET",
    `propostas?id_cliente=in.(${clientes.join(",")})` +
      "&select=id_int,id_cliente,created_at,status_interno" +
      `&order=created_at.desc&limit=${MAXIMO_PROPOSTAS}`,
  )) ?? [];
  const ids = [...new Set(propostas.map((p: any) => Number(p.id_int)).filter(Boolean))];
  if (!ids.length) return { pedidos: [], sem_cliente: false };
  const lista = ids.join(",");

  const modelos = (await banco(
    "GET",
    `pedidos_modelos?id_int=in.(${lista})` +
      "&select=id,id_int,nome_modelo,quantidade,amostra_num_id&order=ordem.asc",
  )) ?? [];
  const numIds = [...new Set(
    modelos.filter((m: any) => m.amostra_num_id).map((m: any) => String(m.amostra_num_id)),
  )].sort();
  const numeracoes: Record<string, unknown> = {};
  if (numIds.length) {
    const l = numIds.map((i) => `"${i}"`).join(",");
    for (const n of (await banco("GET", `producao_numeracoes?id=in.(${l})&select=id,elements`)) ?? []) {
      numeracoes[String(n.id)] = n.elements;
    }
  }
  const legiveisPorPedido: Record<string, any[]> = {};
  for (const m of modelos) {
    if (!numeracaoDoModelo(numeracoes[String(m.amostra_num_id)])) continue;
    (legiveisPorPedido[String(m.id_int)] ??= []).push({
      modelo_id: Number(m.id),
      nome: (m.nome_modelo ? String(m.nome_modelo) : `Setor ${m.id}`).trim(),
      quantidade: Number(m.quantidade ?? 0),
    });
  }

  const acesso = (await banco(
    "GET",
    `producao_acesso_pedidos?pedido_id_int=in.(${lista})&select=pedido_id_int,evento_id`,
  )) ?? [];
  const carregados = acesso.filter((a: any) => a.evento_id).map((a: any) => Number(a.pedido_id_int));
  const comLinha = new Set(acesso.map((a: any) => Number(a.pedido_id_int)));

  const credenciaisPorPedidoModelo: Record<string, number> = {};
  for (const [pedido, legiveis] of Object.entries(legiveisPorPedido)) {
    // Sem linha em producao_acesso_pedidos nunca houve impressao: pula a contagem.
    if (!comLinha.has(Number(pedido)) || carregados.includes(Number(pedido))) continue;
    for (const m of legiveis) {
      credenciaisPorPedidoModelo[`${pedido}:${m.modelo_id}`] = await contar(
        `producao_acesso_credenciais?pedido_id_int=eq.${pedido}&modelo_id=eq.${m.modelo_id}&status=eq.ativo`,
      );
    }
  }

  const fichasPorPedido: Record<string, any> = {};
  for (const f of (await banco(
    "GET",
    `pedidos_artes?id_int=in.(${lista})&select=id_int,nome_evento,data_evento,local_evento&order=created_at.asc`,
  )) ?? []) {
    // A primeira ficha com nome vence; sem nome, qualquer uma serve de data/local.
    const chave = String(f.id_int);
    if (!fichasPorPedido[chave] || (!fichasPorPedido[chave].nome_evento && f.nome_evento)) {
      fichasPorPedido[chave] = f;
    }
  }

  return {
    pedidos: montarMeusPedidos({ propostas, legiveisPorPedido, credenciaisPorPedidoModelo, fichasPorPedido, carregados }),
    sem_cliente: false,
  };
}
```

Rota, junto das outras de leitura:

```ts
  if (metodo === "GET" && p.length === 1 && p[0] === "meus-pedidos") {
    return ok(await meusPedidos(usuario));
  }
```

- [ ] **Step 6: `deno check` e commit**

Run: `npx deno check supabase/functions/acesso-conta/index.ts`

```bash
git add supabase/functions/acesso-conta/puro.ts supabase/functions/acesso-conta/puro_test.ts supabase/functions/acesso-conta/index.ts
git commit -m "acesso-conta: GET /meus-pedidos -- so os impressos, legiveis, nao cancelados, ainda nao carregados"
```

---
### Task 5: `acesso-conta` — `POST /pedidos/{p}/carregar` (o `reivindicar` sem token, devolvendo a elevação)

**Files:**
- Modify: `supabase/functions/acesso-conta/index.ts` (refatorar `reivindicar` → `carregarPedido`; rota nova)

**Interfaces:**
- Consumes: `modelosLegiveis(pedido)` e `gerarSal()` de `_compartilhado/pedidos.ts`; `conferirSenha`; `gerarElevacao(eventoId, userId, navegador)` e `SEGREDO_ELEVACAO` de `assinatura.ts`; `exigirSegredo`; `texto`, `momento` de `configuracao.ts`; `contar`; `inteiro` de `validacao.ts`; `pertenceAConta` (Task 3).
- Produces: `POST /pedidos/{p}/carregar { nome_evento, data_evento, local_evento, evento_id|null, senha, navegador }` → `{ evento_id, nome_evento, novo, elevacao: { token, expira_em, minutos: 15 } }`.

- [ ] **Step 1: Refatorar `reivindicar` em duas metades**

Substituir a função `reivindicar` (linhas ~412-492) por estas três:

```ts
/**
 * A segunda metade do reivindicar, sem QR: dado o esqueleto de um pedido
 * (numero, cliente e setores legiveis), cria o evento ou junta a um que ja
 * existe, um setor por modelo, carimba as credenciais que ja foram publicadas
 * e liga o pedido ao evento. Quem chama ja conferiu que o pedido e desta conta.
 */
async function carregarPedido(
  esq: { pedido: number; id_cliente: number | null; setores: any[] },
  usuario: { id: string },
  eventoIdPedido: string | null,
  nome: string,
  clientes: number[],
  extra: { data_evento?: unknown; local_evento?: unknown } = {},
): Promise<any> {
  const dono = usuario.id;
  if (!dono) throw new Recusa(401, "sessao sem identificacao");
  let alvo: any;
  let novo: boolean;
  if (eventoIdPedido) {
    alvo = ((await banco(
      "GET",
      `producao_acesso_eventos?id=eq.${uuid(eventoIdPedido)}` +
        "&select=id,dono_auth_id,id_cliente,nome_evento",
    )) ?? [])[0];
    // Juntar so a evento do MESMO cliente: o do dono, ou o de qualquer conta do cliente.
    if (!alvo || !pertenceAConta(alvo, dono, clientes)) {
      throw new Recusa(403, "evento nao e desta conta");
    }
    novo = false;
  } else {
    alvo = (await banco("POST", "producao_acesso_eventos", {
      id_cliente: esq.id_cliente,
      dono_auth_id: dono,
      nome_evento: nomeDoEvento(nome, esq.pedido),
      data_evento: momento(extra.data_evento ?? null, "data_evento"),
      local_evento: extra.local_evento ? texto(extra.local_evento, "local_evento", 1, 200) : null,
      // Sal do evento: serve aos codigos que o proprio cliente carregar (staff,
      // cortesia). Os do QR Ideal usam o sal do pedido.
      sal: gerarSal(),
    }))[0];
    novo = true;
  }
  const evento = alvo.id;
  // Um modelo = um setor. Nunca se fundem, mesmo com nome igual vindo de dois
  // pedidos: quantidade e reimpressao sao por modelo. Inclui os modelos ainda
  // NAO impressos: a credencial deles nasce ligada quando a grafica imprimir.
  for (const s of esq.setores) {
    const criado = await banco("POST", "producao_acesso_setores", {
      evento_id: evento,
      pedido_id_int: esq.pedido,
      modelo_id: s.modelo_id,
      nome: s.nome,
      quantidade: s.quantidade,
    });
    await banco(
      "PATCH",
      `producao_acesso_credenciais?pedido_id_int=eq.${esq.pedido}&modelo_id=eq.${s.modelo_id}`,
      { evento_id: evento, setor_id: criado[0].id },
      "return=minimal",
    );
  }
  await banco("PATCH", `producao_acesso_pedidos?pedido_id_int=eq.${esq.pedido}`, {
    evento_id: evento,
  });
  return { evento_id: evento, nome_evento: alvo.nome_evento ?? null, novo };
}

/** O caminho do QR do Pedido. Fica um release, sem tela que o chame. */
async function reivindicar(
  token: string,
  usuario: { id: string },
  eventoIdPedido: string | null,
  nomePedido: string,
): Promise<any> {
  const esq = await esqueleto(token);
  if (esq.ja_reivindicado) {
    const atual = ((await banco(
      "GET",
      `producao_acesso_eventos?id=eq.${esq.evento_id}&select=id,dono_auth_id,nome_evento`,
    )) ?? [])[0];
    if (atual && String(atual.dono_auth_id) === String(usuario.id)) {
      return { evento_id: atual.id, nome_evento: atual.nome_evento ?? null, novo: false };
    }
    throw new Recusa(409, "este pedido ja foi cadastrado por outra conta; peca um QR novo ao atendente");
  }
  const clientes = await clientesDaConta(usuario.id);
  return carregarPedido(
    { pedido: esq.pedido, id_cliente: esq.id_cliente, setores: esq.setores },
    usuario, eventoIdPedido, nomePedido, clientes,
  );
}

/**
 * Carregar um pedido: o que "Meus Pedidos" faz. A senha vai no corpo porque
 * carregar e configuracao, e configuracao pede senha -- e e essa senha que
 * deixa o passo seguinte (ligar este aparelho) acontecer sem pedir outra: a
 * resposta traz a elevacao de 15 minutos do evento resultante.
 */
async function carregar(
  pedido: number,
  usuario: { id: string; email: string },
  corpo: any,
): Promise<any> {
  const clientes = await clientesDaConta(usuario.id);
  if (!clientes.length) throw new Recusa(403, "sua conta ainda nao esta ligada a um cliente; peca a grafica");
  const proposta = ((await banco(
    "GET",
    `propostas?id_int=eq.${pedido}&select=id_int,id_cliente,status_interno`,
  )) ?? [])[0];
  if (!proposta || !clientes.includes(Number(proposta.id_cliente))) {
    throw new Recusa(403, "este pedido nao e de um cliente desta conta");
  }
  if (String(proposta.status_interno ?? "").trim().toUpperCase() === "CANCELADO") {
    throw new Recusa(409, "este pedido esta cancelado no ERP");
  }
  const setores = await modelosLegiveis(pedido);
  if (!setores.length) throw new Recusa(409, "este pedido nao tem modelo com codigo legivel");
  if ((await contar(`producao_acesso_credenciais?pedido_id_int=eq.${pedido}&status=eq.ativo`)) === 0) {
    throw new Recusa(409, "este pedido ainda nao foi impresso");
  }
  const linha = ((await banco(
    "GET",
    `producao_acesso_pedidos?pedido_id_int=eq.${pedido}&select=evento_id`,
  )) ?? [])[0];
  if (linha?.evento_id) throw new Recusa(409, "este pedido ja esta num evento");

  await exigirSegredo(SEGREDO_ELEVACAO);
  if (!(await conferirSenha(usuario.email ?? "", String(corpo?.senha ?? "")))) {
    throw new Recusa(401, "senha nao confere");
  }
  const r = await carregarPedido(
    { pedido, id_cliente: Number(proposta.id_cliente), setores },
    usuario,
    corpo?.evento_id ? String(corpo.evento_id) : null,
    String(corpo?.nome_evento ?? ""),
    clientes,
    { data_evento: corpo?.data_evento ?? null, local_evento: corpo?.local_evento ?? null },
  );
  const { token, expira } = await gerarElevacao(r.evento_id, usuario.id, String(corpo?.navegador ?? ""));
  return { ...r, elevacao: { token, expira_em: expira, minutos: 15 } };
}
```

Conferir que `momento`, `texto` (de `configuracao.ts`), `modelosLegiveis`, `gerarSal` (de `pedidos.ts`), `inteiro` (de `validacao.ts`) estão nos imports do arquivo; acrescentar os que faltarem.

- [ ] **Step 2: A rota**

No `rotear`, antes de `recusaDeRotaDesconhecida`:

```ts
  if (metodo === "POST" && p.length === 3 && p[0] === "pedidos" && p[2] === "carregar") {
    return ok(await carregar(inteiro(p[1], "path", "pedido"), usuario, await corpo()));
  }
```

- [ ] **Step 3: `deno check` e os testes puros**

Run: `npx deno check supabase/functions/acesso-conta/index.ts`
Run: `npx deno test --allow-env --allow-read supabase/functions/acesso-conta/puro_test.ts`
Expected: sem erro; todos passando.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/acesso-conta/index.ts
git commit -m "acesso-conta: POST /pedidos/{p}/carregar -- o reivindicar sem QR, com senha no corpo e a elevacao na resposta"
```

---

### Task 6: `acesso-interno` — o cliente no painel do pedido, liberar acesso, nova senha, URL de instalação

**Files:**
- Modify: `supabase/functions/acesso-interno/puro.ts` (`URL_DE_INSTALACAO`)
- Modify: `supabase/functions/acesso-interno/index.ts` (`painelDoPedido` + três rotas)
- Test: `supabase/functions/acesso-interno/puro_test.ts`

**Interfaces:**
- Consumes: `contasDoCliente`, `liberarAcesso`, `novaSenhaProvisoria` (Task 2); `quemConfigura` já vale para todas as rotas.
- Produces: `GET /pedidos/{p}` passa a devolver `cliente: { id_cliente, nome, email, contas: [{auth_user_id, email, criada_aqui, senha_provisoria, criado_em}] } | null`; `POST /clientes/{id}/contas { email }` → `{ email, ja_tinha_conta, senha_provisoria }`; `POST /contas/{uid}/nova-senha` → `{ senha_provisoria }`; `GET /instalacao` → `{ url }`.

- [ ] **Step 1: Teste da constante**

Em `supabase/functions/acesso-interno/puro_test.ts`, acrescentar:

```ts
import { URL_DE_INSTALACAO } from "./puro.ts";

Deno.test("a URL de instalacao e a casa do aplicativo, no dominio publico, com barra no fim", () => {
  assertEquals(URL_DE_INSTALACAO, "https://ideal-imposition.vercel.app/ic/");
});
```

(`assertEquals` já é importado no topo do arquivo.)

- [ ] **Step 2: Rodar e ver falhar; escrever a constante**

Run: `npx deno test --allow-env --allow-read supabase/functions/acesso-interno/puro_test.ts` → FAIL.

Em `puro.ts`:

```ts
/**
 * O QR de instalacao aponta para ca. Um so, generico, sem nada dentro: quem o
 * le instala o aplicativo e entra com a conta que a grafica liberou. E o
 * dominio publico e nao o da estacao, porque o painel da grafica roda nos
 * dois e o QR vai para o celular do cliente.
 */
export const URL_DE_INSTALACAO = "https://ideal-imposition.vercel.app/ic/";
```

Run de novo → PASS.

- [ ] **Step 3: O cliente no painel do pedido**

Imports em `acesso-interno/index.ts`:

```ts
import { contasDoCliente, liberarAcesso, novaSenhaProvisoria } from "../_compartilhado/contas.ts";
import { URL_DE_INSTALACAO } from "./puro.ts";
```

Acrescentar depois de `painelDoPedido`:

```ts
/**
 * O cliente do pedido e as contas ligadas a ele. E o que o bloco "Acesso do
 * cliente" do painel desenha. Sem proposta (pedido de teste sem ERP) devolve
 * nulo, e o painel esconde o bloco.
 */
async function clienteDoPedido(pedidoIdInt: number): Promise<any> {
  const proposta = ((await banco(
    "GET",
    `propostas?id_int=eq.${pedidoIdInt}&select=id_cliente`,
  )) ?? [])[0];
  const idCliente = Number(proposta?.id_cliente);
  if (!idCliente) return null;
  const c = ((await banco(
    "GET",
    `clientes?id_cliente=eq.${idCliente}&select=id_cliente,nome,email,email_contato`,
  )) ?? [])[0];
  return {
    id_cliente: idCliente,
    nome: c?.nome ?? "",
    email: String(c?.email || c?.email_contato || "").trim().toLowerCase(),
    contas: await contasDoCliente(idCliente),
  };
}
```

E no `return` de `painelDoPedido`, acrescentar a chave `cliente: await clienteDoPedido(pedidoIdInt),` logo depois de `pedido: pedidoIdInt,`.

- [ ] **Step 4: As rotas**

No `rotear`, depois do bloco `GET /pedidos/{p}`:

```ts
  if (metodo === "GET" && p.length === 1 && p[0] === "instalacao") {
    return ok({ url: URL_DE_INSTALACAO });
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "clientes" && p[2] === "contas") {
    const c = await corpo();
    return ok(await liberarAcesso(inteiro(p[1], "path", "cliente"), String(c?.email ?? ""), quem.id));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "contas" && p[2] === "nova-senha") {
    return ok(await novaSenhaProvisoria(uuid(p[1], "conta")));
  }
```

- [ ] **Step 5: `deno check`, testes, commit**

Run: `npx deno check supabase/functions/acesso-interno/index.ts`
Run: `npx deno test --allow-env --allow-read supabase/functions/acesso-interno/puro_test.ts`

```bash
git add supabase/functions/acesso-interno/puro.ts supabase/functions/acesso-interno/puro_test.ts supabase/functions/acesso-interno/index.ts
git commit -m "acesso-interno: o cliente do pedido com as contas dele, liberar acesso com senha provisoria, nova senha, URL de instalacao"
```

---

### Task 7: "Portão" vira "Aparelho" em toda a interface

**Files:**
- Modify: `frontend/controle.html`, `frontend/lista-eventos.js`, `frontend/virar-portao.js`, `frontend/controle.js`, `frontend/fila-presa.js`, `frontend/portaria.html`, `frontend/portaria.js`, `frontend/parede-pwa.js`, `frontend/app.webmanifest`
- Modify: `tests/test_controle_tela.py`, `tests/test_lista_eventos.py`, `tests/test_virar_portao.py`, `tests/test_portaria_tela.py`, `tests/test_aparelho_no_aparelho.py`, `tests/test_chaveiro.py`, `tests/test_aplicativo_unico.py` (o que assertar "Portão" em texto de tela)
- Test: `tests/test_vocabulario_aparelho.py` (novo)

**Interfaces:**
- Produces: nenhum texto de tela com "portão"/"portao"; nome automático `'Aparelho ' + N` em `virar-portao.js`.

- [ ] **Step 1: O teste de mesa do vocabulário**

`tests/test_vocabulario_aparelho.py`:

```python
# -*- coding: utf-8 -*-
"""'Portao' virou 'Aparelho' em 17/08/2026, por decisao do usuario: "todo
aparelho e portao". O termo antigo esta espalhado por dezenas de frases e volta
sozinho quando alguem copia um texto vizinho -- por isso um teste, e nao so
uma passada de busca.

So texto de TELA conta. Nomes internos (`virar-portao.js`, `nome_portao`,
`ideal_control_portoes`, comentarios) ficam: trocar chave de localStorage em uso
exige migracao e nao vale o risco por vocabulario.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(RAIZ, "frontend")

# Onde a tela do aplicativo e escrita.
ARQUIVOS = [
    "controle.html", "portaria.html",
    "lista-eventos.js", "virar-portao.js", "controle.js", "fila-presa.js",
    "portaria.js", "parede-pwa.js", "menu-geral.js", "aparelho.js",
    "app.webmanifest",
]

PORTAO = re.compile(r"port[aã]o|port[oõ]es", re.I)


def _linhas_de_texto(nome):
    """As linhas que chegam a tela: strings JS e texto de HTML. Comentario nao conta."""
    with open(os.path.join(FRONTEND, nome), encoding="utf-8") as f:
        texto = f.read()
    # tira comentarios de bloco e de linha
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.S)
    texto = re.sub(r"<!--.*?-->", "", texto, flags=re.S)
    linhas = []
    for n, linha in enumerate(texto.splitlines(), 1):
        sem_comentario = re.sub(r"//.*$", "", linha)
        if PORTAO.search(sem_comentario):
            linhas.append((n, sem_comentario.strip()))
    return linhas


def test_nenhum_portao_em_texto_de_tela():
    culpados = []
    for nome in ARQUIVOS:
        for n, linha in _linhas_de_texto(nome):
            # nomes internos que ficam de proposito
            interno = ("nome_portao" in linha or "ideal_control_portoes" in linha
                       or "virar-portao" in linha or "virarPortao" in linha
                       or "aparelhoAqui" in linha)
            if not interno:
                culpados.append(f"{nome}:{n}: {linha}")
    assert not culpados, "\n".join(culpados)


def test_o_nome_automatico_e_Aparelho_N():
    with open(os.path.join(FRONTEND, "virar-portao.js"), encoding="utf-8") as f:
        js = f.read()
    assert "'Aparelho ' + (" in js
    assert "'Portão ' + (" not in js
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_vocabulario_aparelho.py -v`
Expected: FAIL com a lista de linhas culpadas — é o mapa do que trocar.

- [ ] **Step 3: Trocar, arquivo por arquivo**

Regras de tradução (aplicar em cada linha culpada; **só texto de tela**, nunca nomes de função, chave ou arquivo):

| Antes | Depois |
|---|---|
| "Portão N" (nome automático) | "Aparelho N" |
| "portão", "o portão", "este portão" | "aparelho", "o aparelho", "este aparelho" |
| "Portões" (h2 da engrenagem) | "Aparelhos" |
| "Todos os portões deste evento, de todos os celulares" | "Todos os aparelhos deste evento, de todos os celulares" |
| "★ Este é o portão deste aparelho." | "★ Este é o aparelho em que você está." |
| "Sair deste portão" | "Sair deste aparelho" |
| "virar portão", "abrir o portão" | "ligar este aparelho", "ligar o aparelho" |
| "este aparelho já é portão daquele evento" | "este aparelho já lê aquele evento" |
| "Usar este aparelho no portão de X" (aria-label) | "Usar este aparelho no evento X" |
| "portão sem internet" | "aparelho sem internet" |
| "entrou às HH:MM no <portão>" (portaria) | "entrou às HH:MM no <aparelho>" — o valor é o nome do aparelho |
| "Portaria" no topo (`#topo-aparelho` antes de carregar) | fica: "Portaria" é a tela, não o aparelho |
| `app.webmanifest` description "a leitura no portão" | "a leitura no aparelho" |

Fazer com `grep -n` para achar e editar linha a linha. Não usar `sed` global: ele pegaria `nome_portao` e `virar-portao`.

- [ ] **Step 4: Atualizar os testes que assertavam o texto antigo**

Rodar a suíte da casa e da portaria e trocar cada asserção que espere "Portão"/"portão" em `textContent`/`aria-label`/HTML pelo texto novo:

Run: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py tests/test_lista_eventos.py tests/test_virar_portao.py tests/test_portaria_tela.py tests/test_aparelho_no_aparelho.py tests/test_chaveiro.py tests/test_aplicativo_unico.py -q`

Cada falha aponta a linha; a correção é trocar a string esperada. Não afrouxar asserção nenhuma.

- [ ] **Step 5: Rodar tudo e ver passar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_vocabulario_aparelho.py tests/test_controle_tela.py tests/test_lista_eventos.py tests/test_virar_portao.py tests/test_portaria_tela.py tests/test_aparelho_no_aparelho.py tests/test_chaveiro.py tests/test_aplicativo_unico.py -q`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add frontend/ tests/
git commit -m "vocabulario: 'Portao' vira 'Aparelho' em toda a interface -- todo aparelho e portao"
```

---
### Task 8: A conta no frontend — `acesso-conta.js`, `conta.js`, a tela de entrar, trocar senha, sair

**Files:**
- Modify: `frontend/acesso-conta.js` (`minhaConta`, `trocarSenha`, `sair`, `esqueciSenha` sem e-mail, frase do erro de login)
- Create: `frontend/conta.js`
- Modify: `frontend/controle.html` (`#bloco-entrar` reescrito, `#trocar-senha` novo, menu do olho com dois itens, `<script>` novo)
- Modify: `frontend/lista-eventos.js` (`carregar()` chama `window.conta.decidirAbertura`)
- Modify: `frontend/controle.js` (`#btn-entrar` some daqui; "Esqueci" da caixa de config vira frase; exportar `receberElevacao`)
- Modify: `frontend/menu-geral.js` (nada de código; os itens novos são HTML + `conta.js`)
- Modify: `frontend/controle.css`, `frontend/sw.js`, `security_config.py`
- Test: `tests/test_conta_tela.py` (novo), `tests/test_conta_do_cliente_e_a_do_vibe.py` (apontar para `controle.html`)

**Interfaces:**
- Consumes: `AcessoConta.pedir/entrar/sessao`; `window.listaEventos.recarregar()`; `window.chaveiro.listar()`; `window.menuGeral.fechar()`.
- Produces: `window.AcessoConta.minhaConta(sessao)`, `.trocarSenha(sessao, atual, nova)`, `.sair()`; `window.conta = { decidirAbertura(sessao, temAparelho) → 'entrar'|'lista', mostrarEntrar(opcoes), esconderEntrar(), depoisDeEntrar(sessao), mostrarTrocarSenha({obrigatoria}), sair() }`; `window.Controle.receberElevacao(evento_id, elevacao)`.

- [ ] **Step 1: Escrever o teste da tela**

`tests/test_conta_tela.py` — reaproveita `_no_navegador` de `test_controle_tela.py`, que já intercepta `/acesso-conta/eventos/` e `/meus-eventos`. Para as rotas novas, este teste substitui `AcessoConta.pedir` dentro do `script_extra`:

```python
# -*- coding: utf-8 -*-
"""A conta do cliente na casa do aplicativo: entrar ao abrir, trocar a senha
provisoria, sair. Decisoes de 17/08/2026."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

DESVIO = """
    window.__chamadas = [];
    window.__minhaConta = { clientes: [{ id_cliente: 14, nome: 'Cliente Teste' }], precisa_trocar_senha: false };
    const pedirReal = AcessoConta.pedir;
    AcessoConta.pedir = async (caminho, opcoes) => {
        window.__chamadas.push({ caminho, corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
        if (caminho === '/minha-conta') return window.__minhaConta;
        if (caminho === '/minha-conta/senha') return { ok: true };
        if (caminho === '/meus-eventos') return { eventos: [] };
        if (caminho === '/meus-pedidos') return { pedidos: [] };
        return pedirReal(caminho, opcoes);
    };
"""


def test_decidir_abertura_e_pura():
    saida = _no_navegador("""
        return {
            semNada: window.conta.decidirAbertura(null, false),
            comAparelho: window.conta.decidirAbertura(null, true),
            comSessao: window.conta.decidirAbertura({ access_token: 'x' }, false),
        };
    """)
    assert saida == {"semNada": "entrar", "comAparelho": "lista", "comSessao": "lista"}


def test_sem_aparelho_e_sem_sessao_a_casa_abre_na_tela_de_entrar():
    saida = _no_navegador(DESVIO + """
        localStorage.clear();
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        await window.listaEventos.recarregar();
        const entrar = document.getElementById('bloco-entrar');
        return {
            entrarVisivel: !entrar.classList.contains('sumindo'),
            listaVisivel: !document.getElementById('lista').classList.contains('sumindo'),
            barraVisivel: !document.getElementById('bloco-novo-evento').classList.contains('sumindo'),
            texto: entrar.textContent,
        };
    """)
    assert saida["entrarVisivel"] is True
    assert saida["listaVisivel"] is False and saida["barraVisivel"] is False
    assert "Peça à gráfica" in saida["texto"], "quem nao tem acesso precisa saber a quem pedir"
    assert "Esqueci minha senha" in saida["texto"]


def test_com_aparelho_no_chaveiro_a_casa_abre_na_lista_sem_pedir_login():
    saida = _no_navegador(DESVIO + """
        localStorage.clear();
        window.chaveiro.guardar({ evento_id: 'ev-1', nome_evento: 'Click', aparelho_id: 'a1',
                                  nome_portao: 'Aparelho 1', token: 't' });
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        await window.listaEventos.recarregar();
        return {
            entrarVisivel: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            listaVisivel: !document.getElementById('lista').classList.contains('sumindo'),
        };
    """)
    assert saida == {"entrarVisivel": False, "listaVisivel": True}


def test_senha_provisoria_obriga_a_trocar_antes_de_qualquer_coisa():
    saida = _no_navegador(DESVIO + """
        window.__minhaConta.precisa_trocar_senha = true;
        await window.conta.depoisDeEntrar({ access_token: 'jwt', user: { email: 'd@x.com' } });
        const tela = document.getElementById('trocar-senha');
        const visivel = !tela.classList.contains('sumindo');
        const atualEscondida = document.getElementById('campo-senha-atual').closest('label, div')
            .classList.contains('sumindo');
        document.getElementById('campo-senha-nova').value = 'novasenha123';
        document.getElementById('campo-senha-confirma').value = 'novasenha123';
        document.getElementById('btn-trocar-senha').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            visivel, atualEscondida,
            depois: !document.getElementById('trocar-senha').classList.contains('sumindo'),
            chamada: window.__chamadas.find(c => c.caminho === '/minha-conta/senha'),
        };
    """)
    assert saida["visivel"] is True
    assert saida["atualEscondida"] is True, "com senha provisoria nao se pede a senha atual"
    assert saida["depois"] is False
    assert saida["chamada"]["corpo"] == {"senha_atual": "", "senha_nova": "novasenha123"}


def test_a_senha_nova_precisa_ser_confirmada_e_ter_oito():
    saida = _no_navegador(DESVIO + """
        window.conta.mostrarTrocarSenha({ obrigatoria: false });
        document.getElementById('campo-senha-atual').value = 'antiga123';
        document.getElementById('campo-senha-nova').value = 'curta';
        document.getElementById('campo-senha-confirma').value = 'curta';
        document.getElementById('btn-trocar-senha').click();
        await new Promise(r => setTimeout(r, 30));
        const erro1 = document.getElementById('erro-trocar-senha').textContent;
        document.getElementById('campo-senha-nova').value = 'novasenha123';
        document.getElementById('campo-senha-confirma').value = 'outracoisa';
        document.getElementById('btn-trocar-senha').click();
        await new Promise(r => setTimeout(r, 30));
        return { erro1, erro2: document.getElementById('erro-trocar-senha').textContent,
                 chamou: window.__chamadas.some(c => c.caminho === '/minha-conta/senha') };
    """)
    assert "8" in saida["erro1"]
    assert "iguais" in saida["erro2"] or "conferem" in saida["erro2"]
    assert saida["chamou"] is False


def test_o_menu_do_olho_tem_trocar_senha_e_sair_da_conta():
    saida = _no_navegador("""
        return {
            trocar: document.getElementById('btn-trocar-minha-senha').textContent,
            sair: document.getElementById('btn-sair-conta').textContent,
        };
    """)
    assert "Trocar minha senha" in saida["trocar"]
    assert "Sair da conta" in saida["sair"]


def test_esqueci_minha_senha_manda_falar_com_a_grafica_e_nao_promete_email():
    saida = _no_navegador("""
        const frase = await AcessoConta.esqueciSenha('x@y.com');
        return { frase };
    """)
    assert "gráfica" in saida["frase"]
    assert "e-mail" not in saida["frase"].lower() or "link" not in saida["frase"].lower()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_conta_tela.py -v`
Expected: FAIL (`window.conta` não existe).

- [ ] **Step 3: `acesso-conta.js`**

Trocar a frase de erro do `entrar` para:
`'E-mail ou senha não conferem. Use o acesso que a gráfica liberou para você.'`

Substituir `esqueciSenha` por:

```js
    // Sem SMTP no projeto, e-mail nao chega. Quem recupera e a grafica, com
    // uma senha provisoria nova -- a anterior deixa de valer no mesmo ato.
    function esqueciSenha() {
        return Promise.resolve('Peça à gráfica uma nova senha provisória. Ela deixa '
            + 'a anterior sem valor, e você escolhe a sua no primeiro acesso.');
    }
```

Acrescentar antes do `window.AcessoConta = {`:

```js
    function comSessao(sessao) {
        return { Authorization: 'Bearer ' + sessao.access_token,
                 'Content-Type': 'application/json' };
    }
    function minhaConta(sessao) {
        return pedir('/minha-conta', { headers: comSessao(sessao) });
    }
    function trocarSenha(sessao, atual, nova) {
        return pedir('/minha-conta/senha', {
            method: 'POST', headers: comSessao(sessao),
            body: JSON.stringify({ senha_atual: atual || '', senha_nova: nova || '' })
        });
    }
    function sair() {
        return Promise.resolve().then(function () {
            return supabaseClient.auth.signOut();
        }).catch(function () { /* sem rede: a sessao local ja foi apagada */ });
    }
```

E exportar: `minhaConta: minhaConta, trocarSenha: trocarSenha, sair: sair` dentro de `window.AcessoConta`.

- [ ] **Step 4: O HTML da entrada, da troca de senha e do menu**

Em `frontend/controle.html`, substituir o `#bloco-entrar` inteiro por:

```html
    <!-- A TELA DE ENTRAR. Aparece DIRETO quando o celular nao e aparelho de
         nenhum evento e nao ha sessao -- o cliente que acabou de instalar pelo
         QR. Com aparelho no chaveiro (o porteiro) ela nao aparece: a lista
         basta. Quem decide e `conta.decidirAbertura`. -->
    <div id="bloco-entrar" class="cartao sumindo">
        <h1>Entrar</h1>
        <p class="config-ajuda">
            Use o <strong>e-mail e a senha que a gráfica liberou</strong> para
            você. Se ainda não tem acesso, peça à gráfica.
        </p>
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="username" inputmode="email">
        <label for="senha">Senha</label>
        <input id="senha" type="password" autocomplete="current-password">
        <button id="btn-entrar">Entrar</button>
        <button id="btn-esqueci" class="secundario">Esqueci minha senha</button>
        <div id="erro-login" class="aviso erro sumindo" role="alert" style="margin-top:14px;"></div>
        <p class="config-ajuda" style="margin-top:14px;">
            Ainda não tem acesso? <strong>Peça à gráfica</strong>: ela libera o
            seu e-mail e te passa uma senha provisória.
        </p>
    </div>

    <!-- TROCAR A SENHA. Obrigatoria no primeiro acesso (senha provisoria) e
         disponivel depois pelo menu do olho. Com senha provisoria a "senha
         atual" nao e pedida: o cliente acabou de entrar com ela. -->
    <div id="trocar-senha" class="cartao sumindo">
        <h1 id="trocar-senha-titulo">Escolha a sua senha</h1>
        <p id="trocar-senha-ajuda" class="config-ajuda">
            A senha que a gráfica te passou era provisória. Escolha agora a
            sua: pelo menos 8 caracteres.
        </p>
        <div id="bloco-senha-atual">
            <label for="campo-senha-atual">Senha atual</label>
            <input id="campo-senha-atual" type="password" autocomplete="current-password">
        </div>
        <label for="campo-senha-nova">Senha nova</label>
        <input id="campo-senha-nova" type="password" autocomplete="new-password">
        <label for="campo-senha-confirma">Repita a senha nova</label>
        <input id="campo-senha-confirma" type="password" autocomplete="new-password">
        <button id="btn-trocar-senha">Salvar a senha</button>
        <button id="btn-cancelar-trocar-senha" class="secundario">Cancelar</button>
        <div id="erro-trocar-senha" class="aviso erro sumindo" role="alert" style="margin-top:14px;"></div>
    </div>
```

No `#menu-geral`, antes do `<h1 class="rotulo-secao">Eventos finalizados</h1>`, acrescentar:

```html
        <h1 class="rotulo-secao">Minha conta</h1>
        <div class="cartao">
            <button id="btn-trocar-minha-senha" class="secundario">Trocar minha senha</button>
            <button id="btn-sair-conta" class="secundario">Sair da conta</button>
        </div>
```

E o `<script src="conta.js?v=629"></script>` entra logo depois de `<script src="lista-eventos.js?v=629"></script>`.

- [ ] **Step 5: `conta.js`**

```js
/**
 * A conta do cliente na casa do aplicativo: entrar, trocar a senha, sair.
 *
 * Decisoes de 17/08/2026: o app abre DIRETO na tela de entrar quando o
 * celular nao e aparelho de nenhum evento e nao ha sessao; a senha
 * provisoria que a grafica passou obriga a trocar antes de qualquer coisa;
 * "Esqueci minha senha" manda falar com a grafica (nao ha e-mail no projeto).
 *
 * A sessao fica no celular ate ele virar aparelho -- quem a encerra nesse
 * momento e o `aparelho.js`. Aqui so se entra e se sai por vontade.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var SENHA_MINIMA = 8;
    var depoisDeEntrarCb = null;

    /** Puro. 'entrar' so quando nao ha nada que sirva de casa. */
    function decidirAbertura(sessao, temAparelho) {
        if (sessao) { return 'lista'; }
        return temAparelho ? 'lista' : 'entrar';
    }

    function esconderTelaInicial(esconder) {
        ['lista', 'bloco-novo-evento'].forEach(function (id) {
            var el = $(id);
            if (el) { el.classList.toggle('sumindo', esconder); }
        });
    }

    function mostrarEntrar(opcoes) {
        opcoes = opcoes || {};
        depoisDeEntrarCb = opcoes.depois || null;
        if (window.menuGeral) { window.menuGeral.fechar(); }
        esconderTelaInicial(true);
        var bloco = $('bloco-entrar');
        if (!bloco) { return; }
        $('erro-login').classList.add('sumindo');
        $('senha').value = '';
        bloco.classList.remove('sumindo');
        (($('email').value || '') ? $('senha') : $('email')).focus();
    }

    function esconderEntrar() {
        var bloco = $('bloco-entrar');
        if (bloco) { bloco.classList.add('sumindo'); }
        $('senha').value = '';
        esconderTelaInicial(false);
    }

    function mostrarErroLogin(texto) {
        var erro = $('erro-login');
        erro.textContent = texto;
        erro.classList.remove('sumindo');
    }

    /**
     * Depois de a sessao existir (recem-entrada ou restaurada): a troca
     * obrigatoria vem antes de tudo; depois, a lista -- ou Meus Pedidos, se a
     * conta ainda nao tem evento nenhum.
     */
    function depoisDeEntrar(sessao) {
        esconderEntrar();
        return window.AcessoConta.minhaConta(sessao).then(function (c) {
            if (c && c.precisa_trocar_senha) {
                return mostrarTrocarSenha({ obrigatoria: true }).then(function () {
                    return seguirParaACasa(sessao, c);
                });
            }
            return seguirParaACasa(sessao, c);
        }).catch(function () {
            // /minha-conta fora do ar: a lista do chaveiro e o que ha.
            return window.listaEventos.recarregar();
        });
    }

    function seguirParaACasa(sessao, minha) {
        if (depoisDeEntrarCb) {
            var cb = depoisDeEntrarCb; depoisDeEntrarCb = null;
            return cb(sessao);
        }
        return window.listaEventos.recarregar().then(function () {
            var temEvento = document.querySelectorAll('#eventos .linha-evento').length > 0;
            if (!temEvento && window.meusPedidos) { return window.meusPedidos.abrir(); }
        });
    }

    /**
     * A troca de senha. Resolve quando trocou; com `obrigatoria`, nao ha
     * Cancelar -- a tela so sai depois de trocar.
     */
    function mostrarTrocarSenha(opcoes) {
        opcoes = opcoes || {};
        var obrigatoria = !!opcoes.obrigatoria;
        if (window.menuGeral) { window.menuGeral.fechar(); }
        esconderTelaInicial(true);
        var tela = $('trocar-senha');
        $('trocar-senha-titulo').textContent = obrigatoria ? 'Escolha a sua senha' : 'Trocar minha senha';
        $('trocar-senha-ajuda').textContent = obrigatoria
            ? 'A senha que a gráfica te passou era provisória. Escolha agora a sua: pelo menos 8 caracteres.'
            : 'Digite a senha atual e escolha a nova: pelo menos 8 caracteres.';
        $('bloco-senha-atual').classList.toggle('sumindo', obrigatoria);
        $('btn-cancelar-trocar-senha').classList.toggle('sumindo', obrigatoria);
        ['campo-senha-atual', 'campo-senha-nova', 'campo-senha-confirma'].forEach(function (id) { $(id).value = ''; });
        $('erro-trocar-senha').classList.add('sumindo');
        tela.classList.remove('sumindo');
        (obrigatoria ? $('campo-senha-nova') : $('campo-senha-atual')).focus();

        function erro(texto) {
            var e = $('erro-trocar-senha');
            e.textContent = texto;
            e.classList.remove('sumindo');
        }
        function fechar() {
            tela.classList.add('sumindo');
            ['campo-senha-atual', 'campo-senha-nova', 'campo-senha-confirma'].forEach(function (id) { $(id).value = ''; });
            esconderTelaInicial(false);
        }
        return new Promise(function (resolver) {
            $('btn-trocar-senha').onclick = function () {
                var atual = $('campo-senha-atual').value || '';
                var nova = $('campo-senha-nova').value || '';
                var confirma = $('campo-senha-confirma').value || '';
                if (nova.length < SENHA_MINIMA) {
                    return erro('A senha nova precisa ter pelo menos 8 caracteres.');
                }
                if (nova !== confirma) {
                    return erro('As duas senhas não conferem. Digite a mesma nas duas caixas.');
                }
                window.AcessoConta.sessao().then(function (s) {
                    if (!s) { throw new Error('Sua sessão caiu. Entre de novo.'); }
                    return window.AcessoConta.trocarSenha(s, obrigatoria ? '' : atual, nova);
                }).then(function () {
                    fechar();
                    resolver(true);
                }).catch(function (e) {
                    erro((e && e.message) || 'Não consegui trocar a senha agora. Tente de novo.');
                });
            };
            $('btn-cancelar-trocar-senha').onclick = function () {
                if (obrigatoria) { return; }
                fechar();
                resolver(false);
            };
        });
    }

    function sair() {
        return window.AcessoConta.sair().then(function () {
            if (window.menuGeral) { window.menuGeral.fechar(); }
            return window.listaEventos.recarregar();
        });
    }

    function ligar() {
        if (!$('bloco-entrar')) { return; }
        $('btn-entrar').addEventListener('click', function () {
            $('erro-login').classList.add('sumindo');
            var email = ($('email').value || '').trim();
            var senha = $('senha').value || '';
            if (!email || !senha) { return mostrarErroLogin('Preencha o e-mail e a senha.'); }
            try { localStorage.setItem('ideal_control_email', email); } catch (e) { /* aba anonima */ }
            window.AcessoConta.entrar(email, senha)
                .then(depoisDeEntrar)
                .catch(function (e) { mostrarErroLogin(e.message); });
        });
        $('senha').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('btn-entrar').click(); }
        });
        $('btn-esqueci').addEventListener('click', function () {
            window.AcessoConta.esqueciSenha().then(mostrarErroLogin);
        });
        try { $('email').value = localStorage.getItem('ideal_control_email') || ''; } catch (e) { /* aba anonima */ }

        var trocar = $('btn-trocar-minha-senha');
        if (trocar) {
            trocar.addEventListener('click', function () {
                window.AcessoConta.sessao().then(function (s) {
                    if (s) { return mostrarTrocarSenha({ obrigatoria: false }); }
                    mostrarEntrar({ depois: function () { return mostrarTrocarSenha({ obrigatoria: false }); } });
                });
            });
        }
        var sairBtn = $('btn-sair-conta');
        if (sairBtn) { sairBtn.addEventListener('click', sair); }
    }

    window.conta = {
        decidirAbertura: decidirAbertura,
        mostrarEntrar: mostrarEntrar, esconderEntrar: esconderEntrar,
        depoisDeEntrar: depoisDeEntrar, mostrarTrocarSenha: mostrarTrocarSenha,
        sair: sair
    };
    document.addEventListener('DOMContentLoaded', ligar);
})();
```

- [ ] **Step 6: `lista-eventos.js` decide a abertura; `controle.js` solta o login antigo**

Em `lista-eventos.js`, no fim de `carregar(sessao)`, **antes** do `if (!sessao) { return Promise.resolve(); }`, acrescentar:

```js
        // A casa abre na tela de entrar quando nao ha nada que sirva de casa:
        // sem aparelho no chaveiro e sem sessao. Com aparelho, a lista basta.
        if (window.conta) {
            var abertura = window.conta.decidirAbertura(sessao, doChaveiro.length > 0);
            if (abertura === 'entrar') { window.conta.mostrarEntrar(); }
            else { window.conta.esconderEntrar(); }
        }
```

E `desenharFinalizados([])` continua como está.

Em `controle.js`:
- Apagar os ouvintes de `#btn-entrar`, `#senha` (Enter) e `#btn-esqueci` do `DOMContentLoaded` (linhas ~1759-1784) — `conta.js` é o dono deles agora.
- Em `pedirEntrada`, o `onclick` de `#btn-esqueci-entrar-config` vira:

```js
            $('btn-esqueci-entrar-config').onclick = function () {
                AcessoConta.esqueciSenha().then(function (frase) {
                    erro.textContent = frase;
                    erro.classList.remove('sumindo');
                });
            };
```

- `#btn-esqueci-config` (a tranca) idem: `AcessoConta.esqueciSenha().then(function (frase) { avisar(frase, 'ok'); });`.
- Exportar em `window.Controle`: `receberElevacao: function (evento_id, elevacao) { guardarElevacao({ token: elevacao.token, expira_em: elevacao.expira_em, evento_id: evento_id }); }`.

- [ ] **Step 7: CSS, service worker, lista de arquivos**

`controle.css` — no fim:

```css
/* A tela de entrar e a de trocar senha: um cartao, centrado, com folga no topo. */
#bloco-entrar h1, #trocar-senha h1 { font-size: 1.35rem; margin: 0 0 6px; }
#bloco-entrar .config-ajuda, #trocar-senha .config-ajuda { margin-bottom: 14px; }
```

`sw.js` — em `ARQUIVOS`, depois de `'lista-eventos.js?v=' + VERSAO,`: `'conta.js?v=' + VERSAO,`.

`security_config.py` — em `PAINEL_ARQUIVOS`, junto de `"lista-eventos.js"`: `"conta.js"`.

`tests/test_conta_do_cliente_e_a_do_vibe.py` — a asserção que lê `evento.html` passa a ler `controle.html` e a procurar `"a gráfica liberou"` no lugar da frase do Vibe (o arquivo `evento.html` sai na Task 11).

- [ ] **Step 8: Rodar e ver passar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_conta_tela.py tests/test_controle_tela.py tests/test_lista_eventos.py tests/test_conta_do_cliente_e_a_do_vibe.py tests/test_aplicativo_unico.py -q`
Expected: tudo verde (se `test_aplicativo_unico` reclamar do `?v=` de `conta.js`, o número tem de ser o mesmo dos vizinhos).

- [ ] **Step 9: Commit**

```bash
git add frontend/acesso-conta.js frontend/conta.js frontend/controle.html frontend/lista-eventos.js frontend/controle.js frontend/controle.css frontend/sw.js security_config.py tests/test_conta_tela.py tests/test_conta_do_cliente_e_a_do_vibe.py
git commit -m "casa: entrar direto quando nao ha aparelho nem sessao, trocar a senha provisoria, sair da conta; esqueci a senha manda falar com a grafica"
```

---
### Task 9: A barra "Meus Pedidos" e a lista de pedidos (`meus-pedidos.js`)

**Files:**
- Modify: `frontend/controle.html` (barra, bloco `#meus-pedidos`, câmera fora, scripts fora)
- Create: `frontend/meus-pedidos.js`
- Modify: `frontend/lista-eventos.js` (o `+` abre Meus Pedidos), `frontend/menu-geral.js` (não chama mais `lerQR`), `frontend/controle.css`, `frontend/sw.js`, `security_config.py`
- Test: `tests/test_meus_pedidos_tela.py` (novo); ajustar `tests/test_lista_eventos.py`, `tests/test_controle_tela.py`, `tests/test_aplicativo_unico.py` (ids da barra)

**Interfaces:**
- Consumes: `AcessoConta.sessao/pedir`; `window.conta.mostrarEntrar({depois})`; `window.carregarPedido.abrir(pedido, sessao)` (Task 10 — nesta tarefa o botão chama e o teste só confere a chamada).
- Produces: `window.meusPedidos = { abrir(), fechar(), desenhar(pedidos, opcoes) }`; ids: `#btn-meus-pedidos`, `#btn-meus-pedidos-mais`, `#meus-pedidos`, `#pedidos`, `#sem-pedidos`, `#btn-voltar-pedidos`; cartão `#pedido-<n>` com botão `#carregar-<n>`.

- [ ] **Step 1: O teste**

`tests/test_meus_pedidos_tela.py`:

```python
# -*- coding: utf-8 -*-
"""'Meus Pedidos': a barra que era 'Novo Evento', a lista dos pedidos ja
impressos e o botao Carregar. Decisoes de 17/08/2026."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

PEDIDOS = {"pedidos": [
    {"pedido": 20272, "id_cliente": 14, "data": "2026-08-12", "nome_evento": "Click",
     "data_evento": "2026-09-12T22:00:00Z", "local_evento": "Arena",
     "setores": [{"modelo_id": 1, "nome": "PISTA", "quantidade": 1500, "impresso": True},
                 {"modelo_id": 2, "nome": "VIP", "quantidade": 300, "impresso": False}]},
    {"pedido": 20281, "id_cliente": 14, "data": "2026-08-15", "nome_evento": "Pedido 20281",
     "data_evento": None, "local_evento": None,
     "setores": [{"modelo_id": 3, "nome": "CAMAROTE", "quantidade": 80, "impresso": True}]},
], "sem_cliente": False}

DESVIO = """
    window.__chamadas = [];
    const pedirReal = AcessoConta.pedir;
    AcessoConta.pedir = async (caminho, opcoes) => {
        window.__chamadas.push(caminho);
        if (caminho === '/meus-pedidos') return window.__pedidos;
        if (caminho === '/minha-conta') return { clientes: [{ id_cliente: 14, nome: 'X' }], precisa_trocar_senha: false };
        if (caminho === '/meus-eventos') return { eventos: [] };
        return pedirReal(caminho, opcoes);
    };
    window.__pedidos = %s;
    window.supabaseClient = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt', user: { email: 'd@x.com' } } } }) } };
    window.carregarPedido = { abrir: (pedido, sessao) => { window.__carregou = pedido; return Promise.resolve(); } };
"""


def _desvio(pedidos=PEDIDOS):
    import json
    return DESVIO % json.dumps(pedidos)


def test_a_barra_do_topo_e_meus_pedidos_e_nao_ha_mais_camera():
    saida = _no_navegador("""
        return {
            barra: document.getElementById('btn-meus-pedidos').textContent.trim(),
            mais: !!document.getElementById('btn-meus-pedidos-mais'),
            camera: !!document.getElementById('caixa-qr'),
            lerQr: !!window.lerQR,
            antigo: !!document.getElementById('btn-ler-qr'),
        };
    """)
    assert saida["barra"] == "Meus Pedidos"
    assert saida["mais"] is True
    assert saida["camera"] is False and saida["lerQr"] is False and saida["antigo"] is False


def test_tocar_na_barra_com_sessao_desenha_os_cartoes():
    saida = _no_navegador(_desvio() + """
        document.getElementById('btn-meus-pedidos').click();
        await new Promise(r => setTimeout(r, 80));
        const c = document.getElementById('pedido-20272');
        return {
            visivel: !document.getElementById('meus-pedidos').classList.contains('sumindo'),
            listaEscondida: document.getElementById('lista').classList.contains('sumindo'),
            quantos: document.querySelectorAll('#pedidos .cartao-pedido').length,
            texto: c.textContent,
            botao: document.getElementById('carregar-20272').textContent.trim(),
        };
    """)
    assert saida["visivel"] is True and saida["listaEscondida"] is True
    assert saida["quantos"] == 2
    t = saida["texto"]
    assert "20272" in t and "Click" in t and "PISTA" in t and "1.500" in t and "VIP" in t
    assert "impresso" in t and "aguardando impressão" in t
    assert saida["botao"] == "Carregar"


def test_sem_sessao_a_barra_pede_para_entrar_primeiro():
    saida = _no_navegador(_desvio() + """
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null } }) } };
        document.getElementById('btn-meus-pedidos').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            entrar: !document.getElementById('bloco-entrar').classList.contains('sumindo'),
            pedidos: !document.getElementById('meus-pedidos').classList.contains('sumindo'),
        };
    """)
    assert saida == {"entrar": True, "pedidos": False}


def test_o_vazio_e_o_sem_cliente_tem_frase():
    vazio = _no_navegador(_desvio({"pedidos": [], "sem_cliente": False}) + """
        await window.meusPedidos.abrir();
        return document.getElementById('sem-pedidos').textContent;
    """)
    assert "imprimir" in vazio
    sem = _no_navegador(_desvio({"pedidos": [], "sem_cliente": True}) + """
        await window.meusPedidos.abrir();
        return document.getElementById('sem-pedidos').textContent;
    """)
    assert "não está ligada a um cliente" in sem and "gráfica" in sem


def test_carregar_chama_a_caixa_com_o_numero_do_pedido():
    saida = _no_navegador(_desvio() + """
        await window.meusPedidos.abrir();
        document.getElementById('carregar-20281').click();
        await new Promise(r => setTimeout(r, 30));
        return window.__carregou;
    """)
    assert saida == 20281


def test_voltar_refaz_a_lista_de_eventos():
    saida = _no_navegador(_desvio() + """
        await window.meusPedidos.abrir();
        window.__chamadas = [];
        document.getElementById('btn-voltar-pedidos').click();
        await new Promise(r => setTimeout(r, 50));
        return {
            lista: !document.getElementById('lista').classList.contains('sumindo'),
            releu: window.__chamadas.includes('/meus-eventos'),
        };
    """)
    assert saida == {"lista": True, "releu": True}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_meus_pedidos_tela.py -v` → FAIL.

- [ ] **Step 3: HTML — a barra, o bloco, a câmera fora**

Em `controle.html`:

1. Substituir o `#bloco-novo-evento` por:

```html
    <!-- A barra "Novo Evento" virou "Meus Pedidos" em 17/08/2026: nao ha mais
         QR do Pedido para ler. Um evento nasce de um pedido impresso, e os
         pedidos vem da conta do cliente. Duas portas para a mesma acao: a barra
         e o rotulo em texto, o `+` fecha a coluna da direita. -->
    <div class="linha-evento" id="bloco-novo-evento">
        <button id="btn-meus-pedidos" class="barra-evento destaque">
            <span class="nome-evento">Meus Pedidos</span>
        </button>
        <button id="btn-meus-pedidos-mais" class="botao-engrenagem"
                aria-label="Meus Pedidos" title="Meus Pedidos">+</button>
    </div>
```

2. Apagar `#caixa-qr` e `#erro-qr`.

3. Depois de `<div id="lista">…</div>`, acrescentar:

```html
    <!-- MEUS PEDIDOS: os pedidos ja impressos deste cliente, cada um com o
         Carregar que o transforma em evento. Quarto estado desta pagina, ao
         lado de #lista, #menu-geral e #engrenagem. -->
    <div id="meus-pedidos" class="sumindo">
        <button id="btn-voltar-pedidos" class="secundario" type="button">← Voltar aos meus eventos</button>
        <h1 class="rotulo-secao">Meus Pedidos</h1>
        <p class="config-ajuda">Os pedidos que a gráfica já imprimiu para você. Carregar um pedido cria o evento dele em <strong>Meus Eventos</strong>.</p>
        <div id="pedidos"></div>
        <p id="sem-pedidos" class="aviso sumindo"></p>
    </div>
```

4. Remover as tags `<script>` de `jsqr.min.js`, `portaria-camera.js`, `ler-qr.js`, `instalar.js`, `qrcode-generator.min.js` e `qr-canvas.js`; acrescentar `<script src="meus-pedidos.js?v=629"></script>` logo depois de `conta.js`.

- [ ] **Step 4: `meus-pedidos.js`**

```js
/**
 * "Meus Pedidos": os pedidos ja impressos do cliente, e o Carregar.
 *
 * O servidor decide o que e "apto" (impresso, legivel, nao cancelado, ainda
 * nao carregado); esta tela so desenha e manda para a caixa do Carregar.
 * Sem sessao, pede para entrar primeiro e volta para ca.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var DA_TELA_INICIAL = ['lista', 'bloco-novo-evento'];

    function mostrarInicial(mostrar) {
        DA_TELA_INICIAL.forEach(function (id) {
            var el = $(id);
            if (el) { el.classList.toggle('sumindo', !mostrar); }
        });
    }
    function numero(n) { return Number(n || 0).toLocaleString('pt-BR'); }
    function dataCurta(iso) {
        if (!iso) { return ''; }
        var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
    }
    function texto(pai, tag, conteudo, classe) {
        var el = document.createElement(tag);
        el.textContent = conteudo;          // escrito por gente ou pelo ERP: TEXTO
        if (classe) { el.className = classe; }
        pai.appendChild(el);
        return el;
    }

    function cartaoDePedido(p, sessao) {
        var c = document.createElement('div');
        c.className = 'cartao cartao-pedido';
        c.id = 'pedido-' + p.pedido;
        var topo = document.createElement('div');
        topo.className = 'pedido-topo';
        texto(topo, 'strong', 'Pedido ' + p.pedido);
        texto(topo, 'span', dataCurta(p.data), 'pedido-data');
        c.appendChild(topo);
        texto(c, 'div', p.nome_evento, 'pedido-nome');
        var setores = document.createElement('div');
        setores.className = 'pedido-setores';
        (p.setores || []).forEach(function (s) {
            var linha = document.createElement('div');
            linha.className = 'pedido-setor';
            texto(linha, 'span', s.nome + ' · ' + numero(s.quantidade));
            texto(linha, 'span', s.impresso ? 'impresso' : 'aguardando impressão',
                  'selo-impressao ' + (s.impresso ? 'sim' : 'nao'));
            setores.appendChild(linha);
        });
        c.appendChild(setores);
        var acoes = document.createElement('div');
        acoes.className = 'pedido-acoes';
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'carregar-' + p.pedido;
        b.textContent = 'Carregar';
        b.addEventListener('click', function () {
            if (!window.carregarPedido) { return; }
            window.carregarPedido.abrir(p.pedido, sessao, p);
        });
        acoes.appendChild(b);
        c.appendChild(acoes);
        return c;
    }

    function desenhar(resposta, sessao) {
        var caixa = $('pedidos');
        var vazio = $('sem-pedidos');
        caixa.innerHTML = '';
        var lista = (resposta && resposta.pedidos) || [];
        lista.forEach(function (p) { caixa.appendChild(cartaoDePedido(p, sessao)); });
        if (resposta && resposta.sem_cliente) {
            vazio.textContent = 'Sua conta ainda não está ligada a um cliente. Peça à gráfica para liberar o seu acesso.';
        } else {
            vazio.textContent = 'Nenhum pedido impresso para carregar. Assim que a gráfica imprimir um pedido seu, ele aparece aqui.';
        }
        vazio.classList.toggle('sumindo', lista.length > 0);
    }

    function abrir() {
        return window.AcessoConta.sessao().catch(function () { return null; }).then(function (s) {
            if (!s) {
                window.conta.mostrarEntrar({ depois: function () { return abrir(); } });
                return;
            }
            if (window.menuGeral) { window.menuGeral.fechar(); }
            mostrarInicial(false);
            $('meus-pedidos').classList.remove('sumindo');
            $('pedidos').innerHTML = '';
            var vazio = $('sem-pedidos');
            vazio.textContent = 'Buscando os seus pedidos…';
            vazio.classList.remove('sumindo');
            return window.AcessoConta.pedir('/meus-pedidos', {
                headers: { Authorization: 'Bearer ' + s.access_token }
            }).then(function (r) { desenhar(r, s); }).catch(function (e) {
                vazio.textContent = (e && e.status)
                    ? ((e.message) || 'Não consegui buscar os seus pedidos agora.')
                    : 'Preciso de internet para buscar os seus pedidos. Confira a conexão e tente de novo.';
                vazio.classList.remove('sumindo');
            });
        });
    }

    function fechar() {
        $('meus-pedidos').classList.add('sumindo');
        mostrarInicial(true);
        return window.listaEventos.recarregar();
    }

    function ligar() {
        if (!$('meus-pedidos')) { return; }
        ['btn-meus-pedidos', 'btn-meus-pedidos-mais'].forEach(function (id) {
            var b = $(id);
            if (b) { b.addEventListener('click', function () { abrir(); }); }
        });
        $('btn-voltar-pedidos').addEventListener('click', function () { fechar(); });
    }

    window.meusPedidos = { abrir: abrir, fechar: fechar, desenhar: desenhar };
    document.addEventListener('DOMContentLoaded', ligar);
})();
```

- [ ] **Step 5: Tirar a câmera de quem a chamava**

- `lista-eventos.js`: apagar o bloco `var mais = $('btn-ler-qr-mais'); … window.lerQR.abrir()` de `arrancar()` (o `meus-pedidos.js` liga os dois botões).
- `menu-geral.js`: apagar a linha `if (window.lerQR) { window.lerQR.fechar(); }`; acrescentar `'meus-pedidos'` **não** — o menu do olho esconde só a tela inicial; `meusPedidos.abrir` já fecha o menu.
- `menu-geral.js` `abrir()`: acrescentar `var mp = $('meus-pedidos'); if (mp) { mp.classList.add('sumindo'); }` para o olho tocado de dentro de Meus Pedidos não empilhar as duas telas.

- [ ] **Step 6: CSS**

`controle.css`, no fim:

```css
/* Meus Pedidos: um cartao por pedido, o Carregar a direita. */
.cartao-pedido { display: grid; gap: 8px; }
.pedido-topo { display: flex; justify-content: space-between; align-items: baseline; }
.pedido-data { color: var(--dim); font-size: .85rem; }
.pedido-nome { font-size: 1.15rem; font-weight: 700; }
.pedido-setores { display: grid; gap: 4px; }
.pedido-setor { display: flex; justify-content: space-between; align-items: center; font-size: .95rem; }
.selo-impressao { font-size: .74rem; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
.selo-impressao.sim { color: #16a34a; border-color: rgba(22,163,74,.5); }
.selo-impressao.nao { color: var(--dim); border-color: rgba(148,163,184,.4); }
.pedido-acoes { display: flex; justify-content: flex-end; margin-top: 4px; }
.pedido-acoes button { width: auto; min-width: 140px; }
```

(Confirmar que `--dim` existe em `controle.css`; se o nome for outro, usar o da folha.)

- [ ] **Step 7: Cache e lista de arquivos**

`sw.js`: em `ARQUIVOS`, acrescentar `'meus-pedidos.js?v=' + VERSAO,` e **remover** `'ler-qr.js?v=' + VERSAO,`, `'qr-canvas.js?v=' + VERSAO,`, `'qrcode-generator.min.js?v=' + VERSAO,`, `'instalar.js?v=' + VERSAO,`. (`portaria-camera.js` e `jsqr.min.js` ficam: a portaria os usa.)

`security_config.py`: acrescentar `"meus-pedidos.js"`; remover `"ler-qr.js"` (o arquivo sai na Task 11; se outro teste exigir que só saia junto com o arquivo, fazer os dois na Task 11).

- [ ] **Step 8: Ajustar os testes que conheciam a barra antiga**

- `tests/test_lista_eventos.py`: `btn-ler-qr` → `btn-meus-pedidos`, `btn-ler-qr-mais` → `btn-meus-pedidos-mais`; a entrada `"lerQR": "ler-qr.js"` do mapa de scripts sai.
- `tests/test_controle_tela.py`: onde diz "Novo Evento" (linhas ~59-69, ~2815-2860) trocar por "Meus Pedidos" e os ids; o trecho que embrulha `window.lerQR.fechar` (~2868) sai.
- `tests/test_aplicativo_unico.py`: `id="btn-ler-qr"` → `id="btn-meus-pedidos"`; o teste que lê `frontend/ler-qr.js` (~182 e ~229) passa a ler só `portaria.js`.

- [ ] **Step 9: Rodar e ver passar; commit**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_meus_pedidos_tela.py tests/test_lista_eventos.py tests/test_controle_tela.py tests/test_conta_tela.py tests/test_aplicativo_unico.py -q`

```bash
git add frontend/controle.html frontend/meus-pedidos.js frontend/lista-eventos.js frontend/menu-geral.js frontend/controle.css frontend/sw.js security_config.py tests/
git commit -m "casa: a barra Novo Evento vira Meus Pedidos -- a lista dos pedidos impressos, sem camera"
```

---

### Task 10: A caixa do Carregar e a pergunta do aparelho (`carregar-pedido.js`)

**Files:**
- Create: `frontend/carregar-pedido.js`
- Modify: `frontend/controle.html` (bloco `#caixa-carregar`, script), `frontend/controle.css`, `frontend/sw.js`, `security_config.py`
- Test: `tests/test_carregar_pedido_tela.py` (novo)

**Interfaces:**
- Consumes: `POST /pedidos/{p}/carregar` (Task 5); `GET /meus-eventos`; `Controle.doCampoParaISO`, `Controle.deISOParaCampo`, `Controle.receberElevacao` (Task 8); `caixaConfirmar.perguntar(texto, {rotulo})`; `virarPortao.criar(evento_id, sessao, elevacao)`; `meusPedidos.fechar()`; `AcessoConta.navegadorId()`.
- Produces: `window.carregarPedido = { abrir(pedido, sessao, dados) }`; ids `#caixa-carregar`, `#carregar-nome`, `#carregar-data`, `#carregar-local`, `#carregar-destino`, `#carregar-senha`, `#btn-carregar-confirmar`, `#btn-carregar-cancelar`, `#erro-carregar`.

- [ ] **Step 1: O teste**

`tests/test_carregar_pedido_tela.py`:

```python
# -*- coding: utf-8 -*-
"""Carregar um pedido: a caixa com a ficha preenchida, 'juntar ao evento',
a senha, e a pergunta se este aparelho vai ler o evento -- sem pedir a senha
de novo, porque o servidor devolveu a elevacao. Decisoes de 17/08/2026."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

DESVIO = """
    window.__chamadas = [];
    const pedirReal = AcessoConta.pedir;
    AcessoConta.pedir = async (caminho, opcoes) => {
        const corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null;
        window.__chamadas.push({ caminho, corpo, headers: (opcoes && opcoes.headers) || {} });
        if (caminho === '/meus-eventos') return { eventos: [
            { id: 'ev-a', nome_evento: 'Click', status: 'ativo' },
            { id: 'ev-fim', nome_evento: 'Velho', status: 'finalizado' } ] };
        if (caminho === '/pedidos/20272/carregar') return { evento_id: 'ev-novo', nome_evento: corpo.nome_evento || 'Click', novo: !corpo.evento_id,
            elevacao: { token: 'elev', expira_em: Math.floor(Date.now()/1000) + 900, minutos: 15 } };
        if (caminho === '/eventos/ev-novo') return { evento: { id: 'ev-novo', nome_evento: 'Click' }, setores: [{ id: 's1' }], aparelhos: [] };
        if (caminho === '/eventos/ev-novo/aparelhos/aqui') return { id: 'a-novo', nome: corpo.nome, token: 'tok' };
        return pedirReal(caminho, opcoes);
    };
    window.aparelhoAqui.assumir = (token, nome, dados) => { window.__assumiu = { token, nome, dados }; return Promise.resolve(); };
    localStorage.setItem('ideal_control_email', 'd@x.com');
    const SESSAO = { access_token: 'jwt', user: { email: 'd@x.com' } };
    const PEDIDO = { pedido: 20272, nome_evento: 'Click', data_evento: '2026-09-12T22:00:00Z', local_evento: 'Arena',
                     setores: [{ nome: 'PISTA', quantidade: 1500, impresso: true }] };
"""


def test_a_caixa_abre_com_a_ficha_preenchida_e_os_eventos_ativos_para_juntar():
    saida = _no_navegador(DESVIO + """
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        const destino = document.getElementById('carregar-destino');
        return {
            visivel: !document.getElementById('caixa-carregar').classList.contains('sumindo'),
            nome: document.getElementById('carregar-nome').value,
            local: document.getElementById('carregar-local').value,
            dataPreenchida: document.getElementById('carregar-data').value !== '',
            opcoes: Array.from(destino.options).map(o => o.textContent),
            email: document.getElementById('carregar-email').textContent,
        };
    """)
    assert saida["visivel"] is True
    assert saida["nome"] == "Click" and saida["local"] == "Arena" and saida["dataPreenchida"]
    assert saida["opcoes"][0].startswith("Criar um evento novo")
    assert any("Click" in o for o in saida["opcoes"][1:]) and not any("Velho" in o for o in saida["opcoes"])
    assert "d@x.com" in saida["email"]


def test_sem_senha_nao_manda_nada():
    saida = _no_navegador(DESVIO + """
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = '';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 30));
        return { erro: document.getElementById('erro-carregar').textContent,
                 chamou: window.__chamadas.some(c => c.caminho.endsWith('/carregar')) };
    """)
    assert "senha" in saida["erro"].lower() and saida["chamou"] is False


def test_confirmar_manda_ficha_e_senha_e_recebe_a_elevacao():
    saida = _no_navegador(DESVIO + """
        window.caixaConfirmar.perguntar = async () => false;   // "Nao": so volta
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-nome').value = 'Click 2026';
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 80));
        const c = window.__chamadas.find(x => x.caminho === '/pedidos/20272/carregar');
        return { corpo: c.corpo, elevacao: JSON.parse(sessionStorage.getItem('acesso_elevacao') || 'null'),
                 caixaFechada: document.getElementById('caixa-carregar').classList.contains('sumindo') };
    """)
    assert saida["corpo"]["nome_evento"] == "Click 2026"
    assert saida["corpo"]["senha"] == "segredo1"
    assert saida["corpo"]["evento_id"] is None
    assert saida["corpo"]["local_evento"] == "Arena"
    assert saida["corpo"]["navegador"]
    assert saida["elevacao"]["evento_id"] == "ev-novo" and saida["elevacao"]["token"] == "elev"
    assert saida["caixaFechada"] is True


def test_juntar_a_um_evento_manda_o_evento_id():
    saida = _no_navegador(DESVIO + """
        window.caixaConfirmar.perguntar = async () => false;
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-destino').value = 'ev-a';
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 80));
        return window.__chamadas.find(x => x.caminho === '/pedidos/20272/carregar').corpo.evento_id;
    """)
    assert saida == "ev-a"


def test_sim_liga_este_aparelho_sem_pedir_a_senha_de_novo():
    saida = _no_navegador(DESVIO + """
        window.__perguntas = [];
        window.caixaConfirmar.perguntar = async (texto) => { window.__perguntas.push(texto); return true; };
        let pediuSenha = false;
        const original = document.getElementById('caixa-entrar-config');
        const obs = new MutationObserver(() => { if (!original.classList.contains('sumindo')) pediuSenha = true; });
        obs.observe(original, { attributes: true });
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'segredo1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 150));
        const aqui = window.__chamadas.find(x => x.caminho === '/eventos/ev-novo/aparelhos/aqui');
        return { pergunta: window.__perguntas[0], pediuSenha, headers: aqui && aqui.headers, corpo: aqui && aqui.corpo,
                 assumiu: window.__assumiu };
    """)
    assert "aparelho" in saida["pergunta"].lower()
    assert saida["pediuSenha"] is False
    assert saida["headers"]["X-Elevacao"] == "elev"
    assert saida["corpo"]["nome"] == "Aparelho 1"
    assert saida["assumiu"]["dados"]["evento_id"] == "ev-novo"


def test_a_recusa_do_servidor_aparece_na_caixa_e_a_caixa_fica():
    saida = _no_navegador(DESVIO + """
        AcessoConta.pedir = async (caminho) => {
            if (caminho === '/meus-eventos') return { eventos: [] };
            const e = new Error('senha nao confere'); e.status = 401; throw e;
        };
        await window.carregarPedido.abrir(20272, SESSAO, PEDIDO);
        document.getElementById('carregar-senha').value = 'errada1';
        document.getElementById('btn-carregar-confirmar').click();
        await new Promise(r => setTimeout(r, 60));
        return { erro: document.getElementById('erro-carregar').textContent,
                 aberta: !document.getElementById('caixa-carregar').classList.contains('sumindo') };
    """)
    assert "senha nao confere" in saida["erro"] and saida["aberta"] is True
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_carregar_pedido_tela.py -v` → FAIL.

- [ ] **Step 3: O HTML da caixa**

Em `controle.html`, depois do `#meus-pedidos`:

```html
    <!-- A CAIXA DO CARREGAR. Nome, data e local vem da ficha da arte
         (`pedidos_artes`), editaveis. "Juntar ao evento" existe para o pedido
         complementar nao virar um segundo evento. A senha vai junto: carregar e
         configuracao, e e essa senha que deixa o passo seguinte (ligar este
         aparelho) acontecer sem pedir outra. -->
    <div id="caixa-carregar" class="cartao sumindo">
        <h1 id="carregar-titulo">Carregar o pedido</h1>
        <label for="carregar-destino">Onde</label>
        <select id="carregar-destino"></select>
        <div id="carregar-campos-novo">
            <label for="carregar-nome">Nome do evento</label>
            <input id="carregar-nome" type="text" maxlength="120">
            <label for="carregar-data">Data e hora</label>
            <input id="carregar-data" type="datetime-local">
            <label for="carregar-local">Local</label>
            <input id="carregar-local" type="text" maxlength="200">
        </div>
        <p class="config-ajuda">Cada modelo do pedido vira um setor do evento. Setor ainda não impresso passa a valer quando a gráfica imprimir.</p>
        <p class="config-ajuda">Conta: <strong id="carregar-email"></strong></p>
        <label for="carregar-senha">Sua senha</label>
        <input id="carregar-senha" type="password" autocomplete="off">
        <button id="btn-carregar-confirmar">Carregar</button>
        <button id="btn-carregar-cancelar" class="secundario">Cancelar</button>
        <div id="erro-carregar" class="aviso erro sumindo" role="alert" style="margin-top:14px;"></div>
    </div>
```

E `<script src="carregar-pedido.js?v=629"></script>` logo depois de `meus-pedidos.js`.

- [ ] **Step 4: `carregar-pedido.js`**

```js
/**
 * Carregar um pedido: a caixa, o POST e a pergunta do aparelho.
 *
 * O servidor devolve, junto com o evento, a elevacao de 15 minutos -- por isso
 * o "Sim, usar este aparelho" liga o aparelho SEM pedir a senha de novo.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var DA_TELA_INICIAL = ['lista', 'bloco-novo-evento', 'meus-pedidos'];

    function esconderTelas(esconder) {
        DA_TELA_INICIAL.forEach(function (id) {
            var el = $(id);
            if (el && id !== 'meus-pedidos') { el.classList.toggle('sumindo', esconder); }
        });
        // Meus Pedidos so se esconde enquanto a caixa esta aberta; ao fechar,
        // quem decide o que volta e o `fechar()` do meusPedidos.
        var mp = $('meus-pedidos');
        if (mp && esconder) { mp.classList.add('sumindo'); }
    }
    function erro(texto) {
        var e = $('erro-carregar');
        e.textContent = texto;
        e.classList.remove('sumindo');
        $('btn-carregar-confirmar').disabled = false;
    }
    function opcao(select, valor, rotulo) {
        var o = document.createElement('option');
        o.value = valor;
        o.textContent = rotulo;
        select.appendChild(o);
    }
    function emailLembrado() {
        try { return localStorage.getItem('ideal_control_email') || ''; } catch (e) { return ''; }
    }

    function preencherDestino(sessao) {
        var select = $('carregar-destino');
        select.innerHTML = '';
        opcao(select, '', 'Criar um evento novo');
        return window.AcessoConta.pedir('/meus-eventos', {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        }).then(function (r) {
            (r.eventos || []).forEach(function (ev) {
                if (ev.status === 'finalizado') { return; }
                opcao(select, ev.id, 'Juntar ao evento ' + ev.nome_evento);
            });
        }).catch(function () { /* sem a lista, so "evento novo" -- que e o padrao */ });
    }

    function abrir(pedido, sessao, dados) {
        dados = dados || {};
        esconderTelas(true);
        $('carregar-titulo').textContent = 'Carregar o pedido ' + pedido;
        $('carregar-nome').value = dados.nome_evento || ('Pedido ' + pedido);
        $('carregar-data').value = dados.data_evento && window.Controle && window.Controle.deISOParaCampo
            ? window.Controle.deISOParaCampo(dados.data_evento) : '';
        $('carregar-local').value = dados.local_evento || '';
        $('carregar-email').textContent = (sessao.user && sessao.user.email) || emailLembrado();
        $('carregar-senha').value = '';
        $('erro-carregar').classList.add('sumindo');
        $('btn-carregar-confirmar').disabled = false;
        $('caixa-carregar').classList.remove('sumindo');
        $('carregar-destino').onchange = function () {
            $('carregar-campos-novo').classList.toggle('sumindo', !!$('carregar-destino').value);
        };
        $('btn-carregar-cancelar').onclick = function () { fechar(); };
        $('btn-carregar-confirmar').onclick = function () { confirmar(pedido, sessao); };
        return preencherDestino(sessao).then(function () { $('carregar-senha').focus(); });
    }

    function fechar() {
        $('caixa-carregar').classList.add('sumindo');
        $('carregar-senha').value = '';
        if (window.meusPedidos) { return window.meusPedidos.abrir(); }
        esconderTelas(false);
    }

    function confirmar(pedido, sessao) {
        var senha = $('carregar-senha').value || '';
        var destino = $('carregar-destino').value || null;
        var nome = ($('carregar-nome').value || '').trim();
        if (!senha) { return erro('Digite a sua senha para carregar o pedido.'); }
        if (!destino && !nome) { return erro('Dê um nome ao evento.'); }
        $('erro-carregar').classList.add('sumindo');
        $('btn-carregar-confirmar').disabled = true;
        var corpo = {
            nome_evento: nome,
            data_evento: window.Controle && window.Controle.doCampoParaISO
                ? window.Controle.doCampoParaISO($('carregar-data').value) : null,
            local_evento: ($('carregar-local').value || '').trim() || null,
            evento_id: destino,
            senha: senha,
            navegador: window.AcessoConta.navegadorId()
        };
        return window.AcessoConta.pedir('/pedidos/' + pedido + '/carregar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token },
            body: JSON.stringify(corpo)
        }).then(function (r) {
            $('carregar-senha').value = '';
            $('caixa-carregar').classList.add('sumindo');
            if (window.Controle && window.Controle.receberElevacao) {
                window.Controle.receberElevacao(r.evento_id, r.elevacao);
            }
            var frase = (r.novo ? 'Evento criado. ' : 'Pedido juntado ao evento ' + (r.nome_evento || '') + '. ')
                + 'Quer usar este aparelho para ler os ingressos dele?';
            return window.caixaConfirmar.perguntar(frase, { rotulo: 'Sim, usar este aparelho' })
                .then(function (sim) {
                    if (sim) {
                        return window.virarPortao.criar(r.evento_id, sessao, r.elevacao).catch(function (e) {
                            if (window.meusPedidos) { window.meusPedidos.fechar(); }
                            var aviso = $('erro-arranque');
                            if (aviso) {
                                aviso.textContent = 'O evento foi criado, mas não consegui ligar este aparelho: '
                                    + ((e && e.message) || 'tente pela barra do evento.');
                                aviso.classList.remove('sumindo');
                            }
                        });
                    }
                    if (window.meusPedidos) { return window.meusPedidos.fechar(); }
                });
        }).catch(function (e) {
            erro((e && e.message) || 'Não consegui carregar o pedido agora. Confira a internet e tente de novo.');
        });
    }

    window.carregarPedido = { abrir: abrir, fechar: fechar };
})();
```

- [ ] **Step 5: CSS, cache, lista**

`controle.css`: `#caixa-carregar select { width: 100%; font-size: 1rem; padding: 12px; border-radius: 12px; }` (seguir o estilo de `input` da folha; se já houver regra para `select`, não duplicar).

`sw.js`: `'carregar-pedido.js?v=' + VERSAO,` depois de `meus-pedidos.js`. `security_config.py`: `"carregar-pedido.js"`.

- [ ] **Step 6: Rodar e ver passar; commit**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_carregar_pedido_tela.py tests/test_meus_pedidos_tela.py tests/test_conta_tela.py tests/test_controle_tela.py -q`

```bash
git add frontend/carregar-pedido.js frontend/controle.html frontend/controle.css frontend/sw.js security_config.py tests/test_carregar_pedido_tela.py
git commit -m "casa: Carregar -- a caixa com a ficha da arte, juntar ao evento, senha, e a pergunta se este aparelho le o evento"
```

---
### Task 11: O que sai — `evento.html`, `ler-qr.js`, o botão "QR do Evento", redirecionamentos

**Files:**
- Delete: `frontend/evento.html`, `frontend/evento.js`, `frontend/ler-qr.js`, `tests/test_ler_qr.py`, `tests/ler_qr_harness.js`
- Modify: `vercel.json` (redirect de `/evento.html` sai), `frontend/sw.js` (`evento.html`, `evento.js` saem de `ARQUIVOS`), `security_config.py` (`evento.html`, `evento.js`, `ler-qr.js` saem de `PAINEL_ARQUIVOS`), `frontend/script.js` (botão e `gerarQrDoEvento`), `frontend/index.html` (texto `#ic-sem-evento`)
- Modify: `tests/test_aplicativo_unico.py`, `tests/test_controle_tela.py:107-108`, `tests/test_painel_base_url.py` (comentários), `tests/test_portaria_pwa.py` (se listar `evento.html`)

**Interfaces:**
- Produces: nenhum caminho de tela para o QR do Pedido. `acesso-evento`, `acesso-pedido` e `POST /reivindicar` **continuam no servidor** — não tocar.

- [ ] **Step 1: Escrever o teste de que o caminho antigo saiu da tela**

Em `tests/test_aplicativo_unico.py`, substituir `PAGINAS_DO_APLICATIVO = ("controle.html", "evento.html", "portaria.html")` por `("controle.html", "portaria.html")` e acrescentar no fim:

```python
def test_o_qr_do_pedido_saiu_da_tela_e_o_servidor_ficou_um_release():
    """Decisao de 17/08/2026: tela e botao saem agora; as funcoes ficam um
    release sem chamador, como rede de volta."""
    assert not os.path.exists(os.path.join(RAIZ, "frontend", "evento.html"))
    assert not os.path.exists(os.path.join(RAIZ, "frontend", "ler-qr.js"))
    script = _ler("frontend/script.js")
    assert "gerarQrDoEvento" not in script
    assert "QR do Evento" not in script
    assert "acesso-pedido" not in script, "nenhuma tela chama mais o acesso-pedido"
    # o servidor fica: apagar e o release seguinte
    assert os.path.isdir(os.path.join(RAIZ, "supabase", "functions", "acesso-evento"))
    assert os.path.isdir(os.path.join(RAIZ, "supabase", "functions", "acesso-pedido"))
    vercel = _ler("vercel.json")
    assert '"/evento.html"' not in vercel
```

(`RAIZ` e `_ler` já existem no arquivo; conferir os nomes.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_aplicativo_unico.py -v` → FAIL no teste novo.

- [ ] **Step 3: Apagar e ajustar**

```bash
git rm frontend/evento.html frontend/evento.js frontend/ler-qr.js tests/test_ler_qr.py tests/ler_qr_harness.js
```

- `vercel.json`: remover o objeto `{ "source": "/evento.html", "destination": "/ic/evento.html" }` de `redirects`.
- `frontend/sw.js`: remover as linhas `'evento.html',` e `'evento.js?v=' + VERSAO,` de `ARQUIVOS`, e o comentário que as apresenta.
- `security_config.py`: remover `"evento.html"`, `"evento.js"`, `"ler-qr.js"` de `PAINEL_ARQUIVOS`.
- `frontend/script.js`: apagar a função `window.gerarQrDoEvento` (linhas ~15129-15200, até o fechamento dela — conferir com `grep -n "^};" `) e o `btns.push(...)` do botão "🎟️ QR do Evento" (linha ~20072). Se `copiarCodigoAcesso` (linha ~15108) só servir ao QR, sai junto; se outro lugar o usar (`grep -n copiarCodigoAcesso frontend/`), fica.
- `frontend/index.html` `#ic-sem-evento` (linha ~2530): o texto vira `Este pedido ainda não virou evento. O cliente carrega o pedido no aplicativo — libere o acesso dele abaixo, em "Acesso do cliente".`
- `tests/test_controle_tela.py:105-108` (o teste que lê `frontend/evento.html`): apagar o teste.
- `tests/test_aplicativo_unico.py`: nos loops que iteram `("controle.html", "evento.html")` e `("frontend/portaria.js", "frontend/ler-qr.js")`, tirar os itens que saíram; no teste dos redirects (`~129`), `"/evento.html"` sai da tupla.
- `tests/test_painel_base_url.py:41`: só comentário; atualizar a frase para não citar `ler-qr.js`.

- [ ] **Step 4: Rodar a suíte da casa e do aplicativo**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_aplicativo_unico.py tests/test_controle_tela.py tests/test_lista_eventos.py tests/test_conta_tela.py tests/test_meus_pedidos_tela.py tests/test_carregar_pedido_tela.py tests/test_portaria_pwa.py tests/test_painel_base_url.py tests/test_conta_do_cliente_e_a_do_vibe.py -q`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/ vercel.json security_config.py tests/
git commit -m "sai o QR do Pedido da tela: evento.html, ler-qr.js e o botao QR do Evento; as funcoes do servidor ficam um release"
```

---

### Task 12: O painel da gráfica — bloco "Acesso do cliente" e o QR de instalação

**Files:**
- Modify: `frontend/index.html` (bloco `#ic-acesso-secao` dentro de `#ic-conteudo`, antes de `#ic-sem-evento`)
- Modify: `frontend/ideal-control.js` (`desenharAcessoDoCliente`, `liberarAcesso`, `novaSenhaProvisoria`, `desenharQrInstalacao`)
- Test: `tests/test_ideal_control_tela.py` (acrescentar casos)

**Interfaces:**
- Consumes: `GET /pedidos/{p}` com `cliente` (Task 6); `POST /clientes/{id}/contas`; `POST /contas/{uid}/nova-senha`; `GET /instalacao`; `window.renderQRCodeOnCtx(ctx, texto, tamanho)` de `qr-canvas.js` (já carregado pelo `index.html` — conferir a assinatura em `frontend/qr-canvas.js`); `pedir(caminho, opcoes)`, `texto()`, `selo()` do próprio arquivo; `caixaConfirmar` **não** existe no painel — usar o `confirmarAcao`/modal que o `script.js` já oferece, ou um `window.confirm` **não**: o painel roda em navegador de estação, e a regra é a mesma — a confirmação é em DOM. Se não houver caixa de confirmação reutilizável no painel, desenhar a confirmação inline (dois botões que aparecem no lugar do primeiro).
- Produces: ids `#ic-acesso-secao`, `#ic-acesso-cliente`, `#ic-acesso-contas`, `#ic-acesso-email`, `#ic-acesso-liberar`, `#ic-acesso-senha` (a senha provisória, uma vez), `#ic-qr-instalacao` (canvas), `#ic-qr-link`, `#ic-qr-copiar`.

- [ ] **Step 1: O teste**

Acrescentar em `tests/test_ideal_control_tela.py` (o `_no_navegador` do arquivo já substitui `IdealControl._pedirParaTeste`; ver o padrão em ~277):

```python
CLIENTE = {"id_cliente": 14, "nome": "DANIEL MOREIRA", "email": "daniel@exemplo.com",
           "contas": [{"auth_user_id": "u-1", "email": "maria@exemplo.com", "criada_aqui": True,
                       "senha_provisoria": False, "criado_em": "2026-08-17T10:00:00Z"}]}


def test_o_bloco_acesso_do_cliente_mostra_o_cliente_e_as_contas():
    saida = _no_navegador("""
        window.__painel.cliente = %s;
        await IdealControl.abrirPedido(20272);
        const bloco = document.getElementById('ic-acesso-secao');
        return { visivel: bloco.style.display !== 'none', texto: bloco.textContent,
                 email: document.getElementById('ic-acesso-email').value,
                 link: document.getElementById('ic-qr-link').textContent };
    """ % json.dumps(CLIENTE))
    assert saida["visivel"] is True
    assert "DANIEL MOREIRA" in saida["texto"] and "maria@exemplo.com" in saida["texto"]
    assert "Nova senha provisória" in saida["texto"]
    assert saida["email"] == "daniel@exemplo.com"
    assert saida["link"] == "https://ideal-imposition.vercel.app/ic/"


def test_liberar_acesso_mostra_a_senha_provisoria_uma_vez():
    saida = _no_navegador("""
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com', ja_tinha_conta: false, senha_provisoria: 'K7M2PQ9X' };
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 60));
        const senha = document.getElementById('ic-acesso-senha');
        return { visivel: senha.style.display !== 'none', texto: senha.textContent,
                 corpo: window.__chamadas.find(c => c.caminho === '/clientes/14/contas').corpo };
    """ % json.dumps(CLIENTE))
    assert saida["visivel"] and "K7M2PQ9X" in saida["texto"]
    assert saida["corpo"] == {"email": "daniel@exemplo.com"}


def test_email_que_ja_tinha_conta_so_liga_e_diz_isso():
    saida = _no_navegador("""
        window.__painel.cliente = %s;
        window.__respostas['/clientes/14/contas'] = { email: 'daniel@exemplo.com', ja_tinha_conta: true, senha_provisoria: null };
        await IdealControl.abrirPedido(20272);
        document.getElementById('ic-acesso-liberar').click();
        await new Promise(r => setTimeout(r, 60));
        return document.getElementById('ic-acesso-secao').textContent;
    """ % json.dumps(CLIENTE))
    assert "já tem conta" in saida and "senha que já usa" in saida


def test_o_bloco_some_quando_o_pedido_nao_tem_cliente_no_erp():
    saida = _no_navegador("""
        window.__painel.cliente = null;
        await IdealControl.abrirPedido(20272);
        return document.getElementById('ic-acesso-secao').style.display;
    """)
    assert saida == "none"
```

Para isso, o `_no_navegador` do arquivo precisa expor `window.__painel` (o painel falso, mutável) e `window.__respostas` + `window.__chamadas` no `_pedirParaTeste`. Se ainda não expuser, acrescentar no driver, junto do `IdealControl._pedirParaTeste = async (caminho, opcoes) => {`: registrar `{caminho, corpo}` em `window.__chamadas`, devolver `window.__respostas[caminho]` quando existir, e devolver `window.__painel` para `/pedidos/20272`. `json` precisa estar importado no topo do arquivo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_ideal_control_tela.py -k "acesso or liberar or ja_tinha or sem_cliente" -v` → FAIL.

- [ ] **Step 3: O HTML**

Em `frontend/index.html`, dentro de `#ic-conteudo`, logo **antes** de `<p id="ic-sem-evento" …>`:

```html
                    <!-- ACESSO DO CLIENTE: onde o atendente libera o aplicativo
                         para o cliente deste pedido, com senha provisoria, e o
                         QR de instalacao (um so, generico). Decisao de 17/08/2026:
                         o QR do Pedido saiu; a conta do cliente e que traz os pedidos. -->
                    <div id="ic-acesso-secao" style="display:none;">
                        <h3 class="ic-secao-titulo">Acesso do cliente</h3>
                        <div class="card" style="padding:14px 16px;">
                            <p id="ic-acesso-cliente" style="margin:0 0 8px;font-weight:600;"></p>
                            <div id="ic-acesso-contas" class="ic-dim" style="margin-bottom:12px;"></div>
                            <div class="ic-grade">
                                <div class="ic-campo">
                                    <label for="ic-acesso-email">E-mail do cliente</label>
                                    <input id="ic-acesso-email" class="form-control" type="email" autocomplete="off">
                                </div>
                            </div>
                            <button id="ic-acesso-liberar" class="btn btn-sm btn-primary">Liberar acesso</button>
                            <p id="ic-acesso-aviso" class="ic-ajuda" style="display:none;"></p>
                            <div id="ic-acesso-senha" class="card ic-codigo-caixa" style="display:none;margin-top:12px;">
                                <h4 style="margin:0 0 6px;">Senha provisória — anote e passe ao cliente</h4>
                                <p class="ic-ajuda">Ela aparece uma vez só. No primeiro acesso o cliente escolhe a senha dele.</p>
                                <div class="ic-codigo" id="ic-acesso-senha-valor"></div>
                                <button id="ic-acesso-senha-copiar" class="btn btn-sm btn-outline">Copiar a senha</button>
                            </div>
                            <hr style="margin:16px 0;border-color:rgba(255,255,255,.08);">
                            <h4 style="margin:0 0 6px;">QR de instalação do aplicativo</h4>
                            <p class="ic-ajuda">Um só para todos os clientes: leva à instalação do Ideal Control. Pode ir para material impresso e para o WhatsApp.</p>
                            <canvas id="ic-qr-instalacao" width="180" height="180" style="background:#fff;border-radius:8px;"></canvas>
                            <p><code id="ic-qr-link"></code> <button id="ic-qr-copiar" class="btn btn-sm btn-ghost">Copiar link</button></p>
                        </div>
                    </div>
```

(Se as classes `ic-codigo-caixa` / `ic-codigo` não existirem no CSS do painel, usar `card` e um `<strong style="font-size:1.6rem;letter-spacing:.12em;">`.)

- [ ] **Step 4: O JS**

Em `frontend/ideal-control.js`, acrescentar antes de `desenhar()`:

```js
    var URL_INSTALACAO_PADRAO = 'https://ideal-imposition.vercel.app/ic/';

    function copiar(textoParaCopiar, avisoOk) {
        var p = navigator.clipboard && navigator.clipboard.writeText
            ? navigator.clipboard.writeText(textoParaCopiar) : Promise.reject();
        return p.then(function () { avisar(avisoOk, 'success'); })
            .catch(function () { avisar('Não consegui copiar; selecione e copie à mão.', 'warning'); });
    }

    function desenharQrInstalacao(url) {
        var link = $('ic-qr-link');
        link.textContent = url;
        var canvas = $('ic-qr-instalacao');
        if (canvas && typeof window.renderQRCodeOnCtx === 'function') {
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            window.renderQRCodeOnCtx(ctx, url, canvas.width);
        }
        $('ic-qr-copiar').onclick = function () { copiar(url, 'Link copiado.'); };
    }

    function desenharAcessoDoCliente() {
        var p = estado.painel, secao = $('ic-acesso-secao');
        var c = p && p.cliente;
        secao.style.display = c ? '' : 'none';
        if (!c) { return; }
        $('ic-acesso-cliente').textContent = c.nome + ' (cliente ' + c.id_cliente + ')'
            + (c.email ? ' · ' + c.email : '');
        var contas = $('ic-acesso-contas');
        contas.innerHTML = '';
        if (!c.contas.length) {
            texto(contas, 'div', 'Sem acesso ainda. Libere abaixo com o e-mail do cliente.');
        }
        c.contas.forEach(function (ct) {
            var linha = document.createElement('div');
            linha.className = 'ic-conta';
            texto(linha, 'span', (ct.criada_aqui ? 'Acesso liberado' : 'Conta do Vibe ligada')
                + ' para ' + ct.email + (ct.criado_em ? ' em ' + new Date(ct.criado_em).toLocaleDateString('pt-BR') : '')
                + (ct.senha_provisoria ? ' · ainda com senha provisória' : ''));
            if (ct.criada_aqui) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn btn-sm btn-outline';
                b.style.marginLeft = '8px';
                b.textContent = 'Nova senha provisória';
                b.addEventListener('click', function () { novaSenhaProvisoria(ct, b); });
                linha.appendChild(b);
            } else {
                texto(linha, 'span', ' — entra com a senha que já usa', 'ic-dim');
            }
            contas.appendChild(linha);
        });
        $('ic-acesso-email').value = c.email || '';
        $('ic-acesso-senha').style.display = 'none';
        $('ic-acesso-aviso').style.display = 'none';
        $('ic-acesso-liberar').disabled = false;
        $('ic-acesso-liberar').onclick = liberarAcesso;
        pedir('/instalacao').then(function (r) { desenharQrInstalacao((r && r.url) || URL_INSTALACAO_PADRAO); })
            .catch(function () { desenharQrInstalacao(URL_INSTALACAO_PADRAO); });
    }

    function mostrarSenhaProvisoria(senha) {
        var caixa = $('ic-acesso-senha');
        $('ic-acesso-senha-valor').textContent = senha;
        caixa.style.display = '';
        $('ic-acesso-senha-copiar').onclick = function () { copiar(senha, 'Senha copiada.'); };
    }

    function liberarAcesso() {
        var c = estado.painel.cliente;
        var email = ($('ic-acesso-email').value || '').trim().toLowerCase();
        var aviso = $('ic-acesso-aviso');
        if (!email) { aviso.textContent = 'Escreva o e-mail do cliente.'; aviso.style.display = ''; return; }
        $('ic-acesso-liberar').disabled = true;
        return pedir('/clientes/' + c.id_cliente + '/contas', {
            method: 'POST', body: JSON.stringify({ email: email })
        }).then(function (r) {
            if (r.ja_tinha_conta) {
                aviso.textContent = 'Esse e-mail já tem conta; ela foi ligada a este cliente e a pessoa entra com a senha que já usa.';
                aviso.style.display = '';
            } else {
                mostrarSenhaProvisoria(r.senha_provisoria);
            }
            // Relê o pedido para a lista de contas se atualizar; a senha na tela fica.
            return pedir('/pedidos/' + estado.pedido).then(function (p) {
                estado.painel = p;
                var senhaNaTela = $('ic-acesso-senha').style.display !== 'none';
                var senha = $('ic-acesso-senha-valor').textContent;
                var avisoTexto = aviso.style.display !== 'none' ? aviso.textContent : '';
                desenharAcessoDoCliente();
                if (senhaNaTela) { mostrarSenhaProvisoria(senha); }
                if (avisoTexto) { aviso.textContent = avisoTexto; aviso.style.display = ''; }
            });
        }).catch(function (e) {
            $('ic-acesso-liberar').disabled = false;
            aviso.textContent = (e && e.message) || 'Não consegui liberar o acesso agora.';
            aviso.style.display = '';
        });
    }

    function novaSenhaProvisoria(conta, botao) {
        // Confirmacao em DOM: o botao vira a pergunta, com Sim e Nao ao lado.
        var pai = botao.parentNode;
        botao.style.display = 'none';
        var pergunta = document.createElement('span');
        pergunta.textContent = ' A senha atual de ' + conta.email + ' deixa de valer. Gerar outra? ';
        var sim = document.createElement('button');
        sim.type = 'button'; sim.className = 'btn btn-sm btn-primary'; sim.textContent = 'Sim, gerar';
        var nao = document.createElement('button');
        nao.type = 'button'; nao.className = 'btn btn-sm btn-ghost'; nao.textContent = 'Não';
        pai.appendChild(pergunta); pai.appendChild(sim); pai.appendChild(nao);
        function limpar() { pergunta.remove(); sim.remove(); nao.remove(); botao.style.display = ''; }
        nao.addEventListener('click', limpar);
        sim.addEventListener('click', function () {
            sim.disabled = true;
            pedir('/contas/' + conta.auth_user_id + '/nova-senha', { method: 'POST', body: '{}' })
                .then(function (r) { limpar(); mostrarSenhaProvisoria(r.senha_provisoria); })
                .catch(function (e) { limpar(); avisar((e && e.message) || 'Não consegui gerar a senha.', 'error'); });
        });
    }
```

E em `desenhar()`, logo depois de `desenharSituacao();`, chamar `desenharAcessoDoCliente();`.

Conferir como o `pedir()` deste arquivo trata `opcoes.body` e `method` (o `_pedirNaRede` monta `o.headers = h` — o `Content-Type: application/json` tem de estar em `cabecalhos()`; se não estiver, acrescentar).

- [ ] **Step 5: Rodar e ver passar; commit**

Run: `.\venv\Scripts\python.exe -m pytest tests/test_ideal_control_tela.py -q`

```bash
git add frontend/index.html frontend/ideal-control.js tests/test_ideal_control_tela.py
git commit -m "painel da grafica: o bloco Acesso do cliente -- liberar acesso com senha provisoria, nova senha, e o QR de instalacao"
```

---

### Task 13: Acabamento — visual da casa, fotos, documentação

**Files:**
- Modify: `frontend/controle.css` (uma passada de coerência nas telas tocadas)
- Modify: `docs/controle_acesso.md` (seção nova "A conta do cliente traz os pedidos (17/08/2026)"), `CHANGELOG.md`
- Test: a suíte inteira + as fotos com a skill `rodar-app`

- [ ] **Step 1: Uma passada visual nas telas tocadas**

O usuário deu liberdade para layout, cores, botões e efeitos. Objetivo: entrar, Meus Pedidos, a caixa do Carregar e a troca de senha parecerem uma família com a lista de eventos. Regras que não mudam: fundo `#0a0f1e`, acento verde-água, rótulo em texto em todo botão, folga no topo, recusa vermelha / outra porta laranja / bom verde. Sugestões concretas, todas em `controle.css`:

- `.barra-evento.destaque` (a barra Meus Pedidos) ganha um ícone de lista à esquerda do texto — SVG embutido pelo `meus-pedidos.js` na `ligar()`, no mesmo estilo dos ícones de `lista-eventos.js`.
- `.cartao-pedido` com uma linha fina à esquerda na cor do acento quando há setor impresso.
- Botão primário com transição de 120 ms em `transform: scale(.98)` no `:active` (respeitando `prefers-reduced-motion`).
- `#bloco-entrar` e `#trocar-senha` com o logo pequeno acima do título, para a tela de entrar não parecer um formulário solto.

Nada disso muda comportamento; nada disso toca a portaria.

- [ ] **Step 2: Fotografar as telas novas**

Seguir `.claude/skills/rodar-app/SKILL.md` (uvicorn numa porta livre, puppeteer com viewport 390×844, `navigator.standalone` simulado, servidor imitado). Fotografar: entrar (T20), Meus Pedidos com dois cartões (T21), a caixa do Carregar (T22), a pergunta do aparelho (T23), trocar senha obrigatória (T24), o menu do olho com Minha conta (T25), o bloco "Acesso do cliente" no painel (T26). Guardar em `docs/superpowers/telas/2026-08-17/` **não** — as fotos ficam no scratchpad; no repositório só entra o que for documentação escrita.

- [ ] **Step 3: Documentar**

Em `docs/controle_acesso.md`, depois de "## Reivindicar o evento", uma seção nova:

```markdown
## A conta do cliente traz os pedidos (17/08/2026)

O QR do Pedido saiu de circulação. O que existe agora:

1. **A gráfica libera o acesso** no painel, dentro do pedido, no bloco "Acesso do
   cliente": cria a conta na mesma auth do Vibe com uma senha provisória (8
   símbolos, sem `0 O 1 I L`, mostrada uma vez) e grava a ligação conta ↔
   `id_cliente` em `producao_acesso_contas`. E-mail que já tinha conta é só
   ligado — a senha dele fica em paz (`criada_aqui = false`).
2. **O cliente instala o app pelo QR de instalação** (um só, genérico:
   `https://ideal-imposition.vercel.app/ic/`) e entra. O primeiro acesso obriga a
   trocar a senha. "Esqueci minha senha" manda falar com a gráfica: o projeto não
   tem SMTP, e-mail não chega.
3. **"Meus Pedidos"** (`GET /meus-pedidos`) lista os pedidos do cliente **já
   impressos** — com pelo menos uma credencial publicada; `publicado_em` não serve,
   porque gerar QR e reimprimir a zeram —, legíveis, não cancelados e ainda não
   carregados. Nome, data e local vêm de `pedidos_artes`.
4. **"Carregar"** (`POST /pedidos/{p}/carregar`) cria o evento (ou junta a um
   existente do mesmo cliente), um setor por modelo legível, carimba as
   credenciais e devolve a **elevação de 15 minutos** — por isso o "usar este
   aparelho" logo depois não pede a senha de novo.
5. **Os eventos são do cliente**: toda conta ligada ao mesmo `id_cliente` vê e
   configura os mesmos eventos (`pertenceAConta`). Os eventos antigos continuam
   visíveis pela conta que os criou.

Vocabulário: **"Aparelho"**, não "Portão" — todo aparelho é portão.

Ficam um release, sem chamador: `acesso-evento`, `acesso-pedido` e
`POST /reivindicar`.
```

E atualizar a tabela "Onde cada consumidor fala hoje" tirando a linha de `evento.html` e o botão "QR do Pedido" (ou marcando "sem chamador desde 17/08").

`CHANGELOG.md`: uma entrada com a versão desta leva (o número sai do `publicar.ps1`; escrever "v630" se for o próximo — conferir a última tag com `git tag --list 'v*' | sort -V | tail -1`).

- [ ] **Step 4: A suíte inteira**

Run: `.\venv\Scripts\python.exe -m pytest tests -q -x`
Run: `npx deno test --allow-env --allow-read supabase/functions/`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/controle.css frontend/meus-pedidos.js docs/controle_acesso.md CHANGELOG.md
git commit -m "acabamento: visual das telas novas da casa, e a doc do caminho da conta do cliente"
```

---

### Task 14: Publicação (só quando o usuário mandar)

**Ordem obrigatória:**

1. `.\ferramentas\rodar_sql.ps1 sql\schema_acesso_contas.sql` — já feito na Task 1; conferir com `-Conferir` que nada mudou.
2. `.\ferramentas\conferir.ps1` — nada pendente, nenhum segredo, testes passando; conferir que **outra sessão** deste repositório não deixou trabalho pendente (`git status`).
3. `.\publicar.ps1 "a conta do cliente traz os pedidos: QR de instalacao, Meus Pedidos, Carregar, Aparelho no lugar de Portao" -Sim` — site + as Edge Functions `acesso-conta` e `acesso-interno` (o script faz o deploy das functions antes do push).
4. `.\publicar_agente.ps1 <número novo>` — o executável embute o frontend.
5. Depois: abrir `https://ideal-imposition.vercel.app/ic/` num celular limpo, ver a tela de entrar; no painel da gráfica, liberar o acesso da conta de teste ao cliente 14 e carregar o pedido 18560.

**O que lembrar ao usuário na hora:** a primeira conta real precisa da senha provisória passada por telefone/WhatsApp — o e-mail não chega; e as duas estações atrás (`PC-JR-HOME`, `LAPTOP-9BSK81S0`) precisam ser atualizadas.

---

## Auto-revisão do plano

- **Cobertura da spec:** §1 conta → Tasks 1, 2, 6, 8, 12; §2 casa → 8, 9; §3 Meus Pedidos → 4, 9; §4 Carregar → 5, 10; §5 vocabulário → 7; §6 painel → 6, 12; §7 o que sai → 11; §8 banco → 1, 3; §9 rotas → 3–6; §10 testes → cada task; §11 publicação → 14.
- **Consistência de nomes:** `clientesDaConta`, `contaPrecisaTrocarSenha`, `marcarSenhaTrocada`, `contasDoCliente`, `liberarAcesso`, `novaSenhaProvisoria` (Task 2) são os usados nas Tasks 3–6; `pertenceAConta`, `montarMeusPedidos`, `nomeDaFicha` (3–4); `window.conta`, `window.meusPedidos`, `window.carregarPedido`, `Controle.receberElevacao` (8–10); ids `#btn-meus-pedidos`, `#meus-pedidos`, `#caixa-carregar`, `#trocar-senha` (8–10 e testes).
- **Placeholders:** nenhum "TBD"; onde o plano diz "conferir", é conferência de fato no código existente (assinatura de `renderQRCodeOnCtx`, nome da variável de cor no CSS, `Content-Type` do `cabecalhos()`), com a alternativa escrita.
