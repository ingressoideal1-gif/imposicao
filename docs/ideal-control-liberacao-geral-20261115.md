# Ideal Control — liberação geral

Autorização: liberar para todos os pedidos, incluindo futuros. A nova coluna
privada `ideal_control_portal_config.todos_pedidos` permite acesso sem cadastro
individual na allowlist. `habilitado` continua sendo o desligamento global.

`sql/ideal_control_portal_todos_pedidos.sql` adiciona a coluna, atualiza as duas
funções de acesso/reserva e ativa os dois controles na única linha `id=true`.
Não cadastra eventos, convites, reservas ou códigos durante a implantação.
Os hashes das funções anteriores são conferidos antes de alterar as definições.

Permanece obrigatório: link válido e ativo, pedido válido, impressão completa,
modelos compatíveis, emissão consistente e clique explícito para criar evento.
Somente visitar a aba continua sem reservar códigos. QR exige preparação completa.
Pedidos sem impressão podem consultar a aba, mas não criar o evento.

## Evidência local

PostgreSQL portátil com dados fictícios: pedido criado depois da ativação e sem
allowlist acessa Criar evento; o clique reserva sem duplicar; consulta não grava;
link inválido/revogado e impressão pendente continuam bloqueados. Desligamento
global preserva eventos; retornar ao piloto restringe novamente aos pedidos
previamente habilitados. Permissões privadas foram preservadas. Também passaram
as regressões anteriores de concorrência, falha na segunda reserva e retomada.

## Recuperação

Voltar ao piloto (atualmente 24880), sem apagar dados:

```sql
UPDATE public.ideal_control_portal_config SET todos_pedidos=false WHERE id=true;
```

Desligar a aba para todos, preservando eventos e PWA:

```sql
UPDATE public.ideal_control_portal_config SET habilitado=false WHERE id=true;
```

Prévia consultada: 2.039 pedidos com link ativo, 23 eventos existentes e um
convite criado pelo portal. Essas contagens são uma fotografia da conferência,
não um limite de acesso nem prova de impressão física. O usuário dispensou
testes físicos e autorizou expressamente ampliar a liberação.
