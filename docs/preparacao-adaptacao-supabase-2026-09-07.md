# Preparação da adaptação de acessos Supabase

Estado em 07/09/2026: escopo autorizado para implementação local. A [primeira entrega de propostas](entrega-propostas-sem-anon-2026-09-07.md) está implementada localmente, com testes e pendências documentados. O restante deste plano ainda não está implementado. Nada foi publicado nem aplicado no banco. Complementa o [inventário](inventario-supabase-acessos-2026-09-07.md); não substitui sua fotografia do código anterior à adaptação.

## Escopo após a resposta do parceiro

Substituir os acessos diretos anônimos de leitura/escrita a `propostas`, `propostas_os_setores`, `produtos_proposta`, `pedidos_modelos`, `pedidos_artes`, `propostas_chat` e `pagamentos_v2`. Incluir as leituras de `clientes` e `enderecos` que, segundo o parceiro, já estão fechadas ao anon desde 01/09.

O portal do cliente está dentro do escopo: conservar as quatro RPCs `link_cliente_*` não basta para preservá-lo quando forem fechadas as outras tabelas. `frontend/cliente.js` ainda lê modelos, produtos e artes diretamente, grava aprovação/correção e insere mensagens. `frontend/cliente-confirmacoes.js` também insere mensagens diretamente.

Preservar as quatro RPCs existentes, conforme acordo informado pelo parceiro. Não revogar `imposition_operadores`. Não alterar valores, descontos, pagamentos, quantidades físicas TICKET, numeração ou a regra Multi-Artes. A substituição do transporte não autoriza mudanças nessas regras.

A autoria e a execução histórica de GRANT não foram apuradas. Nesta análise apenas foi identificado o arquivo SQL local; nenhum grant foi executado.

## Caminho proposto

| Consumidor | Caminho da adaptação | Autorização obrigatória |
|---|---|---|
| Painel com Supabase Auth | Rotas específicas na Edge Function `painel`, com banco acessado pelo backend | Sessão do login do Vibe validada, identidade de operador do Imposition e permissão da funcionalidade conferidas no servidor; acesso a todas as empresas do grupo |
| Estação com código local | Navegador → rota local do NewProd → Edge Function `acesso-estacao` | Operador local identificado e ativo, permissão da operação e autenticação do agente; segredo do agente permanece no processo local |
| Portal sem login | RPCs específicas adicionais, preservando as quatro já existentes | Número + token + link ativo e vínculo de cada modelo/arte ao mesmo pedido, conferidos dentro da função |

Reutilizar os canais existentes evita distribuir service role às estações. Não criar uma ponte que aceite nome de tabela, SQL, filtro PostgREST, coluna arbitrária ou corpo de UPDATE livre do navegador.

**Regra esclarecida pelo usuário/parceiro:** o login é realizado no Vibe e os operadores acessam pedidos de todas as empresas do grupo. Não existe separação por empresa no servidor, de propósito. A interpretação anterior de "empresa única" fica substituída por esta regra. Não criar outro cadastro/login, filtro obrigatório de empresa, associação operador–empresa ou vínculo operador–pedido. Reutilizar a identidade do operador e a grade existente de permissões por funcionalidade para distinguir leitura e edição. A sessão própria por código local e o token do portal continuam sendo credenciais diferentes da sessão Auth.

Segundo as informações fornecidas pelo parceiro, as 16 policies de `propostas` não mencionam empresa e permitem acesso com `using (true)` para `authenticated`; o filtro "Todas Empresas" é aplicado em JavaScript após carregar os dados. `propostas_os`, `propostas_os_setores`, `pedidos_modelos` e `produtos_proposta` não têm coluna de empresa. Estas informações foram fornecidas na conversa, sem nova consulta ao banco.

A autorização das novas rotas deve comprovar que o chamador é um operador do Imposition e verificar a permissão da funcionalidade. A anon key extraída do bundle, um identificador de usuário enviado no corpo ou uma flag de interface não comprovam essa identidade. Não acrescentar restrições por empresa nem por propriedade do pedido. As rotas devem manter o alcance atual dos operadores e limitar cada escrita à operação permitida.

O vínculo modelo/arte–pedido continua sendo conferido para manter a consistência da operação; isso não impede um operador autorizado de trabalhar em outro pedido ou empresa. No portal por link, a autorização continua restrita ao pedido validado pelo número + token + link ativo, conforme o contrato já existente.

## Contratos propostos por operação

Nomes abaixo são propostas de contrato, não endpoints/RPCs existentes. Tipos definitivos de IDs, limites e índices devem ser conferidos com o Vibe antes de criar SQL. Todo identificador de item recebido deve ser validado contra o pedido autorizado.

| Operação | Entrada / resultado necessário | Evidência atual e restrições |
|---|---|---|
| `pedidos_listar` | Filtros tipados por números, status e cliente; paginação explícita. Retorna somente identificação, nome do cliente/vendedor, status, datas, referências de cliente/faturado e frete consumidos pelo painel | `script.js:25670`, `:26138`, `:26151`, `:28585`, `:39192`, `:39203`. Não expor valores financeiros ou documentos pessoais na listagem |
| `pedidos_datas` | Lista de números → `id_int`, `created_at`, `cliente` | `script.js:9219`; dividir listas grandes em lotes sem perda de resultados |
| `pedidos_encerrados_teste` | Consulta paginada de números com `encerrado_teste_em` preenchido | `acabamento.js:1452` |
| `pedido_status_definir` | Pedido + ação de produção permitida; retorna registro/status efetivamente gravado | `script.js:34488` e `acabamento.js:3846`: `EM PRODUCAO` e `EXPEDICAO`. Não aceitar alterações de valores, cliente ou outros campos da proposta |
| `pedidos_pagamento_resumo` | Lista de números → `id_int`, `status`, excluindo `CANCELADO` como no fluxo atual | `script.js:25929`. Somente leitura; nenhuma baixa, criação ou alteração de pagamento |
| `pedido_entrega_consultar` | Número do pedido → os campos de identificação/entrega/faturamento exibidos e correções do cliente | `script.js:32656`. Resolver os vínculos de cliente e endereço no servidor; não aceitar consulta livre por ID de cliente/endereço |
| `pedido_contato_email_consultar` | Número do pedido → nome e e-mail de contato selecionado pela prioridade já usada | `script.js:40598`, `:40608`: conservar `email_financeiro`, depois `email_contato`, depois `email`; resposta não envia e-mail |
| `pedido_setores_consultar/gravar` | Pedido + setor; leitura de peso/status; comandos limitados de peso e conclusão | `acabamento.js:3102`, `:3194`, `:3215`, `:3765`. Reutilizar `lerPesos`, `gravarPeso`, `concluirSetor` de `_compartilhado/pesos.ts`, incluindo disputa na criação da linha |
| `produto_amostra_atualizar` | Pedido + ID inequívoco do produto da proposta + campos de amostra autorizados | `script.js:35505`: somente `amostra_cor_id`, `amostra_num_id`, `arte_url`, `amostra_arte_base64`. O fallback por pedido/nome pode alcançar várias linhas; não reproduzi-lo como UPDATE amplo com service role sem resolver a identidade do item |
| `pedido_modelos_consultar/salvar` | Pedido + modelo; perfis separados para produção e leitura do portal; lista explícita de campos por ação | `script.js`, `cliente.js:138`, `:1321`, `acabamento.js:7059`. Há payloads montados dinamicamente: listar os campos de cada ação antes de implementar; não repassar o objeto livre recebido do cliente |
| `pedido_artes_consultar/salvar` | Pedido + arte/modelo/versão; criação e edição específicas para equipe | `script.js` e `cliente.js`. Preservar vínculo de modelo, anexos, revisão, status e observações; não permitir trocar arte de outro pedido pelo ID |
| `pedido_mensagem_registrar` | Pedido + texto/evento permitido; autor e data definidos pelo servidor | Inserções em `propostas_chat` no painel e no portal. Definir proteção contra repetição para reenvio após falha de rede |

As projeções de modelos e artes e seus campos de escrita ainda precisam ser enumerados por ação; a lista acima não deve ser usada como autorização para aceitar JSON genérico. Modelos incluem edição de amostra, configuração e seleção de CSV, que não têm a mesma permissão que aprovar arte como cliente.

## RPCs adicionais para o portal — proposta para o Vibe

Manter intactas as assinaturas atuais de `link_cliente_abrir`, `link_cliente_pedido`, `link_cliente_status` e `link_cliente_visto`. Propor funções novas, com o prefixo abaixo sujeito a alinhamento:

| Assinatura proposta | Operação e garantias |
|---|---|
| `link_cliente_modelos(p_numero text, p_token text)` → JSON | Modelos, produtos e artes necessários à renderização daquele pedido; projeção própria para o cliente. Não devolver notas internas, tokens de terceiros ou campos comerciais não exibidos |
| `link_cliente_decidir_arte(p_numero text, p_token text, p_modelo text, p_versao text, p_decisao text, p_observacao text, p_requisicao uuid)` → JSON | Aprovação/reprovação somente do modelo e versão pertencentes ao link; atualizar os registros relacionados e mensagem em uma transação; reenvio com a mesma requisição não duplica mensagem nem aprovação |
| `link_cliente_confirmar_dados(p_numero text, p_token text, p_aba text, p_confirmado boolean, p_correcao text, p_requisicao uuid)` → JSON | Confirmação/correção de entrega ou faturamento; alterar somente as chaves próprias em `observacoes` e o estado correspondente, preservando as demais chaves. Tratar criação de linha ausente e concorrência |
| `link_cliente_finalizar(p_numero text, p_token text, p_requisicao uuid)` → JSON | Conferir no servidor as aprovações/confirmações exigidas antes de finalizar. Preservar os efeitos atuais de status e mensagem; não aceitar estado de conclusão calculado apenas pelo navegador |

O armazenamento de idempotência deve ser escolhido com o Vibe; nenhuma tabela/coluna é presumida existente. Os tipos text de modelo/versão são apenas proposta até conferir os tipos reais. Não aplicar casts ou migrações automaticamente.

O SQL deve validar token e link ativo a cada operação, inclusive quando o cliente mantém a página aberta após revogação. A decisão de arte deve conferir a versão atual para impedir aprovação de uma versão substituída. A equipe define a política de concorrência com evidência do comportamento vigente antes de mudar sua semântica.

## Falhas atuais prioritárias

`loadDadosEntregaInterno()` (`script.js:32656`) recebe apenas `data` das consultas de proposta, cliente e endereço; não verifica seus objetos `error`. O preenchimento do e-mail em `:40598` também pode continuar com dados vazios. Isso sustenta a possibilidade de falha silenciosa apontada pelo parceiro; não é confirmação de um 401 observado em produção.

A primeira entrega deve substituir essas consultas por operações autenticadas por pedido e mostrar erro de carregamento/recusa distinto de ausência de cadastro. Não reabrir as tabelas para anon como correção temporária. Preservar as alterações preexistentes do fluxo de e-mail em `app.py`, `db.py` e `script.js`.

## Testes de aceite antes da revogação

- Anon key isolada, sessão inválida/expirada ou identidade de operador não comprovada não executam as novas operações da equipe. Identidade e permissões enviadas no corpo não substituem a validação do servidor.
- Operador do Imposition com permissão funciona para pedidos de qualquer empresa do grupo; operador sem a permissão da funcionalidade é recusado. Não exigir empresa, propriedade ou associação pessoal ao pedido.
- Usar pedidos de duas empresas nos testes: o mesmo operador autorizado deve acessar ambos. Conferir que o filtro visual "Todas Empresas" permanece apenas um filtro de interface.
- Modelo/arte deve pertencer ao pedido informado na operação. O operador autorizado pode selecionar outro pedido e trabalhar nele normalmente; o portal por link continua limitado ao seu pedido.
- Estação sem sessão Supabase funciona com operador e agente válidos; código ausente, operador desativado e segredo inválido falham sem consultar/gravar dados comerciais. Credencial do agente nunca aparece na resposta ou bundle.
- Link válido acessa e altera apenas seu pedido; token errado, link revogado e modelo de outro pedido são recusados sem escrita parcial.
- Aprovar, reprovar, confirmar/corrigir dados e finalizar mantêm os efeitos atuais; falha e repetição de requisição não geram sucesso falso ou mensagem duplicada.
- Status/pesos de acabamento, parâmetros de amostra, anexos e modelos são persistidos corretamente; totais, valores, numeração, Multi-Artes e quantidade TICKET permanecem iguais.
- Listas maiores que o limite de resposta do PostgREST são paginadas; a indicação de pagamento usa exatamente o filtro atual. Recusa não vira resultado vazio de sucesso.
- Com acesso direto anon simulado como negado, testar painel com Auth, estação por código e portal por link. Busca estática final deve eliminar os acessos diretos às relações do escopo nos caminhos migrados.

Usar dados sintéticos e serviços simulados para os testes locais. A validação compartilhada depende de ambiente e autorização específicos. Não executar os módulos Python contra a nuvem como teste implícito.

## Sequência e prazo proposto

**Estimativa para negociação: 10 a 15 dias úteis, contados após o acordo dos contratos e dos responsáveis pelas entregas.** A regra de autorização está definida: login do Vibe, operador do Imposition e permissões por funcionalidade, com acesso a todas as empresas do grupo. Não é compromisso de publicação automática nem data já agendada.

| Etapa | Estimativa | Resultado revisável |
|---|---|---|
| Contratos e autorização | 2 dias úteis | Permissões por ação definidas a partir do login do Vibe; lista de campos de modelos/artes; assinaturas e responsabilidades acertadas |
| Implementação | 5 a 8 dias úteis | Rotas da equipe/estação, RPCs do portal e troca das chamadas; priorizar entrega/contato já afetados |
| Validação e implantação coordenada | 3 a 5 dias úteis | Testes, revisão do parceiro, publicação autorizada e validação dos três consumidores antes da revogação |

Publicar primeiro as rotas/RPCs compatíveis, depois frontend e agentes. Só fechar anon após confirmar que os consumidores ativos foram atualizados; publicar o frontend não atualiza automaticamente o `NewProd.exe` nem sua cópia `painel/`. Build de agente envolve limpeza e segredos e requer autorização específica para esses efeitos.

Se houver necessidade de reversão após o fechamento, usar a última versão compatível com as novas rotas ou corrigir a operação afetada. Voltar para um cliente que depende de anon não é uma reversão funcional com as tabelas fechadas. Reabrir dados não faz parte deste plano.

Tratar `publicar_fundo_do_pwa` e `remover_fundo_do_pwa` em uma entrega pequena paralela no planejamento: preservar leitura pública do fundo e exigir autorização administrativa validada no servidor para publicar/remover. Não basta retirar EXECUTE de anon se o grant para PUBLIC continuar alcançando-o; a revisão do SQL deve considerar ambos. Nenhuma alteração foi aplicada.

## Resposta sugerida ao parceiro

Obrigado pelo retorno. Vamos preservar as quatro RPCs do portal e incluir na adaptação as sete tabelas listadas, além das consultas de clientes e endereços já bloqueadas. Identificamos no código que essas consultas podem ignorar o erro; elas serão prioridade.

Propomos uma janela de 10 a 15 dias úteis após alinharmos os contratos e a divisão de implementação. O login continuará sendo o do Vibe: as rotas comprovarão a identidade do operador do Imposition e suas permissões por funcionalidade, mantendo acesso aos pedidos de todas as empresas do grupo, sem acrescentar separação por empresa. O plano cobre o painel autenticado, as estações com código local e as operações do portal que ainda usam acesso direto. Para a equipe, pretendemos reutilizar os canais de backend existentes; para o portal, vamos combinar as RPCs adicionais com validação por link.

A revogação fica condicionada à publicação e validação dos três fluxos, incluindo a atualização dos agentes. Também incluiremos a correção das duas RPCs de fundo, preservando a leitura pública. Podem enviar a lista nominal das views/RPCs para concluirmos o cruzamento. Com os contratos e responsáveis alinhados, fechamos uma data de entrega, sem depender de manter anon aberto indefinidamente.
