# NewProd 1.3.0 — canal de teste

Em 14/10/2026, o usuario pediu a publicacao como NewProd 1.3.0 e confirmou
explicitamente que deve continuar somente no canal de teste. Alvos: LASER-01
e PC-JR-HOME. Nao promover este pacote ao manifesto oficial ou a ponte legada.
Runtime: `1.3.0-teste.1`; MSI: `NewProdPiloto_Teste_v1.3.0.msi`.

## Comportamento

- O box "Teste — forma de envio" fica ao final da coluna direita, abaixo de
  Refazer folhas. Sem configuracao salva, a opcao inicial e GDI atual.
- Salvar grava `forma_envio` junto das demais configuracoes do produto na
  estacao. Reabrir restaura a opcao salva; registros antigos ou valores
  desconhecidos usam GDI atual. Cache local e fallback offline preservados.
- Hot Folder selecionado continua prioritario: nao encaminha a impressora.
  O canal de teste continua sem confirmar comercialmente a impressao.
- Os cabecalhos dos grupos recebem o nome oficial do produto. A consulta da
  lista local inclui `produtos.nomeReal`. Listas antigas recuperam o nome
  pelos itens de origem somente quando ha um unico nome para o mesmo ID.
  Nome de modelo nao substitui nome de produto; snapshots nao sao alterados.
- Nomes nos cabecalhos sao escapados como texto. IDs, setores, estoque,
  numeracao e os vinculos dos modelos permanecem preservados.

## Consulta de nomes

A alteracao da query foi autorizada separadamente. Antes do deploy, as 12
fontes da funcao `piloto-local` v10 foram baixadas e comparadas. A unica
diferenca foi a inclusao de `nomeReal` no select de produtos em
`_compartilhado/piloto_lista.ts`.

Funcao publicada como v11 no projeto `vwbtitjlpelrcnsytzqw`, estado ACTIVE,
mantendo a autenticacao existente (`verify_jwt=false`, verificacao propria
do agente/sessao). As 12 fontes foram baixadas novamente e conferidas.
Nenhuma migracao ou escrita em registros foi executada.
Essa funcao e compartilhada pelos agentes que ja usam a lista local; o novo
campo e aditivo. A distribuicao do instalador permanece somente no teste.
Evidencia: `evidencias/release-130-edge-publicacao.json`.

Consulta somente leitura ao catalogo confirmou os exemplos da imagem:
911 = Credencial Polaseal 10x15; 2004 = Cordao Preto liso de 9mm com Jacare;
3002 = Cordao 105cm. Essa consulta comprova os nomes de origem; a conferencia
visual nas estacoes apos atualizar permanece separada.

## Verificacao e recuperacao

Regressoes especificas em Chromium: posicao/visibilidade do box, GDI padrao,
salvar/reabrir os tres modos, configuracoes antigas, cache offline, nomes de
produto e prioridade do Hot Folder. Fila: 71 verificacoes; ladrilhos de Hot
Folder: 48. Edge Functions: 350 testes aprovados, sem permissao de rede.

Bateria completa `conferir_duas_versoes.py`: perfis producao, piloto e oficial,
cada um com 939 testes Python, 2 subtestes e 19 harnesses JavaScript aprovados.
As 60 etapas terminaram com sucesso. Dois testes por perfil foram ignorados
por dependerem de pool QR real ausente; um aviso preexistente de depreciacao
Starlette/httpx por perfil. Os testes sinteticos nao enviaram trabalhos reais.

Auditoria do EXE, MSI e preservador aprovada: sem arquivos privados, identidade
do canal e versao MSI conferidas, 375 arquivos de painel identicos a fonte.
Evidencia: `evidencias/release-130-teste-auditoria.json`.

O Deno foi executado pelo binario ja instalado com `--node-modules-dir=none`
e `--cached-only`: a invocacao inicial nao encontrou tipos Node no modo de
node_modules local. Nenhuma dependencia foi instalada ou atualizada.

Logs, tempos e backups da entrega ficam em `dist/compatibilidade/release-130-*`.
Executaveis anteriores preservados em `dist/compatibilidade/base-402-binarios`;
MSI 1.2.402 preservado. Fontes anteriores da funcao em
`dist/compatibilidade/edge-130-antes`. Reversao do agente exige novo numero
superior, preservando dados e filas. A funcao pode ser republicada a partir
das fontes anteriores, mantendo o mesmo contrato de autenticacao.

Publicacao de pacote nao comprova instalacao nem impressao fisica. Nenhuma
instalacao, reinicio, limpeza ou impressao foi executada nesta entrega.

## Publicacao concluida

Fonte registrada e enviada no commit `0f4cf53d`, branch
`fix/compatibilidade-newprod-teste-20261013`.
MSI publicado sob nome novo e baixado integralmente antes de ativar o manifesto:
196677632 bytes, SHA-256
`42ef70225c65947a640698c8e60dc2fef78f5376f34b144a829169bb1441d8a7`.

`newprod-piloto-teste.json` relido com cache-buster em 1.3.0, mantendo exatamente
LASER-01 e PC-JR-HOME. `newprod-piloto-oficial.json` e `latest.json` permanecem
identicos aos anteriores, em 1.2.401. A versao principal nao foi promovida.
Evidencia: `evidencias/release-130-teste-publicacao.json`.
Manifestos anteriores: `dist/compatibilidade/manifestos-antes-release-130.json`.
