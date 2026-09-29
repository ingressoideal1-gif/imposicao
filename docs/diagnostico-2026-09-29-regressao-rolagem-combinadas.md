# Regressao de rolagem nas janelas combinadas

**Entrega segura autorizada em 29/09/2026:** as etapas abaixo preservam o historico do diagnostico e da validacao local. A simulacao do publicador terminou `ESTADO: VALIDADA`, com candidata v976 e base remota `6778b3bd`, sem conflito. A publicacao e sua verificacao final devem ser conferidas nos registros de `C:\ProjectBackups\combinadas-v976-20260929` (log do publicador e hashes publicos). Nao inferir publicacao apenas desta preparacao.

O usuario relatou piora em relacao aos dias anteriores e esclareceu que ocorre **ao rolar a tela**. Depois perguntou se margens da Cor e o novo Multiply para elementos PDF, ainda nao utilizados, seriam causas provaveis.

## Fonte atual e escopo

Analise em worktree isolada `C:\ProjetosLocais\ideal-imposition-combinadas-regressao-20260929`, branch `diagnostico/combinadas-regressao-20260929`, base `6778b3bd`.

O site ja serve a v975, posterior a v974 publicada nesta conversa. O primeiro confronto com a v974 detectou a diferenca; fetch e nova consulta publica confirmaram que `script.js` coincide com `origin/main` em `6778b3bd`, normalizando BOM e finais de linha. `amostra-modal.js` coincide com a versao local herdada da v973. A atualizacao Camarote da v975 foi preservada.

Na etapa de diagnostico, somente arquivos publicos foram consultados. Nenhum login, credencial, banco compartilhado ou pedido real foi acessado. A correcao local autorizada posteriormente esta registrada ao final; nao houve commit ou publicacao.

## Causa reproduzida da espera ao rolar

Na v973, commit `d39274b918e9270750169cb0a9e2370b32a389a2`, `renderItemAmostraCombinada` passou a limitar **o trabalho inteiro** a dois modelos, incluindo esperas por rede, fontes, PDF e nova tentativa. O limite nao se restringe ao processamento pesado de canvas/PDF.

O observador agenda modelos proximos da tela (`rootMargin: 600px`) e deixa de observa-los depois do primeiro disparo. A fila usa ordem de chegada. Sua verificacao de atualidade confere pedido, item e ancora DOM, mas nao confere se o modelo continua visivel. Portanto, rolar para baixo nao promove o modelo visivel nem libera o lugar de trabalhos antigos fora da tela.

Reproducao com Chromium real e rolagem real, coordenador e `IntersectionObserver` reais, transporte/render simulado:

- Dois modelos iniciais ficaram aguardando recursos: indices 0 e 1.
- Ao rolar ate o modelo de indice 9, seu cabecalho ficou no topo da tela (0,47 px), mas ele nao iniciou.
- Trabalhos existentes: `p1:0`, `p1:1`, `p1:2`, `p1:8`, `p1:9`.
- Ao liberar uma vaga, iniciou o indice 2, que estava cerca de **3.771 px acima da tela**, antes dos indices 8 e 9 visiveis.
- Trocar de pedido tambem deixou o primeiro modelo do novo pedido aguardando as duas vagas ocupadas pelos trabalhos antigos. As ancoras invalidadas descartam a aplicacao final, mas nao interrompem imediatamente o trabalho em voo.

Em outro teste com relogio virtual e `fetchPdfBytes` real, dois downloads sem resposta consumiram 15 s no acesso direto, 15 s no proxy, 750 ms de espera e uma repeticao completa. Um terceiro modelo cujo desenho era imediato so iniciou em **60.750 ms virtuais**. Isso demonstra um caminho possivel de bloqueio, nao a latencia medida da estacao nem um limite total da previa; outras etapas tambem possuem esperas.

Essa mudanca foi publicada nesta conversa. Os testes anteriores provaram o limite de dois trabalhos e a recuperacao isolada, mas nao cobriram a rolagem com os dois primeiros trabalhos lentos e a prioridade do modelo que acabou de entrar na tela.

## Outro agravante confirmado, na ampliacao

O modal anterior a v973 copiava a imagem pronta. Na v973, sua abertura passou a chamar `renderItemAmostraCombinada` incondicionalmente no painel. Essa chamada marca o card como carregando; o modal esconde o bitmap pronto ate concluir novamente.

Comparacao em navegador, mesmo canvas pronto:

| Modal | Novos desenhos ao abrir | Imagens imediatamente visiveis | Mensagem de carga |
|---|---:|---:|---|
| v972 | 0 | 1 | Nao |
| Atual | 1 | 0 | Sim |

Esse segundo problema afeta a ampliacao, nao e necessario para reproduzir a queixa especifica de rolagem.

## Margens e Multiply sem uso

- **Margens:** `drawAmostraFace` chama `CorMargens.calcular` apenas se `cor.margem_esquerda_mm != null`. Sem esse campo, usa o caminho de dimensoes anterior. A rotina de margens calcula dimensoes; nao introduz downloads. Margens muito grandes efetivamente cadastradas podem aumentar o canvas e o consumo de memoria, mas os valores reais nao foram consultados.
- **Novo Multiply por elemento PDF:** `elementoMesclaComArte` exige `el.type === 'PDF' && el.mesclar_com_arte === true`. Campo ausente ou false nao ativa essa composicao. Ha verificacoes simples/ordenacao dos elementos, mas nao ha evidencia de que elas expliquem a espera de dezenas de segundos.
- O `multiply` do grupo arte + numeracao sobre a Cor ja existia desde agosto; nao deve ser confundido com a opcao nova de mesclar o PDF.
- A regressao da fila foi reproduzida com modelos sinteticos sem margens, sem numeracoes e sem a opcao Multiply. Portanto, esses recursos nao precisam estar ativados para ocorrer o bloqueio observado.

## Validacao e correcao indicada

Executado com sucesso:

```powershell
$env:NODE_PATH='C:\ProjetosLocais\ideal-imposition\node_modules'
node tests/diagnostico_combinadas_rolagem.js
node --check tests/diagnostico_combinadas_rolagem.js
git diff --check
```

O diagnostico bloqueia a rede do Chromium, usa DOM/canvas reais e funcoes reais extraidas do frontend. Os tempos de download do teste sao virtuais. Ainda nao ha captura autenticada do pedido lento do usuario.

Correcao prioritaria: separar a preparacao/espera de recursos do limite de processamento; priorizar os cards visiveis e impedir que tarefas fora da tela ou de outro pedido ocupem indefinidamente as vagas. Liberar a vaga durante a espera de nova tentativa, mantendo recursos compartilhados e cancelamento seguro. Nao remover o tratamento de erro nem voltar a aprovar/salvar uma previa incompleta.

Na ampliacao, reutilizar a previa pronta e atual; solicitar desenho apenas quando falta, esta invalidada ou o operador pede nova tentativa. Testar rolagem rapida, dois arquivos lentos/invalidos seguidos de um saudavel, mudanca de pedido, fontes/CSV chegando durante a rolagem e ausencia de snapshots incompletos. Desativar margens ou Multiply nao corrige o mecanismo reproduzido.

## Correcao local executada e validada

Autorizacao: **corrigir e validar a regressao da fila**. Base mantida em `6778b3bd`; mudancas de Camarote da v975 preservadas. Nenhuma mudanca de resolucao, banco, backend, regras de impressao ou publicacao.

`frontend/script.js`:

- A preparacao de cada modelo aguarda seus recursos independentemente. Rede, fontes e os 750 ms de recuperacao nao ocupam mais uma vaga global de modelo.
- `executarRasterDaPrevia` limita a dois os desenhos PDF desse fluxo. Abrange cor, arte, elementos PDF e frente/verso do visualizador. A prioridade e calculada novamente ao liberar cada vaga, usando a area atual da previa na tela, com fallback pelo cabecalho. Trabalho visivel pronto precede o que ficou fora da tela.
- Documentos/elementos compartilhados continuam compartilhados. Leituras ja iniciadas podem concluir ou atingir seu prazo; a correcao nao aborta um recurso compartilhado de que outro modelo possa precisar. Isso nao segura o inicio do carregamento de outro modelo.
- Desenhos obsoletos do visualizador sao descartados antes de iniciar o raster. Composicoes verificam novamente pedido, item e ancora depois das esperas, antes de publicar pixels ou agendar snapshots.
- Conservados: concorrencia de uma composicao por modelo, consolidacao de alteracoes em voo, uma recuperacao automatica, tentativa manual e bloqueio de snapshot/PDF de prova em caso de erro.

`frontend/amostra-modal.js`: abrir uma previa pronta apenas copia o bitmap. Abrir durante uma carga acompanha a mesma carga sem solicitar outro repinte. Ausencia/erro ainda permite iniciar ou tentar novamente. O portal mantem o caminho anterior.

Evidencias:

| Cenario | Antes | Depois |
|---|---|---|
| Dois downloads sem resposta, terceiro modelo saudavel | Inicio em 60.750 ms virtuais | Inicio em 0 ms virtuais, independente dos dois erros |
| Rolagem real ate indice 9 | Aguarda indices 0 e 1 | Inicia enquanto eles aguardam |
| Raster pronto esperando vaga e usuario muda a rolagem | Ordem de chegada | Ordem observada `0,1,9,2,8`, acompanhando a tela; pico de dois rasters |
| Novo pedido com downloads anteriores pendentes | Primeiro modelo espera | Primeiro modelo inicia imediatamente |
| Abrir modal pronto | Um redesenho, bitmap ocultado | Zero redesenhos, bitmap visivel |
| Abrir modal durante carga | Solicita repinte adicional | Reutiliza a carga em andamento |

`tests/combinadas_rolagem_harness.js` passou com a correcao e falhou intencionalmente na base `6778b3bd` com `60750 !== 0`, demonstrando que a regressao detecta o defeito anterior. `tests/diagnostico_combinadas_rolagem.js` foi fixado na base antiga para preservar a reproducao historica.

Selecao pytest: **95 passaram**, incluindo rolagem, recuperacao, controles PDF, Multiply, verso, escala, desempenho, formatos, fontes e sintaxe de todo o frontend. Apos o ajuste final da prioridade pela area da previa e das guardas de navegacao, os dois testes de rolagem/recuperacao foram repetidos e passaram. Tambem passaram 21 verificacoes do cadastro de margens, 24 de pixels frente/verso no painel/portal e 17 de Camarote. A recuperacao verifica pixels contra a base, snapshots, aprovados, PDF de prova e agora a navegacao durante a espera de fontes.

Fixtures receberam o auxiliar real de rasterizacao. A assercao antiga de duas esperas globais foi substituida por testes separados de esperas independentes e de no maximo dois rasters, incluindo erro, descarte de trabalho obsoleto e liberacao de vagas. Nenhuma validacao de fidelidade foi removida. Diff e sintaxe foram revisados.

Entrega local pronta para revisao, sem commit/push/deploy. O checkout operacional permanece preservado. A validacao usa navegador/DOM reais com servicos simulados e nao mede a latencia de um pedido real. Para eventual publicacao, integrar a base remota atual em worktree isolada, repetir os testes pertinentes se houver conflito e usar o fluxo seguro com comparacao dos arquivos publicos; nao copiar o `script.js` inteiro sobre outro checkout.

## Continuidade: identificacao das artes e retorno a lista

Pedido humano: seguir com a apresentacao como Artes do pedido e conferir a navegacao, preservando funcionalidades.

- `frontend/index.html`: banner identificado como "Artes do pedido #..." e acao "Voltar a Lista de Arte". IDs e manipuladores mantidos. O menu recebe um rotulo contextual; o modo avulso continua chamado Amostras.
- `frontend/script.js`: dicas da linha do pedido atualizadas; o menu identifica o pedido ativo. Ao sair da lista, guarda a posicao de `.main-content` na memoria da aba; ao retornar, restaura apos desenhar os dados disponiveis. A abertura da tela de artes a partir da lista comeca no topo. Busca, designer e filtro de situacao permanecem nos controles/estado existentes. Leitura de atualizacao e permissoes mantidas.
- `tests/navegacao_browser_harness.js`: usa o botao real do HTML, as funcoes reais de navegacao e rolagem em Chromium com dados sinteticos. Acrescenta ida/volta pelo botao e pelo historico. Antes da alteracao, reproduziu abertura indevida no meio do pedido: `1250 !== 0`.

Validacao desta continuidade: **81 testes pytest passaram** (rolagem combinada, recuperacao, desempenho da lista e sintaxe de todo o frontend) e **21 cenarios de navegacao no Chromium passaram** (incluindo os dois novos, F5, permissoes, resposta atrasada, pedidos distintos e portal). `git diff --check` sem erros.

Limite conhecido: `tests/navegacao_seguranca_harness.js` falha com `ReferenceError: preencherFaixaDoModelo is not defined`. A mesma falha foi reproduzida usando `script.js` e `pedido.js` originais de `HEAD` (`6778b3bd`), sem as alteracoes locais. O harness antigo nao foi corrigido nesta tarefa. Nao declarar a suite inteira aprovada.

A posicao e preservada na aba atual, nao apos F5. Se a atualizacao remover pedidos e encurtar a lista, o navegador limita a posicao a altura disponivel; nao sao conservadas linhas que deixaram de atender aos filtros. Resolucao, exportacoes, regras de negocio e APIs nao foram alteradas. Continua uma entrega local, sem publicacao.

## Plano de publicacao e recuperacao

Publicar pelo `entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta`, atualizando as referencias de cache dos dois JS modificados. A simulacao executou todos os harnesses alterados com sucesso, incluindo fidelidade de margens, Multiply, escala, verso, Camarote, recuperacao, prioridade de raster e os 21 cenarios de navegacao. Revisao de escopo, sintaxe, diff, links e detector de segredos aprovada. A falha preexistente do harness de seguranca permanece documentada acima; nenhuma verificacao foi desabilitada.

Confirmar Cloudflare Pages para o commit integrado e comparar SHA-256 normalizado de HTML e JS nos dois dominios operacionais, com cache-buster. Se houver propagacao pendente, repetir apenas a verificacao publica. Registrar o resultado real no diretorio de evidencias indicado no inicio deste documento.

Recuperacao: preparar um novo commit que reverta apenas o commit funcional desta entrega e publicar sob nova versao de cache, mantendo os avancos de Camarote da v975 e quaisquer entregas posteriores. Nao reutilizar tags nem restaurar arquivos inteiros de uma base antiga. O checkout operacional, dados reais, MSI e estacoes permanecem fora desta publicacao web.
