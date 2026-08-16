# Ideal Control — o novo fluxo do aplicativo

**Data:** 16/08/2026
**Decidido com o usuário nesta conversa.** Todas as escolhas abaixo foram
respondidas por ele; onde eu recomendei e ele aceitou, está registrado como
decisão dele.

---

## O problema

O `/ic/` de hoje é uma tela de configuração que também sabe listar eventos. O
dono entra com a conta do Vibe, escolhe o evento num cartão de texto, e cai numa
página longa — dados do evento, setores, aparelhos, três caixas diferentes de
código de seis caracteres, uma caixa de pareamento com QR. Quando o celular vira
portão, ele guarda um token e a casa passa a desviar direto para a leitura: dali
em diante, aquele aparelho não tem mais lista nenhuma.

Três coisas doem nisso:

1. **A casa não parece a casa.** O que se vê primeiro é login e formulário, não
   os eventos.
2. **O código de seis caracteres é um passo inteiro que ninguém precisa mais.**
   Ele existia para a senha do dono não chegar ao celular do porteiro; o
   caminho "Usar ESTE aparelho" já resolve isso encerrando a sessão.
3. **Um celular só serve a um evento.** Quem trabalha em dois eventos na mesma
   semana não tem como voltar.

## O que vamos construir

A casa vira a lista da imagem que o usuário anexou, o portão nasce de um toque
na barra do evento, e tudo o que é configuração se recolhe atrás de uma
engrenagem com senha.

---

## 1. A tela inicial

`/ic/` (`controle.html`) abre **sempre** na lista. O desvio automático para a
portaria sai.

```
┌──────────────────────────────────────────┐
│  [NPI]  Ideal Control                    │
│         Controle de Acesso               │
│                                          │
│  ┌────────────────────────────┐   ╭───╮  │
│  │      Novo Evento           │   │ + │  │
│  └────────────────────────────┘   ╰───╯  │
│                                          │
│              Meus Eventos                │
│  ┌────────────────────────────┐   ╭───╮  │
│  │ ● Click              [📱]  │   │ ⚙ │  │
│  └────────────────────────────┘   ╰───╯  │
│  ┌────────────────────────────┐   ╭───╮  │
│  │ ○ Fenachamp          [📱]  │   │ ⚙ │  │
│  └────────────────────────────┘   ╰───╯  │
└──────────────────────────────────────────┘
```

- **Novo Evento** e o **`+`** fazem a mesma coisa: abrem a câmera do
  `ler-qr.js`, que já distingue o QR do Pedido do QR do portão. São dois alvos
  para uma ação só porque a barra é o rótulo em texto e o `+` é o ícone que a
  linha de evento repete com a engrenagem — a coluna da direita fica coerente.
- **A luz** é verde quando **este aparelho já é portão daquele evento**, e
  apagada quando não é. Decisão do usuário, contra as alternativas "evento
  ativo" e "as duas coisas".
- **O ícone de celular-com-QR** dentro da barra é a affordance de "toque aqui
  para ler ingressos". A barra inteira é o alvo de toque; o ícone não é um
  segundo botão.
- **A engrenagem** fica FORA da barra, como na imagem, para que o toque no
  evento nunca caia na configuração por engano.
- **Evento inativado** (seção 6.2) leva a palavra `inativo` em texto na barra,
  ao lado do nome. A luz não serve para isso — ela já significa outra coisa —, e
  sem essa palavra um evento desligado ficaria idêntico a um ligado na tela de
  quem vai abrir o portão.

Os três PNGs que o usuário deixou em `frontend/` (`3756332.png` celular-com-QR,
`6704985.png` engrenagem, `images.png` QR) são a referência visual; eles são
redesenhados como SVG embutido no HTML. A tela precisa abrir sem rede, e ícone
embutido é uma requisição a menos que pode falhar — além de acompanhar a cor do
tema, o que um PNG de cor fixa não faz.

### De onde vem a lista

A lista é a **união** de duas fontes:

| Fonte | Quando aparece | Precisa de rede? |
|---|---|---|
| O chaveiro deste aparelho | Sempre | Não |
| `GET /meus-eventos` da conta | Só com sessão aberta | Sim |

Um evento que está nas duas aparece uma vez, com luz verde. Um evento só da
conta aparece com a luz apagada. Um evento só do chaveiro aparece verde mesmo
sem internet e sem conta — que é exatamente o celular do porteiro no dia do
evento.

---

## 2. O chaveiro

Hoje o aparelho guarda um token só, em `localStorage`:

```
ideal_portaria_token   = "<token>"
ideal_portaria_evento  = "<evento_id>"
```

Passa a guardar uma lista, sob a chave `ideal_control_portoes`:

```json
[
  { "evento_id": "…", "nome_evento": "Click",
    "aparelho_id": "…", "nome_portao": "Portão 1", "token": "…" }
]
```

`nome_evento` e `nome_portao` são cópias do que o servidor disse na última vez.
Estão aqui só para desenhar a lista sem rede; a verdade continua sendo o banco,
e a engrenagem relê o painel sempre que abre.

### Migração, e por que ela não é opcional

Todo celular que **já é portão hoje** tem as duas chaves antigas e nenhuma
entrada no chaveiro. No primeiro arranque da versão nova, se houver
`ideal_portaria_token`, ele vira uma entrada do chaveiro e as chaves antigas
são preservadas (não apagadas) — a portaria continua lendo `ideal_portaria_token`
como faz hoje, e o chaveiro é a camada nova por cima.

Sem essa migração, cada portão que está trabalhando na gráfica acordaria com o
evento dele apagado na lista, e o porteiro teria de chamar o dono para
reconfigurar no meio do evento.

### O que NÃO muda: a carga continua de um evento por vez

O `portaria-deposito.js` guarda a carga do evento sob a chave `'unica'`, e a
fila de leituras numa loja só. **Isso fica como está.** Chavear as três lojas
por evento é onde bug de contagem nasce — e a contagem é o que o cliente paga
para ter. A regra registrada em `nao-regredir-o-que-esta-aprovado` vale aqui: a
máquina offline está aprovada e rodando desde 15/08.

Consequência: o chaveiro sabe de vários eventos, mas o aparelho só tem **um
carregado** por vez. Tocar num evento verde que **não** é o carregado:

1. Exige a fila zerada — a mesma trava, com a mesma frase, que o
   `irParaConfiguracao()` do `portaria.js` já aplica hoje.
2. Baixa a carga do novo evento e chama `esquecerFila()` (que existe
   exatamente para "o aparelho trocou de evento").
3. Troca `ideal_portaria_token` / `ideal_portaria_evento` pelos daquele portão.

Se a fila não estiver vazia, a tela recusa e explica — trocar de evento com
leitura pendente perderia entrada já contada.

---

## 3. Tocar na barra do evento

**Luz verde, evento já carregado:** vai direto para a leitura. Nenhum passo no
meio. É o caso do dia do evento, e é o que a decisão "vai direto para a leitura"
pediu.

**Luz verde, outro evento carregado:** o passo de troca da seção 2, e então a
leitura.

**Luz apagada (este aparelho ainda não é portão):**

1. Pede a senha (elevação de 15 minutos, `entrarEElevar` se não houver sessão).
2. `POST /eventos/{id}/aparelhos/aqui` com:
   - `nome`: automático, `"Portão N"`, onde N = quantidade de portões que o
     painel já lista + 1. Decisão do usuário: nasce nomeado e já lê; renomear é
     na engrenagem, de qualquer aparelho.
   - `setores`: **todos** os setores do evento. Um portão sem setor recusa tudo
     na porta, e o dono acabou de dizer que quer ler — restringir é escolha
     posterior, feita na engrenagem.
3. Guarda a entrada no chaveiro e nas chaves antigas.
4. Baixa a carga.
5. **Encerra a sessão da conta** (`aparelho.js`, na ordem que ele já protege:
   token primeiro, `signOut` depois, navegar por último).
6. Vai para a leitura.

**Um portão por aparelho, e não um por carregamento.** Decisão do usuário. Abrir
o mesmo evento de novo no mesmo celular volta ao portão que já existe; nunca
duplica. É o chaveiro que responde essa pergunta, sem ida ao servidor.

### A consequência que o usuário aceitou

Encerrar a sessão faz os eventos que estavam vindo de `/meus-eventos` sumirem
da lista. Ficam os verdes. Para ver ou acrescentar outro evento, o dono entra de
novo — pela engrenagem ou pelo `+`. Foi a escolha "a lista fica, do que está
guardado aqui", e é ela que mantém a conta do dono fora do celular do porteiro.

---

## 4. A engrenagem

### Como ela autoriza

No celular do porteiro não existe sessão. A engrenagem faz um **login relâmpago**:

- Pede e-mail e senha do Vibe. O **e-mail** fica lembrado no aparelho
  (`localStorage`), a **senha nunca**.
- Uma senha só faz as duas coisas — `AcessoConta.entrarEElevar()` já existe e já
  faz login e elevação numa digitação.
- Ao fechar a engrenagem, `signOut()`. A elevação de 15 minutos morre junto.

Decisão do usuário, contra a alternativa de dar poder de configuração ao token
do portão: aquela exigiria caminho novo no servidor e ampliaria o que um celular
perdido consegue fazer.

### O que tem dentro

Quatro blocos, na ordem:

**Evento**
- Ativar / Inativar o evento (novo — ver seção 6)
- Nome do evento, data e hora, local (o que já existe)

**Portões**
- Todos os portões do evento, de todos os celulares — a decisão do usuário foi
  explícita: *"todos os portões aparecem em todos os aparelhos"*. O painel já
  devolve essa lista.
- Por portão: renomear ("Nomear dispositivo"), escolher os setores que ele
  valida, revogar.
- O portão **deste** aparelho vem marcado, para o dono não renomear o errado.
- A configuração de setores é por portão e pode ser feita de qualquer aparelho,
  desde que com a senha — decisão do usuário.

**Setores**
- **Bloquear o setor inteiro** (novo — ver seção 6)
- Nome na portaria · Quando vale · Uso do ingresso · Bloquear faixa de números ·
  Códigos de staff e cortesia (tudo isso já existe e passa para cá inteiro)

**Este aparelho**
- Sair deste portão (leva à lista, sem apagar fila)

---

## 5. O que sai

Decisão do usuário: *"retirar todas as opções de gerar código"*, e a resposta
"sim, todas, e enxugando".

Some da tela:

- `#caixa-codigo` (a caixa que mostra o código de 6 caracteres uma vez)
- O botão "Gerar outro código" de cada cartão de aparelho
- O cartão "crie um aparelho para outro celular"
- `caixaDePareamento()` — o QR e o endereço da portaria
- A tela `#tela-pareando` da portaria, onde se digita o código

**As rotas do servidor ficam vivas por um release.** `POST /eventos/{id}/aparelhos`,
`POST /aparelhos/{id}/codigo` e `POST /portaria/entrar` continuam funcionando.
Apagar servidor e tela na mesma leva não deixaria volta se o caminho novo
tropeçar no portão. A limpeza é de um release seguinte, depois de um evento de
verdade — a mesma cautela que o comentário do `controle.html` já registrava
quando o "Usar ESTE aparelho" estreou.

---

## 6. Duas coisas novas no banco e no servidor

### 6.1 Setor bloqueado

Hoje dá para bloquear uma **faixa de números** dentro do setor, mas não o setor
inteiro. Duas colunas novas em `producao_acesso_setores`:

```sql
bloqueado          BOOLEAN NOT NULL DEFAULT false,
bloqueado_motivo   TEXT
```

**Coluna nova, e não `status`.** O `status` já existe e vale `'ativo'`; o painel
filtra por `status=eq.ativo`, então marcar um setor como bloqueado ali o faria
**sumir da tela** — o dono bloquearia o setor e perderia o botão de desbloquear.

- `PATCH /setores/{id}` passa a aceitar `bloqueado` e `bloqueado_motivo`.
- O `painel()` inclui as duas colunas no `select`.
- A portaria recusa: o motivo é o que o porteiro lê em voz alta, como já
  acontece com a faixa bloqueada. Recusa em **vermelho**, não laranja — laranja
  é "ingresso bom na porta errada", e este ingresso não entra em porta nenhuma.
- A carga do evento passa a carregar os dois campos, para a decisão continuar
  sendo tomada sem rede.

O SQL sai como arquivo completo, pronto para colar no editor do Supabase, com o
"como desfazer" no fim — a regra registrada em `sql-sempre-pronto-para-colar`.

### 6.2 Evento inativo

A coluna `status` de `producao_acesso_eventos` já existe (`ativo | encerrado |
excluido`), mas `aplicarEvento()` não a aceita e nada na tela a mexe.

- `PATCH /eventos/{id}` passa a aceitar `status`, restrito a `'ativo'` e
  `'encerrado'`. `'excluido'` **não** entra: apagar evento não é o que a
  engrenagem oferece, e aceitar aqui abriria caminho para isso por engano.
- `GET /meus-eventos` hoje filtra `status=eq.ativo`. Precisa deixar de filtrar,
  senão inativar o evento o faz sumir da lista do próprio dono, sem volta.
- A portaria recusa quando o evento não está ativo, com frase própria: *"Este
  evento está inativo. Procure o organizador."*
- A carga carrega o estado do evento.

**Ressalva honesta, que vai para a tela:** um portão **sem rede** só descobre
que o evento foi inativado quando sincronizar. Não há como ser diferente — a
decisão offline é tomada com a carga que o aparelho tem. A engrenagem diz isso
em uma frase ao inativar, para o dono não guardar o celular achando que os
portões pararam no mesmo segundo.

---

## 7. A parede do PWA

Decisão do usuário: *"exige instalar sempre"*, com a ressalva *"deixar passar só
nesse caso"* quando o navegador não souber instalar.

Arquivo novo, `frontend/parede-pwa.js`, carregado no `controle.html`:

1. Se `display-mode: standalone` (ou `navigator.standalone` no iOS), não faz
   nada. O aplicativo está instalado.
2. Se não, espera até 1,5 s por um `beforeinstallprompt`. Se ele vier, mostra a
   parede de tela cheia com o botão que dispara o prompt.
3. iPhone no Safari não dispara esse evento nunca. Reconhecido pelo user agent,
   recebe a parede com a instrução em texto: **Compartilhar → Adicionar à Tela
   de Início**.
4. Nenhum dos dois (Firefox no PC, Safari no Mac, navegador embutido de app):
   **a parede não aparece** e o aplicativo funciona em aba. É a ressalva do
   usuário, e ela evita trancar alguém do lado de fora.

A parede é uma `<div>` que cobre a tela, com o logo, uma frase curta e a
instrução da plataforma. Não é um modal que se fecha — enquanto ela estiver ali,
o aplicativo não é usável.

### Um ajuste no que foi pedido

O manifesto fica em `display: "standalone"`, **não** `"fullscreen"`. A imagem de
referência mostra o relógio, o wi-fi e a bateria no alto da tela: isso é
`standalone`. `fullscreen` engole a barra de status do celular, e o porteiro
perde a hora e a carga da bateria — as duas coisas que ele mais olha durante um
evento. "Tela cheia" no sentido do pedido (sem a barra de endereço do
navegador) é o que o `standalone` já entrega.

---

## 8. Arquitetura dos arquivos

O `controle.js` tem 1.430 linhas e passa a fazer três coisas bem distintas: a
lista, a leitura e a configuração. Ele se parte:

| Arquivo | Responsabilidade | Depende de |
|---|---|---|
| `chaveiro.js` *(novo)* | Ler, gravar e migrar o chaveiro de portões. Puro, sem DOM, sem rede. | nada |
| `parede-pwa.js` *(novo)* | Decidir se a parede aparece e desenhá-la. | nada |
| `lista-eventos.js` *(novo)* | A tela inicial: desenhar as barras, unir as duas fontes, tratar o toque. | `chaveiro`, `AcessoConta` |
| `virar-portao.js` *(novo)* | Criar o portão, trocar de evento, a trava da fila. | `chaveiro`, `aparelho`, `portariaDeposito` |
| `controle.js` | Só a engrenagem: login relâmpago, os quatro blocos, gravação. | `AcessoConta`, `chaveiro` |
| `aparelho.js` | Inalterado no papel (token → signOut → navegar), passa a gravar no chaveiro. | `chaveiro` |
| `portaria.js` | Perde a tela de pareamento por código; o botão "Configurar" leva à lista. | `chaveiro` |

`chaveiro.js` e `virar-portao.js` são puros o bastante para teste de mesa — que
é onde a lógica de "um portão por aparelho" e a trava da fila precisam ser
provadas, sem câmera e sem servidor.

### Servidor e banco

| Arquivo | Mudança |
|---|---|
| `sql/schema_acesso_setor_bloqueado.sql` *(novo)* | As duas colunas |
| `supabase/functions/_compartilhado/configuracao.ts` | `aplicarSetor` aceita `bloqueado`/`bloqueado_motivo`; `aplicarEvento` aceita `status` |
| `supabase/functions/acesso-conta/index.ts` | `painel()` traz as colunas novas; `/meus-eventos` deixa de filtrar por status |
| `supabase/functions/portaria/…` | A carga traz evento e setor bloqueados; a validação recusa |
| `frontend/portaria-validacao.js` | As duas recusas novas, com as frases |

---

## 9. Testes

O que precisa de teste automático, e por quê:

- **`chaveiro.js`**: migração da chave antiga, um portão por aparelho (abrir
  duas vezes não duplica), remoção ao revogar.
- **`virar-portao.js`**: a trava da fila — trocar de evento com leitura
  pendente **recusa**; com fila zerada, troca e chama `esquecerFila()`.
- **`portaria-validacao.js`**: setor bloqueado recusa em vermelho com o motivo;
  evento inativo recusa com a frase própria. É o arquivo puro que já tem casos
  de mesa.
- **`configuracao.ts`**: `status` do evento aceita `ativo`/`encerrado` e recusa
  `excluido`; `bloqueado` exige booleano.
- **Navegador (a skill `rodar-app`)**: a lista desenha as duas fontes, o toque
  no verde vai para a leitura, o toque no apagado pede senha.

---

## 10. Publicação

Pela regra registrada em `agente-publica-junto-com-o-site`, esta mudança **exige
publicar o agente na mesma leva**, mesmo sendo quase toda de frontend: o
`NewProd.exe` embute uma cópia do frontend, e a estação instalada depois desta
publicação nasceria com o painel do build anterior.

Ordem: SQL no Supabase primeiro (as colunas precisam existir antes de o código
que as lê subir), depois `.\publicar.ps1`, depois `.\publicar_agente.ps1` com
número novo.

---

## O que ficou de fora, de propósito

- **Apagar as rotas de código do servidor.** Release seguinte (seção 5).
- **Carga do IndexedDB por evento.** O chaveiro resolve a lista; a carga
  continua de um evento por vez (seção 2).
- **Reativar portão revogado.** Continua sem existir, como hoje.
- **Excluir evento.** Não é o que a engrenagem oferece.
