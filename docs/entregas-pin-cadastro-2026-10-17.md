# Cadastro de entregadores e PIN (web v1077)

## Falha corrigida

O SDK envia x-client-info no preflight do cadastro. A função não o autorizava,
e o navegador retornava FunctionsFetchError antes do POST. Reproduzido com SDK
real e credenciais sintéticas: apenas OPTIONS 204. Corrigido no servidor; a mesma
sondagem passou a alcançar POST 401, mantendo autenticação. Regressão Deno passou
de falha para sucesso; origens externas continuam bloqueadas.

## PIN de quatro dígitos

O projeto Auth exige senha mínima de seis caracteres. Essa política permanece.
Cadastro e redefinição passam a aceitar exatamente quatro dígitos, inclusive zero
inicial. O servidor deriva uma senha técnica de 68 caracteres usando HMAC-SHA256,
segredo exclusivo VIBE_ENTREGAS_PIN_SECRET, email normalizado e PIN. PIN e senha
técnica não são retornados ao navegador ou gravados nas tabelas do Vibe.

A função pública vibe-entregas-login valida formato e limita cinco tentativas
por email a cada 15 minutos antes de chamar Auth. O identificador do limite é HMAC;
a tabela não armazena email nem PIN. Apenas service_role executa suas RPCs. A sessão
só é devolvida após Auth e cadastro próprio ativo. O PWA guarda a sessão como antes,
em sessionStorage, e limpa o PIN do formulário. O segredo não deve ser rotacionado
sem plano para redefinir os PINs: mudá-lo altera a derivação das senhas técnicas.

## Empresas

Por autorização explícita, não há seleção de empresas. O servidor vincula todas
as empresas existentes no ERP ao criar/editar o entregador. Novas empresas são
incluídas automaticamente no próximo login. Desativação e auditoria são preservadas.
O navegador não determina o escopo de acesso. Dados permanecem restritos a entregadores
ativos e às regras de elegibilidade/atribuição já existentes.

## Implantação

Migrações próprias: vibe_entregas_pin.sql e vibe_entregas_acesso_todas_empresas.sql.
Nenhuma estrutura do ERP alterada. Prévia: zero cadastros e entregadores, sem contas
antigas para migrar. Escritas futuras são limitadas por usuário/operacao e pelo
identificador HMAC na tabela de tentativas. A implantação não cria contas de teste.
O cadastro/login PIN dependem do segredo no servidor; não publicar a interface
antes de confirmar essa configuração e ambas as funções implantadas.

## Validação e recuperação

15 testes Deno: CORS, autorização ADM, contas próprias, HMAC, formato, limites,
conta inativa e ausência de senha técnica/segredo na resposta. PostgreSQL em memória
verifica limitação persistente, expiração, privilégios e todas as empresas. Navegador
verifica cadastro sem empresas, PIN, redefinição, login e demais fluxos do PWA.

Rollback da interface não restaura senhas antigas. Preservar segredo, registros
e função de login para contas que já usam PIN; nunca redefinir senhas em massa.
Sem redução da política Auth do ERP, MSI ou instalação em estações.
