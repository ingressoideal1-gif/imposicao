# Montagem: setores e recomendação de uma folha

Alteração local em 17/10/2026, na branch `feat/montagem-setores-folha-unica-20261017`, baseada em `0523d80e` (fonte do NewProd 1.3.13). Publicação do NewProd 1.3.14 autorizada após a validação local. Sem alteração de dados reais.

## Comportamento

- Filtros Flexo, PVC, Têxtil e Laser no topo, com os mesmos estilos e seleção cumulativa do painel de produção. Têxtil inicia selecionado a cada abertura; sem setores selecionados, a busca inclui todos.
- Setor resolvido pelo cadastro do produto, respeitando o snapshot local do pedido. Não inferir setor pelo nome do formato. Produto sem setor conhecido só aparece sem filtro de setor.
- Formatos, pedidos e modelos respeitam setor, pedido Em produção e modelo Aguardando. A troca de setor invalida seleções em voo e preserva as células já montadas.
- Retirada a escolha entre Reposição manual e Planejamento recomendado. Rascunhos antigos reabrem no fluxo manual, preservando as células.
- Recomendação calculada apenas para uma composição de folha, com células por modelo, repetições, produção e sobras. Exemplo: 30 e 70 peças em capacidade de 10 células resultam em 3 e 7 células, repetidas 10 vezes.
- Adicionar modelos não substitui posições manuais. Aplicar a composição exige ação explícita e permite desfazer. A confirmação de repetição de códigos variáveis permanece.
- A abertura deixa de solicitar histórico completo e usa o recorte de produção existente. O cálculo visível não executa busca por múltiplas montagens; não há medição de latência em estação real nesta etapa.

## Validação sintética

- `node tests/montagem_tela_harness.js`: 234 verificações no Chromium, incluindo filtro por setor, acentos, modelos impressos, preservação das células, folha única, repetições, desfazer, confirmação de dados variáveis, carga de produção e visibilidade em desktop/tela estreita.
- `node tests/montagem_harness.js`: 3586 verificações do núcleo.
- `node tests/montagem_local_harness.cjs`: preparação local de pedidos e múltiplos modelos sem consulta remota.
- `node tests/montagem_estacao_harness.cjs`: 6 cenários de detecção da estação.
- `python -m pytest -n 0 tests/test_o_javascript_do_frontend_compila.py -q`: 98 testes passaram.
- `git diff --check`: sem erros.

A validação usa dados sintéticos; não comprova atualização das estações, geração real de PDF ou impressão física. Fonte editada em `frontend/`, sem modificar o motor PDF. O instalador 1.3.14 incorpora o painel atualizado; a instalação nas estações será feita pelo atualizador existente.

## Entrega 1.3.14

A versão parte da fonte publicada do NewProd 1.3.13, preservando as correções locais e o tratamento do aviso QR Ideal da Montagem. O frontend Cloudflare não é substituído pelo frontend do agente, pois as fontes têm contratos de carregamento diferentes.

O MSI será publicado como artefato imutável. Os aliases históricos recebem os mesmos bytes; a ativação dos três manifestos ocorre somente após verificar SHA-256 e tamanho dos downloads públicos. A conferência de concorrência impede sobrescrever um manifesto alterado por outra sessão.

### Ajuste encontrado na validação de entrega

A verificação ampliada detectou que o novo filtro de setor estava sendo aplicado também à revalidação de modelos já carregados para o PDF. Corrigido: setor e formato restringem a busca; a geração continua validando status e compatibilidade dos modelos já montados, independentemente do filtro visual atual. O harness de faces exercita essa regressão com outro setor selecionado.

A primeira execução simultânea dos perfis oficial e produção também disputou o arquivo temporário `test_duplex_input.pdf`. Os dez testes de faces/duplex passaram após o ajuste; a validação final dos canais é executada em sequência para evitar essa disputa. Não houve alteração do motor PDF.
