# Montagem reconhece o agente Piloto — 1.2.398

Relato confirmado por foto na TEX: ao gerar o PDF, Nenhuma estacao respondeu.
A detecao em montagem.js sondava somente 8080 e 9000, sem a porta 9001.
O agente do Junior respondeu /api/status em 9001 durante a investigacao;
nao houve acesso direto ao processo ou navegador da TEX.

Correcao identica nos canais padrao e teste: painel local usa exclusivamente
sua propria origem nas portas permitidas; painel online procura 9001 antes
das portas antigas. Exige resposta com versao e recusa agente de nuvem.
Nao redireciona um painel local a outra instancia quando a sua nao responde.
Geração de PDF e escolha/listagem de pasta usam essa mesma detecao.

Validacao: seis cenarios de deteccao em montagem_estacao_harness.cjs e 3569
verificacoes do nucleo da Montagem passaram. Sintaxe JavaScript conferida.
O harness antigo de tela nao simula confirmarIntegridadeDoTrabalho e falha
nessa dependencia; uma copia diagnostica temporaria com dependencia simulada
passou nas 249 verificacoes. Isso nao comprova geracao real na TEX.

Nenhuma fila foi alterada nem trabalho enviado a impressoras nesta correcao.
As capas de camarote de 1.2.397 permanecem incluidas. Validacao na TEX apos
atualizar e reabrir o painel continua pendente.

Canal padrao: bateria completa em producao, piloto e oficial com 543
aprovados e 2 pulados por perfil; 16 harnesses por perfil sem falha.
MSI 194981888 bytes, SHA-256
f62165343110a2b0b1e70ced61f71eef72ca41b9c0e2ec48ec3a082cd2eac64f.
Auditoria de ProductVersion, bytecode do motor, DLLs e montagem.js embutido
aprovada. Instalacao nas estacoes nao realizada nesta tarefa.
