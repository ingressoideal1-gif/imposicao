# PDFs dos Mapas de Teatro — integração na aplicação

## Comportamento entregue

Após salvar e conferir a linha persistida, a aplicação gera o PDF completo e um PDF para cada setor. O popup de sucesso oferece **Ver PDFs**. Na lista **Mapas de Teatro**, o botão **PDFs** permite visualizar ou baixar esses documentos para mapas novos e já existentes. Essa abertura relê o mapa salvo antes de gerar, incluindo alterações feitas por outro operador.

Cada documento usa a logo original Ingresso Ideal enviada pelo usuário, nome do mapa, nome e identificador do setor, quantidade de assentos, distribuição geográfica, rótulo completo, legenda dos tipos e contagem por fila. Cadeiras apagadas são excluídas. Espaços vazios e posições são preservados; palco e orientação física não são inventados. A prancha é A3 com desenho vetorial. Setores extensos recebem visão geral e páginas de detalhe para manter os rótulos legíveis.

## Persistência e ERP

A fonte continua sendo `producao_mapas_teatro`: `id`, `name` e `config`. Os setores ficam em `config.setores[]`, com `id`, `nome` e `cadeiras`; as cadeiras ativas determinam a quantidade de cada setor. Não foram adicionadas tabelas ou colunas de PDF.

Os documentos são gerados no navegador a partir dos dados salvos. O botão permite regenerar e baixar em outra sessão. Os endereços de visualização são temporários (`blob:`), sem URL pública permanente ou arquivo persistido no Storage. Disponibilizar uma URL permanente ao ERP exige uma entrega própria de armazenamento no servidor.

Uma falha de geração do PDF não desfaz o salvamento confirmado nem repete a escrita. O popup informa que o PDF está pendente e permite tentar novamente pelo botão da lista. Mapas locais ainda não salvos não geram PDF. Configurações antigas com cadeiras fora dos setores precisam ser revisadas antes da exportação.

## Arquivos e validação

- `frontend/mapas.js`: geração após salvamento e botão na lista.
- `frontend/mapas-teatro-pdf.js`: preparação, desenho vetorial e visualização/download.
- `frontend/mapas-teatro-logo.js`: PNG original incorporado, SHA-256 `87706379267cb897e665e42851c456ac0411585d6d6eba6b7f387ca45efb5b10`.
- `frontend/index.html` e `frontend/producao.html`: carregamento dos recursos.
- Harness de lógica: 88 verificações, incluindo erro de escrita, falha de PDF, leitura atualizada e ausência de gravações na regeneração.
- Harness Chromium nas duas telas: PDF real, logo incorporada, download pela interface, quatro setores, atualização de revisão e teste com 3.000 assentos.
- Extração e renderização dos PDFs sintéticos com PyMuPDF: uma página no exemplo de 16 assentos; 18 páginas no exemplo denso, com 3.000 rótulos únicos preservados.

Os testes usam dados sintéticos e serviços simulados. Não houve gravação remota em banco, alteração de backend, novas dependências ou publicação do agente Windows. A publicação web foi solicitada explicitamente pelo usuário em 03/10/2026; a comprovação dos arquivos públicos é registrada separadamente após a implantação.
