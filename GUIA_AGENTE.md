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
