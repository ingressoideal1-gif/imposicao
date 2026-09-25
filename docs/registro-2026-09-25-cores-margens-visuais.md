# Cor: margens exclusivamente visuais — 25/09/2026

Implementação local na branch `fix/formatos-integridade-20260925`, no worktree
`C:\ProjetosLocais\ideal-imposition-formatos-integridade`. Inclui as correções
anteriores de Formato registradas em `registro-2026-09-25-formatos-integridade.md`.
Sem commit ou publicação. O usuário informou ter aplicado o SQL no e-deal;
uma consulta REST sem solicitar linhas confirmou que as quatro colunas estão
acessíveis no projeto configurado (`vwbtitjlpelrcnsytzqw`). Nenhuma escrita real
foi executada pelo agente nesta validação.

## Contrato

Na edição da Cor, selecionar o Formato base e informar quatro margens não
negativas em milímetros (esquerda, direita, superior e inferior). Aceita vírgula
decimal. Largura e altura são calculadas e somente leitura:

- largura da Cor = largura do Formato + esquerda + direita;
- altura da Cor = altura do Formato + superior + inferior.

As margens ampliam apenas a composição visual da arte, o link do cliente e o PDF
de amostras. A arte e a numeração conservam as dimensões do Formato base, com
deslocamento visual pelas margens esquerda e superior. Frente e verso usam as
mesmas margens, sem espelhamento automático.

O editor mantém Fabric, JSON e PDF de arte nas dimensões da peça; o deslocamento
é aplicado ao grupo DOM de visualização. Os PDFs de arte e gabarito continuam
no Formato base para cores com margens. Não foram alterados o motor PDF,
imposição, quantidades, posições de impressão, blocos ou arquivos do agente.
Visualizadores do modo PDF paginado permanecem no fluxo próprio, sem Cor.

## Arquivos e persistência

- `frontend/cor-margens.js`: cálculo, validação e formulário compartilhados.
- `frontend/index.html`, `script.js`: campos, cadastro, composição e amostra.
- `frontend/cliente.html`, `cliente.js`: leitura e composição no portal.
- `frontend/criador-arte.js`: área visual externa à peça editável.
- `db.py`, `app.py`: persistência/validação no caminho da API local.
- `sql/cores_margens_visuais.sql`: quatro colunas nullable em `producao_cores`
  e constraint de valores finitos e não negativos, todas preenchidas ou nulas.

Não há atualização em massa de cores existentes. Registros sem margens mantêm
o comportamento anterior; ao editar, diferenças positivas entre Cor e Formato
sugerem margens simétricas, com aviso para conferência antes de salvar.

Salvar exige retorno da linha e releitura dos campos. Coluna inexistente não é
silenciosamente descartada. Falha ao carregar o PDF impede salvar a edição ou
duplicar a Cor. O cache de buscas em andamento libera promessas concluídas,
permitindo obter um PDF atualizado após recarregar o catálogo.

## Evidência local

Dados sintéticos, transporte simulado e testes de navegador sem rede:

- `cores_margens_browser_harness.js`: 21 verificações do cadastro e 24 de pixels
  no painel/portal, frente/verso. Formato 100 × 50 mm e margens 3,5/7/2/9 mm
  geram Cor 110,5 × 61 mm; a peça conserva 100 × 50 mm.
- `cores_margens_exportacao_harness.js`: PDF de amostra 110,5 × 61 mm;
  PDFs de arte e gabarito 100 × 50 mm, executando as funções reais de exportação.
- `test_cores_margens_visuais.py`: cinco testes da persistência Python extraída
  por AST, sem importar módulos que acessam configuração ou nuvem.
- Regressões passaram: PDF da Cor (40), escala da arte (49), controles PDF (41),
  fila (52), Formato (15), navegação (5), Produção por Cor, verso do portal,
  persistência do editor e desempenho da Lista de Arte.
- Sintaxe dos quatro JavaScripts alterados e revisão `git diff --check`.
- Captura local em `tmp-cores-margens/cadastro.png` (diretório ignorado pelo Git).

## Disponibilização pendente

### Revisão adicional de riscos

Antes de publicar, resolver/verificar os seguintes pontos identificados na
revisão posterior à implementação:

- Corrigido localmente: `exportarPdfSomenteArte` deixou de aceitar
  `amostra_arte_base64` e `verso_amostra_arte_base64` como alternativa. Usa
  `arteParaImpor` para excluir URLs de amostras também nos campos de original.
  Falha ao baixar/interpretar um original interrompe o download inteiro; faces
  sem original ficam em branco com aviso, preservando sua posição no PDF.
  `somente_arte_segura_harness.js` passou em seis cenários com pdf-lib real,
  conferindo conteúdo, frente/verso, dimensões e falhas sem arquivo parcial.
- O vínculo `cor.formato_id` ainda participa da escolha do Formato na abertura
  da Imposição. Alterar somente margens não altera a célula, mas trocar o
  Formato base da Cor pode afetar modelos vinculados. A branch também reúne as
  correções anteriores da seleção de Formato; não é um pacote só de margens.
- A validação de margens rejeita negativos e não finitos, mas ainda não limita
  o tamanho máximo do canvas. Valores exagerados podem prejudicar o navegador.
- `arte_de_aprovacao_harness.js` não concluiu nesta revisão: falta a dependência
  `aplicarRegraProdutoPrateleira` no contexto simulado. O helper já é chamado na
  versão base e o harness não foi alterado. Esta execução não comprova a
  regeneração completa das amostras.

O motor continua obtendo dimensões de `formato.width_mm/height_mm`; não foi
alterado. O caminho normal de impressão usa `arteParaImpor`, que exclui URLs
do bucket `amostras_renderizadas`. Essa proteção não comprova todos os caminhos
de exportação ou de reimportação manual de arquivos.

O usuário confirmou a execução do SQL; a consulta das novas colunas retornou
HTTP 200. Ainda falta comprovar INSERT/UPDATE com autenticação e RLS reais.
A página `http://127.0.0.1:8766/integrado.html` permite entrar com o login normal
e criar/editar somente uma Cor `TESTE MARGENS 2026-09-25`, de UUID fixo mostrado
na tela. Ela usa o cadastro e SDK reais, relê cada gravação e compara o Formato
base antes/depois. Não guarda senha nem sessão entre recargas; não exclui o
registro de teste. `cores_margens_sdk_harness.js` validou criação, edição e
releitura dessa página com HTTP simulado, sem gravar no projeto real.

Geradores: `tests/preparar_validacao_cores_local.js` (simulado) e
`tests/preparar_validacao_cores_integrada.js` (autenticado). Os arquivos gerados
ficam em `tmp-cores-margens`, fora do Git, servidos apenas em 127.0.0.1:8766.

Publicar os arquivos juntos, incluindo o novo
helper e atualização de versões/cache conforme o procedimento de entrega.
O caminho Python depende de uma entrega posterior do backend/agente quando usado.

Recuperação: reverter a aplicação para a versão anterior e conservar as colunas
adicionadas; não excluir margens ou alterar dados de Formato. Não foi feito teste
de impressão física, pois esta alteração está restrita à camada visual.
