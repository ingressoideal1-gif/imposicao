import argparse
from engine import ImpositionConfig, ImpositionEngine

def main():
    parser = argparse.ArgumentParser(description="Imposition & Numbering Cut & Stack Engine PoC")
    parser.add_argument("--base", type=str, default="base_ticket.pdf", help="Input Base PDF")
    parser.add_argument("--out", type=str, default="output.pdf", help="Output PDF file")
    parser.add_argument("--start", type=int, default=1, help="Numbering start sequence")
    parser.add_argument("--end", type=int, default=100, help="Numbering end sequence")
    
    args = parser.parse_args()

    # Configure the imposition layout
    config = ImpositionConfig(
        base_pdf=args.base,
        out_pdf=args.out,
        sheet_w_mm=320,  # SRA3 width
        sheet_h_mm=450,  # SRA3 height
        layout_schema="sequential", # Options: 'cut_stack', 'sequential', 'step_repeat'
        seq_start=args.start,
        seq_end=args.end,
        
        # Text Numbering Positioning (Offset from ticket top-left)
        num_x_mm=80,
        num_y_mm=42,
        num_size=12,
        num_color=(0, 0, 1), # Blue
        
        # QR Code Positioning
        qr_enabled=True,
        qr_x_mm=80,
        qr_y_mm=10,
        qr_size_mm=15
    )

    try:
        engine = ImpositionEngine(config)
        engine.process()
    except Exception as e:
        print(f"Error during imposition: {e}")

if __name__ == "__main__":
    main()
