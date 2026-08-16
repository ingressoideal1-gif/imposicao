# Um aplicativo só: o cliente instala, e o mesmo app atende a portaria

**Data:** 16/08/2026
**Decisão do usuário:** um aplicativo com dois modos, e não dois instaláveis separados.

## O que se quer

O cliente recebe um link, instala o aplicativo, e ao abrir vê **Meus Eventos** e
**+ Novo Evento** — este último abre a câmera para ler o QR que carrega o evento. O
mesmo aplicativo atende a portaria.

## O que já existe, e é mais do que parece

[controle.html](../../../frontend/controle.html) **já é** a tela do cliente: feita para
celular (`viewport-fit=cover`, CSS próprio, alvos de toque grandes), login com a conta do
Vibe, e uma tela **"Seus eventos"** alimentada por `/meus-eventos` — endpoint que existe e
responde. Quando não há evento nenhum, ela diz *"Leia o QR que a gráfica enviou para
cadastrar o primeiro"* e **não oferece câmera nenhuma**: o cliente precisa sair do
aplicativo, abrir a câmera do sistema, achar o QR no WhatsApp e tocar num link.

[portaria-camera.js](../../../frontend/portaria-camera.js) já lê QR e código de barras, com
`BarcodeDetector` nativo onde existe e `jsQR` vendorizado no iPhone, mais a lanterna. É
reuso direto, não código novo.

A portaria já é instalável desde a v608. O que este desenho faz é **estender** isso ao
cliente e juntar os dois num aplicativo só.

## A restrição que decide a arquitetura

Um aplicativo instalável tem **um escopo**, e o escopo é um prefixo de URL. As telas moram
todas na raiz:

```
/index.html  /producao.html  /cliente.html   ← a gráfica
/controle.html  /evento.html  /portaria.html ← o cliente e o portão
```

Um escopo `/` juntaria as telas da gráfica dentro do aplicativo do cliente — o porteiro
tocaria num link e cairia no painel de produção. Isso está fora de questão.

**Mover as três para uma pasta (`/app/…`) parece a saída óbvia, e não é.** `evento.html` e
`controle.html` estão em `security_config.PAINEL_ARQUIVOS`, a lista **plana** de nomes que o
agente sincroniza para dentro de cada estação. Uma pasta obrigaria o agente a lidar com
caminho, e o custo cairia sobre código aprovado e rodando na gráfica — para resolver um
problema de front-end.

## A arquitetura: um prefixo comum, e as três telas ficam onde estão

> **Revisto em 16/08/2026, no meio da execução.** O primeiro desenho era uma página só
> (`app.html`) contendo as três telas. Ele foi abandonado ao chegar a hora de fazê-lo: fundir
> as três exigia fundir três folhas de estilo que definem as mesmas classes (`.cartao`,
> `.aviso`, `button`, `input` — e o `controle.css` repete as cores do `evento.html` **de
> propósito**), fundir três marcações, e refatorar `portaria.js`, `evento.js` e `controle.js`
> para deixarem de arrancar sozinhos. Cirurgia grande em cima da portaria, que está aprovada
> e rodando. O desenho abaixo entrega o mesmo aplicativo sem nada disso.

Um aplicativo instalável **não precisa ser uma página só**. Precisa de um **escopo** — um
prefixo de URL comum. E dá para dar um prefixo comum às três telas **sem mover arquivo
nenhum**, por reescrita na Vercel:

```
/ic/            →  frontend/inicio.html    a casa: Meus Eventos e + Novo Evento
/ic/:arquivo    →  frontend/:arquivo       controle.html, evento.html, portaria.html…
```

Escopo `/ic/`. As três telas continuam **três páginas separadas**, cada uma com a sua folha
de estilo e o seu JavaScript, exatamente como estão hoje. Trocar de tela é navegação — e
navegação dentro do escopo continua dentro do aplicativo instalado.

O nome curto é de propósito: ele aparece na barra de endereço de quem ainda não instalou, e
entra no QR do Pedido, que é lido de foto de WhatsApp comprimida — cada caractere a menos é
um módulo a menos no QR.

### O que muda em cada arquivo

**Os caminhos dos arquivos passam a ser relativos.** Hoje as páginas pedem
`/controle.css?v=609`, com barra na frente. Em `/ic/controle.html` isso continuaria pedindo
`/controle.css` — que a Vercel serve, mas que fica **fora do escopo `/ic/`** e portanto fora
do alcance do service worker. Sem service worker não há "abrir sem rede", que é a única
coisa que a portaria não pode perder.

`controle.css?v=609`, sem barra, resolve para `/ic/controle.css` na Vercel e para
`/controle.css` na estação — os dois certos, com uma escrita só.

**Os dois construtores de URL** — [acesso_api.py:505](../../../acesso_api.py) e
[controle.js:948](../../../frontend/controle.js) — passam a gerar `/ic/evento.html?t=` e
`/ic/portaria.html?e=`.

**As URLs de hoje continuam valendo**, por redirecionamento declarado na Vercel (e não por
página-fantasma no repositório): `/evento.html?t=…` leva a `/ic/evento.html?t=…`, com a
querystring preservada. É isso que mantém vivo o QR do Pedido que já circula por WhatsApp e
o endereço que já foi passado a porteiro. A estação, que não é a Vercel, continua servindo
os arquivos na raiz como sempre serviu.

### A casa, e o despacho do QR

`frontend/inicio.html` é a única página nova. Ela é a casa — **Meus Eventos** e **+ Novo
Evento** — e é ela que abre a câmera.

Ler um QR é obter uma URL e olhar o parâmetro:

```
?t=<token>      → /ic/evento.html?t=…     reivindicar o pedido
?e=<evento_id>  → /ic/portaria.html?e=…   a portaria
outra coisa     → "Este QR não é do Ideal Control."
```

**Uma câmera, dois tipos de QR** — o próprio QR diz o que ele é. Não existe seletor de modo
para o usuário errar.

### Aparelho de portaria abre no portão

O porteiro precisa abrir **sem rede e sem login**, e a casa começa perguntando a sessão ao
Supabase, que é ida à rede. Então a casa faz **uma pergunta antes de qualquer outra**: há
token de aparelho guardado (`ideal_portaria_token`)? Havendo, ela manda para
`/ic/portaria.html` na hora, sem tocar em autenticação.

O `start_url` do manifesto é `/ic/`, e é essa pergunta que faz o ícone abrir no lugar certo
para cada pessoa.

## As telas

### Casa

O que ela mostra depende do que o aparelho **é**, e não de um modo escolhido:

| Estado do aparelho | A casa mostra |
|---|---|
| configurado como portão | o cartão do portão, grande, como primeira coisa — com o nome que o dono deu e os setores liberados; e um "Ler um QR" discreto |
| logado, sem portão configurado | **Meus Eventos** (a lista que já existe) e **+ Novo Evento** |
| nada ainda | **Ler um QR** e **Entrar com a conta do Vibe** |

"Entrar" nunca é exigido para ler um QR: o porteiro não tem conta, e pedir login a ele
seria travar o portão numa credencial que ninguém lhe deu.

### + Novo Evento (a câmera)

Reusa `portaria-camera.js`, que hoje entrega o texto lido chamando
`window.portaria.validarTexto` direto. Passa a receber **quem chamar** — `ligar(aoLer)` —,
com a portaria continuando a passar a função dela. Sem isso, seriam dois leitores de câmera
quase iguais, e o segundo herdaria os defeitos que o primeiro já corrigiu.

O texto lido é tratado como URL:

- casa com a nossa origem e tem `?t=` → reivindicar;
- casa com a nossa origem e tem `?e=` → parear a portaria;
- qualquer outra coisa → *"Este QR não é do Ideal Control."*

Recusar QR de fora não é zelo abstrato: sem isso, um QR qualquer de rua faria a tela abrir
um fluxo com dado estranho dentro.

### O aparelho da portaria: o dono configura ali, com uma senha só

**Decisão do usuário, 16/08/2026:** *"o dono faz a configuração em cada aparelho, apenas uma
senha, nomeia o aparelho e libera o setor. ao salvar registra apenas entradas configuradas,
e não deixa editar mais, somente com a senha"*.

Isso substitui o pareamento de hoje, e **o código de seis caracteres deixa de existir**.

| | Hoje | Passa a ser |
|---|---|---|
| Onde se configura | na tela do dono, longe do portão | **no próprio aparelho**, com o dono na frente dele |
| O que se digita | e-mail + senha (para entrar) **e** a senha de novo (para elevar) **e** o código de 6 no celular do portão | **a senha, uma vez**, no aparelho |
| Quem nomeia o portão | o dono, à distância, adivinhando qual celular é qual | o dono, com o aparelho na mão |

O fluxo inteiro, no aparelho:

1. o dono abre o aplicativo e escolhe o evento — pela lista, ou lendo o QR do portão;
2. digita **a senha** (a mesma da conta do Vibe; não existe uma segunda);
3. **nomeia o aparelho** — "Portão A", "Camarote";
4. **libera os setores** que este aparelho valida;
5. salva. O aparelho passa a ler ingressos e **só registra entrada dos setores liberados**.

Daí em diante ele está **travado**: abre direto na leitura. "Configurar este aparelho" existe,
e pede a senha de novo — conferida no servidor, na hora.

**A trava cobre também apagar.** Desparear e limpar a configuração pedem a mesma senha.
Uma trava que protege a edição e deixa o apagar livre não é trava: desfaz-se o trabalho
inteiro e refaz-se do zero sem senha nenhuma.

#### O que o aparelho guarda depois de salvar — e o que ele esquece

Guarda **só o token do aparelho**. A sessão da conta do dono é **encerrada ali mesmo**,
assim que ele salva.

Isso não é detalhe de implementação, é o ponto que faz a mudança valer. O código de seis
caracteres existia para que a senha do dono nunca chegasse ao celular que fica com o
porteiro. Trocá-lo pela senha, e depois **deixar a sessão aberta**, entregaria ao porteiro
a conta inteira do cliente — os eventos, a configuração, tudo. Encerrando a sessão, o
aparelho volta a ser o que era: um terminal com um token que só serve para ler ingresso
daquele evento, naqueles setores.

Consequência a dizer em voz alta: **sem rede não se configura aparelho.** Conferir a senha
é ida ao servidor. Isso é aceitável e é a divisão certa — configurar é ato do dono, feito
com sinal, uma vez; ler ingresso é o que precisa funcionar no portão sem sinal, e continua
funcionando pelo IndexedDB.

#### O que fica na tela do dono

A lista de aparelhos continua lá, e continua podendo **revogar** — celular perdido, porteiro
desligado, aparelho trocado de mão. O que sai de lá é **criar e editar**: isso passa a
acontecer no aparelho. Revogar à distância é a única coisa que só se pode fazer de longe, e
por isso é a única que fica.

O freio de força bruta continua: `producao_acesso_falhas_pareamento` passa a contar tentativa
de **senha** em vez de tentativa de código, na mesma tabela e com a mesma regra — dez erros
em cinco minutos fecham a configuração daquele evento por um tempo.

### Reivindicar e configurar

Continuam sendo `evento.html` e `controle.html`, **inteiros e intocados** — é o ganho do
desenho revisto. Delas muda uma coisa só: os caminhos dos arquivos que elas pedem passam a
ser relativos, para caírem dentro do escopo `/ic/` e, portanto, dentro do alcance do service
worker.

## O CDN tem de sair primeiro

Descoberto ao detalhar o plano, e é pré-requisito de tudo o mais.

`controle.html` e `evento.html` carregam **dois arquivos de CDN**:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
```

`portaria.html` não carrega nenhum, e diz isso no próprio comentário: *"todo arquivo que ela
usa é local — e não pode haver"*. Existe até um teste que varre a página atrás de `script`,
`link` e `img` de fora (`test_a_tela_da_portaria_nao_carrega_nada_de_fora`).

Pôr as três dentro de um aplicativo instalável faz o CDN entrar no caminho. Isso é
inaceitável por duas razões independentes:

- **Sem rede não abre.** Um `<script>` de fora que não carrega derruba a página inteira, que
  é justamente o que o service worker existe para impedir — e ele não pode impedir: resposta
  de outra origem é opaca, então não há como guardá-la. Um aplicativo instalado que morre sem
  rede em três das quatro páginas não é um aplicativo instalado.
- **Cadeia de suprimento.** Estas telas guardam a sessão do dono e configuram quem entra num
  evento. Buscar o código de autenticação num terceiro a cada carregamento significa que quem
  controlar aquele endereço controla o portão.

**Os dois passam a ser servidos daqui**, como o `jsqr.min.js` já é — foi vendorizado pela
mesma razão.

Carregá-los **sob demanda** foi considerado e descartado: `supabase-config.js` cria o
cliente no momento em que é carregado (`supabase.createClient(...)` no corpo do arquivo),
então adiar o SDK exigiria mexer justamente no arquivo cujo defeito de escopo já custou duas
publicações a este projeto. Servidos localmente e guardados pelo service worker, eles custam
o tempo de interpretar um arquivo que já está no aparelho — e nenhuma ida à rede.

Entram na `PAINEL_ARQUIVOS` junto com os demais, para a estação continuar servindo as telas
inteiras.

## As duas fases

O trabalho se parte em duas, e a primeira entrega algo usável sozinha:

| | O que entra | Pareamento |
|---|---|---|
| **Fase 1** | tirar o CDN, o prefixo `/ic/`, a casa (`inicio.html`), caminhos relativos, manifesto, service worker no escopo novo, o convite para instalar, e a câmera do **+ Novo Evento** | continua o de hoje (código de seis) |
| **Fase 2** | o dono configurando no próprio aparelho: uma senha, nomear, liberar setor, travar; e a tela do dono perdendo criar e editar | passa a ser por senha |

Separadas porque a Fase 2 muda o modelo de segurança, e misturá-la com a mudança de casca
faria uma publicação em que, se algo sair errado, não se sabe qual das duas foi.

## Instalar

**Um manifesto** (`/ic/app.webmanifest`), escopo e `start_url` em `/ic/`, os mesmos cinco
ícones já gerados, `display: standalone`, cores `#0a0f1e`.

**Um service worker** em `/ic/sw.js`, escopo `/ic/`. Ele guarda **só a casca**: os HTML, JS e
CSS das quatro páginas. **Nunca a API** — configuração de evento servida de cache mentiria
sobre o que está no banco, e neste projeto o que o parceiro escreve no banco é a origem da
verdade. Quem precisa decidir sem rede é a portaria, e ela decide pelo IndexedDB, que não é
cache de rede.

O service worker de hoje vive em `/sw.js` com escopo `/portaria.html`. O arquivo é o mesmo e
continua sendo `frontend/sw.js` — o que muda é **o endereço por onde ele é registrado**
(`/ic/sw.js`, que a reescrita resolve para o mesmo arquivo) e, com ele, o escopo. A página de
redirecionamento não existe mais para desregistrar o antigo: quem estava em
`/portaria.html` é levado a `/ic/portaria.html` pelo redirecionamento da Vercel, e o registro
velho morre sozinho quando o navegador não achar mais o script na origem antiga.

**O convite para instalar** é o que falta para "receber um link e instalar". Não existe link
que instale; o link é a URL, e quem instala é o navegador. Então a casa mostra:

- no Android, um botão **"Instalar aplicativo"** que só aparece quando o navegador avisa que
  dá (`beforeinstallprompt`), e some depois de instalado;
- no iPhone, onde não existe evento nenhum, uma linha com o caminho: Compartilhar →
  Adicionar à Tela de Início. Mostrada **só** no Safari de iOS e **só** quando a página não
  está rodando já instalada.

## O que a decisão de "um aplicativo" custa, dito de frente

Os dois modos **não compartilham credencial**: o token do aparelho só serve para ler
ingresso daquele evento, e não abre a conta; entrar na conta não dá acesso ao portão de
outro aparelho.

O risco que a decisão cria é concreto e tem nome: **o dono digita a senha dele num celular
que fica com outra pessoa.** Era exatamente isso que o código de seis caracteres evitava.

O que responde a esse risco é a regra da seção anterior — **a sessão da conta é encerrada
assim que o aparelho é salvo**. Sem ela, o desenho seria pior do que o de hoje, e não
melhor. Junto com ela, entram duas medidas:

- **"Sair da conta"** visível na casa, e não escondido dentro da configuração — para o caso
  de o dono ter entrado num aparelho e não ter chegado a configurá-lo;
- aparelho configurado **abre no portão**, e a conta fica atrás de um toque explícito. O
  celular do portão não pode mostrar a configuração do evento de relance.

## Fora deste desenho, de propósito

- **Funcionar sem rede na configuração.** Só a portaria decide offline.
- **Trazer as telas da gráfica** (`index.html`, `producao.html`) para o aplicativo. Outro
  público, outro escopo, e a estação já roda o NewProd.
- **Notificação push.** Não há nada que o servidor precise contar sem que alguém pergunte.
- **Apagar `evento.html`, `portaria.html` e `controle.html`.** Eles continuam como apelidos,
  e é isso que mantém vivo o que já circula.

## Como se prova que funciona

- **Estrutura, em pytest:** manifesto válido com escopo `/ic/`; os redirecionamentos
  declarados na Vercel preservando a querystring; nenhuma das quatro páginas pedindo arquivo
  por caminho absoluto (é o que as tira do alcance do service worker); o service worker sem
  nada de API; a câmera recebendo callback em vez de chamar a portaria pelo nome.
- **Navegador de verdade, com puppeteer** (o arnês já existe em `tests/`): abrir `/ic/` com
  token de aparelho guardado leva à portaria **sem** nenhuma requisição de autenticação; um
  QR do Pedido lido pela câmera leva a `/ic/evento.html?t=…`; um QR de outra origem é
  recusado com a mensagem certa.
- **A trava do aparelho, que é o que a decisão de 16/08 acrescenta:** salvar encerra a
  sessão da conta (o `localStorage` do Supabase fica sem sessão, e só o token do aparelho
  permanece); reabrir a configuração exige a senha e o servidor a confere; **desparear e
  limpar também exigem a senha**; e uma leitura de setor não liberado é recusada como
  `setor_nao_autorizado`, que é o laranja que já existe.
- **No aparelho:** instalar no Android, configurar o portão com a senha, ler um ingresso, pôr
  em modo avião e confirmar que continua validando — e que **não** dá para reconfigurar sem
  rede. No iPhone, o caminho do compartilhar.

O teste que mais importa continua sendo o que já existe: o hash do navegador batendo com o
do Python. Se divergirem, todo ingresso do evento é recusado na porta.
