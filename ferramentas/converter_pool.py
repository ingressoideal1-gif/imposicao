"""Converte o Ideal Control.xlsx no qr_ideal_pool.bin.

Roda uma vez, na maquina que monta o instalador do agente. A planilha tem
169 MB de XML e 3.000.000 de celulas; ler tudo de uma vez seria desperdicio,
entao o XML e percorrido em fluxo.

O formato de saida e deliberadamente burro: 8 bytes por codigo, sem
separador, sem cabecalho, gravados COLUNA A COLUNA. Ler o codigo de um
ingresso vira `seek(idx * 8)` e `read(8)` — nenhum parser no caminho de quem
esta esperando o papel sair da impressora.

A ordem coluna a coluna nao e detalhe: e ela que faz o `indice()` do
`qr_ideal.py` apontar para a celula certa. Trocar a ordem aqui quebraria
todos os ingressos ja impressos.

Uso:
    python -m ferramentas.converter_pool "Ideal Control/Ideal Control.xlsx" qr_ideal_pool.bin
"""
import os
import sys
import zipfile
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import qr_ideal

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def celulas(caminho_xlsx):
    """Percorre a planilha em fluxo, devolvendo (coluna, linha, codigo).

    A coluna vem da posicao da celula dentro da linha, e nao do atributo `r`:
    o arquivo real nao pula celula, e contar posicao dispensa parsear
    referencia de planilha.
    """
    # Os dois `with` importam: sem fechar o ZipFile, o Windows mantem o .xlsx
    # travado ate o processo morrer, e quem chamou nao consegue nem mover o
    # arquivo depois de converter.
    with zipfile.ZipFile(caminho_xlsx) as z, z.open("xl/worksheets/sheet1.xml") as f:
        linha = 0
        coluna = 0
        for evento, el in ET.iterparse(f, events=("start", "end")):
            if evento == "start" and el.tag == NS + "row":
                linha += 1
                coluna = 0
            elif evento == "end" and el.tag == NS + "c":
                coluna += 1
                bloco_is = el.find(NS + "is")
                if bloco_is is not None:
                    t = bloco_is.find(NS + "t")
                    texto = t.text if t is not None else ""
                else:
                    v = el.find(NS + "v")
                    texto = v.text if v is not None else ""
                yield coluna, linha, (texto or "").strip()
                el.clear()
            elif evento == "end" and el.tag == NS + "row":
                el.clear()


def converter(caminho_xlsx: str, caminho_bin: str) -> int:
    """Grava o pool binario e devolve quantos codigos entraram.

    Recusa gravar diante de qualquer invariante quebrada: codigo fora dos 8
    caracteres, codigo repetido, celula fora da grade, ou total diferente do
    esperado. Um pool errado nao apareceria aqui nem na impressao — apareceria
    na portaria, quando ja nao da para consertar.
    """
    # A grade chega em ordem de linha; o arquivo sai em ordem de coluna.
    grade = [[None] * qr_ideal.LINHAS for _ in range(qr_ideal.COLUNAS)]
    vistos = set()
    total = 0

    for coluna, linha, codigo in celulas(caminho_xlsx):
        if len(codigo) != qr_ideal.TAMANHO:
            raise ValueError(
                f"Codigo com {len(codigo)} caracteres na coluna {coluna}, "
                f"linha {linha}: esperado 8 caracteres."
            )
        if codigo in vistos:
            raise ValueError(
                f"Codigo repetido {codigo!r} na coluna {coluna}, linha {linha}."
            )
        if coluna > qr_ideal.COLUNAS or linha > qr_ideal.LINHAS:
            raise ValueError(
                f"Celula fora da grade: coluna {coluna}, linha {linha}. "
                f"Esperado ate {qr_ideal.COLUNAS}x{qr_ideal.LINHAS}."
            )
        vistos.add(codigo)
        grade[coluna - 1][linha - 1] = codigo
        total += 1

    if total != qr_ideal.TOTAL:
        raise ValueError(
            f"Planilha com {total} codigos, esperado {qr_ideal.TOTAL}."
        )

    with open(caminho_bin, "wb") as saida:
        for coluna in grade:
            saida.write(b"".join(c.encode("ascii") for c in coluna))

    return total


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    n = converter(sys.argv[1], sys.argv[2])
    print(f"{n:,} codigos gravados em {sys.argv[2]}")
