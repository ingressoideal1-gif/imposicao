# Ponte 1.7.3 — dimensões de páginas importadas

O CorelDRAW 24.3 arredonda medidas fracionárias do PDF para pontos inteiros,
inclusive em páginas com arte. No pedido 24538/modelo 1005630, três páginas
de 245 x 20 mm foram importadas como 694 x 56 pt e a ponte recusou a abertura.

A versão 1.7.3 reconhece esse arredondamento, repõe a dimensão exata da página
e compensa o deslocamento dos objetos em relação à origem inferior esquerda
do PDF. Não redimensiona a arte. Divergências maiores continuam sendo recusadas.

Validação: 27 testes de integração/runtime/instalador/releases; importação e
exportação reais das três páginas com 245 x 20 mm; prova sintética de geometria;
inspeção visual da primeira página; autoteste do executável empacotado.
Nenhum PDF oficial do pedido foi alterado por esses testes.

Build local ponte-build-corel-20261030-05. Download no mesmo ID público do Drive,
com revisão anterior preservada e verificação integral do SHA-256.
O erro foi reportado no computador de um designer. Publicação do instalador
não comprova instalação naquela estação: sair da ponte, baixar novamente,
instalar 1.7.3 e reabrir o pedido 24538 pelo Imposition.

Retorno disponível pela versão anterior do instalador. Não apagar CDRs,
TDRAWs, PDFs nem backups como parte da atualização.
