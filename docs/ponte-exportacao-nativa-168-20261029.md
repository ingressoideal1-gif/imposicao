# Ponte 1.6.8 — exportacao sem reconversao corretiva

Por decisao explicita, o PDF exportado pelo TraceDraw nao passa mais por
converter_bitmaps_icc. Essa etapa exigia associacao exata com imagens do nativo
e bloqueava imagens resultantes do achatamento de transparencia do exportador.
Perfil de exportacao PDF/X-1a, ISO Coated v2 330% FOGRA39, JPEG qualidade 100 e
downsampling para 300 ppi acima de 400 ppi permanecem configurados.
A politica de cache foi incrementada para reexportar documentos ja preparados.
Importacao de PDFs e preservacao dos componentes CMYK na compactacao permanecem.
Nao ha promessa de fidelidade colorimetrica ou preflight certificado: as cores
ficam sob responsabilidade do exportador nativo do TraceDraw.

Validacao: 48 testes de exportacao, compactacao, edicao e numeracao; mais 20
testes de pacote, runtime e importacao aprovados. Um teste legado de retry de
publicacao (test_retry_so_inclui_modelos_nao_confirmados) falhou tambem com a
politica anterior e nao foi alterado: fixture sem hashes PDF espera omitir um
modelo, mas o fluxo atual o inclui. As mudancas desta entrega nao tocam esse fluxo.

Arquivo real fornecido do pedido 24524 exportado e compactado localmente:
1 pagina, 4 imagens, 2461661 bytes. Original preservado. Prova inclui as referencias
do arquivo avulso; nao foi publicada como arte oficial. O arquivo enviado nao
inclui o manifesto lateral de numeracao exigido pelo fluxo completo da ponte.
Nenhum pedido, arte oficial ou registro de banco foi alterado pela validacao.

Build isolado ponte-build-20261029-18. Manifesto, hashes internos, payload e
ausencia de arquivos privados conferidos. Instalador: 112515251 bytes;
SHA256 ec1fd07ca140c31dccdb6fca9cfcf60ceb3442a1684226c18637301b30503518.
Instalacao na estacao do designer e prova pelo botao Atualizar permanecem pendentes.
Recuperacao disponivel pela versao anterior da ponte; manter documentos salvos.
