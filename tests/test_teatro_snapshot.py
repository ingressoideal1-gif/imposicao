"""Contrato de snapshot: serviços simulados, nenhum acesso a banco ou credenciais."""
import copy
import json
import pathlib
import subprocess
import pytest
import teatro_snapshot

ROOT = pathlib.Path(__file__).resolve().parents[1]


@pytest.fixture
def fonte():
    r = subprocess.run(['node', 'tests/teatro_snapshot_harness.js', '--payload'], cwd=ROOT,
                       text=True, encoding='utf-8', capture_output=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_snapshot_js_python_identicos_e_historico_preservado(fonte):
    p = fonte['payload']; anterior = copy.deepcopy(p)
    avisos = teatro_snapshot.aplicar(p, lambda _: fonte['atual'])
    assert len(avisos) == 1 and 'snapshot histórico' in avisos[0]
    assert p == anterior
    assert [(r['Fila'], r['Lugar']) for r in p['numeracao']['csv_data']] == [('A','1'), ('A','3'), ('B','Z')]


@pytest.mark.parametrize('caso', ['quantidade','setor','mapa','modelo','linhas','versao','revisao_atual','config_obsoleta','snapshot_ausente'])
def test_motor_bloqueia_inconsistencias(fonte, caso):
    p = fonte['payload']; m = p['numeracao']['teatro_modelo']; atual = fonte['atual']
    if caso == 'quantidade': m['quantidade'] += 1
    elif caso == 'setor': m['mapa_teatro_snapshot']['setor']['id'] = 'outro'
    elif caso == 'mapa': atual['id'] = 'outro'
    elif caso == 'modelo': p['modelo'] = 'outro'
    elif caso == 'linhas': p['numeracao']['csv_data'][0]['Numero'] = '999'
    elif caso == 'versao': m['mapa_teatro_snapshot']['versao'] = 2
    elif caso == 'revisao_atual': m['revisao_atual'] = 'b'*64
    elif caso == 'config_obsoleta': atual['config']['novo'] = True
    elif caso == 'snapshot_ausente': m['mapa_teatro_snapshot'] = None
    with pytest.raises(ValueError): teatro_snapshot.aplicar(p, lambda _: atual)


def test_multi_modelos_conserva_snapshots_e_releitura_unica(fonte):
    a = fonte['payload']; b = copy.deepcopy(a); b['modelo'] = 'm2'; b['qtd'] = 3
    b['numeracao']['teatro_modelo']['id'] = 'm2'
    chamadas = []
    def ler(id): chamadas.append(id); return fonte['atual']
    assert len(teatro_snapshot.aplicar({'multi_artes':[a,b]}, ler)) == 2
    assert chamadas == ['mapa1']


def test_modelos_legados_nao_sao_convertidos():
    p = {'modelo':'legado','numeracao':{'csv_data':[{'Fila':'A','Numero':'3'}]}}
    anterior = copy.deepcopy(p)
    assert teatro_snapshot.aplicar(p, lambda _: pytest.fail('Leitura indevida')) == []
    assert p == anterior


@pytest.mark.parametrize('conjunto', ['Mesa', 'Fileira Especial', 'Camarote'])
def test_capa_snapshot_legado_usa_descricao_editada_sem_trocar_lugares(tmp_path, fonte, conjunto):
    import fitz
    from engine import ImpositionConfig, ImpositionEngine
    p = fonte['payload']; num = p['numeracao']; modelo = num['teatro_modelo']
    modelo['mapa_teatro_snapshot']['setor'].pop('nomeConjunto')
    num['csv_data'] = teatro_snapshot.linhas(modelo)
    snapshot = copy.deepcopy(modelo['mapa_teatro_snapshot'])
    rows = copy.deepcopy(num['csv_data'])
    atual = fonte['atual']; atual['config']['setores'][0]['nomeConjunto'] = conjunto
    resultado = subprocess.run(['node','-e',
        "const J=require('./frontend/mapa-teatro-revisao.js');const c=JSON.parse(process.argv[1]);J.revisao(c).then(r=>console.log(JSON.stringify({canonica:J.canonicalizar(c),revisao:r})));",
        json.dumps(atual['config'])],cwd=ROOT,text=True,capture_output=True,check=True)
    revisao = json.loads(resultado.stdout)
    modelo.update(config_canonica_atual=revisao['canonica'], revisao_atual=revisao['revisao'])
    num['teatro_capa'] = {'nomeConjunto':'Texto indevido enviado pelo navegador'}
    teatro_snapshot.aplicar(p,lambda _:atual)
    assert num['teatro_capa'] == {'nomeConjunto':conjunto}
    assert num['csv_data'] == rows and modelo['mapa_teatro_snapshot'] == snapshot
    assert rows[0]['Conjunto'] == 'Fila'
    num['elements'] = [{'type':'TEATRO_COMBO','x_mm':12,'y_mm':20,'font_size':14}]
    cfg = ImpositionConfig(base_file='',out_pdf=str(tmp_path/'capas.pdf'),
        formato={'width_mm':100,'height_mm':50,'cols':2,'rows':1,'has_cover':True,'cover_font_y':20},
        saida={'width_mm':220,'height_mm':150},numeracao=num,csv_data=rows,
        layout_schema='cut_stack',cut_stack_mode='strict_assembly')
    ImpositionEngine(cfg).process()
    with fitz.open(next(tmp_path.glob('*_01_capa.pdf'))) as doc:
        texto=''.join(page.get_text() for page in doc)
        assert conjunto+' A' in texto and conjunto+' B' in texto
        assert 'Fila A' not in texto and 'Texto indevido' not in texto


def test_pdf_real_usa_snapshot_historico_sem_renumerar(tmp_path, fonte):
    import fitz
    from engine import ImpositionConfig, ImpositionEngine
    p = fonte['payload']
    teatro_snapshot.aplicar(p, lambda _: fonte['atual'])
    p['numeracao']['elements'] = [{'type':'TEATRO_COMBO','x_mm':12,'y_mm':20,
        'font_size':14,'font_name':'helv','color':'#000000'}]
    cfg = ImpositionConfig(base_file='', out_pdf=str(tmp_path/'snapshot.pdf'),
        formato={'width_mm':100,'height_mm':50,'cols':1,'rows':1,'rotations':{}},
        saida={'width_mm':120,'height_mm':70}, numeracao=p['numeracao'],
        csv_data=p['numeracao']['csv_data'], seq_start=1, seq_end=3,
        layout_schema='cut_stack', cut_stack_mode='strict_assembly')
    ImpositionEngine(cfg).process()
    arquivos = list(tmp_path.glob('*_02_miolo.pdf'))
    assert len(arquivos) == 1
    with fitz.open(arquivos[0]) as doc:
        textos = [page.get_text().split() for page in doc]
    assert textos == [['A','-','1'],['A','-','3','Cad'],['B','-','Z']]
