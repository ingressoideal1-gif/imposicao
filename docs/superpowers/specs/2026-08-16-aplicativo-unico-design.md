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

## A arquitetura: uma página, três telas, três apelidos

Nasce **`frontend/app.html`**: uma página só, que contém as três telas e é o aplicativo
instalável. O escopo é `/app.html` — estreito, e por isso incapaz de capturar as telas da
gráfica.

As três URLs de hoje viram **apelidos** que redirecionam para ela, preservando a
querystring:

| URL de hoje | Vira | Abre |
|---|---|---|
| `evento.html?t=<token>` | `app.html?t=<token>` | reivindicar o pedido |
| `portaria.html?e=<evento>` | `app.html?e=<evento>` | a portaria |
| `controle.html?evento=<id>` | `app.html?evento=<id>` | configurar o evento |
| — | `app.html` | a casa: Meus Eventos e + Novo Evento |

Isso preserva **tudo o que já circula**: o QR do Pedido impresso e mandado por WhatsApp, o
endereço que a tela do dono mostra ao porteiro, e a lista `PAINEL_ARQUIVOS` continua plana
(ganha um nome, não uma pasta). Os dois construtores de URL —
[acesso_api.py:505](../../../acesso_api.py) e
[controle.js:948](../../../frontend/controle.js) — passam a gerar `app.html`, e os apelidos
cobrem o que já foi emitido.

### O roteador é a própria querystring

Não há rota nova a inventar: os três parâmetros que já existem dizem qual tela abrir.

```
?t=<token>      → reivindicar o pedido            (o QR do Pedido)
?e=<evento_id>  → o portão deste aparelho:        (o QR do portão)
                    já configurado  → ler ingresso
                    ainda não       → configurar (pede a senha do dono)
?evento=<id>    → configurar o evento
nada            → casa
```

E é exatamente o mesmo despacho que a câmera usa: ler um QR é obter uma URL, tirar dela o
parâmetro, e chamar a mesma função. **Uma câmera, dois tipos de QR** — o próprio QR diz o
que ele é. Não existe seletor de modo para o usuário errar.

### A ordem de arranque, que não é detalhe

O porteiro precisa abrir **sem rede e sem login**. O `controle.js` de hoje começa
perguntando a sessão ao Supabase, que é ida à rede. O roteador tem de decidir **antes**
disso:

1. tem aparelho pareado guardado (`ideal_portaria_token`)? → abre a portaria, sem tocar em
   autenticação;
2. senão, resolve pela querystring;
3. só a casa e a configuração é que perguntam a sessão.

Inverter isso faz o portão depender de rede — que é a única coisa que a portaria não pode
fazer.

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

Reusam `evento.js` e `controle.js` **como estão**, não copiados. Duas cópias divergiriam, e
o sintoma seria a gráfica cadastrando de um jeito e o cliente de outro — é a mesma razão
pela qual as regras de negócio de hoje são compartilhadas entre a tela do cliente e a da
gráfica.

O que muda neles: os dois hoje se iniciam sozinhos ao carregar e falam com ids de DOM da
própria página. Passam a expor uma função de abertura que o roteador chama — e só ela toca
no DOM.

## Instalar

**Um manifesto** (`app.webmanifest`), escopo e `start_url` em `/app.html`, os mesmos cinco
ícones já gerados, `display: standalone`, cores `#0a0f1e`.

**Um service worker** em `/sw-app.js`, escopo `/app.html`. Ele guarda **só a casca**: os
HTML, JS e CSS das três telas. **Nunca a API** — configuração de evento servida de cache
mentiria sobre o que está no banco, e neste projeto o que o parceiro escreve no banco é a
origem da verdade. Quem precisa decidir sem rede é a portaria, e ela decide pelo IndexedDB,
que não é cache de rede.

O `sw.js` da portaria de hoje **sai**, e o novo assume: manter os dois vivos deixaria dois
service workers com escopos que se encavalam na mesma origem.

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

- **Estrutura, em pytest:** manifesto válido com escopo `/app.html`; os três apelidos
  redirecionando com a querystring preservada; o service worker sem nada de API; a câmera
  recebendo callback em vez de chamar a portaria pelo nome.
- **Navegador de verdade, com puppeteer** (o arnês já existe em `tests/`): abrir
  `app.html?e=…` com token guardado abre a portaria **sem** nenhuma requisição de
  autenticação; abrir `app.html?t=…` abre a reivindicação; um QR de outra origem é recusado
  com a mensagem certa.
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
