# Ponte 1.10.6 — limpeza pendente com arte reposta

Uma exclusao pendente na estacao podia bloquear a abertura e a preparacao de todos os
modelos do mesmo produto quando o PDF da face ja estava novamente vinculado no Imposition.
A Ponte agora arquiva esse comando em limpezas/canceladas, preservando seu conteudo,
sem limpar o CDR nem enviar uma limpeza ao Drive. Exclusoes ainda validas seguem o fluxo
existente com backup, somente nas paginas correspondentes. Falhas reais preservam a fila.

Casos relatados: pedidos 24726 e 24617. A fila da estacao do designer nao foi inspecionada;
a confirmacao real exige instalar a nova versao e reabrir os pedidos naquele computador.
Nenhum pedido ou arquivo de arte foi alterado durante esta entrega.

Validacao: 36 testes de limpeza/abertura e 17 de instalador, recuperacao e runtime aprovados.
Autotestes do executavel e instalador 1.10.6 retornaram ready; runtime confirmou ICC, Node e engine.
Pacote com 117 arquivos, sem arquivos operacionais ou credenciais identificados por nome.
Download autenticado e publico conferidos integralmente; revisao anterior preservada no Drive.

Fontes e hashes arquivados em ../ponte-build-limpezas-20261105-1106/fontes-correcao.zip
 e fontes-sha256.json. Fontes anteriores em ../ponte-fix-limpezas-20261105-backup/.
A fonte operacional suja foi preservada; a publicacao web altera somente manifesto e documento.

Instalacao: aguardar operacoes terminarem, escolher Sair para atualizar no icone da Ponte,
baixar novamente o instalador e instalar na conta Windows do designer. A publicacao nao
instala automaticamente nas estacoes. Recuperacao: Voltar a versao anterior no instalador.

Instalador: 189817735 bytes; SHA-256 `4ad7d74f91c698e326fe80a5991957973bbf1337366f05c38ab7bf6b0c18f094`.
