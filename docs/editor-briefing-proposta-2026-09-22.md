# Editor das observações do briefing

## Diagnóstico e correção local

Base: `origin/main` em `7227f6f8` (frontend v929). Trabalho isolado em
`C:/ProjetosLocais/ideal-imposition-editor-briefing`.

A seleção da v928 era mantida como um Range do DOM. `updateBriefingUI()`
protegia somente o foco no campo editável. Ao focar o seletor de tamanho ou
cor, uma atualização substituía os nós do editor e apagava o Range. O comando
seguinte interpretava a ausência de seleção como aplicação ao texto inteiro.

O teste de regressão seleciona uma palavra, foca o seletor de tamanho,
executa uma atualização do briefing e aplica tamanho e cor. Antes da correção,
falhou porque o restante do texto também recebeu o tamanho maior.

A correção local protege o campo e sua barra de controles e evita reconstruir
nós quando o conteúdo não mudou. Não altera consultas, banco ou dependências.

Validação: `tests/briefing_formatacao_browser_harness.js`, com Chromium,
dados sintéticos e bloqueio de rede. A reprodução foi adicionada à cobertura
existente de leitura, edição, HTML seguro, formatação e reabertura.

## Substituição aprovada e implementada localmente

Quill 2.0.3, versão apresentada pela documentação oficial consultada em
22/09/2026. O editor possui seleção por posição e extensão do trecho,
formatação, histórico e barra de ferramentas próprios. Pode ser usado
diretamente em JavaScript sem introduzir um framework ou build do painel.

- Distribuir os arquivos JS/CSS e a licença BSD junto ao frontend, com versão
  fixa, sem carregamento por CDN no uso operacional.
- Inicializar apenas ao abrir a edição de um produto, com uma instância por
  campo. Preservar a instância e a seleção nas atualizações do briefing.
- Expor negrito, tamanhos, cores e desfazer/refazer. Não aplicar ao documento
  inteiro quando uma seleção for perdida; usar ação explícita de selecionar tudo.
- Manter a persistência HTML atual e a limpeza do conteúdo, sem migração.
  A abertura do editor não deve gerar salvamento automático.
- Validar importação e exportação com exemplos sintéticos de textos já salvos:
  cores, tamanhos, parágrafos, quebras, espaços e listas. Quill interpreta HTML
  em seu modelo e não garante reprodução de todo HTML arbitrário. Tabelas,
  listas iniciadas em número diferente de 1 e recuos precisam de verificação
  específica antes de considerar a substituição pronta. Não converter dados
  existentes em lote nem persistir conteúdo normalizado só por abrir o campo.
- Testar seleção por arraste e teclado, abertura das paletas, atualização
  assíncrona, sequência de comandos, desfazer/refazer e isolamento entre produtos.

Arquivos previstos: integração em `frontend/script.js`, estilos em
`frontend/style.css`, biblioteca/licença locais em `frontend/vendor/`, referências
nas páginas que carregam o painel e testes em `tests/`.

Tiptap também oferece controle próprio de seleção, mas sua integração vanilla
requer compor a barra e as extensões. Para este frontend estático e estes
controles, Quill é a opção proposta.

Fontes oficiais:

- [Quill Quickstart e licença](https://quilljs.com/docs/quickstart)
- [Seleção, formatação e exportação HTML](https://quilljs.com/docs/api)
- [Barra de ferramentas](https://quilljs.com/docs/modules/toolbar)
- [Importação de HTML e limitações](https://quilljs.com/docs/modules/clipboard)
- [Tiptap com JavaScript](https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript)

O usuário autorizou a inclusão com “executar”. Quill 2.0.3 foi incluído em
`frontend/vendor/quill-2.0.3/`, com os avisos de licença e hashes de origem.
Não houve instalação npm ou alteração de lockfiles.

Integração em `frontend/briefing-editor.js`, carregado em `index.html` e
`producao.html`. As instâncias são criadas somente quando a edição é aberta.
`script.js` mantém a leitura sanitizada e o salvamento HTML já existente;
o controle antigo por `document.execCommand()` foi removido do briefing.

A barra contém negrito, três tamanhos, seis cores, Selecionar tudo, Desfazer e
Refazer. Sem seleção, a formatação não altera o texto e orienta a selecionar.
Uma atualização do briefing não recria o editor aberto nem apaga sua seleção.

A importação conserva espaços e linhas vazias. Listas com início diferente
de 1 recebem um atributo do modelo Quill, representado por `counter-set` no
editor e exportado como `ol start` no HTML salvo. Tabelas simples usam o módulo
de tabelas do Quill. A colagem é sanitizada antes de entrar no editor. Nenhuma
observação é gravada simplesmente por abrir a edição.

Validação em Chromium, sem rede e com dados sintéticos: seleção real por
teclado e arraste; sequência de negrito/tamanho/cor; atualização com seletor
focado; ausência de seleção; seleção entre parágrafos; desfazer/refazer;
reabertura do HTML salvo; espaços/linhas vazias; listas iniciadas em 3; tabela
simples; isolamento entre produtos; colagem maliciosa; carga inicial atrasada;
mensagem quando a biblioteca falta; viewport de 390px. Todos passaram.

A conferência visual identificou e corrigiu a numeração no editor para manter
3, 4 em uma lista iniciada em 3. Os arquivos da biblioteca permanecem originais.

Limite: não houve leitura de pedidos reais ou validação de todo HTML possível
do ERP (por exemplo, tabelas complexas com células mescladas). O texto original
não é convertido em lote nem salvo na abertura. Nada foi publicado.
