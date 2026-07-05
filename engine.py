import math
import os
import io
import fitz       # PyMuPDF
import qrcode
from PIL import Image

MM2PT = 2.8346   # 1mm em pontos PDF

# Fração do ascender por família de fonte (ascender / em-size).
# Usado para converter ancoragem CENTRAL (canvas textBaseline='middle')
# para a BASELINE exigida pelo PyMuPDF insert_text.
# Valores das fontes Base-14 padrão do PDF:
ASCENDER_FRACTIONS = {
    "helv": 0.718,  # Helvetica Regular
    "hebo": 0.718,  # Helvetica Bold
    "tiro": 0.683,  # Times Roman
    "tibo": 0.683,  # Times Bold
    "tiit": 0.683,  # Times Italic
    "tibi": 0.683,  # Times Bold Italic
    "cour": 0.626,  # Courier
    "cobo": 0.626,  # Courier Bold
    "cobi": 0.626,  # Courier Bold Italic
}
_ASCENDER_DEFAULT = 0.72  # valor médio para fontes do sistema (TTF/OTF)

# Fração do descender por família de fonte (|descender| / em-size).
# Necessário para calcular o offset canvas textBaseline='middle' → PDF baseline:
#   offset = (ascender - descender) / 2
# Isso corresponde ao deslocamento do centro visual até a baseline.
DESCENDER_FRACTIONS = {
    "helv": 0.207,  # Helvetica Regular
    "hebo": 0.207,  # Helvetica Bold
    "tiro": 0.217,  # Times Roman
    "tibo": 0.217,  # Times Bold
    "tiit": 0.217,  # Times Italic
    "tibi": 0.217,  # Times Bold Italic
    "cour": 0.207,  # Courier
    "cobo": 0.207,  # Courier Bold
    "cobi": 0.207,  # Courier Bold Italic
}
_DESCENDER_DEFAULT = 0.21  # valor médio para fontes do sistema (TTF/OTF)

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
                 block_depth: int = 1,
                 c_ini: int = 1,
                 q_cam: int = 0,
                 l_cam: int = 1,
                 refazer_de: int = 0,
                 refazer_ate: int = 0):

        self.base_file = base_file
        self.out_pdf = out_pdf
        self.saida = saida
        self.layout_schema = layout_schema
        self.print_mode = print_mode
        self.rotate_page = rotate_page
        self.numeracao_2 = numeracao_2
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
        # CAMAROTE: inicio do local (c_ini), quantidade de locais e lotação por local
        self.c_ini = max(1, int(c_ini) if c_ini else 1)
        self.q_cam = int(q_cam) if q_cam else 0
        self.l_cam = max(1, int(l_cam) if l_cam else 1)
        self.refazer_de = int(refazer_de) if refazer_de else 0
        self.refazer_ate = int(refazer_ate) if refazer_ate else 0
        
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
        elif layout_schema == "multi_artes" or (self.multi_artes and len(self.multi_artes) > 0):
            self.total_items = sum(int(a.get("qtd", 0)) for a in self.multi_artes)
            if self.total_items < 1: self.total_items = 1
        elif csv_data:
            self.total_items = len(csv_data)
        elif self.num_tipo == "CAMAROTE" and self.q_cam > 0:
            # CAMAROTE: total = numero de locais × lotação por local
            self.total_items = self.q_cam * self.l_cam
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
            num_print_mode = numeracao.get("print_mode")
            if not num_print_mode and "elements" in numeracao:
                meta_el = next((x for x in numeracao["elements"] if x.get("type") == "METADATA"), None)
                if meta_el:
                    num_print_mode = meta_el.get("print_mode")

            for el in numeracao["elements"]:
                if el.get("type") == "METADATA":
                    continue
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
                    if num_print_mode == "duplex":
                        e["face"] = el.get("face", "both")
                    else:
                        e["face"] = "front"
                else:
                    e["face"] = el.get("face", "both")
                e["_num_source"] = 1
                self.elements.append(e)

        # Carregar numeração 2
        if numeracao_2 and "elements" in numeracao_2:
            num_print_mode_2 = numeracao_2.get("print_mode")
            if not num_print_mode_2 and "elements" in numeracao_2:
                meta_el_2 = next((x for x in numeracao_2["elements"] if x.get("type") == "METADATA"), None)
                if meta_el_2:
                    num_print_mode_2 = meta_el_2.get("print_mode")

            for el in numeracao_2["elements"]:
                if el.get("type") == "METADATA":
                    continue
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
                    if num_print_mode_2 == "duplex":
                        e["face"] = el.get("face", "both")
                    else:
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


    def _resolve_camarote_val(self, el: dict, item_index: int, base_val: int, l_cam: int = None, c_ini: int = None, seq_start: int = None) -> int:
        """Calcula o valor correto para elementos CAMAROTE_* com base no item_index.
        
        Para CAMAROTE_LOCAL: retorna o número do local (c_ini + item_index // l_cam).
        Para CAMAROTE_PESSOA / CAMAROTE_PESSOA_TOTAL: retorna o número da pessoa (item_index % l_cam + 1).
        Também injeta _l_cam no el para uso em CAMAROTE_PESSOA_TOTAL.
        """
        t = el.get("type", "")
        if not t.startswith("CAMAROTE_"):
            return base_val
        cfg = self.cfg
        
        actual_l_cam = l_cam if l_cam is not None else (cfg.l_cam if hasattr(cfg, "l_cam") else 1)
        if actual_l_cam < 1: actual_l_cam = 1
        
        el["_l_cam"] = actual_l_cam
        if t == "CAMAROTE_LOCAL":
            actual_c_ini = c_ini if c_ini is not None else (cfg.c_ini if hasattr(cfg, "c_ini") else 1)
            return actual_c_ini + (item_index // actual_l_cam)
        else:  # CAMAROTE_PESSOA ou CAMAROTE_PESSOA_TOTAL
            return (item_index % actual_l_cam) + 1

    def _get_camarote_params(self, item_index: int, multi_map: list = None):
        """Retorna (local_idx, l_cam, c_ini, start_base) para o item_index, suportando multi_artes."""
        if multi_map and item_index < len(multi_map):
            arte_data = multi_map[item_index]
            return arte_data.get("local_idx", item_index), arte_data.get("l_cam"), arte_data.get("c_ini"), arte_data.get("start_base")
        return item_index, None, None, None

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
        elif t == "CAMAROTE_LOCAL":
            # val já foi calculado no loop principal como local_num
            prefix = str(el.get("prefix", "") or "")
            val_str = f"{prefix}{val}"
        elif t == "CAMAROTE_PESSOA":
            # val já foi calculado no loop principal como pessoa_num
            prefix = str(el.get("prefix", "") or "")
            val_str = f"{prefix}{val}"
        elif t == "CAMAROTE_PESSOA_TOTAL":
            # val = pessoa_num, _l_cam = lotacao por local
            prefix = str(el.get("prefix", "") or "")
            l_cam = el.get("_l_cam", 1)
            val_str = f"{prefix}{val}/{l_cam}"
        else:
            pad = int(el.get("pad", 0) or 0)
            prefix = str(el.get("prefix", "") or "")
            suffix = str(el.get("suffix", "") or "")
            raw = str(val).zfill(pad) if pad > 0 else str(val)
            val_str = f"{prefix}{raw}{suffix}"


        if t in ("TEXT", "FIXED") or t.startswith("TEATRO_") or t.startswith("CAMAROTE_"):
            font_size = float(el.get("font_size", 12))
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
                    os.path.expanduser("~/AppData/Local/Microsoft/Windows/Fonts"),
                    "/usr/share/fonts",
                    "/System/Library/Fonts",
                    os.path.expanduser("~/Library/Fonts"),
                ]
                family_lower = family.lower().replace(" ", "")
                found_file = None
                for fdir in font_dirs:
                    if not os.path.isdir(fdir):
                        continue
                    # Busca recursiva para incluir subdiretórios
                    for ext in ("**/*.ttf", "**/*.otf", "**/*.TTF", "**/*.OTF"):
                        for fpath in _glob.glob(os.path.join(fdir, ext), recursive=True):
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
                    print(f"[engine] Fonte do sistema encontrada: '{family}' -> {found_file}")
                elif el.get("_font_data"):
                    # Fonte embutida no payload (base64) - usar arquivo temporário
                    import base64, tempfile
                    try:
                        font_bytes = base64.b64decode(el["_font_data"])
                        tmp_font = tempfile.NamedTemporaryFile(delete=False, suffix=".ttf")
                        tmp_font.write(font_bytes)
                        tmp_font.close()
                        font_name = family
                        font_file = tmp_font.name
                        print(f"[engine] Fonte embutida usada: '{family}' ({len(el['_font_data'])} chars b64)")
                    except Exception as ex:
                        print(f"[engine] Erro ao usar fonte embutida '{family}': {ex}")
                        font_name = "hebo" if is_bold else "helv"
                        font_file = None
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

            # Ancoragem central: cx, cy = centro visual do texto (replica textBaseline='middle' do canvas)
            # PyMuPDF insert_text usa a BASELINE como ponto de inserção — NÃO o centro visual.
            #
            # Raciocínio geométrico:
            #   - Em canvas: fillText(label, 0, 0) com textBaseline='middle' coloca o CENTRO
            #     visual do texto em y=0 (o ponto cy do elemento).
            #   - A baseline do texto fica ABAIXO do centro em: (asc - desc)/2 * font_size
            #   - Em PyMuPDF: insert_text recebe a BASELINE como origin_y.
            #
            # Para cada linha i de um bloco multilinha centrado em cy:
            #   cy_linha_i = block_top + i*line_height + line_height/2  (centro da linha)
            #   baseline_i = cy_linha_i + (asc - desc)/2 * font_size
            #
            # line_height = 1.2 x font_size (CSS/canvas default, identico ao canvas JS)

            lines_to_draw = val_str.split("\n")
            line_height = font_size * 1.2  # mesmo valor usado no canvas JS

            # Frações de ascender e descender para o offset correto de baseline
            if font_file:
                asc  = _ASCENDER_DEFAULT
                desc = _DESCENDER_DEFAULT
            else:
                asc  = ASCENDER_FRACTIONS.get(font_name,  _ASCENDER_DEFAULT)
                desc = DESCENDER_FRACTIONS.get(font_name, _DESCENDER_DEFAULT)

            # Offset do centro visual até a baseline (replicando textBaseline='middle')
            # Em canvas: baseline = y_center + (asc - desc)/2 * font_size
            baseline_offset = (asc - desc) / 2.0 * font_size

            # Altura total do bloco e topo do bloco (alinhado ao centro cy)
            total_height = len(lines_to_draw) * line_height
            block_top = cy - total_height / 2.0

            for i, line_str in enumerate(lines_to_draw):
                if font_file:
                    text_width = font_size * 0.55 * len(line_str)
                else:
                    text_width = fitz.get_text_length(line_str, fontname=font_name, fontsize=font_size)

                origin_x = cx - text_width / 2.0

                # Centro visual da linha i
                cy_line = block_top + (i * line_height) + (line_height / 2.0)
                # Baseline = centro visual + offset (textBaseline='middle' → PDF baseline)
                origin_y = cy_line + baseline_offset

                if angle != 0:
                    # O pivot de rotaçao e o centro do bloco de texto (cx, cy)
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
            if cfg.layout_schema == "cut_stack":
                stack_size = cfg.sheets_per_block * cfg.block_depth
            else:
                stack_size = total_sheets
        else:
            stack_size = total_sheets
            
        set_idx_current = -1
        
        is_duplex = (cfg.print_mode == "duplex")
        if cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0):
            if any(art.get("pdf_verso_url") for art in cfg.multi_artes):
                is_duplex = True

        # Preparar mapa de Multi-Artes
        multi_map = []
        pdf_cache = {}

        is_strict_assembly = (cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict_assembly")
        if cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0) or is_strict_assembly:

            if cfg.multi_artes and len(cfg.multi_artes) > 0:
                sorted_artes = sorted(cfg.multi_artes, key=lambda a: int(a.get("qtd", 0)), reverse=True)
            else:
                sorted_artes = [{
                    "qtd": cfg.total_items,
                    "numeracao": {
                        "start": cfg.seq_start,
                        "elements": cfg.elements,
                        "print_mode": cfg.print_mode
                    },
                    "numeracao_2": cfg.numeracao_2,
                    "pdf_url": None,
                    "pdf_verso_url": None,
                    "local_path": None
                }]
            
            def parse_elements(num_obj, source_id):
                els = []
                if num_obj and "elements" in num_obj:
                    num_print_mode = num_obj.get("print_mode")
                    if not num_print_mode and "elements" in num_obj:
                        meta_el = next((x for x in num_obj["elements"] if x.get("type") == "METADATA"), None)
                        if meta_el:
                            num_print_mode = meta_el.get("print_mode")

                    for el in num_obj["elements"]:
                        if el.get("type") == "METADATA":
                            continue
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
                            if num_print_mode == "duplex":
                                e["face"] = el.get("face", "both")
                            else:
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

            for model_idx, art in enumerate(sorted_artes):
                qtd = int(art.get("qtd", 0))
                num1_obj = art.get("numeracao")
                num2_obj = art.get("numeracao_2")
                
                n1 = int(num1_obj.get("start", 1)) if num1_obj else 1
                n2 = int(num2_obj.get("start", 1)) if num2_obj else 1
                
                els1 = parse_elements(num1_obj, 1)
                els2 = parse_elements(num2_obj, 2)
                art_els = els1 + els2
                
                pdf_url = art.get("pdf_url")
                pdf_verso_url = art.get("pdf_verso_url")
                local_path = art.get("local_path")
                art_doc = None
                
                try:
                    if not cfg.multi_artes and doc_base:
                        art_doc = doc_base
                    elif local_path and os.path.exists(local_path):
                        art_doc = _load_art_as_pdf(local_path, is_url=False)
                    elif pdf_url:
                        art_doc = _load_art_as_pdf(pdf_url, is_url=True)
                        if pdf_verso_url and art_doc:
                            if len(art_doc) < 2:
                                verso_doc = _load_art_as_pdf(pdf_verso_url, is_url=True)
                                if verso_doc:
                                    art_doc.insert_pdf(verso_doc)
                except Exception as ex:
                    print(f"[multi_artes] Erro ao preparar arte: {ex}")

                for i in range(qtd):
                    multi_map.append({
                        "doc_base": art_doc,
                        "elements": art_els,
                        "val1": n1 + i,
                        "val2": n2 + i,
                        "local_idx": i,
                        "global_idx": len(multi_map),
                        "local_path": local_path,
                        "pdf_url": pdf_url,
                        "nome": art.get("nome", ""),
                        "nome_color": art.get("nome_color", "#000000"),
                        "model_idx": model_idx,
                        "start_base": n1,
                        "l_cam": int(art.get("l_cam", cfg.l_cam if hasattr(cfg, "l_cam") else 1)),
                        "q_cam": int(art.get("q_cam", cfg.q_cam if hasattr(cfg, "q_cam") else 0))
                    })

        if is_strict_assembly:
            # 1. Agrupar itens do multi_map por modelo
            models_items = []
            curr_idx = 0
            for art in sorted_artes:
                qtd = int(art.get("qtd", 0))
                models_items.append(multi_map[curr_idx : curr_idx + qtd])
                curr_idx += qtd
                
            stack_size = cfg.sheets_per_block  # Itens por bloco (ex: 50)
            
            # 2. Dividir cada modelo em blocos completos de stack_size
            complete_blocks = []  # lista de (model_idx, [itens do bloco])
            leftovers_by_model = [[] for _ in sorted_artes]
            
            for j, items in enumerate(models_items):
                num_blocks = len(items) // stack_size
                for b in range(num_blocks):
                    block = items[b * stack_size : (b + 1) * stack_size]
                    complete_blocks.append((j, block))
                leftovers_by_model[j] = items[num_blocks * stack_size :]
                
            total_blocks = len(complete_blocks)
            print(f"[engine] strict_assembly: total_blocks={total_blocks} poses_per_sheet={poses_per_sheet} stack_size={stack_size}")
            
            set_definitions = []
            
            # 3. Empacotar blocos em sets com profundidade de corte
            # Cada set tem poses_per_sheet células, cada célula empilha 'depth' blocos
            # Um set completo precisa de poses_per_sheet blocos no mínimo
            if total_blocks >= poses_per_sheet:
                # Calcular a profundidade máxima possível para sets estritos
                # Usar todos os blocos completos distribuídos em sets
                blocks_used = 0
                while blocks_used + poses_per_sheet <= total_blocks:
                    # Quantos blocos restam
                    blocks_remaining = total_blocks - blocks_used
                    # Profundidade deste set = quantos "layers" de poses_per_sheet cabem
                    depth = blocks_remaining // poses_per_sheet
                    if depth < 1:
                        break
                    
                    num_blocks_in_set = depth * poses_per_sheet
                    set_blocks = complete_blocks[blocks_used : blocks_used + num_blocks_in_set]
                    
                    # Distribuir blocos nas células com profundidade
                    # Célula 0: blocos [0, 1, ..., depth-1]
                    # Célula 1: blocos [depth, depth+1, ..., 2*depth-1]
                    # etc.
                    cell_allocations = []
                    for P in range(poses_per_sheet):
                        cell_items = []
                        for d in range(depth):
                            block_idx = P * depth + d
                            if block_idx < len(set_blocks):
                                _, block_data = set_blocks[block_idx]
                                cell_items.extend(block_data)
                        cell_allocations.append(cell_items)
                    
                    set_definitions.append({
                        "type": "strict",
                        "num_sheets": stack_size * depth,  # Folhas = blocos empilhados × tamanho do bloco
                        "cell_allocations": cell_allocations,
                        "model_idx": None,
                        "depth": depth
                    })
                    blocks_used += num_blocks_in_set
                    break  # Um set estrito consome todos os blocos possíveis
                    
                # Devolver blocos restantes para leftovers
                remaining_blocks = complete_blocks[blocks_used:]
                for model_idx, block_items in remaining_blocks:
                    leftovers_by_model[model_idx].extend(block_items)
            
            # Ordenar as sobras de cada modelo pelo local_idx para manter a numeração sequencial
            for j in range(len(leftovers_by_model)):
                leftovers_by_model[j] = sorted(leftovers_by_model[j], key=lambda x: x["local_idx"])
                
            # 4. Criar sets de montagem individuais por modelo (sobras)
            for j, leftovers in enumerate(leftovers_by_model):
                if len(leftovers) > 0:
                    num_sheets = math.ceil(len(leftovers) / poses_per_sheet)
                    cell_allocations = [None] * poses_per_sheet
                    for P in range(poses_per_sheet):
                        cell_items = leftovers[P * num_sheets : (P + 1) * num_sheets]
                        if len(cell_items) < num_sheets:
                            cell_items = cell_items + [None] * (num_sheets - len(cell_items))
                        cell_allocations[P] = cell_items
                    set_definitions.append({
                        "type": "assembly",
                        "num_sheets": num_sheets,
                        "cell_allocations": cell_allocations,
                        "model_idx": j,
                        "depth": 1
                    })

            # Executar o loop usando set_definitions
            total_sheets = sum(s["num_sheets"] for s in set_definitions)
            print(f"[engine] strict_assembly: total_sheets={total_sheets} partitioned into {len(set_definitions)} sets")
            
            for set_idx, set_def in enumerate(set_definitions):
                depth = set_def.get("depth", 1)
                stack_size = cfg.sheets_per_block
                
                for layer_idx in range(depth):
                    doc_out = fitz.open()
                    
                    # 1. Gerar capa para o layer (chunk)
                    if cfg.has_cover:
                        self._generate_capa_for_chunk(set_idx, layer_idx, set_def, cfg, multi_map)
                    
                    # 2. Gerar miolo para o layer
                    start_sheet = layer_idx * stack_size
                    end_sheet = min((layer_idx + 1) * stack_size, set_def["num_sheets"])
                    
                    for sheet_within_set in range(start_sheet, end_sheet):
                        # Frente
                        out_page_front = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
                        if cfg.rotate_page:
                            out_page_front.set_rotation(90)
                            
                        for row in range(rows):
                            for col in range(cols):
                                P = row * cols + col
                                item_data = set_def["cell_allocations"][P][sheet_within_set]
                                if item_data is not None:
                                    self._render_item_front(out_page_front, item_data, row, col, cfg, start_x, start_y)
                                    
                        # Verso (se for duplex)
                        if is_duplex:
                            out_page_back = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
                            if cfg.rotate_page:
                                out_page_back.set_rotation(90)
                                
                            for row in range(rows):
                                for col in range(cols):
                                    col_verso = cols - 1 - col
                                    P_frente = row * cols + col_verso
                                    item_data = set_def["cell_allocations"][P_frente][sheet_within_set]
                                    if item_data is not None:
                                        self._render_item_back(out_page_back, item_data, row, col, cfg, start_x, start_y)
                                        
                    # 3. Salvar miolo para o layer
                    out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_{layer_idx + 1:02d}_02_miolo.pdf")
                    doc_out.save(out_name, garbage=4, deflate=True)
                    doc_out.close()
                    self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                    
                    # 4. Gerar contracapa para o layer
                    if cfg.has_cover:
                        self._generate_contracapa_for_chunk(set_idx, layer_idx, set_def, cfg)
                    
            # Fechar recursos
            if doc_base:
                doc_base.close()
            for doc in pdf_cache.values():
                if doc:
                    doc.close()
            print(f"[engine] strict_assembly: Gerado com sucesso.")
            return

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
                    self._generate_capa(set_idx, stack_size, poses_per_sheet, cfg, doc_base, total_sheets, multi_map)
                
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
                            full_sets = total_sheets // stack_size
                            set_index = S // stack_size
                            sheet_within_set = S % stack_size
                            item_index = ((P * full_sets) + set_index) * stack_size + sheet_within_set
                        elif cfg.cut_stack_mode == "strict_assembly":
                            stack_size = cfg.sheets_per_block * cfg.block_depth
                            full_sets = total_sheets // stack_size
                            if S < full_sets * stack_size:
                                set_index = S // stack_size
                                sheet_within_set = S % stack_size
                                item_index = ((P * full_sets) + set_index) * stack_size + sheet_within_set
                            else:
                                S_asm = S - (full_sets * stack_size)
                                asm_sheets = total_sheets - (full_sets * stack_size)
                                base_index = full_sets * stack_size * poses_per_sheet
                                item_index = base_index + (P * asm_sheets) + S_asm
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

                    if (cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0)) and item_index < len(multi_map):
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
                    arte_nome = arte_data.get("nome", "")

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
                            if el["type"] in ("TEXT", "FIXED") or el["type"].startswith("TEATRO_") or el["type"].startswith("CAMAROTE_"):
                                rotated_el["font_size"] = el.get("font_size", 12)
                                rotated_el["font_name"] = el.get("font_name", "helv")
                            current_val = val if rotated_el.get("_num_source", 1) == 1 else val2
                            if cfg.num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = int(rotated_el.get("ticket_pos", 1))
                                N = int(cfg.ticket_qtd)
                                current_val = cfg.seq_start + (item_index * N) + (pos - 1)
                            if cfg.num_tipo == "CAMAROTE" and rotated_el["type"].startswith("CAMAROTE_"):
                                c_idx, c_l_cam, c_c_ini, c_start = self._get_camarote_params(item_index, multi_map if (cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0)) else None)
                                current_val = self._resolve_camarote_val(rotated_el, c_idx, current_val, c_l_cam, c_c_ini, c_start)
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
                            if el["type"] in ("TEXT", "FIXED") or el["type"].startswith("TEATRO_") or el["type"].startswith("CAMAROTE_"):
                                rotated_el["font_size"] = el.get("font_size", 12)
                                rotated_el["font_name"] = el.get("font_name", "helv")
                            current_val = val if rotated_el.get("_num_source", 1) == 1 else val2
                            if cfg.num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = int(rotated_el.get("ticket_pos", 1))
                                N = int(cfg.ticket_qtd)
                                logic = str(cfg.ticket_logica).strip().upper()
                                Q = int(cfg.total_items)
                                current_val = cfg.seq_start + (item_index * N) + (pos - 1)
                            if cfg.num_tipo == "CAMAROTE" and rotated_el["type"].startswith("CAMAROTE_"):
                                c_idx, c_l_cam, c_c_ini, c_start = self._get_camarote_params(item_index, multi_map if (cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0)) else None)
                                current_val = self._resolve_camarote_val(rotated_el, c_idx, current_val, c_l_cam, c_c_ini, c_start)
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

                        if (cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0)) and item_index < len(multi_map):
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
                            # Filtrar elementos que são apenas para frente (exceto PICOTE)
                            if el.get("face", "both") == "front" and el.get("type") != "PICOTE":
                                continue

                            rotated_el = dict(el)
                            if el.get("type") == "PICOTE":
                                # Refletir X no verso
                                width_mm = cfg.item_w / MM2PT
                                rotated_el["x_mm"] = width_mm - el.get("x_mm", 0)
                                rotated_el["_x"] = rotated_el["x_mm"] * MM2PT

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
        
        self._apply_refazer_filter()
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

    def _generate_capa(self, set_idx, stack_size, poses_per_sheet, cfg, doc_base, total_sheets, multi_map=None):

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
                
                is_montagem = False
                i_start = 0
                i_end = 0
                bloco_num = 0
                
                # Text info and logic
                if cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict":
                    full_sets = total_sheets // stack_size
                    bloco_num = (P * full_sets) + set_idx + 1
                    i_start = (bloco_num - 1) * stack_size
                    i_end = min(i_start + stack_size - 1, cfg.total_items - 1)
                elif cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict_assembly":
                    full_sets = total_sheets // stack_size
                    if set_idx < full_sets:
                        bloco_num = (P * full_sets) + set_idx + 1
                        i_start = (bloco_num - 1) * stack_size
                        i_end = min(i_start + stack_size - 1, cfg.total_items - 1)
                    else:
                        asm_sheets = total_sheets - (full_sets * stack_size)
                        base_index = full_sets * stack_size * poses_per_sheet
                        i_start = base_index + (P * asm_sheets)
                        i_end = min(i_start + stack_size - 1, cfg.total_items - 1)
                        bloco_num = (i_start // stack_size) + 1
                        if i_start % stack_size != 0:
                            is_montagem = True
                else:
                    i_start = P * total_sheets + (set_idx * stack_size)
                    i_end = min(i_start + stack_size - 1, cfg.total_items - 1)
                    if cfg.layout_schema == "cut_stack":
                        import math
                        sets_per_cell = math.ceil(total_sheets / stack_size)
                        bloco_num = (P * sets_per_cell) + set_idx + 1
                    else:
                        bloco_num = (set_idx * poses_per_sheet) + P + 1

                if i_start >= cfg.total_items:
                    continue
                
                if is_montagem:
                    font_size = 50
                    text = "MONTAGEM"
                    w_text = fitz.get_text_length(text, fontname="hebo", fontsize=font_size)
                    cx = cell_x0 + (cfg.item_w - w_text) / 2
                    cy = cell_y0 + (cfg.item_h / 2) + (font_size / 3)
                    p.insert_text(fitz.Point(cx, cy), text, fontname="hebo", fontsize=font_size, color=(0,0,0))
                    continue
                    
                current_doc_base = doc_base
                v_start = cfg.seq_start + (i_start * cfg.seq_increment)
                v_end = cfg.seq_start + (i_end * cfg.seq_increment)
                
                if (cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0)) and multi_map:
                    if i_start < len(multi_map):
                        arte_data_start = multi_map[i_start]
                        if arte_data_start["doc_base"]:
                            current_doc_base = arte_data_start["doc_base"]
                        v_start = arte_data_start["val1"]
                        bloco_num = (arte_data_start["local_idx"] // stack_size) + 1
                        
                        if i_end < len(multi_map):
                            v_end = multi_map[i_end]["val1"]
                        else:
                            v_end = multi_map[-1]["val1"]

                # Draw cover art (current_doc_base scaled)
                if current_doc_base:
                    page_base = current_doc_base[0]
                    bw = page_base.rect.width
                    bh = page_base.rect.height
                    
                    # Apply scale and offset
                    scale = cfg.cover_scale / 100.0
                    if scale <= 0.05:
                        scale = 0.8
                    new_w = bw * scale
                    new_h = bh * scale
                    
                    off_x = cfg.cover_offset_x * 2.83465
                    off_y = cfg.cover_offset_y * 2.83465
                    
                    cx = cell_x0 + (cfg.item_w - new_w) / 2 + off_x
                    cy = cell_y0 + (cfg.item_h - new_h) / 2 - off_y
                    
                    p.show_pdf_page(
                        fitz.Rect(cx, cy, cx + new_w, cy + new_h),
                        current_doc_base, 0, keep_proportion=False, clip=page_base.rect
                    )
                
                v_start_str = str(v_start).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(v_start).zfill(4)
                v_end_str = str(v_end).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(v_end).zfill(4)
                
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

    def _render_item_front(self, out_page_front, item_data, row, col, cfg, start_x, start_y):
        P = row * cfg.cols + col
        cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
        cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)
        cell_x1 = cell_x0 + cfg.item_w
        cell_y1 = cell_y0 + cfg.item_h

        cell_rotation = int(cfg.rotations.get(str(P), 0))
        arte_nome = item_data.get("nome", "")

        current_doc_base = item_data["doc_base"]
        current_elements = item_data["elements"]
        val = item_data["val1"]
        val2 = item_data["val2"]
        local_idx = item_data["local_idx"]

        if cfg.layout_schema == "pdf_multiple":
            page_idx_front = local_idx * 2 if current_doc_base and (local_idx * 2) < len(current_doc_base) else 0
        else:
            page_idx_front = 0

        if current_doc_base:
            page_base_f = current_doc_base[page_idx_front]
            base_w_frente = page_base_f.rect.width
            base_h_frente = page_base_f.rect.height
        else:
            base_w_frente = cfg.item_w
            base_h_frente = cfg.item_h

        global_idx = item_data.get("global_idx", 0)
        csv_row = cfg.csv_data[global_idx] if (cfg.csv_data and global_idx < len(cfg.csv_data)) else None

        if cell_rotation == 0 and not arte_nome:
            if current_doc_base:
                art_out_x0 = cell_x0 + (cfg.item_w - base_w_frente) / 2 + cfg.offset_h
                art_out_y0 = cell_y0 + (cfg.item_h - base_h_frente) / 2 - cfg.offset_v
                out_page_front.show_pdf_page(
                    fitz.Rect(art_out_x0, art_out_y0, art_out_x0 + base_w_frente, art_out_y0 + base_h_frente),
                    current_doc_base, page_idx_front,
                    keep_proportion=False, clip=page_base_f.rect
                )
            for el in current_elements:
                if el.get("face", "both") == "back":
                    continue
                current_val = val2 if el.get("_num_source", 1) == 2 else val
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
                if el["type"] in ("TEXT", "FIXED") or el["type"].startswith("TEATRO_") or el["type"].startswith("CAMAROTE_"):
                    rotated_el["font_size"] = el.get("font_size", 12)
                    rotated_el["font_name"] = el.get("font_name", "helv")
                if cfg.num_tipo == "CAMAROTE" and el["type"].startswith("CAMAROTE_"):
                    c_idx = item_data.get("local_idx", 0)
                    c_l_cam = item_data.get("l_cam")
                    c_c_ini = item_data.get("c_ini")
                    c_start = item_data.get("start_base")
                    current_val = self._resolve_camarote_val(rotated_el, c_idx, current_val, c_l_cam, c_c_ini, c_start)
                self._render_element(out_page_front, rotated_el, cell_x0, cell_y0, current_val, csv_row)
        else:
            temp_doc = fitz.open()
            temp_page = temp_doc.new_page(width=cfg.item_w, height=cfg.item_h)

            if current_doc_base:
                art_temp_x0 = (cfg.item_w - base_w_frente) / 2 + cfg.offset_h
                art_temp_y0 = (cfg.item_h - base_h_frente) / 2 - cfg.offset_v
                art_temp_x1 = art_temp_x0 + base_w_frente
                art_temp_y1 = art_temp_y0 + base_h_frente
                rect_art_temp = fitz.Rect(art_temp_x0, art_temp_y0, art_temp_x1, art_temp_y1)
                temp_page.show_pdf_page(rect_art_temp, current_doc_base, page_idx_front, clip=page_base_f.rect)

            for el in current_elements:
                if el.get("face", "both") == "back":
                    continue
                current_val = val2 if el.get("_num_source", 1) == 2 else val
                rotated_el = dict(el)
                if cell_rotation > 0:
                    rotated_el = rotate_element_coords(el, cell_rotation, cfg.item_w, cfg.item_h)
                if cfg.num_tipo == "CAMAROTE" and el["type"].startswith("CAMAROTE_"):
                    c_idx = item_data.get("local_idx", 0)
                    c_l_cam = item_data.get("l_cam")
                    c_c_ini = item_data.get("c_ini")
                    c_start = item_data.get("start_base")
                    current_val = self._resolve_camarote_val(rotated_el, c_idx, current_val, c_l_cam, c_c_ini, c_start)
                self._render_element(temp_page, rotated_el, 0, 0, current_val, csv_row)

            if arte_nome:
                nome_str = str(arte_nome).zfill(6)
                nome_color_hex = item_data.get("nome_color", "#000000")
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
                    text_width = fitz.get_text_length(nome_str, fontname=_font_name_calc, fontsize=nome_font_size, fontfile=_font_file_calc)
                except Exception:
                    text_width = len(nome_str) * nome_font_size * 0.6
                nome_y = (cfg.item_h + text_width) / 2
                pivot = fitz.Point(nome_x, nome_y)
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
                temp_page.insert_text(pivot, nome_str, **_nome_insert_kwargs)

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

    def _render_item_back(self, out_page_back, item_data, row, col, cfg, start_x, start_y):
        col_verso = cfg.cols - 1 - col
        P = row * cfg.cols + col_verso
        cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
        cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)
        cell_x1 = cell_x0 + cfg.item_w
        cell_y1 = cell_y0 + cfg.item_h

        cell_rotation_frente = int(cfg.rotations.get(str(P), 0))
        cell_rotation = (360 - cell_rotation_frente) % 360
        arte_nome = item_data.get("nome", "")

        current_doc_base = item_data["doc_base"]
        current_elements = item_data["elements"]
        val = item_data["val1"]
        val2 = item_data["val2"]
        local_idx = item_data["local_idx"]

        if cfg.layout_schema == "pdf_multiple":
            page_idx_back = (local_idx * 2 + 1) if current_doc_base and (local_idx * 2 + 1) < len(current_doc_base) else None
        else:
            page_idx_back = 1 if current_doc_base and len(current_doc_base) >= 2 else None

        if page_idx_back is not None and current_doc_base:
            page_base_v = current_doc_base[page_idx_back]
            base_w_verso = page_base_v.rect.width
            base_h_verso = page_base_v.rect.height
        else:
            base_w_verso = cfg.item_w
            base_h_verso = cfg.item_h

        global_idx = item_data.get("global_idx", 0)
        csv_row = cfg.csv_data[global_idx] if (cfg.csv_data and global_idx < len(cfg.csv_data)) else None

        if cell_rotation == 0 and not arte_nome:
            if page_idx_back is not None and current_doc_base:
                art_out_x0 = cell_x0 + (cfg.item_w - base_w_verso) / 2 + cfg.offset_h
                art_out_y0 = cell_y0 + (cfg.item_h - base_h_verso) / 2 - cfg.offset_v
                out_page_back.show_pdf_page(
                    fitz.Rect(art_out_x0, art_out_y0, art_out_x0 + base_w_verso, art_out_y0 + base_h_verso),
                    current_doc_base, page_idx_back,
                    keep_proportion=False, clip=page_base_v.rect
                )
            for el in current_elements:
                if el.get("face", "both") == "front":
                    continue
                current_val = val2 if el.get("_num_source", 1) == 2 else val
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
                if el["type"] in ("TEXT", "FIXED") or el["type"].startswith("TEATRO_") or el["type"].startswith("CAMAROTE_"):
                    rotated_el["font_size"] = el.get("font_size", 12)
                    rotated_el["font_name"] = el.get("font_name", "helv")
                if cfg.num_tipo == "CAMAROTE" and el["type"].startswith("CAMAROTE_"):
                    c_idx = item_data.get("local_idx", 0)
                    c_l_cam = item_data.get("l_cam")
                    c_c_ini = item_data.get("c_ini")
                    c_start = item_data.get("start_base")
                    current_val = self._resolve_camarote_val(rotated_el, c_idx, current_val, c_l_cam, c_c_ini, c_start)
                self._render_element(out_page_back, rotated_el, cell_x0, cell_y0, current_val, csv_row)
        else:
            temp_doc = fitz.open()
            temp_page = temp_doc.new_page(width=cfg.item_w, height=cfg.item_h)

            if page_idx_back is not None and current_doc_base:
                art_temp_x0 = (cfg.item_w - base_w_verso) / 2 + cfg.offset_h
                art_temp_y0 = (cfg.item_h - base_h_verso) / 2 - cfg.offset_v
                art_temp_x1 = art_temp_x0 + base_w_verso
                art_temp_y1 = art_temp_y0 + base_h_verso
                rect_art_temp = fitz.Rect(art_temp_x0, art_temp_y0, art_temp_x1, art_temp_y1)
                temp_page.show_pdf_page(rect_art_temp, current_doc_base, page_idx_back, clip=page_base_v.rect)

            for el in current_elements:
                if el.get("face", "both") == "front":
                    continue
                current_val = val2 if el.get("_num_source", 1) == 2 else val
                rotated_el = dict(el)
                if cell_rotation > 0:
                    rotated_el = rotate_element_coords(el, cell_rotation, cfg.item_w, cfg.item_h)
                if cfg.num_tipo == "CAMAROTE" and el["type"].startswith("CAMAROTE_"):
                    c_idx = item_data.get("local_idx", 0)
                    c_l_cam = item_data.get("l_cam")
                    c_c_ini = item_data.get("c_ini")
                    c_start = item_data.get("start_base")
                    current_val = self._resolve_camarote_val(rotated_el, c_idx, current_val, c_l_cam, c_c_ini, c_start)
                self._render_element(temp_page, rotated_el, 0, 0, current_val, csv_row)

            if arte_nome:
                nome_str = str(arte_nome).zfill(6)
                nome_color_hex = item_data.get("nome_color", "#000000")
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
                    text_width = fitz.get_text_length(nome_str, fontname=_font_name_calc, fontsize=nome_font_size, fontfile=_font_file_calc)
                except Exception:
                    text_width = len(nome_str) * nome_font_size * 0.6
                nome_y = (cfg.item_h + text_width) / 2
                pivot = fitz.Point(nome_x, nome_y)
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
                temp_page.insert_text(pivot, nome_str, **_nome_insert_kwargs)

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

    def _generate_contracapa_for_chunk(self, set_idx, layer_idx, set_def, cfg):
        doc_c = fitz.open()
        p = doc_c.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
        if cfg.rotate_page:
            p.set_rotation(90)
        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_{layer_idx + 1:02d}_03_contracapa.pdf")
        doc_c.save(out_name, garbage=4, deflate=True)
        doc_c.close()
        self.generated_files.append({"type": "contracapa", "path": out_name, "name": os.path.basename(out_name)})

    def _generate_capa_for_chunk(self, set_idx, layer_idx, set_def, cfg, multi_map):
        doc_c = fitz.open()
        p = doc_c.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
        if cfg.rotate_page:
            p.set_rotation(90)

        start_x = (cfg.sheet_w - (cfg.cols * cfg.item_w + (cfg.cols - 1) * cfg.gap_h)) / 2
        start_y = (cfg.sheet_h - (cfg.rows * cfg.item_h + (cfg.rows - 1) * cfg.gap_v)) / 2

        stack_size = cfg.sheets_per_block

        for row in range(cfg.rows):
            for col in range(cfg.cols):
                P = row * cfg.cols + col
                cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
                cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)
                cell_x1 = cell_x0 + cfg.item_w
                cell_y1 = cell_y0 + cfg.item_h

                cell_items = set_def["cell_allocations"][P]
                # Pegar apenas os items da camada atual
                layer_items = cell_items[layer_idx * stack_size : (layer_idx + 1) * stack_size]
                valid_items = [item for item in layer_items if item is not None]
                if not valid_items:
                    continue

                item_start = valid_items[0]
                item_end = valid_items[-1]

                is_montagem_cell = (set_def["type"] == "assembly" and (item_start["local_idx"] % stack_size != 0))

                if is_montagem_cell:
                    font_size = 50
                    text = "MONTAGEM"
                    w_text = fitz.get_text_length(text, fontname="hebo", fontsize=font_size)
                    cx = cell_x0 + (cfg.item_w - w_text) / 2
                    cy = cell_y0 + (cfg.item_h / 2) + (font_size / 3)
                    p.insert_text(fitz.Point(cx, cy), text, fontname="hebo", fontsize=font_size, color=(0,0,0))
                    continue

                current_doc_base = item_start["doc_base"]
                
                model_idx = item_start.get("model_idx")
                if model_idx is not None:
                    global_start_of_model = item_start["global_idx"] - item_start["local_idx"]
                    model_total_items = max(item["local_idx"] for item in multi_map if item.get("model_idx") == model_idx) + 1
                    end_local_idx = min(item_start["local_idx"] + stack_size - 1, model_total_items - 1)
                    item_end_of_block = multi_map[global_start_of_model + end_local_idx]
                    v_start = item_start["val1"]
                    v_end = item_end_of_block["val1"]
                else:
                    v_start = item_start["val1"]
                    v_end = item_end["val1"]

                bloco_num = (item_start["local_idx"] // stack_size) + 1

                if current_doc_base:
                    page_base = current_doc_base[0]
                    bw = page_base.rect.width
                    bh = page_base.rect.height

                    scale = cfg.cover_scale / 100.0
                    if scale <= 0.05:
                        scale = 0.8
                    new_w = bw * scale
                    new_h = bh * scale

                    off_x = cfg.cover_offset_x * 2.83465
                    off_y = cfg.cover_offset_y * 2.83465

                    cx = cell_x0 + (cfg.item_w - new_w) / 2 + off_x
                    cy = cell_y0 + (cfg.item_h - new_h) / 2 - off_y

                    p.show_pdf_page(
                        fitz.Rect(cx, cy, cx + new_w, cy + new_h),
                        current_doc_base, 0, keep_proportion=False, clip=page_base.rect
                    )

                v_start_str = str(v_start).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(v_start).zfill(4)
                v_end_str = str(v_end).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(v_end).zfill(4)

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

        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_{layer_idx + 1:02d}_01_capa.pdf")
        doc_c.save(out_name, garbage=4, deflate=True)
        doc_c.close()
        self.generated_files.append({"type": "capa", "path": out_name, "name": os.path.basename(out_name)})

    def _apply_refazer_filter(self):
        """Filtra as folhas fisicas geradas de acordo com refazer_de e refazer_ate."""
        r_de = self.cfg.refazer_de
        r_ate = self.cfg.refazer_ate
        if r_de <= 0:
            return
            
        if r_ate <= 0:
            r_ate = r_de
            
        is_duplex = (self.cfg.print_mode == "duplex")
        pages_per_sheet = 2 if is_duplex else 1
        
        req_start_sheet = r_de - 1
        req_end_sheet = r_ate - 1
        if req_end_sheet < req_start_sheet:
            req_end_sheet = req_start_sheet
            
        filtered_files = []
        current_global_sheet = 0
        
        for gf in self.generated_files:
            if gf["type"] in ["capa", "contracapa"]:
                # Excluir capas se refazer > 0
                if os.path.exists(gf["path"]):
                    os.remove(gf["path"])
                continue
                
            try:
                doc = fitz.open(gf["path"])
                chunk_sheets = len(doc) // pages_per_sheet
                
                chunk_start_sheet = current_global_sheet
                chunk_end_sheet = current_global_sheet + chunk_sheets - 1
                
                # Checar intersecção
                if req_start_sheet <= chunk_end_sheet and req_end_sheet >= chunk_start_sheet:
                    local_start = max(0, req_start_sheet - chunk_start_sheet)
                    local_end = min(chunk_sheets - 1, req_end_sheet - chunk_start_sheet)
                    
                    start_page = local_start * pages_per_sheet
                    end_page = min(len(doc) - 1, (local_end + 1) * pages_per_sheet - 1)
                    
                    if start_page == 0 and end_page == len(doc) - 1:
                        doc.close()
                        filtered_files.append(gf)
                    else:
                        doc.select(list(range(start_page, end_page + 1)))
                        temp_path = gf["path"] + ".tmp.pdf"
                        doc.save(temp_path, garbage=4, deflate=True)
                        doc.close()
                        os.replace(temp_path, gf["path"])
                        filtered_files.append(gf)
                else:
                    doc.close()
                    if os.path.exists(gf["path"]):
                        os.remove(gf["path"])
                
                current_global_sheet += chunk_sheets
            except Exception as e:
                print(f"[Refazer] Erro processando {gf['path']}: {e}")
                
        self.generated_files = filtered_files
