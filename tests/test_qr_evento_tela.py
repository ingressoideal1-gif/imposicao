"""Fluxo real de DOM/canvas/IndexedDB, com rede sintética e sem produção."""
import sys
import subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from test_controle_tela import _no_navegador
from test_ideal_control_tela import _no_navegador as _grafica

PREPARAR = r"""
    localStorage.clear();
    const E = '11111111-1111-4111-8111-111111111111';
    const A = '33333333-3333-4333-8333-333333333333';
    const SECRET = 'ab'.repeat(32);
    const requests = [];
    const realFetch = window.fetch;
    window.fetch = async (url, options) => {
        if (!String(url).includes('/functions/v1/portaria/')) return realFetch(url, options);
        const c = JSON.parse(options.body); requests.push({url:String(url), c});
        let body;
        if (url.endsWith('/registrar-pin')) body = {id:'installation-synthetic'};
        else if (url.endsWith('/consultar-qr-evento')) body = {evento:{id:E,nome:'Evento sintético'}};
        else if (url.endsWith('/preparar-qr-evento')) body = {concluida:true,prontos:1500,total:1500};
        else if (url.endsWith('/ativar-qr-evento')) body = {evento:{id:E,nome:'Evento sintético'},aparelho:{id:A,nome:c.nome}};
        else if (url.endsWith('/elevar-pin')) body = {token:'synthetic-elevation',expira_em:Math.floor(Date.now()/1000)+900};
        else if (url.endsWith('/editar-pin')) body = {ok:true};
        else throw new Error('unexpected request');
        return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
    };
    const tick = () => new Promise(r=>setTimeout(r,30));
    const until = async f => { for(let i=0;i<100;i++){if(f())return;await tick();}throw new Error('timeout'); };
"""

def test_primeiro_uso_senha_seis_digitos_sem_persistir_pin():
    r = _no_navegador(PREPARAR + r"""
        const pronto = pinInstalacao.preparar(); await until(()=>document.querySelector('input[name=pin]'));
        const form = document.querySelector('input[name=pin]').closest('[data-pin-campos]');
        form.querySelector('[name=pin]').value = '042815'; form.querySelector('[name=confirma]').value = '999999'; form.querySelector('[data-pin-salvar]').click();
        await tick(); const mismatch = form.querySelector('[role=status]').textContent;
        form.querySelector('[name=confirma]').value = '042815'; form.querySelector('[data-pin-salvar]').click(); await pronto;
        const stored = Object.values(localStorage).join('|');
        await pinInstalacao.preparar();
        return {mismatch, saved:!!localStorage.getItem('ideal_control_pin_configurado'),
            leaked:stored.includes('042815'), registrations:requests.length,
            pinFields:document.querySelectorAll('input[name=pin]').length};
    """)
    assert "iguais" in r["mismatch"]
    assert r["saved"] and not r["leaked"] and r["registrations"] == 1 and r["pinFields"] == 0

def test_qr_importado_da_imagem_ativa_evento_sem_login_e_reutiliza_token():
    r = _no_navegador(PREPARAR + r"""
        localStorage.setItem('ideal_control_pin_configurado','synthetic');
        localStorage.setItem('ideal_control_instalacao','cd'.repeat(32));
        for(const name of ['qrcode-generator.min.js','qr-canvas.js']) {
            await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=name;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
        }
        const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,600);
        renderQRCodeOnCtx(ctx,'IDEAL-CONTROL-EVENTO:1:'+SECRET,300,300,500);
        const blob=await new Promise(r=>canvas.toBlob(r));
        const file=new File([blob],'qr-sintetico.png',{type:'image/png'});
        const transfer=new DataTransfer();transfer.items.add(file);
        document.getElementById('btn-ler-qr-evento').click();
        const input=document.querySelector('[data-evento-galeria]'); input.files=transfer.files;input.dispatchEvent(new Event('change'));
        await until(()=>!document.querySelector('[data-evento-confirmar]').hidden);
        let assumed=[]; aparelhoAqui.assumir=async (token,nome,dados)=>{assumed.push(dados);};
        document.querySelector('[data-evento-carregar]').click();await until(()=>assumed.length===1);
        await until(()=>!document.querySelector('[data-evento-carregar]').disabled);
        document.querySelector('[data-evento-carregar]').click();await until(()=>assumed.length===2);
        const activations=requests.filter(r=>r.url.endsWith('/ativar-qr-evento'));
        return {name:document.querySelector('[data-evento-nome]').textContent,assumed:assumed[0],
            sameToken:activations[0].c.token===activations[1].c.token,
            lookup:requests.some(r=>r.url.endsWith('/consultar-qr-evento'))};
    """)
    assert r["name"] == "Evento sintético" and r["lookup"] and r["sameToken"]
    assert r["assumed"]["por_qr"] and r["assumed"]["evento_id"].startswith("11111111")

def test_fila_pendente_impede_ativacao_e_camera_negada_oferece_galeria():
    r = _no_navegador(PREPARAR + r"""
        localStorage.setItem('ideal_control_pin_configurado','synthetic');
        localStorage.setItem('ideal_control_instalacao','cd'.repeat(32));
        navigator.mediaDevices.getUserMedia=async()=>{throw new Error('denied');};
        document.getElementById('btn-ler-qr-evento').click();
        document.querySelector('[data-evento-camera]').click();await tick();
        const camera=document.querySelector('[data-evento-aviso]').textContent;
        await qrEvento.ler('IDEAL-CONTROL-EVENTO:1:'+SECRET);
        await portariaDeposito.enfileirar({id_local:'pendente-sintetico',momento:new Date().toISOString(),resultado:'negado'});
        document.querySelector('[data-evento-carregar]').click();
        await until(()=>document.querySelector('[data-evento-aviso]').textContent.includes('pendentes'));
        return {camera,blocked:!requests.some(r=>r.url.endsWith('/ativar-qr-evento')),count:await portariaDeposito.contarFila()};
    """)
    assert "galeria" in r["camera"] and r["blocked"] and r["count"] == 1


def test_preparacao_retoma_apos_falha_e_so_ativa_apos_todos_ingressos():
    r = _no_navegador(PREPARAR + r"""
        localStorage.setItem('ideal_control_pin_configurado','synthetic');
        localStorage.setItem('ideal_control_instalacao','cd'.repeat(32));
        const baseFetch=window.fetch; let tentativas=0, assumidos=0, ativouAntes=false;
        window.fetch=async (url,opts)=>{
            if(String(url).endsWith('/preparar-qr-evento')) {
                tentativas++;
                if(tentativas===1) return new Response(JSON.stringify({detail:'Falha sintética. Tente novamente.'}),{status:503});
                return new Response(JSON.stringify({concluida:tentativas>=3,prontos:tentativas>=3?1500:100,total:1500}));
            }
            if(String(url).endsWith('/ativar-qr-evento') && tentativas<3) ativouAntes=true;
            return baseFetch(url,opts);
        };
        aparelhoAqui.assumir=async()=>{assumidos++;};
        document.getElementById('btn-ler-qr-evento').click();
        await qrEvento.ler('IDEAL-CONTROL-EVENTO:1:'+SECRET);
        const btn=document.querySelector('[data-evento-carregar]'); btn.click();
        await until(()=>!btn.disabled);
        const falha=document.querySelector('[data-evento-aviso]').textContent;
        const semAtivar=assumidos===0;
        btn.click(); await until(()=>assumidos===1);
        return {tentativas,semAtivar,falha,ativouAntes};
    """)
    assert r['tentativas'] == 3 and r['semAtivar'] and not r['ativouAntes']
    assert 'Falha sintética' in r['falha']

def test_pin_libera_edicao_somente_apos_senha_e_sair_exige_novamente():
    r = _no_navegador(PREPARAR + r"""
        localStorage.setItem('ideal_control_pin_configurado','synthetic');
        localStorage.setItem('ideal_control_instalacao','cd'.repeat(32));
        chaveiro.guardar({evento_id:E,por_qr:true,token:'ef'.repeat(32),aparelho_id:A});
        const action=pinInstalacao.pedir(E,'/eventos/'+E,{method:'PATCH',body:JSON.stringify({nome_evento:'Editado'})});
        await until(()=>document.querySelector('input[name=pin]'));
        const before=requests.length;
        const form=document.querySelector('input[name=pin]').closest('[data-pin-campos]');form.querySelector('[name=pin]').value='042815';form.querySelector('[data-pin-salvar]').click();
        await action;
        pinInstalacao.encerrar();
        const again=pinInstalacao.autorizar(E).catch(e=>e.message);
        await until(()=>document.querySelector('input[name=pin]'));
        document.querySelector('[data-cancelar]').click();
        return {before,editing:requests.filter(r=>r.url.endsWith('/editar-pin')).length,
            cancelled:await again,leaked:Object.values(localStorage).join('|').includes('042815')};
    """)
    assert r == {"before": 0, "editing": 1, "cancelled": "cancelado", "leaked": False}

def test_carga_qr_grava_tudo_e_nao_apaga_fila_pendente():
    r = _no_navegador(PREPARAR + r"""
        const carga={evento:{id:E},credenciais:[{id:'c1'}],entradas:{c1:'2026-09-22T12:00:00Z'},totais:{s1:1}};
        await portariaDeposito.gravarEventoPreparado(carga);
        const first=await portariaDeposito.lerCarga(),totais=await portariaDeposito.lerTotais();
        await portariaDeposito.enfileirar({id_local:'pendente-sintetico',momento:new Date().toISOString(),resultado:'negado'});
        let refused=false;try {await portariaDeposito.gravarEventoPreparado({evento:{id:A}});}catch(e){refused=true;}
        return {first:first.evento.id,totais,refused,preserved:(await portariaDeposito.lerCarga()).evento.id,count:await portariaDeposito.contarFila()};
    """)
    assert r["first"] == r["preserved"] and r["refused"] and r["count"] == 1 and r["totais"] == {"s1": 1}

def test_grafica_dois_qrs_evento_correto_e_senha_por_aparelho():
    r = _grafica(r"""
        PAINEL.cliente = CLIENTE_COM_PEDIDO.cliente;
        const calls=[];
        IdealControl._pedirParaTeste=async (c,o)=>{
            calls.push({c,o});
            if(c==='/pedidos')return {pedidos:[]};
            if(c==='/pedidos/18560')return PAINEL;
            if(c==='/clientes/14')return CLIENTE_COM_PEDIDO;
            if(c.endsWith('/qr'))return {conteudo:'IDEAL-CONTROL-EVENTO:1:'+'ab'.repeat(32)};
            if(c.endsWith('/senha-edicao'))return {pin:'042815',aparelho_id:'a1'};
            return {};
        };
        for(const name of ['qrcode-generator.min.js','qr-canvas.js','jsqr.min.js']){
            await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/'+name;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
        }
        await IdealControl.iniciar();await IdealControl.abrirPedido(18560);
        document.getElementById('ic-instalacao-abrir').click();
        document.querySelector('[data-qr-gerar]').click();
        for(let i=0;i<100&&document.querySelector('[data-qr-resultado]').hidden;i++)await new Promise(r=>setTimeout(r,20));
        const canvas=document.querySelector('[data-qr-resultado] canvas');
        const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
        const qr=jsQR(p.data,p.width,p.height);
        const generic=document.getElementById('ic-qr-link').textContent;
        document.getElementById('ic-instalacao-dialogo').close();
        const btn=[...document.querySelectorAll('.ic-aparelho button')].find(b=>b.textContent==='Consultar senha de edição');
        btn.click();for(let i=0;i<100&&btn.disabled;i++)await new Promise(r=>setTimeout(r,20));
        return {qr:qr&&qr.data,generic,queried:calls.filter(r=>r.c.endsWith('/qr')).map(r=>r.c),
            pin:btn.parentNode.textContent.includes('042815')};
    """)
    assert r["qr"] == "IDEAL-CONTROL-EVENTO:1:" + "ab" * 32
    assert r["generic"] == "https://imposition.ai-ideal.com.br/ic/"
    assert r["queried"] == ["/eventos/ev-1/qr"] and r["pin"]

def test_download_paginado_so_libera_leitura_depois_do_sincronismo():
    r = subprocess.run(["node", "tests/qr_evento_download_harness.cjs"], cwd=Path(__file__).resolve().parents[1],
                       capture_output=True, encoding="utf-8", timeout=40)
    assert r.returncode == 0, r.stdout + r.stderr


def test_evento_antecipado_sincroniza_ingressos_sem_trocar_qr():
    r = subprocess.run(["node", "tests/ideal_control_antecipado_harness.cjs"], cwd=Path(__file__).resolve().parents[1],
                       capture_output=True, encoding="utf-8", timeout=40)
    assert r.returncode == 0, r.stdout + r.stderr
