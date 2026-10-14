# Produção: pendências dos setores selecionados

Com Laser, Têxtil, PVC ou Flexo selecionados, o pedido aparece somente quando
tem item de um desses setores em Aguardando ou Corrigir Arte. Um produto Laser
impresso não mantém o pedido no filtro Laser por haver Flexo aguardando.
Laser + PVC usa união: basta uma pendência de qualquer um dos dois setores.

Todos os setores (ou desmarcar o último botão) mantém a listagem anterior,
sujeita aos demais filtros. Selecionar os quatro setores individualmente
continua exigindo pendência. A seleção múltipla e sua indicação visual já
existiam; foram preservadas. A mudança não oculta linhas dentro do pedido,
não altera o painel de Acabamento e não grava status em banco.

Fonte web: commit 0767a586, PR #136, cache script.js v1053.
89 verificações do harness de setores, quatro testes Python, sintaxe JS e
diff aprovados. Bateria web: 823 testes, dois subtestes e 19 harnesses por
configuração, com duas exclusões por falta do pool QR real e um aviso existente
de Starlette/httpx. As 40 etapas passaram. Na primeira tentativa faltava o
vínculo local para node_modules; corrigido sem instalar dependências.
No pacote oficial, 44 testes dos filtros, painel e atualização passaram.

O painel local depende do NewProd 1.3.4, preparado na base oficial 1.3.3 para
preservar as correções já distribuídas. A branch histórica contém mudanças
que ainda não estão na main; não foi usada integralmente para publicar o site.
Somente a alteração dos filtros foi aplicada à base atual de origin/main.

Recuperação web: reverter apenas a mudança de filtro e publicar com novo cache.
Recuperação do agente: pacote de versão superior com o comportamento anterior;
não há downgrade automático. Os binários 1.3.3 e manifestos anteriores ficaram
preservados no worktree de empacotamento. Não houve instalação forçada,
reinicialização manual de estações nem envio de impressão.

## Pacote auditado

Fonte NewProd: ff695975, versão 1.3.4. MSI de 196677632 bytes, SHA-256
`e2e786a3401213918777b7a222b8c54ec505f04e02e69482ee12117bc2a02bf1`.
375 arquivos do painel conferidos, motor compilado idêntico à fonte e
auditoria sem arquivos privados. A cópia de transporte com prefixo histórico
Teste contém os mesmos bytes; não existe outro NewProd funcional.
Evidência: `evidencias/release-134-oficial-auditoria.json`.

Alvos de atualização: LASER-01, PC-JR-HOME, TEX-01, LASER-04,
LAPTOP-9BSK81S0, GUSTAVO-PROD e LASER-02. As cinco estações removidas foram
retiradas dos manifestos desta entrega conforme orientação do usuário.

## Publicação concluída

PR #136 integrado em `924711f952478b5b379e4a328bd7e09da94c545a`, tag v1053.
Todos os seis checks do PR passaram. Cloudflare confirmou sucesso no deploy
`fd0773ad-c1e2-447e-b648-4b36ddc9c486`. Os três arquivos afetados (index.html,
producao.html, script.js) conferem nos dois domínios, 6/6 hashes normalizados.
A primeira consulta recebeu o conteúdo anterior durante propagação; a segunda
passou sem repetir deploy. Evidência: `evidencias/filtros-v1053-publico.json`.

NewProd 1.3.4 publicado, tag agente-v1.3.4. Downloads oficial e de compatibilidade
conferidos integralmente antes da ativação; os três manifestos foram relidos
com a versão, hash e sete estações esperados. Evidência:
`evidencias/release-134-oficial-publicacao.json`.

Estado: PUBLICADA_E_VERIFICADA_SINCRONIA_PENDENTE. Checkouts operacionais com
trabalho preexistente foram preservados. A fonte do instalador segue na branch
histórica de empacotamento; a alteração web isolada está integrada à main.
Instalação efetiva do 1.3.4 e conferência do filtro com pedidos reais nas
estações continuam sendo verificações de campo, distintas da publicação.
