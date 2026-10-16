# Encerramento — Montagem e NewProd 1.3.12

Trabalho encerrado em 16/10/2026 por solicitação do usuário. Nenhum acompanhamento periódico foi agendado. Este registro consolida as evidências obtidas durante a entrega; não representa uma nova consulta às estações.

## Resultado

A Montagem recebeu a amostra dentro da célula, preenchendo toda a área interna. A identificação de impressão permanece dentro quando habilitada; pedido, modelo, posição e ações de duplicar/excluir ficam fora do papel, em faixas laterais alinhadas às células. A geometria física e as regras de geração permanecem preservadas.

Também foram entregues amostras na lista de modelos, confirmação de impressão dos modelos carregados e controles de Hot Folder. A versão web recebeu correções de resolução e carregamento dos formatos de modelos Aguardando. Na adaptação ao NewProd foram preservados os resolvers de snapshots, a carga completa de pedidos e as conferências locais próprias desse canal. O canal local mantém a disponibilidade do catálogo durante a carga e nas falhas de consulta, conforme sua implementação anterior; não confundir esse comportamento com a filtragem web.

## Publicação web e diagnóstico local

- Web v1068: PR #151, amostras, confirmação de impressão e Hot Folder.
- Web v1069: PR #152, carregamento dos formatos ao abrir Montagem.
- Web v1070: PR #153, amostras dentro da folha.
- Web v1071: PR #154, amostra integral e controles externos. Merge `7523c517c64807bd8ed15cfb779913368bdf4386`; tag `v1071`. Os 14 recursos verificados nos dois domínios conferiram após propagação.
- A captura posterior mostrava o painel local na porta 9001. A API confirmou NewProd 1.3.11, enquanto o HTML carregava Montagem v1065. A publicação web não havia atualizado o painel embutido do agente.
- A referência inicial à 1.3.10 veio de documentação anterior e foi corrigida antes de qualquer instalação. A base efetivamente usada foi `agente-v1.3.11`, commit `48e294fbfc506c8be97068eebf697d4e762bce90`.

## Instalação e distribuição

O NewProd 1.3.12 foi instalado nesta estação em `C:\Users\Junior\AppData\Local\NewProd Agent`. O MSI terminou com código 0. A API na porta 9001 confirmou a versão, o executável instalado conferiu com o build e os arquivos JS/CSS servidos conferiram com a fonte. O HTML instalado e seus imports foram verificados; a resposta HTTP inclui as intervenções dos middlewares locais.

Configurações, acessos protegidos e Hot Folders foram preservados. A comparação dos acessos usou o conteúdo recuperado em memória, sem expor valores. A fila Windows estava vazia, a coleta foi pausada durante a troca e sua configuração anterior foi restaurada para ativa. Backups cifrados foram testados por restauração antes da instalação.

Após autorização para todas as estações, o mesmo MSI foi publicado pelos nomes oficial e legado. Ambos os downloads completos conferiram por tamanho e SHA-256 antes da ativação. `newprod-piloto-oficial.json`, `latest.json` e `newprod-piloto-teste.json` foram relidos com cache-buster, todos na 1.3.12 e sem campo restritivo `estacoes`.

- MSI: `NewProdPiloto_Oficial_v1.3.12.msi`, 196.689.920 bytes.
- SHA-256 MSI: `76a5d376e694306a7fcbb5011c2045ffb21c003b902bd1697777d2a99684562d`.
- SHA-256 EXE: `1c87b449b51e3b9b4b73317b2bc25fb6c83c2da26d1e86691e5f62bc84399501`.
- Fonte funcional: `77102f1f`; tag `agente-v1.3.12` em `eebcf4ed`; confirmação documental da publicação em `7025215c`.
- Branch: `fix/newprod-1311-montagem-painel`. A fonte do agente foi publicada nessa branch e tag; não foi mesclada integralmente à main do frontend.

## Validações

- 1.055 testes Python aprovados, dois pulados e dois subtestes aprovados por perfil Produção, Piloto e Oficial, além dos harnesses previstos.
- Montagem: 267 verificações de navegador, 3.586 do núcleo e testes de integração local/estação aprovados.
- Dashboard: cálculo e navegador aprovados, preservando as alterações anteriores.
- Publicador: oito testes aprovados.
- Pacote: 375 arquivos do painel embutido conferidos com a fonte; auditoria de ausência de arquivos privados no EXE/MSI aprovada.
- Revisão de diff e whitespace aprovada. O encerramento é documental e não repete a suíte.

## Evidências, recuperação e retomada

Worktree final: `C:\Users\Junior\Projetos Ingresso ideal\imposicao-newprod-1311-montagem-painel`.

Evidências versionadas: [instalação](evidencias/newprod-1312-instalacao-montagem.json), [publicação universal](evidencias/newprod-1312-publicacao-universal.json) e [registro de entrega](registro-2026-10-16-newprod-1312-montagem.md). O campo `publicado_manifesto: false` da evidência de instalação registra a etapa anterior à publicação universal; a evidência posterior documenta a liberação.

Logs e pacote estão em `dist/` da worktree final. Recibo privado e executável anterior estão em `NewProd Agent/gestao/backups`, nomes `instalacao-montagem-1312.json` e `executavel-antes-montagem-1312.exe`. Os recibos apontam os backups cifrados verificados. Não incluir esses dados privados em Git. Não forçar downgrade MSI ou sobrescrever pacote público; recuperação distribuída requer uma versão superior com a fonte revisada.

O checkout operacional e alterações alheias foram preservados. Worktrees preliminares foram mantidos, incluindo `imposicao-newprod-montagem-painel-20261016`, que contém aplicação parcial com conflitos sobre a base descartada 1.3.10. Não usar essa preparação como fonte de release e não descartá-la automaticamente. Retomar pela worktree final, conferir status, tags, versão instalada e manifestos atuais antes de novas operações.

Pendências de comprovação: adoção da 1.3.12 pelas demais estações, abertura de pedidos reais após a instalação, geração real de PDF e impressão física. A liberação universal não comprova instalação em toda a frota; agentes ocupados ou desligados podem atualizar depois. Não houve marcação real de modelos como impressos como parte dos testes.
