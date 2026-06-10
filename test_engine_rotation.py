# Teste de imposição com rotação individual
import os
from engine import ImpositionConfig, ImpositionEngine

def test_rotation():
    formato = {
        "name": "Ingresso Teste 100x50",
        "width_mm": 100,
        "height_mm": 50,
        "cols": 2,
        "rows": 2,
        "gap_h_mm": 5,
        "gap_v_mm": 5,
        "offset_h_mm": 0,
        "offset_v_mm": 0,
        "rotations": {"0": 90, "1": 180, "2": 270}  # Rotacionando células 0, 1, 2. Célula 3 fica em 0
    }
    
    saida = {
        "name": "A3 Teste",
        "width_mm": 300,
        "height_mm": 300,
        "file_format": "pdf"
    }

    # Vamos usar um PDF base genérico ou gerar um
    # Se base_ticket.pdf existe, usamos ele
    base_file = "base_ticket.pdf"
    if not os.path.exists(base_file):
        # Cria um PDF temporário
        import fitz
        doc = fitz.open()
        p = doc.new_page(width=100*2.83, height=50*2.83)
        p.draw_rect(fitz.Rect(10, 10, 270, 130), color=(0, 0, 0), width=2)
        p.insert_text((20, 50), "UP SIDE", fontsize=20)
        doc.save(base_file)
        doc.close()
        
    config = ImpositionConfig(
        base_file=base_file,
        out_pdf="output_rotation_test.pdf",
        formato=formato,
        numeracao={
            "elements": [
                {
                    "type": "TEXT",
                    "x_mm": 10,
                    "y_mm": 10,
                    "font_size": 12,
                    "color": "#ff0000",
                    "fixed": True,
                    "fixed_value": "VDP"
                }
            ]
        },
        saida=saida,
        seq_start=1,
        seq_end=4,
        seq_increment=1,
        layout_schema="sequential"
    )

    engine = ImpositionEngine(config)
    engine.process()
    print("Processamento concluído com sucesso! Verifique output_rotation_test.pdf")

if __name__ == "__main__":
    test_rotation()
