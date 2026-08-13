# Editor de Fotos e régua de qualidade — plano

> Aprovado em conversa (13/08/2026). Fase 1: tudo local; eliminar objetos e
> completar fundo ficam para a fase da API externa, com provedor a escolher.

**Meta:** o Gerenciador de Fotos ganha uma régua de qualidade honesta
(200/300/350 dpi), desvínculo manual, interpolação de lote e um editor de foto
por pessoa — recorte, cor, nitidez, reamostragem e remoção de fundo no
navegador.

## A régua

| faixa | ação |
|---|---|
| < 200 dpi | selo vermelho no cartão (era 150) |
| 200–350 | corredor bom — nada a fazer |
| > 350 depois de enquadrada | no Gravar, reamostra para 300 no enquadramento decidido |

Interpolar para cima é opcional e de lote ("⬆ Interpolar < 200"); o cartão
marca "interpolada" porque interpolação suaviza, não inventa detalhe. A queima
350→300 acontece só no Gravar para preservar a folga de 30% da importação
durante o enquadramento.

## Tarefas

1. **Régua** — `DPI_MINIMO` 150→200; constantes `DPI_INTERP=200`,
   `DPI_TETO=350`, `DPI_QUEIMA=300` no `gerenciador-fotos.js`.
2. **Reamostragem** — o fator é `k = dpiAlvo / dpiAtual` (dpiNaJanela é linear
   no tamanho do pixel); reprocesso = canvas `imageSmoothingQuality:'high'` →
   JPEG 0.9 → hash novo → `noBanco=false`. Casos no harness.
3. **Desvincular** — botão ✕ no cartão: linha volta a "sem foto" (célula limpa,
   `__fotos[coluna]` removido), foto volta a "sobrando" preservando
   `remota`/`noBanco`; conjunto de divórcios da sessão impede o recasamento
   automático da mesma dupla.
4. **Interpolar fracas** — botão de lote: toda casada com dpi<200 reamostrada
   para 200 efetivo no enquadramento atual; `f.interpolada=true` no tooltip.
5. **Queima no Gravar** — antes do upload, casada com dpi>350 → reamostra para
   300; foto de banco sem blob é buscada por fetch (CORS do Storage), e falha
   de rede pula com aviso — nunca trava o Gravar.
6. **Editor de foto** — `frontend/editor-foto.js`, modal aberto pelo ✏️ do
   cartão: recorte com alça, girar/espelhar, brilho/contraste/saturação,
   nitidez (unsharp), auto-nível, reamostrar por dpi, voltar ao original.
   Aplicar → blob novo mantém o enquadramento, sobe no Gravar (fluxo do 🔁).
7. **Remover fundo (local)** — onnxruntime-web + modelo leve (u2netp) baixado
   uma vez e guardado no cache do navegador; compõe sobre cor escolhida
   (padrão branco). Sem modelo → botão se declara indisponível, sem quebrar o
   resto. Fora do caminho crítico da impressão.
8. **Fiação** — `editor-foto.js` nas tags de `index.html` e `producao.html` e
   em `security_config.PAINEL_ARQUIVOS` (teste `test_painel_estacao.py` cobra).
9. **Verificação** — harness (contas de reamostragem), puppeteer (selo,
   desvincular, interpolar, editor aplicar, queima no Gravar), pytest intacto.
10. **Docs** — `gerenciador_de_fotos.md`, CHANGELOG, skill se necessário.

## O que fica de fora (fase API)

Eliminar objetos e completar fundo. O gancho fica no editor ("em breve",
desabilitado), para a fase ganhar só a chamada ao provedor.
