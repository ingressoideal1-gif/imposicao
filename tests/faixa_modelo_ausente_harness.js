const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {fixture} = require('./impressao_combinada_fluxo_harness.js');
const main = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
const pedido = fs.readFileSync(path.join(__dirname, '../frontend/pedido.js'), 'utf8');
function single(qtd=5) {
    const f=fixture();
    Object.assign(f.items[0],{qtd,quantidade:qtd,num_inicial:1,num_final:qtd,numeracao_inicio:1,numeracao_fim:qtd});
    f.c.state.selectedOSItems=[f.c.state.selectedOSItems[0]];
    f.elements['ped-start'].value='1'; f.elements['ped-end'].value='4';
    f.c.state.pedArtFile = new Blob(['arte sintetica']);
    f.c.state.pedArtFile.name='arte.pdf';
    f.c.itemAtivoDoPedido=()=>f.items[0];
    return f;
}
async function tests() {
    let payloadConfirmado;
    const f=single(), item=f.items[0];
    item.num_inicial=item.num_final=item.numeracao_inicio=item.numeracao_fim=null;
    const before=JSON.stringify(item);
    for (const [source,prefix,marker] of [[pedido,'ped','// --- PREENCHER FAIXA DE NUMERAÇÃO ('],[main,'imp','// --- PREENCHER FAIXA DE NUMERAÇÃO ---']]) {
        f.elements[prefix+'-start']={value:'1'};f.elements[prefix+'-end']={value:'4'};
        const a=source.indexOf(marker), b=source.indexOf('agendar(() => {',a), e=source.indexOf('}, 400);',b);
        assert(a>=0 && b>a && e>b);
        f.c.item=item;f.c.agendar=fn=>fn();
        vm.runInContext(source.slice(b,e+8),f.c);
        assert.equal(Number(f.elements[prefix+'-start'].value),1);
        assert.equal(Number(f.elements[prefix+'-end'].value),5);
    }
    assert.equal(JSON.stringify(item),before,'a faixa efetiva não modifica o cadastro');
    assert.equal(f.c.problemaNosCamposDosModelos(),null);
    // Cada campo aplicável bloqueia ambos os botões, mesmo com os inputs antigos preenchidos.
    const cases=[
        [x=>x.items[0].num_inicial='invalido','Numeração inicial'],
        [x=>x.items[0].num_final=false,'Numeração final'],
        [x=>x.items[0].qtd=null,'Quantidade'],
        [x=>x.items[0].qtd=0,'Quantidade'],
        [x=>x.items[0].qtd='5x','Quantidade'],
        [x=>x.items[0].bloco=null,'Bloco'],
        [x=>x.items[0].amostra_cor_id=null,'Cor'],
        [x=>x.items[0].numeracao_id=null,'Numeração'],
        [x=>x.items[0].formato_id=null,'Formato'],
        [x=>{x.items[0].saida_id=null;x.c.state.formatos[0].default_saida_id=null;},'Saída'],
        [x=>{x.items[0].modo_impressao=null;x.c.state.formatos[0].default_schema=null;},'Modo de impressão'],
        [x=>x.items[0].num_final=4,'incompatível'],
    ];
    for(const mode of ['pdf','print']) {
        for(const [change,label] of cases) {
            const bad=single();change(bad);await bad.c.runPedImposition(mode);
            assert.equal(bad.calls.requests.length,0,label);
            assert.equal(bad.calls.printed.length,0);assert.equal(bad.calls.saved.length,0);
            assert(bad.calls.notices.some(x=>String(x[0]).includes(label)),label+JSON.stringify(bad.calls.notices));
        }
        const x=single();await x.c.runPedImposition(mode);
        assert.equal(x.calls.requests.length,1,JSON.stringify(x.calls.notices));
        const payload=x.calls.requests[0];
        payloadConfirmado=payload;
        assert.equal(payload.seq_start,1);assert.equal(payload.seq_end,5);
        assert.equal(x.calls.printed.length,mode==='print'?1:0);
        assert.equal(x.calls.saved.length,mode==='pdf'?1:0);
        for(const vazio of [null,undefined,'','  ']) {
            const empty=single(87);
            Object.assign(empty.items[0],{num_inicial:vazio,num_final:vazio,numeracao_inicio:vazio,numeracao_fim:vazio});
            const cadastro=JSON.stringify(empty.items[0]);
            await empty.c.runPedImposition(mode);
            assert.equal(empty.calls.requests.length,1,JSON.stringify(empty.calls.notices));
            assert.equal(empty.calls.requests[0].seq_start,1);
            assert.equal(empty.calls.requests[0].seq_end,87);
            assert.equal(JSON.stringify(empty.items[0]),cadastro);
        }
        const ticket=single(5);
        Object.assign(ticket.items[0],{num_inicial:null,num_final:null});
        Object.assign(ticket.c.state.numeracoes[0],{tipo:'TICKET',ticket_qtd:3});
        await ticket.c.runPedImposition(mode);
        assert.equal(ticket.calls.requests.length,1,JSON.stringify(ticket.calls.notices));
        assert.equal(ticket.calls.requests[0].seq_start,1);
        assert.equal(ticket.calls.requests[0].seq_end,15);
        const multi=fixture();multi.items[1].num_inicial=null;
        multi.items[1].num_final=null;
        await multi.c.runPedImposition(mode);
        assert.equal(multi.calls.requests.length,1,JSON.stringify(multi.calls.notices));
        assert.equal(multi.calls.requests[0].multi_artes[1].numeracao.start,1);
        assert.equal(multi.calls.requests[0].multi_artes[1].qtd,4);
    }
    const valid=single(), model=valid.items[0], num=valid.c.state.numeracoes[0];
    for(const tipo of [null,undefined,'','INDEFINIDO']) {
        const legado=single();legado.items[0].verso_tipo=tipo;
        legado.c.state.numeracoes[0].print_mode=null;
        delete legado.items[0].frente_verso;
        assert.equal(legado.c.camposPendentesDoModelo(legado.items[0]).length,0,
            'tipo ausente ou desconhecido não é campo obrigatório: assumir só frente');
    }
    model.num_inicial=0;model.num_final=4;
    assert.equal(valid.c.camposPendentesDoModelo(model).length,0,'zero é um início válido');
    num.tipo='TICKET';num.ticket_qtd=3;model.num_final=14;
    assert.equal(valid.c.camposPendentesDoModelo(model).length,0,'5 células físicas com 3 vias');
    num.tipo='SEQUENCIAL';model.num_inicial=21;model.num_final=null;
    assert.equal(valid.c.faixaEfetivaDoModelo(model).fim,25,'fim ausente preserva início preenchido');
    model.num_final=25;
    assert.equal(valid.c.faixaEfetivaDoModelo(model).inicio,21);
    assert.equal(valid.c.faixaEfetivaDoModelo(model).fim,25);
    num.tipo='SEQUENCIAL';model.num_inicial=model.num_final=null;model.modo_pdf=true;
    assert.equal(valid.c.camposPendentesDoModelo(model).length,0,'PDF paginado não exige faixa');
    model.modo_pdf=false;num.csv_data=[{},{}];
    assert.equal(valid.c.camposPendentesDoModelo(model).length,0,'banco não exige faixa');
    num.csv_data=null;num.tipo='CAMAROTE';
    assert(valid.c.camposPendentesDoModelo(model).includes('Início do local (C_INI)'));
    Object.assign(model,{q_cam:1,l_cam:5,c_ini:1,bloco:null});
    assert.equal(valid.c.camposPendentesDoModelo(model).length,0,'camarote usa seus campos próprios');
    // Executar a função inteira da outra tela, com o transporte simulado.
    const begin=main.indexOf('window.runImposition = async function');
    const end=main.indexOf('\n};',begin);
    for (const mode of ['pdf','print']) {
        const legacy=single();legacy.items[0].num_inicial='invalido';
        Object.assign(legacy.c, {
            garantirCsvDoTrabalho:async()=>{},idsDeNumeracaoDoTrabalho:()=>[],
            garantirBancosDoTrabalho:async()=>{},osIdsDoTrabalho:()=>[],
            modelosComBancoNaoConferido:()=>[],modelosSemBancoDoTrabalho:()=>[],
            modelosComElementoSemColuna:()=>[],modelosEmCorrecaoDeArte:()=>[],
        });
        vm.runInContext(main.slice(begin,end+3),legacy.c);
        await legacy.c.runImposition(mode);
        assert.equal(legacy.calls.requests.length,0);
        assert(legacy.calls.notices.some(x=>String(x[0]).includes('Numeração inicial')),JSON.stringify(legacy.calls.notices));
    }
    if (process.argv.includes('--payload')) return console.log(JSON.stringify(payloadConfirmado));
    console.log('OK: faixa vazia 1-quantidade, sem gravação, inválidos bloqueados, seleção combinada, zero, TICKET, PDF paginado, CSV e camarote');
}
tests().catch(e=>{console.error(e);process.exitCode=1;});
