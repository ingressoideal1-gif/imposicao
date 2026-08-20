# O link do cliente vira o Portal do Pedido

**Data:** 20/08/2026
**Estado:** desenho aprovado pelo usuário. Implementação a seguir.
**Arquivos que mudam:** `frontend/cliente.html`, `frontend/cliente.js` (dividido),
`frontend/style.css`, `sql/link_cliente_pedido.sql` (novo), `frontend/script.js`
(caixa de correções no painel), testes.

---

## 1. O problema, medido

A página do link do cliente é hoje um **funil de aprovação de arte**. Ela só abre
quando `pedidos_links_cliente.status_arte` vale `Enviar Arte` ou
`Aguard. Aprovação` — ou quando o atendente girou o selo de entrega para
`ALTERADO`. Em qualquer outro status ela mostra uma frase e termina.

Lido no banco em 20/08/2026, os 50 links existentes:

| status_arte | links |
|---|---|
| `EM PRODUCAO` | 29 |
| `APROVADO` | 7 |
| `Em Arte` | 5 |
| (nulo) | 5 |
| `Enviar Arte` | 2 |
| `Aguard. Aprovação` | 2 |

Ou seja: **36 dos 50 links estão num status em que a página não mostra nada**. O
endereço que o cliente guardou no WhatsApp deixa de ter serventia no dia seguinte
à aprovação, que é justamente quando ele quer saber do prazo, do endereço de
entrega e de como pagar.

### Três defeitos que entram no mesmo conserto

**O nome do cliente nunca aparece.** `cliente.js:934` lê
`propData.cliente_nome`, coluna que não existe em `propostas` — a coluna é
`cliente`. O `<p id="cliente-pedido-cliente">` do cabeçalho fica vazio desde
sempre. O painel acerta (`propReal?.cliente || …`), a página do cliente não.

**A página baixa os catálogos inteiros antes do primeiro pixel.** São 24 cores,
60 numerações, 13 formatos e 64 produtos, para usar as uma ou duas cores do
pedido. As colunas base64 já saíram — eram 18 MB —, mas o resto continua vindo em
quatro consultas sem filtro, no 4G do cliente.

**Os dados cadastrais saem com a chave pública.** O bloco de faturamento faz
`select('*')` em `clientes`, e a chave anônima está no fonte da página. Isso traz
`limite_credito`, `risco_credito` e `total_compras` junto do que a tela mostra.
Com valores entrando na página agora, essa porta precisa mudar.

---

## 2. A essência: muda o enfoque, não o propósito

Continua sendo a página pública, aberta pelo par número+token, sem login, onde o
cliente **vê e decide sobre o pedido dele**. Isso não muda, e a aprovação de arte
continua sendo o ato mais importante que acontece ali.

O que muda: ela deixa de ser um funil de uma via e vira o **Portal do Pedido** —
aberta em qualquer status, com cinco seções, das quais a aprovação é uma. O
cliente volta ao mesmo link durante toda a vida do pedido.

Decidido com o usuário em 20/08/2026:

- **Portal sempre aberto**, e não funil (as cinco abas aparecem sempre; a de arte
  é que muda de cara conforme o status).
- **O link de pagamento vem do parceiro** (`propostas_os.link_pagamento`). Nada a
  preencher no painel.
- **O Orçamento é só consulta**, no formato do resumo que o cliente já recebeu.

---

## 3. Layout — celular primeiro

> A prioridade desta página é a visualização em celular. Quem a abre é o cliente
> da gráfica, no meio do dia, pelo navegador embutido do WhatsApp. É a única tela
> do projeto cujo público está fora da gráfica.

**Barra de abas no rodapé**, como aplicativo: cinco destinos ao alcance do
polegar, sempre visíveis, com o ativo destacado. No desktop (≥ 900px) a mesma
barra vira uma coluna à esquerda e o conteúdo ganha o espaço restante.

```
┌─────────────────────────┐
│ [logo]  Pedido #20927   │  ← cabeçalho com folga no topo
│ Ricardo Emerson Poss…   │     (o nome que hoje não aparece)
│ ● Aguardando sua arte   │  ← selo do status, em português
├─────────────────────────┤
│                         │
│    conteúdo da seção    │
│      (rolagem só        │
│       vertical)         │
│                         │
│   [ botão de decisão ]  │  ← fixo acima da barra, quando houver
├─────────────────────────┤
│ 🎨   📦   🧾   💰   💳  │
│Arte Entr. Fat. Orç. Pagar│
└─────────────────────────┘
```

Regras de tela que valem para todas as seções:

- Folga no topo (`env(safe-area-inset-top)`) — nenhum cabeçalho encosta no
  relógio do celular; e folga no rodapé (`env(safe-area-inset-bottom)`) para a
  barra não cair sob o gesto de voltar do iPhone.
- Alvo de toque mínimo de 44px, `font-size: 16px` em campos (senão o iOS dá zoom
  ao focar).
- Nada de rolagem horizontal: tabela larga rola dentro da própria caixa.
- A troca de aba **não recarrega a página** nem refaz consulta: os dados vêm de
  uma carga só, guardada em memória.

O endereço não muda: continua `/cliente/{numero}-{token}`. A aba escolhida vira
um hash (`#entrega`), para o cliente poder recarregar sem voltar ao começo, e
para o atendente poder mandar o link já na aba certa.

---

## 4. As cinco seções

### 4.1 🎨 Aprovação de Arte

**Mantém tudo o que existe, sem tocar no motor de desenho.** O canvas combinado
(`drawAmostraFace`), o lightbox com pinça e zoom, o viewer de PDF multipágina com
a fila que impede a corrupção de dois `render()` no mesmo canvas, a decisão por
modelo com observação, o seletor de página do CSV e o botão final — tudo isso
muda de arquivo, e não de comportamento. É código aprovado, rodando na gráfica.

O que ganha é **estado por status**, em vez de sumir:

| status_arte | o que a aba mostra |
|---|---|
| `Enviar Arte`, `Aguard. Aprovação` | a aprovação como hoje: artes, aprovar/alterar por modelo, botão final |
| `APROVADO` | "Artes aprovadas em {data}" + as artes aprovadas, só leitura, com o lightbox funcionando |
| `Em Alteração`, `REPROVADO` | "Recebemos seu pedido de alteração" + o texto que ele escreveu |
| `EM PRODUCAO` | "Seu pedido está na impressora" + as artes aprovadas, só leitura |
| `Em Arte`, nulo, outros | "Nossa equipe está preparando sua arte" |

A etapa de conferência de dados que hoje aparece **depois** de aprovar as artes
(`mostrarConfirmacaoDadosCliente`) deixa de ser uma tela sequencial: ela vira as
abas Entrega e Faturamento, que já estavam lá o tempo todo. Ao aprovar as artes,
a página leva o cliente para a aba Entrega com um aviso do que falta.

### 4.2 📦 Dados de Entrega

- Endereço completo, com recebedor e CPF do recebedor quando houver
  (`enderecos`, achado por `propostas.id_endereco_ent`).
- **Forma de envio** — `propostas.frete_escolhido` (SEDEX, MOTOBOY, VEPPO,
  RETIRADA), com `modalidade_frete` quando preenchido, e o valor do frete
  (`valor_frete`; zero vira "sem custo").
- **Prazo de envio** — `propostas_os.data_termino`, o mesmo campo que o Painel de
  Produção usa como Prazo de Entrega. Sem essa linha (a tabela do parceiro ainda
  não cobre todo pedido: 23 linhas), cai no prazo do produto, `produtos.prazo` —
  é de lá que vem o "1 dia útil" do resumo do orçamento.
- **Código de rastreio** — `propostas_os.codigo_rastreamento` quando houver (4
  pedidos já têm), com o link dos Correios.
- **CONFIRMAR / ALTERAR**, com a caixa de texto e o botão 💾 Salvar Correção.

### 4.3 🧾 Dados de Faturamento

Razão social, CPF/CNPJ, I.E. (vazio vira "ISENTO"), e-mail e telefone, com o
próprio par **CONFIRMAR / ALTERAR**.

Hoje entrega e faturamento são um cartão só, com um par de botões e um campo de
texto. Separando em duas abas, cada uma passa a ter a sua decisão. Para isso
**não é preciso mexer no schema**: `pedidos_artes.observacoes` é `jsonb` e já
guarda `correcao_entrega_faturamento`; entram ao lado as chaves
`correcao_entrega` e `correcao_faturamento`. O selo continua sendo o
`entrega_dados` único, que o painel já lê:

- as duas confirmadas → `APROVADO`
- qualquer uma com correção → `CORRIGIR`
- `ALTERADO` continua sendo só do atendente, girando o selo na Lista de Arte.

A caixa "Dados de Entrega / Faturamento Alterados" do painel
(`loadDadosEntregaInterno`) passa a mostrar as três chaves, rotuladas — a antiga
continua sendo lida, porque é ela que existe nos pedidos já gravados.

> **Cuidado que não pode ser perdido:** a linha do pedido em `pedidos_artes`
> precisa existir ANTES de o link ir ao cliente. A página roda como `anon` e a
> RLS recusa INSERT ali. Quem cria é `garantirLinhaDePedidoArte`, no painel. E
> `gravarCorrecaoDoCliente` continua pedindo as linhas afetadas de volta: se não
> gravou, o cliente vê o aviso com o número do pedido, e não "tudo certo".

### 4.4 💰 Orçamento

Só consulta — o orçamento foi fechado no ERP antes de a arte existir, e o único
botão de decisão da página continua sendo o da arte e o dos dados.

A fonte é **`propostas.texto_whatsapp`**, o mesmo resumo que o cliente já recebeu
pelo WhatsApp. Preenchido em **1.436 dos 1.489** pedidos dos últimos 30 dias
(96%). Formato real do pedido 20927:

```
Olá, 😀

Orçamento para:
*Ricardo Emerson Possidonio*

📄 Proposta *20927*

*Segue orçamento para os itens solicitados.*

*Produtos Orçados:*

✅ *150* Pulseira ColorBand: *R$ 71,50* (1 dia útil)

Frete via *Retirada Local: Grátis*

O valor total do pedido ficou em *R$ 71,50*

Se estiver tudo certo, me confirma por aqui que já dou andamento ao processo!
```

A aba renderiza esse texto com a formatação do WhatsApp traduzida (`*negrito*`
vira negrito, quebras de linha viram parágrafos), dentro de um cartão limpo, com
o **total em destaque** no topo (`propostas.valor_total`, formatado em real).

A saudação e a frase final de venda ("Se estiver tudo certo, me confirma por
aqui…") são cortadas: fazem sentido numa mensagem, não numa página onde o
cliente já está.

**Quando `texto_whatsapp` for nulo** (4%), a aba monta a lista a partir de
`produtos_proposta`: nome do produto, quantidade, valor unitário, taxa fixa e
subtotal; depois frete e total. Mesmo dado, mesma ordem.

> O texto é dado do parceiro, e é escapado antes de virar HTML. Só o negrito do
> WhatsApp é interpretado — nenhuma tag vinda do banco chega ao DOM.

### 4.5 💳 Link para pagamento

Lê `propostas_os.link_pagamento`, que o parceiro vai fornecer.

- **Preenchido:** botão grande "Pagar agora" abrindo o link em nova aba, com o
  valor total, a forma de pagamento (`forma_pagamento`) e o status
  (`status_pagamento`) quando forem confiáveis.
- **Vazio** — que é o caso das 23 linhas de hoje: a aba diz que o link ainda não
  foi liberado, mostra o valor total do pedido e **diz o que fazer** ("fale com
  seu atendimento"). Nenhuma tela deste projeto trava sem oferecer a saída.

> Medido em 20/08/2026: `link_pagamento` e `forma_pagamento` estão vazios em
> todas as 23 linhas de `propostas_os`, e `status_pagamento` vale `APROVADO` em
> todas — o que denuncia um valor padrão, e não um estado real. Por isso o
> `status_pagamento` só aparece quando o parceiro passar a variar esse campo; até
> lá, mostrar "pagamento aprovado" para todo mundo seria mentira na tela do
> cliente.

---

## 5. Dados e segurança

### 5.1 Uma função nova, no padrão que já existe

`link_cliente_pedido(p_numero text, p_token text)`, `SECURITY DEFINER`,
`SET search_path = public`, no mesmo molde de `link_cliente_abrir` — que já é
como a página valida o token desde 16/08/2026.

Ela confere o par número+token e `ativo IS TRUE` e devolve **um `jsonb` só** com
o que as cinco abas precisam:

```
{
  "pedido":    { numero, cliente, valor_total, valor_frete, frete_escolhido,
                 modalidade_frete, texto_whatsapp, volume, status_arte },
  "cliente":   { nome, documento, ins_estadual, email, telefone },
  "endereco":  { recebedor, cpf_recebedor, endereco, numero, complemento,
                 bairro, cidade, uf, cep },
  "itens":     [ { nome_produto, modelo_descri, qtd, valor_unt, fixo,
                   valor_sub_total, prazo } ],
  "os":        { data_termino, codigo_rastreamento, link_pagamento,
                 forma_pagamento, status_pagamento },
  "entrega":   { entrega_dados, observacoes }
}
```

Três ganhos, nessa ordem de importância:

1. **Os valores e o cadastro só saem com o token certo.** Hoje eles saem com a
   chave pública, que qualquer um lê com Ctrl+U. A função devolve os cinco campos
   do cliente que a tela mostra — e não `limite_credito`, `risco_credito` ou
   `total_compras`.
2. **Uma ida à rede em vez de seis.** No 4G do cliente, cada consulta é um
   ida-e-volta; a página hoje faz seis antes de desenhar qualquer coisa.
3. A página deixa de depender de `select('*')` em tabela do parceiro, que pode
   ganhar coluna a qualquer momento.

Como o resto do projeto: o arquivo sai completo e pronto para colar no editor do
Supabase, e roda por `.\ferramentas\rodar_sql.ps1 sql\link_cliente_pedido.sql`.

**O arquivo é aditivo.** Ele cria uma função e dá `GRANT EXECUTE` a `anon` e
`authenticated`. Não fecha privilégio de tabela nenhuma — as tabelas do parceiro
(`propostas`, `clientes`, `enderecos`, `produtos_proposta`, `propostas_os`) são
do projeto do parceiro e fechá-las é decisão que não é nossa, e que quebraria
telas do ERP. O que este desenho faz é **parar de usar aquela porta** na página
pública.

### 5.2 Os catálogos param de vir inteiros

As quatro consultas sem filtro (`producao_cores`, `producao_numeracoes`,
`producao_formatos`, `produtos`) passam a vir filtradas pelos ids que os modelos
do pedido usam — `.in('id', [...])`. O motor de desenho procura por id em
`state.cores` e `state.numeracoes`; enquanto o id do pedido estiver lá, ele não
percebe diferença.

Duas guardas obrigatórias, porque aqui é fácil quebrar o que está aprovado:

- **A numeração customizada** (`is_custom`, com `Cli_Num`) tem de continuar
  entrando — é ela que carrega o trabalho do operador.
- **A regra de cor e numeração do modelo** (`cor-numeracao-do-modelo.js`, com
  testes em `CorNumeracaoDoModelo.Tests.ps1`) resolve nome × id ao carregar o
  pedido, e pode escolher uma cor pelo **nome**. O filtro tem de ser montado
  depois dessa resolução, ou a cor certa fica de fora e o cliente vê a arte na
  cor errada.

Se essa segunda guarda não puder ser garantida com teste, o filtro dos catálogos
sai desta entrega e vira trabalho à parte: **arte na cor errada na tela do
cliente é pior do que 200 KB a mais**.

---

## 6. Divisão dos arquivos

`cliente.js` tem 3.489 linhas e faz sete coisas. Passa a ser:

| arquivo | o que contém |
|---|---|
| `cliente-dados.js` | a chamada da RPC, o `clienteState`, o carregamento dos itens e dos catálogos |
| `cliente-shell.js` | rota, cabeçalho, selo de status, barra de abas, troca de seção |
| `cliente-arte.js` | a aprovação inteira: `renderAmostrasOSItens`, `drawAmostraFace`, lightbox, viewer de PDF, CSV |
| `cliente-entrega.js` | endereço, envio, prazo, rastreio, confirmar/alterar |
| `cliente-faturamento.js` | dados de nota fiscal, confirmar/alterar |
| `cliente-orcamento.js` | o resumo, com o tradutor de negrito do WhatsApp |
| `cliente-pagamento.js` | o link do parceiro e os dois estados |
| `cliente-gravacao.js` | `gravarStatusDoLink`, `gravarCorrecaoDoCliente`, `saveAmostraToDB` |

**Regra da mudança:** o conteúdo de `cliente-arte.js` é movido **sem alteração de
comportamento**. Nenhuma refatoração de oportunidade ali dentro. O que muda é
onde ele desenha (dentro da seção da aba) e quando (na primeira vez que a aba
abre).

---

## 7. Testes

Continuam valendo, e são o freio desta mudança:

- `test_link_do_cliente_pelo_token.py` — a validação passa pela função, a página
  não lê a tabela, a função não devolve o token.
- `test_correcao_do_cliente.py` — a gravação devolve o que gravou.
- `test_arte_de_aprovacao.py` — a composição da amostra existe uma vez só.
- `test_link_do_cliente.py` — a página carrega o leitor de PDF.
- Harnesses: `link_do_cliente_harness.js`, `correcao_do_cliente_harness.js`,
  `arte_de_aprovacao_harness.js`, `dados_de_entrega_harness.js`,
  `prazo_de_entrega_harness.js`.

Entram novos:

1. **A barra de abas leva às cinco seções** e a aba do hash abre direto.
2. **O nome do cliente aparece** — o teste que teria pego o `cliente_nome`.
3. **O orçamento traduz o negrito e escapa HTML** — texto com `<script>` no
   `texto_whatsapp` não vira tag; sem `texto_whatsapp`, monta pelos itens.
4. **A aba de pagamento sem link diz o que fazer** — e não mostra botão morto.
5. **Entrega e faturamento gravam em chaves separadas** e o selo resultante é
   `APROVADO` só com as duas confirmadas.
6. **A função nova exige o par** e não devolve `limite_credito` (o teste lê a
   lista de campos do SQL).
7. **A aprovação de arte não regrediu** — os harnesses existentes rodando contra
   os arquivos novos.

---

## 8. O que este desenho NÃO faz

- Não fecha privilégio de tabela do parceiro (ver 5.1).
- Não cria conta nem login para o cliente: o link continua valendo pelo token.
- Não mexe no motor de imposição, no agente, nem em nada que sai impresso.
- Não escreve valor, preço ou quantidade de volta em tabela nenhuma: a aba
  Orçamento é de leitura, e a `qtd` do modelo continua sendo dado do ERP.
- Não inventa status de pagamento enquanto o parceiro não variar o campo.
