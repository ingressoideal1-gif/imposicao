# Aplicativo único — Fase 2: o dono configura no próprio aparelho

> **Para quem executar com agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` ou `superpowers:executing-plans`. Os passos usam caixas (`- [x]`).

**Objetivo:** o dono vai até cada aparelho, digita **a senha** (uma), nomeia o portão, libera os setores e salva. O aparelho passa a registrar só as entradas configuradas e trava — reeditar exige a senha de novo, e apagar também.

**Spec:** [2026-08-16-aplicativo-unico-design.md](../specs/2026-08-16-aplicativo-unico-design.md), seção *O aparelho da portaria: o dono configura ali, com uma senha só*.

**Arquitetura:** o aparelho não ganha endpoint próprio de senha. Ele usa o login que já existe — a conta do Vibe —, e o servidor passa a poder **cunhar o token do aparelho no momento da criação**, em vez de devolver um código de seis caracteres para alguém digitar. Salvo o aparelho, a sessão da conta é encerrada ali mesmo: o celular fica só com o token.

## Restrições globais

- **Uma senha, uma vez.** Hoje o dono digita a senha para entrar e a digita de novo para elevar. No aparelho, o mesmo texto serve às duas chamadas — ele digita uma vez.
- **A sessão da conta não fica no aparelho.** É isso que devolve a propriedade que o código de seis caracteres comprava. Sem isso, o desenho é pior que o de hoje, não melhor.
- **A trava cobre também apagar.** Trava que protege a edição e deixa o apagar livre não é trava.
- **Sem rede não se configura**, e isso é aceitável: configurar é ato do dono, com sinal, uma vez. Ler ingresso continua funcionando sem sinal, pelo IndexedDB.
- **A portaria em si não muda.** Validação, fila e depósito ficam como estão — estão aprovados e rodando.
- **SQL entregue como arquivo pronto para colar.**

## Mapa dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `sql/acesso_aparelho_sem_codigo.sql` | **criar** — `codigo_hash` passa a aceitar nulo |
| `supabase/functions/_compartilhado/configuracao.ts` | **modificar** — `aplicarAparelhoAqui`, que cunha o token |
| `supabase/functions/acesso-conta/index.ts` | **modificar** — a rota nova |
| `frontend/acesso-conta.js` | **modificar** — `entrarEElevar`, uma senha para as duas chamadas |
| `frontend/aparelho.js` | **criar** — a tela "Usar este aparelho", o salvamento e o encerramento da sessão |
| `frontend/controle.html`, `controle.js` | **modificar** — a tela nova e o desvio do `?configurar=1` |
| `frontend/portaria.html`, `portaria.js` | **modificar** — "Configurar este aparelho" e a trava do desparear |
| `tests/test_aparelho_no_aparelho.py` | **criar** |

---

## Tarefa 1: O aparelho pode nascer sem código

**Por quê:** `codigo_hash` é `NOT NULL`. Um aparelho configurado no próprio aparelho **não tem código** — e é justamente isso que se quer: código que existe é código que alguém pode usar para parear um segundo celular.

**Arquivos:** criar `sql/acesso_aparelho_sem_codigo.sql`; teste em `tests/test_aparelho_no_aparelho.py`.

- [x] **Passo 1: escrever o teste que falha**

```python
def test_o_sql_libera_o_codigo_nulo_e_diz_por_que():
    sql = _ler("sql/acesso_aparelho_sem_codigo.sql")
    assert "ALTER TABLE producao_acesso_dispositivos" in sql
    assert "DROP NOT NULL" in sql
    assert "codigo_hash" in sql
```

- [x] **Passo 2: rodar e ver falhar.**

- [x] **Passo 3: escrever o SQL**

```sql
-- ═════════════════════════════════════════════════════════════════════════════
-- O aparelho da portaria pode nascer SEM código
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cole inteiro no editor SQL do Supabase. Roda em segundos e é repetível.
--
-- Por que isto existe
-- -------------------
-- Até aqui, pôr um portão no ar era: o dono cria o aparelho na tela dele, o
-- servidor sorteia um código de seis caracteres, e alguém digita esse código no
-- celular do portão. O código existia para que a SENHA do dono nunca chegasse
-- ao aparelho que fica com o porteiro.
--
-- A partir de agora o dono configura o aparelho NO PRÓPRIO APARELHO: digita a
-- senha uma vez, nomeia o portão, libera os setores e salva. O servidor cunha o
-- token direto, e a sessão da conta é encerrada ali mesmo — o celular fica só
-- com o token, que só serve para ler ingresso daquele evento.
--
-- Nesse caminho não há código nenhum, e não deve haver: um código guardado no
-- banco é um código que alguém pode usar para parear um SEGUNDO celular naquele
-- portão. Daí o `DROP NOT NULL`.
--
-- Os aparelhos que já existem continuam com o código deles, e o caminho antigo
-- continua funcionando — esta migração só permite a ausência, não apaga nada.

ALTER TABLE producao_acesso_dispositivos
    ALTER COLUMN codigo_hash DROP NOT NULL;

COMMENT ON COLUMN producao_acesso_dispositivos.codigo_hash IS
    'Hash do código de seis caracteres. NULO no aparelho configurado no próprio '
    'aparelho, que nunca teve código — e é assim de propósito: código guardado é '
    'código que parearia um segundo celular naquele portão.';

-- Conferência: a coluna tem de aparecer com is_nullable = YES.
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'producao_acesso_dispositivos'
   AND column_name IN ('codigo_hash', 'token_hash')
 ORDER BY column_name;
```

- [x] **Passo 4: rodar o teste, e aplicar o SQL no Supabase.** A aplicação é ato do usuário — o arquivo vai pronto para colar.

- [x] **Passo 5: commit.**

---

## Tarefa 2: O servidor cunha o token na criação

**Arquivos:** `supabase/functions/_compartilhado/configuracao.ts`, `supabase/functions/acesso-conta/index.ts`, teste em Deno + `tests/test_aparelho_no_aparelho.py`.

**Interfaces:**
- Produz: `POST /eventos/{id}/aparelhos/aqui` com `{ nome, setores: [] }` → `{ id, nome, setores, token }`. Exige JWT **e** elevação, como toda escrita de configuração.
- O `token` sai **uma vez só**, na resposta. O banco guarda o `sha256` dele, como o `entrar` já faz.

- [x] **Passo 1: escrever os testes que falham**

```python
def test_o_aparelho_daqui_nasce_com_token_e_sem_codigo():
    ts = _ler("supabase/functions/_compartilhado/configuracao.ts")
    assert "aplicarAparelhoAqui" in ts
    corpo = ts[ts.index("export async function aplicarAparelhoAqui"):]
    corpo = corpo[:corpo.index("\n}")]
    assert "codigo_hash: null" in corpo, (
        "codigo guardado e codigo que pearia um segundo celular naquele portao"
    )
    assert "token_hash" in corpo


def test_a_rota_do_aparelho_daqui_exige_elevacao():
    """Criar aparelho e escrita de configuracao: sem elevacao, quem pegasse o
    celular do dono destrancado criaria portao."""
    ts = _ler("supabase/functions/acesso-conta/index.ts")
    trecho = ts[ts.index('p[3] === "aqui"') - 400:]
    trecho = trecho[:trecho.index("return ok")]
    assert "exigirElevacao" in trecho
```

- [x] **Passo 2: rodar e ver falhar.**

- [x] **Passo 3: implementar em `_compartilhado/configuracao.ts`**

```typescript
/**
 * O aparelho configurado NO PRÓPRIO APARELHO.
 *
 * Difere do `aplicarAparelhoNovo` em uma coisa que muda tudo: ele não sorteia
 * código nenhum. O dono está com o celular na mão, acabou de digitar a senha, e
 * o token vai direto para este aparelho — não há por que existir um segredo
 * intermediário para alguém digitar, e existir seria pior: código guardado no
 * banco é código que parearia um SEGUNDO celular naquele portão.
 *
 * O token sai em claro UMA vez, nesta resposta. O banco guarda só o sha256 --
 * o mesmo que o `entrar` da portaria já faz.
 */
export async function aplicarAparelhoAqui(eventoId: string, corpo: any): Promise<any> {
  const nome = texto(corpo?.nome, "nome do aparelho", 1, 60);
  const setores = await conferirSetores(eventoId, corpo?.setores);

  const token = bytesParaHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const criado = (await banco("POST", "producao_acesso_dispositivos", {
    evento_id: eventoId,
    nome,
    codigo_hash: null,
    token_hash: await sha256Hex(token),
    ultimo_visto: "now()",
  }))[0];
  await trocarSetores(criado.id, setores);

  return { id: criado.id, nome, setores, token };
}
```

E a rota, em `acesso-conta/index.ts`, ao lado da que já existe para `aparelhos`:

```typescript
  if (metodo === "POST" && p.length === 4 && p[0] === "eventos"
      && p[2] === "aparelhos" && p[3] === "aqui") {
    const evento = await eventoDoDono(p[1], usuario);
    await exigirElevacao(req, evento.id, usuario);
    return ok(await aplicarAparelhoAqui(evento.id, await corpo()));
  }
```

- [x] **Passo 4: rodar os testes** (pytest e `npx deno test`).

- [x] **Passo 5: commit.**

---

## Tarefa 3: Uma senha, uma vez

**O problema:** o dono digita a senha para **entrar** e a digita de novo para **elevar**. No aparelho isso são duas vezes, e a decisão foi uma.

**Arquivos:** `frontend/acesso-conta.js`.

**Interfaces:**
- Produz: `AcessoConta.entrarEElevar(email, senha, eventoId)` → `Promise<{sessao, elevacao}>`.

- [x] **Passo 1: escrever o teste que falha**

```python
def test_uma_senha_serve_para_entrar_e_para_elevar():
    """Decisao do usuario: "apenas uma senha". Entrar e elevar sao duas
    chamadas, e continuam sendo -- o que nao pode e a pessoa digitar duas
    vezes."""
    js = _ler("frontend/acesso-conta.js")
    assert "entrarEElevar" in js
    corpo = js[js.index("function entrarEElevar"):]
    corpo = corpo[:corpo.index("\n    }")]
    assert "entrar(" in corpo and "/elevar" in corpo
```

- [x] **Passo 2: rodar e ver falhar.**

- [x] **Passo 3: implementar**

```javascript
    /**
     * Entra e eleva com a MESMA senha digitada.
     *
     * São duas chamadas ao servidor, e continuam sendo: o login é do Supabase,
     * e a elevação é nossa, assinada e com prazo. O que a decisão do usuário
     * proíbe é a PESSOA digitar duas vezes — e no aparelho da portaria, com o
     * dono de pé na frente do portão, isso pesa.
     *
     * A senha não fica guardada em lugar nenhum: ela vive no argumento desta
     * função e morre com ela.
     */
    function entrarEElevar(email, senha, eventoId) {
        return entrar(email, senha).then(function (sessao) {
            return pedir('/eventos/' + eventoId + '/elevar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + sessao.access_token
                },
                body: JSON.stringify({ senha: senha, navegador: navegadorId() })
            }).then(function (elevacao) {
                return { sessao: sessao, elevacao: elevacao };
            });
        });
    }
```

- [x] **Passo 4: rodar os testes. Passo 5: commit.**

---

## Tarefa 4: A tela "Usar este aparelho"

**Arquivos:** criar `frontend/aparelho.js`; modificar `frontend/controle.html` e `controle.js`.

**O fluxo, na ordem:** escolher o evento → nomear o portão → tocar nos setores → salvar → **a sessão é encerrada** → vai para `portaria.html`.

- [x] **Passo 1: escrever os testes que falham**

```python
def test_salvar_o_aparelho_encerra_a_sessao_da_conta():
    """O ponto que faz a mudanca valer.

    O codigo de seis caracteres existia para a senha do dono nunca chegar ao
    celular que fica com o porteiro. Trocar o codigo pela senha e DEIXAR a
    sessao aberta entregaria ao porteiro a conta inteira do cliente.
    """
    js = _ler("frontend/aparelho.js")
    assert "signOut" in js
    assert js.index("ideal_portaria_token") < js.index("signOut"), (
        "a sessao e encerrada antes de o token estar guardado -- se algo falhar "
        "no meio, o aparelho fica sem os dois"
    )


def test_o_aparelho_guarda_o_token_e_nada_mais():
    js = _ler("frontend/aparelho.js")
    assert "ideal_portaria_token" in js
    assert "senha" not in js.split("function salvar")[1].split("\n    }")[0], (
        "a senha nao pode ser guardada em lugar nenhum"
    )
```

- [x] **Passo 2: rodar e ver falhar.**

- [x] **Passo 3: implementar `frontend/aparelho.js`**

A ordem das operações é a parte que não pode sair errada:

1. `POST /eventos/{id}/aparelhos/aqui` → recebe o token;
2. **grava o token** no `localStorage`;
3. **só então** `supabaseClient.auth.signOut()`;
4. `location.replace('portaria.html')`.

Encerrar a sessão antes de guardar o token deixaria o aparelho sem os dois — sem conta para tentar de novo e sem token para trabalhar, no meio de um portão.

- [x] **Passo 4: a marcação, em `controle.html`**, dentro da seção "Aparelhos da portaria":

```html
    <div class="cartao" id="usar-este-aparelho">
        <h2>Usar ESTE aparelho na portaria</h2>
        <p style="font-size:.82rem;color:var(--dim);">
            Dê um nome ao portão e toque nos setores que ele valida. Ao salvar,
            este celular passa a ler ingressos — e a sua conta é desconectada
            dele.
        </p>
        <label for="aparelho-nome">Nome deste portão</label>
        <input id="aparelho-nome" type="text" placeholder="Ex.: Portão A">
        <div id="aparelho-setores"></div>
        <button id="btn-usar-aparelho" class="so-com-senha">Salvar e começar a ler</button>
        <div id="erro-aparelho" class="aviso erro sumindo" role="alert"></div>
    </div>
```

- [x] **Passo 5: o desvio do `?configurar=1` em `controle.js`.** O arranque manda aparelho pareado direto ao portão; sem uma saída, não haveria como reconfigurar. `?configurar=1` pula esse desvio e mostra o login.

- [x] **Passo 6: rodar os testes e conferir no navegador. Passo 7: commit.**

---

## Tarefa 5: A trava

Salvo o aparelho, ele abre direto na leitura. Reabrir a configuração — e **apagar** — exigem a senha.

**Arquivos:** `frontend/portaria.html`, `frontend/portaria.js`.

- [x] **Passo 1: escrever os testes que falham**

```python
def test_a_trava_cobre_tambem_apagar():
    """Trava que protege a edicao e deixa o apagar livre nao e trava: desfaz-se
    o trabalho inteiro e refaz-se do zero sem senha nenhuma."""
    js = _ler("frontend/portaria.js")
    corpo = js[js.index("function desparear"):]
    corpo = corpo[:corpo.index("\n    }")]
    assert "configurar=1" in corpo, (
        "desparear apaga a carga e a fila sem passar pela senha"
    )


def test_ha_saida_para_reconfigurar_o_aparelho():
    assert 'id="btn-configurar-aparelho"' in _ler("frontend/portaria.html")
```

- [x] **Passo 2: rodar e ver falhar. Passo 3: implementar.**

O botão **Configurar este aparelho**, na tela de leitura, leva a `controle.html?configurar=1`. O `desparear` deixa de apagar por conta própria e passa pelo mesmo caminho: quem apaga é a tela de configuração, depois da senha.

- [x] **Passo 4: rodar os testes. Passo 5: commit.**

---

## Tarefa 6: A tela do dono, e o que NÃO sai dela agora

A spec diz que criar e editar aparelho migram para o aparelho, e que da tela do dono sobra revogar.

**Nesta fase, o caminho antigo FICA.** Removê-lo no mesmo release em que o novo estreia deixaria o dono sem saída se o novo tiver problema no portão — e o antigo está aprovado e rodando. A tela ganha uma frase apontando o caminho novo; a remoção é limpeza de um release seguinte, depois que o novo tiver rodado num evento de verdade.

- [x] **Passo 1: a frase, no cartão de criar aparelho:**

> Se você está **com o celular do portão na mão**, prefira "Usar ESTE aparelho": não precisa anotar código nenhum.

- [x] **Passo 2: commit.**

---

## Tarefa 7: Conferir e publicar

- [ ] Suíte inteira; `conferir.ps1`.
- [ ] Navegador: salvar um aparelho encerra a sessão (o `localStorage` do Supabase fica sem sessão e só o token permanece); `?configurar=1` mostra o login mesmo com token guardado; leitura de setor não liberado é recusada como `setor_nao_autorizado`.
- [ ] Aplicar o SQL no Supabase — ato do usuário.
- [ ] Publicar site e agente.
- [ ] No aparelho: configurar um portão com a senha, ler um ingresso, modo avião, e confirmar que **não** dá para reconfigurar sem rede.
