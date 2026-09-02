# -*- coding: utf-8 -*-
"""No PDF Paginado, a quantidade contratada bate com as paginas do arquivo?

Rodar com:  venv\\Scripts\\python.exe ferramentas\\conferir_paginas_pdf.py 21408

## Por que ele existe

A conferencia de um pedido tem uma pergunta que vale mais que todas as outras:
**o modelo entrega a quantidade que foi vendida?** Nas numeracoes com banco de
dados, quem responde e' `sql/consultas/conferir_contratado_x_banco.sql`, contando
as linhas que tem dado nas colunas que aquele modelo le.

Modelo em **PDF Paginado** (`pedidos_modelos.modo_pdf`) nao tem banco. O frontend
forca o schema `pdf_multiple` e o motor gasta **uma pagina do arquivo da frente
por peca** (`page_idx_front`, no engine.py). A quantidade mora no arquivo, e SQL
nao abre PDF.

O buraco apareceu no pedido 21408, em 01/09/2026: as consultas oficiais
devolveram "2. numeracao sem banco" nos dois modelos, que e' alarme falso, e a
pergunta que importava — 25 credenciais contratadas, o arquivo tem 25 paginas? —
nao estava sendo feita por ninguem. Uma pagina a menos ali e' uma pessoa sem
credencial na porta do evento; uma a mais e' um cartao PVC jogado fora.

## O que ele confere, por modelo

1. **paginas da frente == quantidade contratada** — a pergunta principal;
2. **o verso** — com `duplex_unico` o arquivo do verso tem de ter UMA pagina, que
   se repete em todas as pecas; com `duplex` classico, tantas quanto a frente;
3. **paginas repetidas** — duas pecas com o mesmo desenho quase sempre sao a
   mesma pessoa impressa duas vezes, e uma faltando;
4. **pagina em branco** — sai um cartao virgem, e ninguem percebe ate o cliente;
5. **tamanho da pagina** — o motor cola a arte no tamanho REAL do arquivo,
   centrada na celula (ver `_arte_na_celula`), entao pagina de tamanho diferente
   dentro do mesmo arquivo sai deslocada em relacao ao corte.

## So consulta

Le `pedidos_modelos` com a mesma chave anonima do painel e baixa as artes do
Storage publico. Nao escreve linha nenhuma, nao imprime, nao publica.
"""
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Cinza abaixo do qual o pixel conta como tinta. 250 e nao 255 porque JPEG e
# suavizacao de vetor deixam o "branco" em 252-254 sem nada desenhado ali.
LIMIAR_TINTA = 250

# Resolucao da assinatura visual de cada pagina. 50 dpi nao le um nome, mas
# distingue duas pessoas diferentes com folga -- e uma pagina inteira a 50 dpi
# custa milissegundos, o que importa quando o arquivo tem 3.000.
DPI_ASSINATURA = 50


def _colunas(url: str, chave: str, pedido: int):
    alvo = (f"{url}/rest/v1/pedidos_modelos"
            f"?select=id,nome_modelo,quantidade,modo_pdf,verso_tipo,arte_url,verso_arte_url"
            f"&id_int=eq.{int(pedido)}&order=id")
    req = urllib.request.Request(alvo, headers={"apikey": chave,
                                                "Authorization": f"Bearer {chave}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _baixar(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()


def _medir(raw: bytes):
    """(paginas, [assinatura], [(larg_mm, alt_mm)], [em_branco])."""
    import pymupdf

    doc = pymupdf.open(stream=raw, filetype="pdf")
    pt = 25.4 / 72.0
    assinaturas, tamanhos, brancas = [], [], []
    for i, p in enumerate(doc):
        pix = p.get_pixmap(dpi=DPI_ASSINATURA, colorspace=pymupdf.csGRAY)
        assinaturas.append(hashlib.md5(pix.samples).hexdigest()[:10])
        if min(pix.samples) >= LIMIAR_TINTA:
            brancas.append(i + 1)
        tamanhos.append((round(p.rect.width * pt, 2), round(p.rect.height * pt, 2)))
    n = doc.page_count
    doc.close()
    return n, assinaturas, tamanhos, brancas


def _repetidas(assinaturas):
    vistos, repetidas = {}, []
    for i, a in enumerate(assinaturas):
        if a in vistos:
            repetidas.append((vistos[a] + 1, i + 1))
        else:
            vistos[a] = i
    return repetidas


def conferir(pedido: int) -> int:
    import db

    if not (db.SUPABASE_URL and db.SUPABASE_KEY):
        print("  (sem Supabase configurado nesta maquina)")
        return 0

    modelos = _colunas(db.SUPABASE_URL, db.SUPABASE_KEY, pedido)
    if not modelos:
        print(f"  Pedido {pedido}: nenhum modelo.")
        return 0

    em_pdf = [m for m in modelos if m.get("modo_pdf")]
    print("")
    print(f"  PDF PAGINADO -- PEDIDO {pedido}")
    print(f"  {len(em_pdf)} de {len(modelos)} modelo(s) em modo PDF Paginado")
    if not em_pdf:
        print("  Nada a conferir aqui: a quantidade destes modelos vem do banco.")
        print("  Rode sql/consultas/conferir_contratado_x_banco.sql.")
        return 0

    atencao = []
    for m in em_pdf:
        mid, nome = m["id"], (m.get("nome_modelo") or "").strip()
        qtd = int(m.get("quantidade") or 0)
        print("")
        print(f"  {mid}  {nome}   contratada: {qtd}")

        if not m.get("arte_url"):
            print("     SEM ARTE DA FRENTE")
            atencao.append(f"{mid}: sem arte da frente")
            continue

        n, assin, tams, brancas = _medir(_baixar(m["arte_url"]))
        veredito = "OK" if n == qtd else f"DIVERGE em {n - qtd:+d}"
        print(f"     frente: {n} pagina(s)  ->  {veredito}")
        if n != qtd:
            atencao.append(f"{mid}: contratada {qtd}, arquivo com {n} pagina(s)")

        rep = _repetidas(assin)
        if rep:
            print(f"     PAGINAS REPETIDAS: " +
                  ", ".join(f"{a}=={b}" for a, b in rep[:8]) +
                  ("..." if len(rep) > 8 else ""))
            atencao.append(f"{mid}: {len(rep)} pagina(s) repetida(s)")
        if brancas:
            print(f"     PAGINAS EM BRANCO: {brancas}")
            atencao.append(f"{mid}: {len(brancas)} pagina(s) em branco")

        distintos = sorted(set(tams))
        if len(distintos) > 1:
            print(f"     TAMANHOS DIFERENTES no mesmo arquivo: {distintos}")
            atencao.append(f"{mid}: {len(distintos)} tamanhos de pagina")
        else:
            print(f"     pagina: {distintos[0][0]} x {distintos[0][1]} mm")

        # O verso. `verso_tipo` guarda a escolha do operador; `duplex_unico`
        # (FxVerso com verso unico) exige um arquivo de uma pagina so.
        vurl = m.get("verso_arte_url")
        if vurl:
            nv, assv, tamv, brv = _medir(_baixar(vurl))
            if nv == 1:
                print(f"     verso: 1 pagina, a mesma em todas as pecas  ->  OK")
            elif nv == n:
                print(f"     verso: {nv} paginas, uma por peca  ->  OK")
            else:
                print(f"     verso: {nv} pagina(s) para {n} peca(s)  ->  CONFERIR")
                atencao.append(f"{mid}: verso com {nv} pagina(s) para {n} peca(s)")
        else:
            print(f"     verso: nenhum ({m.get('verso_tipo') or 'sem tipo'})")

    print("")
    if atencao:
        print(f"  {len(atencao)} PONTO(S) DE ATENCAO:")
        for a in atencao:
            print(f"   - {a}")
        return 1
    print("  Tudo certo: todo arquivo tem exatamente as paginas contratadas.")
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.split("## Por que")[0].strip())
        return 2
    try:
        pedido = int(str(sys.argv[1]).strip())
    except ValueError:
        print(f"  '{sys.argv[1]}' nao e um numero de pedido.")
        return 2
    return conferir(pedido)


if __name__ == "__main__":
    sys.exit(main())
