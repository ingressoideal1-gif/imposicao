# Auditoria da documentação do QR Ideal e do controle de acesso — 15/08/2026

**O que foi auditado:** [docs/qr_ideal.md](qr_ideal.md) e
[docs/controle_acesso.md](controle_acesso.md), reescritos na manhã de 15/08/2026 (commit
`4a13220`), cruzados com o [STATUS_PROJETO.md](STATUS_PROJETO.md).

**Como:** cinco leituras independentes, cada uma com uma lente — o `qr_ideal.md` contra o
código; as seções de cliente, configuração e tabelas contra o código; a consistência entre
os três documentos; o **banco de dados de verdade** (consultas paginadas, contagens por
`Content-Range`, hashes recomputados por amostragem); e redação e renderização. Uma sexta
lente, a das seções de publicação contra o código, foi interrompida por limite de sessão;
o que ela cobriria foi conferido à mão depois — o mapa modelo→numeração, o "cada modelo
publica quando é impresso", a ordem de preferência dos elementos, e as quatro travas do
segredo — e está anotado abaixo.

Cada achado foi então **verificado de novo, um a um**, contra o arquivo, a linha ou a
consulta que a lente citou, antes de entrar aqui. Os que não se sustentaram estão listados
na seção final, com o motivo.

---

## Conclusão

**Os dois documentos estavam substancialmente certos e substancialmente incompletos.**

Das dezenas de afirmações verificáveis — a fórmula da coluna, o exemplo `HM4IKCBY`, o
tamanho do pool, o caminho na estação, as contagens do catálogo (61 / 2 / 32 / 3 / 31), as
2.163 credenciais, os totais por modelo dos dois pedidos, os hashes recomputados, o
`on_conflict=chave_dedup`, o `contar()` por `Content-Range`, as quatro variáveis, as oito
tabelas, o RLS sem políticas, o segredo do agente nas duas ferramentas de build, os
endpoints, os testes citados, os links e as âncoras — **todas conferem** com o código, o
banco e o agente rodando nesta estação.

O que a auditoria achou foram **41 pontos** (61 antes de juntar duplicatas), assim
distribuídos depois da verificação:

| Gravidade | Quantidade | O que são |
|---|---|---|
| **Alta** | 1 | um defeito de **código** que o documento descrevia como funcionando |
| **Média** | 8 | afirmações factualmente erradas ou omissões que induzem ao erro |
| **Baixa** | 27 | imprecisões, números envelhecidos, redação, ordem de leitura |
| Refutados ou fora do escopo | 5 | ver a última seção |

**Todos os confirmados foram corrigidos** nesta mesma passada — nos dois documentos, no
`STATUS_PROJETO.md` onde a divergência era dele, e em três arquivos de código onde o
problema era o código, não o texto. A lista está abaixo, com o que dizia, o que era, e onde
está a prova.

Uma observação sobre o método, que vale mais que qualquer item isolado: **os erros mais
graves não eram de digitação — eram afirmações que eu escrevi por inferência e não conferi**.
"Uma numeração tem QR do CSV" (eram duas, e a conta era outra). "O acervo inteiro está com
`pad=4`" (21 sim, 8 não). "Zero hashes repetidos" (o script que gerou a frase media outra
coisa). "Todos os SQL são idempotentes" (dois recriam a chave que a migração 04 apagou). O
que impede isso de voltar é o
[tests/test_documentacao_do_acesso.py](../tests/test_documentacao_do_acesso.py), que já
cobra os fatos mais duros, e a regra que fica: **número em documento vem de consulta, não de
memória.**

---

## Alta

### 1. O aviso de choque de coluna nunca aparecia — corrigido no código

**Dizia:** *"O motor recusa a folha (`multi_artes`); o painel avisa sobre o pedido inteiro."*

**Era:** o painel não avisava. `conferirColunasQrIdealDosPedidos` chamava `showToast(...)`,
uma função que **não existe em lugar nenhum do frontend** — a função de aviso do projeto
chama-se `toast`. Como a chamada estava atrás de `if (typeof showToast === 'function')`,
falhava em silêncio: o choque ia para `console.warn`, que ninguém lê numa tiragem. E o
motor só confere colunas **dentro de uma folha `multi_artes`**, então dois modelos do mesmo
pedido impressos em trabalhos separados dependiam exatamente do aviso que não existia.

**Prova:** `frontend/script.js:17550` (antes); `grep -rn "function showToast" frontend/` →
nada; `frontend/script.js:601` `function toast(...)`; `engine.py:907` (só `multi_artes`).

**Feito:** as três chamadas em `script.js` (o choque de coluna e duas de atribuição de
designer, que estouravam `ReferenceError`) e uma em `mapas.js` passaram a chamar `toast`.
Guarda nova: [tests/test_aviso_de_choque_de_coluna.py](../tests/test_aviso_de_choque_de_coluna.py),
provada vermelha contra o código antigo. **Isso é mudança de frontend: publicar site e
agente.**

---

## Média

### 2. A conta das 31 numerações legíveis estava errada

**Dizia:** *"As 31 legíveis são uma a menos que as 32 com elemento QR: uma numeração tem o
QR alimentado por coluna do CSV."*

**Era:** são **duas** (as exclusivas `1000153` e `1000154`, QR com `source=database`,
coluna `Link`), e a conta não é 32 − 1. Das 61, **33** têm QR, QR Ideal ou barras (as três
com barras também têm QR; uma das duas com QR Ideal também). 33 − 2 = 31. Os totais da
tabela estavam certos; a explicação da diferença, não.

**Prova:** consulta paginada a `producao_numeracoes` passando cada `elements` por
`acesso_publicacao.numeracao_do_modelo` (quatro lentes chegaram ao mesmo resultado).

**Feito:** parágrafo reescrito no `qr_ideal.md`.

### 3. "Zero hashes repetidos" — falso como estava escrito

**Dizia:** *"Zero credenciais sem setor, zero hashes repetidos, nenhuma faixa com buraco."*

**Era:** há **320 `codigo_hash` repetidos** no banco (300 no 18560, 20 no 20508) — por
desenho, porque modelos com numeração de mesmo formato produzem o mesmo texto para o mesmo
número, e o próprio documento explica isso cinquenta linhas acima. O que é zero é a
repetição de `chave_dedup`. E há 163 credenciais sem setor: as do 20508, que ainda não foi
reivindicado. O script que gerou a frase rotulava `len(creds) − len({(modelo, numero)})` como
"hashes repetidos".

**Feito:** frase reescrita: zero `chave_dedup` repetida, zero órfã em pedido reivindicado,
hashes iguais existem por desenho e o aparelho resolve.

### 4. "Todos os SQL são idempotentes" — dois não podem ser recolados

**Dizia:** *"Todos os arquivos são idempotentes e podem ser colados de novo."*

**Era:** `schema_acesso.sql` e `schema_acesso_02_credencial_hash_unico.sql` contêm
`CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_credencial_hash_simples … (codigo_hash)` — a
chave antiga que a migração 04 apagou de propósito. Recolar qualquer um deles tenta
recriá-la: no banco de hoje falha (320 hashes repetidos); num banco ainda sem repetição,
**reinstala em silêncio o defeito que descartou 31 ingressos**.

**Prova:** `sql/schema_acesso.sql:329-330`, `sql/schema_acesso_02…:42-43`,
`sql/schema_acesso_04…:110` (`DROP INDEX`).

**Feito:** tabela dos arquivos ganhou a coluna "Recolar?" e um parágrafo com o porquê. A
descrição da migração 02 também estava errada ("a primeira chave única") — ela é limpeza; a
chave por hash já vinha do `schema_acesso.sql`.

### 5. `pad=4` "no acervo inteiro" — 8 numerações têm `pad=6`

**Dizia:** *"Com `prefix=''` e `pad=4` — que é como o acervo inteiro está —"*

**Era:** das 29 legíveis por QR/barras, 21 têm `pad=4` e **8 têm `pad=6`** (Triband,
Triband Padrão, 1000116, 1000117, 1000143, 1000147, 1000176 e "QR NO MEIO NUMERO GRANDE AO
LADO"). O próprio documento cita `000001` dez linhas depois. O mecanismo da ambiguidade
continua valendo — o que importa é prefixo vazio e o **mesmo** pad.

**Feito:** reescrito com os números.

### 6. Gerar QR novo não desfaz uma reivindicação errada

**Dizia:** *"É o conserto de quando o QR cai na pessoa errada."*

**Era:** só enquanto ela ainda não reivindicou. `gerar_qr` troca o `qr_token_hash` mas não
limpa o `evento_id` do pedido; se a conta errada já cadastrou, o cliente certo lê o QR novo
e recebe o mesmo `409` — e a mensagem manda "pedir um QR novo ao atendente", que não
resolve. Não existe endpoint de desvincular (o STATUS o lista para a 3c).

**Prova:** `acesso_api.py:528-532` (PATCH só do token) e `:645-656` (409).

**Feito:** parágrafo completado. Fica registrado como **pendência de produto**: a mensagem
do 409 e o comentário do `acesso_api.py` prometem o que o sistema não faz.

### 7. O painel confundia a nuvem com a estação — e o documento não explicava

**Dizia:** *"…não havia; era a nuvem se passando pelo agente local."* — e nada mais, em
nenhum dos dois documentos.

**Era:** o mecanismo (mesmo `app.py` nos dois lados; sondagem testando primeiro o endereço
da própria página; selo "AGENTE LOCAL" enquanto impunha no Render) e a proteção permanente
que ficou (`"onde"` no `/api/status`; recusa por `onde !== 'nuvem'`;
`tests/test_onde_estou_rodando.py`) só existiam no diário do STATUS.

**Feito:** parágrafo novo em `qr_ideal.md → Onde imprimir`, e a frase do
`controle_acesso.md` passou a apontar para lá.

### 8. "Encomendado × publicado" na parte 3b contradiz uma decisão registrada

**Dizia:** *"Endereçar isso é trabalho da parte 3b, onde a portaria vai poder cruzar o
total publicado com o que o ERP encomendou."*

**Era:** o STATUS registra a decisão do usuário de 14/08: essa comparação **saiu** da tela
do dono e, se voltar, volta como relatório no painel ao vivo da 3c — não como alarme na
portaria. Dizer 3b mandaria quem planejar a portaria implementar o que já foi decidido para
outro lugar.

**Feito:** corrigido.

### 9. Os documentos irmãos discordavam sobre o que está no ar

**Dizia** (`controle_acesso.md`, certo): v581 / 1.2.80. **Dizia** (`STATUS_PROJETO.md`,
errado): v578 / 1.2.77, e "as sete tabelas" em dois lugares, e "três modelos com a
numeração Triband".

**Feito:** STATUS atualizado nos quatro pontos. Ele agora bate com as tags do git, com o
`agent_version.py`, com o manifesto publicado e com o que o Render responde.

---

## Baixa

Correções de precisão, todas aplicadas:

| # | Onde | Dizia | É |
|---|---|---|---|
| 10 | qr_ideal | "ids que diferem em **exatamente 100**" | terminam nos mesmos dois dígitos (100, 200, 300…) — `ultimos2` |
| 11 | qr_ideal | "o executável embute uma cópia do painel, que é o que ele serve" | a cópia **semeia** a pasta `painel/`, que é a servida; o agente a atualiza da nuvem (`app.py:143-179`) |
| 12 | qr_ideal | `.\publicar.ps1 "mensagem (vNNN)"` | `.\publicar.ps1 "mensagem"` — o script acrescenta o sufixo; seguir o exemplo produziu o commit `5234311` com `(v581) (v581)` |
| 13 | qr_ideal | "Todas recusam o trabalho antes de imprimir" (4 itens) | o 4º (reimpressão parcial) é garantia de conteúdo, não recusa |
| 14 | qr_ideal | "## As duas chaves" com três linhas na tabela | dito o que são as duas (coluna) e o terceiro dado (linha) |
| 15 | controle | tabela de elementos com "CSV → não publica" como se fosse um tipo | são **exclusões** em qualquer tipo; o próximo candidato ainda vale; ordem real QR_IDEAL > QR > BARCODE |
| 16 | controle | "`ACESSO_ELEVACAO_SEGREDO` → o dono digita a senha e **nada acontece**" | responde 503 com o nome da variável e continua somente leitura (`acesso_config.py:190`) — é a **menos** silenciosa das quatro |
| 17 | controle | `_setores`: "não é um campo" | a coluna `lotacao` **existe** (`schema_acesso.sql:168`), nula e ignorada — dito para ninguém a usar |
| 18 | controle | `evento.html (PWA, no celular)` | não é PWA: sem manifest, sem service worker |
| 19 | controle | descrição da tela 3a | faltavam "uso do ingresso" (dentro do Configurar) e a caixa "Meus códigos (staff, cortesia)" (`controle.js:300`, `controle.html:107`) |
| 20 | controle | `variavel_no_render.ps1` sem pré-requisito | precisa de `RENDER_API_KEY` no `.env.local`; tem `-Conferir` |
| 21 | controle | "reabrir é ato explícito" | `gerar_qr` chama `_abrir_pedido` e **reabre** publicação fechada — efeito colateral registrado |
| 22 | controle | validade do QR do Pedido ausente | **180 dias** (`qr_pedido.VALIDADE_PADRAO_DIAS`) |
| 23 | controle | "Decisões registradas na spec" (5 itens) | 4 estão na spec de 13/08; a 5ª é de 15/08 e mora nesta página e no cabeçalho do SQL 04 |
| 24 | controle | `_dispositivos`, `_dispositivo_setores`, `_leituras` "(parte 3)" | as duas primeiras já são escritas pela 3a; só `_leituras` é 3b |
| 25 | controle | "18560 = 2.000" sem ressalva | as 2.000 existem, mas `total_credenciais` gravado é **1000** (fechou às 12:03 UTC, antes da correção do `contar()`) — dito, e criado [sql/reparo_acesso_total_publicado.sql](../sql/reparo_acesso_total_publicado.sql) |
| 26 | controle | `origem` implícita como tipo de código | o agente grava `qr_ideal` em **toda** credencial, inclusive QR/barras comuns; só separa agente de cliente (`acesso_api.py`) |
| 27 | controle | filtro de modelo sem código apresentado como completo | não é retroativo: 8 setores de teste (19775, 20435) continuam no banco sem nunca receber credencial |
| 28 | controle | "reivindicou às 10:55 … 18:52" | horários em **UTC**; na gráfica 07:55 e 15:52 — dito |
| 29 | controle | "`style.css` de 81 KB" | 84 KB (84.117 bytes); corrigido também no comentário do `evento.html` |
| 30 | controle | "Conferido em 13/08" para as oito tabelas | em 13/08 eram sete; a `_bloqueios` veio no dia seguinte |
| 31 | ambos | "Em 15/08/2026 …" para fatos da noite anterior | commits v576/v577/v578 são de 14/08 22:07–22:59; padronizado "na noite de 14 para 15/08/2026" |
| 32 | ambos | "três modelos com a numeração Triband" | eram três numerações diferentes (Triband Padrão, Triband, 1000117) de **mesmo formato** |
| 33 | controle | "órfãs **para sempre**" e "363 do banco inteiro" | contradito duas frases depois pelo reparo; e "banco inteiro" era o retrato de uma manhã |
| 34 | controle | "reentrada em uso de verdade" | frase truncada; dito o que é: o tipo "sair e voltar" funcionando na leitura |
| 35 | controle | ordem das subseções da publicação | "Onde imprimir" (pré-condição do passo 1) era a sétima subseção; movida para logo após a introdução, e "Só sobe" aponta para a definição de legível |
| 36 | evento.html | *"configurar a lotação de cada setor"* | a tela contradizia a regra do usuário; texto corrigido (**mudança de frontend**) |

---

## Refutados ou fora do escopo

Cinco pontos levantados pelas lentes que **não** viraram correção, e por quê:

- **"O exemplo 20272 / 1000022 é sintético"** — verdade, esses ids não existem em
  `pedidos_modelos` hoje. Mas o pool responde `HM4IKCBY` para eles de fato, e o documento
  nunca disse que era um pedido real. Mantido, com a resposta do agente como prova.
- **"O comportamento do Chrome 151 não foi reproduzido pelas lentes"** — foi reproduzido
  por mim, no navegador desta estação, antes de escrever o documento (a mensagem citada é a
  do console). As lentes conferiram o lado que podiam: o agente responde certo ao preflight
  por `curl`.
- **"O `test_qr_ideal_hash.py` não foi executado pela auditoria"** — ele roda um Chromium
  via puppeteer e leva minutos; passa na suíte completa (548 testes).
- **"O comentário do `acesso_api.py` e o docstring do teste repetem 'mesma numeração
  Triband' e 'nada acontece'"** — são comentários de código, não documentação; anotados
  aqui como próxima passada, não corrigidos agora para não inflar o commit.
- **"Se o site na Vercel é a v581"** — a lente só conferiu o Render. O `publicar.ps1`
  registrou `SUCESSO — v581 no ar` com o alias `ideal-imposition.vercel.app`; conferido no
  próprio log da publicação.

---

## O que ficou pendente (não é documentação)

Achados que apontam para trabalho de produto ou de código, além do que foi corrigido:

1. **Desvincular pedido de evento** não existe; a mensagem do `409` e o comentário do
   `acesso_api.py` prometem que "um QR novo" resolve, e não resolve depois da reivindicação.
2. **`gerar_qr` reabre publicação fechada** como efeito colateral. Inofensivo hoje; torna o
   `publicado_em` pouco confiável.
3. **Oito setores órfãos** de pedidos de teste (19775, 20435) esperam limpeza manual ou a
   re-sincronização da 3c.
4. **`total_credenciais` do 18560 = 1000** até rodar `sql/reparo_acesso_total_publicado.sql`
   ou reimprimir.
5. **Comentários de código desatualizados**: `acesso_api.py` (docstring de `saude` — "nada
   acontece"; comentário de `gerar_qr` — "o vínculo se desfaz"), `tests/test_acesso_api.py`
   (docstring "mesma numeração Triband"). Corrigir na próxima passada que tocar nesses
   arquivos.

---

## Guardas que ficaram

- [tests/test_documentacao_do_acesso.py](../tests/test_documentacao_do_acesso.py) — a
  coluna de deduplicação, as quatro variáveis, a contagem de tabelas somada de todos os
  arquivos de esquema, os links, o endereço do painel.
- [tests/test_aviso_de_choque_de_coluna.py](../tests/test_aviso_de_choque_de_coluna.py) —
  nenhuma chamada a função de aviso inexistente; o choque de coluna chega ao `toast`.

Ambas provadas vermelhas contra a versão anterior antes de ficarem verdes.
