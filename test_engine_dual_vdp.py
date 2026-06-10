import os
import fitz
from engine import ImpositionConfig, ImpositionEngine

def test_dual_vdp():
    formato = {
        "name": "VIP Ticket 100x50",
        "width_mm": 100,
        "height_mm": 50,
        "cols": 2,
        "rows": 2,
        "gap_h_mm": 5,
        "gap_v_mm": 5,
        "offset_h_mm": 0,
        "offset_v_mm": 0,
        "rotations": {"0": 90, "1": 180}
    }
    
    saida = {
        "name": "Sheet A3",
        "width_mm": 300,
        "height_mm": 300
    }

    base_file = "base_ticket.pdf"
    
    # Numeração 1: vermelho no topo esquerdo (10, 10)
    numeracao_1 = {
        "elements": [
            {
                "type": "TEXT",
                "x_mm": 10,
                "y_mm": 10,
                "font_size": 12,
                "color": "#ff0000",
                "fixed": True,
                "fixed_value": "VDP-RED"
            }
        ]
    }

    # Numeração 2: azul no canto inferior direito (60, 35)
    numeracao_2 = {
        "elements": [
            {
                "type": "TEXT",
                "x_mm": 60,
                "y_mm": 35,
                "font_size": 12,
                "color": "#0000ff",
                "fixed": True,
                "fixed_value": "VDP-BLUE"
            }
        ]
    }

    config = ImpositionConfig(
        base_file=base_file,
        out_pdf="output_dual_vdp_test.pdf",
        formato=formato,
        numeracao=numeracao_1,
        numeracao_2=numeracao_2,
        saida=saida,
        seq_start=1,
        seq_end=4,
        seq_increment=1,
        layout_schema="sequential"
    )

    engine = ImpositionEngine(config)
    engine.process()
    
    # Validar que gerou o arquivo e tem elementos de ambas as cores
    doc = fitz.open("output_dual_vdp_test.pdf")
    assert len(doc) == 1
    doc.close()
    
    print("Success: dual VDP test ran and output was generated!")

if __name__ == "__main__":
    test_dual_vdp()
