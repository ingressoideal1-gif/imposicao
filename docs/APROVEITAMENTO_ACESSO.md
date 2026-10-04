# Acesso as configuracoes de Aproveitamento

A consulta dos limiares continua disponivel para producao e NewProd.
Salvar a configuracao global ou de um produto exige sessao de conta do painel
e a permissao `perm_admin_edit` conferida no servidor. O perfil enviado pelo
navegador nao concede essa permissao.

No NewProd com acesso apenas por codigo, abra o painel web e entre com sua
conta administrativa para salvar. O codigo local continua atendendo login,
geracao de PDF e demais operacoes autorizadas da estacao.

O novo caminho usa a funcao `painel`, rotas
`POST /api/config-aproveitamento/limiar` e `/produto`. A gravacao exige uma
linha retornada e releitura correspondente. Os calculos, unidades percentuais,
liberacao de produtos e limpeza de excecao para usar o padrao geral permanecem
iguais. Atualizar a pagina e repetir a operacao e necessario se houver conflito.

Entregar na ordem: testes, funcao `painel`, frontend, verificacao publica,
validacao das restricoes do banco em clone e aplicacao transacional. Conservar
o rollback das permissoes na pasta privada de operacao.
