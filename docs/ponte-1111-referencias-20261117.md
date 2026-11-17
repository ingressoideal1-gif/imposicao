# Ponte 1.10.11 — protecao das referencias de numeracao e cor

Entrega autorizada em 17/11/2026. Base preservada: Ponte 1.10.10.

## Comportamento

As camadas de referencia de numeracao e cor devem permanecer visiveis para o
designer, bloqueadas e nao imprimiveis. A Ponte agora rele essas propriedades
apos aplica-las e interrompe a operacao se o Corel nao confirmar a protecao.

Antes de exportar, inclui as referencias da pagina mestre, salva o CDR com a
visibilidade original e oculta temporariamente as camadas tecnicas. Confere a
ocultacao antes de `PublishToPDF` e restaura a visibilidade ao terminar, inclusive
se a exportacao falhar. Nenhum salvamento ocorre durante essa ocultacao.
Uma falha de restauracao impede confirmar a atualizacao.

A arte editavel, os objetos, os cadastros e os documentos existentes sao
preservados. Referencias ja incorporadas na propria camada de arte nao sao
removidas automaticamente. Nao houve alteracao de SQL ou servico remoto.

## Pacote e validacao

Instalador: `Instalar-Ponte-Imposition.exe`, versao 1.10.11, 189.864.291 bytes.
SHA-256: `f61f3f929073e0e6f2715b96afe34373e9058bb168afa0396af0fc9fd8fbec7e`.

137 testes Python aprovados na fonte isolada. Casos incluem recusa silenciosa
do COM, falha de exportacao/restauracao, pagina mestre e preservacao da arte.
Executavel e instalador retornaram `ready=true` em diretorios isolados.
Os hashes dos 116 arquivos do runtime foram conferidos.

Comparacao do codigo compilado com a 1.10.10 confirmou mudancas somente em
`ponte_imposition.corel_adapter` e `ponte_imposition.runtime` (versao).
O adaptador compilado corresponde exatamente a fonte corrigida.

Fonte congelada: `ponte-release-referencias-20261117-1111`.
Build: `ponte-build-referencias-20261117-1111b`.
Arquivo de fontes e testes: `fontes-1111.zip`, SHA-256
`6d709109fed05213fed6efbe2d6a1f2b9d8e59978d6478a1b894070e51a6e032`.
Recibos e resultados adicionais ficam em `release-evidence.json` nesse build.
O checkout operacional e as alteracoes preexistentes foram preservados.

## Ativacao, limites e recuperacao

A publicacao nao instala a Ponte nas estacoes. Encerrar a Ponte pelo icone da
bandeja antes de executar o instalador. Os documentos e a versao anterior sao
preservados pelo instalador.

A tentativa de prova sintetica no Corel local falhou antes de criar o CDR,
na inicializacao COM, com `-2146959355`. Portanto, o pacote e os testes simulados
nao comprovam a exportacao real na estacao Bianva nem a causa historica exata do
PDF do pedido 24475. Nenhum CDR de pedido real foi modificado nesta entrega.

Na estacao de origem, validar uma copia do CDR: referencias bloqueadas e nao
imprimiveis, PDF exportado sem as referencias e visibilidade restaurada ao
terminar. PDFs antigos permanecem inalterados ate nova atualizacao autorizada.

Recuperacao: manter o instalador 1.10.10 e a revisao anterior do Drive. O controle
local permite retornar a versao instalada anterior sem remover os dados. Para
reverter o anuncio web, reverter somente o manifesto desta entrega. Nao restaurar
artes de pedidos como parte do retorno da Ponte.
