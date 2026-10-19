"""Transporta a visibilidade das camadas junto com os objetos PDF vetoriais."""
import fitz


def _preservar_camadas(destino, origem):
    # show_pdf_page/insert_pdf copiam os recursos, mas nao o OCProperties do
    # catalogo. Sem ele, uma camada OFF da arte passa a aparecer na imposicao.
    camadas = origem.get_ocgs()
    if not camadas:
        return
    mapa = destino.Graftmaps.get(origem._graft_id)
    estado = getattr(destino, '_ideal_camadas_pdf', None)
    if estado is None:
        estado = {'fontes': {}, 'visibilidade': {
            xref: info['on'] for xref, info in destino.get_ocgs().items()}}
        destino._ideal_camadas_pdf = estado
    if mapa is not None and estado['fontes'].get(origem._graft_id) is mapa:
        return
    if mapa is None:
        mapa = fitz.Graftmap(destino)
        destino.Graftmaps[origem._graft_id] = mapa
    # O MESMO mapa da importacao preserva as referencias de OCG e OCMD,
    # inclusive dentro de Forms. Nomes iguais de fontes distintas nao se unem.
    pdf_origem = fitz._as_pdf_document(origem)
    padrao = origem.get_layer()
    ligadas, desligadas = set(padrao.get('on', [])), set(padrao.get('off', []))
    for xref, info in camadas.items():
        obj = fitz.mupdf.pdf_new_indirect(pdf_origem, xref, 0)
        copiado = fitz.mupdf.pdf_graft_mapped_object(mapa.this, obj)
        novo_xref = fitz.mupdf.pdf_to_num(copiado)
        # garbage=4 pode unir OCGs homonimos identicos com estados opostos.
        # Identidade local impede essa uniao sem duplicar imagens/fontes.
        destino.xref_set_key(novo_xref, 'IdealLayerId', str(novo_xref))
        # Um documento composto pode ter um descritor MuPDF em cache anterior
        # ao insert_pdf. O catalogo persistido continua sendo a autoridade.
        estado['visibilidade'][novo_xref] = (
            False if xref in desligadas else True if xref in ligadas else info['on'])
    refs = lambda valores: '[' + ' '.join(f'{x} 0 R' for x in valores) + ']'
    vis = estado['visibilidade']
    destino.xref_set_key(destino.pdf_catalog(), 'OCProperties',
        '<< /OCGs ' + refs(vis) + ' /D << /BaseState /ON /ON ' +
        refs(x for x in vis if vis[x]) + ' /OFF ' +
        refs(x for x in vis if not vis[x]) + ' >> >>')
    estado['fontes'][origem._graft_id] = mapa


def mostrar_pagina(pagina, retangulo, origem, *args, **kwargs):
    _preservar_camadas(pagina.parent, origem)
    return pagina.show_pdf_page(retangulo, origem, *args, **kwargs)


def inserir_paginas(destino, origem, *args, **kwargs):
    _preservar_camadas(destino, origem)
    return destino.insert_pdf(origem, *args, **kwargs)
