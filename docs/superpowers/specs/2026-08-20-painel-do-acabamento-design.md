# Painel do Acabamento — desenho

> **Data**: 2026-08-20
> **Pedido**: menu novo, espelho do Painel de Produção, para o setor que recebe
> o material depois da imposição e da impressão.
> **Regra que atravessa tudo**: nenhuma funcionalidade atual pode ser perdida ou
> alterada. O Acabamento só LÊ o que a Produção escreve, e escreve apenas em
> dois campos que hoje não existem.

---

## 1. O que a tela é

Uma cópia visual do Painel de Produção (`view-lista-impressao`) — mesmo layout,
mesmos cards, mesmos filtros, mesmas métricas, mesma tabela, mesma formatação —
listando **os pedidos com `status_interno` de produção**, exatamente a mesma
população que a Fila de Produção usa hoje (`EM PRODUCAO`, `EM PRODUÇÃO`,
`EM IMPRESSAO`, `EM IMPRESSÃO`).

O que ela **não** tem, por decisão do pedido:

- nenhuma ligação com o motor de imposição nem com o agente local;
- nenhuma janela de imposição, de impressora, de gerar PDF ou de imprimir;
- nenhum seletor de numeração, cor, formato, saída ou verso;
- nenhum campo digitável de quantidade, numeração inicial/final ou bloco.

A coluna lateral de métricas **não** leva o bloco de versão do NewProd nem o
botão "Verificar atualização" que existe na Produção: são do agente, e o
Acabamento não fala com ele.

## 2. A lista de pedidos

Colunas idênticas às da Produção: Nº Pedido, Cliente / Evento, Progresso,
Preview, Itens, Quantidade, Frete, Status, Prazo Entrega. Ordenação por
cabeçalho, busca por pedido/evento/cliente, botão ATUALIZAR, filtros de prazo
(Para Hoje / Atrasados / Geral), filtro de setor (Flexo / PVC / Têxtil / Laser)
e badge de contagem — tudo igual.

Duas colunas passam a falar de acabamento em vez de impressão, porque é o
trabalho desta tela:

| Coluna | Na Produção | No Acabamento |
|--------|-------------|---------------|
| Progresso | modelos impressos / total | modelos **revisados** / total |
| Status | Aguardando / Parcial / Impresso | Aguardando / Em acabamento / Revisado |

O botão de recorte no topo, que na Produção é "Impresso", aqui é **"Revisado"**:
o pedido com todos os modelos revisados sai das outras listas, pela mesma regra.

A coluna lateral repete a forma da Produção — quatro métricas vivas e as duas
esmaecidas (Capacidade Diária e Pedidos Em Atraso), que continuam desligadas:

1. Pedidos Em Fila
2. Modelos Em Acabamento
3. Modelos Revisados
4. Pedidos Concluídos (todos os modelos revisados)

E, abaixo, "Estágio do Acabamento": 🌐 Todos · ⏳ Impresso · ⚙️ Em acabamento ·
✅ Revisado.

## 3. O pedido aberto

Clicar numa linha **não** abre a Imposição. Abre, dentro da própria tela, a
mesma listagem de modelos separada por produtos que o Portal do Pedido desenha
(`renderPedOSQueue`) — uma caixa por produto, com o nome real do produto e o
selo do setor PCP, e dentro dela uma linha por modelo.

Tudo em **somente leitura**: o que na Produção é `<input>` ou `<select>` aqui é
texto. Por modelo aparecem o código, o nome, a bolinha da cor de referência com
o nome da cor, QTD, NI–NF, Bloco, Numeração, Verso e o status de impressão. Em
modelo de CAMAROTE, Q_CAM, L_CAM e C_INI no lugar de QTD/NI/NF.

### A amostra

Cada modelo mostra, em bom tamanho, **a amostra que foi enviada ao cliente pelo
link** — a imagem composta de cor + arte + numeração que ele aprovou (o render
do bucket `amostras_renderizadas`, guardado em `amostra_arte_base64`; na falta
dele, `arte_url`). É o que o revisor compara com o papel que saiu da impressora.

Clique amplia, no lightbox que a página já tem. Amostra que só existir em PDF
sai como atalho 📄 que abre o arquivo: **rasterizar a arte do cliente está fora
de cogitação**, aqui como em qualquer lugar do projeto.

### Os dois únicos controles

Por modelo, dois seletores — e nada mais é editável na tela:

1. **Status do acabamento**: *— Status —* · Impresso · Em acabamento · Revisado.
   Grava em `pedidos_modelos.acabamento_status`.
2. **Responsável**: os operadores de acesso local da gráfica, por nome.
   Grava em `pedidos_modelos.acabamento_responsavel`.

Os dois gravam na hora, direto no Supabase, pelo mesmo caminho que o painel já
usa para `status_impressao`. O status do acabamento é campo **novo e separado**:
o `status_impressao` da Produção não é lido nem escrito por esta tela.

## 4. Banco (`sql/painel_do_acabamento.sql`)

1. **Duas colunas novas em `pedidos_modelos`** — tabela nossa, prefixo
   `pedidos_`, alteração permitida pelas regras do projeto:
   `acabamento_status TEXT` e `acabamento_responsavel TEXT`, ambas nulas por
   padrão. Modelo sem acabamento iniciado aparece como *— Status —*.

2. **A view `imposition_operadores`** — `id`, `nome`, `role`, `ativo` da
   `imposition_acessos_locais`. **Nunca `codigo`, nunca `permissoes`.**

   Ela existe porque a lista de acessos locais está fechada para as chaves
   públicas (`sql/rls_passo3_fechar_leitura.sql`) e a rota
   `/api/acessos-locais` exige o módulo Usuários — justamente por devolver os
   códigos de seis caracteres em texto claro. Um operador do acabamento não tem
   esse módulo, e na estação da gráfica ele nem sessão do Supabase tem. A view
   entrega só o nome, funciona no site e na estação, e não passa pelo agente.

3. **Duas permissões novas em `imposition_user_permissions`**:
   `perm_acabamento_view` e `perm_acabamento_edit`, com backfill igual ao que a
   pessoa já tem em produção (`perm_acabamento_view = perm_producao_view`,
   `perm_acabamento_edit = perm_producao_edit`). Quem já vê a Produção vê o
   Acabamento; quem já edita a Produção edita o Acabamento. Nenhuma grade é
   reescrita a partir do `ROLE_DEFAULTS`.

4. **Conferência de privilégios** no fim do arquivo, como manda
   `docs/REGRAS_BANCO.md`.

## 5. Permissões no código

Módulo novo `acabamento` em `PERM_MODULES` ("Painel do Acabamento", tela "a fila
do acabamento"), em `PERM_NAV_MAP`, em `PERM_VIEW_MAP` e nas grades de
`ROLE_DEFAULTS`, espelhando o que cada perfil já tem de produção. O mesmo par
entra em `PADRAO_VISUALIZADOR` e `PADRAO_ADMIN` da Edge Function `painel`, que
é quem decide o que o BANCO recebe no primeiro acesso.

Na estação, `permsDoOperadorLocal` já libera todas as chaves de
`PERM_VIEW_MAP`/`PERM_NAV_MAP` quando o acesso local não tem grade — o menu novo
entra junto, sem tratamento especial.

## 6. Arquivos

| Arquivo | O quê |
|---------|-------|
| `frontend/acabamento.js` | **novo** — toda a lógica da tela |
| `frontend/index.html` | botão do menu, `<section id="view-acabamento">`, `<script>` |
| `security_config.py` | `acabamento.js` em `PAINEL_ARQUIVOS` (senão a estação dá 404) |
| `sql/painel_do_acabamento.sql` | **novo** — pronto para colar no editor do Supabase |
| `supabase/functions/painel/index.ts` | as duas permissões nos dois padrões |
| `docs/painel_do_acabamento.md` | **novo** — a documentação da tela |
| `docs/REGRAS_BANCO.md` | a linha da view `imposition_operadores` |
| `tests/acabamento_harness.js` + `tests/test_painel_do_acabamento.py` | **novos** |

A lógica sai em arquivo próprio, e não dentro do `script.js`, porque ele já tem
1,4 MB — é a mesma direção do Portal do Pedido, que virou sete arquivos.

## 7. O que continua exatamente como está

`renderOrdens`, `renderPedOSQueue`, `abrirImposicaoDoPedido`,
`pedQueueUpdateField`, o campo `status_impressao`, o motor, o agente e o
`producao.html` (cópia legada, não linkada por ninguém). O Acabamento é uma tela
a mais, que lê o que já existe e escreve só nos dois campos que nasceram com
ela.
