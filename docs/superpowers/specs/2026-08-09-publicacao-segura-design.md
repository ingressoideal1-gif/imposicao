# Publicação segura: freios, ponto de restauração e volta

**Data:** 2026-08-09
**Estado:** aprovado, aguardando implementação

## O problema

O projeto publica em produção com um comando (`publicar.ps1`) que não confere nada,
não deixa marca do que foi publicado e não tem caminho de volta. Quem opera está
aprendendo desenvolvimento agora, então cada armadilha do processo atual custa caro:
o erro só aparece quando o cliente vê, e desfazer exige conhecimento de git que
ainda não existe.

Cinco buracos concretos, todos verificados no repositório em 2026-08-09:

1. **Não existe ponto de retorno.** `git tag` retorna vazio. Nada liga a versão
   `v490` que está no ar a um commit específico. Voltar exige caçar commit à mão.
2. **`git add -A` publica a pasta inteira.** A raiz tem 169 arquivos versionados,
   dos quais cerca de 100 são rascunho (`scratch_*`, `temp_*`, `patch_*`,
   `test_debug*.js`, `diff.txt` com 766 KB). Uma edição pela metade sobe junto.
3. **O push publica o motor junto, sem avisar.** O Render escuta o repositório;
   `git push origin main` redeploya o backend. O script fala só em Vercel.
4. **Voltar o agente republicando o MSI antigo não funciona.**
   `agent_worker.consultar_manifesto()` só instala quando a versão do manifesto é
   **maior** que a local. Republicar a 1.2.22 é silenciosamente ignorado por todas
   as estações.
5. **Nenhuma conferência antes de subir.** Um erro de sintaxe em `app.py` passa
   direto; o Render falha a build e o motor fica na versão anterior sem aviso.

Fora do escopo do problema, mas confirmado durante o levantamento: `git fsck`
não acusa corrupção (só *dangling commits*, que são normais), e as 7 branches
locais estão todas incorporadas na `main`.

## O modelo mental

Três artefatos são publicados, e saber quais andam juntos é metade da segurança:

| Peça | Onde roda | Publicada por | Volta |
|---|---|---|---|
| **Site** (telas, `frontend/`) | Vercel | `publicar.ps1` | `vercel rollback` ou revert+republicar |
| **Motor** (`app.py`, `engine.py`, `db.py`) | Render, `imposicao.onrender.com` | o mesmo `git push origin main` | revert+republicar |
| **Agente NewProd** (`NewProd.exe`) | estação Windows da gráfica | `publicar_agente.ps1` | número **novo** com código antigo |

Site e motor são gêmeos: saem no mesmo push, voltam no mesmo revert. O agente é
independente, tem versionamento próprio (`1.2.22` hoje) e regra de volta própria.

---

## Fase 1 — Rede de segurança

Nada na rotina muda nesta fase. O objetivo é que exista para onde voltar **antes**
de qualquer mudança nos scripts.

### 1.1 Marcar o estado atual

Criar a tag anotada `v490` no commit `2dac724` (o estado que está no ar hoje),
com mensagem registrando que é o marco inicial do processo. Empurrar com
`git push origin v490`.

A partir daí, toda publicação cria a tag correspondente automaticamente (Fase 2).

### 1.2 Faxina da raiz

Sem isto o freio de rascunho da Fase 2 dispararia em toda publicação, e um alarme
que sempre toca é um alarme que se aprende a ignorar.

Três destinos, e a regra de cada um:

- **`rascunhos/`** — fora do git (entra no `.gitignore`). Recebe o que foi escrito
  para resolver um problema pontual e não tem mais uso: `scratch_*`, `temp*`,
  `patch_*`, `check_*`, `fix_*`, `diag_engine.py`, `diag2.py`, `test_debug*.js`,
  `test.js`, `test.py`, `test2-5.py`, `test-fetch.js`, `test_api*.js`,
  `test_browser.js`, `test_col.js`, `test_final.js`, `test_pdf.js`, `diff.txt`,
  `build_log.txt`, `mangled.txt`, `py_out.txt`, `test_out.txt`, `scratch_func.txt`,
  `snapshot.jpg`, `engine_backup.py`, `imposition.db` e `local_db.sqlite` (ambos
  com 0 byte), `read_pdf.py`, `poll_render.py`, `find_tipos.py`, `move_tipos.ps1`,
  `update_engine.py`, `fix_header.js`, `fix_table.js`.
- **`tests/`** — continua no git. Recebe o que exercita o motor de verdade e pode
  ser rodado de novo: `test_engine_dual_vdp.py`, `test_engine_rotation.py`,
  `test_impose.py`, `test_pdf_duplex.py`, `test_pdf_multiple.py`,
  `test_pdf_offset_cropbox.py`, `test_multi_artes.py`, `test_multi_artes_capa.py`,
  `test_mapa.py`, `test_render.py`, `test_local.py`, `test_gen.py`, `test_capa.py`,
  `test_db.py`, `test_diag.py`, `test_fastapi.py`, `test_enc_front.py`,
  `run_impose.py`, `teste_dados.csv`.
- **`sql/`** e **`scripts/migracoes/`** — continuam no git. Recebem,
  respectivamente, os `schema*.sql`, `alter_*.sql`, `rls_fase1_catalogo.sql`,
  `criar_bucket_previews.sql`, `migration_data.sql`; e os `migrate_*.py`,
  `migrar_previews_para_storage.py`, `add_pc_fonts.py`, `add_popular_fonts.py`.
  São a história do banco e podem ser precisos de novo.

A remoção do git usa `git rm --cached`: o arquivo **sai do controle de versão e
continua no disco**, dentro de `rascunhos/`. Nada é apagado, e o histórico
completo permanece acessível pela tag `v490`.

Os padrões correspondentes entram no `.gitignore` para que rascunho novo não
volte a ser versionado.

Fica na raiz, sem mudança, tudo que é código de produção (`app.py`, `engine.py`,
`db.py`, `main.py`, `security_config.py`, `font_cache.py`, `ppd_parser.py`,
`print_service.py`, `utils_generator.py`, `local_print_agent.py`), o conjunto do
agente (`agent_*.py`, `agent_installer.wxs`, `agent_tray.spec`, `agent_icon.ico`,
`installer.iss`, `license.rtf`, `compilar_*.ps1`, `build_agent.ps1`), os scripts
de operação (`iniciar_servidores.bat`, `Encerrar_Servidor.bat`,
`Iniciar_Servidor.vbs`, `Liberar_Firewall.bat`, `Diagnostico_Fontes.ps1`), a
configuração (`render.yaml`, `vercel.json`, `package.json`, `requirements.txt`,
`formats_db.json`, `firestore.rules`) e os documentos `.md`.

### 1.3 Apagar as branches antigas

As 7 branches locais e as 5 remotas já estão dentro da `main` — verificado com
`git branch --merged main`. Apagar todas, local e remotamente. O que elas contêm
já está na `main` e continua acessível pelo histórico.

---

## Fase 2 — `publicar.ps1` com freios, e `voltar.ps1`

### 2.1 Freios antes de publicar

`publicar.ps1` continua sendo um comando só e mantém tudo que já faz (subir o
`?v=` de todo asset em `frontend/*.html`, commitar, empurrar, deploy na Vercel).
Ganha, **antes** de qualquer escrita, cinco conferências. Qualquer falha aborta
antes do commit — nada foi ao ar, nada precisa ser desfeito.

1. **Inventário do que vai junto.** Lista os arquivos que o commit incluiria,
   destacando arquivo novo na raiz e arquivo acima de 1 MB.
2. **Rascunho.** Aborta se algum arquivo a ser commitado casar com os padrões de
   rascunho definidos na Fase 1.2 — a rede que pega o rascunho criado depois da
   faxina e adicionado ao git por engano.
3. **Segredo.** Aborta se o conteúdo a ser commitado contiver `service_role` ou
   `SUPABASE_SERVICE_KEY`, ou um JWT (`eyJ...`) cujo payload, decodificado de
   base64, contenha `"role":"service_role"`. A `service_role` key dá controle
   total do banco.

   A regra é essa, e não "qualquer `eyJ`", por um motivo concreto: a chave
   **anônima** do Supabase também é um JWT e está legitimamente versionada em
   `frontend/supabase-config.js` — ela é pública por natureza, o navegador
   precisa dela. Um freio que barrasse todo `eyJ` dispararia em toda alteração
   daquele arquivo, e um alarme que sempre toca vira um alarme ignorado.
4. **O motor sobe.** Roda `python -c "import app, engine, db"` no `venv`. Custa
   ~2 s e pega a pior falha possível: backend quebrado publicado em silêncio.
5. **Confirmação.** Mostra a mensagem do commit, a versão nova e avisa em uma
   linha que **site e motor vão juntos**; pergunta `Publicar? (s/n)`.

Depois de publicar com sucesso, cria e empurra a tag `vNNN` (`v491`, `v492`, …)
no commit recém-criado. A mensagem da tag registra a mensagem do commit e a data.

Um parâmetro `-SemFreio` existe para emergência, e imprime um aviso ao ser usado.
O `publicar.bat` passa a apenas chamar o `publicar.ps1`, para que não existam duas
lógicas de publicação divergindo com o tempo.

### 2.2 `voltar.ps1` — dois níveis

**Freio de mão:** `.\voltar.ps1 -Agora`. Executa `vercel rollback` (CLI 54.10.3,
confirmada) e devolve **só o site** ao deploy anterior, em cerca de 30 segundos.
O script diz explicitamente, ao terminar, que o motor **não** voltou e que o
código do git segue adiantado — é curativo para o cliente parar de ver erro
agora, não a correção.

**Volta de verdade:** `.\voltar.ps1` sem argumento. Descobre a tag anterior à
última, faz `git revert --no-commit` do intervalo, commita como
`revert: volta para vNNN`, e chama o `publicar.ps1` — o que republica site e
motor juntos e consistentes. `.\voltar.ps1 v487` volta para uma tag específica.

Volta é `revert`, nunca `reset --hard`: nada é apagado, a volta vira um commit
novo e dá para voltar da volta.

O script lista as últimas tags e pede confirmação antes de agir.

---

## Fase 3 — `publicar_agente.ps1`

O release do agente está corretamente descrito no `GUIA_AGENTE.md`, mas depende de
o operador acertar o número da versão em quatro arquivos e respeitar uma ordem de
upload que, invertida, quebra todas as estações. Documentação não impede erro de
digitação.

`.\publicar_agente.ps1 1.2.23` executa a lista inteira:

1. Escreve a versão em `agent_version.py` (`AGENT_VERSION`),
   `agent_installer.wxs` (`Version="1.2.23.0"`) e `compilar_msi.ps1` (nome do
   `.msi`). Aborta se algum dos três não for encontrado no formato esperado.
2. Aborta se a versão informada não for maior que a atual — a comparação é a
   mesma de `agent_version.como_tupla()`, que é a que o agente usa.
3. Compila `dist/NewProd.exe` e `dist/NewProd_Setup_v1.2.23.msi`.
4. Confere que o MSI tem menos de 50 MB (teto de upload do projeto; o pacote tem
   ~47 MB hoje) e que a `ProductVersion` dentro dele bate com a informada.
5. Sobe o MSI para o bucket `agent-releases`, usando a `SUPABASE_SERVICE_KEY` do
   `.env.local`.
6. **Baixa o MSI de volta pela URL pública simples** — a mesma que o agente usa —
   e confere o sha256. Aborta se não bater.
7. Só então publica o `latest.json` com `version`, `url`, `sha256`, `size` e
   `notes`.
8. Commita as mudanças de versão e cria a tag `agente-v1.2.23`.

A ordem 5 → 6 → 7 é obrigatória: assim o manifesto nunca aponta para um arquivo
ausente ou corrompido. O nome do arquivo nunca é reaproveitado, porque o CDN da
Cloudflare continuaria servindo o binário anterior e o sha256 do manifesto não
bateria — todas as estações recusariam a instalação.

`-Simular` executa tudo menos os passos 5, 7 e 8, para experimentar sem risco.

**Voltar a versão do agente** é `.\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22`:
compila a partir do código da tag antiga e publica com número **novo**. O script
implementa esse parâmetro e o `GUIA_AGENTE.md` ganha a explicação de por quê —
republicar o MSI antigo com o número antigo é ignorado por todas as estações.

---

## Fase 4 — `docs/PUBLICAR.md`

Um documento só, escrito para quem está aprendendo, contendo: o que é cada peça e
onde mora; como publicar; como voltar nos dois níveis; como publicar o agente; e
uma tabela de sintoma → causa provável → o que fazer.

Ele substitui os dois `DEPLOY.md` de hoje, que se contradizem: o da raiz descreve
Supabase + Vercel + Render (correto) e o `docs/DEPLOY.md` descreve Firebase +
Hosting (obsoleto). Dois manuais que discordam são piores que nenhum. O
`docs/DEPLOY.md` é apagado; o da raiz vira um ponteiro de uma linha para o novo.

O `GUIA_AGENTE.md` **não** é substituído: ele documenta o funcionamento interno do
agente, que continua válido. Ganha apenas a seção de como voltar a versão e uma
referência ao `publicar_agente.ps1` no lugar da lista manual.

---

## Como isto é verificado

Nenhuma verificação toca a produção.

- **Freios (Fase 2.1):** criar o problema de propósito numa cópia do repositório
  no scratchpad — um arquivo com `SUPABASE_SERVICE_KEY=eyJ...` falsa, um
  `scratch_x.py` rastreado, um erro de sintaxe em `app.py` — e confirmar que o
  script recusa cada um com a mensagem certa, sem commitar.
- **`voltar.ps1`:** exercitar o caminho de `git revert` numa branch descartável
  criada para o teste e apagada depois, conferindo que o conteúdo dos arquivos
  volta ao da tag alvo. O `-Agora` é conferido apenas na leitura da saída de
  `vercel rollback --help`, sem executar.
- **`publicar_agente.ps1`:** `-Simular` do começo ao fim, conferindo que a versão
  foi escrita nos três arquivos, que o MSI foi gerado com a `ProductVersion`
  correta e abaixo de 50 MB, e que nada foi enviado ao bucket.
- **Faxina (Fase 1.2):** depois de mover, rodar `python -c "import app, engine, db"`,
  subir o app local e abrir o painel — o que confirma que nada movido era
  necessário em tempo de execução.

## O que fica de fora, de propósito

- **GitHub Actions / CI.** Adiciona uma segunda máquina para entender e depurar.
  Os freios locais resolvem o mesmo problema com uma peça a menos.
- **Ambiente de teste permanente (staging).** Dobra o custo e a superfície de
  configuração. Se a necessidade aparecer, o deploy de preview da Vercel já é
  suportado pelo `ALLOWED_ORIGIN_REGEX` em `security_config.py`.
- **Reescrever o histórico do git** para remover os rascunhos do passado. Risco
  alto, ganho estético. Eles saem do presente; o passado fica como está.
- **Rollback automático do Render por script.** A API exigiria mais um segredo na
  máquina. O `voltar.ps1` cobre o caso pelo republish, e o painel do Render cobre
  a emergência.
