# Status da arte gravados para o ERP

Contrato vigente desde 13/09/2026 para a coluna `pedidos_artes.status`.
O status representa o pedido inteiro, considerando todos os modelos e a
confirmação conjunta de **Entrega/Faturam.**

| Status gravado | Condição |
|---|---|
| `Em Arte` | a arte está com o designer |
| `Enviar Arte` | todos os modelos estão prontos e o pedido voltou ao atendimento; vale também enquanto o link ainda não foi gerado |
| `Em Aprovação` | o cliente abriu a versão atual do link e ainda não concluiu a aprovação das artes |
| `Em Alteração` | pelo menos uma arte precisa ser corrigida |
| `Apr Parcial` | pelo menos uma arte foi aprovada e ainda existe arte pendente, sem solicitação de correção de dados |
| `Dados Pendentes` | todas as artes foram aprovadas, mas Entrega/Faturam. ainda não foi aprovado |
| `Corrigir Dados` | foi solicitada alteração em Entrega/Faturam.; este status tem prioridade mesmo com arte aprovada, parcialmente aprovada ou em alteração |
| `Pendente Informação` | o atendimento ainda precisa fornecer informação antes de o pedido seguir; pode ser marcado pelo botão no box Devolver ou pelo retorno sem todos os modelos prontos |
| `APROVADO` | todas as artes e Entrega/Faturam. estão aprovados |

`Enviar Arte` deve ser gravado exatamente com essa capitalização.
`ENVIAR ARTE` permanece aceito somente para leitura e conversão de registros antigos.

`AGUARDANDO_APROVACAO` é lido como `Em Aprovação` e
`APROVADO PARCIAL` é lido como `Apr Parcial`, mas esses valores antigos
não devem ser gravados em novos eventos.

## Precedência

1. Entrega/Faturam. igual a `CORRIGIR` grava `Corrigir Dados`.
2. A decisão explícita de que faltam informações grava `Pendente Informação`.
3. Sem correção de dados ou informação pendente, qualquer arte reprovada grava `Em Alteração`.
4. Todas as artes aprovadas gravam `APROVADO` somente se
   `pedidos_artes.entrega_dados = 'APROVADO'`; caso contrário, gravam
   `Dados Pendentes`.
5. Parte das artes aprovada grava `Apr Parcial`.

Ao entrar em `Corrigir Dados`, o sistema preserva
`observacoes.status_antes_correcao_dados`. Esse valor permite restaurar o
estado correto das artes quando o atendimento concluir a correção, inclusive
em pedidos legados cujo `pedidos_modelos.status_arte` esteja vazio.

O painel e o portal atualizam todas as linhas do mesmo `id_int`, porque um
pedido pode ter mais de um registro em `pedidos_artes`.

## Campos relacionados

| Campo | Responsabilidade |
|---|---|
| `pedidos_artes.status` | estágio consolidado do pedido |
| `pedidos_artes.entrega_dados` | `APROVADO`, `CORRIGIR` ou pendente para Entrega/Faturam. |
| `pedidos_modelos.status_arte` | decisão de cada modelo |
| `pedidos_links_cliente.status_arte` | estágio do link; `Enviar Arte` enquanto aguarda envio |
| `pedidos_links_cliente.cliente_abriu_em` | primeiro gesto do cliente na versão atual |

## Atualização dos dados antigos

A migração aplicada em 13/09/2026 está em
`sql/status_consolidado_pedidos_artes.sql`. Ela guardou os valores substituídos
em `public.pedidos_artes_status_backup_20260913`.

Use `sql/preview_status_consolidado_pedidos_artes.sql` para listar divergências
e `sql/verificar_status_consolidado_pedidos_artes.sql` para validar as regras
após a atualização.
