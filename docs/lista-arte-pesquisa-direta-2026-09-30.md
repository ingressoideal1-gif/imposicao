# Pesquisa pontual e investigação dos downloads

## Estado e escopo

Implementação local autorizada pelo pedido de executar as recomendações.
Worktree `ideal-imposition-lista-arte-pesquisa-direta-20260930`, branch
`fix/lista-arte-pesquisa-direta-20260930`, criada de `origin/main` v990
(`e745af0505d0efeafc957f3d99c9126d39018a03`). Não publicada nesta preparação.
Checkout operacional e relatórios das entregas anteriores preservados.

A v990 retirou o histórico da carga ativa, mas qualquer texto na pesquisa ainda
ativava a base completa. As coletas do participante com demora registraram
novamente 4.747 propostas em paralelo à abertura e tarefas longas de navegador.
O clique exato não estava registrado; não é possível atribuir o gatilho dessas
coletas à pesquisa com certeza. Um download de 23.811 bytes também levou
10.329,4 ms até headers e 1,4 ms no consumo posterior do corpo, sem proxy.

## Implementação

1. Pesquisa exclusivamente numérica, positiva, até nove dígitos solicita o
   pedido exato usando o endpoint existente por números. Artes, produtos,
   modelos, links e prazos dessa leitura também ficam restritos ao pedido.
   O construtor de OS e as regras de entrada nos painéis são reutilizados.
2. A resposta é incorporada à fila já carregada. Não apaga os demais pedidos,
   não declara que o histórico está completo e não substitui modelos completos
   de um pedido aberto/carregando. Falha de leitura, mudança da pesquisa ou
   troca de conta impedem aplicação de uma resposta inadequada.
3. Pagamentos pontuais preservam os outros pagamentos e aguardam uma carga
   global anterior, quando presente. Rotinas existentes de status, links,
   prateleira e avisos continuam disponíveis. Esses complementos podem examinar
   a base já carregada; não é promessa de ausência de qualquer outra consulta.
4. Pesquisa por nome/texto e solicitações explícitas de Concluídos/Dashboard
   preservam a carga completa. Limpar a pesquisa volta à carga ativa. A pesquisa
   numérica passa a buscar número exato, não prefixos numéricos de todo o histórico.
5. `renderOrdens` deixa de construir tabelas quando os dois painéis estão
   inativos. Quando um painel está ativo, não constrói o corpo da outra tabela.
   Voltar à Lista de Arte ou ao Painel de Produção retoma o desenho com o estado
   atual. A recuperação de link direto continua sendo agendada.
6. Diagnóstico opt-in registra contexto da solicitação: painel, card, tipo de
   pesquisa, recorte, solicitação explícita de base completa e carga já em curso.
   Registra também duração síncrona de renderOrdens e quantidade de pedidos.
   Não exporta o texto da pesquisa nem os argumentos completos da chamada.

Não houve alteração de SQL, Edge Functions, autenticação, resolução, conteúdo
das artes ou instalação NewProd. Os bloqueios anteriores não tinham perfil de
funções; eliminar o desenho oculto remove trabalho concreto, mas não comprova
que esse era o único responsável por todas as tarefas longas observadas.

## Comparação manual de download

O painel ganha o botão **Comparar download direto / proxy**. Ele não muda o
download normal e não faz tráfego adicional até ser acionado. Durante uma
coleta ativa, escolhe a arte Supabase com maior tempo de obtenção já observado,
mantendo o mesmo endereço em memória nas próximas rodadas dessa coleta.

O teste baixa o arquivo sequencialmente pelos caminhos direto e proxy existente,
com `cache: no-store`, sem cookies, prazo de 20 segundos por caminho e ordem
alternada a cada rodada. Compara SHA-256 em memória para confirmar conteúdo
idêntico. Exporta tempos, status, tamanho e resultado da comparação; não exporta
URL, conteúdo ou hash. O no-store evita uso normal de cache do navegador; não
garante cache frio na infraestrutura. Não troca o caminho padrão de produção.

Chamadas HTTP/fallback do experimento recebem marcação própria. Encerrar a
coleta aborta a comparação e impede eventos tardios no relatório fechado.
Chamadas duplicadas do botão não iniciam outro teste simultâneo. Uma resposta
rápida com conteúdo diferente não é tratada como sucesso equivalente.

Após publicação, na estação afetada:

1. Iniciar diagnóstico antes de pesquisar `13020` e abrir o pedido; aguardar as
   artes. Verificar `solicitacao_lista.recorte=pedido` e ausência da consulta
   global por status nesse percurso, distinguindo operações anteriores.
2. Ainda com a coleta ativa, clicar em Comparar download direto / proxy e
   aguardar o resultado. Repetir uma vez para alternar a ordem.
3. Se houver outra conexão disponível, trocar somente a conexão, mantendo a
   mesma estação, conta e coleta; repetir. Anotar a troca da rede entre rodadas.
4. Encerrar e exportar o JSON. As rodadas usam a mesma referência de arquivo.

Diferença entre caminhos ou redes aumenta a evidência de onde investigar, mas
não substitui métricas do servidor. A alteração da conexão exige operação na
estação; não foi executada remotamente. Nenhum arquivo real foi usado nos testes.

## Validação e recuperação

- 42 verificações do recorte/pesquisa: 4.744 concluídos sintéticos, leitura de
  um número, preservação da fila e pagamentos, erro, concorrência, resposta
  abandonada, troca de conta e modelo aberto.
- 18 verificações em Chromium com 4.747 pedidos sintéticos: desenho oculto
  interrompido e retomado, contexto sem texto privado, comparação explícita,
  mesmos bytes, HTTP 503, conteúdo diferente, ordem alternada, cancelamento,
  clique duplicado e ausência de exportação de tokens/URLs/conteúdo.
- Regressões aprovadas: 163 verificações da lista, 65 de histórico, 88 de entrada
  dos pedidos, 35 de recuperação das prévias, 22 de navegação, 33 do diagnóstico,
  25 da instrumentação de rede; também carga, atualização, lotes e rolagem/fila.
- Testes executados por Node/Chromium com dependências existentes, sem serviços
  reais. Wrapper pytest atualizado; ambiente de preparação sem pytest/venv.
- `entrega-segura.ps1 verificar -Escopo Frontend` executado com os harnesses
  pertinentes. Não é publicação nem medição de ganho real nas estações.

Antes da publicação, conferir avanço de origin/main e executar simulação da
entrega. O publicador deve versionar script.js e diagnostico-artes.js. Depois,
conferir hashes públicos e repetir o teste dirigido descrito acima.

Recuperação: reverter seletivamente os arquivos desta entrega, em base atual,
e publicar com nova versão de assets. Não há migração de dados a reverter.
