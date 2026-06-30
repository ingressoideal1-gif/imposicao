import os

engine_path = "engine.py"
with open(engine_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Modify initial doc_out
old_init = "doc_out = fitz.open()\n        doc_base = self._load_base_as_pdf()"
new_init = '''doc_out = fitz.open()
        self.generated_files = []
        doc_base = self._load_base_as_pdf()
        
        if cfg.has_cover:
            if cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict":
                stack_size = cfg.sheets_per_block * cfg.block_depth
            else:
                stack_size = total_sheets
        else:
            stack_size = total_sheets
            
        set_idx_current = -1'''

content = content.replace(old_init, new_init)

# 2. Modify loop start
old_loop = "for S in range(total_sheets):\n            if S % 25 == 0:"
new_loop = '''for S in range(total_sheets):
            set_idx = S // stack_size
            if set_idx != set_idx_current:
                if set_idx_current != -1 and doc_out:
                    if cfg.has_cover:
                        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx_current + 1}_02_miolo.pdf")
                        doc_out.save(out_name, garbage=4, deflate=True)
                        self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                        self._generate_contracapa(set_idx_current, cfg, doc_base)
                    doc_out.close()
                    doc_out = fitz.open()
                
                if cfg.has_cover:
                    self._generate_capa(set_idx, stack_size, poses_per_sheet, cfg, doc_base, total_sheets)
                
                set_idx_current = set_idx

            if S % 25 == 0:'''

content = content.replace(old_loop, new_loop)

# 3. Modify save end
old_save = "doc_out.save(cfg.out_pdf, garbage=4, deflate=True)"
new_save = '''if cfg.has_cover:
            if set_idx_current != -1 and doc_out:
                out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx_current + 1}_02_miolo.pdf")
                doc_out.save(out_name, garbage=4, deflate=True)
                self.generated_files.append({"type": "miolo", "path": out_name, "name": os.path.basename(out_name)})
                self._generate_contracapa(set_idx_current, cfg, doc_base)
            if doc_out:
                doc_out.close()
        else:
            doc_out.save(cfg.out_pdf, garbage=4, deflate=True)
            self.generated_files.append({"type": "single", "path": cfg.out_pdf, "name": os.path.basename(cfg.out_pdf)})'''

content = content.replace(old_save, new_save)

# 4. Add helper methods
helpers = '''
    def _generate_contracapa(self, set_idx, cfg, doc_base):
        import os
        doc_c = fitz.open()
        p = doc_c.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
        if cfg.rotate_page: p.set_rotation(90)
        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_03_contracapa.pdf")
        doc_c.save(out_name, garbage=4, deflate=True)
        doc_c.close()
        self.generated_files.append({"type": "contracapa", "path": out_name, "name": os.path.basename(out_name)})

    def _generate_capa(self, set_idx, stack_size, poses_per_sheet, cfg, doc_base, total_sheets):
        import os
        doc_c = fitz.open()
        p = doc_c.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
        if cfg.rotate_page: p.set_rotation(90)
        
        # Desenha a base dimensionada em cada célula
        start_x = (cfg.sheet_w - (cfg.cols * cfg.item_w + (cfg.cols - 1) * cfg.gap_h)) / 2
        start_y = (cfg.sheet_h - (cfg.rows * cfg.item_h + (cfg.rows - 1) * cfg.gap_v)) / 2
        
        for row in range(cfg.rows):
            for col in range(cfg.cols):
                P = row * cfg.cols + col
                cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
                cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)
                cell_x1 = cell_x0 + cfg.item_w
                cell_y1 = cell_y0 + cfg.item_h
                
                # Draw cover art (doc_base scaled)
                if doc_base:
                    page_base = doc_base[0]
                    bw = page_base.rect.width
                    bh = page_base.rect.height
                    
                    # Apply scale and offset
                    scale = cfg.cover_scale / 100.0
                    new_w = bw * scale
                    new_h = bh * scale
                    
                    off_x = cfg.cover_offset_x * 2.83465
                    off_y = cfg.cover_offset_y * 2.83465
                    
                    cx = cell_x0 + (cfg.item_w - new_w) / 2 + off_x
                    cy = cell_y0 + (cfg.item_h - new_h) / 2 - off_y
                    
                    p.show_pdf_page(
                        fitz.Rect(cx, cy, cx + new_w, cy + new_h),
                        doc_base, 0, keep_proportion=False
                    )
                
                # Text info
                if cfg.layout_schema == "cut_stack" and cfg.cut_stack_mode == "strict":
                    i_start = (set_idx * stack_size * poses_per_sheet) + (P * stack_size)
                    i_end = min(i_start + stack_size - 1, cfg.total_items - 1)
                else:
                    i_start = P * total_sheets + (set_idx * stack_size)
                    i_end = min(i_start + stack_size - 1, cfg.total_items - 1)
                
                v_start = cfg.seq_start + (i_start * cfg.seq_increment)
                v_end = cfg.seq_start + (i_end * cfg.seq_increment)
                
                text = f"Bloco {(set_idx * poses_per_sheet) + P + 1}\\nInício: {v_start}\\nFim: {v_end}"
                font_y = cell_y0 + (cfg.cover_font_y * 2.83465)
                
                def hex_to_rgb(h):
                    h = str(h).lstrip('#')
                    if len(h) < 6: h = "000000"
                    return tuple(int(h[i:i+2], 16)/255.0 for i in (0, 2, 4))
                
                p.insert_text(fitz.Point(cell_x0 + 10, font_y), text, fontsize=cfg.cover_font_size, color=hex_to_rgb(cfg.cover_font_color))

        out_name = cfg.out_pdf.replace(".pdf", f"_set{set_idx + 1}_01_capa.pdf")
        doc_c.save(out_name, garbage=4, deflate=True)
        doc_c.close()
        self.generated_files.append({"type": "capa", "path": out_name, "name": os.path.basename(out_name)})
'''

content = content + helpers

with open(engine_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated engine.py successfully")
