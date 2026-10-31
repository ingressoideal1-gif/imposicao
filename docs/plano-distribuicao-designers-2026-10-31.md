# Distribuição de pedidos entre designers

## Regras aprovadas

- Rodízio único compartilhado entre as empresas: a carga não é separada por empresa.
  Designers sem `id_empresa` também participam; seus cadastros não são alterados.
- Carga: pedidos em Em Arte, uma unidade por pedido, incluindo fixados e correções.
- Sem designer original: aguardar atribuição manual; não distribuir nem contar tempo.
- Original com até dois pedidos recebe o próximo. Com três ou mais, menor carga;
  desempate por última atribuição mais antiga e identificador estável.
- Não há teto: se todos tiverem três pedidos, continua distribuindo.
- Correções retornam ao responsável atual, mesmo acima de três.
- ADM e Atendimento podem atribuir/fixar e desfazer a fixação.
- ADM pode segurar a fila: bloqueia entradas pelo rodízio, preserva trabalho,
  alterações, fixações e relógio. Ausente: redistribui todos os pedidos em arte,
  inclusive fixados, alterações e iniciados; a fixação é retirada e auditada.
- O novo responsável recebe futuras alterações. Ao reativar alguém, nenhum
  pedido já transferido volta automaticamente.
- Sem elegíveis: espera com aviso. Pedidos sem responsável não contam tempo.
- Tempo útil: segunda a sexta, 08h–18h, America/Sao_Paulo; sem exclusão de feriados.
- Saída para aprovação libera carga; retorno para alteração volta a contar.

## Plano de execução

1. Criar persistência e funções transacionais para fila, disponibilidade e histórico.
2. Serializar entradas e mudanças com trava no banco; atualizar cargas após cada atribuição.
3. Integrar o painel ao estado persistido, com controles de suspensão e fixação.
4. Exibir tempo útil e espera, sem overrides locais vencendo o responsável persistido.
5. Testar regras, calendário, autorização, falhas, integração e concorrência.
6. Preparar instruções de ativação e recuperação. Não executar SQL remoto nem publicar.

## Decisões de implantação

A instalação nasce desativada. A ativação exige ADM e preserva atribuições existentes
como base inicial, evitando redistribuir trabalhos antigos somente pela instalação.
O rodízio passa a tratar entradas posteriores e suspensões explícitas.
Não se transforma o tempo corrido histórico em horas úteis: o novo relógio começa
na ativação/primeira atribuição do mecanismo, mantendo o histórico antigo intacto.

As fontes comerciais deste checkout são compartilhadas (`id_int` identifica o pedido).
A prévia encontrou `usuarios.id_empresa` e o usuário confirmou o rodízio único entre
as empresas em 31/10/2026. Essa coluna não particiona a fila. Outros mecanismos de
isolamento, autorização e a interação com gatilhos existentes ainda devem ser
revisados antes da instalação; não há alteração automática nas permissões comerciais.
