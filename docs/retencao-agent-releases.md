# Retencao dos instaladores NewProd

Autorizacao de 21/10/2026: manter as tres versoes numericamente mais novas de
cada familia `NewProd_Setup`, `NewProdPiloto_Setup`, `NewProd_Original_Retorno`,
`NewProdPiloto_Oficial` e `NewProdPiloto_Teste` no bucket `agent-releases` do
projeto `vwbtitjlpelrcnsytzqw`. Nenhuma outra familia, pasta ou objeto e removido.

O ponto de entrada e `ferramentas/publicar_pacote_oficial.py`, chamado pelo fluxo
`publicar_agente.ps1` -> `ferramentas/publicar-oficial.ps1`. A retencao so inicia
depois do upload/download conferido e da ativacao com releitura de todos os
manifestos alterados por aquela publicacao. Build isolado, simulacao e upload
sem ativacao nao executam limpeza. Nao requer novo MSI nem instalacao nas estacoes.

`latest.json`, `newprod-piloto-oficial.json`, `newprod-piloto-teste.json` e todos
os MSIs referenciados por eles sao preservados, mesmo fora das tres versoes.
Nomes inesperados nao sao candidatos. Tres ou quatro componentes de versao sao
comparados como numeros; empates numericos sao preservados.

## Backup e provas

Cada execucao cria uma pasta datada fora do Supabase, por padrao em
`%USERPROFILE%\NewProd-Release-Backups`. E possivel definir outro disco local com
`NEWPROD_RELEASE_BACKUP_DIR`. Nao usar pasta temporaria, pasta sincronizada com
Supabase, nem a pasta de build. O operador deve proteger o destino para a conta
administrativa e SYSTEM, e conservar a pasta ate `guardar_ate` (30 dias a partir
da exclusao). O script nunca apaga backups locais, nem mesmo depois desse prazo.

- `plano.json`: inventario, manifestos, candidatos, preservados e prazo minimo.
- `candidatos.txt`: nomes exatos antes de qualquer exclusao.
- `msi/`: copias completas dos candidatos, fora do Supabase.
- `backup.json`: tamanho e SHA-256 de todas as copias verificadas.
- `resultado.json`: nomes efetivamente apagados, bytes liberados, confirmacao do
  Storage e hashes dos downloads referenciados antes/depois.

O backup reabre os arquivos para conferir SHA-256; a exclusao faz nova conferencia
local. Uma falha de download nao inicia exclusao. Cada DELETE remove apenas um
nome da lista previamente calculada. Antes de cada DELETE, sao relidos os tres
manifestos e o inventario completo. Qualquer mudanca interrompe a limpeza.
Resposta vazia ou ambigua do Storage nao e sucesso. A exclusao nao e transacional;
um erro depois de exclusoes parciais fica registrado para reconciliacao, sem
repeticao automatica. Nao executar publicacoes/limpezas concorrentes: Storage nao
oferece aqui DELETE condicional atomico junto com a leitura dos manifestos.

## Limpeza inicial ou retomada supervisionada

Com `SUPABASE_SERVICE_KEY` ja no ambiente (nunca na linha de comando), executar:

```powershell
python ferramentas/retencao_agent_releases.py preparar --pasta C:\Users\Junior\NewProd-Release-Backups
python ferramentas/retencao_agent_releases.py backup --pasta <pasta-datada-retornada>
python ferramentas/retencao_agent_releases.py executar --pasta <pasta-datada-retornada>
```

`preparar` e `backup` nao excluem objetos. Antes do `executar` inicial, registrar
a confirmacao operacional das estacoes afetadas e apresentar os candidatos. Em
21/10/2026, o usuario confirmou que FLEXO e DESKTOP-PM6TG1B seguem removidas e que
nenhuma das quatro estacoes consultadas (incluindo LASER-01 e PC-JR-HOME) precisa
dos MSIs candidatos; 1.3.24, 1.3.25 e 1.3.26 ficam preservados.

Se o backup parar, repetir somente `backup` na mesma pasta: arquivos cujo tamanho
e SHA-256 ja foram registrados sao revalidados antes de reutilizacao. Um novo
inventario divergente exige novo plano. Se existir `resultado.json`, nao repetir
`executar` cegamente: comparar os nomes registrados com o Storage, inclusive
`em_exclusao` caso a resposta tenha se perdido.

Para recuperar um objeto apagado, conferir tamanho/SHA-256 contra `backup.json`,
verificar ausencia no bucket, reenviar o arquivo com o mesmo nome sem sobrescrita
e conferir o download publico. Nao alterar manifestos automaticamente durante a
restauracao. A restauracao e uma operacao separada e supervisionada.

## Validacao local

`python -m pytest -n 0 tests/test_retencao_agent_releases.py tests/test_publicar_pacote_oficial.py`

Os testes usam dados sinteticos e transporte simulado, sem acessar Supabase.
