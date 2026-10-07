# Entrega por impacto

O fluxo decide separadamente a validacao dos dois canais e o artefato do Piloto.
Nao instala, reinicia estacoes, publica MSI ou altera dados ao preparar o artefato.
O checkout operacional e os dados privados permanecem preservados.

## Decisao do artefato

| Evidencia | Acao |
|---|---|
| Fontes, painel e ambiente iguais; EXE auditado com tamanho e SHA-256 validos | Reutilizar executavel |
| Mesma base do agente, dependencias, protocolo e nomes dos arquivos; mudou apenas conteudo do painel | Preparar painel separado |
| Base ausente, cache invalido, protocolo diferente, arquivo adicionado/removido ou fonte/dependencia diferente | Compilar e auditar |

A impressao digital usa os bytes dos arquivos rastreados, locks, versao e hash
do Python, versoes/metadados RECORD dos pacotes instalados e hashes das DLLs
externas usadas pelo spec. Arquivos desconhecidos entram na base por precaucao.
Docs, testes, design, SQL, Edge Functions e workflows nao integram o executavel.
Arquivos de fonte novos precisam estar rastreados antes do empacotamento.
Os testes continuam independentes do cache: reutilizar EXE nao dispensa validacao.

O cache local fica em `entrega-cache/piloto` dentro do diretorio Git comum das
worktrees. Apenas builds aprovados pela auditoria existente geram uma entrada.
Manifestos antigos sem impressao digital nao servem como comprovacao: a primeira
entrega pode precisar de build completo. Nao ha importacao automatica de EXEs
antigos nem promessa de ganho de tempo nessa primeira execucao.

O comando antigo `compilar-piloto.ps1 -Python ...` continua fornecendo um EXE
completo em `dist/piloto/NewProdPiloto.exe`, como exige `publicar_agente.ps1`.
Com `-PermitirPainel`, usado pela entrega frontend, o resultado fica em uma pasta
nova, identificada por `dist/piloto/resultado-entrega.json`. O caminho deve ser
lido desse recibo: arquivos antigos na pasta principal nao sao a nova entrega.

## Painel sem recompilar

`manifesto-painel.json` relaciona todos os arquivos e seus hashes, protocolo e
SHA-256 do EXE compativel. Para montar uma nova pasta de distribuicao:

```powershell
python ferramentas/entrega_impacto.py montar-painel --pacote C:\Saida\painel-preparado --executavel-base C:\Pacotes\Base\NewProdPiloto.exe --saida C:\Saida\nova-versao
```

A pasta de saida precisa ser nova. O comando confere todos os hashes antes de
escrever, copia o mesmo executavel e coloca o painel atualizado na pasta externa
`painel/` ja suportada por `app.py`. Nao copia configuracoes nem dados da estacao.
Troca de protocolo ou alteracao do conjunto de arquivos exige pacote completo;
assim nao restam arquivos excluidos no painel antigo. Mudancas na API devem
atualizar o contrato de protocolo quando incompatíveis.

A primeira base precisa conter a verificacao de `manifesto-painel.json` na
inicializacao do Piloto. Ela preserva o painel validado mesmo quando a extracao
do executavel produz arquivos com datas mais novas. Hash/protocolo invalido
provoca reposicao do conjunto embutido. O canal de producao mantem o fluxo atual.

Montagem nao e instalacao. A ativacao em estacao continua uma etapa separada,
autorizada, com backup, agente ocioso e conferencia do conteudo servido. Nao usar
esse artefato no canal de producao. Rollback preserva a pasta da versao anterior.

## Testes e tempos

`conferir_duas_versoes.py --base origin/main` calcula o diff desde a base e inclui
mudancas locais. O CI usa a base do PR ou o commit anterior do push, com historico
completo. Sem base informada, continua executando a bateria completa.

- Somente CSS/imagens: contratos de canal, seguranca, protocolo e painel, alem
  de todos os harnesses de navegador existentes, nos dois canais.
- JS, HTML funcional, Python, dependencias, testes ou arquivos desconhecidos:
  bateria completa. Alteracoes apenas de `?v=` em imports JS/CSS de HTML nao
  transformam uma entrega visual em alteracao de logica.
- Documentacao: contratos obrigatorios preservados no CI; sem compilacao.

Os checks obrigatorios e suas dependencias no GitHub permanecem. Cache de pip/npm
reduz downloads nos jobs dos canais; nenhum teste obrigatorio foi desabilitado.
O check de seguranca continua com sua bateria propria completa.

Os tempos de validacao, cache, canais, pacote, hospedagem, hashes publicos e
sincronia aparecem no console. O resumo fica em `entrega-tempos/tempos-entrega.json`
dentro do diretorio Git da worktree (`git rev-parse --absolute-git-dir`). O detalhe
de cada canal/teste fica em `dist/entrega/tempos-canais.json`, inclusive em falhas.
O recibo do pacote inclui tempo e decisao. Tempos reais de CI/compilacao devem ser
medidos na primeira entrega autorizada; testes simulados nao os comprovam.

## Verificacao local da mudanca

```powershell
python -m unittest discover -s tests -p test_entrega_impacto.py -v
Invoke-Pester -Path tests/EntregaSegura.Tests.ps1
git diff --check
```

As regressoes usam arquivos sinteticos, build/auditoria simulados e repositorio
Git temporario. Cobrem reutilizacao, incompatibilidade, corrupcao, fonte alterada
durante build, falha de auditoria, montagem do painel, paths e selecao de testes.

### Evidencia local de 07/10/2026

- 26 testes focados aprovados (16 novos de entrega e 10 de compatibilidade).
- 20 testes Pester da entrega e 91 testes Pester de publicacao aprovados.
- Bateria completa nos dois canais: 461 testes Python aprovados, 2 pulados e
  2 subtestes aprovados por canal; todos os 15 harnesses JavaScript por canal
  aprovados. Aviso existente de depreciacao Starlette/httpx no ambiente.
- Sintaxe PowerShell e `git diff --check` aprovados. Workflow revisado; nao
  executado no GitHub. Parser YAML local indisponivel, sem instalar dependencia.
- Tempos detalhados em `dist/entrega/tempos-validacao-completa.json` e log em
  `dist/entrega/validacao-completa.log` da worktree de implementacao.
- Nenhum build real, commit de entrega, push, deploy ou instalacao executado.
  Os builds das regressoes foram simulados. O ganho de tempo de compilacao e CI
  ainda precisa ser medido numa entrega real autorizada.

Worktree: `C:\ProjetosLocais\ideal-imposition-entrega-impacto-20261007`, branch
`fix/entrega-por-impacto-20261007`, base `e81a0b32`. O checkout operacional foi
preservado. A alteracao inclui ferramentas/CI e uma protecao de inicializacao
do Piloto em `app.py`/`compatibilidade_painel.py`; a futura integracao deve
contemplar os dois componentes, sem remover a barreira de escopo misto do script.

### Preparacao da publicacao autorizada em 07/10/2026

A base foi avancada sem conflito para `ff3620fd` (PR 113), preservando o checkout
operacional. Implementacao registrada em `a81c4b0b`. As validacoes focadas e os
111 testes PowerShell passaram novamente; a bateria dos dois canais foi refeita
com a base atualizada. A publicacao do fluxo segue por PR e checks obrigatorios,
sem usar o comando frontend para contornar seu bloqueio de escopo misto.

Primeiro build real do Piloto auditado: **71,932 s**. Segunda preparacao com as
mesmas entradas: **1,643 s**, acao `reutilizar`, sem recompilar. Medicao local da
etapa de pacote; nao representa o tempo total da entrega ou de CI.

- EXE: 146.594.217 bytes; SHA-256
  `0395ee4439355353c6bf8ffbcb130dbd41e797aa5431292b10711cd4d010df5f`.
- 353 arquivos do painel embutido conferidos por SHA-256 contra as entradas.
- Protecao `painel_externo_validado` confirmada no modulo compilado.
- Auditoria do pacote aprovada; base reutilizavel registrada no cache Git local.
- Artefato inicial: `dist/piloto/compilar-d887401e61d3/NewProdPiloto.exe`.
- Reutilizacao: `dist/piloto/reutilizar-abca66e6e0f0/NewProdPiloto.exe`.
- Nenhum MSI, manifesto de atualizacao de producao ou instalacao foi alterado.
  A base esta preparada para proximas entregas; publicacao do fluxo nao instala
  esse executavel nas estacoes.
