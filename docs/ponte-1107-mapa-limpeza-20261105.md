# Ponte 1.10.7 — limpeza de documentos com modelos adicionados

A limpeza pendente exigia que o mapa salvo fosse exatamente igual ao pedido atual,
embora a abertura ja aceite modelos adicionados ao final. Isso impedia abrir um CDR
antigo antes de incluir as novas paginas.

A limpeza agora aceita igualdade ou o mesmo prefixo compativel usado pela abertura.
Calcula as paginas pelo mapa salvo e verifica sua contagem. Um modelo ainda ausente
no CDR nao provoca limpeza; o fluxo normal de abertura pode inclui-lo. O mapa
recuperado do Drive e persistido antes da continuacao. Mudancas de modo, pedido,
ordem ou mapas incompletos continuam sem reinterpretacao automatica.
Inclui a 1.10.6, que arquiva limpezas obsoletas quando a face voltou a ter PDF.

Validacao: 43 testes de limpeza/abertura e 17 de instalador, recuperacao e runtime.
Autotestes do executavel e instalador 1.10.7 retornaram ready; ICC, Node e engine
confirmados. Pacote com 117 arquivos, sem arquivos operacionais/credenciais por nome.
O caso real no designer (24726/1006379) ainda exige confirmar a abertura apos instalar:
a fila e o mapa daquela estacao nao foram acessados. Nenhum pedido ou CDR operacional
foi alterado na entrega.

Fontes e hashes: ../ponte-build-mapa-limpeza-20261105-1107/fontes-correcao.zip e
fontes-sha256.json. Backup anterior: ../ponte-fix-mapa-limpeza-20261105-backup/.
Publicacao preserva o ID do instalador no Drive e a revisao anterior, com verificacao
integral de tamanho e SHA-256 dos downloads autenticado e publico.

Para instalar: aguardar envios, Sair para atualizar no icone da Ponte, baixar novamente
e instalar na conta do designer. Publicacao nao instala automaticamente nas estacoes.
Rollback pelo instalador, opcao Voltar a versao anterior, preservando os dados locais.
