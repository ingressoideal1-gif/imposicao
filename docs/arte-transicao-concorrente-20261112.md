# Arte pronta e concorrencia entre telas

Implementacao local sobre `b633a102` (`origin/main`), na branch
`fix/arte-transicao-concorrente-20261112`. Entrega segura autorizada em 12/11/2026.
O checkout operacional foi preservado. Nenhum status do pedido 25084 foi corrigido.

## Comportamento

- Carregar/atualizar a lista nao promove nem reconcilia status a partir do cache.
  Permanecem as leituras e os fluxos existentes de cadastro antecipado de links
  e produtos de prateleira; nao sao novas decisoes de alteracao do designer.
- O clique PRONTO prepara a amostra, identifica o modelo persistido e envia uma
  transicao ao banco. Modelo, consolidacao do pedido e etapa do link sao confirmados
  na mesma transacao. Se faltar um link ativo unico ou qualquer escrita falhar,
  a transacao inteira e desfeita. A preparacao de arquivos/amostras ocorre antes
  da transacao e nao equivale a concluir a arte.
- O servidor calcula a partir dos modelos atuais. A revisao usa IDs e `xmin`
  das linhas do pedido, incluindo links, proposta e OS propria. Alteracoes,
  insercoes, exclusoes e mudancas que voltaram ao valor anterior invalidam a revisao.
- Escritas das tabelas participantes usam exclusao por pedido. A RPC compara a
  revisao depois de adquirir a trava, em READ COMMITTED. Conflito exige reabrir e
  conferir; nao ha repeticao automatica nem fallback para PATCH sem confirmacao.
- Uma aba antiga que tenta gravar `Em Alteracao` sem nova `reprovacao_acao` e sem
  modelo atualmente reprovado recebe conflito. O botao explicito de alteracao
  continua funcionando com sua identidade de acao. Integracoes que solicitam
  alteracao apenas no status geral precisam enviar uma nova identidade de acao;
  sem ela nao e possivel distinguir uma nova solicitacao de uma gravacao antiga.
- Corrigir Arte da producao continua devolvendo o modelo como APROVADA/Aguardando,
  sem reiniciar o link do cliente. A OS propria, quando vinculada pelo link, acompanha
  a conclusao na mesma transacao. Cancelados, impressos e aprovados continuam protegidos.

## Arquivos e implantacao

Banco integrado pelo PR #285, merge `f4aee5c6`, com todos os checks obrigatorios
aprovados. Migracao aplicada em 12/11/2026 no Supabase de producao
`vwbtitjlpelrcnsytzqw`, antes do frontend. Conferencia posterior confirmou tres
funcoes, cinco gatilhos ativos, RPCs permitidas para authenticated e recusadas para
anon. A leitura de revisao com ROLE authenticated funcionou. Os hashes dos corpos
das funcoes correspondem ao SQL local. O pedido 25084 permaneceu com status geral
Em Alteracao, modelo AGUARDANDO_CLIENTE e link Enviar Arte; nao houve correcao
operacional do pedido. Evidencia local em
`%TEMP%/ideal-arte-entrega-20261112/verify.json`.

`frontend/script.js`: adaptador RPC, PRONTO individual/lote, retorno ao atendimento,
preparo do link e remocao de gravacoes automaticas de status na carga.

`sql/arte_transicao_concorrente.sql`: tres funcoes e cinco gatilhos, nas tabelas
`pedidos_modelos`, `pedidos_artes`, `pedidos_links_cliente`, `propostas` e
`producao_ordens_servico`. A migracao nao executa UPDATE em pedidos existentes.
As RPCs sao SECURITY INVOKER, executaveis por authenticated; nao ampliam grants de
tabelas nem contornam RLS. A funcao de gatilho e SECURITY DEFINER, com search_path
restrito, para serializar e validar tambem as escritas legadas.

A entrega separa banco e frontend em PRs. A migracao precedeu o frontend;
permissoes, RLS, colunas e gatilhos existentes foram conferidos em leitura.
Atualizar os paineis das estacoes pelo fluxo protegido. Abas antigas devem ser recarregadas: a protecao
no banco impede o retorno obsoleto, mas nao transforma seus avisos antigos em recibos.
O pacote local do Piloto foi compilado e auditado sem arquivos privados.
Nao foi distribuido MSI nem comprovada adocao por estacao.

As travas duram ate o fim da transacao e abrangem somente o pedido envolvido.
Integracoes que ja seguram locks em outra ordem podem receber deadlock; o PostgreSQL
aborta uma transacao e a interface nao repete a decisao automaticamente. Validar esse
comportamento com os consumidores reais antes de ativar em producao. Os testes usam
gatilhos sinteticos representativos, nao uma restauracao integral do banco real.

Recuperacao: retirar primeiro o frontend dependente e executar, somente com
autorizacao, `sql/arte_transicao_concorrente_rollback.sql`. Ele remove apenas os
objetos novos, sem restaurar status antigos de pedidos. Nao usar rollback para
desfazer trabalho legitimo concluido depois da implantacao.

## Validacao

- PostgreSQL 17.11 descartavel, somente loopback: 21 cenarios aprovados, incluindo
  duas conexoes simultaneas, revisao apos espera, ABA, insercao concorrente, PATCH
  antigo, nova alteracao explicita, RLS, falha atomica, links duplicados, producao,
  OS propria, dados de entrega e rollback.
- Chromium com duas abas e RPC simulada: conflito sem sucesso local, atualizar a
  aba antiga sem gravar, preservacao do carimbo do servidor e recusa de recibo vazio.
- Pytest focado: 15 testes aprovados. Harnesses adicionais: retorno producao/status
  (22), geracao/copia de link (22), acoes em lote (84), correcao do cliente (45),
  bloqueios (131), persistencia de Corrigir Arte (53) e dashboard de reprovacoes.
- `ferramentas/conferir_duas_versoes.py`: producao e Piloto passaram, cada canal com
  911 testes, 2 skips e 2 subtests, alem dos harnesses obrigatorios. O canal Oficial
  tambem passou na mesma bateria. Relatorio local
  em `%TEMP%/ideal-arte-entrega-20261112/arte-transicao-canais.json`. O aviso de depreciacao FastAPI/httpx e anterior.
- `node --check frontend/script.js` e `git diff --check` aprovados.

Falhas fora do escopo: a base limpa `b633a102` tambem falha nos dois harnesses da
Lista de Arte por falta de `window` no mock (e uma expectativa antiga de releitura)
e no harness de desempenho. O mock deste ultimo nao implementava `order().range()`;
foi atualizado para reproduzir a consulta paginada existente e passou, inclusive
os quatro lotes de 650 modelos e 22 verificacoes no navegador. A funcao de
carregamento nao foi alterada. As falhas dos dois harnesses antigos da Lista de Arte
continuam documentadas, sem ocultacao. O teste
de sessao foi atualizado para aceitar argumentos no carregador e exigir ausencia
de escrita na antiga sincronizacao automatica.

Comandos de retomada (na raiz desta worktree, com dependencias ja existentes):

```powershell
$env:NODE_PATH='C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\node_modules'
node tests/arte_transicao_browser_harness.js
python -E -s tests/arte_transicao_postgres.py C:\ProjetosLocais\ideal-imposition\rascunhos\postgresql-17.11-20261003\extraido\pgsql\bin\psql.exe
```
