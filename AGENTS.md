# Ideal Imposition — instruções para agentes

## 1. Escopo e prioridade

Estas são as regras consolidadas do projeto para agentes e ferramentas que atuam neste repositório. Preserve dados, funcionalidades e regras de negócio; faça mudanças pequenas, rastreáveis e reversíveis.

Dentro das instruções do projeto, respeitando as regras da ferramenta, a prioridade é: pedido humano explícito e seu escopo; `AGENTS.md` aplicável mais próximo do arquivo; este arquivo; documentação; padrões do código. Esta versão consolida `agente.md` e incorpora as regras de negócio de `.agents/AGENTS.md`. Os arquivos anteriores ficam preservados como referência; em divergências gerais, use esta versão consolidada.

Uma autorização explícita permanece válida para a ação e o escopo informados. Não peça novamente por escolhas rotineiras de implementação. Confirme quando houver mudança material de alvo, ambiente ou impacto. Informação ausente bloqueia somente a ação que depende dela; continue a inspeção e o trabalho independente autorizado.

## 2. Arquitetura verificada

| Área | Fontes e responsabilidades |
|---|---|
| Frontend | `frontend/`: HTML, CSS e JavaScript, DOM direto e estado compartilhado; sem React/Vite no fluxo principal. `index.html`, `style.css` e `script.js` concentram o painel. |
| Pedidos e produtos | `frontend/pedido.js`: modelos, prévia e impressão. `script.js`: catálogo e integração comercial. `cliente.js`: modelos e artes no portal. |
| Orçamento e proposta | `frontend/cliente-orcamento.js`: consulta do orçamento no portal, baseada em `propostas.texto_whatsapp`, com alternativa pelos itens. `cliente-dados.js` chama a RPC definida em `sql/link_cliente_pedido.sql`. `loadOrdensFromVibecode()` integra propostas à produção. |
| Backend local | Python/FastAPI em `app.py`; motor PDF em `engine.py`; dados em `db.py`; impressão e equipamentos em `print_service.py`, `hotfolder.py` e `balanca.py`. |
| Agente Windows | `agent_tray.py`, `agent_worker.py` e `agent_tray.spec`. `painel/` é a cópia local servida pelo agente empacotado; altere a fonte em `frontend/`. |
| Nuvem | Supabase/PostgreSQL, Auth, Storage e Edge Functions TypeScript/Deno em `supabase/functions/`. Há acesso direto do frontend, RPCs SQL e chamadas às funções. |
| Persistência | Tabelas comerciais `propostas`, `produtos`, `produtos_proposta`; modelos em `pedidos_modelos`; tabelas `producao_*` e demais domínios. `db.py` também lê/grava `formats_db.json` local. Há estado auxiliar no navegador e IndexedDB na portaria. |
| Documentação e desenho | `docs/`: documentação; `design/`: protótipos. O desenho não comprova o comportamento da tela publicada. |

Dependências declaradas em `requirements.txt` e `package.json`, com `package-lock.json`. As faixas declaradas não comprovam as versões instaladas. Scripts SQL estão em `sql/`; não presuma um migrador ou comando universal de migração.

Ambientes evidenciados: desenvolvimento local, agente Windows e frontend hospedado com Supabase. Não presuma homologação, banco descartável, versão do PostgreSQL ou responsável técnico. Confirme ambiente e alvo antes de qualquer acesso compartilhado. Um processo Python local pode acessar o banco remoto.

## 3. Regras de negócio que devem ser preservadas

- Orçamentos, Propostas, Produtos, clientes e Pagamentos são críticos. Preserve totais, quantidades, preços, descontos, impostos, cálculos, persistência, relacionamentos, filtros e navegação fora do pedido.
- Mudanças visuais não devem modificar regras de negócio. Reutilize componentes e funções; confira estado, chamadas de API e uso em outras telas antes de editar.
- Não substitua a arquitetura nem reescreva componentes inteiros quando uma alteração localizada bastar. Não faça refatorações ou correções paralelas não solicitadas.
- **Multi-Artes:** é proibido combinar modelos com valores de `bloco` diferentes. A quantidade de folhas por bloco deve ser idêntica para preservar o empilhamento vertical `strict_assembly`.
- **TICKET:** `QTD`/`total_items` representa células físicas de impressão. Nunca divida essa quantidade por `ticket_qtd`, no frontend ou no motor.
- **Numeração TICKET:** para célula física `i`, iniciando em zero, e via `pos = ticket_pos` entre 1 e `N = ticket_qtd`, use `current_val = início + (i × N) + (pos - 1)`.
- Preserve isolamento por empresa, autorização, auditoria, precisão monetária e prevenção de duplicidades onde se aplicam. Não introduza novos arredondamentos ou conversões financeiras sem solicitação.

## 4. Permitido dentro da tarefa autorizada

- Ler código, documentação, configurações não secretas e histórico; pesquisar com `rg`/`rg --files` e consultar `git status`, `diff`, `log` e `show`.
- Fazer edições locais e reversíveis nos arquivos necessários, observando as restrições de backend abaixo.
- Atualizar documentação e testes pertinentes; executar verificações locais conhecidas com dados sintéticos e serviços simulados.
- Gerar artefatos apenas nos diretórios temporários ou de saída previstos, após conferir os efeitos do comando.

Antes de editar, leia as instruções aplicáveis, confira branch e alterações existentes, identifique arquivos, estado, APIs e testes afetados e defina a validação. Não reformatar arquivos inteiros. Documente problemas fora do escopo sem corrigi-los automaticamente.

## 5. Ações que exigem autorização explícita

Se o pedido já autoriza claramente a ação, prossiga nesse escopo. Caso contrário, prepare o resultado local revisável antes de pedir aprovação para:

- **Backend:** alterar Python, Edge Functions, APIs, endpoints, queries, schemas, migrações, modelos, autenticação ou permissões. Se necessário para uma tarefa visual, informe arquivos, motivo, riscos e alternativa somente no frontend antes de modificar.
- **Negócio:** alterar cálculos ou comportamento financeiro, fiscal, pagamentos, estoque, numeração e demais regras críticas.
- **Dependências:** instalar, adicionar, remover ou atualizar dependências, inclusive de desenvolvimento; não mudar lockfiles fora desse escopo.
- **Ambientes e serviços:** acessar banco compartilhado ou dados reais; executar SQL remoto; enviar e-mails, mensagens ou arquivos; usar credenciais reais para validar integrações.
- **Entrega e infraestrutura:** commit, push, PR, merge, release, deploy, publicação, instalação global, serviços, CI/CD, DNS, certificados, configurações de produção e controles de acesso.
- **Segredos:** ler ou modificar arquivos de credenciais, `.env` real, chaves e configurações pessoais fora do projeto. Verificar existência não exige ler o conteúdo.
- **Destruição:** excluir dados ou arquivos não descartáveis, descartar mudanças ou reescrever histórico. Antes da execução, apresente alvo absoluto validado, prévia, impacto e recuperação. Reconfirme se a autorização não cobrir exatamente esse alvo e efeito, ou se a ferramenta exigir.

Para escrita em banco compartilhado, apresente ambiente, tabela, filtro, estimativa de registros, prévia autorizada, transação/recuperação e validação posterior. Não aplique migrações remotas como parte automática de testes. Prepare scripts revisáveis; nunca altere migração já aplicada por conveniência.

## 6. Proibições e dados sensíveis

- Nunca apagar, sobrescrever, esconder com stash ou incluir em commits mudanças preexistentes fora da tarefa.
- Nunca burlar sandbox, permissões, revisão ou controles de segurança; não desabilitar testes para mascarar falhas.
- Nunca copiar segredos ou dados pessoais para respostas, logs, código, fixtures ou Git. Não abrir `.env`, dumps, backups, pools de códigos ou arquivos de credenciais para uma inspeção genérica.
- Não executar scripts desconhecidos sem lê-los; não executar downloads como código automaticamente.
- Não executar `git reset --hard`, `git clean`, restauração com descarte, push forçado, remoção recursiva, `DROP` ou `TRUNCATE` sem autorização específica. Nunca fazer `UPDATE`/`DELETE` remoto sem filtro revisado.
- No Windows, valide caminhos absolutos antes de remoção/movimentação recursiva; use PowerShell com `-LiteralPath`, sem compor exclusões entre shells.
- Não testar contra produção por conveniência. Use dados sintéticos; confira se importar módulos ou executar testes pode gravar arquivos ou acessar a nuvem.
- Não registrar senhas no navegador nem introduzir novas cópias em JSON versionável. Prefira configuração secreta do ambiente ou armazenamento protegido já aprovado; não invente um cofre existente.

Pendência conhecida da implementação local de e-mail de 05/09/2026: `db.py` armazena a senha SMTP no JSON da estação. A remoção do armazenamento no navegador não criptografa esse arquivo. Uma adequação de armazenamento deve ser tratada em tarefa própria, sem ler/exibir senhas ou migrá-las automaticamente. Ver `docs/registro-2026-09-05-email-artes.md`.

## 7. Comandos e validação proporcional

Comandos a partir da raiz, salvo indicação. Confira ambiente e efeitos antes de executar; a tabela não autoriza instalação, acesso a segredos ou publicação.

| Finalidade | Comando existente |
|---|---|
| Suíte Python | `.\venv\Scripts\python.exe -m pytest` |
| Teste específico em série | `.\venv\Scripts\python.exe -m pytest -n 0 tests/test_email_envio.py` (exemplo; escolha o teste da tarefa) |
| Sintaxe de todo o frontend | `.\venv\Scripts\python.exe -m pytest -n 0 tests/test_o_javascript_do_frontend_compila.py` |
| Sintaxe de um JS | `node --check frontend/script.js` |
| Edge Functions | Em `supabase/functions/`: `deno test --allow-env --allow-read --quiet`; a suíte Python também as chama em `tests/test_as_funcoes_passam_no_deno.py`. |
| Revisão de whitespace | `git diff --check` |
| Build Windows | `.\build_agent.ps1` usa PyInstaller; `.\compilar_instalador.ps1` usa Inno Setup; `.\compilar_msi.ps1` usa WiX. |

O `pytest.ini` configura oito processos (`-n 8 --dist loadgroup`); use `-n 0` para execução serial. O `package.json` não define scripts de build/lint/test. Não presuma `npm run build`, ESLint ou verificação de tipos configurados. O frontend é estático.

**Build do agente não é uma validação inofensiva:** o script limpa saídas e prepara/empacota segredos. Inspecione os scripts chamados e obtenha autorização para esses efeitos antes de executá-lo. Não chamar scripts de publicação para validar uma edição.

Para mudança funcional, teste o caminho principal e um erro/limite relevante; em bugs, prefira regressão que reproduza a falha. Integração, autorização, concorrência, migração e cálculos exigem testes apenas quando afetados. Documentação isolada exige revisão de conteúdo e diff, sem rodar toda a aplicação.

Não oculte erros nem repita verificações sem motivo. Informe falhas preexistentes com evidência, validações não executadas e suas limitações. Um teste SMTP simulado não comprova entrega real.

## 8. Entrega

Revise o diff e os arquivos não rastreados, confira escopo e ausência de segredos. Relate de forma breve: resultado, arquivos alterados, validações/resultados e pendências reais. Não declare publicação, migração aplicada, envio real ou notificação agendada sem confirmação da execução. Uma entrega local pode estar concluída enquanto implantação ou configuração externa permanece pendente, desde que isso fique explícito.

Fontes desta consolidação (06/09/2026): `agente.md`, `.agents/AGENTS.md`, `package.json`, `requirements.txt`, `pytest.ini`, `app.py`, `db.py`, `frontend/script.js`, `frontend/cliente-orcamento.js`, `frontend/cliente-dados.js`, `sql/link_cliente_pedido.sql`, `supabase/functions/`, `tests/test_as_funcoes_passam_no_deno.py`, scripts de build e `design/README.md`.
