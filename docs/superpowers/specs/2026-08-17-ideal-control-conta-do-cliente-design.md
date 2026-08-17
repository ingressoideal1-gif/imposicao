# Ideal Control — a conta do cliente traz os pedidos

**Data:** 17/08/2026
**Decidido com o usuário nesta conversa**, em quatro lotes de perguntas. Onde eu
recomendei e ele aceitou, está registrado como decisão dele. Onde ele corrigiu,
está registrado com as palavras dele.

---

## O problema

Hoje o cliente chega ao Ideal Control por um **QR do Pedido**: um token assinado
que a gráfica gera e manda por WhatsApp. Quem lê primeiro reivindica o pedido,
entra com "a conta do Vibe" e cria o evento. Três coisas não param de pé:

1. **O QR carrega o pedido.** Quem tiver a imagem — encaminhada, fotografada —
   cadastra o evento na conta errada, e não há como desfazer sem mexer no banco
   à mão (o 409 "já cadastrado por outra conta" é a única resposta).
2. **"A conta do Vibe" não existe para cliente nenhum.** Conferido no banco em
   17/08/2026: `auth.users` tem 25 contas — 24 são a equipe do ERP (tabela
   `usuarios`) e 1 é de teste. Os 65.874 clientes têm e-mail e nenhum tem login,
   e não há coluna ligando conta a `id_cliente`. Os 5 eventos existentes são
   todos da conta do próprio usuário.
3. **E-mail não chega.** O projeto não tem SMTP (`smtp_host` vazio, 2 e-mails
   por hora do serviço embutido, `site_url` e redirecionamentos apontando para o
   site do Vibe). "Esqueci minha senha" hoje não entrega ao cliente.

## O que vamos construir, em uma frase

**O QR passa a ser só o convite para instalar o aplicativo; a gráfica libera o
acesso do cliente com uma senha provisória; o cliente entra e vê os pedidos dele
já impressos em "Meus Pedidos"; carregar um pedido é o que o transforma em
evento e o leva para "Meus Eventos".**

E, por decisão do usuário no meio das perguntas: **"Portão" vira "Aparelho"** em
toda a interface — *"todo aparelho é portão"*.

---

## 1. A conta do cliente

### Como nasce

**A gráfica libera, com senha provisória.** No Ideal Control da gráfica, dentro
do pedido, o atendente vê o cliente (`propostas.id_cliente`) e clica **"Liberar
acesso"**:

- O sistema cria a conta na **mesma auth do Vibe** (GoTrue admin API, com a
  `service_role` que a Edge Function já tem), com o e-mail do cadastro do
  cliente ou um que o atendente digitar, `email_confirm: true`, e uma **senha
  provisória** de 8 caracteres do mesmo alfabeto sem `0 O 1 I L` que
  `sortearCodigo` já usa.
- Grava a ligação **conta ↔ cliente** numa tabela nossa (seção 8).
- Mostra a senha **uma vez só**, para o atendente passar ao cliente por
  telefone ou WhatsApp. Não depende de e-mail em nenhum passo.

**Se o e-mail já tiver conta** (um funcionário da gráfica, uma pessoa já ligada
a outro cliente): **só liga a conta ao cliente, sem mexer na senha**. O atendente
lê: *"Essa pessoa já tem conta; ela entra com a senha que já usa."* Nunca
redefinimos a senha de uma conta que não criamos — a tabela guarda
`criada_aqui` para o sistema saber a diferença.

**Dono do pedido é `id_cliente`** (quem comprou), não `id_faturado`. É o que o
sistema já usava ao criar o evento.

**Uma conta pode servir a mais de um cliente e um cliente pode ter mais de uma
conta.** A ligação é N:N. O caso normal é 1:1; o N:N existe para a segunda
pessoa do mesmo cliente e para a conta de teste da gráfica.

### A senha

- **Primeiro acesso obriga a trocar.** Enquanto `senha_provisoria_em` estiver
  preenchido, o app não passa da tela "Escolha a sua senha".
- **"Trocar minha senha"** fica no menu do olho: senha atual + nova. O servidor
  confere a atual (`conferirSenha`, o mesmo do `/elevar`) e grava a nova pela
  admin API — tudo numa rota só, para a marca de provisória ser apagada no
  mesmo ato.
- **"Esqueci minha senha"** deixa de mandar e-mail. O botão fica (toda trava
  tem saída) e diz: *"Peça à gráfica uma nova senha provisória."* No painel, o
  atendente tem **"Nova senha provisória"**, que só existe para conta que a
  gráfica criou (`criada_aqui = true`); a anterior deixa de valer no mesmo
  instante e a troca volta a ser obrigatória.

### A sessão — "como é hoje"

O usuário respondeu à pergunta da sessão com *"pedir a senha sempre que precisar
entrar em configuração, como é hoje"*. Fica então **exatamente como hoje**:

- A sessão do Supabase **persiste no celular** enquanto ele não é aparelho de
  nenhum evento. O dono abre o app no celular dele já logado.
- **No momento em que o celular vira aparelho**, a sessão sai
  (`aparelho.js`, ordem token → signOut → navegar). É o que mantém a conta do
  cliente longe do porteiro.
- **Toda configuração pede a senha**: a engrenagem continua abrindo com a caixa
  de e-mail (lembrado) e senha, elevação de 15 minutos, `signOut` ao fechar se
  a sessão nasceu ali. **Carregar um pedido também pede a senha** (seção 4).
- **"Sair da conta"** entra no menu do olho, para o dono que quer sair no
  celular dele.

---

## 2. A casa (`controle.html`)

### Ao abrir

| Situação | O que aparece |
|---|---|
| Chaveiro vazio **e** sem sessão (o cliente que acabou de instalar pelo QR; o celular do porteiro antes de virar aparelho) | **A tela de entrar, direto**: e-mail, senha, "Ainda não tem acesso? Peça à gráfica" |
| Sem sessão, com aparelho no chaveiro (o porteiro) | A lista, como hoje — só os eventos verdes |
| Com sessão (o dono no celular dele) | A lista: chaveiro ∪ eventos do cliente |

Depois de entrar: **Meus Pedidos** se a conta não tem evento nenhum; **Meus
Eventos** se tem. Se a conta não está ligada a cliente nenhum (um funcionário
que entrou por engano): *"Sua conta ainda não está ligada a um cliente. Peça à
gráfica."*

O `#bloco-entrar` que existe no HTML e nunca aparecia (achado M01 do raio-X)
volta a ter dono. Ao entrar, quem redesenha é o `lista-eventos.js`, com
`recarregar()` — não `arrancar()`, que reinstalaria o ouvinte do `+`.

### A barra do topo

**"Novo Evento" vira "Meus Pedidos"**, com o mesmo `+` ao lado. Toque → se não
há sessão, a tela de entrar; com sessão, a lista de pedidos (seção 3). A câmera
sai da casa: não há mais QR do Pedido nem QR de portão para ler. `ler-qr.js`,
`#caixa-qr`, `jsqr.min.js`, `portaria-camera.js`, `instalar.js`,
`qrcode-generator.min.js` e `qr-canvas.js` deixam de ser carregados pelo
`controle.html` (a portaria continua com a câmera dela).

### Meus Eventos

Continua a união de duas fontes — o chaveiro (sem rede) e `/meus-eventos` (com
sessão) —, com a mesma luz: verde = este aparelho já lê este evento; cinza =
evento do cliente, este aparelho ainda não; vermelha + "inativo". O que muda:

- **`/meus-eventos` passa a listar os eventos do CLIENTE**, não da conta:
  eventos cujo `id_cliente` está entre os clientes ligados à conta, mais os que
  têm `dono_auth_id = conta` (os 5 de teste de hoje continuam visíveis pela conta
  que os criou). Decisão do usuário: *duas pessoas do mesmo cliente veem e
  configuram os mesmos eventos e pedidos*.
- **Vocabulário**: "Ler ingressos", "Usar este aparelho neste evento",
  "Aparelhos deste evento", "Aparelho 1", "Sair deste aparelho". Nenhum
  "portão" sobra em texto de tela.

### O menu do olho

Eventos finalizados (como hoje) · **Trocar minha senha** · **Sair da conta**.

---

## 3. Meus Pedidos

Um estado novo da casa (`#meus-pedidos`), no lugar da lista, com "← Voltar aos
meus eventos" no topo — o mesmo padrão do menu do olho e da engrenagem.

### O que entra

**Só os já impressos.** Decisão do usuário. Um pedido aparece quando:

1. é de um cliente ligado à conta (`propostas.id_cliente`);
2. não está cancelado (`propostas.status_interno <> 'CANCELADO'` — no ERP, é o
   único estado que importa; `status_pedido` e `etapa_operacional` estão
   parados em `NAO_INICIADO`/`COMERCIAL` em 8.054 de 8.056 propostas);
3. tem pelo menos um modelo **legível** (QR Ideal, QR ou código de barras — a
   `modelosLegiveis` que já existe);
4. tem pelo menos uma **credencial publicada** — a gráfica imprimiu. É a
   contagem em `producao_acesso_credenciais`, e **não** `publicado_em`: essa
   coluna está nula nos 8 pedidos de hoje, porque gerar QR e reimprimir a
   zeram (o próprio `docs/controle_acesso.md` já registrava que ela não é
   confiável). Hoje só 18560 e 20508 passam neste filtro;
5. **ainda não foi carregado** (`producao_acesso_pedidos.evento_id` nulo). O
   que já foi carregado está em Meus Eventos — *"cada pedido é um evento, ao
   carregar vai para Meus Eventos"*.

Do mais recente ao mais antigo, até 100 propostas por cliente (o maior cliente
tem 23 pedidos com modelos; a lista real é curta).

### O cartão

```
┌────────────────────────────────────────┐
│ Pedido 20272 · 12/08/2026              │
│ Click                                  │   ← nome da ficha da arte
│ PISTA 1.500 · VIP 300                  │   ← modelos legíveis, com "impresso"
│ ● impresso                 [Carregar]  │     ou "aguardando impressão" por modelo
└────────────────────────────────────────┘
```

O nome do evento, a data e o local vêm de **`pedidos_artes.nome_evento /
data_evento / local_evento`** — a ficha da arte, que o usuário apontou (*"o nome
do evento já consta em todos os pedidos"*). Preenchida em 27 dos 47 pedidos com
modelos; quando vazia, o cartão mostra "Pedido N" e o Carregar pede o nome.

Vazio: *"Nenhum pedido impresso para carregar. Assim que a gráfica imprimir um
pedido seu, ele aparece aqui."* Sem rede: *"Preciso de internet para buscar os
seus pedidos."*

### O servidor

`GET /meus-pedidos` na `acesso-conta`, em consultas por lote (nunca uma por
pedido): clientes da conta → `propostas` (`id_cliente=in.(…)`, não canceladas,
`order=created_at.desc`, `limit`) → `pedidos_modelos` (`id_int=in.(…)`) →
`producao_numeracoes` dos `amostra_num_id` → `modelosLegiveis` por pedido →
`producao_acesso_pedidos` + contagem de credenciais por (pedido, modelo) →
`pedidos_artes` (`id_int=in.(…)`). Devolve:

```json
{ "pedidos": [ { "pedido": 20272, "data": "2026-08-12", "id_cliente": 14,
    "nome_evento": "Click", "data_evento": "…", "local_evento": "…",
    "setores": [ { "modelo_id": 1000022, "nome": "PISTA", "quantidade": 1500,
                   "impresso": true } ] } ] }
```

---

## 4. Carregar

### A caixa

Toque em **Carregar** → uma caixa (DOM, nunca `prompt`/`confirm`) com:

- **Nome do evento** — pré-preenchido com a ficha, editável (*"deixar editar se
  precisar"*). Data e hora, local — idem.
- **"Juntar ao evento…"** — decisão do usuário depois de ver a consequência de
  "cada pedido é um evento": um pedido complementar (mais 500 VIP, reimpressão
  com numeração nova) viraria um segundo evento, e o aparelho lê um evento por
  vez — os ingressos do complemento seriam recusados na porta como "não é deste
  evento". Por isso a caixa oferece, **abaixo** do evento novo, a lista dos
  eventos ativos do cliente. O padrão continua sendo evento novo.
- **Senha** — com o e-mail lembrado, como a caixa da engrenagem. Carregar é
  configuração, e configuração pede senha. E é essa senha que permite o passo
  seguinte não pedir outra.

### O servidor

`POST /pedidos/{p}/carregar` na `acesso-conta`, com
`{ nome_evento, data_evento, local_evento, evento_id | null, senha, navegador }`:

1. o pedido tem de ser de um cliente da conta, não cancelado, com credencial
   publicada e sem `evento_id` — a mesma definição de "apto" da lista; o que
   não está na lista não se carrega por URL;
2. confere a senha (`conferirSenha`, o mesmo do `/elevar`); "senha não confere"
   é a única frase;
3. cria o evento (`id_cliente` da proposta, `dono_auth_id` = conta, sal) ou
   usa o existente — que tem de ser **do mesmo cliente**;
4. um setor por modelo legível, **inclusive os ainda não impressos** (a
   credencial deles nasce ligada quando a gráfica imprimir — as duas metades que
   o `reivindicar` já faz); carimba as credenciais que já existem; liga o
   pedido ao evento;
5. **devolve, junto com o evento, uma elevação de 15 minutos** para ele
   (`gerarElevacao`) — a senha acabou de ser conferida, e é isso que deixa o
   passo seguinte acontecer sem pedir outra.

É o `reivindicar` de hoje sem o token do QR, refatorado numa função
`carregarPedido` que os dois caminhos usam enquanto o `reivindicar` viver.

### Logo depois

*"Evento criado. Quer usar este aparelho para ler os ingressos dele?"*

- **Sim** → `POST /eventos/{id}/aparelhos/aqui` com a elevação recém-devolvida
  ("Aparelho N", todos os setores), chaveiro, `signOut`, leitura — o mesmo
  `virarPortao.criar` de hoje, sem a caixa de senha.
- **Não** → Meus Eventos, com o evento novo em cinza. Se foi "juntar", o
  evento já existe e o toque no "Sim" liga este aparelho a ele.

Com "juntar ao evento X" a frase é *"Pedido juntado ao evento X."* e a pergunta
é a mesma.

---

## 5. Engrenagem, portaria e agente

- **Engrenagem**: só vocabulário ("Aparelhos", "Aparelho N", "★ Este é o
  aparelho…", "Sair deste aparelho") e a posse por cliente (seção 8). Nada mais.
- **Portaria**: só vocabulário no topo e nas frases ("entrou às HH:MM no
  Aparelho 2"). O `?e=` da URL continua sendo lido e ignorado sem token.
- **Agente**: nada muda no Python. Publica junto porque embute o frontend
  (regra `agente-publica-junto-com-o-site`).

---

## 6. O painel da gráfica

### Bloco "Acesso do cliente", dentro do pedido

No Ideal Control da gráfica (`ideal-control.js`), no painel do pedido, um bloco
novo — *é onde o atendente já está quando o cliente liga*:

```
Acesso do cliente
  DANIEL MOREIRA DA SILVA (cliente 14) · daniel@…
  ○ Sem acesso ainda                         [Liberar acesso]
  — ou —
  ● Acesso liberado em 17/08 para daniel@…   [Nova senha provisória]
  ● Também: maria@… (conta do Vibe, entra com a senha dela)

  QR de instalação do aplicativo      [Copiar link]
  ▩▩▩ https://ideal-imposition.vercel.app/ic/
```

- **Liberar acesso**: campo de e-mail pré-preenchido com o do cadastro
  (`clientes.email`, senão `email_contato`), botão, e a senha provisória em
  corpo grande, **uma vez**, com "Copiar". Depois disso a tela só diz que está
  liberado.
- **Nova senha provisória**: só para conta com `criada_aqui`. Confirmação em
  DOM ("a senha anterior deixa de valer") e a nova senha uma vez.
- **QR de instalação**: **um só, genérico** (decisão do usuário), desenhado
  pelo `qr-canvas.js` que o painel já tem, apontando para `/ic/`. Não expira,
  não carrega nada, pode ir para material impresso.
- O botão **"🎟️ QR do Evento"** do cartão da OS sai. O texto *"O cliente
  precisa abrir o QR do Pedido para reivindicá-lo"* vira *"O cliente precisa
  carregar este pedido no aplicativo — libere o acesso dele abaixo"*.

Quem pode: quem já pode configurar (`quemConfigura`: `admin` ou `atendimento`).

### O servidor (`acesso-interno`)

| Rota | O que faz |
|---|---|
| `GET /pedidos/{p}` (existente) | passa a devolver `cliente: { id_cliente, nome, email, contas: [{ email, criada_aqui, senha_provisoria, criado_em }] }` |
| `POST /clientes/{id_cliente}/contas { email }` | cria a conta (admin API) **ou** liga a existente; devolve `{ senha_provisoria }` só quando criou |
| `POST /contas/{auth_user_id}/nova-senha` | só `criada_aqui`; redefine pela admin API, marca provisória, devolve a senha uma vez |
| `GET /instalacao` | `{ url: "https://ideal-imposition.vercel.app/ic/" }` — para o link e o QR saírem do servidor, não de constante duplicada |

O que **nunca sai** dessas rotas: hash de senha, token, `service_role`. A senha
provisória sai uma vez, na resposta do POST, e não é guardada em claro em lugar
nenhum.

---

## 7. O que sai

- `frontend/evento.html` e `frontend/evento.js` — a tela do QR do Pedido.
- Do `controle.html`: `#caixa-qr`, `#erro-qr`, o `ler-qr.js` e a câmera, os
  scripts sem uso (M02 do raio-X).
- Do painel: o botão "QR do Evento" (`script.js` ~20072) e `gerarQrDoEvento`.
- Do `sw.js`: `evento.html`, `evento.js`, `ler-qr.js` da lista de cache.
- Do `vercel.json`: o redirect de `/evento.html`.

**As duas Edge Functions `acesso-evento` e `acesso-pedido` ficam no ar por um
release, sem chamador**, e a rota `/reivindicar` também. Apagar servidor e tela na
mesma leva não deixaria volta se o caminho novo tropeçar no primeiro cliente de
verdade — o mesmo cuidado de 16/08. A limpeza é do release seguinte.

---

## 8. Banco

### Tabela nova: `producao_acesso_contas`

```sql
create table producao_acesso_contas (
  auth_user_id        uuid        not null,          -- auth.users.id
  id_cliente          integer     not null,          -- clientes.id_cliente
  email               text        not null,          -- cópia, só para a tela
  criada_aqui         boolean     not null default false,
  senha_provisoria_em timestamptz,                   -- nulo = já trocou
  criado_por          uuid,                          -- quem liberou
  criado_em           timestamptz not null default now(),
  ativo               boolean     not null default true,
  primary key (auth_user_id, id_cliente)
);
alter table producao_acesso_contas enable row level security;  -- zero políticas
create index on producao_acesso_contas (id_cliente);
```

RLS ligado e nenhuma política, como as outras dez: só a `service_role` das
Edge Functions lê e escreve. Não se toca em `clientes` nem em `auth.users` além
do que a admin API faz.

O SQL sai como arquivo completo, pronto para colar, com o "como desfazer" no fim
— e roda pelo `ferramentas/rodar_sql.ps1` **antes** do código que o lê.

### Posse por cliente

`eventoDoDono` / `setorDoDono` / `aparelhoDoDono` na `acesso-conta` passam a
aceitar o evento cujo `id_cliente` está entre os clientes da conta **ou** cujo
`dono_auth_id` é a conta. `/meus-eventos` filtra do mesmo jeito. Nada muda nas
tabelas de evento — `id_cliente` já existe lá.

---

## 9. Servidor — resumo das rotas

**`acesso-conta`** (JWT; escrita exige elevação, exceto onde a senha vai no
corpo):

| Rota | Novo? | Autoriza |
|---|---|---|
| `GET /minha-conta` → `{ clientes: [{id_cliente, nome}], precisa_trocar_senha }` | novo | JWT |
| `POST /minha-conta/senha { senha_atual, senha_nova }` | novo | JWT + senha atual (dispensada enquanto provisória) |
| `GET /meus-pedidos` | novo | JWT |
| `POST /pedidos/{p}/carregar` | novo | JWT + senha no corpo; devolve elevação |
| `GET /meus-eventos` | muda | por cliente |
| tudo o mais | igual | posse por cliente |
| `POST /reivindicar` | fica um release | igual |

**`acesso-interno`**: as três rotas da seção 6, mais o `cliente` no painel do
pedido.

**`portaria`, `acesso-estacao`**: sem mudança.

---

## 10. Testes

- **`test_acesso_conta_pedidos.py`** (novo, contra as funções puras em Deno ou
  o harness já usado): "apto" — legível, não cancelado, com credencial, sem
  evento; um pedido de outro cliente não aparece nem se carrega por URL; carregar
  devolve elevação para o evento certo; "juntar" recusa evento de outro cliente.
- **Posse por cliente**: duas contas do mesmo cliente veem o mesmo evento; a
  conta antiga (`dono_auth_id`) continua vendo os dela.
- **Conta**: criar → `criada_aqui`, provisória; e-mail já existente → só liga,
  sem `senha_provisoria`; "nova senha" recusa conta não criada aqui; trocar a
  senha apaga a marca.
- **Tela (`test_controle_tela.py`)**: abrir sem chaveiro e sem sessão mostra a
  entrada; "Meus Pedidos" desenha os cartões e o Carregar abre a caixa com a
  ficha preenchida; o "Sim" depois de carregar chama `/aparelhos/aqui` **sem**
  abrir caixa de senha; nenhum "portão" em `textContent` das telas.
- **`grep -rn "portão\|Portão\|portao"`** no `frontend/*.html`, `*.js` (texto
  de tela) como teste de mesa: tem de sobrar só o que é nome interno.
- **Navegador (`rodar-app`)**: os fluxos da casa fotografados de novo — entrar,
  Meus Pedidos, Carregar, pergunta do aparelho.

---

## 11. Publicação

1. `sql/schema_acesso_contas.sql` pelo `rodar_sql.ps1`.
2. `.\publicar.ps1` — site + Edge Functions.
3. `.\publicar_agente.ps1 <número novo>` — o executável embute o frontend.

Ordem obrigatória: a coluna e a tabela antes do código que as lê.

---

## O que ficou de fora, de propósito

- **Descarregar / tirar um pedido de um evento.** Mexe em setores e contagem;
  fica para uma leva depois, se aparecer a necessidade.
- **SMTP e e-mail de convite.** Depende do parceiro configurar no projeto e
  liberar o nosso endereço de retorno. Quando existir, o "Liberar acesso" pode
  ganhar "enviar por e-mail" sem mudar o resto.
- **Área "Clientes" no painel da gráfica.** O bloco no pedido resolve o dia a
  dia; a lista de todos os clientes com conta é gestão, e vem depois.
- **Apagar `acesso-evento`, `acesso-pedido` e `/reivindicar`.** Release
  seguinte.
- **Reativar aparelho revogado, painel ao vivo, desvincular pedido.** Continuam
  na lista da parte 3c, como antes.
- **Os achados E01–E10 do raio-X** (zerar entradas não chega ao aparelho, etc.).
  Não entram nesta obra; ficam para um release curto, separado, para não
  misturar duas mudanças de comportamento na mesma leva.
