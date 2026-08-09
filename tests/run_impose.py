import sys
import fitz
from engine import ImpositionEngine, ImpositionConfig

def main():
    doc = fitz.open()
    for i in range(1, 7):
        page = doc.new_page(width=200, height=100)
        page.insert_text((50, 50), f"Page {i}", fontsize=24)
    doc.save("dummy.pdf")
    doc.close()

    cfg = ImpositionConfig(
        base_file="dummy.pdf",
        out_pdf="output.pdf",
        formato={"name": "A4", "width_mm": 210, "height_mm": 297, "cols": 2, "rows": 2, "margin_top_mm": 10, "margin_left_mm": 10, "margin_right_mm": 10, "margin_bottom_mm": 10, "gap_x_mm": 5, "gap_y_mm": 5, "item_width_mm": 90, "item_height_mm": 50},
        saida={"name": "SRA3", "width_mm": 450, "height_mm": 320, "file_format": "pdf"},
        numeracao=None,
        numeracao_2=None,
        layout_schema="pdf_multiple",
        print_mode="front",
        rotate_page=False,
        seq_start=1,
        seq_end=6,
        seq_increment=1,
        csv_data=None,
        multi_artes=[]
    )
    engine = ImpositionEngine(cfg)
    out_path = engine.process()
    print("Output path:", out_path)
    
    # Analyze generated PDF
    out_doc = fitz.open(out_path)
    print("Generated PDF Pages:", len(out_doc))
    for i, page in enumerate(out_doc):
        text = page.get_text()
        print(f"--- Sheet {i} ---")
        print(text)
    out_doc.close()

if __name__ == "__main__":
    main()
