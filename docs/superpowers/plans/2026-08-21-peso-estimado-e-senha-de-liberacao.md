# Plano — peso estimado por setor e senha semanal de liberação

Spec: `docs/superpowers/specs/2026-08-21-peso-estimado-e-senha-de-liberacao-design.md`.
Três tarefas independentes, agrupadas por arquivo tocado; rodam em paralelo. Nenhuma
delas commita — o commit é feito no fim da rodada.

## Contratos compartilhados (valem para as três tarefas)

**Módulo** `supabase/functions/_compartilhado/senha_liberacao.ts` exporta:

```ts
export const SEGREDO_SENHA_LIBERACAO = "PESO_LIBERACAO_SEGREDO";
export const FUSO = "America/Sao_Paulo";
/** "2026-W34" e as datas (AAAA-MM-DD) da segunda e do domingo, no fuso de SP. */
export function semanaDe(agora: Date): { chave: string; inicio: string; fim: string };
/** Pura: HMAC-SHA256(segredo, "senha-liberacao-peso:" + chave) -> 1 letra + 2 digitos. */
export async function senhaDaSemana(segredo: string, chave: string): Promise<string>;
/** Le o segredo (precisaDoSegredo) e devolve a senha de agora. */
export async function senhaAtual(agora?: Date): Promise<{ senha: string; semana: string; inicio: string; fim: string }>;
/** trim + maiusculas; compara em tempo constante com a senha de agora. */
export async function conferirSenha(bruto: unknown, agora?: Date): Promise<boolean>;
```

Letra = `bytes[0] % 26` → `A`+; dígitos = `((bytes[1] << 8) | bytes[2]) % 100`, com
zero à esquerda. O segredo ausente vira 503 pela `precisaDoSegredo` (já existe).

**Rotas**

| Quem | Rota | Exige | Resposta |
|---|---|---|---|
| `painel` | `GET /api/senha-liberacao` | sessão + `podeVerUsuarios` | `{ok:true, senha, semana, inicio, fim}` |
| `painel` | `POST /api/senha-liberacao/conferir` `{senha}` | sessão | `{ok:true, confere:bool}` |
| `acesso-estacao` | `POST /api/acesso/senha-liberacao/conferir` `{senha}` | `conferirAgente` ANTES de ler o corpo | `{status:"success", confere:bool}` |
| agente (`app.py`) | `POST /api/senha-liberacao/conferir` `{senha}` | `get_current_user` | repassa o que a função devolveu |

Senha que não é texto ou vazia: `confere:false` (não é erro).

**Tela** (`acabamento.js`): o estimado sai de `produtos_proposta` (`select id,
id_produto, qtd, peso_total` por `id_int`), setor via `state.produtosGlobais[].setor_pcp`
(`id_produto`), gramas → kg. Regra: `precisaDeLiberacao(real, est)` ⇔ `est > 0 && real
!== null && |real − est| / est > 0.05`.

---

## Tarefa A — servidor e agente

Arquivos: `supabase/functions/_compartilhado/senha_liberacao.ts` (novo),
`supabase/functions/_compartilhado/senha_liberacao_test.ts` (novo),
`supabase/functions/painel/index.ts`, `supabase/functions/acesso-estacao/index.ts`,
`app.py`, `db.py`, `tests/test_senha_de_liberacao.py` (novo).

1. Módulo conforme o contrato. `semanaDe` usa `Intl.DateTimeFormat("en-CA", {timeZone:
   FUSO, …})` para obter a data civil de SP e calcula a semana ISO (segunda = 1º dia).
2. `deno test` do módulo (rodar com `npx deno test supabase/functions/_compartilhado/senha_liberacao_test.ts`;
   para a função pura, passar o segredo como texto). Casos do spec §6.
3. Rotas em `painel` e `acesso-estacao` conforme a tabela, no estilo das rotas vizinhas
   (`acessos-locais` e `peso-setores`). `deno check` dos dois `index.ts`.
4. Agente: `db.conferir_senha_de_liberacao(senha)` → `_catalogo_pela_funcao("POST",
   "senha-liberacao/conferir", {"senha": senha})`; rota em `app.py` ao lado de
   `/api/peso-setores`, usando `_repassar_recusa` como as vizinhas.
5. `tests/test_senha_de_liberacao.py`: estilo de `tests/test_peso_do_setor_pela_estacao.py`
   (fixture `funcao`): a rota do agente repassa com o segredo, não valida por conta
   própria, e estática: a rota da `acesso-estacao` chama `conferirAgente` antes de
   `req.json()`; a rota GET do `painel` chama `exigirModuloUsuarios`; a de conferir chama
   `quemChama`; o módulo existe com `"PESO_LIBERACAO_SEGREDO"` e `iguaisEmTempoConstante`.
6. Rodar `python -m pytest tests/test_senha_de_liberacao.py tests/test_peso_do_setor_pela_estacao.py -q -n 0`.

## Tarefa B — a tela do acabamento

Arquivos: `frontend/acabamento.js`, `tests/acabamento_harness.js`,
`tests/test_painel_do_acabamento.py` (só se preciso).

1. `tela.estimados = {}` (SETOR → kg ou null) e `tela.liberacaoPendente = null`.
2. `carregarEstimados(numeroDoPedido)`: lê `produtos_proposta` pela `supabaseClient`
   (sem sessão também — leitura é pública), soma por setor; chamado em `abrirPedido` junto
   com `carregarPesos` (em paralelo), e `renderDetalhe()` depois.
3. Box: ao lado do `kg` de cada setor, `<span id="acab-peso-est-SETOR">est. 4,160 kg</span>`
   (`—` sem estimado); com peso digitado, acrescenta a divergência (`· +8,2%`), âmbar
   acima de 5 %. `pintarPesos()` atualiza esse texto.
4. `gravarPeso(numero, setor, texto, opcoes)`: depois de `pesoDoTexto`, se
   `precisaDeLiberacao(peso, est)` e não `opcoes.liberado` → guarda `tela.liberacaoPendente
   = {numeroDoPedido, setor, texto, peso, est}` e abre o popup; NÃO grava. Popup
   `acab-liberacao` (montado uma vez, como `montarPopupDaExpedicao`): título, texto com
   real/estimado/divergência, `input id="acab-liberacao-senha" maxlength="3"` em
   maiúsculas, linha de erro, botões **Liberar** e **Cancelar**. Cancelar → `pintarPesos()`
   (volta o valor anterior) e fecha. Liberar → `conferirSenhaDeLiberacao(senha)`: estação
   → `urlDaEstacao('senha-liberacao', 'conferir')` via agente; site → `urlDoPainel(...)`
   (`API_PAINEL` lido como `API_BASE_URL`, identificador nu e depois `window`). `confere`
   → `gravarPeso(..., {liberado:true})` e fecha; senão mostra "Senha incorreta" e fica.
5. Refatorar o endereço: `urlDeApi(base, rota, x)` com o ÚNICO `/api/` do arquivo;
   `urlDaEstacao` continua lendo `API_BASE_URL` dentro de si (o harness conta isso) e
   delega a `urlDeApi`. O harness espera as rotas `['expedicao','peso-setores',
   'senha-liberacao','setor-concluido']` — atualizar o teste e o comentário ("três" → "quatro").
6. API pública: `liberarDivergencia()`, `fecharPopupDaLiberacao()`; `_regras`:
   `estimadoPorSetor`, `precisaDeLiberacao`, `divergencia`, `urlDoPainel`.
7. Harness: ramo `produtos_proposta` no banco falso (`_produtosDaProposta`, `select().eq()`
   thenable) e os casos do spec §6; `fetch` falso respondendo `{confere:true|false}` /
   `{ok:true, confere:…}`. Rodar `node tests/acabamento_harness.js` e
   `python -m pytest tests/test_painel_do_acabamento.py -q -n 0`.

## Tarefa C — o card no Menu Usuários

Arquivos: `frontend/index.html`, `frontend/script.js`, `tests/test_senha_no_menu_usuarios.py` (novo).

1. Em `view-admin`, ANTES do card "Acesso Local — NewProd", um card `id="card-senha-liberacao"`:
   título "🔐 Senha de liberação de peso", texto que se explica sozinho (o que ela libera,
   que muda toda segunda sozinha, que o operador do acabamento digita no popup),
   `<strong id="senha-liberacao-valor">—</strong>` grande e monoespaçado,
   `<span id="senha-liberacao-semana"></span>`, botão "🔄 Atualizar" →
   `loadSenhaLiberacao()`.
2. `window.loadSenhaLiberacao` em `script.js`, ao lado de `loadAcessosLocais`:
   `fetch(`${API_PAINEL}/api/senha-liberacao`)`; 200 → preenche; 403 → "Só quem pode ver o
   Menu Usuários vê a senha"; erro → frase curta. Chamar no clique de `nav-admin`, junto
   dos dois `load…` existentes.
3. Teste estático: o card e os ids existem no `index.html`; `loadSenhaLiberacao` existe e
   é chamado no `nav-admin`; a rota bate com a do `painel`.
