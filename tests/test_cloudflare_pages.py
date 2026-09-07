from pathlib import Path


RAIZ = Path(__file__).resolve().parents[1]
FRONTEND = RAIZ / "frontend"


def _linhas(nome):
    return [
        linha.strip()
        for linha in (FRONTEND / nome).read_text(encoding="utf-8").splitlines()
        if linha.strip() and not linha.lstrip().startswith("#")
    ]


def test_as_rotas_da_vercel_foram_reproduzidas_no_pages():
    regras = set(_linhas("_redirects"))
    assert "/portaria.html /ic/portaria.html 301" in regras
    assert "/controle.html /ic/controle.html 301" in regras
    assert "/ic /controle 200" in regras
    assert "/ic/ /controle 200" in regras
    assert "/ic/portaria.html /portaria 200" in regras
    assert "/ic/controle.html /controle 200" in regras
    assert "/ic/* /:splat 200" in regras
    assert "/cliente/* /cliente 200" in regras
    assert "/pedido/* /index.html 200" in regras


def test_os_cabecalhos_essenciais_foram_reproduzidos_no_pages():
    texto = (FRONTEND / "_headers").read_text(encoding="utf-8")
    assert "Content-Type: application/manifest+json" in texto
    assert "Cache-Control: no-cache, no-store, must-revalidate" in texto
    assert "Cache-Control: public, max-age=3600" in texto
