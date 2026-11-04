# Ponte 1.10.4 — tolerancia de recorte e memoria do backup

## Alteracoes
- CorelDRAW: tolerancia de 2 mm por borda no recorte e de 2 mm nas dimensoes conferidas. Limita o recorte a pagina exportada, sem escala nem deslocamento. Rotacao, paginas vazias e diferencas maiores continuam recusadas.
- O mapa de edicao do CDR permanece separado do mapa do PDF. TraceDraw conserva a tolerancia anterior.
- Servico central: confirma todos os bytes do CDR recebido por leitura em blocos, evitando alocar uma segunda copia integral para conferir o upload. Nao desativa a verificacao de integridade.

## Evidencias
- Pedido 24708: print_box excedia a largura nativa em aproximadamente 0,000006 mm; export_pages usava contencao exata, embora crop_pdf ja tolerasse arredondamento.
- Pedido 24702: cinco uploads de aproximadamente 23,5 MB chegaram ao Storage privado entre 13:02 e 13:18 UTC de 04/11/2026, sem registro na fila. Os cinco horarios correspondem a Memory limit exceeded apos upload e inicio da releitura. Video mostra abertura correta do CDR e falha em Atualizar.
- Pedido 24707: mensagem generica de operacao nao confirmada; causa ainda nao confirmada. Nao atribuir automaticamente ao erro de memoria.

## Validacao
- 103 testes Python passaram, incluindo 0/1/2 mm, rejeicao acima de 2 mm, preservacao de posicao, pares frente/verso e mapas antigos.
- Testes JavaScript: fila de backup, autorizacao, Drive e leitura em blocos de 23,5 MB e 30 MiB; rejeitam byte alterado, truncamento e excesso.
- Executavel e instalador --check: 1.10.4 ready=true; payload de 117 arquivos sem credenciais ou documentos operacionais.
- Servico central ponte-drive versao 12 ACTIVE, verify_jwt=true; bundle anterior preservado para recuperacao. Validacao real de Atualizar no 24702 solicitada ao usuario.

## Recuperacao e limites
- Fonte operacional preservada. Copias anteriores e arquivos fontes da correcao em ponte-fix-1104-backup-20261104 e ponte-build-recorte-20261104-1104, fora do repositorio principal.
- Publicacao do instalador nao instala nas estacoes. Nao houve substituicao manual de PDF/CDR nem limpeza de arquivos de pedidos.
- A instalacao nas estacoes e a confirmacao real dos pedidos continuam verificacoes separadas.
