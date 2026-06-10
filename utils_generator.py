import fitz  # PyMuPDF

def generate_test_ticket(filename="base_ticket.pdf"):
    # Dimensions: 10cm x 5cm in points (1 cm = 28.346 points)
    w, h = 10 * 28.346, 5 * 28.346
    
    doc = fitz.open()
    page = doc.new_page(width=w, height=h)
    
    # Draw a border
    rect = fitz.Rect(0, 0, w, h)
    page.draw_rect(rect, color=(0, 0, 0), fill=(0.9, 0.9, 0.9))
    
    # Draw ticket design
    page.insert_text((20, 40), "INGRESSO VIP", fontsize=16, fontname="helv", color=(0.2, 0.2, 0.8))
    page.insert_text((20, 60), "Data: 10/12/2026", fontsize=10, fontname="helv")
    page.insert_text((20, 75), "Local: Estádio Nacional", fontsize=10, fontname="helv")
    
    # Draw a placeholder box for the Barcode/QR
    qr_rect = fitz.Rect(w - 70, 20, w - 20, 70)
    page.draw_rect(qr_rect, color=(1, 0, 0), dashes="[2] 0")
    page.insert_text((w - 65, 45), "QR HERE", fontsize=10, color=(1, 0, 0))
    
    # Placeholder for numbering
    num_rect = fitz.Rect(w - 80, h - 30, w - 20, h - 10)
    page.draw_rect(num_rect, color=(0, 0, 1), dashes="[2] 0")
    page.insert_text((w - 75, h - 18), "NUM HERE", fontsize=10, color=(0, 0, 1))

    doc.save(filename)
    print(f"[{filename}] generated successfully.")

if __name__ == "__main__":
    generate_test_ticket()
