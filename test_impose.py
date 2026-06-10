class MockConfig:
    def __init__(self, schema, is_duplex, total_pages, cols, rows):
        self.layout_schema = schema
        self.print_mode = "duplex" if is_duplex else "front"
        self.cols = cols
        self.rows = rows
        self.total_items = total_pages
        
def test(cfg):
    poses_per_sheet = cfg.cols * cfg.rows
    import math
    total_sheets = math.ceil(cfg.total_items / poses_per_sheet)
    for S in range(total_sheets):
        for row in range(cfg.rows):
            for col in range(cfg.cols):
                P = row * cfg.cols + col
                if cfg.layout_schema == "cut_stack":
                    item_index = (P * total_sheets) + S
                elif cfg.layout_schema == "sequential":
                    item_index = (S * poses_per_sheet) + P
                else:
                    item_index = (S * poses_per_sheet) + P
                
                if item_index >= cfg.total_items:
                    continue
                
                if cfg.layout_schema == "pdf_multiple":
                    if cfg.print_mode == "duplex":
                        page_idx_front = (item_index * 2) if (item_index * 2) < cfg.total_items else 0
                    else:
                        page_idx_front = item_index if item_index < cfg.total_items else 0
                else:
                    page_idx_front = 0
                print(f"Sheet {S}, Cell {P} (R{row} C{col}): Item {item_index} -> Page {page_idx_front + 1}")

print("Testing pdf_multiple (apenas frente) with 6 pages, 2x2 grid")
test(MockConfig("pdf_multiple", False, 6, 2, 2))
