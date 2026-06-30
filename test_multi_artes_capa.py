# -*- coding: utf-8 -*-
import os
import fitz  # PyMuPDF
from engine import ImpositionConfig, ImpositionEngine

def test_multi_artes():
    print('Gerando PDFs das artes...')
    
    # Arte 1
    doc1 = fitz.open()
    p1 = doc1.new_page(width=100*2.8346, height=50*2.8346)
    p1.draw_rect(fitz.Rect(5, 5, 100*2.8346 - 5, 50*2.8346 - 5), color=(1, 0, 0), width=2)
    p1.insert_text((20, 30), 'ARTE 1 - VERMELHA', fontsize=12)
    doc1.save('arte1.pdf')
    doc1.close()
    
    # Arte 2
    doc2 = fitz.open()
    p2 = doc2.new_page(width=100*2.8346, height=50*2.8346)
    p2.draw_rect(fitz.Rect(5, 5, 100*2.8346 - 5, 50*2.8346 - 5), color=(0, 0, 1), width=2)
    p2.insert_text((20, 30), 'ARTE 2 - AZUL', fontsize=12)
    doc2.save('arte2.pdf')
    doc2.close()

    formato = {
        'name': 'Ingresso Teste 100x50',
        'width_mm': 100,
        'height_mm': 50,
        'cols': 2,
        'rows': 2,
        'gap_h_mm': 5,
        'gap_v_mm': 5,
        'offset_h_mm': 0,
        'offset_v_mm': 0,
        'rotations': {}
    }
    
    saida = {
        'name': 'Folha Saida Teste',
        'width_mm': 220,
        'height_mm': 120,
        'file_format': 'pdf'
    }

    multi_artes_list = [
        {'qtd': '3', 'local_path': 'arte1.pdf', 'pdf_url': 'local_file'},
        {'qtd': '2', 'local_path': 'arte2.pdf', 'pdf_url': 'local_file'}
    ]

    output_file = 'output_multi_artes_test.pdf'

    config = ImpositionConfig(
        base_file='',
        out_pdf=output_file,
        formato=formato,
        numeracao=None,
        saida=saida,
        seq_start=1,
        seq_end=100,
        seq_increment=1,
        layout_schema='multi_artes',
        multi_artes=multi_artes_list
    )

    print(f'Total de itens calculados: {config.total_items} (Esperado: 5)')
    assert config.total_items == 5, f'Erro: total_items deveria ser 5, mas é {config.total_items}'

    engine = ImpositionEngine(config)
    engine.process()

    assert os.path.exists(output_file), 'Erro: O PDF de saída não foi gerado.'
    
    doc_out = fitz.open(output_file)
    num_pages = len(doc_out)
    print(f'Número de folhas geradas: {num_pages} (Esperado: 2)')
    assert num_pages == 2, f'Erro: Deveriam ser 2 folhas, mas foram {num_pages}'
    
    doc_out.close()
    
    os.remove('arte1.pdf')
    os.remove('arte2.pdf')
    os.remove(output_file)
    print('Arquivos de teste removidos.')
    print('--- TESTE MULTI-ARTES OK ---')

if __name__ == "__main__":
    test_multi_artes()
