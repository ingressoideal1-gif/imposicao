# Correção local da impressão combinada — 20/09/2026

## Estado operacional

Implementação na branch `fix/impressao-combinada-22247`, worktree `C:\ProjetosLocais\ideal-imposition-combinada-22247`, baseada em `origin/main` (`ef3e7aab`). Checkout original e alterações anteriores preservados. Sem commit, publicação, acesso ao banco ou impressão física.

O cenário usa identificadores 22247 e modelos 96, 97 e 98 com quantidades, artes e numerações sintéticas. Não comprova os valores cadastrados nesse pedido real.

## Resultado

- Prévia do Pedido usa a mesma construção de artes da geração, incluindo escalas individuais e início de numeração por modelo. A seleção participa dos esquemas sequencial, multiartes e blocado.
- Planejamento blocado respeita as folhas salvas por bloco, a ordenação do motor e os conjuntos usados por Refazer. Blocos incompatíveis são recusados.
- Numeração usa o índice local da arte; o payload informa `numeracao.start`, como exige o motor atual. A quantidade TICKET continua representando células físicas.
- Frente e verso usam a arte correspondente ao modelo. Arte pendente/ausente não é substituída pela arte do modelo aberto.
- Compatibilidade considera o modo efetivo de impressão. PDF Paginado e modos especiais `pdf_odd_even`/`pdf_duplicate_back` exigem geração individual: a combinação não implementa um contrato de páginas por arte e antes podia repetir apenas a primeira página.
- A seleção é revalidada antes da geração; reduzir a seleção a um único modelo aguarda a abertura dele. A confirmação de impressão conserva os alvos capturados no início. Refazer não confirma o pedido inteiro.

Fontes alteradas: `frontend/pedido.js` e `frontend/script.js`. Não houve alteração de Python, API ou banco. Testes existentes foram ajustados para a construção compartilhada e os novos bloqueios.

## Evidências

Executados com sucesso:

- 11 harnesses JavaScript: impressao_combinada, impressao_combinada_fluxo, modelos_somados, esquema_da_previa, previa_banco_modelos_combinados, previa_verso_separado, producao_por_cor_fluxo, fxversounico, escala_da_arte, aproveitamento e montagem_faces_pdf.
- `py tests/test_impressao_combinada.py`: 3 testes com PDFs sintéticos e o motor real. Compara todas as páginas de seis cenários combinados, com e sem verso; verifica Refazer e modos individuais paginados. A comparação do verso verifica conteúdo por página, não registro físico frente/verso.
- `node --check frontend/pedido.js`, `node --check frontend/script.js` e `git diff --check`.

Os testes de fluxo substituem rede, salvamento e impressora por simuladores. O teste do motor bloqueia downloads e usa diretório temporário. A suíte pytest completa não foi executada: pytest não está disponível no interpretador local, e nenhuma dependência foi instalada.

## Limitações e retomada

Entrega local validada por harnesses e motor; não houve validação visual interativa no navegador, consulta dos dados reais do pedido, conferência de registro físico do verso ou teste da estação instalada. A combinação de PDFs paginados permanece explicitamente indisponível; seus modos individuais foram preservados e testados.

Para entrega operacional, revisar esta branch e publicar em etapa autorizada. Após publicação, conferir os arquivos servidos e repetir o cenário com os dados reais autorizados de 22247, navegando pelas folhas/conjuntos. A seleção de três modelos pode ocupar várias folhas; não exige que os três apareçam na mesma folha, especialmente no modo de blocos separados.
