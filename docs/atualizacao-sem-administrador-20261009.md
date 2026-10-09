# Atualização por qualquer operador — NewProd 1.2.376

A atualização manual pelo painel retornava HTTP 403 para usuários sem
`perm_admin_edit`. Por solicitação explícita do usuário, a consulta e o início
da atualização ficam disponíveis a qualquer operador com sessão ativa,
independentemente de cargo ou permissões administrativas.

A alteração vale somente para GET `/api/update/check` e POST `/api/update`.
Não concede administração, não altera cadastros de usuários e mantém a
identificação da sessão, revogação de acesso, origem fixa do pacote, SHA-256,
backup e espera pela conclusão de trabalhos em andamento. Métodos e rotas
desconhecidos continuam protegidos.

A 1.2.376 inclui a correção de PDFs grandes entregue na 1.2.375. O JavaScript
comum recebe cache-buster 1041 nas páginas index e Produção. Em uma versão
antiga que ainda devolva 403, a mensagem orienta usar o menu **Atualizar agora**
do ícone do NewProd junto ao relógio. Esse caminho existente chama o atualizador
local diretamente e não exige permissão administrativa do painel.

Importante para a transição: publicar uma versão nova não modifica a regra
de autorização dentro dos executáveis antigos. Para receber a primeira versão
com a correção, usar o menu da bandeja ou aguardar a verificação automática
existente. O intervalo automático de seis horas não foi alterado.

Validação inicial: 25 testes Python e 44 cenários de navegador aprovados.
Inclui operador sem permissões, manutenção da recusa de acesso administrativo,
sessão revogada, rotas/métodos desconhecidos e os dois painéis em 9000/9001.
Relatórios completos de compatibilidade, auditoria e publicação em `dist/`.
