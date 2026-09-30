# Lista de Arte: concluídos sob demanda

## Pedido e base

O usuário confirmou que a carga inicial deve conter apenas as filas de trabalho
da Lista de Arte. Concluídos devem ser consultados ao abrir o card ou pesquisar
um pedido antigo. A fila Pendente Informação também continua no recorte ativo.

Preparação isolada em `feat/lista-arte-leitura-seletiva-20260930`, base v989
(`80af87da`). Esta correção ainda não foi publicada. O checkout operacional e os
registros locais da entrega anterior foram preservados.

## Comportamento

- Ao abrir ou atualizar a Lista de Arte nas filas de trabalho, não executar a
  consulta ampla por `SINAIS_SAIU_DA_ARTE`, responsável por retornar 4.744 propostas
  na coleta recebida. Ler os metadados dos candidatos conhecidos por produtos e
  artes para conferir seu status, sem assumir que aprovação comercial é conclusão.
- Excluir os concluídos antes das leituras de nomes complementares, prazos,
  modelos globais e pagamentos. Os metadados globais de artes/produtos/links
  continuam sendo usados para descobrir candidatos; isto não é uma migração de
  toda a listagem para paginação no servidor.
- Buscar separadamente somente modelos em Corrigir Arte, em páginas de 500,
  para preservar retrabalho de pedidos antigos, inclusive sem produto recente.
  A regra de cancelamento continua prevalecendo sobre retrabalho.
- Ao clicar em Pedidos Concluídos, consultar o histórico pelo fluxo completo.
  O Dashboard também solicita a base completa para manter sua análise histórica.
  Nas filas ativas, o contador de Concluídos mostra Consultar enquanto não existe
  uma leitura completa; não exibe zero nem uma contagem parcial como total.
- Uma pesquisa textual solicita o histórico depois de 400 ms sem digitação e
  passa a procurar em todas as filas. Filtros explícitos de status, designer,
  atendente e setor continuam valendo. O histórico já carregado é reutilizado
  durante a digitação. Limpar a pesquisa volta ao recorte ativo. Nesta preparação,
  a pesquisa aciona a leitura histórica completa, não uma consulta remota por termo.
- Produção e Acabamento mantêm sua leitura anterior. A navegação por link/F5 de
  um pedido ausente solicita explicitamente a carga completa antes de restaurá-lo.
- Chamadas simultâneas do mesmo recorte compartilham a leitura. Se o operador
  solicitar histórico durante a carga ativa, uma leitura completa ocorre depois.
  Se abandonar esse histórico antes disso, a leitura adicional não ocorre.
  Falhas restauram os dados e a indicação de abrangência anteriores.

Fontes alteradas: `frontend/script.js`, `frontend/index.html`,
`frontend/producao.html` e `frontend/navegacao-painel.js`. Sem mudança em SQL,
Edge Functions, autenticação, resolução, numeração ou arquivos de artes.

## Validação

O novo harness usa carregadores reais, o paginador real de propostas e 4.744
propostas concluídas sintéticas, com respostas de banco simuladas. Compara
recortes e verifica dados finais, consultas, exclusão antes dos complementos,
retrabalho, cancelamento, histórico sem produto/arte, falhas, retry, navegação,
pesquisa e concorrência. Executa também o trecho real de escolha da lista e
contador do renderer. Não faz requisições a serviços reais.

Foram observadas 7 chamadas no recorte ativo e 110 no completo, incluindo a
leitura de pagamentos nos dois percursos. Esses números dependem do conjunto
sintético e não são promessa de latência ou contagem da produção. O resultado
principal é a ausência da consulta global por status na carga ativa e sua
preservação quando o histórico é solicitado.

Os testes existentes receberam o novo auxiliar de seleção de recorte e os
contratos de histórico/contador foram ajustados à decisão do usuário. A asserção
antiga de histórico também esperava uma assinatura de consulta anterior ao
AbortSignal; agora verifica a chamada com sinal dentro do ramo de carga completa.

Validação concluída: 32 verificações novas; 163 da Lista de Arte; 65 de histórico;
88 da entrada dos pedidos; 35 de recuperação das prévias; 22 cenários de navegação;
33 do diagnóstico e 25 da instrumentação de rede. Também passaram as regressões
de atualização automática, carga/retry, lotes e rolagem/fila. A sintaxe dos 83
JavaScripts passou. `entrega-segura.ps1 verificar -Escopo Frontend` terminou em
VALIDADA, incluindo escopo, segredos, links e whitespace. Testes executados por
Node com dependências existentes; o wrapper pytest foi preparado, mas pytest
não está disponível nos Pythons usados nesta sessão.

Antes de publicar: revisar avanço de origin/main e simular a entrega.
Depois de publicar: repetir o diagnóstico v2 nas duas situações separadas,
Lista de Arte ativa e pedido 13020. Na carga ativa não deve existir a etapa
status dos pedidos; ao abrir Concluídos ela deve continuar presente. Conferir
um pedido em Corrigir Arte e a abertura de pedido antigo pelo histórico/link.

Recuperação: preparar reversão seletiva desta entrega, preservando as alterações
posteriores. Não há mudança de dados persistidos, banco ou instalação NewProd.
