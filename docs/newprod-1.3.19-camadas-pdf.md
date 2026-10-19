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
- Fonte de runtime baseada em `agente-v1.3.18`; proposta de integracao em
  main pelo PR 169. Nenhuma alteracao de frontend ou Edge Function.
- Suites completas: 1122 testes, 2 pulados e 2 subtestes aprovados por perfil
  (producao, piloto e oficial), mais 21 harnesses por perfil. Aviso preexistente
  Starlette/httpx. Nenhuma falha.
- EXE auditado: codigo compilado de engine/pdf_camadas igual a fonte, versao
  1.3.19, 375 arquivos frontend identicos e tres DLLs GDI presentes.
- MSI ProductVersion 1.3.19, 196689920 bytes; SHA-256
  `90ebb3a3117dd61fd5b63ec7ca9aed9a5b6decc1d86207cc9f8e40a23a54e8ec`.
- Fonte do runtime: `b709e549`, tag `agente-v1.3.19`.

## Distribuicao

Versao 1.3.19, pacote unico com aliases Oficial e Teste de bytes identicos.
Dois downloads publicos completos conferidos antes da ativacao, com segunda
conferencia ao promover os objetos ja enviados. `latest.json`,
`newprod-piloto-oficial.json` e `newprod-piloto-teste.json` confirmados em 1.3.19,
com o mesmo hash/tamanho e sem restricao de estacoes. Recibos e backups em
`dist/publicacao-unica-1.3.19-1792425698490043700`.

PR 169 ainda aberto, com checks obrigatorios na fila em 19/10/2026 durante o
incidente publico de GitHub Actions, Pages e Webhooks. Nenhum merge forcado.
A publicacao do pacote usa a fonte auditada e versionada na tag do runtime;
a integracao em main permanece pendente da aprovacao do CI. Os testes locais
foram executados no runtime empacotado (PyMuPDF 1.27.2.3); o ambiente do CI
fixa PyMuPDF 1.28.2 e ainda aguarda execucao.

Publicacao nao comprova instalacao nem impressao fisica. Apos a atualizacao,
gerar novamente o arquivo: PDFs antigos permanecem com a composicao antiga.
Para reverter o codigo, publicar a fonte anterior com versao superior;
nao forcar downgrade nem reiniciar estacoes automaticamente.
