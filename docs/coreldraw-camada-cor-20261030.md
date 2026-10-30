# Cor de referencia no CorelDRAW

Entrega consolidada da Ponte 1.7.7, posterior a 1.7.5. Instalacao nas estacoes e separada
da publicacao do instalador e deve ser feita com a ponte anterior encerrada.

Ao criar ou reabrir um documento de mapa compativel, a ponte consulta os PDFs
das cores do grupo em uma unica consulta autenticada. Cada pagina recebe a
referencia da sua cor: frente, verso separado quando cadastrado, ou pagina 2
do PDF de cor quando aplicavel. Sem PDF de cor, o fundo e branco, como na previa.

A camada `Imposition - Cor - referencia` fica abaixo das camadas de arte,
visivel, bloqueada e nao imprimivel. A camada de arte permanece ativa.
Reabrir substitui a referencia anterior, sem acumular camadas ou editar a arte.
Na exportacao, a ponte restabelece Printable=False para cor e numeracao/picote,
mesmo que a propriedade tenha sido alterada manualmente.

A cor e uma referencia visual. Objetos opacos da arte podem cobri-la; esta
mudanca nao aplica transparencia nem mesclagem aos objetos do designer.
Nao altera a conversao ICC, o PDF oficial, o motor ou a composicao do Imposition.

Validacao da cor: 116 testes de integracao, contratos, runtime, instalador e releases
passaram, incluindo os 20 testes especificos de Corel. Prova sintetica no CorelDRAW local
confirmou ordem das camadas, bloqueio, arte ativa, reabertura sem duplicacao e
PDF exportado sem os fundos verde/azul usados como referencias. A arte vermelha
permaneceu no PDF. Apenas o documento sintetico criado pelo teste foi fechado.
Evidencia local: %TEMP%/imposition-cor-proof-ugzyg8hd/prova.cdr e saida.pdf.

Arquivos: ponte_imposition/corel_color.py, corel_service.py, corel_adapter.py,
tests/test_corel_integration.py. Build consolidado ponte-build-corel-20261030-09.
O instalador usa o mesmo link; a revisao anterior no Drive e preservada.
Rollback pelo instalador, mantendo documentos e backups locais.

## Observacoes por pagina

A 1.7.7 tambem inclui observacoes por produto de pedidos_artes.observacoes,
associadas pelo produto de origem (incluindo a chave legada item_ID), e anotacoes
do modelo de pedidos_modelos.observacao_arte/amostra_obs. O fallback de anotacoes
do produto segue a interface existente. Consultas usam a sessao autenticada
do operador e filtro do pedido; nao ha escrita nesses cadastros.

Quadros somente quando preenchidos, com titulo da pagina, texto simples e quebra
de linhas. HTML e convertido em texto, sem scripts ou estilos. Sao imagens de
referencia na mesma camada bloqueada e nao imprimivel da numeracao. Posicao abaixo
de todas as paginas do documento, em faixas verticais separadas para nao sobrepor
paginas ou outros quadros. Reabrir atualiza ou remove o quadro quando esvaziado.

Prova sintetica de duas paginas no Corel confirmou camada protegida, posicao externa,
sem sobreposicao e PDF com as mesmas duas paginas e dimensoes, sem referencias.
Evidencia: %TEMP%/corel-notes-proof-ckhf62xp/prova.cdr e saida.pdf.
Arquivos adicionais: ponte_imposition/corel_notes.py e a lista permitida de leitura
em laboratorio/tracedraw/pedidos_leitura.py. Nenhum pedido real alterado pelo teste.

1.7.6 foi enviada ao Drive antes da ampliacao solicitada para observacoes;
o manifesto web passa de 1.7.5 diretamente para a consolidada 1.7.7.
