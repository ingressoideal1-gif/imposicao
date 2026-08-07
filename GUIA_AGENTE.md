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

---

## 🛠️ Compilar

```powershell
.\venv\Scripts\python.exe -m PyInstaller --clean --noconfirm agent_tray.spec
.\compilar_msi.ps1
```

Gera `dist/NewProd.exe` e `dist/NewProd_Setup_vX.Y.Z.msi` (~47 MB).

> Não use `.\build_agent.ps1 2>&1`: o PyInstaller escreve logs em stderr e, no PowerShell 5.1,
> a redireção transforma cada linha em erro terminante, abortando o build.

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

> **Limite de 50 MB.** O teto de upload do projeto é 50 MB. O instalador tem ~47 MB — folga de
> apenas 3 MB. Se uma dependência nova estourar isso, as saídas são enxugar o pacote
> (`ppds` ~5 MB, `cryptography` ~10 MB), subir o teto do plano, ou baixar em partes.

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

## ✅ Checklist de release

1. [ ] Subir a versão nos quatro pontos (`agent_version.py`, `.wxs`, `compilar_msi.ps1`, spec se houver módulo novo)
2. [ ] Compilar exe + MSI
3. [ ] Conferir a `ProductVersion` dentro do MSI e o tamanho (< 50 MB)
4. [ ] Publicar MSI e depois `latest.json` no `agent-releases`
5. [ ] Baixar o manifesto **sem credencial** e conferir que o sha256 bate
6. [ ] Commitar e fazer merge na `main` — o Render passa a reportar a versão nova, e é a
       comparação com ela que dispara o banner nas estações
