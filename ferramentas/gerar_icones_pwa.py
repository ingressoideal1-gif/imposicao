# -*- coding: utf-8 -*-
"""Gera os icones do PWA da portaria a partir de um PNG unico.

Por que um script, e nao cinco arquivos feitos a mao: a marca muda, e refazer
cinco PNGs mantendo a mesma proporcao e exatamente onde o erro entra. Aqui a
proporcao e constante e o `tests/test_portaria_pwa.py` confere o resultado.

Rode: .\\venv\\Scripts\\python.exe ferramentas\\gerar_icones_pwa.py
"""

import os

from PIL import Image, ImageChops, ImageDraw

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")

# Se o usuario entregar um icone proprio, ele entra aqui e tem preferencia.
ORIGEM_PREFERIDA = os.path.join(FRENTE, "icone-portaria-origem.png")
ORIGEM_PADRAO = os.path.join(FRENTE, "logo.png")

FUNDO = (10, 15, 30)  # #0a0f1e -- o mesmo --bg da portaria.html

# (caminho de saida, lado em pixels, fracao do lado que a marca ocupa)
#
# 1.00 nos icones comuns e no do iPhone: a marca JA e um icone de aplicativo --
#      quadrado arredondado, com fundo proprio. Encolhe-la deixaria uma moldura
#      da cor do fundo em volta, e o resultado seria um icone pequeno dentro de
#      um quadrado escuro em vez de um icone.
# 0.80 nos "maskable": a mascara do Android pode comer ate 20% de cada borda.
#      Como esta marca tem fundo proprio ate a beirada, dar 0.80 a ela mantem o
#      desenho inteiro dentro do circulo seguro, e o que sobra na borda e a cor
#      de fundo -- exatamente o que a mascara existe para cortar.
SAIDAS = [
    (os.path.join(FRENTE, "icones", "portaria-192.png"), 192, 1.00),
    (os.path.join(FRENTE, "icones", "portaria-512.png"), 512, 1.00),
    (os.path.join(FRENTE, "icones", "portaria-192-maskable.png"), 192, 0.80),
    (os.path.join(FRENTE, "icones", "portaria-512-maskable.png"), 512, 0.80),
    (os.path.join(FRENTE, "apple-touch-icon.png"), 180, 1.00),
]

# Quanto um pixel pode se afastar do branco e ainda contar como fundo, no
# preenchimento que recorta a moldura.
#
# O numero e a SOMA das tres bandas, nao a diferenca por banda -- e assim que o
# `ImageDraw.floodfill` compara. Por isso 240 aqui significa cerca de 80 por
# banda: cinza ate (175,175,175) conta como fundo.
#
# Alto de proposito: a arte vem com SOMBRA, um cinza claro que um limite
# apertado deixa para tras como auréola suja em volta do icone -- foi o que
# aconteceu com 60 (que valia so 20 por banda, ou seja, branco quase puro).
# Ainda assim ha folga larga ate a marca: a beirada azul do icone esta a mais de
# 400 do branco nessa mesma conta.
TOLERANCIA_FUNDO = 240


def origem():
    if os.path.exists(ORIGEM_PREFERIDA):
        return ORIGEM_PREFERIDA
    return ORIGEM_PADRAO


def recortar_moldura(bruta):
    """Tira a moldura de fundo da arte e devolve so a marca, em RGBA.

    A arte de origem e entregue como imagem de catalogo: o icone no meio, fundo
    branco em volta, sombra por baixo. Colada assim num quadrado escuro, ela
    apareceria como um retangulo BRANCO com o icone dentro -- que e o oposto do
    que se quer.

    O recorte e por PREENCHIMENTO a partir dos quatro cantos, e nao por "todo
    pixel claro vira transparente": o proprio icone tem uma etiqueta branca no
    meio do desenho, e um teste por cor sozinho a apagaria por dentro. O
    preenchimento so alcanca o que esta ligado a borda.

    Arte que ja venha com transparencia passa direto -- nao ha moldura a tirar.
    """
    if bruta.mode in ("RGBA", "LA") and bruta.getchannel("A").getextrema()[0] < 255:
        return bruta.convert("RGBA")

    im = bruta.convert("RGB")
    # O preenchimento pinta de magenta o que for fundo; nenhuma cor da marca e
    # esse magenta, entao ele serve de marcador para virar transparencia.
    MARCA_DE_FUNDO = (255, 0, 255)
    L, A = im.size
    for canto in ((0, 0), (L - 1, 0), (0, A - 1), (L - 1, A - 1)):
        ImageDraw.floodfill(im, canto, MARCA_DE_FUNDO, thresh=TOLERANCIA_FUNDO)

    # A mascara sai por diferenca de imagem inteira: onde a cor e EXATAMENTE o
    # magenta do preenchimento, a diferenca e zero nas tres bandas. Somar as
    # bandas e comparar com zero e o mesmo que comparar a tupla, so que sem
    # varrer um milhao de pixels em Python.
    solido = Image.new("RGB", im.size, MARCA_DE_FUNDO)
    r, g, b = ImageChops.difference(im, solido).split()
    soma = ImageChops.add(ImageChops.add(r, g), b)
    mascara = soma.point(lambda v: 0 if v == 0 else 255)

    fora = bruta.convert("RGBA")
    fora.putalpha(mascara)

    caixa = fora.getbbox()
    return fora.crop(caixa) if caixa else fora


def gerar(marca, caminho, lado, fracao):
    """Centraliza a marca num quadrado opaco, sem distorcer.

    `min()` nas duas escalas, e nao `resize((lado, lado))`: a marca pode nao ser
    quadrada, e estica-la para caber deformaria a logomarca.
    """
    tela = Image.new("RGBA", (lado, lado), FUNDO + (255,))
    alvo = lado * fracao
    escala = min(alvo / marca.width, alvo / marca.height)
    novo = (max(1, int(round(marca.width * escala))),
            max(1, int(round(marca.height * escala))))
    reduzida = marca.resize(novo, Image.LANCZOS)
    tela.paste(reduzida, ((lado - novo[0]) // 2, (lado - novo[1]) // 2), reduzida)

    pasta = os.path.dirname(caminho)
    if not os.path.isdir(pasta):
        os.makedirs(pasta)
    # convert("RGB") achata sobre o FUNDO: os icones saem OPACOS de proposito
    # (ver o teste `test_o_icone_e_opaco`).
    tela.convert("RGB").save(caminho, "PNG", optimize=True)
    return caminho


def main():
    caminho_origem = origem()
    print("origem: " + os.path.relpath(caminho_origem, RAIZ))
    with Image.open(caminho_origem) as bruta:
        marca = recortar_moldura(bruta)
        print("  marca recortada: %dx%d (a origem tem %dx%d)"
              % (marca.width, marca.height, bruta.width, bruta.height))
        for caminho, lado, fracao in SAIDAS:
            gerar(marca, caminho, lado, fracao)
            print("  " + os.path.relpath(caminho, RAIZ) + "  %dx%d" % (lado, lado))


if __name__ == "__main__":
    main()
