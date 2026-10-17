# Cadastro de entregadores corrigido (web v1077)

O SDK envia x-client-info no preflight do cadastro. A função não o autorizava,
e o navegador bloqueava o POST. Reproduzido antes da correção como FunctionsFetchError;
após o ajuste, a mesma sondagem com credenciais sintéticas alcança POST 401.
Autenticação e autorização ADM continuam obrigatórias. Origens externas são recusadas.

O cadastro mantém a senha anterior, de 12 a 128 caracteres, e o PWA mantém login
tradicional por email/senha no Supabase Auth. Não há PIN nem segredo adicional.
Nenhuma senha existente é alterada por esta publicação.

Por autorização explícita, a seleção de empresas foi removida. O servidor vincula
todas as empresas existentes no cadastro/edição e sincroniza novas empresas no login
do próprio entregador ativo. O navegador não determina o escopo. Desativação,
auditoria e regras de atribuição/entrega são preservadas.

## Persistência e implantação

Os scripts vibe_entregas_pin.sql e vibe_entregas_acesso_todas_empresas.sql já foram
aplicados e permanecem imutáveis no histórico. A estrutura de limite de tentativas
não é utilizada pelo login tradicional; não apagar dados como parte desta correção.
ve_pin_conta_ativa é um helper interno de sincronização de acessos; seu nome legado
não altera o mecanismo de autenticação. O novo script vibe_entregas_login_empresas.sql
expõe somente a sincronização do próprio usuário autenticado, com cadastro ativo.

Alvo: e-deal vwbtitjlpelrcnsytzqw. Prévia: zero cadastros/entregadores e seis empresas;
perfil Auth pendente_aprovacao existente e ativo. Nenhuma estrutura ERP é alterada.
A implantação não cria contas, não redefine senhas e não altera pedidos como teste.
A Edge Function administrativa usa as RPCs gerais e os segredos padrão já existentes.

## Validação e recuperação

Testes Deno de CORS, autorização, conta preexistente, senha mínima e confirmação
persistida; PostgreSQL em memória para acesso a todas as empresas e auto-sincronização;
navegador para cadastro sem empresas, senha tradicional, redefinição, login e PWA.
Compatibilidade produção/piloto e verificações obrigatórias do PR.

Recuperação: restaurar interface/função anterior, preservando tabelas, acessos e
histórico. Não redefinir senhas nem apagar contas automaticamente. Sem MSI ou instalação.
