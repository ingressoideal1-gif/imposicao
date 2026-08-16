# -*- coding: utf-8 -*-
"""Gera os icones do PWA da portaria a partir de um PNG unico.

Por que um script, e nao cinco arquivos feitos a mao: a marca muda, e refazer
cinco PNGs mantendo a mesma proporcao e exatamente onde o erro entra. Aqui a
proporcao e constante e o `tests/test_portaria_pwa.py` confere o resultado.

Rode: .\\venv\\Scripts\\python.exe ferramentas\\gerar_icones_pwa.py
"""

import os

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")

# Se o usuario entregar um icone proprio, ele entra aqui e tem preferencia.
ORIGEM_PREFERIDA = os.path.join(FRENTE, "icone-portaria-origem.png")
ORIGEM_PADRAO = os.path.join(FRENTE, "logo.png")

FUNDO = (10, 15, 30)  # #0a0f1e -- o mesmo --bg da portaria.html

# (caminho de saida, lado em pixels, fracao do lado que a marca ocupa)
#
# 0.86 nos icones comuns: quase cheio, que e como o Android desenha quando NAO
#      aplica mascara.
# 0.60 nos "maskable": a mascara pode comer ate 20% de cada borda, e o circulo
#      seguro tem 80% do lado. 0.60 cabe com folga em qualquer mascara --
#      circulo, quadrado arredondado ou gota.
# 0.80 no do iPhone: o iOS arredonda os cantos por conta, sem mascara agressiva.
SAIDAS = [
    (os.path.join(FRENTE, "icones", "portaria-192.png"), 192, 0.86),
    (os.path.join(FRENTE, "icones", "portaria-512.png"), 512, 0.86),
    (os.path.join(FRENTE, "icones", "portaria-192-maskable.png"), 192, 0.60),
    (os.path.join(FRENTE, "icones", "portaria-512-maskable.png"), 512, 0.60),
    (os.path.join(FRENTE, "apple-touch-icon.png"), 180, 0.80),
]


def origem():
    if os.path.exists(ORIGEM_PREFERIDA):
        return ORIGEM_PREFERIDA
    return ORIGEM_PADRAO


def gerar(marca, caminho, lado, fracao):
    """Centraliza a marca num quadrado opaco, sem distorcer.

    `min()` nas duas escalas, e nao `resize((lado, lado))`: a marca nao e
    quadrada (530x410 hoje), e esticar para caber deformaria a logomarca.
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
        marca = bruta.convert("RGBA")
        for caminho, lado, fracao in SAIDAS:
            gerar(marca, caminho, lado, fracao)
            print("  " + os.path.relpath(caminho, RAIZ) + "  %dx%d" % (lado, lado))


if __name__ == "__main__":
    main()
