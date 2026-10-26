# NewProd 1.4.1: limpeza automatica de bundles identificados

Fonte do agente baseada em `agente-v1.4.0` / `37516340`. Nao substituir a
fonte do agente publicado pela main: ela ainda nao contem todas as correcoes
do motor, atualizador e painel local distribuidas em 1.4.0.

O unico comportamento novo e a limpeza de bundles `_MEI` identificados pelo
runtime do NewProd, sem processos ativos e com pelo menos 24 horas. Mantem
pastas desconhecidas, links, arquivos em uso, spool, caches e dados da estacao.
Uma falha de gravacao do marcador por disco cheio nao bloqueia a inicializacao
e deixa o bundle fora da limpeza automatica. Detalhes em limpeza-mei-newprod.md.

As alteracoes comuns entram na main pelo PR 205; o pacote e a tag de release
registram a fonte completa do agente. QR12 ja aplicado na nuvem permanece
intacto; nenhum SQL remoto ou Edge Function integra esta publicacao.

## Artefato

`NewProdPiloto_Oficial_v1.4.1.msi`, ProductVersion 1.4.1, 196812800 bytes.
SHA-256: `2006f6737b548ae704936e5fe3e86cd8641b8cb498e569c4f42c140d6369c486`.
Auditoria do EXE, preservador e MSI aprovada, sem dados privados ou modulo de
segredo. Modulos de limpeza do EXE iguais a fonte validada. Probe empacotado
com o mesmo runtime hook confirma as travas no Windows.

## Escopo da publicacao

Canal producao: somente `newprod-piloto-oficial.json` e `latest.json`, apos
download publico completo com tamanho e hash identicos ao MSI local.
O manifesto `newprod-piloto-teste.json` deve permanecer inalterado.
Nao muda a versao minima online 1.4.0, pois a limpeza nao exige novo contrato.
Nao instala nem reinicia estacoes. Adocao, PDF real e impressao fisica sao
verificacoes separadas da publicacao.

## Validacao local concluida

1204 testes Python aprovados, 2 ignorados e 2 subtestes aprovados em cada
canal (producao, Piloto, oficial). Todos os 24 harnesses por canal passaram.
A comparacao com o bundle local do release 1.4.0 nao encontrou modulos ou
arquivos removidos; somente newprod_mei foi adicionado aos modulos Python.
Avisos de empacotamento para imports opcionais/plataformas externas foram
registrados; a auditoria publica e a comparacao de conteudo passaram.

## Publicacao confirmada em 26/10/2026

- PR 205 integrado em af127b1ceb39abd570d7dc87c75254a294e8cb0d,
  apos todos os checks obrigatorios, inclusive seguranca/recuperacao Windows.
- Cloudflare Pages do commit integrado confirmou sucesso; nao houve alteracao
  de frontend nesta entrega e nenhuma copia do frontend do agente sobre a web.
- MSI enviado imutavelmente, baixado integralmente e conferido por tamanho e
  SHA-256 antes da ativacao. Recibo em evidencias/newprod-141-download-publico.json.
- newprod-piloto-oficial.json e latest.json relidos publicamente em 1.4.1.
  newprod-piloto-teste.json permaneceu identico, em 1.3.35.
- Nenhuma instalacao ou reinicio foi executado nesta entrega. Consulta de
  estacoes as 15h09 de Brasilia ainda nao confirmou adocao da 1.4.1.
- A telemetria de PC-JR-HOME reportou 1.2.323/painel 883, enquanto o endpoint
  local 9001 respondeu NewProd 1.4.0 e os processos apontavam para a instalacao
  existente. Divergencia pendente de diagnostico; nenhuma alteracao foi feita
  para tentar corrigi-la nesta publicacao.
- TEX-02 e ACABAMENTO-TEX ainda reportavam MSI 1603 e versoes antigas. Publicar
  um MSI novo nao confirma correcao desses instaladores nem impressao fisica.

Recuperacao: manifestos anteriores preservados na evidencia. O atualizador
nao faz downgrade automatico; eventual reversao do codigo exige versao maior.
