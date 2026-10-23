# IdGen no menu do Imposition — preparação local

> Registro histórico da primeira etapa. A integração da janela foi concluída
> localmente em 23/10: veja [estado atual e validações](idgen-editor-integrado-2026-10-23.md).
> As pendências de edição abaixo descrevem o estado anterior, não o atual.

## Contrato confirmado

- Menu IdGen no Imposition, seleção de cliente existente no ERP.
- Pedido próprio do IdGen, independente de propostas e modelos do ERP.
- Ao abrir, usar **a mesma janela da Lista de Arte**, não uma imitação com menos campos.
- Formato, cor, numeração e demais atributos devem ser editáveis com salvamento próprio.
- Nenhuma escrita em pedidos/modelos/catálogos legados pelo fluxo IdGen.

## Local de trabalho

Worktree `imposition-idgen-menu-20261022`, branch
`feat/idgen-menu-editor-20261022`, base `cd9275c8` (origin/main local).
O checkout operacional e os arquivos anteriores de `pvc-maker-acesso-20261022`
foram preservados. Não houve commit, publicação, migração remota ou alteração de produção.

## Implementado e testado nesta preparação

- Entrada e seção IdGen em `frontend/index.html`; três pontos localizados de
  navegação/permissão em `script.js`, usando a permissão visual da Lista de Arte.
- `frontend/idgen.js`: busca de cliente, seleção, criação idempotente e lista de
  pedidos via endpoint próprio. Sem alteração de cliente ERP.
- `frontend/idgen-pedidos.mjs`: documento separado, cópias completas de formato,
  cor e numeração, edição de modelo, fila de salvamentos e confirmação do conteúdo.
- `supabase/functions/idgen-interno/`: validação real de sessão Auth e RPC com
  identidade obtida no servidor; não aceita identidade declarada pelo navegador.
- `sql/idgen_pedidos_editor.sql`: nova tabela privada `idgen_app.pedidos_editor`
  e RPC de serviço. Papel administrativo/atendimento/designer conferido a cada
  operação. Revisão otimista evita sobrescrita entre abas. A consulta ERP é
  exclusivamente leitura de `clientes(id_cliente,nome,fantasia)`.

Esta é a autenticação do operador interno do Imposition. A autenticação dos
clientes do portal continua sendo Better Auth/D1; ela não foi substituída.

## Ainda não implementado — não publicar este pacote

**A abertura na janela compartilhada e o salvamento completo por essa janela
ainda não estão integrados.** O botão Abrir recusa explicitamente quando o
adaptador `IdGenEditor.abrir` não está disponível. Não chama o carregador legado
com um identificador IdGen e não simula sucesso.

O módulo de documentos é testado isoladamente e ainda não está conectado à UI de
edição. Não há formulário funcional de inclusão de modelos na página nova nesta
etapa. Não há atribuição/liberação desses novos pedidos ao portal de clientes.

O editor legado possui escritas adicionais além de `saveAmostraToDB`:

| Caminho | Tratamento necessário antes de habilitar |
|---|---|
| `navigateToAmostrasFromOS`, `loadOSItens`, `findOSInState` | Origem própria sem introduzir IdGen em `state.ordens` |
| `saveAmostraToDB`, `autoSaveOSItemField` | Persistir documento e confirmar revisão; não escrever `pedidos_modelos`/`produtos_proposta` |
| `saveNumeracao`, `salvarCamposDaNumeracao`, `apiSemConfirmacao` | Editar exclusivamente cópias próprias, inclusive CSV, fundos e elementos |
| `onItemArteUpload`, snapshots, `uploadToStorage` | Armazenamento próprio e privado; não usar automaticamente os buckets públicos existentes |
| Briefing, anexos, bancos do pedido, histórico | Fontes próprias; não consultar/escrever usando número ERP |
| Aprovação, retorno ao atendimento, e-mail/link | Fluxo IdGen de lote; não disparar transições dos pedidos ERP |
| Navegação entre pedidos e editor de numeração | Restaurar estado e impedir gravações atrasadas de contexto anterior |

Após essa integração, testar a janela real no navegador com rede interceptada e
recusar qualquer escrita legada; testar o fluxo ERP original como regressão.

## Evidência local

- `node --test tests/idgen_pedidos.test.mjs`: 4 testes aprovados.
- `node --test tests/idgen_interno.test.mjs`: 4 testes aprovados (sessão, origem,
  autorização, erros, limite de corpo, preflight). Node emitiu aviso sobre detectar
  módulo TypeScript; nenhum package/lockfile foi alterado para suprimir o aviso.
- `tests/idgen_editor_postgres.py`: cluster novo PostgreSQL temporário em loopback,
  dados sintéticos. Migração, ACL, papel, cliente, idempotência, confirmação,
  conflito de revisão e preservação das tabelas legadas passaram. Cluster parado
  em `finally`; evidência em `%TEMP%/idgen-editor-test-70jc8uui`.
- `node --check frontend/idgen.js`, `node --check frontend/script.js` e
  `git diff --check` passaram.
- `node tests/idgen_menu_browser.mjs`: busca, seleção, criação, lista, texto
  seguro e recusa da abertura sem adaptador passaram em Chromium, com toda a
  rede simulada. Evidência em `%TEMP%/idgen-menu-browser-wgEwez`.
  A primeira execução falhou por usar `about:blank` sem contexto seguro para
  `crypto.randomUUID`; o harness passou a servir uma origem HTTPS interceptada
  inteiramente em memória e a repetição passou. Não foi falha em produção.
- Deno não estava no PATH verificado. Os testes do handler foram executados pelo
  Node 24 com suporte TypeScript; não equivalem ao deploy/runtime remoto da Edge.

## Implantação futura

Não executar automaticamente. Conferir metadados atuais das duas tabelas lidas
e inventário de usuários/escopo empresarial antes de aplicar. A migração nova
cria somente objetos IdGen; expectativa inicial zero pedidos. Apresentar alvo
E-Deal `vwbtitjlpelrcnsytzqw`, objetos novos, transação e verificação antes da
execução. Nenhum SQL antigo do diretório deve ser aplicado em lote.

Rollback preferido: retirar o menu/endpoint e preservar a tabela privada, sem
excluir pedidos. O backend IdGen anteriormente publicado não lê essa nova tabela;
a integração de liberação para clientes exige adaptação explícita posterior.
