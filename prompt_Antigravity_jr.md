Objetivo:
Criar uma documentação técnica geral e atualizada do módulo de Produção que está sendo construído no ERP Ideal.

Contexto do projeto:
- Stack: Next.js, TypeScript, TailwindCSS, shadcn/ui, Supabase.
- Arquitetura modular em src/features.
- O módulo de produção está dentro de src/features/pedidos e/ou src/features/producao, conforme estrutura atual do projeto.
- O sistema está migrando módulos do FlutterFlow para Next.js.
- A documentação deve ajudar outro desenvolvedor a entender o que já existe, o que está mockado, o que está conectado ao Supabase e quais partes ainda estão pendentes.

Regras obrigatórias:
- Não alterar código funcional.
- Não alterar banco.
- Não criar migration.
- Não alterar RLS, triggers, RPCs ou policies.
- Não remover mocks.
- Não refatorar componentes.
- Apenas analisar e documentar.
- Se encontrar inconsistências, registrar como observação, não corrigir.
- Não misturar Produção com Financeiro, Fiscal, Propostas ou Cadastros além dos vínculos necessários.

Tarefa:
Auditar o módulo de Produção/PCP/OS/Pedidos e criar uma documentação completa contendo:

1. Visão geral do módulo
- Objetivo do módulo.
- Fluxo operacional esperado.
- Quais telas fazem parte do módulo.
- Quais perfis/usuários usam cada tela.

2. Mapa de telas e rotas
Documentar todas as rotas relacionadas, por exemplo:
- /pedidos
- /pedidos/novo
- /pedidos/[id] ou detalhe/ficha
- /pedidos/impressao
- /expedicao
- kanban ou outras rotas existentes

Para cada tela, informar:
- Nome da tela.
- Arquivo principal.
- Componentes relevantes.
- Fonte de dados atual.
- Se usa Supabase, mock ou localStorage.
- Ações disponíveis.
- Ações desativadas ou futuras.

3. Fluxo de dados atual
Mapear o fluxo:
- Proposta aprovada
- Abertura de OS / Boletim de Entrada
- Criação do pedido pai
- Criação de modelos/lotes
- Ficha operacional
- Arte/design
- Produção/impressão
- Expedição

Indicar o que já está implementado e o que ainda é futuro.

4. Tabelas Supabase envolvidas
Documentar o uso atual e previsto das tabelas:
- public.propostas
- public.produtos_proposta
- public.pedidos
- public.pedidos_modelos
- public.pedidos_artes
- storage.objects / bucket chat-ideal

Para cada tabela:
- finalidade no módulo;
- campos principais usados;
- tipo de acesso atual: SELECT, INSERT, UPDATE, DELETE;
- se depende de RLS/policy;
- riscos ou pendências.

5. Status operacionais
Documentar os status usados no módulo:
- status_pedido
- status_pagamento
- status_arte
- status_producao
- status_expedicao
- status de pedidos_modelos
- status de pedidos_artes

Explicar o significado de cada status encontrado no código e no banco.

6. Pontos ainda mockados
Criar uma seção específica:
“Áreas ainda mockadas ou em transição”.

Para cada ponto:
- arquivo/tela;
- qual mock/localStorage é usado;
- impacto;
- recomendação futura;
- se pode remover agora ou não.

7. Escritas reais já existentes
Documentar todas as escritas reais do módulo:
- onde acontece;
- arquivo/função;
- tabela afetada;
- payload principal;
- validações antes da escrita;
- risco.

Separar claramente:
- leitura real;
- escrita real;
- mock/localStorage;
- fluxo futuro.

8. Segurança e RLS
Documentar:
- quais tabelas têm RLS ativo;
- quais policies são necessárias;
- quais policies já existem, se estiverem descritas no código/docs;
- quais operações estão bloqueadas;
- quais operações estão em teste.

Não propor abertura ampla de RLS. Apenas registrar.

9. Pendências técnicas
Criar checklist com:
- pendências críticas;
- pendências médias;
- melhorias futuras;
- débitos técnicos;
- decisões que precisam de validação do Everton antes de implementar.

10. Roadmap sugerido
Organizar o próximo desenvolvimento em fases:
- Fase 1: Pedido pai / Fila Geral
- Fase 2: Boletim e modelos/lotes
- Fase 3: Arte/design
- Fase 4: Aprovação/liberação de arte
- Fase 5: Impressão/produção
- Fase 6: Expedição/pesagem
- Fase 7: histórico, auditoria e indicadores

Formato de entrega:
Criar um arquivo Markdown em:

docs/PRODUCAO-MODULO-GERAL.md

Também atualizar, se fizer sentido e sem apagar conteúdo existente:
- docs/MODULOS-IMPLEMENTADOS.md
- docs/CHANGELOG.md

Formato da documentação:
- Usar títulos claros.
- Usar tabelas quando ajudar.
- Incluir caminhos de arquivos.
- Incluir nomes de funções/services importantes.
- Separar “implementado”, “parcial”, “mockado” e “pendente”.
- Não escrever texto genérico; documentar o que realmente existe no código.

Validação:
- Não precisa rodar build se só alterar documentação.
- Confirmar no final:
  - quais arquivos foram criados/alterados;
  - se houve alteração de código funcional;
  - principais descobertas;
  - principais riscos encontrados.