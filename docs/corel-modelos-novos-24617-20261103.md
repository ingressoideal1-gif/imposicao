# Inclusao de modelos no CDR salvo — 03/11/2026

Caso 24617: metadados do Drive continham PISTA/1005933, produto 402. Consulta somente leitura confirmou MESA/1006027 no pedido atual. Comparacao integral recusava abrir o CDR.

Correcao local em corel_service.py/corel_adapter.py: aceita extensao do mapa existente por modelos novos ao final, com identidades e configuracoes das paginas anteriores preservadas. Prepara PDF apenas dos novos modelos, verifica fontes pelo fluxo existente, amplia uma copia do CDR via AddPagesEx e replace_art, preserva backup antes-novos-modelos e grava mapa novo apos o Corel concluir. Disco e Drive usam o mesmo fluxo. Nova abertura nao repete inclusao. Documento aberto com mapa antigo exige salvar e fechar somente esse documento, para preservar edicoes em memoria.

Nao cobre remocao, reordenacao ou mudanca de estrutura de paginas existentes: tais casos nao sao tratados como inclusao. Arquivos de outro pedido/produto continuam recusados.

Validacao: 80 testes de abertura, integracao, limpeza, geometria, gabaritos e fontes PDF passaram. Prova real sintética no Corel: uma pagina PISTA preservada byte a byte no arquivo original e identica na rasterizacao do PDF; duas novas paginas MESA Frente/Verso adicionadas com conteudos distintos. Resultado em dist/correcao-mapa-24617-20261103/prova-*/resultado.json. Nenhum pedido oficial atualizado, nenhum CDR operacional alterado.

Entrega 1.10.2: empacotada, runtime --check e instalador --check aprovados em destinos isolados. Bateria ampliada: 97 testes passaram. Sem instalacao automatica nas estacoes; validar 24617 apos atualizar a ponte pelo instalador. Publicacao do instalador e manifesto em andamento nesta entrega. Copias das fontes anteriores em dist/correcao-mapa-24617-20261103/*.antes.

API Corel utilizada: https://community.coreldraw.com/sdk/api/draw/19/m/document.addpagesex?lang=vba

Instalador: 189815623 bytes. SHA-256: 43d3aeb89cfa929799267f86e19ae1411440c776ee1ca3d23b0aa622b4bf5476. Pacote sem credenciais ou arquivos operacionais. Build: ../ponte-build-modelos-20261103-1102. Preserva correcoes de margens de 1.10.1.

Drive: publicado no ID habitual; downloads integrais autenticado e publico verificados. Revisao anterior preservada. Revisao 1.10.2: 0B5eKrKA9HYFtUGo4cVFZVVN4clR1KzliKzEwcjRyUFd5cGtnPQ.
