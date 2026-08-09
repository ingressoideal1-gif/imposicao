# Teste de imposição com regra Pdf Múltiplo
import os
import fitz  # PyMuPDF
from engine import ImpositionConfig, ImpositionEngine

def test_pdf_multiple():
    input_file = "test_multipage_input.pdf"
    output_file = "output_pdf_multiple_test.pdf"

    # 1. Gerar um PDF base de 5 páginas, cada uma com o texto da página correspondente
    print("Gerando PDF base de 5 páginas...")
    doc_in = fitz.open()
    item_w_pt = 100 * 2.8346  # 100mm
    item_h_pt = 50 * 2.8346   # 50mm
    
    for i in range(1, 6):
        page = doc_in.new_page(width=item_w_pt, height=item_h_pt)
        # Desenhar uma borda
        page.draw_rect(fitz.Rect(5, 5, item_w_pt - 5, item_h_pt - 5), color=(0.5, 0.5, 0.5), width=1)
        # Desenhar o número da página grande
        page.insert_text((30, 30), f"PAGINA {i}", fontsize=18, color=(0, 0, 0))
    
    doc_in.save(input_file)
    doc_in.close()

    # 2. Configurar a grade de imposição 2x2
    # Largura folha: 220mm, Altura folha: 120mm (o suficiente para caber 2x2 de 100x50 com gaps)
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
        "name": "Folha Saida Teste",
        "width_mm": 220,
        "height_mm": 120,
        "file_format": "pdf"
    }

    # 3. Criar a configuração de imposição
    config = ImpositionConfig(
        base_file=input_file,
        out_pdf=output_file,
        formato=formato,
        numeracao=None,
        saida=saida,
        seq_start=1,
        seq_end=10,  # Deve ser ignorado no pdf_multiple
        seq_increment=1,
        layout_schema="pdf_multiple"
    )

    # 4. Verificar se total_items foi corretamente definido como 5
    print(f"Total de itens configurados: {config.total_items} (Esperado: 5)")
    assert config.total_items == 5, f"Erro: total_items deveria ser 5, mas é {config.total_items}"

    # 5. Executar o processamento
    engine = ImpositionEngine(config)
    engine.process()

    # 6. Validar o PDF gerado
    assert os.path.exists(output_file), "Erro: O PDF de saída não foi gerado."
    
    doc_out = fitz.open(output_file)
    num_pages = len(doc_out)
    print(f"Número de folhas geradas: {num_pages} (Esperado: 2)")
    assert num_pages == 2, f"Erro: Deveriam ser geradas 2 folhas, mas foram geradas {num_pages}"

    # Limpeza dos arquivos de teste
    doc_out.close()
    
    try:
        os.remove(input_file)
        os.remove(output_file)
        print("Arquivos de teste temporários removidos com sucesso.")
    except Exception as ex:
        print(f"Aviso ao remover arquivos temporários: {ex}")

    print("--- TESTE CONCLUÍDO COM SUCESSO ---")

if __name__ == "__main__":
    test_pdf_multiple()
