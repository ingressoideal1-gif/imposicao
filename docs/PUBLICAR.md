# Publicar o Ideal Imposition

Este é o único documento sobre publicação. Se outro texto discordar dele, o outro está
velho.

---

## As três peças

| Peça | O que é | Onde roda |
|---|---|---|
| **Site** | as telas que você abre no navegador | Vercel |
| **Motor** | quem monta o PDF e faz a imposição | Render |
| **Agente** | o `NewProd.exe` no computador da gráfica | a própria estação |

**Site e motor andam juntos.** Publicar manda os dois, porque o Render escuta o mesmo
repositório do GitHub que a Vercel. Não existe publicar só um dos dois por aqui — e é bom
que seja assim, porque eles precisam combinar.

**O agente é separado.** Tem numeração própria (`1.2.22`) e sai por outro comando.

---

## Publicar

```powershell
.\publicar.ps1 "descreva o que mudou"
```

Antes de mandar qualquer coisa, o script confere quatro pontos e mostra o resultado. Se
algo estiver errado ele **para antes do commit** — nada foi ao ar e nada precisa ser
desfeito:

1. **O que vai junto** — a lista de arquivos, com aviso em arquivo acima de 1 MB.
2. **Rascunho** — recusa `scratch_*`, `temp_*` e afins.
3. **Segredo** — recusa a chave `service_role`, que dá controle total do banco.
4. **O motor sobe** — testa se o Python carrega sem erro. É o freio que evita o pior
   caso: um erro de digitação derrubar o motor sem ninguém perceber.

Depois ele pergunta `Publicar? (s/n)`. Esse é o último freio, e é seu.

Ao terminar, grava um **ponto de restauração** com o número da versão (`v491`). É o que
torna possível voltar depois.

Para ver os pontos de restauração que existem:

```powershell
git tag -l
```

> Prefere clicar em vez de digitar? O `publicar.bat` faz a mesma coisa — ele só chama o
> `publicar.ps1`.

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

Desfaz as mudanças e republica site e motor juntos, na versão anterior. Para uma versão
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
.\publicar_agente.ps1 1.2.23 -Notas "o que mudou"
```

Para ensaiar sem publicar nada, acrescente `-Simular`: ele escreve a versão, compila,
confere tamanho e integridade, e depois devolve os arquivos ao estado anterior.

**Para voltar a versão do agente, o número precisa ser NOVO:**

```powershell
.\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22
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
| `PAROU ANTES DE PUBLICAR` | um dos quatro freios | leia a linha "O que fazer" na tela — nada foi ao ar |
| O site abre, mas dá erro em tudo | o motor não subiu no Render | veja os logs em `dashboard.render.com`; se persistir, `.\voltar.ps1` |
| A tela é a antiga mesmo depois de publicar | cache do navegador | `Ctrl+Shift+R`; se persistir, confira se a versão em `frontend/index.html` subiu |
| `O push falhou` | sem internet, ou alguém publicou antes | `git pull --rebase origin main` e publique de novo |
| `O deploy da Vercel falhou` | problema só no site — o código já foi enviado | `cd frontend` e depois `vercel --prod --yes` |
| O agente não atualiza na estação | número igual ou menor que o instalado | publique com número **maior**; veja "Publicar o agente" |
| Uma estação ficou para trás | ela checa a cada 30 minutos | menu da bandeja → **Atualizar agora** |
| `Nao ha nada para publicar` | nenhum arquivo mudou | é o esperado — não há o que publicar |

---

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
