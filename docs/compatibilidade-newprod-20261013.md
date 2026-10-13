# Compatibilidade das fontes NewProd — 13/10/2026

## Escopo e estado

Compatibilizacao concluida e entregue: oficial 1.2.401, teste
1.2.401-teste.1 (MSI 1.2.401) e web v1052. PR #135 integrado na main em
777fa4a2. Pacotes publicos conferidos por download integral, tamanho e SHA-256;
manifestos relidos e listas de estacoes preservadas. Web conferida nos dois
dominios. Nenhuma instalacao, reinicio ou impressao fisica foi comandada.

A primeira etapa foi somente local. A continuacao "seguir" autorizou a entrega;
o uso exclusivo da chave de publicacao foi autorizado separadamente. Os
artefatos antigos 1.2.400 e 1.2.399 foram preservados, sem sobrescrita.

## Bases preservadas e integracao

- Web/main: `3259cfb2` (v1051), com a portaria de reentrada.
- Oficial: `16bc1ca9`, branch `release/contorno-texto-banco-400`.
- Teste: `529bfd4e`, preservando offline e impressao experimental.
- Oficial integrado em `fix/compatibilidade-newprod-20261013`, criado da main.
- Teste integrado em `fix/compatibilidade-newprod-teste-20261013`.

As duas worktrees ficam em `C:\Users\Junior\Projetos Ingresso ideal`, com os
nomes `imposicao-compatibilidade-newprod-20261013` e
`imposicao-compatibilidade-newprod-teste-20261013`. A preparacao usou squash; depois da validacao, as fontes foram registradas
nos commits indicados na secao de entrega. Os checkouts operacionais anteriores nao foram modificados.

A fonte oficial incorpora cache persistente, diagnosticos, consulta de
modelos, capas por camarote e Montagem da linha 1.2.389–1.2.400, preservando
as alteracoes da web. A fonte de teste tambem incorpora a main atual;
conflitos de identidade e instalador foram resolvidos mantendo o canal teste.
Dependencias existentes sao reutilizadas por NODE_PATH e junction local
node_modules; nenhum pacote ou lockfile foi instalado ou alterado.

## Correcoes comuns

- Escala do modelo unico em blocos: a entrada sintetica agora conserva
  `arte_sx/arte_sy`. A regressao de 104% anteriormente produzia 40,13 mm em
  vez de 41,60 mm. A correcao de `7245fae2` passa a existir nas duas fontes.
- Contorno no Texto — Banco de Dados: motor, editor e previa presentes nas
  duas fontes. Preservados espessura em mm, cor, rotacao e ajuste de texto.
- Pedidos mistos: a conferencia de impressos exclui produtos de estoque
  somente quando o snapshot e a tela comprovam essa classificacao. Nao
  libera produtos de estoque nem ignora modelos desconhecidos.
- CSV importado: a URL de origem nao vira download obrigatorio quando as
  linhas ja estao no snapshot. Fotos/fontes nas linhas continuam obrigatorias;
  a fonte compartilhada preserva a correcao anteriormente publicada em v10.

## Contrato entre painel e motor

`/api/version` anuncia `texto_banco_contorno_v1` e
`escala_modelo_blocos_v1`. A barreira existente de integridade confere os
recursos antes de consultar pedidos, baixar artes ou enviar o trabalho.
Ela e usada por Pedido, Imposicao e Montagem, incluindo numeracao de verso
e Multi-Artes. Recursos nao utilizados nao exigem atualizar o motor.

Excecoes de compatibilidade restritas aos releases ja conferidos:

- `1.2.400` oficial aceita contorno mesmo sem anunciar a capacidade.
- `1.2.399-teste.1` aceita escala em blocos mesmo sem anunciar a capacidade.
- Outras versoes sem a capacidade precisam atualizar para usar o recurso;
  nao se deduz suporte pela versao da web nem por comparacao numerica entre canais.

O protocolo de sessao local permanece 1: as novas capacidades sao aditivas.
O cache dos arquivos alterados do painel usa v1052 nesta preparacao local;
isso nao significa publicacao de web v1052.

## Modos de impressao

| Camada | Contratos preservados/verificados |
|---|---|
| Motor PDF comum | Frente, duplex, verso unico, PDFs paginados, Multi-Artes, blocos/folhas, refazer, capas, TICKET e teatro |
| Drivers Windows comuns | GDI padrao, PDF RAW, Ghostscript e auto; modo explicito nao troca driver |
| Protecao de envio | Auto nao tenta outro driver depois de envio iniciado; identificadores e historico preservados |
| Hot Folder | Escrita atomica/exclusiva, nomes seguros, lista de pastas e preservacao de arquivos |
| Canal teste | GDI experimental, GDI atual, PDF RAW e lote; permanecem opt-in e em rotas proprias |

`print_mode` de faces do PDF nao e o `print_mode` das opcoes do driver.
Valores invalidos, incluindo `front`/`duplex` enviados como driver, antes
caiam silenciosamente em RAW/auto. Agora retornam erro antes de acessar o
driver. Omissao continua selecionando GDI. Nenhuma troca automatica de
estrategia foi adicionada.

## Isolamento da entrega

O publicador e compartilhado, mas produto, prefixo do MSI e nome do manifesto
pertencem ao canal da fonte. Arquivo de outro canal e recusado antes da rede.
O canal teste nao pode escrever `latest.json`, nem com bootstrap solicitado.
O teste de identidade passa a reconhecer o sufixo teste sem enfraquecer as
verificacoes de porta, identidade e diretorio protegido.

`impressao-teste-modelo.js` integra a lista de arquivos do painel de teste.
Nao foi promovido ao produto oficial. Offline, dados locais e configuracoes
dos canais continuam separados conforme os contratos existentes.

## Validacao e evidencias

Os testes usam PDFs/estacoes sinteticos, mocks de hardware e APIs locais.
Logs e tempos ficam em `dist/compatibilidade` de cada worktree. A bateria
`ferramentas/conferir_duas_versoes.py` inclui as regressoes novas, os modos
de impressao e os contratos legados. O canal teste inclui suas regressoes
de offline, destinos e impressao experimental.

| Base | Python por perfil | Perfis | Harnesses JS por perfil | Edge | Portaria | Hot Folder | Cache/diagnosticos |
|---|---:|---|---:|---:|---:|---:|---:|
| Oficial integrada | 823 + 2 subtestes | producao, piloto, oficial | 19 | 343 | 61 | 47 | 26 |
| Teste integrada | 939 + 2 subtestes | producao, piloto, oficial | 19 | 349 | 61 | 47 | 26 |

Sem falhas na rodada concluida. Dois testes por perfil nao executados por
exigirem qr_ideal_pool.bin real, ausente; a bateria de QR sintetico passou.
Aviso preexistente de depreciacao Starlette/httpx. A portaria foi executada
separadamente uma vez em cada fonte, pois nao depende do perfil do agente.
Edge Functions executadas com cache existente, sem permissao de rede.

Onze arquivos comuns conferidos byte a byte, incluindo motor, drivers,
Hot Folder, Montagem, cache e publicador. Hashes, contagens e tempos:
`evidencias/compatibilidade-newprod-20261013.json`. Logs definitivos usam
`dist/compatibilidade/concluido-<perfil>.log` e respectivos arquivos de tempos.

Falhas intermediarias nao foram ocultadas: a regressao de escala reproduziu
o defeito; oito casos reproduziram o despacho indevido de modos invalidos;
o ambiente inicialmente nao resolvia Puppeteer nos caminhos das worktrees;
o harness de faces da Montagem precisou fornecer os identificadores de
pedido e structuredClone exigidos pela preparacao atual. As assercoes de
PDF, integridade e recusa foram mantidas.

Compilacao e auditoria do MSI foram concluidas na continuacao abaixo.
Rollout por estacao, PDF com dados reais e aceite de impressao fisica
continuam sem prova nesta entrega. Nenhum resultado
de simulacao comprova impressao fisica ou instalacao nas estacoes.


## Continuacao autorizada: entrega 1.2.401 e web v1052

Fontes registradas e enviadas em branches isoladas: oficial 15c42ab9,
teste e738516c. Integracao oficial pelo PR #135; o canal experimental
permanece em sua branch propria. Checkouts operacionais preservados.

MSI oficial 1.2.401: 194990080 bytes, SHA-256
`971d4323327c93b37c4d4764857055971dfad3c3f2039d8be7d74e4f52ea8a43`.
MSI teste 1.2.401, runtime 1.2.401-teste.1: 196669440 bytes, SHA-256
`7804721b2534996eafccc980be29cfcb63fde9f3f7ea6d99ac11a8f51d2b73e6`.
Auditorias do executavel, preservador e MSI aprovadas, sem arquivos privados.
Nove modulos conferidos contra as respectivas fontes e 356/375 arquivos de
painel conferidos. DLLs GDI incluidas. Sete modulos compilados comuns sao
identicos entre os dois canais; provas em evidencias/compatibilidade-401-*.

Treze testes de versao, perfil, publicador e compatibilidade passaram em
cada fonte depois da troca de versao. A auditoria adicional do MSI teste foi
inicialmente chamada antes do fim do linker; apos conclusao com codigo zero,
a leitura de propriedades e toda a auditoria passaram. Nao foi uma falha
do instalador concluido.

Previa Cloudflare 2292743a-8798-4399-8f28-35c33ca0dc20 conferida: 9/9 arquivos
alterados correspondem a fonte. A producao foi conferida posteriormente, conforme registro abaixo.
Uso exclusivo de SUPABASE_SERVICE_KEY de .env.local autorizado pelo usuario;
nenhum valor exibido, salvo no Git ou incluido nos pacotes.

Entrega publica concluida em 13/10/2026. Os dois MSI foram enviados sob nomes
novos e baixados integralmente antes da ativacao. Manifestos oficiais e teste
relidos em 1.2.401; mantidas exatamente as oito estacoes oficiais e as duas
de teste. Os tres manifestos anteriores estao em
dist/compatibilidade/manifestos-antes-401.json e nos backups do publicador.

Seis checks do PR #135 aprovados, incluindo os tres perfis, consulta,
seguranca/recuperacao e previa Cloudflare. Merge no SHA conferido.
Cloudflare de producao 6b1008eb-83d2-4ded-ae97-31234a32e70c concluida;
18/18 comparacoes normalizadas com cache-buster aprovadas nos dominios
imposition.ai-ideal.com.br e imposicao.pages.dev. Tag web v1052 aponta para
777fa4a2. Evidencias de PR, deployment, assets e manifestos em docs/evidencias.

Nenhuma Edge Function ou migracao SQL foi publicada nesta etapa; os testes
locais de Edge nao comprovam uma nova implantacao remota. Nao houve consulta
a pedidos reais, instalacao, reinicio ou comando de impressao fisica.
A atualizacao efetiva e o aceite em campo precisam ser conferidos por estacao.

Recuperacao: conservar MSI, fontes anteriores e manifestos. Como o agente nao
faz downgrade, uma reversao de codigo exige novo numero superior a 1.2.401,
rebuild e auditoria. Web usa reversao restrita em novo commit ou rollback do
deployment comprovado. Nao tocar em configuracoes, spool, QR ou filas para
executar a recuperacao. Conferir PDF real antes do aceite de impressao.
