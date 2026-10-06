# Padronização de verso_tipo — implementação local

Implementação na branch `fix/verso-tipo-canonico-20261006`, worktree
`C:\ProjetosLocais\ideal-imposition-verso-tipo-20261006`, baseada em
`origin/main` no commit `0375ff72`. O checkout operacional foi preservado.
Não houve commit, publicação, instalação ou SQL remoto nesta tarefa.

## Contrato

| producao_numeracoes.print_mode | pedidos_modelos.verso_tipo | frente_verso |
|---|---|---|
| front | SÓ FRENTE | false |
| duplex | FRENTE E VERSO | true |
| pdf_duplicate_back | FRENTE E VERSO | true |
| duplex_unico | VERSO FIXO | true |
| pdf_odd_even | VERSO VARIÁVEL | true |

`print_mode` explícito prevalece sobre nome da numeração, elementos antigos e
texto legado do modelo. O resumo não permite reconstruir `pdf_duplicate_back`
a partir de `FRENTE E VERSO`. Prévia, paginação e PDF continuam distinguindo os
modos técnicos. O seletor de imposição continua representando PDF ímpar/par
como `duplex`, enquanto a validação PDF lê o modo original da numeração.

Sem numeração resolvida ou com modo desconhecido, não gravar uma suposição.
Desvincular preserva o resumo persistido. A leitura aceita Frente, SO FRENTE,
SÓ FRENTE, FxVerso, FRENTE E VERSO, VERSO COMUM, VERSO FIXO e as duas grafias
de VERSO VARIÁVEL. Sem numeração, os rótulos antigos de verso continuam sendo
interpretados genericamente como duplex; não se infere paginação PDF deles.

## Alterações

- `frontend/cor-numeracao-do-modelo.js`: conversão, compatibilidade e payload canônico.
- `script.js` e `pedido.js`: seleção, salvamento e leitura das faces; confirmação
  das gravações de vínculo/verso por modelo e pedido. A fila da aba Imposição
  também informa o modo da numeração, sem uma escolha de resumo conflitante.
- `cliente.js`: mesma precedência e compatibilidade no portal.
- `producao-por-cor.js`: reconhecimento do legado VERSO FIXO.
- HTMLs de painel, Produção e portal: módulo compartilhado antes dos consumidores
  e versões dos assets alterados atualizadas.
- Não foram alterados motor Python, quantidades, faixas, blocagem ou artes originais.

A rota legada `/api/os_itens` escreve `producao_os_itens` e ignora verso; não
pode servir como confirmação da gravação em `pedidos_modelos`. Para vínculo e
verso, ausência do cliente Supabase agora resulta em erro visível, antes da
requisição. Isso não implica que estações sem login Supabase sejam bloqueadas:
o cliente público existente continua funcionando com as permissões do ambiente.

## Sincronização no banco — preparada, não aplicada

Arquivos `sql/verso_tipo_canonico_20261006.{verificar,up,down}.sql`.
Não há conversão em massa do histórico nem alteração de constraints/políticas.

O gatilho do modelo é SECURITY INVOKER: ao inserir ou escrever vínculo/verso,
consulta a numeração com a visibilidade de quem fez a operação. O gatilho da
numeração é SECURITY DEFINER restrito: após uma alteração autorizada de
`print_mode`, atualiza somente `verso_tipo` e `frente_verso` dos modelos ligados
ao ID alterado, na mesma transação. Uma falha reverte também a alteração do modo.
Funções de gatilho têm EXECUTE revogado de PUBLIC, anon, authenticated e
service_role. Apenas o conversor puro de texto é executável pelos papéis da API.
Todos usam search_path fixo; nenhuma função recebe IDs externos para escrever.

O SQL usa funções versionadas com CREATE, sem substituir funções existentes.
Não é um script para reaplicar indiscriminadamente. Um lock transacional por ID coordena os dois gatilhos sem exigir permissão
de UPDATE no catálogo para quem apenas vincula numerações; deadlocks/timeouts abortam a
transação. Concorrência entre sessões não foi simulada no PGlite.

Ativação futura:

1. Revisar constraints, tipos, gatilhos, proprietários e ACLs reais usando a
   consulta preparada. Conferir integrações e consumidores de estações antigas.
2. Publicar a compatibilidade e verificar os assets do site e portal; atualizar
   e conferir os painéis locais de NewProd e Piloto antes do SQL.
3. Obter/apresentar a prévia e backup recuperável autorizados dos registros
   envolvidos antes de qualquer escrita compartilhada. Instalar o SQL sob papel
   administrativo revisado. A instalação não atualiza modelos existentes.
4. Verificar funções/gatilhos com o script de leitura. A sincronização global
   após editar uma numeração depende dessa etapa; o frontend sozinho só garante
   os modelos que grava pelos caminhos atualizados.

Rollback: retirar primeiro os novos gatilhos/funções pelo `.down.sql` e manter a
compatibilidade dos leitores. Esse rollback não restaura valores já gravados;
restauração de dados exige backup e filtro revisado. Não fazer downgrade para
leitores antigos enquanto houver rótulos que eles não interpretam corretamente.

## Validação local

- Sintaxe: 93 arquivos JS próprios do frontend passaram em `node --check`.
- `verso_tipo_canonico_harness.js`: cinco modos, legados, payloads reais,
  confirmação, falha de persistência, ausência, desvinculação e HTMLs.
- `verso_tipo_canonico_postgres.cjs`: SQL executado em PostgreSQL/PGlite em
  memória, com dados sintéticos, sem rede. Cinco modos, múltiplos modelos,
  cliente antigo, ausência de backfill, modo desconhecido, isolamento RLS,
  bloqueio de chamada direta de gatilho, reversão atômica em falha e down.
- Regressões passaram: cliente_verso_atual, modo_pdf_confirmacao,
  salvamento_modelo_seguro, editor_persistencia_segura, quantidade_erp,
  numeracao_nao_volta_atras, fxversounico, pedido_faces_impressao,
  impressao_combinada, montagem, fila_do_pedido e cor_numeracao_formato.
- `producao_por_cor_fluxo_harness.js` falha na linha 354: acesso a `.name` em
  arquivo nulo no cenário da janela real. A mesma falha foi reproduzida usando
  os arquivos frontend de HEAD/0375ff72, sem as alterações desta tarefa.
  Não foi corrigida por estar fora do escopo.

PGlite existente foi reutilizado em
`C:\ProjectBackups\tempo-etapas-testes-20260930\node_modules\@electric-sql\pglite`.
Puppeteer/PDF-lib existentes foram resolvidos por NODE_PATH do checkout
operacional. Nenhuma dependência foi instalada. O venv citado no AGENTS.md não
existe neste computador; a checagem de sintaxe equivalente foi feita com Node.

Os testes não comprovam publicação, schema real, instalação nas estações ou
impressão física. A preparação local está separada da ativação em produção.

## Preparação de publicação

A entrega web usa a branch `entrega/verso-tipo-20261006` no worktree
`C:\ProjetosLocais\ideal-imposition-verso-publicar-20261006`. O módulo de verso
foi incorporado ao arquivo compartilhado já sincronizado pelas estações, após
o teste de cobertura do painel detectar que um arquivo novo exigiria atualizar
a lista embutida no agente. SQL e teste PGlite permanecem na preparação original,
fora desta entrega web.

A preparação da publicação reutilizou o venv existente do checkout legado por
junction local ignorada pelo Git, sem instalação de dependências. A conferência
obrigatória passou nos dois canais: 389 testes Python e 2 skips por canal, mais
os harnesses de navegador/PDF/TICKET/mapas. A compilação independente do Piloto
faz parte do publicador; gerar o pacote não equivale a instalá-lo.

