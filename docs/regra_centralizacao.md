# Regra Geral de Centralização de Artes (PDF, JPG, PNG, SVG)

Esta documentação detalha a regra de negócio e a lógica de programação aplicadas em todo o ecossistema do **Ideal Imposition** para assegurar que qualquer arte carregada (seja pelo frontend na área de trabalho, seja pelo backend no motor físico) seja centralizada de forma absoluta.

---

## 1. Motivação e Desafio Técnico
Ao exportar artes em PDF a partir de softwares como CorelDraw, Adobe Illustrator ou InDesign, o arquivo gerado frequentemente possui coordenadas de CropBox / MediaBox com origem deslocada (isto é, $x_0 \neq 0$ ou $y_0 \neq 0$). 
Exemplo: Um cartão de visitas de 90x50mm pode estar descrito com coordenadas físicas `Rect(100.0, 150.0, 355.12, 291.73)`.

Se o motor físico de imposição apenas ler as dimensões da página e desenhá-la sem aplicar o mapeamento de recorte (`clip`), ocorrem dois problemas graves:
1. **Deslocamento na Folha (Offset Indesejado)**: O conteúdo é transladado fisicamente na folha física, desalinhando-se das marcas de corte.
2. **Estouro de Célula**: O conteúdo transborda a célula do formato e cobre outras posições adjacentes da grade de imposição.

---

## 2. Implementação da Centralização

### A. Na Área de Trabalho e Preview (Frontend)
Quando uma arte é carregada para a área de trabalho (canvas de numeração) ou para o preview de imposição, utilizamos a biblioteca **PDF.js** para renderizar as páginas no canvas. 
* O viewport da página do PDF.js automaticamente normaliza a origem do CropBox para $(0,0)$, extraindo exatamente a largura (`viewport.width`) e altura (`viewport.height`) úteis do PDF.
* No canvas de desenho, calculamos o ponto superior esquerdo de posicionamento ($drawX$, $drawY$) aplicando a centralização clássica:

```javascript
const drawW = originalW_mm * scale;
const drawH = originalH_mm * scale;
const drawX = (canvasWidth - drawW) / 2;
const drawY = (canvasHeight - drawH) / 2;
```

---

### B. No Motor de Imposição (Backend - PyMuPDF)
No arquivo [engine.py](file:///c:/Users/Junior/.gemini/antigravity/Projetos%20Ingresso%20ideal/ideal-imposition/engine.py), ao impor as páginas individuais do PDF na grade de células da folha de saída:
1. Obtemos a largura (`base_w`) e a altura (`base_h`) da página a partir de `page_base.rect.width` e `page_base.rect.height` (que representam a área útil pós-corte do CropBox).
2. Calculamos o retângulo de destino centralizado na célula física da folha:

```python
# Posição superior esquerda da célula física
cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)

# Centralização da arte na célula
center_x = cell_x0 + (cfg.item_w - base_w) / 2
center_y = cell_y0 + (cfg.item_h - base_h) / 2

# Retângulo final da arte
art_x0 = center_x + cfg.offset_h
art_y0 = center_y - cfg.offset_v
art_x1 = art_x0 + base_w
art_y1 = art_y0 + base_h
rect_art = fitz.Rect(art_x0, art_y0, art_x1, art_y1)
```

3. **Mapeamento de Recorte Explicito (`clip`)**: Na chamada da função `show_pdf_page` do PyMuPDF, passamos explicitamente a propriedade `clip=page_base.rect` (que é o CropBox original do PDF):

```python
out_page.show_pdf_page(rect_art, doc_base, page_idx, clip=page_base.rect)
```

> [!IMPORTANT]
> A passagem de `clip=page_base.rect` força o PyMuPDF a isolar a área útil da página de origem e desenhá-la perfeitamente contida no retângulo `rect_art`, eliminando as coordenadas globais deslocadas da origem e centralizando a arte com precisão milimétrica.

---

## 3. Centralização em Imagens Raster (JPG / PNG)

Imagens raster não têm o problema de CropBox, mas precisam ser escalonadas para caber no item sem distorção.

O motor (`_load_base_as_pdf`) cria um PDF temporário em memória com as dimensões exatas do item e insere a imagem proporcialmente:

```python
# Escala proporcional para caber no item
scale = min(item_w / img_w, item_h / img_h)
draw_w = img_w * scale
draw_h = img_h * scale

# Centralizar no item
x0 = (item_w - draw_w) / 2
y0 = (item_h - draw_h) / 2

page.insert_image(fitz.Rect(x0, y0, x0 + draw_w, y0 + draw_h), filename=img_path)
```

A partir desse ponto, o PDF temporário tem exatamente as dimensões do item e a arte já centralizada — o fluxo de imposição continua identicamente ao de um PDF.

---

## 4. Centralização em Células com Rotação Individual

Quando uma célula tem rotação (90°, 180°, 270°), o motor PyMuPDF aplica a rotação em torno do **centro geométrico** da célula ao chamar `show_pdf_page(..., rotate=angle)`.

Isso funciona corretamente porque a arte já está centralizada no PDF temporário. A rotação não desloca o conteúdo — ele gira em torno do centro da célula.

No **verso em duplex**, a rotação é automaticamente invertida:

```python
cell_rotation_verso = (360 - cell_rotation_frente) % 360
```

Isso garante alinhamento cabeça-com-cabeça quando a folha física é virada.

---

## 5. Centralização de Elementos VDP na Célula

Os elementos VDP (TEXT, QR, BARCODE, SVG, PDF) são posicionados **em coordenadas relativas ao canto superior esquerdo do item (0, 0) em mm**.

No backend, antes de renderizar o elemento no PDF temporário do item, as coordenadas mm são convertidas para pt:

```python
el_x = el.get("x_mm", 0) * MM2PT
el_y = el.get("y_mm", 0) * MM2PT
```

Como o PDF temporário já representa exatamente a área do item (sem deslocamento), as coordenadas dos elementos são sempre precisas — mesmo que a arte base tenha tido CropBox deslocado.

No **frontend** (preview), a mesma lógica se aplica:

```javascript
// Coordenada do elemento relativa ao canto superior esquerdo da célula
const el_x = el.x_mm * MM2PT * scale;
const el_y = el.y_mm * MM2PT * scale;

// Converter para coordenadas relativas ao centro da célula (0, 0)
const el_x_rel = el_x - cw / 2;
const el_y_rel = el_y - ch / 2;

ctx.translate(el_x_rel, el_y_rel);
```

O `ctx.save()` / `ctx.translate()` / `ctx.restore()` envolvendo cada elemento garante que a rotação e posição não vazam entre elementos.

---

## 4. Qual é o `scale` do frontend — nota de 18/08/2026

A seção A acima descreve a centralização, mas não diz de onde sai o `scale`. Durante muito tempo
ele foi o de **"encolher até caber"**: a arte era reduzida até o arquivo inteiro entrar na peça.
O motor nunca fez isso — ele usa `base_w`/`base_h`, o tamanho real da página, como a seção B
mostra. Onde a arte não tinha exatamente o tamanho da peça, a tela mostrava a arte menor do que
ela ia sair, com faixa branca em volta que o papel não tem.

Hoje o `scale` do frontend, para arte em **PDF**, é o do tamanho real: `S / 2.8346`, onde `S` é
quantos pixels por milímetro o canvas tem (2,8346 pt = 1 mm). Arte em **imagem** continua
encolhendo até caber, porque uma imagem não tem tamanho físico — e é o que o motor faz com ela
em `_load_base_as_pdf()`.

A regra completa, com as medições e as quatro janelas que precisam concordar, está em
[`como_a_arte_entra_na_peca.md`](como_a_arte_entra_na_peca.md).
