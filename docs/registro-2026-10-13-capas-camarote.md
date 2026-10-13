# Capas de camarote — teste 1.2.397

Pedido de referência: 23381. Na entrega em blocos com montagem, o motor
contava capas pelos blocos físicos de 50, deixando camarotes sem capa.
Reprodução sintética anterior: 10 camarotes de 10 lugares geravam 2 capas;
12 de 10 geravam 3; 15 de 4 geravam 2.

Agora cada primeiro lugar de camarote origina uma capa no chunk que o contém.
A quantidade de lugares e o início da capa vêm do próprio modelo. Não há
duplicação quando o camarote atravessa blocos ou camadas. As capas adicionais
ocupam novas páginas e a contracapa acompanha a quantidade dessas páginas.
Chunks sem início de camarote não geram capas vazias. O miolo, os blocos e a
numeração dos ingressos não foram alterados. A correção trata o caminho de
capas por chunk usado pela montagem; não redesenha outros modos de imposição.

Validação: 107 testes passaram e 2 foram pulados na seleção de capas, entrega
por bloco, modelos somados, teatro e escala. Os 10 casos novos conferem texto
extraído dos PDFs: quantidades 10/12/15, início diferente de 1, lotação maior
que um bloco, múltiplas camadas, modelos combinados com lotações diferentes e
modelo sequencial junto. Após revisão de campos opcionais: 34 passaram e 2
foram pulados. Nenhum trabalho foi enviado à impressora.
Os 10 casos novos falharam ao executar contra o motor anterior (HEAD),
confirmando que reproduzem o defeito: `dist/capas-397-regressao-anterior.log`.

Bateria dos dois canais: 544 passaram, 2 pulados e 4 falhas por canal;
16 harnesses executados em cada canal sem falha. Falhas já registradas em
`registro-2026-10-13-escala-blocos.md`: identidade da versão de teste, duas
verificações de promoção oficial e lista de sincronismo do painel. Logs em
`dist/capas-397-producao.log` e `dist/capas-397-piloto.log`.

MSI de teste: `dist/NewProdPiloto_Teste_v1.2.397.msi`. A instalação no Junior
continua adiada por escolha do usuário. Conferência física permanece pendente.
O modelo 1002451 com C_INI=0 permanece dependente da definição da faixa correta;
nenhum dado do pedido foi modificado no banco.

Publicação concluída apenas no manifesto de teste, mantendo LASER-01 e
PC-JR-HOME. Download público completo conferido: 196665344 bytes;
SHA-256 `193f5241b8844a355d6fe30fae71c72dd656c9649e19e510ae38cc6411ae5d4a`.
Produto MSI 1.2.397, bytecode do motor e 375 arquivos do painel conferidos.
Evidência: `evidencias/publicacao-capas-camarote-397.json`. Disponibilidade
do pacote não comprova instalação em nenhuma estação.
