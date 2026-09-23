# Ideal Control — SQL e chave aplicados em 22/09/2026

Autorização: pedido explícito do usuário para “validar/aplicar o SQL, configurar a chave de proteção das senhas”.

## Alvo e execução

- Supabase **e-deal**, referência `vwbtitjlpelrcnsytzqw`, banco PostgreSQL **17.4**. Alvo confirmado na documentação, no código consumidor e pela CLI autenticada 2.114.0.
- Aplicado `sql/schema_acesso_qr_evento.sql`: quatro tabelas novas, duas funções, coluna `instalacao_id` nos aparelhos e índice único por instalação/evento. Transação com `lock_timeout=3s` e `statement_timeout=45s`.
- Aplicado `sql/ideal_control_configurar_pin_segredo.sql`: **uma** chave `IDEAL_CONTROL_PIN_CHAVE`, criada com 32 bytes aleatórios dentro do banco e armazenada como hexadecimal em `public.imposition_segredos`. `ON CONFLICT DO NOTHING` preserva qualquer chave existente. O valor não foi devolvido pela consulta nem gravado em arquivo.
- O armazenamento protegido já era usado por `ACESSO_ELEVACAO_SEGREDO`; esse segredo foi preservado. O leitor `_compartilhado/segredos.ts` consulta primeiro o ambiente Edge e depois essa tabela. A lista de Edge Secrets não tinha uma entrada de PIN sobrepondo a tabela.
- Executado `NOTIFY pgrst, 'reload schema'` após a aplicação.

## Validação executada no PostgreSQL

Antes de aplicar, foram clonadas somente as estruturas necessárias para um schema isolado `validacao_ic_20260922_qr`, dentro de uma transação. Nenhuma linha de cliente ou evento real foi copiada. A mesma migração foi aplicada nesse schema e recebeu os testes de `tests/ideal_control_qr_validacao.sql`:

- PIN correto aceito; incorreto recusado; bloqueio após cinco erros; liberação após a janela de 15 minutos.
- Consulta de QR conhecido e recusa de desconhecido.
- Ativação vinculada à instalação e ao setor correto.
- Reenvio e outro QR do mesmo evento reutilizam o aparelho.
- Aparelho pausado não é reativado; QR revogado e evento encerrado são recusados.
- Permissões negadas a `anon`/`authenticated`.

O teste terminou com **ROLLBACK** e `schema_isolado_removido=true`. A validação foi sequencial; não foi executado teste de carga com conexões concorrentes. A estrutura de bloqueios foi revisada, mas esse teste não deve ser apresentado como prova de concorrência.

## Conferência após aplicação

Executada a consulta `sql/ideal_control_qr_verificar.sql` em nova conexão:

| Verificação | Resultado |
|---|---|
| Tabelas novas | 4, todas com RLS ativo |
| Acesso de anon/authenticated às tabelas | Negado para SELECT/INSERT/UPDATE/DELETE |
| RPCs | 2, SECURITY INVOKER, execução negada a anon/authenticated e permitida a service_role |
| Índice único instalação/evento | Válido |
| Aparelhos existentes | 7 antes e 7 depois; os 7 continuam sem vínculo novo |
| Instalações, convites, ativações e auditoria | 0 registros em cada tabela |
| Chave de PIN | Presente, 64 caracteres hexadecimais válidos |
| Segredo de elevação | Presente e preservado |
| Tabela de segredos | RLS ativo, nenhuma policy, sem SELECT de anon/authenticated |
| Schema de validação | Ausente após rollback |

Também executadas as duas funções com `SET LOCAL ROLE service_role`, usando identificadores inexistentes: ambas recusaram corretamente (`NULL`), sem inserir dados. Transação encerrada com ROLLBACK.

## Estado atual e limites

**SQL de QR/PIN aplicado e chave configurada.** Nenhuma função Edge nem frontend foi publicado nesta etapa. A nova interface e a leitura da chave pela versão nova das funções ainda dependem da publicação e do teste em celulares.

A migração anterior `schema_acesso_zeramento_atomico.sql` é uma entrega separada: a consulta de pré-requisitos mostrou que `producao_acesso_zerar_entradas` ainda não existe no servidor. Ela **não foi aplicada nesta etapa de QR/PIN**. Antes de publicar as funções completas deste worktree, tratar esse pré-requisito ou separar o conjunto de mudanças para não quebrar o zeramento existente.

Não apagar a chave ou as tabelas para voltar uma interface. A migração é aditiva e os sete aparelhos antigos continuam sem vínculo novo. Quando houver senhas cadastradas, preservar a chave de cifra é necessário para manter sua verificação e consulta.

Sem commit/push; checkout operacional preservado. SQL, testes e registros permanecem no worktree `C:\ProjetosLocais\ideal-imposition-ideal-control-zeramento`.

## Identificação dos scripts aplicados

- `sql/schema_acesso_qr_evento.sql`: SHA-256 `26ef9ccaaf10438f02e32cefae0838f5d6050c809f1f77406222d374545c6cf7`.
- `sql/ideal_control_configurar_pin_segredo.sql`: SHA-256 `0047714830c36df668eb5730b2bf2f42e88073f134ae74cc8ab744b601957367`.
