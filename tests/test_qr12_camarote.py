"""PDF, numeracao e credenciais reais do motor, com pool sintetico e sem rede."""
import io
from collections import Counter

import fitz
import pytest
from PIL import Image

import acesso_publicacao as publicacao
import qr_contratos
import qr_ideal as qr
from engine import ImpositionConfig, ImpositionEngine, _generate_qr


class Pool:
    def codigo_indice(self, index):
        return f'{index:08X}'


def contract():
    return dict(pedido=123, modelo=1000011, versao=2, inicio=7, passo=1,
                posicao=1, quantidade=6, deslocamento=200, capacidade=6,
                pool_revisao='ideal-qr12-1', fonte_hash='synthetic')


def config(tmp_path, name, mode='front', rotation=0, **extra):
    base=tmp_path/'base.pdf'
    with fitz.open() as doc:
        doc.new_page(width=100*72/25.4,height=60*72/25.4)
        doc.save(base)
    return ImpositionConfig(base_file=str(base),out_pdf=str(tmp_path/'out.pdf'),
        formato=dict(width_mm=100,height_mm=60,cols=1,rows=1,rotations={'0':rotation}),
        saida=dict(width_mm=120,height_mm=120),seq_start=7,seq_end=12,
        c_ini=21,q_cam=2,l_cam=3,pedido=123,modelo=1000011,print_mode=mode,
        pool_qr=qr.PoolComContratos(Pool(),[contract()],Pool()),
        numeracao={'name':name,'tipo':'CAMAROTE','print_mode':mode,'elements':[
            {'type':'QR_IDEAL','x_mm':75,'y_mm':30,'size_mm':15},
            {'type':'CAMAROTE_LOCAL','x_mm':20,'y_mm':15,'font_size':12},
            {'type':'CAMAROTE_PESSOA','x_mm':20,'y_mm':35,'font_size':12}]},**extra)


@pytest.mark.parametrize('name',['teatro1','SEQUENCIAL','Qualquer nome'])
@pytest.mark.parametrize('mode,rotation',[('front',0),('duplex',0),('front',90)])
def test_pdf_e_credenciais_mesmo_qr_por_pessoa(tmp_path,monkeypatch,name,mode,rotation):
    cfg=config(tmp_path,name,mode,rotation)
    engine=ImpositionEngine(cfg)
    rendered=[]
    original=engine._render_element
    def capture(page,el,x,y,val,csv_row=None):
        rendered.append((el['type'],val,el.get('_qr_ideal_conteudo')))
        return original(page,el,x,y,val,csv_row)
    monkeypatch.setattr(engine,'_render_element',capture)
    engine.process()
    copies=2 if mode=='duplex' else 1
    assert cfg.total_items==6 and cfg.num_tipo=='CAMAROTE'
    assert Counter(v for t,v,_ in rendered if t=='CAMAROTE_LOCAL')==Counter({21:3*copies,22:3*copies})
    assert Counter(v for t,v,_ in rendered if t=='CAMAROTE_PESSOA')==Counter({1:2*copies,2:2*copies,3:2*copies})
    contents={cfg.pool_qr.conteudo(123,1000011,v) for v in range(7,13)}
    assert len(contents)==6
    assert Counter(c for t,_,c in rendered if t=='QR_IDEAL')==Counter({c:copies for c in contents})
    pixels=lambda b: Image.open(io.BytesIO(b)).convert('L').tobytes()
    with fitz.open(cfg.out_pdf) as doc:
        images={pixels(doc.extract_image(i[0])['image']) for p in doc for i in p.get_images(full=True)}
    assert images=={pixels(_generate_qr(c)) for c in contents}
    credentials=list(publicacao.itens_do_pedido(123,{1000011:6},'00'*32,cfg.pool_qr,
        {1000011:dict(tipo='QR_IDEAL',inicio=7,passo=1,posicao=1)}))
    assert [c['numero'] for c in credentials]==list(range(1,7))
    assert {c['hash'] for c in credentials}=={qr.hash_codigo(c,'00'*32) for c in contents}


def test_preflight_recusa_lotacao_que_excede_reserva(tmp_path,monkeypatch):
    import qr_base_v2
    cfg=config(tmp_path,'nome sem relevancia')
    monkeypatch.setattr(qr_contratos,'obter',lambda _: [contract()])
    monkeypatch.setattr(qr_base_v2,'obter',lambda _: Pool())
    qr_contratos.preparar_config(cfg)
    cfg.total_items=9
    with pytest.raises(ValueError,match='fora'):
        qr_contratos.preparar_config(cfg)


def test_reimpressao_preserva_pessoa_e_qr_originais(tmp_path,monkeypatch):
    cfg=config(tmp_path,'teatro no nome nao muda tipo',refazer_celulas=[2,4,6])
    engine=ImpositionEngine(cfg)
    rendered=[]
    original=engine._render_element
    def capture(page,el,x,y,val,csv_row=None):
        rendered.append((el['type'],val,el.get('_qr_ideal_conteudo')))
        return original(page,el,x,y,val,csv_row)
    monkeypatch.setattr(engine,'_render_element',capture)
    engine.process()
    assert [v for t,v,_ in rendered if t=='CAMAROTE_LOCAL']==[21,22,22]
    assert [v for t,v,_ in rendered if t=='CAMAROTE_PESSOA']==[2,1,3]
    assert [c for t,_,c in rendered if t=='QR_IDEAL']==[
        cfg.pool_qr.conteudo(123,1000011,v) for v in (8,10,12)]


def test_modelos_somados_nao_compartilham_qr(tmp_path,monkeypatch):
    cfg=config(tmp_path,'CAMAROTE')
    contracts=[contract(),{**contract(),'modelo':1000012,'inicio':101,'deslocamento':300}]
    cfg.multi_artes=[dict(qtd=6,nome='',modelo=c['modelo'],pedido=123,
        numeracao={**cfg.numeracao,'start':c['inicio']},q_cam=2,l_cam=3,c_ini=21,
        bloco='1',pdf_url=None,pdf_verso_url=None,local_path=None) for c in contracts]
    cfg.layout_schema='multi_artes'
    cfg.total_items=12
    cfg.pool_qr=qr.PoolComContratos(Pool(),contracts,Pool())
    engine=ImpositionEngine(cfg)
    contents=[]
    original=engine._render_element
    def capture(page,el,x,y,val,csv_row=None):
        if el['type']=='QR_IDEAL':contents.append(el['_qr_ideal_conteudo'])
        return original(page,el,x,y,val,csv_row)
    monkeypatch.setattr(engine,'_render_element',capture)
    engine.process()
    assert len(contents)==len(set(contents))==12
    assert set(contents)=={cfg.pool_qr.conteudo(123,c['modelo'],v)
        for c in contracts for v in range(c['inicio'],c['inicio']+6)}
