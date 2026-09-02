# Conferência do pedido 21408 — 01/09/2026

Pedido a pedido do usuário: *"revisar pedido 21408"*.

**Nenhuma linha do banco foi escrita, nada foi impresso e nada foi publicado.**
Tudo aqui é consulta, mais uma imposição gerada localmente pelo próprio
`engine.py` a partir das artes que estão no Storage.

Cliente **GRÊMIO FOOT-BALL PORTO ALEGRENSE** · "Credenciais Funcionais", Arena do
Grêmio, Porto Alegre · `status_interno = NOVO`, `etapa_operacional = COMERCIAL` ·
2 modelos · **45 credenciais PVC** (mais 45 cordões, que não imprimem) · nada
produzido ainda, arte com o cliente.

---

## 1. Resultado

**Os dois modelos batem: contratada = páginas do arquivo.**

| Modelo | Nome | Contratada | Páginas da frente | Verso |
|---|---|---|---|---|
| 1000739 | PERSONALIZADAS | 25 | **25** | 1 página, a mesma em todas |
| 1000740 | CREDENCIAMENTO ESPECIAL | 20 | **20** | 1 página, a mesma em todas |

Sobre as 45 páginas:

- **as 45 são visualmente distintas** — nenhuma peça repetida dentro de um
  modelo, comparadas por assinatura de imagem a 50 dpi;
- **nenhuma página em branco**;
- **um só tamanho de página dentro de cada arquivo** — o motor cola a arte no
  tamanho real, então página fora de padrão sairia deslocada em relação ao corte;
- o arquivo do verso é **byte a byte o mesmo** nos dois modelos
  (`sha256 6ae462a454a0ef35…`), o que confere com a observação do ERP:
  *"CREDENCIAIS - MESMO VERSO DA OS 262038"*.

25 + 20 = 45 = a quantidade do item 2373 da proposta. O item 2374 (cordão) não
tem arte nem modelo, e é assim que tem de ser.

---

## 2. Como este pedido está montado

É o primeiro pedido conferido em **PDF Paginado**, e ele é montado ao contrário
dos anteriores: **não existe banco de dados nenhum.**

```
pedidos_modelos 1000739 / 1000740   modo_pdf = true  ->  schema "pdf_multiple"
   arte da frente = 1 PDF de N paginas, UMA POR CREDENCIAL
   arte do verso  = 1 PDF de 1 pagina, repetida em todas

producao_numeracoes  "Frente variavel e verso unico"  (Cli_Num 12460 = Gremio)
   ├─ el_9   PDF "Gabarito"   render_mode = layout  ->  NAO IMPRIME
   ├─ el_10  PDF "Registro"   render_mode = print   ->  IMPRIME
   └─ metadata  print_mode = duplex_unico
        csv_data vazio, csv_headers []   ← de proposito

pedidos_bancos / pedidos_modelos_banco  ->  NENHUM registro para o 21408
```

O que varia de credencial para credencial está **dentro do arquivo do cliente**,
não numa coluna: é o número do lugar (304, 305, 306…) e quais das oito zonas de
acesso ficam acesas. A numeração aqui não numera nada — ela só carrega o gabarito
de PVC da casa.

Os dois elementos são o gabarito padrão da gráfica, o mesmo `Gabarito PVC` que
**22 numerações** do sistema já usam (a mestra `90x140 - Gabarito` serve 10
modelos). O `Registro` imprime de propósito: são quatro marcas de registro, uma
por canto, a 1,1 mm da borda lateral da célula e 2,4 mm da borda de cima —
fora do cartão acabado. O `Gabarito` (margem de segurança laranja e linha de
corte azul) só aparece na tela.

---

## 3. A prova, com o motor de verdade

As artes foram baixadas do Storage e passadas pelo **`engine.py` deste
repositório**, com o formato, a saída e a numeração que o pedido usa. Não é uma
simulação minha: é o mesmo código que gera o PDF que vai para a impressora.

| Modelo | Folhas A4 | Páginas físicas | Sobra na última folha |
|---|---|---|---|
| 1000739 | 7 | 14 (frente + verso) | 3 células vazias |
| 1000740 | 5 | 10 | fecha redondo |

**12 folhas A4 no total**, 4 credenciais por folha (2 × 2, células 105 × 148 mm,
as células 2 e 3 giradas 180°). Somar os dois modelos numa imposição só não
economizaria papel: 45 ÷ 4 dá 12 folhas do mesmo jeito.

### O que foi medido na folha gerada

| | 1000739 | 1000740 |
|---|---|---|
| página do arquivo | 104,35 × 158,35 mm | 110,70 × 164,70 mm |
| tinta (o desenho) | 98,3 × 152,2 mm | 98,3 × 152,4 mm |
| margem branca até a borda da célula | 3,43 mm à esquerda, 3,53 à direita | 3,43 / 3,53 |

**As duas páginas têm tamanhos diferentes e isso não muda nada no papel.** A
diferença é só moldura vazia — 3,175 mm de um lado, 6,35 do outro —, e ela é
transparente (alfa 0 nos quatro cantos, medido). Como o motor centraliza a página
na célula e a tinta está centrada na página, **o desenho cai no mesmo lugar nos
dois modelos**: 3,4 mm de folga lateral, dentro da tolerância do vinco.

Vale registrar por que isso precisou ser medido: o motor a 100% cola a arte **no
tamanho natural, sem aparar** (`_arte_na_celula` devolve a página inteira como
clip). Arte maior que a célula invade a vizinha. Aqui invade — 2,1 mm para cima
e para baixo — mas o que invade é margem transparente e bleed do próprio desenho,
não conteúdo, e o corte de 90 × 140 fica 4 mm para dentro disso. Se a moldura
fosse branca opaca em vez de transparente, o modelo 1000740 apagaria 2,85 mm da
credencial vizinha de cada lado, e ninguém veria isso na tela.

O verso sai espelhado corretamente (`col_verso = cols - 1 - col`), e como o verso
é único a troca de colunas não teria consequência de qualquer forma.

---

## 4. Pontos de atenção (nenhum é defeito de produção)

**1. O tamanho de página do 1000740 está fora do padrão da casa.** As credenciais
PVC aprovadas antes vêm com a página igual ao desenho — 98 × 148, 105 × 148,
98 × 152, sem moldura. Estas duas vêm com moldura, e a do 1000740 com moldura
dobrada, provavelmente por causa da observação do ERP (*"Tem uma aba escrito sem
marcas de corte"*): parece que um dos dois arquivos veio da aba errada do
material do cliente. **Não muda o que sai impresso**, pelas medidas acima, mas é
o tipo de diferença que muda quando alguém mexer na escala da arte: a 109%, por
exemplo, os dois passariam a crescer a partir de tamanhos diferentes.

**2. A imagem que o cliente está aprovando mostra as guias.** A amostra tem a
margem de segurança laranja, a linha de corte azul e o contorno do cartão com o
furo do cordão — tudo do elemento `Gabarito`, que **não imprime**. Isso é o
comportamento projetado do modo "layout", e vale para todas as credenciais PVC da
casa. Só está anotado aqui porque o `amostra_arte_base64` é a mesma imagem que
vai para a página pública de aprovação: quem olha do lado do cliente vê linhas
que não vão existir no cartão.

**3. A data do evento está no passado.** `pedidos_artes.data_evento` vale
**02/08/2026**, e o pedido nasceu em 31/08/2026. Ou é 02/09, ou é outro mês.

**4. Sobrou uma numeração órfã.** A numeração `1000738` foi criada em
01/09/2026 às 10:43:58 e abandonada 82 segundos depois, quando a
`Frente variável e verso único` (10:45:20) tomou o lugar dela. Nenhum modelo
aponta para a 1000738. É faxina de catálogo, não afeta o pedido.

---

## 5. O que o cliente estava vendo no link — e o conserto

Depois da conferência, o usuário apontou: *"o link do cliente para este pedido
não mostra a paginação, setas para visualizar as páginas quando estão no modo
multipáginas"*.

A paginação sumida era o sintoma leve. **No bloco escrito FRENTE, o cliente via o
VERSO** — o texto do regulamento no lugar da credencial que ele estava sendo
convidado a aprovar.

Causa: `drawAmostraFace` é chamada duas vezes num modelo com verso, e as duas
escreviam no mesmo `pdfViewerState[idx]`. A face `back` chegava depois, tomava o
folheador e redesenhava o canvas da frente com o arquivo de uma página do verso.
O painel tinha a guarda desde 31/08/2026; as duas cópias de `cliente.js` não.

Medido no link de verdade (`/cliente/21408-yz84tt`), num navegador de celular:

| | antes | depois |
|---|---|---|
| PERSONALIZADAS (25) | "Página 1 / 1", setas mortas, verso na frente | "Página 1 / 25", ▶ leva à 4 / 25 |
| CREDENCIAMENTO ESPECIAL (20) | "Página 1 / 1" | "Página 1 / 20" |

Detalhado em `tests/test_cliente_pdf_paginado.py` e no `docs/CHANGELOG.md`.

---

## 6. O buraco na conferência — e o conserto

**As consultas oficiais acusaram os dois modelos de "2. numeracao sem banco".**

É alarme falso: modelo em PDF Paginado não tem banco, por definição. O frontend
força o schema `pdf_multiple` quando `modo_pdf` está ligado, e o motor gasta uma
página do arquivo da frente por peça (`page_idx_front`, no `engine.py`).

O problema não era o rótulo errado. Era que **a pergunta que importa não estava
sendo feita por ninguém**: "25 credenciais contratadas — o arquivo tem 25
páginas?". SQL não abre PDF, então nenhuma das três consultas podia responder, e
nenhuma dizia que não podia. Uma página a menos ali é uma pessoa sem credencial
na porta do evento; uma a mais é um cartão PVC jogado fora.

É a mesma família de defeito do 21460, onde a consulta devolvia vazio em silêncio
— e o mesmo remédio: fazer a ferramenta dizer a verdade sobre o que ela sabe e o
que não sabe.

### O que mudou

- **`ferramentas/conferir_paginas_pdf.py`** (novo). Conta as páginas de cada arte
  do pedido e compara com a quantidade contratada; detecta página repetida,
  página em branco, tamanho misturado dentro do arquivo, e confere o verso contra
  o `duplex_unico`. Só consulta; usa a chave anônima do painel.

  ```
  venv\Scripts\python.exe ferramentas\conferir_paginas_pdf.py 21408
  ```

- **as três consultas de `sql/consultas/`** passaram a reconhecer `modo_pdf`. Em
  vez de "numeracao sem banco", o modelo recebe
  `6. PDF Paginado: conferir as paginas do arquivo`, e a coluna `falta` sai nula
  de propósito em `conferir_contratado_x_banco.sql` — com uma ordenação que
  manda esses modelos para o fim da lista, e não para o topo como o
  `coalesce(..., 999999)` fazia.

### Regressão medida, e não suposta

| Pedido | Antes | Depois |
|---|---|---|
| 21202 (caminho legado, 52 modelos) | 52 × `ok`, `falta = 0` | **igual** |
| 21460 (banco do pedido, 5 modelos) | 5 × `ok`, `falta = 0` | **igual** |
| 21408 (PDF Paginado, 2 modelos) | 2 × `numeracao sem banco` | 2 × `PDF Paginado` |

No sistema inteiro existem **5 modelos** em PDF Paginado, em 4 pedidos (19714,
19715, 20144 e 21408); **4 deles** estavam recebendo o rótulo errado e passam a
receber o certo. Nenhum modelo do caminho antigo mudou de resposta.
