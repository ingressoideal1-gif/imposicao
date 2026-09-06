# Publicar o Ideal Imposition

> Domínio principal: [ideal-imposition.vercel.app](https://ideal-imposition.vercel.app).
> O nome do projeto Vercel não precisa coincidir com o nome do repositório.

Este é o único documento sobre publicação. Se outro texto discordar dele, o outro está
velho.

---

## Conferir se está tudo em ordem

```powershell
.\ferramentas\conferir.ps1
```

Só consulta — não altera, não publica, não commita. Pode rodar quando quiser. Ele
responde seis perguntas: há commits não publicados? há trabalho pendente? o agente está
em sincronia? há branch ou rascunho acumulando? há segredo em arquivo versionado? os
testes passam?

Se terminar em **TUDO EM ORDEM**, não há nada esperando por você.

---

## As três peças

| Peça | O que é | Onde roda |
|---|---|---|
| **Site** | as telas que você abre no navegador | Vercel |
| **Backend** | as rotas que exigem a chave de serviço do banco | Edge Functions (Supabase) |
| **Motor** | quem monta o PDF e faz a imposição | a estação da gráfica |
| **Agente** | o `NewProd.exe` no computador da gráfica | a própria estação |

**Site e Edge Functions andam juntos.** O `publicar.ps1` sobe as funções ANTES do push,
e o push publica o site: a função chega antes da tela que aponta para ela. Não existe
publicar só um dos dois por aqui — e é bom que seja assim, porque eles precisam
combinar.

**O motor não vai a lugar nenhum.** Ele mora na estação, e é por isso que o
`publicar.ps1` só confere se ele SOBE (`import app, engine, db`) — quem o leva à
gráfica é o build do agente.

**O agente é separado.** Sua versão de código vem de `agent_version.py`; a versão
instalada nas estações e a versão disponível no manifesto de atualização devem ser
conferidas separadamente. Ele sai por outro comando.

---

## Publicar

```powershell
.\publicar.ps1 "descreva o que mudou"
```

Antes de mandar qualquer coisa, o script confere **cinco** pontos e mostra o resultado. Se
algo estiver errado ele **para antes do commit** — nada foi ao ar e nada precisa ser
desfeito:

1. **O que vai junto** — a lista de arquivos, com aviso em arquivo acima de 1 MB.
2. **Rascunho** — recusa `scratch_*`, `temp_*` e afins.
3. **Segredo** — recusa a chave `service_role`, que dá controle total do banco.
4. **O motor sobe** — testa se o Python carrega sem erro. É o freio que evita o pior
   caso: um erro de digitação derrubar o motor sem ninguém perceber.
5. **O painel abre** — passa um `node --check` em cada `.js` do frontend. Nasceu de um
   estrago real: a **v765** foi ao ar com um `}` a menos no `script.js`, e erro de
   sintaxe derruba o **arquivo inteiro** — 41 mil linhas que o navegador não carrega, e
   o painel morre. A v766 consertou três minutos depois. Custa menos de um segundo.

Depois ele pergunta `Publicar? (s/n)`. Esse é o último freio, e é seu.

Ao terminar, grava um **ponto de restauração** com o número da versão (`v491`). É o que
torna possível voltar depois.

> O script também reescreve sozinho o cabeçalho *"Versão atual: vNNN | Agente X.Y.Z"* do
> `CHANGELOG.md` da raiz, com a versão que acabou de subir. Antes disso ele era escrito à
> mão e ficou parado em v707 por onze publicações.

Para ver os pontos de restauração que existem:

```powershell
git tag -l
```

> Prefere clicar em vez de digitar? O `publicar.bat` faz a mesma coisa — ele só chama o
> `publicar.ps1`.

### Quando outra pessoa está mexendo na mesma pasta

O script commita **tudo o que mudou**, e isso é o certo no caso comum. Mas quando há duas
sessões trabalhando ao mesmo tempo, publicar leva ao ar também o que a outra deixou pela
metade — e não dá para desfazer isso sem tirar do ar junto o que foi publicado de
propósito.

Para levar só o seu:

```powershell
.\publicar.ps1 "descreva o que mudou" -Somente frontend\script.js, docs\
```

Aceita arquivo e pasta. Antes da pergunta final, o script **diz em voz alta o que ficou de
fora**, e esses arquivos continuam na pasta, intactos.

Duas coisas que o `-Somente` **não** faz: ele não pula freio nenhum — rascunho, segredo,
"o motor sobe?" e "o painel abre?" continuam valendo —, e não recorta a história: commits
já feitos vão junto de qualquer jeito, porque publicar é mandar o `main` inteiro.

O que ele leva **além** do que você declarou: as páginas que o bump da versão dos assets
mexeu, e o cabeçalho do `CHANGELOG.md`. Os dois são parte desta publicação, e ficar de
fora deixaria o arquivo mentindo na pasta.

---

## Voltar

### Está pegando fogo agora

```powershell
.\voltar.ps1 -Agora
```

Devolve **só o site** a uma versão anterior, em cerca de 30 segundos. O motor não volta.
É curativo, não correção: use quando o cliente está vendo erro *neste minuto*, e depois
faça a volta de verdade.

O script mostra os últimos deploys numerados e pergunta qual promover. **Atenção ao
escolher:** cada publicação cria **dois** deploys (um disparado pelo envio ao GitHub,
outro pelo comando da Vercel), então o item 2 costuma ser a mesma versão do item 1. Para
voltar uma versão de verdade, normalmente é o **item 3**.

Se a lista não aparecer, o caminho garantido é o painel: `vercel.com` → projeto
`ideal-imposition` → aba **Deployments** → escolha um deploy → menu `(...)` → **Promote
to Production**.

### Volta de verdade

```powershell
.\voltar.ps1
```

Desfaz as mudanças no repositório e republica o site e as Edge Functions conforme o
fluxo normal. Isso **não rebaixa automaticamente o NewProd já instalado** nas estações. Para uma versão
específica:

```powershell
.\voltar.ps1 v487
```

O script mostra o que vai ser desfeito e pergunta antes.

**Nada é apagado.** A volta vira um registro novo, então dá para voltar da volta. Se der
conflito, o script diz como desistir sem mudar nada.

---

## Publicar o agente

```powershell
.\publicar_agente.ps1 <NOVA_VERSAO> -Notas "o que mudou"
```

Para ensaiar sem publicar nada, acrescente `-Simular`: ele escreve a versão, compila,
confere tamanho e integridade, e depois devolve os arquivos ao estado anterior.

**Para voltar a versão do agente, o número precisa ser NOVO:**

```powershell
.\publicar_agente.ps1 <NOVA_VERSAO> -Codigo agente-v<VERSAO_ANTERIOR>
```

Republicar o número antigo **não faz nada**: as estações só aceitam número maior que o
delas e ignoram em silêncio — sem erro, sem mudança, e com a impressão de que funcionou.
O `-Codigo` traz o código da versão antiga; o número novo é o que faz as estações
aceitarem.

Detalhes de funcionamento em [GUIA_AGENTE.md](../GUIA_AGENTE.md).

---

## Quando dá errado

| O que você vê | Causa provável | O que fazer |
|---|---|---|
| `PAROU ANTES DE PUBLICAR` | um dos cinco freios | leia a linha "O que fazer" na tela — nada foi ao ar |
| `Erro de sintaxe no frontend: <arquivo>` | o freio 5 — o `.js` não carregaria no navegador | rode `node --check frontend\<arquivo>` para ver a linha, conserte e publique de novo |
| O site abre, mas dá erro em tudo | alguma Edge Function não subiu | `npx supabase functions list`; se persistir, `.\voltar.ps1` |
| A tela é a antiga mesmo depois de publicar | cache do navegador | `Ctrl+Shift+R`; se persistir, confira se a versão em `frontend/index.html` subiu |
| `O push falhou` | sem internet, ou alguém publicou antes | `git pull --rebase origin main` e publique de novo |
| `O deploy da Vercel falhou` | problema só no site — o código já foi enviado | `cd frontend` e depois `vercel --prod --yes` |
| O agente não atualiza na estação | número igual ou menor que o instalado | publique com número **maior**; veja "Publicar o agente" |
| Uma estação ficou para trás | ela checa a cada 30 minutos | menu da bandeja → **Atualizar agora** |
| `Nao ha nada para publicar` | nenhum arquivo mudou | é o esperado — não há o que publicar |

---

## O cache do navegador, e por que ele é assim

O `vercel.json` tem duas regras de `Cache-Control`, e elas dependem uma da outra:

| O quê | Cabeçalho | Por quê |
|---|---|---|
| **HTML** e tudo que não é `.js`/`.css` | `no-cache, no-store, must-revalidate` | O `index.html` **não tem versão na URL**. Se ele fosse cacheado, o navegador continuaria pedindo os assets da versão antiga depois de uma publicação. |
| **`.js` e `.css`** | `public, max-age=3600` | Eles carregam `?v=NNN`, e o `publicar.ps1` bumpa esse número em **toda** publicação. URL nova = arquivo novo, na hora. Dentro da hora, o navegador reaproveita — são ~1,6 MB que deixam de ser baixados a cada carregamento. |

Duas coisas sobre **onde** e **em que ordem** essas regras vivem, ambas aprendidas errando:

- **O arquivo que vale é o `frontend/vercel.json`**, não o da raiz. O `publicar.ps1` roda
  `vercel --prod` de dentro de `frontend/` (`Push-Location "$raiz\frontend"`), então é a
  configuração daquela pasta que a Vercel lê. O `vercel.json` da raiz existe e é ignorado —
  editar só ele não muda nada em produção.
- **Quando mais de uma regra casa, vale a última.** Por isso a regra geral (`/(.*)`) vem
  **primeiro** e as específicas (`.js`, `.css`) vêm **depois**. Invertendo a ordem, a geral
  sobrescreve as específicas e tudo volta a ser `no-store` — sem erro nenhum, só sem efeito.

Três coisas a não quebrar:

- **Se o HTML passar a ser cacheado, uma publicação deixa de chegar ao operador.** Foi
  justamente esse o problema que, em julho de 2026, levou alguém a pôr `no-store` em tudo —
  a marreta que resolvia o HTML e custava 1,6 MB por carregamento.
- **O bump de versão do `publicar.ps1` é o que sustenta o cache dos assets.** Ele bumpa por
  padrão (`.js?v=` e `.css?v=`), não por lista de nomes; não o troque por uma lista fixa.
- **Nem todo `.js` local é versionado.** O `supabase-config.js` e o `pdf-lib.min.js` entram
  sem `?v=`. É por isso que o teto é **1 hora** e não um ano: se um deles mudar, o erro se
  corrige sozinho dentro da hora, em vez de ficar preso no navegador do operador.

Se a tela continuar antiga depois de publicar, o `Ctrl+Shift+R` resolve na estação; se
acontecer sempre, o suspeito é o cabeçalho do HTML ter mudado.

## Onde ficam as coisas

- **Chaves e segredos:** no `.env.local`, que o git ignora. Nunca ponha chave em arquivo
  versionado.
  A chave *anônima* em `frontend/supabase-config.js` é exceção proposital — ela é pública
  por natureza, o navegador precisa dela. É por isso que o freio de segredo procura
  especificamente a `service_role`, e não "qualquer coisa que pareça uma chave".
- **Banco de dados e arquivos:** Supabase, projeto `vwbtitjlpelrcnsytzqw`.
- **Rascunhos:** pasta `rascunhos/`, fora do git.
- **Instaladores do agente:** bucket `agent-releases` no Supabase Storage.
- **Testes dos scripts de publicação:** `Invoke-Pester -Path tests` roda todos.
