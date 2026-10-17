# Montagem: repetições ausentes no NewProd 1.3.15

## Diagnóstico

O usuário confirmou uso do NewProd 1.3.15. Leitura local de `http://127.0.0.1:9001/montagem.js` confirmou que `nomeDoArquivoDaMontagem` ainda retorna o nome sem repetições. O HTML servido referencia `montagem.js?v=1315-faces-controles`. A fonte da entrega `9f869651` contém a mesma função antiga. A alteração havia ficado no trabalho local anterior, fora do pacote entregue.

## Correção local

Branch `fix/montagem-repeticoes-1315`, baseada em `9f869651`, preservando as demais mudanças da entrega. Prefixo de repetições calculado pelo resumo da composição atual, nomes descritivos e sufixos de face preservados. Padrões da imagem também transportados: Frente×Verso, Separados, Rotacionar Verso e Visualizar PDF. Rascunhos preservam escolhas explícitas. Referência do JavaScript atualizada para invalidar cache quando entregue.

## Validação

225 verificações de navegador aprovadas, incluindo geração simulada de dois PDFs com `15x_` no download e Hot Folder. 3586 verificações do núcleo aprovadas. Dados sintéticos, sem geração ou impressão em produção. Diff sem erros.

Não publicado nem instalado nesta etapa. O painel local observado continua sem a correção; atualizar somente o navegador não substitui o arquivo do pacote instalado.

## Identificação somente na frente e botões de visualização

Pedido adicional autorizado: identificação habilitada somente na frente da Montagem. A prévia do verso não desenha a identificação, inclusive com a folha girada. A Montagem envia `nome_apenas_frente: true`; após autorização explícita do usuário para alterar o motor, `engine.py` transporta essa opção e impede o desenho no verso no caminho de montagem estrita. O caminho comum já omitia a identificação no verso. Sem a opção, o comportamento anterior das demais telas é preservado. Textos e numeração próprios das artes de verso não são removidos.

O seletor de visualização foi substituído por botões Frente e Verso, com destaque e `aria-pressed` na face ativa. São independentes da seleção de faces do PDF e aparecem quando há verso. Controles bloqueados durante geração.

Validação adicional: 226 verificações da tela, 3587 do núcleo, 65 testes de PDFs (comum/estrita, frente/verso separados e combinados, verso girado, opções antigas preservadas) e 5 regressões de montagem estrita aprovados. Testes sintéticos. A primeira expectativa de teste assumia identificação no verso também no caminho comum; a inspeção confirmou que esse caminho já a omitia. O teste foi corrigido para verificar ambos os caminhos e a preservação do comportamento anterior.

Alterações locais, ainda sem publicação ou instalação. O ajuste do motor exige atualização do pacote, além do frontend.

## Preparação da entrega 1.3.16

Autorizada publicação no Imposition e liberação para todas as estações. Pacote construído a partir da fonte pública 1.3.15, com somente as correções desta tarefa. Web preparada separadamente sobre origin/main d1535c7c, preservando Vibe Entregas e outras mudanças concorrentes. PR web #158; versão de cache v1074.

MSI `NewProdPiloto_Oficial_v1.3.16.msi`: 196689920 bytes; SHA-256 `86d5f79489444c09a06578167efd09cc62be742735ce59fea8262ef1accc77b1`. EXE SHA-256 `62c67971988fb64933271d7faab465d10cd29e2605108669dcbf17004f3c7984`. Auditoria conferiu 375 arquivos do frontend dentro do executável e ProductVersion 1.3.16.

## Publicação web confirmada

PR https://github.com/ingressoideal1-gif/imposicao/pull/158 integrado em `a2fa396246d68c7eeaee36830e8ef054f340294f`, tag `v1074`. Todas as verificações obrigatórias aprovadas, incluindo Windows - segurança e recuperação. Cloudflare Pages: sucesso, deployment `7d3f560a-e8ce-4285-ab26-ad72d4dfb52e`.

Leitura pública com cache-buster confirmou igualdade normalizada de index.html, montagem.js, style.css, cliente.html e producao.html em https://imposition.ai-ideal.com.br e https://imposicao.pages.dev (10 comparações). Evidências no worktree web, `dist/prova-publica-v1074.json` e `dist/cloudflare-v1074.json`.

Validação de compatibilidade: web com 831 testes Python aprovados por canal (produção e Piloto), além dos harnesses; NewProd com 1111 testes Python aprovados por canal (produção, Piloto e oficial), além dos harnesses. Cada bateria registrou dois skips e o aviso de depreciação de httpx/Starlette, sem falhas. Nenhuma dependência foi alterada.

## Liberação universal confirmada

Fonte NewProd `fcaf7838`, tag `agente-v1.3.16`. Downloads públicos completos do MSI oficial e do alias legado conferidos com tamanho 196689920 bytes e SHA-256 `86d5f79489444c09a06578167efd09cc62be742735ce59fea8262ef1accc77b1`. Só depois foram ativados `newprod-piloto-oficial.json`, `latest.json` e `newprod-piloto-teste.json`, todos em 1.3.16 sem restrição de estações. Nova leitura pública com cache-buster confirmou versão e hash nos três.

Evidências: `dist/auditoria-1316.json`, `dist/validacao-canais-1316.json`, `dist/validacao-oficial-1316.json`, `dist/publicacao-universal-1316.log` e diretório `dist/publicacao-unica-1.3.16-*` (manifestos anteriores, downloads conferidos e ativação).

Disponibilidade universal confirmada; nenhuma instalação ou reinício forçado de estação foi executado. Adoção em cada estação e impressão física não foram verificadas. Para recuperação, manifestos anteriores foram preservados; eventual reversão do código deve ser empacotada sob versão superior, sem regravar o MSI imutável.
