# PDF da numeração: MESCLAR COM A ARTE

Implementação na branch `feat/pdf-mesclar-arte`, criada de `origin/main`
`8d6b9137`. Checkout operacional preservado. O estado abaixo registra a conclusão
local; a preparação da publicação autorizada está ao final.

## Contrato confirmado

- Checkbox individual, exclusivo de elementos PDF. Campo JSON
  `mesclar_com_arte`, ativado somente pelo booleano `true`.
- Desmarcado ou campo ausente mantém o comportamento anterior. Nenhuma migração
  ou atualização em massa dos elementos existentes.
- Primeiro arte e elementos normais; depois PDFs marcados, na ordem relativa
  existente, cada um em multiply sobre o resultado anterior.
- Preserva opacidade, posição, tamanho, rotação, frente/verso e a composição
  existente do conjunto com a cor do papel.
- Finalidade Layout continua sendo só visualização, sem entrar na impressão.
- Os cálculos de numeração, TICKET, QR, código de barras, teatro e camarote não
  foram corrigidos ou unificados: permanecem como estavam, conforme solicitado.

## Implementação

`frontend/script.js`: checkbox, editor e miniatura, combinada do modelo e avulsa,
PDF paginado, prévia de imposição e exportação Gabarito. `frontend/cliente.js`:
combinada e PDF paginado do portal. `frontend/pedido.js`: prévia da folha, com
elementos normais de ambas as numerações antes dos PDFs marcados.

`engine.py`: ordenação estável apenas no desenho e ExtGState `/BM /Multiply`,
isolado por q/Q, com grupo de transparência e opacidade existentes. PDF continua
vetorial. O exportador PDF-lib também agrupa o PDF marcado antes de aplicar
opacidade: formas internas sobrepostas não recebem transparência em cascata.

A flag acompanha a serialização existente de `elements`, sem nova coluna ou API.
Persistência remota não foi exercitada; checkbox e ida/volta por JSON foram
verificados em navegador sintético.

## Evidências locais

- 56 testes Python: nova composição do motor e Gabarito, opacidade anterior,
  múltiplos PDFs, faces, rotação, sequencial, cut stack e multi-artes, Layout,
  vetores e formas internas sobrepostas.
- 46 verificações no Chrome: clique no checkbox, padrão desmarcado, configuração
  individual, restauração por JSON, combinadas do painel/portal/avulsa,
  PDF paginado, branco neutro, opacidade, vários PDFs e composição com a cor.
  Inclui 24 comparações de bitmap completo contra `8d6b9137`, com campo ausente
  ou false, frente/verso, rotação e opacidades 0/50/100%.
- Comparação temporária do motor anterior com o atual: bitmaps das duas faces
  idênticos para campo ausente/false; caso permanente cobre equivalência entre
  campo ausente e false.
- 13 testes adicionais: wrapper do novo navegador e regressões de numeração
  nas faces do PDF, tipos de elementos e folha combinada versus motor.
- Harnesses existentes: 41 verificações de geometria/exportação Gabarito,
  20 de frente/verso, 28 de numeração por página, 7 de bancos por modelo e
  21 níveis de opacidade de fundo/elemento em ambas as faces.
- Sintaxe dos três JS e `git diff --check` revisados.

Os testes usam PDFs e imagens sintéticos, sem rede comercial, dados reais,
Supabase ou impressora. Foram reutilizados Python/pytest e Puppeteer já
instalados em outros checkouts; nenhuma dependência foi instalada.

Para executar a comparação opcional do navegador, definir `PDF_MESCLAR_BASE`
como `8d6b9137` e executar `node tests/pdf_mesclar_browser_harness.js` com
Puppeteer disponível via resolução normal do Node ou `NODE_PATH`.

## Entrega e retomada

O código está pronto para revisão local. Para disponibilizar todas as saídas,
será necessário publicar o frontend e atualizar o agente com o novo motor.
Agente antigo não interpreta a flag. Nenhuma publicação, build de instalador,
instalação ou impressão física foi executada nesta tarefa.

Desmarcar a opção e salvar a numeração restaura a composição anterior do
elemento. Como não há migração de dados, não existe SQL de reversão.

## Preparação da publicação autorizada

O usuário autorizou publicar em 28/09/2026. Versões preparadas: web **v970** e
NewProd **1.2.343**. Conferência atualizada: **147 testes passaram**, além dos
harnesses de opacidade, Gabarito, paginação e bancos por modelo.

PyInstaller e WiX concluídos. O bytecode do motor empacotado corresponde à fonte;
os seis assets principais do painel embutido são idênticos aos arquivos locais.
Verificados versão, módulo de publicação e três DLLs de impressão.

- MSI: `NewProd_Setup_v1.2.343.msi`.
- ProductVersion: `1.2.343.0`.
- Tamanho: `156192768` bytes, abaixo do limite consultado de `209715200`.
- SHA-256: `ce8d0993a1c449ab62c95799be4db5792562ca42429d5521716d161e24cd1820`.
- O nome novo estava ausente no bucket no preflight; o manifesto anterior era
  1.2.342. Ativação condicionada ao download público e conferência do MSI.

Backup, manifesto anterior e provas de build em
`C:\ProjectBackups\pdf-mesclar-20260928-1790630091841`.
Não instalar automaticamente em estação nem declarar impressão física com base
na disponibilidade do instalador.
