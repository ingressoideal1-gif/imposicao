# Condições para o tipo Ticket

Implementação autorizada por “executar as condições para o tipo Ticket” e entrega por “entrega segura”, em `C:\ProjetosLocais\ideal-imposition-ticket-condicoes-20261004`, branch `fix/ticket-condicoes-20261004`, sobre `origin/main` (`1b57366f`). Alvos: web v1017 e NewProd 1.2.356. O diretório operacional e suas alterações foram preservados. Sem alteração de dados comerciais, migração ou instalação nas estações nesta etapa.

## Editor

- Teatro e Camarote permanecem visíveis, com botões desativados em TICKET e motivo no título. A chamada direta de adição/duplicação também é recusada antes de modificar estado, contador ou histórico.
- Elementos especializados existentes impedem a troca manual para Ticket. O operador deve removê-los explicitamente. Abrir registros antigos continua preservando tipo e elementos.
- Numeração, QR sequencial, Barcode sequencial e QR Ideal recebem seletor de posição. Texto fixo, Foto, Banco, QR/Barcode fixos e QR/Barcode de Banco não recebem esse seletor.
- Comuns, Gráficos e Banco continuam disponíveis. Banco usa uma linha por célula física, compartilhada entre vias; dados diferentes nas vias exigem colunas diferentes da mesma linha. Há explicação nas propriedades dos elementos de Banco e no aviso junto ao título Adicionar Elementos.
- Quantidade de Tickets por célula deve ser inteira e positiva. Mudanças que deixariam posições inválidas são recusadas, mantendo a quantidade anterior e os elementos. Corrigir as posições permite reduzir a quantidade. Desfazer/refazer inclui a quantidade.
- Registros antigos com posição inválida mostram uma opção de aviso, em vez de aparentar Ticket 1. Salvamento e validação dos modelos impedem prosseguir até a correção; nenhuma posição é remapeada automaticamente.
- A prévia de PDF paginado do painel e do cliente usa o cálculo Ticket também para QR e Barcode sequenciais. Exemplo: início 10, três vias, posição 3, segunda célula = 15. Conteúdos fixos e de Banco mantêm sua origem.

## Motor

`engine.py` valida quantidade, famílias especializadas e posições antes de calcular o trabalho ou gerar PDF. A validação alcança as numerações principal/secundária e as numerações de todos os modelos de Multi-Artes, inclusive um modelo tardio. Elementos apenas de Layout não são impressos.

A posição participa do cálculo somente nos elementos sequenciais e QR Ideal. Posições históricas em Banco/fixos/gráficos são ignoradas; os campos armazenados são preservados. A quantidade de células físicas e a fórmula `início + índice_da_célula × ticket_qtd + ticket_pos - 1` são mantidas. O contrato de numeração secundária não foi redesenhado.

## Validação

Resultado final: 244 testes Python/navegador/sintaxe passaram (execução serial, 17,28 s), além dos harnesses diretos de compatibilidade, faixa e prévias. `git diff --check` passou.

- Testes de navegador nas duas páginas: botões, adição direta, propriedades e notas de Banco, redução recusada, histórico, posição inválida, salvamento bloqueado, correção e troca de tipo.
- 52 cenários das prévias do painel/cliente: Frente/Verso, células 1/2, posições 1/2/3, Ticket/Sequencial e origem fixa/Banco.
- PDF real sintético em Frente, Frente/Verso e Verso Único: duas células físicas, três vias; valores de Numeração/QR/Barcode/QR Ideal, Banco compartilhado e colunas distintas, texto fixo, Foto, PDF e SVG. Picote conserva sua finalidade atual; não foi acrescentada renderização no PDF.
- Limites: quantidade zero/negativa/fracionária/inválida; posições fora de faixa, nulas, fracionárias e inválidas; seis elementos especializados recusados; modelo tardio de Multi-Artes recusado antes de abrir recursos.
- Regressões de Camarote, Teatro, snapshots, impressão combinada, refazer montagem e sintaxe de todo o frontend.
- A primeira execução de Camarote não localizou Puppeteer na cópia isolada; repetida com `NODE_PATH` apontando para a dependência já instalada, passou sem instalar pacotes.
- Falha preexistente do harness `texto_banco_browser_harness.js`: `ReferenceError: elementosNaOrdemDeComposicao is not defined`, reproduzida também na árvore anterior de v1016. O harness não carrega essa dependência; não foi alterado nesta tarefa. Banco foi coberto pelos novos testes de DOM, prévia e PDF real.

## Entrega e recuperação

O fluxo separa a integração por PR, a confirmação da hospedagem e dos arquivos web nas duas URLs operacionais, e a publicação do instalador com conferência de tamanho/SHA-256 pelo download público antes de ativar `latest.json`. O pacote precisa conter o frontend desta entrega, o motor corrigido e as DLLs de impressão, sem arquivos privados.

As evidências de execução serão guardadas em arquivos `tmp_ticket_356_*.json` na cópia de entrega (ignorados pelo Git). Testes e download público não comprovam instalação nas estações ou impressão física. A aplicação das novas validações do motor depende de NewProd 1.2.356 instalado.

Recuperação web: reverter os arquivos desta mudança em uma nova entrega com versão de cache maior. Recuperação do agente: recompilar o código anterior com uma versão maior; não reutilizar o nome do instalador nem tentar downgrade automático. Preservar o manifesto anterior para conferência. Não houve escrita em dados comerciais.
