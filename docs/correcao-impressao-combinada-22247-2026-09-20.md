# Correção da impressão combinada — v924 publicada em 20/09/2026

## Estado operacional

Implementação na branch `fix/impressao-combinada-22247`, worktree `C:\ProjetosLocais\ideal-imposition-combinada-22247`, baseada em `origin/main` (`ef3e7aab`). Checkout original e alterações anteriores preservados. Correção integrada à `main` e publicada como **v924**, commit `849f21ebe4cc2bb21618c72b31d0b5ea4510d4c8`. Estado da entrega: **PUBLICADA_E_VERIFICADA**. Não houve acesso ao banco, alteração do pedido real ou impressão física.

O cenário usa identificadores 22247 e modelos 96, 97 e 98 com quantidades, artes e numerações sintéticas. Não comprova os valores cadastrados nesse pedido real.

## Resultado

- Prévia do Pedido usa a mesma construção de artes da geração, incluindo escalas individuais e início de numeração por modelo. A seleção participa dos esquemas sequencial, multiartes e blocado.
- Planejamento blocado respeita as folhas salvas por bloco, a ordenação do motor e os conjuntos usados por Refazer. Blocos incompatíveis são recusados.
- Numeração usa o índice local da arte; o payload informa `numeracao.start`, como exige o motor atual. A quantidade TICKET continua representando células físicas.
- Frente e verso usam a arte correspondente ao modelo. Arte pendente/ausente não é substituída pela arte do modelo aberto.
- Compatibilidade considera o modo efetivo de impressão. PDF Paginado e modos especiais `pdf_odd_even`/`pdf_duplicate_back` exigem geração individual: a combinação não implementa um contrato de páginas por arte e antes podia repetir apenas a primeira página.
- A seleção é revalidada antes da geração; reduzir a seleção a um único modelo aguarda a abertura dele. A confirmação de impressão conserva os alvos capturados no início. Refazer não confirma o pedido inteiro.

Fontes alteradas: `frontend/pedido.js` e `frontend/script.js`. Não houve alteração de código Python de produção, API ou banco; o novo teste Python exercita o motor existente. Testes existentes foram ajustados para a construção compartilhada e os novos bloqueios.

## Evidências

Executados com sucesso:

- 11 harnesses JavaScript: impressao_combinada, impressao_combinada_fluxo, modelos_somados, esquema_da_previa, previa_banco_modelos_combinados, previa_verso_separado, producao_por_cor_fluxo, fxversounico, escala_da_arte, aproveitamento e montagem_faces_pdf.
- `py tests/test_impressao_combinada.py`: 3 testes com PDFs sintéticos e o motor real. Compara todas as páginas de seis cenários combinados, com e sem verso; verifica Refazer e modos individuais paginados. A comparação do verso verifica conteúdo por página, não registro físico frente/verso.
- `node --check frontend/pedido.js`, `node --check frontend/script.js` e `git diff --check`.

Os testes de fluxo substituem rede, salvamento e impressora por simuladores. O teste do motor bloqueia downloads e usa diretório temporário. A suíte pytest completa não foi executada: pytest não está disponível no interpretador local, e nenhuma dependência foi instalada.

## Publicação e comprovação

A entrega usou `entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta`, primeiro com `-Simular` e depois com `-Sim`, após a autorização de entrega segura. A simulação, a revalidação após atualização de cache e os testes do motor passaram. A tag `v924`, o HEAD da entrega e `origin/main` apontavam para o mesmo commit ao concluir.

O Cloudflare Pages concluiu a implantação `991bc2ad-4177-4ca1-a97d-65a98af98090`. O verificador inicial terminou com `FALHA_APOS_INTEGRACAO` porque ainda recebeu conteúdo anterior durante a propagação. Não foi feita uma segunda publicação: a conferência independente subsequente confirmou **12/12 correspondências**, com parâmetro de consulta novo para evitar cache e hashes SHA-256 normalizados para BOM e finais de linha.

Conferência concluída em **20/09/2026 às 13:36:42 (America/Sao_Paulo)**, nos domínios `https://imposition.ai-ideal.com.br` e `https://imposicao.pages.dev`. São seis arquivos em cada domínio: `index.html`, `producao.html`, `cliente.html`, `controle.html`, `pedido.js` e `script.js`. Esta é a evidência da entrega nessa data, não um monitoramento contínuo.

[Comprovante com hashes locais e públicos](evidencias-impressao-combinada-v924.json).

O versionamento automático também atualizou referências de cache a `pagamento-do-pedido.js` e `carregar-pedido.js` nos HTMLs; o conteúdo desses módulos não foi alterado. Nenhum instalador NewProd foi gerado ou distribuído.

## Recuperação

Se houver regressão confirmada, preparar uma nova branch a partir da `main` atual e reverter o commit `849f21ebe4cc2bb21618c72b31d0b5ea4510d4c8`, revisar conflitos com alterações posteriores, executar os testes pertinentes e publicar pelo fluxo de entrega segura com nova versão de cache. Não reescrever o histórico nem descartar o checkout original. A recuperação não foi executada.

## Limitações e retomada

Entrega publicada, validada por harnesses, motor e comparação de arquivos públicos; não houve validação visual interativa no navegador, consulta dos dados reais do pedido, conferência de registro físico do verso ou teste da estação instalada. A combinação de PDFs paginados permanece explicitamente indisponível; seus modos individuais foram preservados e testados.

Próxima validação operacional: repetir o cenário com os dados reais autorizados de 22247, navegando pelas folhas/conjuntos, conferir o PDF gerado e depois a impressão física frente/verso na estação. A seleção de três modelos pode ocupar várias folhas; não exige que os três apareçam na mesma folha, especialmente no modo de blocos separados.
