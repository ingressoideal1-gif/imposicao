from test_portaria_tela import carga, ler
from test_portaria_deposito import rodar

VERSION='00000000-0000-4000-8000-000000000050'
def fluxo(respostas=None, **kw):
    c=carga()
    c['setores'][0]['tipo_uso']='reentrada'
    caso=dict(texto='000001',online=True)
    if respostas is not None:
        caso['mock']=dict(pathname='/functions/v1/portaria/movimento',method='POST',movimentos=respostas)
    caso.update(kw)
    return ler(c,**caso)

def test_primeira_entrada_confirmada_sem_fila_ou_popup():
    r=fluxo([dict(resultado='permitido',tipo='entrada')])
    assert r['titulo']=='LIBERADO' and r['numeroDestaque']=='1'
    assert not r['movimentoVisivel'] and not r['movimentoPendente'] and r['fila']==0
    assert r['movimentos'][0]['acao']=='auto'

def test_saida_confirmada_com_numero_e_setor():
    r=fluxo([dict(resultado='confirmar',versao=VERSION),dict(resultado='permitido',tipo='saida')],acoesMovimento=['saida'])
    assert r['titulo']=='SAÍDA REGISTRADA' and r['classe']=='resposta ok saida'
    assert r['numeroDestaque']=='1' and r['detalhe']=='PISTA' and r['fila']==0
    assert r['movimentos'][1]['acao']=='saida' and r['movimentos'][1]['versao']==VERSION
    assert r['movimentos'][0]['id_local']!=r['movimentos'][1]['id_local']

def test_entrada_de_quem_esta_dentro_negada():
    r=fluxo([dict(resultado='confirmar',versao=VERSION),dict(resultado='negado',motivo='ja_no_local',tipo='entrada')],acoesMovimento=['entrada'])
    assert r['titulo']=='Ingresso já se encontra no Local' and r['classe']=='resposta recusa'
    assert r['avisos']==['barrado'] and r['fila']==0

def test_cancelar_nao_registra_movimento():
    r=fluxo([dict(resultado='confirmar',versao=VERSION)],acoesMovimento=['cancelar'])
    assert not r['movimentoPendente'] and r['telaLendo'] and len(r['movimentos'])==1
    assert r['fila']==0 and r['avisos']==[]

def test_offline_nao_libera_e_guarda_pendencia():
    r=fluxo(online=False,reabrirMovimento=True)
    assert r['movimentoVisivel'] and r['movimentoTitulo']=='Confirmação pendente'
    assert r['fila']==0 and r['avisos']==[] and r['movimentoPendente']
    assert r['recuperado']['pendente']['leitura']['id_local']==r['movimentoPendente']['leitura']['id_local']

def test_falha_de_rede_repete_mesma_identidade():
    r=fluxo([dict(abort=True),dict(resultado='permitido',tipo='entrada')],acoesMovimento=['repetir'])
    assert r['titulo']=='LIBERADO' and not r['movimentoPendente']
    assert r['movimentos'][0]==r['movimentos'][1]

def test_confirmacao_bloqueia_outra_leitura():
    r=fluxo([dict(resultado='confirmar',versao=VERSION)],textos=['000001','000009'])
    assert r['movimentoVisivel'] and len(r['movimentos'])==1 and r['fila']==0

def test_popup_obsoleto_mostra_recusa():
    r=fluxo([dict(resultado='confirmar',versao=VERSION),dict(resultado='negado',motivo='estado_alterado')],acoesMovimento=['saida'])
    assert 'ESTADO ALTERADO' in r['titulo'] and r['classe']=='resposta recusa'

def test_pendencia_sobrevive_carga_e_bloqueia_troca_e_limpeza():
    r=rodar('''
        await d.movimentoPendente({leitura:{id_local:'mesma'},evento:'e1'});
        await d.gravarCarga({evento:{id:'e1'},credenciais:[]});
        let troca=false,limpeza=false;
        try { await d.gravarEventoPreparado({evento:{id:'e2'}}); } catch(e) { troca=true; }
        try { await d.limpar(); } catch(e) { limpeza=true; }
        return {troca,limpeza,p:(await d.movimentoPendente()).leitura.id_local};
    ''')
    assert r==dict(troca=True,limpeza=True,p='mesma')
