# Teste de integração para imposição Frente e Verso (Duplex)
import os
import fitz  # PyMuPDF
from engine import ImpositionConfig, ImpositionEngine

def test_pdf_duplex():
    input_file = "test_duplex_input.pdf"
    output_file = "output_pdf_duplex_test.pdf"

    # 1. Gerar um PDF base de 6 páginas fictícias (3 itens frente/verso)
    # Pág 1: Item 1 Frente, Pág 2: Item 1 Verso
    # Pág 3: Item 2 Frente, Pág 4: Item 2 Verso
    # Pág 5: Item 3 Frente, Pág 6: Item 3 Verso
    print("Gerando PDF base de 6 páginas (3 itens frente/verso)...")
    doc_in = fitz.open()
    item_w_pt = 100 * 2.8346  # 100mm
    item_h_pt = 50 * 2.8346   # 50mm
    
    for i in range(1, 7):
        page = doc_in.new_page(width=item_w_pt, height=item_h_pt)
        # Desenhar uma borda
        page.draw_rect(fitz.Rect(5, 5, item_w_pt - 5, item_h_pt - 5), color=(0.5, 0.5, 0.5), width=1)
        
        is_frente = (i % 2 != 0)
        item_num = (i + 1) // 2
        face_name = "FRENTE" if is_frente else "VERSO"
        
        # Desenhar o identificador no item
        page.insert_text((15, 30), f"ITEM {item_num} - {face_name}", fontsize=14, color=(0, 0, 0))
    
    doc_in.save(input_file)
    doc_in.close()

    # 2. Configurar a grade de imposição 2x2
    # Largura folha: 220mm, Altura folha: 120mm
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
        "rotations": {}
    }
    
    saida = {
        "name": "Folha Saida Teste SRA3",
        "width_mm": 220,
        "height_mm": 120,
        "file_format": "pdf"
    }

    # 3. Criar a configuração de imposição Duplex
    config = ImpositionConfig(
        base_file=input_file,
        out_pdf=output_file,
        formato=formato,
        numeracao=None,
        saida=saida,
        seq_start=1,
        seq_end=10,
        seq_increment=1,
        layout_schema="pdf_multiple",
        print_mode="duplex"
    )

    # 4. Validar total_items configurados (deve ser 3 itens, pois 6 páginas / 2 = 3)
    print(f"Total de itens configurados: {config.total_items} (Esperado: 3)")
    assert config.total_items == 3, f"Erro: total_items deveria ser 3, mas é {config.total_items}"

    # 5. Executar o processamento
    engine = ImpositionEngine(config)
    engine.process()

    # 6. Validar o PDF gerado
    assert os.path.exists(output_file), "Erro: O PDF de saída não foi gerado."
    
    doc_out = fitz.open(output_file)
    num_pages = len(doc_out)
    print(f"Número de páginas físicas geradas: {num_pages} (Esperado: 2 - Folha 1 Frente e Folha 1 Verso)")
    assert num_pages == 2, f"Erro: Deveriam ser geradas 2 páginas físicas, mas foram geradas {num_pages}"

    # 7. Validar conteúdo de texto para garantir o espelhamento e casamento de frentes/versos
    # Frente (Página 0 do doc_out):
    # Célula 0 (col=0, row=0): ITEM 1 - FRENTE
    # Célula 1 (col=1, row=0): ITEM 2 - FRENTE
    # Célula 2 (col=0, row=1): ITEM 3 - FRENTE
    # Célula 3 (col=1, row=1): Vazio
    
    # Verso (Página 1 do doc_out):
    # Célula 0 (col=0, row=0): ITEM 2 - VERSO (que estava na col 1 na frente)
    # Célula 1 (col=1, row=0): ITEM 1 - VERSO (que estava na col 0 na frente)
    # Célula 2 (col=0, row=1): Vazio (verso da célula 3 da frente, que estava vazia)
    # Célula 3 (col=1, row=1): ITEM 3 - VERSO (que estava na col 0 na frente)
    
    text_frente = doc_out[0].get_text()
    text_verso = doc_out[1].get_text()
    
    print("\nTexto da Frente da folha:")
    print(text_frente.strip())
    
    print("\nTexto do Verso da folha:")
    print(text_verso.strip())

    # Garantir que a frente contém frentes
    assert "ITEM 1 - FRENTE" in text_frente
    assert "ITEM 2 - FRENTE" in text_frente
    assert "ITEM 3 - FRENTE" in text_frente
    assert "VERSO" not in text_frente

    # Garantir que o verso contém versos
    assert "ITEM 1 - VERSO" in text_verso
    assert "ITEM 2 - VERSO" in text_verso
    assert "ITEM 3 - VERSO" in text_verso
    assert "FRENTE" not in text_verso

    doc_out.close()
    
    try:
        os.remove(input_file)
        os.remove(output_file)
        print("Arquivos de teste duplex temporários removidos com sucesso.")
    except Exception as ex:
        print(f"Aviso ao remover arquivos temporários: {ex}")

    print("--- TESTE DUPLEX CONCLUÍDO COM SUCESSO ---")

if __name__ == "__main__":
    test_pdf_duplex()
