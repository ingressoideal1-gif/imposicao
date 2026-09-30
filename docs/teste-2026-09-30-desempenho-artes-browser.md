# Teste de abertura das artes no navegador — 30/09/2026

## Situação e escopo

Preparação em `feat/diagnostico-artes-browser-20260930`, sobre `origin/main` em `e06d75e6` (v986). A publicação foi autorizada depois da preparação. A simulação da entrega passou e calculou v987; sua conclusão deve ser confirmada pela tag, hospedagem e comparação dos arquivos públicos. Não houve instalação de NewProd, acesso ao banco de produção ou mudança de resolução, regras de negócio, consultas ou cache de artes.

Relato humano: a estação do administrador melhorou, mas designers continuam com a prévia em “Carregando arte”. Em alguns pedidos faltam **os próprios cartões**, além das imagens; fechar e reabrir faz os modelos reaparecerem. O pedido **13020** foi indicado como um dos exemplos. Não foi consultado nem reproduzido com dados reais nesta preparação.

O teste inicial mede o site atual. Não é uma versão local nem um experimento de cache persistente. Reduzir resolução pode ajudar no desenho de PDFs, mas não explica, por si só, cartões ausentes. Primeiro é necessário localizar a perda entre resposta da consulta, estado do pedido e montagem dos cartões.

## Instrumentação preparada

`frontend/diagnostico-artes.js`, carregado pelo `index.html`, só oferece controles com `?diagnostico_artes=1`. A coleta começa exclusivamente em **Iniciar**. Sem o parâmetro não monta interface nem instrumenta funções.

O painel “Teste de carregamento das artes” fica recolhido no canto inferior direito. Usa códigos de participante e estação, rodada, Iniciar, Encerrar, Exportar e **Marcar travamento / modelos faltando**. Os relatórios ficam em memória até o download JSON; não são enviados automaticamente nem gravados em armazenamento do navegador. Recarregar/fechar a aba perde a coleta ainda não exportada. Limites: 20 minutos, 100 aberturas e 2.000 eventos por coleta, com contador de eventos descartados.

O relatório registra:

- Número do pedido, código manual do participante/estação, perfil, versão declarada de `script.js`, navegador e viewport.
- Tempo de abertura, montagem inicial e primeiro sinal de canvas pronto no campo de visão.
- Contagem das linhas devolvidas pelas leituras de modelos, produtos e artes; sem copiar as linhas.
- Quantidades no estado e no DOM antes/depois de carga, montagem, atualização da lista, navegação e marcação manual. Inclui quantas prévias estão esperando, prontas ou com erro.
- Duração de leitura, obtenção de PDF/cor/fontes, composição, espera na fila e rasterização; reutilização do cache de raster já existente.
- Falhas categorizadas, etapas inconclusivas, recursos por categoria e tarefas longas quando o navegador oferecer esses dados.

Não exporta identidade automática, e-mail, nomes de clientes, conteúdo de artes, nomes de arquivos, URLs, tokens ou mensagens brutas de erro. O número do pedido é informação interna; compartilhar os relatórios apenas com a equipe responsável. Usar códigos como `designer-1` e `pc-arte-1`, não nomes pessoais. A detecção de troca de conta encerra a coleta na próxima chamada instrumentada.

As funções preservam `this`, retornos, exceções e a identidade das Promises. Ao encerrar, os wrappers são removidos, mantendo trabalhos em andamento e propriedades de fila/cache. A instrumentação não faz consultas adicionais nem modifica os dados. A abertura normal do produto continua com seus efeitos existentes; a validação automatizada utiliza somente dados sintéticos.

## Roteiro principal: pedido 13020

Executar depois de publicar e verificar a versão preparada. O endereço de ativação é `https://imposition.ai-ideal.com.br/?diagnostico_artes=1`; a página deve exibir o painel “Teste de carregamento das artes”. Antes da publicação, esse parâmetro sozinho não instala o diagnóstico.

1. Selecionar uma estação afetada e a estação que está rápida. Usar contas próprias com permissão para o pedido, sem compartilhar senhas. Anotar códigos de participante/estação, navegador e quantidade de modelos conhecida; se não houver total confirmado, registrar a quantidade que aparece após recuperar.
2. Abrir o endereço de teste, entrar normalmente e ficar na Lista de Arte. Expandir o painel, preencher os códigos, escolher “Primeira abertura” e clicar em **Iniciar** antes de abrir o pedido 13020.
3. Abrir o pedido e rolar como no uso habitual, com a aba em primeiro plano. Se faltarem cartões ou houver espera persistente, clicar em **Marcar travamento / modelos faltando**. Esse botão somente registra o momento; não tenta consertar a tela.
4. Ainda na mesma coleta, voltar à lista e reabrir o mesmo pedido, sem F5. Marcar novamente se necessário. Assim o mesmo JSON guarda a quantidade antes e depois da recuperação. Se toda a aba deixar de responder, anotar o horário/duração e marcar quando recuperar; um botão não executa enquanto a thread do navegador está bloqueada.
5. **Exportar** o JSON. Exportar antes de qualquer F5, fechamento da aba ou nova coleta. O botão também encerra a medição.
6. Repetir nas duas estações. Depois fazer três reaberturas por estação, em coletas separadas, selecionando as rodadas 1, 2 e 3. Manter o mesmo pedido, navegador, zoom e tamanho da janela; não limpar o cache entre essas rodadas.

Comparar também um pedido simples e um com vários modelos/PDFs, escolhidos pelos operadores. Não editar artes, status, quantidades ou cadastros para provocar a falha. Para avaliar resolução/cache posteriormente, primeiro preservar esta linha de base.

| Registro do operador | Preencher |
| --- | --- |
| Participante / estação | Códigos, sem nomes |
| Pedido / rodada | 13020 / primeira ou reabertura |
| Cartões esperados ou após recuperação | Quantidade; indicar a origem da referência |
| Cartões antes e depois de reabrir | Quantidades observadas |
| Sintoma | Cartões ausentes, prévia esperando, aba sem responder |
| Recuperação | Reabrir, botão de tentar novamente, F5; informar o que ocorreu |
| Arquivo | Nome do JSON exportado |

## Como interpretar

| Evidência | Próxima investigação |
| --- | --- |
| Consulta retorna menos modelos na falha do que na recuperação | Caminho da consulta, concorrência, fonte ou permissões; contagem isolada não prova truncamento |
| Resposta tem todos, mas o estado depois tem menos | Substituição/restauração de estado e atualização concorrente |
| Estado tem todos, mas DOM tem menos cartões | Montagem do HTML, exceção ou atualização parcial da tela |
| Todos os cartões existem e somente algumas prévias esperam | Download, recursos, fila ou composição |
| Downloads rápidos com rasterização/tarefas longas elevadas | Custo de processamento da estação; candidato a teste de resolução |
| Reaberturas muito melhores e obtenção de PDF dominante | Investigar transferência/reutilização; candidato a cache persistente |

Comparar contagens e taxa de falha primeiro; depois mediana e variação das durações. Três repetições não sustentam estimativa confiável de percentis altos. Tempos aninhados se sobrepõem: **não somar consulta, abertura, download e composição**.

Limitações:

- “Primeira abertura” não garante cache frio; não apagamos cache do operador.
- Primeira prévia é um sinal de canvas pronto/visível em frame posterior, não uma análise dos pixels ou garantia de todas as artes prontas. Elementos fora da tela podem ser desenhados mais tarde pela lógica normal.
- Contagem no DOM mede cabeçalhos dos modelos; não comprova que cada cartão está no campo de visão. Capturas são feitas nos pontos instrumentados, sem polling constante.
- Respostas de consulta e recursos são eventos da sessão. Havendo outras consultas simultâneas, não atribuir automaticamente todos ao pedido aberto.
- Falhas tratadas internamente podem não lançar exceção; por isso o relatório preserva marcação manual, contagens e etapas pendentes.
- Reutilização de raster inclui promessa em andamento, não apenas bitmap pronto. Cache HTTP pode ser indeterminado: `transferSize` zero sozinho não comprova cache, especialmente entre origens. Ver [Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize) e [PerformanceObserver](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/observe).
- A instrumentação tem custo próprio; é opt-in, limitada e não estabelece desempenho real com os testes sintéticos.

## Validação e retomada

`tests/diagnostico_artes_harness.js` executa Chromium com rede externa bloqueada, navegação e fila reais e dependências simuladas. Cobre abertura, contagem parcial de dados versus DOM, fechar/reabrir sem F5, falhas, etapas pendentes, privacidade do JSON, restauração de funções/cache/fila, troca de conta, ausência de APIs opcionais e limite de eventos. Os números sintéticos não representam o pedido 13020.

Validações executadas nesta preparação:

- Seleção pytest: **84 passed**, incluindo diagnóstico, recuperação, rolagem, desempenho da lista e sintaxe de todo o frontend.
- Navegação: **22 cenários de navegador passaram**, sem serviços reais.
- Diagnóstico após a revisão final: **33 verificações passaram**, com rede externa bloqueada. Inclui todos os cenários acima e preservação das funções/fila/cache.
- Sintaxe do módulo e revisão de whitespace sem erros. Nenhum teste em estação de designer ou no pedido real 13020 foi executado.

Antes de futura publicação: conferir avanço de `origin/main`, revisar diff, integrar apenas estes arquivos, executar as verificações pertinentes e usar o fluxo Cloudflare do projeto, com verificação pública após propagação. Não copiar `script.js` de checkout antigo. O checkout operacional permanece preservado.

Recuperação do teste: **Encerrar** restaura as funções instrumentadas. Abrir o site sem o parâmetro desativa o diagnóstico na nova página. Para retirar a preparação da distribuição, remover a inclusão do módulo em `index.html` e o módulo correspondente por alteração revisada. Nenhuma reversão de banco ou NewProd é necessária.
