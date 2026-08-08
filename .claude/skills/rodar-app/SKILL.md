---
name: rodar-app
description: Subir o Ideal Imposition localmente e dirigir o frontend num navegador headless para conferir uma mudança de verdade. Use ao pedir para rodar, iniciar ou tirar screenshot do app, ou para confirmar que algo funciona na tela e não só nos testes.
---

# Rodar o Ideal Imposition

Backend FastAPI (`app.py`) que também serve o frontend estático de `frontend/`.

## Subir o servidor

**A porta do `app.py` é 9000, não 8080.** O `iniciar_servidores.bat` anuncia 8080 — está errado, ignore.

**Nunca use a 9000 para desenvolvimento.** O `NewProd.exe` (agente de impressão instalado na máquina) escuta em `127.0.0.1:9000` e serve uma **cópia do frontend embutida no executável** — o branch `_MEIPASS` do `_FRONTEND_DIR` em `app.py`. Como `localhost` resolve para `127.0.0.1`, ele vence um uvicorn em `0.0.0.0:9000`, e você fica olhando código antigo achando que sua alteração não funcionou. Não mate o `NewProd.exe`: é o agente de produção do usuário.

Use uma porta livre:

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
(venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 9123 > /dev/null 2>&1 &)
timeout 60 bash -c 'until curl -sf http://127.0.0.1:9123/app/index.html -o /dev/null; do sleep 1; done'
```

Páginas: `/app/index.html` (app principal), `/app/producao.html`, `/app/cliente.html`. Há também um mount na raiz, então `/style.css` e `/script.js` funcionam — e é por ali que o `index.html` referencia os assets.

Parar:

```bash
PID=$(netstat -ano | grep "127.0.0.1:9123" | grep -i listening | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //PID $PID //F
```

## Dirigir o navegador

Não há `chromium-cli`. O **puppeteer** está no `node_modules` do próprio repo. Se o script driver ficar fora do repo (scratchpad), `require('puppeteer')` não resolve — aponte o caminho absoluto:

```js
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));
```

## Autenticação

O app usa Supabase e não há credenciais de teste. Para exercitar telas sem login, semeie o `window.state` e chame as funções globais direto — os scripts reais (`script.js`, `criador-arte.js`) já estão carregados na página:

```js
await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.abrirCriadorDeArte && window.fabric && window.pdfjsLib);

await page.evaluate(async () => {
  window.state = window.state || {};
  state.amostrasContainerId = 'amostras-itens-container';
  state.formatos   = [{ id: 'f1', width_mm: 180, height_mm: 50 }];
  state.cores      = [{ id: 'c1', name: 'Cor', cor_hex: '#f97316', formato_id: 'f1' }];
  state.numeracoes = [];
  state.ordens     = [{ id: 'os-1', numero: 1 }];
  state.anexosPedido = { 'os-1': [] };          // evita ida ao Supabase
  state.osItens = { 'os-1': [{ id: 'it-1', arte_url: '...', amostra_cor_id: 'c1', verso: false }] };
  await window.abrirCriadorDeArte(0, 'os-1', 'frente');
});
```

Para simular um arquivo no Storage do Supabase (URL pública com querystring), intercepte a request e responda com bytes reais — há PDFs de teste na raiz do repo, como `base_ticket.pdf`:

```js
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().startsWith('https://fake.supabase.co/')) {
    return req.respond({ status: 200, contentType: 'application/pdf',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: PDF_BYTES });
  }
  req.continue();
});
```

## Armadilhas já encontradas

- **O editor monta em `setTimeout(50)`.** Logo após `abrirCriadorDeArte()`, `window.editorState.fabricCanvas` ainda é a instância anterior. Ao testar dois cenários em sequência, guarde a instância antiga e espere aparecer uma **diferente**, senão o teste lê o canvas do cenário anterior e passa por engano.
- **Ausência de erro não é prova de que rodou.** Ao verificar a correção de um erro de inicialização, confirme um efeito positivo (um valor de cache preenchido, um rótulo que mudou do valor estático do HTML), não só o console limpo.
- **Erro de sintaxe em CSS é silencioso.** Um `{` não fechado faz o navegador descartar todo o resto do arquivo sem avisar. Se uma regra "não aplica", cheque o CSSOM antes de suspeitar da regra:
  ```js
  const ss = [...document.styleSheets].find(s => s.href?.includes('style.css'));
  console.log(ss.cssRules.length, [...ss.cssRules].pop().selectorText);
  ```
  Se a última regra não for a última do arquivo, o parser morreu antes.
- **Erro de console pré-existente e não relacionado:** `Erro ao checar print_agents no Supabase`, quando não há agente local respondendo. Não é regressão.
- **`favicon.ico` 404** — o `frontend/` não tem favicon. Cosmético.

## Publicar

Não faz parte de rodar local, mas é o passo seguinte comum: `.\publicar.ps1 "mensagem do commit"` bumpa a versão de todos os assets, commita, dá push e faz o deploy de produção na Vercel. É um deploy real — confirme com o usuário antes.
