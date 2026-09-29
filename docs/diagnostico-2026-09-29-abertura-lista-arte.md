# Demora na abertura e atualizacao da Lista de Arte

## Escopo e versao

Usuario confirmou o site `https://imposition.ai-ideal.com.br`. Analise do frontend v973, base `3a20538b658ad1562283625de89ce35f44bd1015`, em worktree isolada `C:\ProjetosLocais\ideal-imposition-lista-arte-abertura-20260929`.

Em 29/09/2026, consultas publicas com cache-buster confirmaram que `script.js?v=973` e `supabase-config.js` coincidem com essa base, normalizando BOM e finais de linha. Downloads observados: 398 ms (2.108.857 bytes) e 154 ms (15.669 bytes), respectivamente. Uma tentativa anterior sem identificacao do cliente recebeu HTTP 403. Essas medidas nao representam a conexao do usuario nem a latencia do banco.

Na etapa inicial de analise, nenhuma sessao autenticada, credencial, banco compartilhado ou pedido real foi acessado, e nenhum arquivo de producao foi alterado ou publicado. A implementacao autorizada posteriormente esta registrada ao final.

## Gargalo reproduzido: prazos e horarios sequenciais

O primeiro `renderOrdens()` com dados novos so ocorre depois de `loadOrdensFromVibecode()` e `carregarModelosGlobais(true)` em `frontend/script.js:26383`. A abertura ja desenha o cache existente antes de iniciar a leitura; essa lista antiga nao equivale aos dados atualizados.

Dentro de `loadOrdensFromVibecode`:

1. Consulta propostas por numeros, em lotes de ate 200 (ate tres em paralelo).
2. Depois consulta propostas por status.
3. Depois le `propostas_os` em lotes de 100 pedidos, um por vez (`script.js:26967`).
4. Depois le `propostas_os_setores`, novamente em lotes de 100 e um por vez (`script.js:28960`).
5. Monta os pedidos; o chamador ainda aguarda os modelos globais antes de exibir a nova lista.

O historico identifica uma mudanca recente pertinente: commit `69ca3240a`, v972, 29/09/2026 11:16:40 -03:00, substituiu uma consulta unica de prazos por lotes sequenciais de 100. Essa divisao evita requisicoes excessivas e preserva os prazos; nao deve ser simplesmente desfeita. O ponto de desempenho e a espera entre lotes independentes. A sequencia de horarios existe desde 16/09. A v973 herdou esse caminho.

Para 1.000 pedidos com prazo, as duas etapas produzem 20 requisicoes consecutivas. Se cada resposta levasse 500 ms, elas somariam aproximadamente 10 segundos, alem das demais etapas. Isso e uma ilustracao, nao a medicao da estacao.

## Experimento reproduzivel

`tests/diagnostico_lista_arte_abertura.js` executa as funcoes reais de orquestracao, propostas, prazos, horarios e modelos em Node/VM. Todas as consultas sao simuladas; nao existe rede ou escrita. Cada consulta recebe espera nominal de 20 ms (o agendador do Windows elevou varias esperas para cerca de 30 ms). O desenho e um marcador, nao um benchmark de DOM. As fontes iniciais de artes, links, tempos e usuarios sao representadas por uma consulta cada. Ha um produto por pedido, prazo em todos e modelos vazios; portanto os totais nao representam a base real.

| Pedidos sinteticos | Chamadas antes do desenho novo | Abertura | Atualizacao seguinte | Lotes de prazo + horario |
|---|---:|---:|---:|---:|
| 100 | 11 | 211 ms | 218 ms | 1 + 1 |
| 500 | 25 | 467 ms | 464 ms | 5 + 5 |
| 1.000 | 41 | 867 ms | 892 ms | 10 + 10 |

No cenario de 1.000 pedidos, prazo e horario ocuparam aproximadamente 620 ms dos 867 ms antes do desenho novo. Concorrencia maxima de cada uma dessas etapas: **1**. Propostas e modelos ja atingiram concorrencia **3**.

Comparacao com `69ca3240^` sob o mesmo simulador, 1.000 pedidos: 32 chamadas e 585 ms na abertura; 607 ms na atualizacao. Antes da v972 havia uma consulta de prazo, agora ha dez. O experimento isola o custo da sequencia, mas nao valida que a consulta unica antiga retornava todos os dados reais. Nao recomenda reverter a correcao de integridade.

Comandos:

```powershell
node tests/diagnostico_lista_arte_abertura.js
node tests/diagnostico_lista_arte_abertura.js '69ca3240^' 1000
```

Ambos passaram, incluindo assercoes de volume, concorrencia, dependencia de usuarios, repeticao da carga e redesenhos dos complementos. `node --check` e `git diff --check` passaram.

## Outros fatores confirmados no fluxo

- **Atualizacao automatica a cada 60 segundos** (`script.js:30934`). Uma mudanca feita por outra pessoa pode aguardar o proximo ciclo e depois todo o carregamento. O callback ignora o ciclo se uma carga ainda esta em andamento. Nao foi medido atraso do navegador em aba de fundo.
- **Atualizar repete a carga completa.** Nos tres volumes sinteticos, abrir e atualizar tiveram o mesmo numero de requisicoes; nao ha leitura incremental nesse caminho.
- **Uma barreira inicial espera usuarios, links e relogios junto dos produtos/artes** (`script.js:26348`). Atrasar somente usuarios em 150 ms adiou o inicio das propostas pelo mesmo motivo; o marcador de abertura em 1.000 pedidos passou para 1.012 ms. Nomes e filtros precisam continuar corretos; os relogios sao necessarios antes de registrar transicoes de cards.
- **Cada lote de propostas consulta ate obter pagina vazia** (`supabase-config.js:185`). No cenario de 1.000 propostas, foram cinco chamadas com dados e cinco vazias. Uma eventual otimizacao precisa preservar paginacao e limites do servidor, sem presumir completude de uma resposta curta.
- **Carga global inclui `amostra_arte_base64` em produtos e modelos** (`script.js:26363`, `script.js:26749`). O nome do campo nao comprova bytes grandes; pode conter URL. O volume real nao foi medido. Miniaturas e regras de produto de prateleira dependem desses dados.
- **Complementos provocam novos desenhos** (`script.js:26283`). Pagamentos, status, links e origem de aprovacao sao nao bloqueantes; em teste com quatro conclusoes apos a carga, ocorreram quatro chamadas adicionais de `renderOrdens`. O custo real do DOM nao foi medido. Prateleira tambem pode disparar desenho. Dashboard so e desenhado quando seu card esta ativo, portanto nao ha evidencia para aponta-lo como causa geral.

## Correcao recomendada, preservando contratos

Primeira prioridade: manter os lotes de 100 e executar ate tres em paralelo tanto nos prazos quanto nos horarios, conservando a ordem de consolidacao, os mesmos campos/filtros e a recusa de dados parciais. A lista anterior deve continuar disponivel em erro. Com 1.000 pedidos, isso reduz de 20 para aproximadamente oito ondas de espera nessas duas etapas; e uma estimativa estrutural, nao promessa de ganho operacional.

Depois: iniciar a consulta por status junto da consulta por numeros, mantendo a precedencia atual ao combinar as respostas; agrupar redesenhos de complementos; estudar invalidacao de usuarios e carga incremental somente com provas de atualidade dos filtros, permissoes e status. Nao reduzir o intervalo de atualizacao antes de reduzir o custo de cada ciclo: isso apenas aumenta a concorrencia de rede.

Nao retirar modelos, prazos, horarios, historico ou miniaturas para fazer a lista aparecer antes. Nao classificar pedidos usando dados incompletos nem permitir gravacoes de tempo com fotografia antiga dos relogios.

Conclusao: o mecanismo de espera sequencial e sua ampliacao na v972 foram reproduzidos. A atribuicao quantitativa da demora real exige uma captura de duracoes das requisicoes e do desenho no navegador autenticado afetado, preservando dados e credenciais. A analise atual nao prova lentidao do Supabase, falha do Cloudflare ou limite da maquina.

## Implementacao autorizada: executar e publicar

O fetch confirmou a base `3a20538b`, sem divergencia. A alteracao funcional ficou restrita a `frontend/script.js`:

- `lerLotesDaLista` executa ondas de ate tres lotes de 100. Aguarda os lotes iniciados, rejeita o conjunto se um falhar e combina as respostas na ordem original, independentemente da ordem de conclusao. Nenhuma consulta, coluna, filtro ou regra de prazo foi removida.
- Prazos e horarios web usam esse auxiliar. A leitura local de horarios do NewProd permanece como antes. A ausencia de horarios e as falhas continuam seguindo o comportamento anterior; erro de prazo conserva a lista anterior.
- Complementos finalizados dentro de 50 ms compartilham um redesenho. Uma carga principal em andamento adia a pintura; ao terminar, aplica o que ficou pendente e cancela o timer para evitar duplicacao. O intervalo automatico continua em 60 segundos.

O diagnostico agora aceita tanto a fonte atual quanto uma referencia Git explicita. O registro numerico anterior refere-se a v973; nao se deve confundir seus numeros com o codigo otimizado.

Comparacao executada neste turno, mesmo simulador e 1.000 pedidos:

| Medida sintetica | v973 (`3a20538b`) | Implementacao nova |
|---|---:|---:|
| Abertura ate primeiro desenho novo | 870 ms | 491 ms |
| Atualizacao seguinte | 889 ms | 516 ms |
| Consultas totais antes do desenho | 41 | 41 |
| Concorrencia maxima de prazos/horarios | 1 | 3 |
| Desenhos por quatro complementos juntos | 4 | 1 |

Reducao de aproximadamente 44% na abertura simulada. Nao representa promessa de tempo nem medicao de um pedido real. Com 500 pedidos, abertura observada de 272 ms; 100 pedidos continuam com apenas um lote por etapa.

Validacoes: 97 testes passaram na selecao de prazo, ordenacao, Lista de Arte, rastreio e sintaxe de todo o frontend. Tambem passaram o novo teste de lotes/redesenho, desempenho da lista e os dois testes de links. Harnesses adicionais confirmaram timeout/abort/retry e descarte de resposta tardia, 19 cenarios de navegacao e 25 verificacoes de recuperacao/modal/fidelidade/concorrencia das amostras. O teste dos prazos inclui 4.685 pedidos em 47 lotes.

Fixtures foram atualizados para incluir o auxiliar de lotes, o timer de pintura e `window` no ambiente simulado dos links. Nenhuma assercao de negocio foi removida. A primeira invocacao pytest incluiu um arquivo inexistente e nao coletou testes; a selecao foi corrigida. `git diff --check` e sintaxe do novo diagnostico passaram.

Recuperacao planejada: se necessaria, criar nova branch da `origin/main` atual e reverter o commit funcional desta entrega por novo commit. Executar os testes pertinentes, publicar com nova versao de cache e comparar arquivos nos dois dominios. Nao resetar o checkout operacional nem reescrever o historico. A base anterior fica preservada em `3a20538b658ad1562283625de89ce35f44bd1015`.
