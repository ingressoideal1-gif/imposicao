# Parte 3b — o aparelho da portaria (Ideal Control)

**O que constrói:** a tela que o porteiro usa no portão. Ela lê o ingresso pela câmera,
decide sozinha se pode entrar, e registra a entrada — **sem depender de rede**.

**Por que agora:** as partes 1, 2 e 3a puseram o código no papel, a faixa na nuvem e a
configuração na mão do dono. Hoje há **2.163 credenciais publicadas e nenhuma foi lida por
ninguém.** Sem esta parte, tudo o que está guardado não vale nada.

**Estado de onde parte:** site v582, agente 1.2.81. As tabelas `producao_acesso_dispositivos`,
`_dispositivo_setores` e `_leituras` já existem desde 13/08 e estão vazias (2 aparelhos de
teste, 0 leituras). O hash PBKDF2 já roda no navegador (`frontend/qr-ideal-hash.js`), e
`tests/test_qr_ideal_hash.py` prova que ele bate com o Python.

---

## A ideia em uma frase

Depois de pareado, o aparelho **baixa o evento inteiro para dentro do celular** e passa a
decidir localmente. A rede vira detalhe: serve para receber a carga uma vez e para devolver
as leituras quando der.

```
1. o dono cria o aparelho em controle.html   →  código de 6 caracteres (já existe)
2. o porteiro abre portaria.html e pareia    →  digita o código (ou lê o QR de pareamento)
3. o aparelho baixa a carga do evento        →  IndexedDB: hashes, sais, setores,
                                                 bloqueios, e os setores DESTE aparelho
4. lê ingresso pela câmera                   →  valida LOCAL, sem rede
5. a leitura entra numa fila                 →  sobe quando houver rede
```

Do passo 3 em diante, **rede é opcional**.

---

## Decisões do usuário que governam esta spec

| Decisão | Quando | Consequência aqui |
|---|---|---|
| **Recusa é recusa** — não há "deixar entrar mesmo assim" | 15/08/2026 | a tela de recusa não tem escape; quem for recusado procura o dono |
| Cada aparelho valida **só a lista de setores dele** | 13/08 | a carga traz o evento inteiro e marca quais setores este aparelho valida; ingresso de outro setor é recusado com cara própria |
| Duas leituras offline do mesmo ingresso **deixam os dois entrarem** | 13/08 | a validação é local e não consulta a rede; a duplicidade é dado, não bloqueio |
| Configurar exige **senha do dono**; ler e registrar são livres | 13/08 | esta tela **não configura nada** — nem pede senha |
| O aparelho resolve o setor **pela lista dele**; casando em vários, **pergunta** | 15/08 | a tela de ambiguidade existe e é obrigatória |
| A lotação é a **quantidade contratada no ERP** | 15/08 | a tela mostra contagem, nunca um campo de lotação |
| Nenhuma chave de banco chega ao aparelho | 13/08 | o aparelho fala com o Render por um token próprio, revogável |

---

## Arquitetura

```
                       ┌─ POST /aparelhos/entrar    (código curto → token)
portaria.html  ────────┼─ GET  /aparelhos/faixa     (a carga do evento)
(celular do porteiro)  └─ POST /aparelhos/leituras  (a fila acumulada)
        │                                │
        │                          Render (service_role)  ──►  Supabase
        ▼
   IndexedDB
   ├── carga    (hashes, sais, setores, bloqueios)   ← escrita uma vez, lida sempre
   └── fila     (leituras ainda não enviadas)        ← cresce offline, esvazia com rede
```

**O aparelho nunca fala com o Supabase.** Ele tem um token próprio, emitido pelo Render
contra o código curto, e guardado em `localStorage`. Revogar o aparelho na tela do dono faz
o servidor recusar o token na primeira sincronização.

### Por que a carga inteira, e não consulta por leitura

Consultar a nuvem a cada ingresso seria mais simples de escrever e **inútil na prática**: o
portão de um evento é o lugar com a pior rede possível — galpão, ginásio, sítio, mil
celulares disputando a mesma antena. A parte 2 inteira existe para que o celular tenha a
resposta antes de precisar dela.

Tamanho: um evento de 30.000 ingressos são ~3,5 MB de JSON, baixados **uma vez**, em
páginas de 5.000. Os 2.163 de hoje são ~250 KB.

---

## Os arquivos

| Arquivo | Responsabilidade | Depende de |
|---|---|---|
| `frontend/portaria.html` | a tela e o CSS próprio (como `evento.html`, não carrega o `style.css` do painel) | — |
| `frontend/portaria.js` | pareamento, câmera, orquestração, sincronização | os três abaixo |
| `frontend/portaria-validacao.js` | **as seis regras**, funções puras | nada |
| `frontend/portaria-deposito.js` | IndexedDB: gravar a carga, ler a carga, enfileirar, esvaziar | nada |
| `frontend/jsqr.min.js` | leitura de QR onde não há `BarcodeDetector` | — |
| `frontend/sw.js` | abrir sem rede | — |
| `acesso_portaria.py` | os três endpoints | `acesso_api` (supabase, contar), `qr_ideal` |

A validação mora num arquivo **só dela, e puro**, porque são seis regras cuja **ordem
importa** e que eu quero testar com dados de mesa — sem câmera, sem IndexedDB, sem rede.
É a mesma razão pela qual `acesso_publicacao.numeracao_do_modelo` é uma função isolada.

---

## O pareamento

O dono cria o aparelho em `controle.html` e recebe um código de 6 caracteres do alfabeto
`23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sem O/0, I/1 — o porteiro digita no escuro). Isso **já
existe** (`acesso_config._sortear_codigo`).

O que falta é o outro lado. O dono compartilha um endereço:

```
https://ideal-imposition.vercel.app/portaria.html?e=<evento_id>
```

A tela do dono passa a mostrar esse endereço **como QR**, para o porteiro apontar a câmera
em vez de digitar uma URL de 60 caracteres num portão. O `evento_id` **não é credencial** —
é só o endereço; quem autentica é o código de 6 caracteres, que o porteiro digita.

`POST /api/acesso/aparelhos/entrar` recebe `{evento_id, codigo}`:

1. lê o sal do evento;
2. calcula **um** PBKDF2 do código com esse sal;
3. compara, em tempo constante, contra o `codigo_hash` de cada aparelho **ativo** daquele
   evento — são poucos, e a comparação é barata; o custo está no hash, que é um só;
4. achando: sorteia um token de 32 bytes, grava `token_hash` no aparelho, devolve
   `{token, aparelho: {id, nome}, evento: {id, nome}}`.

**O token substitui o código.** O código continua valendo para parear outro aparelho ou o
mesmo de novo; gerar um código novo na tela do dono não derruba quem já está pareado — quem
derruba é **revogar**, que zera o `token_hash` e faz o servidor recusar.

> **Força bruta, e o que a limita.** São 31⁶ ≈ 887 milhões de códigos, e cada tentativa
> custa um PBKDF2 de 10.000 voltas no servidor. Além disso o endpoint conta as falhas por
> evento e **para de responder por 5 minutos depois de 10 erros**, em memória do processo.
> O limite conhecido, registrado de propósito: contagem em memória não sobrevive a um
> reinício do Render nem a duas instâncias. Endereçar isso de verdade é assunto da 3c;
> hoje o Render roda uma instância só, e o dono pode revogar o aparelho a qualquer momento.

---

## A carga

`GET /api/acesso/aparelhos/faixa?desde=<n>`, com `Authorization: Bearer <token do aparelho>`.

Devolve, em páginas de 5.000 credenciais:

```json
{
  "evento":   {"id": "...", "nome": "Festa da Uva", "sal": "<64 hex>"},
  "aparelho": {"id": "...", "nome": "Portão A", "setores": ["<id da PISTA>"]},
  "sais":     {"18560": "<64 hex>", "20508": "<64 hex>"},
  "setores":  [{"id": "...", "nome": "PISTA", "quantidade": 600,
                "tipo_uso": "unico", "abre_em": null, "fecha_em": null},
               {"id": "...", "nome": "CAMAROTE", "quantidade": 400,
                "tipo_uso": "reentrada", "abre_em": null, "fecha_em": null}],
  "bloqueios":[{"setor_id": "...", "de": 101, "ate": 150, "motivo": "lote extraviado"}],
  "credenciais": [{"h": "<64 hex>", "s": "<setor_id>", "n": 1}],
  "proxima": 5000
}
```

**A carga traz o evento INTEIRO — todos os setores e todas as credenciais —, e
`aparelho.setores` diz quais este aparelho valida.**

Isso não é desperdício: é o que torna a regra 2 possível. Se a carga trouxesse só os
setores autorizados, um ingresso de VIP lido no portão da Pista não seria encontrado e cairia
na regra 1, `desconhecido` — dizendo ao porteiro que um ingresso legítimo é falso, que é
exatamente o erro que esta spec mais quer evitar. Para distinguir "não é deste evento" de
"é deste evento, mas de outro setor", o aparelho precisa conhecer o evento todo.

`tipo_uso` vale `unico` ou `reentrada`, os dois únicos valores que o `acesso_config.py`
aceita.

`sais` é `{pedido_id_int: sal}` de todos os pedidos do evento, mais o sal do próprio evento
para os códigos que o cliente importou. O aparelho precisa deles para **calcular** o hash do
que leu — a nuvem nunca manda código, só hash.

### Como o aparelho descobre qual sal usar

- **QR Ideal**: o conteúdo é `pedido invertido + 8 caracteres`. O aparelho inverte os
  primeiros caracteres, acha o pedido, e usa o sal daquele pedido. Um hash só.
- **QR ou código de barras comum**: o conteúdo é só `000001` — não diz o pedido. O aparelho
  tenta o sal de cada pedido do evento **e** o do evento. São poucos pedidos por evento;
  cada tentativa é um PBKDF2 de milissegundos.

---

## As seis regras, na ordem em que recusam

`portaria-validacao.js` recebe o que foi lido e a carga, e devolve um veredito. **A ordem é
a resposta**, porque um ingresso pode falhar por mais de um motivo e o porteiro precisa
ouvir o mais útil.

| # | Regra | Motivo gravado | O que o porteiro vê |
|---|---|---|---|
| 1 | O hash não está na carga | `desconhecido` | **vermelho** — "este código não é deste evento" |
| 2 | Está, mas o setor não é dos que este aparelho valida | `setor_nao_autorizado` | **laranja** — "é VIP. Este aparelho lê PISTA" |
| 3 | O setor tem janela e agora está fora dela | `fora_da_janela` | "PISTA abre às 20:00" / "fechou às 02:00" |
| 4 | O número cai numa faixa bloqueada | `bloqueado` | **vermelho, com o motivo em corpo grande** |
| 5 | O setor é `unico` e já houve entrada permitida neste aparelho | `ja_entrou` | "já entrou às 21:14" |
| 6 | Passou por todas | — | **verde** — setor e número |

**O item 2 precisa ser visualmente diferente do item 1.** São situações opostas: no 1 o
ingresso é estranho ao evento; no 2 ele é bom e está na porta errada. Confundir os dois faz
o porteiro devolver um ingresso legítimo achando que é falso. Cor diferente, ícone diferente,
e a frase diz **qual setor o ingresso é** e **quais setores este aparelho atende**.

**O motivo do bloqueio é o que o porteiro lê em voz alta.** Por isso ele aparece em corpo
grande, não como legenda — foi para isso que o campo `motivo` nasceu obrigatório na parte 3a.

**A regra 5 consulta a fila local**, não a nuvem: as entradas deste aparelho estão no
IndexedDB. Uma entrada registrada em **outro** aparelho offline não é vista — e é exatamente
a duplicidade que a decisão de 13/08 aceita de propósito, para ninguém ficar parado no portão.

### Ambiguidade: o mesmo hash em mais de um setor

Com numeração comum, o `0001` do VIP e o `0001` do Camarote têm o mesmo texto, o mesmo sal
(o sal é por pedido) e portanto **o mesmo hash**. Se o aparelho valida os dois e o código
casa nos dois, ele **não escolhe**: mostra os setores que casaram e pergunta qual, em botões
grandes. Um toque, e o setor escolhido vai gravado na leitura.

Casando em um só setor, não pergunta nada.

---

## A tela

Uma tela, quatro estados. Feita para uma mão, no escuro, com sol na cara e luva.

```
┌─────────────────────────┐   ┌─────────────────────────┐
│ Portão A · PISTA        │   │                         │
│ ▸ 47 na fila            │   │      ✓  PODE ENTRAR     │
│                         │   │                         │
│  ┌───────────────────┐  │   │         PISTA           │
│  │                   │  │   │        nº 0284          │
│  │   [ câmera ]      │  │   │                         │
│  │                   │  │   │    [ Ler o próximo ]    │
│  └───────────────────┘  │   │                         │
│                         │   │                         │
│  [ digitar o número ]   │   │                         │
└─────────────────────────┘   └─────────────────────────┘
       LENDO                         PERMITIDO (verde)

┌─────────────────────────┐   ┌─────────────────────────┐
│      ✕  RECUSADO        │   │   Qual setor?           │
│                         │   │                         │
│   FAIXA BLOQUEADA       │   │  ┌───────────────────┐  │
│                         │   │  │      PISTA        │  │
│   lote extraviado       │   │  └───────────────────┘  │
│   na entrega            │   │  ┌───────────────────┐  │
│                         │   │  │     CAMAROTE      │  │
│    [ Ler o próximo ]    │   │  └───────────────────┘  │
└─────────────────────────┘   └─────────────────────────┘
     RECUSADO (vermelho)            AMBIGUIDADE
```

**Sem botão de escape na recusa** — decisão do usuário de 15/08. Quem for recusado procura
o dono do evento.

**"Digitar o número"** existe para o ingresso rasgado ou molhado, e para o código de barras
que o navegador do iPhone não lê. O que é digitado passa pelas **mesmas seis regras** —
não é atalho, é outra forma de entrada.

O cabeçalho mostra sempre o nome do aparelho, os setores que ele atende e **quantas leituras
esperam na fila**. Uma fila que cresce é o sinal de que a rede caiu, e o porteiro precisa ver
isso sem procurar.

---

## A fila e a sincronização

Cada leitura vira uma linha no IndexedDB **antes** de a tela mudar de cor:

```json
{"id_local": "<uuid v4 do aparelho>", "momento": "<ISO do celular>",
 "credencial_id": "<uuid ou null>", "setor_id": "<uuid ou null>",
 "resultado": "permitido|negado", "motivo": "<um dos seis|null>"}
```

Com rede, `POST /api/acesso/aparelhos/leituras` manda em lotes de 200. O servidor grava com
`?on_conflict=dispositivo_id,id_local` e `resolution=ignore-duplicates` — a chave única
`uq_acesso_leitura_do_aparelho` já existe no esquema e é **exatamente** por isso: o celular
que ficou três horas offline reenvia a fila inteira, e nada duplica.

**A linha só sai da fila local depois que o servidor confirmou.** Perder uma leitura é
perder a contagem que o cliente pagou para ter.

**Leitura negada também sobe.** É ela que responde "por que a fila parou às 22h" — e sem ela
o relatório da 3c mostraria um evento sem nenhum problema, que nunca é verdade.

---

## Abrir sem rede

`frontend/sw.js`, novo e só para esta tela: guarda `portaria.html`, os quatro `.js` e o
`jsqr.min.js` num cache com o número da versão no nome (`portaria-v582`). Ao ativar,
apaga qualquer cache de versão diferente, faz `skipWaiting()` e `clients.claim()`.

O nome do cache sai do mesmo `?v=NNN` que o `publicar.ps1` já bumpa em todas as páginas —
então publicar troca o cache sozinho, e não existe o "meu celular está preso na versão
antiga" que assombra service worker.

O `sw.js` do Ideal Control velho, em `../ideal-IdealControl/`, **não vem junto**: ele lista
SDKs do Firebase que não existem mais e guarda arquivos que não são estes.

---

## Como isto vai ser testado

| Teste | O que prova |
|---|---|
| `tests/test_portaria_validacao.py` | as seis regras, **num navegador de verdade**, com dados de mesa — mesmo padrão do `test_qr_ideal_hash.py`. Cobre a ordem (um ingresso que falha por dois motivos devolve o mais útil), a ambiguidade, a janela virando meia-noite, e a faixa bloqueada nas bordas (`de` e `ate` inclusivos) |
| `tests/test_acesso_portaria.py` | os três endpoints com o `FakeBanco`: pareamento certo e errado, token revogado, a paginação da faixa, o `on_conflict` do reenvio, e o aparelho que só recebe os setores dele |
| `tests/test_portaria_fila.py` | a fila não perde leitura: falha de rede no meio do lote deixa tudo na fila; sucesso parcial remove só o confirmado |
| guarda de fonte | nenhum `<script src>` externo em `portaria.html` (a CSP e o offline proíbem CDN) e o `sw.js` não guarda arquivo de outra tela |

O teste da validação é o que importa: é onde mora a decisão que manda alguém entrar ou não.

---

## O que NÃO entra (parte 3c)

Painel ao vivo do dono, relatórios, cancelar credencial, desvincular pedido de evento,
reativar aparelho revogado, e a limpeza dos 8 setores órfãos de pedidos de teste.

E duas coisas que a auditoria de 15/08 deixou anotadas e continuam fora daqui: o
`gerar_qr` que reabre publicação fechada, e a mensagem do `409` que promete que um QR novo
resolve uma reivindicação errada.

---

## Riscos conhecidos, aceitos de propósito

**Duplicidade entre aparelhos offline.** Dois portões sem rede deixam a mesma pulseira
entrar duas vezes. É a decisão de 13/08, e o preço é sabido: ninguém fica parado no portão
por causa de rede. A duplicidade vira dado no banco e relatório na 3c.

**Código comum é clonável.** Num evento com QR comum, quem tem o `0001` pode reproduzi-lo. A
proteção nesse caso não é o sigilo do código — é a detecção de entrada repetida, que a regra
5 dá para setor de entrada única. Isso já está registrado em `docs/controle_acesso.md`.

**A hora é a do celular.** `momento` é o relógio do aparelho, que pode estar errado ou
offline há horas. O servidor guarda também o `recebido_em` dele — as duas colunas existem, e
o relatório da 3c vai precisar das duas.

**Contagem de falhas de pareamento em memória.** Não sobrevive a reinício do Render. Aceito
por ora; o dono pode revogar o aparelho a qualquer momento.
