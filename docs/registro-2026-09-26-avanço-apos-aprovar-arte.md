# Avanço após aprovar as artes

## Atualização: confirmação visual solicitada pelo usuário

Após a aprovação persistida, o portal agora mostra o popup **Artes aprovadas** com
**Falta a aprovação dos dados de entrega** e o botão **Conferir entrega**.
Somente o clique nesse botão abre a aba; ele não grava aprovação dos dados.
Esse comportamento substitui o avanço direto descrito no diagnóstico abaixo.
Se a entrega já tiver decisão, encaminha à Nota; com ambas conferidas, oferece
revisão/finalização. Escape fecha o aviso e mantém os caminhos normais da página.

Implementado em `frontend/cliente.js`, com versão do arquivo atualizada em
`frontend/cliente.html`. O popup usa diálogo modal, foco no botão e textos
associados para leitor de tela. Testado no navegador em 390 e 1280 pixels,
com teclado, confirmação e Escape, aprovação individual e geral, chat travado
e recusa do banco. Sem escrita adicional ao confirmar o popup.
Permanece uma entrega local, ainda não publicada.

Relato: clientes aprovam todos os modelos e permanecem na aba Arte.
Correção local no worktree `ideal-imposition-portal-prioridades-20260926`.

## Causa reproduzida

Os caminhos da aprovação individual e de Aprovar artes e continuar aguardavam
`registrarChatCliente` antes de avançar. Se a requisição do chat não resolvesse,
o modelo podia estar aprovado no banco enquanto a interface aguardava indefinidamente.
O tratamento de erro anterior cobria uma resposta recusada, mas não essa ausência de resposta.

O teste de navegador com a espera antiga reposta apenas em memória falhou no
limite de cinco segundos aguardando Entrega. O mesmo teste passou com a correção.
Isso demonstra um mecanismo possível, sem comprovar que os relatos de produção
tenham necessariamente a mesma causa. Não houve consulta aos pedidos reais.

## Alteração

Em `frontend/cliente.js`, a aprovação mantém todas as confirmações de gravação
do modelo e do status consolidado. O chat é iniciado independentemente do avanço:
não precisa concluir para que o cliente siga à Entrega. A aprovação individual
da última arte mantém o aviso e a pausa de 1,2 segundo já existentes.

Pedidos de alteração conservam seu fluxo. A falha retornada pelo chat continua
mostrando o aviso persistente, sem pedir que o cliente aprove novamente. Requisição
ainda pendente não é tratada como entrega confirmada. Fechar a página pode
interromper o registro pendente; não foi adicionada fila ou repetição de mensagens.

## Validação

- Navegador móvel com HTML/shell reais e APIs sintéticas: aprovação individual e
  geral chegam à Entrega com chat sem resposta; aprovação recusada permanece na Arte.
  Também cobre troca de abas, Voltar, F5 e aviso de erro no chat.
- 32 cenários de carga/status/chat passaram. O harness aguarda um ciclo para
  verificar o resultado independente do chat, sem exigir que bloqueie a aprovação.
- 35 cenários de persistência e 146 verificações de abas passaram.
- Sintaxe de `frontend/cliente.js` e `git diff --check` passaram.

Os botões por modelo no teste de navegador são sintéticos, acionando os handlers
reais; a composição das artes não foi revalidada neste escopo.

Entrega somente local, somada às correções anteriores ainda não publicadas.
Sem migração, commit ou deploy. Publicação e verificação operacional permanecem
pendentes. A coleta de percurso e os demais achados de navegação continuam propostas.
