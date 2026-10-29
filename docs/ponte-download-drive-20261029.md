# Distribuicao da Ponte pelo Google Drive

## Destino e seguranca

Conta administrativa existente: gdrive@idealingresso.com.br. Pasta exclusiva em
Meu Drive: `1W6gAzjsdgJmVRzI-J3w6IeMX-Flr1b31` (Imposition — Instalador da Ponte).
A pasta nao foi compartilhada. Somente o arquivo abaixo recebeu anyone/reader,
sem descoberta por pesquisa. Nenhuma permissao de arte ou Drive compartilhado foi alterada.

Link permanente: https://drive.google.com/file/d/1NPpDiuIsx1ccnt7NxsXNSbV5xnU7CQUo/view

Versao inicial 1.6.0, 112462756 bytes, SHA256
`eba99c78db7a5e646a2672c7da10faa6db4152ccc156863d3ba96a6f57d46da5`.
Upload, releitura autenticada, permissao e download integral sem login conferidos.
O Google apresenta confirmacao de download por tamanho/executavel. Nao suprimir
essa tela nem prometer assinatura Authenticode.

## Interface

`ponte-download.js` adiciona um unico link acima dos modelos para usuarios com
`perm_lista_arte_edit`. Consulta `ponte-download.json` sem cache ou credenciais;
valida ID, versao e hash e constroi URL exclusivamente em drive.google.com.
Falhas ocultam o link e mostram mensagem. Nao inicia ou instala executaveis.
O manifesto nao contem chaves ou credenciais.

## Cada nova versao aprovada

1. Compilar e validar a ponte. Nao distribuir builds intermediarios automaticamente.
2. Na worktree administrativa `imposition-ponte-release-20261028`, executar com
   o Python existente e PYTHONPATH da worktree:
   `python ferramentas/publicar_ponte_drive.py --build <diretorio-do-build> --publicar-versao-aprovada`.
   A rotina usa a autorizacao Google protegida existente, valida conta/escopo,
   confere SHA do instalador, localiza o arquivo exclusivo por appProperties,
   recusa downgrade ou mesma versao com hash diferente, preserva a revisao anterior,
   atualiza o mesmo fileId, verifica download autenticado e anonimo e a permissao.
3. Somente depois da conferencia, a rotina grava `frontend/ponte-download.json`.
   Incorporar esse manifesto na entrega protegida do frontend para atualizar o
   rotulo de versao, conferir os dois dominios e registrar o recibo. O link mantem
   o ID mesmo antes dessa atualizacao do rotulo.
4. Manter o artefato anterior e o recibo. Publicar nova versao nao atualiza
   silenciosamente as estacoes: o designer baixa e executa o instalador.

A rotina e acionada na entrega de cada versao aprovada; nao ha observador que
publique codigo a cada edicao. Revisoes do Drive sao preservadas; o limite de
revisoes fixadas pode exigir manutencao futura, sem exclusao automatica.

## Validacao e retorno

Harness de interface cobre link permitido, ID malicioso, manifesto ausente e
ausencia de duplicatas. Testes administrativos cobrem SHA divergente, downgrade
e mesma versao com bytes diferentes. O hash publico inicial corresponde ao local.
O painel requer `ponte-download.js` e `ponte-download.json` na lista de sincronismo.
Para retirar o acesso web, reverter somente o commit desta entrega. Instalacoes
existentes e arquivos dos pedidos permanecem preservados. O instalador permite
retornar a versao instalada anterior; nao confundir com restaurar artes.
