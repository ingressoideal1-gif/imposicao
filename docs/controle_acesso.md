# Controle de acesso — do papel até a portaria

O QR Ideal ([docs/qr_ideal.md](qr_ideal.md)) põe no ingresso um código que ninguém
adivinha. Este documento é a outra metade: como esse código chega à nuvem, como o cliente
cadastra o evento dele, e o que protege cada passo.

Estado em 15/08/2026: **partes 2 e 3a no ar** (site v581, agente 1.2.80). A parte 3b — o
aplicativo da portaria — ainda não começou, e é ela que fecha o ciclo: as 2.163 credenciais
já publicadas ainda não são lidas por ninguém.

## O caminho inteiro, em ordem

```
1. o operador imprime          →  agente calcula os hashes e publica a faixa
2. o atendente clica no painel →  QR do Pedido gerado, o anterior morre
3. o cliente lê com a câmera   →  troca o token pelo esqueleto, lido do ERP
4. o cliente entra e cadastra  →  evento criado, credenciais ligadas ao setor
5. o dono configura o evento   →  janela, bloqueios e aparelhos (parte 3a)
6. (parte 3b) a portaria lê    →  ainda não existe
```

O passo 1 e o passo 4 **não têm ordem obrigatória**. Imprimir antes de o cliente
reivindicar é o caso comum; reivindicar antes de imprimir acontece, e o sistema tem de
funcionar nos dois sentidos. Ver [O vínculo com o setor](#vinculo).

## A regra que decide tudo: quem fala com o banco

```
Agente (tem o pool)  ──hash──►  Render (service_role)  ──►  Supabase
                                       ▲
                                       │ JWT do cliente
                              evento.html (PWA, no celular)
```

**Nenhuma chave de banco chega ao celular nem ao navegador.** As oito tabelas
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
A estação simplesmente não serve esses endpoints — e é por isso que o log dela diz
`[app] Controle de acesso inativo (SUPABASE_SERVICE_KEY ausente)`, que é o certo, não um
defeito.

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

Ao fechar a impressão de um trabalho, o `app.py` chama
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
| `POST /pedidos/{p}/fechar` | carimba o total e compara com o que foi encomendado |

**Reabrir nunca troca o sal.** O cliente reimprime 500 de um pedido de 5.000; sal novo
invalidaria os 4.500 que já estão na mão das pessoas.

**A gravação é repetível.** `?on_conflict=chave_dedup` faz o reenvio não duplicar nada —
conferido contra o banco real: três envios do mesmo lote deixam uma linha. A chave é uma
coluna `GENERATED ALWAYS` do Postgres que junta **pedido + modelo + número + hash**
(`sql/schema_acesso_04_credencial_por_modelo.sql`); quem a calcula é o banco, em toda
inserção, e por isso não há como o código esquecer de preenchê-la nem preenchê-la
diferente do índice. O porquê dela está em [A ambiguidade](#ambiguidade), abaixo.

### `fechar` conta pelo `Content-Range`

O total sai de `contar()`, que pergunta ao PostgREST quantas linhas casam sem trazer
nenhuma. Medir o tamanho da lista devolvida **não funciona**: o PostgREST corta toda
resposta em 1.000 linhas, em silêncio e sem ordem definida.

> Em 15/08/2026 o pedido 18560, de 2.000 ingressos, fechou dizendo
> `[acesso] Faixa do pedido 18560 INCOMPLETA: 1000 de 2000` com as 2.000 credenciais
> gravadas e corretas. O estrago era duplo e calado: o `total_credenciais` gravado ficava
> pela metade, e o `completo` nunca virava verdadeiro — quer dizer, **todo pedido acima de
> mil ingressos se declarava eternamente incompleto** e mandava reimprimir papel que já
> estava certo. Mil é justamente o tamanho em que o defeito começa; nenhuma tiragem menor o
> mostraria.
>
> A mesma armadilha pega quem for conferir de fora: duas leituras seguidas da mesma tabela
> devolvem **fatias diferentes** com o mesmo total de 1.000. Para auditar, pagine por
> `Range` com `order` explícito, ou conte por `Prefer: count=exact`.

`fechar` devolve `esperado` e `completo`. É por aí que o agente sabe que um lote se perdeu
na rede, em vez de dar a publicação por terminada.

<a name="so-sobe-o-que-a-portaria-le"></a>
### Só sobe o que a portaria tem como ler

Regra do usuário, 15/08/2026, sobre o modelo 1000283 do pedido 20508: **modelo cuja
numeração não tem QR, QR Ideal nem código de barras não sobe ao Ideal Control.** Eram
cinquenta ingressos com a numeração "Numeração Esquerda - Preta 20mm", que só tem texto e
um PDF.

Um ingresso sem código **não é um ingresso com defeito**. Ele foi impresso do jeito que o
cliente contratou; ele simplesmente não é controlado na entrada. Tratá-lo como pendência
faz o sistema mentir de duas formas, e as duas são caladas:

- o modelo vira **um setor do evento com cinquenta lugares que nunca serão preenchidos**, e
  o dono olha a tela e vê uma faixa que "faltou publicar";
- o pedido se declara **eternamente incompleto** — o 20508 vivia como 163 de 213 —, e o
  agente avisa "faixa INCOMPLETA" a cada impressão.

`acesso_api._modelos_legiveis()` filtra os dois lugares onde isso aparece: os setores
criados na reivindicação e o `esperado` do `fechar`. Quem decide o que é legível é
`acesso_publicacao.numeracao_do_modelo`, a **mesma** função que o agente usa para decidir o
que publicar — duas definições de "tem código" divergiriam no dia em que uma delas mudasse,
e o sintoma seria o de sempre aqui: uma ponta esperando exatamente o que a outra nunca
manda.

Se o modelo precisar mesmo ser controlado, não é conserto de software: ele precisa de outra
numeração, com código, e de reimpressão de verdade, com papel novo.

<a name="vinculo"></a>
### O vínculo com o evento e o setor

A credencial nasce com `evento_id` e `setor_id` preenchidos quando o pedido já foi
reivindicado, e a reivindicação carimba as que vieram antes dela. **As duas metades juntas
é que cobrem as duas ordens possíveis.**

> Até 15/08/2026 só existia a segunda metade — um `PATCH` sobre as credenciais que já
> existiam no momento da reivindicação. Isso cobre uma ordem e falha calado na outra: no
> pedido 18560 o cliente reivindicou às 10:55 e o papel saiu às 18:52, e as 200 credenciais
> daquele dia ficaram órfãs para sempre. Em 15/08 as **363 credenciais do banco inteiro**
> estavam sem evento e sem setor.
>
> Órfã não é defeito visível: a credencial existe, conta no total, e some justamente onde
> importa — a portaria não sabe de que setor o código é, e o bloqueio por faixa, que é por
> setor, não alcança nenhuma. O conserto do passado é
> [sql/reparo_acesso_credenciais_orfas.sql](../sql/reparo_acesso_credenciais_orfas.sql).

Pedido ainda não reivindicado continua gravando **sem** setor, porque ainda não existe
evento a que pertencer. Isso é o normal, não uma falha.

<a name="nem-todo-ingresso-tem-qr-ideal"></a>
### Nem todo ingresso tem QR Ideal

Regra do usuário, 14/08/2026: **o Ideal Control tem de funcionar com qualquer ingresso que
tenha QR ou código de barras**, mesmo sem o elemento QR Ideal — lendo o dado do próprio
elemento de numeração. Não é hipótese: das **61 numerações** do catálogo, **31 a portaria
consegue ler** e só **2** têm QR Ideal (conferido em 15/08/2026).

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
| valor fixo | **não publica** — é o mesmo em todos os ingressos, não identifica nada |

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

<a name="ambiguidade"></a>
### A ambiguidade, e a decisão que a resolve

Com `prefix=''` e `pad=4` — que é como o acervo inteiro está —, o item 1 do VIP e o item 1
do CAMAROTE são os dois `0001`, no mesmo evento. E como o sal é por pedido, os dois dão o
**mesmo hash**.

Decisão do usuário: **o aparelho resolve pelo setor dele.** Cada aparelho valida uma lista
de setores, e o código é lido nesse contexto. Quando o aparelho valida vários setores e o
código casa em mais de um, a portaria pergunta qual, mostrando só os que casaram — um toque,
e fica registrado. Isso é trabalho da parte 3b.

> **A gravação chegou a atrapalhar essa decisão, e custou 31 ingressos.** Em 15/08/2026 o
> pedido 20508 tinha três modelos com a numeração "Triband", e o item 1 dos três saiu com o
> mesmo `000001`. A chave única era `codigo_hash` sozinho: o banco aceitou a IMPRENSA e
> **descartou em silêncio** a PISTA e o CAMAROTE. Papel entregue, nada na nuvem, recusa na
> portaria — e o aparelho nunca teria chance de resolver, porque a linha do segundo modelo
> não existia.
>
> A chave passou a ser `chave_dedup`. Os três `000001` convivem, um por modelo, cada um com
> o seu setor. **O papel não mudou**, por decisão do usuário: o texto impresso é o que o
> cliente contratou, e quem se ajusta é o banco.
>
> De quebra, isso conserta o caso de mudar a numeração e reimprimir: os dois lotes passam a
> valer na porta, em vez de o segundo ser descartado.

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

O segredo vai **embutido no executável**. Quem o gera é `New-SegredoDoAgente`, no módulo
`ferramentas/Publicacao.psm1`, chamada **antes** da compilação pelas duas ferramentas que
constroem o agente: o `build_agent.ps1` e o `publicar_agente.ps1`. O arquivo gerado
(`acesso_segredo.py`) é ignorado pelo git, e o build **para** sem ele — mesma razão do pool.

> **Uma rotina só, e uma guarda depois do build, porque a duplicata já falhou.** Até
> 14/08/2026 o `publicar_agente.ps1` **não gerava o segredo**, e o `build_agent.ps1` o
> gerava *depois* de compilar. Resultado: **nenhum agente publicado jamais teve o segredo**.
> O PyInstaller anotava `missing module named acesso_segredo` em
> `build/agent_tray/warn-agent_tray.txt` a cada build, num arquivo que ninguém lia, e a
> falha só aparecia na estação, na hora de publicar a faixa.
>
> Hoje `Test-SegredoNoBuild` lê esse arquivo depois de compilar e **interrompe a publicação**
> se o aviso estiver lá. É por isso que o `publicar_agente.ps1` imprime
> `Segredo conferido dentro do executavel.` antes de gerar o MSI.

> **Risco residual, registrado de propósito.** Quem tiver o segredo do agente e pegar a
> janela entre `abrir` e `fechar` ainda consegue ocupar uma posição da tiragem com um hash
> próprio. Endereçar isso é trabalho da parte 3b, onde a portaria vai poder cruzar o total
> publicado com o que o ERP encomendou.

### Onde imprimir, para a faixa subir

A publicação só acontece onde a imposição acontece: **no agente**. Se o navegador mandar o
trabalho para a nuvem, não há agente com faixa a publicar — e, no caso do QR Ideal, nem
pool.

Desde 15/08/2026 o Chrome bloqueia a página da Vercel de falar com a estação, então o painel
tem de ser aberto por **`http://localhost:9000`**. O porquê, a mensagem exata do navegador e
por que a solução não pode ser permissão concedida site a site estão em
[qr_ideal.md → Onde imprimir](qr_ideal.md#onde-imprimir).

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
pedidos: quantidade e reimpressão são por modelo. O cliente renomeia à vontade. Modelo sem
código legível não vira setor — ver
[Só sobe o que a portaria tem como ler](#so-sobe-o-que-a-portaria-le).

> Cuidado com o vocabulário: o setor do EVENTO ("VIP", "Pista") sai de `nome_modelo`. O
> campo `setor` de `pedidos_modelos` **já está ocupado** com o setor de PRODUÇÃO (FLEXO,
> TÊXTIL, PVC, LASER).

> **Limite conhecido.** O esqueleto é lido do ERP a cada leitura do QR, então ele sempre
> reflete o pedido de hoje. Os **setores já criados**, não: eles são gravados uma vez, na
> reivindicação. Se um modelo ganhar numeração com código depois disso, o setor dele não
> aparece sozinho. Não há hoje uma re-sincronização, e ela é trabalho da parte 3c.

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
| `ACESSO_ELEVACAO_SEGREDO` | Render | o dono digita a senha certa e **nada acontece** |

`GET /api/acesso/saude` responde as quatro de uma vez — presença de cada variável e se o
banco responde:

```json
{"ok": true, "variaveis": {"SUPABASE_SERVICE_KEY": true, "ACESSO_AGENTE_SEGREDO": true,
 "QR_PEDIDO_SEGREDO": true, "ACESSO_ELEVACAO_SEGREDO": true},
 "faltando": [], "banco": "ok"}
```

Ele diz **se** cada uma existe, nunca o que ela vale: o endpoint é público. E confere as
variáveis **antes** de tocar no banco, senão um erro de rede esconderia o de configuração,
que é o que a pessoa veio ver.

Cada uma falha num lugar diferente e tarde, e a quarta é a mais silenciosa de todas: o dono
entra na tela do evento, digita a senha certa, e nada acontece — porque o servidor não tem
como assinar a elevação.

Para pôr uma variável no Render sem abrir o painel deles:

```powershell
.\ferramentas\variavel_no_render.ps1 -Variavel ACESSO_ELEVACAO_SEGREDO
```

Ele lê o valor exato do `.env.local`, acha o serviço pelo nome **exato** (o filtro da API do
Render é por prefixo, e "imposicao" casaria com mais de um), grava por API e dispara o
deploy. Nunca imprime o valor.

> Uma armadilha já vivida: ao copiar a `SUPABASE_SERVICE_KEY` do painel do Supabase, um
> caractere sobrando no começo ou um `=` no fim fazem o Supabase responder `401 Invalid API
> key` — e a chave *parece* certa, com `role: service_role` e validade em 2035. A
> assinatura de um JWT tem **43 caracteres** e nunca termina em `=`.
>
> `.\ferramentas\copiar_para_render.ps1` tira o mouse do caminho: lê o valor exato do
> `.env.local`, confere o formato (as 3 partes, o `eyJ` do começo, os 43 caracteres da
> assinatura) e põe na área de transferência **sem mostrar na tela**. Com `-Conferir`, só
> confere.

## As oito tabelas

Nasceram em [sql/schema_acesso.sql](../sql/schema_acesso.sql), pronto para colar, mais as
migrações que vieram depois. Todos os arquivos são idempotentes e podem ser colados de novo.

| Arquivo | O que faz |
|---|---|
| `schema_acesso.sql` | cria **sete** tabelas, com RLS ligado e zero políticas |
| `schema_acesso_02_credencial_hash_unico.sql` | a primeira chave única, por `codigo_hash` |
| `schema_acesso_04_credencial_por_modelo.sql` | `chave_dedup`, que substitui a anterior |
| `schema_acesso_bloqueios.sql` | `abre_em`/`fecha_em` nos setores e a **oitava** tabela, `_bloqueios` |
| `reparo_acesso_credenciais_orfas.sql` | conserto pontual das credenciais sem evento/setor |

| Tabela | Guarda |
|---|---|
| `_eventos` | o evento do cliente; pode reunir vários pedidos |
| `_pedidos` | sal, token do QR e estado da publicação. Nasce **antes** do evento |
| `_setores` | um por modelo; a lotação É a `quantidade` do ERP, não um campo. `abre_em`/`fecha_em` = janela em que o setor vale; nulo = sempre |
| `_bloqueios` | faixas de ingresso recusadas na porta: `de`, `ate`, `motivo`. A faixa é um intervalo de `credenciais.numero`, e o motivo é o que a portaria lê em voz alta |
| `_credenciais` | `codigo_hash` sempre; `codigo_visivel` só quando `origem='cliente'`; `evento_id`/`setor_id` quando o pedido já foi reivindicado |
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

## O que já rodou de verdade

Dois pedidos completos em 15/08/2026, conferidos por leitura paginada do banco:

| Pedido | Modelos | Contratado | A publicar | Publicado | |
|---|---|---|---|---|---|
| 18560 | 5, todos legíveis | 2.000 | 2.000 | **2.000** | 400 com QR Ideal |
| 20508 | 7, sendo 6 legíveis | 213 | 163 | **163** | 100 com QR Ideal |

A diferença de 50 do 20508 é o modelo 1000283, que não tem código nenhum e por isso não
sobe — não é faixa faltando.

Zero credenciais sem setor, zero hashes repetidos, nenhuma faixa com buraco. Cinco das
numerações envolvidas são exclusivas (`is_custom`): Triband, 1000110, 1000117, 1000176 e
1000282. Vale registrar porque durante a investigação do 20508 chegou-se a suspeitar de uma
regressão em numeração exclusiva — não havia; era a nuvem se passando pelo agente local.

O que **não** está provado ainda: nada disso foi lido por um aparelho de portaria, porque a
parte 3b não existe. Todo o valor está guardado, e nenhum foi usado.

## O que falta (a partir da parte 3b)

A tela do dono (`controle.html`, parte 3a) **está no ar desde a v570**. Ela traz: login do
cliente, configuração por setor atrás de um botão **Configurar** (nome na portaria, janela
de abertura e fechamento, bloqueio por faixa com motivo), os aparelhos da portaria com
lista de setores própria, e a senha do dono travando a configuração do evento. **A lotação
de um setor é a quantidade contratada no ERP**, mostrada como informação e nunca como
campo — não existe um segundo número que possa discordar do contrato. O estado atual está em
[STATUS_PROJETO.md](STATUS_PROJETO.md).

O que falta é o aplicativo da PORTARIA (parte 3b): IndexedDB com validação local de
verdade, leitura de QR e registro de entrada sem depender de rede, e reentrada em uso de
verdade. Painel ao vivo, relatórios e cancelar credencial ficam para a parte 3c.

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

Duas pendências de produto continuam abertas, e nenhuma tem dono no plano atual:

- **não há como reativar um aparelho revogado** — a revogação é definitiva;
- **o log do agente é apagado a cada reinício** (`open(..., "w")` em `agent_tray.py`), o que
  já custou evidência duas vezes numa mesma investigação.

**O Ideal Control antigo continua fora deste repositório**, em `../ideal-IdealControl/`.
Trazê-lo para cá é trabalho da parte 3c, e a parte 3a reverteu o plano de evoluí-lo: o
layout foi refeito do zero, por decisão do usuário. Enquanto ele não vier, o `sw.js` que
ainda referencia SDKs do Firebase removidos mora lá, não aqui — não há `sw.js` em
`frontend/`.
