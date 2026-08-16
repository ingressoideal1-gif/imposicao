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
?t=<token>      → reivindicar      (o QR do Pedido)
?e=<evento_id>  → portaria         (o QR do portão)
?evento=<id>    → configurar
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
| pareado na portaria | o cartão do portão, grande, como primeira coisa; e um "Ler um QR" discreto |
| logado, sem pareamento | **Meus Eventos** (a lista que já existe) e **+ Novo Evento** |
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

Os dois modos **não compartilham credencial**: parear um portão não dá acesso à conta, e
entrar na conta não dá acesso ao portão de outro aparelho. O que muda é a **exposição** — um
aparelho passa a poder as duas coisas, se alguém fizer as duas nele.

O caso concreto: o dono entra com a conta dele no celular e entrega o aparelho ao porteiro.
A sessão do Supabase fica no aparelho, e o porteiro consegue **ver** os eventos do dono.
Editar continua exigindo a senha cadastrada, que é conferida na hora — essa trava já existe
e não muda aqui.

Duas medidas entram por causa disso:

- **"Sair da conta"** visível na casa, e não escondido dentro da configuração;
- quando o aparelho está pareado como portaria, a casa **abre no portão** e a conta fica
  atrás de um toque explícito. O aparelho do portão não pode mostrar a configuração do
  evento de relance.

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
- **No aparelho:** instalar no Android, parear pelo QR, ler um ingresso, pôr em modo avião e
  confirmar que continua validando. No iPhone, o caminho do compartilhar.

O teste que mais importa continua sendo o que já existe: o hash do navegador batendo com o
do Python. Se divergirem, todo ingresso do evento é recusado na porta.
