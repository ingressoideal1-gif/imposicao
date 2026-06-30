import math
import os
import io
import fitz       # PyMuPDF
import qrcode
from PIL import Image

MM2PT = 2.8346   # 1mm em pontos PDF


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Converte #RRGGBB para (r, g, b) normalizados 0-1."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return r / 255.0, g / 255.0, b / 255.0


def _generate_qr(data: str, color_hex: str = "#000000") -> bytes:
    """Gera QR Code PNG em bytes."""
    fill_r, fill_g, fill_b = [int(x * 255) for x in _hex_to_rgb(color_hex)]
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_L, box_size=10, border=0)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color=(fill_r, fill_g, fill_b), back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _generate_barcode(data: str, width_mm: float, height_mm: float, color_hex: str = "#000000", barcode_format: str = "code128") -> bytes:
    """Gera o código de barras como imagem PNG em bytes usando coloração nativa."""
    try:
        import barcode
        from barcode.writer import ImageWriter
    except ImportError:
        raise ImportError("Instale: pip install python-barcode[images]")

    options = {
        "write_text": False,
        "module_height": 15.0,
        "quiet_zone": 0,
        "dpi": 300,
        "foreground": color_hex,
        "background": "white",
    }

    # Assegurar que o formato está em minúsculas
    fmt = (barcode_format or "code128").lower()

    # Pré-processamento e formatação de dados para simbologias numéricas estritas
    if fmt in ("ean13", "ean8", "upca", "itf"):
        # Manter apenas dígitos
        clean_data = "".join(c for c in data if c.isdigit())
        if not clean_data:
            clean_data = "0"
            
        if fmt == "ean13":
            # EAN-13 precisa de 12 dígitos (o 13º dígito de verificação é calculado pela biblioteca)
            if len(clean_data) < 12:
                clean_data = clean_data.zfill(12)
            elif len(clean_data) > 13:
                clean_data = clean_data[:12]
        elif fmt == "ean8":
            # EAN-8 precisa de 7 dígitos (o 8º dígito de verificação é calculado pela biblioteca)
            if len(clean_data) < 7:
                clean_data = clean_data.zfill(7)
            elif len(clean_data) > 8:
                clean_data = clean_data[:7]
        elif fmt == "upca":
            # UPC-A precisa de 11 dígitos (o 12º dígito de verificação é calculado pela biblioteca)
            if len(clean_data) < 11:
                clean_data = clean_data.zfill(11)
            elif len(clean_data) > 12:
                clean_data = clean_data[:11]
        elif fmt == "itf":
            # ITF (Interleaved 2 of 5) exige comprimento par de dígitos
            if len(clean_data) % 2 != 0:
                clean_data = "0" + clean_data
                
        data = clean_data

    code = barcode.get(fmt, data, writer=ImageWriter())
    buf = io.BytesIO()
    code.write(buf, options)
    return buf.getvalue()


def _rotate_rect(rect: fitz.Rect, angle: int, page: fitz.Page) -> tuple[fitz.Rect, fitz.Matrix]:
    """Retorna a matriz de transformação para rotação em torno do centro do rect."""
    cx = (rect.x0 + rect.x1) / 2
    cy = (rect.y0 + rect.y1) / 2
    mat = fitz.Matrix(1, 0, 0, 1, 0, 0)
    if angle != 0:
        mat = fitz.Matrix(1, 0, 0, 1, -cx, -cy)
        mat = mat * fitz.Matrix(math.cos(math.radians(angle)), -math.sin(math.radians(angle)),
                                math.sin(math.radians(angle)),  math.cos(math.radians(angle)), 0, 0)
        mat = mat * fitz.Matrix(1, 0, 0, 1, cx, cy)
    return mat


class ImpositionConfig:
    def __init__(self,
                 base_file: str,
                 out_pdf: str,
                 formato: dict,
                 numeracao: dict | None,
                 saida: dict,
                 seq_start: int = 1,
                 seq_end: int = 100,
                 seq_increment: int = 1,
                 layout_schema: str = "sequential",
                 csv_data: list[dict] | None = None,
                 print_mode: str = "front",
                 numeracao_2: dict | None = None,
                 rotate_page: bool = False,
                 multi_artes: list[dict] | None = None,
                 cut_stack_mode: str = "independent",
                 sheets_per_block: int = 50,
                 block_depth: int = 1):

        self.base_file = base_file
        self.out_pdf = out_pdf
        self.saida = saida
        self.layout_schema = layout_schema
        self.print_mode = print_mode
        self.rotate_page = rotate_page
        self.multi_artes = multi_artes or []
        self.cut_stack_mode = cut_stack_mode
        self.sheets_per_block = sheets_per_block
        self.block_depth = block_depth

        self.has_cover = bool(formato.get("has_cover", False))
        self.cover_scale = float(formato.get("cover_scale", 80.0))
        self.cover_offset_x = float(formato.get("cover_offset_x", 0.0))
        self.cover_offset_y = float(formato.get("cover_offset_y", 0.0))
        self.cover_font_size = int(formato.get("cover_font_size", 12))
        self.cover_font_color = formato.get("cover_font_color", "#000000")
        self.cover_font_x = float(formato.get("cover_font_x", 10.0))
        self.cover_font_y = float(formato.get("cover_font_y", 10.0))
        # Formato (tamanho do item + grade + gaps)
        self.item_w = formato["width_mm"] * MM2PT
        self.item_h = formato["height_mm"] * MM2PT
        self.cols = formato["cols"]
        self.rows = formato["rows"]
        self.gap_h = formato.get("gap_h_mm", 0) * MM2PT   # espaço horizontal entre cols
        self.gap_v = formato.get("gap_v_mm", 0) * MM2PT   # espaço vertical entre rows
        # Deslocamentos e rotações
        self.offset_h = formato.get("offset_h_mm", 0) * MM2PT
        self.offset_v = formato.get("offset_v_mm", 0) * MM2PT
        self.rotations = formato.get("rotations", {})  # Dicionário de rotações de células (ex: {"0": 90})

        # Folha de saída
        self.sheet_w = saida["width_mm"] * MM2PT
        self.sheet_h = saida["height_mm"] * MM2PT

        # Sequência
        self.seq_start = seq_start
        self.seq_end = seq_end
        self.seq_increment = seq_increment
        self.csv_data = csv_data
        
        self.num_tipo = numeracao.get("tipo", "SEQUENCIAL") if numeracao else "SEQUENCIAL"
        self.ticket_qtd = numeracao.get("ticket_qtd", 1) if numeracao else 1
        self.ticket_logica = numeracao.get("ticket_logica", "PILHA") if numeracao else "PILHA"
        
        if layout_schema == "pdf_multiple":
            # Para Pdf Múltiplo, a quantidade total de itens é baseada na quantidade de páginas
            try:
                if base_file.lower().endswith(".pdf"):
                    temp_doc = fitz.open(base_file)
                    total_pages = len(temp_doc)
                    temp_doc.close()
                    if self.print_mode == "duplex":
                        self.total_items = math.ceil(total_pages / 2)
                    else:
                        self.total_items = total_pages
                else:
                    self.total_items = 1
            except Exception as ex:
                print(f"Erro ao contar paginas do PDF: {ex}")
                self.total_items = 1
        elif layout_schema == "multi_artes":
            self.total_items = sum(int(a.get("qtd", 0)) for a in self.multi_artes)
            if self.total_items < 1: self.total_items = 1
        elif csv_data:
            self.total_items = len(csv_data)
        else:
            total_expected = math.floor((seq_end - seq_start) / seq_increment) + 1
            if self.num_tipo == "TICKET":
                self.total_items = math.ceil(total_expected / self.ticket_qtd)
            else:
                self.total_items = total_expected

        # Elementos VDP da numeração
        self.elements = []
        
        # Carregar numeração 1
        if numeracao and "elements" in numeracao:
            for el in numeracao["elements"]:
                e = dict(el)
                # Converter mm → pt para todos os campos de posição/tamanho
                e["_x"] = e.get("x_mm", 0) * MM2PT
                e["_y"] = e.get("y_mm", 0) * MM2PT
                if "size_mm" in e:
                    e["_size"] = e["size_mm"] * MM2PT
                if "width_mm" in e and e["type"] == "BARCODE":
                    e["_w"] = e["width_mm"] * MM2PT
                    e["_h"] = e.get("height_mm", 10) * MM2PT
                if self.print_mode == "duplex":
                    e["face"] = "front"
                else:
                    e["face"] = el.get("face", "both")
                e["_num_source"] = 1
                self.elements.append(e)

        # Carregar numeração 2
        if numeracao_2 and "elements" in numeracao_2:
            for el in numeracao_2["elements"]:
                e = dict(el)
                # Converter mm → pt para todos os campos de posição/tamanho
                e["_x"] = e.get("x_mm", 0) * MM2PT
                e["_y"] = e.get("y_mm", 0) * MM2PT
                if "size_mm" in e:
                    e["_size"] = e["size_mm"] * MM2PT
                if "width_mm" in e and e["type"] == "BARCODE":
                    e["_w"] = e["width_mm"] * MM2PT
                    e["_h"] = e.get("height_mm", 10) * MM2PT
                if self.print_mode == "duplex":
                    e["face"] = "back"
                else:
                    e["face"] = el.get("face", "both")
                e["_num_source"] = 2
                self.elements.append(e)

class ImpositionEngine:
    def __init__(self, config: ImpositionConfig):
        self.cfg = config
        self._url_cache = {}

    def _get_url_bytes(self, url: str) -> bytes:
        if url in self._url_cache:
            return self._url_cache[url]
        import urllib.request
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            self._url_cache[url] = data
            return data

    def _load_base_as_pdf(self) -> fitz.Document:
        """Abre o arquivo base (PDF, JPG, PNG) como documento fitz com dimensões físicas precisas."""
        if not self.cfg.base_file:
            return None
        f = self.cfg.base_file.lower()
        if f.endswith(".pdf"):
            return fitz.open(self.cfg.base_file)
        else:
            # Imagem → converter para PDF temporário em memória ajustando ao tamanho do item
            img = Image.open(self.cfg.base_file)
            img_w, img_h = img.size
            img.close()
            
            doc = fitz.open()
            w_pt = self.cfg.item_w
            h_pt = self.cfg.item_h
            page = doc.new_page(width=w_pt, height=h_pt)
            
            # Calcular dimensões para ajustar proporcionalmente e centralizar (equivalente ao frontend)
            scale = min(w_pt / img_w, h_pt / img_h)
            draw_w = img_w * scale
            draw_h = img_h * scale
            draw_x = (w_pt - draw_w) / 2
            draw_y = (h_pt - draw_h) / 2
            
            rect = fitz.Rect(draw_x, draw_y, draw_x + draw_w, draw_y + draw_h)
            page.insert_image(rect, filename=self.cfg.base_file)
            
            pdf_bytes = doc.write()
            doc.close()
            
            return fitz.open(stream=pdf_bytes, filetype="pdf")


    def _render_element(self, page: fitz.Page, el: dict, cell_x0: float, cell_y0: float, val: int, csv_row: dict | None = None):
        """Renderiza um elemento VDP na posicao absoluta da celula."""
        # O frontend usa ancoragem central: (x_mm, y_mm) = centro do elemento.
        # Converter para top-left (canto superior esquerdo) para o PyMuPDF.
        t = el["type"]
        cx = cell_x0 + el["_x"]  # centro X em pt
        cy = cell_y0 + el["_y"]  # centro Y em pt

        # Calcular half-width e half-height baseado no tipo
        hw = 0.0
        hh = 0.0
        if t in ("TEXT", "FIXED") or t.startswith("TEATRO_"):
            # Para texto, o tamanho depende da string e da fonte — usamos font_size como altura
            # e a largura nao precisa de offset pois insert_text usa ponto de baseline
            font_size = el.get("font_size", 12)
            # Estimativa de largura do texto: ~0.5 * font_size * num_chars (heuristica)
            # Mas para o PyMuPDF, precisamos do ponto de insercao baseado no centro
            hh = font_size / 2.0
            # hw sera calculado depois para o text_length real
        elif t == "QR":
            s = el.get("_size", 42.5)
            hw = s / 2.0
            hh = s / 2.0
        elif t == "BARCODE":
            w_pt = el.get("_w", 60 * MM2PT)
            h_pt = el.get("_h", 12 * MM2PT)
            hw = w_pt / 2.0
            hh = h_pt / 2.0
        elif t in ("SVG", "PDF"):
            w_pt = el.get("width_mm", 20) * MM2PT
            h_pt = el.get("height_mm", 20) * MM2PT
            hw = w_pt / 2.0
            hh = h_pt / 2.0

        # Posicao top-left do bounding box
        el_x = cx - hw
        el_y = cy - hh

        color = el.get("color", "#000000")
        rgb = _hex_to_rgb(color)
        angle = el.get("rotation", 0)

        # Montar valor string
        if el.get("fixed", False):
            val_str = str(el.get("fixed_value", ""))
        elif el.get("source") == "database" and csv_row is not None:
            col_name = el.get("csv_column", "")
            val_str = str(csv_row.get(col_name, ""))
        elif t == "TEATRO_FILA":
            fila = str(csv_row.get("Fila", "A")) if csv_row else "A"
            prefix = str(el.get("prefix", "") or "")
            val_str = f"{prefix}{fila}"
        elif t == "TEATRO_LUGAR":
            num = str(csv_row.get("Numero", "22")) if csv_row else "22"
            prefix = str(el.get("prefix", "") or "")
            val_str = f"{prefix}{num}"
        elif t == "TEATRO_COMBO":
            fila = str(csv_row.get("Fila", "A")) if csv_row else "A"
            num = str(csv_row.get("Numero", "22")) if csv_row else "22"
            prefix_fila = str(el.get("prefix_fila", "") or "")
            prefix_lugar = str(el.get("prefix_lugar", "") or "")
            if el.get("layout") == "2lines":
                val_str = f"{prefix_fila}{fila}\n{prefix_lugar}{num}"
            else:
                val_str = f"{prefix_fila}{fila} - {prefix_lugar}{num}"
        else:
            pad = int(el.get("pad", 0) or 0)
            prefix = str(el.get("prefix", "") or "")
            suffix = str(el.get("suffix", "") or "")
            raw = str(val).zfill(pad) if pad > 0 else str(val)
            val_str = f"{prefix}{raw}{suffix}"


        if t in ("TEXT", "FIXED") or t.startswith("TEATRO_"):
            font_size = el.get("font_size", 12)
            raw_font_name = el.get("font_name", "helv")
            # Mapeamento do frontend para abreviacoes oficiais do Base-14 do PyMuPDF
            font_map = {
                "helv": "helv",
                "helv-bold": "hebo",
                "times": "tiro",
                "times-bold": "tibo",
                "cour": "cour",
                "cour-bold": "cobo"
            }

            font_name = "helv"
            font_file = None  # None = usar fonte embutida Base-14

            if raw_font_name.startswith("system:"):
                # Fonte do sistema: "system:NomeFamilia|bold|italic"
                parts = raw_font_name[7:].split("|")
                family = parts[0]
                is_bold = "bold" in parts[1:]
                is_italic = "italic" in parts[1:]

                # Tenta localizar o arquivo TTF nas pastas de fontes do sistema
                import glob as _glob
                font_dirs = [
                    "C:/Windows/Fonts",
                    "/usr/share/fonts",
                    "/System/Library/Fonts",
                    os.path.expanduser("~/Library/Fonts"),
                ]
                family_lower = family.lower().replace(" ", "")
                found_file = None
                for fdir in font_dirs:
                    if not os.path.isdir(fdir):
                        continue
                    for ext in ("*.ttf", "*.otf", "*.TTF", "*.OTF"):
                        for fpath in _glob.glob(os.path.join(fdir, ext)):
                            base = os.path.splitext(os.path.basename(fpath))[0].lower().replace(" ", "").replace("-", "").replace("_", "")
                            fam_norm = family_lower.replace("-", "").replace("_", "")
                            bold_match = ("bold" in base) == is_bold
                            italic_match = ("italic" in base or "oblique" in base) == is_italic
                            if base.startswith(fam_norm) and bold_match and italic_match:
                                found_file = fpath
                                break
                            if fam_norm in base and not found_file:
                                if bold_match and italic_match:
                                    found_file = fpath
                        if found_file:
                            break
                    if found_file:
                        break

                if found_file:
                    font_name = family
                    font_file = found_file
                else:
                    font_name = "hebo" if is_bold else "helv"
                    font_file = None
                    print(f"[engine] Fonte '{family}' nao encontrada no sistema, usando Helvetica{'Bold' if is_bold else ''}")
            else:
                font_name = font_map.get(raw_font_name, "helv")

            insert_kwargs = {
                "fontsize": font_size,
                "fontname": font_name,
                "color": rgb,
            }
            if font_file:
                insert_kwargs["fontfile"] = font_file

            # Medir largura real do texto para centralizar horizontalmente
            if font_file:
                # Fontes de sistema: get_text_length nao suporta fontfile,
                # usamos estimativa baseada no tamanho medio de um caractere
                text_width = font_size * 0.55 * len(val_str)
            else:
                text_width = fitz.get_text_length(val_str, fontname=font_name, fontsize=font_size)

            # Ancoragem central: cx, cy = centro do texto
            # insert_text origin: X = centro - metade da largura, Y = centro + metade da altura (baseline)
            
            lines_to_draw = val_str.split("\n")
            line_height = font_size * 1.2
            
            # Se for multilinha, o cy e o centro total do bloco
            total_height = len(lines_to_draw) * line_height
            start_y = cy - (total_height / 2.0) + (font_size / 2.0)
            
            for i, line_str in enumerate(lines_to_draw):
                if font_file:
                    text_width = font_size * 0.55 * len(line_str)
                else:
                    text_width = fitz.get_text_length(line_str, fontname=font_name, fontsize=font_size)
                    
                origin_x = cx - text_width / 2.0
                origin_y = start_y + (i * line_height)
                
                if angle != 0:
                    # O pivot de rotacao e o centro do texto (cx, cy)
                    origin = fitz.Point(origin_x, origin_y)
                    pivot = fitz.Point(cx, cy)
                    page.insert_text(
                        origin,
                        line_str,
                        morph=(pivot, fitz.Matrix(-angle)),
                        **insert_kwargs
                    )
                else:
                    page.insert_text(
                        (origin_x, origin_y),
                        line_str,
                        **insert_kwargs
                    )


        elif t == "QR":
            size = el.get("_size", 42.5)
            qr_bytes = _generate_qr(val_str, color)
            rect = fitz.Rect(el_x, el_y, el_x + size, el_y + size)
            py_rotate = (360 - angle) % 360
            if py_rotate != 0:
                page.insert_image(rect, stream=qr_bytes, rotate=py_rotate)
            else:
                page.insert_image(rect, stream=qr_bytes)

        elif t == "BARCODE":
            w_pt = el.get("_w", 60 * MM2PT)
            h_pt = el.get("_h", 12 * MM2PT)
            w_mm = el.get("width_mm", 60)
            h_mm = el.get("height_mm", 12)
            bc_format = el.get("barcode_format", "code128")
            bc_bytes = _generate_barcode(val_str, w_mm, h_mm, color, bc_format)
            rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
            py_rotate = (360 - angle) % 360
            page.insert_image(rect, stream=bc_bytes, rotate=py_rotate, keep_proportion=False)

        elif t == "SVG":
            svg_content = el.get("svg_content") or ""
            if svg_content:
                w_pt = el.get("width_mm", 20) * MM2PT
                h_pt = el.get("height_mm", 20) * MM2PT
                rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
                py_rotate = (360 - angle) % 360
                try:
                    import io
                    from svglib.svglib import svg2rlg
                    from reportlab.graphics import renderPDF
                    
                    if svg_content.startswith("http"):
                        svg_bytes = self._get_url_bytes(svg_content)
                        svg_data = svg_bytes.decode("utf-8")
                    else:
                        svg_data = svg_content

                    drawing = svg2rlg(io.StringIO(svg_data))
                    pdf_bytes = renderPDF.drawToString(drawing)
                    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                    page.show_pdf_page(rect, pdf_doc, 0, keep_proportion=True, rotate=py_rotate, clip=pdf_doc[0].rect)
                except Exception as ex:
                    print(f"Erro ao impor SVG: {ex}")

        elif t == "PDF":
            pdf_content = el.get("pdf_content") or ""
            if pdf_content:
                try:
                    import base64
                    import traceback
                    
                    if not isinstance(pdf_content, str) or not pdf_content.strip():
                        print(f"[engine] Elemento PDF ignorado - pdf_content invalido")
                        return
                    
                    if pdf_content.startswith("http"):
                        pdf_bytes = self._get_url_bytes(pdf_content)
                    else:
                        if pdf_content.startswith("data:"):
                            pdf_content = pdf_content.split(",", 1)[-1]
                        pdf_bytes = base64.b64decode(pdf_content)
                        
                    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                    w_mm = el.get("width_mm")
                    if w_mm is not None:
                        w_pt = w_mm * MM2PT
                        h_pt = el.get("height_mm") * MM2PT
                    else:
                        w_pt = pdf_doc[0].rect.width
                        h_pt = pdf_doc[0].rect.height
                    rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
                    py_rotate = (360 - angle) % 360
                    page.show_pdf_page(rect, pdf_doc, 0, keep_proportion=True, rotate=py_rotate, clip=pdf_doc[0].rect)
                    pdf_doc.close()
                except Exception as ex:
                    print(f"[engine] ERRO ao impor elemento PDF: {ex}")
                    traceback.print_exc()
            else:
                print(f"[engine] Elemento PDF sem pdf_content - ignorado")


    def process(self):
        cfg = self.cfg
        cols = cfg.cols
        rows = cfg.rows
        poses_per_sheet = cols * rows

        # Calcular área total usada na folha (itens + gaps)
        used_w = cols * cfg.item_w + (cols - 1) * cfg.gap_h
        used_h = rows * cfg.item_h + (rows - 1) * cfg.gap_v

        if used_w > cfg.sheet_w or used_h > cfg.sheet_h:
            err = (
                f"O formato de entrada (Matriz {cols}×{rows}) não cabe na folha de saída! "
                f"Necessário: {used_w/MM2PT:.1f}×{used_h/MM2PT:.1f}mm. "
                f"Disponível: {cfg.sheet_w/MM2PT:.1f}×{cfg.sheet_h/MM2PT:.1f}mm."
            )
            raise ValueError(err)

        # Centralizar bloco na folha
        start_x = (cfg.sheet_w - used_w) / 2
        start_y = (cfg.sheet_h - used_h) / 2

        if cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict":
            stack_size = cfg.sheets_per_block * cfg.block_depth
            items_per_set = stack_size * poses_per_sheet
            sets_needed = math.ceil(cfg.total_items / items_per_set)
            total_sheets = sets_needed * stack_size
        else:
            total_sheets = math.ceil(cfg.total_items / poses_per_sheet)
        import time as _time
        _t0 = _time.monotonic()
        print(f"[engine] total_sheets={total_sheets} items={cfg.total_items} poses={poses_per_sheet}")

        doc_out = fitz.open()
        self.generated_files = []
        doc_base = self._load_base_as_pdf()
        
        if cfg.has_cover:
            if cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict":
                stack_size = cfg.sheets_per_block * cfg.block_depth
            else:
                stack_size = total_sheets
        else:
            stack_size = total_sheets
            
        set_idx_current = -1
        
        is_duplex = (cfg.print_mode == "duplex")

        # Preparar mapa de Multi-Artes
        multi_map = []
        pdf_cache = {}

        if cfg.layout_schema == "multi_artes":

            sorted_artes = sorted(cfg.multi_artes, key=lambda a: int(a.get("qtd", 0)), reverse=True)
            
            def parse_elements(num_obj, source_id):
                els = []
                if num_obj and "elements" in num_obj:
                    for el in num_obj["elements"]:
                        e = dict(el)
                        e["_x"] = e.get("x_mm", 0) * MM2PT
                        e["_y"] = e.get("y_mm", 0) * MM2PT
                        if "size_mm" in e: e["_size"] = e["size_mm"] * MM2PT
                        if "width_mm" in e and e["type"] == "BARCODE":
                            e["_w"] = e["width_mm"] * MM2PT
                            e["_h"] = e.get("height_mm", 10) * MM2PT
                        if "width_mm" in e and e["type"] == "SVG":
                            e["width_mm"] = e["width_mm"]
                            e["height_mm"] = e.get("height_mm", 20)
                        if cfg.print_mode == "duplex":
                            e["face"] = "front" if source_id == 1 else "back"
                        else:
                            e["face"] = el.get("face", "both")
                        e["_num_source"] = source_id
                        els.append(e)
                return els

            def _load_art_as_pdf(file_path: str, is_url: bool = False) -> fitz.Document:
                import urllib.request
                try:
                    if is_url:
                        if file_path in pdf_cache:
                            return pdf_cache[file_path]
                        req = urllib.request.Request(file_path, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req) as response:
                            pdf_bytes = response.read()
                            
                        # Tentar abrir como PDF diretamente
                        try:
                            doc = fitz.open("pdf", pdf_bytes)
                            if getattr(doc, "is_pdf", False):
                                pdf_cache[file_path] = doc
                                return doc
                            doc.close()
                        except Exception:
                            pass
                            
                        # Falhou, pode ser uma imagem. Extrair dimensoes e criar PDF envelopando a imagem.
                        try:
                            doc = fitz.open("img", pdf_bytes)
                        except Exception:
                            doc = fitz.open("jpg", pdf_bytes)
                            
                        img_w, img_h = doc[0].rect.width, doc[0].rect.height
                        doc.close()
                        
                        doc = fitz.open()
                        page = doc.new_page(width=cfg.item_w, height=cfg.item_h)
                        scale = min(cfg.item_w / img_w, cfg.item_h / img_h)
                        draw_w = img_w * scale; draw_h = img_h * scale
                        draw_x = (cfg.item_w - draw_w) / 2; draw_y = (cfg.item_h - draw_h) / 2
                        rect = fitz.Rect(draw_x, draw_y, draw_x + draw_w, draw_y + draw_h)
                        page.insert_image(rect, stream=pdf_bytes)
                        
                        final_bytes = doc.write()
                        doc.close()
                        final_doc = fitz.open(stream=final_bytes, filetype="pdf")
                        pdf_cache[file_path] = final_doc
                        return final_doc
                    else:
                        try:
                            doc = fitz.open(file_path)
                            if getattr(doc, "is_pdf", False):
                                return doc
                            doc.close()
                        except Exception:
                            pass
                            
                        # Converter imagem para PDF na memoria
                        doc = fitz.open(file_path)
                        img_w, img_h = doc[0].rect.width, doc[0].rect.height
                        doc.close()
                        
                        doc = fitz.open()
                        page = doc.new_page(width=cfg.item_w, height=cfg.item_h)
                        scale = min(cfg.item_w / img_w, cfg.item_h / img_h)
                        draw_w = img_w * scale; draw_h = img_h * scale
                        draw_x = (cfg.item_w - draw_w) / 2; draw_y = (cfg.item_h - draw_h) / 2
                        rect = fitz.Rect(draw_x, draw_y, draw_x + draw_w, draw_y + draw_h)
                        page.insert_image(rect, filename=file_path)
                        
                        pdf_bytes = doc.write()
                        doc.close()
                        return fitz.open(stream=pdf_bytes, filetype="pdf")
                except Exception as e:
                    print(f"Erro ao carregar/converter arte como PDF ({file_path}): {e}")
                    return None

            for art in sorted_artes:
                qtd = int(art.get("qtd", 0))
                num1_obj = art.get("numeracao")
                num2_obj = art.get("numeracao_2")
                
                n1 = int(num1_obj.get("start", 1)) if num1_obj else 1
                n2 = int(num2_obj.get("start", 1)) if num2_obj else 1
                
                els1 = parse_elements(num1_obj, 1)
                els2 = parse_elements(num2_obj, 2)
                art_els = els1 + els2
                
                pdf_url = art.get("pdf_url")
                local_path = art.get("local_path")
                art_doc = None
                
                try:
                    if local_path and os.path.exists(local_path):
                        art_doc = _load_art_as_pdf(local_path, is_url=False)
                    elif pdf_url:
                        art_doc = _load_art_as_pdf(pdf_url, is_url=True)
                except Exception as ex:
                    print(f"[multi_artes] Erro ao preparar arte: {ex}")

                for i in range(qtd):
                    multi_map.append({
                        "doc_base": art_doc,
                        "elements": art_els,
                        "val1": n1 + i,
                        "val2": n2 + i,
                        "local_path": local_path,
                        "pdf_url": pdf_url,
                        "nome": art.get("nome", ""),
                        "nome_color": art.get("nome_color", "#000000")
                    })

        for S in range(total_sheets):
            set_idx = S // stack_size
            if set_idx != set_idx_current:
                if set_idx_current != -1 and doc_out:
                    if cfg.has_cover:
                        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx_current + 1}_02_miolo.pdf")
                        doc_out.save(out_name, garbage=4, deflate=True)
                        self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                        self._generate_contracapa(set_idx_current, cfg, doc_base)
                    doc_out.close()
                    doc_out = fitz.open()
                
                if cfg.has_cover:
                    self._generate_capa(set_idx, stack_size, poses_per_sheet, cfg, doc_base, total_sheets)
                
                set_idx_current = set_idx

            if S % 25 == 0:
                print(f"[engine] sheet {S}/{total_sheets} elapsed={_time.monotonic()-_t0:.1f}s")
            # 1. RENDERIZAR FRENTE DA FOLHA
            out_page_front = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
            if cfg.rotate_page:
                out_page_front.set_rotation(90)

            for row in range(rows):
                for col in range(cols):
                    P = row * cols + col

                    if cfg.layout_schema == "cut_stack":
                        if cfg.cut_stack_mode == "strict":
                            stack_size = cfg.sheets_per_block * cfg.block_depth
                            set_index = S // stack_size
                            sheet_within_set = S % stack_size
                            item_index = (set_index * stack_size * poses_per_sheet) + (P * stack_size) + sheet_within_set
                        else:
                            item_index = (P * total_sheets) + S
                    elif cfg.layout_schema == "multi_artes":
                        P_col_first = col * rows + row
                        item_index = (P_col_first * total_sheets) + S
                    elif cfg.layout_schema == "sequential":
                        item_index = (S * poses_per_sheet) + P
                    elif cfg.layout_schema == "step_repeat":
                        item_index = S
                    else:
                        item_index = (S * poses_per_sheet) + P

                    if item_index >= cfg.total_items:
                        continue

                    # Determinar a página do PDF base e elementos para a Frente
                    current_doc_base = doc_base
                    current_elements = cfg.elements
                    val = cfg.seq_start + (item_index * cfg.seq_increment)
                    val2 = val
                    arte_nome = ""
                    arte_fsize = 10
                    arte_data = {}

                    if cfg.layout_schema == "multi_artes" and item_index < len(multi_map):
                        arte_data = multi_map[item_index]
                        if arte_data["doc_base"]:
                            current_doc_base = arte_data["doc_base"]
                        current_elements = arte_data["elements"]
                        val = arte_data["val1"]
                        val2 = arte_data["val2"]
                        # arte_nome = arte_data.get("nome", "") # Nome was removed from multi_artes!

                    if cfg.layout_schema == "pdf_multiple":
                        if is_duplex:
                            page_idx_front = (item_index * 2) if current_doc_base and (item_index * 2) < len(current_doc_base) else 0
                        else:
                            page_idx_front = item_index if current_doc_base and item_index < len(current_doc_base) else 0
                    else:
                        page_idx_front = 0

                    if current_doc_base:
                        page_base = current_doc_base[page_idx_front]
                        base_w = page_base.rect.width
                        base_h = page_base.rect.height
                    else:
                        base_w = cfg.item_w
                        base_h = cfg.item_h

                    # Posição da célula final
                    cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
                    cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)
                    cell_x1 = cell_x0 + cfg.item_w
                    cell_y1 = cell_y0 + cfg.item_h

                    cell_rotation = int(cfg.rotations.get(str(P), 0))
                    arte_nome = arte_data.get("nome", "") if cfg.layout_schema == "multi_artes" else ""

                    if cell_rotation == 0 and not arte_nome:
                        # FAST PATH: render arte e VDP diretamente na folha de saída
                        # Elimina temp_doc + tobytes + reopen por célula
                        # Arte é referenciada diretamente do doc_base = 1 XObject compartilhado
                        # Save não precisa deduplicar 1000 XObjects separados
                        if current_doc_base:
                            art_out_x0 = cell_x0 + (cfg.item_w - base_w) / 2 + cfg.offset_h
                            art_out_y0 = cell_y0 + (cfg.item_h - base_h) / 2 - cfg.offset_v
                            out_page_front.show_pdf_page(
                                fitz.Rect(art_out_x0, art_out_y0, art_out_x0 + base_w, art_out_y0 + base_h),
                                current_doc_base, page_idx_front,
                                keep_proportion=False, clip=page_base.rect
                            )
                        else:
                            if cfg.layout_schema == "multi_artes":
                                err_msg = f"ERR: doc_base nulo! local_path={arte_data.get('local_path')} url={arte_data.get('pdf_url')}"
                                out_page_front.insert_textbox(
                                    fitz.Rect(cell_x0, cell_y0, cell_x1, cell_y1),
                                    err_msg, fontsize=8, color=(1,0,0))
                        csv_row = cfg.csv_data[item_index] if cfg.csv_data else None
                        for el in current_elements:
                            if el.get("face", "both") == "back":
                                continue
                            rotated_el = dict(el)
                            rotated_el["rotation"] = el.get("rotation", 0)
                            if "size_mm" in el:
                                rotated_el["_size"] = el["size_mm"] * MM2PT
                            if "width_mm" in el and el["type"] == "BARCODE":
                                rotated_el["_w"] = el["width_mm"] * MM2PT
                                rotated_el["_h"] = el.get("height_mm", 10) * MM2PT
                            if "width_mm" in el and el["type"] == "SVG":
                                rotated_el["width_mm"] = el["width_mm"]
                                rotated_el["height_mm"] = el.get("height_mm", 20)
                            if el["type"] in ("TEXT", "FIXED") or el["type"].startswith("TEATRO_"):
                                rotated_el["font_size"] = el.get("font_size", 12)
                                rotated_el["font_name"] = el.get("font_name", "helv")
                            current_val = val if rotated_el.get("_num_source", 1) == 1 else val2
                            if cfg.num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = int(rotated_el.get("ticket_pos", 1))
                                N = int(cfg.ticket_qtd)
                                current_val = cfg.seq_start + (item_index * N) + (pos - 1)
                            self._render_element(out_page_front, rotated_el, cell_x0, cell_y0, current_val, csv_row)

                    else:
                        # FALLBACK: temp_doc para rotação de célula e arte_nome
                        temp_doc = fitz.open()
                        temp_page = temp_doc.new_page(width=cfg.item_w, height=cfg.item_h)

                        art_temp_x0 = (cfg.item_w - base_w) / 2 + cfg.offset_h
                        art_temp_y0 = (cfg.item_h - base_h) / 2 - cfg.offset_v
                        art_temp_x1 = art_temp_x0 + base_w
                        art_temp_y1 = art_temp_y0 + base_h
                        rect_art_temp = fitz.Rect(art_temp_x0, art_temp_y0, art_temp_x1, art_temp_y1)

                        if current_doc_base:
                            temp_page.show_pdf_page(rect_art_temp, current_doc_base, page_idx_front, clip=page_base.rect)
                        else:
                            if cfg.layout_schema == "multi_artes":
                                err_msg = f"ERR: doc_base nulo! local_path={arte_data.get('local_path')} url={arte_data.get('pdf_url')}"
                                temp_page.insert_textbox(rect_art_temp, err_msg, fontsize=8, color=(1,0,0))

                        csv_row = cfg.csv_data[item_index] if cfg.csv_data else None

                        for el in current_elements:
                            if el.get("face", "both") == "back":
                                continue
                            rotated_el = dict(el)
                            rotated_el["rotation"] = el.get("rotation", 0)
                            if "size_mm" in el:
                                rotated_el["_size"] = el["size_mm"] * MM2PT
                            if "width_mm" in el and el["type"] == "BARCODE":
                                rotated_el["_w"] = el["width_mm"] * MM2PT
                                rotated_el["_h"] = el.get("height_mm", 10) * MM2PT
                            if "width_mm" in el and el["type"] == "SVG":
                                rotated_el["width_mm"] = el["width_mm"]
                                rotated_el["height_mm"] = el.get("height_mm", 20)
                            if el["type"] in ("TEXT", "FIXED") or el["type"].startswith("TEATRO_"):
                                rotated_el["font_size"] = el.get("font_size", 12)
                                rotated_el["font_name"] = el.get("font_name", "helv")
                            current_val = val if rotated_el.get("_num_source", 1) == 1 else val2
                            if cfg.num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = int(rotated_el.get("ticket_pos", 1))
                                N = int(cfg.ticket_qtd)
                                logic = str(cfg.ticket_logica).strip().upper()
                                Q = int(cfg.total_items)
                                current_val = cfg.seq_start + (item_index * N) + (pos - 1)
                            self._render_element(temp_page, rotated_el, 0, 0, current_val, csv_row)

                        if arte_nome:
                            nome_str = str(arte_nome).zfill(6)
                            nome_color_hex = arte_data.get("nome_color", "#000000")
                            nome_rgb = _hex_to_rgb(nome_color_hex)
                            nome_font_size = 14
                            nome_x = nome_font_size
                            import os as _os
                            _impact_candidates = [
                                "C:/Windows/Fonts/impact.ttf",
                                "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
                                "/usr/share/fonts/impact/impact.ttf",
                            ]
                            _impact_file = next((_p for _p in _impact_candidates if _os.path.exists(_p)), None)
                            _font_name_calc = "Impact" if _impact_file else "hebo"
                            _font_file_calc = _impact_file
                            try:
                                text_width = fitz.get_text_length(nome_str, fontname=_font_name_calc,
                                                                  fontsize=nome_font_size,
                                                                  fontfile=_font_file_calc)
                            except Exception:
                                text_width = len(nome_str) * nome_font_size * 0.6
                            nome_y = (cfg.item_h + text_width) / 2
                            origin = fitz.Point(nome_x, nome_y)
                            pivot  = fitz.Point(nome_x, nome_y)
                            _nome_insert_kwargs = dict(
                                fontsize=nome_font_size,
                                color=nome_rgb,
                                morph=(pivot, fitz.Matrix(math.cos(math.radians(-90)), -math.sin(math.radians(-90)),
                                                          math.sin(math.radians(-90)),  math.cos(math.radians(-90)), 0, 0))
                            )
                            if _impact_file:
                                _nome_insert_kwargs["fontname"] = "Impact"
                                _nome_insert_kwargs["fontfile"] = _impact_file
                            else:
                                _nome_insert_kwargs["fontname"] = "hebo"
                            temp_page.insert_text(origin, nome_str, **_nome_insert_kwargs)

                        _temp_bytes = temp_doc.tobytes(garbage=0, deflate=True)
                        temp_doc.close()
                        _temp_doc_m = fitz.open("pdf", _temp_bytes)
                        out_page_front.show_pdf_page(
                            fitz.Rect(cell_x0, cell_y0, cell_x1, cell_y1),
                            _temp_doc_m,
                            0,
                            keep_proportion=False,
                            rotate=cell_rotation,
                            clip=_temp_doc_m[0].rect
                        )
                        _temp_doc_m.close()

            # 2. RENDERIZAR VERSO DA FOLHA (SE DUPLEX)
            if is_duplex:
                out_page_back = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
                if cfg.rotate_page:
                    out_page_back.set_rotation(90)

                for row in range(rows):
                    for col in range(cols):
                        P = row * cols + col

                        if cfg.layout_schema == "cut_stack":
                            if cfg.cut_stack_mode == "strict":
                                stack_size = cfg.sheets_per_block * cfg.block_depth
                                set_index = S // stack_size
                                sheet_within_set = S % stack_size
                                item_index = (set_index * stack_size * poses_per_sheet) + (P * stack_size) + sheet_within_set
                            else:
                                item_index = (P * total_sheets) + S
                        elif cfg.layout_schema == "multi_artes":
                            P_col_first = col * rows + row
                            item_index = (P_col_first * total_sheets) + S
                        elif cfg.layout_schema == "sequential":
                            item_index = (S * poses_per_sheet) + P
                        elif cfg.layout_schema == "step_repeat":
                            item_index = S
                        else:
                            item_index = (S * poses_per_sheet) + P

                        if item_index >= cfg.total_items:
                            continue

                        # Para o verso, a coluna física é espelhada horizontalmente
                        col_verso = cols - 1 - col
                        
                        current_doc_base = doc_base
                        current_elements = cfg.elements
                        val = cfg.seq_start + (item_index * cfg.seq_increment)
                        val2 = val
                        arte_nome = ""
                        arte_fsize = 10
                        arte_data = {}

                        if cfg.layout_schema == "multi_artes" and item_index < len(multi_map):
                            arte_data = multi_map[item_index]
                            if arte_data["doc_base"]:
                                current_doc_base = arte_data["doc_base"]
                            current_elements = arte_data["elements"]
                            val = arte_data["val1"]
                            val2 = arte_data["val2"]
                            # arte_nome = arte_data.get("nome", "")

                        # Determinar a página base de verso no PDF de entrada
                        if cfg.layout_schema == "pdf_multiple":
                            page_idx_back = (item_index * 2 + 1) if current_doc_base and (item_index * 2 + 1) < len(current_doc_base) else None
                        else:
                            page_idx_back = 1 if current_doc_base and len(current_doc_base) >= 2 else None

                        # Posição física da célula de verso na folha final
                        cell_x0 = start_x + col_verso * (cfg.item_w + cfg.gap_h)
                        cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)
                        cell_x1 = cell_x0 + cfg.item_w
                        cell_y1 = cell_y0 + cfg.item_h

                        cell_rotation_frente = int(cfg.rotations.get(str(P), 0))
                        cell_rotation = (360 - cell_rotation_frente) % 360

                        # 1. Criar PDF temporário para renderizar o verso do item + elementos VDP
                        temp_doc = fitz.open()
                        temp_page = temp_doc.new_page(width=cfg.item_w, height=cfg.item_h)

                        if page_idx_back is not None and current_doc_base:
                            page_base_v = current_doc_base[page_idx_back]
                            base_w_verso = page_base_v.rect.width
                            base_h_verso = page_base_v.rect.height

                            # Centralizar e aplicar offset no plano da célula temporária
                            art_temp_x0 = (cfg.item_w - base_w_verso) / 2 + cfg.offset_h
                            art_temp_y0 = (cfg.item_h - base_h_verso) / 2 - cfg.offset_v
                            art_temp_x1 = art_temp_x0 + base_w_verso
                            art_temp_y1 = art_temp_y0 + base_h_verso
                            rect_art_temp = fitz.Rect(art_temp_x0, art_temp_y0, art_temp_x1, art_temp_y1)

                            # Inserir arte na página temporária
                            temp_page.show_pdf_page(rect_art_temp, current_doc_base, page_idx_back, clip=page_base_v.rect)

                        csv_row = cfg.csv_data[item_index] if cfg.csv_data else None

                        # Desenhar nome da arte no topo da célula, se houver
                        if arte_nome:
                            rect_title = fitz.Rect(0, 0, cfg.item_w, arte_fsize + 10)
                            temp_page.insert_textbox(
                                rect_title,
                                str(arte_nome),
                                fontsize=arte_fsize,
                                fontname="helv",
                                align=1, # 0=left, 1=center, 2=right
                                color=(0, 0, 0)
                            )

                        for el in current_elements:
                            # Filtrar elementos que são apenas para frente
                            if el.get("face", "both") == "front":
                                continue

                            rotated_el = dict(el)
                            rotated_el["rotation"] = el.get("rotation", 0)

                            if "size_mm" in el:
                                rotated_el["_size"] = el["size_mm"] * MM2PT
                            if "width_mm" in el and el["type"] == "BARCODE":
                                rotated_el["_w"] = el["width_mm"] * MM2PT
                                rotated_el["_h"] = el.get("height_mm", 10) * MM2PT
                            if "width_mm" in el and el["type"] == "SVG":
                                rotated_el["width_mm"] = el["width_mm"]
                                rotated_el["height_mm"] = el.get("height_mm", 20)
                            if el["type"] in ("TEXT", "FIXED") or el["type"].startswith("TEATRO_"):
                                rotated_el["font_size"] = el.get("font_size", 12)
                                rotated_el["font_name"] = el.get("font_name", "helv")

                            current_val = val if rotated_el.get("_num_source", 1) == 1 else val2

                            if cfg.num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = int(rotated_el.get("ticket_pos", 1))
                                N = int(cfg.ticket_qtd)
                                logic = str(cfg.ticket_logica).strip().upper()
                                Q = int(cfg.total_items)
                                # A regra de negócios determinou que TICKET sempre incrementa sequencialmente
                                # dentro da mesma folha, independentemente do número de folhas geradas.
                                current_val = cfg.seq_start + (item_index * N) + (pos - 1)

                            self._render_element(temp_page, rotated_el, 0, 0, current_val, csv_row)

                        # 2. Impor a pagina temporaria de verso na folha final
                        # FIX: materializar temp_doc para bytes (fix paginas em branco)
                        _temp_bytes = temp_doc.tobytes(garbage=0, deflate=True)
                        temp_doc.close()
                        _temp_doc_m = fitz.open("pdf", _temp_bytes)
                        out_page_back.show_pdf_page(
                            fitz.Rect(cell_x0, cell_y0, cell_x1, cell_y1),
                            _temp_doc_m,
                            0,
                            keep_proportion=False,
                            rotate=cell_rotation,
                            clip=_temp_doc_m[0].rect
                        )
                        _temp_doc_m.close()

        print(f"[engine] loop done elapsed={_time.monotonic()-_t0:.1f}s, saving...")
        if cfg.has_cover:
            if set_idx_current != -1 and doc_out:
                out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx_current + 1}_02_miolo.pdf")
                doc_out.save(out_name, garbage=4, deflate=True)
                self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                self._generate_contracapa(set_idx_current, cfg, doc_base)

        else:
            doc_out.save(cfg.out_pdf, garbage=4, deflate=True)
            self.generated_files.append({"type": "single", "path": cfg.out_pdf, "name": os.path.basename(cfg.out_pdf)})
        print(f"[engine] save done elapsed={_time.monotonic()-_t0:.1f}s")
        if doc_base:
            doc_base.close()
        for doc in pdf_cache.values():
            if doc:
                doc.close()
        doc_out.close()
        print(f"[engine] Gerado: {cfg.out_pdf} ({total_sheets * (2 if is_duplex else 1)} folha(s) fisicas, {cfg.total_items} itens)")

    def _generate_contracapa(self, set_idx, cfg, doc_base):

        doc_c = fitz.open()
        p = doc_c.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
        if cfg.rotate_page: p.set_rotation(90)
        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_03_contracapa.pdf")
        doc_c.save(out_name, garbage=4, deflate=True)
        doc_c.close()
        self.generated_files.append({"type": "contracapa", "path": out_name, "name": os.path.basename(out_name)})

    def _generate_capa(self, set_idx, stack_size, poses_per_sheet, cfg, doc_base, total_sheets):

        doc_c = fitz.open()
        p = doc_c.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
        if cfg.rotate_page: p.set_rotation(90)
        
        # Desenha a base dimensionada em cada célula
        start_x = (cfg.sheet_w - (cfg.cols * cfg.item_w + (cfg.cols - 1) * cfg.gap_h)) / 2
        start_y = (cfg.sheet_h - (cfg.rows * cfg.item_h + (cfg.rows - 1) * cfg.gap_v)) / 2
        
        for row in range(cfg.rows):
            for col in range(cfg.cols):
                P = row * cfg.cols + col
                cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
                cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)
                cell_x1 = cell_x0 + cfg.item_w
                cell_y1 = cell_y0 + cfg.item_h
                
                # Draw cover art (doc_base scaled)
                if doc_base:
                    page_base = doc_base[0]
                    bw = page_base.rect.width
                    bh = page_base.rect.height
                    
                    # Apply scale and offset
                    scale = cfg.cover_scale / 100.0
                    new_w = bw * scale
                    new_h = bh * scale
                    
                    off_x = cfg.cover_offset_x * 2.83465
                    off_y = cfg.cover_offset_y * 2.83465
                    
                    cx = cell_x0 + (cfg.item_w - new_w) / 2 + off_x
                    cy = cell_y0 + (cfg.item_h - new_h) / 2 - off_y
                    
                    p.show_pdf_page(
                        fitz.Rect(cx, cy, cx + new_w, cy + new_h),
                        doc_base, 0, keep_proportion=False
                    )
                
                # Text info
                if cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict":
                    i_start = (set_idx * stack_size * poses_per_sheet) + (P * stack_size)
                    i_end = min(i_start + stack_size - 1, cfg.total_items - 1)
                else:
                    i_start = P * total_sheets + (set_idx * stack_size)
                    i_end = min(i_start + stack_size - 1, cfg.total_items - 1)
                
                v_start = cfg.seq_start + (i_start * cfg.seq_increment)
                v_end = cfg.seq_start + (i_end * cfg.seq_increment)
                
                v_start_str = str(v_start).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(v_start).zfill(4)
                v_end_str = str(v_end).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(v_end).zfill(4)
                
                bloco_num = (set_idx * poses_per_sheet) + P + 1
                bloco_str = f"Bloco {bloco_num:02d}"
                sufixo_str = f" - de {v_start_str} a {v_end_str}"
                font_y = cell_y0 + (cfg.cover_font_y * 2.83465)
                
                def hex_to_rgb(h):
                    h = str(h).lstrip('#')
                    if len(h) < 6: h = "000000"
                    return tuple(int(h[i:i+2], 16)/255.0 for i in (0, 2, 4))
                
                color_rgb = hex_to_rgb(cfg.cover_font_color)
                w_bloco = fitz.get_text_length(bloco_str, fontname="hebo", fontsize=cfg.cover_font_size)
                font_x = cell_x0 + (cfg.cover_font_x * 2.83465)
                
                p.insert_text(fitz.Point(font_x, font_y), bloco_str, fontname="hebo", fontsize=cfg.cover_font_size, color=color_rgb)
                p.insert_text(fitz.Point(font_x + w_bloco, font_y), sufixo_str, fontname="helv", fontsize=cfg.cover_font_size, color=color_rgb)

        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_01_capa.pdf")
        doc_c.save(out_name, garbage=4, deflate=True)
        doc_c.close()
        self.generated_files.append({"type": "capa", "path": out_name, "name": os.path.basename(out_name)})
