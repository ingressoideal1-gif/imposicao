# NewProd 1.3.35: distribuicao das correcoes

Autorizacao: levar as correcoes desta sequencia a todas as estacoes. O usuario
optou por aguardar a verificacao automatica; nao acionar instalacao manual nem
encerrar processos das estacoes remotamente. A verificacao periodica existente
ocorre a cada seis horas e adia a atualizacao quando ha trabalho em andamento.

## Fonte e escopo

Base publicada: `agente-v1.3.33`, commit `0f560939`. Worktree isolado
`imposition-newprod-1335-release`, branch `release/newprod-1.3.35-correcao`.
Mantidas as correcoes publicadas, incluindo confirmacao de status na rede e
prioridade de Impresso em divergencias automaticas.

Incluidos os diffs do atualizador 1.3.34 validado localmente e do motivo de
Corrigir Arte. O motivo e salvo atomicamente com os status em
`pedidos_modelos.observacao_arte` e exibido no box de alteracao. Cancelamento
e texto vazio nao gravam. A adaptacao preserva o fluxo `PilotoOffline` ja
publicado; nao substitui o frontend do agente pelo frontend de outra base.

O painel web segue em PR separado, numero 198, versao 1105, baseado em
`origin/main`. O painel embutido do agente usa cache 1335. Sem SQL remoto ou
alteracao de dados comerciais.

## Validacao

Popup real em Chromium, gravacao, cancelamento, vazio e texto seguro no box
aprovados; 53 verificacoes de persistencia e 83 de Corrigir Arte aprovadas.
36 testes focados de publicacao, download, atualizador, perfil e diagnostico
aprovados. Baterias completas e auditoria do pacote registradas nos logs da
entrega.

Dois harnesses adicionais possuem falhas anteriores, reproduzidas sem mudancas
na base 1.3.33: `retorno_producao_status_harness.js` (5 de 21 casos) e
`producao_por_cor_fluxo_harness.js` (filtros vazios no caso de Impresso). Provas
em `%TEMP%/newprod-1333-baseline-mru3sio6/`. Nao se atribui cobertura aprovada a
esses casos. Nao houve alteracao de dependencias.

## Distribuicao e limites

O publicador confere os downloads completos dos nomes oficial e legado antes
de ativar `newprod-piloto-oficial.json`, `latest.json` e
`newprod-piloto-teste.json`, sem restricao de estacoes. Backups dos manifestos
e provas ficam em `dist/publicacao-unica-1.3.35-*`.

O inventario de estacoes fica em `dist/release1335/estacoes-*.json`, deduplicado
por nome pelo sinal mais recente. Versao executavel, painel, ultimo contato
e erro de instalacao sao evidencias distintas.

Na leitura anterior a entrega havia MSI 1603 em GUSTAVO-PROD, TEX-02,
ACABAMENTO-TEX e LASER-01; esta ultima informou tambem 1722, sem causa confirmada.
TEX-01 registrou download sem espaco, mas sua telemetria posterior informava
espaco livre: o erro passado nao prova falta de espaco atual. Nao limpar dados
ou repetir instalacoes manualmente sem diagnostico local.

As estacoes antigas ainda utilizam seu atualizador antigo na primeira troca.
A publicacao nao conserta retroativamente esse transporte nem comprova adocao.
Estacoes sem contato aguardam voltar a rede. Nao foram executados testes de
impressao fisica ou geracao real como parte desta distribuicao.
