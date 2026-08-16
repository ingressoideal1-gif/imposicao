# Fase 2a — A portaria vira Edge Function

> **Para quem for executar:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`, tarefa a tarefa. Os passos usam `- [ ]`.

**Objetivo:** mover os três endpoints do aparelho da portaria do Render para uma Edge
Function do Supabase, cortando uma travessia de internet por consulta e o cold start — sem
janela de parada e sem que um ingresso já impresso deixe de validar.

**Arquitetura:** a função nova roda **ao lado do banco**, no mesmo projeto
(`vwbtitjlpelrcnsytzqw`). O Python continua no ar durante toda a transição; o corte é feito
pelo endereço que o celular usa, e é reversível trocando uma linha. A regra do hash **não é
compartilhada por arquivo** — é amarrada por um teste que compara três implementações
contra um vetor congelado.

**Tecnologias:** Deno / TypeScript nas Edge Functions; `crypto.subtle` para PBKDF2; Python
3.10 / pytest do lado da conferência; PostgREST como hoje.

**Decisão que originou:** `docs/superpowers/specs/2026-08-16-migrar-render-para-supabase-design.md`.

## Por que só a portaria

A Fase 2 do desenho cobria todo o `acesso_*`. É grande demais para um plano só, e as duas
metades têm **consumidores diferentes**: a portaria atende o celular do porteiro; o resto
(`acesso_config`, `acesso_interno`, `acesso_elevacao`, `acesso_conta`) atende a tela do
dono, com login do Vibe. Dá para mover uma sem a outra, e a portaria vem primeiro porque é
onde o cold start dói.

O `acesso_publicacao.py` **não entra**: ele roda na estação, em Python, e continua rodando.
Muda só o endereço para onde ele publica, e isso é da Fase 2b.

## Restrições globais

- **O projeto é `vwbtitjlpelrcnsytzqw`**, que o painel chama de "e-deal". Escolher pelo nome
  leva ao projeto errado — há projetos vazios chamados "Ideal Imposição" e "Ideal Control".
  O `conferir.ps1` (pergunta 7) trava se a CLI estiver ligada em outro.
- **`POR_PAGINA` continua sendo 500 e não pode chegar a 1000.** O PostgREST deste projeto
  tem `max_rows = 1000` (está no `supabase/config.toml`), e esse teto vence qualquer
  `limit` da URL, calado. A paginação pede `POR_PAGINA + 1` para saber se há próxima
  página; com 1000, o "+1" também seria cortado e o aparelho pararia achando que baixou o
  evento inteiro faltando metade.
- **`ITERACOES = 10000` e o algoritmo do hash não mudam.** Mudar invalida todo hash já
  publicado e recusa ingresso que já está na mão do cliente.
- **O sal entra como os BYTES do hexadecimal**, nunca como o texto. É a armadilha que só
  aparece no portão.
- **Respostas iguais para causas diferentes.** Código errado, aparelho revogado e evento
  inexistente devolvem a MESMA coisa: responder diferente conta a um estranho o que existe.
- **Nenhum segredo em arquivo versionado.** O `SUPABASE_ACCESS_TOKEN` mora no `.env.local`;
  o freio do `conferir.ps1` reconhece o formato `sbp_`.
- **Publicar é ação do usuário.** Preparar, avisar, recomendar; ele dispara.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/_compartilhado/hash.ts` | **criar** — o PBKDF2 do QR Ideal em Deno |
| `supabase/functions/_compartilhado/banco.ts` | **criar** — o equivalente do `supabase()`: PostgREST com a chave de serviço |
| `supabase/functions/portaria/index.ts` | **criar** — as três rotas: `entrar`, `faixa`, `leituras` |
| `sql/schema_acesso_freio_pareamento.sql` | **criar** — a tabela que substitui o `_FALHAS` em memória |
| `tests/deno_hash_harness.ts` | **criar** — roda o hash em Deno e imprime o resultado |
| `tests/test_qr_ideal_hash.py` | modificar — passa a comparar **três** implementações |
| `tests/test_portaria_paridade.py` | **criar** — Python e Edge Function respondem a mesma coisa |
| `frontend/portaria.js:32` | modificar — o endereço da portaria, na hora do corte |
| `publicar.ps1` | modificar — aprende a publicar Edge Function |
| `ferramentas/Publicacao.psm1` + `tests/Publicacao.Tests.ps1` | modificar — a lógica e o teste do passo novo |

**Ordem que importa:** o `publicar.ps1` aprende a publicar **antes** de existir função para
publicar (Tarefa 4). O desenho original punha isso na Fase 4, mas o primeiro deploy
acontece aqui — e ele não pode ser um comando digitado à mão, fora dos freios e do git, que
é exatamente a armadilha que este projeto já conhece com o agente.

---

### Tarefa 1: O hash em Deno, amarrado por teste antes de existir função

**Arquivos:**
- Criar: `supabase/functions/_compartilhado/hash.ts`
- Criar: `tests/deno_hash_harness.ts`
- Modificar: `tests/test_qr_ideal_hash.py`

**Interfaces:**
- Consome: `qr_ideal.hash_codigo(conteudo: str, sal: str) -> str` (Python, já existe) e o
  vetor congelado `8cc48cd725a2a437b8a7bf25c312a0f7b85303d85438d0a39842ac21ed4bad9e` para
  `conteudo = "27202HM4IKCBY"` e `sal = "00" * 32`.
- Produz: `hashCodigo(conteudo: string, sal: string): Promise<string>`, exportado de
  `supabase/functions/_compartilhado/hash.ts`.

**Por que o `frontend/qr-ideal-hash.js` NÃO é reaproveitado:** ele é carregado como script
clássico em `frontend/portaria.html:142` e está no cache do `frontend/sw.js`. Um `export`
no topo o transformaria em módulo ES, e um `<script src>` clássico apontando para módulo
falha com erro de sintaxe — a tela da portaria deixaria de carregar inteira. Escrever a
terceira implementação e amarrá-la por teste custa menos e arrisca menos.

- [ ] **Passo 1: Escrever o harness que roda o hash em Deno**

Criar `tests/deno_hash_harness.ts`:

```ts
// Imprime o hash de um conteudo/sal passados por argumento. Existe para o
// pytest poder comparar Deno contra Python sem embutir Deno no teste.
import { hashCodigo } from "../supabase/functions/_compartilhado/hash.ts";

const [conteudo, sal] = Deno.args;
if (!conteudo || !sal) {
  console.error("uso: deno run harness.ts <conteudo> <sal>");
  Deno.exit(2);
}
console.log(await hashCodigo(conteudo, sal));
```

- [ ] **Passo 2: Escrever o teste que falha**

Acrescentar a `tests/test_qr_ideal_hash.py`:

```python
DENO = shutil.which("deno") or shutil.which("deno.exe")


@pytest.mark.skipif(DENO is None, reason="Deno nao instalado nesta maquina")
def test_deno_produz_o_mesmo_hash_do_python():
    """A TERCEIRA implementacao da regra.

    Ela existe porque o `frontend/qr-ideal-hash.js` nao pode ser importado em
    Deno sem virar modulo ES -- e virar modulo ES quebra a tela da portaria,
    que o carrega como script classico.

    Tres copias so sao seguras porque estao amarradas a um valor que NUNCA pode
    mudar: mudar o vetor invalida todo hash ja publicado e recusa ingresso que
    ja esta na mao do cliente. O risco existe no momento em que a terceira e
    escrita, e e agora que este teste morde.
    """
    saida = subprocess.run(
        [DENO, "run", "--allow-read", os.path.join(RAIZ, "tests", "deno_hash_harness.ts"),
         CONTEUDO, SAL],
        capture_output=True, text=True, timeout=120, cwd=RAIZ,
    )
    assert saida.returncode == 0, f"o harness do Deno falhou: {saida.stderr[:400]}"
    assert saida.stdout.strip() == qr_ideal.hash_codigo(CONTEUDO, SAL)


@pytest.mark.skipif(DENO is None, reason="Deno nao instalado nesta maquina")
def test_deno_bate_com_o_vetor_congelado():
    """Redundante de proposito. Se um dia alguem mudar o Python E o Deno juntos,
    o teste acima continuaria passando -- e todo ingresso ja impresso pararia de
    validar. Este aqui e o que nao deixa."""
    saida = subprocess.run(
        [DENO, "run", "--allow-read", os.path.join(RAIZ, "tests", "deno_hash_harness.ts"),
         CONTEUDO, SAL],
        capture_output=True, text=True, timeout=120, cwd=RAIZ,
    )
    assert saida.stdout.strip() == (
        "8cc48cd725a2a437b8a7bf25c312a0f7b85303d85438d0a39842ac21ed4bad9e"
    )
```

Acrescentar ao topo do arquivo os imports que faltam: `import shutil`, `import subprocess`.

- [ ] **Passo 3: Rodar e confirmar que falha**

```
python -m pytest tests/test_qr_ideal_hash.py -v
```

Esperado: os dois novos FALHAM porque `_compartilhado/hash.ts` não existe. Se aparecerem
como `SKIPPED`, o Deno não está instalado — instale (`npm install --save-dev deno` ou
`winget install DenoLand.Deno`) e rode de novo. **Não siga com eles pulando:** um teste
pulado aqui é o mesmo que não ter teste.

- [ ] **Passo 4: Escrever o hash em Deno**

Criar `supabase/functions/_compartilhado/hash.ts`:

```ts
/**
 * O MESMO hash do `qr_ideal.py` e do `frontend/qr-ideal-hash.js`.
 *
 * A nuvem nunca guarda o codigo do QR Ideal -- guarda o hash. Se esta funcao
 * divergir das outras duas em qualquer detalhe, TODO ingresso do evento e
 * recusado na portaria, e nao ha como perceber antes: nao aparece no papel, nao
 * aparece no banco, so aparece com a fila na porta.
 *
 * Quem impede isso e o `tests/test_qr_ideal_hash.py`, que roda as tres e
 * compara contra um valor congelado.
 */

// Tem de ser igual a `qr_ideal.ITERACOES`. Mudar so de um lado quebra em
// silencio; mudar dos tres invalida todo hash ja publicado.
export const ITERACOES = 10000;

function hexParaBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesParaHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashCodigo(conteudo: string, sal: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(conteudo),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // Os BYTES do hexadecimal, nunca o texto dele. E a armadilha desta
      // funcao: passar `sal` cru produz um hash plausivel, diferente do
      // Python, e o erro so aparece na portaria.
      salt: hexParaBytes(sal),
      iterations: ITERACOES,
      hash: "SHA-256",
    },
    chave,
    256,
  );
  return bytesParaHex(bits);
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

```
python -m pytest tests/test_qr_ideal_hash.py -v
./node_modules/.bin/deno check supabase/functions/_compartilhado/hash.ts
```

Esperado: todos passam, **nenhum pulado**, e o `deno check` sai com 0.

> **Armadilha encontrada ao executar, em 16/08/2026 — vale para toda a Tarefa 3
> também.** O teste pode passar com o `deno check` FALHANDO, porque o erro é só de
> tipo. `new Uint8Array(n)` produz `Uint8Array<ArrayBufferLike>`, que inclui
> `SharedArrayBuffer`, e o `BufferSource` que o `crypto.subtle` espera exige
> `ArrayBuffer` de verdade. Em execução é a mesma coisa; em type check, não. E o
> deploy de Edge Function faz type check — o arquivo simplesmente não subiria.
>
> A correção é `new Uint8Array(new ArrayBuffer(n))` com retorno anotado como
> `Uint8Array<ArrayBuffer>`.
>
> **Nunca conferir o `deno check` por `| tail`**: o código de saída do pipe é o do
> `tail`, e um `&& echo OK` depois dele mente. Use `; echo $?` ou rode o comando
> sozinho.

- [ ] **Passo 6: Commit**

```bash
git add supabase/functions/_compartilhado/hash.ts tests/deno_hash_harness.ts tests/test_qr_ideal_hash.py
git commit -m "Portaria: o hash do QR Ideal em Deno, amarrado ao vetor congelado"
```

---

### Tarefa 2: O freio de força bruta vira tabela

**Arquivos:**
- Criar: `sql/schema_acesso_freio_pareamento.sql`
- Modificar: `acesso_portaria.py:60-105` (o `_FALHAS` e as três funções que o usam)
- Modificar: `tests/test_acesso_portaria.py`

**Interfaces:**
- Produz: tabela `producao_acesso_falhas_pareamento (evento_id uuid, momento timestamptz)`,
  e as funções `_conferir_forca_bruta(evento_id)` / `_anotar_falha(evento_id)` passam a
  usá-la em vez do dicionário `_FALHAS`.

**Por que agora, e no Python primeiro:** o `_FALHAS` vive na memória do processo, e o
próprio código já admite que não sobrevive a um reinício do Render. Edge Function é
stateless por natureza — lá ele simplesmente **não existiria**. Fazer a troca no Python
antes do corte significa que a tabela chega em produção testada, e que as duas
implementações vão compartilhar o mesmo freio durante a transição — que é o que impede um
atacante de dobrar as tentativas usando os dois endereços ao mesmo tempo.

- [ ] **Passo 1: Escrever o SQL**

Criar `sql/schema_acesso_freio_pareamento.sql` — arquivo completo, pronto para colar no
editor do Supabase:

```sql
-- Freio de forca bruta do pareamento da portaria.
--
-- Ate 16/08/2026 isto era um dicionario na memoria do processo Python
-- (`_FALHAS`, em acesso_portaria.py). Nao sobrevivia a um reinicio do Render, e
-- com duas instancias nao valeria nada. Ao virar Edge Function, que e stateless
-- por natureza, ele deixaria de existir por completo.
--
-- 31^6 sao 887 milhoes de codigos possiveis e cada tentativa ja custa um PBKDF2
-- de 10.000 voltas. Este e o SEGUNDO freio, nao o primeiro.
create table if not exists producao_acesso_falhas_pareamento (
    id          bigserial primary key,
    evento_id   uuid not null,
    momento     timestamptz not null default now()
);

-- A consulta e sempre "quantas falhas deste evento nos ultimos N segundos".
create index if not exists idx_falhas_pareamento_evento_momento
    on producao_acesso_falhas_pareamento (evento_id, momento desc);

-- Sem limpeza a tabela cresce para sempre por conta de um ataque que ja
-- fracassou. Nada aqui precisa de historico: passada a janela, a linha e lixo.
create or replace function limpar_falhas_pareamento_antigas()
returns void
language sql
as $$
    delete from producao_acesso_falhas_pareamento
     where momento < now() - interval '1 hour';
$$;
```

- [ ] **Passo 2: Rodar o SQL no Supabase**

Abrir o editor SQL do projeto `vwbtitjlpelrcnsytzqw` e colar o arquivo inteiro. Confirmar
que a tabela existe:

```bash
npx supabase inspect db table-stats --linked | grep falhas_pareamento
```

- [ ] **Passo 3: Escrever o teste que falha**

Acrescentar a `tests/test_acesso_portaria.py` — a `FakeBanco` ganha a tabela e o teste
cobra que a contagem venha dela, não da memória:

```python
def test_o_freio_de_forca_bruta_conta_pelo_banco(banco, monkeypatch):
    """Depois de virar Edge Function nao existe mais memoria de processo onde
    guardar isso. E mesmo hoje, no Render, um reinicio zerava o freio -- o
    proprio codigo admitia isso num comentario."""
    monkeypatch.setattr(ap, "MAXIMO_FALHAS", 2)
    for _ in range(2):
        with pytest.raises(HTTPException):
            ap._entrar({"evento_id": EVENTO, "codigo": "ZZZZZZ"})

    # A terceira tem de ser recusada por EXCESSO, e nao por codigo errado.
    with pytest.raises(HTTPException) as e:
        ap._entrar({"evento_id": EVENTO, "codigo": "ZZZZZZ"})
    assert e.value.status_code == 429

    assert len(banco.falhas_pareamento) >= 2, (
        "as falhas nao foram parar no banco -- o freio continua so na memoria"
    )


def test_o_freio_nao_sobrevive_a_janela(banco, monkeypatch):
    """Falha velha nao pode trancar porteiro que errou o codigo ontem."""
    import time
    monkeypatch.setattr(ap, "MAXIMO_FALHAS", 2)
    monkeypatch.setattr(ap, "JANELA_DE_FALHAS", 300)
    banco.falhas_pareamento = [
        {"evento_id": EVENTO, "momento": time.time() - 3600},
        {"evento_id": EVENTO, "momento": time.time() - 3600},
    ]
    # Codigo CERTO: tem de passar, porque as falhas antigas sairam da janela.
    r = ap._entrar({"evento_id": EVENTO, "codigo": "ABC234"})
    assert "token" in r
```

- [ ] **Passo 4: Rodar e confirmar que falha**

```
python -m pytest tests/test_acesso_portaria.py -v
```

Esperado: os dois novos falham (`FakeBanco` não tem `falhas_pareamento`, e o código conta
pela memória).

- [ ] **Passo 5: Trocar a implementação**

Em `acesso_portaria.py`, substituir o bloco do `_FALHAS` (linhas ~57-105):

```python
MAXIMO_FALHAS = 10
JANELA_DE_FALHAS = 300          # segundos

# A contagem mora no BANCO, nao na memoria do processo. Ate 16/08/2026 era um
# dicionario aqui, e o comentario original ja registrava o defeito: nao
# sobrevivia a um reinicio do Render nem a duas instancias. A Edge Function, que
# e stateless, tornaria isso pior -- o freio simplesmente nao existiria.
#
# Compartilhar a tabela tambem e o que impede, durante a transicao, alguem
# dobrar as tentativas batendo nos dois enderecos ao mesmo tempo.
TABELA_FALHAS = "producao_acesso_falhas_pareamento"


def _conferir_forca_bruta(evento_id: str):
    from datetime import datetime, timedelta, timezone
    desde = (datetime.now(timezone.utc)
             - timedelta(seconds=JANELA_DE_FALHAS)).isoformat()
    recentes = supabase(
        "GET",
        f"{TABELA_FALHAS}?evento_id=eq.{evento_id}&momento=gte.{desde}"
        f"&select=id&limit={MAXIMO_FALHAS}",
    ) or []
    if len(recentes) >= MAXIMO_FALHAS:
        raise HTTPException(
            status_code=429,
            detail="muitas tentativas; espere cinco minutos e tente de novo",
        )


def _anotar_falha(evento_id: str):
    # `return=minimal`: a resposta nao interessa, e o corpo de volta seria
    # trafego a toa num caminho que ja esta sob ataque.
    supabase("POST", TABELA_FALHAS, {"evento_id": evento_id},
             prefer="return=minimal")
```

E no `_entrar`, trocar `_FALHAS.pop(evento_id, None)` pela limpeza no banco:

```python
    # Pareou: as falhas daquele evento deixam de contar.
    supabase("DELETE", f"{TABELA_FALHAS}?evento_id=eq.{evento_id}",
             prefer="return=minimal")
```

- [ ] **Passo 6: Ensinar a `FakeBanco` a tabela nova**

Em `tests/test_acesso_portaria.py`, acrescentar ao `__init__` da `FakeBanco`:

```python
        self.falhas_pareamento = []
```

E o roteamento correspondente no despachante da fake, junto dos outros: `GET` filtrando por
`evento_id` e `momento=gte.`, `POST` acrescentando à lista, `DELETE` esvaziando as do
evento.

- [ ] **Passo 7: Rodar e confirmar que passa**

```
python -m pytest tests/test_acesso_portaria.py -v
```

Esperado: tudo passa, incluindo os testes de pareamento que já existiam.

- [ ] **Passo 8: Commit**

```bash
git add sql/schema_acesso_freio_pareamento.sql acesso_portaria.py tests/test_acesso_portaria.py
git commit -m "Portaria: o freio de forca bruta passa a contar pelo banco"
```

---

### Tarefa 3: A Edge Function da portaria

**Arquivos:**
- Criar: `supabase/functions/_compartilhado/banco.ts`
- Criar: `supabase/functions/portaria/index.ts`

**Interfaces:**
- Consome: `hashCodigo` de `_compartilhado/hash.ts` (Tarefa 1); a tabela
  `producao_acesso_falhas_pareamento` (Tarefa 2).
- Produz: as rotas `POST /portaria/entrar`, `GET /portaria/faixa?desde=N`,
  `POST /portaria/leituras`, com **exatamente** os mesmos corpos de resposta do Python.

**O que a Edge Function recebe de graça:** o Supabase injeta `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` no ambiente. Não é preciso configurar segredo nenhum para esta
função — os três segredos nossos (`ACESSO_AGENTE_SEGREDO`, `QR_PEDIDO_SEGREDO`,
`ACESSO_ELEVACAO_SEGREDO`) são da Fase 2b, não desta.

- [ ] **Passo 1: Escrever o acesso ao banco**

Criar `supabase/functions/_compartilhado/banco.ts`:

```ts
/**
 * O equivalente do `supabase()` do `acesso_api.py`: PostgREST com a chave de
 * servico. Nao usar fora do controle de acesso.
 *
 * `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sao injetados pelo proprio
 * Supabase em toda Edge Function -- nao ha segredo a configurar aqui.
 */
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export async function banco(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  prefer?: string,
): Promise<any> {
  const cabecalhos: Record<string, string> = {
    apikey: CHAVE,
    Authorization: `Bearer ${CHAVE}`,
    "Content-Type": "application/json",
  };
  if (prefer) cabecalhos["Prefer"] = prefer;
  else if (metodo === "POST" || metodo === "PATCH") {
    cabecalhos["Prefer"] = "return=representation";
  }

  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) {
    throw new Error(`PostgREST ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}
```

- [ ] **Passo 2: Escrever a função**

Criar `supabase/functions/portaria/index.ts`. As constantes e o formato das respostas são
cópia fiel do `acesso_portaria.py` — divergir aqui é o defeito que este plano existe para
evitar:

```ts
import { hashCodigo } from "../_compartilhado/hash.ts";
import { banco } from "../_compartilhado/banco.ts";

// TEM DE FICAR ABAIXO DE 1000: o PostgREST deste projeto tem max_rows = 1000, e
// esse teto vence QUALQUER limit pedido na URL, calado. O paginador pede
// POR_PAGINA + 1 para saber se ha proxima pagina; com 1000, esse "+1" tambem
// seria cortado e o aparelho pararia achando que baixou o evento inteiro
// faltando metade.
const POR_PAGINA = 500;
const MAXIMO_LEITURAS = 500;
const MAXIMO_FALHAS = 10;
const JANELA_DE_FALHAS = 300;
const TABELA_FALHAS = "producao_acesso_falhas_pareamento";
const RESULTADOS = ["permitido", "negado"];
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function erro(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ok(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    headers: { "Content-Type": "application/json" },
  });
}

/** SHA-256 puro, sem sal e sem KDF lento -- a entrada tem 32 bytes sorteados. */
async function hashDoToken(token: string): Promise<string> {
  const bits = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function conferirForcaBruta(eventoId: string) {
  const desde = new Date(Date.now() - JANELA_DE_FALHAS * 1000).toISOString();
  const recentes = await banco(
    "GET",
    `${TABELA_FALHAS}?evento_id=eq.${eventoId}&momento=gte.${desde}` +
      `&select=id&limit=${MAXIMO_FALHAS}`,
  ) ?? [];
  if (recentes.length >= MAXIMO_FALHAS) {
    throw erro(429, "muitas tentativas; espere cinco minutos e tente de novo");
  }
}

/** A MESMA resposta para codigo errado, aparelho revogado e evento inexistente. */
async function recusarPareamento(eventoId: string): Promise<never> {
  await banco("POST", TABELA_FALHAS, { evento_id: eventoId }, "return=minimal");
  throw erro(401, "codigo invalido");
}

async function setoresDoAparelho(dispositivoId: string): Promise<string[]> {
  const v = await banco(
    "GET",
    `producao_acesso_dispositivo_setores?dispositivo_id=eq.${dispositivoId}&select=setor_id`,
  ) ?? [];
  return v.map((x: any) => x.setor_id);
}

async function aparelhoDoToken(cabecalho: string | null): Promise<any> {
  const valor = (cabecalho ?? "").trim();
  if (!valor.toLowerCase().startsWith("bearer ")) {
    throw erro(401, "aparelho nao pareado");
  }
  const h = await hashDoToken(valor.slice(7).trim());
  const achados = await banco(
    "GET",
    `producao_acesso_dispositivos?token_hash=eq.${h}&status=eq.ativo` +
      `&select=id,evento_id,nome`,
  ) ?? [];
  if (!achados.length) throw erro(401, "aparelho nao pareado ou revogado");
  return achados[0];
}

async function entrar(corpo: any): Promise<Response> {
  const eventoId = String(corpo?.evento_id ?? "").trim();
  const codigo = String(corpo?.codigo ?? "").trim().toUpperCase();
  if (!eventoId || !codigo) return erro(422, "informe o evento e o codigo");

  // O formato do id e conferido AQUI, antes de ir ao banco: o PostgREST recusa
  // `id=eq.nao-e-uuid` com erro de tipo, e o porteiro receberia 500 num portao
  // com fila. E a resposta e a MESMA das outras recusas, de proposito.
  if (!FORMATO_UUID.test(eventoId)) await recusarPareamento(eventoId);

  await conferirForcaBruta(eventoId);

  const evento = (await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}&select=id,nome_evento,sal`,
  ) ?? [])[0];
  if (!evento) await recusarPareamento(eventoId);

  // UM PBKDF2 para a tentativa inteira: o hash depende do codigo e do sal do
  // evento, nao do aparelho. Comparar contra cada aparelho depois e de graca.
  const tentativa = await hashCodigo(codigo, evento.sal);

  const aparelhos = await banco(
    "GET",
    `producao_acesso_dispositivos?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=id,nome,codigo_hash`,
  ) ?? [];
  const achado = aparelhos.find((a: any) => String(a.codigo_hash ?? "") === tentativa);
  if (!achado) await recusarPareamento(eventoId);

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  await banco(
    "PATCH",
    `producao_acesso_dispositivos?id=eq.${achado.id}`,
    { token_hash: await hashDoToken(token), ultimo_visto: "now()" },
    "return=minimal",
  );
  await banco("DELETE", `${TABELA_FALHAS}?evento_id=eq.${eventoId}`, undefined,
    "return=minimal");

  return ok({
    token,
    aparelho: {
      id: achado.id,
      nome: achado.nome,
      setores: await setoresDoAparelho(achado.id),
    },
    evento: { id: evento.id, nome: evento.nome_evento },
  });
}

async function faixa(cabecalho: string | null, desdeBruto: string | null): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  const eventoId = aparelho.evento_id;
  const desde = Math.max(0, parseInt(desdeBruto ?? "0") || 0);

  const evento = (await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}&select=id,nome_evento,sal`,
  ) ?? [])[0];
  if (!evento) return erro(409, "evento nao existe mais");

  const setores = await banco(
    "GET",
    `producao_acesso_setores?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em&order=nome.asc`,
  ) ?? [];
  const bloqueios = await banco(
    "GET",
    `producao_acesso_bloqueios?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=setor_id,de,ate,motivo`,
  ) ?? [];
  const pedidos = await banco(
    "GET",
    `producao_acesso_pedidos?evento_id=eq.${eventoId}&select=pedido_id_int,sal`,
  ) ?? [];

  // Pede POR_PAGINA + 1: e o unico jeito de saber se ha proxima pagina quando o
  // total e MULTIPLO exato de POR_PAGINA. O item extra nunca sobe na resposta.
  const paginaMaisUma = await banco(
    "GET",
    `producao_acesso_credenciais?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=id,codigo_hash,setor_id,numero&order=id.asc` +
      `&offset=${desde}&limit=${POR_PAGINA + 1}`,
  ) ?? [];
  const temProxima = paginaMaisUma.length > POR_PAGINA;
  const pagina = paginaMaisUma.slice(0, POR_PAGINA);

  const sais: Record<string, string> = {};
  for (const p of pedidos) sais[String(p.pedido_id_int)] = p.sal;

  return ok({
    evento: { id: evento.id, nome: evento.nome_evento, sal: evento.sal },
    aparelho: {
      id: aparelho.id,
      nome: aparelho.nome,
      setores: await setoresDoAparelho(aparelho.id),
    },
    sais,
    setores,
    bloqueios,
    // Nomes curtos de proposito: sao 30.000 objetos numa rede de portao.
    credenciais: pagina.map((c: any) => ({
      h: c.codigo_hash, s: c.setor_id, n: c.numero, id: c.id,
    })),
    proxima: temProxima ? desde + POR_PAGINA : null,
  });
}

async function leituras(cabecalho: string | null, corpo: any): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  const itens = corpo?.leituras ?? [];
  if (itens.length > MAXIMO_LEITURAS) {
    return erro(422, `mande no maximo ${MAXIMO_LEITURAS} leituras por vez`);
  }
  if (!itens.length) return ok({ gravadas: 0 });

  const linhas = [];
  for (const i of itens) {
    if (!RESULTADOS.includes(String(i.resultado ?? ""))) {
      return erro(422, "resultado invalido");
    }
    if (!i.id_local || !i.momento) {
      return erro(422, "leitura sem id_local ou momento");
    }
    linhas.push({
      evento_id: aparelho.evento_id,
      // O aparelho e quem o TOKEN diz que e. Aceitar o id do corpo deixaria um
      // aparelho gravar leitura no nome de outro.
      dispositivo_id: aparelho.id,
      credencial_id: i.credencial_id,
      setor_id: i.setor_id,
      resultado: i.resultado,
      id_local: i.id_local,
      momento: i.momento,
    });
  }

  // `on_conflict` e a chave unica que ja existe no esquema: o celular que ficou
  // tres horas offline reenvia a fila inteira, e nada duplica.
  await banco(
    "POST",
    "producao_acesso_leituras?on_conflict=dispositivo_id,id_local",
    linhas,
    "resolution=ignore-duplicates,return=minimal",
  );
  await banco(
    "PATCH",
    `producao_acesso_dispositivos?id=eq.${aparelho.id}`,
    { ultimo_visto: "now()" },
    "return=minimal",
  );
  return ok({ gravadas: linhas.length });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const rota = url.pathname.replace(/^\/portaria\/?/, "");
  const auth = req.headers.get("authorization");

  try {
    if (req.method === "POST" && rota === "entrar") {
      return await entrar(await req.json());
    }
    if (req.method === "GET" && rota === "faixa") {
      return await faixa(auth, url.searchParams.get("desde"));
    }
    if (req.method === "POST" && rota === "leituras") {
      return await leituras(auth, await req.json());
    }
    return erro(404, "rota desconhecida");
  } catch (e) {
    // As recusas viajam como Response lancada -- e o equivalente do
    // HTTPException do FastAPI. Qualquer outra coisa e defeito nosso.
    if (e instanceof Response) return e;
    console.error("[portaria]", e);
    return erro(500, "erro interno");
  }
});
```

- [ ] **Passo 3: Conferir que compila**

```
npx deno check supabase/functions/portaria/index.ts
```

Esperado: sem erro.

- [ ] **Passo 4: Commit**

```bash
git add supabase/functions/
git commit -m "Portaria: a Edge Function com as tres rotas do aparelho"
```

---

### Tarefa 4: O `publicar.ps1` aprende a publicar Edge Function

**Arquivos:**
- Modificar: `ferramentas/Publicacao.psm1`
- Modificar: `tests/Publicacao.Tests.ps1`
- Modificar: `publicar.ps1`

**Interfaces:**
- Consome: `Find-ProjetoSupabaseErrado` (já existe, criada em 16/08/2026).
- Produz: `Get-FuncoesEdgeDoRepo -Raiz <caminho>` devolvendo os nomes das funções em
  `supabase/functions/` que não começam com `_`; e um passo no `publicar.ps1` que as
  publica depois do site.

**Por que antes da função existir em produção:** o desenho punha isto na Fase 4, mas o
primeiro deploy acontece nesta fase. Um `npx supabase functions deploy` digitado à mão é um
caminho para a produção fora do git e fora dos freios — exatamente a armadilha que este
projeto já conhece com o agente, onde a interface chegava à estação sem o executável.

- [ ] **Passo 1: Escrever o teste que falha**

Acrescentar a `tests/Publicacao.Tests.ps1`:

```powershell
Describe "Get-FuncoesEdgeDoRepo" {
    It "lista as funcoes que existem no repositorio" {
        $r = Get-FuncoesEdgeDoRepo -Raiz "$PSScriptRoot\.."
        $r | Should Contain 'portaria'
    }
    It "IGNORA as pastas que comecam com underscore" {
        # `_compartilhado` e biblioteca, nao funcao. Publicar como funcao
        # criaria um endpoint publico que ninguem quis criar.
        $r = Get-FuncoesEdgeDoRepo -Raiz "$PSScriptRoot\.."
        $r | Should Not Contain '_compartilhado'
    }
    It "devolve vazio quando nao ha pasta de funcoes" {
        $vazio = Join-Path $env:TEMP "sem-funcoes-$(Get-Random)"
        New-Item -ItemType Directory -Force $vazio | Out-Null
        try { (Get-FuncoesEdgeDoRepo -Raiz $vazio).Count | Should Be 0 }
        finally { Remove-Item -Recurse -Force $vazio }
    }
}
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```powershell
Invoke-Pester -Path "tests\Publicacao.Tests.ps1" -Quiet -PassThru | Select PassedCount, FailedCount
```

Esperado: 3 falhando.

- [ ] **Passo 3: Implementar**

Em `ferramentas/Publicacao.psm1`, junto de `Find-ProjetoSupabaseErrado`:

```powershell
function Get-FuncoesEdgeDoRepo {
    <#
    .SYNOPSIS
        Nomes das Edge Functions versionadas neste repositorio.
    .DESCRIPTION
        Uma pasta por funcao, em supabase/functions/. As que comecam com `_` sao
        biblioteca compartilhada e NAO sao funcoes: publicar `_compartilhado`
        criaria um endpoint publico que ninguem quis criar.
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param([Parameter(Mandatory)][string]$Raiz)

    $pasta = Join-Path $Raiz "supabase\functions"
    if (-not (Test-Path -PathType Container $pasta)) { return @() }
    return @(Get-ChildItem -Path $pasta -Directory |
             Where-Object { -not $_.Name.StartsWith('_') } |
             ForEach-Object { $_.Name })
}
```

E acrescentar `Get-FuncoesEdgeDoRepo` à lista do `Export-ModuleMember`.

- [ ] **Passo 4: Rodar e confirmar que passa**

```powershell
Invoke-Pester -Path "tests\Publicacao.Tests.ps1" -Quiet -PassThru | Select PassedCount, FailedCount
```

Esperado: 0 falhando.

- [ ] **Passo 5: Acrescentar o passo ao `publicar.ps1`**

Depois do bloco que publica na Vercel, antes do "SUCESSO":

```powershell
# ─── Edge Functions ──────────────────────────────────────────────────────────
# Um `git push` publica o site e o motor. As Edge Functions NAO vao junto: elas
# saem por comando proprio. Sem este passo, publicar o site daria a impressao de
# ter publicado tudo -- a mesma armadilha que existe com o agente, onde a tela
# nova chegava a estacao sem o executavel que a faz funcionar.
$funcoes = Get-FuncoesEdgeDoRepo -Raiz $raiz
if ($funcoes.Count -gt 0) {
    $refEsperado = ''
    $sc = Get-Content -Raw -Encoding UTF8 "$raiz\security_config.py"
    if ($sc -match 'https://([a-z0-9]+)\.supabase\.co') { $refEsperado = $Matches[1] }
    $refLigado = ''
    if (Test-Path "$raiz\supabase\.temp\project-ref") {
        $refLigado = Get-Content -Raw -Encoding UTF8 "$raiz\supabase\.temp\project-ref"
    }
    $problema = Find-ProjetoSupabaseErrado -RefEsperado $refEsperado -RefLigado $refLigado
    if ($problema -ne '') {
        Parar "Edge Function no projeto errado: $problema" `
              "Rode: npx supabase link --project-ref $refEsperado"
    }

    Write-Host "Publicando as Edge Functions..." -ForegroundColor Cyan
    foreach ($f in $funcoes) {
        Write-Host "  $f" -ForegroundColor White
        npx supabase functions deploy $f --project-ref $refEsperado
        if ($LASTEXITCODE -ne 0) {
            Parar "A Edge Function '$f' NAO subiu." `
                  "O site ja foi publicado. Rode '.\voltar.ps1 -Agora' se o painel novo depender dela."
        }
    }
    Write-Host "  Edge Functions no ar." -ForegroundColor Green
}
```

> **Nota para quem executar:** confira o nome exato da função de parada (`Parar`) no topo do
> `publicar.ps1` e use o mesmo. Se a assinatura diferir, adapte a chamada — não invente uma
> função nova.

- [ ] **Passo 6: Ensaiar sem publicar**

```powershell
Get-FuncoesEdgeDoRepo -Raiz . 
npx supabase functions deploy portaria --project-ref vwbtitjlpelrcnsytzqw --dry-run
```

Esperado: a lista traz `portaria` e não traz `_compartilhado`; o dry-run não reclama.

- [ ] **Passo 7: Commit**

```bash
git add ferramentas/Publicacao.psm1 tests/Publicacao.Tests.ps1 publicar.ps1
git commit -m "Publicacao: o publicar.ps1 aprende a publicar Edge Function"
```

---

### Tarefa 5: Paridade — as duas responderem a mesma coisa

**Arquivos:**
- Criar: `tests/test_portaria_paridade.py`

**Interfaces:**
- Consome: a função publicada em `https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria`
  e o Python em `https://imposicao.onrender.com/api/acesso/portaria`.

**Este é o teste que autoriza o corte.** Sem ele, trocar o endereço é fé.

- [ ] **Passo 1: Publicar a função**

```powershell
.\publicar.ps1 "Portaria: Edge Function no ar, ainda sem ninguem usando" -Sim
```

A função sobe, mas **nenhum aparelho aponta para ela** — o `frontend/portaria.js` continua
no endereço antigo. É de propósito: publicar e cortar são passos separados.

- [ ] **Passo 2: Escrever o teste de paridade**

Criar `tests/test_portaria_paridade.py`:

```python
# -*- coding: utf-8 -*-
"""As duas portarias respondem a MESMA coisa.

Enquanto o Python e a Edge Function convivem, este teste e o que autoriza o
corte. Ele nao usa dublê: bate nos dois enderecos de verdade, com o mesmo
token, e compara.

So roda quando `PORTARIA_TOKEN_DE_TESTE` esta no ambiente -- ele exige um
aparelho pareado de verdade, e nao ha como fabricar isso sem escrever no banco
de producao.
"""
import json
import os
import urllib.request

import pytest

TOKEN = os.environ.get("PORTARIA_TOKEN_DE_TESTE")
PYTHON = "https://imposicao.onrender.com/api/acesso/portaria"
EDGE = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria"

pytestmark = pytest.mark.skipif(
    not TOKEN, reason="defina PORTARIA_TOKEN_DE_TESTE com um token de aparelho pareado"
)


def _get(base, caminho):
    req = urllib.request.Request(
        f"{base}/{caminho}", headers={"Authorization": f"Bearer {TOKEN}"}
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def test_a_faixa_e_identica_nas_duas():
    """Campo a campo. Uma diferenca aqui e um ingresso recusado no portao."""
    a = _get(PYTHON, "faixa?desde=0")
    b = _get(EDGE, "faixa?desde=0")

    assert a["evento"] == b["evento"], "o evento diverge"
    assert a["sais"] == b["sais"], "os sais dos pedidos divergem"
    assert a["setores"] == b["setores"], "os setores divergem"
    assert a["bloqueios"] == b["bloqueios"], "os bloqueios divergem"
    assert a["proxima"] == b["proxima"], "a paginacao diverge"

    # As credenciais sao o coracao: se um hash sair diferente, o ingresso
    # correspondente e recusado na porta.
    assert len(a["credenciais"]) == len(b["credenciais"])
    porId = {c["id"]: c for c in b["credenciais"]}
    for c in a["credenciais"]:
        assert c == porId.get(c["id"]), f"credencial {c['id']} diverge"


def test_a_paginacao_percorre_o_evento_inteiro_igual():
    """O defeito do teto de 1000 linhas do PostgREST so aparece na pagina
    seguinte. Percorrer ate o fim e o unico jeito de pega-lo."""
    def tudo(base):
        ids, desde = [], 0
        while desde is not None:
            p = _get(base, f"faixa?desde={desde}")
            ids += [c["id"] for c in p["credenciais"]]
            desde = p["proxima"]
        return ids

    assert tudo(PYTHON) == tudo(EDGE)


def test_token_invalido_recusa_igual_nas_duas():
    """Recusar diferente conta a um estranho o que existe do outro lado."""
    import urllib.error
    codigos = []
    for base in (PYTHON, EDGE):
        req = urllib.request.Request(
            f"{base}/faixa?desde=0", headers={"Authorization": "Bearer nao-existe"}
        )
        try:
            urllib.request.urlopen(req, timeout=120)
            codigos.append(200)
        except urllib.error.HTTPError as e:
            codigos.append(e.code)
    assert codigos[0] == codigos[1] == 401
```

- [ ] **Passo 3: Rodar contra produção**

```powershell
$env:PORTARIA_TOKEN_DE_TESTE = "<token de um aparelho pareado>"
python -m pytest tests/test_portaria_paridade.py -v
```

Esperado: tudo passa. **Se qualquer campo divergir, pare aqui** — não siga para o corte, e
conserte a Edge Function até a paridade ser exata.

- [ ] **Passo 4: Commit**

```bash
git add tests/test_portaria_paridade.py
git commit -m "Portaria: teste de paridade entre o Python e a Edge Function"
```

---

### Tarefa 6: O corte

**Arquivos:**
- Modificar: `frontend/portaria.js:32`

**Interfaces:**
- Consome: a paridade comprovada na Tarefa 5.

**Por que o corte é uma linha:** o aparelho descobre o endereço da portaria numa função só.
Trocar lá muda os três endpoints de uma vez, e voltar atrás é trocar de volta e republicar —
questão de minutos, com o Python ainda no ar.

- [ ] **Passo 1: Ler o que existe hoje**

```bash
sed -n '25,45p' frontend/portaria.js
```

O endereço da nuvem é devolvido ali. Entenda a função inteira antes de mexer: ela também
trata o caso de a página vir do próprio agente.

- [ ] **Passo 2: Trocar o endereço**

Substituir o retorno da nuvem pelo da Edge Function, deixando registrado o porquê e como
voltar:

```js
        // 16/08/2026: a portaria passou a ser Edge Function, ao lado do banco.
        // Antes era `https://imposicao.onrender.com`, e cada consulta pagava
        // DUAS travessias de internet (celular -> Render -> Supabase e volta),
        // num servico que dorme. No portao, com fila e 4G, isso se sentia.
        //
        // O Python continua no ar em /api/acesso/portaria durante a transicao.
        // Para voltar atras: troque esta linha de volta e republique. Os dois
        // compartilham o mesmo banco e o mesmo freio de forca bruta, entao o
        // aparelho nao percebe a diferenca -- inclusive o token continua valendo.
        return 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria';
```

- [ ] **Passo 3: Conferir a sintaxe**

```bash
node --check frontend/portaria.js
```

- [ ] **Passo 4: Rodar os testes de tela da portaria**

```
python -m pytest tests/test_portaria_tela.py tests/test_portaria_validacao.py tests/test_acesso_portaria.py -v
```

Esperado: tudo passa.

- [ ] **Passo 5: Commit**

```bash
git add frontend/portaria.js
git commit -m "Portaria: o aparelho passa a falar com a Edge Function"
```

- [ ] **Passo 6: Publicar e conferir com um aparelho de verdade**

```powershell
.\ferramentas\conferir.ps1
.\publicar.ps1 "Portaria: o aparelho fala direto com o Supabase" -Sim
.\publicar_agente.ps1 <versao nova>
```

Depois, **num celular**: parear com o código de seis caracteres, baixar a faixa, ler um
ingresso bom (tem de permitir) e um ingresso de outro setor (tem de dizer
`setor_nao_autorizado`, e **não** `desconhecido`).

**Este passo não é opcional.** Nenhum teste substitui um ingresso de verdade na frente de
uma câmera de verdade.

---

## O que fica para a Fase 2b

`acesso_config.py`, `acesso_interno.py`, `acesso_elevacao.py`, `acesso_api.py` e o
`frontend/acesso-conta.js` — a tela do dono. Ela usa login do Vibe e os três segredos
(`ACESSO_AGENTE_SEGREDO`, `QR_PEDIDO_SEGREDO`, `ACESSO_ELEVACAO_SEGREDO`), que precisarão
ir para os secrets do Supabase. E o destino da publicação da faixa, no
`acesso_publicacao.py` da estação — que é o ponto mais delicado de todos, porque o endereço
está compilado dentro do `NewProd.exe`.

---

## Auto-revisão

**Cobertura.** Os cinco pontos que o desenho listou para a Fase 2: (1) a regra do hash — 
Tarefa 1, resolvida ao contrário do que o desenho dizia, e o desenho já foi corrigido; (2) o
`_FALHAS` vira tabela — Tarefa 2; (3) o teto de 1000 linhas do PostgREST — Restrições
globais e Tarefa 3, com o `POR_PAGINA + 1` preservado; (4) o destino da publicação da faixa
— **fora de escopo**, declarado acima, é da Fase 2b; (5) migração sem janela de parada —
Tarefas 5 e 6, com as duas no ar ao mesmo tempo e o corte numa linha.

**Sem placeholder.** Todo passo tem o código ou o comando exato. A única instrução condicional
é a nota do Passo 5 da Tarefa 4 sobre o nome da função de parada do `publicar.ps1`, e ela diz
o que fazer em vez de mandar improvisar.

**Consistência de nomes.** `hashCodigo` (Deno) / `hash_codigo` (Python) / `qrIdealHash`
(navegador) são três nomes de propósito, um por linguagem, e o teste da Tarefa 1 amarra os
três. `TABELA_FALHAS`, `POR_PAGINA`, `MAXIMO_FALHAS` e `JANELA_DE_FALHAS` valem o mesmo nos
dois lados. `Get-FuncoesEdgeDoRepo` e `Find-ProjetoSupabaseErrado` são os nomes reais do
módulo.

**O que este plano deliberadamente não faz.** Não desliga o Render, não mexe no
`acesso_publicacao.py` e não toca no `frontend/qr-ideal-hash.js`.
