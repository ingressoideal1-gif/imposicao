# NewProd 1.3.19: visibilidade das camadas PDF

## Problema e correcao

Pedido 23802, modelo 1003577: a previa mostrava as artes corretas, mas a
geracao sobrepunha uma credencial de uma camada oculta em sete das oito pecas.
`show_pdf_page` copia recursos de pagina sem transportar o `OCProperties` do
catalogo. O problema foi reproduzido na importacao isolada do PDF original.

`pdf_camadas.py` transporta os grupos OCG usando o mesmo Graftmap da importacao,
preservando referencias OCMD/Forms e os estados ON/OFF do catalogo. Cada grupo
recebe identidade local para evitar que garbage=4 una grupos homonimos com
estados opostos. `engine.py` usa os wrappers em todas as chamadas de
show_pdf_page e insert_pdf, inclusive elementos, poses giradas e verso separado.
Nao rasteriza nem reescreve as artes. PDFs sem OCG seguem o caminho anterior.

## Validacao

- Dez regressoes sinteticas sem rede: pixels, texto, CMYK, quatro rotacoes,
  OCMD, grupos homonimos, copia intermediaria, paginacao, multi-artes,
  verso separado, elementos PDF e arquivo sem camadas.
- Oito paginas reais: igualdade exata de pixels com o original depois de
  importar, salvar com garbage=4 e reabrir, na resolucao nativa da comparacao.
- Geracao local do modelo, formato e gabarito atuais: duas folhas, oito pecas,
  sem a arte oculta sobreposta. Arquivo e imagens em `dist/analise-23802`;
  nenhuma gravacao em pedido, banco ou fila; nenhum envio a impressora.
- Fonte de runtime baseada em `agente-v1.3.18`; alteracao correspondente em
  main pelo PR 169. Nenhuma alteracao de frontend ou Edge Function.
- Release condicionado a suites completas dos tres perfis, CI obrigatorio,
  auditoria do EXE/MSI e downloads publicos completos com tamanho e SHA-256.

## Distribuicao

Versao 1.3.19, pacote unico com aliases Oficial e Teste de bytes identicos.
O publicador guarda recibos e manifestos anteriores em dist. Os tres manifestos
devem apontar para a mesma versao sem lista de estacoes.

Publicacao nao comprova instalacao nem impressao fisica. Apos a atualizacao,
gerar novamente o arquivo: PDFs antigos permanecem com a composicao antiga.
Para reverter o codigo, publicar a fonte anterior com versao superior;
nao forcar downgrade nem reiniciar estacoes automaticamente.
