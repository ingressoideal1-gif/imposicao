# Correção dos conflitos IdGen — 26/10/2026

## Causa e escopo

O evento PostgreSQL fornecido identifica `public.idgen_editor_operar` lançando
`40001`. A consulta de definições em produção confirmou seis funções IdGen com
esse código. O Supabase documenta que conflitos de negócio sinalizados assim
podem causar repetição interna no PostgREST, mesmo sem cliente reenviando:
https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions

O parceiro encerrou o backend preso; isso não altera os gatilhos nas funções.
A relação com egress não foi comprovada. Não há motivo para remover o controle
de revisão ou reiniciar todas as conexões.

## Alterações preparadas

- `sql/idgen_conflito_sem_retry_20261026.sql`: migração isolada e idempotente,
  substitui somente `ERRCODE='40001'` por `PT409` nas seis assinaturas enumeradas.
  Usa as definições atuais, sem substituir regras por cópias antigas; mantém ACL.
  Não altera migrações históricas nem registros de clientes/pedidos.
- `supabase/functions/idgen-interno/handler.ts`: reconhece PT409 como HTTP 409,
  conservando compatibilidade com os códigos anteriores.
- `frontend/idgen-pedidos.mjs`: um envio sem confirmação interrompe a fila e novos
  salvamentos até reabertura confirmada. Validações locais não bloqueiam a sessão.
  Guarda o documento da tentativa em memória, sem reaplicar automaticamente na
  nova revisão; reabertura invalida operações enfileiradas anteriormente.
- Cache do editor/module atualizado para `20261026`.
- No checkout `imposition-idgen-liberacao-20261023`, o arquivo não rastreado
  `idgen-backend/handler.mjs` recebeu somente o mapeamento adicional `PT409:409`.
  Sua versão anterior foi guardada em
  `%TEMP%/idgen-pausa-20261026/portal-handler-before.mjs`.
  O novo teste `tests/idgen_rpc_conflito.test.mjs` cobre uma chamada por erro.
  Esse backend do portal não está em origin/main; não publicar um checkout antigo
  inteiro nem sobrescrever o trabalho existente para integrar esta correção.

## Validação executada

- 17 testes Node: fila, rajada de 100 tentativas, rede, confirmação incompleta,
  reabertura, identidade, autorização e HTTP/CORS.
- 3 testes do transporte do portal: PT409 e compatibilidade, sem repetição.
- Chromium: editor completo com rede de negócio simulada; após conflito, 30 novas
  tentativas não enviam requisições. Reabertura e demais operações passam.
- Chromium: menu IdGen com rede simulada.
- PostgreSQL temporário local: CAS, gravação, negação de acesso, idempotência da
  migração e igualdade da definição/ACL fora do código de erro.
- Ciclo completo do portal em cluster temporário: versões, fotos, pedidos salvos,
  rascunhos, isolamento de contas e referências legadas. Cópias sintéticas dos
  testes existentes aplicaram a nova migração após os scripts de instalação,
  esperando PT409 nos conflitos (sem alterar os testes originais do parceiro).
  Runner: `%TEMP%/idgen-pausa-20261026/test_portal_migration.py`.
- `node --check frontend/idgen-editor.js` e `git diff --check` aprovados.

## Implantação e recuperação

Aplicado em 26/10/2026 às 09:42 BRT. Alvo: e-deal `vwbtitjlpelrcnsytzqw`, seis funções
SQL `public.idgen_*`, Edge Function `idgen-interno`, backend e frontend IdGen.
Impacto em dados: zero registros alterados pela migração; só definições de funções.

1. Reconsultar e guardar definições/ACL e versões publicadas; conferir alterações
   concorrentes do parceiro. As seis definições consultadas já estão guardadas
   em `%TEMP%/idgen-pausa-20261026/definitions-*.json`.
2. Publicar primeiro os handlers compatíveis com PT409 e os clientes corrigidos.
3. Executar apenas a migração enumerada, em sua transação. Comparar definições e
   ACL antes/depois; exigir seis alvos em produção e zero 40001 nesses corpos.
4. Confirmar versão do cliente e acompanhar deltas de rollback/CPU e logs novos.
   Não provocar um conflito contra pedidos reais para testar.
5. Se necessário, reverter artefatos com suas cópias exatas. Restaurar SQL antigo
   reintroduz o risco do laço: manter o IdGen contido nesse caso. A migração falha
   atomicamente se houver uso inesperado de 40001 em um alvo.

## Comprovação da publicação autorizada

- Seis funções verificadas após COMMIT: 13 substituições, zero 40001 restante;
  definições idênticas fora dessa substituição e ACL/owner/security definer/config
  inalterados. Backup e SQL aplicado: `C:/ProjectBackups/IdGenConflito20261026/124217`.
- Edge Function `idgen-interno` versão 2, ACTIVE e `verify_jwt=true`. Download
  posterior confirma o handler publicado igual ao preparado. Fonte anterior
  preservada em `%TEMP%/idgen-pausa-20261026/edge-predeploy`.
- Portal IdGen: deployment `74c14337-cad0-4ca2-b4e5-0da238a190c5`; publicação
  anterior `92f19161-1bbd-4e81-9f10-a947944ed6f3`. Bundle conferido: somente o
  mapeamento PT409 mudou, além dos identificadores temporários do compilador.
  Cinco assets públicos preservados e comparados com hash normalizado.
- Editor web: PR #202, integração/conferência pública em andamento neste registro.
- Amostras às 09:42:17 e 09:43:32 BRT: quatro rollbacks totais no intervalo;
  não comprova egress nem CPU. Nenhuma conexão foi encerrada por esta entrega.

Adoção por navegadores já abertos e queda de egress não foram comprovadas.
