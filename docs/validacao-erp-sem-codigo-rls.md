# Validação RLS com o mantenedor do ERP

Não temos acesso direto ao código do ERP, mas o próprio mantenedor confirmou que pode responder cada contrato. Ele também determinou que qualquer novo REVOKE, ENABLE RLS ou DDL em tabela usada pelo ERP deve ser apresentado e aguardar seu ok. Essa regra passa a valer para as próximas mudanças. O retorno específico sobre bancos e tabelas `producao_*` está registrado em `resposta-mantenedor-erp-bancos-2026-09-16.md`.

## Evidência mínima por fluxo

Para cada operação abaixo, registrar: aplicação e versão; se há sessão Supabase autenticada; tabela/RPC/Edge Function usada; operações e colunas necessárias; teste com dados sintéticos; responsável pelo resultado. Uma tela de login própria do ERP não comprova, por si só, que as chamadas ao Supabase usam o papel authenticated. Não enviar JWT, tokens, senhas, documentos ou capturas contendo dados de clientes.

| Fluxo | O que confirmar | Critério antes de revogar |
|---|---|---|
| Pagamentos: criação/alteração/cancelamento | Identidade efetiva e uso dos grants de INSERT/UPDATE por coluna; automações e integrações de cobrança | Usuário autorizado continua operando; anon sem link não consegue alterar valor, status ou identificação |
| Pagamentos: consulta no portal | Resposta por link validado, colunas e pedido autorizado | Cliente A não consulta pagamento de B; links legítimos continuam funcionando |
| Pedidos/modelos/artes | Escritores internos, vínculo modelo/briefing e revisão da arte aprovada | Aprovação obsoleta recusada; correção e aprovação preservam estados e financeiro |
| Chat | Autoria definida no servidor, visibilidade externa e leitura vinculada ao pedido | Cliente não lê mensagem interna nem falsifica funcionário; repetição não duplica envio |
| Arquivos de cobrança/artes/impressão | Aplicações que leem URLs públicas, validade de links enviados e agentes instalados | Documento legítimo abre sem expor outros; impressão continua; URLs antigas têm estratégia de transição |
| Fundo PWA | Identidade de publicar/remover, permissão administrativa e upload | Administrador publica/remove; demais identidades não alteram; leitura e cache offline preservados |

## Dependências concretas do Imposition

Na base do worktree auditado (`011f9de7`, sem incorporar alterações preexistentes do checkout operacional), o portal ainda contém acessos diretos. Exemplos verificados nesta etapa:

- `frontend/cliente.js`: pedidos_artes (linhas 116, 140 e outras), pedidos_modelos (208, 1405), produtos_proposta (1412), propostas_chat (1655, 1706, 2280), producao_ordens_servico (1546 e outras).
- `frontend/cliente-confirmacoes.js`: INSERT em propostas_chat (390), UPDATE em producao_ordens_servico (406).
- `frontend/cliente-dados.js`: RPCs link_cliente_bancos_modelos (39) e link_cliente_pedido (57).
- `frontend/script.js`: publicar_fundo_do_pwa (46519), remover_fundo_do_pwa (46551); `frontend/fundo-do-app.js` lê imposition_fundo_pwa (187).

Esta busca é literal e não é inventário exaustivo de chamadas dinâmicas ou prova da versão publicada. As alterações locais anteriores de transporte autenticado não podem ser publicadas junto com esta tarefa sem revisão e integração próprias. Bloquear anon em lote interromperia caminhos conhecidos do portal.

## Sequência para concluir

1. Mantenedor confirma a matriz de identidades e operações, incluindo integrações; obter ambiente com dados sintéticos representativos ou preparar equivalente autorizado.
2. Implementar os caminhos restritos por pedido/identidade e os contratos de arte/chat; preservar regras atuais de negócio e gatilhos financeiros.
3. Testar fluxo permitido, identidade inválida, troca de IDs, replay e falha de persistência; conferir as versões de web e estações que consomem os caminhos alterados.
4. Publicar os consumidores compatíveis; revogar por domínio com baseline, transação e pós-verificação. Migrações não podem ser testes contra produção.
5. Validar operação após implantação sem testar exclusão/limpeza em dados reais. Recuperação deve corrigir o consumidor ou suspender o recurso específico; não reabrir escrita anônima em lote.

As permissões gerais da tarefa já foram dadas. Para tabelas usadas pelo ERP, o mantenedor acrescentou uma aprovação de janela por alteração, depois da apresentação do alvo e impacto. Os itens acima também são evidências necessárias para preservar funcionalidade.
