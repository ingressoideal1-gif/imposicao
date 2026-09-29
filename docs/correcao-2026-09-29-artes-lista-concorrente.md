# Artes presas ao abrir pedido com atualizacao da lista em andamento

Relato posterior a v976: pedido abre com Carregando arte e apenas apresenta as previas depois de F5 e espera prolongada. Diagnostico e correcao sobre `9c1051bd` (v978), preservando as duas entregas de Dashboard posteriores a v976. Worktree isolada: `C:\ProjetosLocais\ideal-imposition-artes-carga-v976-20260929`.

## Defeito reproduzido

A Lista de Arte exibe dados anteriores enquanto atualiza. O operador pode abrir um pedido antes de essa atualizacao terminar. `loadOSItens` busca os modelos completos; entretanto, ao concluir, `loadOrdensFromVibecode` substituia `state.osItens` daquele pedido por produtos resumidos do ERP. A previa detecta que seu modelo foi substituido, descarta o desenho e retorna false, deixando o card existente em Carregando arte. Isso e compativel com F5 alterar o resultado ao mudar a ordem das cargas.

O teste de navegador executou o carregador real do ERP e o coordenador/renderizador real da previa, com transporte/PDF controlados: iniciou o desenho, terminou a atualizacao da lista durante a espera de fonte e soltou a fonte. Antes da correcao, falhou em `lista tardia nao abandona a previa aberta`; depois, confirmou resultado true, pixels desenhados e estado pronto sem F5. Os testes anteriores cobriam fila e descarte de trabalho obsoleto, mas nao essa substituicao feita pelo carregamento da lista.

Um segundo teste reproduziu a variante de erro: a restauracao do estado anterior da lista descartava modelos carregados enquanto a consulta estava em andamento (`undefined` em lugar do modelo completo).

## Correcao localizada

Somente `frontend/script.js` recebe mudanca de comportamento:

- A atualizacao da lista preserva as referencias dos modelos de artes abertos, em abertura ou com leitura de modelos em andamento. Os demais pedidos continuam recebendo o resumo atualizado.
- A abertura possui um marcador temporario desde a resolucao do pedido ate a ativacao da tela, inclusive durante a espera de numeracoes. O marcador e limpo em finally, sem apagar a marca de uma abertura mais recente.
- Se a lista falhar, a restauracao preserva os modelos do pedido em uso que chegaram durante a consulta.

Nao se removeu a protecao contra desenho obsoleto. Reabrir um pedido continua relendo seus modelos; fechar libera sua atualizacao normal pela lista. Sem alteracao de queries, dados reais, regras de negocio, resolucao, PDF final ou rasterizacao.

## Validacao e limites

- Regressao em Chromium: 35 verificacoes de recuperacao/composicao; inclui pixels, estado pronto, lista tardia, abertura em andamento, leitura em andamento e atualizacao normal depois de fechar.
- Navegacao: 22 cenarios no Chromium; inclui carregador real da lista durante a espera das numeracoes antes de exibir as artes, F5, historico, cancelamento por navegacao e permissoes.
- Carga da lista: timeout, falha tardia, restauracao, retry, complementos, dados e posicao preservados. O fixture do hook passou a fornecer seu contexto de rolagem introduzido na v976; as assercoes anteriores permanecem, com nova verificacao da posicao.
- Atualizacao automatica: 60 segundos, aba oculta, pausa fora da lista, concorrencia e recuperacao.
- Selecao pytest: fila, recuperacao, desempenho e sintaxe completa do frontend (81 casos).

Transporte e dados sao sinteticos; nao houve captura autenticada do pedido do relato nem medicao de sua latencia real. A causa reproduzida explica um travamento permanente, mas nao prova que toda espera de rede da estacao tenha a mesma origem. A falha antiga do harness adicional de seguranca documentada na v976 permanece fora desta mudanca; nao se afirma aprovacao da suite inteira.

## Publicacao e recuperacao

Executar o publicador seguro no escopo Frontend, com simulacao e testes pertinentes. Candidata v979, sujeita a recalculo se a base remota avancar. Confirmar o commit no Cloudflare e hashes normalizados de HTML/JS nos dois dominios operacionais; nao repetir deploy apenas por propagacao inicial.

Conservar log e provas finais em `C:\ProjectBackups\artes-lista-concorrente-20260929`. Este documento prepara a entrega; a publicacao depende da confirmacao nesses registros. Recuperacao por novo commit revertendo somente esta correcao e nova versao de cache, preservando v977/v978 e avancos posteriores. Nenhum instalador, SQL ou dado comercial integra esta entrega.
