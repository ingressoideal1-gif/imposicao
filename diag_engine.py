import sys
import os
sys.path.insert(0, r"C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition")
os.chdir(r"C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition")

# Ativar venv
venv_site = r"C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\venv\Lib\site-packages"
sys.path.insert(0, venv_site)

import fitz
print(f"PyMuPDF versao: {fitz.version}")

# Teste 1: abrir o PDF dummy
dummy_path = r"C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\dummy.pdf"
if os.path.exists(dummy_path):
    doc = fitz.open(dummy_path)
    print(f"dummy.pdf: {len(doc)} paginas, pagina 0 rect={doc[0].rect}")
    doc.close()
else:
    print("dummy.pdf NAO encontrado")

# Teste 2: base_ticket.pdf
ticket_path = r"C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\base_ticket.pdf"
if os.path.exists(ticket_path):
    doc = fitz.open(ticket_path)
    print(f"base_ticket.pdf: {len(doc)} paginas, pagina 0 rect={doc[0].rect}")
    doc.close()
else:
    print("base_ticket.pdf NAO encontrado")

# Teste 3: simular imposicao simples (1x1, frente, sequential)
from engine import ImpositionConfig, ImpositionEngine

formato = {"name": "Teste", "width_mm": 90, "height_mm": 50, "cols": 2, "rows": 2, "gap_h_mm": 0, "gap_v_mm": 0}
saida   = {"name": "A4", "width_mm": 210, "height_mm": 297}
numeracao = {
    "name": "num_teste",
    "elements": [
        {"type": "TEXT", "x_mm": 5, "y_mm": 5, "size_mm": 8, "font_name": "helv", "color": "#000000", "pad": 0, "prefix": "N-", "suffix": ""}
    ]
}

out_path = r"C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\DIAGNOSTICO_OUTPUT.pdf"

if os.path.exists(ticket_path):
    cfg = ImpositionConfig(
        base_file=ticket_path,
        out_pdf=out_path,
        formato=formato,
        numeracao=numeracao,
        saida=saida,
        seq_start=1,
        seq_end=4,
        seq_increment=1,
        layout_schema="sequential",
        print_mode="front"
    )
    engine = ImpositionEngine(cfg)
    try:
        engine.process()
        result = fitz.open(out_path)
        print(f"\nRESULTADO: {out_path}")
        print(f"  Paginas geradas: {len(result)}")
        for i, pg in enumerate(result):
            # Contar objetos na pagina
            blocks = pg.get_text("blocks")
            imgs = pg.get_images()
            print(f"  Pagina {i}: text_blocks={len(blocks)}, images={len(imgs)}, rect={pg.rect}")
        result.close()
    except Exception as ex:
        import traceback
        traceback.print_exc()
else:
    print("Nao ha PDF de base para testar")
