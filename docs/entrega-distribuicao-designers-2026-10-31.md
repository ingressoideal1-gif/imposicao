# Entrega web da distribuição de designers — 31/10/2026

Escopo confirmado pelo usuário: publicar web e deixar SQL preparado. Não instalar
SQL, ativar o rodízio ou alterar responsáveis em produção nesta entrega.

A integração parte de origin/main afd924e0 e preserva a carga segmentada da Lista
de Arte, os relógios persistidos de etapas e as melhorias posteriores. O módulo
está no script.js, entre os marcadores ARTE_DISTRIBUICAO: não acrescenta arquivo
à lista de sincronismo das estações nem modifica o agente.

Sem a RPC instalada, uma resposta explícita de função ausente mantém o fluxo
atual. Erros de rede não autorizam atribuição com uma fotografia antiga da fila.
Os SQL e provas sintéticas estão no PR #243, separado desta publicação web.

Validação específica: 40 verificações de painel/calendário/integração e navegador
com RPC simulada. A prova de SQL passou com 87 verificações em PGlite e com
concorrência em PostgreSQL 17.11 descartável. Agendador real não foi acionado.

O harness antigo tests/lista_arte_harness.js falha na base intacta afd924e0 e na
entrega com ReferenceError: window is not defined em bancoDeDadosIncompletoDoModelo.
Não foi desabilitado nem alterado. Essa falha é distinta dos checks obrigatórios
do fluxo protegido, que precisam passar para integrar a entrega.

A correção inicial de empacotamento foi validada por test_painel_estacao.py:
nenhum HTML passa a carregar um asset ausente da lista de sincronismo.

Publicação web não instala uma estação. Recuperação da web deve usar novo commit
restrito a esta mudança ou rollback autorizado do deployment; não reverter banco
ou sobrescrever a pasta operacional suja. A instalação dos SQL permanece uma
etapa posterior, com prévia e autorização própria.
