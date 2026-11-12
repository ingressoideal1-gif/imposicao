import hashlib
import json
from pathlib import Path
import subprocess
import sys
import threading
import uuid

import fitz
import pytest

from controle_producao import ControleProducao
from impressao_autonoma import Trabalhos
from impressao_autonoma_envio import preparar_pdf, enviar


def iniciar(fila, produzir, enviar=lambda *a: 10, finalizar=lambda: None, ident=None, controle=None):
    ident = ident or str(uuid.uuid4())
    dados, novo = fila.iniciar(ident, 'assinatura', produzir, enviar, finalizar,
                               (controle or ControleProducao()).reservar)
    return dados, novo


def concluir(fila, ident):
    fila.threads[ident].join(5)
    assert not fila.threads[ident].is_alive()
    return fila.obter(ident)


def test_envia_sem_navegador_e_nao_gera_antes_do_envio(tmp_path):
    fila = Trabalhos(tmp_path/'jobs.sqlite')
    eventos, ids = [], []
    controle = ControleProducao()
    def produzir(callback):
        for n in range(5):
            eventos.append(('gerado',n));callback({'type':'miolo'})
    def enviar_lote(arquivo, ident, numero):
        assert controle.ocupado()
        assert not controle.iniciar_atualizacao()
        assert eventos[-1] == ('gerado',numero-1)
        ids.append(ident);eventos.append(('enviado',numero-1));return 10
    dados, novo = iniciar(fila,produzir,enviar_lote,controle=controle)
    final = concluir(fila,dados['id'])
    assert novo and final['estado']=='enviado' and final['enviados']==5
    assert len(set(ids))==5 and final['paginas_enviadas']==50
    assert not controle.ocupado()
    # HTTP repetido, inclusive apos reinicio, devolve estado sem novo envio.
    for manager in [fila,Trabalhos(tmp_path/'jobs.sqlite')]:
        result,new=iniciar(manager,lambda cb: pytest.fail('nao repetir'),ident=dados['id'])
        assert not new and result['enviados']==5
    with pytest.raises(ValueError,match='outro trabalho'):
        fila.iniciar(dados['id'],'diferente',None,None,None,controle.reservar)


def test_cancelamento_explicito_espera_lote_em_curso(tmp_path):
    fila=Trabalhos(tmp_path/'jobs.sqlite');entrou=threading.Event();liberar=threading.Event()
    gerados=[]
    def produzir(callback):
        for n in range(4):
            gerados.append(n);callback({'type':'miolo'})
    def lento(*a):entrou.set();assert liberar.wait(3);return 10
    dados,_=iniciar(fila,produzir,lento)
    assert entrou.wait(3)
    fila.cancelar(dados['id']);liberar.set()
    final=concluir(fila,dados['id'])
    assert final['estado']=='cancelado' and final['enviados']==1 and gerados==[0]


def test_falha_libera_novo_trabalho_sem_repetir_anterior(tmp_path):
    fila=Trabalhos(tmp_path/'jobs.sqlite');chamadas=[]
    def falhar(*a):chamadas.append(1);raise OSError('driver privado')
    dados,_=iniciar(fila,lambda cb:cb({'type':'capa'}),falhar)
    final=concluir(fila,dados['id'])
    assert final['estado']=='conferencia' and final['lotes'][0]['estado']=='enviando'
    assert 'driver privado' not in json.dumps(final)
    novo,aceito=iniciar(fila,lambda cb:cb({'type':'miolo'}))
    assert aceito and concluir(fila,novo['id'])['estado']=='enviado'
    assert fila.obter(dados['id'])==final
    assert not iniciar(fila,None,ident=dados['id'])[1]
    assert chamadas==[1]
    fila.conferir(dados['id'])
    assert fila.obter(dados['id'])['estado']=='encerrado'


def test_reinicio_de_processo_no_meio_do_envio_nao_reenvia(tmp_path):
    caminho=tmp_path/'jobs.sqlite';ident=str(uuid.uuid4())
    script='''
import os,sys,time
from impressao_autonoma import Trabalhos
from controle_producao import ControleProducao
fila=Trabalhos(sys.argv[1])
def enviar(*args):os._exit(0)
fila.iniciar(sys.argv[2],'assinatura',lambda cb:cb({'type':'miolo'}),enviar,lambda:None,ControleProducao().reservar)
time.sleep(10)
'''
    resultado=subprocess.run([sys.executable,'-c',script,str(caminho),ident],timeout=15)
    assert resultado.returncode==0
    fila=Trabalhos(caminho);dado=fila.obter(ident)
    assert dado['estado']=='conferencia' and dado['motivo']=='reinicio'
    assert dado['gerados']==1 and dado['enviados']==0
    assert not fila.threads
    assert not iniciar(fila,None,ident=ident)[1]
    novo,aceito=iniciar(fila,lambda cb:cb({'type':'capa'}))
    assert aceito and concluir(fila,novo['id'])['enviados']==1
    assert fila.obter(ident)==dado


def test_admissoes_concorrentes_nao_duplicam(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    fila=Trabalhos(tmp_path/'jobs.sqlite');ident=str(uuid.uuid4());liberar=threading.Event()
    def produzir(callback):assert liberar.wait(3);callback({'type':'capa'})
    with ThreadPoolExecutor(2) as pool:
        futures=[pool.submit(iniciar,fila,produzir,ident=ident) for _ in range(2)]
        resultados=[f.result(3) for f in futures]
    assert sum(novo for _,novo in resultados)==1
    liberar.set();assert concluir(fila,ident)['enviados']==1


def pdf(tmp_path, tipo='miolo', paginas=10):
    path=tmp_path/(tipo+'.pdf')
    with fitz.open() as doc:
        for n in range(paginas):doc.new_page().insert_text((30,30),str(n+1))
        doc.save(path)
    return {'path':str(path),'name':path.name,'type':tipo}


def test_faces_rotacao_e_capa_nao_perdem_paginas(tmp_path):
    arquivo=pdf(tmp_path)
    path,total=preparar_pdf(arquivo,{'face':'back','rotacionar_pares':True},'duplex')
    with fitz.open(path) as doc:
        assert total==5 and [p.get_text().strip() for p in doc]==['2','4','6','8','10']
        assert all(p.rotation==180 for p in doc)
    capa=pdf(tmp_path,'capa',1)
    path,total=preparar_pdf(capa,{'face':'back'},'duplex')
    assert total==1
    with pytest.raises(ValueError,match='limite'):preparar_pdf(pdf(tmp_path,'longo',11),{},'front')


def test_separacao_de_faces_preserva_outputintent(tmp_path):
    arquivo=pdf(tmp_path)
    with fitz.open(arquivo['path']) as doc:
        doc.xref_set_key(doc.pdf_catalog(),'OutputIntents','[<</Type/OutputIntent/S/GTS_PDFX/OutputConditionIdentifier(sintetico)>>]')
        doc.saveIncr()
    path,_=preparar_pdf(arquivo,{'face':'front'},'duplex')
    with fitz.open(path) as doc:
        assert 'sintetico' in doc.xref_get_key(doc.pdf_catalog(),'OutputIntents')[1]


@pytest.mark.parametrize('tipo,bandeja',[('capa','CAPAS'),('miolo','MIOLO'),('contracapa','CAPAS')])
def test_envio_preserva_bandejas_e_integridade(tmp_path,monkeypatch,tipo,bandeja):
    import print_experimental
    arquivo=pdf(tmp_path,tipo,1 if tipo!='miolo' else 10);calls=[]
    monkeypatch.setattr(print_experimental,'enviar',lambda *a:calls.append(a))
    pedido={'printerName':'sintetica','experimental':True,'options':{'experimental':True,'modo':'experimental_gdi',
        'tray_capa':'CAPAS','tray_miolo':'MIOLO','duplex':2}}
    assert enviar(arquivo,pedido,'duplex',str(uuid.uuid4()),1) in (1,10)
    options=calls[0][2]
    assert options['tray']==bandeja and options['duplex']==2
    assert options['historico_contexto']['tipo']==tipo
    assert options['integridade_sha256']==hashlib.sha256(Path(calls[0][1]).read_bytes()).hexdigest()
    assert 'gestao_envio_id' not in pedido['options']


def test_permissoes_print_sao_exigidas_nas_rotas():
    from autorizacao_local import autorizar, exige_identidade
    from fastapi import HTTPException
    for metodo,caminho in [('GET','/api/print/trabalhos'),('POST','/api/print/trabalhos/id/cancelar'),('POST','/api/print/trabalhos/id/conferir')]:
        assert exige_identidade(metodo,caminho)
        with pytest.raises(HTTPException):autorizar({'permissoes':{}},metodo,caminho)
        autorizar({'permissoes':{'perm_imprimir':True}},metodo,caminho)


def test_trabalho_autonomo_nao_intercala_com_relay_ou_outro_envio():
    controle=ControleProducao()
    http=controle.reservar()
    relay=controle.reservar()
    assert controle.reservar_impressao() is None
    relay.liberar()
    trabalho=controle.reservar_impressao()
    assert trabalho is not None
    http.liberar()  # Resposta HTTP encerrada, impressao continua exclusiva.
    assert controle.reservar() is None
    assert not controle.iniciar_atualizacao()
    trabalho.liberar()
    assert not controle.ocupado()
    assert controle.reservar() is not None


def test_segundo_processo_nao_recupera_trabalho_do_primeiro(tmp_path):
    import os
    env=dict(os.environ,LOCALAPPDATA=str(tmp_path))
    script="from impressao_autonoma import trabalhos; trabalhos(); print('travado',flush=True); input()"
    proc=subprocess.Popen([sys.executable,'-c',script],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE,text=True,env=env)
    try:
        assert proc.stdout.readline().strip()=='travado'
        second=subprocess.run([sys.executable,'-c','from impressao_autonoma import trabalhos; trabalhos()'],
                              env=env,capture_output=True,timeout=10)
        assert second.returncode!=0
    finally:
        proc.communicate('\n',timeout=10)
    third=subprocess.run([sys.executable,'-c','from impressao_autonoma import trabalhos; trabalhos()'],
                         env=env,capture_output=True,timeout=10)
    assert third.returncode==0,third.stderr

def test_trabalho_realmente_ativo_continua_serializado(tmp_path):
    fila=Trabalhos(tmp_path/'jobs.sqlite');liberar=threading.Event()
    def produzir(cb):
        assert liberar.wait(5)
        cb({'type':'miolo'})
    dados,_=iniciar(fila,produzir)
    try:
        with pytest.raises(ValueError,match='andamento'):
            iniciar(fila,lambda cb:cb({'type':'capa'}))
    finally:
        liberar.set()
        concluir(fila,dados['id'])

def test_painel_interrompido_nao_exige_conferencia():
    script=r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert');
(async()=>{
  let estado='conferencia',observar;
  const elementos=[];
  function elemento(){
    const e={style:{},children:[],appendChild(c){this.children.push(c);},
      replaceChildren(){this.children=[];}};
    elementos.push(e);return e;
  }
  const ctx={window:{},document:{readyState:'loading',body:elemento(),
    createElement:elemento,addEventListener(n,fn){observar=fn;}},
    location:{hostname:'localhost',origin:'http://localhost:9001'},
    setTimeout(){},AbortSignal,URL,
    fetch:async()=>({ok:true,json:async()=>({trabalhos:[
      {id:'teste-antigo',estado,enviados:0,paginas_enviadas:0}]})})};
  vm.runInNewContext(fs.readFileSync('frontend/impressao-autonoma.js','utf8'),ctx);
  await observar();
  assert.equal(ctx.window.ImpressaoAutonoma.ocupada(),false);
  assert(!elementos.some(e=>(e.textContent||'').includes('conferi')));
  assert(!elementos.some(e=>(e.textContent||'').includes('Confira')));
  estado='enviando';
  await ctx.window.ImpressaoAutonoma.consultar();
  assert.equal(ctx.window.ImpressaoAutonoma.ocupada(),true);
  assert(elementos.some(e=>e.textContent==='Cancelar próximos lotes'));
})().catch(e=>{console.error(e);process.exit(1);});
'''
    result=subprocess.run(['node','-e',script],capture_output=True,text=True,timeout=15)
    assert result.returncode==0,result.stdout+result.stderr
