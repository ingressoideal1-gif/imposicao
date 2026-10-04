"""Medição sintética isolada: nenhuma rede, banco real ou impressora.

Uso: python ferramentas/medir_pacote_local.py --saida docs/evidencias/arquivo.json
Cria e remove somente o diretório temporário exclusivo deste ensaio.
"""
import argparse
from contextlib import redirect_stdout, nullcontext
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import socket
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fitz
from engine import ImpositionConfig, ImpositionEngine
from pacotes_locais import ArmazemPacotes


def medir():
    resultado = {'quando': datetime.now(timezone.utc).isoformat(),
                 'carga': 'PDF sintetico simples, 8000 celulas, 2000 paginas, blocos de 100',
                 'impressao_fisica': False, 'ensaios': []}
    rede_original = socket.create_connection
    def bloquear(*args, **kwargs):
        raise RuntimeError('Rede proibida neste ensaio')
    socket.create_connection = bloquear
    try:
        with tempfile.TemporaryDirectory(prefix='newprod-piloto-medicao-') as temporarios:
            raiz = Path(temporarios)
            fonte = raiz / 'fonte.pdf'
            with fitz.open() as pdf:
                p = pdf.new_page(width=283.46, height=141.73)
                p.insert_text((20, 30), 'PILOTO LOCAL - DADOS SINTETICOS')
                pdf.save(fonte)
            dados = fonte.read_bytes()
            manifesto = {'schema': 1, 'empresa': 'sintetica', 'modelo': '1', 'revisao': 'r1',
                'configuracao': {}, 'arquivos': {'frente': {'sha256': hashlib.sha256(dados).hexdigest(),
                                                           'bytes': len(dados)}, 'verso': None}}
            a = ArmazemPacotes(raiz / 'cache', habilitado=True, reserva_bytes=0)
            inicio = time.perf_counter()
            a.preparar(manifesto, {'frente': fonte})
            resultado['preparacao_s'] = time.perf_counter() - inicio
            for rodada in range(3):
                for modo in (['original', 'pacote'] if rodada % 2 == 0 else ['pacote', 'original']):
                    pasta = raiz / f'{modo}-{rodada}'
                    pasta.mkdir()
                    inicio = time.perf_counter()
                    primeiros = []
                    def bloco_pronto(_):
                        primeiros.append(time.perf_counter() - inicio)
                    ctx = nullcontext(fonte) if modo == 'original' else a.pdf_para_motor('sintetica', '1', 'r1')
                    with ctx as caminho:
                        cfg = ImpositionConfig(base_file=str(caminho), out_pdf=str(pasta / 'saida.pdf'),
                            formato={'name': 'Teste', 'width_mm': 100, 'height_mm': 50, 'cols': 2, 'rows': 2,
                                     'gap_h_mm': 0, 'gap_v_mm': 0, 'rotations': {}},
                            numeracao={'tipo': 'SEQUENCIAL', 'elements': []},
                            saida={'name': 'Teste', 'width_mm': 300, 'height_mm': 300},
                            seq_start=1, seq_end=8000, sheets_per_block=100, entregar_por_bloco=True)
                        motor = ImpositionEngine(cfg, on_file_generated=bloco_pronto)
                        with redirect_stdout(io.StringIO()):
                            motor.process()
                    duracao = time.perf_counter() - inicio
                    paginas = 0
                    for item in motor.generated_files:
                        with fitz.open(item['path']) as pdf:
                            paginas += len(pdf)
                    assert paginas == 2000 and len(primeiros) == 20
                    resultado['ensaios'].append({'rodada': rodada + 1, 'modo': modo, 'paginas': paginas,
                        'blocos': len(primeiros), 'primeiro_bloco_s': primeiros[0], 'total_s': duracao,
                        'paginas_minuto': paginas / duracao * 60})
    finally:
        socket.create_connection = rede_original
    return resultado


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--saida', required=True)
    args = parser.parse_args()
    destino = Path(args.saida)
    if destino.exists():
        raise SystemExit('A evidência já existe; escolha outro caminho.')
    resultado = medir()
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(resultado, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
