# Informações do modelo no portal do cliente

Layout aprovado em 08/09/2026: nome e status na primeira linha; produto,
quantidade, numeração inicial/final e impressão na segunda, dentro da janela
do modelo e acima da arte. O cabeçalho externo repetido foi removido.
Em telas estreitas, a segunda linha tem rolagem horizontal.

O portal exibe a numeração salva em `num_inicial`/`num_final` ou
`numeracao_inicio`/`numeracao_fim`. Zero e zeros à esquerda são preservados;
valores ausentes aparecem como `--`. Não há recálculo de numeração ou quantidade.
Arte, frente/verso, folheadores, ampliação e decisões mantêm suas funções.

Arquivos de entrega: `frontend/cliente.js`, `frontend/cliente.html` e
`frontend/cliente-modelo.css`. O CSS é exclusivo do portal; JS e CSS usam
`?v=20260908` para atualizar o cache. Não há alteração de API, SQL ou agente.

Validação local: 73 testes existentes passaram (portal, PDF paginado, correção
do cliente, rotas Cloudflare e sintaxe do frontend). O novo harness usa o
renderizador real com dados sintéticos em 1100, 390 e 320 px; confere as duas
linhas, ausência de vazamento horizontal da página, dados salvos, zero,
numeração ausente, escape de texto, verso e modo somente leitura.

Publicação autorizada pelo usuário e preparada em worktree isolado baseado em
`893de54c`, preservando as mudanças preexistentes do checkout principal.
Entrega pelo Git integrado ao Cloudflare Pages, projeto `imposicao`, domínio
`https://imposition.ai-ideal.com.br`. O script legado `publicar.ps1` não é
adequado a esta entrega: também publica Edge Functions e usa Vercel.

Após o merge, conferir o check Cloudflare Pages e o conteúdo público de
`/cliente.html`, `/cliente.js?v=20260908` e `/cliente-modelo.css?v=20260908`.
Não é necessário abrir links reais de clientes para verificar os assets.
Recuperação: reverter apenas o commit desta entrega e aguardar o novo deploy.
