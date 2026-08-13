# -*- coding: utf-8 -*-
"""
Elemento FOTO: a janela de foto da credencial.

A medicao aqui nao e da estrutura do PDF, e do PAPEL: cada teste rasteriza a
pagina e conta pixels dentro da janela. E o unico jeito honesto de afirmar que
"cobrir preenche a janela" ou que "a foto nao distorce" — a arvore de objetos do
PDF pode estar certa e a tinta sair errada.

Geometria: _render_element recebe o centro do elemento ja em pontos, nas chaves
_x/_y (quem converte de x_mm e o chamador).
"""
import fitz
import pytest
from PIL import Image

from engine import ImpositionEngine, MM2PT

# Janela de 25x32 mm, o formato classico da foto 3x4 de credencial.
JAN_W_MM, JAN_H_MM = 25.0, 32.0
JAN_W = JAN_W_MM * MM2PT
JAN_H = JAN_H_MM * MM2PT

# A janela e desenhada no centro de uma pagina folgada, para sobrar branco em
# volta e o teste conseguir ver o que vazou.
PAG_W, PAG_H = 300.0, 300.0
CX_PT, CY_PT = PAG_W / 2, PAG_H / 2

VERMELHO = (255, 0, 0)
AZUL = (0, 0, 255)
VERDE = (0, 200, 0)
BRANCO = (255, 255, 255)


@pytest.fixture(scope="module")
def foto_metades(tmp_path_factory):
    """400x200: metade esquerda vermelha, metade direita azul."""
    img = Image.new("RGB", (400, 200), VERMELHO)
    for x in range(200, 400):
        for y in range(200):
            img.putpixel((x, y), AZUL)
    p = tmp_path_factory.mktemp("fotos") / "metades.jpg"
    img.save(p, quality=95)
    return str(p)


@pytest.fixture(scope="module")
def foto_alvo(tmp_path_factory):
    """400x400 branca com um quadrado verde de 100x100 exatamente no centro."""
    img = Image.new("RGB", (400, 400), BRANCO)
    for x in range(150, 250):
        for y in range(150, 250):
            img.putpixel((x, y), VERDE)
    p = tmp_path_factory.mktemp("fotos") / "alvo.jpg"
    img.save(p, quality=95)
    return str(p)


def _el(caminho, **extra):
    el = {
        "type": "FOTO", "source": "database", "csv_column": "Foto",
        "_x": CX_PT, "_y": CY_PT,
        "width_mm": JAN_W_MM, "height_mm": JAN_H_MM,
        "fit": "cover", "rotation": 0,
    }
    el.update(extra)
    return el, {"Foto": caminho}


def _pintar(el, linha):
    doc = fitz.open()
    page = doc.new_page(width=PAG_W, height=PAG_H)
    eng = object.__new__(ImpositionEngine)
    eng._url_cache = {}
    eng._render_element(page, el, 0, 0, 1, linha)
    pix = page.get_pixmap(dpi=150)
    return doc, page, pix


def _conta_cores(pix, x0, y0, x1, y1):
    """Conta pixels por cor grosseira dentro do retangulo em PONTOS."""
    f = pix.width / PAG_W  # pontos -> pixels do raster
    cont = {"vermelho": 0, "azul": 0, "verde": 0, "branco": 0, "outro": 0}
    for px in range(int(x0 * f) + 2, int(x1 * f) - 2):
        for py in range(int(y0 * f) + 2, int(y1 * f) - 2):
            r, g, b = pix.pixel(px, py)[:3]
            if r > 200 and g > 200 and b > 200:
                cont["branco"] += 1
            elif r > 150 and g < 100 and b < 100:
                cont["vermelho"] += 1
            elif b > 150 and r < 100 and g < 100:
                cont["azul"] += 1
            elif g > 120 and r < 150 and b < 120:
                cont["verde"] += 1
            else:
                cont["outro"] += 1
    return cont


def _janela_pt():
    return (CX_PT - JAN_W / 2, CY_PT - JAN_H / 2, CX_PT + JAN_W / 2, CY_PT + JAN_H / 2)


def test_cobrir_preenche_a_janela_inteira(foto_metades):
    """Sem margem branca: e o que 'cobrir' promete e o que a credencial exige."""
    el, linha = _el(foto_metades)
    doc, page, pix = _pintar(el, linha)
    cont = _conta_cores(pix, *_janela_pt())
    total = sum(cont.values())
    assert total > 1000
    assert cont["branco"] / total < 0.02


def test_cobrir_nao_vaza_para_fora_da_janela(foto_metades):
    """Uma faixa logo acima da janela tem de continuar branca."""
    el, linha = _el(foto_metades)
    doc, page, pix = _pintar(el, linha)
    x0, y0, x1, _ = _janela_pt()
    cont = _conta_cores(pix, x0, y0 - 20, x1, y0 - 4)
    total = sum(cont.values())
    assert total > 100
    assert cont["branco"] / total > 0.98


def test_enquadramento_escolhe_o_que_aparece(foto_metades):
    """cx a esquerda mostra o vermelho; cx a direita mostra o azul."""
    el_e, linha = _el(foto_metades)
    linha_e = {"Foto": "", "__fotos": {"Foto": {"url": foto_metades, "cx": 0.12, "cy": 0.5, "zoom": 1.0}}}
    _, _, pix_e = _pintar(el_e, linha_e)
    ce = _conta_cores(pix_e, *_janela_pt())

    linha_d = {"Foto": "", "__fotos": {"Foto": {"url": foto_metades, "cx": 0.88, "cy": 0.5, "zoom": 1.0}}}
    _, _, pix_d = _pintar(el_e, linha_d)
    cd = _conta_cores(pix_d, *_janela_pt())

    assert ce["vermelho"] > ce["azul"] * 5
    assert cd["azul"] > cd["vermelho"] * 5


def test_zoom_aproxima(foto_alvo):
    """Com zoom 2 o quadrado verde ocupa mais da janela do que com zoom 1."""
    el, _ = _el(foto_alvo)
    l1 = {"__fotos": {"Foto": {"url": foto_alvo, "cx": 0.5, "cy": 0.5, "zoom": 1.0}}}
    l2 = {"__fotos": {"Foto": {"url": foto_alvo, "cx": 0.5, "cy": 0.5, "zoom": 2.0}}}
    _, _, p1 = _pintar(el, l1)
    _, _, p2 = _pintar(el, l2)
    c1 = _conta_cores(p1, *_janela_pt())
    c2 = _conta_cores(p2, *_janela_pt())
    f1 = c1["verde"] / sum(c1.values())
    f2 = c2["verde"] / sum(c2.values())
    assert f2 > f1 * 1.8


def test_nao_distorce(foto_alvo):
    """O quadrado verde continua quadrado dentro de uma janela retangular."""
    el, _ = _el(foto_alvo)
    linha = {"__fotos": {"Foto": {"url": foto_alvo, "cx": 0.5, "cy": 0.5, "zoom": 1.0}}}
    doc, page, pix = _pintar(el, linha)
    f = pix.width / PAG_W
    xs, ys = [], []
    for px in range(pix.width):
        for py in range(pix.height):
            r, g, b = pix.pixel(px, py)[:3]
            if g > 120 and r < 150 and b < 120:
                xs.append(px)
                ys.append(py)
    assert xs, "o quadrado verde nao apareceu na pagina"
    larg = (max(xs) - min(xs)) / f
    alt = (max(ys) - min(ys)) / f
    assert abs(larg - alt) / max(larg, alt) < 0.05


def test_caber_deixa_margem(foto_metades):
    """'caber' encaixa a foto inteira: sobra branco nas laterais."""
    el, linha = _el(foto_metades, fit="contain")
    doc, page, pix = _pintar(el, linha)
    cont = _conta_cores(pix, *_janela_pt())
    total = sum(cont.values())
    assert cont["branco"] / total > 0.25
    assert cont["vermelho"] > 0 and cont["azul"] > 0


def test_sem_contorno_por_padrao(foto_metades):
    """A janela nao ganha moldura que ninguem pediu.

    O padrao existia como andaime de editor e vazou para as previas: aparecia um
    fio em volta de toda foto. Contorno agora e escolha, e a escolha padrao e
    nenhum.
    """
    el, linha = _el(foto_metades)
    doc, page, pix = _pintar(el, linha)
    x0, y0, x1, y1 = _janela_pt()
    # Faixa de 3 pt logo FORA da janela: com moldura, ela teria tinta.
    cont = _conta_cores(pix, x0 - 4, y0 - 4, x1 + 4, y0 - 1)
    total = sum(cont.values())
    assert total > 50
    assert cont["branco"] / total > 0.98


def test_contorno_pedido_aparece_na_cor_e_espessura(foto_metades):
    """2 mm de contorno verde tem de virar tinta verde na borda da janela."""
    el, linha = _el(foto_metades, border_mm=2, border_color="#00C800")
    doc, page, pix = _pintar(el, linha)
    x0, y0, x1, y1 = _janela_pt()
    # Faixa dentro da janela, na borda de cima: e ali que o contorno mora.
    cont = _conta_cores(pix, x0 + 4, y0 + 1, x1 - 4, y0 + 2 * MM2PT - 1)
    total = sum(cont.values())
    assert total > 50
    assert cont["verde"] / total > 0.8, cont

    # O miolo continua sendo a foto, nao a cor do contorno.
    meio = _conta_cores(pix, x0 + 4 * MM2PT, y0 + 8 * MM2PT, x1 - 4 * MM2PT, y1 - 8 * MM2PT)
    assert meio["verde"] < sum(meio.values()) * 0.05


def test_canto_circulo_recorta_de_verdade(foto_metades):
    """Circulo na tela tem de ser circulo no papel.

    Sem o recorte, o operador escolhia "Circulo", via um circulo na tela e
    imprimia um retangulo — a divergencia mais cara que existe aqui.
    """
    el, linha = _el(foto_metades, corner="circle")
    doc, page, pix = _pintar(el, linha)
    x0, y0, x1, y1 = _janela_pt()

    # Canto superior esquerdo da janela: fora da elipse, tem de continuar branco.
    canto = _conta_cores(pix, x0 + 1, y0 + 1, x0 + 5, y0 + 5)
    assert sum(canto.values()) > 4
    assert canto["branco"] / sum(canto.values()) > 0.8, canto

    # O centro continua pintado.
    centro = _conta_cores(pix, (x0 + x1) / 2 - 6, (y0 + y1) / 2 - 6, (x0 + x1) / 2 + 6, (y0 + y1) / 2 + 6)
    assert centro["branco"] / sum(centro.values()) < 0.2, centro


# ─── Conferencia previa e pre-carregamento ────────────────────────────────────

class _CfgFake:
    def __init__(self, elements, csv_data):
        self.elements = elements
        self.csv_data = csv_data


def _engine_fake(elements, csv_data):
    eng = object.__new__(ImpositionEngine)
    eng._url_cache = {}
    eng.cfg = _CfgFake(elements, csv_data)
    return eng


EL_FOTO = {"type": "FOTO", "csv_column": "Foto", "width_mm": 25, "height_mm": 32}


def test_linha_sem_foto_interrompe_antes_de_imprimir(foto_metades):
    """Melhor parar agora do que descobrir a janela vazia com o PVC na bandeja."""
    eng = _engine_fake([EL_FOTO], [
        {"Nome": "Ana", "Foto": foto_metades},
        {"Nome": "Bruno", "Foto": ""},
        {"Nome": "Carla", "Foto": foto_metades},
    ])
    with pytest.raises(ValueError) as ex:
        eng._conferir_e_aquecer_fotos()
    msg = str(ex.value)
    assert "2" in msg          # a linha acusada
    assert "Foto" in msg       # e a coluna


def test_a_mesma_foto_repetida_baixa_uma_vez_so(monkeypatch, foto_metades):
    """Credencial de evento repete logo e fundo; baixar de novo e tempo jogado fora."""
    import engine as eng_mod
    monkeypatch.setattr(eng_mod, "_foto_cache_path", lambda origem: None)

    baixados = []

    def _falso_download(self, url):
        baixados.append(url)
        with open(foto_metades, "rb") as f:
            return f.read()

    monkeypatch.setattr(ImpositionEngine, "_get_url_bytes", _falso_download)

    url = "https://exemplo.invalido/fotos/abc.jpg"
    eng = _engine_fake([EL_FOTO], [{"Foto": url} for _ in range(5)])
    eng._conferir_e_aquecer_fotos()

    assert len(baixados) == 1
    assert eng._get_foto_bytes(url)  # sai do cache, sem novo download
    assert len(baixados) == 1


def test_sem_elemento_foto_nao_confere_nada():
    """Numeracao de ingresso nao pode pagar pedagio por um recurso que nao usa."""
    eng = _engine_fake([{"type": "TEXT"}], [{"Nome": "Ana"}])
    eng._conferir_e_aquecer_fotos()  # nao levanta


def test_valor_cru_da_coluna_tambem_serve(foto_metades):
    """Sem __fotos, o caminho escrito na propria coluna vale — como no BarTender."""
    el, linha = _el(foto_metades)
    doc, page, pix = _pintar(el, linha)
    cont = _conta_cores(pix, *_janela_pt())
    assert cont["vermelho"] + cont["azul"] > 1000


# ─── O que conta como origem de foto ──────────────────────────────────────────
#
# A celula pode trazer tres coisas: um endereco (o que o Gerenciador de Fotos
# grava), um caminho de arquivo (o modo BarTender) ou um NOME SOLTO, que nao
# aponta para lugar nenhum. O terceiro caso e o perigoso: ele parece preenchido
# e engana a conferencia previa, ate a imposicao estourar no meio da tiragem.


def test_nome_de_arquivo_solto_nao_e_origem():
    """"JAQUE ROSSI.jpeg" nao e endereco nem caminho: e so um nome."""
    from engine import _origem_de_foto
    assert _origem_de_foto("JAQUE ROSSI.jpeg") == ""
    assert _origem_de_foto("  ") == ""
    assert _origem_de_foto("ana") == ""


def test_endereco_e_caminho_continuam_sendo_origem():
    from engine import _origem_de_foto
    assert _origem_de_foto("https://x/y/ana.jpg")
    assert _origem_de_foto("data:image/jpeg;base64,AAAA")
    assert _origem_de_foto(r"C:\fotos\ana.jpg")
    assert _origem_de_foto("fotos/ana.jpg")
    assert _origem_de_foto(r"\\servidor\fotos\ana.jpg")


def test_nome_solto_e_acusado_antes_de_imprimir(foto_metades):
    """O caso real: a celula tinha o nome do arquivo e a tiragem morreu no meio.

    A conferencia previa existe para acusar TODAS as pendencias de uma vez. Um
    nome solto passava por ela como se fosse foto, e so estourava ao impor
    aquele item — com o PVC ja na bandeja.
    """
    eng = _engine_fake([EL_FOTO], [
        {"Nome": "Ana", "Foto": foto_metades},
        {"Nome": "Jaque", "Foto": "JAQUE ROSSI.jpeg"},
    ])
    with pytest.raises(ValueError) as ex:
        eng._conferir_e_aquecer_fotos()
    msg = str(ex.value)
    assert "linha 2" in msg
    assert "JAQUE ROSSI.jpeg" in msg          # o operador precisa saber QUAL nome
    assert "Gerenciador de Fotos" in msg      # o que fazer a respeito
    assert "desmarque as linhas" in msg       # e como imprimir os prontos JA:
    # a mensagem e a interface do freio, e um freio sem saida de emergencia
    # obriga a grafica a parar 83 credenciais prontas por causa de 5 pendentes.


def test_caminho_que_nao_existe_e_acusado_antes_de_imprimir(tmp_path, foto_metades):
    """Modo BarTender com o arquivo fora do lugar: acusar agora, nao no meio."""
    sumido = str(tmp_path / "pasta_que_nao_existe" / "ana.jpg")
    eng = _engine_fake([EL_FOTO], [{"Foto": foto_metades}, {"Foto": sumido}])
    with pytest.raises(ValueError) as ex:
        eng._conferir_e_aquecer_fotos()
    assert "ana.jpg" in str(ex.value)


def test_caminho_local_que_existe_passa_na_conferencia(foto_metades):
    """O modo BarTender continua valendo: arquivo que existe nao vira pendencia."""
    eng = _engine_fake([EL_FOTO], [{"Foto": foto_metades}])
    eng._conferir_e_aquecer_fotos()  # nao levanta


def test_nome_solto_nao_vira_janela_pintada(foto_metades):
    """Se escapar da conferencia, o render acusa em vez de inventar uma foto."""
    el, linha = _el("JAQUE ROSSI.jpeg")
    with pytest.raises(RuntimeError) as ex:
        _pintar(el, linha)
    assert "JAQUE ROSSI.jpeg" in str(ex.value)


# ─── O PDF precisa valer para o Acrobat, nao so para o MuPDF ─────────────────
#
# O MuPDF renderiza o que o Acrobat rejeita — medir pixel prova a tinta, nao a
# validade. O caso real: canto redondo gerava a foto com SMask em ColorSpace
# ICCBased de 1 bit; a especificacao exige DeviceGray, o Acrobat descartava
# todas as fotos da pagina ("Ha um erro nesta pagina") e o operador recebia um
# lote de credenciais sem rosto — com o MuPDF (e a tela) mostrando tudo certo.


def _smasks_do_pdf(doc):
    """[(xref_da_imagem, objeto_da_smask)] de todas as imagens com mascara."""
    import re
    achadas = []
    for pno in range(len(doc)):
        for img in doc[pno].get_images(full=True):
            obj = doc.xref_object(img[0], compressed=True)
            m = re.search(r"/SMask (\d+) 0 R", obj)
            if m:
                achadas.append((img[0], doc.xref_object(int(m.group(1)), compressed=True)))
    return achadas


@pytest.mark.parametrize("canto", ["round", "circle"])
def test_canto_redondo_gera_smask_devicegray(foto_metades, canto):
    """A mascara do recorte tem de ser SMask /DeviceGray — regra do Acrobat."""
    el, linha = _el(foto_metades, corner=canto)
    doc, page, pix = _pintar(el, linha)
    # O defeito so aparece no arquivo SALVO (e o que o cliente abre), nao no
    # documento vivo.
    dados = doc.tobytes(garbage=4, deflate=True)
    salvo = fitz.open("pdf", dados)
    smasks = _smasks_do_pdf(salvo)
    assert smasks, "canto redondo sem nenhuma SMask: o recorte sumiu"
    for xref_img, obj in smasks:
        assert "/DeviceGray" in obj and "ICCBased" not in obj, (
            f"SMask da imagem {xref_img} fora da especificacao (Acrobat rejeita): {obj[:200]}"
        )
    salvo.close()


def test_canto_redondo_continua_recortando(foto_metades):
    """A correcao da SMask nao pode devolver o canto quadrado: os cantos da
    janela devem ficar brancos (recortados) e o miolo pintado."""
    el, linha = _el(foto_metades, corner="circle")
    doc, page, pix = _pintar(el, linha)
    x0, y0, x1, y1 = _janela_pt()
    canto_sup = _conta_cores(pix, x0, y0, x0 + 4, y0 + 4)
    assert canto_sup["vermelho"] + canto_sup["azul"] == 0, canto_sup
    miolo = _conta_cores(pix, (x0 + x1) / 2 - 8, (y0 + y1) / 2 - 8,
                         (x0 + x1) / 2 + 8, (y0 + y1) / 2 + 8)
    assert miolo["vermelho"] + miolo["azul"] > 100, miolo
