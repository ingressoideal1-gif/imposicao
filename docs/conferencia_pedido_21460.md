# Conferência do pedido 21460 — 01/09/2026

Pedido a pedido do usuário: *"pedido 21460, revisar numeração e fazer conferencia
do banco de dados"*.

**Nenhuma linha do banco foi escrita.** Tudo aqui é consulta, mais uma prova
gerada localmente a partir das artes publicadas.

Cliente **ANGELA BEATRIZ DA COSTA SALOMAO LTDA** · Expointer 2026 ·
`status_interno = EM PRODUCAO` · 5 modelos · **6.950 credenciais** · nada
impresso ainda.

---

## 1. Resultado

**Os cinco modelos batem: contratada = imprime, `falta = 0` em todos.**

| Modelo | Nome | Contratada | Imprime | Coluna que o QR lê |
|---|---|---|---|---|
| 1000780 | VEÍC.EXPOSITOR SIMERS P16 | 200 | **200** | `VEICULO - PORTAO 16 \| EXPOSITOR SIMERS` |
| 1000781 | EXPOSITOR | 3.000 | **3.000** | `EXPOSITOR` |
| 1000782 | EXPOSITOR SIMERS | 500 | **500** | `EXPOSITOR SIMERS` |
| 1000783 | VEÍC.SERVIÇO P1 | 250 | **250** | `VEICULO PORTAO 1 \| SERVICO` |
| 1000784 | PEDESTRE DIÁRIA | 3.000 | **3.000** | `PEDESTRE / DIARIA` |

Sobre os 6.950 códigos:

- **6.950 distintos** — nenhum código se repete, nem dentro de um modelo nem
  entre modelos;
- todos com **12 dígitos**, só numéricos, sem espaço nem caractere invisível;
- nenhum deles aparece no banco de nenhum outro pedido do sistema;
- em cada coluna as linhas preenchidas são as **1 a N**, contíguas, sem buraco;
- nenhuma linha desativada (`__ativo`).

---

## 2. Como este pedido está montado

É o primeiro pedido real conferido no desenho novo, o de 27–28/08/2026: **o banco
não mora dentro da numeração.**

```
producao_numeracoes  "Expointer 2026"   ← a PEÇA: só o desenho
   ├─ el_1  QR    20 mm, centro (80,73 ; 138,61) mm, source = database
   ├─ el_2  TEXT  helv 12 pt, rotação 270°, pad 5, centro (94,02 ; 142,93) mm
   └─ metadata    print_mode = front
        csv_data = NULL   ·   csv_headers = []   ← de propósito

pedidos_bancos  "codigos_por_setor (1) - Codigos por Setor"   ← o DADO, do pedido
   3.000 linhas × 5 colunas (uma por tipo de credencial)

pedidos_modelos_banco   ← quem lê o quê
   1000780 → csv_mapa {"el:el_1": "VEICULO - PORTAO 16 | EXPOSITOR SIMERS"}
   1000781 → csv_mapa {"el:el_1": "EXPOSITOR"}
   1000782 → csv_mapa {"el:el_1": "EXPOSITOR SIMERS"}
   1000783 → csv_mapa {"el:el_1": "VEICULO PORTAO 1 | SERVICO"}
   1000784 → csv_mapa {"el:el_1": "PEDESTRE / DIARIA"}
```

Os cinco modelos apontam para a **mesma** numeração, e isso está certo: a peça é
material de catálogo, e cada modelo lê a **sua** coluna do mesmo banco-mestre.

O que sai em cada credencial:

| Elemento | O que imprime | Exemplo do 1000781 |
|---|---|---|
| `el_1` QR, 20 mm | o código de 12 dígitos da coluna daquele modelo | `301013536972` |
| `el_2` texto vertical | o número **sequencial** do item, 5 dígitos | `00001` |

O `pad: 4` do `el_1` não vale nada aqui — elemento com `source: database` lê a
linha e nunca chega ao ramo do `zfill` no `engine._render_element`.

---

## 3. A prova, sobre a arte de verdade

As cinco artes foram baixadas do Storage e a numeração foi desenhada por cima com
as **mesmas funções do `engine.py`** (`_largura_do_texto`, `_fracao_das_base14`,
`_generate_qr`, e a âncora central `x_mm/y_mm`). Resultado: QR e número caem na
tarja branca do rodapé, à direita dos logos dos patrocinadores. Nada encosta em
nada.

### O tamanho acabado é 100 × 150, não 105 × 155

As cinco artes têm **1 página, 105 × 155 mm de CropBox e TrimBox de 100 × 150 mm**
— 2,5 mm de sangria em cada lado, centrada. O formato do sistema,
`Credencial 100x150 Triplex`, é 105 × 155: ou seja, **a célula da imposição é o
tamanho COM sangria**, e o corte acontece no traço de corte da arte, 2,5 mm para
dentro de cada lado. Entre duas credenciais vizinhas há 5 mm de sangria a
descartar (2,5 de cada uma), o que exige dois cortes por rua.

Com o corte nesse lugar, as folgas até a borda acabada ficam:

| | até o corte de baixo | até o corte da direita |
|---|---|---|
| QR (20 mm) | **3,89 mm** | 11,77 mm |
| Número `00001` | 3,68 mm | **6,37 mm** |

Está dentro, e com folga suficiente para o desvio normal da guilhotina — mas é a
medida a olhar se alguém pedir para aumentar o QR.

---

## 4. Pontos de atenção (não são defeitos — são decisões do usuário)

**1. O número visível reinicia em 1 em cada modelo.** Os cinco modelos têm
`numeracao_inicio = 1`, então `00001` existe cinco vezes, em cinco credenciais
diferentes. **O QR é único; o número impresso não é.** Se o número serve só de
controle interno da tiragem, está certo. Se alguém na portaria confere pelo
número escrito, ele não distingue EXPOSITOR de PEDESTRE.

**2. Estes modelos NÃO sobem ao Ideal Control.** A
`acesso_publicacao.numeracao_do_modelo` recusa, de propósito, elemento com
`source: database` — o conteúdo vem da linha, e publicar a conta sequencial
gravaria um hash que não corresponde ao que foi impresso. Consequência: nenhum
dos cinco vira setor do evento nem entra na conta do que falta publicar, e
`producao_acesso_pedidos` para o 21460 está vazio. Se o controle de entrada da
Expointer é do cliente (que foi quem mandou os códigos), está certo assim.

**3. O modelo 1000783 não fecha a folha.** 250 ÷ 4 poses = 62,5 → a última folha
sai com **2 células vazias**. Os outros quatro fecham redondo (50, 750, 125 e 750
folhas). O pedido inteiro dá **1.739 folhas**.

**4. O `el_1` não tem "Exemplo:".** Fora do pedido — na Lista de Numerações — a
prévia do QR mostra `[coluna]`, porque é o que `textoDeExemploDoElemento`
devolve sem `exemplo` e sem `csv_column`. Dentro do pedido resolve certo, pelo
`csv_mapa`. É cosmético, e só aparece no catálogo.

---

## 5. O defeito na ferramenta de conferência — e o conserto

**A consulta oficial devolvia VAZIO para este pedido.**

`sql/consultas/conferir_contratado_x_banco.sql` exigia `n.csv_data is not null`,
porque foi escrita quando o banco morava dentro da numeração. Aqui `csv_data` é
nulo — o banco é do pedido —, então o `join` não achava nada e a consulta
terminava sem uma linha. Cinco modelos "conferidos" por uma consulta que não
olhou nenhum, **sem nada na tela dizendo isso**.

Isso é pior do que o alarme falso do 21202: alarme falso pelo menos se
investiga. Silêncio numa conferência se lê como "tudo certo".

As três consultas foram reescritas para reproduzir o `BancoDoModelo` do
frontend, que é quem manda:

- o banco é `coalesce(pedidos_bancos.csv_data, producao_numeracoes.csv_data)` —
  o do pedido quando há vínculo, o de dentro da peça quando não há;
- a coluna de cada elemento é `csv_mapa['el:<id>']`, e **só** na falta dela vale
  o `csv_column` da peça passado pelo mapa por nome (o caminho legado, que
  continua intacto, como o usuário exigiu em 28/08);
- em `conferir_pedido_por_modelo.sql`, o achado *"banco compartilhado sem
  recorte"* passou a olhar os modelos que leem **as mesmas colunas**, e não os
  que apontam para a mesma numeração. Ler colunas diferentes do mesmo
  banco-mestre é o desenho normal agora, e acusá-lo seria alarme falso;
- `conferir_numeracoes_do_pedido.sql` deixou de comparar a soma contratada com o
  total de linhas do banco (no 21460 seriam 6.950 contra 3.000, e está certo) e
  passou a agrupar por **coluna**, mostrando `linhas_com_dado` ao lado.

**Regressão medida, e não suposta:** rodadas contra o 21202 (o caminho legado, 52
modelos hoje), as três consultas dão o mesmo resultado de antes — 52 modelos,
todos `ok`, `falta = 0`. E a mudança do achado 5 muda o veredito de exatamente
**9 modelos em todo o sistema**, todos com banco do pedido e colunas distintas:
os 5 do 21460 e os 4 do 21346, que é o pedido de teste. Nenhum modelo do caminho
antigo mudou de resposta.
