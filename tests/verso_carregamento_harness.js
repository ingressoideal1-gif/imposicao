const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const raiz = path.join(__dirname, '..');
const helper = fs.readFileSync(path.join(raiz, 'frontend/arte-de-impressao.js'), 'utf8');
const pdf = () => new Response(new Blob(['%PDF-1.7\nVERSO SINTETICO'], {type:'application/pdf'}));
let verificacoes = 0;

function ambiente(arquivo, opcoes = {}) {
    const fonte = fs.readFileSync(path.join(raiz, 'frontend', arquivo), 'utf8');
    // O bloco contem ifs internos: começa na condição temVerso, não no append.
    const a = fonte.lastIndexOf('    if (temVerso(payload.print_mode))', fonte.indexOf("formData.append('file_verso'"));
    const b = fonte.indexOf('\n    }', fonte.indexOf("formData.append('file_verso'")) + 6;
    const chamadas = [], enviados = [], erros = [];
    const item = {id:'1000930', arte_url:'https://exemplo.invalid/frente.pdf',
        verso_arte_url:'https://exemplo.invalid/verso.pdf'};
    const estado = {activeOSItem:{osId:'21869',itemId:item.id},osItens:{'21869':[item]},
        pedArtVersoFile:new File(['ANTIGO'], 'antigo.pdf'),
        impArtVersoFile:new File(['OUTRO'], 'outro.pdf')};
    const contexto = {state:estado,payload:{print_mode:opcoes.modo || 'duplex',formato:{has_cover:true}},
        isPedTab:opcoes.pedido !== false,isMultiSelected:false,schema:'cut_stack',
        Blob,File,Response,AbortController,Uint8Array,TextDecoder,
        setTimeout:opcoes.setTimeout || setTimeout,clearTimeout,
        temVerso:m=>['duplex','duplex_unico'].includes(m),
        fetch:(...args)=>{chamadas.push(args);return (opcoes.fetch || pdf)(...args);},
        formData:{append:(...args)=>enviados.push(args)},
        desistir:msg=>erros.push(msg),toast:msg=>erros.push(msg)};
    contexto.window=contexto;
    vm.createContext(contexto);vm.runInContext(helper,contexto);
    return {estado,item,contexto,chamadas,enviados,erros,
        gerar:()=>vm.runInContext('(async()=>{'+fonte.slice(a,b)+'})()',contexto)};
}

async function testar(arquivo) {
    for (const modo of ['duplex','duplex_unico']) {
        for (const pedido of [true,false]) {
            let liberar;
            const a=ambiente(arquivo,{modo,pedido,fetch:()=>new Promise(r=>liberar=r)});
            const gerando=a.gerar();
            assert.equal(a.enviados.length,0);
            // Uma resposta atrasada da previa nao pode trocar o arquivo deste trabalho.
            a.estado.pedArtVersoFile=new File(['ERRADO'],'errado.pdf');
            liberar(pdf());await gerando;
            assert.equal(a.erros.length,0);assert.equal(a.enviados.length,1);
            assert.equal(a.enviados[0][0],'file_verso');
            assert.match(await a.enviados[0][1].text(),/VERSO SINTETICO/);
            verificacoes++;
        }
    }
    for (const mudar of [a=>{a.estado.activeOSItem.itemId='outro';a.estado.osItens['21869'].push({id:'outro'});},
        a=>{a.item.verso_arte_url='https://exemplo.invalid/trocado.pdf';},
        a=>{a.estado.activeOSItem=null;}]) {
        let liberar;const a=ambiente(arquivo,{fetch:()=>new Promise(r=>liberar=r)});
        const gerando=a.gerar();mudar(a);liberar(pdf());await gerando;
        assert.equal(a.enviados.length,0);assert.match(a.erros[0],/mudou/);verificacoes++;
    }
    for (const resposta of [()=>Promise.reject(new Error('offline')),
        ()=>new Response('erro',{status:503}),()=>new Response(new Blob([])),
        ()=>new Response('<html>erro</html>',{headers:{'Content-Type':'text/html'}}),
        ()=>new Response('invalido',{headers:{'Content-Type':'application/pdf'}})]) {
        const a=ambiente(arquivo,{fetch:resposta});await a.gerar();
        assert.equal(a.enviados.length,0);assert.match(a.erros[0],/arte do verso/);verificacoes++;
        a.contexto.fetch=pdf;await a.gerar();assert.equal(a.enviados.length,1);verificacoes++;
    }
    const timeout=ambiente(arquivo,{setTimeout:fn=>setTimeout(fn,0),
        fetch:(_url,{signal})=>new Promise((_r,rejeitar)=>signal.addEventListener('abort',()=>rejeitar(new Error('abort'))))});
    await timeout.gerar();assert.equal(timeout.enviados.length,0);assert.match(timeout.erros[0],/arte do verso/);verificacoes++;
    for (const verso of [null,'https://exemplo.invalid/amostras_renderizadas/v.jpg']) {
        const a=ambiente(arquivo);a.item.verso_arte_url=verso;await a.gerar();
        assert.equal(a.enviados.length,0);assert.equal(a.chamadas.length,0);verificacoes++;
    }
    const front=ambiente(arquivo,{modo:'front'});await front.gerar();
    assert.equal(front.enviados.length,0);assert.equal(front.chamadas.length,0);verificacoes++;
    const manual=ambiente(arquivo);manual.estado.activeOSItem=null;await manual.gerar();
    assert.equal(manual.chamadas.length,0);assert.equal(await manual.enviados[0][1].text(),'ANTIGO');verificacoes++;
    const ausente=ambiente(arquivo);ausente.estado.osItens['21869']=[];await ausente.gerar();
    assert.equal(ausente.enviados.length,0);assert.equal(ausente.erros.length,1);verificacoes++;
    const antigo=ambiente(arquivo);antigo.contexto.prepararVersoDoTrabalho=undefined;await antigo.gerar();
    assert.equal(antigo.enviados.length,0);assert.match(antigo.erros[0],/Atualize/);verificacoes++;
    const combinado=ambiente(arquivo);combinado.contexto.isMultiSelected=true;await combinado.gerar();
    assert.equal(combinado.chamadas.length,0);assert.equal(combinado.erros.length,0);verificacoes++;
}

(async()=>{for(const arquivo of ['pedido.js','script.js']) await testar(arquivo);
    console.log('OK: '+verificacoes+' cenarios de carregamento do verso, sem rede ou impressora.');
})().catch(e=>{console.error(e);process.exitCode=1;});
