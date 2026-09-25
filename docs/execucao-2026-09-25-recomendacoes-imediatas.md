# Recomendações imediatas — execução em 25/09/2026

## Escopo e estado da entrega

Pedido: executar as recomendações imediatas da avaliação de 24/09. Implementação local na branch `fix/recomendacoes-imediatas-20260925`, baseada em `df13d5de`, no worktree `C:\ProjetosLocais\ideal-imposition-analise-22599`. O checkout operacional e os dois documentos não rastreados do dia anterior foram preservados.

Foram implementadas contenções no salvamento de modelos, no editor e na atualização do agente durante processamento/envio ativo. A auditoria de metadados de produção foi autorizada, mas o acesso de gerenciamento falhou antes de coletar os metadados. Não houve commit, publicação, build, instalação em estação, alteração remota de permissões ou impressão física nesta etapa. As versões públicas anteriores continuam sendo um assunto separado desta entrega local.

## 1. Salvamento com alvo inequívoco

Arquivo: `frontend/script.js`, função `saveAmostraToDB`.

- A regressão sintética com dois modelos reproduziu o problema anterior: um identificador ausente chegava ao fallback por pedido e a operação terminava sem rejeição. O teste contra a versão anterior falhou com `Missing expected rejection`.
- Agora uma alteração exige identificadores válidos do modelo e do pedido; o UPDATE usa ambos. Identidade ausente ou modelo virtual ainda não materializado bloqueia a gravação.
- Foram removidas as alternativas de escrita por origem, ordem, nome ou pedido inteiro e a criação implícita após falha de UPDATE.
- É necessário retornar exatamente uma linha com os identificadores e todos os valores enviados confirmados. Resposta vazia, divergente ou erro não produz recibo de sucesso.
- O espelho em `produtos_proposta` usa exclusivamente a origem devolvida pelo modelo persistido, também filtrada pelo pedido. Não confunde ID do modelo com ID comercial.
- Estado local e vínculos de numeração são atualizados após a confirmação. A proteção de modelos aprovados e a exclusão de quantidade do payload foram preservadas.

Limite: modelo e espelho comercial ainda são duas operações. Se a segunda falhar, a primeira pode já estar salva; o erro informa explicitamente essa condição e orienta reabrir o pedido. Não foi criada uma transação/RPC. A confirmação usa a representação retornada pela escrita; não é uma revisão imutável nem controle de concorrência entre editores.

## 2. Editor confirma PDF e persistência

Arquivo: `frontend/criador-arte.js`, função `salvarArteDoEditor`.

- PDFLib e upload real são obrigatórios. Falha de geração/envio não é substituída silenciosamente por PNG ou data URL com aviso de sucesso.
- Após o upload, o editor baixa o objeto sem cache e compara tamanho e todos os bytes com o PDF gerado. Há limite de 60 segundos para essa conferência.
- O salvamento exige recibo confirmado do modelo com a URL da face correspondente. Cache, arte local e fechamento do editor só avançam após essa confirmação.
- Duplo clique é bloqueado durante o salvamento. Mudança de modelo/face durante o upload interrompe a gravação; mudança durante a confirmação não fecha o novo contexto.
- Falha de cache local após gravação confirmada gera aviso específico. Falhas anteriores mantêm o editor aberto para recuperação.

A regressão contra a versão anterior comprovou alteração da arte local antes da confirmação. Os testes atuais cobrem falhas de PDF, upload, download, conteúdo divergente, banco, recibo, troca de face, frente/verso e duplo clique.

Limites: a composição continua sendo uma imagem dentro de PDF; a estrutura editável continua dependente do navegador. Upload confirmado seguido de falha no banco pode deixar um objeto sem vínculo; não foi introduzida exclusão automática de arquivos. Persistência central do documento editável, revisão aprovada e qualidade vetorial pertencem às próximas etapas arquiteturais.

## 3. Atualização coordenada com processamento local

Arquivos: `controle_producao.py`, `app.py`, `agent_worker.py`, `agent_tray.spec`.

- Contador protegido por lock coordena admissão de produção e início de instalação.
- Imposição HTTP, streaming, envio à impressão, hotfolder e processamento da fila reservam atividade até o fim de suas operações.
- O motor conserva uma reserva própria enquanto trabalha, inclusive após fechamento do navegador. A reserva nasce antes do agendamento e é liberada no encerramento do motor.
- O atualizador adia a instalação se houver atividade, inclusive no acionamento forçado. Confere novamente depois do download e impede novas admissões antes de iniciar o instalador.
- Falha ao iniciar o instalador libera a admissão. Instalação iniciada mantém o bloqueio até reinício do processo.
- Sincronização do painel também confere atividade antes do download e antes da substituição dos arquivos, mantendo exclusão durante a troca.
- O novo módulo foi incluído no empacotamento; nenhum instalador foi construído nesta etapa.

Limites explícitos: a coordenação é por processo e cobre operações ativas no agente. Ela não constitui uma fila durável nem uma reserva persistente do trabalho inteiro entre requisições independentes. Um intervalo sem atividade local entre envios não equivale a conclusão física da tiragem. A troca do painel continua por arquivo, sem ativação atômica de um diretório completo. A garantia de ponta a ponta entre blocos, recuperação após queda e ativação integral do pacote exigem a próxima etapa de ciclo de vida durável do trabalho. Não apresentar esta contenção como eliminação de todos os riscos de atualização/produção.

## 4. Auditoria de autorização

Autorização humana: consulta somente de metadados de permissões, políticas, funções e Storage no projeto de produção `vwbtitjlpelrcnsytzqw` (`e-deal`), sem ler pedidos/clientes nem alterar dados.

O coletor existente `ferramentas/coletar_rls.ps1` e os scripts SQL de auditoria foram revisados. O fluxo exige conferir a identidade do projeto antes das consultas somente leitura. As duas credenciais de gerenciamento já armazenadas com DPAPI retornaram HTTP 401 nessa etapa inicial. Nenhuma consulta SQL de metadados foi executada; não há evidência nova das permissões efetivas de produção.

Revisão local realizada:

- `frontend/cliente.js`: existem escritas diretas de modelo; filtro no navegador não prova autorização no servidor. Conferir RLS efetiva do caminho.
- `agent_worker.py`: fila e registro de estação usam o cliente Supabase; verificar identidade e permissões efetivas das estações.
- `supabase/functions/painel/index.ts` e `_compartilhado/bancos_pedido.ts`: controles de usuário/permissão e escopo modelo/pedido no código.
- `_compartilhado/sessao.ts`: leitura de claims depende da validação da assinatura pelo gateway. `supabase/config.toml` declara `verify_jwt = true` para `functions.painel`; arquivo local não comprova configuração implantada.
- `sql/link_cliente_bancos_modelos.sql`: declarações de SECURITY DEFINER, search_path e validação de token/pedido precisam ser confrontadas com as definições implantadas.

Retomada: renovar o acesso de gerenciamento pelo script existente `ferramentas/configurar_acesso_rls.ps1`, em terminal local, com entrada oculta e armazenamento DPAPI; não enviar tokens na conversa. Depois executar novamente o coletor no mesmo alvo e escopo já autorizados. Revisar grants, RLS, políticas, views, RPCs, SECURITY DEFINER e buckets. Não alterar permissões por inferência a partir do código local.

## 5. Validação local

Sem instalação de dependências e sem serviços/dados reais nos testes. Python existente do checkout legado; dependências Node existentes do checkout operacional, reutilizadas por junction ignorada pelo Git no worktree.

| Verificação | Resultado |
|---|---|
| `tests/salvamento_modelo_seguro_harness.js` | Passou; identidade, ausência/duplicidade/divergência, aprovação e espelho comercial |
| `tests/editor_persistencia_segura_harness.js` | Passou; sucesso e falhas de geração, upload, conferência e persistência |
| `tests/corrigir_arte_harness.js` | 83 verificações passaram |
| `tests/regras_de_bloqueio_harness.js` | 118 verificações passaram |
| `tests/csv_fatia_do_modelo_harness.js` | 127 verificações passaram |
| `tests/portal_persistencia_harness.js` | Passou |
| Pytest direcionado, serial | 125 testes passaram |
| Sintaxe do frontend | Incluída na suíte Python, passou |
| `git diff --check` | Passou |

Suíte Python: `test_controle_producao.py`, `test_temp_manager.py`, `test_numeracao_do_item.py`, `test_regras_de_bloqueio.py`, `test_o_javascript_do_frontend_compila.py`, `test_banner_de_atualizacao.py`, executados com `-q -n 0`. A cobertura inclui disputa de threads, atividade iniciada durante download, falha de instalação, sincronização do painel e encerramento do navegador com motor ainda ativo. Installer, rede e banco são simulados nesses testes.

Na repetição final surgiu uma corrida no teste de desconexão: o callback acordava o consumidor antes de a thread marcar o evento de início. O teste passou a aguardar explicitamente esse evento, preservando as verificações de arquivos e bloqueio de atualização. A suíte direcionada completa foi repetida após a correção: 125 passaram em 7,56 segundos.

## 6. Continuidade e entrega segura

1. Renovar a credencial para concluir a auditoria efetiva já autorizada.
2. Revisar e publicar esta entrega em escopo próprio; para NewProd, construir/validar artefato e realizar piloto antes de ampliar às seis estações. A inclusão no spec não prova funcionamento do executável empacotado.
3. Conferir separadamente publicação, versão em execução na LASER-01 e prova física. Nenhuma delas foi revalidada nesta etapa.
4. Evoluir revisão aprovada, pacote completo com hashes, carteira local de 48 horas e ciclo de vida durável por trabalho/bloco. O requisito continua limitado a pedidos previamente aprovados e preparados; envio por bloco após validar todas as dependências, com retomada explícita em falha parcial.

O incidente original do pedido 22599 continua sem causa específica comprovada por PDF/log da ocorrência. Estas correções tratam mecanismos demonstrados no código e em regressões sintéticas; não substituem a coleta operacional do incidente.
