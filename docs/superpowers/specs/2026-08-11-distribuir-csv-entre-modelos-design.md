# Distribuir o banco de dados (CSV) entre os modelos de um pedido — desenho

Data: 11/08/2026

## O problema

Um mesmo arquivo CSV serve a mais de um modelo dentro do mesmo pedido. O mapa de
um teatro vira um modelo por setor: Pista, Arquibancada, Camarote. O banco é um
só; o que muda por modelo é qual pedaço dele vai para o papel.

O CSV morava na numeração (`producao_numeracoes.csv_data`), e cada modelo do
pedido aponta para uma numeração. Então o único caminho era duplicar a numeração
uma vez por modelo, cada cópia com o CSV inteiro. Isso custa quatro coisas:

1. Três modelos, três cópias do mesmo `jsonb`.
2. Erro de digitação num assento vira três correções.
3. Cliente manda o CSV corrigido, três re-uploads.
4. **Nada garante que as fatias fechem.** Dá para imprimir o assento A-01 em dois
   modelos, ou esquecer um bloco inteiro, e só descobrir com o material na mão.

O item 4 é o que uma planilha não resolve e o sistema resolve.

## A decisão de fundo

A fatia não é propriedade do banco de dados. É propriedade **do modelo dentro do
pedido**. Isso já tem paralelo no sistema: para numeração sequencial, o modelo
guarda `numeracao_inicio` e `numeracao_fim` — "este modelo cobre desta à aquela".
Para CSV, o equivalente é "este modelo cobre estas linhas".

Há um segundo argumento que fecha a questão: o motor já imprime vários modelos
numa imposição só (`multi_artes`, cada arte com sua numeração). Com a fatia presa
à numeração, seria obrigatório ter três numerações diferentes para um pedido só.

Também separa dois conceitos que estavam no mesmo lugar:

- **Linha cancelada** (`__ativo: false`) — assento interditado. Ninguém imprime,
  em modelo nenhum. É propriedade do dado.
- **Fatia do modelo** (`csv_selecao`) — qual pedaço este modelo leva. É
  propriedade do registro do modelo no pedido.

## Identidade estável da linha (`__id`)

A distribuição é feita à mão, linha a linha, e posição não serve de referência:
inserir uma linha no meio faria toda seleção já salva escorregar.

Cada linha ganha `__id`, um inteiro sequencial gravado dentro dela, como o
`__ativo`. Nunca reaproveitado — apagou a linha 5 e criou outra, ela é a 1241.
Nunca exportado, nunca oferecido como coluna de elemento. CSV salvo antes desta
versão recebe os ids pela posição atual na primeira vez que for aberto, o que é
seguro justamente porque ainda não existe seleção salva para desalinhar.

Como toda mutação do editor passa por `recalcular()`, é lá que os ids são
garantidos — um ponto só. A única armadilha é duplicar linha: a cópia precisa ter
o `__id` removido, senão nascem duas linhas com a mesma identidade.

## Onde a fatia mora

```sql
ALTER TABLE pedidos_modelos ADD COLUMN IF NOT EXISTS csv_selecao JSONB;
```

```json
{ "tipo": "linhas", "ids": ["1-400", "612", "700-712"] }
```

Faixas compactas porque marcar à mão quase sempre produz blocos contínuos: 400
linhas viram uma string. O `tipo` deixa a porta aberta para uma regra por coluna
no futuro sem outra migração.

**Modelo sem `csv_selecao` imprime o banco inteiro** — o comportamento de todo
pedido anterior. A migração é aditiva e não converte nada.

A tabela é `pedidos_modelos`, **não** `producao_os_itens`. Os arquivos em `sql/`
descrevem `producao_os_itens`, mas o aplicativo deixou essa tabela para trás; o
`loadOSItens` lê `pedidos_modelos`, e é ela que recebe toda escrita. Nessa tabela
a numeração é `amostra_num_id`, não `numeracao_id` — este último só existe no
objeto já mapeado em memória.

## A tela

O mesmo modal do editor de CSV, num segundo modo, aberto do pedido. Abrir três
vezes e tentar lembrar o que já foi dado é onde o erro nasce; então a
distribuição é **uma tela só**, com todos os modelos ao mesmo tempo.

Diferenças em relação ao modo edição:

- Uma coluna fixa **Modelo** depois do `#`, com bolinha colorida por modelo.
- **A caixa de marcar troca de sentido**: distribuindo, ela é a seleção do
  momento; editando, ela diz se a linha vai para o papel. Clicar numa célula
  seleciona a linha em vez de abrir a edição.
- Barra **"Atribuir a"** com um botão por modelo (e a contagem de cada um), mais
  "— Sem modelo".
- Não há edição de célula, nem coluna nova, nem colar, nem importar. Distribuir é
  um trabalho; consertar o dado é outro, e cada um tem a sua tela. Colar ou
  importar durante a distribuição seria pior que inútil: as linhas novas teriam
  identidade nova e nenhum modelo as reconheceria.
- Cancelar/reativar linha continua disponível, porque "esse assento foi
  interditado" é parte do trabalho de distribuir.

**A busca e o filtro que já existem são a ferramenta de atribuição.** Filtra
`Setor = Camarote`, clica em "Visíveis", clica no modelo: três cliques resolvem
340 linhas. É o poder de uma regra por coluna sem precisar salvar regra nenhuma,
mantendo a liberdade de marcar linha a linha quando o caso for torto.

**A atribuição é exclusiva.** Dar uma linha a um modelo tira dela o dono anterior,
e a tela avisa de quem saiu. Imprimir o mesmo assento em dois modelos deixa de ser
possível por construção — não é um aviso que dá para ignorar.

## Cobertura

Como a posse é exclusiva, sobra uma pergunta só: ficou alguém sem dono? O rodapé
responde o tempo todo, e clicar no aviso filtra a grade para essas linhas.

É aqui que o desenho paga por si quando o cliente manda o CSV corrigido: as linhas
novas entram sem dono e **aparecem no aviso**. Antes, simplesmente não seriam
impressas por ninguém, em silêncio.

A mesma conta aparece numa faixa no topo da fila do pedido, que é o ponto de
entrada da tela. A faixa só existe quando dois ou mais modelos apontam para a
mesma numeração com CSV — com um modelo só não há o que distribuir.

## Onde a fatia entra na impressão

Um ponto por caminho:

- **Modelo sozinho na Imposição**: `updateImpSummary()` passa a carregar a fatia
  do item ativo em vez do banco inteiro.
- **Vários modelos juntos** (`multi_artes`): cada arte recebe uma cópia da
  numeração com `csv_data` já reduzido à fatia daquele modelo.

Nesse segundo caminho a quantidade da arte passa a ser o tamanho da fatia — mas
**só quando o modelo tem `csv_selecao`**. Sem fatia, a quantidade digitada
continua mandando, exatamente como antes, para não mudar o comportamento de
pedidos que já estão em produção.

Como o `csv_data` viaja pronto no payload, **o `engine.py` não muda** e o agente
não precisa ser republicado. O filtro de `__ativo` continua no motor, onde estava.

## Verificação

Não há runner de teste JavaScript no projeto. As funções puras (`garantirIds`,
`comprimirIds`, `expandirIds`, `fatiaDoModelo`) ficam expostas em
`window.CsvEditor` sem tocar no DOM, e foram exercitadas pelo navegador junto com
o fluxo inteiro: abrir a distribuição, filtrar por coluna, atribuir em bloco,
mover linha entre modelos, filtrar as sem dono, aplicar, e conferir o que cada
modelo imprime — inclusive que a soma fecha e que não há linha repetida.

## Fora de escopo

- Reaproveitar o mesmo banco entre pedidos diferentes (isso seria uma tabela
  `producao_bancos_csv`, um passo maior).
- Permitir que dois modelos imprimam a mesma linha. A exclusividade é a trava que
  impede assento duplicado; se um dia for preciso, vira um interruptor explícito.
- Preencher a quantidade comercial do modelo a partir da fatia fora do caminho
  `multi_artes`. A tela mostra a divergência; adotar o número é decisão do
  usuário.
