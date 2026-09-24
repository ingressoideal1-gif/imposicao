# Plano de integridade do carregamento e da impressão

Data: 24/09/2026. Base analisada: `4b3e391c`, painel v957, agente 1.2.338.
Área de trabalho: `C:\ProjetosLocais\ideal-imposition-analise-22599`.
Estado original: análise e plano. Implementação local executada após autorização; ver [registro de execução](execucao-2026-09-24-integridade-impressao.md). Sem publicação ou atualização de estações.

## Objetivo e decisão confirmada

O usuário determinou que falhas de carregamento não podem produzir impressão incompleta e confirmou: **bloquear até confirmar todos os dados obrigatórios**. Ausência legítima de arte ou numeração deve continuar permitida quando confirmada pelo cadastro/configuração do trabalho. Ausência por erro, consulta incompleta ou carregamento pendente não é autorização para omitir conteúdo.

Critério central: falha de carregamento de qualquer dependência obrigatória resulta em zero arquivos liberados para impressão/hotfolder e nenhuma conclusão de sucesso. O operador recebe identificação do modelo, recurso e ação de recuperação.

Decisões adicionais confirmadas pelo usuário:

- Manter envio por bloco, somente depois de validar todos os dados do trabalho inteiro.
- Em falha após envio parcial, parar os próximos envios e exigir retomada explícita.
- Arte somente no verso, com frente sem arte, é uma combinação válida e deve funcionar.

## Evidências e limites

### Incidente 22599

- Relato na LASER-01, pela tela Pedido/Imposição. O usuário informou ocorrência em Gerar PDF com arquivo conferido e em Imprimir com conferência apenas do papel; não reproduziu na própria estação.
- Consulta de leitura identificou modelo 1001293, quantidade 200, faixa 51–250, modo não paginado, gabarito 1000930 em duplex, dois elementos TEXT no verso e um PICOTE em ambas as faces.
- Frente e verso cadastrados são arquivos diferentes, não são amostras renderizadas e responderam HTTP 200. Ambos têm uma página e conteúdo gráfico.
- Último heartbeat consultado da LASER-01: 24/09 às 18:14:26, Brasília, agente 1.2.338 e painel 957. Às 18:21 estava sem renovação havia aproximadamente sete minutos; isso não comprova a causa do incidente.
- Arquivos públicos index.html, pedido.js, script.js e arte-de-impressao.js coincidiram com a base analisada após normalização de BOM/quebras de linha. Isso não comprova os bytes carregados na aba do navegador da estação.
- Motor atual, com PDFs sintéticos: entrada completa produz verso com arte e número; frente ausente com numeração produz somente número no verso; frente e numeração ausentes produzem verso vazio, mesmo fornecendo arquivo separado de verso.
- Essa reprodução confirma o comportamento do motor com entradas incompletas. Ainda não reproduz o clique real na LASER-01 nem comprova o conteúdo enviado naquela tentativa. Falta o PDF defeituoso ou diagnóstico da tentativa.
- Validação anterior: 11 testes de verso individual passaram; o harness do carregamento do verso passou em 50 cenários. Esses resultados não cobrem a preparação completa antes do clique.

### Outros pontos identificados

| Ponto | Evidência na base | Risco / conclusão permitida |
|---|---|---|
| Abertura normal do modelo | `pedido.js`, `enviarParaPedido`: timers e espera por tarefas somente com `contexto.aindaAtual` fornecido pelo chamador | A abertura comum não representa todo o carregamento em uma promessa aguardada. A proteção de seleção/Produção por Cor não cobre uniformemente os acessos. |
| Arte de frente opcional no envio | `pedido.js` e `script.js`, preparação do FormData | Arquivo ainda não carregado pode ser tratado como ausência legítima. |
| Numeração desconhecida | `script.js`, `garantirCsvDoTrabalho` | ID ausente do catálogo é pulado. Experimento com a função real e mocks: promessa resolveu sem erro e sem consulta. |
| Releitura de numeração | `script.js`, `recarregarNumeracoesDoPedido` | Erro retorna 0 e preserva catálogo anterior. Experimento com erro simulado confirmou; outros bloqueios do chamador ainda precisam ser considerados antes de afirmar impressão incorreta. |
| Modelos em cache | `script.js`, `loadOSItens` | Carga completa condicionada a `_dbLoaded`; conferir validade dos campos de arte/configuração, além da releitura de quantidades existente. |
| Verso sem frente no motor | `engine.py`, `_load_base_as_pdf` | Retorna antes de usar o verso quando a frente não existe. O requisito correto deve ser por face; um trabalho intencional com arte só no verso não pode ser confundido com frente que falhou. |
| Arte combinada | `engine.py`, `_load_art_as_pdf` e preparação de `multi_map` | Erros podem retornar None ou apenas ser registrados. A recusa explícita mostrada nessa região cobre `modo_pdf`, não todos os modos combinados. Achado de código, ainda sem reprodução completa nessa análise. |
| Elementos de arte | `engine.py`, `_render_element` | Fotos/PDF/SVG inválidos possuem recusas, mas alguns conteúdos ausentes são ignorados. Auditar obrigatoriedade antes de renderizar. |
| Recebimento de lotes | `pedido.js`, laço do stream | EOF encerra a leitura sem exigir evento terminal de sucesso; erro por arquivo pode ser capturado e a leitura continuar para ambas as faces. Exigir reprodução dos efeitos finais antes da correção. |
| Entrega progressiva | `app.py`, callback e eventos; `script.js`, `criarEntregaDeImpressao` | Arquivos podem ser enviados antes de concluir o trabalho. Resultado parcial e confirmação de entrega exigem estados próprios. Papel já enviado não pode ser desfeito. |

## Contrato proposto para cada trabalho

1. Capturar pedido, modelos, seleção, faces, quantidade/faixa e configuração escolhidos em um identificador único de trabalho. Bloquear mudanças concorrentes enquanto prepara ou invalidar explicitamente a preparação.
2. Cada dependência deve ter estado inequívoco: não consultada, carregando, carregada e validada, ausência confirmada, erro ou desatualizada. `null`, array vazio, cache presente ou tempo decorrido não bastam para declarar prontidão.
3. Resolver pelas referências do modelo e pelas opções explícitas do trabalho; não substituir por primeiro item do catálogo, configuração de outro modelo, amostra de aprovação ou numeração sequencial quando um banco falhar.
4. Construir uma cópia estável dos dados do trabalho após todas as validações. A geração e sua prévia devem consumir essa mesma cópia, sem voltar a ler seletores/estado global mutável depois de esperas.
5. Registrar no manifesto do trabalho as dependências esperadas e sua origem: modelo, face, ID/revisão, tamanho/hash dos arquivos, páginas e contagens esperadas. Hash comprova integridade dos bytes, não aprovação comercial ou correção visual.
6. O agente valida o manifesto e os recursos recebidos independentemente da tela. Ausência de protocolo/capacidade exigida bloqueia com instrução de atualizar; não permite uma tentativa silenciosa pelo caminho antigo.
7. Arquivos, bancos e demais recursos obrigatórios devem estar locais, validados e vinculados ao trabalho antes de liberar a primeira saída. Falha remota posterior não pode remover conteúdo já preparado.

## Etapas de implementação

### 1. Reproduções e diagnóstico por tentativa

- Preservar uma reprodução automática da abertura normal do Pedido com downloads controlados: gerar antes da numeração, durante a arte, depois de falha e após resposta tardia de outro modelo.
- Cobrir `runPedImposition`, `runImposition`, Produção por Cor, Montagem, combinação, Refazer e as opções de uma face. Inventariar os chamadores e reutilizar a preparação comum sem reescrever telas inteiras.
- Associar eventos a trabalho/modelo/face/etapa e versões do painel/agente: preparação, validação, geração, arquivo concluído, envio solicitado, aceito, falhou ou resultado desconhecido.
- Diagnóstico sem conteúdo de CSV, códigos QR, credenciais, URLs assinadas ou dados pessoais. Retenção limitada; artefatos reais do incidente não entram em fixtures ou Git.
- Analisar o PDF defeituoso e os registros da tentativa, se disponibilizados, para fechar a causa específica do 22599.

### 2. Preparação única e obrigatória no frontend

- Substituir timers usados como sinal de prontidão por dependências aguardáveis. Timers visuais podem continuar, mas não liberam geração.
- Centralizar uma preparação do trabalho chamada por Gerar PDF e Imprimir. Botão mostra carregamento/bloqueio; validar novamente dentro da ação para cobrir atalhos, chamadas diretas e duplo clique.
- Reconsultar os dados críticos e exigir todas as referências esperadas: modelos, numerações, formato/saída, vínculos de banco e revisões. Uma consulta bem-sucedida que omite IDs requeridos é falha de preparação.
- Não usar catálogo antigo como resultado de uma releitura malsucedida. Cache só é reutilizado quando a revisão e os bytes correspondem ao trabalho validado; falha invalida a autorização de usar aquela entrada.
- Baixar e validar frente/verso e recursos dos elementos: status HTTP, tamanho, assinatura/tipo, abertura pelo parser, páginas e dimensões. Preferir arquivos já verificados por hash à repetição de downloads.
- Validar bancos por modelo, colunas, fatias, quantidades e valores obrigatórios; preservar literalmente numeração, regras TICKET, QR e blocagem existentes.
- Cancelar requisições superadas e rejeitar respostas tardias por identificador de preparação. Nova seleção exige nova preparação.
- Aplicar timeout global e por recurso, poucas tentativas para leituras transitórias, cancelamento e retry explícito. Nunca reimprimir automaticamente após timeout de envio.

### 3. Validação independente no agente e motor

- `app.py`: validar esquema/versão do contrato, identidade, arquivos esperados versus recebidos e contagens antes de iniciar o motor. Não consultar cadastros alternativos para completar silenciosamente um trabalho incompleto.
- `engine.py`: carregar antecipadamente todas as artes, elementos, fontes e bancos obrigatórios; substituir retornos silenciosos por falhas identificadas. Materializar o conjunto de dados usado pelo render, inclusive imagens por linha.
- Cada face declara se usa arte externa, página do PDF, arte de elemento ou ausência intencional. Preservar PDFs com faces embutidas, duplex comum, verso único e paginado. Para arte somente no verso, compor uma frente intencionalmente sem arte e inserir o verso obrigatório; não descartar o verso porque falta arquivo frontal. Se o manifesto exige arte frontal, sua ausência bloqueia.
- Não exigir indiscriminadamente numeração nem rejeitar todo gabarito sem elementos: respeitar ausência confirmada; bloquear quando a referência exigida não foi resolvida ou não corresponde à revisão validada.
- Se um campo não tem revisão confiável, inicialmente comparar conteúdo relevante em leituras antes/depois da preparação. Isso detecta alterações, mas não oferece transação atômica entre tabelas. Se a operação exigir essa garantia, projetar leitura consistente do manifesto no backend, sem migração remota automática.
- Não liberar arquivo quando uma dependência obrigatória falhar. A mesma regra deve valer em geração individual, combinada e paginada.

### 4. Validação da saída e entrega

- Gerar em diretório do trabalho. Só promover um PDF para entrega após fechar, reabrir e validar estrutura, páginas/faces e composição esperada; usar hash e identificador por arquivo/lote.
- Conferir contagem de peças, faixas e elementos efetivamente processados contra o manifesto. Não usar presença de texto ou página não branca como única prova: existem artes rasterizadas, texto convertido em curvas e faces vazias legítimas.
- Manter o envio por bloco, conforme decisão do usuário. Pré-carregar todas as dependências de todo o trabalho e validar cada lote antes de liberá-lo. Nenhuma arte, banco, fonte ou foto obrigatória poderá depender de download depois do primeiro envio. Uma falha posterior de render/dispositivo ainda pode deixar execução parcial: interromper e exigir retomada explícita.
- Para pedidos grandes, preparar recursos em disco por trabalho com hashes e limites de memória, reaproveitando apenas arquivos comprovadamente iguais. Conferir espaço disponível e falhar antes do primeiro lote se não houver capacidade; não contornar a falta de espaço começando a impressão com dependências ainda pendentes. Medir a espera inicial com a carga realista de fotos/bancos na validação sintética.
- Stream deve ter conclusão explícita, total esperado e integridade conferida. EOF, erro de parse, lote ausente/repetido ou erro de entrega impede sucesso geral. Falha interrompe novos envios e preserva o histórico dos anteriores.
- Separar gerado, recebido, enviado, aceito pela fila e confirmado fisicamente. Não marcar todo o modelo Impresso por sucesso parcial ou apenas por gerar PDF.
- Identificar trabalho/arquivo em cada tentativa e impedir duplicação por duplo clique/reconexão. Após timeout com entrega incerta, exigir conferência da fila/impressora; não presumir que nada saiu.
- Retomada usa apenas os arquivos validados e ainda não confirmados, com ação explícita e conferência física quando necessário. Não prometer impressão exatamente uma vez se o spooler não permite confirmar esse resultado.

### 5. Testes e critérios de liberação

| Grupo | Cenários mínimos | Aceitação |
|---|---|---|
| Concorrência | clique imediato, duas abas, troca de modelo/pedido, resposta antiga, duplo clique | Nunca misturar dados; tentativa inválida gera zero envios. |
| Rede/cache | offline, timeout, 403/404/500, HTTP 200 com HTML, arquivo truncado, cache/revisão antiga, resposta parcial | Erro explícito; nenhum fallback para vazio ou outro cadastro. |
| Numeração/bancos | ID ausente, gabarito sem elementos legítimo, banco faltante/vazio/curto, coluna/fatia alterada | Preservar regras e bloquear somente ausências não autorizadas; jamais converter falha em sequencial. |
| Artes/faces | frente/verso separados, embutidos, arte apenas em uma face, mesma URL, verso único, PDF paginado, PDF/SVG/fotos por elemento | Cada face produz exatamente suas dependências previstas ou a geração falha. |
| Composição | blocos, TICKET, combinação permitida, blocos diferentes, Refazer, frente/verso isolados | Quantidades, numeração, pareamento e restrições preservados. |
| Saída/entrega | disco cheio, escrita falha, PDF inválido, stream truncado/sem done, lote duplicado, envio sem resposta, reinício | Sem conclusão falsa; nenhuma repetição automática de envio incerto. |
| Compatibilidade | painel antigo/agente novo e painel novo/agente antigo | Versão incompatível bloqueada antes de gerar/enviar, com mensagem acionável. |

Executar testes com dados sintéticos e rede/impressora simuladas; incluir atraso controlado no navegador e comparação de PDFs completos, não apenas asserções de presença de código. Medir tempo/memória/disco em pedidos representativos. Evidência operacional exige piloto na LASER-01, com arquivos conferidos e impressão física controlada depois da validação local.

## Entrega e recuperação

Implementar em mudanças pequenas: contrato/preparação, validação do motor, entrega/diagnóstico, testes. Uma versão só pode ser chamada segura quando todas as barreiras exigidas estiverem ativas no caminho liberado.

Planejar atualização em ordem compatível: agente com suporte ao contrato, confirmação das capacidades nas estações, depois ativação da exigência no painel. A disponibilidade de uma versão/MSI e o heartbeat não substituem teste do navegador e impressão física. Confirmar os assets públicos com cache-buster e hashes normalizados, versão do agente e capacidade em execução.

Rollback deve manter bloqueio para o fluxo afetado se a versão anterior permite PDF incompleto. Não recuperar disponibilidade reativando omissão silenciosa. Implantação, build, publicação e instalação pertencem à execução posterior autorizada.

## Regras de recuperação e limites do plano

- Recuperação depois de envio parcial: interromper novos envios e exigir retomada explícita após conferir o que já saiu; jamais repetir tudo automaticamente.
- Arte somente no verso é válida. A obrigatoriedade vem da configuração confirmada de cada face, não de uma exigência genérica de dois arquivos.
- Envio por bloco permanece, precedido de validação de todas as dependências. Garantir dados completos antes da primeira saída não garante ausência de falha posterior de render, hardware, energia ou spooler.
- Offline: critério confirmado é bloquear até confirmar. Operação offline só caberia como escopo separado, com pacote integral previamente validado e política explícita de validade/revisão.

## Próximo ponto de execução

Começar pela reprodução no navegador da abertura normal e pela preparação de um modelo individual, usando o 22599 apenas como estrutura de referência sintética. Em seguida aplicar a mesma exigência aos demais chamadores e validar o contrato no agente. A correção completa envolve frontend e Python; este documento não aplica mudanças a código, banco ou estações.
