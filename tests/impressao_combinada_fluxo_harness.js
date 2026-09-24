// Fluxo real com transporte, impressora e gravação de arquivos simulados.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {scenario, extract} = require('./impressao_combinada_harness.js');
const pedido = fs.readFileSync(path.join(__dirname, '../frontend/pedido.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
const section = name => {
    const start = pedido.indexOf('window.' + name + ' =');
    assert(start >= 0);
    return pedido.slice(start, pedido.indexOf('\n};', start) + 3);
};
function fixture(options={}) {
    const {sandbox:c, elements, items} = scenario('blocado','aproveitar',[4,4,4],{context:true,paginadoDuplex:options.paginadoDuplex});
    const el = value => ({value,style:{},classList:{add(){},remove(){}},checked:false});
    for (const [id,value] of Object.entries({
        'ped-formato':'f','ped-saida':'s','ped-numeracao':'n96','ped-start':'960','ped-end':'963',
        'ped-schema':'sequential','ped-btn-impose':'','ped-btn-impose-print':'',
        'loading-overlay':'','loading-sub':'','loading-progress-bar':'','loading-progress-text':'',
    })) elements[id]=el(value);
    const calls={requests:[],printed:[],confirmed:[],saved:[],notices:[]};
    Object.assign(c,{
        console:{log(){},warn(){},error(){}}, FormData, Blob, AbortController,
        setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
        impositionAbortController:null, supabaseClient:null,
        confirmarRetomadaImpressao:()=>true,
        confirmarIntegridadeDoTrabalho:async()=>{},
        crypto:require("node:crypto").webcrypto, TextDecoder, setTimeout, clearTimeout,
        toast:(...args)=>calls.notices.push(args),
        showDirectoryPicker:async()=>({getFileHandle:async name=>({createWritable:async()=>({
            write:async blob=>calls.saved.push({name,blob}),close:async()=>{},
        })})}),
        sendPrintJobDirect:async (jobs, options)=>{calls.printOptions=options;calls.printed.push(...jobs);return true;},
        confirmarImpressaoModelos:async targets=>calls.confirmed.push(JSON.parse(JSON.stringify(targets))),
        fetch:async (url,request)=>{
            if(url.endsWith('/api/version')) return {ok:true,json:async()=>({capabilities:options.oldAgent?[]:['multi_artes_pdf_duplex_unico']})};
            if(request?.method==='GET')return {ok:true};
            assert.equal(url,'http://localhost:8080/api/impose');
            calls.requests.push(JSON.parse(request.body.get('payload')));
            if(options.changeAfterSend){c.state.selectedOSItems=[];c.state.activeOSItem={itemId:'outro',osId:'outro'};}
            if(options.response) return options.response;
            return {ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>new Blob(['pdf-sintetico'])};
        },
    });
    vm.runInContext(extract(main,'nomeDosModelosCombinados'),c);
    vm.runInContext(extract(pedido,'faceDeImpressaoDoPedido'),c);
    const faceStart = pedido.indexOf('async function selecionarFacesDoPdfDoPedido(');
    vm.runInContext(pedido.slice(faceStart,pedido.indexOf('\n}',faceStart)+2),c);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/arte-de-impressao.js'), 'utf8'),c);
    c.confirmarIntegridadeDoTrabalho=async()=>{}; // Preparação real coberta pelo harness de integridade.
    const executarInicio=pedido.indexOf('async function executarPedImposition(');
    vm.runInContext(pedido.slice(executarInicio,pedido.indexOf('\n}',executarInicio)+2),c);
    vm.runInContext(section('runPedImposition'),c);
    return {c,elements,items,calls};
}
async function tests() {
    for(const mode of ['pdf','print']) {
        const f=fixture({changeAfterSend:true});
        await f.c.runPedImposition(mode);
        assert.equal(f.calls.requests.length,1,JSON.stringify(f.calls.notices));
        const payload=f.calls.requests[0];
        assert.equal(payload.schema,'multi_artes');
        assert.deepEqual(payload.multi_artes.map(a=>a.numeracao.start),[960,970,980]);
        if(mode==='print') {
            assert.equal(f.calls.printed.length,1);
            assert.deepEqual(f.calls.confirmed[0].map(a=>a.itemId),['96','97','98']);
        } else {
            assert.equal(f.calls.saved.length,1);
            assert.equal(f.calls.confirmed.length,0);
        }
        assert.equal(f.c.isImposing,false);
    }
    const repeat=fixture(); await repeat.c.runPedImposition('print',true);
    assert.equal(repeat.calls.printed.length,1);
    assert.equal(repeat.calls.confirmed.length,0,'refazer nao altera status, inclusive no retorno PDF simples');
    for(const change of [f=>f.items[1].modo_pdf=true,f=>f.items[1].bloco=100,
        f=>f.c.state.selectedOSItems=[{osId:'vibe_22247',itemId:'97'}],
        f=>f.c.state.pedidoSelecaoCarregando={}]) {
        const f=fixture();change(f);await f.c.runPedImposition('print');
        assert.equal(f.calls.requests.length,0);assert.equal(f.calls.printed.length,0);
        assert(f.calls.notices.length);
    }
    const change=fixture();
    change.c.idsDeNumeracaoDoTrabalho=()=>[];
    change.c.garantirCsvDoTrabalho=async()=>{change.c.state.selectedOSItems=[];};
    await change.c.runPedImposition('pdf');
    assert.equal(change.calls.requests.length,0,'selecao alterada durante carregamento interrompe geracao');

    // Reduzir a seleção a um modelo abre e aguarda justamente o restante.
    const f=fixture();f.c.state.selectedOSItems=f.c.state.selectedOSItems.slice(0,2);
    let resolve;const pending=new Promise(r=>resolve=r);const opened=[];
    f.c.enviarParaPedido=async(id,os,context)=>{
        opened.push(id);await pending;
        if(context.aindaAtual())f.c.state.activeOSItem={itemId:id,osId:os};
    };
    f.c.renderPedOSQueue=()=>{};f.c.atualizarBarraDeSoma=()=>{};
    vm.runInContext(section('togglePedItemSelection'),f.c);
    const loading=f.c.togglePedItemSelection('96','vibe_22247');
    assert.deepEqual(opened,['97']);assert(f.c.state.pedidoSelecaoCarregando);
    await f.c.runPedImposition('print');assert.equal(f.calls.requests.length,0);
    resolve();await loading;assert.equal(f.c.state.activeOSItem.itemId,'97');
    assert.equal(f.c.state.pedidoSelecaoCarregando,null);
    for(const mode of ['pdf','print']) {
        const pag=fixture({paginadoDuplex:true});
        await pag.c.runPedImposition(mode);
        assert.equal(pag.calls.requests.length,1,JSON.stringify(pag.calls.notices));
        assert.equal(pag.calls.requests[0].print_mode,'duplex_unico');
        assert(pag.calls.requests[0].multi_artes.every(a=>a.modo_pdf && a.qtd===4));
        assert.equal(pag.calls.printed.length,mode==='print'?1:0);
    }
    const old=fixture({paginadoDuplex:true,oldAgent:true});
    await old.c.runPedImposition('print');
    assert.equal(old.calls.requests.length,0);assert.equal(old.calls.printed.length,0);
    assert(old.calls.notices.some(n=>String(n[0]).includes('Atualize o NewProd')));
    assert.equal(old.c.isImposing,false);
    const missing=fixture({paginadoDuplex:true});
    missing.items[1].verso_arte_url=null;
    await missing.c.runPedImposition('print');
    assert.equal(missing.calls.requests.length,0);
    assert(missing.calls.notices.some(n=>String(n[0]).includes('arquivo de verso')));
    const downloading=fixture({paginadoDuplex:true});
    delete downloading.c.state.multiArtesPdfCache.mock97;
    let downloaded=false;
    downloading.c.fetch=async()=>{downloaded=true;return {ok:false};};
    await downloading.c.runPedImposition('print');
    assert(downloaded);assert.equal(downloading.calls.requests.length,0);
    assert(downloading.calls.notices.some(n=>String(n[0]).includes('carregar uma arte')));
    const changedWhileLoading=fixture({paginadoDuplex:true});
    delete changedWhileLoading.c.state.multiArtesPdfCache.mock97;
    changedWhileLoading.c.fetch=async()=>{
        changedWhileLoading.c.state.selectedOSItems=[];
        return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};
    };
    changedWhileLoading.c.pdfjsLib={getDocument:()=>({promise:Promise.resolve({numPages:4})})};
    changedWhileLoading.c.medirArteDaFolhaCombinada=async()=>{};
    await changedWhileLoading.c.runPedImposition('print');
    assert.equal(changedWhileLoading.calls.requests.length,0);
    assert(changedWhileLoading.calls.notices.some(n=>String(n[0]).includes('seleção mudou')));
    const PDFLib = require('pdf-lib');
    const doc = await PDFLib.PDFDocument.create();
    for (let i=0; i<4; i++) doc.addPage([200+i, 300]);
    const bytes = await doc.save();
    for (const kind of ['pdf', 'json', 'stream']) for (const mode of ['pdf', 'print']) for (const face of ['front', 'back']) {
        const file = {name:'sintetico.pdf',data:Buffer.from(bytes).toString('base64'), index:1,
            sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')};
        const text = new TextEncoder().encode('event: file\ndata: '+JSON.stringify(file)+'\n\nevent: done\ndata: {"files":1}\n\n');
        let read = false;
        const response = {ok:true, headers:{get:()=>kind==='pdf'?'application/pdf':kind==='json'?'application/json':'text/event-stream'},
            blob:async()=>new Blob([bytes]), json:async()=>({type:'multi_file',files:[file]}),
            body:{getReader:()=>({cancel:async()=>{},read:async()=>read?{done:true}:(read=true,{done:false,value:text})})}};
        const x=fixture({paginadoDuplex:true,response});
        x.c.PDFLib=PDFLib; x.c.TextDecoder=TextDecoder; x.c.atob=atob;
        x.c.state.printMode='duplex_unico';
        x.elements['ped-print-only-'+face]={checked:true};
        await x.c.runPedImposition(mode);
        const delivered=mode==='print'?x.calls.printed:x.calls.saved;
        assert.equal(delivered.length,1,JSON.stringify(x.calls.notices));
        const result=await PDFLib.PDFDocument.load(await delivered[0].blob.arrayBuffer());
        assert.deepEqual(result.getPages().map(p=>p.getWidth()),face==='front'?[200,202]:[201,203]);
        if(mode==='print') assert.equal(x.calls.printOptions.apenasUmaFace,true);
    }
    console.log('OK: PDF/impressao, alvo congelado, refazer, bloqueios e troca assincrona de selecao');
}
tests().catch(e=>{console.error(e);process.exitCode=1;});
