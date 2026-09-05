# Controle de acesso — do papel até a portaria

O QR Ideal ([docs/qr_ideal.md](qr_ideal.md)) põe no ingresso um código que ninguém
adivinha. Este documento é a outra metade: como esse código chega à nuvem, como o cliente
cadastra o evento dele, e o que protege cada passo.

Estado em 04/09/2026: **partes 2, 3a e 3b no ar**, mais a primeira metade da 3c (a tela da
gráfica, v589) e, desde a v820, a segunda: o **evento ao vivo** na mão do dono, a busca por
um ingresso, a planilha da noite e as duas saídas que faltavam — tirar um pedido do evento
e reconferir os setores. Ver [O evento ao vivo](#o-evento-ao-vivo-04092026).

A prova que continua faltando é a mesma desde agosto, e nenhuma linha de código a
substitui: **parear um celular de verdade, desligar Wi-Fi e dados, e ler**. Ver o item 4 de
[STATUS_PROJETO.md](STATUS_PROJETO.md).

## O caminho inteiro, em ordem

```
1. o operador imprime          →  agente calcula os hashes e publica a faixa
2. o atendente libera o acesso →  conta do cliente ligada ao id_cliente do ERP
3. o cliente entra no app      →  "Meus Pedidos" lista o que já foi impresso
4. o cliente toca em Carregar  →  evento criado, credenciais ligadas ao setor
5. o dono configura o evento   →  janela, bloqueios e aparelhos (parte 3a)
6. (parte 3b) a portaria lê    →  pronta, aguardando publicação
```

Os passos 2 e 3 são de **17/08/2026**, quando o QR do Pedido saiu de circulação — até
então o passo 2 era o atendente gerar o QR no painel e o passo 3 era o cliente lê-lo com a
câmera. O que mudou está em [A conta do cliente traz os
pedidos](#a-conta-do-cliente-traz-os-pedidos-17082026); o resto do desenho continua igual.

O passo 1 e o passo 4 **não têm ordem obrigatória** — e desde 17/08 essa liberdade só vale
em um sentido: `Meus Pedidos` só oferece pedido **já impresso**, então carregar antes de
imprimir deixou de acontecer pela tela. O banco continua aceitando as duas ordens, e as
credenciais publicadas depois se ligam ao setor do mesmo jeito. Ver
[O vínculo com o setor](#vinculo).

## A regra que decide tudo: quem fala com o banco

```
Agente (tem o pool)  ──hash──►  servidor com a service_role  ──►  Supabase
                                       ▲
                                       │ JWT do cliente
                              controle.html (o app no celular)
```

(Esse "servidor com a service_role" foi, até 16/08/2026, um Python hospedado na nuvem.
Hoje são as Edge Functions — ver a seção seguinte. O desenho é o mesmo; o que mudou foi
onde o código roda.)

**Nenhuma chave de banco chega ao celular nem ao navegador.** As onze tabelas
`producao_acesso_*` nasceram com RLS ligado e **zero políticas**: com a chave anônima —
que é pública e qualquer um lê no código-fonte do painel — não se lê nem se escreve uma
linha. Conferido contra o banco em 13/08/2026 para as sete primeiras (a `_bloqueios` veio
no dia seguinte, com o mesmo RLS no SQL): uma tentativa de escrita anônima volta
`42501, new row violates row-level security policy`.

A `service_role` vive só do lado do servidor, nos segredos do Supabase. Ela **não vai
para as estações**: o agente não tem autenticação de verdade (o `AGENT_ID` é um UUID em arquivo
local, que qualquer um forjaria), e distribuir a chave-mestra do banco — que abre cliente,
proposta e financeiro do parceiro — em cada `NewProd.exe` seria bem pior do que a chave
anônima que já circula.

Consequência visível: o `app.py` monta o router `/api/acesso/*` **só onde a chave existe**.
A estação simplesmente não serve esses endpoints — e é por isso que o log dela diz
`[app] Controle de acesso inativo (SUPABASE_SERVICE_KEY ausente)`, que é o certo, não um
defeito.

## Onde cada consumidor fala hoje (17/08/2026)

O desenho acima continua valendo — o que mudou foi **onde o código roda**. Desde a Fase 2b
o controle de acesso inteiro vive em Edge Functions, ao lado do banco, e em 17/08/2026 o
servidor Python que ficava na nuvem foi desligado:

```
Agente (tem o pool)  ──hash──►  Edge Function (service_role)  ──►  Supabase
                                       ▲
                                       │ JWT do cliente
                              controle.html (o app no celular)
```

| Quem fala | Função | Rota antiga, no servidor da nuvem | `verify_jwt` |
|---|---|---|---|
| Ideal Control da gráfica (`ideal-control.js`) | `acesso-interno` | `/api/acesso/interno/*` | sim |
| Tela do dono (`controle.html`) | `acesso-conta` | `/api/acesso/*` | sim |
| **ninguém** — sem chamador desde 17/08 | `acesso-evento` | `/api/acesso/evento` | **não** |
| **ninguém** — sem chamador desde 17/08 | `acesso-pedido` | `/api/acesso/pedidos/{p}/qr` | sim |
| Estação, publicando a faixa | `acesso-estacao` | `/api/acesso/pedidos/{p}/…` | **não** |
| Celular da portaria | `portaria` | `/api/acesso/portaria/*` | **não** |

As duas linhas de **ninguém** eram, até 17/08/2026, as do caminho do QR do Pedido. Quem
falava com elas era o `evento.html` — a página que o QR do Pedido abria — e o botão "QR do Pedido" do
painel; as duas saíram da tela naquele dia, e o arquivo `frontend/evento.html` foi apagado.
As funções ficam publicadas um release, para nenhum QR que já circula por WhatsApp bater
em porta fechada antes da hora.

O que cada corte economiza é uma travessia de internet inteira — antes toda chamada ia ao
servidor da nuvem e ele ia ao Supabase — mais, nas três primeiras, uma segunda ida
escondida: aquele servidor perguntava ao Supabase **quem está falando** a cada requisição,
porque não tinha como conferir o JWT sozinho. Numa Edge Function o portão do Supabase já conferiu a assinatura
antes de invocar a função, e a identidade sai das claims sem rede nenhuma.

As duas com `verify_jwt = false` não são exceção descuidada: quem fala com elas não tem
sessão do Supabase. O celular da portaria apresenta um token de aparelho nosso, a estação
apresenta o `ACESSO_AGENTE_SEGREDO`, e o cliente que lê o QR ainda **nem tem conta** — o que
protege aquela rota é a assinatura do próprio token do QR. Ligar a verificação nelas
recusaria tudo com 401 antes de o nosso código rodar.

**O servidor Python da nuvem saiu do ar em 17/08/2026** — a Fase 3, concluída depois que
as onze estações migraram. Não existe volta atrás por troca de endereço: o que era dele
está nas Edge Functions, e o `app.py` ficou sendo só o motor da estação da gráfica, em
`http://localhost:9000`.

Durante a transição cada corte foi guardado por um teste de paridade que batia nos **dois**
endereços com a mesma credencial e comparava. Eles saíram junto com o servidor (commit
`f959712`): teste que bate num endereço morto passa por vácuo, e passar por vácuo é pior
que não existir. No lugar deles ficou o `tests/test_sem_render.py`, que cobra o contrário
— que nenhum arquivo do aplicativo volte a citar aquele endereço.

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

### Onde imprimir, para a faixa subir

A publicação só acontece onde a imposição acontece: **no agente**. Se o navegador mandar o
trabalho para a nuvem, não há agente com faixa a publicar — e, no caso do QR Ideal, nem
pool.

Desde 15/08/2026 o Chrome bloqueia a página da Vercel de falar com a estação, então o painel
tem de ser aberto por **`http://localhost:9000`**. O porquê, a mensagem exata do navegador,
por que a solução não pode ser permissão concedida site a site, e a segunda proteção — o
`/api/status` declarando `onde` para a nuvem não se passar pela estação — estão em
[qr_ideal.md → Onde imprimir](qr_ideal.md#onde-imprimir).

### Os três endpoints

Nesta ordem:

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

`modelosLegiveis()` filtra os dois lugares onde isso aparece: os setores criados ao
carregar o pedido (o `_modelos_legiveis()` do `acesso_api.py` é o gêmeo em Python) e o
`esperado` do `fechar`. Quem decide o que é legível é
`acesso_publicacao.numeracao_do_modelo`, a **mesma** função que o agente usa para decidir o
que publicar (a regra dela está em
[Nem todo ingresso tem QR Ideal](#nem-todo-ingresso-tem-qr-ideal), logo abaixo) — duas
definições de "tem código" divergiriam no dia em que uma delas mudasse, e o sintoma seria o
de sempre aqui: uma ponta esperando exatamente o que a outra nunca manda.

Se o modelo precisar mesmo ser controlado, não é conserto de software: ele precisa de outra
numeração, com código, e de reimpressão de verdade, com papel novo.

> **O filtro não é retroativo.** Setores criados antes da v581 para modelos sem código
> continuam no banco: hoje são oito, nos pedidos de teste 19775 (AVRA e WHISPER, numeração
> alimentada por CSV) e 20435 (seis setores com numeração só de texto e PDF). Eles nunca
> receberão credencial e só saem por limpeza manual ou pela re-sincronização de setores, que
> é trabalho da parte 3c.

<a name="vinculo"></a>
### O vínculo com o evento e o setor

A credencial nasce com `evento_id` e `setor_id` preenchidos quando o pedido já virou
evento, e o momento em que ele vira carimba as que vieram antes. **As duas metades juntas
é que cobrem as duas ordens possíveis.**

> O momento em que o pedido vira evento chamava-se **reivindicação** (o cliente lia o QR do
> Pedido) e desde 17/08/2026 chama-se **carregar** (o cliente toca em "Carregar" em Meus
> Pedidos). O mecanismo é o mesmo, e o `carregar` herdou este código inteiro; o parágrafo
> abaixo, que conta a história de 15/08, guarda o nome antigo de propósito.

> Até 15/08/2026 só existia a segunda metade — um `PATCH` sobre as credenciais que já
> existiam no momento da reivindicação. Isso cobre uma ordem e falha calado na outra: no
> pedido 18560 o cliente reivindicou às 10:55 UTC (07:55 na gráfica) e o papel saiu às
> 18:52 UTC (15:52), e as 200 credenciais daquele dia nasceram sem dono. Na manhã de 15/08
> o banco tinha 363 credenciais, e **todas** estavam sem evento e sem setor.
>
> Órfã não é defeito visível: a credencial existe, conta no total, e some justamente onde
> importa — a portaria não sabe de que setor o código é, e o bloqueio por faixa, que é por
> setor, não alcança nenhuma. O conserto do passado é
> [sql/reparo_acesso_credenciais_orfas.sql](../sql/reparo_acesso_credenciais_orfas.sql).

Pedido ainda não carregado continua gravando **sem** setor, porque ainda não existe evento
a que pertencer. Isso é o normal, não uma falha.

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

Por modelo, vale o primeiro tipo presente, nesta ordem: **`QR_IDEAL`**, depois **`QR`**,
depois **`BARCODE`**.

| Elemento escolhido | Conteúdo publicado |
|---|---|
| `QR_IDEAL` | código do pool |
| `QR` ou `BARCODE` | `prefixo + numero.zfill(pad) + sufixo` |

Dois casos são **pulados** em qualquer tipo, e o próximo candidato ainda vale: o elemento
alimentado por coluna do CSV (o conteúdo vem da linha, não do número do item) e o de valor
fixo (é o mesmo em todos os ingressos, não identifica nada). Sem nenhum candidato, o modelo
não publica — é a definição de "legível" que a seção
[Só sobe o que a portaria tem como ler](#so-sobe-o-que-a-portaria-le) usa.

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

Com prefixo vazio e o mesmo `pad` — que é como o acervo está: das 29 numerações legíveis
por QR ou barras, 21 têm `pad=4` e 8 têm `pad=6`, nenhuma com prefixo —, o item 1 do VIP e
o item 1 do CAMAROTE saem com o mesmo texto (`0001` ou `000001`), no mesmo evento. E como o
sal é por pedido, os dois dão o **mesmo hash**.

Decisão do usuário: **o aparelho resolve pelo setor dele.** Cada aparelho valida uma lista
de setores, e o código é lido nesse contexto. Quando o aparelho valida vários setores e o
código casa em mais de um, a portaria pergunta qual, mostrando só os que casaram — um toque,
e fica registrado. É o que a parte 3b implementa — ver [A portaria (parte
3b)](#a-portaria-parte-3b).

> **A gravação chegou a atrapalhar essa decisão, e custou 31 ingressos.** Na noite de 14
> para 15/08/2026 o pedido 20508 tinha três modelos com numerações diferentes — Triband
> Padrão, Triband e 1000117 — mas de mesmo formato, prefixo vazio e seis dígitos, e o item 1
> dos três saiu com o mesmo `000001`. A chave única era `codigo_hash` sozinho: o banco
> aceitou a IMPRENSA e **descartou em silêncio** a PISTA e o CAMAROTE. Papel entregue, nada na nuvem, recusa na
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
- publicação fechada não aceita mais lote; reabrir é ato explícito do agente.

> **Uma exceção que vale registrar, hoje sem gatilho:** gerar o QR do Pedido chamava
> `_abrir_pedido` para garantir a linha e o sal, e isso **reabre** uma publicação já
> fechada — apaga o `publicado_em`. Ninguém gera mais QR do Pedido desde 17/08/2026,
> então esse caminho não é mais percorrido; a conclusão, porém, continua de pé, porque o
> agente também reabre a cada lote: o "estado da publicação" que a tabela `_pedidos`
> guarda **não é confiável**, e é por isso que `Meus Pedidos` conta credencial publicada
> em vez de olhar o `publicado_em`.

O segredo vai **embutido no executável**. Quem o gera é `New-SegredoDoAgente`, no módulo
`ferramentas/Publicacao.psm1`, chamada **antes** da compilação pelas duas ferramentas que
constroem o agente: o `build_agent.ps1` e o `publicar_agente.ps1`. O arquivo gerado
(`acesso_segredo.py`) é ignorado pelo git, e o build **para** sem ele — mesma razão do pool.

> **Uma rotina só, e uma guarda depois do build, porque a duplicata já falhou.** Até a
> noite de 14 para 15/08/2026 (agente 1.2.75) o `publicar_agente.ps1` **não gerava o
> segredo**, e o `build_agent.ps1` o gerava *depois* de compilar. Resultado: **nenhum agente
> publicado jamais teve o segredo**.
> O PyInstaller anotava `missing module named acesso_segredo` em
> `build/agent_tray/warn-agent_tray.txt` a cada build, num arquivo que ninguém lia, e a
> falha só aparecia na estação, na hora de publicar a faixa.
>
> Hoje `Test-SegredoNoBuild` lê esse arquivo depois de compilar e **interrompe a publicação**
> se o aviso estiver lá. É por isso que o `publicar_agente.ps1` imprime
> `Segredo conferido dentro do executavel.` antes de gerar o MSI.

> **Risco residual, registrado de propósito.** Quem tiver o segredo do agente e pegar a
> janela entre `abrir` e `fechar` ainda consegue ocupar uma posição da tiragem com um hash
> próprio. O sinal disso é a comparação "encomendado × publicado", que por decisão do
> usuário em 14/08 **saiu** da tela do dono — se voltar, volta como relatório no painel ao
> vivo da parte 3c, não como alarme na portaria.

## O QR do Pedido (fora de circulação desde 17/08/2026)

> **Nada nesta seção está em uso.** O QR do Pedido saiu da tela no dia 17/08/2026, junto
> com o `evento.html` que ele abria: quem traz os pedidos para o aplicativo passou a ser a
> **conta do cliente** — ver [A conta do cliente traz os
> pedidos](#a-conta-do-cliente-traz-os-pedidos-17082026). A seção fica porque a função
> `acesso-pedido` continua publicada por um release e o mecanismo precisa estar escrito
> em algum lugar enquanto isso.

É uma URL curta com token assinado: `evento.html?t=<pedido>.<vencimento>.<assinatura>`.
Quarenta e quatro caracteres de token, 87 de URL, QR versão 5 com 37 módulos por lado — lê
bem de tela de celular e de foto de WhatsApp comprimida.

**Ele não carrega os dados do evento.** Isso é arquitetura, não economia de bytes: neste
projeto o que o parceiro escreve no banco é a origem da verdade, e um QR com a lista de
setores dentro continuaria afirmando a quantidade velha depois que o pedido mudasse no ERP.

O número do pedido em claro não é vazamento — ele está impresso no ingresso. Quem protege é
a assinatura, que cobre pedido **e** vencimento: trocar o número para entrar no evento do
vizinho não cola, e esticar a data para reviver um token velho também não. O token vale
**180 dias** (`qr_pedido.VALIDADE_PADRAO_DIAS`); depois disso o cliente vê "Este QR venceu"
e o atendente gera outro.

**Autenticidade e validade são perguntas diferentes**, e o código as separa:

| Onde | Pergunta |
|---|---|
| `qr_pedido.conferir` | é autêntico? (assinatura, vencimento) — pura criptografia |
| `acesso_api._esqueleto` | ainda vale? (revogado, substituído) — só o banco sabe |

Gerar um QR novo troca o `qr_token_hash` guardado, e o anterior para de funcionar mesmo
continuando criptograficamente válido. É o conserto de quando o QR cai na pessoa errada —
**enquanto ela ainda não reivindicou**. Se a conta errada já cadastrou o pedido, gerar QR
novo não desfaz nada: o cliente certo lê o QR novo e recebe o mesmo `409` ("este pedido ja
foi cadastrado por outra conta"), porque o `evento_id` do pedido continua apontando para o
evento errado. Não existe hoje endpoint para desvincular pedido de evento; isso está listado
para a parte 3c, e até lá o caso é pendência a resolver à mão no banco.

O endpoint que **gera** o QR exige login de verdade — ele confere o token do Supabase
perguntando ao próprio Supabase. O `get_current_user` do `app.py` não serve: ele devolve
admin para todo mundo sem conferir nada.

## Reivindicar o evento (fora de circulação desde 17/08/2026)

> **Nada nesta seção está em uso.** O `POST /reivindicar` ficou sem chamador quando o QR
> do Pedido saiu da tela. Quem cria o evento hoje é o "Carregar" de **Meus Pedidos** — ver
> [A conta do cliente traz os pedidos](#a-conta-do-cliente-traz-os-pedidos-17082026). As
> regras abaixo sobre **setor por modelo** e **juntar pedidos num mesmo evento**
> continuam valendo palavra por palavra: o `carregar` as herdou inteiras.

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

## A conta do cliente traz os pedidos (17/08/2026)

O QR do Pedido saiu de circulação. O que existe agora:

1. **A gráfica libera o acesso** no painel, dentro do pedido, no bloco "Acesso do
   cliente": cria a conta na mesma auth do Vibe com uma senha provisória (8
   símbolos, sem `0 O 1 I L`, mostrada uma vez) e grava a ligação conta ↔
   `id_cliente` em `producao_acesso_contas`. E-mail que já tinha conta é só
   ligado — a senha dele fica em paz (`criada_aqui = false`). **Liberar de novo
   o mesmo e-mail não reescreve a ligação** (04/09/2026): até então o segundo
   clique gravava `criada_aqui: false` por cima, o botão "Nova senha provisória"
   sumia e o servidor recusava com 403 uma conta que a gráfica criou. Quem diz
   se a conta é nossa é o `user_metadata.origem` gravado ao criá-la. O bloco
   "Acesso do cliente" existe nas duas portas da tela — pedido aberto ou busca
   por cliente — e não mais só dentro do painel do pedido.
2. **O cliente instala o app pelo QR de instalação** (um só, genérico:
   `https://ideal-imposition.vercel.app/ic/`) e entra. O primeiro acesso obriga a
   trocar a senha. "Esqueci minha senha" manda falar com a gráfica: o projeto não
   tem SMTP, e-mail não chega.
3. **"Meus Pedidos"** (`GET /meus-pedidos`) lista os pedidos do cliente **já
   impressos** — com pelo menos uma credencial publicada; `publicado_em` não serve,
   porque gerar QR e reimprimir a zeram —, legíveis, não cancelados e ainda não
   carregados. Nome, data e local vêm de `pedidos_artes`. Um `amostra_num_id`
   que não tem forma de UUID (havia um `"n1"` no pedido de testes) é descartado
   por `idDeNumeracao()` antes da consulta: até 04/09/2026 ele fazia o banco
   recusar a consulta inteira, e o cliente não via pedido nenhum.
4. **"Carregar"** (`POST /pedidos/{p}/carregar`) cria o evento (ou junta a um
   existente do mesmo cliente), um setor por modelo legível, carimba as
   credenciais e devolve a **elevação de 15 minutos** — por isso o "usar este
   aparelho" logo depois não pede a senha de novo — ou `null`, se a elevação
   falhar depois de o evento já existir; nesse caso a tela pede a senha de novo
   antes de ligar o aparelho.
5. **Os eventos são do cliente**: toda conta ligada ao mesmo `id_cliente` vê e
   configura os mesmos eventos (`pertenceAConta`). Os eventos antigos continuam
   visíveis pela conta que os criou.

**Entrar libera 15 minutos** (18/08/2026). A mesma senha que abre a sessão compra, na
mesma digitação, um bilhete de **conta** — `POST /minha-conta/elevar`, assinado com o
mesmo `ACESSO_ELEVACAO_SEGREDO` e preso a este navegador, só que sob o pseudo-evento
`conta`. Dentro dos 15 minutos ele dispensa a **digitação** da senha em duas portas:
`POST /pedidos/{p}/carregar` e `POST /eventos/{id}/elevar`. Ele **não** substitui elevação
nenhuma nas rotas de escrita — a assinatura é recalculada sobre o id do evento e um bilhete
de conta simplesmente não bate. O que a engrenagem faz é trocá-lo pelo bilhete **do
evento**, que é o que a escrita exige. Senha digitada continua sendo conferida, mesmo com
o bilhete aberto; sair da conta o esquece.

Vocabulário: **"Aparelho"**, não "Portão" — todo aparelho é portão.

**Usabilidade (18/08/2026).** Junto com o bilhete de conta entraram, na mesma leva: o
**Mostrar/Ocultar** em todo campo de senha (a senha provisória é `K7M2PQ9X` digitada no
celular); botões com estado de espera ("Entrando…", "Salvando…", "Carregando…") que se
desabilitam durante a ida à rede — e a `travarCampos()` da engrenagem não os reabilita
enquanto esperam; a barra do evento com subtítulo (data · local · "lê neste aparelho como
Aparelho 1"); a casa vazia em três passos; o e-mail da conta e a versão no menu do olho;
"Atualizar" em Meus Pedidos; a **engrenagem em cinco seções recolhidas** (Evento,
Aparelhos, Setores, Este aparelho, Zona de risco), cada uma com o resumo no cabeçalho, o
estado lembrado por evento no `sessionStorage` (`ideal_control_secoes:<evento_id>`) e
`Controle.abrirSecao/abrirTodasSecoes` para os testes; a **pergunta "usar este aparelho?"
com o nome do aparelho** (opcional, sugere "Aparelho N") — tanto no "Sim" depois do
Carregar quanto no toque na barra do evento, que antes só a senha confirmava e agora
confirma antes de encerrar a sessão da conta neste celular; e, no painel da gráfica, o
**"Enviar por WhatsApp"** ao lado da senha provisória (`wa.me/?text=` com e-mail, senha e
link de instalação já escritos, vivendo e morrendo com a senha na tela).

Ficam um release, sem chamador: `acesso-evento`, `acesso-pedido` e
`POST /reivindicar`.

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

## A tela do cliente: era `evento.html`, hoje é `controle.html`

**O `frontend/evento.html` foi apagado em 17/08/2026**, junto com o `evento.js`, o
`ler-qr.js` e o `instalar.js`. Ele existia para uma coisa só: receber o cliente que
chegava pela câmera, lendo o QR do Pedido. Sem QR, não havia mais por onde chegar nele.

A casa do cliente passou a ser o próprio aplicativo, o `controle.html` — a mesma tela onde
ele já configurava o evento. O que valia lá continua valendo aqui, e pelas mesmas razões:
auto-contida e feita para telefone, **sem** o `style.css` de 84 KB do painel, que foi
desenhado para a tela larga do operador; campos com fonte de 16px (menor que isso o iOS dá
zoom ao focar) e alvos de toque de 48px.

As mensagens de erro continuam traduzidas para português de gente **no servidor**. O
`qr_pedido` falava técnico, que é o certo para log e teste, e "token malformado" nunca foi
frase para o cliente ler no celular; o `acesso-conta` de hoje segue a mesma regra.

## O que precisa estar configurado

| Variável | Onde | Sem ela |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | segredos do Supabase | o router `/api/acesso/*` nem é montado |
| `ACESSO_AGENTE_SEGREDO` | segredos do Supabase **e** no build do agente | a faixa nunca é publicada |
| `QR_PEDIDO_SEGREDO` | segredos do Supabase | não dá para gerar QR do Pedido — que **saiu de circulação em 17/08/2026**. A variável continua exigida enquanto a função `acesso-pedido` estiver publicada |
| `ACESSO_ELEVACAO_SEGREDO` | segredos do Supabase | o dono digita a senha e a tela responde "ACESSO_ELEVACAO_SEGREDO nao configurada neste servidor" (503) — continua somente leitura |

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

Cada uma falha num lugar diferente e tarde: sem a `SUPABASE_SERVICE_KEY` o router nem
sobe; sem o `ACESSO_AGENTE_SEGREDO` a faixa é recusada no meio de uma impressão que já
terminou; sem o `QR_PEDIDO_SEGREDO` o atendente descobre na frente do cliente que não sai
QR; sem a `ACESSO_ELEVACAO_SEGREDO` o dono descobre na hora de configurar o evento. A
falha é sempre **fechada** e com o nome da variável na mensagem — mas só o `saude` diz as
quatro de uma vez, antes de alguém esbarrar nelas.

As quatro moram nos **segredos do Supabase**, que é o que as Edge Functions leem. Os dois
scripts que gravavam variável no painel do serviço hospedado
(`ferramentas/variavel_no_render.ps1` e `ferramentas/copiar_para_render.ps1`) saíram em
17/08/2026, junto com o serviço.

> Uma armadilha já vivida, e que continua valendo: ao copiar a `SUPABASE_SERVICE_KEY` do
> painel do Supabase, um caractere sobrando no começo ou um `=` no fim fazem o Supabase
> responder `401 Invalid API key` — e a chave *parece* certa, com `role: service_role` e
> validade em 2035. A assinatura de um JWT tem **43 caracteres** e nunca termina em `=`.

## As onze tabelas

Nasceram em [sql/schema_acesso.sql](../sql/schema_acesso.sql), pronto para colar, mais as
migrações que vieram depois.

| Arquivo | O que faz | Recolar? |
|---|---|---|
| `schema_acesso.sql` | cria **sete** tabelas, com RLS ligado e zero políticas | **não**, depois da 04 |
| `schema_acesso_02_credencial_hash_unico.sql` | limpeza: apaga o índice de expressão da primeira versão; a chave por `codigo_hash` sozinho já vinha do `schema_acesso.sql` | **não**, depois da 04 |
| `schema_acesso_04_credencial_por_modelo.sql` | `chave_dedup`, que substitui a chave por `codigo_hash` | sim |
| `schema_acesso_bloqueios.sql` | `abre_em`/`fecha_em` nos setores e a **oitava** tabela, `_bloqueios` | sim |
| `reparo_acesso_credenciais_orfas.sql` | conserto pontual das credenciais sem evento/setor | sim |
| `reparo_acesso_total_publicado.sql` | recalcula `total_credenciais` de cada pedido a partir do que existe | sim |
| `schema_acesso_freio_pareamento.sql` | a **nona** tabela, `_falhas_pareamento`: o freio de forca bruta do pareamento, que ate 16/08/2026 vivia na memoria do processo | sim |
| `schema_acesso_setor_bloqueado.sql` | `bloqueado`/`bloqueado_motivo` nos setores: desligar o setor INTEIRO, e nao so uma faixa de numeros | sim |
| `schema_acesso_entradas_unicas.sql` | a **decima** tabela, `_entradas_unicas`: e ela que decide, no banco, qual de dois aparelhos registrou a entrada primeiro | sim |
| `schema_acesso_contas.sql` | a **decima primeira** tabela, `_contas`: liga a conta do cliente ao `id_cliente` do ERP. Cria tambem `acesso_usuario_por_email()`, o unico caminho ate `auth.users` | sim |

**Por que os dois primeiros não devem ser recolados:** os dois contêm
`CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_credencial_hash_simples … (codigo_hash)` — a
chave antiga que a migração 04 apagou de propósito. Colar qualquer um deles de novo tenta
recriá-la: no banco de hoje falha, porque existem 320 `codigo_hash` repetidos entre modelos
por desenho; num banco ainda sem repetição, reinstala em silêncio o defeito que descartou 31
ingressos do 20508.

| Tabela | Guarda |
|---|---|
| `_eventos` | o evento do cliente; pode reunir vários pedidos |
| `_pedidos` | sal, token do QR e estado da publicação. Nasce **antes** do evento |
| `_setores` | um por modelo; a lotação É a `quantidade` do ERP. Existe uma coluna `lotacao`, herdada do desenho de 13/08, **nula em todas as linhas e ignorada pela API e pela tela** — não use. `abre_em`/`fecha_em` = janela em que o setor vale; nulo = sempre |
| `_bloqueios` | faixas de ingresso recusadas na porta: `de`, `ate`, `motivo`. A faixa é um intervalo de `credenciais.numero`, e o motivo é o que a portaria lê em voz alta |
| `_entradas_unicas` | uma linha por credencial que JA ENTROU, so para setor de entrada unica. A chave primaria e o mecanismo: `ON CONFLICT DO NOTHING` decide a corrida entre dois aparelhos numa operacao so. Perguntar "ja existe?" e so entao gravar sao duas consultas que podem se cruzar, e os dois entram. Setor de reentrada nao tem linha aqui, por desenho |
| `_falhas_pareamento` | uma linha por tentativa errada de pareamento, com `evento_id` e `momento`. Dez em cinco minutos fecham o pareamento daquele evento. Mora no banco, e não na memória do processo, porque a Edge Function é stateless — e porque enquanto as duas versões conviverem elas precisam contar no mesmo lugar |
| `_credenciais` | `codigo_hash` sempre; `codigo_visivel` só quando `origem='cliente'`; `evento_id`/`setor_id` quando o pedido já foi reivindicado. **`origem` só separa agente de cliente**: o agente grava `qr_ideal` em toda credencial, inclusive nas de QR e barras comuns — o tipo de código se lê pela numeração do modelo, não por aqui |
| `_dispositivos` | os aparelhos da portaria (parte 3a — já em uso pela tela do dono) |
| `_dispositivo_setores` | em quais setores cada aparelho valida (parte 3a — já em uso) |
| `_leituras` | toda leitura, inclusive negada (parte 3b — ainda vazia) |
| `_contas` | qual conta do Supabase pertence a qual cliente do ERP. Chave composta `(auth_user_id, id_cliente)`, porque a conta de teste da grafica serve a mais de um cliente e um cliente pode ter mais de uma pessoa. `criada_aqui` separa a conta que a grafica criou — so dessa ela redefine a senha; `senha_provisoria_em` preenchida prende o aplicativo na tela "Escolha a sua senha" |

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

Nenhuma faixa com buraco; zero `chave_dedup` repetida; zero credencial órfã em pedido
reivindicado (as 163 do 20508 esperam a reivindicação, que ainda não houve). Hashes iguais
entre modelos com numeração de mesmo formato **existem por desenho** — 320 no banco hoje —
e é o aparelho que os resolve, como explica [A ambiguidade](#ambiguidade). Cinco das
numerações envolvidas são exclusivas (`is_custom`): Triband, 1000110, 1000117, 1000176 e
1000282. Vale registrar porque durante a investigação do 20508 chegou-se a suspeitar de uma
regressão em numeração exclusiva — não havia; era o painel impondo na nuvem em vez de na
estação (ver [qr_ideal.md → Onde imprimir](qr_ideal.md#onde-imprimir)).

> **Um número gravado ainda está errado.** O 18560 fechou às 12:03 UTC de 15/08, antes da
> correção do `contar()`, e `producao_acesso_pedidos.total_credenciais` dele continua em
> **1000**. As 2.000 credenciais existem; só o carimbo está pela metade. Ele se corrige no
> próximo `fechar` (uma reimpressão) ou por
> [sql/reparo_acesso_total_publicado.sql](../sql/reparo_acesso_total_publicado.sql), que
> recalcula o carimbo de todos os pedidos.

O que **não** está provado ainda: nada disso foi lido por um aparelho de portaria de
verdade — o código está pronto e testado, mas ainda não foi publicado. Todo o valor está
guardado, e nenhum foi usado.

<a name="a-portaria-parte-3b"></a>
## A portaria (parte 3b)

`portaria.html` é a tela do porteiro. Depois de pareada, ela **decide sem rede**.

Há **dois** jeitos de pôr um portão no ar, e desde a v612 o primeiro é o preferido.

**O dono, com o celular do portão na mão** (v612). Ele abre o aplicativo nesse aparelho,
entra com a conta do Vibe, escolhe o evento e usa **"Usar ESTE aparelho na portaria"**: dá um
nome ao portão, toca nos setores e salva. O servidor cunha o token **na criação** e o devolve
uma vez só; o aparelho o guarda e **a sessão da conta é encerrada ali mesmo**. Não há código
nenhum nesse caminho, e não deve haver — código guardado no banco é código que parearia um
*segundo* celular naquele portão (por isso `codigo_hash` passou a aceitar nulo).

A ordem das operações é a parte que não pode sair errada, e é a razão de `frontend/aparelho.js`
ser um arquivo sozinho: **guardar o token → encerrar a sessão → ir para a leitura**.
Invertidas as duas primeiras, uma falha no meio deixa o aparelho sem conta *e* sem token, no
meio de um evento.

**O código de 6 caracteres** (v585), para quando o celular do portão **não** está ali. O
porteiro abre o endereço que a tela do dono mostra — `portaria.html?e=<evento_id>`, também
como QR — e digita o código daquele aparelho. O servidor troca o código por um token próprio.

Nos dois casos o token é guardado como `sha256` na coluna `token_hash`, que existe desde
13/08. **Pausar ou excluir o aparelho é o único jeito de derrubá-lo**: gerar um código novo
não desconecta ninguém, porque quem já pareou não usa mais o código.

A portaria só aceita `status = 'ativo'` — é isso que faz *Pausar* valer do outro lado sem
nenhum código a mais. *Excluir* apaga a linha: os vínculos de setor vão junto
(`on delete cascade`) e as leituras ficam, sem dono (`on delete set null`), porque o
histórico da noite não pode depender de o aparelho continuar existindo. Ver
`sql/schema_acesso_excluir_aparelho.sql`.

**A gráfica e o cliente veem a mesma configuração** (usuário, 18/08/2026): "Configurações
salvas no aparelho devem ser espelhadas no menu Ideal Control do Imposition, e vice-versa".
Os dois lados escrevem nas mesmas tabelas; o que faltava era o painel da gráfica *mostrar* o
que o cliente muda — a situação do evento (`status`) e o setor bloqueado inteiro
(`bloqueado`, `bloqueado_motivo`). A busca daquela tela passou a ser pelo **número do
cliente** (`GET /clientes/{id}` da `acesso-interno`), e o formulário de criar aparelho por
código saiu: o código de seis caracteres não tem mais onde ser digitado desde 16/08/2026.

**O nome é do dispositivo, não do evento** (usuário, 18/08/2026). A coluna `navegador_id`,
gravada quando o celular vira portão, liga as linhas do mesmo aparelho em eventos
diferentes; renomear um portão renomeia os outros do mesmo cliente. O celular também guarda
o próprio nome em `localStorage`, e é essa cópia — que responde sem rede — que já vem
escrita na pergunta "usar este aparelho?". Ver `sql/schema_acesso_nome_do_dispositivo.sql`.

**A trava** (v612). Salvo o aparelho, ele abre direto na leitura, e a única saída é o botão
*"Configurar este aparelho"*, que leva ao login. Reeditar **e apagar** passam pela senha — o
`desparear`, que apagava token, carga, fila e entradas ali mesmo, deixou de fazer isso.
Antes de sair, a fila sobe: configurar cunha um token novo, e leitura enfileirada sob o token
velho não sobe mais depois. E a carga é rebaixada antes da primeira leitura, porque ela
guarda o **nome** do portão e os **setores** que ele valida — reusá-la mostraria o portão
velho e recusaria ingresso bom como "OUTRA PORTA".

Em seguida o aparelho baixa a carga — o evento **inteiro**, em páginas de 5.000 — para o
IndexedDB: hashes, sais de cada pedido, setores, bloqueios, e quais setores este aparelho
valida. O evento inteiro, e não só os setores autorizados, porque é isso que permite
distinguir "não é deste evento" de "é deste evento, mas de outra porta" — e chamar o segundo
de primeiro faz o porteiro devolver ingresso bom achando que é falso.

As **oito** regras vivem em `frontend/portaria-validacao.js`, puras, e a **ordem é a
resposta** — um ingresso pode falhar por dois motivos ao mesmo tempo, e o porteiro precisa
ouvir o que ele consegue resolver:

| # | Regra | O que o porteiro vê |
|---|---|---|
| 0 | `evento_inativo` | o dono desligou o evento inteiro — a única frase que explica por que a fila parou |
| 1 | `desconhecido` | vermelho — não é deste evento |
| 2 | `setor_nao_autorizado` | **laranja** — ingresso é de um setor que este aparelho não lê |
| 3 | `setor_bloqueado` | o dono desligou ESTA porta, e disse por quê |
| 4 | `fora_da_janela` | o setor abre às 20h / fechou às 2h |
| 5 | `bloqueado` | vermelho, **com o motivo em corpo grande** |
| 6 | `ja_entrou` | só onde `tipo_uso = unico` |
| 7 | permitido | verde, setor e número |

Eram seis quando a parte 3b subiu; `evento_inativo` e `setor_bloqueado` entraram depois. A
tabela `MOTIVOS` do relatório, que traduz cada um para o nome que a pessoa entende, ficou
para trás nessa mudança e escrevia o nome cru da coluna — hoje
`tests/test_motivos_de_recusa.py` cobra a lista inteira contra este arquivo.

Casando em mais de um setor autorizado — o mesmo `0001` do VIP e do Camarote —, o aparelho
**pergunta qual**, mostrando só os que casaram.

**Recusa é recusa.** Decisão do usuário em 15/08/2026: não existe "deixar entrar mesmo
assim". Quem for recusado procura o dono do evento.

Cada leitura entra numa fila no IndexedDB **antes** de a tela mudar de cor, e só sai de lá
depois que o servidor confirmou. O reenvio da fila inteira não duplica nada, porque a chave
`(dispositivo_id, id_local)` existe no esquema desde 13/08 exatamente para isso. **Leitura
negada também sobe** — é ela que responde "por que a fila parou às 22h".

Os três endpoints são `POST /api/acesso/portaria/entrar`, `GET .../faixa?desde=` e
`POST .../leituras`, em `acesso_portaria.py`. Arquivo separado do `acesso_config.py` porque
quem entra ali é outra pessoa: lá é o dono, com a conta do Vibe e a senha; aqui é o porteiro,
com um celular que pode estar offline há horas.

A câmera usa `BarcodeDetector` nativo onde ele existe (Chrome/Android, lê QR e código de
barras) e cai para `jsQR` vendorizado (`frontend/jsqr.min.js`) onde não existe — no Safari do
iPhone, que só lê QR pela câmera. Por isso a tela também tem "Digitar o número", que passa
pelas mesmas seis regras: é o caminho para ingresso rasgado e para código de barras que a
câmera do iPhone não lê. `frontend/sw.js` é o que deixa `portaria.html` **abrir sem rede**;
ele guarda só os arquivos da tela, nunca a API.

## O Ideal Control da gráfica (parte 3c, primeira metade)

A mesma configuração, vista por quem atende o cliente. Fica no menu do painel —
**🎟️ Ideal Control** —, pesquisa pelo número do pedido, e abre tudo: dados do evento,
setores, bloqueios, códigos de staff, aparelhos, e a lista paginada dos ingressos de cada
setor. Backend em [acesso_interno.py](../acesso_interno.py), prefixo
`/api/acesso/interno`; tela em [frontend/ideal-control.js](../frontend/ideal-control.js).

Ela existe para **entregar o Ideal Control pré-configurado**. Antes dela, o cliente
carregava o pedido e caía numa tela onde nada estava nomeado nem horário nenhum
marcado; agora a gráfica deixa os aparelhos prontos antes de liberar o acesso dele.

Desde 17/08/2026 esta tela ganhou também o bloco **"Acesso do cliente"**, que é por onde
a gráfica abre a conta e mostra o QR de instalação — ver [A conta do cliente traz os
pedidos](#a-conta-do-cliente-traz-os-pedidos-17082026). Foi o botão "QR do Pedido" que
saiu daqui.

**A porta é o papel, e não a senha.** Decisão do usuário em 15/08/2026: *"a edição será
feita sem o uso de senha, basta estar logado na aplicação como ADM ou Atendimento"*. Isso
dispensa a elevação, e **não** dispensa a identificação: `_equipe()` confere o JWT do
Supabase e depois lê o `role` em `imposition_user_permissions`. Qualquer outro papel — e
qualquer conta sem linha — leva 403, mesmo com sessão válida.

Vale notar por que essa checagem é mais forte que a do resto do painel: o `get_current_user`
do `app.py` ainda devolve um usuário fixo com `admin: True`, resto do RLS adiado. Este
módulo não passa por ali.

As regras de negócio são **compartilhadas** com a tela do cliente, não copiadas: as duas
chamam as mesmas funções `_aplicar_*` do [acesso_config.py](../acesso_config.py), e só a
camada de autorização difere. Duas cópias divergiriam, e o sintoma seria o pior possível —
a gráfica pré-configurando um evento de um jeito que o cliente não consegue reproduzir.

### O que ela carrega, e quando

Abrir um pedido traz só a **estrutura**: os modelos do ERP, o estado da
publicação, os setores com a configuração e os bloqueios, e os aparelhos. Oito
idas ao banco, ~1,2s medido de fora. Nenhuma contagem.

O que custa contagem vem **quando alguém pede**, e é decisão do usuário em
16/08/2026 — *"não deve carregar de imediato os códigos, apenas se solicitado,
cada setor de uma vez"*:

- os números de um setor (publicadas, entraram, cortesias) viajam junto com a
  **primeira página** da lista de ingressos daquele setor, e só dela: repeti-los
  a cada "Próximos" seriam três idas ao banco para reescrever o mesmo número;
- o **painel de público** fica atrás de um botão. Ele custa cinco contagens mais
  uma varredura das leituras, e quem abre o pedido para renomear um setor não
  pode pagar por isso.

Antes dessa separação, abrir o pedido 18560 custava **20 idas ao banco** — cinco
delas só para escrever números que ninguém tinha pedido.

### A tela que ficou três minutos carregando

Na primeira vez que o usuário abriu esta tela em produção, ela ficou em
"Carregando…" e nunca saiu. O log do servidor provou o essencial: **nenhuma
requisição chegou ao motor**. O problema estava antes da rede.

Foram **dois** defeitos, um escondendo o outro.

**O primeiro: o cliente do Supabase não mora em `window`.**
`frontend/supabase-config.js` faz `let supabaseClient = null;` no topo de um
script clássico — e `let`/`const` ali criam a ligação no **escopo de script**,
nunca no objeto global. Só `var` cria propriedade em `window`. Medido no
navegador: `typeof window.supabaseClient` é `"undefined"`, e `window` nem tem a
chave, enquanto o identificador nu entrega o cliente com `.auth`.

Esta tela procurava por `window.supabaseClient`. Ou seja, ela **nunca** teve
cliente — em navegador nenhum, para usuário nenhum. O resto do painel sempre
usou o nome nu (`script.js` faz exatamente
`typeof supabaseClient !== 'undefined' && supabaseClient`), e por isso o login
do painel funcionava enquanto esta tela não falava com o motor.

**O segundo: a falha era muda.** `cabecalhos()` chamava
`supabaseClient.auth.getSession()` direto, e isso **lança na hora** em vez de
rejeitar uma promessa. Um `throw` síncrono escapa do `.catch()` de quem chamou,
porque a corrente de promessas nem chegou a existir: a tela não recebia erro
nenhum e o "Carregando…" ficava para sempre. É exatamente a armadilha que o
`controle.js` documenta no próprio cabeçalho, repetida no arquivo ao lado.

O segundo defeito é o que tornou o primeiro tão caro: com a mensagem na tela, o
`window.` teria aparecido em minutos, e não depois de duas publicações.

As três defesas agora:

1. `clienteDoPainel()` procura pelo **identificador nu**, com `typeof` e um
   `try` para a zona morta temporal;
2. `cabecalhos()` e `pedir()` começam com `Promise.resolve().then(...)`, então
   qualquer falha vira **rejeição**, nunca exceção;
3. o `.catch` de `abrirPedido` cobre também o `desenhar()`, e sempre tira o
   "Carregando…" da tela. Numa tela de atendimento, ficar carregando é o pior
   fim possível: a pessoa espera, e não há o que ela possa fazer.

O teste que teria pego o primeiro defeito é
`test_a_tela_acha_o_cliente_do_supabase_como_o_painel_o_declara`: ele carrega o
`supabase-config.js` **de verdade** na página de teste. Os demais semeavam
`window.supabaseClient = …` e passavam com a tela quebrada — sem o `let` do
config real, o identificador nu cai na propriedade de `window` e tudo parece
funcionar. O arnês era mais generoso que a página, a mesma lição que o dublê de
banco já tinha ensinado.

Três coisas que essa tela **não** faz, de propósito:

- **não mostra o código do QR Ideal.** A lista de ingressos traz o número impresso e a
  situação; `codigo_hash` não entra em nenhum `select`, e `codigo_visivel` só aparece nos
  códigos de staff, que são a lista do próprio cliente. O sal do evento e o `token_hash`
  do aparelho também não saem do servidor.
- **não traz a lista inteira de uma vez.** Páginas de 200, teto de 500 — abaixo do corte
  de 1.000 do PostgREST, que já mordeu este projeto três vezes.
- **não corta em silêncio.** O gráfico por hora tem teto de 20.000 leituras; quando ele é
  atingido, a resposta traz `grafico_truncado: true` e a tela escreve o aviso. Os totais
  não passam por esse teto — eles saem de `contar()`, que é exato em qualquer tamanho.

Todo id que vira filtro do PostgREST passa por `_uuid()` antes. Não é zelo abstrato: sem
essa conferência, um `setor_id` com `%26select=*` dentro chega ao FastAPI já decodificado
e emenda um filtro que ninguém escreveu — foi exatamente isso que a mutação de teste
produziu (`producao_acesso_setores?id=eq.x&select=*&select=...`) antes da guarda existir.

<a name="o-evento-ao-vivo-04092026"></a>
## O evento ao vivo (04/09/2026)

O aplicativo sabia tudo **antes** do evento — setores, horários, portões — e sabia tudo
**depois**, num número solto na lista de finalizados. Nas quatro horas em que a fila anda e
os portões trabalham, ele não dizia nada ao dono. Era a única parte do caminho em que a
pessoa que pagou pelo controle de acesso não tinha para onde olhar.

O mais barato disso já estava pago: o `/meus-eventos` **conta as entradas de todos os
eventos** a cada abertura da casa, e a tela usava o número só nos finalizados. Hoje a barra
do evento ativo diz "412 entraram".

### A tela

`frontend/ao-vivo.js`, o **sétimo estado de topo** do `controle.html`. Uma tela, dois
nomes: **Ao vivo** no evento ativo, onde ela se refaz sozinha a cada 30 segundos, e
**Relatório** no finalizado, onde fica parada. Duas telas fariam "quantos entraram?" ter
duas respostas conforme a hora da pergunta.

O que ela mostra, nesta ordem — e a ordem é a resposta, porque quem abre esta tela pode
estar com uma fila esperando:

1. **o resumo** — entraram, dentro agora (só onde houve saída), impressos, comparecimento,
   recusas;
2. **procurar um ingresso** pelo número, no evento inteiro. "Este ingresso já entrou?" é a
   pergunta da porta, e até agora só a gráfica sabia responder;
3. entradas **por setor** e **por hora**, com a hora de pico marcada;
4. as **recusas**, com o nome que a pessoa entende;
5. os **portões**, com o último sinal de cada um;
6. a **planilha da noite**, com a leitura negada junto.

Duas coisas valem registrar porque são erros fáceis de cometer aqui:

- **O relógio é o do servidor.** A resposta traz `agora`, e "último sinal há 40 minutos"
  sai dele. Calculado com o relógio do celular, ele mente sempre que o celular estiver
  errado — e um portão que parece mudo por causa do relógio do dono é uma corrida até a
  porta à toa.
- **As contas são as MESMAS da tela da gráfica.** Elas mudaram para
  `supabase/functions/_compartilhado/relatorio.ts` por causa disso. Duas cópias não
  quebrariam nada: a gráfica diria 412 e o cliente 409, as duas telas abertas ao mesmo
  tempo, sem como saber qual acertou nem como refazer a conta da noite que já passou.

O que muda entre as duas telas é só de onde sai o `contratado`: a gráfica soma os modelos
do ERP que sobem ao controle (ela abre o pedido antes de o cliente carregá-lo, quando setor
nenhum existe), e o aplicativo do dono soma a quantidade dos setores, que **é** a
quantidade contratada. Por isso o `dashboard` recebe o número pronto em vez de escolher um
dos dois caminhos sozinho.

### As três leituras novas

Todas em `acesso-conta`, todas contra um evento da conta, e **nenhuma pede elevação**:
olhar quantos entraram no próprio evento não pode custar a senha, porque quem está olhando
está na porta com o celular na mão.

| Rota | O que devolve |
|---|---|
| `GET /eventos/{id}/ao-vivo` | o painel inteiro, mais os aparelhos e o `agora` do servidor |
| `GET /eventos/{id}/ingressos` | a busca por número; sem `setor_id`, procura no evento inteiro |
| `GET /eventos/{id}/leituras` | a base da planilha, paginada |

### As duas saídas que faltavam

`supabase/functions/_compartilhado/vinculo.ts`, chamado pelas **duas** telas — a do cliente
com elevação, a da gráfica com o papel.

**Tirar um pedido do evento** (`POST /pedidos/{p}/desvincular`). O cliente carrega o pedido
no evento errado e o `carregar` passa a recusar com "este pedido já está num evento". Não
havia caminho de volta em tela nenhuma, e o conserto era mexer no banco à mão.

Ele descarimba as credenciais, desliga os setores daquele pedido (`status = excluido`, e
não `DELETE`: o vínculo do aparelho com o setor aponta para aquela linha) e solta o pedido
— **nessa ordem**, com o `evento_id` do pedido saindo por último, para que uma falha no
meio deixe a operação repetível em vez de deixar setores vivos apontando para um evento que
o pedido já não conhece. Nenhum ingresso deixa de valer: o que sai é o carimbo.

**Não vale depois que houve leitura.** Seria perder de que setor cada pessoa entrou, e o
relatório da noite não teria como ser refeito.

**Conferir os setores** (`POST /pedidos/{p}/sincronizar-setores`). O setor é gravado uma
vez, no momento do carregar. Se depois disso um modelo ganhar numeração com código — que é
exatamente o conserto quando a gráfica erra a numeração —, o setor dele nunca aparecia, e o
sintoma é o pior desta casa: ninguém procura um setor que nunca existiu.

Ele cria o que falta e carimba as credenciais na mesma passada; atualiza a **quantidade**
(que é a lotação contratada) e **nunca o nome** (que é do cliente, e ele o escolheu para o
porteiro ler); e desliga o setor cujo modelo perdeu o código **só quando ele está vazio** —
que é o caso dos oito setores órfãos criados antes de o filtro de legibilidade existir. Com
ingresso dentro, ele fica, e a tela avisa: isso é decisão de gente, não de rotina.

## Quais pedidos entram, e por qual porta (04/09/2026)

A pergunta do usuário, ao fim do dia: *"em quais pedidos pode ser utilizado o PWA Ideal
Control?"*. A resposta é uma regra só, e ela já estava escrita em [Só sobe o que a portaria
tem como ler](#só-sobe-o-que-a-portaria-tem-como-ler): **qualquer pedido do ERP em que pelo
menos um modelo tenha numeração com código que a portaria leia** — QR Ideal, QR ou código de
barras gerado a partir do número do item. Não existe marcação "controle de acesso" no
pedido; ela é deduzida da numeração, por `numeracaoDoModelo`, a mesma regra que o agente
usa para decidir o que publica. Elemento alimentado por coluna do CSV e elemento de valor
fixo não contam; `amostra_num_id` que não é UUID não aponta para numeração nenhuma.

Dentro do pedido, **só os modelos legíveis viram setor**. Um crachá só com texto aparece na
tela da gráfica como "sem código (não sobe)", e isso não é defeito.

O que desqualifica o pedido inteiro: **cancelado** no ERP, **sem cliente** na proposta (o
evento pertence ao cliente, e sem cliente ninguém o encontra), ou **sem modelo nenhum**.

### As duas portas para o evento

Até 04/09/2026 o evento só nascia quando o cliente tocava em "Carregar" no aplicativo — e
sem evento não havia setor, código de staff nem aparelho para a gráfica configurar. A tela
da gráfica, cuja razão de existir é entregar o Ideal Control pré-configurado, ficava sem o
que configurar até o cliente agir. Decisão do usuário: *"precisamos do acesso no menu
ideal control, antes do cliente fazer o acesso pelo pwa — visualizar setores, códigos,
todas as configurações"*. Regra que sai daí: **nenhuma configuração do controle de acesso
pode depender de um gesto do cliente.**

| | Gráfica — "Criar o evento deste pedido" | Cliente — "Carregar" |
|---|---|---|
| Onde | menu Ideal Control, `POST /pedidos/{p}/criar-evento` (acesso-interno) | aplicativo, `POST /pedidos/{p}/carregar` (acesso-conta) |
| Quem prova ser | o papel ADM/Atendimento no painel | o dono, mais a senha ou o bilhete de conta |
| Precisa estar impresso? | **não** — a credencial que vier depois nasce ligada, porque a publicação lê os setores do pedido (`setoresDoPedido`) | **sim** — só entra em "Meus Pedidos" o que já tem credencial publicada |
| Dono do evento | o **cliente**, por `id_cliente`; `dono_auth_id` fica **nulo** (coluna liberada em `sql/schema_acesso_evento_sem_dono.sql`) — nunca o atendente | a conta que carregou, mais o `id_cliente` |
| Já está num evento | recusa 409 | não aparece na lista |

As duas portas chamam a **mesma função** — `criarEventoDoPedido`, em
`_compartilhado/vinculo.ts` —, que cria a linha de `producao_acesso_pedidos` se ela ainda
não existir (com o sal do pedido, sem passar por `abrirPedido`, que reabriria a
publicação), cria o evento, um setor por modelo legível, carimba as credenciais já impressas
e liga o pedido por último — para uma falha no meio deixar a operação repetível. A regra de
posse (`pertenceAConta`) já aceitava as duas formas desde 17/08 — "a conta que criou, ou
qualquer conta ligada àquele cliente" —, então o cliente encontra o evento criado pela
gráfica assim que a conta dele existir. Exercitado em produção no mesmo dia: pedido 21524 →
evento **SOBERANAS**, setor INGRESSO com 1.500.

### Todo pedido é alcançável pelo menu

No mesmo dia: *"todos os pedidos devem ficar disponíveis para visualização e edição pelo
menu ideal control"*. A lista de pedidos do cliente saía de `producao_acesso_pedidos` — só o
que já tinha subido; o cliente 11406 tinha quatro pedidos com modelo e a tela mostrava um.
Agora ela sai das **propostas** do cliente, cada linha dizendo *N publicados* ou *ainda não
publicado*, e os pedidos sem modelo são contados numa linha à parte em vez de omitidos. A
busca ganhou o botão **Abrir pedido** ao lado de **Abrir cliente**: as duas faixas de número
se cruzam — 21524 é um pedido *e* um cliente —, e um campo que adivinhasse abriria a ficha de
outra pessoa sem produzir erro nenhum.

### O fundo do aplicativo

A foto de evento que o ADM publica (aba "Fundo do PWA") **nunca tinha chegado ao
aplicativo**: `fundo-do-app.js` lia `window.supabaseClient`, que não existe —
`supabase-config.js` declara `let supabaseClient`, no escopo de script —, concluía "sem rede"
e calava, por dez dias. A mesma armadilha que o `ideal-control.js` documenta desde 16/08.
E o "Atualizar o aplicativo" do rodapé apagava todos os caches, inclusive o da foto, enquanto
o carregador anotava "já apliquei" antes de procurar a cópia: o fundo sumia no atualizar e não
voltava. Hoje o carregador acha o cliente pelo nome nu, decide sobre o que **de fato** foi
aplicado, e o botão preserva `ideal-fundo-*`. O arnês declara o cliente como a página
declara.

## O que falta (a partir da parte 3c)

A tela do dono (`controle.html`, parte 3a) **está no ar desde a v570**. Ela traz: login do
cliente; configuração por setor atrás de um botão **Configurar** (nome na portaria, janela
de abertura e fechamento, uso do ingresso — entrada única ou sair e voltar —, bloqueio por
faixa com motivo, e os códigos próprios do cliente para staff e cortesia); os aparelhos da
portaria com lista de setores própria; e a senha cadastrada travando a configuração do
evento. **A lotação de um setor é a quantidade contratada no ERP**, mostrada como informação
e nunca como campo — não existe um segundo número que possa discordar do contrato. O
histórico e as pendências estão em [STATUS_PROJETO.md](STATUS_PROJETO.md).

Em 15/08/2026 o usuário revisou essa tela usando-a, e quatro coisas mudaram por causa disso:

- **O cartão do setor mostra a faixa impressa**, e não só a quantidade: `400 ingressos
  contratados · de 0005 a 0500`. Só a quantidade não identifica o lote — dois setores de
  400 são idênticos na tela, e o que o dono tem na mão para conferir é um ingresso com um
  número escrito. A faixa vem de `pedidos_modelos.numeracao_inicio/numeracao_fim`, o ERP, e
  **não de um MIN/MAX sobre as credenciais já publicadas**: um pedido cujos modelos ainda
  não foram todos impressos mostraria uma faixa que encolhe. Zeros à esquerda, com piso de
  quatro dígitos, porque é assim que o número sai no papel.
- **"Quando vale" diz em frase que sem data e hora o setor já está valendo.** O título
  dizia `(vazio = sempre)` entre parênteses, e o dono lia aquilo como instrução do que ele
  *precisa* preencher — justamente no caso comum, que é a festa de uma noite só.
- **Os setores de um aparelho são botões que acendem, e passam a valer no toque.** Eram
  caixas de marcar, e saíam tortas: a regra `input { width: 100% }` do `controle.css` as
  esticava por toda a linha — 385px × 13px, medidos no navegador — e jogava o nome do setor
  para o extremo direito, longe da caixa que ele nomeia. O `Salvar` sobrou só para o nome.
- **A tranca ficou `sticky` no topo, e o botão passou a se chamar "Digitar a Senha
  Cadastrada"**, com um "Esqueci minha senha" ao lado. "A senha do dono" se lia como uma
  segunda senha, especial, que o cliente nunca recebeu — é a mesma com que ele acabou de
  entrar na tela. E a explicação de por que os botões estão apagados morava no alto de uma
  página de três telas de altura: no desktop, o dono rolava até os aparelhos, tocava num
  botão apagado e não acontecia nada. Foi assim que "criar aparelho" virou "não está
  funcionando".

O que falta da parte 3c, depois da tela da gráfica e do [evento ao
vivo](#o-evento-ao-vivo-04092026): **cancelar credencial** (hoje um ingresso perdido só sai
por bloqueio de faixa, que serve para um só quando `de` e `ate` são iguais), **reativar
aparelho revogado**, e o **aviso que chega sem o dono perguntar** — um portão que parou de
sincronizar há quarenta minutos ainda só é descoberto por quem vai olhar.

Saíram desta lista em 04/09/2026: o painel ao vivo, desvincular pedido do evento, e a
limpeza dos setores órfãos, que hoje acontece dentro do "Conferir os setores". Entraram no
mesmo dia, pela [Segunda Passagem](https://claude.ai/code/artifact/2fa75e9d-f940-4d75-96bc-909762fd297c):
o **aviso de versão nova no painel** (hoje só o agente tem a faixa, e duas vezes num dia o
usuário relatou defeito já corrigido porque a página aberta era a de antes), uma **prova de
sucesso contra o banco real para toda rota que escreve** (o NOT NULL do `dono_auth_id` passou
por 200 testes que dublam o banco), e a **prova da portaria offline**
([prova_da_portaria.md](prova_da_portaria.md)), que continua sendo a única parte do caminho
que nenhum teste faz.

Decisões já tomadas pelo usuário. As quatro primeiras estão registradas na
[spec de 13/08](superpowers/specs/2026-08-13-controle-acesso-parte2-design.md); a quinta é
de 15/08 e está registrada nesta página, em [A ambiguidade](#ambiguidade), e no cabeçalho de
`sql/schema_acesso_04_credencial_por_modelo.sql`:

- cada aparelho valida **só a lista de setores dele**;
- mudar configuração do evento exige a **senha cadastrada do cliente**, conferida na hora
  (é a mesma conta do ERP Vibe com que ele entra na tela — não existe uma segunda senha);
- duas leituras offline do mesmo ingresso **deixam os dois entrarem**, e a duplicidade é
  apontada na sincronização — ninguém fica parado no portão por causa de rede;
- o cliente pode **carregar códigos próprios** para staff e cortesia;
- **o aparelho resolve o setor pela lista dele.** Com numeração comum, dois setores do mesmo
  evento têm o mesmo `0001` e o mesmo hash. O aparelho configurado para um setor só não tem
  dúvida; o que valida vários precisa perguntar qual, mostrando só os que casaram.

Uma pendência de produto continua aberta, e não tem dono no plano atual: **o log do agente é
apagado a cada reinício** (`open(..., "w")` em `agent_tray.py`), o que já custou evidência
duas vezes numa mesma investigação.

**O Ideal Control antigo continua fora deste repositório**, em `../ideal-IdealControl/`.
Trazê-lo para cá é trabalho da parte 3c, e a parte 3a reverteu o plano de evoluí-lo: o
layout foi refeito do zero, por decisão do usuário. Enquanto ele não vier, o `sw.js` que
ainda referencia SDKs do Firebase removidos mora lá, não aqui. **Desde a parte 3b existe um
`frontend/sw.js`**, mas é outro arquivo, com outro dono: serve só `portaria.html`, guarda
apenas os arquivos daquela tela, e não tem nada a ver com o Firebase do Ideal Control antigo.
