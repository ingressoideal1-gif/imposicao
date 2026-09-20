# Produção por Cor: dropdown parado no placeholder

O usuário relatou que a lista continuava vazia, sem mensagem de erro, exibindo apenas “Selecione um produto”. A origem exata na sessão do operador não foi observada; não foi acessado banco real nem perfil autenticado do navegador.

No código, essa opção está no HTML estático. A carga da página só começava quando o hook de `showView` chamava `abrir()`. Ativar/restaurar a seção sem esse hook deixa o dropdown parado; até o botão Atualizar lista só era vinculado depois de `abrir()`. Os testes anteriores chamavam `abrir()` diretamente e não cobriam essa situação. Exceções na preparação da janela, antes do try de refresh, também não apareciam na página.

A página agora vincula seus controles na inicialização do DOM, acompanha a visibilidade da seção (classe active e display usado pelo roteador legado), inicia a carga ao abrir e encerra seu contexto ao sair. O hook atual continua funcionando sem carga duplicada. O dropdown distingue carregamento, falha, ausência de produtos e seleção disponível. Erros na preparação da janela aparecem na tela. Consultas de propostas com lista de números vazia são dispensadas, mantendo a rota autenticada quando há números.

Não foram alterados filtros de negócio nem a associação produto/cor nesta entrega. As regras de agrupamento continuam as da v915; este ajuste trata a inicialização e a apresentação de falhas. A confirmação de que todos os produtos esperados do operador aparecem depende da sessão real, não da comparação de arquivos publicados.

Validação: navegador com seção já ativa sem chamada explícita a abrir, entrada pelo listener real do menu e roteador extraído de script.js, seleção produto/cor, saída/reentrada e Atualizar lista; cenário de carga pendente e erro de preparação. Suíte selecionada: 78 testes aprovados, incluindo sintaxe do frontend e 24 cenários de fluxo. Integrações e dados são simulados.

Base de entrega: origin/main em 24bd80ff (v918), preservando os avanços de outras sessões. Publicação apenas frontend, conforme autorização vigente; sem build ou instalação de NewProd. Comparar HTML e módulo nos dois domínios após propagação.
