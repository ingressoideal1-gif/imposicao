# Entregas: gestão administrativa (web v1075)

Base d1535c7c; integrada Montagem a2fa3962 antes da publicação. Worktree isolada feat/entregas-gestao-adm-20261017.

## Interface

Entregas agora oferece cadastro de entregadores (nome, email de login, senha
inicial e empresas), edição, ativação/desativação e nova senha. Leitura exige
ADM + perm_admin_view; alterações exigem também perm_admin_edit. Senhas não
são listadas, persistidas no navegador ou gravadas nas tabelas do Vibe.

O ícone de câmera na linha abre comprovante privado com URL de 60 segundos.
Sem comprovante, o ícone fica desativado. Detalhes/histórico continuam disponíveis.

Criar rota: selecionar entregador ativo, buscar pedidos por número, adicionar
até 20 paradas, mover para cima/baixo e escolher retorno à gráfica. Alterar rota
carrega a sequência atual; a gravação cria nova versão e preserva a anterior.
Pedidos removidos permanecem com o entregador. Pedidos concluídos não podem
ser removidos. Atribuição recusa outra pessoa, empresa não autorizada, expedição
ambígua e pedido fora de EXPEDICAO/Motoboy. Conflito de versão exige atualizar.
Rotas salvas ficam disponíveis em Atualizar rota ativa no PWA.

A ordem manual funciona sem Google. Otimização automática continua dependendo
da chave/cotas e da ativação já pendentes; esta entrega não ativa serviço pago.

## Persistência e segurança

Nova migração sql/vibe_entregas_gestao_adm.sql, separada dos scripts já aplicados:
três tabelas próprias (cadastros, entregadores, auditoria), com RLS e sem acesso
direto anon/authenticated, e funções ADM. Nenhuma estrutura comercial alterada.

A função vibe-entregas-admin valida a sessão via Auth e o perfil no servidor
antes de chamar Auth Admin. Cria somente contas novas: email de outra conta
é recusado. Cadastro usa identificador de operação para retomar falha entre
Auth e RPC; conta sem finalização não recebe acesso ao Vibe. A nova senha só
pode ser definida para conta gerenciada por este módulo, com marcador de origem
em app_metadata controlado pelo servidor. Não envia convites nem emails.

Edição com pedidos pendentes não permite desativar o entregador nem retirar
acesso às empresas desses pedidos. Histórico de entregas mantém nome original.
Auditoria registra autor, alvo, ação e horário, sem senha. Solicitação de senha
é auditada antes da chamada Auth e não equivale a confirmação de alteração.

## Implantação

Projeto e-deal vwbtitjlpelrcnsytzqw. Migração aplicada em transação após testes
locais e prévia: zero contas, acessos, entregas e rotas antes; nenhum registro
operacional criado durante implantação. Função administrativa publicada com
verify_jwt=true. Consulta somente leitura como authenticated/ADM confirmou
permissão de edição, zero entregadores e zero rotas.

## Validação e limites

- PostgreSQL em memória: cadastro retomável, duplicidade/email externo, senha
  restrita a contas próprias, empresa, atribuição, conflitos e idempotência.
- Seis testes Deno com transporte simulado: autorização, criação, retomada,
  senha, resposta persistida e ausência de segredo no retorno.
- Navegador: cadastro, nova senha, falha parcial, limpeza de senha, ordem/edição
  de rota, revogação de perfil e contratos anteriores do painel/foto.
- Sem criação de conta real, redefinição de senha real ou entrega em produção
  como teste. Primeira operação deverá ser realizada pelo ADM com dados reais.
- Sem build MSI ou instalação nas estações.

Recuperação: retornar a interface anterior e desativar função administrativa;
preservar cadastros e auditoria. Não apagar contas Auth nem rotas/históricos
como recuperação automática. Senhas e atribuições não são revertidas pelo site.

Referência Auth Admin: https://supabase.com/docs/reference/javascript/auth-admin-createuser
