# Primeira entrega local — propostas sem anon

Estado: código local implementado e testes locais executados. Não publicado; nenhuma mudança no banco ou nas RPCs existentes. Não autoriza revogar anon agora. Esta é a primeira parte da adaptação, priorizada a pedido do parceiro.

## O que está implementado

As 13 chamadas diretas de `propostas` em `frontend/script.js` e `frontend/acabamento.js` passaram para operações específicas do backend. A consulta de `propostas` feita internamente pela RPC existente `link_cliente_pedido` foi preservada.

| Operação | Contrato |
|---|---|
| `POST /api/propostas/consultar` | `tipo`: `numeros`, `lista`, `status`, `clientes`, `nome` ou `encerrados_teste`; campos tipados por tipo; paginação de até 500 linhas e lotes de até 200 números |
| `POST /api/propostas/status` | Somente `{pedido, status}`; aceita `EM PRODUCAO` para administrador e `EXPEDICAO` com `perm_acabamento_edit` |

Nenhuma rota aceita nome de tabela, seleção livre de colunas, filtro PostgREST arbitrário ou alterações de valores financeiros. A consulta devolve uma projeção fixa dos campos usados pelo painel. Não há filtro por empresa nem vínculo operador–pedido.

O comando de status resolve primeiro um único pedido e grava por sua chave primária, também conferindo o número. Pedido inexistente/ambíguo é recusado antes da escrita. Resposta de gravação sem exatamente uma linha é erro, não sucesso.

No navegador, `requisitarPropostas()` escolhe a sessão Vibe, quando existe. Sem sessão, exige página servida pela estação e operador local identificado. Não há retorno ao PostgREST anon em caso de erro. As consultas paginam até o fim ou até o limite explícito da tela; uma falha descarta os lotes parciais.

Na nuvem, `painel` usa a identidade do JWT validado pelo gateway e consulta a grade do Imposition no servidor. Não basta apresentar a anon key. As leituras exigem uma permissão de consulta das funcionalidades que consomem propostas. A escrita mantém a regra atual de administrador para liberar produção.

Na estação, a nova ponte `propostas_api.py` valida o código no cadastro local antes de transmitir, e `acesso-estacao` revalida código ativo/permissões no banco, além de verificar o segredo do agente. O navegador não recebe esse segredo nem service role. Negativas explícitas da grade local prevalecem sobre os padrões de perfil já usados pela interface.

## Arquivos

- `supabase/functions/_compartilhado/propostas.ts`: contratos, validação, consultas e comando de status.
- `supabase/functions/painel/index.ts` e `supabase/functions/acesso-estacao/index.ts`: novas rotas autenticadas.
- `propostas_api.py` e registro do router em `app.py`: ponte da estação.
- `frontend/supabase-config.js`: transporte autenticado e paginação; `script.js` e `acabamento.js`: consumidores migrados.
- `tests/test_propostas_sem_anon.py`, `tests/propostas_sem_anon_harness.js` e `supabase/functions/_compartilhado/propostas_test.ts`: regressão com dados sintéticos e serviços simulados.
- Harnesses/testes de acabamento e histórico: mantêm as verificações do comportamento pelo novo transporte.

As alterações preexistentes de e-mail em `app.py`, `db.py` e `script.js` foram preservadas. Esta entrega não modifica `db.py` nem `frontend/style.css`.

## Validação

- 10 testes Deno novos aprovados: autorização, escopo entre empresas, filtros, campos financeiros recusados, escrita por chave primária, pedido ambíguo, gravação vazia, operador local e erro sem código exposto.
- 7 testes Python novos aprovados, incluindo um harness com 8 cenários do navegador e um servidor FastAPI isolado. Não importam a aplicação real nem `db.py`.
- 14 testes existentes do roteamento do painel aprovados.
- Das 73 verificações selecionadas de acabamento, entrega, histórico, entrada de pedidos e bloqueios, 72 ficaram aprovadas após ajustar as expectativas de transporte. Os testes que falharam por essa mudança foram reexecutados após as correções.
- Resta 1 falha preexistente: `test_a_paleta_do_acabamento_nao_repinta_o_painel_de_producao` rejeita o seletor `#view-ideal-control .ic-workspace > *,` em `frontend/style.css`. O teste examina todo o restante do arquivo após o bloco de acabamento. O CSS não foi alterado; a falha não foi corrigida nem desativada.
- Sintaxe dos três JS alterados e dos arquivos Python aprovada. As duas Edge Functions passaram pela verificação de tipos usando `deno test --cached-only --no-run`.
- A suíte Python emite aviso de depreciação do `httpx` usado pelo TestClient. Nenhuma dependência foi instalada ou alterada.

Não houve teste contra banco real, build do agente ou publicação. Portanto, os testes locais não comprovam grants, colunas instaladas ou atualização dos consumidores em produção.

## Entrega coordenada

1. Revisar e publicar as duas Edge Functions com o módulo compartilhado; conservar a verificação de JWT de `painel` e a autenticação própria de `acesso-estacao`.
2. Publicar o frontend e distribuir agente que contenha `propostas_api.py`, o registro do router e os arquivos atualizados de `frontend/` na cópia `painel/`. Não confundir atualização do site com atualização das estações.
3. Validar painel com Vibe, estação por código e portal por link, incluindo recusa sem credencial e sem permissão. Confirmar que não há estações ou abas antigas ainda utilizando a versão anterior.
4. Somente então comunicar ao parceiro que o acesso anon de `propostas` pode ser fechado. Esta comunicação ainda não foi autorizada como confirmação de prontidão: falta executar os passos anteriores.

Não usar scripts de publicação ou build como teste. O usuário autorizou a implementação; publicação e build com seus efeitos específicos continuam pendentes de autorização. Nenhuma migração de banco é necessária para estas duas rotas.

## Atualização da execução

As leituras de pagamentos_v2, clientes e enderecos e as duas ações de fundo foram migradas localmente. O estado atual, testes e pendências estão no [plano de execução](plano-execucao-supabase-2026-09-07.md). Os itens abaixo registram o alcance da primeira entrega e foram parcialmente superados por essa execução; não representam autorização de revogação.

## Pendências registradas na primeira entrega

- Substituir a leitura direta de `pagamentos_v2` e os acessos às demais tabelas de apoio acordadas.
- Substituir as leituras de `clientes` e `enderecos`, com erro visível em entrega/contato. Nesta etapa, apenas a consulta da proposta que antecede essas leituras mudou de transporte; a falha já relatada pelo parceiro ainda pode ocorrer nesses dois cadastros.
- Escrever e revisar as quatro RPCs novas e migrar as operações diretas do portal. O DDL sem dados e o padrão de migration/rollback do parceiro foram solicitados para não presumir tipos, constraints ou triggers. Nenhuma RPC nova foi criada ou aplicada.
- Corrigir a autorização das duas RPCs de fundo, cruzar a lista nominal que será enviada e registrar as quatro RPCs existentes sem alteração de definição, a partir da versão efetivamente instalada fornecida pelo parceiro.

## Contrato de idempotência proposto ao parceiro

Atualização após resposta do parceiro: janela de 7 dias e seis campos aceitos. O [contrato v1](contrato-idempotencia-portal-v1.md) detalha hash, recibo, concorrência e expurgo, com vetores sintéticos. Ele substitui as alternativas preliminares abaixo sobre uma tabela de três campos.

Propor **7 dias de deduplicação**, contados da primeira conclusão bem-sucedida, para cobrir perda de resposta, retomada de página e intervalos de fim de semana. Uma nova ação intencional recebe outro UUID; uma repetição por falha de rede reutiliza o UUID original. A janela é uma proposta de contrato, ainda não uma configuração aplicada.

| Operação | Usa deduplicação |
|---|---|
| `link_cliente_modelos` | Não: somente leitura |
| `link_cliente_decidir_arte` | Sim: decisão, atualização dos registros e mensagem relacionadas |
| `link_cliente_confirmar_dados` | Sim: confirmação/correção da aba e seus efeitos relacionados |
| `link_cliente_finalizar` | Sim: finalização e registro de mensagem/status |

A tabela será criada pelo parceiro. Além de UUID, operação e instante, propor guardar o identificador do link, um hash canônico da entrada e o resultado retornado. Isso permite recusar reutilização do UUID com outro pedido/payload e reproduzir a resposta de uma operação que terminou mas cuja resposta se perdeu. Não guardar o token do link na tabela de idempotência.

Autenticar o link antes de consultar/reproduzir resultado. Deduplicação e mutações devem participar da mesma transação: falha não pode deixar uma marca de sucesso, e duas requisições concorrentes não podem executar a mesma ação duas vezes. Um registro em andamento deve aguardar a conclusão concorrente ou retornar conflito recuperável, sem repetir a escrita. O expurgo deve remover apenas registros concluídos fora da janela, sob responsabilidade do parceiro.

Se a tabela de três campos for requisito fechado, o contrato precisa ser simplificado para uma resposta de repetição sem replay e receber uma solução equivalente de vínculo/fingerprint; os três campos sozinhos não atendem o replay e a conferência de payload acima. A migration deve resolver esse acordo antes das RPCs que a utilizam.

## Desenho das RPCs de fundo para revisão do parceiro

Preservar SELECT público do fundo. Publicar/remover devem passar pelas rotas autenticadas da equipe, com `perm_admin_edit` conferida no servidor. Propor acesso às RPCs de escrita somente para service role, retirando EXECUTE de `PUBLIC`, `anon` e `authenticated`, após a troca dos consumidores; service role permanece exclusivamente no backend.

O SQL de alteração de privilégios deve conter cabeçalho, asserções dos grants/assinaturas esperados, verificação posterior e rollback explícito. Não aplicar a retirada antes de substituir as chamadas diretas atuais do frontend. Não alterar as quatro `link_cliente_*` existentes nessa migration.
