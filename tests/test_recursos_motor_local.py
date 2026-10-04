"""Motor real, fotos/fontes/artes sintéticas, rede sempre proibida."""
import hashlib
import io

import fitz
from PIL import Image
import pytest

from engine import ImpositionConfig, ImpositionEngine
from pacotes_locais import ArmazemPacotes, PacoteInvalido

FOTO = 'https://teste.invalid/storage/v1/object/public/teste/foto.png'
FONTE = 'https://teste.invalid/storage/v1/object/public/teste/fonte.ttf'
ARTE = 'https://teste.invalid/storage/v1/object/public/teste/arte.pdf'


@pytest.fixture
def pacote(tmp_path, monkeypatch):
    def proibido(*a, **k):
        pytest.fail('Nenhum acesso à rede é permitido')
    monkeypatch.setattr('urllib.request.urlopen', proibido)
    monkeypatch.setattr('socket.create_connection', proibido)
    buf = io.BytesIO(); Image.new('RGB', (30, 30), 'red').save(buf, format='PNG')
    with fitz.open() as doc:
        doc.new_page(width=283.46, height=141.73).insert_text((10, 15), 'ARTE')
        arte = doc.tobytes()
    recursos = {'foto': buf.getvalue(), 'fonte': fitz.Font('helv').buffer, 'frente': arte}
    caminhos, infos = {}, {'verso': None}
    for nome, dados in recursos.items():
        caminho = tmp_path / (nome + '.bin'); caminho.write_bytes(dados)
        caminhos[nome] = caminho
        infos[nome] = dict(sha256=hashlib.sha256(dados).hexdigest(), bytes=len(dados))
    m = dict(schema=1, empresa='teste', modelo='1', revisao='r1', arquivos=infos,
             configuracao={'recursos_motor': {FOTO: 'foto', FONTE: 'fonte', ARTE: 'frente'}})
    a = ArmazemPacotes(tmp_path / 'pacotes', habilitado=True, reserva_bytes=0)
    a.preparar(m, caminhos)
    return a, m


def config(tmp_path, base=None, multi=False):
    elementos = [
        dict(type='FOTO', source='database', csv_column='Foto', x_mm=20, y_mm=25,
             width_mm=15, height_mm=15),
        dict(type='TEXT', fixed=True, fixed_value='LOCAL', x_mm=60, y_mm=25,
             font_size=12, font_url=FONTE, font_name='Teste'),
    ]
    num = dict(tipo='SEQUENCIAL', elements=elementos, csv_data=[{'Foto': FOTO}])
    return ImpositionConfig(base_file=base, out_pdf=str(tmp_path / 'saida.pdf'),
        formato=dict(name='Teste', width_mm=100, height_mm=50, cols=1, rows=1,
                     gap_h_mm=0, gap_v_mm=0, offset_h_mm=0, offset_v_mm=0, rotations={}),
        saida=dict(name='Teste', width_mm=120, height_mm=70), numeracao=num,
        csv_data=[{'Foto': FOTO}], seq_end=1,
        multi_artes=[dict(modelo='1', qtd=1, bloco=1, pdf_url=ARTE, numeracao=num)] if multi else None)


@pytest.mark.parametrize('multi', [False, True])
def test_motor_gera_foto_fonte_e_arte_exclusivamente_do_pacote(pacote, tmp_path, multi):
    a, _ = pacote
    with a.pdf_para_motor('teste', '1', 'r1') as base:
        motor = ImpositionEngine(config(tmp_path, str(base), multi),
            resolver_recurso=a.resolver_para_motor('teste', '1', 'r1'))
        motor.process()
    assert motor.generated_files
    with fitz.open(motor.generated_files[0]['path']) as doc:
        assert len(doc) == 1
        assert 'ARTE' in doc[0].get_text()
        assert 'LOCAL' in doc[0].get_text()
        pix = doc[0].get_pixmap()
        assert any(pix.samples[i] > 200 and pix.samples[i+1] < 40 for i in range(0, len(pix.samples), 3))


def test_dependencia_ausente_interrompe_antes_da_entrega(pacote, tmp_path):
    a, _ = pacote
    cfg = config(tmp_path)
    cfg.csv_data[0]['Foto'] = 'https://teste.invalid/ausente.png'
    entregas = []
    motor = ImpositionEngine(cfg, on_file_generated=entregas.append,
                             resolver_recurso=a.resolver_para_motor('teste', '1', 'r1'))
    with pytest.raises(ValueError, match='foto obrigatória'):
        motor.process()
    assert entregas == []
    assert not (tmp_path / 'saida.pdf').exists()


def test_corrupcao_apos_resolver_e_origem_arbitraria_recusadas(pacote):
    a, m = pacote
    resolver = a.resolver_para_motor('teste', '1', 'r1')
    with pytest.raises(PacoteInvalido, match='não declarada'):
        resolver('C:/Windows/arquivo-local')
    arquivo = a._pasta('teste') / 'objetos' / m['arquivos']['foto']['sha256']
    arquivo.write_bytes(b'corrompido')
    with pytest.raises(PacoteInvalido, match='alterada'):
        resolver(FOTO)


@pytest.mark.parametrize('recurso', ['fonte', 'arte'])
def test_fonte_ou_arte_ausente_nao_entrega_pdf(pacote, tmp_path, recurso):
    a, _ = pacote
    cfg = config(tmp_path, multi=True)
    if recurso == 'fonte':
        cfg.multi_artes[0]['numeracao']['elements'][1]['font_url'] = 'https://teste.invalid/ausente.ttf'
    else:
        cfg.multi_artes[0]['pdf_url'] = 'https://teste.invalid/ausente.pdf'
    entregas = []
    motor = ImpositionEngine(cfg, on_file_generated=entregas.append,
                             resolver_recurso=a.resolver_para_motor('teste', '1', 'r1'))
    with pytest.raises(ValueError):
        motor.process()
    assert entregas == []
    assert not (tmp_path / 'saida.pdf').exists()


def test_coleta_automatica_valida_persiste_e_alimenta_motor_sem_rede(pacote, tmp_path):
    from coleta_recursos_local import ColetorRecursos
    a, m = pacote
    resolver = a.resolver_para_motor('teste', '1', 'r1')
    chamadas = []
    def abrir(req, **kwargs):
        chamadas.append(req.full_url)
        return io.BytesIO(resolver(req.full_url))
    with a.pdf_para_motor('teste', '1', 'r1') as base:
        cfg = config(tmp_path, str(base))
        derivado = ColetorRecursos(a, host='teste.invalid', abrir=abrir).preparar(m, cfg)
        assert sorted(chamadas) == sorted([FOTO, FONTE])
        assert '_font_data' not in cfg.elements[1], 'configuração do chamador não pode ser modificada'
        assert derivado['configuracao']['preparacao_completa'] is False
        assert derivado['revisao'] != m['revisao']
        assert a.consultar('teste', '1', 'r1')['estado'] == 'local_validado'
        assert not list((a.raiz / 'coleta').iterdir())
        motor = ImpositionEngine(cfg, resolver_recurso=a.resolver_para_motor('teste', '1', derivado['revisao']))
        motor.process()
        with fitz.open(motor.generated_files[0]['path']) as doc:
            assert 'LOCAL' in doc[0].get_text()


@pytest.mark.parametrize('falha', ['tamanho', 'interrupcao', 'origem', 'foto_invalida'])
def test_coleta_falha_sem_publicar_revisao_e_limpa_temporarios(pacote, tmp_path, falha):
    from coleta_recursos_local import ColetorRecursos
    import sqlite3
    a, m = pacote
    cfg = config(tmp_path)
    if falha == 'origem':
        cfg.csv_data[0]['Foto'] = 'http://127.0.0.1/segredo'
    def checkpoint():
        if falha == 'interrupcao' and list(a.raiz.glob('coleta/recurso-*')):
            raise RuntimeError('Pausa do preparador')
    coletor = ColetorRecursos(a, host='teste.invalid', abrir=lambda *a, **k: io.BytesIO(b'x' * 20),
                             limite_recurso=10 if falha == 'tamanho' else 100, limite_total=100)
    with pytest.raises((ValueError, RuntimeError)):
        coletor.preparar(m, cfg, checkpoint=checkpoint)
    with sqlite3.connect(a._pasta('teste') / 'indice.sqlite3') as con:
        assert con.execute('SELECT COUNT(*) FROM pacotes').fetchone()[0] == 1
    assert not list((a.raiz / 'coleta').iterdir())


def test_foto_com_caminho_da_outra_estacao_e_resolvida_pelo_pacote(pacote, tmp_path):
    a, m = pacote
    origem = str(tmp_path / 'nao-existe' / 'foto.png')
    m['revisao'] = 'r2'
    m['configuracao']['recursos_motor'][origem] = 'foto'
    a.preparar(m, {})
    cfg = config(tmp_path)
    cfg.csv_data[0]['Foto'] = origem
    motor = ImpositionEngine(cfg, resolver_recurso=a.resolver_para_motor('teste', '1', 'r2'))
    try:
        motor._conferir_e_aquecer_fotos()
        assert origem in motor._url_cache
    finally:
        motor._url_cache.close()


def test_coleta_multi_artes_respeita_banco_proprio_e_reutiliza_foto(pacote, tmp_path):
    from coleta_recursos_local import ColetorRecursos
    import copy
    a, m = pacote
    leitor = a.resolver_para_motor('teste', '1', 'r1')
    chamadas = []
    def abrir(req, **kwargs):
        chamadas.append(req.full_url)
        return io.BytesIO(leitor(req.full_url))
    cfg = config(tmp_path, multi=True)
    cfg.multi_artes[0]['pdf_url'] = None
    cfg.multi_artes.append(copy.deepcopy(cfg.multi_artes[0]))
    cfg.multi_artes[1]['modelo'] = '2'
    # O banco global não deve substituir o recorte de cada arte.
    cfg.csv_data = [{'Foto': 'https://teste.invalid/nao-usar'}]
    derivado = ColetorRecursos(a, host='teste.invalid', abrir=abrir).preparar(m, cfg)
    assert chamadas.count(FOTO) == 1
    assert chamadas.count(FONTE) == 1
    assert len(derivado['configuracao']['contexto_recursos_motor']['multi_artes']) == 2


@pytest.mark.parametrize('caso', ['global_nao_renderizado', 'fallback_csv'])
def test_prevalidacao_multi_confere_o_contexto_real_do_render(pacote, tmp_path, caso):
    a, m = pacote
    cfg = config(tmp_path, multi=True)
    if caso == 'global_nao_renderizado':
        cfg.elements = [dict(type='TEXT', source='database', csv_column='COLUNA_GLOBAL_INEXISTENTE')]
    else:
        cfg.multi_artes[0]['numeracao']['csv_data'] = []
    motor = ImpositionEngine(cfg, resolver_recurso=a.resolver_para_motor('teste', '1', 'r1'))
    try:
        motor._conferir_e_aquecer_fotos()
        motor._preparar_elementos_obrigatorios()
    finally:
        motor._fechar_fontes_temporarias()
        motor._url_cache.close()
