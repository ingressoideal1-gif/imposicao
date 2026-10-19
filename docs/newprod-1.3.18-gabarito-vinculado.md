# NewProd 1.3.18: gabarito vinculado na impressao individual

## Problema e correcao

No pedido 23631, modelos 1003030 a 1003034, o cliente de faturamento usado
na ordem difere do cliente dos gabaritos. O filtro de `populatePedNumeracoes`
removia inclusive o gabarito explicitamente vinculado ao modelo. Na abertura
individual, a selecao ficava vazia e a conferencia de integridade bloqueava
a impressao por divergencia de numeracao.

`frontend/pedido.js` preserva somente o gabarito vinculado ao modelo ativo.
A compatibilidade de formato continua obrigatoria e as demais opcoes continuam
sujeitas aos filtros de cliente/item. A conferencia em `arte-de-impressao.js`
permanece intacta. Nenhum dado de pedido, cliente, banco ou faixa foi alterado.

## Fonte e validacao

- Pacote baseado em `agente-v1.3.17`, preservando as correcoes ja publicadas.
- Web: PR 168, cache v1081, alteracao localizada sobre `origin/main`.
- Regressao em Chromium, dados sinteticos e rede bloqueada: cinco modelos
  individuais, manutencao da selecao, exclusao de outros gabaritos, filtros de
  cliente/item e rejeicao de formato incompativel. Falha reproduzida na base
  sem correcao e teste aprovado com a alteracao.
- Producao, piloto e oficial: 1112 testes aprovados, 2 pulados e 2 subtestes
  aprovados por perfil, alem dos 21 harnesses de cada perfil. Aviso preexistente
  de depreciacao Starlette/httpx; nenhuma falha.
- MSI ProductVersion 1.3.18; executavel com os 375 arquivos frontend identicos
  a fonte e as tres DLLs GDI conferidas. Auditoria sem arquivos privados.
- Web PR 168 integrado em `46cd4de3a66995212fc92a6b62b7fc449952ff62`, tag v1081.
  Todos os checks obrigatorios aprovados. Deploy Cloudflare
  `ffc0cea6-04a4-42e4-9002-05fb5b2b0a85`; `pedido.js` e os quatro HTML alterados
  conferidos com cache-buster em ambos os dominios operacionais.
- Fonte do pacote: `a0fc9b97`, tag `agente-v1.3.18`.
- MSI: 196689920 bytes; SHA-256
  `caa74f069e0f9d7d6fcbc874d39326faef32920409261d71534e6f17f52ee5dc`.

## Entrega e recuperacao

MSI `NewProdPiloto_Oficial_v1.3.18.msi`, com alias legado Teste de bytes identicos.
Os downloads publicos completos dos dois nomes foram conferidos por tamanho
e SHA-256. `latest.json`, `newprod-piloto-oficial.json` e
`newprod-piloto-teste.json` confirmados em 1.3.18 para todas as estacoes, sem
lista restritiva. O publicador guardou os manifestos anteriores e os recibos
em `dist/publicacao-unica-1.3.18-*` antes de ativar a atualizacao.

Se necessario reverter, publicar a fonte anterior sob versao superior;
o atualizador nao faz downgrade automatico. A disponibilidade dos pacotes
nao comprova instalacao nas estacoes nem impressao fisica. Apos atualizar,
reabrir o pedido para reconstruir o seletor do modelo.
