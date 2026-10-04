const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto').webcrypto;
const ctx = {crypto, Blob, FormData, TextEncoder, structuredClone};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('frontend/pacote-entrada.js', 'utf8'), ctx);
async function montar(multi=false) {
    const blob = new Blob(['%PDF-sintetico']);
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');
    const fd = new FormData();
    const ids = multi ? ['1','2'] : ['1'];
    const arquivos = multi ? {ma_file_0:{sha256:hash,size:blob.size},ma_verso_1:{sha256:hash,size:blob.size}} : {file:{sha256:hash,size:blob.size}};
    for(const campo of Object.keys(arquivos)) fd.set(campo,blob);
    fd.set('payload',JSON.stringify({print_mode:'duplex',integridade:{version:1,job_id:'a',modelos:ids,arquivos}}));
    return {fd, contexto:{modelos:ids.map(id=>({id,status_arte:'APROVADA'})),numeracoes:[],cadastros:[],bancos:[]}};
}
(async()=>{
    const agenda = ctx.PacoteEntrada.agendamento([{id:'1',id_int:10,id_produto:5},
        {id:'2',id_int:11,id_produto:6}], {
        produtosGlobais:[{id_produto:5,setor_pcp:'Laser'},{id_produto:6,setor_pcp:'Offset'}],
        ordens:[{numero:10,prazo_entrega:'2026-09-28T08:00:00-03:00'},
            {numero:11,prazo:'2026-09-27T08:00:00-03:00'}]});
    assert.equal(JSON.stringify(agenda.setores), JSON.stringify(['Laser','Offset']));
    assert.equal(agenda.prazo,'2026-09-27T11:00:00.000Z');
    assert.equal(ctx.PacoteEntrada.agendamento([{id:'3',id_int:12}],{}).prazo,null);
    const a=await montar();
    a.contexto.agendamento=agenda;
    const r=await ctx.PacoteEntrada.criar(a.fd,a.contexto,'teste');
    assert.equal(r.manifesto.modelo,'1');
    assert.equal(r.manifesto.arquivos.verso,null);
    assert.equal(r.manifesto.configuracao.preparacao_completa,false);
    assert.equal(r.manifesto.configuracao.agendamento.prazo,agenda.prazo);
    assert.equal(r.manifesto.revisao.length,64);
    let payload=JSON.parse(a.fd.get('payload')); payload.integridade.job_id='outra-tentativa'; a.fd.set('payload',JSON.stringify(payload));
    assert.equal((await ctx.PacoteEntrada.criar(a.fd,a.contexto,'teste')).manifesto.revisao,r.manifesto.revisao);
    a.contexto.modelos[0].status_arte='REPROVADA_CLIENTE';
    await assert.rejects(ctx.PacoteEntrada.criar(a.fd,a.contexto,'teste'),/aprovados/);
    const b=await montar(); b.fd.set('file',new Blob(['outro arquivo']));
    await assert.rejects(ctx.PacoteEntrada.criar(b.fd,b.contexto,'teste'),/mudou/);
    const c=await montar(); c.fd.set('nao_conferido',new Blob(['x']));
    await assert.rejects(ctx.PacoteEntrada.criar(c.fd,c.contexto,'teste'),/não coberto/);
    const duplicado=await montar(); duplicado.fd.append('file',new Blob(['arquivo divergente']));
    await assert.rejects(ctx.PacoteEntrada.criar(duplicado.fd,duplicado.contexto,'teste'),/duplicados/);
    const d=await montar(true); const combinado=await ctx.PacoteEntrada.criar(d.fd,d.contexto,'teste');
    assert.equal(combinado.manifesto.modelo,'combinacao:1,2');
    assert.ok(combinado.manifesto.arquivos.ma_file_0);
    assert.ok(combinado.manifesto.arquivos.ma_verso_1);
    assert.equal(combinado.manifesto.arquivos.frente,null);
    assert.equal(JSON.parse(d.fd.get('payload')).integridade.job_id,'a','formulario original preservado');
    console.log('OK: captura aprovada, hash conferido, identidade estável, arquivos excedentes e Multi-Artes');
})().catch(e=>{console.error(e);process.exitCode=1});
