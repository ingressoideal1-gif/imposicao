# Janela combinada — carregamento e recuperação

## Etapa inicial: entrega local

Pedido: analisar a lentidão e as falhas que deixam as artes invisíveis; em seguida, executar e revisar preservando funcionalidades.

Base local: `origin/main` em `7f52fc93`. Branch `fix/amostras-carga-recuperacao-20260929`, worktree `C:\ProjetosLocais\ideal-imposition-amostras-carga-20260929`. O checkout operacional permaneceu preservado. Não houve fetch, acesso a dados reais, alteração de banco, commit, publicação ou build/instalação do agente.

## Correções

- `frontend/script.js`: carregamentos do mesmo pedido compartilham a espera, inclusive por identificadores equivalentes. A abertura exige sucesso dos modelos e numerações; falha não leva à tela como se a leitura tivesse terminado corretamente. Leituras de modelos, produtos, artes e numerações têm prazo. O estado anterior dos modelos é preservado em caso de erro.
- Downloads da prévia têm prazo de 15 segundos por caminho (direto e proxy), incluindo o corpo HTTP. Tarefas de PDF/imagem têm prazo de 20 segundos; consultas usam 30 segundos. Esses limites são por etapa, não uma promessa de duração total da abertura.
- A fila mantém até dois modelos em processamento. Pedidos repetidos compartilham o trabalho, consolidando mudanças durante a espera em um repinte posterior. Trabalhos na fila de uma tela abandonada são descartados antes de começar; resultados tardios não atualizam o estado visual de outra tela.
- Uma tentativa automática adicional, após 750 ms, recupera falhas transitórias. Persistindo o erro, o card e a janela ampliada oferecem **Tentar novamente**. O botão é somente leitura e permanece disponível em modelos aprovados; os controles de edição continuam bloqueados.
- A composição de cada face acontece fora do canvas visível e só é copiada ao terminar. Falhas de cor/arte são comunicadas ao coordenador. Os elementos PDF da numeração são aguardados e compartilhados, sem uma marca permanente de falha. Documentos temporários são liberados e o cache limitado de rasterização continua em uso.
- Snapshots agendados verificam se a prévia continua concluída e pertencente ao mesmo modelo. O PDF de prova considera uma prévia com erro ou em carregamento como pendente, mesmo que exista um bitmap anterior.
- `frontend/amostra-modal.js`: mostra o estado real de carga/erro e permite recuperação. Continua espelhando o renderizador do card. A abertura do modal no portal do cliente mantém seu comportamento anterior.

Preservados: seleção de cor e formato, escala, composição, frente/verso, mescla opt-in, CSV por modelo, numeração, quantidades, aprovações e regras de impressão. Não foram alterados filtros/colunas de consultas, motor, APIs ou schemas.

## Evidências e revisão

O diagnóstico reproduziu com funções reais e serviços simulados: segunda chamada que terminava antes da primeira, erro de leitura sem propagação, card sem nova tentativa e download da arte que falhava deixando o canvas visível sem a arte.

Regressão adicionada: `tests/amostras_carga_recuperacao_harness.js`, executada pelo pytest. Testa carga compartilhada, erro e prazo, abort do corpo HTTP, preservação do cache, recuperação automática/manual, modal real, ausência de snapshot após falha, PDF de prova, edição travada em aprovado, concorrência máxima de dois modelos, chamadas repetidas e descarte de trabalhos antigos. Rede bloqueada no Chromium; dados e PDF.js simulados, DOM e pixels reais. Comparação pixel a pixel com o renderizador da base em quatro combinações de face/escala.

Resultado da seleção final: **141 testes passaram, 5 falharam**. A seleção inclui sintaxe de todo o frontend, recuperação, desempenho, controles PDF, mescla, duplicar verso, modelos novos, arte de aprovação, cor/formato, cards sob demanda, fontes, CSV e Lista de Arte. As cinco falhas abaixo foram reproduzidas na base intacta `7f52fc93` e não foram ocultadas:

| Teste | Falha preexistente |
|---|---|
| `test_csv_sob_demanda.py::test_as_DUAS_telas_de_imposicao_garantem_o_banco_antes_de_imprimir` | Busca por trecho em janela fixa de 1500 caracteres de `pedido.js`. |
| `test_csv_sob_demanda.py::test_abrir_a_numeracao_no_editor_espera_o_banco` | Espera assinatura textual antiga de `editNumeracao`. |
| `test_csv_sob_demanda.py::test_trocar_de_modelo_le_ENXUTO_e_baixa_so_o_banco_do_modelo` | Janela fixa termina antes da chamada procurada. |
| `test_lista_arte.py::test_o_harness_da_lista_de_arte_passa` | Uma de 163 verificações: recorte textual da navegação para imposição. |
| `test_arte_da_amostra_no_tamanho_real.py::test_a_folha_combinada_desenha_cada_arte_no_tamanho_do_arquivo` | Extração textual de `drawPedPreview` não encontra a chamada esperada; `pedido.js` não foi alterado. |

Verificações adicionais passaram: margens (21 verificações de cadastro e 24 de pixels), banco do pedido (105), escala da arte (49), verso atual e navegação em navegador (19 cenários). `navegacao_seguranca_harness.js` falha por ausência de `preencherFaixaDoModelo` no fixture, igualmente na base intacta.

Fixtures afetados foram adaptados às dependências reais e ao renderizador interno, mantendo suas asserções. Os fixtures de modelos novos, arte de aprovação e verso atual também receberam auxiliares que já faltavam na base para permitir executar suas regressões pertinentes. `git diff --check` passou.

## Preparacao da entrega segura

Na continuacao, o usuario autorizou a entrega segura. O fetch confirmou `origin/main` ainda em `7f52fc93`. A comparacao de pixels foi fixada nesse commit para continuar comparando com a versao anterior depois da publicacao.

O teste obrigatorio da Lista de Arte tinha uma ancora desatualizada: a leitura de numeracoes passou a ocorrer em `carregarModeloParaImposicao`, chamado por `enviarParaImposicao`. A assercao agora verifica as duas chamadas nas funcoes completas, sem depender de um recorte de 2500 caracteres. As quatro outras falhas historicas listadas acima continuam fora do escopo; nenhum teste foi desabilitado.

## Limites e retomada

Esta validação não mede latência na estação e não comprova recuperação de um pedido real. A verificacao operacional posterior deve observar abertura, rolagem e nova tentativa na estação afetada, conferindo a versão efetivamente servida (web ou painel do agente). Não confundir disponibilidade pública do frontend com instalação do agente.

Para continuar, usar a worktree acima e conferir se `origin/main` avançou. Não copiar todo o `script.js` para o checkout operacional antigo. Publicacao e comparacao dos arquivos publicos devem ser registradas abaixo depois da execucao.

## Entrega publica v973 concluida

- Commit funcional: `d39274b918e9270750169cb0a9e2370b32a389a2`, integrado por fast-forward em `origin/main`; tag anotada `v973` enviada.
- Executado `entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Sim`, depois da simulacao validada. O fluxo repetiu as verificacoes depois de atualizar os parametros de cache em `index.html` e `producao.html`.
- Todos os harnesses obrigatorios passaram, incluindo 25 verificacoes de recuperacao/modal/fidelidade/concorrencia, 163 da Lista de Arte e 19 cenarios de navegacao em navegador. As quatro falhas preexistentes da selecao ampliada permanecem registradas acima.
- Cloudflare Pages concluiu o deploy `388da17b-ae3a-4430-af71-60b5cb7979a4`. A comparacao imediata do script ainda recebeu arquivo anterior e terminou com `FALHA_APOS_INTEGRACAO`. Sem repetir a publicacao, a nova consulta apos propagacao confirmou os oito resultados abaixo: quatro arquivos em cada dominio.
- Verificacao em 29/09/2026, aproximadamente 12h26 (America/Sao_Paulo), com query unica e `Cache-Control: no-cache`. SHA-256 calculado depois de normalizar BOM e finais de linha, conforme o fluxo seguro do projeto.

Dominios conferidos: `https://imposition.ai-ideal.com.br` e `https://imposicao.pages.dev`. Todos os hashes publicos coincidiram com os arquivos locais do commit funcional.

| Arquivo/rota | SHA-256 normalizado, igual nos dois dominios |
|---|---|
| `index.html` / `/` | `1bb8fd46a8d9db8cd9be5fc73a93b360254a562a7ff0296f0d021fb4582f4bec` |
| `producao.html` | `76f4ef8e4d4e5e2de1c82d861d27d2413ff248b1bf4b4a2e9e28ae3fea249498` |
| `script.js?v=973` | `9c57ec8f56e54706c9e72d3050e2b3a76236726ae45002ccd59ceed8b16d8a79` |
| `amostra-modal.js?v=973` | `4220cbca1fa28227a8d42d6cf45998706e4775968c5e6995e69508af2a983457` |

Checkout operacional preservado em `21c4b722`, com os mesmos quatro arquivos locais nao rastreados. Nenhum banco compartilhado foi acessado ou alterado. Nao houve build, distribuicao ou instalacao do NewProd. A validacao de um pedido real na estacao continua pendente.

Recuperacao, se necessaria: preparar uma nova branch isolada da `origin/main` atual, reverter o commit funcional acima por novo commit, revisar conflitos e executar os testes pertinentes. Republicar pelo fluxo seguro com nova versao de cache e conferir ambos os dominios. Nao usar reset ou forcar o historico remoto. A base anterior esta preservada em `7f52fc938413f164cc1c136e15104d412dfcb932`; nenhuma reversao foi executada nesta entrega.
