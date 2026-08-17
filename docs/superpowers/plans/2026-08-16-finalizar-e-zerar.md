# Finalizar evento e zerar as entradas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans.

**Goal:** Dar ao dono duas ações que faltavam — arquivar um evento que acabou e recomeçar a contagem de um evento de teste — sem nunca oferecer apagar de verdade.

**Decisões do usuário, 16/08/2026.** Ele corrigiu o meu termo: **não é "excluir", é "finalizar"**, e o evento vai para uma lista de finalizados. Apagar de verdade não existe como função da tela ("apenas finalizar"). Zerar apaga **só as entradas** daquele evento, com confirmação **e senha**. Os dois botões ficam no fim da engrenagem, separados. Inativar é pausa; finalizar é arquivo. Finalizado pode ser reaberto. A lista de finalizados mostra nome, data e quanta gente entrou.

## Global Constraints

- **Nada de "excluir", "apagar" ou "remover"** na interface. Um evento acontece e termina; ele não deixa de ter existido. Ver `docs/superpowers/specs/2026-08-16-ideal-control-fluxo-pwa-design.md` e a memória do projeto sobre esse vocabulário.
- Português em tudo; ES5 em IIFE no `frontend/`; texto nunca HTML para nome de evento.
- Versão dos scripts: **617**.
- Testes: `.\venv\Scripts\python.exe -m pytest tests/<arquivo> -v` · `.\node_modules\.bin\deno check`
- **NÃO rodar git.** Quem commita é quem coordena.

## Os três estados

| status no banco | na tela | portões | onde aparece |
|---|---|---|---|
| `ativo` | Ativo | lendo | Meus Eventos |
| `encerrado` | Inativo | **param** | Meus Eventos, marcado `inativo` |
| `finalizado` | Finalizado | **param** | Eventos finalizados |

`finalizado` é valor NOVO. `excluido` continua existindo no esquema e continua sem nenhum caminho na tela — de propósito.

A portaria já recusa quando o evento não está `ativo`: a carga manda `ativo: status === "ativo"`, então `finalizado` para os portões sem nenhuma mudança lá.

---

### Task 1: A marca de quando as entradas foram zeradas

**Files:** Create `sql/schema_acesso_zerar_entradas.sql` · Test `tests/test_schema_acesso_zerar_entradas.py`

**Produces:** coluna `entradas_zeradas_em TIMESTAMPTZ` em `producao_acesso_eventos`.

**Por que ela existe, e não é detalhe:** apagar as entradas no servidor não zera nada no portão. Cada celular já tem as entradas baixadas no IndexedDB, e o sincronismo só ACRESCENTA — ele nunca remove. Sem uma marca de tempo que o aparelho compare com a sua, o contador continuaria mostrando o público antigo e a regra `ja_entrou` continuaria barrando quem já tinha entrado no teste. O dono zeraria no painel e nada mudaria na porta.

Modele o arquivo em `sql/schema_acesso_setor_bloqueado.sql`: cabeçalho com o porquê, "COMO RODAR", e "COMO DESFAZER" comentado no fim. `ADD COLUMN IF NOT EXISTS`, sem default (nulo = nunca foi zerado).

---

### Task 2: As rotas de finalizar, reabrir e zerar

**Files:** Modify `supabase/functions/_compartilhado/configuracao.ts`, `supabase/functions/acesso-conta/index.ts`, `supabase/functions/portaria/index.ts` · Tests `supabase/functions/_compartilhado/configuracao_test.ts`, `tests/test_acesso_portaria.py`

**Leia os três arquivos inteiros antes.** As rotas atuais mostram a forma a seguir.

1. **`aplicarEvento` aceita `status: "finalizado"`**, além de `ativo` e `encerrado`. `excluido` continua recusado — apagar não é o que esta tela oferece.
2. **`GET /meus-eventos`** passa a devolver `entradas` por evento (quanta gente entrou), para a lista de finalizados mostrar o número sem uma segunda chamada. Continua trazendo todos menos `excluido`.
3. **`POST /eventos/{id}/zerar-entradas`** (exige elevação, como toda escrita):
   - apaga `producao_acesso_entradas_unicas` daquele evento;
   - apaga `producao_acesso_leituras` daquele evento;
   - grava `entradas_zeradas_em = now()` no evento;
   - responde `{ zerado_em }`.
   Os **ingressos, setores e portões ficam** — é a escolha do usuário. Só a contagem recomeça.
4. **`GET /sincronizar`** da portaria passa a devolver `entradas_zeradas_em` do evento. É o que faz o aparelho saber que precisa esquecer o que tem.

---

### Task 3: O aparelho esquece as entradas quando o evento é zerado

**Files:** Modify `frontend/portaria-sincronismo.js` · Test `tests/test_portaria_sincronismo.py`

`aplicar(carga, novidade)` ganha uma regra que vem ANTES de todas as outras: se `novidade.entradas_zeradas_em` for mais recente que o `carga.entradas_zeradas_em` guardado, **as entradas e os totais locais são esvaziados** antes de a novidade ser mesclada. A marca nova é guardada na carga.

Testes que o plano exige:

```python
def test_zerar_no_servidor_esvazia_as_entradas_locais():
def test_zerar_esvazia_tambem_os_totais():
def test_a_marca_de_zerado_fica_guardada_na_carga():
def test_zerar_NAO_apaga_as_credenciais():
    """Zerar e sobre a contagem. Os ingressos continuam valendo -- apagar as
    credenciais faria o portao recusar todo mundo como `desconhecido`."""
def test_a_MESMA_marca_nao_zera_de_novo():
    """Senao cada sincronismo apagaria as entradas registradas nos cinco
    minutos anteriores, e o contador nunca sairia do zero."""
def test_entradas_novas_do_mesmo_sincronismo_SOBREVIVEM_ao_zerar():
    """A ordem importa: esvazia primeiro, mescla depois."""
```

---

### Task 4: A zona de risco e a lista de finalizados

**Files:** Modify `frontend/controle.html`, `frontend/controle.js`, `frontend/lista-eventos.js`, `frontend/controle.css` · Tests `tests/test_controle_tela.py`, `tests/test_lista_eventos.py`

**A zona de risco**, no fim da engrenagem, depois de "Este aparelho", visualmente separada e em vermelho:

- **Zerar as entradas deste evento** — explica em texto o que apaga e o que fica. Pede confirmação **e a senha de novo**, mesmo dentro dos 15 minutos já liberados: é a única ação da tela que destrói dado, e o celular pode estar na mão do porteiro.
- **Finalizar evento** — explica que ele sai de "Meus Eventos", que os portões param, e que dá para reabrir depois.

**A lista de finalizados**, na tela inicial, abaixo de "Meus Eventos":

- Só aparece quando existe evento finalizado.
- Cada linha: nome · data · `4.812 entraram`.
- Cada linha tem **Reabrir**, que devolve o evento a "Meus Eventos" como **inativo** (e não ativo): reabrir é para corrigir ou consultar, e religar os portões é decisão separada, que ele toma no ativar.
- Sem luz e sem o ícone de ler: evento finalizado não é portão.

**Nenhuma palavra "excluir", "apagar" ou "remover"** em lugar nenhum. Acrescente um teste que proíbe as três em `controle.html`, `controle.js` e `lista-eventos.js`.

---

### Task 5: Amarrar e publicar

- `?v=617` nos HTMLs; suíte inteira (pytest, deno, Pester).
- `.\ferramentas\rodar_sql.ps1 sql\schema_acesso_zerar_entradas.sql`
- `.\publicar.ps1 "<msg>" -Sim` e `.\publicar_agente.ps1 1.2.110`.
