# PDF impar/par: verso separado na conferencia final

Pedido corrigido pelo operador: 23068, modelo 1001917. A consulta somente
leitura de 08/10/2026 confirmou verso_tipo FRENTE E VERSO, modo_pdf ativo,
10 pecas, numeracao pdf_odd_even e URLs de frente e verso presentes.
O pedido 23067 informado inicialmente tem outra configuracao.

A tela ja excluia o upload de verso nesse modo. A conferencia de integridade
baixava novamente o verso cadastrado, provocando a recusa do motor. Agora
ela identifica pdf_odd_even na numeracao enviada e conserva somente o PDF
original no multipart e no manifesto de hashes. O print_mode externo segue
duplex. Cadastro, arquivos historicos, quantidade e numeracao sao preservados.

A regressao reproduziu o download indevido antes da correcao. Depois passaram
58 verificacoes Node e 58 Chromium, incluindo verso residual e cadastro com
verso separado. Contratos anteriores de duplex e duplicar verso permanecem.
Bateria dos canais producao e piloto aprovada; canal oficial: 526 testes,
2 subtests, 2 skips e harnesses de ambos os HTMLs aprovados.

Frontend preparado como v1038. Agente oficial preparado como 1.2.373 para nao
colidir com o pacote excepcional de retorno ao Original 1.2.372. A selecao de
cache falhou por metadados locais incompletos de pip; nao houve reutilizacao
sem prova nem alteracao de dependencias. A entrega usa compilacao completa e
auditoria do pacote oficial, preservando a lista corrente de estacoes liberadas.

Este registro de fonte nao comprova publicacao, instalacao nas estacoes nem
impressao fisica. Evidencias de execucao ficam nos recibos de dist e logs locais.
Recuperacao remota exige novo pacote com versao superior; nao sobrescrever
MSI publicado nem modificar o cadastro do pedido como contorno.
