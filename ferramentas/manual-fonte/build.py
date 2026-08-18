# -*- coding: utf-8 -*-
"""Monta o manual-ideal-control.html a partir das partes, embutindo os recursos.

Um arquivo so, sem rede: a fonte da identidade (Manrope, OFL, ja embarcada no
proprio aplicativo) e o icone entram como data URI.
"""
import base64
import io
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(AQUI))
SAIDA = os.path.join(REPO, 'manual-ideal-control.html')

PARTES = [
    '01-cabeca.html',
    '02-estilos.html',
    '03-chassi.html',
    '04-slides-inicio.html',
    '05-slides-instalar.html',
    '06-slides-configurar.html',
    '07-slides-dia.html',
    '08-slides-fim.html',
    '09-script.html',
]


def b64(caminho):
    with open(os.path.join(REPO, caminho), 'rb') as f:
        return base64.b64encode(f.read()).decode()


pedacos = []
for nome in PARTES:
    caminho = os.path.join(AQUI, nome)
    if not os.path.exists(caminho):
        raise SystemExit('falta a parte: ' + nome)
    pedacos.append(io.open(caminho, encoding='utf-8').read())

html = '\n'.join(pedacos)
html = html.replace('__FONTE_B64__', b64('frontend/ideal-control.woff2'))
html = html.replace('__ICONE_B64__', b64('frontend/icones/portaria-192.png'))

io.open(SAIDA, 'w', encoding='utf-8', newline='\n').write(html)
print(SAIDA, round(len(html) / 1024), 'KB')
