# Anexos do Pedido → CorelDRAW — candidata Ponte 1.10.0

## Escopo e estado

Implementação local de 01/11/2026. Não publicada nem instalada. Frontend isolado em `imposition-corel-anexos-20261101`, branch `feat/corel-anexos-20261101`, base `282f210b` (preserva a distribuição de designers integrada após a Ponte 1.9.1). Fonte da Ponte em `../imposition-coreldraw-20261030`, preservando as alterações locais anteriores.

## Uso

1. Abrir o modelo no CorelDRAW e deixar ativa a página que receberá o arquivo.
2. No box **Anexos do Pedido**, clicar em **Corel**, ao lado de Preview e Download.
3. PDF com várias páginas: escolher a página do PDF. Regra confirmada pelo usuário; não criar páginas extras no documento do modelo.
4. PDF com texto: reutilizar a escolha Texto editável / Abrir em curvas da Ponte 1.9.1.
5. O conteúdo entra centralizado em uma nova camada editável e imprimível, mantendo a escala dos objetos. Não apaga arte, não muda dimensões/páginas e não altera referências de cor, numeração ou picote. Ctrl+Z desfaz a inserção.
6. Conferir, salvar com Ctrl+S e usar Atualizar pelo fluxo normal quando a arte estiver pronta. O botão do anexo não salva CDR nem publica PDF automaticamente.

Formatos iniciais: PDF, PNG, JPEG, WebP e TIFF de uma imagem. PDFs multipáginas permitem escolher uma página. TIFFs com várias imagens, arquivos com senha, formatos diferentes e imagens acima de 40 milhões de pixels recebem mensagem; o Download existente permanece disponível. Limite de download: 30 MiB. CDR, SVG, arquivos Office e compactados não são importados por esta primeira versão.

## Implementação

- `frontend/script.js`: botão por anexo com vínculo por closure, preservando Preview, Download, ocultação e seleção existentes.
- `frontend/tracedraw-runtime.js`: ação attachment, seletor de página, reutilização da escolha de fontes e capacidade `anexos-corel`. Ponte antiga mostra instrução de atualização antes de tentar importar.
- `ponte_imposition/corel_attachments.py`: confirma acesso ao pedido e existência do anexo em `pedidos_artes`, resolve caminhos do Storage, limita download e extrai somente a página escolhida em cópia temporária. Não aceita URL arbitrária de fora do Storage conhecido nem redirecionamentos.
- `corel_service.py`, `runtime.py`, `laboratorio/tracedraw/producao_routes.py`: rota local autenticada com as mesmas origens permitidas; token do operador somente em memória durante a operação. Não exige mapa completo dos modelos para consultar o anexo.
- `corel_adapter.py`: documento identificado por identidade COM; página por índice/nome/quantidade de páginas. A escolha entre chamadas expira em 20 minutos. Mudança de destino durante os diálogos pede novo clique; sucesso consome a seleção. Nova camada é removida se a inserção falhar; outras camadas não são apagadas. Clipboard anterior restaurado quando ainda pertence à operação.

## Verificação

103 testes Python passaram (um aviso preexistente FastAPI/httpx). Cinco harnesses JavaScript passaram: anexos, escolha de fontes, integração, sessão e atualização conjunta. Sintaxe de script.js/tracedraw-runtime.js e diff conferidos.

Prova real em CorelDRAW 24.3, somente em documento sintético novo: inserção na primeira página de documento com duas páginas, preservando objetos existentes e camada bloqueada; outra página e dimensões preservadas; desfazer confirmado. Documento de prova fechado sem salvar, sem abrir/salvar/publicar pedidos oficiais. Script: `tests/prova_corel_anexos.py`; resultado: `dist/diagnostico-anexos-20261101/prova-corel.json` na fonte da Ponte.

## Entrega futura

Candidata: `../ponte-build-corel-anexos-20261101-1`. A publicação requer frontend e Ponte 1.10.0 juntos, com atualização do manifesto de download somente após a conferência do instalador publicado. A distribuição pública 1.9.1 permanece preservada. Não foi feita instalação nesta estação nem nos designers.

Próxima prova operacional após entrega: instalar a Ponte, recarregar o Imposition, abrir um modelo, importar um anexo PDF de duas páginas escolhendo a segunda e conferir a página ativa. O botão Atualizar não deve ser usado apenas para provar a importação de um anexo.

## Artefato conferido

Instalador candidato: `../ponte-build-corel-anexos-20261101-1/dist/Instalar-Ponte-Imposition.exe`.

SHA-256: `b590170ec4958c6b30e0911cbb60b130cde6e31b14f735a9b52bf009b01dc761`.

As verificações `--check` do runtime e instalador retornaram `ready: true`, versão `1.10.0`. Runtime confirmou ICC, Node e motor disponíveis. Executadas somente nos diretórios isolados `check-runtime` e `check-installer` do build, sem ativar a ponte da estação. Fontes desta alteração e hashes preservados em `source-review/` no build.


## Escopo conjunto autorizado para entrega

Em 01/11/2026 o usuário solicitou incluir a pendência da sessão Lista de Arte. Foi incorporado o diff revisado de `imposition-designers-adm-20261101`: gerenciamento em ADM → Configurações Gerais → Designers, removido da Lista de Arte; regras, controles dos pedidos e autorização permanecem preservados. A abertura da aba apenas consulta, não ativa a fila nem redistribui pedidos. Nenhuma instalação de SQL, ativação de agendador ou escrita de pedido integra esta publicação. O harness de navegador passou com RPC simulada.

Recuperação: revisão anterior do instalador preservada no Drive; interface pode ser recuperada por commit restrito às mudanças desta entrega, preservando avanços posteriores. Não restaurar banco nem descartar checkouts operacionais.


## Publicação do instalador — 01/11/2026

Ponte 1.10.0 publicada no mesmo ID público `1NPpDiuIsx1ccnt7NxsXNSbV5xnU7CQUo`: 189803607 bytes, SHA-256 conforme acima; revisão `0B5eKrKA9HYFtekEwd25FYUlzU2QwVWRzQjZaMlg5dUJUeURVPQ`. Download autenticado integral e download público conferidos. Revisão anterior preservada; acesso por link somente ao instalador, sem alteração dos Drives de artes. Nenhuma estação instalada.
