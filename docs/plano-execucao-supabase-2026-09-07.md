# Execução da adaptação Supabase — 07/09/2026

Este é o acompanhamento atual da entrega local. Preserva login Vibe, identificação de operador Imposition e permissões por funcionalidade, com pedidos de todas as empresas do grupo. Não acrescenta segregação por empresa nem vínculo operador–pedido para a equipe. O portal continua limitado ao pedido do link.

## Executado localmente

| Frente | Entrega |
|---|---|
| Inventário e evidências | 25 views cruzadas sem referências operacionais encontradas; quatro hashes de funções conferidos; adendo de estrutura revisado |
| Propostas | Consultas e comandos de status já substituídos por rotas autenticadas nos consumidores internos |
| Cadastro | POST /api/propostas/cadastro recebe pedido e escopo fechado entrega/contato; servidor resolve faturado/cliente e endereço referenciado, com projeção explícita; contato não consulta endereço nem devolve documento; entrega interna e modal de e-mail migrados |
| Pagamentos | POST /api/propostas/pagamentos recebe até 200 pedidos/lote e paginação de até 500 linhas; retorna somente id_int/status, preservando status != CANCELADO e a regra existente do selo PAGO |
| Fundo PWA | POST /api/fundo/publicar e /remover nas duas Edge Functions, ponte da estação e frontend; perm_admin_edit obrigatória no servidor; autoria não vem do navegador |
| Privilégios de fundo | UP/DOWN para revisão do parceiro, baseline separado por função; revogação de PUBLIC/anon/authenticated, service_role preservada; rollback reabre somente remover ao público |
| Contratos pendentes | Documento concreto para revisão do Vibe, sem envio externo automático |

Na nuvem, a identidade vem do JWT no gateway com verificação habilitada e da grade consultada no servidor. Na estação, o código é validado localmente e revalidado na Edge Function junto do segredo do agente. Nenhuma service role é enviada ao navegador/estação. Fundo exige perm_admin_edit explicitamente verdadeira na grade; o rótulo admin sozinho não concede essa ação.

Falha nas rotas não volta ao PostgREST anon. Cadastro inexistente é distinto de erro de consulta: entrega mostra erro visível, e o modal alerta sobre falha ao obter e-mail. A consulta de pagamentos descarta resultado parcial em caso de falha; a regra financeira de classificação não foi alterada. A paginação entre requisições não constitui um snapshot transacional do banco.

A publicação do fundo mantém o upload existente no Storage e substitui a RPC de metadados por rota autenticada. As policies de Storage não foram alteradas nem validadas contra produção nesta entrega. A leitura pública do fundo permanece. A rota de publicação valida caminho fundo-pwa/<versão>.jpg, enquadramento e véu entre 0,20 e 0,85 conforme o SQL local existente. Falha após upload pode deixar arquivo sem publicação, como no fluxo anterior.

## Ordem do trabalho restante

1. Vibe revisa [pendências de contrato](pendencias-contratuais-vibe-2026-09-07.md) e envia corpos dos triggers, vínculo modelo/briefing, revisão de arte e migration de idempotência. A estrutura de propostas_os_setores ainda precisa ser fornecida.
2. Imposition fecha projeções e operações por funcionalidade para propostas_os_setores, produtos_proposta, pedidos_modelos, pedidos_artes e propostas_chat. Escreve as quatro novas RPCs como SQL revisável e migra o portal e os consumidores internos dessas tabelas. Essa parte ainda não está implementada; os triggers com efeitos sobre propostas/financeiro impedem tratar as escritas como simples troca de URL.
3. Validar localmente consulta e mutação com os contratos finais: autorização, link revogado, revisão obsoleta, vínculo errado, duplicidade, concorrência, rollback e erro de trigger. O parceiro testa o SQL no ambiente autorizado, incluindo ciclo UP/DOWN. Os testes atuais não substituem essa etapa.
4. Preparar publicação compatível das duas Edge Functions e do frontend; revisar distribuição das estações. Deploy e build do agente não foram executados. O build empacota segredos e limpa saídas; exige autorização específica para esses efeitos conforme AGENTS.md.
5. Validar painel com sessão Vibe, estações efetivamente atualizadas e portal com link. Só então confirmar ao Vibe a retirada de anon nas tabelas correspondentes. O fundo pode ser fechado separadamente depois da validação de seus consumidores. O marcador da migration continua desabilitado por padrão.
6. Após estabilização, versionar as quatro RPCs atuais a partir do DDL conferido, sem alterar sua lógica, no fluxo do repositório do parceiro.

Janela acordada: 10–15 dias úteis a partir do alinhamento dos contratos. Não foi fixada data de publicação nem declarado início da janela enquanto as definições acima permanecem abertas.

## Arquivos desta execução

- supabase/functions/_compartilhado/fundo.ts e fundo_test.ts: comandos administrativos e testes.
- supabase/functions/_compartilhado/propostas.ts e propostas_test.ts: cadastro e pagamentos, somados às rotas anteriores.
- supabase/functions/painel/index.ts e acesso-estacao/index.ts: registro das operações e autenticação.
- propostas_api.py: ponte local de propostas/cadastro/pagamentos/fundo, reutilizando o canal existente.
- frontend/supabase-config.js e script.js: transporte, paginação e consumidores.
- tests/propostas_sem_anon_harness.js, test_propostas_sem_anon.py e pagamento_do_pedido_harness.js: regressões do transporte e preservação da regra de pagamento.
- sql/revisao_vibe e documentos relacionados: estado atualizado e material para revisão.

As alterações preexistentes de app.py, db.py e demais trabalhos paralelos foram preservadas. Não houve commit, push, deploy, build do agente, acesso a dados reais nem aplicação de SQL.

## Validação desta execução

- Deno: 19 testes aprovados em propostas_test.ts e fundo_test.ts, sem permissões de rede ou leitura de segredos. Compilação das duas Edge Functions aprovada com test --cached-only --no-run.
- Python: 27 testes aprovados em test_propostas_sem_anon.py, test_dados_de_entrega.py, test_coluna_pagamento.py e test_painel_edge_function.py. Incluem execução de 14 cenários Node de transporte/paginação. Não somar esses cenários novamente ao total Python.
- node --check de script.js e supabase-config.js aprovado. git diff --check sem erros; avisos de conversão LF/CRLF do Git. TestClient emitiu aviso de depreciação do transporte httpx; dependências preservadas.
- Busca literal por chamadas SDK .from nas fontes frontend/*.js: zero para propostas, clientes, enderecos e pagamentos_v2. Permanecem 6 chamadas para produtos_proposta, 20 para pedidos_modelos, 37 para pedidos_artes e 7 para propostas_chat. A contagem é de pontos de chamada, não de operações nem tabelas únicas. Não cobre nomes passados por variável, fetch/REST, cópias painel/ ou versões instaladas nas estações; propostas_os_setores usa nome por variável e continua no escopo pendente.
- Não foi executada a suíte inteira, navegador real, integração Supabase nem ciclo PostgreSQL UP/DOWN. A falha CSS anteriormente documentada fora desta tarefa não foi corrigida nem revalidada aqui.

Esses resultados comprovam as verificações locais listadas, não que os consumidores em produção foram atualizados. Nenhuma tabela está liberada para revogação por este documento.
