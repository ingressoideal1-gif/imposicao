const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const fonte = fs.readFileSync('frontend/script.js', 'utf8');
function extrair(nome) {
    const inicio = fonte.indexOf('\nasync function ' + nome + '(');
    assert(inicio >= 0, nome);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
function ambiente(nuvem = true) {
    const avisos = [], pedidos = [];
    const c = { state: {modelosGlobais: {23063: [
        {id:1001859, amostra_num_id:'qr'}, {id:1001959, amostra_num_id:'qr'}
    ]}, numeracoes:[{id:'qr', elements:[{type:'QR_IDEAL'}]}]},
        console:{warn(){}}, SERVIDA_PELA_NUVEM:nuvem, API_BASE_URL:'', API_PAINEL:'https://nuvem.invalid/painel',
        toast:(mensagem,tipo) => avisos.push({mensagem,tipo}),
        contratos:[{pedido:23063,modelo:1001859,versao:2},{pedido:23063,modelo:1001959,versao:2}],
        falhar:false, aguardar:null,
        fetch:async (url,opts) => {
            assert.equal(opts.cache,'no-store');
            pedidos.push(url);
            if (c.aguardar) await c.aguardar;
            // Reproduz Cloudflare: /api local inexiste no site.
            if (c.falhar || (nuvem && url.startsWith('/api/'))) return {ok:false,status:404,json:async()=>({detail:'rota ausente'})};
            return {ok:true,json:async()=>c.contratos};
        }
    };
    c.window=c;
    vm.createContext(c);
    vm.runInContext(fs.readFileSync('frontend/qr-ideal-colunas.js','utf8'),c);
    vm.runInContext(['api','apiSemConfirmacao','conferirColunasQrIdealDosPedidos'].map(extrair).join('\n'),c);
    return {c,avisos,pedidos};
}
(async()=>{
    let checks=0; const ok=(v,m)=>{checks++;assert(v,m);};
    for(const nuvem of [true,false]){
        const a=ambiente(nuvem);
        await a.c.conferirColunasQrIdealDosPedidos();
        ok(a.avisos.length===0, 'QR12 reservado nao recebe colisao legada, nuvem='+nuvem);
        ok(a.pedidos.length===1 && a.pedidos[0]===(nuvem?'https://nuvem.invalid/painel':'')+'/api/qr-ideal/contratos?pedido=23063','consulta usa origem correta');
        a.c.contratos[0].versao=1;
        await a.c.conferirColunasQrIdealDosPedidos();
        ok(a.avisos.length===0,'um legado e um QR12 independente nao colidem');
        a.c.contratos[1].versao=1;
        await a.c.conferirColunasQrIdealDosPedidos();
        ok(a.avisos.length===1 && a.avisos[0].tipo==='error','colisao legada confirmada permanece erro');
        ok(/1001859 e 1001959/.test(a.avisos[0].mensagem),'erro identifica modelos');
        a.avisos.length=0; a.c.falhar=true;
        await a.c.conferirColunasQrIdealDosPedidos();
        ok(a.avisos.length===1 && a.avisos[0].tipo==='warning' && !/gerariam ingressos/.test(a.avisos[0].mensagem),'falha de consulta e inconclusiva, nao colisao confirmada');
        a.c.falhar=false;
        for(const dados of [[],{},[{pedido:23063,modelo:1001859,versao:2}],
            [{pedido:23063,modelo:1001859,versao:2},{pedido:23063,modelo:1001959,versao:9}],
            [{pedido:23063,modelo:1001859,versao:2},{pedido:23063,modelo:1001859,versao:2}],
            [{pedido:1,modelo:1001859,versao:2},{pedido:1,modelo:1001959,versao:2}]]){
            a.avisos.length=0; a.c.contratos=dados;
            await a.c.conferirColunasQrIdealDosPedidos();
            ok(a.avisos.length===1 && a.avisos[0].tipo==='warning','resposta incompleta/invalida nao libera conferencia');
        }
        a.avisos.length=0; a.c.state.numeracoes[0].elements=[{type:'QR'}]; const consultas=a.pedidos.length;
        await a.c.conferirColunasQrIdealDosPedidos();
        ok(a.avisos.length===0 && a.pedidos.length===consultas,'QR comum nao consulta contrato Ideal');
    }
    const a=ambiente(); let terminar;
    a.c.aguardar=new Promise(r=>{terminar=r;}); a.c.falhar=true;
    const antiga=a.c.conferirColunasQrIdealDosPedidos();
    a.c.state.modelosGlobais={};
    await a.c.conferirColunasQrIdealDosPedidos(); terminar(); await antiga;
    ok(a.avisos.length===0,'resultado atrasado nao reapresenta aviso de uma conferencia antiga');
    console.log(JSON.stringify({checks,servicosExternos:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
