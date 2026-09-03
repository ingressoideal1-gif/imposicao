import base64
import hashlib
import math
import os
import io
import tempfile
import fitz       # PyMuPDF
import qrcode
from PIL import Image

import color_profiles

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

# Cache dos objetos fitz.Font usados só para perguntar se um glifo existe.
# Chave: o nome do recurso no PDF (que já é único por arquivo).
_glyph_font_cache: dict = {}


def _avisar_glifos_faltando(font_name: str, family: str, texto: str,
                            font_bytes: bytes = None) -> None:
    """Grita no log quando a fonte não tem um caractere do texto.

    ## Por que isto existe

    O `insert_text` do PyMuPDF não empresta glifo de outra fonte: o caractere
    que falta sai como um vão, e o PDF fica pronto sem erro nenhum. O navegador
    faz o contrário — troca de fonte só naquele caractere, em silêncio — então a
    tela mostra o nome inteiro e o papel sai furado.

    Foi assim que o pedido 20495 imprimiu 185 credenciais em 11/08/2026: a
    Gotham Book não tem `ř`, `ě` nem `č`, "Ondřej Pek" virou "Ond ej Pek", e
    dois modelos voltaram REPROVADA_CLIENTE. O painel agora tranca o modelo
    antes disso (`fonteSemGlifoDoModelo`), mas este aviso é a última defesa:
    pega o caminho que não passa pela tela — hotfolder, reimpressão, API.

    Nunca levanta e nunca muda o desenho: um erro aqui pararia uma impressão que
    ia sair de qualquer jeito.
    """
    try:
        # ── DOIS CAMINHOS, PORQUE SAO DOIS DEFEITOS DIFERENTES ──
        #
        # Fonte EMBUTIDA (temos os bytes): o `has_glyph` do arquivo e a verdade,
        # e o que falta sai como VAO. Foi o que se mediu na Gotham Book:
        # "Ondřej Pek" volta do PDF como "Ond ej Pek".
        #
        # Base-14 (`helv`, `times`, `cour`): NAO da para perguntar ao
        # `fitz.Font(fontname=...)`. Nesta versao do PyMuPDF ele devolve uma
        # fonte completa, que tem o `ř` — mas o que vai para o PDF e a Base-14
        # com encoding WinAnsi, e ali o `ř` nem sequer existe como byte. Medido:
        # `insert_text` com `helv` grava "Ond·ej Pek". Nao e um vao, e um
        # caractere TROCADO, que e pior: o operador nem estranha um buraco.
        # A pergunta certa, entao, e se o caractere cabe no cp1252.
        if font_bytes:
            fonte = _glyph_font_cache.get(font_name)
            if fonte is None:
                fonte = fitz.Font(fontbuffer=font_bytes)
                _glyph_font_cache[font_name] = fonte
            desenha = lambda c: bool(fonte.has_glyph(ord(c)))
            estrago = "sai como VAO no papel"
        else:
            def desenha(c):
                try:
                    c.encode("cp1252")
                    return True
                except (UnicodeEncodeError, LookupError):
                    return False
            estrago = "sai TROCADO por outro no papel (fonte embutida do PDF, WinAnsi)"

        # Caractere de controle nao e desenhado por fonte nenhuma; acusar um
        # byte perdido no CSV seria ruido no log que ninguem mais leria.
        def _controle(c):
            n = ord(c)
            return n < 0x20 or n == 0x7F or 0x80 <= n <= 0x9F

        faltam = []
        for ch in str(texto or ""):
            if _controle(ch) or ch in faltam:
                continue
            if not desenha(ch):
                faltam.append(ch)
        for ch in faltam:
            chave = "glifo:%s:%s" % (font_name, ch)
            if chave in _font_log_cache:
                continue
            _font_log_cache.add(chave)
            print("[engine] ATENCAO: a fonte '%s' nao desenha '%s' (U+%04X) — ele %s. Texto: %r"
                  % (family or font_name, ch, ord(ch), estrago, str(texto)[:60]))
    except Exception:
        pass


def _nome_de_fonte_para_pdf(familia: str, chave_unica) -> str:
    """O nome com que a fonte entra no PDF — que não é o nome da família.

    ## Por que não dá para usar a família direto

    O `insert_font` do PyMuPDF recusa espaço no nome:

        Erro: bad fontname chars {' '}

    Foi o que apareceu na impressão de 17/08/2026, assim que `Comic Sans MS`
    passou a ser embutida de verdade. `Arial` sempre passou por não ter espaço.

    ## Por que não basta tirar o espaço

    O nome também é a CHAVE com que a página guarda o recurso. Dois arquivos
    diferentes registrados com o mesmo nome não dão erro — o segundo é ignorado,
    e o texto sai desenhado com a fonte do primeiro. A numeração do 19775 tem
    `Comic Sans MS` e `Comic Sans MS|bold` na mesma página: sanitizar sem
    distinguir trocaria um erro visível por um defeito calado.

    Daí a `chave_unica`: os bytes da fonte, quando já se tem os bytes, ou o
    caminho do arquivo, para o ramo que ainda vai baixá-lo. Igual dá igual — e
    isso importa, porque é o que faz a mesma fonte repetida em cem células
    reusar um recurso só em vez de inchar o PDF com cem cópias.
    """
    import hashlib
    import re

    base = re.sub(r"[^A-Za-z0-9]", "", familia or "")
    if not base or base[0].isdigit():
        base = "F" + base

    dados = chave_unica if isinstance(chave_unica, bytes) else str(chave_unica).encode("utf-8")
    return base + hashlib.md5(dados).hexdigest()[:8]


# `fitz.Font` por arquivo de fonte. Sao ~300 KB cada, e a medicao roda uma vez
# por linha, em milhares de celulas: reler o arquivo a cada texto seria trocar
# uma conta por um acesso a disco no caminho de quem espera na impressora.
_MEDIDORES: dict = {}

# Meia letra por caractere. Era o que este arquivo usava quando nao sabia medir,
# e continua valendo como ultimo recurso — imposicao que nao sai e pior do que
# texto fora do lugar.
_LARGURA_POR_CARACTERE = 0.55


def _largura_do_texto(texto: str, font_file, font_name: str, corpo: float) -> float:
    """Quanto este texto ocupa na horizontal, em pontos.

    ## Por que existe

    O motor tinha duas réguas. Sem fonte embutida ele media de verdade, com
    `fitz.get_text_length`; com fonte embutida ele **chutava** meia letra por
    caractere, porque aquela função só conhece as Base-14.

    Medido contra a Comic Sans real, corpo 12:

        "12345"                          real  34,70 pt   chute  33,00 pt
        "CAMAROTE PREMIUM - SETOR A"      real 195,23 pt   chute 171,60 pt
        "Ingresso Inteira Pista Premium"  real 174,71 pt   chute 198,00 pt

    Como a centralização é `x = cx - largura/2`, metade do erro vira
    deslocamento: 0,3 mm num número curto — ninguém vê — e 4 mm num texto longo.
    Texto longo é justamente onde se usa "Largura máxima (mm)", e foi assim que o
    defeito apareceu, em 17/08/2026, parecendo exclusivo daquele recurso.

    O mesmo chute decidia também o corpo no modo "shrink": um texto que o motor
    julgava caber podia estourar a largura máxima no papel.

    `fitz.Font(fontbuffer=...)` mede o arquivo de verdade, e é o que se usa aqui.
    """
    if not font_file:
        return fitz.get_text_length(texto, fontname=font_name, fontsize=corpo)

    medidor = _MEDIDORES.get(font_file)
    if medidor is None:
        try:
            with open(font_file, "rb") as fh:
                medidor = fitz.Font(fontbuffer=fh.read())
        except Exception as e:
            medidor = False
            _aviso = f"medicao:{font_file}"
            if _aviso not in _font_log_cache:
                _font_log_cache.add(_aviso)
                print(f"[engine] nao consegui medir com a fonte embutida ({e}); "
                      f"usando a estimativa por caractere", flush=True)
        _MEDIDORES[font_file] = medidor

    if not medidor:
        return corpo * _LARGURA_POR_CARACTERE * len(texto)
    return medidor.text_length(texto, fontsize=corpo)

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


def _opacidade_arte(el: dict) -> float:
    """Opacidade de um elemento PDF/SVG, de 0 (invisivel) a 1 (opaco).

    Campo ausente vale 1: todo o acervo anterior a este recurso foi gravado sem
    ele e precisa continuar saindo exatamente como sempre saiu. Valor invalido
    tambem cai para 1 — diante de lixo, imprimir opaco e o unico erro seguro,
    porque nao some com arte nenhuma.
    """
    v = el.get("opacity", None)
    if v is None or v == "":
        return 1.0
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 1.0
    if n != n:  # NaN
        return 1.0
    return max(0.0, min(1.0, n))


_FRACOES_DO_MEIO: dict = {}
_FRACAO_PADRAO = (_ASCENDER_DEFAULT - _DESCENDER_DEFAULT) / 2.0


def _fracao_tipografica(asc: float, desc: float) -> float:
    """A distancia do centro visual ate a linha de base, em fracao do corpo.

    E a conta que o navegador faz para `textBaseline='middle'`: ele toma o
    ascendente e o descendente TIPOGRAFICOS da fonte, normaliza os dois para que
    somem o corpo, e poe o centro no meio disso. Em formula:

        deslocamento = corpo x ( asc / (asc + |desc|) - 0,5 )

    Conferido em nove fontes contra o Chrome, em 27/08/2026: bate ate a quinta
    casa decimal. O motor fazia `(asc - desc) / 2`, que so coincide quando os dois
    somam exatamente 1 — e quase nenhuma fonte real soma.
    """
    total = abs(asc) + abs(desc)
    if total <= 0:
        return _FRACAO_PADRAO
    return abs(asc) / total - 0.5


def _fracao_das_base14(font_name: str) -> float:
    """A mesma fracao para as seis fontes embutidas no PDF.

    A tela nao desenha Helvetica: ela desenha Arial, que e a substituta do
    `getFontCSS`. As duas tem praticamente a mesma proporcao vertical — medido,
    0,27622 contra 0,27575, dois milesimos de milimetro no corpo 12 —, entao a
    formula unica serve as duas pontas sem tabela de excecao.
    """
    asc = ASCENDER_FRACTIONS.get(font_name, _ASCENDER_DEFAULT)
    desc = DESCENDER_FRACTIONS.get(font_name, _DESCENDER_DEFAULT)
    return _fracao_tipografica(asc, desc)


def _fracao_do_meio_da_fonte(font_file: str) -> float:
    """A fracao lida do ARQUIVO da fonte — `sTypoAscender` e `sTypoDescender`.

    Le a tabela OS/2 direto dos bytes. Nao da para usar `fitz.Font.ascender`: ele
    devolve as medidas da tabela `hhea`, que sao outras. Medido nas mesmas nove
    fontes, a `hhea` erra ate 0,049 do corpo — quatro vezes mais do que a media
    fixa que ela substituiria.

    Cacheado por caminho: uma tiragem de 100.000 pecas le o arquivo uma vez.

    Arquivo que nao se deixa ler volta para a media de sempre. Uma fonte
    estranha nao pode ser motivo de a imposicao morrer com o operador na frente
    da impressora — e o pior caso e voltar ao comportamento anterior.
    """
    if font_file in _FRACOES_DO_MEIO:
        return _FRACOES_DO_MEIO[font_file]

    fracao = _FRACAO_PADRAO
    try:
        import struct
        with open(font_file, "rb") as fh:
            dados = fh.read()
        if dados[:4] == b"ttcf":                      # colecao: a primeira fonte
            offset_tabelas = struct.unpack(">I", dados[12:16])[0]
        else:
            offset_tabelas = 0
        num = struct.unpack(">H", dados[offset_tabelas + 4:offset_tabelas + 6])[0]
        base = offset_tabelas + 12
        os2 = None
        for i in range(num):
            reg = base + i * 16
            if dados[reg:reg + 4] == b"OS/2":
                ini, tam = struct.unpack(">II", dados[reg + 8:reg + 16])
                os2 = dados[ini:ini + tam]
                break
        if os2 and len(os2) >= 74:
            typo_asc, typo_desc = struct.unpack(">hh", os2[68:72])
            if typo_asc or typo_desc:
                fracao = _fracao_tipografica(typo_asc, typo_desc)
    except Exception as ex:
        _aviso = f"metrica:{font_file}"
        if _aviso not in _font_log_cache:
            _font_log_cache.add(_aviso)
            print(f"[engine] nao consegui ler a altura da fonte ({ex}); "
                  f"usando a media de sempre", flush=True)

    _FRACOES_DO_MEIO[font_file] = fracao
    return fracao


def _caixa_girada(cx: float, cy: float, w_pt: float, h_pt: float, angle) -> fitz.Rect:
    """O retangulo do elemento na pagina, com a CAIXA girada junto.

    Girar 90 graus troca largura por altura — e assim que o canvas de todas as
    janelas desenha: `translate` na ancora, `rotate`, e a caixa desenhada em
    volta. O motor mantinha o retangulo em pe e mandava o PyMuPDF girar o
    CONTEUDO dentro dele; como PDF, SVG e foto entram com encaixe proporcional, a
    arte encolhia para caber no que sobrava.

    Medido em 27/08/2026, num SVG de 40 x 20 mm a 90 graus: a tela mostrava
    20 x 40 mm e o papel saia com 10,08 x 19,98 — um quarto da area. Numa janela
    de foto de 25 x 32, o papel saia com 25,06 x 19,64 no lugar de 32 x 25.

    A rotacao e um seletor de quatro opcoes no cartao de todo elemento, entao o
    defeito estava a um clique. Fora dos quatro valores o retangulo fica como
    estava: o `show_pdf_page` e o `insert_image` so aceitam multiplos de 90.
    """
    try:
        giro = int(angle or 0) % 360
    except (TypeError, ValueError):
        giro = 0
    if giro in (90, 270):
        w_pt, h_pt = h_pt, w_pt
    return fitz.Rect(cx - w_pt / 2.0, cy - h_pt / 2.0,
                     cx + w_pt / 2.0, cy + h_pt / 2.0)


def _folga_de_sangria(cfg) -> tuple[float, float]:
    """Quanto a pagina temporaria de um ingresso cresce para cada lado, em pontos.

    ## Por que ela existe

    O motor monta o ingresso numa pagina temporaria quando a pose tem giro (ou
    quando a folha leva o nome da arte). Essa pagina era do tamanho EXATO do
    ingresso — e uma pagina de PDF recorta o proprio conteudo na borda. Tudo o
    que passava do corte deixava de existir: a SANGRIA, que e justamente a sobra
    que protege do desvio da guilhotina.

    Na pose SEM giro nada disso acontece: arte e elementos vao direto na folha,
    em coordenadas absolutas, e a sangria sai no papel. Ou seja, a MESMA folha
    imprimia de dois jeitos. Medido em 27/08/2026 no formato `Credencial 90x140`,
    que gira as poses 2 e 3 em 180 graus: poses 0 e 1 com 2,45 mm de sangria,
    poses 2 e 3 com 0,00 mm. Metade das credenciais de cada folha saia aparada.

    ## Por que um ingresso inteiro para cada lado

    Porque nao ha o que estimar. Medir a sobra de cada elemento antes de desenhar
    exigiria adivinhar a largura de um texto que ainda nao foi montado, e um chute
    que erra para menos volta a aparar em silencio. Um ingresso de folga cobre
    qualquer sangria concebivel — a de norma tem 3 mm — e para de custar ai: a
    area extra e transparente, entao ela nao pinta nada nem cobre a celula
    vizinha. O que cresce e a caixa da pagina, nao o desenho.

    A folga e SIMETRICA de proposito: o centro da pagina continua sendo o centro
    do ingresso, entao o giro segue em torno do mesmo ponto e a arte cai no mesmo
    lugar de sempre. Quem cola na folha estica o retangulo da celula na mesma
    medida, e a escala continua 1:1.
    """
    return cfg.item_w, cfg.item_h


def _escala_da_arte(cfg, arte_data=None) -> tuple[float, float]:
    """A escala da camada de arte deste modelo, em fracao (1.0 = 100%).

    Numa folha de UM modelo ela vem do trabalho (`cfg`). Numa folha que combina
    modelos, cada arte carrega a sua — o modelo A pode estar a 98% e o B a 100%
    na mesma folha —, e o `cfg` fica de reserva para a arte que nao trouxe nada.
    """
    def _ler(valor, reserva):
        try:
            v = float(valor)
        except (TypeError, ValueError):
            return reserva
        # Escala zero ou negativa nao existe: seria arte invisivel, ou virada do
        # avesso, sem ninguem ter pedido. Nesse caso vale o tamanho natural.
        return v / 100.0 if v > 0 else reserva

    sx = getattr(cfg, "arte_sx", 1.0)
    sy = getattr(cfg, "arte_sy", 1.0)
    if arte_data:
        sx = _ler(arte_data.get("escala_h"), sx)
        sy = _ler(arte_data.get("escala_v"), sy)
    return sx, sy


def _arte_na_celula(cfg, x0_celula, y0_celula, base_w, base_h, src_rect, sx, sy):
    """Onde a arte entra na celula e que pedaco dela aparece.

    Devolve `(rect_destino, clip_na_origem)`, prontos para o `show_pdf_page`, ou
    `(None, None)` quando nao sobra nada visivel.

    ## A 100% nada muda

    Com `sx == sy == 1.0` esta funcao devolve exatamente o retangulo que o motor
    sempre montou — a arte no tamanho natural do arquivo, centralizada na celula,
    mais o deslocamento do formato — e a pagina inteira como clip. E o mesmo
    desenho de antes, byte a byte: os milhares de trabalhos que ja passaram por
    aqui nao mudam por causa desta funcao.

    ## O que a escala faz

    Estica a arte em torno do CENTRO da celula, cada eixo por conta propria — foi
    o pedido: "% horizontal e % vertical", "mantem centralizado a celula". O
    centro nao se move, entao aumentar sobra dos dois lados iguais e diminuir
    encolhe para dentro pelos quatro lados.

    NADA E RASTERIZADO. Esticar um PDF colado por `show_pdf_page` e trocar o
    retangulo de destino: o conteudo continua vetor, o texto continua texto, e
    quem decide a resolucao continua sendo o RIP da impressora.
    `keep_proportion=False` e obrigatorio no chamador — com `True` o PyMuPDF
    recusaria esticar em eixos diferentes e encaixaria a arte proporcionalmente,
    ignorando em silencio metade do que o operador digitou.

    ## Ate onde a arte pode crescer

    Regra dada pelo usuario em 31/08/2026: recorta na celula mais a sangria,
    nenhum ingresso invade o vizinho. Aqui isso vira o maior entre dois limites:

    · A celula mais METADE do vao ate a celula ao lado (`gap_h`/`gap_v`). E o
      espaco fisico que existe na folha antes de encostar na arte da vizinha, e e
      exatamente onde a sangria deve morar. Com vao zero, o limite e o corte.

    · O espaco que a arte JA ocupava a 100%. Sem isto, uma arte que hoje nasce
      maior que a celula — e que hoje passa por cima da vizinha, porque o motor
      nunca a aparou — encolheria de repente ao receber 100,1%, e o operador
      veria a escala CORTAR ao mandar aumentar.

    O recorte e feito no CLIP DA ORIGEM, e nao com uma mascara por cima: o
    pedaco que nao cabe simplesmente nao e colado. Isso mantem o arquivo limpo e
    o resultado igual no papel e na tela.
    """
    largura = base_w * sx
    altura = base_h * sy
    x0 = x0_celula + (cfg.item_w - largura) / 2 + cfg.offset_h
    y0 = y0_celula + (cfg.item_h - altura) / 2 - cfg.offset_v
    destino = fitz.Rect(x0, y0, x0 + largura, y0 + altura)

    if sx == 1.0 and sy == 1.0:
        return destino, src_rect

    folga_x = max(cfg.gap_h / 2.0, (base_w - cfg.item_w) / 2.0, 0.0)
    folga_y = max(cfg.gap_v / 2.0, (base_h - cfg.item_h) / 2.0, 0.0)
    limite = fitz.Rect(
        x0_celula - folga_x + cfg.offset_h,
        y0_celula - folga_y - cfg.offset_v,
        x0_celula + cfg.item_w + folga_x + cfg.offset_h,
        y0_celula + cfg.item_h + folga_y - cfg.offset_v,
    )

    visivel = destino & limite
    if visivel.is_empty or destino.width <= 0 or destino.height <= 0:
        return None, None
    if visivel.x0 <= destino.x0 and visivel.y0 <= destino.y0 \
            and visivel.x1 >= destino.x1 and visivel.y1 >= destino.y1:
        return destino, src_rect

    # De volta as coordenadas da pagina de origem: a mesma proporcao, porque
    # `keep_proportion=False` faz o mapeamento ser linear nos dois eixos.
    fx0 = (visivel.x0 - destino.x0) / destino.width
    fx1 = (visivel.x1 - destino.x0) / destino.width
    fy0 = (visivel.y0 - destino.y0) / destino.height
    fy1 = (visivel.y1 - destino.y0) / destino.height
    clip = fitz.Rect(
        src_rect.x0 + fx0 * src_rect.width,
        src_rect.y0 + fy0 * src_rect.height,
        src_rect.x0 + fx1 * src_rect.width,
        src_rect.y0 + fy1 * src_rect.height,
    )
    return visivel, clip


def _colar_arte_pdf(doc, page, rect, doc_origem, py_rotate, opacidade):
    """Cola a primeira pagina de `doc_origem` em `rect`, com opacidade.

    NADA E RASTERIZADO. A arte do cliente entra como veio — vetor continua
    vetor, texto continua texto, a cor nao e convertida. A transparencia usa o
    mecanismo do proprio formato PDF: um ExtGState com /ca e /CA, que existe
    desde o PDF 1.4 e diz ao equipamento "pinte isto a tantos por cento". Quem
    achata, quando achata, e o RIP da impressora, na resolucao dele.

    Duas coisas que parecem detalhe e nao sao:

    · O GRUPO DE TRANSPARENCIA (/Group) e obrigatorio. Sem ele o /ca vale por
      operacao de pintura, e duas formas da MESMA arte que se sobrepoem se
      enxergam uma pela outra: medido, a sobreposicao saia (189, 0, 64) contra
      (126, 0, 128) da camada unica. Com o grupo, o elemento e composto como
      uma peca so e os dois pontos dao a mesma cor.

    · O ExtGState vale so para o fluxo de conteudo DESTE elemento, envolvido em
      q/Q. Sem esse cerco a opacidade vazaria para tudo que fosse desenhado
      depois na mesma folha — a numeracao, o picote, o proximo modelo.

    A 100% (o padrao) nada disto acontece: a chamada e exatamente o
    `show_pdf_page` de sempre, e a pagina nao ganha ExtGState nem grupo.
    """
    if opacidade >= 1.0:
        page.show_pdf_page(
            rect, doc_origem, 0,
            keep_proportion=True, rotate=py_rotate, clip=doc_origem[0].rect,
        )
        return

    if opacidade <= 0.0:
        return  # invisivel: nada a colar

    antes = set(page.get_contents())
    xref_form = page.show_pdf_page(
        rect, doc_origem, 0,
        keep_proportion=True, rotate=py_rotate, clip=doc_origem[0].rect,
    )
    novos = [x for x in page.get_contents() if x not in antes]

    if len(novos) != 1:
        # O cerco q/Q depende de o show_pdf_page ter deixado um fluxo proprio, e
        # ele sempre deixou. Se um dia deixar de deixar, e melhor parar do que
        # imprimir com a opacidade vazando para o resto da folha.
        raise RuntimeError(
            "nao foi possivel isolar o desenho para aplicar a opacidade "
            f"(fluxos novos: {len(novos)})"
        )

    # Sem /CS de proposito: o grupo herda o espaco de cor de mistura da pagina.
    # Fixar /DeviceRGB aqui obrigaria uma folha CMYK a misturar em RGB, que numa
    # grafica e deslocamento de cor. Medido: com CS, sem CS e com o grupo minimo
    # dao o mesmo resultado, entao o que nao e necessario nao entra.
    doc.xref_set_key(xref_form, "Group", "<</S/Transparency/I false/K false>>")

    # Nome derivado do valor: dois elementos com a mesma opacidade compartilham
    # o estado, e cada valor diferente ganha o seu.
    nome = "IdealAlfa%03d" % round(opacidade * 100)
    tipo, val = doc.xref_get_key(page.xref, "Resources")
    res = int(val.split()[0]) if tipo == "xref" else page.xref
    chave = "ExtGState" if res != page.xref else "Resources/ExtGState"
    tipo_gs, val_gs = doc.xref_get_key(res, chave)
    corpo = "<</Type/ExtGState/ca %g/CA %g/BM/Normal>>" % (opacidade, opacidade)
    if tipo_gs == "xref":
        doc.xref_set_key(int(val_gs.split()[0]), nome, corpo)
    else:
        if tipo_gs == "null":
            doc.xref_set_key(res, chave, "<<>>")
        doc.xref_set_key(res, chave + "/" + nome, corpo)

    fluxo = novos[0]
    doc.update_stream(
        fluxo,
        ("q /%s gs\n" % nome).encode("ascii") + doc.xref_stream(fluxo) + b"\nQ",
    )


def _linha_do_banco(item_data: dict | None, indice: int, csv_data: list | None):
    """A linha do banco de dados (CSV) que ESTE item imprime.

    Numa folha com modelos somados cada arte traz o proprio banco, ja recortado
    na fatia daquele modelo, e a linha viaja dentro do item em `csv_row`. Fora
    desse caso vale o banco unico do trabalho, indexado pela posicao do item —
    que e como sempre funcionou e continua funcionando.

    Duas guardas que parecem detalhe e nao sao:

    * **Arte com banco proprio nunca cai no banco do trabalho.** Se o item passou
      do fim da fatia dele, a resposta e "nao ha linha" — nao a linha de outro
      modelo. Sem isso, a credencial da Bulgaria sairia com o nome de alguem do
      Chile, e so o cliente descobriria.
    * **O indice e conferido.** Ate a v630 os tres pontos do laco principal
      faziam `cfg.csv_data[item_index]` sem limite: somar modelos cuja tiragem
      passasse do banco principal estourava `IndexError` no meio da geracao, com
      o operador na frente da impressora.
    """
    if item_data:
        linha = item_data.get("csv_row")
        if linha is not None:
            return linha
        if item_data.get("csv_proprio"):
            return None
    if csv_data and 0 <= indice < len(csv_data):
        return csv_data[indice]
    return None


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


# ---------------------------------------------------------------------------
# O numero do modelo na borda do item
# ---------------------------------------------------------------------------
# Os padroes abaixo reproduzem, ponto por ponto, o que o motor imprimia antes de
# 03/09/2026: corpo 14, na borda esquerda, deitado. Ate essa data so a COR era
# configuravel — tamanho, posicao e giro estavam escritos no meio do motor, em
# tres copias. Mexer nestes padroes muda o papel de trabalhos que a grafica ja
# aprovou: eles existem justamente para NAO mudar nada.
_NOME_CORPO_PADRAO = 14.0
_NOME_CORPO_MIN = 6.0
_NOME_CORPO_MAX = 24.0
_NOME_POSICAO_PADRAO = "esquerda"
_NOME_POSICOES = ("esquerda", "direita", "topo", "base")
_NOME_GIRO_PADRAO = 90
_NOME_GIROS = (0, 90, 180, 270)

# Impact e a fonte deste numero desde sempre; `hebo` (Helvetica Bold) e a
# reserva de quem nao a tem instalada — o Linux, por exemplo.
_NOME_IMPACT_CANDIDATOS = (
    "C:/Windows/Fonts/impact.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
    "/usr/share/fonts/impact/impact.ttf",
)

# Para onde o texto corre na pagina, por giro. Medido com o `morph` de -giro que
# esta funcao monta: 0 corre para a direita, 90 para CIMA, 180 para a esquerda e
# 270 para baixo.
_NOME_DIRECAO = {0: (1.0, 0.0), 90: (0.0, -1.0), 180: (-1.0, 0.0), 270: (0.0, 1.0)}


def _numero_do_modelo_corpo(item: dict) -> float:
    """O corpo da fonte pedido em `nome_size`, ou o de sempre.

    Fora da faixa, vazio ou nao numerico cai no padrao calado. Quem preenche
    isto e a tela, e uma folha que nao sai custa mais a grafica do que um numero
    de conferencia no corpo de sempre.
    """
    try:
        corpo = float(item.get("nome_size", _NOME_CORPO_PADRAO))
    except (TypeError, ValueError):
        return _NOME_CORPO_PADRAO
    # `nan` nao passa em comparacao nenhuma, entao cai aqui tambem.
    if not (_NOME_CORPO_MIN <= corpo <= _NOME_CORPO_MAX):
        return _NOME_CORPO_PADRAO
    return corpo


def _numero_do_modelo_posicao(item: dict) -> str:
    """A borda pedida em `nome_pos`, ou a esquerda de sempre."""
    posicao = str(item.get("nome_pos", _NOME_POSICAO_PADRAO) or "").strip().lower()
    return posicao if posicao in _NOME_POSICOES else _NOME_POSICAO_PADRAO


def _numero_do_modelo_giro(item: dict) -> int:
    """O giro pedido em `nome_rot`, ou os 90 graus de sempre."""
    try:
        giro = int(float(item.get("nome_rot", _NOME_GIRO_PADRAO)))
    except (TypeError, ValueError):
        return _NOME_GIRO_PADRAO
    return giro if giro in _NOME_GIROS else _NOME_GIRO_PADRAO


def _desenhar_numero_do_modelo(page, item: dict, fx: float, fy: float, cfg) -> None:
    """Escreve o numero do modelo na borda da celula, na pagina temporaria.

    ## Por que existe

    Este desenho era o MESMO codigo copiado em tres pontos do motor: o ramo de
    reserva do laco principal, o `_render_item_front` e o `_render_item_back`.
    Os tres tinham de concordar e nada os obrigava — mexer num e esquecer os
    outros faz o verso sair diferente da frente, e a folha combinada diferente
    das duas. E o tipo de divergencia que so aparece no papel.

    ## A geometria

    O texto fica ENCOSTADO na borda escolhida e CENTRALIZADO ao longo dela. O
    recuo da borda e o proprio corpo da fonte, medido ate a LINHA DE BASE — e o
    que o motor sempre fez no unico caso que existia (`esquerda` + `90`), e
    passar a medir ate a caixa do glifo moveria o que a grafica ja aprovou.

    `esquerda` + `90` continua dando, exatamente:

        x = fx + corpo
        y = fy + (item_h + largura_do_texto) / 2

    As outras combinacoes saem da mesma regra. Quando o texto corre PARALELO a
    borda (`topo` + `0`), centralizar ao longo dela e obvio. Quando ele corre
    PERPENDICULAR a ela (`esquerda` + `0`, o texto entrando na celula), encostar
    vale para a PONTA: a extremidade mais proxima da borda e que fica no recuo, e
    o resto do texto entra na celula. Centralizar o MEIO do texto sobre a linha
    do recuo jogaria metade dele para fora do papel.
    """
    nome = item.get("nome", "")
    if not nome:
        return

    texto = str(nome).zfill(6)
    corpo = _numero_do_modelo_corpo(item)
    posicao = _numero_do_modelo_posicao(item)
    giro = _numero_do_modelo_giro(item)
    cor = _hex_to_rgb(item.get("nome_color", "#000000"))

    arquivo_impact = next(
        (caminho for caminho in _NOME_IMPACT_CANDIDATOS if os.path.exists(caminho)),
        None)
    fonte_para_medir = "Impact" if arquivo_impact else "hebo"
    # A mesma regua do resto do motor. Ate 17/08/2026 isto era
    # `get_text_length(..., fontfile=...)`, que levanta TypeError — a funcao nao
    # aceita esse argumento. O `except` de entao engolia, entao a largura era
    # SEMPRE o chute, com Impact ou sem ela.
    largura = _largura_do_texto(texto, arquivo_impact, fonte_para_medir, corpo)

    dx, dy = _NOME_DIRECAO[giro]
    # Quanto o texto avanca para cada lado da origem, em cada eixo da pagina. Um
    # dos dois pares e sempre (0, 0): o texto corre num eixo so.
    avanco_x = (min(0.0, largura * dx), max(0.0, largura * dx))
    avanco_y = (min(0.0, largura * dy), max(0.0, largura * dy))
    recuo = corpo

    # A conta do centro fica como `(medida - avanco) / 2` de proposito, e nao
    # como `medida / 2 - avanco / 2`: assim o caso `esquerda` + `90` recai na
    # expressao literal que o motor sempre teve, `fy + (item_h + largura) / 2`,
    # e sai BIT A BIT igual. Reassociar mudaria a ultima casa do float e a
    # regressao passaria despercebida.
    if posicao in ("esquerda", "direita"):
        if posicao == "esquerda":
            x = fx + recuo - avanco_x[0]
        else:
            x = fx + cfg.item_w - recuo - avanco_x[1]
        y = fy + (cfg.item_h - (avanco_y[0] + avanco_y[1])) / 2.0
    else:
        x = fx + (cfg.item_w - (avanco_x[0] + avanco_x[1])) / 2.0
        if posicao == "topo":
            y = fy + recuo - avanco_y[0]
        else:
            y = fy + cfg.item_h - recuo - avanco_y[1]

    pivo = fitz.Point(x, y)
    radianos = math.radians(-giro)
    argumentos = dict(
        fontsize=corpo,
        color=cor,
        morph=(pivo, fitz.Matrix(math.cos(radianos), -math.sin(radianos),
                                 math.sin(radianos),  math.cos(radianos), 0, 0))
    )
    if arquivo_impact:
        argumentos["fontname"] = "Impact"
        argumentos["fontfile"] = arquivo_impact
    else:
        argumentos["fontname"] = "hebo"
    page.insert_text(pivo, texto, **argumentos)


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


def _modulos_do_barcode(data: str, barcode_format: str = "code128") -> str:
    """O PADRAO de barras do codigo — a fita de `1` e `0`, sem imagem nenhuma.

    ## Por que nao e mais uma imagem

    Ate 27/08/2026 o motor pedia um PNG ao `python-barcode` e o esticava para
    dentro da caixa do elemento. A imagem vem com uma faixa branca fixa de 1 mm
    em cima e outra embaixo, somadas ao `module_height` — e a folga era esticada
    junto. Medido: um elemento de 60 x 12 mm imprimia barras de 60,03 x 10,67 mm,
    89% da altura pedida. Altura de barra e requisito de leitura, nao estetica.

    Recortar a folga da imagem resolveria, e custaria caro: medido, gerar o PNG
    leva 4,58 ms por codigo e recortar somaria outros 2,01 ms — mais de tres
    minutos numa tiragem de 100.000 pecas, numa grafica em que o tempo de
    imposicao e o motivo de o agente local existir.

    Pedindo so o padrao, quem desenha e o motor: retangulos vetoriais numa caixa
    do tamanho exato do elemento. A altura passa a ser a pedida por construcao, e
    o traco sai na resolucao do RIP da impressora em vez dos 300 dpi que o codigo
    escolhia.

    Conferido antes de trocar, nas seis simbologias: a imagem antiga desenhava
    TODAS as barras com a mesma altura (linhas 11 a 188 de 200) — nao ha barra de
    guarda mais comprida a reproduzir.
    """
    try:
        import barcode
    except ImportError:
        raise ImportError("Instale: pip install python-barcode[images]")

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

    return barcode.get(fmt, data).build()[0]


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


def _salvar_pdf(doc, out_name):
    """Funil unico de gravacao dos PDFs de saida do engine.

    Embute o OutputIntent sRGB (declara ao RIP o que o RGB significa) e so
    entao grava. Falha no metadado nao pode parar a producao: o PDF sai sem
    intent e o aviso vai para o log.
    """
    try:
        color_profiles.embutir_output_intent(
            doc, color_profiles.srgb_icc_bytes(), "sRGB IEC61966-2.1", "RGB")
    except Exception as e:
        print(f"[engine] aviso: OutputIntent sRGB nao embutido: {e}")
    doc.save(out_name, garbage=4, deflate=True)


# UMA PERGUNTA QUE VIROU DUAS (31/08/2026).
#
# Ate o FxVersoUnico, `print_mode == "duplex"` respondia sozinho a DUAS
# perguntas diferentes:
#
#   1. "este trabalho tem verso?"    -> agora e `tem_verso(...)`
#   2. "como o arquivo e paginado?"  -> so aqui os dois duplex diferem
#
# So a SEGUNDA distingue os modos: no `duplex` classico frente e verso sao
# paginas consecutivas do mesmo arquivo (i*2 e i*2+1); no `duplex_unico` a
# frente anda 1 a 1 e o verso e sempre a mesma pagina anexada.
#
# Um `== "duplex"` do PRIMEIRO tipo deixado para tras faz a tela mostrar uma
# coisa e o papel sair outra: a face `back` da numeracao vira `front` no
# parse_elements e o QR do verso some da folha, sem erro nenhum no log.

def tem_verso(print_mode) -> bool:
    """Este trabalho imprime dos dois lados? (`duplex` ou `duplex_unico`)"""
    return str(print_mode or "front").strip().lower() in ("duplex", "duplex_unico")


def verso_unico(print_mode) -> bool:
    """O verso e um arquivo de UMA pagina, repetido em todas as pecas?"""
    return str(print_mode or "front").strip().lower() == "duplex_unico"


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
                 refazer_celulas: list = None,
                 refazer_repetir: bool = False,
                 pedido=None,
                 modelo=None,
                 pool_qr=None,
                 entregar_por_bloco: bool = False,
                 arte_escala_h: float = 100.0,
                 arte_escala_v: float = 100.0,
                 base_file_verso: str = None):

        self.base_file = base_file
        # FxVersoUnico: o verso vem em ARQUIVO SEPARADO, de uma pagina so, e e
        # anexado ao fim do documento da frente no `_load_base_as_pdf`.
        # `verso_page_idx` guarda em que pagina ele foi parar -- a mesma para
        # todas as pecas. Fica None enquanto o arquivo nao foi carregado, e
        # tambem quando nao ha verso nenhum.
        self.base_file_verso = base_file_verso
        self.verso_page_idx = None
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
        # ENTREGAR ENQUANTO GERA (27/08/2026).
        #
        # NA TELA a caixa nasce marcada, por decisão do usuário. AQUI o padrão é
        # `False` de propósito, e os dois não se contradizem: a tela manda a
        # escolha em todo trabalho, e este `False` é a resposta para quem chamar
        # o motor SEM dizer nada — um script, um teste, um caminho novo. Cortar
        # a tiragem de quem não pediu mudaria o que chega na impressora sem
        # ninguém ter escolhido.
        #
        # Ver `_folhas_por_lote`, que é quem decide se o corte vale para este
        # trabalho.
        self.entregar_por_bloco = bool(entregar_por_bloco)

        # QR Ideal: as duas chaves que dao o codigo de cada ingresso.
        # `pedido` e `pedidos_modelos.id_int` e `modelo` e `pedidos_modelos.id`.
        # Guardados como STRING sempre: o pedido 20270 vai invertido no QR e
        # vira "07202" — como inteiro perderia o zero, viraria 7202, e o
        # ingresso apontaria para outro pedido.
        self.pedido = str(pedido).strip() if pedido not in (None, "") else None
        self.modelo = str(modelo).strip() if modelo not in (None, "") else None
        self.pool_qr = pool_qr

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

        # ESCALA DA CAMADA DE ARTE (31/08/2026).
        #
        # Vem do MODELO, e nao do formato: quem ajusta e o operador, no card do
        # pedido, e o ajuste vale para aquele arquivo — nao para todos os
        # trabalhos que usam o mesmo formato. Por isso ela entra por parametro,
        # ao lado de c_ini/q_cam/l_cam, e nao pelo dicionario `formato`.
        #
        # Guardadas em fracao para o desenho nao repetir a divisao por 100 em
        # sete lugares. O padrao 100/100 e o tamanho natural do arquivo, que e o
        # que o motor sempre fez. Ver `_arte_na_celula`.
        def _fracao(v):
            try:
                f = float(v)
            except (TypeError, ValueError):
                return 1.0
            return f / 100.0 if f > 0 else 1.0

        self.arte_sx = _fracao(arte_escala_h)
        self.arte_sy = _fracao(arte_escala_v)
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
        #
        # REPETIR DE PROPÓSITO (03/09/2026). A Montagem duplica uma célula — a
        # mesma peça impressa duas vezes, lado a lado — e para isso liga
        # `refazer_repetir`: a lista entra como veio, repetições incluídas. O
        # Pedido não manda a chave e continua deduplicando, porque lá o campo
        # é digitado às pressas e um "1,1,6" é engano, não pedido.
        validas = [
            int(c) for c in (refazer_celulas or []) if str(c).strip().isdigit() and int(c) >= 1
        ]
        self.refazer_repetir = bool(refazer_repetir)
        self.refazer_celulas = validas if self.refazer_repetir else list(dict.fromkeys(validas))
        
        if layout_schema == "pdf_multiple":
            # Para Pdf Múltiplo, a quantidade total de itens é baseada na quantidade de páginas
            try:
                if base_file.lower().endswith(".pdf"):
                    temp_doc = fitz.open(base_file)
                    total_pages = len(temp_doc)
                    temp_doc.close()
                    # `tem_verso` NAO serve aqui, de proposito: quem divide por
                    # 2 e so o `duplex` classico, que consome as paginas aos
                    # pares. No `duplex_unico` cada pagina do arquivo e uma peca
                    # inteira -- 9 paginas = 9 pecas -- porque o verso mora em
                    # outro arquivo e nao ocupa pagina da frente.
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
                if tem_verso(self.print_mode):
                    if tem_verso(num_print_mode):
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
                if tem_verso(self.print_mode):
                    if tem_verso(num_print_mode_2):
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

def _folhas_por_set_da_tela(set_definitions, bloco):
    """Quantas folhas tem cada set COMO A TELA CONTA (02/09/2026).

    A tela (`buildStrictAssemblySets`, no pedido.js) mostra cada CAMADA de um
    set estrito como um set, e a sobra de cada modelo como outro -- e o nome do
    arquivo diz o mesmo: `_set1_01`, `_set1_02`, `_set2`. E essa a numeracao
    que o operador ve na previa e digita no Refazer Folhas. Aqui dentro, um set
    estrito de profundidade 3 e UM set de 600 folhas; para quem segura a pilha,
    sao tres de 200.
    """
    saida = []
    for s in set_definitions or []:
        n = int(s.get("num_sheets", 0) or 0)
        depth = max(1, int(s.get("depth", 1) or 1))
        for camada in range(depth):
            saida.append(max(0, min(int(bloco), n - camada * int(bloco))))
    return saida


class ImpositionEngine:
    def __init__(self, config: ImpositionConfig, on_file_generated=None):
        self.cfg = config
        self._url_cache = {}
        self.on_file_generated = on_file_generated
        self.generated_files = TriggerList(on_file_generated)
        # Quantas folhas ja foram ENTREGUES (nao so geradas). E o que a tela diz
        # ao operador quando ele cancela no meio: papel entregue nao volta.
        self.folhas_entregues = 0
        # Cache de bytes de fontes TTF: {font_file_path -> bytes}
        # Evita re-leitura do disco a cada chamada, mas PyMuPDF ainda
        # faz deduplicacao interna de streams identicos no PDF.
        self._font_buffer_cache: dict = {}

    def _folhas_por_lote(self, cfg, refazendo):
        """De quantas folhas e cada lote entregue enquanto o trabalho e gerado.

        Devolve 0 quando este trabalho NAO deve ser cortado -- e o caminho de
        sempre, um documento so, gravado no fim.

        ## Por que isto existe (27/08/2026)

        O usuario relatou o modelo de 14.000 celulas do pedido 21202: 1.400
        folhas que o motor montava inteiras na memoria antes de sair a primeira.

        A esteira de entregar enquanto gera JA existia e ja roda na grafica: o
        `on_file_generated` dispara a cada `generated_files.append`, o `app.py`
        empurra o arquivo para a resposta em streaming, e o frontend manda cada
        um para o hotfolder ou para a impressora conforme chegam. O que faltava
        era o CORTE: sem capa, o motor definia o bloco como o pedido inteiro
        (`stack_size = total_sheets`), o laco nunca cruzava uma fronteira e nada
        era gravado no meio.

        ## As tres recusas, e por que cada uma

        `has_cover` — este caminho JA corta, por set, e ja entrega. Cortar duas
        vezes brigaria com a capa e a contracapa, que pertencem ao set.

        `refazendo` — Refazer Celula nao pode mudar de significado. Sem capa, o
        pedido inteiro e um bloco so, entao "refazer folhas 5 a 10" sao folhas
        ABSOLUTAS. Com o corte ligado elas virariam "folhas 5 a 10 do bloco tal",
        e o operador reimprimiria papel errado sem nenhum aviso.

        `sheets_per_block` vazio — sem numero de bloco nao ha corte a fazer.
        """
        if not getattr(cfg, "entregar_por_bloco", False):
            return 0
        if cfg.has_cover:
            return 0
        if refazendo:
            return 0
        por_bloco = int(getattr(cfg, "sheets_per_block", 0) or 0)
        if por_bloco <= 0:
            return 0
        return por_bloco * max(int(getattr(cfg, "block_depth", 1) or 1), 1)

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

    def _abrir_arquivo_como_pdf(self, caminho: str) -> fitz.Document:
        """Abre UM arquivo (PDF, JPG, PNG) como documento fitz com dimensões físicas precisas.

        Separado do `_load_base_as_pdf` porque o FxVersoUnico carrega dois
        arquivos pelo mesmo caminho — a frente e o verso — e o verso pode chegar
        em imagem tanto quanto a frente.
        """
        if not caminho:
            return None
        if caminho.lower().endswith(".pdf"):
            return fitz.open(caminho)

        # Imagem → converter para PDF temporário em memória ajustando ao tamanho do item
        img = Image.open(caminho)
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
        page.insert_image(rect, filename=caminho)

        pdf_bytes = doc.write()
        doc.close()

        return fitz.open(stream=pdf_bytes, filetype="pdf")

    def _load_base_as_pdf(self) -> fitz.Document:
        """O documento da arte: a frente e, no FxVersoUnico, o verso anexado ao fim.

        No `duplex_unico` frente e verso chegam em arquivos SEPARADOS — a frente
        paginada (uma página por peça), o verso de uma página só. Anexar o verso
        ao fim do documento da frente deixa o resto do motor com UM documento,
        como sempre teve; o que muda é só o índice de página, e quem o resolve é
        `_pagina_do_verso_unico`.

        Nada aqui rasteriza a arte do cliente: o verso entra por `insert_pdf` e
        sai por `show_pdf_page`, vetorial, igual à frente.
        """
        doc = self._abrir_arquivo_como_pdf(self.cfg.base_file)
        if doc is None:
            return None

        verso_path = getattr(self.cfg, "base_file_verso", None)
        if verso_path and verso_unico(self.cfg.print_mode):
            verso_doc = None
            try:
                verso_doc = self._abrir_arquivo_como_pdf(verso_path)
                if verso_doc:
                    if len(verso_doc) > 1:
                        print(f"[engine] FxVersoUnico: o arquivo de verso tem "
                              f"{len(verso_doc)} paginas; so a primeira sera usada.")
                    # O índice é o total de páginas da frente ANTES do anexo: é
                    # exatamente onde o insert_pdf vai colar a página.
                    self.cfg.verso_page_idx = len(doc)
                    doc.insert_pdf(verso_doc, from_page=0, to_page=0)
            except Exception as ex:
                # Sem verso, a célula de verso sai vazia — melhor que derrubar o
                # trabalho inteiro da frente por causa do arquivo de trás.
                self.cfg.verso_page_idx = None
                print(f"[engine] FxVersoUnico: falha ao anexar o verso ({verso_path}): {ex}")
            finally:
                if verso_doc is not None:
                    verso_doc.close()

        return doc

    def _pagina_do_verso_unico(self, arte_data, cfg, doc_base):
        """A página do verso no FxVersoUnico: FIXA, a mesma para todas as peças.

        Vem memorizada por arte no `multi_map` — numa folha que soma modelos cada
        arte tem o seu verso, anexado ao próprio documento — e, fora dela, do
        `cfg.verso_page_idx` gravado ao carregar o arquivo único.

        Sem verso nenhum devolve None, e a célula de verso sai vazia: é o mesmo
        que já acontecia quando o PDF não tinha a página par.
        """
        idx = arte_data.get("verso_page_idx") if arte_data else None
        if idx is None:
            idx = getattr(cfg, "verso_page_idx", None)
        if idx is None or not doc_base or idx >= len(doc_base):
            return None
        return idx

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

    def _modelo_do_item(self, item_index: int, item_map: list = None):
        """O modelo (id de 7 digitos) deste item.

        Numa folha que soma modelos cada arte e um modelo diferente — e como um
        modelo e um setor do evento, cada arte usa uma coluna diferente do pool.
        Fora desse caso, o modelo e o do trabalho inteiro.

        `item_map` e o `multi_map`, que tem UMA entrada por ITEM. Nao passe a
        lista de artes: ela tem uma entrada por MODELO, e indexa-la pelo indice
        do item devolve o modelo de outro — foi assim ate a v630, e o QR saia da
        coluna errada do pool.
        """
        if item_map and 0 <= item_index < len(item_map):
            m = item_map[item_index].get("modelo")
            if m not in (None, ""):
                return str(m).strip()
        return self.cfg.modelo

    def _conteudo_qr_ideal(self, val: int, item_index: int = None, item_data: dict = None):
        """A string que vai gravada no QR deste ingresso, ou None se faltar dado.

        `val` e o numero sequencial do item — o MESMO que a numeracao imprime.
        Usar `val` e nao a posicao na folha e o que faz a reimpressao parcial
        sair certa: refazer a celula 7 imprime o codigo do item 7, mesmo que
        ele caia na primeira pose da folha compactada.

        O modelo vem do proprio item (`item_data`), que e uma entrada do
        `multi_map` e sabe de que arte saiu. Fora de uma folha com modelos
        somados nao ha arte nenhuma, e vale o modelo do trabalho inteiro.

        **Numa folha com modelos somados, item sem modelo levanta erro.** Ate a
        v630 a busca caia em `_modelo_do_item(item_index, cfg.multi_artes)`, que
        indexava a lista de ARTES pelo indice do ITEM: o item 40 de uma folha de
        oito artes nao existia ali e recebia o modelo do trabalho, e o caminho de
        montagem, que chama sem indice, dava a TODOS os itens o modelo da
        primeira arte. Os QRs saiam da coluna errada do pool — o defeito que so
        aparece na portaria, com a fila na porta. Falhar alto aqui e a regra.
        """
        cfg = self.cfg
        if item_data is not None and item_data.get("modelo") not in (None, ""):
            modelo = str(item_data["modelo"]).strip()
        elif cfg.multi_artes:
            raise ValueError(
                "QR Ideal: esta folha soma modelos e um dos itens chegou sem "
                "saber de qual modelo veio. O codigo sairia da coluna errada do "
                "pool e o ingresso nao abriria a portaria. Refaca a selecao dos "
                "modelos e imponha de novo."
            )
        else:
            modelo = self._modelo_do_item(item_index or 0, None)

        pedido = self._pedido_do_item(item_data)
        if not pedido or not modelo or cfg.pool_qr is None:
            return None
        return cfg.pool_qr.conteudo(pedido, modelo, val)

    def _pedidos_da_folha(self):
        """Os pedidos distintos das artes desta folha, em texto.

        Lista vazia quando nenhuma arte declara pedido — o caso de toda folha de
        um pedido so, em que vale o pedido do trabalho. Mais de um significa
        folha que junta pedidos diferentes.
        """
        vistos = []
        for art in (self.cfg.multi_artes or []):
            p = art.get("pedido")
            if p in (None, ""):
                continue
            p = str(p).strip()
            if p and p not in vistos:
                vistos.append(p)
        return vistos

    def _pedido_do_item(self, item_data: dict = None):
        """O pedido deste item, que entra na coluna do pool E no conteudo do QR.

        O pedido do item vence o do trabalho. Nunca o contrario: numa folha que
        junta modelos de dois pedidos, o pedido do trabalho e o de um deles, e
        usa-lo para o outro daria coluna errada e prefixo errado — um ingresso
        que nao abre a portaria, descoberto com o lote entregue.

        **Numa folha que mistura pedidos, item sem pedido levanta erro.** Numa
        folha de pedido unico, ausencia significa "o pedido do trabalho" e nada
        muda em relacao ao que sempre foi.

        O valor volta como TEXTO. O pedido 20270 invertido e "07202"; tratado
        como inteiro viraria 7202, que invertido e 2027 — outro pedido.
        """
        if item_data is not None and item_data.get("pedido") not in (None, ""):
            return str(item_data["pedido"]).strip()
        if len(self._pedidos_da_folha()) > 1:
            raise ValueError(
                "QR Ideal: esta folha junta modelos de pedidos diferentes e um "
                "dos itens chegou sem saber de qual pedido veio. O codigo sairia "
                "com a coluna e o prefixo de outro pedido, e o ingresso nao "
                "abriria a portaria. Refaca a selecao dos modelos e imponha de "
                "novo."
            )
        return str(self.cfg.pedido).strip() if self.cfg.pedido else None

    def _usa_qr_ideal(self) -> bool:
        """Se algum elemento da numeracao e QR Ideal.

        A trava abaixo so vale para quem usa o elemento: um trabalho de
        numeracao comum com dois modelos na mesma coluna nao tem por que ser
        recusado — coluna do pool nao significa nada para ele.
        """
        # `cfg.elements` ja e a lista achatada das duas numeracoes, montada no
        # construtor — nao ha uma segunda lista para varrer.
        return any(el.get("type") == "QR_IDEAL" for el in (self.cfg.elements or []))

    def _conferir_colunas_qr_ideal(self):
        """Duas artes DO MESMO PEDIDO nao podem cair na mesma coluna do pool.

        Modelos cujos `id` diferem em exatamente 100 dao a MESMA coluna, e ai
        sairiam QRs identicos no mesmo evento — o unico choque que o prefixo do
        pedido nao separa, porque o pedido dos dois e o mesmo. Melhor recusar o
        trabalho aqui do que descobrir na portaria, com a fila na porta.

        A conferencia e POR PEDIDO desde 18/08/2026, quando a folha passou a
        poder juntar modelos de pedidos diferentes. Dois modelos de pedidos
        diferentes na mesma coluna recebem o mesmo codigo de 8 caracteres, mas
        prefixos diferentes: o conteudo do QR difere e a portaria os distingue.
        Isso e o risco ja conhecido e aceito em docs/qr_ideal.md, e nao motivo
        para recusar o trabalho — recusar aqui bloquearia combinacoes legitimas.
        """
        cfg = self.cfg
        if not cfg.multi_artes or not self._usa_qr_ideal():
            return
        import qr_ideal as _qi
        por_pedido_e_coluna = {}
        for arte in cfg.multi_artes:
            modelo = arte.get("modelo")
            if modelo in (None, ""):
                continue
            modelo = str(modelo).strip()
            pedido = arte.get("pedido") or cfg.pedido
            if not pedido:
                continue
            pedido = str(pedido).strip()
            chave = (pedido, _qi.coluna_do_modelo(pedido, modelo))
            anterior = por_pedido_e_coluna.get(chave)
            if anterior is not None and anterior != modelo:
                raise ValueError(
                    f"QR Ideal: os modelos {anterior} e {modelo} do pedido {pedido} "
                    f"caem na mesma coluna ({chave[1]}) do pool e produziriam "
                    f"ingressos com o MESMO codigo no mesmo evento. Trabalho recusado."
                )
            por_pedido_e_coluna[chave] = modelo

    def _conferir_dados_do_qr_ideal(self):
        """Recusa ANTES do papel, dizendo qual das tres coisas falta.

        Sao tres, e a mensagem antiga citava duas: pedido, modelo e o pool. A
        terceira e a mais confusa de diagnosticar, porque a estacao sem o
        arquivo de 24 MB parece identica a uma com ele — ate imprimir.

        Sem esta conferencia o trabalho falhava la dentro, no meio da montagem
        das paginas, e a mensagem mandava procurar pedido ou modelo mesmo
        quando os dois estavam certos.
        """
        cfg = self.cfg
        if not self._usa_qr_ideal():
            return

        faltando = []
        pedidos = self._pedidos_da_folha()
        if not cfg.pedido and not pedidos:
            faltando.append("o numero do pedido")
        if cfg.pool_qr is None:
            faltando.append("a lista de codigos (qr_ideal_pool.bin) desta estacao")

        # O modelo vem por arte na folha multi_artes, e do config fora dela.
        if cfg.multi_artes:
            rotulo = lambda i, a: (a.get("nome") or a.get("modelo") or f"arte {i + 1}")
            sem_modelo = [
                rotulo(i, a)
                for i, a in enumerate(cfg.multi_artes)
                if a.get("modelo") in (None, "")
            ]
            if sem_modelo:
                faltando.append("o modelo de: " + ", ".join(str(x) for x in sem_modelo))
            # Folha que junta pedidos: cada arte precisa trazer o seu. O pedido
            # do trabalho e o de um deles, e serviria de resposta errada para os
            # outros — coluna e prefixo de outro evento, descobertos na portaria.
            if len(pedidos) > 1:
                sem_pedido = [
                    rotulo(i, a)
                    for i, a in enumerate(cfg.multi_artes)
                    if a.get("pedido") in (None, "")
                ]
                if sem_pedido:
                    faltando.append("o pedido de: " + ", ".join(str(x) for x in sem_pedido))
        elif not cfg.modelo:
            faltando.append("o numero do modelo")

        if faltando:
            raise ValueError(
                "QR Ideal: o trabalho nao pode ser impresso porque falta "
                + "; ".join(faltando)
                + ". Um QR em branco, ou calculado com valor suposto, so "
                "apareceria na portaria — quando ja nao da para consertar."
            )

    def _injetar_qr_ideal(self, rotated_el: dict, val: int, item_index: int = None, item_data: dict = None):
        """Poe o conteudo do QR Ideal no elemento, logo antes de desenhar.

        Fica fora do `_render_element` porque so os lacos de imposicao sabem
        de que arte aquele item veio — e numa folha `multi_artes` cada arte e
        um modelo, portanto uma coluna diferente do pool.
        """
        if rotated_el.get("type") != "QR_IDEAL":
            return
        rotated_el["_qr_ideal_conteudo"] = self._conteudo_qr_ideal(
            val, item_index=item_index, item_data=item_data
        )

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
        elif t in ("QR", "QR_IDEAL"):
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
        elif el.get("source") == "database":
            # ── Origem "banco de dados" NUNCA vira contador sequencial ──────
            #
            # Ate 02/09/2026 esta condicao era `and csv_row is not None`. Sem
            # linha, o elemento escorregava para o `else` la embaixo e imprimia
            # o NUMERO DO ITEM — com prefixo, sufixo e zeros, como se fosse uma
            # numeracao sequencial comum. Ninguem via nada: sai um QR bonito,
            # legivel, com o conteudo errado.
            #
            # Foi o pedido 21460 (Expointer, 6.950 credenciais). O painel nao
            # tinha carregado os bancos do pedido, o motor recebeu zero linhas e
            # o QR saiu com 0001, 0002, 0003... no lugar dos codigos de 12
            # digitos que o cliente mandou. O conserto do painel (v791) tapou o
            # caminho conhecido; esta linha tapa a CLASSE — qualquer caminho que
            # chegue aqui sem linha para o trabalho em vez de inventar um valor.
            #
            # E a mesma regra do QR Ideal, e pelo mesmo motivo: o erro nao
            # aparece na tela nem no papel. Aparece na portaria do evento, com a
            # fila na porta, quando ja nao ha o que consertar. Preferir o
            # trabalho parado ao trabalho errado.
            #
            # FOTO fica de fora porque ela ja tem tratamento proprio: nasce
            # SEMPRE com `source: 'database'` (uma foto que nao varia por linha
            # e arte de fundo, nao foto variavel), e sem linha ela desiste de
            # pintar mais abaixo — que e o caso da previa da numeracao sem
            # banco. Quem recusa a impressao de verdade dela e o
            # `_conferir_e_aquecer_fotos`, com a lista inteira das pendencias.
            if csv_row is None and t != "FOTO":
                raise ValueError(
                    f"O elemento '{el.get('id', '?')}' ({t}) le do banco de dados, "
                    f"e o item {val} deste trabalho chegou sem linha. O trabalho "
                    "nao pode ser impresso: sair daqui poria o numero sequencial "
                    "no lugar do dado, e o erro so apareceria no material pronto. "
                    "Abra o pedido e confira as tres coisas: se o banco de dados "
                    "esta anexado ao modelo, se cada campo tem a sua coluna "
                    "escolhida, e se o banco tem uma linha para cada peca da "
                    "tiragem. Depois mande imprimir de novo."
                )
            col_name = el.get("csv_column", "")
            val_str = str((csv_row or {}).get(col_name, ""))
            # Um QR do banco com a celula VAZIA e' da mesma familia do caso
            # acima: o papel sai com um QR "de nada", legivel, que nao abre porta
            # nenhuma. Foi o quarto relato do 21460 — o painel mandava o banco
            # inteiro (3.000 linhas) para um modelo de 200, e as 2.800 pecas
            # alem da tiragem tinham a coluna dele em branco. O BARCODE ja
            # recusa o vazio ha tempos; o QR passa a recusar tambem. Texto
            # continua podendo ser vazio: um "complemento" em branco e' normal.
            if t == "QR" and not val_str.strip():
                raise ValueError(
                    f"O QR '{el.get('id', '?')}' le a coluna '{col_name}' do banco "
                    f"de dados, e no item {val} deste trabalho essa celula esta "
                    "vazia. O trabalho nao pode ser impresso: sairia um QR sem "
                    "conteudo. Confira se a tiragem do modelo nao passa das "
                    "linhas que tem codigo nessa coluna, e mande imprimir de novo."
                )
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
                    # Nome do RECURSO no PDF, e não o nome da família: o PyMuPDF
                    # recusa espaço, e o nome precisa ser único por arquivo.
                    font_name = _nome_de_fonte_para_pdf(family, font_bytes)
                except Exception as ex:
                    print(f"[engine] Erro ao usar fonte embutida: {ex}")

            # 2. Tentar baixar a fonte do Catálogo Web se URL fornecida
            if not font_file:
                font_url = el.get("arquivo_url") or el.get("font_url")
                if font_url:
                    try:
                        import hashlib
                        import urllib.request, re
                        # O NOME DO CACHE CARREGA A URL, e não só a família.
                        #
                        # Era `<família>.ttf` puro, e o `if not os.path.exists`
                        # abaixo nunca rebaixava: trocar o arquivo da fonte no
                        # catálogo — que é justamente o conserto de "esta fonte
                        # não tem o `ř`" — não chegava a nenhuma estação que já
                        # tivesse baixado a versão velha. Cada máquina ficaria
                        # num estado diferente, em silêncio, e o operador não
                        # teria como saber por que a correção não pegou.
                        #
                        # Com a URL no nome, arquivo novo é caminho novo: baixa
                        # sozinho. O antigo fica no disco sem atrapalhar, e a
                        # `.\ferramentas\faxina.ps1` limpa quando quiser.
                        _sufixo = hashlib.md5(font_url.encode("utf-8")).hexdigest()[:8]
                        safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', family) + "_" + _sufixo + ".ttf"
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
                            # Mesmo motivo do ramo da fonte embutida: o nome do
                            # recurso não pode ter espaço nem se repetir entre
                            # arquivos. Aqui a chave é o caminho, porque os bytes
                            # ainda não foram lidos.
                            font_name = _nome_de_fonte_para_pdf(family, dest)
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

            # A ultima defesa contra o nome furado. Fica FORA do try acima de
            # proposito: o que ele protege e o registro da fonte, e um aviso
            # nunca pode ser o motivo de cair no fallback. Vale tambem para o
            # ramo Base-14 (`font_file` nulo), onde `helv` e `times` escrevem em
            # WinAnsi e comem tudo o que estiver fora do cp1252.
            _avisar_glifos_faltando(
                insert_kwargs["fontname"], family, val_str,
                self._font_buffer_cache.get(font_file) if font_file else None)

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
                # A MESMA regua que centraliza mais abaixo. Antes esta media
                # chutava quando havia fonte embutida, entao o corpo escolhido no
                # modo "shrink" saia errado junto com a posicao.
                _medir = lambda s, fs: _largura_do_texto(s, font_file, font_name, fs)
                _modo = el.get("overflow")
                if _modo not in ("wrap", "condense"):
                    _modo = "shrink"
                font_size, _linhas_aj, _escala_x = _ajustar_texto_na_largura(
                    _medir, val_str, font_size, _max_w_mm * MM2PT, _modo)
                insert_kwargs["fontsize"] = font_size
                val_str = "\n".join(_linhas_aj)
                _align = el.get("text_align")

            # Medir largura real do texto para centralizar horizontalmente
            text_width = _largura_do_texto(val_str, font_file, font_name, font_size)

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

            # Do centro visual ate a linha de base — a mesma conta que o
            # `textBaseline='middle'` do canvas faz, e com as medidas da MESMA
            # fonte. Ver `_fracao_tipografica`.
            if font_file:
                fracao_do_meio = _fracao_do_meio_da_fonte(font_file)
            else:
                fracao_do_meio = _fracao_das_base14(font_name)

            baseline_offset = fracao_do_meio * font_size

            # Altura total do bloco e topo do bloco (alinhado ao centro cy)
            total_height = len(lines_to_draw) * line_height
            block_top = cy - total_height / 2.0

            for i, line_str in enumerate(lines_to_draw):
                text_width = _largura_do_texto(line_str, font_file, font_name, font_size)

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

        elif t == "QR_IDEAL":
            # O conteudo e CALCULADO, nunca digitado. Quem injeta e o chamador,
            # que e o unico que sabe o modelo daquele item numa folha multi_artes.
            conteudo_qr = el.get("_qr_ideal_conteudo")
            if not conteudo_qr:
                raise ValueError(
                    "QR Ideal sem pedido ou modelo: o trabalho nao pode ser "
                    "impresso. Um QR em branco, ou calculado com valor suposto, "
                    "so apareceria na portaria — quando ja nao da para consertar."
                )
            size = el.get("_size", 42.5)
            qr_bytes = _generate_qr(conteudo_qr, color)
            rect = fitz.Rect(el_x, el_y, el_x + size, el_y + size)
            py_rotate = (360 - angle) % 360
            if py_rotate != 0:
                page.insert_image(rect, stream=qr_bytes, rotate=py_rotate)
            else:
                page.insert_image(rect, stream=qr_bytes)

        elif t == "BARCODE":
            # Vetorial, e desenhado aqui: ver `_modulos_do_barcode`. A caixa do
            # elemento E a caixa das barras, entao a altura pedida e a impressa.
            w_pt = el.get("_w", 60 * MM2PT)
            h_pt = el.get("_h", 12 * MM2PT)
            padrao = _modulos_do_barcode(val_str, el.get("barcode_format", "code128"))
            if not padrao:
                raise ValueError(f"codigo de barras vazio no elemento '{el.get('id', '?')}'")

            # A rotacao gira a CAIXA, em torno da ancora do elemento — igual ao
            # canvas do editor. E o `morph` que faz isso; a imagem antiga girava
            # o conteudo DENTRO de um retangulo que nao girava, entao um codigo
            # de 60x12 a 90 graus saia deitado num espaco em pe.
            morph = ((fitz.Point(cx, cy), fitz.Matrix(-angle)) if angle else None)
            extra = {"morph": morph} if morph else {}

            # O fundo branco e o contraste que o leitor pede quando o codigo cai
            # sobre arte colorida. Ele sempre esteve ali (a imagem tinha fundo
            # branco); some-lo agora seria mudar o papel sem pedir.
            page.draw_rect(fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt),
                           color=None, fill=(1, 1, 1), **extra)

            # Barras vizinhas viram UM retangulo: menos objetos na pagina e, mais
            # importante, sem a fresta que o arredondamento deixaria entre elas.
            larg_mod = w_pt / len(padrao)
            i = 0
            while i < len(padrao):
                if padrao[i] == "1":
                    j = i
                    while j + 1 < len(padrao) and padrao[j + 1] == "1":
                        j += 1
                    page.draw_rect(
                        fitz.Rect(el_x + i * larg_mod, el_y,
                                  el_x + (j + 1) * larg_mod, el_y + h_pt),
                        color=None, fill=rgb, **extra)
                    i = j + 1
                else:
                    i += 1

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
                # pagina da janela, para acompanhar a rotacao do elemento junto
                # com a foto.
                #
                # O traco vai CENTRADO na borda da janela e com o DOBRO da
                # espessura: a metade de fora e aparada pela propria pagina (e,
                # no canto redondo, pela mascara), sobrando exatamente `esp`
                # para dentro. O ganho nao e economia de codigo — e que a borda
                # externa do contorno passa a ser, por construcao, a MESMA curva
                # que recorta a foto.
                #
                # Antes o retangulo era recuado meia espessura, e o raio do seu
                # canto saia menor e deslocado em relacao ao raio da mascara
                # (2,76 mm contra 3,0 mm numa janela 25x32 com contorno de
                # 2 mm). Nas retas os dois coincidiam; ao longo da curva sobrava
                # ate meio milimetro de FOTO do lado de fora do contorno. Numa
                # credencial, isso e a foto passando por cima da moldura.
                esp = float(el.get("border_mm", 0) or 0) * MM2PT
                canto = str(el.get("corner", "square") or "square").lower()
                if esp > 0:
                    cor = _hex_to_rgb(el.get("border_color", "#000000") or "#000000")
                    r_borda = fitz.Rect(0, 0, w_pt, h_pt)
                    if canto == "circle":
                        pj.draw_oval(r_borda, color=cor, width=esp * 2)
                    else:
                        try:
                            if canto == "round":
                                pj.draw_rect(r_borda, color=cor, width=esp * 2, radius=0.12)
                            else:
                                pj.draw_rect(r_borda, color=cor, width=esp * 2)
                        except (TypeError, ValueError):
                            # PyMuPDF sem `radius`: canto reto e melhor que erro.
                            pj.draw_rect(r_borda, color=cor, width=esp * 2)

                rect = _caixa_girada(cx, cy, w_pt, h_pt, angle)
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
                rect = _caixa_girada(cx, cy, w_pt, h_pt, angle)
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
                    _colar_arte_pdf(page.parent, page, rect, pdf_doc, py_rotate, _opacidade_arte(el))
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
                    rect = _caixa_girada(cx, cy, w_pt, h_pt, angle)
                    py_rotate = (360 - angle) % 360
                    # keep_proportion=True: encaixa sem distorcer, igual ao canvas.
                    _colar_arte_pdf(page.parent, page, rect, pdf_doc, py_rotate, _opacidade_arte(el))
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
        # E antes de qualquer papel tambem: duas artes da mesma folha nao podem
        # dividir a coluna do pool do QR Ideal. Sem elemento QR_IDEAL, sai na
        # primeira linha.
        self._conferir_colunas_qr_ideal()
        self._conferir_dados_do_qr_ideal()
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
        self.folhas_entregues = 0
        doc_base = self._load_base_as_pdf()
        
        # Sempre ligado: o `elif` la embaixo nao pode depender de curto-circuito
        # para nao estourar quando o trabalho tem capa.
        folhas_por_lote = 0
        if cfg.has_cover:
            if cfg.layout_schema == "cut_stack":
                stack_size = cfg.sheets_per_block * cfg.block_depth
            else:
                stack_size = total_sheets
        else:
            # Sem capa, o "bloco" era o pedido inteiro -- e por isso o laco nunca
            # gravava nada no meio. Com a entrega por bloco ligada, ele passa a
            # ser o bloco configurado no modelo. Ver `_folhas_por_lote`.
            folhas_por_lote = self._folhas_por_lote(cfg, refazendo)
            stack_size = folhas_por_lote if folhas_por_lote else total_sheets

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
        
        is_duplex = tem_verso(cfg.print_mode)
        if cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0):
            if any(art.get("pdf_verso_url") for art in cfg.multi_artes):
                is_duplex = True

        # Preparar mapa de Multi-Artes
        multi_map = []
        pdf_cache = {}
        # ANEXAR O VERSO SEM ANEXAR DUAS VEZES (31/08/2026).
        #
        # `_load_art_as_pdf` guarda o documento POR URL em `pdf_cache`, e o
        # `insert_pdf` altera o documento guardado. Dois modelos que usam o mesmo
        # arquivo de frente recebem o MESMO objeto: sem esta memória, o segundo
        # anexaria o verso outra vez e a peça sairia com a página errada no
        # papel. A chave é o PAR (frente, verso), porque dois modelos podem
        # dividir a frente e ter versos diferentes — nesse caso são dois anexos
        # legítimos, cada um com o seu índice.
        versos_mesclados = {}

        is_strict_assembly = (cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict_assembly")
        if cfg.layout_schema == "multi_artes" or (cfg.multi_artes and len(cfg.multi_artes) > 0) or is_strict_assembly:

            if cfg.multi_artes and len(cfg.multi_artes) > 0:
                # Ordenar por quantidade so serve ao strict_assembly, que monta
                # blocos completos e aproveita os modelos grandes primeiro. No
                # modo somado a tiragem e uma sequencia continua, e embaralhar os
                # modelos so atrapalha quem confere o material: a ordem do pedido
                # e a que o operador ve na tela, e e ela que deve valer.
                if is_strict_assembly:
                    sorted_artes = sorted(cfg.multi_artes, key=lambda a: int(a.get("qtd", 0)), reverse=True)
                else:
                    sorted_artes = list(cfg.multi_artes)
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
                        if tem_verso(cfg.print_mode):
                            if tem_verso(num_print_mode):
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

                # O banco de dados (CSV) DESTA arte, ja recortado na fatia do
                # modelo pelo frontend. Numa folha com modelos somados cada arte
                # tem o seu; sem isto o motor lia o banco do trabalho inteiro e
                # dava a linha do vizinho a quem nao era dela.
                art_csv = (num1_obj or {}).get("csv_data") or None
                if art_csv:
                    art_csv = [r for r in art_csv if r.get("__ativo", True) is not False]

                els1 = parse_elements(num1_obj, 1)
                els2 = parse_elements(num2_obj, 2)
                art_els = els1 + els2
                
                pdf_url = art.get("pdf_url")
                pdf_verso_url = art.get("pdf_verso_url")
                local_path = art.get("local_path")
                art_doc = None
                # Em que página desta arte mora o verso do FxVersoUnico. Vai
                # para cada item do `multi_map`: é o que `_pagina_do_verso_unico`
                # lê na hora de desenhar a célula de verso.
                art_verso_page_idx = None

                try:
                    if not cfg.multi_artes and doc_base:
                        art_doc = doc_base
                        # Arquivo único: o verso já foi anexado lá no
                        # `_load_base_as_pdf`, e o índice está no cfg.
                        art_verso_page_idx = getattr(cfg, "verso_page_idx", None)
                    elif local_path and os.path.exists(local_path):
                        art_doc = _load_art_as_pdf(local_path, is_url=False)
                    elif pdf_url:
                        art_doc = _load_art_as_pdf(pdf_url, is_url=True)
                        if pdf_verso_url and art_doc:
                            chave_verso = (pdf_url, pdf_verso_url)
                            if chave_verso in versos_mesclados:
                                # Este par já foi mesclado por outro modelo:
                                # reusar o documento e o índice, nunca anexar de
                                # novo. Ver `versos_mesclados`, acima.
                                art_doc, art_verso_page_idx = versos_mesclados[chave_verso]
                            elif len(art_doc) < 2 or verso_unico(cfg.print_mode):
                                # `len(art_doc) < 2` é o FxVerso de sempre: a
                                # frente de uma página só, e o verso vem do
                                # arquivo separado. O FxVersoUnico anexa
                                # SEMPRE, qualquer que seja o número de páginas
                                # da frente — é justamente o caso das 9 páginas.
                                verso_doc = _load_art_as_pdf(pdf_verso_url, is_url=True)
                                if verso_doc:
                                    art_verso_page_idx = len(art_doc)
                                    if verso_unico(cfg.print_mode):
                                        if len(verso_doc) > 1:
                                            print(f"[engine] FxVersoUnico: o arquivo de verso "
                                                  f"tem {len(verso_doc)} paginas; so a primeira "
                                                  f"sera usada.")
                                        art_doc.insert_pdf(verso_doc, from_page=0, to_page=0)
                                    else:
                                        art_doc.insert_pdf(verso_doc)
                                    versos_mesclados[chave_verso] = (art_doc, art_verso_page_idx)
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
                        # FxVersoUnico: a página do verso DESTA arte. Todos os
                        # itens da arte apontam para ela — é a mesma arte de
                        # verso em todas as peças; só a numeração muda.
                        "verso_page_idx": art_verso_page_idx,
                        "nome": art.get("nome", ""),
                        "nome_color": art.get("nome_color", "#000000"),
                        # Corpo, borda e giro do numero do modelo (03/09/2026).
                        # Vao crus, como vieram do payload: quem confere faixa e
                        # valor aceito e o `_desenhar_numero_do_modelo`, num
                        # lugar so, para a folha combinada nao ganhar regra
                        # propria.
                        "nome_size": art.get("nome_size"),
                        "nome_pos": art.get("nome_pos"),
                        "nome_rot": art.get("nome_rot"),
                        "model_idx": model_idx,
                        "start_base": n1,
                        "l_cam": int(art.get("l_cam", cfg.l_cam if hasattr(cfg, "l_cam") else 1)),
                        "q_cam": int(art.get("q_cam", cfg.q_cam if hasattr(cfg, "q_cam") else 0)),
                        "num_tipo": art_num_tipo,
                        "ticket_qtd": art_ticket_qtd,
                        # A escala da camada de arte DESTE modelo (31/08/2026).
                        # Numa folha combinada o modelo A pode estar a 98% e o B
                        # a 100%; sem estas duas chaves aqui, todos cairiam na
                        # escala do trabalho. Ver `_escala_da_arte`.
                        "escala_h": art.get("escala_h", 100),
                        "escala_v": art.get("escala_v", 100),
                        # A linha do banco deste item, e o aviso de que esta arte
                        # tem banco proprio. Ver _linha_do_banco().
                        "csv_proprio": bool(art_csv),
                        "csv_row": (art_csv[i] if art_csv and i < len(art_csv) else None),
                        # O modelo DESTA arte. O QR Ideal tira uma coluna do pool
                        # por modelo, e sem isto aqui o item nao tinha como dizer
                        # de que arte veio: ver _conteudo_qr_ideal().
                        "modelo": art.get("modelo"),
                        # E o PEDIDO desta arte, pelo mesmo motivo. Numa folha que
                        # junta modelos de pedidos diferentes, o pedido do trabalho
                        # nao serve: ele entra na coluna do pool E no conteudo do
                        # QR. Vazio aqui significa "o pedido do trabalho", que e o
                        # caso de toda folha de um pedido so.
                        "pedido": art.get("pedido")
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
                    _salvar_pdf(doc_out, out_name)
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

            # ── O "set" do Refazer Folhas e a CAMADA, como a tela conta ──────
            # (02/09/2026, pedido 21460). Um set estrito de profundidade 3 e,
            # para quem segura a pilha, tres sets de um bloco cada -- e e assim
            # que a tela (`buildStrictAssemblySets`) e o nome do arquivo
            # (`_set1_03`) contam. Aqui se contava o set inteiro (600 folhas) e
            # a sobra como set 2: "Set 3, folha 10" nao existia, e "Set 2,
            # folha 10" reimprimia em silencio a folha 10 da SOBRA, outra pilha.
            # Ver `_folhas_por_set_da_tela` e tests/test_engine_refazer_strict_assembly.py.
            folhas_por_set = _folhas_por_set_da_tela(set_definitions, cfg.sheets_per_block)
            set_da_tela = 0
            for set_idx, set_def in enumerate(set_definitions):
                depth = set_def.get("depth", 1)
                stack_size = cfg.sheets_per_block

                for layer_idx in range(depth):
                    set_da_tela += 1
                    if r_de > 0 and set_da_tela != r_set:
                        continue
                    doc_out = fitz.open()
                    
                    # 1. Gerar capa para o layer (chunk)
                    if cfg.has_cover and not refazendo:
                        self._generate_capa_for_chunk(set_idx, layer_idx, set_def, cfg, multi_map)
                    
                    # 2. Gerar miolo para o layer
                    start_sheet = layer_idx * stack_size
                    end_sheet = min((layer_idx + 1) * stack_size, set_def["num_sheets"])
                    
                    for sheet_within_set in range(start_sheet, end_sheet):
                        # Refazer: a folha conta DENTRO DA CAMADA (1..bloco), que e
                        # o que a tela mostra e o que o nome do arquivo diz.
                        sheet_num_in_set = sheet_within_set - start_sheet + 1
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
                        _salvar_pdf(doc_out, out_name)
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
            
            self._avisar_refazer_vazio(refazendo, r_de, r_ate, r_set, r_cels, folhas_por_set)
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
                        _salvar_pdf(doc_out, out_name)
                        self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                        if not refazendo:
                            self._generate_contracapa(set_idx_current, cfg, doc_base)
                    elif len(doc_out) > 0 and folhas_por_lote:
                        # ENTREGA ENQUANTO GERA: o lote fechado sai agora, e o
                        # `append` e que dispara a esteira -- `on_file_generated`,
                        # o streaming do app.py, e o frontend mandando para o
                        # hotfolder ou para a impressora. Ver `_folhas_por_lote`.
                        #
                        # O nome leva o numero com tres zeros porque a ordem em
                        # que os arquivos entram no RIP e a ordem do papel.
                        out_name = cfg.out_pdf.replace(".pdf", f"_lote{set_idx_current + 1:03d}.pdf")
                        _salvar_pdf(doc_out, out_name)
                        # `folhas` acompanha o lote ate a tela: e com ele que o
                        # operador que cancelar no meio sabe ate onde ja saiu
                        # papel. Papel entregue nao volta.
                        self.folhas_entregues += len(doc_out)
                        self.generated_files.append({
                            "type": "lote", "path": out_name, "name": os.path.basename(out_name),
                            "folhas": len(doc_out), "folhas_entregues": self.folhas_entregues,
                            "folhas_no_trabalho": total_sheets,
                        })
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
                        # No FxVersoUnico a frente anda 1 a 1, igual ao simplex:
                        # cada página do arquivo é uma peça, e o verso está em
                        # outro arquivo. Só o `duplex` clássico salta de dois em
                        # dois, porque ali as páginas ímpares são o verso.
                        if is_duplex and not verso_unico(cfg.print_mode):
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
                            _sx, _sy = _escala_da_arte(cfg, arte_data)
                            _rect_arte, _clip_arte = _arte_na_celula(
                                cfg, cell_x0, cell_y0, base_w, base_h, page_base.rect, _sx, _sy)
                            if _rect_arte is not None:
                                out_page_front.show_pdf_page(
                                    _rect_arte, current_doc_base, page_idx_front,
                                    keep_proportion=False, clip=_clip_arte
                                )
                        else:
                            if cfg.layout_schema == "multi_artes":
                                err_msg = f"ERR: doc_base nulo! local_path={arte_data.get('local_path')} url={arte_data.get('pdf_url')}"
                                out_page_front.insert_textbox(
                                    fitz.Rect(cell_x0, cell_y0, cell_x1, cell_y1),
                                    err_msg, fontsize=8, color=(1,0,0))
                        csv_row = _linha_do_banco(arte_data, item_index, cfg.csv_data)
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
                            self._injetar_qr_ideal(rotated_el, current_val, item_index=item_index, item_data=arte_data)
                            self._render_element(out_page_front, rotated_el, cell_x0, cell_y0, current_val, csv_row)

                    else:
                        # FALLBACK: temp_doc para rotação de célula e arte_nome
                        temp_doc = fitz.open()
                        _fx, _fy = _folga_de_sangria(cfg)
                        temp_page = temp_doc.new_page(
                            width=cfg.item_w + 2 * _fx, height=cfg.item_h + 2 * _fy)

                        # A pagina temporaria tem a celula no meio, com uma folga
                        # de cada lado: por isso a origem aqui e (_fx, _fy) e nao
                        # o canto da celula na folha.
                        rect_art_temp = fitz.Rect(
                            _fx + (cfg.item_w - base_w) / 2 + cfg.offset_h,
                            _fy + (cfg.item_h - base_h) / 2 - cfg.offset_v,
                            _fx + (cfg.item_w + base_w) / 2 + cfg.offset_h,
                            _fy + (cfg.item_h + base_h) / 2 - cfg.offset_v)

                        if current_doc_base:
                            _sx, _sy = _escala_da_arte(cfg, arte_data)
                            _rect_arte, _clip_arte = _arte_na_celula(
                                cfg, _fx, _fy, base_w, base_h, page_base.rect, _sx, _sy)
                            if _rect_arte is not None:
                                temp_page.show_pdf_page(_rect_arte, current_doc_base, page_idx_front,
                                                        keep_proportion=False, clip=_clip_arte)
                        else:
                            if cfg.layout_schema == "multi_artes":
                                err_msg = f"ERR: doc_base nulo! local_path={arte_data.get('local_path')} url={arte_data.get('pdf_url')}"
                                temp_page.insert_textbox(rect_art_temp, err_msg, fontsize=8, color=(1,0,0))

                        csv_row = _linha_do_banco(arte_data, item_index, cfg.csv_data)

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
                            self._injetar_qr_ideal(rotated_el, current_val, item_index=item_index, item_data=arte_data)
                            self._render_element(temp_page, rotated_el, _fx, _fy, current_val, csv_row)

                        _desenhar_numero_do_modelo(temp_page, arte_data, _fx, _fy, cfg)

                        _temp_bytes = temp_doc.tobytes(garbage=0, deflate=True)
                        temp_doc.close()
                        _temp_doc_m = fitz.open("pdf", _temp_bytes)
                        out_page_front.show_pdf_page(
                            fitz.Rect(cell_x0 - _fx, cell_y0 - _fy, cell_x1 + _fx, cell_y1 + _fy),
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
                        if verso_unico(cfg.print_mode):
                            # FxVersoUnico: uma página só, anexada ao fim, e as N
                            # peças dividem a MESMA origem. A numeração de face
                            # `back` continua variando: o que se repete é a arte,
                            # não o VDP desenhado por cima dela.
                            page_idx_back = self._pagina_do_verso_unico(arte_data, cfg, current_doc_base)
                        elif cfg.layout_schema == "pdf_multiple":
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
                        _fx, _fy = _folga_de_sangria(cfg)
                        temp_page = temp_doc.new_page(
                            width=cfg.item_w + 2 * _fx, height=cfg.item_h + 2 * _fy)

                        if page_idx_back is not None and current_doc_base:
                            page_base_v = current_doc_base[page_idx_back]
                            base_w_verso = page_base_v.rect.width
                            base_h_verso = page_base_v.rect.height

                            # Centralizar, escalar e aplicar offset no plano da
                            # célula temporária. O verso usa a MESMA escala da
                            # frente (regra do usuário, 31/08/2026): é um arquivo
                            # só, e as duas faces têm de bater no corte.
                            _sx, _sy = _escala_da_arte(cfg, arte_data)
                            rect_art_temp, _clip_arte = _arte_na_celula(
                                cfg, _fx, _fy, base_w_verso, base_h_verso,
                                page_base_v.rect, _sx, _sy)

                            # Inserir arte na página temporária
                            if rect_art_temp is not None:
                                temp_page.show_pdf_page(rect_art_temp, current_doc_base, page_idx_back,
                                                        keep_proportion=False, clip=_clip_arte)

                        csv_row = _linha_do_banco(arte_data, item_index, cfg.csv_data)

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

                            self._injetar_qr_ideal(rotated_el, current_val, item_index=item_index, item_data=arte_data)
                            self._render_element(temp_page, rotated_el, _fx, _fy, current_val, csv_row)

                        # 2. Impor a pagina temporaria de verso na folha final
                        # FIX: materializar temp_doc para bytes (fix paginas em branco)
                        _temp_bytes = temp_doc.tobytes(garbage=0, deflate=True)
                        temp_doc.close()
                        _temp_doc_m = fitz.open("pdf", _temp_bytes)
                        out_page_back.show_pdf_page(
                            fitz.Rect(cell_x0 - _fx, cell_y0 - _fy, cell_x1 + _fx, cell_y1 + _fy),
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
                    _salvar_pdf(doc_out, out_name)
                    self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                    if not refazendo:
                        self._generate_contracapa(set_idx_current, cfg, doc_base)
        elif folhas_por_lote:
            # O resto: o ultimo lote quase nunca fecha certo no numero do bloco.
            if len(doc_out) > 0:
                out_name = cfg.out_pdf.replace(".pdf", f"_lote{set_idx_current + 1:03d}.pdf")
                _salvar_pdf(doc_out, out_name)
                self.folhas_entregues += len(doc_out)
                self.generated_files.append({
                    "type": "lote", "path": out_name, "name": os.path.basename(out_name),
                    "folhas": len(doc_out), "folhas_entregues": self.folhas_entregues,
                    "folhas_no_trabalho": total_sheets,
                })
            print(f"[engine] entrega por bloco: {len(self.generated_files)} lote(s), "
                  f"{self.folhas_entregues} folha(s) entregue(s) de {total_sheets}")
        else:
            if len(doc_out) > 0:
                _salvar_pdf(doc_out, cfg.out_pdf)
                self.generated_files.append({"type": "single", "path": cfg.out_pdf, "name": os.path.basename(cfg.out_pdf)})
        
        self._avisar_refazer_vazio(
            refazendo, r_de, r_ate, r_set, r_cels,
            folhas_por_set=([min(stack_size, total_sheets - i * stack_size)
                             for i in range(math.ceil(total_sheets / stack_size))]
                            if stack_size else None))
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
        _salvar_pdf(doc_c, out_name)
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
        _salvar_pdf(doc_c, out_name)
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
            # FxVersoUnico: uma página por peça, sem o salto de dois em dois — o
            # verso não ocupa página neste arquivo.
            if verso_unico(cfg.print_mode):
                page_idx_front = local_idx if current_doc_base and local_idx < len(current_doc_base) else 0
            else:
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
        csv_row = _linha_do_banco(item_data, global_idx, cfg.csv_data)

        if cell_rotation == 0 and not arte_nome:
            if current_doc_base:
                _sx, _sy = _escala_da_arte(cfg, item_data)
                _rect_arte, _clip_arte = _arte_na_celula(
                    cfg, cell_x0, cell_y0, base_w_frente, base_h_frente,
                    page_base_f.rect, _sx, _sy)
                if _rect_arte is not None:
                    out_page_front.show_pdf_page(
                        _rect_arte, current_doc_base, page_idx_front,
                        keep_proportion=False, clip=_clip_arte
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
                self._injetar_qr_ideal(rotated_el, current_val, item_data=item_data)
                self._render_element(out_page_front, rotated_el, cell_x0, cell_y0, current_val, csv_row)
        else:
            temp_doc = fitz.open()
            _fx, _fy = _folga_de_sangria(cfg)
            temp_page = temp_doc.new_page(
                width=cfg.item_w + 2 * _fx, height=cfg.item_h + 2 * _fy)

            if current_doc_base:
                _sx, _sy = _escala_da_arte(cfg, item_data)
                rect_art_temp, _clip_arte = _arte_na_celula(
                    cfg, _fx, _fy, base_w_frente, base_h_frente,
                    page_base_f.rect, _sx, _sy)
                if rect_art_temp is not None:
                    temp_page.show_pdf_page(rect_art_temp, current_doc_base, page_idx_front,
                                            keep_proportion=False, clip=_clip_arte)

            for el in current_elements:
                if el.get("face", "both") == "back":
                    continue
                current_val = val2 if el.get("_num_source", 1) == 2 else val
                
                item_num_tipo = item_data.get("num_tipo", "SEQUENCIAL")
                if item_num_tipo == "TICKET" and el.get("_num_source", 1) == 1:
                    pos = int(el.get("ticket_pos", 1))
                    N = int(item_data.get("ticket_qtd", 1))
                    current_val = item_data.get("start_base", 1) + (item_data.get("local_idx", 0) * N) + (pos - 1)
                
                # A rotacao da celula NAO se aplica ao elemento aqui: quem gira
                # e o `show_pdf_page(rotate=cell_rotation)` que poe a pagina
                # temporaria na folha, mais abaixo. O laco principal sempre fez
                # so isto, no ponto gemeo.
                #
                # Ate a v630 havia aqui uma chamada a `rotate_element_coords`,
                # funcao que nao existe em lugar nenhum do repositorio. Ela so
                # era alcancada quando a pose tinha rotacao E o caminho era o de
                # MONTAGEM — ou seja, ao combinar modelos. O formato
                # `Credencial 90x140` gira as poses 2 e 3 em 180 graus, entao
                # imprimir dois modelos juntos ali morria com
                # `name 'rotate_element_coords' is not defined`.
                rotated_el = dict(el)
                if cfg.num_tipo == "CAMAROTE" and el["type"].startswith("CAMAROTE_"):
                    c_idx = item_data.get("local_idx", 0)
                    c_l_cam = item_data.get("l_cam")
                    c_c_ini = item_data.get("c_ini")
                    c_start = item_data.get("start_base")
                    current_val = self._resolve_camarote_val(rotated_el, c_idx, current_val, c_l_cam, c_c_ini, c_start)
                self._injetar_qr_ideal(rotated_el, current_val, item_data=item_data)
                self._render_element(temp_page, rotated_el, _fx, _fy, current_val, csv_row)

            _desenhar_numero_do_modelo(temp_page, item_data, _fx, _fy, cfg)

            _temp_bytes = temp_doc.tobytes(garbage=0, deflate=True)
            temp_doc.close()
            _temp_doc_m = fitz.open("pdf", _temp_bytes)
            out_page_front.show_pdf_page(
                fitz.Rect(cell_x0 - _fx, cell_y0 - _fy, cell_x1 + _fx, cell_y1 + _fy),
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

        if verso_unico(cfg.print_mode):
            # FxVersoUnico: índice fixo, o mesmo para todas as peças desta arte.
            page_idx_back = self._pagina_do_verso_unico(item_data, cfg, current_doc_base)
        elif cfg.layout_schema == "pdf_multiple":
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
        csv_row = _linha_do_banco(item_data, global_idx, cfg.csv_data)

        if cell_rotation == 0 and not arte_nome:
            if page_idx_back is not None and current_doc_base:
                _sx, _sy = _escala_da_arte(cfg, item_data)
                _rect_arte, _clip_arte = _arte_na_celula(
                    cfg, cell_x0, cell_y0, base_w_verso, base_h_verso,
                    page_base_v.rect, _sx, _sy)
                if _rect_arte is not None:
                    out_page_back.show_pdf_page(
                        _rect_arte, current_doc_base, page_idx_back,
                        keep_proportion=False, clip=_clip_arte
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
                self._injetar_qr_ideal(rotated_el, current_val, item_data=item_data)
                self._render_element(out_page_back, rotated_el, cell_x0, cell_y0, current_val, csv_row)
        else:
            temp_doc = fitz.open()
            _fx, _fy = _folga_de_sangria(cfg)
            temp_page = temp_doc.new_page(
                width=cfg.item_w + 2 * _fx, height=cfg.item_h + 2 * _fy)

            if page_idx_back is not None and current_doc_base:
                _sx, _sy = _escala_da_arte(cfg, item_data)
                rect_art_temp, _clip_arte = _arte_na_celula(
                    cfg, _fx, _fy, base_w_verso, base_h_verso,
                    page_base_v.rect, _sx, _sy)
                if rect_art_temp is not None:
                    temp_page.show_pdf_page(rect_art_temp, current_doc_base, page_idx_back,
                                            keep_proportion=False, clip=_clip_arte)

            for el in current_elements:
                if el.get("face", "both") == "front":
                    continue
                current_val = val2 if el.get("_num_source", 1) == 2 else val
                
                item_num_tipo = item_data.get("num_tipo", "SEQUENCIAL")
                if item_num_tipo == "TICKET" and el.get("_num_source", 1) == 1:
                    pos = int(el.get("ticket_pos", 1))
                    N = int(item_data.get("ticket_qtd", 1))
                    current_val = item_data.get("start_base", 1) + (item_data.get("local_idx", 0) * N) + (pos - 1)
                
                # A rotacao da celula NAO se aplica ao elemento aqui: quem gira
                # e o `show_pdf_page(rotate=cell_rotation)` que poe a pagina
                # temporaria na folha, mais abaixo. O laco principal sempre fez
                # so isto, no ponto gemeo.
                #
                # Ate a v630 havia aqui uma chamada a `rotate_element_coords`,
                # funcao que nao existe em lugar nenhum do repositorio. Ela so
                # era alcancada quando a pose tinha rotacao E o caminho era o de
                # MONTAGEM — ou seja, ao combinar modelos. O formato
                # `Credencial 90x140` gira as poses 2 e 3 em 180 graus, entao
                # imprimir dois modelos juntos ali morria com
                # `name 'rotate_element_coords' is not defined`.
                rotated_el = dict(el)
                if cfg.num_tipo == "CAMAROTE" and el["type"].startswith("CAMAROTE_"):
                    c_idx = item_data.get("local_idx", 0)
                    c_l_cam = item_data.get("l_cam")
                    c_c_ini = item_data.get("c_ini")
                    c_start = item_data.get("start_base")
                    current_val = self._resolve_camarote_val(rotated_el, c_idx, current_val, c_l_cam, c_c_ini, c_start)
                self._injetar_qr_ideal(rotated_el, current_val, item_data=item_data)
                self._render_element(temp_page, rotated_el, _fx, _fy, current_val, csv_row)

            _desenhar_numero_do_modelo(temp_page, item_data, _fx, _fy, cfg)

            _temp_bytes = temp_doc.tobytes(garbage=0, deflate=True)
            temp_doc.close()
            _temp_doc_m = fitz.open("pdf", _temp_bytes)
            out_page_back.show_pdf_page(
                fitz.Rect(cell_x0 - _fx, cell_y0 - _fy, cell_x1 + _fx, cell_y1 + _fy),
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
        _salvar_pdf(doc_c, out_name)
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
        _salvar_pdf(doc_c, out_name)
        doc_c.close()
        self.generated_files.append({"type": "capa", "path": out_name, "name": os.path.basename(out_name)})

    def _avisar_refazer_vazio(self, refazendo, r_de, r_ate, r_set, r_cels, folhas_por_set=None):
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
        # A trava diz a saida (02/09/2026): quais sets este trabalho tem e
        # quantas folhas cada um. Foi o "set 3" do 21460 -- o operador escolheu
        # o que a tela oferecia, e a recusa nao dizia o que existia.
        existentes = ""
        if r_de > 0 and folhas_por_set:
            existentes = (
                f" Este trabalho tem {len(folhas_por_set)} set(s): "
                + ", ".join(f"set {i + 1} com {n} folha(s)" for i, n in enumerate(folhas_por_set))
                + "."
            )
        raise ValueError(
            "Refazer: nada corresponde a " + " e ".join(alvo) + "." + existentes
            + " Confira a faixa de folhas e as posicoes pedidas."
        )
