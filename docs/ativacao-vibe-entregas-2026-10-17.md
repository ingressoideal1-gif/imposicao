# Ativação real do Vibe Entregas — prévia revisável

Base web v1073. Implementação isolada em `feat/vibe-entregas-ativacao-20261017`.
Estado atual: banco implantado e conferido; Edge Function publicada com Google
desativado. Ativação do adaptador web preparada para publicação. A tentativa
recusada anterior está registrada abaixo como histórico.

## Alvo e impacto

Supabase de produção `vwbtitjlpelrcnsytzqw` (ERP e-deal).
Confirmar identidade e consultar metadados antes de executar qualquer escrita.

1. `sql/vibe_entregas_proposta.sql`: três tabelas novas (`vibe_entregas_acessos`,
   `vibe_entregas_registros`, `vibe_entregas_tentativas`), funções RPC, RLS e
   bucket privado `vibe-entregas-comprovantes` com políticas específicas.
2. `sql/vibe_entregas_rotas_proposta.sql`: tabela `vibe_entregas_rotas`, índice
   e funções para reserva, confirmação e acompanhamento de rotas.
3. Nenhuma coluna, trigger ou política das tabelas comerciais existentes será
   modificada. A implantação não altera pedidos: zero registros comerciais.
   Cria um registro em `storage.buckets`. Cadastros de acesso ficam vazios até
   receber a lista explícita de usuários e empresas autorizados.
4. Durante o uso, a confirmação grava comprovante e atualiza somente a proposta
   selecionada por UUID e autorizada por empresa, para `ENTREGUE`, além da data
   de entrega da expedição vinculada quando existente. Uma proposta e no máximo
   uma expedição por confirmação; duplicidade de expedições causa recusa.

## Ordem de ativação

- Autorização recebida: criar estruturas próprias, gestores são os ADM e
  entregadores serão cadastrados depois. `ve_e_gestor()` consulta em tempo real
  `imposition_user_permissions` (`role=admin` e `perm_admin_view=true`), como a
  tela administrativa. Não replica gestores nem transforma ADM em entregador.
  O acompanhamento segue o âmbito administrativo global do Imposition;
  entregadores continuam restritos às empresas explicitamente cadastradas.
- Consultar apenas metadados: colunas/tipos, objetos já existentes, triggers
  das tabelas comerciais, permissões e políticas de Storage que possam abranger
  o novo bucket. Se houver conflito, parar antes da implantação.
- Cada script SQL já contém BEGIN/COMMIT. Executar sequencialmente e conferir
  objetos, permissões e RLS ao final de cada transação. Uma falha deve reverter
  a respectiva transação. Não repetir cegamente após timeout: consultar o estado.
- Provisionar apenas contas e empresas informadas, em transação, comparando
  a prévia de identidades e verificando os registros retornados após gravar.
- Validar leitura autenticada e recusa de usuário sem acesso. Não concluir um
  pedido real como teste; a primeira entrega operacional requer acompanhamento.
- Só então ativar o adaptador web e publicar. Fotos e pedidos reais não entram
  no cache offline. Testar câmera em dispositivo e uso autenticado.
- Otimização Google depende de chave restrita, faturamento/cotas e habilitação
  explícita do serviço. Não enviar a chave pelo chat. A navegação simples pelo
  Google Maps permanece independente dessa API.

## Recuperação

Antes do commit SQL, falhas revertem a transação. Após implantação, interromper
o acesso pelo adaptador web e desativar a Edge Function de rotas; preservar
tabelas, histórico e comprovantes. A desativação de acessos deve usar usuários
e empresas explicitamente selecionados, com prévia e validação posterior.
Não apagar objetos ou dados. Não reverter automaticamente pedidos entregues:
qualquer correção comercial exige análise do pedido específico e do ERP.

## Pendências externas

Autorização das estruturas próprias; lista de contas/empresas; acesso de
gerenciamento ao projeto; configuração Google para a etapa de otimização.
Os scripts e testes locais não comprovam compatibilidade com triggers reais
nem autorização das contas de produção.

## Tentativa de implantação — 17/10/2026

- Projeto confirmado: e-deal, vwbtitjlpelrcnsytzqw, ACTIVE_HEALTHY.
- Identificados 5 ADM com permissão de visualização administrativa.
- Metadados e triggers existentes revisados somente em leitura. As políticas
  gerais de proteção do Storage são RESTRICTIVE; não concedem acesso ao bucket.
- Scripts base e rotas enviados juntos numa transação, com timeout de bloqueio
  de 5 segundos e limite de execução de 45 segundos.
- Recusa: SQLSTATE 42501, permission denied for schema public.
- Diagnóstico posterior: current_user/session_user = supabase_read_only_user;
  sem CREATE em public/storage e sem INSERT em storage.buckets.
- Conferência posterior: zero tabelas Vibe, helper de gestor ausente e bucket
  ausente. Hash da estrutura comercial antes/depois:
  c0c54bb3d42beb50c14a49a7bc42b276. Hash das políticas existentes de Storage:
  01417b5c619df0596fd14f8280fcbc86, também inalterado.
- Não houve cadastro de entregadores, gravação de entrega nem ativação web.
- Teste PostgreSQL em memória aprovado com ADM atual, revogação imediata do
  perfil, recusa de usuário não ADM, empresa do entregador e rollback atômico.

## Como desbloquear

Uma pessoa com administração do projeto deve disponibilizar uma credencial de
implantação com permissão para DDL e Storage. Não enviar segredo por chat.
O utilitário existente `ferramentas/configurar_acesso_rls.ps1` recebe token em
entrada oculta e armazena com DPAPI fora do Git; ele valida a identidade do projeto,
mas a permissão de escrita precisa ser conferida antes de repetir a implantação.
Não elevar a credencial somente leitura nem alterar ACLs existentes para contornar
esta recusa. Após a configuração, retomar os scripts revisados e verificar estado
antes de qualquer nova tentativa. O adaptador permanece desativado até o backend
estar implantado e conferido.

## Implantação concluída — 17/10/2026

Após configuração de credencial com permissão de escrita pelo usuário:

- Identidade confirmada e privilégios CREATE/INSERT conferidos antes do DDL.
- Scripts base e rotas aplicados juntos numa transação. Quatro tabelas criadas,
  todas com RLS e sem leitura anônima ou escrita direta por authenticated.
- Bucket privado criado, limitado a JPEG de até 10 MB. Políticas anteriores e
  estrutura de propostas/expedições mantiveram os hashes registrados acima.
- Nenhum pedido alterado, nenhuma entrega real testada e zero entregadores
  cadastrados. Gestão segue ADM + perm_admin_view, consultados em tempo real.
- Consulta SQL somente leitura sob papel authenticated e identidade ADM:
  acesso autorizado, um pedido disponível, zero rotas ativas. Testes negativos
  recusaram não ADM e entregador sem cadastro. Isso não comprova login no
  navegador com conta real nem câmera física.
- Edge Function vibe-entregas-rotas publicada, versão 1, ACTIVE, verify_jwt=true.
  Requisição ao endpoint comprovou resposta 503 de otimização desativada;
  nenhuma chamada paga ao Google foi feita.
- Adaptador web ativado; service worker passa de v2 para v3. Login fica visível
  e a mensagem inicial informa que somente entregadores cadastrados têm acesso.
- PostgreSQL em memória, cinco testes Deno, API simulada, navegador mobile/offline
  e painel ADM aprovados. Publicação web e conferência pública seguem pelo PR.

Pendências operacionais: cadastrar entregadores/empresas explicitamente;
configurar Google Routes e cotas; acompanhar primeira entrega real e validar
câmera/instalação em celular. Cadastro e redefinição de senha não são feitos
automaticamente. O acompanhamento ADM já utiliza as funções implantadas.
