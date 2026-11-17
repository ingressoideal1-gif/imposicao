# NewProd 1.4.19 e Painel de produção

A impressão progressiva em GDI volta a abrir a confirmação após o último lote, inclusive quando o operador usa as opções de impressão do modelo. O diálogo usa os modelos selecionados no início do envio. Uma interrupção, uma falha, a primeira folha e o fluxo Refazer não disparam a confirmação do trabalho completo. Reabrir a aba depois que a operação terminou permite consultar o trabalho, mas não recupera esse diálogo.

A Montagem apresenta os modelos já carregados, acompanha as etapas de geração e permite abrir as partes do PDF gerado. A conferência na estação consulta as confirmações do pedido selecionado. A sincronização reutiliza o catálogo local quando a revisão e a integridade conferem.

O motor preserva a condição de saída e o perfil ICC incorporado quando as artes usadas no trabalho têm a mesma declaração. Quando os perfis divergem, a imposição sai sem atribuir um perfil único à combinação. Para artes sem declaração, o motor conserva o comportamento anterior. A verificação com Coated FOGRA39 confirmou que os 654.352 bytes do ICC chegaram ao PDF imposto e que a arte permaneceu vetorial.

O instalador e o download oficial têm 196.894.720 bytes e SHA-256 `d819771bbf1448f0698d81f8f0e5fce4bb92eef9515b1529699e8478eb08d81c`. Os manifestos `latest.json` e `newprod-piloto-oficial.json` apontam para 1.4.19. A função `piloto-local` foi atualizada da versão 40 para a 41. As verificações estão nos arquivos de [validação](evidencias/newprod-1419-validacao.json) e [publicação](evidencias/newprod-1419-publicacao.json).

O [PR 306](https://github.com/ingressoideal1-gif/imposicao/pull/306) publicou o painel web v20261143. O conteúdo dos oito arquivos alterados foi relido e conferido nos dois domínios de produção.

A instalação em cada estação, o tempo de abertura de um pedido em operação e a cor no papel dependem de conferência local. Para reverter o agente pelo atualizador, publicar a base anterior sob uma versão superior.
