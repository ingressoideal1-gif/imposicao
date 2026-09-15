# Pedido 21894 — arte compartilhada entre frente e verso no `multi_artes`

Data: 15/09/2026
Escopo: motor local NewProd, sem alteração de banco ou frontend.

## Sintoma

Ao combinar os modelos Foto `1000940` e Setor `1000947`, o verso mantinha os
elementos variáveis, mas perdia a arte base. O mesmo caminho é usado pelo painel
de Produção e pela página Montagem.

## Evidência do pedido

Consulta somente para leitura confirmou duas numerações `duplex`. Nos dois
modelos, `arte_url` e `verso_arte_url` apontavam para a mesma URL e para o mesmo
PDF de uma página. Esse reaproveitamento é um contrato aceito pelo frontend.

## Causa

No esquema `multi_artes`, `_load_art_as_pdf` mantém um cache por URL. Quando a
frente e o verso tinham a mesma URL, ambos eram o mesmo `fitz.Document`. O motor
tentava executar `art_doc.insert_pdf(art_doc)`, operação recusada pelo PyMuPDF
com `ValueError: source and target cannot be same object`.

A exceção era registrada e ignorada pela preparação de cada arte. O documento
permanecia com uma página; na folha de verso o motor procurava a página de
índice 1, não a encontrava e continuava somente com os elementos variáveis.

O modelo individual não reproduzia porque frente e verso chegavam como dois
arquivos temporários e eram abertos como documentos independentes.

## Correção

As fontes baixadas e guardadas no cache por URL passam a permanecer imutáveis.
Quando é necessário anexar um verso, o motor cria uma cópia independente da
frente e mescla nela o documento do verso. A cópia pronta continua armazenada
por par frente/verso, de modo que dois modelos que compartilham o mesmo par não
anexam a página duas vezes.

## Regressão

`test_dois_modelos_reaproveitam_a_mesma_arte_na_frente_e_no_verso` simula os
dois modelos do pedido 21894 com uma URL única para as duas faces. Antes da
correção, as páginas de verso não continham `ARTE-COMUM-21894` e o log registrava
a tentativa de auto-inserção. Depois da correção, as quatro páginas — duas
frentes e dois versos — contêm a arte, e a URL é baixada uma única vez.

## Versão-fonte preparada

Os arquivos de versão e empacotamento foram atualizados para NewProd `1.2.332`.
O MSI ainda não foi gerado: o ambiente de execução bloqueou o acesso
automatizado ao segredo protegido exigido pelo build antes de iniciar o
PyInstaller. Nenhum segredo foi exibido e nenhum artefato parcial foi criado.

A preparação do código-fonte não comprova geração ou publicação do MSI,
ativação do `latest.json`, atualização de estação ou impressão física.
