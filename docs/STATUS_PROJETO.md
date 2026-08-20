# Status do Projeto — Ideal Imposition

**Última atualização: 19 de agosto de 2026, noite**

Este documento diz onde o projeto está **hoje** e por onde continuar. Se você está
retomando depois de um tempo, comece por aqui.

---

## O que está no ar

| | Versão | Publicado em |
|---|---|---|
| Site + Edge Functions | **v652** | 19/08/2026 |
| Agente NewProd | **1.2.147** | 19/08/2026 |

As estações checam atualização a cada 30 minutos. Para adiantar numa delas: menu da
bandeja → **Atualizar agora**.

> [!NOTE]
> **O dia 19/08/2026 foi inteiro na Lista de Arte** — oito versões, da v645 à v652.
> As quatro travas do negócio, o número do cliente ao lado do nome, o link direto
> para o pedido, a coluna Preview, a coluna Tempo com relógio por card, e a caixa
> de designers contando só o trabalho aberto. A tela está descrita de ponta a ponta
> em [`lista_de_arte.md`](lista_de_arte.md); o que mudou em cada versão está no
> [`CHANGELOG.md`](../CHANGELOG.md) da raiz.

> ✅ **A partida a frio acabou em 17/08/2026.** O backend na nuvem ficava num serviço de
> instância `free`, que dormia depois de ~15 minutos parado — **32,8 s medidos em 16/08**
> no primeiro acesso do dia. Aquele serviço foi desligado: o backend inteiro são Edge
> Functions, e Edge Function não dorme.

**O controle de acesso está inteiro no servidor — as quatro variáveis.** Conferido em 14/08
contra o backend de então, não assumido:

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

> **Havia dois serviços com nomes parecidos na conta do servidor hospedado**, e as
> variáveis foram parar no errado na primeira tentativa. O sintoma foi enganoso:
> `/api/acesso/saude` respondendo **404**, não 503 — porque sem a `SUPABASE_SERVICE_KEY` o
> `app.py` não monta o router, e a rota simplesmente não existe. Aquele serviço saiu do ar
> em 17/08/2026, mas a armadilha ficou: a conta do Supabase também tem projetos vazios com
> nomes parecidos, e função publicada no projeto errado sobe sem erro e não enxerga
> credencial nenhuma. O `publicar.ps1` confere o `project-ref` por isso.

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
sozinho ao imprimir, a gráfica libera o acesso do cliente no painel, e o cliente entra no
aplicativo, acha o pedido em **Meus Pedidos** e toca em **Carregar** para criar o evento.
Até 17/08/2026 este passo era outro — o atendente gerava o **QR do Pedido** e o cliente o
lia com a câmera; o QR saiu de circulação naquele dia, junto com o `evento.html`.
Em 18/08/2026 o aplicativo ganhou identidade visual própria (v632) e uma leva de
usabilidade (v635, a publicar): entrar libera 15 minutos (bilhete de conta), mostrar/ocultar
senha, botões com estado de espera, engrenagem em seções recolhidas, nome do aparelho na
hora e "Enviar por WhatsApp" no painel — plano em
[docs/superpowers/plans/2026-08-18-ideal-control-usabilidade.md](superpowers/plans/2026-08-18-ideal-control-usabilidade.md).

Publicada em 14/08/2026, com as três variáveis configuradas no backend de então e
conferidas por fora. **Falta o teste de ponta a ponta com um pedido de verdade** — ver abaixo.

Documentação: [docs/controle_acesso.md](controle_acesso.md)
Plano: [docs/superpowers/plans/2026-08-13-controle-acesso-parte2.md](superpowers/plans/2026-08-13-controle-acesso-parte2.md)
Spec: [docs/superpowers/specs/2026-08-13-controle-acesso-parte2-design.md](superpowers/specs/2026-08-13-controle-acesso-parte2-design.md)

**As oito tabelas `producao_acesso_*` já existem no banco** e foram conferidas uma a uma
(sete no `schema_acesso.sql`; a oitava, `_bloqueios`, veio com a parte 3a em
`schema_acesso_bloqueios.sql`).

### ✅ Parte 3a — o dono configura o evento (**no ar desde a v570**)

O dono do evento configura tudo em [frontend/controle.html](../frontend/controle.html): dados
do evento, tipo de uso de cada setor, aparelhos da portaria e os códigos próprios de staff e
cortesia.

Cada aparelho tem **quatro opções**, decisão do usuário em 18/08/2026: *Renomear*,
*Selecionar os Setores*, *Pausar* e *Excluir*. Excluir apaga a linha mesmo — o aparelho some
da lista, e as leituras que ele já fez continuam contadas no evento. Pausar tem volta. O
**nome é do dispositivo**, não do evento: o mesmo celular se chama a mesma coisa em todos os
eventos daquele cliente, e renomeá-lo num deles renomeia nos outros.

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
configuradas desde 14/08, conferidas pelo `/api/acesso/saude` acima. Desde 17/08/2026 elas
moram nos segredos do Supabase.

O código saiu na v569 e foi reafirmado na v570 / 1.2.69; a versão corrente está na tabela
no topo deste documento. A
`PAINEL_ARQUIVOS` leva `controle.html`, `controle.js`, `controle.css` e `acesso-conta.js`
às estações.

**Falta o teste com um dono de verdade.** O caminho foi provado por fora, endpoint por
endpoint, mas nenhum cliente ainda entrou, digitou a senha, mudou o uso de um setor e cadastrou um
aparelho.

O buraco que existia aqui — "não há como reativar um aparelho revogado", o botão de pânico
apertado por engano sem conserto — **fechou em 18/08/2026**: *Revogar* deixou de existir, e
no lugar dele ficaram *Pausar* (que tem volta, pelo *Retomar*) e *Excluir* (que apaga a
linha). O estado do meio, desligado para sempre e ocupando a lista, era justamente o que não
resolvia nem uma coisa nem outra.

### ✅ Parte 3b — a portaria (**no ar na v585**)

O aparelho do porteiro: pareia — desde a v612, com o **dono configurando no próprio
aparelho**, e ainda pelo código de 6 caracteres quando o celular do portão não está ali —,
baixa o evento inteiro para o
IndexedDB e decide **sem rede**, pelas seis regras de
[frontend/portaria-validacao.js](../frontend/portaria-validacao.js). Os três endpoints —
`entrar`, `faixa` e `leituras` — ficam em [acesso_portaria.py](../acesso_portaria.py), e o
`frontend/sw.js` novo é o que deixa `portaria.html` abrir sem rede. Falta a prova que
vale: **um celular de verdade, com a rede desligada**.

Plano: [docs/superpowers/plans/2026-08-15-controle-acesso-parte3b.md](superpowers/plans/2026-08-15-controle-acesso-parte3b.md)
Spec: [docs/superpowers/specs/2026-08-15-controle-acesso-parte3b-design.md](superpowers/specs/2026-08-15-controle-acesso-parte3b-design.md)

### ✅ Parte 3c, primeira metade — o Ideal Control da gráfica (**no ar na v589**)

Uma tela nova no menu do painel — **🎟️ Ideal Control** — onde a gráfica pesquisa pelo
número do pedido e configura o controle de acesso do cliente **por inteiro**: dados do
evento, setores (nome na portaria, uso do ingresso, janela de horário), bloqueio de faixa,
códigos de staff, aparelhos da portaria, e a lista paginada de todos os ingressos de cada
setor com a situação de cada um.

A razão de ela existir é entregar o Ideal Control **já pré-configurado**: o cliente recebe
o acesso liberado pela gráfica e, ao carregar o pedido, encontra os aparelhos prontos, em
vez de uma tela em branco. Desde 17/08/2026 é também nesta tela que a gráfica abre esse
acesso, no bloco **"Acesso do cliente"** — foi o botão "QR do Pedido" que saiu daqui.

Junto vem o **dashboard de gerenciamento de público** — contratado, publicado, entraram,
presentes, comparecimento, recusas por motivo, ocupação por setor e entradas por hora. É a
primeira versão, para o usuário ajustar depois, e fica **atrás de um botão**.

**Nada que custe contagem carrega na abertura.** Decisão do usuário em 16/08/2026: abrir o
pedido traz a estrutura (oito idas ao banco, ~1,2s), os números de um setor vêm com a
primeira página da lista daquele setor, e o painel de público só quando alguém o pede.
Antes disso, abrir o pedido 18560 custava vinte idas ao banco.

- Backend: [acesso_interno.py](../acesso_interno.py), prefixo `/api/acesso/interno`
- Tela: [frontend/ideal-control.js](../frontend/ideal-control.js) e a
  `<section id="view-ideal-control">` do `index.html`
- **A porta é o papel, não a senha.** Decisão do usuário: basta estar logado como **ADM ou
  Atendimento**. O backend confere o JWT do Supabase e depois o `role` em
  `imposition_user_permissions` — 403 para qualquer outro papel, e 403 mesmo com sessão
  boa. Esconder o botão no menu nunca impediu ninguém de chamar a rota.
- A permissão `perm_ideal_control_view` é **derivada do papel no navegador**, nunca gravada:
  ela não existe no banco nem no `ROLE_DEFAULTS`, justamente para não aparecer num `upsert`
  e mexer na grade que o administrador edita ao vivo.

O que ainda falta da parte 3c: o painel **ao vivo** (esta tela é sob demanda, não empurra
atualização), cancelar credencial, desvincular pedido do evento, reativar aparelho revogado,
e a mudança do Ideal Control antigo (hoje em `../ideal-IdealControl/`) para dentro deste
repositório.

O que a parte 3 inteira precisa entregar está no fim do
[docs/controle_acesso.md](controle_acesso.md), com as decisões que o usuário já tomou.

---

## 🔴 A noite de 15/08: quatro defeitos empilhados, e o que ficou de guarda

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

Três modelos do 20508 usavam numerações de mesmo formato — Triband Padrão, Triband e
1000117, todas com prefixo vazio e seis dígitos —, então o item 1 dos três saía impresso
com o mesmo `000001`. Texto igual e sal igual — o sal é por pedido — dão hash
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
própria página** — que na Vercel levava ao servidor Python hospedado na nuvem. Ele acreditava, parava de procurar, e
mandava a imposição para a nuvem **mostrando na tela o selo "⚡ AGENTE LOCAL"**. Na nuvem, o
catálogo de numerações é outro, o `qr_ideal_pool.bin` não existe (e nunca vai existir — é o
segredo mestre) e não há agente com faixa a publicar. Daí os três estragos ao mesmo tempo:
folha sem código, "falta a lista de codigos desta estacao", e credencial que não sobe.

**A correção:** o `/api/status` agora declara **onde** está rodando, e a sondagem do painel
recusa quem se declara nuvem:

```
<servidor da nuvem>/api/status → "onde":"nuvem"   → recusado
127.0.0.1:9000/api/status      → "onde":"local"   → aceito
```

A recusa é por `onde !== 'nuvem'`, e não por `onde === 'local'`, para que agente antigo — que
ainda não conhece o campo — continue sendo aceito enquanto as estações não atualizam.

**Confirmado em 15/08 de manhã:** o 1000284 foi gerado **com a numeração 1000117**, a
exclusiva que falhava, e saiu com QR. A credencial subiu. Não havia regressão de
`is_custom`: era sempre a nuvem no lugar do agente.

### 4. O navegador bloqueou a estação (corrigido na v581)

Corrigir o item 3 revelou o item 4, e é o mais importante dos quatro porque não é um
defeito nosso — é uma regra nova do navegador, que vai chegar a toda estação sozinha.

O **Chrome 151** passou a recusar que uma página `https://` da internet converse com
`http://127.0.0.1:9000`:

```
blocked by CORS policy: Permission was denied for this request
to access the `loopback` address space
```

O cabeçalho `Access-Control-Allow-Private-Network` que o agente já envia **deixou de
bastar**. Conferido no navegador em 15/08: o agente responde certo ao preflight e ao GET
por `curl`; quem recusa é o Chrome, antes de a requisição sair.

O efeito: a partir de `ideal-imposition.vercel.app` a estação é **inalcançável**, e o
painel caía para a nuvem em silêncio. Como a nuvem não tem o `qr_ideal_pool.bin`, o
operador lia *"falta a lista de codigos desta estacao"* **estando na frente de uma estação
que tem a lista** — a frase que fez esta investigação durar dois dias.

**A saída não pode ser permissão concedida no navegador:** cada estação da gráfica usa um
navegador diferente, e um clique por site, por navegador e por perfil volta a quebrar na
primeira máquina nova. A saída é abrir o painel pelo endereço do **próprio agente**:

```
http://localhost:9000/app/index.html
```

Ali a página e o agente têm a mesma origem, não há permissão envolvida, e funciona em
qualquer navegador. Medido no Chrome desta estação: agente encontrado, imposição indo para
`http://localhost:9000`, **61 numerações** no catálogo, zero bloqueios.

**Um engano meu, corrigido:** eu havia registrado aqui que o painel servido pelo agente
ficaria preso ao catálogo local dele, que tem uma numeração só. **Não fica.** A função
`api()` do `script.js` desvia `/formatos`, `/numeracoes`, `/saidas`, `/cores` e
`/modelos_imposicao` direto para o Supabase quando o `supabaseClient` existe. O
`formats_db.json` da estação é um espelho que o painel não lê.

**A correção publicada (v581):** o painel deixa de cair na nuvem calado. Quando a estação
não é encontrada e a página não vem da própria máquina, ele mostra um alerta vermelho
durante a geração e repete o motivo dentro da mensagem de erro — dizendo o endereço a
abrir. A guarda é
[tests/test_estacao_bloqueada_pelo_navegador.py](../tests/test_estacao_bloqueada_pelo_navegador.py),
que reprova qualquer tela que mostre o selo "NUVEM" sem explicar por quê.

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

## 📓 O dia 16/08: a tela do dono revisada, o Ideal Control da gráfica, e dois defeitos meus

Sete publicações, da v583 à v589. O que ficou de guarda está abaixo; o que ficou por fazer,
mais adiante.

### A tela do dono, revisada usando-a (v586)

O usuário abriu a `controle.html` e apontou quatro coisas. Todas viraram correção, e a
razão de cada uma está em [controle_acesso.md](controle_acesso.md):

1. **O cartão do setor mostra a faixa impressa** — `400 ingressos contratados · de 0005 a
   0500`. Só a quantidade não identifica o lote: dois setores de 400 são idênticos na tela,
   e o que o dono tem na mão é um ingresso com um número escrito.
2. **"Quando vale" diz em frase** que sem data e hora o setor já está valendo. O
   `(vazio = sempre)` entre parênteses se lia como instrução do que ele *precisa* preencher.
3. **Os setores de um aparelho viraram botões que acendem**, e passam a valer no toque.
   Eram caixas de marcar, e saíam tortas — medidas no navegador: **385px × 13px**, com o
   nome do setor jogado no extremo direito. A regra `input { width: 100% }` da folha valia
   para elas, e a exceção do CSS cobria só `input[type="radio"]`.
4. **"Digitar a senha do dono" virou "Digitar a Senha Cadastrada"**, com "Esqueci minha
   senha" ao lado, e a tranca ficou grudada no topo. A frase antiga se lia como uma segunda
   senha, especial, que o cliente nunca recebeu.

O item 4 é o que explica o relato **"criar aparelho não está funcionando no desktop"**: a
explicação de por que os botões estavam apagados morava no alto de uma página de três telas
de altura. O dono rolava até os aparelhos, tocava num botão apagado e não acontecia nada.

### O Ideal Control da gráfica (v587)

A tela nova do menu, descrita na seção da parte 3c acima. O que vale registrar aqui é a
decisão de autorização: **sem senha de evento, mas nunca sem identificação**. O backend
confere o JWT do Supabase e depois o papel em `imposition_user_permissions` — 403 para
quem não for ADM ou Atendimento, mesmo com sessão válida.

### Dois defeitos meus, e o que cada um custou

**A tela ficou três minutos em "Carregando…"** e nunca saiu. Foram dois defeitos, um
escondendo o outro, e os dois estão explicados em [controle_acesso.md](controle_acesso.md):

- eu procurava o cliente do Supabase em `window.supabaseClient`, e ele **não mora lá** —
  `supabase-config.js` o declara com `let`, que não cria propriedade no objeto global. A
  tela nunca teve cliente, em navegador nenhum;
- a falha era **muda**: a chamada lançava de forma síncrona, o `throw` escapava do
  `.catch()` que nem existia ainda, e o "Carregando…" ficava para sempre.

O segundo é o que tornou o primeiro caro. Sem mensagem na tela, levou duas publicações e o
log do servidor — que provou o essencial, **nenhuma requisição chegou ao motor** — para
chegar ao primeiro.

**A lição de método, e ela é minha:** eu tinha uma otimização pendente em mãos (a tela fazia
20 idas ao banco ao abrir) e tratei os três minutos como se fossem a mesma coisa, só que
pior. A aritmética já dizia que não fechava — 20 × 160ms são três segundos, não três
minutos — e eu não tinha parado para fazê-la. Foi o usuário quem me redirecionou:
*"motivo de não carregar pode ser outro"*.

**A lição de teste:** o arnês de navegador semeava `window.supabaseClient` e passava com a
tela quebrada. Ele era **mais generoso que a página** — exatamente o que o dublê de banco
já tinha ensinado na véspera, e que eu não transferi. O teste que pega agora carrega o
`supabase-config.js` de verdade.

### Onde a tela ficou, em número de consultas

| | idas ao banco | tempo (medido de fora) |
|---|---|---|
| abrir o pedido 18560, na v587 | 20 | 3,18 s |
| abrir o pedido 18560, hoje | **8** | **1,21 s** |

Nada que custe contagem carrega na abertura — é decisão do usuário: *"não deve carregar de
imediato os códigos, apenas se solicitado, cada setor de uma vez"*.

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

### 3. ✅ O teste da tela do dono — feito em 16/08, e rendeu quatro correções

O usuário usou a `controle.html` e apontou o que não se explicava. Ver
"O dia 16/08", acima. **A tela do Ideal Control da gráfica ainda não teve esse teste** —
ela subiu na v589 e ninguém a usou de verdade.

### 4. ⏳ O teste da portaria com um celular de verdade — CONTINUA ABERTO

**É a única prova que vale, e ela não foi feita.** A portaria está no ar desde a v585;
falta o que sempre faltou: parear um aparelho, **desligar Wi-Fi e dados**, e ler.

Dois casos importam mais que os outros:

- ler um ingresso do **1000110 (CAMAROTE, pedido 18560)**, que tem QR Ideal → verde;
- ler um ingresso do **VIP** num aparelho aceso só para **CAMAROTE** → tem de sair
  **laranja**, dizendo qual porta é a certa. Se sair vermelho, é o erro que a tela inteira
  existe para não cometer.

> **Cuidado ao escolher o evento.** Conferido no banco em 15/08: o **"Click"** (pedido
> 19775) e a **"Festa da Uva"** (18360) têm **zero credenciais publicadas** — os pedidos
> nunca foram impressos. Todo ingresso lido neles sai vermelho, corretamente, e isso não é
> defeito da portaria. **O único evento testável é o "Teste Ideal Control"** (pedido 18560):
> 2.000 de 2.000.

### 5. Usar o Ideal Control da gráfica e apontar o que não se explica

Foi o que rendeu as quatro correções da tela do dono. A tela da gráfica é maior, tem mais
o que dar errado, e ninguém ainda pesquisou um pedido nela em condição de trabalho.

---

## Como configurar as quatro variáveis (para a próxima vez)

As quatro foram feitas em 14/08, quando ainda moravam no painel de um servidor hospedado.
Desde 17/08/2026 elas moram nos **segredos do Supabase**, que é o que as Edge Functions
leem, e os dois scripts que gravavam no painel antigo
(`ferramentas/variavel_no_render.ps1` e `ferramentas/copiar_para_render.ps1`) saíram junto
com o serviço.

São quatro, todas com o valor que já está no `.env.local` desta máquina:

- `SUPABASE_SERVICE_KEY` — sem ela o router `/api/acesso/*` nem é montado
- `ACESSO_AGENTE_SEGREDO` — sem ela a faixa de códigos nunca chega à nuvem
- `QR_PEDIDO_SEGREDO` — sem ela não dá para gerar o QR do evento
- `ACESSO_ELEVACAO_SEGREDO` — sem ela o dono não configura o evento; a tela fica somente
  leitura

Ao copiar a `SUPABASE_SERVICE_KEY`, cuidado com um caractere sobrando no começo ou um `=`
no fim: o Supabase responde `401 Invalid API key` e a chave *parece* certa. A assinatura de
um JWT tem **43 caracteres** e nunca termina em `=`.

**A ordem é: segredos primeiro, publicação depois** — a função que sobe sem a chave
responde erro em tudo o que toca o banco.

E publicar é sempre os dois — site e agente, com número de versão novo:

```powershell
.\publicar.ps1 "mensagem"
.\publicar_agente.ps1 <versao>
```

O executável embute uma cópia do frontend, e o build do agente exige o
`ACESSO_AGENTE_SEGREDO` — ele lê do mesmo `.env.local` de onde saiu o valor gravado nos
segredos do Supabase, então os dois lados batem sem ninguém conferir.

---

## Riscos e pendências conhecidas

**RLS das tabelas antigas continua desligado.** É o maior risco em aberto do projeto:
chave anônima pública + RLS off significa que qualquer um lê e escreve o banco compartilhado
com o parceiro Vibecode, incluindo dados de clientes. Foi **decisão informada** do usuário
em 06/08/2026 ("nossa aplicação está em testes ainda, usuários restritos"), não esquecimento.

As oito tabelas do controle de acesso **nascem fechadas** — RLS ligado, zero políticas — e
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
em vez de o segundo ser descartado. Quem separa na leitura é o setor do aparelho — a
**parte 3b**, que está no ar desde a v585 e ainda não foi provada num celular de verdade.

**Dois eventos têm setor cadastrado e zero credencial publicada.** Conferido no banco em
15/08: o **"Click"** (pedido 19775, 5.000 contratados) e a **"Festa da Uva"** (18360, 300).
Os pedidos nunca foram impressos, então não há o que a portaria reconheça — todo ingresso
lido neles sai vermelho, corretamente. Não é defeito, mas é uma armadilha de teste: um
aparelho pareado ali dá a impressão de que a portaria não funciona.

**As 163 credenciais órfãs do pedido 20508 continuam órfãs, e o reparo não as alcança.**
Elas não têm setor a que se ligar: o 20508 foi impresso e publicado, mas **nunca virou
evento** (`evento_id` nulo, `qr_gerado_em` nunca). O conserto não é SQL — é gerar o QR do
Pedido para o 20508 e mandar ao cliente; a própria reivindicação carimba as 163 de uma vez.
Os dois arquivos de reparo em `sql/` foram medidos em 15/08 e **não mudariam nada hoje**;
ficam como rede de segurança se o defeito voltar.

**O `catalogo_fontes` virou tabela de verdade em 15/08 — e o motivo é uma perda real.** Em
14/08 o usuário tinha decidido o contrário: o `sql/schema_catalogo_fontes.sql` existia desde
30/07 sem nunca ter sido aplicado, o Supabase respondia 404, o código caía no catálogo local
e imprimia duas linhas vermelhas por arranque. A decisão de então foi apagar o SQL e assumir
o catálogo como local.

O que aquela decisão não previu: quando o operador abria o painel pelo **site
publicado**, quem respondia era o servidor da nuvem, e o disco dele voltava ao conteúdo
versionado a cada publicação. Quatro fontes cadastradas em 14/08 (Gotham Book, Gotham Bold, Swis721 LtCn BT
Light e Swiss 911 Extra Compressed) sumiram na publicação seguinte. A numeração **1000289**
passou a mostrar o nome da fonte no seletor e a desenhar com outra, porque o elemento guarda
apenas o NOME — o `arquivo_url` só entra no payload da imposição, nunca é salvo. Os binários
nunca se perderam: estão em `chat-ideal/fontes/`, e é de lá que as quatro foram repostas.

Guardar só na estação não resolveria, porque o link que o cliente abre para aprovar a arte
lê o catálogo da **nuvem**: fonte que existisse apenas numa estação faria o cliente aprovar
arte com a fonte errada. Por isso a lista passou a viver na tabela.

**A garantia de desempenho continua inteira:** a estação nunca vai à rede para LER o
catálogo — lê sempre o `formats_db.json`, e quem atualiza aquele arquivo é o
`sincronizar_catalogo_fontes` do [agent_worker.py](../agent_worker.py), a cada 30 min em
segundo plano. Quem separa os dois mundos é o `IS_SUPABASE_ACTIVE`, que o executável já
desligava de propósito. A **escrita** não pode depender daquela flag (senão a fonte
cadastrada numa estação morre ali), e é isso que o `_catalogo_remoto_ativo` resolve.

Duas armadilhas viraram teste: lista vazia nunca sobrescreve a cópia do disco, e tabela
ausente cai para o disco **adiando** a próxima consulta em vez de imprimir uma linha
vermelha por elemento desenhado.

---

## Saúde do repositório

- **1.589 testes pytest + 166 Pester**, todos passando (medido em 19/08/2026).
  `pytest tests/` roda inteiro, sem exclusão, em cerca de **3 minutos** — a maior parte
  em testes de navegador, que sobem um Chrome por teste, mais o que publica 1.200
  credenciais de verdade pelo KDF lento.
- **Um teste é instável na execução em paralelo**:
  `test_controle_tela.py::test_tocar_no_setor_do_aparelho_grava_na_hora` falha de vez em
  quando sob o `pytest-xdist` e passa sozinho. Não é regressão; ainda não foi
  investigado a fundo.
- **Os testes de navegador precisam parecer com a página, não com o que é conveniente.**
  Duas vezes em 15–16/08 um dublê mais generoso que a realidade escondeu um defeito real: o
  dublê de banco que devolvia lista vazia onde o PostgREST levanta erro, e o arnês de tela
  que semeava `window.supabaseClient` onde a página usa uma ligação de escopo de script.
  Nos dois casos a suíte estava verde com o código quebrado em produção.
- Em 13/08 a suíte foi recuperada: **dez** arquivos não rodavam, e um deles disparava um
  POST de verdade contra o servidor de produção a cada execução.
  `tests/test_a_suite_esta_sa.py` impede a reincidência.
- Rode `.\ferramentas\conferir.ps1` antes de qualquer trabalho substantivo. Ele só consulta,
  e responde as seis perguntas que importam.

---

## Em aberto desde 19/08/2026

Nada disto bloqueia o que está no ar. Estão aqui para não se perderem.

**1. Auditar as permissões das 39 tabelas nossas.** O Supabase dá `GRANT ALL` ao
papel `authenticated` em toda tabela nova, por privilégio padrão do esquema — então
um `GRANT SELECT, INSERT, UPDATE` posterior não restringe nada. Descoberto na
criação da `imposition_tempo_no_card`, onde o painel logado ficava podendo
`TRUNCATE` a tabela. Corrigido lá; as demais provavelmente têm a mesma folga. O
procedimento está em [`REGRAS_BANCO.md`](REGRAS_BANCO.md).

**2. Decidir o que fazer com as inserções em `propostas_chat`.** As sete que o
painel faz mandam a coluna `remetente_nome`, que não existe — a coluna é
`autor_nome` —, e o PostgREST recusa a escrita inteira. Verificado no banco: zero
linhas nossas, nunca gravou. Consertar o nome ou remover as inserções.

**3. Confirmar o `?tab=pedido` do sistema parceiro.** O menu em que a tela do Vibe
abre foi inferido, não verificado — a tela deles exige login. Se o nome for outro,
o Vibe abre no menu padrão (não quebra nada) e o conserto é uma palavra na
constante `ABA_DO_PEDIDO_NO_VIBE`.

**4. Confirmar que texto o parceiro escreve em `propostas.status_interno`** ao
liberar um pedido para produção. O painel reconhece `EM PRODUCAO`, `EM PRODUÇÃO`,
`EM IMPRESSAO`, `EM IMPRESSÃO`, `PRODUCAO`, `PRODUÇÃO` e `FINALIZADA`. Hoje a
coluna traz sobretudo `APROVADO` e `LIBERADO`, que o painel **não** reconhece.

**5. Rever a [`DOCUMENTACAO.md`](DOCUMENTACAO.md) por inteiro.** Ela descreve a
arquitetura de junho — Firebase e servidor Python na nuvem —, e as duas coisas
mudaram. Ganhou um aviso no topo dizendo o que ainda vale e o que não vale, mas a
revisão de verdade está pendente.

**6. Estações atrás do agente**: `DESKTOP-5N8AF7D` (1.2.137) e `DESKTOP-PM6TG1B`
(1.2.129), ambas com sinal recente. Elas se atualizam sozinhas quando abrirem;
vale conferir se abriram. `PRD-ACABAMENTO` e `CESAR-CPD` são instalações de teste,
não estações da gráfica.

---

## Pendências antigas, não verificadas

Estavam neste documento desde 18/06/2026 e **não foram conferidas** nesta atualização.
Podem já ter sido feitas:

- Painel da Produção: retirar o "valor" abaixo do número do pedido e dar mais destaque ao
  número.
- Lista de Arte: o mesmo — retirar o valor, destacar o número do pedido.
