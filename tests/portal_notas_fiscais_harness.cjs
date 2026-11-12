const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const secao = {innerHTML:''}, destino = {innerHTML:''};
const ctx = vm.createContext({URL, console, registrarSecao(){},
    document:{getElementById:id=>id==='secao-faturamento'?secao:destino},
    escapeHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    cartaoDeDecisaoFaturamento:()=>'<div>Confirmar</div>', resumoFaturamento:()=>'<div>Dados</div>',
    cartaoDeFinalizacao:()=>'<div>Finalizar</div>', botaoDeAjuda:()=>''});
ctx.window=ctx;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/cliente-faturamento.js'),'utf8'), ctx);
(async () => {
    const nota = {tipo:'NF-e',numero:'1',url:'https://example.test/nota.pdf'};
    ctx.portalDados={notas_fiscais:[nota]};
    ctx.desenharSecaoFaturamento();
    assert.ok(secao.innerHTML.indexOf('Dados') < secao.innerHTML.indexOf('Abrir nota fiscal'));
    assert.match(secao.innerHTML,/target="_blank" rel="noopener noreferrer"/);
    assert.equal(ctx.cartaoDasNotasFiscais({}), '');
    for (const url of ['javascript:alert(1)','data:text/html,bad','http://example.test','https://a:b@example.test','https://','https://example.test/\nfoo'])
        assert.equal(ctx.cartaoDasNotasFiscais({notas_fiscais:[{...nota,url}]}), '');
    assert.ok(!ctx.cartaoDasNotasFiscais({notas_fiscais:[{...nota,numero:'<script>'}]}).includes('<script>'));
    let finish;
    ctx.supabaseClient={rpc:(name,args)=>{
        assert.equal(name,'link_cliente_notas_fiscais');
        assert.deepEqual(args.p_numero,'123'); assert.equal(args.p_token,'teste');
        return new Promise(r=>finish=r);
    }};
    const dados=ctx.portalDados;
    const carga=ctx.carregarNotasFiscaisDoPortal(dados,123,'teste');
    secao.innerHTML='Formulário em edição';
    finish({data:[nota],error:null}); await carga;
    assert.match(destino.innerHTML,/Abrir nota fiscal/);
    assert.equal(secao.innerHTML,'Formulário em edição');
    const antiga=ctx.carregarNotasFiscaisDoPortal(dados,123,'teste');
    ctx.portalDados={}; destino.innerHTML='outro pedido';
    finish({data:[nota],error:null}); await antiga;
    assert.equal(destino.innerHTML,'outro pedido');
    ctx.supabaseClient={rpc:async()=>{throw Error('offline');}};
    await ctx.carregarNotasFiscaisDoPortal(ctx.portalDados,123,'teste');
    assert.match(destino.innerHTML,/Não foi possível/);
    assert.ok(!destino.innerHTML.includes('href='));
    console.log('OK: posição, URL segura, ausência, erro, carga tardia e formulário preservado');
})().catch(e=>{console.error(e);process.exitCode=1;});
