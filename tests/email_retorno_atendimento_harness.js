// Sem rede: exercita a persistência e a retomada após o aceite do e-mail.
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extrair(nome) {
    const inicio = source.indexOf('async function ' + nome + '(');
    assert.ok(inicio >= 0, nome);
    return source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
function ambiente(id = 'vibe_11') {
    const writes = [], envios = [], popups = [], avisos = [];
    const state = {ordens:[{id,numero:11,status:'Em Arte'}],osItens:{[id]:[]},
        todasArtes:[{id:'arte-11',id_int:11,status:'Em Arte',entrega_dados:'APROVADO'}],
        linksClienteData:{[id]:{status_arte:'Em Arte',cliente_abriu_em:'anterior'}},amostrasOSAtivo:id};
    const ctx = vm.createContext({state,window:{},writes,envios,popups,avisos,
        semConfirmacao:false,recusarEmail:false,semLink:false,fechamentos:0,
        pedidoCancelado:()=>false,pedidoSaiuDaArte:os=>os.status==='APROVADO',
        modeloEmCorrecaoDeArte:()=>false,modeloEstaAprovado:()=>false,
        garantirLinhaDePedidoArte:async()=>true,gravarStatusOverride:()=>{},
        clearAmostrasOS:()=>{ctx.fechamentos++;state.amostrasOSAtivo=null;},showView:()=>{},
        toast:msg=>avisos.push(msg),mostrarSucessoEnvioEmail:(to,origem,callback)=>popups.push({callback}),
        requisitarEmail:async(acao,dados)=>{envios.push(dados);if(ctx.recusarEmail)throw Error('SMTP recusou');},
        supabaseClient:{from:tabela=>{
            let payload;const filtros={};
            const q={update:p=>{payload=p;return q;},select:()=>q,
                eq:(k,v)=>{filtros[k]=v;return q;},in:()=>q,
                then:resolve=>{
                    if(!payload)return resolve({data:ctx.semLink?[]:[{id:'link-11'}]});
                    writes.push({tabela,payload,filtros});
                    const row={id:tabela==='pedidos_artes'?'arte-11':tabela==='pedidos_links_cliente'?'link-11':id,...payload};
                    resolve({data:ctx.semConfirmacao?[]:[row]});
                }};return q;
        }}
    });
    vm.runInContext('let emailUltimoEnvioAceito = null;\n'+[
        'atualizarPedidoArteConfirmado','concluirEnvioLinkParaAtendimento','enviarMensagemEmailCliente'
    ].map(extrair).join('\n'),ctx);
    return ctx;
}
(async()=>{
    for(const modo of ['link','artes_corpo']) {
        const c=ambiente();
        await c.enviarMensagemEmailCliente({os_id:'vibe_11',modo,to:'cliente@example.com'});
        assert.equal(c.state.ordens[0].status,'Enviar Arte');
        assert.equal(c.state.todasArtes[0].status,'Enviar Arte');
        assert.equal(c.state.todasArtes[0].entrega_dados,'APROVADO');
        assert.equal(c.state.linksClienteData.vibe_11.cliente_abriu_em,null);
        assert.equal(c.fechamentos,1);
        assert.equal(c.writes.length,2);
    }
    const falha=ambiente();falha.recusarEmail=true;
    await assert.rejects(()=>falha.enviarMensagemEmailCliente({os_id:'vibe_11'}),/SMTP/);
    assert.equal(falha.writes.length,0);
    const retry=ambiente();retry.semConfirmacao=true;
    await retry.enviarMensagemEmailCliente({os_id:'vibe_11'});
    assert.equal(retry.state.ordens[0].status,'Em Arte');
    assert.equal(retry.fechamentos,0);
    assert.match(retry.avisos[0],/já foi enviado/);
    retry.semConfirmacao=false;
    await retry.popups[0].callback();
    assert.equal(retry.envios.length,1);
    assert.equal(retry.state.ordens[0].status,'Enviar Arte');
    const outro=ambiente();outro.state.amostrasOSAtivo='vibe_99';
    await outro.enviarMensagemEmailCliente({os_id:'vibe_11'});
    assert.equal(outro.state.amostrasOSAtivo,'vibe_99');
    const local=ambiente('os-local');local.semLink=true;
    await local.enviarMensagemEmailCliente({os_id:'os-local',modo:'artes_corpo'});
    assert.equal(local.writes.at(-1).tabela,'producao_ordens_servico');
    assert.equal(local.writes.at(-1).filtros.id,'os-local');
    const aprovado=ambiente();aprovado.state.ordens[0].status='APROVADO';
    await aprovado.enviarMensagemEmailCliente({os_id:'vibe_11'});
    assert.equal(aprovado.writes.length,0);
    console.log('OK: ambos os modos retornam para Enviar Arte; falha, retry sem reenvio, OS local e troca de pedido');
})().catch(e=>{console.error(e);process.exitCode=1;});
