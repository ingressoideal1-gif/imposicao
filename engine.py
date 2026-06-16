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
                 multi_artes: list[dict] | None = None):

        self.base_file = base_file
        self.out_pdf = out_pdf
        self.saida = saida
        self.layout_schema = layout_schema
        self.print_mode = print_mode
        self.rotate_page = rotate_page
        self.multi_artes = multi_artes or []

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
            self.total_items = math.floor((seq_end - seq_start) / seq_increment) + 1

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
        """Renderiza um elemento VDP na posição absoluta da célula."""
        el_x = cell_x0 + el["_x"]
        el_y = cell_y0 + el["_y"]
        color = el.get("color", "#000000")
        rgb = _hex_to_rgb(color)
        angle = el.get("rotation", 0)

        # Montar valor string
        if el.get("fixed", False):
            val_str = str(el.get("fixed_value", ""))
        elif el.get("source") == "database" and csv_row is not None:
            col_name = el.get("csv_column", "")
            val_str = str(csv_row.get(col_name, ""))
        else:
            pad = int(el.get("pad", 0) or 0)
            prefix = str(el.get("prefix", "") or "")
            suffix = str(el.get("suffix", "") or "")
            raw = str(val).zfill(pad) if pad > 0 else str(val)
            val_str = f"{prefix}{raw}{suffix}"

        t = el["type"]

        if t in ("TEXT", "FIXED"):
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
                # Normaliza o nome da família para comparação: "Arial" → "arial"
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
                            # Match menos restritivo: nome da família está no arquivo
                            if fam_norm in base and not found_file:
                                if bold_match and italic_match:
                                    found_file = fpath
                        if found_file:
                            break
                    if found_file:
                        break

                if found_file:
                    font_name = family  # Nome único para embutir no PDF
                    font_file = found_file
                else:
                    # Fallback para fonte embutida
                    font_name = "hebo" if is_bold else "helv"
                    font_file = None
                    print(f"[engine] Fonte '{family}' não encontrada no sistema, usando Helvetica{'Bold' if is_bold else ''}")
            else:
                font_name = font_map.get(raw_font_name, "helv")

            # Ponto de inserção Y em PyMuPDF é baseline; ajustamos pela font_size
            insert_kwargs = {
                "fontsize": font_size,
                "fontname": font_name,
                "color": rgb,
            }
            if font_file:
                insert_kwargs["fontfile"] = font_file

            if angle != 0:
                # Para rotação de texto, usamos insert_text com morph.
                # O pivot no canvas do frontend é (el_x, el_y).
                # Usamos fitz.Matrix(-angle) porque o canvas rotaciona no sentido horário,
                # e a matriz do PyMuPDF rotaciona no sentido anti-horário por padrão.
                origin = fitz.Point(el_x, el_y + font_size)
                pivot = fitz.Point(el_x, el_y)
                page.insert_text(
                    origin,
                    val_str,
                    morph=(pivot, fitz.Matrix(-angle)),
                    **insert_kwargs
                )
            else:
                page.insert_text(
                    (el_x, el_y + font_size),
                    val_str,
                    **insert_kwargs
                )


        elif t == "QR":
            size = el.get("_size", 42.5)
            qr_bytes = _generate_qr(val_str, color)
            
            py_rotate = (360 - angle) % 360
            if angle == 90:
                rect = fitz.Rect(el_x - size, el_y, el_x, el_y + size)
            elif angle == 180:
                rect = fitz.Rect(el_x - size, el_y - size, el_x, el_y)
            elif angle == 270:
                rect = fitz.Rect(el_x, el_y - size, el_x + size, el_y)
            else:
                rect = fitz.Rect(el_x, el_y, el_x + size, el_y + size)
                
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
            
            py_rotate = (360 - angle) % 360
            if angle == 90:
                rect = fitz.Rect(el_x - h_pt, el_y, el_x, el_y + w_pt)
            elif angle == 180:
                rect = fitz.Rect(el_x - w_pt, el_y - h_pt, el_x, el_y)
            elif angle == 270:
                rect = fitz.Rect(el_x, el_y - w_pt, el_x + h_pt, el_y)
            else:
                rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
                
            page.insert_image(rect, stream=bc_bytes, rotate=py_rotate, keep_proportion=False)

        elif t == "SVG":
            svg_content = el.get("svg_content") or ""
            if svg_content:
                w_pt = el.get("width_mm", 20) * MM2PT
                h_pt = el.get("height_mm", 20) * MM2PT
                
                py_rotate = (360 - angle) % 360
                if angle == 90:
                    rect = fitz.Rect(el_x - h_pt, el_y, el_x, el_y + w_pt)
                elif angle == 180:
                    rect = fitz.Rect(el_x - w_pt, el_y - h_pt, el_x, el_y)
                elif angle == 270:
                    rect = fitz.Rect(el_x, el_y - w_pt, el_x + h_pt, el_y)
                else:
                    rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
                    
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
                    
                    content_preview = pdf_content[:120] if isinstance(pdf_content, str) else f"[tipo: {type(pdf_content).__name__}]"
                    print(f"[engine] Elemento PDF: preview={content_preview!r}")
                    
                    if not isinstance(pdf_content, str) or not pdf_content.strip():
                        print(f"[engine] Elemento PDF ignorado — pdf_content inválido")
                        return
                    
                    if pdf_content.startswith("http"):
                        print(f"[engine] Baixando PDF da URL: {pdf_content[:80]}...")
                        pdf_bytes = self._get_url_bytes(pdf_content)
                        print(f"[engine] PDF baixado: {len(pdf_bytes)} bytes")
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
                        
                    py_rotate = (360 - angle) % 360
                    if angle == 90:
                        rect = fitz.Rect(el_x - h_pt, el_y, el_x, el_y + w_pt)
                    elif angle == 180:
                        rect = fitz.Rect(el_x - w_pt, el_y - h_pt, el_x, el_y)
                    elif angle == 270:
                        rect = fitz.Rect(el_x, el_y - w_pt, el_x + h_pt, el_y)
                    else:
                        rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
                        
                    page.show_pdf_page(rect, pdf_doc, 0, keep_proportion=True, rotate=py_rotate, clip=pdf_doc[0].rect)
                    pdf_doc.close()
                    print(f"[engine] Elemento PDF renderizado OK em rect={rect}")
                except Exception as ex:
                    print(f"[engine] ERRO ao impor elemento PDF: {ex}")
                    traceback.print_exc()
            else:
                print(f"[engine] Elemento PDF sem pdf_content — ignorado")


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

        total_sheets = math.ceil(cfg.total_items / poses_per_sheet)

        doc_out = fitz.open()
        doc_base = self._load_base_as_pdf()
        
        is_duplex = (cfg.print_mode == "duplex")

        # Preparar mapa de Multi-Artes
        multi_map = []
        pdf_cache = {}

        if cfg.layout_schema == "multi_artes":
            import os
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
            # 1. RENDERIZAR FRENTE DA FOLHA
            out_page_front = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
            if cfg.rotate_page:
                out_page_front.set_rotation(90)

            for row in range(rows):
                for col in range(cols):
                    P = row * cols + col

                    if cfg.layout_schema == "cut_stack":
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

                    # 1. Criar PDF temporário para renderizar o item + elementos VDP (sem rotação da célula inicialmente)
                    temp_doc = fitz.open()
                    temp_page = temp_doc.new_page(width=cfg.item_w, height=cfg.item_h)

                    # Centralizar e aplicar offset no plano da célula temporária
                    art_temp_x0 = (cfg.item_w - base_w) / 2 + cfg.offset_h
                    art_temp_y0 = (cfg.item_h - base_h) / 2 - cfg.offset_v
                    art_temp_x1 = art_temp_x0 + base_w
                    art_temp_y1 = art_temp_y0 + base_h
                    rect_art_temp = fitz.Rect(art_temp_x0, art_temp_y0, art_temp_x1, art_temp_y1)

                    # Inserir arte na página temporária
                    if current_doc_base:
                        temp_page.show_pdf_page(rect_art_temp, current_doc_base, page_idx_front, clip=page_base.rect)
                    else:
                        err_msg = f"ERR: doc_base nulo! local_path={arte_data.get('local_path')} url={arte_data.get('pdf_url')}" if cfg.layout_schema == "multi_artes" else "ERR: base_file nulo"
                        temp_page.insert_textbox(rect_art_temp, err_msg, fontsize=8, color=(1,0,0))

                    csv_row = cfg.csv_data[item_index] if cfg.csv_data else None

                    for el in current_elements:
                        # Filtrar elementos que são apenas para verso
                        if el.get("face", "both") == "back":
                            continue

                        # Mantemos a rotação configurada original do elemento, mas não a rotação da célula (que será aplicada na folha inteira)
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
                        if el["type"] in ("TEXT", "FIXED"):
                            rotated_el["font_size"] = el.get("font_size", 12)

                        current_val = val if rotated_el.get("_num_source", 1) == 1 else val2

                        if cfg.num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                            pos = rotated_el.get("ticket_pos", 1)
                            N = cfg.ticket_qtd
                            logic = cfg.ticket_logica
                            Q = cfg.total_items
                            if logic == "PILHA":
                                current_val = cfg.seq_start + ((pos - 1) * Q) + item_index
                            else:
                                current_val = cfg.seq_start + (item_index * N) + (pos - 1)

                        # Renderiza na página temporária usando coordenadas relativas diretas
                        self._render_element(temp_page, rotated_el, 0, 0, current_val, csv_row)

                    # Renderizar nome da arte (Multi-Artes) - rotacionado 90°, alinhado à esquerda, centralizado na altura
                    arte_nome = arte_data.get("nome", "") if cfg.layout_schema == "multi_artes" else ""
                    if arte_nome:
                        nome_str = str(arte_nome).zfill(6)
                        nome_color_hex = arte_data.get("nome_color", "#000000")
                        nome_rgb = _hex_to_rgb(nome_color_hex)
                        nome_font_size = 14
                        # Posição X: 0mm da lateral esquerda da célula (em pontos PDF)
                        # O texto é rotacionado -90°, então X define a distância do canto esq.
                        # Com rotação -90°: o eixo do texto vai de baixo pra cima.
                        # Para colocar a 0mm da lateral esquerda: nome_x = font_size (apenas o pivot)
                        nome_x = nome_font_size  # pivot X = altura da fonte (0mm de margem)
                        # Centralizar verticalmente: calcular largura real do texto e deslocar
                        # origin.y por metade para que o texto fique centrado na célula.
                        # Determinar fontname/fontfile antes para calcular text_length
                        import os as _os
                        _impact_candidates = [
                            "C:/Windows/Fonts/impact.ttf",               # Windows
                            "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",  # Linux msttcorefonts
                            "/usr/share/fonts/impact/impact.ttf",         # Linux alternativo
                        ]
                        _impact_file = next((_p for _p in _impact_candidates if _os.path.exists(_p)), None)
                        _font_name_calc = "Impact" if _impact_file else "hebo"
                        _font_file_calc = _impact_file  # None se não encontrou
                        # Calcular largura do texto para centralizar verticalmente
                        try:
                            text_width = fitz.get_text_length(nome_str, fontname=_font_name_calc,
                                                              fontsize=nome_font_size,
                                                              fontfile=_font_file_calc)
                        except Exception:
                            text_width = len(nome_str) * nome_font_size * 0.6  # fallback aproximado
                        nome_y = (cfg.item_h + text_width) / 2   # deslocar para baixo metade do texto
                        # origin: ponto de inserção do texto (baseline) antes da rotação
                        # pivot: ponto de rotação = mesmo ponto (gira em torno de si)
                        # Com rotação -90°, o texto vai de baixo para cima a partir de origin.
                        # Como origin.y = centro + metade_texto, o texto fica centrado.
                        origin = fitz.Point(nome_x, nome_y)
                        pivot  = fitz.Point(nome_x, nome_y)
                        # Montar kwargs para insert_text (fonte Impact 14pt)
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
                            _nome_insert_kwargs["fontname"] = "hebo"  # Helvetica Bold como fallback
                        temp_page.insert_text(origin, nome_str, **_nome_insert_kwargs)

                    # 2. Impor a pagina temporaria completa (arte + VDP) na folha final
                    # FIX: materializar temp_doc para bytes antes de usar como fonte
                    # Evita XObject encadeado que gera paginas em branco no Linux/Render
                    _temp_bytes = temp_doc.tobytes(garbage=3, deflate=True)
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
                            if el["type"] in ("TEXT", "FIXED"):
                                rotated_el["font_size"] = el.get("font_size", 12)

                            current_val = val if rotated_el.get("_num_source", 1) == 1 else val2

                            if cfg.num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = rotated_el.get("ticket_pos", 1)
                                N = cfg.ticket_qtd
                                logic = cfg.ticket_logica
                                Q = cfg.total_items
                                if logic == "PILHA":
                                    current_val = cfg.seq_start + ((pos - 1) * Q) + item_index
                                else:
                                    current_val = cfg.seq_start + (item_index * N) + (pos - 1)

                            self._render_element(temp_page, rotated_el, 0, 0, current_val, csv_row)

                        # 2. Impor a pagina temporaria de verso na folha final
                        # FIX: materializar temp_doc para bytes (fix paginas em branco)
                        _temp_bytes = temp_doc.tobytes(garbage=3, deflate=True)
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

        doc_out.save(cfg.out_pdf, garbage=3, deflate=True)
        if doc_base:
            doc_base.close()
        for doc in pdf_cache.values():
            if doc:
                doc.close()
        doc_out.close()
        print(f"[engine] Gerado: {cfg.out_pdf} ({total_sheets * (2 if is_duplex else 1)} folha(s) fisicas, {cfg.total_items} itens)")
