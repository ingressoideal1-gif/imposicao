# Pedido 21894: paginação do banco ausente no portal

## Resultado confirmado em 09/09/2026

O portal ainda usa apenas o CSV interno da numeração. O painel também carrega
o banco separado do pedido e o mapa de colunas de cada modelo. No pedido 21894,
os dados estão nesse banco separado, sem CSV interno nas numerações.

Consultas somente de leitura no projeto `vwbtitjlpelrcnsytzqw`, restritas ao
pedido, aos modelos 1000940 e 1000947 e às suas numerações. Nenhum dado pessoal,
conteúdo de linha, foto ou URL privada foi registrado. Nenhuma escrita remota,
alteração de código funcional ou publicação foi executada nesta investigação.

| Modelo | ID | CSV interno | Vínculo ao banco | Linhas do modelo |
| --- | --- | --- | --- | --- |
| Foto | 1000940 | Ausente | Presente, três elementos mapeados | 6 |
| Setor | 1000947 | Ausente | Presente, dois elementos mapeados | 4 |

O banco `51f9c74f-75f6-4f22-a35d-c36841d160a5` pertence ao pedido 21894 e tem
seis linhas e cinco colunas. As contagens por modelo acima resultam do resolvedor
de banco e do filtro de linhas do código: Setor usa quatro das seis linhas.
Foto possui elementos FOTO e TEXT alimentados pelo banco; Setor possui TEXT.
Ambos têm arte e prévia salvas, `modo_pdf = false` e status AGUARDANDO_CLIENTE.

## Caminho da falha

1. `cliente.js` carrega `csv_data` de `producao_numeracoes`, mas não consulta
   `pedidos_bancos` nem `pedidos_modelos_banco`.
2. `cliente.html` não carrega `banco-do-modelo.js`; o portal não aplica o
   `csv_mapa` para resolver qual coluna alimenta cada elemento do modelo.
3. `temCsvVariavel` exige CSV interno não vazio. Para ambos os modelos retorna
   falso, embora o banco do pedido esteja presente.
4. `paginaCsv` fica falso, o HTML não cria `amostra-csv-nav`, e o portal fica
   na imagem salva em vez de compor cada linha no canvas.

No painel, `carregarBancosDoPedidoNovo` lê bancos e vínculos;
`resolverNumeracaoParaModelo` aplica `BancoDoModelo.numeracaoResolvida`.
Com esse mesmo resolvedor, a numeração passa a ter as linhas e colunas esperadas,
e a condição de paginação passa a verdadeira nos dois modelos.

## Relação com a correção de frente e verso

A ausência de carregamento do banco separado já existe no código da base
`63fda110`, anterior à PR #31. A decisão de paginação é a mesma nas duas versões.
Na versão anterior, Foto também era impedido de desenhar ao vivo pelo verso
indevido sem arte de verso. A v847 removeu esse impedimento, mas não implementou
o carregamento do banco separado. Portanto, corrigir a face não basta para
restaurar a paginação deste pedido. Não foi identificado quando o usuário mudou
do CSV interno para o banco separado, nem atribuído um autor a essa alteração.

## Evidência e reprodução

O `cliente.js?v=847` público coincide integralmente com a fonte usada no teste,
normalizando CRLF/LF. SHA-256:
`c6205f5d640b7dac3eb3bb917e4eab1642d09f02e2fe4245768e29a5a60f3605`.

`node rascunhos/diagnostico-21894-paginacao/reproduzir.cjs` passou: executa as
funções reais de detecção, filtro e HTML com banco sintético, nas versões anterior
e v847. Ambas omitem as setas com a numeração crua e geram as setas quando recebem
a numeração resolvida com o banco; os casos sintéticos resultam em seis e quatro
páginas. Não houve abertura de link com token ou aprovação real.

## Correção necessária

Integrar o carregamento do banco e dos vínculos ao portal e usar a numeração
resolvida na montagem do cartão, nas setas e no desenho. Respeitar o pedido/token,
o mapa por elemento, as linhas ativas e a seleção de cada modelo. Preservar o CSV
interno legado e mostrar falha de carregamento em vez de tratar banco indisponível
como vazio. A solução não exige ativar o modo PDF nem copiar dados para a numeração.
