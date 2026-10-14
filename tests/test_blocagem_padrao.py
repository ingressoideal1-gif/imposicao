"""Omissao usa cinco; definicoes explicitas continuam intactas, inclusive 50."""
import fitz
import pytest
from engine import ImpositionConfig, ImpositionEngine


def config(tmp_path, **opcoes):
    return ImpositionConfig(
        base_file='', out_pdf=str(tmp_path / 'trabalho.pdf'),
        formato={'width_mm': 40, 'height_mm': 20, 'cols': 2, 'rows': 2},
        saida={'width_mm': 100, 'height_mm': 100},
        numeracao={'tipo': 'SEQUENCIAL', 'elements': [
            {'type': 'TEXT', 'x_mm': 15, 'y_mm': 10, 'font_size': 10}]},
        seq_start=1, seq_end=40, layout_schema='cut_stack',
        cut_stack_mode='strict_assembly', **opcoes)


@pytest.mark.parametrize('valor,esperado', [(None,5), ('',5), (0,0), (5,5), (25,25), (50,50), (100,100)])
def test_vazio_e_valores_definidos(tmp_path, valor, esperado):
    assert config(tmp_path, sheets_per_block=valor).sheets_per_block == esperado


def test_pdf_sem_blocagem_equivale_a_cinco_explicito(tmp_path):
    resultados=[]
    for nome, opcoes in [('padrao', {}), ('explicito', {'sheets_per_block':5})]:
        pasta=tmp_path / nome
        pasta.mkdir()
        cfg=config(pasta, **opcoes)
        assert cfg.sheets_per_block == 5
        ImpositionEngine(cfg).process()
        paginas=[]
        for arquivo in sorted(pasta.glob('*miolo.pdf')):
            with fitz.open(arquivo) as doc:
                assert len(doc) == 5
                paginas.extend(p.get_text() for p in doc)
        assert len(paginas) == 10
        resultados.append(paginas)
    assert resultados[0] == resultados[1]
