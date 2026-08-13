import base64
import hashlib
import math
import os
import io
import tempfile
import fitz       # PyMuPDF
import qrcode
from PIL import Image

# svglib/reportlab sao obrigatorios para impor elementos de tipo SVG.
# O import fica no topo (e nao dentro do try do render) de proposito: ate a v488
# ele estava dentro do bloco protegido, entao uma dependencia ausente virava um
# print() no console e o SVG simplesmente nao saia no papel, sem ninguem notar.
# Aqui o erro fica guardado e vira excecao no momento em que um SVG e imposto.
try:
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPDF
    _SVG_IMPORT_ERROR = None
except Exception as _svg_imp_ex:   # pragma: no cover - depende do ambiente
    svg2rlg = None
    renderPDF = None
    _SVG_IMPORT_ERROR = _svg_imp_ex

MM2PT = 2.8346   # 1mm em pontos PDF

# Cache para evitar log repetido de resolução de fontes do sistema
_font_log_cache: set = set()

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


# Ate onde as letras podem ser espremidas no modo "condense" antes de a fonte
# tambem ter de encolher. Abaixo de ~75% o texto fica ilegivel no papel — e o
# mesmo piso que os motores de VDP do mercado usam no copyfitting.
PISO_CONDENSA = 0.75


def _ajustar_texto_na_largura(medir, texto, corpo, largura_max, modo):
    """Ajusta texto variavel a um espaco de largura fixa.

    Espelho exato de window.ajustarTextoNaLargura (frontend/texto-ajuste.js);
    mudou aqui, muda la. `medir(texto, corpo)` e a regua de quem chama.
    Devolve (corpo, linhas, escala_x) — `escala_x` < 1 so no modo "condense",
    e a compressao horizontal a aplicar na hora de desenhar. Folga de 0,5%
    para a mesma palavra nao quebrar diferente entre a regua do canvas e a do
    fitz.
    """
    paragrafos = str(texto).split("\n")
    try:
        largura_max = float(largura_max or 0)
        corpo = float(corpo)
    except (TypeError, ValueError):
        return corpo, paragrafos, 1.0
    if largura_max <= 0 or corpo <= 0:
        return corpo, paragrafos, 1.0
    alvo = largura_max * 0.995

    if modo == "wrap":
        linhas = []
        for p in paragrafos:
            if not p:
                linhas.append("")
                continue
            atual = ""
            for palavra in p.split(" "):
                while len(palavra) > 1 and medir(palavra, corpo) > alvo:
                    if atual:
                        linhas.append(atual)
                        atual = ""
                    corte = len(palavra) - 1
                    while corte > 1 and medir(palavra[:corte], corpo) > alvo:
                        corte -= 1
                    linhas.append(palavra[:corte])
                    palavra = palavra[corte:]
                tentativa = (atual + " " + palavra) if atual else palavra
                if atual and medir(tentativa, corpo) > alvo:
                    linhas.append(atual)
                    atual = palavra
                else:
                    atual = tentativa
            linhas.append(atual)
        return corpo, linhas, 1.0

    # A linha mais larga manda nos outros dois modos: largura de texto e linear
    # no corpo, entao uma divisao resolve os dois sem laco de tentativa.
    maior = 0.0
    for p in paragrafos:
        w = medir(p, corpo)
        if w > maior:
            maior = w
    if maior <= alvo:
        return corpo, paragrafos, 1.0

    if modo == "condense":
        escala = alvo / maior
        if escala >= PISO_CONDENSA:
            # Coube so espremendo: a ALTURA fica intacta, que e a razao de ser
            # deste modo — as linhas seguem alinhadas de um ingresso ao outro.
            return corpo, paragrafos, escala
        # Nem no piso coube: espreme ate o piso e o resto vira corpo menor.
        return corpo * (alvo / (maior * PISO_CONDENSA)), paragrafos, PISO_CONDENSA

    # shrink (padrao)
    return corpo * (alvo / maior), paragrafos, 1.0


def _so_layout(el: dict) -> bool:
    """Elemento marcado como "Layout" na Lista de Numeracoes.

    O seletor Finalidade existe apenas nos elementos PDF e SVG e vale "print"
    (o padrao, e o que todo o acervo anterior tem gravado) ou "layout". Um
    elemento de layout existe so para conferencia nas janelas de visualizacao
    do frontend: ele nunca e imposto, nunca entra no PDF gerado e nunca vai ao
    papel. O frontend ja o retira do payload, mas o engine confere por conta
    propria — o payload tambem chega por outros caminhos (agente local, um
    replay de payload salvo) e imprimir o que a tela prometeu nao imprimir
    custa papel e confianca.
    """
    if el.get("type") not in ("SVG", "PDF"):
        return False
    return str(el.get("render_mode", "print")).strip().lower() == "layout"


def _foto_cache_path(origem: str) -> str | None:
    """Caminho do arquivo de cache em disco para uma foto baixada da nuvem.

    O agente imprime a mesma tiragem varias vezes — prova, tiragem, reimpressao
    de celula — e baixar de novo as 500 fotos em cada uma delas seria exatamente
    o tempo de rede que o agente local existe para nao pagar. A chave e o hash da
    origem, entao a foto trocada no Storage gera chave nova e nao volta velha do
    cache.
    """
    try:
        base = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
        d = os.path.join(base, "NewProd", "cache", "fotos")
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, hashlib.sha256(origem.encode("utf-8")).hexdigest() + ".bin")
    except Exception:
        return None


def _origem_de_foto(bruto) -> str:
    """A celula aponta para uma foto de verdade, ou so tem um nome escrito nela?

    Tres coisas podem estar na celula, e so duas delas levam a uma foto:

      · um endereco (`https://…`, `data:…`) — o que o Gerenciador de Fotos grava;
      · um caminho de arquivo (`C:\\fotos\\ana.jpg`, `fotos/ana.jpg`) — o modo
        BarTender, para quem ja tem o lote organizado numa pasta;
      · um NOME SOLTO (`JAQUE ROSSI.jpeg`), que nao aponta para lugar nenhum.

    O terceiro caso e o traicoeiro: a celula parece preenchida, a conferencia
    previa dava a linha por resolvida, e a imposicao so morria ao chegar naquele
    item — com o operador de pe na frente da impressora. Um nome de arquivo
    dentro da planilha nao e um vinculo; quem faz o vinculo e o Gerenciador.
    """
    v = str(bruto or "").strip().strip('"')
    if not v:
        return ""
    if v.lower().startswith(("http://", "https://", "data:")):
        return v
    if v[0] in "/\\":                                    # /caminho ou \\servidor\...
        return v
    if len(v) > 2 and v[0].isalpha() and v[1] == ":" and v[2] in "/\\":
        return v                                          # C:\fotos\ana.jpg
    if "/" in v or "\\" in v:                             # caminho relativo
        return v
    return ""


def _foto_da_linha(el: dict, csv_row: dict | None) -> dict | None:
    """Onde a foto daquela linha esta, e como ela foi enquadrada.

    Dois caminhos, nesta ordem:

      1. `__fotos[coluna]` — a chave de sistema que o Gerenciador de Fotos grava
         dentro da propria linha, com a URL e o retangulo de recorte. E o caminho
         normal, e e o que faz o enquadramento sobreviver a reordenar a tabela,
         dividir a numeracao entre modelos e refazer uma celula.
      2. O valor cru da coluna — uma URL ou um caminho de arquivo escrito na
         propria celula, como o BarTender e o NiceLabel fazem. Serve para quem ja
         tem as fotos organizadas e so quer apontar. Um nome de arquivo solto NAO
         vale: veja `_origem_de_foto`.
    """
    if csv_row is None:
        return None
    col = el.get("csv_column") or ""
    meta = (csv_row.get("__fotos") or {}).get(col) if isinstance(csv_row.get("__fotos"), dict) else None
    if isinstance(meta, dict) and str(meta.get("url") or "").strip():
        return meta
    bruto = _origem_de_foto(csv_row.get(col, ""))
    if bruto:
        return {"url": bruto}
    return None


def _foto_encaixe(iw: float, ih: float, w_pt: float, h_pt: float, fit: str,
                  cx: float, cy: float, zoom: float, rot: int):
    """Retangulo (x0, y0, larg, alt) em que a foto INTEIRA e desenhada dentro da
    janela, de modo que o pedaco pedido apareca.

    O recorte nao e feito na imagem: a foto e desenhada maior que a janela e o
    que sobra fica fora da pagina temporaria, que e do tamanho exato da janela.
    Assim os bytes originais entram no PDF sem recompressao — uma foto nao perde
    qualidade por ter sido enquadrada.
    """
    if rot % 180 == 90:
        iw, ih = ih, iw
    if iw <= 0 or ih <= 0 or w_pt <= 0 or h_pt <= 0:
        return None
    if fit == "contain":
        base = min(w_pt / iw, h_pt / ih)
    else:
        base = max(w_pt / iw, h_pt / ih)
    esc = base * max(float(zoom or 1.0), 0.01)
    dw, dh = iw * esc, ih * esc
    if fit == "contain":
        return (w_pt - dw) / 2, (h_pt - dh) / 2, dw, dh
    # cobrir: o centro pedido manda, mas a janela nunca pode ficar com buraco
    x0 = min(0.0, max(w_pt - dw, w_pt / 2 - cx * dw))
    y0 = min(0.0, max(h_pt - dh, h_pt / 2 - cy * dh))
    return x0, y0, dw, dh


def _graus_90(angulo) -> int:
    """PyMuPDF so aceita rotacao em multiplos de 90 ao inserir imagem."""
    try:
        return int(round(float(angulo or 0) / 90.0) * 90) % 360
    except Exception:
        return 0


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
                 refazer_ate: int = 0,
                 refazer_set: int = 1,
                 refazer_celulas: list = None):

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
        # Uma linha desmarcada no editor de CSV carrega __ativo: false e nao deve
        # ser impressa. A ausencia da chave significa ativa, entao todo CSV salvo
        # antes da v524 continua valendo. Filtrar aqui, num ponto so, resolve de
        # uma vez o total_items logo abaixo e todos os cfg.csv_data[item_index]
        # espalhados pelos metodos de layout.
        if csv_data:
            ativas = [r for r in csv_data if r.get("__ativo", True) is not False]
            if not ativas:
                raise ValueError(
                    "Todas as linhas do banco de dados (CSV) estao desmarcadas: "
                    "nao ha nada para imprimir. Abra o CSV da numeracao e marque "
                    "ao menos uma linha."
                )
            csv_data = ativas
        self.csv_data = csv_data

        self.num_tipo = numeracao.get("tipo", "SEQUENCIAL") if numeracao else "SEQUENCIAL"
        if numeracao and "CAMAROTE" in str(numeracao.get("svg_content", "")):
            self.num_tipo = "CAMAROTE"
        self.ticket_qtd = numeracao.get("ticket_qtd", 1) if numeracao else 1
        self.ticket_logica = numeracao.get("ticket_logica", "PILHA") if numeracao else "PILHA"
        # CAMAROTE: inicio do local (c_ini), quantidade de locais e lotação por local
        self.c_ini = max(1, int(c_ini) if c_ini else 1)
        self.q_cam = int(q_cam) if q_cam else 0
        self.l_cam = max(1, int(l_cam) if l_cam else 1)
        self.refazer_de = int(refazer_de) if refazer_de else 0
        self.refazer_ate = int(refazer_ate) if refazer_ate else 0
        self.refazer_set = int(refazer_set) if refazer_set else 1
        # Itens a refazer, identificados pela POSIÇÃO NO MODELO (1-based): o 1º,
        # o 6º, o 22º ticket do trabalho. NÃO é a pose da folha — pedir "22" num
        # formato de dez células é legítimo e quer dizer o vigésimo segundo
        # ticket. Lista vazia = o trabalho inteiro.
        #
        # A ORDEM É A RECEBIDA, não crescente: as células ocupam a folha
        # compactada na ordem da lista, e ordenar aqui trocaria de lugar o que o
        # operador viu na prévia enquanto digitava. `dict.fromkeys` tira as
        # repetidas preservando a ordem de entrada.
        self.refazer_celulas = list(dict.fromkeys(
            int(c) for c in (refazer_celulas or []) if str(c).strip().isdigit() and int(c) >= 1
        ))
        
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
            self.total_items = 0
            for a in self.multi_artes:
                art_qtd = int(a.get("qtd", 0))
                art_num = a.get("numeracao")
                art_num_tipo = art_num.get("tipo", "SEQUENCIAL") if art_num else "SEQUENCIAL"
                if art_num and "CAMAROTE" in str(art_num.get("svg_content", "")):
                    art_num_tipo = "CAMAROTE"
                if art_num_tipo == "TICKET":
                    art_ticket_qtd = int(art_num.get("ticket_qtd", 1)) if art_num else 1
                    self.total_items += art_qtd
                else:
                    self.total_items += art_qtd
            if self.total_items < 1: self.total_items = 1
        elif csv_data:
            self.total_items = len(csv_data)
        elif self.num_tipo == "CAMAROTE":
            if self.q_cam > 0:
                self.total_items = self.q_cam * self.l_cam
            else:
                raise ValueError("Numeração do tipo CAMAROTE requer que Q_CAM (Quantidade de Locais) seja informada e maior que zero.")
        else:
            total_expected = math.floor((seq_end - seq_start) / seq_increment) + 1
            if self.num_tipo == "TICKET":
                ticket_qtd = int(numeracao.get("ticket_qtd", 1)) if numeracao else 1
                self.total_items = math.ceil(total_expected / ticket_qtd)
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
                if _so_layout(el):
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
                if _so_layout(el):
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

class TriggerList(list):
    def __init__(self, callback=None):
        super().__init__()
        self.callback = callback

    def append(self, item):
        super().append(item)
        if self.callback:
            try:
                self.callback(item)
            except Exception as e:
                print(f"[TriggerList] Erro no callback: {e}")

class ImpositionEngine:
    def __init__(self, config: ImpositionConfig, on_file_generated=None):
        self.cfg = config
        self._url_cache = {}
        self.on_file_generated = on_file_generated
        self.generated_files = TriggerList(on_file_generated)
        # Cache de bytes de fontes TTF: {font_file_path -> bytes}
        # Evita re-leitura do disco a cada chamada, mas PyMuPDF ainda
        # faz deduplicacao interna de streams identicos no PDF.
        self._font_buffer_cache: dict = {}

    def _get_font_buffer(self, font_file: str) -> bytes:
        """Le o arquivo TTF do disco uma unica vez e cacheia os bytes em memoria."""
        if font_file not in self._font_buffer_cache:
            with open(font_file, 'rb') as f:
                self._font_buffer_cache[font_file] = f.read()
        return self._font_buffer_cache[font_file]

    def _get_url_bytes(self, url: str) -> bytes:
        if url in self._url_cache:
            return self._url_cache[url]
        import urllib.request
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            self._url_cache[url] = data
            return data

    def _get_foto_bytes(self, origem: str) -> bytes:
        """Bytes da foto, de onde quer que ela venha, com dois niveis de cache.

        Aceita URL da nuvem, `data:` embutido e caminho de arquivo local — os
        tres casos existem: o Gerenciador de Fotos sobe para o Storage, uma
        prova pode carregar a foto embutida, e quem organiza as fotos numa pasta
        da estacao aponta o caminho direto na coluna.
        """
        if origem in self._url_cache:
            return self._url_cache[origem]

        if origem.startswith("data:"):
            dados = base64.b64decode(origem.split(",", 1)[-1])
        elif origem.startswith("http"):
            cam = _foto_cache_path(origem)
            dados = None
            if cam and os.path.exists(cam):
                try:
                    with open(cam, "rb") as f:
                        dados = f.read()
                except Exception:
                    dados = None
            if dados is None:
                dados = self._get_url_bytes(origem)
                if cam:
                    # Escrita em dois passos: um cache pela metade, deixado para
                    # tras por uma queda de energia, viraria foto corrompida no
                    # papel na proxima tiragem.
                    try:
                        tmp = cam + ".parcial"
                        with open(tmp, "wb") as f:
                            f.write(dados)
                        os.replace(tmp, cam)
                    except Exception:
                        pass
        else:
            with open(origem, "rb") as f:
                dados = f.read()

        self._url_cache[origem] = dados
        return dados

    def _conferir_e_aquecer_fotos(self):
        """Antes do primeiro papel: toda linha tem foto? E as fotos, ja estao aqui?

        Duas coisas que so fazem sentido juntas, e so fazem sentido ANTES do laco
        de imposicao:

          · A conferencia acusa TODAS as linhas sem foto de uma vez. Descobrir a
            decima linha vazia depois de imprimir nove credenciais e desperdicio
            de PVC e de tempo do operador.
          · O aquecimento baixa as fotos em paralelo e guarda no cache. Dentro do
            laco, cada foto seria buscada uma por vez, em serie, com o operador
            de pe na frente da impressora — que e exatamente o custo que o agente
            local existe para nao pagar.
        """
        cfg = self.cfg
        els = [e for e in (getattr(cfg, "elements", None) or []) if e.get("type") == "FOTO"]
        if not els:
            return
        linhas = getattr(cfg, "csv_data", None) or []
        if not linhas:
            return

        faltando = []
        origens = []
        for i, linha in enumerate(linhas, start=1):
            for el in els:
                col = el.get("csv_column", "")
                meta = _foto_da_linha(el, linha)
                origem = str((meta or {}).get("url") or "").strip()

                if not origem:
                    # Distinguir "celula vazia" de "celula com um nome escrito"
                    # nao e preciosismo: sao dois trabalhos diferentes. A primeira
                    # espera uma foto; a segunda ja tem a foto em algum lugar e o
                    # que falta e ligar as duas pelo Gerenciador.
                    bruto = str((linha or {}).get(col, "") or "").strip()
                    faltando.append((
                        i, col,
                        f"a celula tem '{bruto[:60]}', que e so um nome de arquivo — "
                        "nao um endereco nem um caminho" if bruto else "celula vazia"
                    ))
                    continue

                # Modo BarTender: o caminho tem de existir NESTA estacao. Conferir
                # agora e a diferenca entre uma lista de pendencias e uma tiragem
                # que morre no meio.
                if not origem.lower().startswith(("http", "data:")) and not os.path.exists(origem):
                    # Cortar pelo COMECO: num caminho longo o que identifica a
                    # pendencia e o nome do arquivo, que fica no fim.
                    curto = origem if len(origem) <= 80 else "..." + origem[-80:]
                    faltando.append((i, col, f"arquivo nao encontrado: '{curto}'"))
                    continue

                origens.append(origem)

        if faltando:
            amostra = "; ".join(f"linha {i} (coluna '{c}'): {m}" for i, c, m in faltando[:10])
            resto = f"; e mais {len(faltando) - 10}" if len(faltando) > 10 else ""
            raise ValueError(
                f"{len(faltando)} linha(s) do banco estao sem foto utilizavel - {amostra}{resto}. "
                "Abra o Gerenciador de Fotos e ligue as fotos as linhas antes de imprimir: "
                "o nome do arquivo digitado na celula nao basta, o motor precisa do "
                "endereco da foto ou do caminho completo do arquivo. "
                "Para imprimir agora SEM essas pessoas, desmarque as linhas delas no "
                "editor de CSV (as celulas vermelhas da coluna de foto mostram quem "
                "falta) - elas ficam guardadas, e quando as fotos chegarem voce as "
                "remarca e imprime so o que faltou."
            )

        # dict.fromkeys preserva a ordem e mata a repeticao: a credencial que usa
        # a mesma foto em duas janelas, ou o lote com a foto do crachá padrao
        # repetida, baixa uma vez so.
        unicas = list(dict.fromkeys(origens))
        if not unicas:
            return
        if len(unicas) == 1:
            self._aquecer_uma_foto(unicas[0])
            return
        try:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(self._aquecer_uma_foto, unicas))
        except Exception:
            # Falha no aquecimento nao e falha de impressao: o render busca de
            # novo e, ai sim, com a mensagem completa do que deu errado.
            pass

    def _aquecer_uma_foto(self, origem: str):
        try:
            self._get_foto_bytes(origem)
        except Exception:
            pass

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
        # Guarda final: um elemento de Layout nunca chega ao papel. Os tres pontos
        # de ingestao ja o descartam; esta linha cobre qualquer caminho novo que
        # monte uma lista de elementos sem passar por eles.
        if _so_layout(el):
            return

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
        elif t in ("SVG", "PDF", "FOTO"):
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
                parts = raw_font_name[7:].split("|")
                family = parts[0]
                is_bold = "bold" in parts[1:]
                is_italic = "italic" in parts[1:]
            else:
                family = raw_font_name
                fam_lower = family.lower()
            is_bold = el.get("font_weight") == "bold" or el.get("bold") is True
            is_italic = el.get("font_style") == "italic"

            font_name = font_map.get(raw_font_name, "hebo" if is_bold else "helv")
            font_file = None

            # 1. Tentar ler fonte embutida em Base64 se presente no elemento
            if el.get("_font_data"):
                import base64, tempfile
                try:
                    font_bytes = base64.b64decode(el["_font_data"])
                    tmp_font = tempfile.NamedTemporaryFile(delete=False, suffix=".ttf")
                    tmp_font.write(font_bytes)
                    tmp_font.close()
                    font_file = tmp_font.name
                    font_name = family  # Usar o nome real da fonte, não o fallback Base-14
                except Exception as ex:
                    print(f"[engine] Erro ao usar fonte embutida: {ex}")

            # 2. Tentar baixar a fonte do Catálogo Web se URL fornecida
            if not font_file:
                font_url = el.get("arquivo_url") or el.get("font_url")
                if font_url:
                    try:
                        import urllib.request, re
                        safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', family) + ".ttf"
                        # Em ambientes serverless (Vercel), o FS raiz é read-only; usar /tmp
                        _base_dir = os.path.dirname(os.path.abspath(__file__))
                        fonts_dir = os.path.join(_base_dir, "fonts")
                        try:
                            os.makedirs(fonts_dir, exist_ok=True)
                            # Testar se é gravável
                            _test_file = os.path.join(fonts_dir, ".write_test")
                            with open(_test_file, "w") as _tf:
                                _tf.write("ok")
                            os.remove(_test_file)
                        except (OSError, PermissionError):
                            fonts_dir = os.path.join("/tmp", "imposicao_fonts")
                            os.makedirs(fonts_dir, exist_ok=True)
                        dest = os.path.join(fonts_dir, safe_name)
                        if not os.path.exists(dest):
                            print(f"[engine] Baixando fonte do catálogo web: {family} -> {font_url}")
                            req = urllib.request.Request(font_url, headers={'User-Agent': 'Mozilla/5.0'})
                            with urllib.request.urlopen(req, timeout=15) as resp:
                                with open(dest, "wb") as out:
                                    out.write(resp.read())
                        if os.path.exists(dest) and os.path.getsize(dest) > 100:
                            font_name = family
                            font_file = dest
                    except Exception as _dl_err:
                        print(f"[engine] Aviso ao baixar fonte do catálogo: {_dl_err}")

                        if not font_file:
                            font_name = font_map.get(raw_font_name, "hebo" if is_bold else "helv")
                            font_file = None
                            _warn_key = f"not_found:{family}"
                            if _warn_key not in _font_log_cache:
                                _font_log_cache.add(_warn_key)
                                print(f"[engine] Fonte '{family}' nao encontrada no sistema, usando Helvetica{'Bold' if is_bold else ''}")

            insert_kwargs = {
                "fontsize": font_size,
                "fontname": font_name,
                "color": rgb,
            }
            if font_file:
                # Registrar a fonte na pagina via insert_font(fontbuffer=) antes
                # de chamar insert_text. Isso evita que o arquivo temporario seja
                # lido novamente (pode ja ter sido deletado) e o PyMuPDF deduplica
                # o stream da fonte quando o mesmo xref ja existe na pagina.
                try:
                    font_bytes = self._get_font_buffer(font_file)
                    page.insert_font(fontname=font_name, fontbuffer=font_bytes)
                    # insert_text usa apenas fontname — PyMuPDF encontra pelo xref ja registrado
                    # fontfile NAO e passado para evitar re-leitura do arquivo
                except Exception as _fe:
                    # Fallback: tentar com fontfile diretamente
                    if os.path.isfile(font_file):
                        insert_kwargs["fontfile"] = font_file
                    else:
                        # Arquivo nao existe mais — usar fonte padrao
                        insert_kwargs["fontname"] = "hebo" if is_bold else "helv"
                        font_file = None

            # ── Largura maxima do elemento (max_width_mm) ─────────────────
            # Ajusta ANTES de line_height/baseline: shrink muda o corpo,
            # wrap muda as linhas. Espelho exato do frontend
            # (window.desenharTextoAjustado em frontend/texto-ajuste.js).
            try:
                _max_w_mm = float(el.get("max_width_mm") or 0)
            except (TypeError, ValueError):
                _max_w_mm = 0.0
            _align = None
            _escala_x = 1.0
            if _max_w_mm > 0:
                if font_file:
                    _medir = lambda s, fs: fs * 0.55 * len(s)
                else:
                    _medir = lambda s, fs: fitz.get_text_length(
                        s, fontname=font_name, fontsize=fs)
                _modo = el.get("overflow")
                if _modo not in ("wrap", "condense"):
                    _modo = "shrink"
                font_size, _linhas_aj, _escala_x = _ajustar_texto_na_largura(
                    _medir, val_str, font_size, _max_w_mm * MM2PT, _modo)
                insert_kwargs["fontsize"] = font_size
                val_str = "\n".join(_linhas_aj)
                _align = el.get("text_align")

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

                # No modo "condense" a linha sai espremida na horizontal, entao
                # o que conta para alinhar e a largura JA comprimida.
                largura_visual = text_width * _escala_x

                if _align == "left":
                    borda_esq = cx - (_max_w_mm * MM2PT) / 2.0
                elif _align == "right":
                    borda_esq = cx + (_max_w_mm * MM2PT) / 2.0 - largura_visual
                else:
                    borda_esq = cx - largura_visual / 2.0

                # A compressao acontece em torno do pivot (cx, cy), entao o
                # ponto de insercao precisa ser pre-corrigido para a linha cair
                # em `borda_esq` DEPOIS de comprimida:
                #   final = cx + (origin_x - cx) * escala  ⇒  origin_x abaixo.
                origin_x = cx + (borda_esq - cx) / _escala_x

                # Centro visual da linha i
                cy_line = block_top + (i * line_height) + (line_height / 2.0)
                # Baseline = centro visual + offset (textBaseline='middle' → PDF baseline)
                origin_y = cy_line + baseline_offset

                if angle != 0 or _escala_x != 1.0:
                    # Um morph so para as duas transformacoes, no mesmo pivot:
                    # comprime primeiro (no eixo do texto) e depois gira.
                    origin = fitz.Point(origin_x, origin_y)
                    pivot = fitz.Point(cx, cy)
                    matriz = fitz.Matrix(_escala_x, 1) * fitz.Matrix(-angle)
                    page.insert_text(
                        origin,
                        line_str,
                        morph=(pivot, matriz),
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

        elif t == "FOTO":
            # A janela de foto da credencial. O retangulo do elemento E a janela:
            # width_mm x height_mm. Quem decide o que aparece dentro dela e o
            # enquadramento gravado na linha (cx, cy, zoom, rot).
            meta = _foto_da_linha(el, csv_row)
            if meta is None:
                # Sem linha (previa da numeracao sem banco) nao ha o que pintar.
                # Numa impressao de verdade a linha sem foto nao chega ate aqui:
                # `_conferir_e_aquecer_fotos` interrompe antes, com a lista
                # inteira das pendencias.
                if csv_row is None:
                    return
                col_foto = el.get("csv_column", "")
                bruto = str((csv_row or {}).get(col_foto, "") or "").strip()
                detalhe = (
                    f" A celula tem '{bruto[:60]}', que e so um nome de arquivo: "
                    "ligue a foto a linha pelo Gerenciador de Fotos."
                ) if bruto else ""
                raise RuntimeError(
                    f"Elemento FOTO '{el.get('id', '?')}': a linha nao tem foto na "
                    f"coluna '{col_foto}'.{detalhe}"
                )

            origem = str(meta.get("url") or "").strip()
            w_pt = el.get("width_mm", 20) * MM2PT
            h_pt = el.get("height_mm", 20) * MM2PT
            try:
                dados = self._get_foto_bytes(origem)
                with Image.open(io.BytesIO(dados)) as im:
                    iw, ih = im.size

                rot_foto = _graus_90(meta.get("rot", 0))
                geo = _foto_encaixe(
                    iw, ih, w_pt, h_pt,
                    str(el.get("fit", "cover") or "cover").lower(),
                    float(meta.get("cx", 0.5) or 0.5),
                    float(meta.get("cy", 0.5) or 0.5),
                    float(meta.get("zoom", 1.0) or 1.0),
                    rot_foto,
                )
                if geo is None:
                    raise ValueError(f"foto com dimensoes invalidas ({iw}x{ih})")
                gx, gy, gw, gh = geo

                # Pagina temporaria do tamanho exato da janela: o que sobra da
                # foto fica fora dela e nao e impresso. E o recorte sem tocar nos
                # bytes da imagem.
                jan = fitz.open()
                pj = jan.new_page(width=w_pt, height=h_pt)
                pj.insert_image(
                    fitz.Rect(gx, gy, gx + gw, gy + gh),
                    stream=dados,
                    keep_proportion=True,
                    rotate=(360 - rot_foto) % 360,
                )

                # Contorno: e arte, nao enfeite de tela. Desenhado DENTRO da
                # pagina da janela, recuado meia espessura para nao ter metade do
                # traco cortada pela borda da pagina — e assim ele acompanha a
                # rotacao do elemento junto com a foto.
                esp = float(el.get("border_mm", 0) or 0) * MM2PT
                canto = str(el.get("corner", "square") or "square").lower()
                if esp > 0:
                    cor = _hex_to_rgb(el.get("border_color", "#000000") or "#000000")
                    meia = esp / 2.0
                    r_borda = fitz.Rect(meia, meia, w_pt - meia, h_pt - meia)
                    if canto == "circle":
                        pj.draw_oval(r_borda, color=cor, width=esp)
                    else:
                        try:
                            raio = min(w_pt, h_pt) * 0.12 if canto == "round" else 0
                            if raio:
                                pj.draw_rect(r_borda, color=cor, width=esp, radius=0.12)
                            else:
                                pj.draw_rect(r_borda, color=cor, width=esp)
                        except (TypeError, ValueError):
                            # PyMuPDF sem `radius`: canto reto e melhor que erro.
                            pj.draw_rect(r_borda, color=cor, width=esp)

                rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
                py_rotate = _graus_90(360 - angle)

                if canto in ("round", "circle"):
                    # Canto arredondado exige recorte, e recorte por caminho nao
                    # existe no show_pdf_page. Entao a janela e rasterizada e
                    # entra como imagem com a forma escolhida virando TRANSPARENCIA
                    # — o custo so aparece para quem escolheu o canto redondo, e
                    # sem isto a tela mostraria um circulo e o PVC sairia quadrado.
                    pix = pj.get_pixmap(dpi=300, alpha=False)
                    from PIL import ImageDraw
                    mascara = Image.new("L", (pix.width, pix.height), 0)
                    desenho = ImageDraw.Draw(mascara)
                    if canto == "circle":
                        desenho.ellipse([0, 0, pix.width - 1, pix.height - 1], fill=255)
                    else:
                        desenho.rounded_rectangle(
                            [0, 0, pix.width - 1, pix.height - 1],
                            radius=int(min(pix.width, pix.height) * 0.12), fill=255
                        )
                    # A mascara entra como CANAL ALFA do proprio pixmap, nunca
                    # como PNG em `mask=`: por esse segundo caminho o PyMuPDF
                    # guarda o PNG como veio, e a SMask sai com ColorSpace
                    # ICCBased de 1 bit — o MuPDF renderiza, mas a especificacao
                    # exige SMask em DeviceGray, e o Acrobat descarta TODAS as
                    # fotos da pagina com "Ha um erro nesta pagina". Foi um lote
                    # inteiro de credenciais sem rosto no cliente. Pelo canal
                    # alfa, o proprio MuPDF escreve a SMask canonica.
                    com_alfa = fitz.Pixmap(pix, 1)
                    com_alfa.set_alpha(mascara.tobytes())
                    page.insert_image(
                        rect, pixmap=com_alfa,
                        rotate=py_rotate, keep_proportion=False,
                    )
                else:
                    page.show_pdf_page(
                        rect, jan, 0,
                        keep_proportion=True,
                        rotate=py_rotate,
                        clip=jan[0].rect,
                    )
                jan.close()
            except Exception as ex:
                # Nao engolir: credencial impressa com a janela vazia e PVC no lixo.
                raise RuntimeError(
                    f"Erro ao impor a foto do elemento '{el.get('id', '?')}' "
                    f"(origem: {origem[:120]}): {ex}"
                ) from ex

        elif t == "SVG":
            svg_content = el.get("svg_content") or ""
            if svg_content:
                w_pt = el.get("width_mm", 20) * MM2PT
                h_pt = el.get("height_mm", 20) * MM2PT
                rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
                py_rotate = (360 - angle) % 360

                if _SVG_IMPORT_ERROR is not None:
                    raise RuntimeError(
                        "Nao foi possivel impor o elemento SVG: as bibliotecas 'svglib' e "
                        f"'reportlab' nao estao disponiveis ({_SVG_IMPORT_ERROR}). "
                        "Instale-as com: pip install -r requirements.txt"
                    )

                try:
                    if svg_content.startswith("http"):
                        svg_bytes = self._get_url_bytes(svg_content)
                        svg_data = svg_bytes.decode("utf-8")
                    else:
                        svg_data = svg_content

                    drawing = svg2rlg(io.StringIO(svg_data))
                    if drawing is None:
                        raise ValueError("svg2rlg nao conseguiu interpretar o conteudo do SVG")
                    # Um SVG malformado nao levanta excecao no svglib: ele devolve um
                    # desenho 0x0 que nao pinta nada. Sem esta checagem o PDF sairia
                    # sem a arte e sem qualquer aviso.
                    if not (drawing.width > 0 and drawing.height > 0):
                        raise ValueError("o SVG resultou num desenho de tamanho zero (arquivo invalido ou vazio)")
                    pdf_bytes = renderPDF.drawToString(drawing)
                    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                    # keep_proportion=True: o desenho e encaixado na caixa do elemento
                    # sem distorcao, do mesmo jeito que os canvas do frontend desenham.
                    page.show_pdf_page(rect, pdf_doc, 0, keep_proportion=True, rotate=py_rotate, clip=pdf_doc[0].rect)
                    pdf_doc.close()
                except Exception as ex:
                    # Nao engolir: um PDF impresso sem a arte custa papel e tempo.
                    raise RuntimeError(f"Erro ao impor o elemento SVG '{el.get('id', '?')}': {ex}") from ex

        elif t == "PDF":
            pdf_content = el.get("pdf_content") or ""
            if pdf_content:
                import base64
                import traceback
                try:
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
                    # keep_proportion=True: encaixa sem distorcer, igual ao canvas.
                    page.show_pdf_page(rect, pdf_doc, 0, keep_proportion=True, rotate=py_rotate, clip=pdf_doc[0].rect)
                    pdf_doc.close()
                except Exception as ex:
                    # Nao engolir: um PDF impresso sem a arte custa papel e tempo.
                    traceback.print_exc()
                    raise RuntimeError(f"Erro ao impor o elemento PDF '{el.get('id', '?')}': {ex}") from ex
            else:
                print(f"[engine] Elemento PDF sem pdf_content - ignorado")


    def process(self):
        cfg = self.cfg
        # Fotos primeiro: acusa as linhas sem foto e baixa o lote em paralelo,
        # antes de qualquer papel. Sem elemento FOTO, sai na primeira linha.
        self._conferir_e_aquecer_fotos()
        # ─── REFAZER ────────────────────────────────────────────────────────────
        # Reimpressão de parte de uma tiragem que já saiu. São dois modos, e eles
        # não se misturam:
        #
        #  · POR FOLHA (`r_de`/`r_ate`, dentro do set `r_set`): reimprime folhas
        #    inteiras, iguais às originais. O filtro é um `continue` no laço —
        #    nada é recalculado, então a folha 7 traz os números que ela trazia.
        #
        #  · POR CÉLULA (`r_cels`): a lista é de POSIÇÕES DO ITEM NO MODELO,
        #    1-based — o 1º, o 6º, o 22º ticket do trabalho, onde quer que ele
        #    esteja. Não é a pose da folha: pedir "22" numa folha de dez células
        #    é legítimo e quer dizer o vigésimo segundo ticket. Os itens pedidos
        #    são compactados numa folha só.
        #
        # Quando há células, a faixa de folhas não se aplica: as posições já são
        # absolutas no modelo, e filtrar por folha só poderia contradizê-las.
        r_de = int(getattr(cfg, "refazer_de", 0) or 0)
        r_ate = int(getattr(cfg, "refazer_ate", 0) or 0)
        r_set = int(getattr(cfg, "refazer_set", 1) or 1)
        # Lista, não conjunto: a ordem decide qual item ocupa qual posição na
        # folha compactada (ver `refazer_celulas` no ImpositionConfig).
        r_cels = list(getattr(cfg, "refazer_celulas", None) or [])

        if r_cels:
            r_de = 0
            r_ate = 0
            fora = [c for c in r_cels if c > cfg.total_items]
            if fora:
                raise ValueError(
                    "Refazer: posicao(oes) " + ",".join(str(c) for c in fora)
                    + f" nao existem — este modelo tem {cfg.total_items} item(ns)."
                )
        else:
            if r_de > 0 and r_ate <= 0:
                r_ate = r_de
            # Só "Até" preenchido: o frontend já recusa, mas o motor também atende
            # o agente local e a API. Assumir a folha 1 é o único palpite seguro —
            # o contrário (r_de = 0) desliga o filtro e refaz a tiragem inteira.
            if r_de <= 0 and r_ate > 0:
                r_de = 1
            if r_de > 0 and r_ate < r_de:
                raise ValueError(
                    f"Refazer: faixa invalida — 'ate' ({r_ate}) e menor que 'de' ({r_de})."
                )

        # Refazendo por folha OU por célula: nos dois casos o que sai é miolo
        # avulso para repor o que se perdeu. Capa e contracapa pertencem ao set
        # inteiro e já foram impressas — reimprimi-las é desperdício de papel.
        refazendo = (r_de > 0) or bool(r_cels)
        # Normalizar rotate_page para ângulo de rotação (0, 90, 180, 270)
        rot_val = getattr(cfg, "rotate_page", 0)
        if isinstance(rot_val, bool):
            self.rotate_angle = 90 if rot_val else 0
        else:
            try:
                self.rotate_angle = int(rot_val or 0)
            except Exception:
                self.rotate_angle = 0
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
        self.generated_files = TriggerList(getattr(self, "on_file_generated", None))
        doc_base = self._load_base_as_pdf()
        
        if cfg.has_cover:
            if cfg.layout_schema == "cut_stack":
                stack_size = cfg.sheets_per_block * cfg.block_depth
            else:
                stack_size = total_sheets
        else:
            stack_size = total_sheets

        # ─── REFAZER CÉLULA: OS ITENS SÃO COMPACTADOS ───────────────────────────
        # Repor cinco tickets não pode custar cinco folhas de papel com um ticket
        # cada. Os itens pedidos são reimpostos preenchendo a folha de saída,
        # célula a célula, sem buraco.
        #
        # `r_cels` são POSIÇÕES NO MODELO, 1-based, e o índice interno do item é
        # simplesmente `posição - 1`. Não há conta de esquema aqui: o esquema
        # (cut_stack, multi_artes, sequential) decide onde o item CAIU na tiragem
        # original, e isso não importa para quem só quer o ticket de volta.
        #
        # A numeração não se move junto: o item leva o número que sempre teve, e
        # é só a posição na folha que muda.
        empacotando = bool(r_cels)
        fontes = []
        if empacotando:
            # Ordem digitada: é ela que decide qual item ocupa qual posição.
            fontes = [c - 1 for c in r_cels if 0 <= c - 1 < cfg.total_items]
            total_sheets = math.ceil(len(fontes) / poses_per_sheet) if fontes else 0
            # Saída compactada é um documento só: sem troca de set, sem capa.
            stack_size = max(total_sheets, 1)
            print(f"[engine] refazer celula: {len(fontes)} item(ns) -> {total_sheets} folha(s) compactada(s)")

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
                        "print_mode": cfg.print_mode,
                        "tipo": cfg.num_tipo,
                        "ticket_qtd": cfg.ticket_qtd,
                        "ticket_logica": cfg.ticket_logica
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
                        if _so_layout(el):
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
                import time
                try:
                    if is_url:
                        if file_path in pdf_cache:
                            return pdf_cache[file_path]
                        
                        pdf_bytes = None
                        retries = 3
                        delay = 1.0
                        req = urllib.request.Request(file_path, headers={'User-Agent': 'Mozilla/5.0'})
                        for attempt in range(retries):
                            try:
                                with urllib.request.urlopen(req, timeout=15) as response:
                                    pdf_bytes = response.read()
                                    break
                            except Exception as download_err:
                                if attempt == retries - 1:
                                    raise download_err
                                print(f"[engine] Falha ao baixar arte (tentativa {attempt+1}/{retries}), aguardando {delay}s: {download_err}")
                                time.sleep(delay)
                                delay *= 2.0
                        
                        if not pdf_bytes:
                            raise Exception("Conteúdo do download vazio")
                            
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
                
                art_num_tipo = num1_obj.get("tipo", "SEQUENCIAL") if num1_obj else "SEQUENCIAL"
                if num1_obj and "CAMAROTE" in str(num1_obj.get("svg_content", "")):
                    art_num_tipo = "CAMAROTE"
                
                if art_num_tipo == "TICKET":
                    art_ticket_qtd = int(num1_obj.get("ticket_qtd", 1)) if num1_obj else 1
                    physical_qtd = qtd
                else:
                    physical_qtd = qtd
                    art_ticket_qtd = 1
                
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

                for i in range(physical_qtd):
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
                        "q_cam": int(art.get("q_cam", cfg.q_cam if hasattr(cfg, "q_cam") else 0)),
                        "num_tipo": art_num_tipo,
                        "ticket_qtd": art_ticket_qtd
                    })

        if is_strict_assembly:
            # 1. Agrupar itens do multi_map por modelo
            models_items = []
            curr_idx = 0
            for art in sorted_artes:
                qtd = int(art.get("qtd", 0))
                art_num = art.get("numeracao")
                art_num_tipo = art_num.get("tipo", "SEQUENCIAL") if art_num else "SEQUENCIAL"
                if art_num and "CAMAROTE" in str(art_num.get("svg_content", "")):
                    art_num_tipo = "CAMAROTE"
                if art_num_tipo == "TICKET":
                    art_ticket_qtd = int(art_num.get("ticket_qtd", 1)) if art_num else 1
                    physical_qtd = qtd
                else:
                    physical_qtd = qtd
                models_items.append(multi_map[curr_idx : curr_idx + physical_qtd])
                curr_idx += physical_qtd
                
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
            blocks_used = 0
            
            # 3. Empacotar blocos em sets com profundidade de corte
            # Cada set tem poses_per_sheet células, cada célula empilha 'depth' blocos
            # Um set completo precisa de poses_per_sheet blocos no mínimo
            if total_blocks >= poses_per_sheet:
                # Calcular a profundidade máxima possível para sets estritos
                # Usar todos os blocos completos distribuídos em sets
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
            
            # Devolver blocos restantes para leftovers (garantido fora do bloco IF principal)
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
            
            if empacotando:
                # Mesma regra do caminho principal. Aqui o item não sai de uma
                # conta de índice e sim do próprio `multi_map`, que é a lista
                # ordenada de itens do trabalho — a posição N do modelo é o
                # `multi_map[N - 1]`, seja qual for a célula em que ele caiu na
                # tiragem. A saída é um miolo só: não faz sentido dividir em sets
                # uma reposição avulsa.
                itens = [
                    multi_map[c - 1] for c in r_cels
                    if 0 <= c - 1 < len(multi_map) and multi_map[c - 1] is not None
                ]

                print(f"[engine] refazer celula (strict_assembly): {len(itens)} item(ns)")
                doc_out = fitz.open()
                for inicio in range(0, len(itens), poses_per_sheet):
                    bloco = itens[inicio:inicio + poses_per_sheet]

                    out_page_front = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
                    if self.rotate_angle > 0:
                        out_page_front.set_rotation(self.rotate_angle)
                    for pos, item_data in enumerate(bloco):
                        self._render_item_front(
                            out_page_front, item_data, pos // cols, pos % cols, cfg, start_x, start_y
                        )

                    if is_duplex:
                        out_page_back = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
                        if self.rotate_angle > 0:
                            out_page_back.set_rotation(self.rotate_angle)
                        for pos, item_data in enumerate(bloco):
                            # A coluna física do verso é o espelho da coluna da
                            # frente; _render_item_back desfaz o espelho para achar
                            # a rotação da célula, então os dois voltam a casar.
                            self._render_item_back(
                                out_page_back, item_data,
                                pos // cols, cols - 1 - (pos % cols), cfg, start_x, start_y
                            )

                if len(doc_out) > 0:
                    out_name = cfg.out_pdf.replace(".pdf", "_02_miolo.pdf")
                    doc_out.save(out_name, garbage=4, deflate=True)
                    self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                doc_out.close()

                if doc_base:
                    doc_base.close()
                for doc in pdf_cache.values():
                    if doc:
                        doc.close()
                self._avisar_refazer_vazio(refazendo, r_de, r_ate, r_set, r_cels)
                print(f"[engine] strict_assembly: Gerado com sucesso (compactado).")
                return

            for set_idx, set_def in enumerate(set_definitions):
                if r_de > 0 and (set_idx + 1) != r_set:
                    continue
                depth = set_def.get("depth", 1)
                stack_size = cfg.sheets_per_block

                for layer_idx in range(depth):
                    doc_out = fitz.open()
                    
                    # 1. Gerar capa para o layer (chunk)
                    if cfg.has_cover and not refazendo:
                        self._generate_capa_for_chunk(set_idx, layer_idx, set_def, cfg, multi_map)
                    
                    # 2. Gerar miolo para o layer
                    start_sheet = layer_idx * stack_size
                    end_sheet = min((layer_idx + 1) * stack_size, set_def["num_sheets"])
                    
                    for sheet_within_set in range(start_sheet, end_sheet):
                        # Se for refazer, filtrar ativamente por faixa de folhas do set
                        sheet_num_in_set = sheet_within_set + 1
                        if r_de > 0 and (sheet_num_in_set < r_de or sheet_num_in_set > r_ate):
                            continue
                            
                        # Frente
                        out_page_front = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
                        if self.rotate_angle > 0:
                            out_page_front.set_rotation(self.rotate_angle)
                            
                        for row in range(rows):
                            for col in range(cols):
                                P = row * cols + col
                                item_data = set_def["cell_allocations"][P][sheet_within_set]
                                if item_data is not None:
                                    self._render_item_front(out_page_front, item_data, row, col, cfg, start_x, start_y)
                                    
                        # Verso (se for duplex)
                        if is_duplex:
                            out_page_back = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
                            if self.rotate_angle > 0:
                                out_page_back.set_rotation(self.rotate_angle)
                                
                            for row in range(rows):
                                for col in range(cols):
                                    col_verso = cols - 1 - col
                                    P_frente = row * cols + col_verso
                                    item_data = set_def["cell_allocations"][P_frente][sheet_within_set]
                                    if item_data is not None:
                                        self._render_item_back(out_page_back, item_data, row, col, cfg, start_x, start_y)
                                        
                    # 3. Salvar miolo para o layer (apenas se gerou alguma folha)
                    if len(doc_out) > 0:
                        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_{layer_idx + 1:02d}_02_miolo.pdf")
                        doc_out.save(out_name, garbage=4, deflate=True)
                        doc_out.close()
                        self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                    else:
                        doc_out.close()
                        
                    # 4. Gerar contracapa para o layer
                    if cfg.has_cover and not refazendo:
                        self._generate_contracapa_for_chunk(set_idx, layer_idx, set_def, cfg)
                    
            # Fechar recursos
            if doc_base:
                doc_base.close()
            for doc in pdf_cache.values():
                if doc:
                    doc.close()
            
            self._avisar_refazer_vazio(refazendo, r_de, r_ate, r_set, r_cels)
            print(f"[engine] strict_assembly: Gerado com sucesso.")
            return

        for S in range(total_sheets):
            set_idx = S // stack_size
            
            # Se for refazer, filtrar ativamente por set e por faixa de folhas do
            # set. Quando se compacta, `S` já é folha de SAÍDA e o filtro de folha
            # de origem foi aplicado ao montar `fontes` — aplicá-lo de novo aqui
            # descartaria as folhas compactadas.
            if r_de > 0 and not empacotando:
                if (set_idx + 1) != r_set:
                    continue
                sheet_num_in_set = (S % stack_size) + 1
                if sheet_num_in_set < r_de or sheet_num_in_set > r_ate:
                    continue
            
            if set_idx != set_idx_current:
                if set_idx_current != -1 and doc_out:
                    # Gravar o miolo do set que acabou NÃO depende do refazer: só a
                    # capa e a contracapa dependem. Antes as duas coisas estavam sob
                    # a mesma condição, e o miolo de um set completo era descartado
                    # em silêncio sempre que um filtro deixasse mais de um set passar.
                    if len(doc_out) > 0 and cfg.has_cover:
                        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx_current + 1}_02_miolo.pdf")
                        doc_out.save(out_name, garbage=4, deflate=True)
                        self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                        if not refazendo:
                            self._generate_contracapa(set_idx_current, cfg, doc_base)
                    doc_out.close()
                    doc_out = fitz.open()

                if cfg.has_cover and not refazendo:
                    self._generate_capa(set_idx, stack_size, poses_per_sheet, cfg, doc_base, total_sheets, multi_map)
                
                set_idx_current = set_idx

            if S % 25 == 0:
                print(f"[engine] sheet {S}/{total_sheets} elapsed={_time.monotonic()-_t0:.1f}s")
            # 1. RENDERIZAR FRENTE DA FOLHA
            out_page_front = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
            if self.rotate_angle > 0:
                out_page_front.set_rotation(self.rotate_angle)

            for row in range(rows):
                for col in range(cols):
                    P = row * cols + col

                    if empacotando:
                        # Folha compactada: esta célula recebe o próximo item da
                        # lista, não o item que a conta de esquema daria. A conta
                        # de esquema já rodou em _indice_de_origem, ao montar a
                        # lista — aqui só se consome, em ordem.
                        k = S * poses_per_sheet + P
                        if k >= len(fontes):
                            continue
                        item_index = fontes[k]
                    elif cfg.layout_schema == "cut_stack":
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
                        
                        item_num_tipo = arte_data.get("num_tipo", "SEQUENCIAL")
                        item_ticket_qtd = int(arte_data.get("ticket_qtd", 1))
                        item_start_base = int(arte_data.get("start_base", 1))
                        item_local_idx = int(arte_data.get("local_idx", 0))
                    else:
                        item_num_tipo = cfg.num_tipo
                        item_ticket_qtd = int(cfg.ticket_qtd)
                        item_start_base = int(cfg.seq_start)
                        item_local_idx = int(item_index)
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
                            if item_num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = int(rotated_el.get("ticket_pos", 1))
                                N = item_ticket_qtd
                                current_val = item_start_base + (item_local_idx * N) + (pos - 1)
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
                            if item_num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = int(rotated_el.get("ticket_pos", 1))
                                N = item_ticket_qtd
                                current_val = item_start_base + (item_local_idx * N) + (pos - 1)
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
                if self.rotate_angle > 0:
                    out_page_back.set_rotation(self.rotate_angle)

                for row in range(rows):
                    for col in range(cols):
                        P = row * cols + col

                        if empacotando:
                            # O MESMO índice que a frente usou nesta célula — a
                            # coluna física vira col_verso mais abaixo. Ler a
                            # lista com o mesmo `k` é o que mantém frente e verso
                            # casados na folha compactada.
                            k = S * poses_per_sheet + P
                            if k >= len(fontes):
                                continue
                            item_index = fontes[k]
                        elif cfg.layout_schema == "cut_stack":
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
                            
                            item_num_tipo = arte_data.get("num_tipo", "SEQUENCIAL")
                            item_ticket_qtd = int(arte_data.get("ticket_qtd", 1))
                            item_start_base = int(arte_data.get("start_base", 1))
                            item_local_idx = int(arte_data.get("local_idx", 0))
                        else:
                            item_num_tipo = cfg.num_tipo
                            item_ticket_qtd = int(cfg.ticket_qtd)
                            item_start_base = int(cfg.seq_start)
                            item_local_idx = int(item_index)

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

                            if item_num_tipo == "TICKET" and rotated_el.get("_num_source", 1) == 1:
                                pos = int(rotated_el.get("ticket_pos", 1))
                                N = item_ticket_qtd
                                current_val = item_start_base + (item_local_idx * N) + (pos - 1)

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
                if len(doc_out) > 0:
                    out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx_current + 1}_02_miolo.pdf")
                    doc_out.save(out_name, garbage=4, deflate=True)
                    self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                    if not refazendo:
                        self._generate_contracapa(set_idx_current, cfg, doc_base)
        else:
            if len(doc_out) > 0:
                doc_out.save(cfg.out_pdf, garbage=4, deflate=True)
                self.generated_files.append({"type": "single", "path": cfg.out_pdf, "name": os.path.basename(cfg.out_pdf)})
        
        self._avisar_refazer_vazio(refazendo, r_de, r_ate, r_set, r_cels)
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
        if self.rotate_angle > 0: p.set_rotation(self.rotate_angle)
        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_03_contracapa.pdf")
        doc_c.save(out_name, garbage=4, deflate=True)
        doc_c.close()
        self.generated_files.append({"type": "contracapa", "path": out_name, "name": os.path.basename(out_name)})

    def _generate_capa(self, set_idx, stack_size, poses_per_sheet, cfg, doc_base, total_sheets, multi_map=None):

        doc_c = fitz.open()
        p = doc_c.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
        if self.rotate_angle > 0: p.set_rotation(self.rotate_angle)
        
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
                
                
                # CAMAROTE: usar "Camarote XX - de 1 a L_CAM" sem zero-padding, com C_INI como início
                if getattr(cfg, 'num_tipo', '') == 'CAMAROTE':
                    camarote_num = cfg.c_ini + (bloco_num - 1)
                    bloco_str = f"Camarote {camarote_num:02d}"
                    sufixo_str = f" - de 1 a {cfg.l_cam}"
                elif getattr(cfg, 'num_tipo', '') == 'TICKET':
                    # TICKET: v_start/v_end são valores de "folha" — multiplicar por ticket_qtd
                    tq = int(getattr(cfg, 'ticket_qtd', 1) or 1)
                    if tq > 1:
                        t_v_start = (v_start - 1) * tq + 1  # folha 1 → ingresso 1
                        t_v_end = v_end * tq                  # folha 50 → ingresso 100
                    else:
                        t_v_start = v_start
                        t_v_end = v_end
                    t_v_start_str = str(t_v_start).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(t_v_start).zfill(4)
                    t_v_end_str = str(t_v_end).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(t_v_end).zfill(4)
                    bloco_str = f"Bloco {bloco_num:02d}"
                    sufixo_str = f" - de {t_v_start_str} a {t_v_end_str}"
                else:
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
                
                item_num_tipo = item_data.get("num_tipo", "SEQUENCIAL")
                if item_num_tipo == "TICKET" and el.get("_num_source", 1) == 1:
                    pos = int(el.get("ticket_pos", 1))
                    N = int(item_data.get("ticket_qtd", 1))
                    current_val = item_data.get("start_base", 1) + (item_data.get("local_idx", 0) * N) + (pos - 1)
                
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
                
                item_num_tipo = item_data.get("num_tipo", "SEQUENCIAL")
                if item_num_tipo == "TICKET" and el.get("_num_source", 1) == 1:
                    pos = int(el.get("ticket_pos", 1))
                    N = int(item_data.get("ticket_qtd", 1))
                    current_val = item_data.get("start_base", 1) + (item_data.get("local_idx", 0) * N) + (pos - 1)
                
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
                
                item_num_tipo = item_data.get("num_tipo", "SEQUENCIAL")
                if item_num_tipo == "TICKET" and el.get("_num_source", 1) == 1:
                    pos = int(el.get("ticket_pos", 1))
                    N = int(item_data.get("ticket_qtd", 1))
                    current_val = item_data.get("start_base", 1) + (item_data.get("local_idx", 0) * N) + (pos - 1)
                
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
                
                item_num_tipo = item_data.get("num_tipo", "SEQUENCIAL")
                if item_num_tipo == "TICKET" and el.get("_num_source", 1) == 1:
                    pos = int(el.get("ticket_pos", 1))
                    N = int(item_data.get("ticket_qtd", 1))
                    current_val = item_data.get("start_base", 1) + (item_data.get("local_idx", 0) * N) + (pos - 1)
                
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
        if self.rotate_angle > 0:
            p.set_rotation(self.rotate_angle)
        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_{layer_idx + 1:02d}_03_contracapa.pdf")
        doc_c.save(out_name, garbage=4, deflate=True)
        doc_c.close()
        self.generated_files.append({"type": "contracapa", "path": out_name, "name": os.path.basename(out_name)})

    def _generate_capa_for_chunk(self, set_idx, layer_idx, set_def, cfg, multi_map):
        doc_c = fitz.open()
        p = doc_c.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
        if self.rotate_angle > 0:
            p.set_rotation(self.rotate_angle)

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


                # CAMAROTE: usar "Camarote XX - de 1 a L_CAM" sem zero-padding, com C_INI como início
                if getattr(cfg, 'num_tipo', '') == 'CAMAROTE':
                    camarote_num = cfg.c_ini + (bloco_num - 1)
                    bloco_str = f"Camarote {camarote_num:02d}"
                    sufixo_str = f" - de 1 a {cfg.l_cam}"
                elif getattr(cfg, 'num_tipo', '') == 'TICKET':
                    # TICKET: v_start/v_end são valores de "folha", não de ingresso
                    # Cada folha contém ticket_qtd ingressos
                    # v_start=1, v_end=50 com ticket_qtd=2 → range real = 0001 a 0100
                    tq = int(getattr(cfg, 'ticket_qtd', 1) or 1)
                    if tq > 1:
                        t_v_start = (v_start - 1) * tq + 1  # folha 1 → ingresso 1
                        t_v_end = v_end * tq                  # folha 50 → ingresso 100
                    else:
                        t_v_start = v_start
                        t_v_end = v_end
                    t_v_start_str = str(t_v_start).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(t_v_start).zfill(4)
                    t_v_end_str = str(t_v_end).zfill(cfg.seq_zeros) if hasattr(cfg, 'seq_zeros') and cfg.seq_zeros else str(t_v_end).zfill(4)
                    bloco_str = f"Bloco {bloco_num:02d}"
                    sufixo_str = f" - de {t_v_start_str} a {t_v_end_str}"
                else:
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

    def _avisar_refazer_vazio(self, refazendo, r_de, r_ate, r_set, r_cels):
        """Recusa um refazer que não casou com folha nenhuma.

        Substitui o antigo `_apply_refazer_filter`, que era um `return` puro
        deixado para trás quando o filtro passou a ser aplicado dentro do laço.
        O problema real que sobrou não era o filtro e sim o silêncio: uma faixa
        fora do intervalo produzia zero páginas, nenhum arquivo era emitido e o
        operador via a tela dizer que tinha terminado. Numa gráfica isso vira
        uma pilha de papel que ninguém reimprimiu.
        """
        if not refazendo or self.generated_files:
            return
        alvo = []
        if r_de > 0:
            alvo.append(f"folhas {r_de}-{r_ate} do set {r_set}")
        if r_cels:
            alvo.append("posicoes " + ",".join(str(c) for c in r_cels))
        raise ValueError(
            "Refazer: nada corresponde a " + " e ".join(alvo)
            + ". Confira a faixa de folhas e as posicoes pedidas."
        )
