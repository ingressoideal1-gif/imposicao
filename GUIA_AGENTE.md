# ⚡ Guia: Agente Local Windows (NewProd Agent)

O **NewProd Agent** roda no computador da gráfica (Windows). Ele processa as imposições
pesadas de PDF localmente — poupando banda e tempo de nuvem — e envia os arquivos gerados
para as impressoras físicas configuradas.

O executável distribuído (`NewProd.exe`) é gerado a partir do **`agent_tray.py`**, que sobe
o **`app.py`** em `127.0.0.1:9000`. O `local_print_agent.py` só é usado em desenvolvimento.

---

## 🔒 Escopo de rede

O agente escuta **apenas em `127.0.0.1`**. Cada operador imprime na própria máquina, então
ele não aceita conexões da LAN.

Versões até a 1.2.3 escutavam em `0.0.0.0` e abriam a porta 9000 no firewall a cada boot.
A partir da 1.2.4 o agente **remove** essa regra automaticamente ao iniciar. Se precisar
limpar manualmente:

```powershell
netsh advfirewall firewall delete rule name="NewProd Agent"
```

---

## 🚀 Rodar em desenvolvimento

```powershell
venv\Scripts\Activate.ps1
python local_print_agent.py     # porta 9000
```

O frontend na nuvem detecta o agente em `http://127.0.0.1:9000` e direciona imposição e
impressão para a máquina local.

Em modo desenvolvimento o auto-update é ignorado (só roda no executável compilado).

---

## ⚠️ O que persiste na estação (leia antes de "corrigir" um dado)

Estes arquivos ficam **ao lado do executável**, em `%LOCALAPPDATA%\NewProd Agent\`,
e o MSI **nunca os substitui** — ele instala apenas o `NewProd.exe`:

| Arquivo | Conteúdo |
|---|---|
| `formats_db.json` | catálogo de formatos, numerações, cores **e fontes** |
| `print_configs.json` | configuração de impressão por produto, desta estação |
| `agent_config.json` | identidade do agente (`AGENT_ID`) |
| `fonts_cache/` | fontes baixadas do Storage |

**Corrigir o arquivo no repositório não corrige o agente instalado.** Uma migração
de dado só chega à estação se for **código que roda lá** — ver
`_migrar_fontes_para_storage()` em `db.py`, chamada no `init_db()`.

Isso já causou uma regressão em produção: as fontes foram migradas para o Storage
no repositório, mas as estações continuaram com o catálogo antigo apontando para
`/fonts_local`, pasta que deixara de ser empacotada. O sintoma foi fonte errada na
tela e no PDF, sem erro visível.

---

## 🩺 Diagnóstico remoto

O heartbeat leva o estado da estação em `print_agents.printers_json`:

```json
"version": "1.2.17",
"fontes": { "cache_arquivos": 270, "cache_mb": 142.8,
            "catalogo_total": 316, "catalogo_relativas": 0,
            "catalogo_gstatic": 0, "catalogo_storage": 316,
            "storage_alcancavel": true }
```

Como ler:

| Sinal | Significa |
|---|---|
| `catalogo_relativas` ou `catalogo_gstatic` > 0 | a migração não rodou naquela máquina |
| `cache_arquivos` muito abaixo do catálogo | sync incompleto, ou em andamento |
| `storage_alcancavel: false` | **a rede daquela estação não alcança o Supabase** |
| `version` desatualizada | ver a seção de auto-update |

Para investigar na própria máquina, existe o `Diagnostico_Fontes.ps1` na raiz do
projeto — só consulta, não altera nada.

---

## 🔢 Versão: quatro pontos que precisam bater

Este é o erro mais fácil de cometer. O número aparece em quatro lugares e **todos** precisam
ser atualizados juntos:

| Arquivo | O que é |
|---|---|
| `agent_version.py` | `AGENT_VERSION` — fonte única do lado Python (`app.py` e `local_print_agent.py` derivam dela) |
| `agent_installer.wxs` | `Version="X.Y.Z.0"` — o Windows usa isto para decidir se o upgrade se aplica |
| `compilar_msi.ps1` | nome do arquivo `.msi` gerado |
| `agent_tray.spec` | só se houver módulo Python novo, em `hiddenimports` |

Se o `Version` do MSI não subir, o Windows entende que já está instalado e **pula a
atualização**. Se o `AGENT_VERSION` não subir, o auto-update nunca detecta a versão nova.

> O `publicar_agente.ps1` escreve os **três primeiros** automaticamente e falha se não
> encontrar o padrão esperado em algum deles — errar um em silêncio é pior que parar.
> O `agent_tray.spec` continua manual: ele só muda quando entra um módulo Python novo.

---

## 🛠️ Compilar

```powershell
.\venv\Scripts\python.exe -m PyInstaller --clean --noconfirm agent_tray.spec
.\compilar_msi.ps1
```

Gera `dist/NewProd.exe` e `dist/NewProd_Setup_vX.Y.Z.msi` (~47 MB).

> **Não redirecione os fluxos de saída do build.** O PyInstaller escreve seus logs em
> stderr mesmo quando dá tudo certo e, no PowerShell 5.1, qualquer redireção transforma
> cada linha em erro terminante e aborta o build. Vale para `2>&1`, para `*>` e para
> `*> arquivo.log` — não só para a forma clássica. Se precisar do log, deixe o comando
> escrever na tela e copie de lá.

**Módulo Python novo?** Adicione em `hiddenimports` no `agent_tray.spec`. O spec lista os
módulos locais explicitamente — sem isso o executável quebra com `ImportError` em produção.

### Por que o instalador tem ~47 MB e não 125 MB

As 222 fontes TTF do catálogo ficam no bucket `fontes` do Supabase, não dentro do binário.
O `agent_tray.spec` empacota o `frontend` **sem** a pasta `fonts_local`.

O `font_cache.py` baixa cada fonte uma vez por máquina e guarda em
`%LOCALAPPDATA%\NewProd Agent\fonts_cache`, então a imposição continua funcionando offline
depois do primeiro uso de cada fonte.

⚠️ Se alguma fonte voltar a ter `arquivo_url` relativo (`/fonts_local/...`) no
`formats_db.json`, ela **não** estará no executável e a imposição falhará para ela.
Fontes novas devem ser enviadas ao bucket e registradas com URL absoluta.

---

## 📦 Publicar um release

Os arquivos ficam no bucket **`agent-releases`** (Supabase Storage), com leitura pública e
**escrita bloqueada por RLS**:

```
agent-releases/
├── latest.json                   ← manifesto lido pelos agentes
└── NewProd_Setup_vX.Y.Z.msi      ← instalador
```

Publicar exige a **`service_role` key** (Project Settings → API), colocada no `.env.local`:

```
SUPABASE_SERVICE_KEY=eyJ...
```

O `.env.local` está no `.gitignore` — confirme com `git check-ignore -v .env.local` antes de
salvar qualquer segredo ali.

Formato do manifesto:

```json
{
  "version": "1.2.5",
  "url": "https://<projeto>.supabase.co/storage/v1/object/public/agent-releases/NewProd_Setup_v1.2.5.msi",
  "sha256": "8a7a7223...",
  "size": 49045504,
  "notes": "descrição curta"
}
```

**Ordem obrigatória:** subir o MSI → conferir o sha256 baixando pela URL pública → só então
publicar o `latest.json`. Assim o manifesto nunca aponta para um arquivo ausente ou corrompido.

> ⚠️ **Nunca reaproveite o nome do arquivo.** O Storage fica atrás do CDN da Cloudflare: se
> você reconstruir e subir de novo com o mesmo nome, a borda continua servindo o binário
> anterior por um tempo (`cf-cache-status: HIT`), enquanto a origem já tem o novo. O manifesto
> apontaria um sha256 que não bate com o que os agentes baixam, e **todos recusariam a
> instalação**. Precisou refazer o build? **Suba a versão.**
>
> Pelo mesmo motivo o agente busca o `latest.json` com `?t=<timestamp>`: sem isso ele ficaria
> cego a um release novo até a borda expirar. O MSI não precisa, desde que o nome mude a cada
> versão. A conferência do MSI é feita pela URL **simples**, de propósito — é a que o agente
> usa, e é ela que precisa bater.

> ✅ **Limite de upload: 200 MB** (bucket `agent-releases`), verificado em 2026-08-09. O
> build atual gera ~51 MB, então há folga larga. O `publicar_agente.ps1` **pergunta o
> limite ao bucket** antes de compilar — não o tem gravado no código, justamente porque
> esse número já mudou uma vez.

### Como o limite funciona (isto já custou tempo)

São **dois** limites, e o menor vence:

| Onde | Valor em 2026-08-09 |
|---|---|
| Global do projeto (Storage → Settings) | 300 MB |
| Bucket `agent-releases` | **200 MB** ← o que vale |

O limite por bucket **nunca pode ultrapassar o global**. Enquanto o global esteve em
50 MB (teto do plano Free), o bucket exibia 200 MB no painel e mesmo assim recusava
envios acima de 50 MB — a configuração do bucket aparece, mas não vale. O sintoma é:

```
HTTP 400  {"statusCode":"413","error":"Payload too large",
           "message":"The object exceeded the maximum allowed size",
           "code":"EntityTooLarge"}
```

**Se aparecer esse erro, olhe o global primeiro, não o bucket.** Medido por envios reais
depois do global subir: 55 MB e 120 MB passam, 250 MB é recusado — coerente com o teto de
200 MB do bucket.

> Cuidado para não confundir buckets: existe um chamado **`NewProd`**, que **nada no
> projeto usa**. Os instaladores vão para o **`agent-releases`**. Mudar o limite do
> `NewProd` não tem efeito nenhum sobre o release do agente.

### O que estourou o orçamento: o SVG

Comparando o `NewProd.exe` **publicado na 1.2.22** com o que a máquina compila hoje
(medido dentro do executável, já comprimido — que é o número que conta):

| grupo | 1.2.22 | depois do SVG | diferença |
|---|---:|---:|---:|
| `lxml` | **0,00** | 3,32 | **+3,32** |
| runtime + módulos puros | 16,25 | 17,76 | +1,51 |
| `ppds` | 0,66 | 0,00 | −0,66 |
| **total** | **46,54** | **50,74** | **+4,19** |

O `lxml` **não existia** até a 1.2.22. Ele entrou com o `svglib`, quando os elementos SVG
foram implementados. Somado à parte Python do `svglib` no runtime, o recurso custou
~4,8 MB ao agente — e é isso, e não crescimento gradual, que rompeu o teto.

### Composição atual e o que se pode cortar

| MB | O quê | Dá para cortar? |
|---:|---|---|
| 17,5 | runtime do Python + módulos puros | não |
| 16,6 | `pymupdf` (fitz) | não — é o motor de PDF |
| 6,4 | `PIL` | não — usado pelo tray e pelo engine |
| 3,3 | `lxml` | **NÃO** — vem do `svglib`, obrigatório para impor SVG |
| 1,8 | `pydantic_core` | não — o FastAPI depende |
| 0,7 | `frontend` | não |

O `cryptography` (3,4 MB) chegou a ser excluído no `agent_tray.spec` e depois **a exclusão
foi desfeita**, no mesmo dia, quando o limite subiu para 200 MB. Vale registrar a análise
para quando o espaço apertar de novo:

- Nenhum arquivo do projeto importa `cryptography`.
- O único caminho que o alcançaria, em `requests/__init__.py`, só executa quando
  `ssl.HAS_SNI` é falso — aqui é `True` (OpenSSL 3.0.20) — e ainda está dentro de um
  `try/except ImportError`.
- O `requests/help.py` também protege o import; o `urllib3` usa o módulo `ssl` da
  biblioteca padrão, e o backend `pyopenssl` é opcional e não é injetado.
- Medido: a exclusão leva o MSI de 50,98 para **47,35 MB**.

> Se voltar a excluir, **confirme numa estação** que o agente continua alcançando o
> Supabase — uma fonte nova baixando e o heartbeat aparecendo no painel bastam. A análise
> é sólida, mas TLS quebrado é o tipo de falha que só aparece na máquina do cliente. Foi
> por não valer esse risco por 3,4 MB, com ~150 MB de folga disponível, que a exclusão foi
> desfeita.

### Duas lições, para não repetir tentativas

- **Tamanho em disco não é tamanho no pacote.** A pasta `ppds/` tinha 5,19 MB de
  temporários e removê-la economizou só **0,65 MB** — o conteúdo era altamente
  compressível. Meça dentro do `.exe`, nunca na pasta de origem.
- **`lxml` parece órfão e não é.** Nenhum arquivo do projeto o importa, mas ele chega
  pelo `svglib`. Removê-lo faria o SVG deixar de sair no papel — a mesma falha silenciosa
  corrigida na v489.

### Se a folga acabar de novo

Com o teto em 200 MB e o pacote em ~51 MB, sobram cerca de 150 MB — não é uma preocupação
hoje. Se um dia voltar a apertar, na ordem: subir o limite do bucket (o global permite até
300 MB), depois excluir o `cryptography` conforme a análise acima.

**Não** tente hospedar o MSI fora do Storage sem pensar duas vezes: a barreira
`is_allowed_release_url()` está **compilada nos agentes já instalados**, então eles
recusariam um manifesto apontando para outro host, e seria preciso reinstalar todas as
estações à mão.

---

## 🔄 Como funciona o auto-update

Modelo **pull**: o agente consulta sozinho um manifesto de endereço fixo, compilado no
binário. Nada externo escolhe o que ele baixa.

```
agent_worker.run_loop()
   ├─ 1 min após iniciar, depois a cada 6 h
   ├─ GET  <MANIFEST_URL>            ← constante em security_config.py
   ├─ versão do manifesto > a minha? senão, dorme
   ├─ a URL do MSI está dentro de agent-releases?     (2ª barreira)
   ├─ baixa → confere o sha256                        (3ª barreira)
   └─ script .bat: encerra o agente → msiexec /qn → reinicia
```

O `.bat` é necessário porque o MSI não substitui o executável em uso e o pacote não tem
`CloseApplication` configurado.

O endpoint `POST /api/update` **não aceita parâmetro** — apenas dispara a checagem
imediatamente. O botão "Atualizar Agora" do frontend continua funcionando: o corpo que ele
envia é ignorado.

### Formas de forçar a atualização

| Caminho | Quando usar |
|---|---|
| Menu da bandeja → "Verificar atualizacoes" / "Atualizar agora" | a partir da 1.2.13 |
| Botão ao lado da versão no rodapé do painel | a partir da 1.2.13 |
| Banner "Atualizar Agora" ao abrir o painel | a partir da 1.2.15 |
| Reiniciar o agente | qualquer versão — ele checa 60 s após subir |
| Abrir `https://ideal-imposition.vercel.app` na estação | quando o painel local é antigo demais |

O intervalo automático é de **30 minutos** (`INTERVALO_UPDATE_S`). Era 6 h, e num dia
de correção cinco versões saíram dentro de uma única janela — as estações ficaram
cegas a todas.

> O banner comparava com `fetch('/api/version')`, URL **relativa**: servida pelo próprio
> agente, ela resolvia para ele mesmo e o aviso nunca aparecia na estação. Hoje a
> comparação é com o manifesto. Se mexer nisso, não volte a usar caminho relativo.

### Não tem auto-update quem está abaixo da 1.2.5

Estações em versões anteriores **precisam do MSI instalado à mão** uma vez. Não há
caminho remoto: o agente antigo escuta em `0.0.0.0` mas não conhece o manifesto.

> **Histórico:** até a 1.2.3 esse endpoint recebia a URL de download no corpo da requisição.
> Qualquer site aberto no navegador do operador podia mandar o agente baixar e executar um
> binário arbitrário. Não reintroduza parâmetro de origem nesse endpoint.

---

## 💿 Instalar manualmente

Necessário na primeira vez e sempre que a estação estiver numa versão **anterior** à que
introduziu o auto-update (1.2.5). Não precisa de administrador — a instalação é `perUser`,
em `%LOCALAPPDATA%`.

```powershell
taskkill /IM NewProd.exe /F          # o MSI não substitui o exe em uso
msiexec /i NewProd_Setup_vX.Y.Z.msi  # ou duplo-clique
```

O `MajorUpgrade` do pacote desinstala a versão anterior automaticamente — não é preciso
remover à mão.

### Conferir se a estação ficou correta

```powershell
# 1. versão
(Invoke-WebRequest http://127.0.0.1:9000/api/status).Content

# 2. bind — precisa ser 127.0.0.1:9000, NUNCA 0.0.0.0:9000
netstat -ano | Select-String ":9000.*LISTENING"

# 3. firewall — deve dizer que nenhuma regra corresponde
netsh advfirewall firewall show rule name="NewProd Agent"
```

A checagem 2 é a decisiva: `0.0.0.0` significa que a versão antiga ainda está rodando.

---

## ✅ Publicar um release

```powershell
.\publicar_agente.ps1 1.2.23 -Notas "corrige a fonte no verso"
```

O script executa a lista inteira e **para** no primeiro passo que falhar:

1. Recusa versão que não seja maior que a atual — com a mesma comparação numérica que o
   agente usa (`agent_version.como_tupla()`), para que `1.2.9` não passe por maior que
   `1.2.22`.
2. Escreve o número em `agent_version.py`, `agent_installer.wxs` e `compilar_msi.ps1`.
3. Compila o executável e o MSI.
4. Confere o tamanho (< 50 MB).
5. Sobe o MSI para o `agent-releases`.
6. **Baixa de volta pela URL pública** — a mesma que o agente usa — e confere o sha256.
7. Só então publica o `latest.json`.
8. Commita, cria a tag `agente-v1.2.23` e empurra.

A ordem 5 → 6 → 7 é a razão de o script existir: invertida, o manifesto aponta para um
arquivo ausente ou corrompido e **todas** as estações recusam a instalação.

Use `-Simular` para executar tudo menos os envios, o commit e a tag. As seções acima
continuam descrevendo o processo manual, para quando for preciso entender ou depurar o
que o script faz.

## ⏮️ Voltar a versão do agente

**Republicar o MSI antigo com o número antigo não faz nada.** O agente só instala versão
**maior** que a dele, então todas as estações ignoram — e o sintoma é o pior possível:
nenhum erro, nenhuma mudança, e a impressão de que o release funcionou.

Voltar é compilar o código antigo com um número **novo**:

```powershell
.\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22
```

O `-Codigo` traz os arquivos do agente daquela tag; o `1.2.24` é o número que faz as
estações aceitarem. O resultado é a 1.2.22 rodando sob o nome 1.2.24.
