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

## Entrega confirmada em 23/10/2026

- Fonte do agente: commit `5d63084c`, tag `agente-v1.3.35`, enviada ao remoto.
- Fonte web: PR 198 integrado em `31856e65`, tag `v1105`. Todos os checks
  obrigatorios aprovados. `index.html`, `producao.html` e `script.js` conferidos
  por hash normalizado e cache-buster nos dois dominios operacionais.
- Baterias do agente: 1.178 testes aprovados, 2 ignorados e 2 subtestes aprovados
  por canal; 25 etapas concluidas em cada um de producao, piloto e oficial.
- PyInstaller, preservador MSI e auditorias publicas aprovados. Conferidos
  bytecode da versao 1.3.35, modulo de download e bytes dos tres arquivos de
  painel alterados dentro do executavel.
- MSI: `NewProdPiloto_Oficial_v1.3.35.msi`, ProductVersion 1.3.35,
  196.792.320 bytes; SHA-256
  `581b7723a1041bcaddf29b36295ad71cf8283658b7e749f9b7091999786c45aa`.
- SHA-256 EXE:
  `fb2eef8fa7b0c380b35c88590e8052b82874e757316bb1ffd9d86a76371da03c`.
- Downloads completos dos dois aliases conferidos antes da ativacao. Os tres
  manifestos foram relidos em 1.3.35, com o mesmo hash e sem lista `estacoes`.
- Provas e backups em `dist/publicacao-unica-1.3.35-1792794661927293600/`;
  inventario, validacao, pacote e hashes web em `dist/release1335/`.

Consulta posterior: **23/10/2026, 19h36 BRT**. Nenhuma estacao havia confirmado
1.3.35 naquele instante. Versoes mais recentes reportadas por nome:

| Estacao | Versao reportada |
| --- | --- |
| PC-JR-HOME | 1.3.34 |
| TEX-01 | 1.3.32 |
| TEX-02 | 1.3.21 |
| GUSTAVO-PROD | 1.3.30 |
| ACABAMENTO-TEX | 1.3.9 |
| LASER-01 | 1.3.32 |
| LASER-02 | 1.3.33 |
| LASER-04 | 1.3.30 |
| LAPTOP-9BSK81S0 | 1.3.31 |

Os erros citados acima ainda se referiam a tentativas das versoes 1.3.32 ou
1.3.33, nao a uma falha comprovada da 1.3.35. Demais cadastros sem contato
recente tambem permanecem elegiveis pela liberacao universal. Sem instalacao
manual, reinicio forcado ou alteracao dos dados das estacoes nesta entrega.
A publicacao terminou; a adocao pela frota depende das verificacoes automaticas.
