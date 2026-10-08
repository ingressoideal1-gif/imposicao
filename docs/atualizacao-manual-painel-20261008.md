# Atualização manual no painel

Os menus dos painéis principal e de produção passam a mostrar Verificar atualização e Atualizar agora. A consulta informa a versão disponível sem iniciar instalação. A instalação usa o endpoint existente da própria estação e não espera o intervalo automático de seis horas.

As permissões administrativas existentes continuam obrigatórias. O painel informa sessão ausente, permissão insuficiente, estação não liberada, Piloto legado, produção ocupada e falha de comunicação. Uma resposta de erro nunca é apresentada como atualização iniciada. Cliques repetidos são bloqueados enquanto a solicitação está em andamento.

O aceite do endpoint confirma apenas a solicitação; download, instalação e reinício continuam sob responsabilidade do agente. Em HTTP 409, aguardar o trabalho terminar e clicar novamente. Não foi acrescentado agendamento de instalação.

Arquivos: frontend/index.html, frontend/producao.html e frontend/script.js. Sem alteração no backend, permissões, manifesto ou intervalo automático. O navegador da estação precisa receber estes arquivos; a edição local não atualiza uma estação já instalada.

Validação: tests/atualizacao_manual_painel_harness.js usa Chromium, o trecho real do menu de ambos os HTMLs e a função real do painel, com APIs simuladas. Cobre 44 cenários nas portas 9000 e 9001, incluindo consulta sem POST, atualização, liberação, legado, HTTP 401/403/409/500, rede e cliques concorrentes. Não instala nem reinicia agentes reais.

Conferência final: 526 testes Python aprovados, 2 subtestes aprovados e 2 pulados por canal (produção, Piloto e oficial), além dos harnesses obrigatórios. O novo teste pytest de atualização manual também passou. Sintaxe JavaScript e git diff --check aprovados. Alteração preparada em worktree isolada; publicação e instalação ainda não executadas.

## Entrega autorizada

Versão web v1039 e pacote oficial 1.2.374. Escopo funcional restrito ao painel; as alterações de empacotamento são somente de versão. Cache recusado por metadados de ambiente inválidos (Name ausente); usar compilação integral auditada. A verificação de entrega-segura passou. As três baterias de canal e os 44 cenários de navegador já foram executados nesta fonte. A publicação terá conferência de hash público antes de ativar o manifesto. Preservar a instalação experimental do Junior.
