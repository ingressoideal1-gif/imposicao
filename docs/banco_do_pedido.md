# O banco de dados do pedido

> A partir de 27/08/2026 o CSV pode deixar de morar dentro da numeração e passar
> a ser um registro do **pedido**. A mesma peça serve vários modelos e vários
> pedidos, cada um com as suas linhas e as suas colunas, sem duplicar o desenho.
>
> Arquivos: `frontend/banco-do-modelo.js` (as regras puras),
> `frontend/script.js` (as telas e a gravação), `sql/pedidos_bancos.sql` (as duas
> tabelas). Plano: `docs/superpowers/plans/2026-08-27-peca-e-banco-etapa-1.md`.

## Por que existe

Até aqui desenho e dado moravam no mesmo registro (`producao_numeracoes.csv_data`).
Reusar uma peça em outro pedido arrastaria o dado do pedido anterior, e a única
saída era duplicar a numeração. Em 27/08/2026 o catálogo tinha **171 numerações,
138 delas nascidas de dentro de um pedido e 77 que são a mesma peça repetida** —
16 famílias de duplicatas, criadas só para trocar o CSV.

Num evento de vários dias isso fica evidente: a arte do camarote é uma só, mas há
uma numeração por dia porque cada dia tem o seu código. Com o banco do pedido, é
uma peça, um banco, e cada modelo aponta para a coluna do seu dia.

## As três coisas separadas

| O quê | Onde mora | Quem é dono |
|---|---|---|
| **A peça** — o desenho, os campos, as posições | `producao_numeracoes` | o catálogo |
| **O banco** — as linhas de dado | `pedidos_bancos` | o pedido (`id_int`) |
| **O vínculo** — qual banco este modelo lê, e por qual coluna | `pedidos_modelos_banco` | o modelo |

O vínculo tem `csv_mapa`, um de‑para simples: `{ "coluna que a peça pede": "coluna
deste banco" }`. A peça pede `CODIGO`; o modelo do dia 5 aponta `CODIGO → 05/09`, o
do dia 6 aponta `CODIGO → 06/09`. Nenhum dos dois altera a peça.

Um pedido pode ter **um** banco lido por vários modelos, ou **um por modelo**: é a
mesma mecânica, muda só quantos registros existem. Decisão do usuário em 27/08/2026.

## A garantia de que nada antigo muda

O caminho novo é escolhido pela **ausência**: modelo sem linha em
`pedidos_modelos_banco` cai exatamente no código de antes.

Isso é garantido por identidade, e não por semelhança. Em `banco-do-modelo.js`:

```js
function numeracaoResolvida(num, banco, mapa) {
    if (!num) return num;
    if (!banco && _vazio(mapa)) return num;   // a MESMA peça, mesma referência
    ...
}
```

Devolver uma cópia quebraria o `garantirCsvDaNumeracao`, que guarda a referência
da numeração para escrever o `csv_data` nela quando o banco desce — a escrita
cairia num objeto que ninguém mais lê e o trabalho sairia com número sequencial no
lugar do nome da pessoa. O teste que trava isso compara com `===`:
`tests/banco_do_pedido_regressao_harness.js`.

Nenhuma linha de `producao_numeracoes` é lida ou escrita pela migração. As 126
numerações que hoje têm CSV dentro continuam como estão, por decisão do usuário —
não há conversão em massa nem prazo para haver.

## As portas na tela

Todas no card do modelo, dentro do pedido, na caixa **🗂️ Banco de dados**:

| Porta | O que faz | Aparece quando |
|---|---|---|
| **Vem de:** | escolhe a origem: a numeração (padrão), um banco do pedido, ou *+ Subir um CSV para este pedido…* | a peça pede colunas, ou já há banco/vínculo |
| **🔤 Colunas** | o de‑para de cada coluna que a peça pede | só com banco do pedido |
| **🧩 Linhas** | reparte as linhas entre os modelos que leem a mesma fonte | há linhas para contar |
| **📊 Editar banco do pedido** | corrige o conteúdo, avisando quantos modelos leem dali | só com banco do pedido |
| **🗂️ Renomear ou excluir bancos…** | última opção do "Vem de:" — abre a lista dos bancos do pedido para renomear ou excluir | há algum banco no pedido |

Excluir tem trava: banco lido por algum modelo não sai — o `ON DELETE CASCADE`
apagaria os vínculos junto e cada modelo cairia **calado** na numeração, imprimindo
o dado errado. A trava diz a saída (escolher "a numeração" no "Vem de:" desses
modelos), e a conta de leitores olha todos os vínculos carregados, não só os itens
do pedido aberto.

A caixa aparece **também quando a peça pede colunas e não tem CSV nenhum** — é a
numeração reaproveitada, exatamente quem precisa da porta para receber um banco.
Peça sem campo de banco não mostra caixa alguma.

`fonteDoModelo(item)` é quem responde "de onde este modelo lê": a numeração ou um
banco do pedido. O 🧩 Linhas e a conferência de repetidos trabalham sobre a
**fonte**, não sobre a numeração — sem isso, o modal abriria o poço errado e
gravaria em `csv_selecao` `__id`s de um banco que aquele modelo não imprime.

## As travas

- **Banco que não desceu** — vínculo apontando para banco ausente **recusa a
  impressão**, nas duas telas (`modelosSemBancoDoTrabalho`, em `script.js` e
  `pedido.js`). Motivo: o motor decide entre banco e numeração sequencial pelo
  tamanho de `rows`; banco que não chegou sairia impresso como número, sem erro em
  tela nenhuma. O recado diz o que fazer — *feche e abra o pedido de novo*.
- **Coluna que falta** — `colunasQueFaltam` avisa, ao subir o banco e ao abrir o
  🔤 Colunas, quais colunas a peça lê e o banco não tem.
- **Peça em produção** — salvar uma numeração lida por vários pedidos avisa antes.
- **Renomear coluna do banco** arrasta o **mapa** de cada modelo, não os elementos
  da peça (`aplicarRenomeacoesNoMapa`). A armadilha é a coluna *implícita*: a peça
  pede `NOME`, o banco tem `NOME`, não há entrada no mapa — renomear a coluna
  perderia o apontamento em silêncio. Por isso a reconstrução parte do que cada
  coluna lê hoje, e não das entradas que o mapa por acaso tem.

## Duas pedras já encontradas

**O id do modelo não é UUID.** A `pedidos_modelos_banco.modelo_id` nasceu `UUID`,
por analogia com as tabelas nossas. Mas `pedidos_modelos` é do parceiro Vibe e o id
dela é um **número** (`1000409`): toda tentativa de ligar um modelo morria com
*"invalid input syntax for type uuid"*, e o operador ficava com o banco criado e
sem vínculo. A coluna é **TEXT** desde 28/08/2026 — aceita o número de hoje e o
formato de amanhã, e o painel já compara os dois lados com `String()`. Conserto do
banco existente: `sql/pedidos_modelos_banco_modelo_id_texto.sql`.

**Vínculo que falha desfaz o banco recém-criado.** Sem isso, cada tentativa deixava
um banco órfão na lista do pedido — foi assim que apareceram três entradas do mesmo
arquivo no "Vem de:", sem porta para apagá-las.

## O que ainda falta

- **Atualizar pela planilha** (`csv_url`) não está ligado para banco do pedido.
- **Fotos** como dado variável com banco do pedido: não testado — o Gerenciador de
  Fotos ainda escreve na numeração.
- **A impressão de verdade** com banco do pedido nunca aconteceu. Antes de um
  trabalho grande, tirar uma folha de prova.

## Como verificar uma mudança

```bash
node tests/banco_do_pedido_regressao_harness.js   # a rede: o caminho antigo intacto
node tests/banco_do_modelo_harness.js             # as regras puras
node tests/banco_do_pedido_etapa2_harness.js      # fonte, colunas, conferência
node tests/pedidos_bancos_sql_harness.js          # o SQL não converte nada
```

Para ver na tela, suba o app pela skill `rodar-app` e semeie `state.numeracoes`,
`state.bancosDoPedido`, `state.vinculosDeBanco` e `state.osItens` — as funções do
card (`atualizarBotoesCsvDaAmostra`, `abrirColunasDoModelo`) são globais.
