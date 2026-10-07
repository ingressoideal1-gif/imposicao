"""Regressao do envio GDI com historico ativo; nenhuma impressora real e acessada."""
from types import SimpleNamespace
import fitz
import pytest
from PIL import ImageWin
import gestao_estacoes as g
import print_service as p


@pytest.fixture
def ambiente(tmp_path,monkeypatch):
    h=g.Historico(tmp_path/'gestao');chamadas=[]
    monkeypatch.setattr(g,'_historico',h)
    monkeypatch.setattr(g,'_thread',object())
    monkeypatch.setattr(p,'HAS_WIN32',True)
    monkeypatch.setattr(p,'HAS_WIN32UI',True)
    monkeypatch.setattr(p,'_apply_devmode_options',lambda *_: object())
    monkeypatch.setattr(p.color_profiles,'resolver_config',lambda _: (None,None))
    caps={p.win32con.HORZRES:300,p.win32con.VERTRES:300,
          p.win32con.LOGPIXELSX:300,p.win32con.LOGPIXELSY:300,
          p.win32con.PHYSICALWIDTH:300,p.win32con.PHYSICALHEIGHT:300,
          p.win32con.PHYSICALOFFSETX:0,p.win32con.PHYSICALOFFSETY:0}
    # PyCDC.StartDoc retorna None: simular como int mascara o defeito original.
    dc=SimpleNamespace(StartDoc=lambda _:None,GetDeviceCaps=lambda c:caps[c],
        StartPage=lambda:chamadas.append('pagina'),EndPage=lambda:None,
        EndDoc=lambda:chamadas.append('fim'),DeleteDC=lambda:chamadas.append('liberado'))
    def iniciar(hdc,info):
        assert hdc==123 and info==('capa-sintetica.pdf',None,None,0)
        chamadas.append('inicio');return 347
    monkeypatch.setattr(p,'win32print',SimpleNamespace(OpenPrinter=lambda _:1,
        GetPrinter=lambda *_:{'pDevMode':object()},ClosePrinter=lambda _:None,StartDoc=iniciar))
    monkeypatch.setattr(p,'win32gui',SimpleNamespace(CreateDC=lambda *_:123))
    monkeypatch.setattr(p,'win32ui',SimpleNamespace(CreateDCFromHandle=lambda _:dc))
    monkeypatch.setattr(ImageWin,'Dib',lambda _:SimpleNamespace(draw=lambda *_:chamadas.append('desenho')))
    pdf=tmp_path/'capa.pdf'
    with fitz.open() as doc:
        doc.new_page(width=12,height=12);doc.save(pdf)
    return h,pdf,dc,chamadas


def test_capa_gdi_chega_ao_fim_e_registra_id_real(ambiente):
    h,pdf,dc,chamadas=ambiente
    ok,msg=p.send_print_job_windows('SINTETICA',str(pdf),{'print_mode':'gdi'},'capa-sintetica.pdf')
    assert ok,msg
    assert chamadas==['inicio','pagina','desenho','fim','liberado']
    trabalho=h.relatorio()['trabalhos'][0]
    assert trabalho['estado']=='enviado' and trabalho['spool_id']==347
    assert trabalho['estado']!='conferido'


def test_erro_apos_startdoc_preserva_id_e_nao_reenvia(ambiente):
    h,pdf,dc,chamadas=ambiente
    def falhar():raise OSError('erro sintetico depois de abrir spool')
    dc.StartPage=falhar
    options={'print_mode':'gdi','gestao_envio_id':'tentativa-sintetica-123'}
    assert not p.send_print_job_windows('SINTETICA',str(pdf),options,'capa-sintetica.pdf')[0]
    assert not p.send_print_job_windows('SINTETICA',str(pdf),options,'capa-sintetica.pdf')[0]
    trabalho=h.relatorio()['trabalhos'][0]
    assert trabalho['estado']=='incerto' and trabalho['spool_id']==347
    assert chamadas.count('inicio')==1


def test_erro_antes_de_abrir_spool_nao_inventa_id(ambiente,monkeypatch):
    h,pdf,dc,chamadas=ambiente
    def falhar(*_):raise OSError('StartDoc recusado')
    monkeypatch.setattr(p.win32print,'StartDoc',falhar)
    assert not p.send_print_job_windows('SINTETICA',str(pdf),{'print_mode':'gdi'},'capa-sintetica.pdf')[0]
    trabalho=h.relatorio()['trabalhos'][0]
    assert trabalho['estado']=='falha' and trabalho['spool_id'] is None
    assert 'pagina' not in chamadas
