# NewProd 1.4.0 — 24/10/2026

Fonte baseada no agente publicado 1.3.35 (5c94024e), preservando as correcoes
anteriores. O painel web usa uma mudanca minima separada sobre origin/main,
no PR 201, sem substituir o frontend atual pelo frontend do agente.

## Mudancas

- Reutiliza MSI existente quando tamanho e SHA-256 conferem.
- Espera seis horas depois de falhas transitorias da mesma versao; preserva
  o bloqueio de erros fatais do instalador e a repeticao explicita do operador.
- Publicador exige canal: teste altera somente seu manifesto; producao altera
  oficial/latest. Confere o download publico antes de ativar os manifestos.
- Clientes enviam a versao ao piloto-local. A constante publica versionada
  VERSAO_MINIMA_PUBLICADA exige 1.4.0 para iniciar novos trabalhos online.
- Painel verifica a versao antes de novas operacoes locais. Atualizacao,
  diagnostico e conclusao permanecem disponiveis. Usa acesso-estacao.js,
  arquivo que os agentes antigos ja sincronizam.

O bloqueio nao revoga um executavel antigo totalmente offline que ainda nao
recebeu o painel atualizado. Nao interrompe requisicoes ja em andamento.

## Validacao

1187 testes Python, dois subtestes e dois testes ignorados em cada um dos tres
perfis (producao, piloto e oficial), incluindo os harnesses de navegador.
373 testes Deno aprovados. Harness especifico da barreira e entrega-segura
verificar do painel aprovados. Auditoria do executavel e MSI sem arquivos
privados ou modulo de segredo aprovada.

MSI: NewProdPiloto_Oficial_v1.4.0.msi; ProductVersion 1.4.0;
196796416 bytes; SHA-256
1c70b2824e34a6d316e38e642da2a87cdc07dee87109eae511469daa3024b7ce.

Evidencia automatizada: newprod-1400-validacao.json. Instalacao local,
disponibilidade publica, ativacao da politica e adocao pelas estacoes devem
ser registradas separadamente. Nenhuma impressao fisica integra esta prova.

## Entrega confirmada

- PC-JR-HOME: upgrade 1.3.35 -> 1.4.0 com MSI exit 0; hash do executavel
  instalado igual ao build; painel HTTP 200 e recibo oficial validado.
  Cinco configuracoes permaneceram byte a byte; acessos locais tiveram o
  conteudo decifrado comparado e preservado (envelope DPAPI mudou).
  Os quatro trabalhos antigos do spool permaneceram iguais. Coleta retomada.
- Backup cifrado: 11120 arquivos, 9065763817 bytes; restauracao integral e
  hashes conferidos. A primeira verificacao encontrou falta de espaco.
  A cifra foi autenticada integralmente antes de remover somente o ZIP
  temporario redundante e repetir a restauracao com sucesso.
- MSI publico baixado integralmente e conferido antes de ativar oficial/latest
  em 1.4.0. Manifesto de teste permaneceu identico, em 1.3.35.
- PR 201 integrado em 476f9069b5bdff1d3656b72385fc4122d210809f; todos os checks
  aprovados. index.html e acesso-estacao.js conferidos por conteudo nos dois
  dominios de producao. O harness de upgrade precisou receber URL/Request/
  Response/location no navegador simulado; a logica do produto nao foi relaxada.
- piloto-local v25 ativo: solicitacao autenticada sintetica da versao 1.3.35
  recebeu 426. A 1.4.0 passou pela barreira e recebeu 422 pelo JSON propositalmente
  incompleto, antes de qualquer operacao de pedido. A tentativa de configurar
  uma variavel protegida foi recusada por falta de edge_functions_secrets_write;
  a politica publica foi entao entregue como codigo pela permissao de deploy.
  373 testes Deno novamente aprovados antes dessa publicacao.

As tres estacoes ACABAMENTO-TEX, TEX-02 e GUSTAVO-PROD ainda reportavam
1.3.9, 1.3.21 e 1.3.30 as 14:29 UTC, com MSI 1603 na tentativa anterior de
1.3.35. Nao ha prova de adocao da 1.4.0 nessas estacoes. O erro exige log local
do instalador; nao repetir cegamente. O bloqueio online nao encerra o processo
antigo nem revoga operacao estritamente local/offline.

Recuperacao: o snapshot cifrado permanece em
C:/ProjectBackups/IdealImpositionProtegido/newprod-1400-local-20261024/snapshot.iib.
A chave continua fora do backup. A politica pode ser revertida por novo deploy
revisado do piloto-local; o MSI nao suporta downgrade automatico. O backend QR
acesso-estacao permanece em v265, com a correcao de leitura por blocos.
