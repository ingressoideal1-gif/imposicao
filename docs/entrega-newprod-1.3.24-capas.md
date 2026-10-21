# Entrega NewProd 1.3.24 - capas TICKET

Data: 21/10/2026.

## Correcao

A capa usa inicio + indice local da celula x quantidade de tickets, como o miolo.
O valor inicial nao e multiplicado. Modelos combinados usam seus proprios parametros.
As quantidades e a numeracao do miolo nao foram alteradas.

Pedido 23757, PANCHO 1003310: quatro capas 0002-0251, 0252-0501,
0502-0751 e 0752-1001. ASSADO 1003313: uma capa 0001-0200.
Dados consultados somente em leitura; nenhum pedido foi modificado.

## Fonte e validacao

- Correcao principal: PR #185, merge 3c54214bc895834ac458c834b545f7b3a3e556ee.
- Todos os checks obrigatorios da PR aprovados antes do merge.
- Pacote baseado em agente-v1.3.23 (b1247953), preservando os ajustes publicados.
- Fonte do pacote: 023e1a2a, branch release/newprod-1.3.24-capas.
- 35 testes de capas aprovados, incluindo PANCHO e ASSADO.
- Producao, Piloto e Oficial: 1136 testes aprovados e 2 ignorados por perfil,
  mais os harnesses de interface. Aviso de depreciacao Starlette/httpx existente.
- PyInstaller, preservador e MSI auditados sem arquivos privados/modulo de segredo.
- ProductVersion 1.3.24 e rotinas corrigidas conferidas no executavel empacotado.

## Artefato

- NewProdPiloto_Oficial_v1.3.24.msi
- 196743168 bytes
- SHA-256: 28e29dce040d38d743e92d3b8d02cc78e0dcc140653b131b13bb68a868c028a9
- A publicacao e os downloads sao registrados em dist/publicacao-unica-1.3.24-*/.

## Limites

A disponibilizacao publica nao comprova instalacao em todas as estacoes,
geracao do pedido na estacao nem impressao fisica. Nenhum restart foi forcado.
Antes da entrega, LASER-02, TEX-02 e ACABAMENTO-TEX reportavam erro MSI 1603
em atualizacao anterior; o diagnostico requer o log local de cada instalacao.

## Publicacao confirmada

Os dois downloads publicos (Oficial e alias Teste) conferiram bytes e SHA-256.
Os tres manifestos latest.json, newprod-piloto-oficial.json e
newprod-piloto-teste.json foram ativados e relidos com cache-buster na 1.3.24,
sem restricao adicional de estacoes. Os manifestos anteriores foram preservados.

Consulta apos publicacao em 21/10/2026, aproximadamente 11:37 de Sao Paulo:
nenhuma estacao havia reportado 1.3.24. A disponibilidade esta confirmada;
a adocao e a regeneracao/impressao das capas do pedido 23757 permanecem pendentes.

Recuperacao: preservar os artefatos e manifestos anteriores. Se for necessario
reverter o codigo distribuido, publicar a fonte anterior com uma versao superior;
o atualizador nao faz downgrade automatico.
