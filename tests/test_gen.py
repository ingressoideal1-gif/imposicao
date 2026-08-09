import fitz
doc = fitz.open()
for i in range(1, 7):
    page = doc.new_page(width=200, height=100)
    page.insert_text((50, 50), f"Page {i}", fontsize=24)
doc.save("dummy.pdf")
doc.close()

from engine import ImpositionEngine, ImpositionConfig
cfg = ImpositionConfig(
    formato={"name": "A4", "width_mm": 210, "height_mm": 297, "cols": 2, "rows": 2, "margin_top_mm": 10, "margin_left_mm": 10, "margin_right_mm": 10, "margin_bottom_mm": 10, "gap_x_mm": 5, "gap_y_mm": 5, "item_width_mm": 90, "item_height_mm": 50},
    saida={"name": "SRA3", "width_mm": 450, "height_mm": 320, "file_format": "pdf"},
    base_file="dummy.pdf",
    elements=[],
    layout_schema="pdf_multiple",
    print_mode="front",
    rotate_page=False,
    seq_start=1,
    seq_end=6,
    seq_increment=1
)
engine = ImpositionEngine(cfg)
output_path = engine.process()
print(f"Generated output at: {output_path}")
