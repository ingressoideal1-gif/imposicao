# Prévia de frente e verso do pedido 23068 — 05/10/2026

## Resultado

Corrigida localmente a prévia da janela do Pedido no painel de produção. Cada página do PDF passa a entrar com suas próprias dimensões, conservando centralização, recorte da célula e escala horizontal/vertical escolhida. A correção não foi publicada nem sincronizada com o painel instalado.

Entrega segura autorizada pelo usuário na sequência. A simulação aprovou o escopo Frontend, com versão planejada **v1022** e atualização das referências a `pedido.js` em `index.html`, `producao.html`, `cliente.html` e `controle.html`. A conclusão operacional depende das provas posteriores de publicação e sincronização.

Branch `fix/previa-pdf-23068-20261005`, worktree `C:\ProjetosLocais\ideal-imposition-previa-pdf-23068-20261005`, base `origin/main` em `ffb5e119`. Checkout operacional e suas mudanças preexistentes preservados.

## Evidência e causa

O usuário confirmou que o PDF e a impressão saíram corretamente e depois identificou que o erro estava na visualização do painel de produção. A captura mostra a primeira célula preenchida e as demais com arte reduzida.

O arquivo informado, `00001_1001917_lote001.pdf`, foi inspecionado diretamente: tem duas páginas com MediaBox e CropBox de aproximadamente **296,995 × 209,997 mm**, sem rotação. É A4 em paisagem; a pequena diferença frente a 297 × 210 mm decorre da precisão de conversão usada. As duas faces renderizadas desse arquivo foram conferidas visualmente. A impressão física correta tem como evidência a confirmação do operador.

O PDF original consultado anteriormente tem 20 páginas: a primeira mede 57 × 97 mm e as outras 19 medem 210 × 297 mm. A mistura de dimensões é suportada pela geração existente. Não requer transformar o arquivo original em A4 nem corrigir o PDF gerado para resolver esta falha de tela.

Na fonte servida, `drawPedPreview` calcula `dw/dh` usando `state.pedArtWidth/Height`, medidos na primeira página, e desenha todos os rasters subsequentes nessa mesma caixa. Uma página A4 com o crachá centralizado fica reduzida para as medidas da primeira página; seu conteúdo acaba ainda menor dentro da célula. Isso afeta as páginas ímpares seguintes e os versos pares.

O `pedido.js` servido pelo NewProd local era igual à fonte de `origin/main` usada na correção. A análise não dependeu do frontend antigo e modificado do checkout operacional.

## Alteração

Em `frontend/pedido.js`, o cache da página guarda as dimensões do viewport em pontos antes do arredondamento do canvas. Ao desenhar, a prévia ajusta `dw/dh` pelas dimensões da página efetivamente selecionada. Para rasters já em cache sem os novos metadados, recupera as medidas a partir da escala 1,5 usada pelo renderizador existente.

A mudança está restrita ao desenho da prévia. Não altera quantidade, paginação, pares frente/verso, payload, motor PDF, banco, modo de impressão, gabarito ou saída A4. A prévia da aba Imposição em `script.js` tem implementação própria e não foi alterada nesta tarefa, cujo alvo confirmado é a janela do Pedido no painel de produção.

## Validação

O novo `tests/previa_pdf_tamanhos_harness.js` executa `drawPedPreview` real em Chromium, isolando integrações e bloqueando rede, com páginas sintéticas de dimensões equivalentes ao caso. Mede pixels em todas as dez células.

Antes da correção, falhou na lateral da segunda célula: branco onde deveria haver arte, reproduzindo a redução da captura. Depois da correção passou nos casos de frente e verso com páginas de tamanhos diferentes, escala por eixo com margens preservadas, PDF uniforme, versos em paisagem, simplex, Duplicar para Verso e cache sem metadados. Também confere proporção A4 e ausência de erros de renderização.

Regressões existentes aprovadas: `impressao_combinada_harness.js`, `previa_verso_separado_harness.js`, `esquema_da_previa_harness.js`, `face_frente_por_padrao_harness.js`, `pdf_da_cor_harness.js`, `duplicar_verso_sem_modo_pdf_harness.js`, `escala_da_arte_harness.js` e `teatro_vertical_modelo_harness.js`.

Sintaxe do JS alterado e do novo harness aprovada. `git diff --check` aprovado. O wrapper `tests/test_previa_pdf_tamanhos.py` passou ao ser executado diretamente. Pytest não foi executado: não há `venv` no worktree e o Python disponível não tem pytest. Puppeteer já instalado no checkout operacional foi disponibilizado por `NODE_PATH`; nenhuma dependência foi instalada. Uma tentativa inicial de regressão não encontrou Puppeteer antes desse ajuste e foi repetida com sucesso.

Na preparação da entrega foi reutilizado, por junction `.venv`, o ambiente já instalado no worktree do Piloto. Nenhuma dependência foi instalada. Pytest foi então executado em série para a nova regressão, seleção do verso e compilação de todo o frontend: **95 testes passaram**. O fluxo de publicação exige adicionalmente `conferir_duas_versoes.py` e recompilação do pacote independente do Piloto, conforme o AGENTS.md atual.

Comando do teste específico em PowerShell, a partir do worktree:

```powershell
$env:NODE_PATH = 'C:\ProjetosLocais\ideal-imposition\node_modules'
node tests/previa_pdf_tamanhos_harness.js
```

## Entrega e limites

Mudança e testes locais, sem commit, push, deploy, atualização do NewProd ou nova impressão. A fonte corrigida ainda precisa ser entregue para mudar a tela operacional. Não foi acessada uma sessão autenticada do navegador do operador; a reprodução usa o desenhador real em um ambiente isolado. Nenhum dado pessoal, conteúdo de arte ou credencial foi incluído nas fixtures ou neste documento.
