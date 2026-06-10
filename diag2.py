import sys, os
sys.path.insert(0, r"C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\venv\Lib\site-packages")
import fitz

out = r"C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\DIAGNOSTICO_OUTPUT.pdf"
doc = fitz.open(out)
pg = doc[0]

# Verificar XObjects (PDFs embutidos via show_pdf_page)
xrefs = doc.get_page_xobjects(0)
print(f"XObjects na pagina 0: {len(xrefs)}")
for xr in xrefs:
    print(f"  xref={xr}")

# Verificar texto
text = pg.get_text()
print(f"\nTexto encontrado:\n{text[:500]}")

# Verificar se há conteúdo de stream na pagina
print(f"\nConteudo da pagina (primeiros 300 chars):")
print(pg.read_contents()[:300])
doc.close()
