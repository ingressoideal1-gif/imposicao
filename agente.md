# AGENTS.md — Regras do Ideal Imposition

## 1. Objetivo

Este é um sistema ERP em produção/desenvolvimento ativo.

Prioridade máxima:
- preservar funcionalidades existentes;
- preservar regras de negócio;
- evitar alterações desnecessárias;
- fazer mudanças pequenas, rastreáveis e reversíveis.

Antes de modificar código, entenda primeiro a arquitetura existente e localize os componentes, hooks, serviços e estados envolvidos.

---

## 2. Regra principal

NÃO faça alterações amplas quando uma alteração localizada for suficiente.

Prefira:
- pequenas mudanças;
- reutilização de componentes existentes;
- reutilização de funções existentes;
- preservação dos padrões atuais do projeto;
- alterações somente nos arquivos necessários.

Não reescreva componentes inteiros sem necessidade.

Não faça refatorações não solicitadas.

---

## 3. Backend e banco de dados

Por padrão, NÃO alterar:

- banco de dados;
- migrations;
- schemas;
- APIs;
- endpoints;
- controllers;
- serviços backend;
- regras de cálculo;
- queries;
- modelos;
- autenticação;
- permissões.

Se uma tarefa aparentemente exigir alteração de backend, PARE antes de modificar e informe:

1. qual arquivo seria necessário alterar;
2. por que a alteração parece necessária;
3. quais seriam os riscos;
4. se existe alternativa somente no frontend.

Somente altere backend quando o usuário solicitar explicitamente.

---

## 4. Frontend

O projeto possui backend em Python e frontend baseado em HTML, CSS e JavaScript.

Ao trabalhar no frontend:

- preserve componentes existentes;
- preserve estado existente;
- preserve props;
- preserve contratos entre componentes;
- preserve chamadas de API;
- preserve cálculos existentes;
- preserve comportamento que não foi solicitado para alteração.

Não substituir uma implementação existente por outra arquitetura sem solicitação.

---

## 5. Módulo de Orçamentos / Propostas

Este módulo é crítico.

Ao alterar:

- Orçamentos;
- Propostas;
- Produtos;
- Pagamentos;
- clientes;
- valores;
- quantidades;
- cálculos;
- filtros;
- navegação da proposta;

não alterar funcionalidades relacionadas que não façam parte da solicitação.

Especialmente preservar:

- cálculos financeiros;
- totais;
- quantidades;
- preços;
- descontos;
- impostos;
- pagamentos;
- persistência;
- relacionamento entre produtos e propostas.

Alterações de interface não devem alterar regras de negócio.

---

## 6. Regra para alterações de UI

Quando o usuário solicitar uma alteração visual:

1. localizar primeiro o componente responsável;
2. verificar se o comportamento atual depende de estado;
3. identificar se o componente é reutilizado em outras telas;
4. alterar somente o comportamento necessário;
5. verificar se outras telas utilizam o mesmo componente.

Não criar componentes duplicados quando um componente existente puder ser adaptado com segurança.

---

## 7. Antes de editar

Antes de fazer alterações:

- procure as referências relevantes;
- leia o componente completo quando necessário;
- identifique imports;
- identifique props;
- identifique estado;
- identifique hooks;
- identifique chamadas de API;
- identifique componentes filhos;
- identifique testes existentes.

Não altere um arquivo apenas com base em um pequeno trecho sem entender seu contexto.

---

## 8. Dependências

NÃO instalar novas dependências sem autorização explícita.

NÃO atualizar versões de:

- React;
- Vite;
- TypeScript;
- bibliotecas de UI;
- bibliotecas de estado;
- bibliotecas de formulário;
- bibliotecas de API;
- outras dependências existentes.

Se uma nova dependência parecer necessária, informe primeiro.

---

## 9. Arquivos sensíveis

NÃO modificar automaticamente:

- .env
- .env.*
- credenciais
- chaves de API
- certificados
- arquivos de configuração de produção
- arquivos de deploy
- arquivos de infraestrutura

Nunca exibir secrets, tokens ou credenciais.

---

## 10. Git

Antes de alterações significativas:

- verificar git status;
- verificar branch atual;
- evitar modificar alterações pré-existentes do usuário.

NÃO executar automaticamente:

- git reset --hard
- git clean -fd
- git checkout -- .
- git restore .
- git push --force
- git rebase destrutivo

sem autorização explícita do usuário.

Nunca apagar alterações existentes do usuário.

---

## 11. Comandos

Pode executar comandos de leitura e validação normalmente.

Exemplos:

- npm run build
- npm run test
- npm run lint
- npm run typecheck
- git status
- git diff
- git log
- npm ls

Antes de executar comandos potencialmente destrutivos, solicitar confirmação.

---

## 12. Testes

Depois de uma alteração:

1. executar o teste mais específico disponível;
2. executar lint/typecheck quando apropriado;
3. executar build quando apropriado;
4. analisar erros;
5. corrigir somente os problemas relacionados à alteração.

Não esconder erros.

Não remover testes para fazer uma alteração passar.

Não alterar testes apenas para mascarar um bug.

---

## 13. Escopo

Trabalhe somente no escopo solicitado.

Se encontrar outro problema:

- não corrija automaticamente;
- informe o problema;
- indique o arquivo;
- explique o risco;
- sugira uma tarefa separada.

---

## 14. Critério de conclusão

Antes de considerar uma tarefa concluída:

- revisar git diff;
- verificar arquivos alterados;
- verificar se não houve alteração fora do escopo;
- executar validações relevantes;
- informar exatamente o que foi alterado;
- informar quais testes foram executados;
- informar eventuais problemas restantes.

---

## 15. Comunicação

Antes de uma alteração complexa, explique brevemente o plano.

Durante a execução:
- seja objetivo;
- não invente arquivos ou funções;
- não assuma comportamento que não foi verificado.

Ao finalizar:
- resumo das alterações;
- arquivos modificados;
- testes executados;
- possíveis riscos;
- próximos passos, se houver.

---

## 16. Regra de segurança

Se houver dúvida entre:

A) fazer uma alteração potencialmente perigosa;

B) parar e pedir confirmação;

escolha B.

---

## 17. Aplicação destas regras

Este arquivo (`agente.md`) registra as regras de trabalho específicas deste projeto.

Se a ferramenta utilizada não carregar automaticamente arquivos com esse nome, estas regras devem ser consideradas como orientação do projeto, mas não substituem um arquivo de instruções no nome e local exigidos pela ferramenta.
