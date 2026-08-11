# Sessão 11/08/2026 — O banco de dados (CSV) por modelo

> **Onde paramos:** tudo desta sessão está **no ar como v533**. Nada ficou pela
> metade e nada está bloqueando. Branch `main`, em sincronia com o `origin`.
> Agente NewProd em **1.2.36** nas três pontas — não precisou sair, porque o
> `engine.py` não mudou depois da v524.

---

## O que foi ao ar

A sessão inteira gira em torno de uma frase da produção: **um mesmo arquivo
`.csv` serve a vários modelos do mesmo pedido.** O mapa de assentos de um teatro
é um arquivo só, mas vira um modelo por setor. Tudo o que entrou desdobra isso.

| Versão | O que |
|--------|-------|
| v524 | Editor de CSV — modal de tela cheia, planilha completa (`frontend/csv-editor.js`) |
| v527 | Criar CSV vazio; distribuição do banco entre os modelos do pedido |
| v533 | Visualização da amostra paginada; botões de banco no card; janela ampliada |

### 1. O editor de CSV
`frontend/csv-editor.js`, aberto por `abrirEditorCsv()`. Não enxerga o `state` do
resto do aplicativo: recebe tudo por argumento e devolve tudo pelo `onAplicar`.
Grade virtualizada, parser RFC 4180, desfazer/refazer, colar do Excel.

### 2. A distribuição entre os modelos
A fatia de cada modelo vive em **`pedidos_modelos.csv_selecao`** (JSONB), no
formato `{ "tipo": "linhas", "ids": ["1-400", "612"] }`. `NULL` significa banco
inteiro — é o que todo pedido anterior tem, e por isso nada precisou de migração.

A posse é **exclusiva por construção**: dar uma linha a um modelo tira dela o
dono anterior. Isso torna impossível imprimir o mesmo assento em dois modelos.

### 3. A visualização paginada
Numeração com CSV não tem "uma" amostra: tem uma por linha. O card ganhou
`◀ Linha 3 / 5 [3] ▶`, e **cada modelo navega só pela sua fatia**.

### 4. Os botões no card e a janela ampliada
📊 (editar o banco) e 🧩 (escolher as linhas deste modelo) ao lado do seletor de
numeração. Clicar na imagem abre `frontend/amostra-modal.js` — frente e verso
grandes, com o mesmo seletor de linhas.

---

## Onde está o código

Tudo em `frontend/`. O detalhe de cada decisão está em
[`docs/editor_de_csv.md`](editor_de_csv.md), que é o documento a ler antes de
mexer nisso.

| Arquivo | Papel |
|---------|-------|
| `csv-editor.js` | O modal do banco. Dois modos: editar e distribuir. |
| `amostra-modal.js` | A janela ampliada. Espelha o card, não desenha nada. |
| `script.js` | A cola: fatia, paginação, botões, gravação. |
| `engine.py` | Só o filtro de `__ativo` (v524). Nada mais mudou. |

Funções em `script.js` que valem conhecer pelo nome:

- `fatiaCsvDoItem(item, num)` — as linhas que **este** modelo imprime.
- `linhasDaAmostra` / `paginaDaAmostra` / `linhaDaAmostra` — a paginação.
- `atualizarNavCsvDaAmostra` / `atualizarBotoesCsvDaAmostra` — o que aparece no
  card, decidido **a cada redesenho** e não no template.
- `abrirCsvDoModelo(idx, osId, modo)` — a porta de entrada dos dois botões.
- `abrirDistribuicaoCsv(osId, numId, focoItemId)` — a tela de repartir.
- `salvarCamposDaNumeracao(numId, patch)` — gravação cirúrgica na numeração.

---

## Armadilhas que esta sessão descobriu

Estão aqui porque cada uma custou tempo e nenhuma é óbvia lendo o código.

- **A tabela dos modelos do pedido é `pedidos_modelos`, não `producao_os_itens`.**
  Os arquivos em `sql/` descrevem a segunda, que o aplicativo abandonou. Eu errei
  isso em produção nesta sessão e mandei o usuário rodar o `ALTER TABLE` na
  tabela errada.
- **Nessa tabela a numeração é `amostra_num_id`**; `numeracao_id` só existe no
  objeto já mapeado em memória.
- **`item.modelo` não é o nome do modelo** — apesar do nome, o `loadOSItens` o
  preenche com o **id** do registro. O nome de gente está em `nome_modelo`.
- **`openClienteLightbox()` só existe no `cliente.js`.** No aplicativo interno o
  clique nas imagens dava `ReferenceError` em silêncio — nunca funcionou até a
  v533.
- **Estado que mora no objeto do item se perde.** O pedido recarrega os itens em
  segundo plano e substitui os objetos. Por isso a página da visualização vive em
  `state.amostraCsvPaginas`, com chave `osId:itemId`.
- **Navegar não é editar.** `amostraCsvPagina()` não marca `_needsSnapshot`,
  senão o instantâneo enviado ao link do cliente passaria a ser a linha que o
  operador estava olhando por acaso.

---

## O que ficou de fora, de propósito

**O link do cliente (`frontend/cliente.js`) não foi tocado.** Ele tem a própria
cópia do `drawAmostraFace` e continua mostrando **a primeira linha** do banco,
sem paginação, sem botões de banco e sem a janela ampliada.

Isso não é dívida técnica: paginar o link muda **o que o cliente enxerga na
aprovação**, e essa é uma decisão de produto do usuário, não uma consequência
técnica. É a primeira pergunta a fazer amanhã.

---

## Como conferir uma mudança

Servidor local (**porta 9123, nunca 9000** — o `NewProd.exe` escuta lá e serve
uma cópia velha do frontend embutida no executável):

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
(venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 9123 > /dev/null 2>&1 &)
```

Testes que existem no repositório:

```bash
venv/Scripts/python.exe -m pytest tests/test_engine_csv_ativo.py -q   # 6 passando
```

Os demais arquivos em `tests/` têm erro de coleta **anterior a esta sessão**
(`ImpositionConfig.__init__()` com assinatura antiga, e dois que exigem servidor
no ar). Não são regressão, mas alguém vai tropeçar neles: rodar `pytest tests/`
inteiro falha.

**Não há runner de teste JavaScript no projeto.** A verificação desta sessão foi
feita com sete drivers de puppeteer no diretório temporário da sessão, que
**desaparecem** com ela. O que cada um cobria, para reconstruir rápido se
precisar:

| Driver | Cobria |
|--------|--------|
| `driver`, `driver2`, `driver3` | O editor de CSV: edição, busca, colunas, ordenação |
| `vazio` | Criar banco vazio e colar do Excel |
| `dist` | Distribuição entre modelos, cobertura, posse exclusiva |
| `pag`, `pagvis` | Paginação da amostra e o desenho real no canvas |
| `modal`, `editcard` | Os botões do card e a janela ampliada |

O molde: semear `state.numeracoes`, `state.formatos`, `state.cores`,
`state.osItens`, `state.ordens`, `state.anexosPedido` e chamar
`renderAmostrasOSItens('os-1')`. Duas ciladas de teste, não de produto:

1. **`window.state` não é o `state` do `script.js`** — ele é `const` e não vira
   propriedade do `window`. Dentro do `page.evaluate`, use o `state` nu.
2. **O aplicativo recarrega o catálogo em segundo plano** e substitui
   `state.numeracoes` / `state.formatos` no meio do teste. Guarde os objetos em
   `window.__num` e resemeie antes de cada fase, senão a numeração de teste
   simplesmente some e o card se redesenha sem verso, sem CSV e sem seletor.

---

## Para amanhã

1. **Decidir sobre o link do cliente** — pagina ou não? (ver acima)
2. Sem mais nada pendente desta linha de trabalho.

Antes de mergulhar em qualquer coisa: `.\ferramentas\conferir.ps1`.
