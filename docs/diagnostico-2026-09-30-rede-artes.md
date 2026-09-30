# Lista de Arte: downloads e consultas, 30/09/2026

## Evidência recebida

Cinco relatórios locais, esquema 1, pedido 13020, rodada `reabertura_3`.
As coletas A a D usam o diagnóstico da entrega v987 e informam script principal
986, que não mudou naquela entrega. A coleta E informa script principal 988;
portanto não constitui comparação controlada de versão com as anteriores.
Os participantes informaram usar redes distintas. Os arquivos originais permanecem
fora do repositório; abaixo estão apenas medidas agregadas, sem identidade.

| Medida | Coleta A, admin | Coleta B, designer | Coleta C, designer | Coleta D, designer | Coleta E, designer |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cartões montados na abertura | 419,4 ms | 295,5 / 1.936,7 ms | 338,4 ms | 457,2 ms | 317,6 ms |
| Primeira prévia visível | 1.238,1 ms | 846,4 / 2.487,3 ms | 1.065,9 ms | 1.871,8 ms | 827,3 ms |
| Maior duração de `obter_pdf` | 27 ms | **15.015,5 ms** | 14,9 ms | 43,4 ms | 18,8 ms |
| Maior recurso classificado como consulta | 377,4 ms | **10.057,6 ms** | 354,1 ms | **9.712 ms** | 334,9 ms |
| Maior espera na fila de rasterização | 0,8 ms | 6,8 ms | 12,9 ms | 1 ms | 10,5 ms |
| Maior rasterização de PDF | 197,3 ms | 150,4 ms | 205,7 ms | 356,2 ms | 123 ms |
| Modelos/cartões nos snapshots da tela | 15 / 15 | 15 / 15 | 15 / 15 | 15 / 15 | 15 / 15 |
| Etapa `lista` registrada | 7.654,8 ms, concluída | 19.868,6 ms, ainda pendente | 1.917 ms, ainda pendente | Não registrada | Não registrada |

A coleta B contém duas aberturas. As outras contêm uma. A contagem de recursos
classificados como consultas foi 244, 268, 93, 56 e 219, respectivamente, mas as durações
e os percursos das coletas são diferentes. Essa contagem não equivale ao número
de consultas SQL de uma abertura: inclui atividades simultâneas da sessão.
Não somar durações sobrepostas. As etapas pendentes não são tempos finais.

Na coleta B, uma composição demorou 15.348,3 ms, acompanhando uma obtenção de PDF
de 15.015,5 ms e um recurso de arquivo de 15.009,1 ms. A rasterização demorou no
máximo 150,4 ms. Outra obtenção de PDF demorou 2.775,7 ms na reabertura.
O diagnóstico antigo não identifica o arquivo nem a tentativa direta/proxy.

Os cinco relatórios terminaram com 15 prévias sinalizadas como prontas e sem falha
final registrada. Isso não comprova pintura de todas as áreas fora da tela nem
invalida relatos anteriores de cartões ausentes. Nesta amostra, o atraso medido
está sobretudo na obtenção do arquivo e nas consultas, não na fila ou resolução.

A coleta D durou 19.864,4 ms e acrescenta um segundo caso de consulta lenta em
outra rede: um recurso levou 9.712 ms, e outros dois levaram 1.885,4 e 1.624,2 ms.
As três leituras identificadas do pedido foram rápidas: modelos 100,2 ms,
produtos 141 ms e artes 72,6 ms. Portanto, o recurso de 9,7 segundos não é uma
dessas três leituras registradas. O esquema 1 não permite identificar a rota,
tabela ou vincular essa requisição a uma atualização da lista. Não houve etapa
`lista` registrada nesta coleta, portanto não há medida do tempo total da lista.

Na coleta D, as 15 composições concluíram; a mais demorada levou 1.260 ms. Foram
registrados 11 sinais de prévia visível, e o encerramento mostrou 15 cartões e
15 prévias prontas, sem erro ou descarte de eventos. O atraso de 15 segundos no
PDF da coleta B não se repetiu. Consultas lentas com PDFs rápidos mostram que
os dois caminhos precisam ser medidos separadamente. A recorrência de consultas
lentas em redes distintas amplia a suspeita de um serviço ou caminho comum,
mas não comprova a origem no servidor, nem uma mesma consulta, pois os horários
e as rotas não foram controlados.

A coleta E durou 15.399,8 ms e não reproduziu a demora: 35 obtenções de PDF
concluíram, com máximo de 18,8 ms, e nenhuma das 219 requisições classificadas
como consultas ultrapassou 334,9 ms. As leituras identificadas de modelos,
produtos e artes levaram 58,4, 61,3 e 79,6 ms. As 15 composições concluíram,
com máximo de 416,4 ms; houve 14 sinais de prévia visível e 15 prévias prontas
no encerramento, sem erros registrados ou eventos descartados. Não há etapa
`lista` registrada e não é possível afirmar o tempo total de atualização dela.

A coleta E teve muitos recursos classificados como consultas, mas respostas
rápidas: a quantidade isolada de requisições não explica os picos observados
nas coletas B e D. Rede, horário, cache, conteúdo consultado e versão diferem;
a coleta E não comprova que a versão 988 resolveu o problema. O esquema segue
em 1, sem os detalhes de rota e resposta/corpo preparados localmente no esquema 2.

## Caminho confirmado no código da base v987

- `frontend/script.js`, `fetchPdfBytes`: tenta o endereço direto, incluindo a
  leitura do corpo na espera; cancela ao atingir o prazo e tenta `urlDoProxy`
  quando a tentativa direta falha. Chamadas de prévia usam prazo de 15 segundos.
  A coincidência com 15.015,5 ms é compatível com esse limite, mas não comprova
  que ocorreu fallback na coleta B.
- `frontend/supabase-config.js`, `urlDoProxy`: escolhe proxy pela origem da
  aplicação (`SERVIDA_PELA_NUVEM`), sem prioridade por perfil admin/designer.
  O site usa a rota em nuvem; ter NewProd instalado não muda essa escolha.
- `carregarOrdensDados` e `loadOrdensFromVibecode`: há etapas de artes, links,
  relógios, usuários, produtos, propostas e modelos. Consultas complementares e
  histórico do cliente podem continuar com o pedido aberto.
- `consultarPropostas`: pagina resultados, divide números em lotes de 200 e
  permite até três lotes independentes em paralelo. A duração de uma consulta
  isolada não explica sozinha o tempo total da lista.

Não há evidência suficiente para atribuir a diferença ao provedor de internet,
servidor, permissões, cache ou computador. As coletas ocorreram em horários e
redes diferentes e não controlaram o cache. Uma designer teve desempenho rápido,
o que enfraquece a hipótese de privilégio administrativo como explicação geral.

## Instrumentação preparada localmente

Branch `feat/diagnostico-rede-artes-20260930`, preparação na base
`2bbbfbbeed435b238ac7744f2947f2762fc8acef`. Para a publicação autorizada, a base
foi avançada sem conflitos para `a8ce2b82` (v988), preservando a mudança de retorno
ao atendimento. A confirmação da entrega depende dos hashes públicos após
propagação; ver o registro posterior de publicação no worktree.

O módulo opt-in `frontend/diagnostico-artes.js` exporta esquema 2 e acrescenta:

- tempo até a resposta HTTP e tempo de consumo do corpo, status e cancelamento;
- referência anônima por arquivo para relacionar tentativa direta e proxy;
- classificação de rota e nomes de tabelas permitidos, sem URL ou filtros;
- etapas da lista e consultas de propostas com tipo permitido, offset, limite,
  quantidade de números e linhas recebidas, sem conteúdo pesquisado;
- DNS, conexão, espera pelo primeiro byte e transferência quando o navegador
  disponibilizar esses tempos. Valores indisponíveis ficam nulos.

A seleção de `urlDoProxy` gera `fallback_arquivo`; a chamada HTTP com rota de
proxy é a evidência de tentativa efetiva. O diagnóstico não faz requisições
próprias, não clona respostas nem consome o corpo antecipadamente. Preserva as
Promises originais e restaura os métodos ao parar. As URLs ficam somente em um
mapa limitado em memória, apagado ao encerrar. Nenhum resultado é enviado
automaticamente. Não foram alterados resolução, fila, consultas, regras ou backend.

Limites: o tempo até os headers inclui rede, servidor e esperas do cliente; não
isola processamento no servidor. A leitura JSON também inclui decodificação.
Chamadas que tenham guardado uma referência anterior a `fetch` podem aparecer
somente no PerformanceResourceTiming. Recursos entre origens podem ocultar fases
sem `Timing-Allow-Origin`, conforme a
[documentação do navegador](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming).
O limite segue em 2.000 eventos: verificar `descartados` e preferir coletas curtas
separadas para lista e pedido.

## Validação local

- 33 verificações do diagnóstico existente passaram, com rede externa bloqueada.
- 24 verificações novas passaram na preparação com HTTP local e dados sintéticos: resposta lenta,
  corpo lento, cancelamento, recuperação via proxy, HTTP 503, leitura JSON,
  identificação de consultas, tempos entre origens ocultos, privacidade,
  restauração dos métodos e encerramento durante leitura.
- Regressão de carga/recuperação passou, incluindo 35 verificações de navegador
  sobre recuperação, modal, fidelidade e concorrência.
- Os testes novos usam as funções reais extraídas do frontend, com limite de
  100 ms e respostas atrasadas 350 ms para reproduzir o mecanismo sem aguardar
  15 segundos por caso. Não demonstram qual rota falhou no caso real.
- `node --check frontend/diagnostico-artes.js` e `git diff --check` passaram.
- O teste novo foi integrado a `tests/test_diagnostico_artes.py`. A execução por
  pytest não pôde iniciar: o venv documentado não existe e os dois Pythons
  encontrados não têm pytest. Os harnesses foram executados diretamente por
  Node usando o Puppeteer já instalado no checkout operacional via `NODE_PATH`.
  Nenhuma dependência foi instalada.

Revalidação para entrega na base v988: 25 verificações de rede (incluindo versão
v2 visível), 33 do diagnóstico, 35 de recuperação, 22 cenários de navegação e
regressões de rolagem/fila passaram. A sintaxe dos 83 JavaScripts do frontend
passou. A simulação `entrega-segura.ps1 publicar -Escopo Frontend -Integracao
Direta -Simular` validou escopo, segredos, links e whitespace e calculou v989,
atualizando somente a referência de cache do diagnóstico em `index.html`.

## Próxima coleta controlada

Depois da publicação desta instrumentação, confirmar `esquema: 2` no JSON.
O painel também deve mostrar `Teste de carregamento das artes — v2`.
Na estação que apresentou atraso, manter conta, pedido 13020, navegador e
procedimento iguais. Fazer duas ou três coletas curtas na rede habitual e, se
houver outra rede disponível, repetir nela. Registrar o nome da rodada/rede
como apelido, sem senha, login ou dados pessoais. Não limpar cache somente em
um dos lados; registrar primeira abertura e reabertura separadamente.

Para o pedido: iniciar a coleta antes da abertura, rolar até o cartão lento,
marcar a falha se ocorrer e encerrar depois do resultado. Para a lista: coleta
separada iniciada antes de atualizar, encerrada após concluir. Caso continue
pendente, registrar essa condição; não tratar o tempo parcial como conclusão.

Comparar tentativa direta/proxy, headers/corpo, status e consultas por etapa.
Melhora repetida ao trocar somente a rede aumenta a evidência de problema no
caminho de acesso. Lentidão simultânea em redes diferentes aumenta a suspeita
de componente compartilhado, mas localizar o tempo dentro do servidor ainda
exigirá observabilidade do servidor. Não reduzir a resolução como resposta ao
atraso de download identificado.

## Roteiro para as duas estações com atraso

1. Abrir `https://imposition.ai-ideal.com.br/?diagnostico_artes=1` e conferir `v2`
   no título do painel no canto inferior. Manter o login habitual; NewProd não
   é necessário. Se a aba estava aberta antes da publicação, recarregar uma vez
   antes de iniciar, preservando o mesmo procedimento entre as rodadas.
2. Usar códigos de participante e estação, por exemplo `designer-b` e
   `pc-b-lista`. Iniciar antes de acionar a atualização normal da Lista de Arte.
   Encerrar após o resultado e exportar o JSON. Se continuar esperando por cerca
   de 45 segundos, marcar o travamento, encerrar e exportar; a duração será parcial.
3. Mudar o código de estação para `pc-b-pedido`, iniciar outra coleta, abrir o
   pedido 13020 e rolar normalmente até os últimos cartões. Marcar o travamento
   se ocorrer, encerrar após o resultado e exportar. Não usar F5 durante a coleta.
4. Repetir os dois percursos duas vezes, usando Reabertura 1 e Reabertura 2 para
   distinguir os arquivos. A outra estação usa códigos próprios. Não enviar
   resultados automaticamente: o operador entrega os JSONs para análise.

Começar pela rede habitual. Uma comparação com outra rede, se necessária,
vem depois, mantendo a mesma estação, conta e procedimento. O diagnóstico mede
as operações existentes; não é uma correção de desempenho nem muda seu prazo.
