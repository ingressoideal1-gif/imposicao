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
- Publicacao condicionada aos testes dos perfis producao, piloto e oficial,
  auditoria do executavel/MSI e verificacao dos downloads publicos completos.

## Entrega e recuperacao

MSI `NewProdPiloto_Oficial_v1.3.18.msi`, com alias legado Teste de bytes identicos.
Os tres manifestos devem liberar o mesmo pacote para todas as estacoes, sem
lista restritiva. O publicador guarda os manifestos anteriores e os recibos
em `dist/publicacao-unica-1.3.18-*` antes de ativar a atualizacao.

Se necessario reverter, publicar a fonte anterior sob versao superior;
o atualizador nao faz downgrade automatico. A disponibilidade dos pacotes
nao comprova instalacao nas estacoes nem impressao fisica. Apos atualizar,
reabrir o pedido para reconstruir o seletor do modelo.
