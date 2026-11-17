# Ponte 1.10.12: somente alteracoes por modelo no Corel

Entrega autorizada em 17/11/2026, baseada na Ponte 1.10.11 publicada.

O quadro do Corel deixa de incluir "Observacoes por produto" e passa a mostrar
somente as alteracoes do proprio modelo, quando houver. Mantem a prioridade
existente de `observacao_arte` sobre `amostra_obs` do modelo, sem herdar anotacoes
do produto. Os dados de observacao do cadastro permanecem preservados.

O quadro aparece somente na primeira pagina de cada modelo com alteracao,
inclusive em frente/verso, verso fixo e multipaginas. Modelos sem alteracao
ficam sem quadro. A protecao das camadas de referencia da 1.10.11 permanece.

## Validacao e rastreabilidade

142 testes Python aprovados na fonte isolada, com dados sinteticos e COM
simulado. Cobrem isolamento entre modelos, ausencia de heranca do produto,
HTML vazio, paginas, substituicao do quadro antigo e protecao na exportacao.
Aviso preexistente do Starlette/httpx, sem falha de teste.

Fonte congelada: pasta irma `ponte-release-observacoes-20261117-1112`.
Build e recibos: `ponte-build-observacoes-20261117-1112/release-evidence.json`.
O manifesto de fontes confirma mudancas apenas em `corel_notes.py` e na versao
em `runtime.py`. O checkout operacional e suas alteracoes foram preservados.

Executavel e instalador retornaram `ready=true` em diretorios isolados.
Os 116 arquivos do runtime tiveram seus hashes conferidos. Comparacao do codigo
compilado confirmou somente as duas alteracoes previstas; `corel_notes` compilado
corresponde exatamente a fonte aprovada.

Instalador: 189.862.534 bytes; SHA-256
`a54d81cb00e9f026080b45f0ab9d97f6421cd35cc57bb74218707958f683c628`.
Arquivo `fontes-1112.zip`: SHA-256
`627ea95af3f119606731d7d68a921c7d82ce67ec7dc90925579c11bb360eb33a`.

## Ativacao e recuperacao

Publicar o pacote nao instala a Ponte nas estacoes. Encerrar a Ponte pela bandeja
e instalar a 1.10.12. Para recompor um documento existente, salvar e fechar o CDR
e reabrir pelo Imposition. Um documento ja aberto preserva suas edicoes e nao
recompoe referencias automaticamente.

Validar em uma copia do CDR: modelo com alteracao exibe somente sua anotacao,
modelo sem alteracao fica sem quadro e a exportacao preserva as protecoes.
Instalacao e prova no Corel real nao foram executadas nesta entrega.
Nenhum CDR, PDF ou cadastro de pedido real foi modificado.

Para recuperacao, conservar o instalador 1.10.11 e sua revisao anterior no Drive.
O controle local permite retornar a versao anterior sem remover os dados.
Reverter o anuncio web exige somente reverter o manifesto desta entrega;
nao restaurar artes de pedidos como parte do retorno da Ponte.
