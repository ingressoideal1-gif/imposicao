# IdGen — janela compartilhada da Lista de Arte

> Estado de implantação posterior: [entrega segura](idgen-entrega-segura-2026-10-23.md).
> Este documento registra a conclusão local anterior à autorização de publicação.

Entrega local de 23/10/2026, na branch `feat/idgen-menu-editor-20261022`,
worktree `imposition-idgen-menu-20261022`, base `cd9275c8`.
Não houve commit, publicação, SQL remoto ou alteração dos dados existentes.

## Funcionamento

O menu IdGen seleciona um cliente ERP e cria um pedido independente. Abrir esse
pedido carrega a própria `view-amostras`, usando `renderAmostrasOSItens` e os
editores existentes de cor e numeração. Não é uma reprodução visual do editor.
A navegação ocorre na mesma aba, com uma página nova marcada por `?idgen=<UUID>`;
o pedido não é inserido em `state.ordens` e callbacks antigos não são reaproveitados.

`frontend/idgen-editor.js` adapta carregamento, atributos, briefing, anexos,
bancos, artes e importação multipágina ao documento próprio. Formato, cor e
numeração são cópias completas com novos identificadores. Clientes e catálogos
originais são consultados somente para leitura. Os pontos adicionados em
`frontend/script.js` mantêm o caminho original quando o contexto IdGen está ausente.

Os salvamentos passam por `idgen-interno` e pela tabela privada
`idgen_app.pedidos_editor`. A sessão do operador é validada no servidor; a
permissão visual do menu não concede acesso. O login interno exige sessão
Supabase válida, separada da autenticação Better Auth/D1 do portal do cliente.
Fila de salvamentos, revisão otimista e conferência do documento retornado
evitam confirmação falsa ou sobrescrita silenciosa. Falhas restauram o último
estado confirmado. Importação de PDF salva todas as páginas em uma operação.

## Isolamento e limites

`frontend/idgen-contexto.js`, carregado antes das bibliotecas, bloqueia escritas
REST/Storage legadas, chamadas ao motor local, outras Edge Functions, WebSocket,
beacon e envio de formulário nesse contexto. Caches do editor são separados;
a sessão de autenticação é preservada. Na navegação normal, o módulo é inerte.
Isso protege contra chamadas acidentais do editor reutilizado; não constitui
correção das permissões legadas do banco nem isolamento contra código malicioso.

Artes e anexos ficam como dados privados no documento IdGen, sem upload nos
buckets legados. Limites atuais: **5 MiB por arquivo e 16 MiB por documento**,
sujeito também ao limite do corpo JSON da requisição. A codificação dos arquivos
aumenta o tamanho. Snapshots automáticos não são publicados no armazenamento
legado. Para lotes com muitos arquivos grandes será necessário evoluir o
armazenamento privado; esse limite não permite prometer centenas de fotos grandes.

E-mail, links, faturamento, retorno ao Atendimento, aprovação e impressão legados
ficam indisponíveis no contexto IdGen. Liberação ao portal, aprovação do lote
inteiro e encaminhamento ao NewProd ainda são etapas separadas.

## Validação

- 12 testes Node aprovados: contexto normal, bloqueios, caches, sessão,
  autorização, limites, revisões, clonagem e falhas de persistência.
- Chromium com a página completa e dados sintéticos: inclusão de modelo,
  atributos, editores originais de numeração/cor, briefing, upload privado de
  arte/anexo, PDF multipágina, prévia renderizada, reabertura e conflito de revisão.
  Escritas legadas foram recusadas; catálogos de origem permaneceram intactos.
  Evidência temporária: `%TEMP%/idgen-editor-browser-Wo5kXy`.
- PostgreSQL temporário local: migração, ACL, papéis, cliente, idempotência,
  revisão e preservação das tabelas de referência aprovados. Cluster encerrado.
  Evidência: `%TEMP%/idgen-editor-test-rn23iuk2`.
- Regressões aprovadas: `salvamento_modelo_seguro`, `escala_da_arte` (49),
  `numeracao_homonima` (48), `verso_tipo_canonico` e `cor_numeracao_formato`.
- Sintaxe JavaScript e `git diff --check` aprovados. Nenhuma dependência instalada.

Três harnesses legados têm falhas também reproduzidas com o `script.js` intacto
de HEAD: `lista_arte` (releitura de numerações e `window` ausente),
`navegacao_seguranca` (`preencherFaixaDoModelo` ausente) e a fase de navegador
de `amostras_carga_recuperacao` (recuperação automática). A primeira fase deste
último passou no código atual. Esses testes não foram alterados para esconder
falhas. Não foi executada a suíte completa nem comprovada operação em produção.
O handler foi testado com Node 24; isso não comprova execução remota em Deno.

## Implantação pendente

A nova tabela/RPC e `idgen-interno` ainda não foram implantados. O portal já
publicado não lê automaticamente esses pedidos. Antes da publicação, revisar
o schema atual e o escopo empresarial no E-Deal `vwbtitjlpelrcnsytzqw`, apresentar
os objetos novos e a validação posterior e aplicar somente a migração específica.
Não executar o diretório SQL em lote. Integrar sobre a versão atual do frontend,
com revisão das alterações concorrentes e versionamento de cache.

Rollback preferido: desabilitar a entrada/endpoint, preservando documentos
IdGen. O checkout operacional e os demais projetos não foram modificados.
