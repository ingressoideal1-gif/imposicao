# Quadro de Avisos dos painéis

A barra flutuante na base do **Painel de Produção** e do **Painel do
Acabamento**, com um recado do ADM para quem trabalha naquele setor e um
dropdown onde cada pessoa marca o próprio nome confirmando que leu.

Pedido do usuário em 23/08/2026: *"um quadro de avisos que vai aparecer no
Painel de Produção e Painel de Acabamento, uma barra flutuante na base da
página, teremos uma barra para cada painel para cada setor (atualmente 8
barras), será gerenciada no menu ADM, aba Avisos, será para visualização de um
aviso e com um drop para os usuários marcarem seus nomes confirmando a
leitura"*.

| Onde | Arquivo |
|------|---------|
| A barra e a aba do ADM | [`frontend/avisos.js`](../frontend/avisos.js) |
| O lugar da barra e a aba | `frontend/index.html` (`#barra-avisos`, `#adm-tab-avisos`) |
| A posição contra a janela | `frontend/style.css` (`.barra-avisos`) |
| As duas tabelas | [`sql/avisos_dos_paineis.sql`](../sql/avisos_dos_paineis.sql) |
| Os testes | `tests/avisos_harness.js`, `tests/avisos_na_tela_harness.js`, `tests/test_avisos_do_painel.py` |

---

> [!NOTE]
> A barra existe no `frontend/index.html`, que é a página viva. O
> `frontend/producao.html` tem uma cópia antiga da interface e **não** recebeu o
> recurso — como já acontece com o editor de CSV e a Lista de Numerações.

## Os oito quadros não se cadastram

Um **quadro** é o par (painel, setor): dois painéis vezes os quatro setores da
gráfica — Flexo, PVC, Têxtil e Laser. Oito, e nunca mais nem menos enquanto os
setores forem esses.

O que se publica e se tira do ar é o **aviso** que está no quadro. Quadro sem
aviso é a *ausência* de linha ativa: nada é desenhado, e o painel fica
exatamente como era antes deste recurso. É de propósito — o estado normal da
gráfica é a maioria dos setores sem recado nenhum, e esse estado não pode custar
cadastro.

## Qual aviso a barra mostra

Ela segue o **filtro de setor do painel**, e não uma escolha própria:

- nenhum setor aceso → todos os avisos daquele painel, um de cada vez;
- um setor aceso → o daquele setor;
- vários acesos (os filtros **somam** desde 21/08/2026) → os daqueles setores.

Com mais de um aviso na fila, a barra mostra **um por vez**, com setas e o
contador `2/3` no lugar da barrinha de leitura. **Urgente vem primeiro**, mesmo
sendo mais antigo; depois vale o mais novo.

> [!IMPORTANT]
> A barra lê o filtro pelas **pílulas da tela** — `.filter-btn-pill.active` e o
> `data-setor` de cada botão —, e não pelo estado interno de nenhum painel. A
> Produção guarda em `state.filtroSetores`; o Acabamento num `tela` fechado
> dentro do `acabamento.js`. As pílulas são o único terreno comum, e são a mesma
> fonte que a lista embaixo usa para se filtrar. Há teste travando isso.

## Quem confirma a leitura

O dropdown lista os operadores do **acesso local** com o perfil daquele painel:
`impressor` na Produção, `acabamento` no Acabamento. É a mesma view
`imposition_operadores` e a mesma regra do seletor de **Responsável** do
Acabamento (22/08/2026): a lista é a do setor, não a da gráfica inteira.

Tocar no próprio nome grava uma linha em `imposition_avisos_leituras`. Detalhes
que a tela resolve e não parecem:

- **a marca aparece antes de o banco responder** — quem tocou vê a hora na hora,
  que é o que faz o gesto parecer ter funcionado. Se a gravação falhar, a marca
  é desfeita e a tela diz por quê, em vez de deixar uma confirmação que só
  existe naquele monitor;
- **dois toques não viram duas leituras** — a chave primária `(aviso_id, nome)`
  é a trava, e o conflito `23505` que ela devolve **não** é tratado como erro: o
  fato que a pessoa queria registrar já está registrado;
- **quem leu e depois perdeu o acesso local continua na lista** — a leitura é um
  fato datado, e sumir com o nome faria o aviso parecer menos lido do que foi.
  Mesma decisão do `acabamento_responsavel` em `pedidos_modelos`.

## Os estados da barra

| Estado | O que muda |
|--------|-----------|
| **Aviso** (normal) | Faixa âmbar `#f59e0b`, megafone |
| **Urgente** | Faixa vermelha `#ef4444`, triângulo, botão vermelho |
| **Vencido** | Some da barra sozinho; continua no ADM |
| **Recolhida** | Vira uma aba de 38 px colada na base |
| **Sem aviso** | Nada é desenhado |

**Urgente não deixa recolher** enquanto ninguém confirmou — a seta fica apagada,
com o motivo no `title`, em vez de sumir. É a única diferença de comportamento
entre os dois níveis, e é ela que dá sentido a marcar um aviso como urgente.

As cores dizem estado, e por isso não acompanham repintura de paleta.

## A aba Avisos do ADM

**ADM → 📢 Avisos** mostra os oito quadros numa grade (setores nas linhas,
painéis nas colunas), cada um com o aviso que está no ar, o estado e quantos
leram. Clicar em **Editar** (ou **Publicar aviso**, no quadro vazio) abre o
editor daquele quadro: o texto, a prioridade, o prazo, e a lista de quem já leu
com a hora.

Publicar exige o menu ADM, que só o perfil administrador enxerga.

### Trocar o texto pede a confirmação de novo

A caixa **"Pedir a confirmação de novo"** aparece marcada quando há aviso no ar
*e* alguém já leu. Marcada, publicar **cria um aviso novo** e tira o antigo do
ar com as leituras dele intactas. Desmarcada, o texto é corrigido no lugar e
quem já leu continua valendo.

A diferença não é cosmética: sem ela, "quem foi avisado" passaria a responder
pelo recado errado — as confirmações de um texto ficariam penduradas noutro.
Desmarcar é para correção de grafia; marcar é para recado novo.

## Duas coisas de tela que custaram atenção

**O toast nasce no mesmo canto.** O `.toast-container` está a 24 px da base
desde sempre, e o operador o procura ali. Em vez de movê-lo, a barra publica a
própria altura em `--avisos-altura` e o CSS do toast se apoia nela
(`bottom: calc(24px + var(--avisos-altura, 0px))`). Sem barra na tela, a
variável zera e o toast volta ao canto de sempre. O
`tests/avisos_na_tela_harness.js` mede isso num Chrome de verdade, porque a
composição das três peças não dá para provar lendo CSS.

**O menu lateral muda de natureza no 1024 px.** Abaixo disso ele é uma gaveta
fora da tela, e a barra usa a largura inteira; a partir dali ele fica no fluxo,
encolhido em `--sidebar-w-collapsed`, e a barra começa depois dele. O `z-index`
da barra (900) fica **abaixo** do 1001 do menu expandido de propósito: quem
passa o mouse no menu está indo a outra tela, e o menu deve vencer.

## O que nunca derruba o painel

Toda consulta falha para dentro. Sem banco, sem tabela ou sem rede, a barra não
aparece e os dois painéis seguem exatamente como antes — um recado que não
chegou é um problema; uma fila de produção que não abre é outro, bem maior.

A única tela que **diz** o que houve é o ADM: se a tabela ainda não existe, a
aba Avisos manda rodar `sql/avisos_dos_paineis.sql`. É lá que está quem pode
resolver.

## A estação da gráfica é anônima

Quem trabalha nos dois painéis entra pelo código de acesso local, **sem sessão
do Supabase**. É por isso que as duas tabelas são nossas (`imposition_*`) e têm
política de `public`: a leitura do aviso e a gravação da confirmação saem direto
pelo PostgREST, sem rota nova e sem desvio pelo agente. Mesma decisão dos
volumes do acabamento — ver [`REGRAS_BANCO.md`](REGRAS_BANCO.md).
