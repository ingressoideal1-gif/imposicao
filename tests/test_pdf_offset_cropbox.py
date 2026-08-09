# Teste de integração para validação de centralização absoluta com CropBox deslocado
import os
import fitz
from engine import ImpositionConfig, ImpositionEngine

def test_pdf_offset_cropbox():
    input_file = "test_offset_input.pdf"
    output_file = "output_pdf_offset_test.pdf"

    print("Gerando PDF base com CropBox deslocado...")
    doc_in = fitz.open()
    
    # Criamos uma página temporária de 400x300 pontos
    page = doc_in.new_page(width=400, height=300)
    
    # Desenhar uma borda nos limites do futuro CropBox (de 100,100 a 300,200)
    page.draw_rect(fitz.Rect(102, 102, 298, 198), color=(1, 0, 0), width=2) # vermelho
    
    # Escrever um texto na área interna
    page.insert_text((170, 155), "CENTRO", fontsize=16, color=(0, 0, 1)) # azul
    
    # Definimos um CropBox deslocado (tamanho útil real de 200x100pt, de 100,100 a 300,200)
    crop_rect = fitz.Rect(100, 100, 300, 200)
    page.set_cropbox(crop_rect)
    
    doc_in.save(input_file)
    doc_in.close()

    # Formato do item de imposição: 200 x 100 pt
    # Converter de pontos para mm
    item_w_mm = 200 / 2.8346
    item_h_mm = 100 / 2.8346
    
    formato = {
        "name": "Cartao CropBox Teste",
        "width_mm": item_w_mm,
        "height_mm": item_h_mm,
        "cols": 1,
        "rows": 1,
        "gap_h_mm": 0,
        "gap_v_mm": 0,
        "offset_h_mm": 0,
        "offset_v_mm": 0,
        "rotations": {}
    }
    
    # Folha de saída: 300 x 200 pt (item de 200x100 deve ser centralizado nela)
    saida = {
        "name": "Folha Saida Teste",
        "width_mm": 300 / 2.8346,
        "height_mm": 200 / 2.8346,
        "file_format": "pdf"
    }

    config = ImpositionConfig(
        base_file=input_file,
        out_pdf=output_file,
        formato=formato,
        numeracao=None,
        saida=saida,
        seq_start=1,
        seq_end=1,
        seq_increment=1,
        layout_schema="sequential",
        print_mode="front"
    )

    print("Executando motor de imposição...")
    engine = ImpositionEngine(config)
    engine.process()

    # Validar centralização na folha de saída
    assert os.path.exists(output_file), "Erro: PDF de saída não foi gerado."
    
    doc_out = fitz.open(output_file)
    page_out = doc_out[0]
    
    # Procurar pela coordenada de texto "CENTRO" no arquivo gerado.
    # O item tem tamanho 200x100 pt na folha de 300x200 pt. Ele é centralizado.
    # Margens da célula na folha:
    # start_x = (300 - 200) / 2 = 50 pt
    # start_y = (200 - 100) / 2 = 50 pt
    # Posição original do texto em relação à origem do CropBox (100, 100) era dx=70, dy=55.
    # Coordenadas esperadas do texto na folha de saída:
    # esperada_x = start_x + dx = 50 + 70 = 120 pt.
    text_instances = page_out.search_for("CENTRO")
    
    print(f"Instâncias de texto encontradas: {text_instances}")
    assert len(text_instances) > 0, "Erro: O texto 'CENTRO' não foi encontrado na folha de saída."
    
    rect_found = text_instances[0]
    # Garantir que a coordenada X de início está muito próxima de 120
    assert abs(rect_found.x0 - 120.0) < 0.5, f"Erro: Desalinhamento na horizontal. Encontrado X0={rect_found.x0}, esperado=120"
    
    doc_out.close()
    
    # Remover arquivos de teste temporários
    try:
        os.remove(input_file)
        os.remove(output_file)
        print("Arquivos de teste temporários de CropBox removidos com sucesso.")
    except Exception as ex:
         print(f"Aviso ao remover arquivos temporários: {ex}")

    print("--- TESTE DE CENTRALIZAÇÃO CROPBOX CONCLUÍDO COM SUCESSO ---")

if __name__ == "__main__":
    test_pdf_offset_cropbox()
