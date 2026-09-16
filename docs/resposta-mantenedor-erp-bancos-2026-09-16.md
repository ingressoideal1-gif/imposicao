# Resposta ao mantenedor do ERP — bancos de dados variáveis

Preparada em 16/09/2026. Não contém segredos nem dados de clientes. Ainda não enviada automaticamente.

## Texto para encaminhar

Oi,

Obrigado pelo levantamento e pela confirmação sobre pagamentos. Registrei a regra operacional: antes de qualquer novo REVOKE, ENABLE RLS ou DDL em tabela usada pelo ERP, vou apresentar alvo, efeito e janela e aguardar seu ok. Não executei nenhuma nova alteração nessas tabelas depois do seu pedido.

Sobre `pedidos_bancos` e `pedidos_modelos_banco`, há dois consumidores diferentes do nosso lado:

1. O portal público do cliente já está no caminho correto. O arquivo publicado `cliente-dados.js` chama `link_cliente_bancos_modelos(numero, token)` e não acessa diretamente nenhuma das duas tabelas. Conferi também a função instalada: SECURITY DEFINER, search_path `pg_catalog, public`, EXECUTE para anon/authenticated e dono postgres. Os testes locais cobrem token vazio/incorreto, vínculo entre pedido/modelo/banco e ausência de leitura direta. Esse fluxo deve continuar funcionando depois do fechamento das tabelas.

2. O painel operacional/NewProd ainda não está pronto para o fechamento. O `script.js` publicado lê `pedidos_bancos` por `id_int`, lê `pedidos_modelos_banco` pelos IDs dos bancos e usa o conteúdo para amostra, montagem e impressão. O mesmo módulo também cria, atualiza, renomeia, exclui bancos e altera o vínculo de modelos. Na nuvem há sessão Supabase; nas estações o painel local pode operar com código local e sem sessão Supabase, que explica as leituras anon observadas.

O que falta é transferir essas operações para dois caminhos com a mesma validação:

- painel web: Edge Function `painel`, com JWT e permissão interna;
- NewProd: agente local encaminhando à Edge Function `acesso-estacao`, com segredo do agente e código ativo do operador.

O backend usará service role somente dentro da Edge Function. A chave não irá ao navegador nem à estação. A leitura será limitada ao `id_int` solicitado e os vínculos serão conferidos contra bancos/modelos do mesmo pedido. Escritas exigirão permissão de edição e confirmação de uma linha retornada; lista vazia não será tratada como sucesso.

Não feche `pedidos_bancos` nem `pedidos_modelos_banco` ainda. A sequência segura é: implementar e testar as rotas; publicar o painel/Edge Functions; distribuir o NewProd; comprovar que as estações receberam a versão; observar ausência de tráfego anon direto; então eu apresento a migração exata e aguardo seu ok para a janela de fechamento.

Estimativa para deixar código e testes prontos: 2 dias úteis. A data do fechamento depende da instalação confirmada nas estações. Assim que a versão compatível estiver publicada, envio os identificadores de versão e o critério objetivo para você conferir em `pg_stat_statements`.

Sobre `producao_ordens_servico`: no snapshot atual de 16/09, a tabela já está com RLS ativa, anon sem SELECT/INSERT/UPDATE/DELETE e policy para authenticated. As duas leituras anon de 14/09 são histórico. Mesmo assim, o `script.js` publicado ainda contém chamadas diretas; vou migrá-las junto para retirar a dependência do modo local sem sessão e evitar regressão quando a tabela passar a ter dados.

Sobre as demais `producao_*`: não vou pedir fechamento em lote. Vou separar as que não têm consumidor atual das que têm tráfego vivo e apresentar cada mudança antes da execução.

## Evidências usadas

- Produção pública, com cache-buster: `cliente-dados.js` respondeu HTTP 200, contém a chamada RPC e não contém `.from('pedidos_bancos')` ou `.from('pedidos_modelos_banco')`.
- Produção pública, com cache-buster: `script.js` respondeu HTTP 200 e contém 8 referências diretas a pedidos_bancos, 3 a pedidos_modelos_banco e 12 a producao_ordens_servico.
- Snapshot `20260916T111101616Z-e7228e90-metadados.json`: pedidos_bancos e pedidos_modelos_banco sem RLS e com privilégios amplos para anon/authenticated; producao_ordens_servico com RLS ativa, anon sem privilégios e policy ALL para authenticated.
- RPC instalada `link_cliente_bancos_modelos(text,text)`: SECURITY DEFINER, dono postgres, search_path fixo, EXECUTE para anon/authenticated/service_role.
- `node tests/portal_bancos_harness.js`: aprovado. O harness de navegador não rodou neste worktree por ausência de Puppeteer; nenhuma dependência foi instalada para contornar isso.

## Critério de liberação futura

O fechamento das duas tabelas só será apresentado para aprovação quando todos os itens estiverem comprovados:

- zero leitura/escrita direta dessas tabelas no frontend publicado;
- painel web funcionando com usuário interno autorizado;
- estação funcionando com código local ativo e sem sessão Supabase;
- criação, atualização, vínculo, impressão e exclusão testados com dados sintéticos;
- versão NewProd disponível e instalação confirmada nas estações;
- telemetria sem tráfego anon direto durante a janela combinada;
- SQL pequeno, transacional, com baseline e pós-verificação, apresentado antes da execução.

## Complemento após a divergência e a proposta de contenção

A divergência de `producao_ordens_servico` foi esclarecida no histórico de migrations do próprio e-deal. Existe a migration versão `20260915152859`, nome `rls_producao_e_backup_artes_sem_anon`, `created_by=everton.prd@gmail.com`. O conteúdo registrado menciona a tabela, habilita RLS, cria `producao_ordens_servico_all_authenticated` e revoga privilégios de anon. Ela não foi aplicada por esta auditoria: os SQL remotos executados aqui atingiram somente `public.pagamentos_v2`. Todos os snapshots desta auditoria, iniciados em 16/09 às 07:14 -03:00, já encontraram a migration aplicada. O levantamento anterior pode, portanto, ser compatível se ocorreu antes dessa migration. O campo de versão registra a ordem da migration; não usei esse número sozinho como prova de fuso horário ou de horário de execução.

A estação local também **pode escrever sem sessão Supabase**. O `script.js` tem caminhos diretos para INSERT/UPDATE/DELETE em `pedidos_bancos` e UPSERT/DELETE em `pedidos_modelos_banco`. A telemetria não observou essas escritas, mas o recurso existe. Assim, a hipótese “a estação só lê” não é verdadeira; revogar escrita anon pode impedir gerenciamento de bancos no NewProd.

Há uma contenção possível com impacto conhecido: durante a transição, criar/editar/vincular/excluir bancos somente no painel web autenticado e retirar de anon INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER e MAINTAIN das duas tabelas, mantendo SELECT temporariamente. A proposta local `06_bancos_conter_escrita_anon.proposta.sql`, SHA-256 `7CF8FDF2CF81736F7DE5386C922DA3BC833D5D3970C1E89C51A86098114378D7`, faz exatamente isso, com transação, marcador de aprovação, baseline e comparação dos ACLs de outros papéis. Passou em quatro cenários PostgreSQL 17.5 com dados sintéticos. **Não foi aplicada**: agora aguarda o ok do mantenedor e a aceitação explícita da limitação temporária do NewProd.

Essa contenção reduz destruição e adulteração, mas não resolve o vazamento de `csv_data`. O SELECT anon só pode cair quando o NewProd tiver um caminho protegido ou quando a operação aceitar suspender temporariamente no NewProd leitura, amostra e impressão de trabalhos que usam banco do pedido. Não há policy capaz de distinguir um `id_int` legítimo de outro quando ambos chegam com a mesma identidade anon.

O painel web pode migrar para a Edge Function antes do NewProd, e isso será feito em uma etapa separada. Ainda assim, simplesmente manter acesso para `authenticated` não basta como solução final: o Auth é compartilhado com o ERP, portanto sessão válida não prova que a pessoa pertence à gráfica. A Edge Function precisa conferir a permissão interna do Imposition. Depois disso, o frontend web deixa de depender de grants diretos; a retirada de SELECT anon continua condicionada à estação.

Resposta objetiva proposta ao mantenedor:

> A migration conflitante existe no histórico do e-deal: `20260915152859_rls_producao_e_backup_artes_sem_anon`, criada por `everton.prd@gmail.com`. Não foi aplicada por esta auditoria; os snapshots de 16/09 já a encontraram. Sobre bancos, a estação também escreve sem sessão, embora a telemetria não tenha registrado uso. Preparei a contenção que mantém SELECT e retira toda escrita/admin de anon, mas não vou aplicá-la sem seu ok e sem combinarmos que a gestão de bancos ficará temporariamente só no painel web. Ela reduz adulteração, porém o dado pessoal continua legível. Para retirar SELECT, priorizarei a ponte do NewProd; o painel web pode migrar antes, mas só isso não elimina a dependência anon da estação. Enviarei a mudança e a janela antes de qualquer execução.
