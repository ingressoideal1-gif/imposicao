import re
with open("engine.py", "r", encoding="utf-8") as f:
    content = f.read()

target = r'''                    f_lower = file_path.lower()
                    if f_lower.endswith((".pdf")):
                        return fitz.open(file_path)
                    else:
                        # Converter imagem para PDF na memoria
                        img = Image.open(file_path)
                        img_w, img_h = img.size
                        img.close()
                        
                        doc = fitz.open()
                        page = doc.new_page(width=cfg.item_w, height=cfg.item_h)
                        scale = min(cfg.item_w / img_w, cfg.item_h / img_h)
                        draw_w = img_w * scale; draw_h = img_h * scale
                        draw_x = (cfg.item_w - draw_w) / 2; draw_y = (cfg.item_h - draw_h) / 2
                        rect = fitz.Rect(draw_x, draw_y, draw_x + draw_w, draw_y + draw_h)
                        page.insert_image(rect, filename=file_path)
                        
                        pdf_bytes = doc.write()
                        doc.close()
                        return fitz.open(stream=pdf_bytes, filetype="pdf")'''

replacement = r'''                    try:
                        doc = fitz.open(file_path)
                        if getattr(doc, "is_pdf", False):
                            return doc
                        doc.close()
                    except Exception:
                        pass
                        
                    # Converter imagem/outro formato para PDF na memoria
                    try:
                        doc = fitz.open(file_path)
                    except Exception:
                        # Falhou, tenta fallback via bytes ou img2pdf se precisar
                        return None
                        
                    img_w, img_h = doc[0].rect.width, doc[0].rect.height
                    doc.close()
                    
                    doc = fitz.open()
                    page = doc.new_page(width=cfg.item_w, height=cfg.item_h)
                    scale = min(cfg.item_w / img_w, cfg.item_h / img_h)
                    draw_w = img_w * scale; draw_h = img_h * scale
                    draw_x = (cfg.item_w - draw_w) / 2; draw_y = (cfg.item_h - draw_h) / 2
                    rect = fitz.Rect(draw_x, draw_y, draw_x + draw_w, draw_y + draw_h)
                    page.insert_image(rect, filename=file_path)
                    
                    pdf_bytes = doc.write()
                    doc.close()
                    return fitz.open(stream=pdf_bytes, filetype="pdf")'''

if target in content:
    with open("engine.py", "w", encoding="utf-8") as f:
        f.write(content.replace(target, replacement))
    print("Replace local_path success")
else:
    print("Target not found")

target2 = r'''                    # Tentar abrir como PDF diretamente
                    try:
                        doc = fitz.open("pdf", pdf_bytes)
                        pdf_cache[file_path] = doc
                        return doc
                    except Exception:
                        # Falhou, pode ser uma imagem. Abrir via PIL na memoria.
                        import io
                        img = Image.open(io.BytesIO(pdf_bytes))
                        img_w, img_h = img.size
                        img.close()
                        
                        doc = fitz.open()
                        page = doc.new_page(width=cfg.item_w, height=cfg.item_h)
                        scale = min(cfg.item_w / img_w, cfg.item_h / img_h)
                        draw_w = img_w * scale; draw_h = img_h * scale
                        draw_x = (cfg.item_w - draw_w) / 2; draw_y = (cfg.item_h - draw_h) / 2
                        rect = fitz.Rect(draw_x, draw_y, draw_x + draw_w, draw_y + draw_h)
                        page.insert_image(rect, stream=pdf_bytes)
                        
                        final_bytes = doc.write()
                        doc.close()
                        final_doc = fitz.open(stream=final_bytes, filetype="pdf")
                        pdf_cache[file_path] = final_doc
                        return final_doc'''

replacement2 = r'''                    # Tentar abrir como PDF diretamente
                    try:
                        doc = fitz.open("pdf", pdf_bytes)
                        if getattr(doc, "is_pdf", False):
                            pdf_cache[file_path] = doc
                            return doc
                        doc.close()
                    except Exception:
                        pass
                        
                    # Falhou, pode ser uma imagem. Extrair dimensoes e criar PDF envelopando a imagem.
                    try:
                        doc = fitz.open("img", pdf_bytes) # "img" allows all image types supported by MuPDF
                    except Exception:
                        # Se falhar em tentar inferir tipo, tenta fallback padrao
                        doc = fitz.open("jpg", pdf_bytes)
                        
                    img_w, img_h = doc[0].rect.width, doc[0].rect.height
                    doc.close()
                    
                    doc = fitz.open()
                    page = doc.new_page(width=cfg.item_w, height=cfg.item_h)
                    scale = min(cfg.item_w / img_w, cfg.item_h / img_h)
                    draw_w = img_w * scale; draw_h = img_h * scale
                    draw_x = (cfg.item_w - draw_w) / 2; draw_y = (cfg.item_h - draw_h) / 2
                    rect = fitz.Rect(draw_x, draw_y, draw_x + draw_w, draw_y + draw_h)
                    page.insert_image(rect, stream=pdf_bytes)
                    
                    final_bytes = doc.write()
                    doc.close()
                    final_doc = fitz.open(stream=final_bytes, filetype="pdf")
                    pdf_cache[file_path] = final_doc
                    return final_doc'''

if target2 in content:
    with open("engine.py", "w", encoding="utf-8") as f:
        content = open("engine.py", "r", encoding="utf-8").read()
        f.write(content.replace(target2, replacement2))
    print("Replace is_url success")
else:
    print("Target2 not found")
