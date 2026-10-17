# Montagem: visualização, identificação compacta e saída de faces

Implementação local em 17/10/2026 na branch `feat/montagem-faces-controles-20261017`, baseada no NewProd 1.3.14 (`56475bb4`). Não publicada nem instalada nesta etapa.

## Comportamento

- Seletor Visualizar frente / Visualizar verso na barra da folha, disponível para modelos com verso. A face da prévia é independente da face escolhida para gerar o PDF.
- Removido o box Modelos na montagem. A identificação dos modelos continua junto às células e os gestos de seleção, duplicação, remoção e desfazer permanecem.
- Identificação na célula em uma linha: N. Pedido, Esquerda, 90°, 12 pt e Verde como padrões. A impressão da identificação continua sendo habilitada pelo checkbox Imprimir; escolher seu tipo também a habilita, como antes. Personalização e demais posições/rotações/tamanhos continuam disponíveis.
- Gerar PDF, faces e Hot Folder no topo. Configuração de pastas recolhível; mantidos cadastro, validação e remoção de pastas.
- Frente, Verso e Frente×Verso são checkboxes de escolha exclusiva. Separados ativa Frente×Verso e entrega dois arquivos: `_frente.pdf` e `_verso.pdf`, cada um contendo todas as folhas da respectiva face. A opção Visualizar PDF abre o arquivo de frente quando separados; ambos os arquivos são entregues ao destino selecionado.
- Rotacionar Verso aplica matriz de 180° ao conteúdo completo de cada página de verso. Não gira cada célula nem altera o /Rotate existente. Mantém as caixas da página, texto e perfil ICC. A prévia gira o papel completo e realinha as informações laterais das células.
- Todos os PDFs são preparados antes de iniciar a entrega. Uma falha de Hot Folder mantém o download de recuperação. A confirmação de impressão ocorre uma vez, após a entrega, para todos os modelos carregados.
- Removidas observações repetitivas da interface; preservadas recusas de incompatibilidade/status e alertas de dados variáveis.

## Validação

- 222 verificações de navegador com controles reais, composição, saída separada, Hot Folder, PDF inválido, confirmação única, prévia independente, rotação e alinhamento lateral.
- 3586 verificações do núcleo da Montagem.
- 17 testes de PDF: modos duplex e duplex_unico, uma e várias folhas, posições repetidas e identificação textual/numérica. Comparam os pixels de frentes/versos separados e PDF combinado contra o original, aplicando rotação de referência apenas ao verso. Conferem conteúdo, /Rotate e OutputIntents.
- 98 verificações de sintaxe do frontend. Total Python focado: 115 aprovados.
- Harness de preparação local sem consulta remota e 6 cenários de detecção da estação aprovados.
- `git diff --check` sem erros; inspeção visual no Chromium.

Somente frontend e testes foram alterados; motor e endpoints permanecem inalterados. Dados e PDFs de validação são sintéticos. Nenhuma impressão física ou atualização de estação foi executada.
