# NewProd 1.4.8 — preservar frente e verso

Base: tag `agente-v1.4.7`, em worktree isolada. Nenhuma alteracao do checkout operacional foi incorporada.

## Problema e correcao

Ao reabrir um modelo com numeracao duplex vinculada, o painel podia substituir
esse vinculo pelo gabarito textual antigo de so frente. O pedido 24987 revelou
a divergencia entre a Lista de Arte e a Producao. A consulta foi somente leitura.

A reconciliacao agora recusa a substituicao quando o modo do gabarito textual
contraria a categoria comercial. A fonte e a mesma protecao ja publicada na web
no commit `6ff2ab27`. Nenhum modelo, pedido ou catalogo foi alterado no banco.
Os imports do helper recebem uma nova versao de cache nos tres HTMLs.

## Regressao

`numeracao_verso_reabertura_harness.js` falhou na base 1.4.7 e passou na correcao.
Cobre os dois sentidos da divergencia, vinculo ausente, catalogo parcial,
preservacao dos dados comerciais e reconciliacao compativel.
`test_cor_numeracao_formato.py`: 2 testes passaram.

Validacao completa com `conferir_duas_versoes.py`: Producao, Piloto e Oficial
passaram, cada um com 1.233 testes, 2 skips e 2 subtestes, mais 24 harnesses.
Aviso preexistente: depreciacao de httpx no TestClient do Starlette.

## Artefato

- MSI: `NewProdPiloto_Oficial_v1.4.8.msi`
- ProductVersion: `1.4.8`
- Tamanho: `196820992` bytes
- SHA-256: `199433db2a1390ac1d51f85a9dbb90e65e166373e1ae2bbff02bb5fa231c37bf`
- JS embutido identico a fonte; versao Python embutida conferida.
- DLLs de GDI presentes; auditoria do EXE, preservador e MSI aprovada.

## Distribuicao e recuperacao

A publicacao usa somente o canal de producao: `latest.json` e
`newprod-piloto-oficial.json`. O canal de teste permanece separado.
Os manifestos anteriores ficam na evidencia local da publicacao.
Uma reversao automatica exige novo pacote de versao superior, preservando
as correcoes da 1.4.7. Nao executar downgrade automatico nas estacoes.

A confirmacao humana da correcao local no pedido 24987 precedeu este release.
Publicacao nao comprova instalacao nas demais estacoes ou impressao fisica.
Retomada: apos confirmar a versao instalada, reabrir o pedido 24987 e conferir
Frente e Verso nos modelos 1007017 e 1007018.
