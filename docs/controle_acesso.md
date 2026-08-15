# Controle de acesso — do papel até a portaria

O QR Ideal ([docs/qr_ideal.md](qr_ideal.md)) põe no ingresso um código que ninguém
adivinha. Este documento é a outra metade: como esse código chega à nuvem, como o cliente
cadastra o evento dele, e o que protege cada passo.

Estado em 14/08/2026: **partes 2 e 3a no ar** (site v570, agente 1.2.69). A parte 3b — o
aplicativo da portaria — ainda não começou.

## O caminho inteiro, em ordem

```
1. o operador imprime          →  agente calcula os hashes e publica a faixa
2. o atendente clica no painel →  QR do Pedido gerado, o anterior morre
3. o cliente lê com a câmera   →  troca o token pelo esqueleto, lido do ERP
4. o cliente entra e cadastra  →  evento criado, credenciais carimbadas
5. o dono configura o evento   →  tipo de uso e aparelhos da portaria (parte 3a)
6. (parte 3b) a portaria lê    →  ainda não existe
```

## A regra que decide tudo: quem fala com o banco

```
Agente (tem o pool)  ──hash──►  Render (service_role)  ──►  Supabase
                                       ▲
                                       │ JWT do cliente
                              evento.html (PWA, no celular)
```

**Nenhuma chave de banco chega ao celular nem ao navegador.** As sete tabelas
`producao_acesso_*` nasceram com RLS ligado e **zero políticas**: com a chave anônima —
que é pública e qualquer um lê no código-fonte do painel — não se lê nem se escreve uma
linha. Conferido contra o banco em 13/08/2026: uma tentativa de escrita anônima volta
`42501, new row violates row-level security policy`.

A `service_role` vive só no Render, em variável de ambiente. Ela **não vai para as
estações**: o agente não tem autenticação de verdade (o `AGENT_ID` é um UUID em arquivo
local, que qualquer um forjaria), e distribuir a chave-mestra do banco — que abre cliente,
proposta e financeiro do parceiro — em cada `NewProd.exe` seria bem pior do que a chave
anônima que já circula.

Consequência visível: o `app.py` monta o router `/api/acesso/*` **só onde a chave existe**.
A estação simplesmente não serve esses endpoints.

## O que a nuvem guarda no lugar do código

Nunca o código. Guarda `codigo_hash` — PBKDF2-HMAC-SHA256, 10.000 voltas, sal por pedido.

| Escolha | Por quê |
|---|---|
| PBKDF2 | existe pronto nos dois lados: `hashlib` no agente, `crypto.subtle` no navegador. Zero dependência nova |
| 10.000 voltas | leitura no celular custa milissegundos; força bruta custa 2,8 × 10¹⁶ operações por pedido |
| sal **por pedido** | o pool é reutilizado por desenho. Sem sal, o mesmo código daria o mesmo hash em eventos diferentes, e daria para correlacioná-los só olhando o banco |

**O sal é por pedido e não por evento** porque o agente publica quando imprime, e nessa
hora o evento pode nem existir — o cliente só vai cadastrar dias depois.

`tests/test_qr_ideal_hash.py` roda o `frontend/qr-ideal-hash.js` dentro de um navegador de
verdade e compara com o Python. Se os dois divergirem, **todo ingresso do evento é
recusado na portaria**, e não há como descobrir isso antes — a não ser ali.

## A publicação da faixa

Ao fechar a impressão de um trabalho com QR Ideal, o `app.py` chama
`acesso_publicacao.publicar_em_fundo()`, que **devolve na hora**: o cálculo e o envio
acontecem numa thread, depois que os PDFs saíram. O operador está de pé na frente da
impressora, e o agente existe por causa disso.

Publica-se a **tiragem inteira**, e não a folha impressa. A quantidade vem do ERP e chega
junto com o sal na resposta do `abrir`. Quem imprime 2.000 hoje e 3.000 na semana que vem
ficaria com 3.000 ingressos recusados na porta se a faixa seguisse a folha.

Três endpoints, nesta ordem:

| | O que faz |
|---|---|
| `POST /pedidos/{p}/abrir` | devolve o sal e a tiragem. Reabrir devolve o **mesmo** sal |
| `POST /pedidos/{p}/credenciais` | grava um lote, ignorando o que já existe |
| `POST /pedidos/{p}/fechar` | carimba o total e compara com o que o ERP encomendou |

**Reabrir nunca troca o sal.** O cliente reimprime 500 de um pedido de 5.000; sal novo
invalidaria os 4.500 que já estão na mão das pessoas.

**A gravação é repetível.** `?on_conflict=codigo_hash` faz o reenvio não duplicar nada —
conferido contra o banco real: três envios do mesmo lote deixaram uma linha.

`fechar` devolve `esperado` e `completo`. É por aí que o agente sabe que um lote se perdeu
na rede, em vez de dar a publicação por terminada.

### Nem todo ingresso tem QR Ideal

Regra do usuário, 14/08/2026: **o Ideal Control tem de funcionar com qualquer ingresso que
tenha QR ou código de barras**, mesmo sem o elemento QR Ideal — lendo o dado do próprio
elemento de numeração. Não é hipótese: das 59 numerações do catálogo, **32 já têm um
elemento QR** e só uma tem QR Ideal.

Dá para fazer porque o `engine._render_element` desenha o QR e o código de barras a partir
do mesmo `val_str`: `prefixo + numero.zfill(pad) + sufixo`. O agente recalcula esse texto
para a tiragem inteira, sem pool nenhum. `acesso_publicacao.conteudo_numeracao()` é a
réplica dessa conta — **se as duas divergirem, todo ingresso do evento é recusado**, e só
dá para descobrir na portaria.

Por modelo, vale o primeiro que existir nesta ordem:

| Elemento | Conteúdo |
|---|---|
| `QR_IDEAL` | código do pool |
| `QR` / `BARCODE` | `prefixo + numero.zfill(pad) + sufixo` |
| alimentado por coluna do CSV | **não publica** — o conteúdo vem da linha, não do número |

O agente não conhece a numeração: ele recebe do servidor só `{modelo: quantidade}`, o que
bastava enquanto o código saía do pool por fórmula. Quem entrega o mapa é o
`app._numeracoes_por_modelo()`, o único ponto que sabe ao mesmo tempo **quais** modelos
estão na folha e **qual** numeração cada um usa.

Daí uma consequência que precisa ficar dita: **cada modelo publica quando é impresso.** Um
pedido com VIP e Camarote em que só o VIP foi à máquina publica a tiragem inteira do VIP e
nada do Camarote. A garantia que importa continua de pé — tiragem inteira do modelo, nunca
só a folha —, e supor a numeração do modelo ausente seria pior do que não publicar: gravaria
hash errado, e reimprimir não consertaria, porque o servidor ignora duplicata.

> **A proteção muda de natureza, e isso foi decidido com os números na mesa.** O código do
> pool tem 2,82 trilhões de combinações. O `0002` de uma numeração comum é adivinhável por
> quem tem o `0001` — mas não é *inventável*: ele pertence a um ingresso de verdade, na mão
> de outra pessoa. A fraude deixa de ser falsificação e vira **clonagem**, e quem a pega é a
> detecção de entrada repetida na portaria, não o sigilo do código.

**A ambiguidade, e a decisão que a resolve.** Com `prefix=''` e `pad=4` — que é como o
acervo inteiro está —, o item 1 do VIP e o item 1 do CAMAROTE são os dois `0001`, no mesmo
evento. E como o sal é por pedido, os dois dão o **mesmo hash**.

Decisão do usuário: **o aparelho resolve pelo setor dele.** Cada aparelho valida uma lista
de setores, e o código é lido nesse contexto. Quando o aparelho valida vários setores e o
código casa em mais de um, a portaria pergunta qual, mostrando só os que casaram — um toque,
e fica registrado. Isso é trabalho da parte 3.

### O segredo do agente

Os três endpoints escrevem, e vivem num backend público. Sem segredo, qualquer um
publicaria credencial para qualquer pedido — e como o `abrir` devolve o sal, quem chegasse
até ali poderia calcular o hash de um conteúdo escolhido por ele e inserir um ingresso que
a portaria aceitaria. **É a única forma de forjar sem ter o pool.**

Quatro travas:

- `ACESSO_AGENTE_SEGREDO` em cabeçalho, comparado em tempo constante;
- **falha fechada**: servidor sem segredo recusa tudo, em vez de virar porta aberta;
- `numero` limitado pela quantidade que o ERP registrou, e `modelo_id` tem de ser daquele
  pedido — nem com o segredo dá para inventar o ingresso 99.999 de uma tiragem de 88;
- publicação fechada não aceita mais lote; reabrir é ato explícito.

O segredo vai **embutido no executável**: o `build_agent.ps1` gera `acesso_segredo.py`, que
o git ignora, e o build **para** sem ele — mesma razão do pool.

> **Risco residual, registrado de propósito.** Quem tiver o segredo do agente e pegar a
> janela entre `abrir` e `fechar` ainda consegue ocupar uma posição da tiragem com um hash
> próprio. Endereçar isso é trabalho da parte 3, onde a portaria vai poder cruzar o total
> publicado com o que o ERP encomendou.

## O QR do Pedido

É uma URL curta com token assinado: `evento.html?t=<pedido>.<vencimento>.<assinatura>`.
Quarenta e quatro caracteres de token, 87 de URL, QR versão 5 com 37 módulos por lado — lê
bem de tela de celular e de foto de WhatsApp comprimida.

**Ele não carrega os dados do evento.** Isso é arquitetura, não economia de bytes: neste
projeto o que o parceiro escreve no banco é a origem da verdade, e um QR com a lista de
setores dentro continuaria afirmando a quantidade velha depois que o pedido mudasse no ERP.

O número do pedido em claro não é vazamento — ele está impresso no ingresso. Quem protege é
a assinatura, que cobre pedido **e** vencimento: trocar o número para entrar no evento do
vizinho não cola, e esticar a data para reviver um token velho também não.

**Autenticidade e validade são perguntas diferentes**, e o código as separa:

| Onde | Pergunta |
|---|---|
| `qr_pedido.conferir` | é autêntico? (assinatura, vencimento) — pura criptografia |
| `acesso_api._esqueleto` | ainda vale? (revogado, substituído) — só o banco sabe |

Gerar um QR novo troca o `qr_token_hash` guardado, e o anterior para de funcionar mesmo
continuando criptograficamente válido. É o conserto de quando o QR cai na pessoa errada.

O endpoint que **gera** o QR exige login de verdade — ele confere o token do Supabase
perguntando ao próprio Supabase. O `get_current_user` do `app.py` não serve: ele devolve
admin para todo mundo sem conferir nada.

## Reivindicar o evento

O QR anda por WhatsApp, então quem receber a imagem consegue cadastrar — **uma vez**. A
primeira reivindicação trava o pedido na conta que cadastrou; uma segunda conta leva `409`.
Mas o **próprio dono relendo o próprio QR não é erro**: devolve o evento que ele já criou.

**Um evento pode reunir vários pedidos** — a pista num, o camarote noutro. Por isso
"anexar a um evento existente" fica ao lado de "criar". Anexar não cria evento novo.

Um modelo = um setor, e setores **nunca se fundem**, mesmo com nome igual vindo de dois
pedidos: quantidade e reimpressão são por modelo. O cliente renomeia à vontade.

> Cuidado com o vocabulário: o setor do EVENTO ("VIP", "Pista") sai de `nome_modelo`. O
> campo `setor` de `pedidos_modelos` **já está ocupado** com o setor de PRODUÇÃO (FLEXO,
> TÊXTIL, PVC, LASER).

## A conta é a do Vibe, e não uma daqui

Regra do usuário: **o cliente entra com o mesmo e-mail e a mesma senha que ele já usa no ERP
Vibe.** Não existe cadastro separado no controle de acesso.

Ela não custou integração nenhuma, porque o Ideal Imposition e o Vibecode apontam para o
**mesmo projeto Supabase** (`vwbtitjlpelrcnsytzqw`, em `frontend/supabase-config.js`) e,
portanto, para o mesmo `auth.users`. O login do cliente já valia aqui desde sempre.

O que a regra custa é o outro lado: **nenhuma tela nossa pode oferecer criar conta.** O
`evento.html` oferecia, num botão "Ainda não tenho conta" que chamava `auth.signUp`. Uma
conta criada ali funcionaria — e esse é o problema. O login passaria, o cadastro seguiria, e
só muito depois alguém descobriria que o evento, os setores e a portaria inteira ficaram
pendurados numa identidade sem relação nenhuma com o cadastro do cliente no ERP. Refazer
significa refazer com o lote já impresso.

No lugar dele há **"Esqueci minha senha"**, que age sobre a conta que existe. A resposta é
sempre a mesma, tenha o e-mail conta ou não: responder diferente diria a um estranho quais
e-mails têm cadastro.

> **Limite conhecido.** O servidor exige que a pessoa esteja logada, mas **não consegue
> provar que ela é o cliente daquele pedido**. Não há no banco ligação entre `auth.users` e
> `clientes` — conferido em 14/08: a tabela `clientes` tem 47 colunas e nenhuma é um id de
> autenticação, e `propostas.user_id` é o **vendedor**, não o cliente. Quem ler o QR primeiro
> reivindica. A proteção real hoje é o QR chegar à pessoa certa e a reivindicação valer uma
> vez só. Fechar isso exige criar a ligação `auth.users → clientes.id_cliente`, e é assunto
> do parceiro também.

## A tela `evento.html`

Auto-contida e feita para telefone. **Não** carrega o `style.css` de 81 KB do painel, que
foi desenhado para a tela larga do operador — o cliente chega pela câmera, quase sempre no
4G. Campos com fonte de 16px (menor que isso o iOS dá zoom ao focar), alvos de toque de
48px, dois passos numerados na própria tela.

As mensagens de erro do QR são traduzidas para português de gente **no endpoint**. O
`qr_pedido` continua falando técnico, que é o certo para log e teste, mas "token
malformado" não é frase para o cliente ler no celular.

## O que precisa estar configurado

| Variável | Onde | Sem ela |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | Render | o router `/api/acesso/*` nem é montado |
| `ACESSO_AGENTE_SEGREDO` | Render **e** no build do agente | a faixa nunca é publicada |
| `QR_PEDIDO_SEGREDO` | Render | não dá para gerar QR do evento |

`GET /api/acesso/saude` responde as três de uma vez — presença de cada variável e se o
banco responde:

```json
{"ok": true, "variaveis": {"SUPABASE_SERVICE_KEY": true, "...": true},
 "faltando": [], "banco": "ok"}
```

Ele diz **se** cada uma existe, nunca o que ela vale: o endpoint é público. E confere as
variáveis **antes** de tocar no banco, senão um erro de rede esconderia o de configuração,
que é o que a pessoa veio ver.

> Uma armadilha já vivida: ao copiar a `SUPABASE_SERVICE_KEY` do painel do Supabase, um
> caractere sobrando no começo ou um `=` no fim fazem o Supabase responder `401 Invalid API
> key` — e a chave *parece* certa, com `role: service_role` e validade em 2035. A
> assinatura de um JWT tem **43 caracteres** e nunca termina em `=`.
>
> `.\ferramentas\copiar_para_render.ps1` tira o mouse do caminho: lê o valor exato do
> `.env.local`, confere o formato (as 3 partes, o `eyJ` do começo, os 43 caracteres da
> assinatura) e põe na área de transferência **sem mostrar na tela**. Com `-Conferir`, só
> confere.

## As sete tabelas

Criadas por [sql/schema_acesso.sql](../sql/schema_acesso.sql), pronto para colar.

| Tabela | Guarda |
|---|---|
| `_eventos` | o evento do cliente; pode reunir vários pedidos |
| `_pedidos` | sal, token do QR e estado da publicação. Nasce **antes** do evento |
| `_setores` | um por modelo; a lotação É a `quantidade` do ERP, não um campo. `abre_em`/`fecha_em` = janela em que o setor vale; nulo = sempre |
| `_bloqueios` | faixas de ingresso recusadas na porta: `de`, `ate`, `motivo`. A faixa é um intervalo de `credenciais.numero`, e o motivo é o que a portaria lê em voz alta |
| `_credenciais` | `codigo_hash` sempre; `codigo_visivel` só quando `origem='cliente'` |
| `_dispositivos` | os aparelhos da portaria (parte 3) |
| `_dispositivo_setores` | em quais setores cada aparelho valida (parte 3) |
| `_leituras` | toda leitura, inclusive negada (parte 3) |

Duas decisões do modelo que valem lembrar:

**`unique (dispositivo_id, id_local)` nas leituras.** Sem isso, o celular que ficou três
horas offline reenvia a fila, o servidor grava tudo de novo, e a lotação do relatório sai
errada — justamente o número que o cliente pagou para ter.

**`empresa_id` é nulo em 100% das linhas `producao_*` deste banco.** Em Postgres, nulo é
distinto de nulo dentro de índice único, então `UNIQUE (empresa_id, coluna)` não garante
nada. As chaves passam pela função `producao_acesso_empresa()`, que troca o nulo por um
UUID zerado.

## O que falta (a partir da parte 3b)

A tela do dono (`controle.html`, parte 3a) **está no ar desde a v570**, com a
`ACESSO_ELEVACAO_SEGREDO` já no Render — o `/api/acesso/saude` responde as quatro em `true`.
Ela traz: login do cliente, tipo de uso por setor atrás de um botão **Configurar**, os
aparelhos da portaria com lista de setores própria, e a senha do dono travando a
configuração do evento. **A lotação de um setor é a quantidade contratada no ERP**,
mostrada como informação e nunca como campo — não existe um segundo número que possa
discordar do contrato. O estado atual está em [STATUS_PROJETO.md](STATUS_PROJETO.md).

O que falta é o aplicativo da PORTARIA (parte 3b): IndexedDB com validação local de
verdade, leitura de QR e registro de entrada sem depender de rede, e reentrada em uso de
verdade. Painel ao vivo, relatórios e cancelar credencial ficam para a parte 3c.

**O Ideal Control antigo continua fora deste repositório**, em `../ideal-IdealControl/`.
Trazê-lo para cá é trabalho da parte 3c, e a parte 3a reverteu o plano de evoluí-lo: o
layout foi refeito do zero, por decisão do usuário. Enquanto ele não vier, o `sw.js` que
ainda referencia SDKs do Firebase removidos mora lá, não aqui — não há `sw.js` em
`frontend/`.

Decisões já tomadas pelo usuário e registradas na
[spec](superpowers/specs/2026-08-13-controle-acesso-parte2-design.md):

- cada aparelho valida **só a lista de setores dele**;
- mudar configuração do evento exige a **senha do dono**, conferida na hora;
- duas leituras offline do mesmo ingresso **deixam os dois entrarem**, e a duplicidade é
  apontada na sincronização — ninguém fica parado no portão por causa de rede;
- o cliente pode **carregar códigos próprios** para staff e cortesia;
- **o aparelho resolve o setor pela lista dele.** Com numeração comum, dois setores do mesmo
  evento têm o mesmo `0001` e o mesmo hash. O aparelho configurado para um setor só não tem
  dúvida; o que valida vários precisa perguntar qual, mostrando só os que casaram.
