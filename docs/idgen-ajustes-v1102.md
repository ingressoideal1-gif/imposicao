# IdGen — ajustes v1102

Escopo autorizado: busca por número do cliente, exclusão de modelo, modo da
numeração independente do Vibe e opções compatíveis com o formato. Publicação
retomada por solicitação explícita após pausa.

- Busca: igualdade por `clientes.id_cliente`, aceita um dígito e zeros à esquerda,
  recusa nomes/decimais/faixas inválidas. Migração incremental
  `sql/idgen_cliente_por_numero.sql` já aplicada em transação antes da pausa.
  Não reaplicar a migração inicial. ACL/RLS, funções legadas e políticas mantiveram
  os mesmos hashes anteriores; a RPC continua exclusiva do backend.
- Exclusão: confirmação, modelo aprovado bloqueado, revisão confirmada antes de
  remover da tela; remove seus vínculos/observações e conserva recursos do pedido.
- Formato: cores pelo formato vinculado; numerações por `formato_ids`, com fallback
  legado `formato_id`. Troca limpa opções incompatíveis. Confere novamente as
  linhas completas antes de copiar os cadastros.
- Numeração: IdGen obtém verso do modo da própria numeração; não exige mudança
  no Vibe. O caminho ERP continua com sua restrição comercial.
- Editor incompleto: a cópia IdGen carregava `METADATA` como elemento visual,
  causando erro em `x_mm.toFixed`. Agora reutiliza `normalizarNumeracaoLida`
  nas leituras e cópias. Documento persistido não é regravado apenas ao abrir.

Validação local: 14 testes Node aprovados, harness de contrato de verso aprovado,
sintaxe/diff aprovados, busca/migração testadas em PostgreSQL temporário. Chromium
com rede sintética testa filtros, inclusão, clique real no lápis e no Salvar,
reabertura com METADATA, verso, exclusão/cancelamento e isolamento. Evidência
final do editor: `%TEMP%/idgen-editor-browser-Qf6zMu`.

Entrega via PR 195, cache v1102. Sem instalação ou publicação de agente NewProd.
Rollback de interface deve preservar documentos; retorno da busca anterior exige
restaurar somente a definição anterior da RPC IdGen, nunca reaplicar CREATE TABLE.
Identidade final de merge/deployment e hashes públicos serão registrados após
a confirmação de publicação. Não houve validação com a sessão real do operador.
