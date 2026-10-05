# Registro da entrega: desempenho e conferencia do Piloto

Data: 04/10/2026. Escopo: Piloto local, mantendo a instalacao padrao.

## Resultado e versoes

| Canal | Versao conferida | Entrada | Situacao |
|---|---|---|---|
| Producao | NewProd 1.2.356 | http://127.0.0.1:9000/app/ | Instalacao preservada |
| Piloto | NewProd 1.2.356-piloto-local.23 | http://127.0.0.1:9001/app/ | Correcao instalada e servida |

As fontes estao integradas na `main`; o painel experimental utiliza seu
executavel proprio. O checkout operacional com alteracoes anteriores foi
preservado. A entrega ocorreu por checkout isolado; nao foi executado pull,
stash, reset ou substituicao dos arquivos de trabalho do operador.

## Alteracoes registradas

- [PR 82](https://github.com/ingressoideal1-gif/imposicao/pull/82): conferencia
  por abertura/reabertura do pedido, consulta integral das numeracoes em lote,
  preparacao de ate quatro modelos em paralelo, etapas da janela sem pausas
  fixas no Piloto e leitura dos recursos conhecidos por revisao local.
- [PR 83](https://github.com/ingressoideal1-gif/imposicao/pull/83): a numeracao
  continua bruta no calculo do digest; uma copia recebe o mesmo normalizador
  do catalogo antes de entrar no estado da tela. METADATA define o modo
  efetivo, sem virar elemento de impressao ou provocar divergencia falsa.
- [PR 84](https://github.com/ingressoideal1-gif/imposicao/pull/84): a revisao
  revelou uma disputa de gravacao de objetos compartilhados no Windows.
  A .23 publica o arquivo completo atomicamente, sem substituir uma copia
  valida que outro modelo esteja lendo. Reparo de corrupcao continua exigindo
  hash e tamanho corretos; acesso negado real continua bloqueando a preparacao.
  A regressao reproduziu a falha na implementacao anterior e passou com a
  correcao, inclusive para instancias independentes de armazenamento.

O snapshot integral do modelo, os hashes dos arquivos, a conferencia final,
as quantidades fisicas de TICKET, NI/NF e a regra de blocos de Multi-Artes
continuam obrigatorios. Alternar modelos do pedido preparado reutiliza a
conferencia; mudanca real no cadastro continua bloqueando o trabalho.

## Rastreabilidade

| Marco | Referencia |
|---|---|
| Integracao do desempenho | `625e5a6d71f7440fbd17f657c1425938fe80f602` |
| Fonte do executavel .22 | `976d1caf21547c554e7ba21f0d74ce75b62151ca` |
| Integracao da correcao | `32577ccc39b9e3321e3c113d4d0ebb442430ca96` |
| SHA-256 do executavel .22 | `7127d6023f899ed7ef396cbf9b42898ac266bc8387000de1b2841c390082c642` |

Os arquivos de runtime da fonte do build e do commit de integracao sao iguais.
O manifesto do pacote .23 registra sua fonte e hash; a evidencia detalhada
da instalacao e recuperacao permanece no registro privado. A revisao exige
novo pacote independente somente do Piloto. Os commits usam `[CF-Pages-Skip]`: esta entrega nao
publica frontend web nem atualiza o MSI/manifesto do NewProd padrao.

## Evidencias de validacao

- 379 testes Python aprovados e dois ignorados por recursos privados, em cada
  canal; 12 harnesses JavaScript em cada canal.
- 48 verificacoes da barreira de integridade em Node e navegador, incluindo
  METADATA tratado, digest bruto preservado e alteracao real recusada.
- Os quatro checks obrigatorios da correcao .22 passaram no
  [run 37245318701](https://github.com/ingressoideal1-gif/imposicao/actions/runs/37245318701).
- Ensaio autenticado da .22 de um pedido com 11 modelos: 11 barreiras finais
  aprovadas, uma preparacao por abertura, identidade e faixa conferidas,
  artes locais. Primeiro modelo em 950 ms; demais em 332 a 498 ms. Medicoes
  deste computador e desse conjunto, sem promessa geral de desempenho.
- Na API instalada .22, os modos sincrono e streaming retornaram HTTP 200 e
  PDF sintetico valido de uma pagina, com conteudo e hash conferidos.
  O ensaio nao enviou job ao spool nem publicou faixa comercial.
- Executavel, formatos e credencial protegida do agente padrao conferidos
  por hash; identidades distintas; 27 assets web/painel padrao preservados.

Os detalhes do pedido, diagnosticos e inventarios de producao permanecem no
registro privado. Esta documentacao nao incorpora dados comerciais ou segredos.

## Recuperacao e retomada

O backup da instalacao foi cifrado com AES-256-GCM, decifrado em ensaio e conferido
por SHA-256/CRC do ZIP; o snapshot SQLite passou na verificacao de integridade.
A copia privada no Google Drive foi confirmada por identificador, tamanho e
ausencia de compartilhamento. O hash da copia do Drive Desktop confere com
o local; o conector nao expoe o checksum do servidor.

Os pacotes anteriores e seus manifestos foram preservados. Para rollback,
aguardar o Piloto ocioso, pausar sua coleta, encerrar somente seus processos
e restaurar o manifesto anterior pelo inicializador exclusivo. Se restaurar
dados, utilizar o backup cifrado em pasta separada, conferir o inventario e
reproteger credenciais conforme o procedimento de recuperacao. Preservar o
diario; nao restaurar sobre `NewProd Agent` nem limpar o spool.
As versoes anteriores a .23 mantem a falha de publicacao concorrente no cache;
um rollback nao deve ser usado como solucao definitiva para essa falha.

Para usar a correcao, recarregar o painel da porta 9001 com Ctrl+F5 e reabrir
o pedido. Conferencia visual do trabalho real e aceite de impressao fisica
continuam separados dos ensaios. Ha dependencias online; pedidos acima de
128 modelos e todas as combinacoes de fotos, bancos, fontes e Multi-Artes
nao foram homologados por este ensaio.

As regras de manutencao conjunta e instalacao independente permanecem em
[NewProd: producao e Piloto](newprod-producao-e-piloto.md).
