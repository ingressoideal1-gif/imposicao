# Status do Projeto — Ideal Imposition

**Última atualização: 15 de agosto de 2026, madrugada**

Este documento diz onde o projeto está **hoje** e por onde continuar. Se você está
retomando depois de um tempo, comece por aqui.

---

## O que está no ar

| | Versão | Publicado em |
|---|---|---|
| Site + motor | **v578** | 15/08/2026 |
| Agente NewProd | **1.2.77** | 15/08/2026 |

As estações checam atualização a cada 30 minutos. Para adiantar numa delas: menu da
bandeja → **Atualizar agora**.

**O controle de acesso está inteiro no servidor — as quatro variáveis.** Conferido em 14/08
contra o Render, não assumido:

```
GET /api/acesso/saude  →  200
{"ok":true,"variaveis":{"SUPABASE_SERVICE_KEY":true,"ACESSO_AGENTE_SEGREDO":true,
 "QR_PEDIDO_SEGREDO":true,"ACESSO_ELEVACAO_SEGREDO":true},"faltando":[],"banco":"ok"}
```

Se algum dia esse endpoint responder **503**, não é pane: é ele se recusando a dizer "ok"
com alguma das quatro faltando, e o corpo da resposta diz qual. As três primeiras seguram o
que a parte 2 faz; a quarta libera a escrita na tela do dono (parte 3a) — sem ela a
`controle.html` abre, mostra tudo e não grava nada.

As oito rotas `/api/acesso/*` respondem, e as quatro travas seguraram: publicar faixa sem o
segredo do agente, gerar QR sem login, listar eventos sem login e trocar um token falso
pelo esqueleto — **401 em todas**.

> **Há dois serviços no Render nesta conta.** O certo é o chamado **`imposicao`**, que
> atende `https://imposicao.onrender.com`. As variáveis foram parar no outro na primeira
> tentativa, e o sintoma foi enganoso: `/api/acesso/saude` respondendo **404**, não 503 —
> porque sem a `SUPABASE_SERVICE_KEY` o `app.py` não monta o router, e a rota simplesmente
> não existe. Para confirmar que é o serviço certo antes de colar, compare o commit que o
> Render mostra com `git rev-parse --short origin/main`.

---

## Onde parou: controle de acesso por QR Ideal

O projeto grande de agosto é dar aos ingressos impressos um código que a portaria saiba
conferir. Ele tem três partes.

### ✅ Parte 1 — o código no papel (**no ar desde a v557**)

O elemento **QR Ideal** no editor de numeração. Cada ingresso sai com um código de 8
caracteres tirado de uma lista de 3 milhões que só existe nas estações da gráfica.

Documentação: [docs/qr_ideal.md](qr_ideal.md) · skill `.claude/skills/qr-ideal/`

### ✅ Parte 2 — o código chega à nuvem (**no ar desde a v561**)

Oito tarefas, todas implementadas e testadas. O ciclo fecha: o agente publica a faixa
sozinho ao imprimir, o atendente gera o QR do Pedido no painel, e o cliente lê com o
celular e cadastra o evento.

Publicada em 14/08/2026, com as três variáveis configuradas no Render e conferidas por
fora. **Falta o teste de ponta a ponta com um pedido de verdade** — ver abaixo.

Documentação: [docs/controle_acesso.md](controle_acesso.md)
Plano: [docs/superpowers/plans/2026-08-13-controle-acesso-parte2.md](superpowers/plans/2026-08-13-controle-acesso-parte2.md)
Spec: [docs/superpowers/specs/2026-08-13-controle-acesso-parte2-design.md](superpowers/specs/2026-08-13-controle-acesso-parte2-design.md)

**As sete tabelas `producao_acesso_*` já existem no banco** e foram conferidas uma a uma.

### ✅ Parte 3a — o dono configura o evento (**no ar desde a v570**)

O dono do evento configura tudo em [frontend/controle.html](../frontend/controle.html): dados
do evento, tipo de uso de cada setor, aparelhos da portaria — inclusive renomear e
revogar cada um, com a lista de setores de cada aparelho — e os códigos próprios de staff e
cortesia. Gerar um código novo para um aparelho **não desconecta** o aparelho que já está
trabalhando.

Toda escrita — sem exceção — exige uma elevação de 15 minutos obtida com a senha do dono,
assinada com `ACESSO_ELEVACAO_SEGREDO` e presa ao navegador. Sem ela os campos ficam
genuinamente `disabled`, não só apagados na tela: um `disabled` de verdade, não uma opacidade
que engana o olho e deixa o toque passar. Cancelar a caixa de senha, perder a rede, ou a
elevação vencer no meio de uma edição — nenhum dos três apaga o que o dono digitou.

Cada setor mostra a quantidade contratada e um botão **Configurar** — nada mais. A lotação
de um setor **é** essa quantidade, decisão do usuário em 14/08: um campo à parte criaria um
segundo número, que discorda do contrato assim que o cliente aumenta o pedido no ERP.

Na mesma decisão saiu a comparação "encomendado × publicado", que era o sinal do risco
residual da parte 2 — quem tivesse o segredo do agente ocuparia uma posição da tiragem com
um hash próprio. Ela acendia sozinha pelo motivo mais banal: como cada modelo publica
quando é impresso, um pedido pela metade divergia legitimamente e o aviso mandava "conferir
com a gráfica" quase sempre. **O risco continua registrado e agora não tem onde aparecer**;
se voltar, volta no painel ao vivo da parte 3c, onde cabe um relatório e não um alarme.

Plano: [docs/superpowers/plans/2026-08-14-controle-acesso-parte3a.md](superpowers/plans/2026-08-14-controle-acesso-parte3a.md)
Spec: [docs/superpowers/specs/2026-08-14-controle-acesso-parte3a-design.md](superpowers/specs/2026-08-14-controle-acesso-parte3a-design.md)

**O servidor precisa de quatro variáveis, não três**: `SUPABASE_SERVICE_KEY`,
`ACESSO_AGENTE_SEGREDO`, `QR_PEDIDO_SEGREDO` e `ACESSO_ELEVACAO_SEGREDO` — as quatro estão
no Render desde 14/08, conferidas pelo `/api/acesso/saude` acima.

O código saiu na v569, e a v570 / 1.2.69 o reafirmam (tabela no topo deste documento). A
`PAINEL_ARQUIVOS` leva `controle.html`, `controle.js`, `controle.css` e `acesso-conta.js`
às estações.

**Falta o teste com um dono de verdade.** O caminho foi provado por fora, endpoint por
endpoint, mas nenhum cliente ainda entrou, digitou a senha, mudou o uso de um setor e cadastrou um
aparelho. Um detalhe conhecido e ainda em aberto: **não há como reativar um aparelho
revogado.** Revogar é o botão de pânico da portaria, e botão de pânico é apertado por
engano; hoje o conserto é criar outro aparelho e digitar um código novo no celular. O
backend já aceitaria a reativação — falta a decisão do usuário e o botão.

### ⏳ Parte 3b — a portaria (**não começou**)

Ler o QR, validar **local de verdade** com IndexedDB (o `sw.js` de hoje só guarda os arquivos
da tela — a portaria para quando a rede cai), fila de leituras.

### ⏳ Parte 3c — painel ao vivo e relatórios (**não começou**)

Lotação ao vivo, relatórios, e a mudança do Ideal Control (hoje em
`../ideal-IdealControl/`) para dentro deste repositório. Cancelar credencial e desvincular
pedido do evento também esperam esta parte.

O que a parte 3 inteira precisa entregar está no fim do
[docs/controle_acesso.md](controle_acesso.md), com as decisões que o usuário já tomou.

---

## 🔴 A noite de 15/08: três defeitos empilhados, e o que ficou de guarda

O pedido **20508** foi o primeiro pedido de verdade a passar pelo ciclo inteiro, e ele
achou três defeitos independentes. Os três tinham o mesmo formato: **silêncio**. Nada
quebrava na tela, nada aparecia em vermelho, e a conta só fecharia na portaria do evento,
com a fila na porta.

### 1. Nenhum agente publicado tinha o segredo (corrigido na 1.2.75)

Na estação, o segredo que autoriza publicar a faixa vive num `acesso_segredo.py` embutido
no executável. Ele é gerado na compilação, e o git o ignora.

- **`publicar_agente.ps1`**, que compila TODO release, nunca o gerava — ia direto ao
  PyInstaller.
- **`build_agent.ps1`** gerava, mas **depois** de já ter compilado: o arquivo só entraria no
  build seguinte.

Resultado: todo agente já publicado imprimia perfeitamente e não publicava credencial
nenhuma. O PyInstaller avisou em todos os builds, num arquivo que ninguém lia —
`missing module named acesso_segredo`.

**A guarda:** a rotina agora é uma só, `New-SegredoDoAgente` no
[ferramentas/Publicacao.psm1](../ferramentas/Publicacao.psm1), chamada **antes** da
compilação pelos dois scripts. Depois dela, `Test-SegredoNoBuild` lê o aviso do PyInstaller
e **para o release** se o módulo não tiver entrado.
Testes: [tests/SegredoDoAgente.Tests.ps1](../tests/SegredoDoAgente.Tests.ps1).

### 2. O banco descartava o segundo modelo (corrigido na v577)

Três modelos do 20508 usavam a mesma numeração ("Triband"), então o item 1 dos três saía
impresso com o mesmo `000001`. Texto igual e sal igual — o sal é por pedido — dão hash
igual, e a chave única de então, `codigo_hash` sozinho, aceitou a IMPRENSA e **descartou em
silêncio** a PISTA e o CAMAROTE.

Pior: o aparelho da portaria nunca teria chance de resolver a ambiguidade pelo setor, que é
a decisão registrada em [docs/controle_acesso.md](controle_acesso.md), porque a linha do
segundo modelo não existia.

**O papel não mudou**, por decisão do usuário: o texto impresso é o que o cliente
contratou. A chave passou a ser `chave_dedup` — pedido + modelo + número + hash, coluna
`GENERATED ALWAYS` que o próprio Postgres calcula
([sql/schema_acesso_04_credencial_por_modelo.sql](../sql/schema_acesso_04_credencial_por_modelo.sql),
já aplicado no banco em 15/08).

**O teste também mentia**, e essa é a lição maior: o fake do Supabase deduplicava por
`codigo_hash` por conta própria, ignorando o `on_conflict` que o código de produção pedia —
então passava verde por mais errada que fosse a chave real. Agora ele obedece ao parâmetro.

### 3. A nuvem se passava pelo agente local (corrigido na v579 / 1.2.78)

**Sintoma:** o modelo 1000281 (PISTA) saía **sem número e sem QR**, mesmo depois das duas
correções acima. A numeração "Triband Padrão" funcionava; a "Triband" e a "1000117", não.
Parecia defeito de numeração exclusiva (`is_custom`), e não era.

**A causa:** é o **mesmo `app.py`** que serve o motor da nuvem e o agente da estação, então
a nuvem respondia palavra por palavra o que o agente responderia:

```
https://imposicao.vercel.app/api/status
→ {"status":"running","message":"NewProd Agent ativo","version":"NewProd 1.2.77", ...}
```

O painel procura o agente testando três endereços, e o **primeiro da lista é o endereço da
própria página** — que na Vercel leva ao Render. Ele acreditava, parava de procurar, e
mandava a imposição para a nuvem **mostrando na tela o selo "⚡ AGENTE LOCAL"**. Na nuvem, o
catálogo de numerações é outro, o `qr_ideal_pool.bin` não existe (e nunca vai existir — é o
segredo mestre) e não há agente com faixa a publicar. Daí os três estragos ao mesmo tempo:
folha sem código, "falta a lista de codigos desta estacao", e credencial que não sobe.

**A correção:** o `/api/status` agora declara **onde** está rodando, e a sondagem do painel
recusa quem se declara nuvem:

```
imposicao.onrender.com/api/status → "onde":"nuvem"   → recusado
127.0.0.1:9000/api/status         → "onde":"local"   → aceito
```

A recusa é por `onde !== 'nuvem'`, e não por `onde === 'local'`, para que agente antigo — que
ainda não conhece o campo — continue sendo aceito enquanto as estações não atualizam.

**Confirmado em 15/08 de manhã:** o 1000284 foi gerado **com a numeração 1000117**, a
exclusiva que falhava, e saiu com QR. A credencial subiu. Não havia regressão de
`is_custom`: era sempre a nuvem no lugar do agente.

**As guardas:** [tests/test_onde_estou_rodando.py](../tests/test_onde_estou_rodando.py)
varre **todos** os `.js` do frontend e reprova qualquer sondagem que aceite um `running`
sem checar o `onde` — porque a sondagem está duplicada no `script.js` e no `pedido.js`, e
consertar uma e esquecer a outra deixaria metade das telas impondo na nuvem.

**A segunda guarda, que vale por si:**
[tests/test_numeracao_pedida_e_ausente.py](../tests/test_numeracao_pedida_e_ausente.py). O
`/api/impose` agora **recusa** o trabalho que traz `numeracao_id` preenchido e nenhum
elemento para desenhar, em vez de imprimir a folha calada. Um ingresso sem código não
parece defeituoso: ele é entregue e só falha na portaria, quando não há mais o que fazer.
E o log passou a registrar `[impose] numeracao_id=… objeto=… elements=N`, para a próxima
investigação começar com um dado na mão em vez de com a ausência de uma linha.

### 3b. O que já foi corrigido nesta linha (v578) — necessário, mas não suficiente

A tabela `pedidos_modelos` do ERP **não tem** coluna `numeracao_id`; ela guarda
`amostra_num_id`. O painel resolve as duas em quatro lugares — e o quarto, `runImposition`,
que é justamente o que imprime, lia só a que não existe no banco. Sem alguém ter tocado no
seletor de numeração naquela sessão, a numeração ia nula ao motor e **a folha saía sem
número e sem QR, com a prévia mostrando os dois**.

Isso valia para qualquer modelo de qualquer pedido, não só o 20508.

**A guarda:** [tests/test_numeracao_do_item.py](../tests/test_numeracao_do_item.py) lê o
`script.js` inteiro e reprova no dia em que aparecer uma quinta cópia da regra sem o
fallback — porque o defeito não foi uma linha errada, foi quatro cópias que divergiram.

---

## ▶️ Por onde continuar — amanhã, nesta ordem

### 1. ✅ Pedido 20508 — fechado no que era alcançável

Estado da nuvem, conferido em 15/08 de manhã, com a estação já na **1.2.78**:

| Modelo | | Contratado | Na nuvem | Numeração | |
|---|---|---|---|---|---|
| 1000278 | VIP | 50 | **50** | Mobi Padrão | ✅ QR Ideal |
| 1000279 | CAMAROTE | 50 | **50** | Mobi Padrão | ✅ QR Ideal |
| 1000280 | IMPRENSA | 20 | **20** | Triband Padrão | ✅ |
| 1000281 | PISTA | 30 | **30** | Triband (exclusiva) | ✅ |
| 1000282 | GERENCIA | 12 | **12** | 1000282 (exclusiva) | ✅ |
| 1000284 | CAMAROTE | 1 | **1** | 1000117 (exclusiva) | ✅ |
| 1000283 | VIP | 50 | 0 | Esquerda - Preta 20mm | ❌ **sem QR nenhum** |

**163 de 213.** A diferença são os 50 do `1000283 VIP`, abaixo — e não tem correção de
software.

Três das seis que deram certo são numerações **exclusivas** (`is_custom = true`). É a prova
de que a suspeita de regressão em numeração exclusiva estava errada: o que falhava era a
nuvem no lugar do agente.

**A lição de operação, que custou 62 ingressos:** imprima **um** ingresso primeiro e olhe o
papel. Tem número e QR? Só então mande a tiragem.

### 2. Decidir o que fazer com o 1000283 VIP

Cinquenta ingressos com a numeração "Numeração Esquerda - Pre", que **não tem QR nem código
de barras**. Nenhuma correção de software resolve: não existe nada para a portaria ler. Se
esse evento vai ter controle de acesso, esse modelo precisa de outra numeração e de
reimpressão de verdade, com papel novo.

### 3. O teste da tela do dono com um cliente de verdade

Ninguém ainda entrou na `controle.html` com a conta do Vibe, digitou a senha, configurou um
setor e cadastrou um aparelho. É o único jeito de saber se a tela se explica sozinha.

### 4. Então: parte 3b (a portaria) e 3c

Cada uma merece a própria spec, como a 3a teve. A 3b é a que fecha o ciclo — sem ela, tudo
o que está publicado na nuvem não é lido por ninguém.

---

## Como configurar as variáveis do Render (para a próxima vez)

As quatro foram feitas em 14/08. Este passo a passo fica registrado porque um serviço novo
ou uma troca de segredo refazem o caminho.

**O jeito curto, sem abrir o navegador:**

```powershell
.\ferramentas\variavel_no_render.ps1 ACESSO_ELEVACAO_SEGREDO -Conferir   # só mostra o alvo
.\ferramentas\variavel_no_render.ps1 ACESSO_ELEVACAO_SEGREDO             # grava e redeploya
```

Ele lê o valor do `.env.local`, acha o serviço pelo **nome exato** (o filtro da API do
Render casa por prefixo, e pegar o primeiro da lista repetiria o acidente descrito no
começo deste documento), grava, pede o redeploy e nunca imprime o valor. Depende de
`RENDER_API_KEY` no `.env.local` — Render → foto do perfil → Account Settings → API Keys.
Essa chave abre a conta inteira do Render; trate-a como a `service_role`.

**O jeito manual**, se preferir o painel. São quatro variáveis, todas com o valor que já
está no `.env.local` desta máquina:

- `SUPABASE_SERVICE_KEY` — sem ela o router `/api/acesso/*` nem é montado
- `ACESSO_AGENTE_SEGREDO` — sem ela a faixa de códigos nunca chega à nuvem
- `QR_PEDIDO_SEGREDO` — sem ela não dá para gerar o QR do evento
- `ACESSO_ELEVACAO_SEGREDO` — sem ela o dono não configura o evento; a tela fica somente
  leitura

```powershell
.\ferramentas\copiar_para_render.ps1
```

Ele confere as quatro, põe uma de cada vez na área de transferência (o valor **não** aparece
na tela) e espera você colar no Render antes de passar para a próxima. Com `-Conferir`, só
confere e sai; com `-Somente <NOME>`, copia uma e não limpa nada.

**A ordem é: variáveis primeiro, publicação depois** — senão o primeiro deploy sobe sem a
chave e o router não monta. Mas a conferência só funciona ao contrário: enquanto o Render
rodar código sem o `acesso_api`, o `/api/acesso/saude` responde **404**, e isso não é erro
de configuração.

> **Armadilha já vivida, e a razão de o script existir.** Ao copiar a
> `SUPABASE_SERVICE_KEY` com o mouse, um caractere sobrando no começo ou um `=` no fim fazem
> o Supabase responder `401 Invalid API key` — e a chave *parece* certa, com
> `role: service_role` e validade em 2035. A assinatura de um JWT tem **43 caracteres** e
> nunca termina em `=`. Isso já custou meia hora de investigação, e o script pega as duas
> violações.

E publicar é sempre os dois — site e agente, com número de versão novo:

```powershell
.\publicar.ps1 "mensagem"
.\publicar_agente.ps1 <versao>
```

O executável embute uma cópia do frontend, e o build do agente exige o
`ACESSO_AGENTE_SEGREDO` — ele lê do mesmo `.env.local` de onde saiu o valor colado no
Render, então os dois lados batem sem ninguém conferir.

---

## Riscos e pendências conhecidas

**RLS das tabelas antigas continua desligado.** É o maior risco em aberto do projeto:
chave anônima pública + RLS off significa que qualquer um lê e escreve o banco compartilhado
com o parceiro Vibecode, incluindo dados de clientes. Foi **decisão informada** do usuário
em 06/08/2026 ("nossa aplicação está em testes ainda, usuários restritos"), não esquecimento.

As sete tabelas do controle de acesso **nascem fechadas** — RLS ligado, zero políticas — e
isso não reabre aquela decisão: elas não têm tela lendo direto.

**Risco residual do controle de acesso.** Quem tiver o segredo do agente e pegar a janela
entre `abrir` e `fechar` consegue ocupar uma posição da tiragem com um hash próprio. A
parte 3 endereça, cruzando o total publicado com o que o ERP encomendou.

**`producao_produtos_formatos` tem uma chave única que não pega.** Declara
`UNIQUE (empresa_id, id_produto)` com `empresa_id` sempre nulo, e em Postgres nulo é
distinto de nulo dentro de índice único. A tabela está vazia, então não há dado errado —
mas a restrição não faz o que o nome promete.

**A migração `sql/schema_acesso_02` é opcional.** Ela só remove um índice redundante. Sem
ela, nada quebra.

**O log do agente é apagado a cada abertura.** O `agent_tray.py` abre o `agent_log.txt` em
modo `"w"`, que trunca. Como a auto-atualização reinicia o agente, **toda atualização joga
fora o registro do que aconteceu antes** — e foi exatamente o que atrapalhou o diagnóstico
da noite de 15/08: a evidência de uma impressão sumiu quando o agente subiu de versão no
meio da investigação. Vale trocar por `"a"` com corte por tamanho. Ainda não foi feito.

**Atenção ao ler o tamanho do `agent_log.txt`.** O Windows não atualiza o tamanho na
entrada de diretório enquanto o arquivo está aberto pelo agente: `Get-ChildItem` mostra
**0 bytes** num log cheio. Leia o conteúdo (`[System.IO.File]::Open` com
`FileShare.ReadWrite`) em vez de confiar no tamanho — foi assim que o log "vazio" acabou
entregando as cinco linhas que explicavam tudo.

**Dois modelos com a mesma numeração imprimem o mesmo código.** Continua verdade depois da
correção de 15/08 — o que mudou é que agora os dois são gravados, cada um com o seu setor,
em vez de o segundo ser descartado. Quem separa na leitura é o setor do aparelho, e isso é
trabalho da **parte 3b**: enquanto ela não existir, ninguém está lendo nada.

**O `catalogo_fontes` era o pior dos dois mundos, e foi resolvido em 14/08.** O
`sql/schema_catalogo_fontes.sql` existia desde 30/07 e nunca foi aplicado, então o Supabase
respondia 404 e o código caía no catálogo local — que é o que sempre funcionou de verdade.
Nada quebrava, mas cada arranque imprimia duas linhas vermelhas no log, e log vermelho
rotineiro treina qualquer um a ignorar log vermelho. O usuário escolheu **apagar o SQL**: o
catálogo é local por decisão, mora no `formats_db.json`, e o [db.py](../db.py) não faz mais
nenhuma chamada remota por causa dele. Os binários das fontes seguem no Storage, com o
próprio sincronismo — o que se decidiu foi só onde mora a lista.

---

## Saúde do repositório

- **524 testes pytest + 171 Pester**, todos passando. `pytest tests/` roda inteiro, sem
  exclusão, em cerca de 20 segundos — quase metade num teste só, o que publica 1.200
  credenciais de verdade pelo KDF lento.
- Em 13/08 a suíte foi recuperada: **dez** arquivos não rodavam, e um deles disparava um
  POST de verdade contra o Render de produção a cada execução.
  `tests/test_a_suite_esta_sa.py` impede a reincidência.
- Rode `.\ferramentas\conferir.ps1` antes de qualquer trabalho substantivo. Ele só consulta,
  e responde as seis perguntas que importam.

---

## Pendências antigas, não verificadas

Estavam neste documento desde 18/06/2026 e **não foram conferidas** nesta atualização.
Podem já ter sido feitas:

- Painel da Produção: retirar o "valor" abaixo do número do pedido e dar mais destaque ao
  número.
- Lista de Arte: o mesmo — retirar o valor, destacar o número do pedido.
