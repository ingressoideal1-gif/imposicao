# Somar modelos numa imposição só, aproveitando a folha

Desenho fechado em 17/08/2026, a partir do pedido **20495** — um caderno de
credenciais PVC com nove modelos, um por país.

> **Este documento é o registro daquele dia, e não descreve mais a tela de
> hoje.** Em 18/08/2026 os botões "PDF Sel." e "Imp. Sel." foram **removidos**
> (imprimiam só o primeiro modelo), e o modelo passou a guardar duas opções
> próprias — imprimir o número, e Sequencial ou Blocado. O que vale agora está em
> `docs/modelos_somados.md`.

## O problema

O formato **Credencial 90×140** põe 4 células por folha A4. Impressos um a um, os
nove modelos do 20495 gastam **66 folhas** e deixam **14 células vazias**:

| Modelo | Qtd | Folhas sozinho | Células vazias |
|---|---|---|---|
| Bulgaria | 37 | 10 | 3 |
| Chile | 29 | 8 | 3 |
| Colômbia | 24 | 6 | 0 |
| Eslováquia | 30 | 8 | 2 |
| Espanha | 29 | 8 | 3 |
| Macedônia do Norte | 28 | 7 | 0 |
| Paraguay | 36 | 9 | 0 |
| Tchéquia | 25 | 7 | 3 |
| Credencial | 12 | 3 | 0 |
| **Total** | **250** | **66** | **14** |

Somados, os mesmos 250 itens cabem em **63 folhas**, com 2 células vazias. São 3
folhas de PVC por pedido, e um trabalho no lugar de nove.

Combinar modelos **já existe** na tela — os botões "PDF Sel." e "Imp. Sel." da
fila do pedido. Só que não economiza nada, e com banco de dados (CSV) ele quebra.

## A regra, ditada pelo usuário

> "A solução precisa ser para qualquer pedido, número de células total dividido
> pelo número de células do formato, neste pedido seria 238/4 e imposicionar no
> modo empilhado, preenchendo as células na ordem."

Ou seja: **uma conta só** (total ÷ poses, arredondado para cima), **modo
empilhado** (cut & stack), **células preenchidas na ordem**, e só a última folha
pode ficar incompleta. Nada de reservar folhas por modelo.

A separação à mão depois do corte é um custo aceito; a folha desperdiçada não é.

## O que já existe e serve

O esquema `multi_artes` do `engine.py` já faz a conta pedida:

```python
total_sheets = math.ceil(cfg.total_items / poses_per_sheet)   # 238 / 4 = 60
item_index   = (P_col_first * total_sheets) + S               # empilhado, na ordem
```

E o `multi_map` já empilha os modelos num fluxo contíguo — os itens da arte 0,
depois os da arte 1, sem folha nova entre eles. `total_items` é a soma dos `qtd`.

## Os quatro buracos

### 1. O botão que combina nunca chega nesse esquema

`pedQueueGerarPDFMulti` força `cut_stack` + `strict_assembly`, e o passo 4 desse
algoritmo faz o oposto do pedido: separa os itens por modelo e dá a cada um
folhas próprias, preenchidas com `None`.

Pior: o corte por bloco compara **itens** com `sheets_per_block` (`len(items) //
stack_size`, com `stack_size = cfg.sheets_per_block`). Com `bloco = 50` e modelos
de 24 a 37 itens, `num_blocks` é sempre 0 — **todo modelo cai no ramo das
sobras**, e o resultado são exatamente as 66 folhas de antes.

### 2. O motor não conhece o CSV de cada arte — é este o buraco que quebra

Os três pontos de renderização leem a linha do banco de um lugar só:

```python
csv_row = cfg.csv_data[item_index] if cfg.csv_data else None      # 2391, 2437, 2621
csv_row = cfg.csv_data[global_idx] if (... ) else None            # 2900, 3058
```

`cfg.csv_data` é o banco da numeração **principal** do payload — a do primeiro
modelo selecionado, já recortado na fatia do modelo **ativo**. O `csv_data` que
viaja dentro de `multi_artes[i].numeracao` **nunca é lido**.

Consequência hoje, ao combinar os oito países do 20495:

- no caminho `multi_artes` (linha 2391, **sem verificação de limite**) o item 37
  estoura `IndexError` e o trabalho inteiro morre;
- no caminho `strict_assembly` (linha 2900, com verificação) os itens além da
  primeira fatia recebem `csv_row = None` e a credencial sai **com o nome em
  branco** — em silêncio, que é o pior desfecho possível.

### 3. A aba Pedido manda as artes sem PDF

O `tempMultiArtes` do `runPedImposition` devolve `pdfDoc`/`pdfVersoDoc`, mas o
`payloadMultiArtes` lê `arte.pdf_url`, `arte.pdf_verso_url`, `arte.pdf_name` e
`arte.num2_id` — que o objeto não tem. O gêmeo no `script.js` tem todos. É a
mesma clonagem que produziu o defeito do CSV corrigido na v630.

### 4. A validação de compatibilidade só olha a cor

`togglePedItemSelection` recusa modelos de cores diferentes e não confere
formato, saída, frente/verso nem modo PDF.

## O desenho

### O seletor

Uma barra que só aparece com **dois ou mais modelos marcados**, logo abaixo de
"Regra de Paginação", nas duas abas:

```
🧷 Modelos combinados:  [ Cada modelo em folha própria ▾ ]
                        [ Aproveitar a folha (empilhado) ]
   9 modelos · 250 itens · 63 folhas — economia de 3 folhas
```

O padrão continua sendo **Cada modelo em folha própria**: nada do que já roda na
gráfica muda de comportamento sozinho. A escolha vive em `state.modoSomaFolha` e
não vai ao banco — é decisão de tiragem, não do pedido.

Quando algum modelo selecionado tem blocagem que **de fato** forma bloco, a barra
avisa que aproveitar a folha desfaz a montagem por bloco. Avisa, não trava:
travar impediria justamente o caso do 20495, em que `bloco = 50` está preenchido
mas nenhum modelo chega perto de formar um bloco.

### O frontend

| Onde | O quê |
|---|---|
| `index.html` (duas abas) | a barra e o seletor |
| `script.js` | `state.modoSomaFolha`, `setModoSomaFolha()`, `contaDaSoma()`, `atualizarBarraDeSoma()` |
| `script.js` `runImposition` | o `schema` da multi-seleção deixa de ser fixo em `cut_stack` |
| `pedido.js` `pedQueueGerarPDFMulti` | para de forçar `strict_assembly`; respeita o seletor |
| `pedido.js` `runPedImposition` | idem, e ganha `pdf_url`, `pdf_verso_url`, `pdf_name`, `num2_id` |
| `pedido.js` `togglePedItemSelection` | confere formato, saída, verso e modo PDF além da cor |

`producao.html` **não** é editado: é cópia antiga da interface, e `app.py:103`
redireciona para `/app/index.html`.

### O motor

Três mudanças no `engine.py`, todas contidas:

**M1 — cada item carrega a sua linha do banco.** Ao montar o `multi_map`, a arte
traz o próprio `csv_data` já filtrado de `__ativo`, e cada item leva a linha que
lhe cabe:

```python
art_csv = (art.get("numeracao") or {}).get("csv_data") or None
if art_csv:
    art_csv = [r for r in art_csv if r.get("__ativo", True) is not False]
...
"csv_row": (art_csv[i] if art_csv and i < len(art_csv) else None)
```

**M2 — os cinco pontos de renderização preferem a linha do item.** Cai para o
`cfg.csv_data` de sempre quando não há linha por arte, o que preserva inteiro o
comportamento de quem não combina modelos. O acesso a `cfg.csv_data` passa a ter
verificação de limite nos três pontos que não tinham — um `IndexError` no meio da
tiragem não é um modo de falha aceitável.

**M3 — no modo somado, a ordem do pedido manda.** Hoje `sorted_artes` ordena por
quantidade decrescente, o que só servia para montar blocos no `strict_assembly`.
No `multi_artes` isso embaralha a sequência sem ganho: a tiragem sairia
Bulgária(37) → Paraguay(36) → Eslováquia(30) → Chile(29)… A ordenação passa a
valer **só** quando `is_strict_assembly`.

### O que o operador recebe

238 itens, 60 folhas. Corta em 4 pilhas; empilhadas na ordem das poses (coluna
primeiro) devolvem a sequência 1–238 contínua. Cada modelo é um trecho contíguo
dessa sequência, e a arte muda no limite — separar é olhar, não contar.

## O que não pode regredir

- **O modo de hoje é o padrão.** Sem tocar no seletor, tudo se comporta como na
  v630.
- **Imposição de um modelo só** não passa por nenhum dos caminhos novos.
- **`cfg.csv_data` continua valendo** para todo trabalho sem `multi_artes` — M2 é
  aditivo.
- **Blocagem de verdade** continua no `strict_assembly`, que não muda.

## Como se verifica

- `tests/csv_fatia_do_modelo_harness.js` — a conta das folhas (`total ÷ poses`) e
  a ordem das células, em pedidos sintéticos com divisão exata e com resto.
- `pytest` novo: `multi_artes` com três artes de 7/5/4 itens num formato 4-up →
  4 folhas; conferir o `item_index` de cada célula, as 2 células vazias no fim, e
  que **cada item recebe a linha de banco da sua própria arte**.
- `pytest`: uma arte sem CSV misturada com artes com CSV não estoura.
- O teste estrutural das duas telas continua exigindo que ambas passem pela mesma
  regra.

## Fora de escopo

- Combinar modelos de **pedidos diferentes**. Decisão do usuário: só dentro do
  mesmo pedido. Juntar pedidos abre perguntas de status, cancelamento e a quem
  pertence a folha, que não têm resposta ainda.
- Um mapa impresso de "onde cortar". A arte muda no limite de cada modelo, o que
  basta para separar.
