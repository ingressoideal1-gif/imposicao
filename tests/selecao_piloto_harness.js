const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const src = fs.readFileSync('frontend/pedido.js','utf8').replace(/\r\n/g,'\n');
const nome = 'async function enviarParaPedido(';
const i = src.indexOf(nome), func = src.slice(i,src.indexOf('\n}',i)+2);
const script = fs.readFileSync('frontend/script.js','utf8').replace(/\r\n/g,'\n');
const normalizadorInicio = script.indexOf('function normalizarNumeracaoLida(');
const normalizador = script.slice(normalizadorInicio, script.indexOf('\n}',normalizadorInicio)+2);
function montar() {
    const item = {id:10,_modeloOnline:{id:10},arte_url:'https://test.invalid/a.pdf'};
    const c = {Promise,TextEncoder,Uint8Array,AbortSignal,structuredClone,crypto:webcrypto,state:{numeracoes:[]},
        mensagens:[], cargas:[], chamadas:[], falha:false, esperar:null,
        findOSInState:()=>({numero:99}), getOSItens:()=>[item], loadOSItens:async()=>true};
    c.window = c;
    c.toast=s=>c.mensagens.push(s);
    c.fetch=async(url,opts)=>{
        c.chamadas.push(url);
        if(url.endsWith('preparar-pedido-painel')){
            const body=JSON.parse(opts.body); if(c.esperar)await c.esperar;
            if(c.falha)return {ok:false};
            return {ok:true,json:async()=>({pedido:'99',revisao_pedido:c.revisaoPedido||'c'.repeat(64),sem_arte:[],pacotes:[{modelo:'10',digest:body.modelos[0].digest,revisao:'b'.repeat(64),origem:'local',atualizado:true,
                fontes:{frente:item.arte_url},recursos:{frente:'/api/pacotes-locais/recurso-painel/10/'+'b'.repeat(64)+'/frente'}}]})};
        }
        assert.ok(url.startsWith('/api/pacotes-locais/recurso-painel/'));
        return {ok:true,headers:{get:()=> 'local'}};
    };
    c.carregarModeloParaPedido=async(id,os,ctx)=>{
        await c.PilotoSelecao.lerArte(ctx.pacoteLocal,'frente',item.arte_url);
        if(ctx.aindaAtual())c.cargas.push(id);
    };
    vm.createContext(c);vm.runInContext(normalizador+'\n'+fs.readFileSync('frontend/selecao-piloto.js','utf8')+'\n'+func,c);
    return c;
}
(async()=>{
    const erroLocal=montar();
    erroLocal.fetch=async()=>({ok:false,status:409,headers:{get:()=> 'D-123456789abc'},json:async()=>({detail:'Pedido nao conferido'})});
    const contextoErro=erroLocal.PilotoSelecao.iniciarPedido('vibe_99');
    await assert.rejects(erroLocal.PilotoSelecao.carregarPedidoLocal('vibe_99',()=>true,contextoErro),/D-123456789abc/);

    const cheio=montar();
    cheio.fetch=async()=>({ok:false,status:422,headers:{get:()=> 'D-123456789abc'},
        json:async()=>({detail:{codigo:'catalogo_local_cheio',mensagem:'texto externo ignorado'}})});
    await assert.rejects(cheio.PilotoSelecao.carregarPedidoLocal('vibe_99',()=>true,
        cheio.PilotoSelecao.iniciarPedido('vibe_99')), /catálogo local está cheio.*D-123456789abc/);

    const local=montar(); const row={id:10,id_int:99};
    let catalogosAplicados=null;
    local.PilotoOffline={aplicarCatalogos:d=>{catalogosAplicados=d;}};
    local.getOSItens()[0]._modeloOnline=row;
    const digestLocal=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([row,[]])))).toString('hex');
    local.supabaseClient={from(){throw Error('Consulta de numeracao/modelo proibida');}};
    local.fetch=async(url,opts)=>{
        local.chamadas.push(url);
        assert.equal(url,'/api/pacotes-locais/abrir-pedido-painel');
        assert.deepEqual(JSON.parse(opts.body),{pedido:'99'});
        return {ok:true,json:async()=>({protocolo:2,pedido:'99',revisao_pedido:'c'.repeat(64),sem_arte:[],execucao_offline:true,
          catalogos:{formatos:[{id:'f',height_mm:480}],saidas:[{id:'s',name:'Cartaz'}],cores:[],modelos_imposicao:[]},
          snapshot:{modelos:[row],numeracoes:[],origens:[],produtos:[],bancos:[],vinculos:[],artes:[],mapas:[]},
          pacotes:[{modelo:'10',digest:digestLocal,revisao:'b'.repeat(64),origem:'local'}]})};
    };
    const abertura=local.PilotoSelecao.iniciarPedido('vibe_99');
    await local.PilotoSelecao.carregarPedidoLocal('vibe_99',()=>true,abertura);
    assert.equal(catalogosAplicados.formatos[0].height_mm,480);
    await local.PilotoSelecao.conferirPedido('vibe_99',()=>true,abertura);
    assert.equal(local.chamadas.length,1);
    assert(local.mensagens.some(m=>m.includes('última revisão local')), 'informa uso da copia offline');
    local.PilotoSelecao.validarTrabalho([{itemId:10,osId:'vibe_99'}]);
    assert.equal(local.PilotoSelecao.snapshotPedido('outro'),null);

    // Manifesto sem arquivo de frente e valido: gabarito/numero e revisao
    // continuam conferidos, inclusive depois de uma alteracao do modelo.
    const semBase=montar(), rawSemBase={id:10,id_int:99,amostra_num_id:'num',status_arte:'APROVADO'};
    const numSemBase={id:'num',elements:[{type:'TEXT',x_mm:10,y_mm:10}]};
    semBase.getOSItens()[0]._modeloOnline=rawSemBase;
    const canonSemBase=v=>Array.isArray(v)?v.map(canonSemBase):v&&typeof v==='object'
        ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonSemBase(v[k])])):v;
    const digestSemBase=Buffer.from(await webcrypto.subtle.digest('SHA-256',
        new TextEncoder().encode(JSON.stringify(canonSemBase([rawSemBase,[numSemBase]]))))).toString('hex');
    semBase.fetch=async()=>({ok:true,json:async()=>({protocolo:2,pedido:'99',revisao_pedido:'c'.repeat(64),sem_arte:[],
        snapshot:{modelos:[rawSemBase],numeracoes:[numSemBase],origens:[],produtos:[],bancos:[],vinculos:[],artes:[],mapas:[]},
        pacotes:[{modelo:'10',digest:digestSemBase,revisao:'b'.repeat(64),origem:'local',fontes:{},recursos:{},hashes:{}}]})});
    const contextoSemBase=semBase.PilotoSelecao.iniciarPedido('vibe_99');
    await semBase.PilotoSelecao.carregarPedidoLocal('vibe_99',()=>true,contextoSemBase);
    await semBase.PilotoSelecao.conferirPedido('vibe_99',()=>true,contextoSemBase);
    const alvoSemBase={itemId:10,osId:'vibe_99'};
    assert.equal((await semBase.PilotoSelecao.conferir(10,'vibe_99',()=>true)).modelo,'10');
    assert.equal(semBase.PilotoSelecao.referencias([alvoSemBase])[0].revisao,'b'.repeat(64));
    rawSemBase.quantidade=300;
    assert.throws(()=>semBase.PilotoSelecao.validarTrabalho([alvoSemBase]),/Reabra/);

    // Pedido misto: produto de estoque em sem_arte nao e um impresso ausente.
    for (const comprovado of [true,false]) {
        const misto=montar(), impresso={id:10,id_int:99,status_arte:'APROVADO'};
        const estoque={id:11,id_int:99,id_produto_proposta_origem:7};
        misto.getOSItens=()=>[{id:10,_modeloOnline:impresso},{id:11,_modeloOnline:estoque,_produto_prateleira:true}];
        const dig=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(
            [Object.fromEntries(Object.entries(impresso).sort(([a],[b])=>a.localeCompare(b))),[]])))).toString('hex');
        misto.fetch=async()=>({ok:true,json:async()=>({protocolo:2,pedido:'99',revisao_pedido:'c'.repeat(64),
            sem_arte:['11'],pacotes:[{modelo:'10',digest:dig,revisao:'b'.repeat(64),origem:'local'}],
            snapshot:{modelos:[impresso,estoque],numeracoes:[],origens:[{id:7,id_produto:8}],
                produtos:[{id_produto:8,is_estoque:comprovado}],bancos:[],vinculos:[],artes:[],mapas:[]}})});
        const contexto=misto.PilotoSelecao.iniciarPedido('vibe_99');
        await misto.PilotoSelecao.carregarPedidoLocal('vibe_99',()=>true,contexto);
        if(comprovado) {
            await misto.PilotoSelecao.conferirPedido('vibe_99',()=>true,contexto);
            misto.PilotoSelecao.validarTrabalho([{itemId:10,osId:'vibe_99'}]);
            assert.throws(()=>misto.PilotoSelecao.validarTrabalho([{itemId:11,osId:'vibe_99'}]));
        } else await assert.rejects(misto.PilotoSelecao.conferirPedido('vibe_99',()=>true,contexto),/incompleta/);
    }

    // Snapshot inclui reprovados, mas a preparacao nao pode libera-los para imprimir.
    for (const semArte of [[], ['10']]) for (const statusArte of ['REPROVADA_CLIENTE', 'EM ARTE', 'APROVADO']) {
        const consulta=montar(); const modelo={id:10,id_int:99,status_arte:statusArte,arte_url:'https://test.invalid/a.pdf'};
        consulta.getOSItens()[0]._modeloOnline=modelo;
        consulta.fetch=async()=>({ok:true,json:async()=>({protocolo:2,pedido:'99',revisao_pedido:'c'.repeat(64),
            sem_arte:semArte,pacotes:[],snapshot:{modelos:[modelo],numeracoes:[],origens:[],produtos:[],bancos:[],vinculos:[],artes:[],mapas:[]}})});
        const contexto=consulta.PilotoSelecao.iniciarPedido('vibe_99');
        await consulta.PilotoSelecao.carregarPedidoLocal('vibe_99',()=>true,contexto);
        if(statusArte==='APROVADO') {
            if (!semArte.length) await assert.rejects(consulta.PilotoSelecao.conferirPedido('vibe_99',()=>true,contexto),/incompleta/);
            else {
                await consulta.PilotoSelecao.conferirPedido('vibe_99',()=>true,contexto);
                await assert.rejects(consulta.PilotoSelecao.conferir(10,'vibe_99',()=>true,true),/Reabra/);
            }
            continue;
        }
        await consulta.PilotoSelecao.conferirPedido('vibe_99',()=>true,contexto);
        consulta.carregarModeloParaPedido=async(id,os,ctx)=>{
            assert.equal(ctx.pacoteLocal,null); consulta.cargas.push(id);
        };
        await consulta.enviarParaPedido(10,'vibe_99');
        assert.equal(consulta.cargas.length,1);
        let leitura=null;
        consulta.fetch=async(url)=>{leitura=url;return {ok:true};};
        assert.equal((await consulta.PilotoSelecao.lerUrlParaConsulta(modelo.arte_url,10,'vibe_99')).ok,true);
        assert.equal(leitura,modelo.arte_url);
        await assert.rejects(consulta.PilotoSelecao.lerUrlParaConsulta('https://test.invalid/outro.pdf',10,'vibe_99'),/nao pertence/);
        assert.match(consulta.state.pedidoSelecaoErro,/somente para consulta/);
        const alvo={itemId:10,osId:'vibe_99'};
        assert.throws(()=>consulta.PilotoSelecao.validarTrabalho([alvo]),/somente para consulta/);
        assert.throws(()=>consulta.PilotoSelecao.referencias([alvo]),/somente para consulta/);
        await assert.rejects(consulta.PilotoSelecao.conferir(10,'vibe_99',()=>true),/somente para consulta/);
        modelo.quantidade=99;
        await assert.rejects(consulta.PilotoSelecao.conferir(10,'vibe_99',()=>true,true),/Reabra/);
        consulta.PilotoSelecao.iniciarPedido('outro');
        assert.equal(consulta.PilotoSelecao.motivoConsulta(10,'vibe_99'),null);
    }

    for (const [status, detail, esperado] of [
        [413, {codigo:'limite_recurso', tamanho_bytes:300*1024*1024, limite_bytes:256*1024*1024, modelo:'10'}, /modelo 10.*300,00 MiB.*256,00 MiB/],
        [507, null, /espaço disponível/],
        [403, '<script>segredo<\/script>', /Acesso.*recusado/],
        [500, null, /serviço local falhou/]
    ]) {
        const erro=montar();
        erro.fetch=async()=>({ok:false,status,json:async()=>({detail})});
        await assert.rejects(erro.PilotoSelecao.conferirPedido('vibe_99',()=>true), esperado);
        assert.throws(()=>erro.PilotoSelecao.validarTrabalho([{itemId:10,osId:'vibe_99'}]));
    }
    // A linha bruta pertence ao digest; a forma normalizada pertence à tela
    // e à conferência final. Não apagar METADATA antes de conferir a origem.
    const met=montar();met.getOSItens()[0]._modeloOnline.amostra_num_id=7;
    const raw={id:7,print_mode:'front',elements:[{type:'METADATA',print_mode:'duplex'},{type:'TEXT',text:'Teste'}],csv_data:[]};
    const antes=JSON.stringify(raw);let digestRecebido;
    met.supabaseClient={from(){return{select(){return this;},in(){return this;},abortSignal(){return this;}};}};
    met.lerDadosLista=async()=>({data:[raw]});
    const fetchOriginal=met.fetch;
    met.fetch=async(u,o)=>{if(u.endsWith('preparar-pedido-painel'))digestRecebido=JSON.parse(o.body).modelos[0].digest;return fetchOriginal(u,o);};
    await met.PilotoSelecao.conferirPedido('vibe_99',()=>true);
    assert.equal(JSON.stringify(raw),antes);
    assert.equal(met.state.numeracoes[0].print_mode,'front','coluna explicita prevalece sobre METADATA antigo');
    assert.equal(met.normalizarNumeracaoLida({...structuredClone(raw),print_mode:null}).print_mode,'duplex','METADATA apenas quando a coluna esta ausente');
    assert.equal(met.state.numeracoes[0].elements.length,1);
    const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
    const esperado=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canon([met.getOSItens()[0]._modeloOnline,[raw]]))));
    assert.equal(digestRecebido,Buffer.from(esperado).toString('hex'));
    const copia=met.normalizarNumeracaoLida(structuredClone(raw));
    assert.equal(JSON.stringify(met.state.numeracoes[0]),JSON.stringify(copia));
    const bancos=montar();bancos.state._bancosPedidoDe='vibe_99';bancos.state._bancosConsultados={'vibe_99':true};
    await bancos.PilotoSelecao.conferirPedido('vibe_99',()=>true);
    assert.equal(bancos.state._bancosPedidoDe,null);assert.equal(bancos.state._bancosConsultados.vibe_99,undefined);
    bancos.state._bancosPedidoDe='vibe_99';bancos.state._bancosConsultados.vibe_99=true;
    await bancos.PilotoSelecao.conferirPedido('vibe_99',()=>true);
    assert.equal(bancos.state._bancosPedidoDe,'vibe_99');assert.equal(bancos.state._bancosConsultados.vibe_99,true);
    bancos.revisaoPedido='d'.repeat(64);await bancos.PilotoSelecao.conferirPedido('vibe_99',()=>true);
    assert.equal(bancos.state._bancosPedidoDe,null);assert.equal(bancos.state._bancosConsultados.vibe_99,undefined);
    const c=montar();let liberar;c.esperar=new Promise(r=>liberar=r);
    const p=c.PilotoSelecao.conferirPedido('vibe_99',()=>true);await new Promise(r=>setImmediate(r));
    await assert.rejects(c.enviarParaPedido(10,'vibe_99'));assert.equal(c.cargas.length,0);
    liberar();await p;await c.enviarParaPedido(10,'vibe_99');assert.equal(c.cargas.length,1);assert.equal(c.state.pedidoSelecaoCarregando,null);
    c.state.activeOSItem={itemId:10,osId:'vibe_99'};
    c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]);
    c.getOSItens()[0]._confirmacaoLocalRevisaoNecessaria=true;
    c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]);
    c.refazerLigado=()=>true;
    c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]);
    c.refazerLigado=()=>false;
    delete c.getOSItens()[0]._confirmacaoLocalRevisaoNecessaria;
    await c.PilotoSelecao.lerUrl('https://test.invalid/a.pdf');
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([{itemId:11,osId:'vibe_99'}]));
    c.getOSItens()[0]._modeloOnline.quantidade=3;
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]));
    delete c.getOSItens()[0]._modeloOnline.quantidade;
    assert.ok(c.chamadas.every(u=>u.startsWith('/api/pacotes-locais/')));
    await c.enviarParaPedido(10,'vibe_99');assert.equal(c.chamadas.filter(u=>u.endsWith('preparar-pedido-painel')).length,1);
    assert.equal(c.PilotoSelecao.referencias([c.state.activeOSItem])[0].modelo,'10');
    c.falha=true;await assert.rejects(c.PilotoSelecao.conferirPedido('vibe_99',()=>true));
    await assert.rejects(c.enviarParaPedido(10,'vibe_99'));assert.ok(c.state.pedidoSelecaoErro);assert.equal(c.cargas.length,2);
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]));
    const d=montar();let fim;d.esperar=new Promise(r=>fim=r);const antigo=d.PilotoSelecao.conferirPedido('vibe_99',()=>true);
    await new Promise(r=>setImmediate(r));d.PilotoSelecao.iniciarPedido('outro');fim();await antigo;
    await assert.rejects(d.enviarParaPedido(10,'vibe_99'));assert.equal(d.cargas.length,0);
    await assert.rejects(d.PilotoSelecao.lerArte({modelo:'10',revisao:'b'.repeat(64),fontes:{frente:'outra'},recursos:{}},'frente','https://test.invalid/a.pdf'));
    console.log('OK: conferência por pedido, troca sem rede, reabertura, bloqueio, revisão alterada e resposta abandonada.');
})().catch(e=>{console.error(e);process.exitCode=1;});
