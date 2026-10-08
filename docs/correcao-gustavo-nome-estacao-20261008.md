# Conferencia do Piloto na Gustavo — 08/10/2026

Causa reproduzida: socket.gethostname() retorna Gustavo-Prod, enquanto o cadastro
autorizado usa GUSTAVO-PROD. Consulta exata e comparacoes sensiveis a caixa em
piloto_estacao.ts recusavam a mesma estacao. Antes: grafia do Windows HTTP403,
cadastro maiusculo HTTP200. O diagnostico externo anterior usava nome fixo
maiusculo e, portanto, nao reproduzia essa diferenca.

Correcao generica: consulta ilike sem curingas, underscore escapado, comparacao
sem distinguir caixa no vinculo da estacao/responsavel e na identidade legada.
Continuam obrigatorios cadastro unico ativo, autorizacao de instalacao, empresa
e permissoes do responsavel. Cadastros ambiguos continuam recusados.

Validacao: regressao antes da correcao falhou; sete testes direcionados e suite
completa de 341 testes Deno passaram. Sem instalacao de dependencias; cache Deno
existente usado com --node-modules-dir=none --cached-only. Nenhum SQL aplicado.

Entrega: apenas Edge Function piloto-local, versao 3 para 4, verify_jwt=false
preservado (autenticacao propria obrigatoria). Publicada e verificada as 13h34 BRT.
Consultas reais somente leitura: Gustavo-Prod, GUSTAVO-PROD, gustavo-prod e
LASER-01 HTTP200; ESTACAO-NAO-AUTORIZADA HTTP403. Sem novo MSI, alteracao de
manifestos, reinicio de agente, spool ou impressao.

Backup cifrado da funcao anterior com recuperacao conferida:
dist/edge-antes.dpapi.json, finalidade rollback-edge-piloto-case, mesma conta
Windows. Metadados anteriores e validacao publicada tambem em dist/.
Fonte baseada em origin/main 3b49b54e, worktree
C:/ProjetosLocais/ideal-imposition-piloto-estacao-case-20261008.
Para rollback da alteracao, republicar a fonte anterior de piloto_estacao.ts com
as demais dependencias preservadas; verificar novamente acessos permitidos e
recusados. Nao modificar cadastros para contornar a verificacao.

Pendente: operador reabrir pedido na Gustavo e confirmar conferencia/preparo.
HTTP200 no catalogo nao comprova geracao final nem impressao fisica.
