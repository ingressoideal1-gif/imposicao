# Encerramento: aprovacoes do Link do Cliente (23/09/2026)

## Resultado operacional

| Etapa | Resultado confirmado | Limite da evidencia |
| --- | --- | --- |
| Arte | O usuario informou que a aprovacao pelo Link do Cliente passou apos a correcao de permissao. | Sem releitura independente das linhas de modelo, proposta e arte. |
| Entrega | O usuario informou que a confirmacao passou no pedido 22588 apos a correcao da RPC. | Ainda sem releitura apos recarregar o link nem consulta independente dos indicadores salvos. |
| Nota | Fluxo local e RPC instalada examinados; testes locais passaram. | Confirmacao e persistencia no pedido 22588 nao foram verificadas em producao. |

Nenhuma publicacao de frontend foi necessaria para as duas correcoes SQL. Nao
houve commit, push, deploy web ou aplicacao dos scripts `.down.sql` nesta etapa.

## Diagnostico e correcoes aplicadas

**Arte.** O erro `permission denied for table propostas` vinha do gatilho
`pedidos_modelos.trg_sync_arte_pendente`: sua funcao atualizava
`propostas.em_arte` como `SECURITY INVOKER`, enquanto `anon` ja nao possui
`UPDATE` nessa tabela. O usuario aplicou
`sql/revisao_vibe/20260923_aprovacao_cliente_flag_arte.up.sql` no SQL Editor.
A releitura independente confirmou proprietario `postgres`,
`security_definer=true`, `search_path` fixo, gatilho preservado e ausencia de
`UPDATE` de `anon` em `propostas`. A regra de calculo e os grants das tabelas
nao foram alterados. Detalhes em
`docs/diagnostico-2026-09-23-aprovacao-portal-permissoes.md`.

**Entrega.** Na janela anonima do pedido 22588, a RPC
`link_cliente_salvar_entrega` respondeu HTTP 400 / `P0001` /
`endereço persistido diverge do solicitado`. Os cabecalhos daquela chamada
tinham `apikey` e `Authorization`; a mensagem isolada anterior sobre falta de
chave nao era a causa desse erro. O gatilho `BEFORE INSERT` de `enderecos`
substituia `recebedor` e `cpf_recebedor` pelos dados do cliente comercial. A
conferencia da RPC detectava a troca e revertia a transacao.

O usuario aplicou `sql/revisao_vibe/20260923_entrega_preservar_recebedor.up.sql`
no SQL Editor. A consulta apos `COMMIT` retornou `correcao_instalada=true` e
um hash da funcao iniciado por `580a50e5` (o restante ficou cortado na imagem).
A linha inicial do arquivo UP ainda registra o estado anterior a execucao;
o artefato aplicado foi preservado sem edicao posterior. Este registro e o
`sql/revisao_vibe/README.md` documentam o estado atual.
A funcao agora restaura na linha exclusiva do pedido o recebedor e o documento
validados pelo link antes de conferir os nove campos. Quando o documento nao e
o do cliente comercial, limpa a inscricao estadual herdada desse cliente nessa
linha de entrega. O gatilho geral continua ativo para os outros INSERTs.
Detalhes em `docs/diagnostico-2026-09-23-entrega-nota-portal.md`.

A instalacao de cada SQL alterou apenas definicoes de funcoes, sem atualizar
pedidos existentes. O teste funcional de Entrega feito pelo usuario envolve
uma decisao real do pedido 22588; nao houve releitura independente das linhas
criadas por essa decisao.

## Nota fiscal

Confirmar os dados fiscais atuais registra a decisao em `pedidos_artes`.
Trocar o cadastro fiscal tambem chama `link_cliente_salvar_faturamento`, que
foi encontrada instalada com proprietario `postgres` e `SECURITY DEFINER`.
Nao ha resposta de erro da Nota neste incidente, mas os testes locais e a
aparencia da aba nao comprovam persistencia no pedido real. A consulta de
somente leitura `sql/diagnostico_confirmacoes_22588_20260923.sql` esta pronta
para verificar os indicadores de Entrega, Nota e finalizacao sem expor dados
pessoais. Seu resultado nao foi recebido ate este encerramento.

## Validacao, recuperacao e retomada

- Passaram: `node tests/portal_confirmacoes_harness.js` (143 conferencias),
  `node tests/portal_faturamento_dados_harness.js` e
  `node tests/portal_entrega_cep_harness.js`; revisao estatica da substituicao
  SQL e da reversao; `git diff --check` sem erro de whitespace.
- O teste PostgreSQL em memoria nao rodou: as copias locais de PGlite estavam
  incompletas. Nao foram instaladas dependencias. Nenhuma conclusao sobre a
  Nota em producao depende desses testes locais.
- Reversao preparada em
  `sql/revisao_vibe/20260923_aprovacao_cliente_flag_arte.down.sql` e
  `sql/revisao_vibe/20260923_entrega_preservar_recebedor.down.sql`. Nenhuma foi
  executada. Reverter a primeira recria a falha de permissao; reverter a
  segunda recria a divergencia do recebedor. Exigir nova revisao da definicao
  instalada antes de qualquer reversao.
- Retomar no worktree isolado
  `C:\ProjetosLocais\ideal-imposition-portal-aprovacao-permissoes`, branch
  `fix/portal-aprovacao-permissoes`. Os arquivos SQL e docs desta investigacao
  ainda estao locais e sem commit; o checkout operacional sujo nao foi alinhado
  nem descartado. O worktree estava quatro commits atras de `origin/main` na
  ultima consulta; nao integrar automaticamente antes de revisar o diff.
- Proximo passo objetivo: obter os quatro indicadores da consulta de
  confirmacoes do pedido 22588 e conferir o link apos recarregar. Se a Nota
  falhar, capturar somente a resposta da RPC fiscal ou do UPDATE de
  `pedidos_artes`, sem token ou dados pessoais. Depois, incorporar os dois
  scripts aplicados ao versionamento do ERP conforme o fluxo do parceiro.
