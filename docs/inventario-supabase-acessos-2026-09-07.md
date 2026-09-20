# Inventário de acessos Supabase — Imposition

Levantamento estático em 07/09/2026, sobre a árvore local da branch `main`, base `a306ff06`, incluindo alterações preexistentes. Não comprova a versão publicada nem os grants, policies, funções ou credenciais efetivamente instalados. Não houve acesso ao banco, leitura de arquivos de segredos, execução de SQL ou alteração da aplicação.

## Aviso para a equipe do banco

**O Imposition depende de `propostas` e `pagamentos_v2`. Coordenar a substituição dos acessos anônimos antes de revogá-los.**

| Alvo anunciado | Dependência encontrada | Efeito previsto da retirada de acesso |
|---|---|---|
| `propostas` | Leitura e UPDATE diretos no navegador; leitura/escrita também no backend; leitura pela RPC do portal | Pedidos, dados comerciais, status e acabamento podem perder informações ou deixar de gravar nos caminhos sem sessão Supabase |
| `pagamentos_v2` | SELECT direto de `id_int, status` em `carregarPagamentosGlobais()`; leitura de cobranças pela RPC `link_cliente_pedido` | A coluna de pagamento pode ficar sem informação; a função captura o erro e registra aviso no console |
| `boletos` | Nenhuma consulta encontrada no código operacional inspecionado ou nas definições das RPCs do portal | Sem dependência identificada; não é garantia sobre versões antigas ou funções remotas não presentes aqui |
| `movimento_credito` | Nenhuma consulta encontrada no mesmo escopo | Mesma ressalva |

Evidências centrais: `frontend/script.js:25918`, `:26138`, `:26151`; `frontend/acabamento.js:3846`; `sql/link_cliente_pedido.sql:105`, `:296`.

A lista das 25 views revogadas e das aproximadamente 36 RPCs candidatas não foi fornecida. Não foi possível cruzar nominalmente essas listas. A view `imposition_operadores` é usada em `frontend/acabamento.js:1415` e `frontend/avisos.js:244`.

## Qual credencial vai em cada caminho

| Caminho | Credencial configurada / autorização |
|---|---|
| Navegador: `supabaseClient` e `vibeClient` | Um único cliente criado com `VIBECODE_ANON_KEY`; `vibeClient` é alias. Sem sessão Auth, usa a chave pública como bearer. Com sessão, usa o JWT do usuário como bearer |
| Login local por código | A sessão própria do NewProd fica em `sessionStorage`; esse fluxo não cria uma sessão Supabase. `aplicarAcessoLocal()` chama `loadAll()`. Havendo cliente Supabase e rede, as consultas diretas podem sair como `anon` |
| Portal do cliente | Número + token do link nas RPCs; não exige login Supabase. Portanto há dependência de execução por `anon`, além das consultas e escritas diretas do portal |
| Python, catálogo e relay | `db.SUPABASE_KEY` nos cabeçalhos `apikey` e `Authorization`; configuração orientada a anon (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Não há JWT de usuário nesse helper |
| Python, operações privilegiadas | `SUPABASE_SERVICE_KEY`, em helpers separados; não foi verificada sua presença ou seu valor no ambiente |
| Edge Functions, acesso ao banco | Helper `banco()` usa `SUPABASE_SERVICE_ROLE_KEY`; a credencial recebida na entrada da função é distinta da usada por ela no banco |
| Sincronização de operadores da estação | Caminho principal chama `acesso-estacao` com `X-Agente-Segredo`; a função acessa o banco com service role. Existe fallback legado de leitura direta com a chave pública |

Fontes: `frontend/supabase-config.js:15`, `:16`; implementação `_getAccessToken()` no SDK local `frontend/supabase-js.min.js`; `frontend/script.js:22505`, `:22577`; `frontend/cliente.js:1218`; `db.py:225`, `:267`, `:1442`; `agent_worker.py:78`, `:253`, `:786`; `supabase/functions/_compartilhado/banco.ts:44`.

O modo offline que desativa o cliente não consulta o Supabase. No executável Python, `IS_SUPABASE_ACTIVE` é desativado para o catálogo local; isso não elimina as chamadas independentes do relay, sincronização e navegador. Classificar uma requisição apenas pela anon key usada em `createClient()` confundiria acessos anônimos e autenticados.

## Tabelas e views acessadas diretamente pelo navegador

Todas as linhas abaixo usam o cliente público descrito acima: **anon sem sessão / JWT do usuário com sessão**. As operações são chamadas encontradas, não confirmação de permissão ou sucesso no banco. SELECT de retorno de uma escrita não é tratado como consulta independente. As referências são exemplos para localizar os fluxos, não todas as ocorrências.

| Relação | Operações encontradas | Evidência local |
|---|---|---|
| `catalogo_fontes` | SELECT | `frontend/supabase-config.js:122` |
| `clientes` | SELECT | `frontend/script.js:32679`, `:40608` |
| `enderecos` | SELECT | `frontend/script.js:32683` |
| `imposition_avisos` | SELECT, INSERT, UPDATE | `frontend/avisos.js:190`, `:923`, `:928` |
| `imposition_avisos_leituras` | SELECT, INSERT | `frontend/avisos.js:212`, `:639` |
| `imposition_fundo_pwa` | SELECT; escrita por RPC abaixo | `frontend/fundo-do-app.js:187` |
| `imposition_operadores` (view) | SELECT | `frontend/acabamento.js:1415` |
| `imposition_tempo_no_card` | SELECT, UPSERT | `frontend/script.js:28933`, `:29027` |
| `pagamentos_v2` | SELECT | `frontend/script.js:25929` |
| `pedidos_artes` | SELECT, INSERT, UPDATE | `frontend/cliente.js:1404`, `:1550`, `:1735` |
| `pedidos_bancos` | SELECT, INSERT, UPDATE, DELETE | `frontend/script.js:1154`, `:1349`, `:1390`, `:18021` |
| `pedidos_links_cliente` | SELECT, INSERT, UPDATE | `frontend/script.js:25850`, `:40058`; `frontend/cliente.js:2241` |
| `pedidos_modelos` | SELECT, INSERT, UPDATE | `frontend/acabamento.js:1510`, `:7059`; `frontend/script.js:26697` |
| `pedidos_modelos_banco` | SELECT, UPSERT, DELETE | `frontend/script.js:1161`, `:1421`, `:1429` |
| `print_agents` | SELECT, UPDATE | `frontend/script.js:41067`, `:44945` |
| `print_queue` | INSERT | `frontend/script.js:41570`, `:42860` |
| `producao_combinacoes` | INSERT | `frontend/script.js:20799` |
| `producao_config` | SELECT, UPSERT | `frontend/script.js:20420`, `:20720` |
| `producao_cores` | SELECT, INSERT, UPDATE, DELETE | `frontend/script.js:1732`, `:3404` |
| `producao_formatos` | SELECT, INSERT, UPDATE, DELETE | `frontend/script.js:1732`, `:2440` |
| `producao_mapas_teatro` | SELECT, INSERT, UPDATE, DELETE | `frontend/mapas.js:133`, `:255`, `:288`, `:350` |
| `producao_modelos_imposicao` | SELECT, INSERT, UPDATE, DELETE | `frontend/script.js:1732` |
| `producao_numeracoes` | SELECT, INSERT, UPDATE, DELETE | `frontend/script.js:1732`, `:4291`, `:4358` |
| `producao_ordens_servico` | SELECT, UPDATE | `frontend/cliente.js:1459`; `frontend/cliente-confirmacoes.js:346` |
| `producao_produtos_combinaveis` | SELECT, UPSERT | `frontend/script.js:20422`, `:20615` |
| `producao_saidas` | SELECT, INSERT, UPDATE, DELETE | `frontend/script.js:1732`, `:2609` |
| `producao_usuarios` | SELECT | `frontend/script.js:27097` |
| `producao_volume_itens` | SELECT por relacionamento, INSERT, UPDATE, DELETE | `frontend/acabamento.js:4626`, `:5916`, `:6146`, `:6206` |
| `producao_volumes` | SELECT, INSERT, UPDATE, DELETE | `frontend/acabamento.js:4618`, `:5028`, `:5930`, `:6223` |
| `produtos` | SELECT | `frontend/cliente.js:1299`; `frontend/script.js:1967` |
| `produtos_proposta` | SELECT, UPDATE | `frontend/acabamento.js:3007`; `frontend/script.js:35520`, `:35535` |
| `propostas` | SELECT, UPDATE | `frontend/acabamento.js:1452`, `:3846`; `frontend/script.js:26138` |
| `propostas_chat` | INSERT | `frontend/cliente-confirmacoes.js:330`; `frontend/cliente.js:1561` |
| `propostas_os` | SELECT | `frontend/acabamento.js:3205`; `frontend/script.js:26200` |
| `propostas_os_setores` | SELECT, INSERT, UPDATE | `frontend/acabamento.js:3102`, `:3194`, `:3215` |
| `usuarios` | SELECT | `frontend/script.js:22929`, `:27090` |

São 36 relações identificadas no frontend, incluindo a view e a leitura por relacionamento. O helper `api()` monta dinamicamente os cinco nomes de catálogo com prefixo `producao_`; eles estão incluídos. Não foi consultado o catálogo remoto para confirmar a natureza de cada outra relação.

As leituras de `clientes` e `enderecos` merecem entrar na coordenação do fechamento: há `select('*')` no navegador. O levantamento comprova a chamada no código, não que ela continue autorizada para anon no banco atual.

## RPCs chamadas pelo navegador

| Função / assinatura local | Autorização e efeito previstos no código | Chamada |
|---|---|---|
| `link_cliente_abrir(text, text)` | Anon no portal; valida número + token + link ativo; lê o link e atualiza contagem/acesso | `frontend/cliente.js:1218` |
| `link_cliente_pedido(text, text)` | Anon no portal; valida número + token + link ativo; retorna dados do pedido, orçamento, entrega e cobranças | `frontend/cliente-dados.js:45` |
| `link_cliente_status(text, text, text)` | Anon no portal; valida vínculo e status permitido; atualiza o status da arte do link | `frontend/cliente.js:1123` |
| `link_cliente_visto(text, text)` | Anon no portal; valida vínculo; registra abertura em links e artes | `frontend/cliente.js:1080` |
| `publicar_fundo_do_pwa(text, numeric, text, text, text)` | Cliente do painel; desativa fundo anterior e insere publicação | `frontend/script.js:45389` |
| `remover_fundo_do_pwa()` | Cliente do painel; desativa o fundo | `frontend/script.js:45421` |

Os SQLs locais das quatro funções `link_cliente_*` usam `SECURITY DEFINER`. A revogação de SELECT da tabela para anon não equivale, por si só, a retirar a leitura interna dessas funções; dependem do proprietário, grants e definição efetivamente instalados. **Retirar EXECUTE de anon dessas quatro RPCs interrompe o portal sem login.**

Dependências internas identificadas na RPC `link_cliente_pedido`: `pedidos_links_cliente`, `propostas`, `clientes`, `enderecos`, `empresas`, `propostas_os`, `pedidos_artes`, `cotacao_frete`, `produtos_proposta`, `produtos`, `pagamentos_v2`. `empresas` e `cotacao_frete` são dependências indiretas adicionais à lista do navegador. As demais RPCs do link acessam `pedidos_links_cliente` e, no caso de `link_cliente_visto`, também `pedidos_artes`.

Fontes SQL: `sql/link_cliente_funcoes.sql`, `sql/link_cliente_pedido.sql`, `sql/link_marca_quando_o_cliente_abre.sql`, `sql/link_cliente_status_aceita_em_alteracao.sql`. Há ainda `sql/link_cliente_devolver_o_anon.sql` com grants explícitos para as quatro funções; a existência do arquivo não comprova aplicação remota.

**Pendência de revisão encontrada:** as duas RPCs de fundo em `sql/fundo_do_pwa.sql:90` e `:121` são `SECURITY DEFINER`, recebem EXECUTE para `public` e seus corpos não validam identidade/permissão. A proteção de botões no frontend não constitui validação dessas funções. Esse achado é sobre o SQL versionado; não foi alterado nem confirmada sua versão no banco. Elas precisam de tratamento diferente das RPCs do link, que verificam um token.

## Backend Python e agente

| Caminho / credencial | Relações e operações encontradas |
|---|---|
| `db.py`, helper com `SUPABASE_KEY` (anon prevista) | CRUD de `producao_formatos`, `producao_numeracoes`, `producao_saidas`, `producao_cores`, `producao_modelos_imposicao`, `producao_mapas_teatro`; SELECT de `producao_ordens_servico`; SELECT/UPDATE de `producao_os_itens`; SELECT de `catalogo_fontes` |
| `db.py`, herança inicial de configuração, mesma chave | SELECT de `producao_print_config` e `producao_config_impressora` (`:1492`) |
| `db.py`, `SUPABASE_SERVICE_KEY` | SELECT/INSERT/UPDATE/DELETE de `imposition_user_permissions` e `imposition_acessos_locais` via helpers administrativos (`:1679` em diante) |
| `agent_worker.py`, `db.SUPABASE_KEY` | UPSERT de `print_agents` (`:253`); SELECT/UPDATE de `print_queue`; SELECT de `catalogo_fontes` (`:571`); fallback SELECT de `imposition_acessos_locais` (`:800`) |
| `acesso_api.py`, `SUPABASE_SERVICE_KEY` | Acesso a `pedidos_modelos`, `producao_numeracoes`, `propostas`, `producao_acesso_credenciais`, `producao_acesso_eventos`, `producao_acesso_pedidos`, `producao_acesso_setores`; leitura e escrita conforme rota |

O router `acesso_api.py` é condicional à disponibilidade da chave de serviço; sua presença no repositório não comprova execução em produção. A estação usa o canal de Edge Functions para operações privilegiadas. O fallback legado de operadores não justifica reabrir `imposition_acessos_locais`: deve-se preservar o caminho principal com autenticação do agente.

## Edge Functions — banco com service role

Todas as relações abaixo são alcançadas através do helper com `SUPABASE_SERVICE_ROLE_KEY`. Há leitura e escrita conforme a rota; esta lista não solicita liberar anon nelas.

| Área | Relações identificadas | Fontes |
|---|---|---|
| Administração e catálogo | `imposition_user_permissions`, `imposition_acessos_locais`, `imposition_segredos`, `catalogo_fontes`, `producao_ordens_servico`, `producao_os_itens` | `painel/index.ts`, `_compartilhado/sessao.ts`, `_compartilhado/segredos.ts`, `_compartilhado/fontes.ts`, `acesso-estacao/index.ts` |
| Pedido, cliente, modelos e pesos | `clientes`, `propostas`, `propostas_os`, `propostas_os_setores`, `pedidos_modelos`, `pedidos_artes`, `producao_numeracoes` | `acesso-conta/index.ts`, `acesso-interno/index.ts`, `_compartilhado/pedidos.ts`, `_compartilhado/pesos.ts`, `arquivo/index.ts` |
| Controle de acesso e portaria | `producao_acesso_bloqueios`, `producao_acesso_contas`, `producao_acesso_credenciais`, `producao_acesso_dispositivo_setores`, `producao_acesso_dispositivos`, `producao_acesso_entradas_unicas`, `producao_acesso_eventos`, `producao_acesso_falhas_pareamento`, `producao_acesso_leituras`, `producao_acesso_pedidos`, `producao_acesso_setores` | `portaria/index.ts`, `acesso-*/index.ts`, `_compartilhado/configuracao.ts`, `_compartilhado/contas.ts`, `_compartilhado/vinculo.ts`, `_compartilhado/relatorio.ts` |

Os caminhos da tabela são relativos a `supabase/functions/`. A RPC adicional **`acesso_usuario_por_email`** é chamada com service role em `_compartilhado/auth_admin.ts:62`; não é uma chamada direta anon do navegador. `acesso-conta/index.ts:206` também usa a anon key no fluxo Auth, separado do acesso às tabelas pelo helper privilegiado.

## Storage e ferramentas auxiliares

Storage é separado das tabelas/views de negócio. Buckets nomeados encontrados no frontend: `artes`, `chat-ideal`, `amostras_renderizadas`, `print_jobs`, `app-imagens` e fallback `imposicao-storage`. Há uploads e obtenção de URL; `app-imagens` também tem listagem e remoção. O cliente segue a mesma regra anon/sessão. URLs públicas podem ser carregadas sem cabeçalhos de API. Também há seleção dinâmica de bucket por metadados dos arquivos ou opções de upload.

Exemplos: `frontend/script.js:8917`, `:37373`, `:38829`, `:41565`, `:44649`, `:44754`; `frontend/acabamento.js:7482`. Esses nomes de buckets não foram contados como tabelas.

Ferramentas manuais encontradas: `ferramentas/conferir_paginas_pdf.py` lê `pedidos_modelos` com `db.SUPABASE_KEY`; `ferramentas/estacoes.py` lê `print_agents` com a mesma chave; `ferramentas/limpar_estacoes.py` lê com chave pública e usa `SUPABASE_SERVICE_KEY` na exclusão. Nenhuma foi executada. Scripts históricos em `scripts/migracoes/`, rascunhos em `scratch/`, testes, dependências e cópias empacotadas não constituem o inventário do fluxo operacional atual e não foram certificados como compatíveis com o fechamento.

## Limites e próximos passos de coordenação

- Comparar este inventário com os nomes exatos das views/RPCs candidatas e com a versão efetivamente publicada, incluindo agentes instalados.
- Preparar a substituição dos acessos diretos de `propostas` e `pagamentos_v2` nos fluxos sem sessão antes da revogação. A necessidade de coordenação não é uma recomendação de manter dados pessoais abertos indefinidamente.
- Preservar a funcionalidade das quatro RPCs do portal com sua validação de vínculo, ou preparar uma rota substituta antes de retirar EXECUTE de anon.
- Revisar as escritas diretas e as RPCs de fundo como tarefas de implementação próprias. Este levantamento não modificou autenticação, permissões ou regras de negócio.
- Validar posteriormente os caminhos de painel com Auth, estação com código local e portal sem sessão, incluindo link inválido/revogado e usuário sem permissão, em ambiente e escopo autorizados.

Validação realizada: busca estática de chamadas SDK/REST/RPC, resolução dos nomes dinâmicos principais, separação de Storage, leitura dos helpers de credenciais e dos SQLs do portal/fundo. Não foram executados testes de integração, builds, deploys ou consultas a dados reais.
