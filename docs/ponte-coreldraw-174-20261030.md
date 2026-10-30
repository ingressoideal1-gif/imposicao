# Ponte 1.7.4 — salvamento compativel entre estacoes

O pedido 24569 foi criado em outra estacao com CorelDRAW 27.2 e salvo no
formato 27.0. O CDR baixado estava integro, mas o CorelDRAW 24.3 desta
estacao recusou sua abertura. A criacao inicial da ponte fixava Version=24;
as atualizacoes posteriores chamavam Save sem repetir essa configuracao.

Todos os salvamentos posteriores da ponte (referencias, limpeza e exportacao)
agora usam SaveAs com Version=24, KeepAppearance, EmbedICCProfile e Overwrite.
A API oferece cdrVersion24 (formato 24.0), compativel com CorelDRAW 24.3.
Nao ha opcao cdrVersion24.3 na enumeracao oficial. Antes de converter um
arquivo local mais novo, preserva uma copia com nome unico. O Ctrl+S feito
fora da ponte segue a configuracao do Corel; Atualizar fixa novamente o
formato comum antes de enviar ao Drive.

Arquivos em formato posterior ao programa instalado recebem mensagem clara
antes da abertura. Um CDR ja salvo em 27 precisa ser aberto na estacao
compativel para ser convertido; a atualizacao da ponte nao converte esse
arquivo remotamente nem substitui o nativo pelo PDF.

Validacao: 29 testes de integracao/runtime/instalador/releases; prova real
de salvar e reabrir CDR sintetico no Corel 24.3, com CoreVersion=2400;
autoteste do executavel 1.7.4 (ready, ICC, Node e engine confirmados).
Conversao real de um documento 27 em um Corel 27 permanece pendente de prova
na estacao de origem. Nenhum arquivo oficial do pedido foi substituido.

Build: ponte-build-corel-20261030-06. Distribuicao no mesmo ID de download,
preservando a revisao anterior. Exige instalacao em cada estacao.
Retorno pelo instalador anterior e arquivos anteriores preservados.

Referencia: https://community.coreldraw.com/sdk/api/draw/27.2/e/cdrfileversion
