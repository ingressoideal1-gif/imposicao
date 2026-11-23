const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
require('../frontend/banco-do-modelo.js');
require('../frontend/numero-da-pagina.js');
function extract(src,name) {
    const start=src.indexOf('function '+name+'(');
    assert(start>=0,name);
    return src.slice(start,src.indexOf('\n}',start)+2);
}
let checks=0;
for(const file of ['script.js','cliente.js']) {
    const src=fs.readFileSync(path.join(__dirname,'../frontend',file),'utf8');
    const state={formatos:[{id:'fmt',width_mm:100,height_mm:50}]};
    const values={text:[],qr:[],barcode:[]};
    const fundos = [];
    let linhas = [{Codigo:'BANCO1'}, {Codigo:'BANCO2'}];
    const window={
        BancoDoModelo: global.BancoDoModelo,
        NumeroDaPagina: global.NumeroDaPagina,
        formatarTextoDoBanco: (_el, valor) => String(valor ?? ''),
        desenharTextoAjustado(_ctx,_el,label){values.text.push(label)},
        renderBarcodeOnCtx(_ctx,label,_x,_y,_w,_h,_cor,_formato,fundo){
            values.barcode.push(label);
            fundos.push(fundo);
        }
    };
    const draw=new Function('state','window','buildCanvasFont','renderQRCodeOnCtx','linhasDaAmostra',
        ['elementoMesclaComArte','elementosNaOrdemDeComposicao','drawNumeracaoElementsOverCanvas'].map(n=>extract(src,n)).join('\n')+'\nreturn drawNumeracaoElementsOverCanvas;')(
        state,window,()=>'',(_ctx,label)=>values.qr.push(label),()=>linhas);
    const ctx={save(){},restore(){},translate(){},rotate(){}};
    for(const tipo of ['TICKET','SEQUENCIAL']) for(const face of ['front','back']) for(const page of [1,2]) for(const pos of [1,2,3]) {
        const fundo = [undefined, 'white', 'transparent'][pos-1];
        const num={formato_id:'fmt',tipo,ticket_qtd:3,elements:['TEXT','QR','BARCODE'].map(type=>({type,ticket_pos:pos,x_mm:10,y_mm:10,font_size:10,pad:0,face:'both',barcode_background:fundo}))};
        draw(ctx,num,{numeracao_inicio:10},page,1000,500,face);
        const expected=String(tipo==='TICKET'?10+(page-1)*3+pos-1:10+page-1);
        for(const key of Object.keys(values)) assert.deepEqual(values[key].splice(0),[expected],file+':'+key);
        assert.deepEqual(fundos.splice(0), [fundo], file+': fundo');
        checks++;
    }
    for(const source of ['fixed','database']) {
        const num={formato_id:'fmt',tipo:'TICKET',ticket_qtd:3,elements:['QR','BARCODE'].map(type=>({type,ticket_pos:3,x_mm:10,y_mm:10,fixed:source==='fixed',fixed_value:'FIXO',source,csv_column:'Codigo'}))};
        draw(ctx,num,{numeracao_inicio:10},2,1000,500,'front');
        assert.deepEqual(values.qr.splice(0),[source==='fixed'?'FIXO':'BANCO2']);
        assert.deepEqual(values.barcode.splice(0),[source==='fixed'?'FIXO':'BANCO2']);checks++;
        assert.deepEqual(fundos.splice(0), [undefined], file+': fundo padrão');
    }

    const colunas = Array.from({ length: 5 }, (_, i) => `Ticket ${i + 1} · Link`);
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.invalid/ticket/${200003 + i}`);
    linhas = [urls.slice(0, 5), urls.slice(5)].map(grupo =>
        Object.fromEntries(grupo.map((url, via) => [colunas[via], url])));
    const elementos = colunas.flatMap((_, via) => ['QR', 'TEXT'].map(type => ({
        id: `${type}-${via}`, type, source: 'database', face: 'back', x_mm: via * 10,
        y_mm: 10, database_text: type === 'TEXT', exemplo: 'EXEMPLO'
    })));
    const banco = { csv_headers: colunas, csv_data: linhas };
    const mapa = Object.fromEntries(elementos.map((el, i) => ['el:' + el.id, colunas[Math.floor(i / 2)]]));
    const peca = { tipo: 'TICKET', ticket_qtd: 5, formato_id: 'fmt', elements: elementos };
    const modelo = { quantidade: 2, numeracao_inicio: 200003 };
    const resolvida = window.BancoDoModelo.numeracaoResolvida(peca, banco, mapa);
    const inicioDoCard = src.indexOf('const desenharElementoDaFace = el => {');
    assert(inicioDoCard >= 0, file + ': função de desenho do card');
    const fimDoCard = src.indexOf('\n        };', inicioDoCard) + '\n        };'.length;
    const desenharCard = new Function('window', 'num', 'item', 'face', 'numCtx', 'S', 'buildCanvasFont',
        'renderQRCodeOnCtx', 'linhas', '_linhaCsv', '_niAmostra', '_pagAmostra', '_ticketQtdAmostra',
        src.slice(inicioDoCard, fimDoCard) + '\nnum.elements.forEach(desenharElementoDaFace);');
    const card = (num, pagina) => desenharCard(window, num, modelo, 'back', ctx, 1, () => '',
        (_ctx, label) => values.qr.push(label), linhas, linhas[pagina - 1],
        modelo.numeracao_inicio, pagina - 1, num.ticket_qtd);

    const ticket = { tipo: 'TICKET', ticket_qtd: 2, elements: [2, 1].flatMap(ticket_pos =>
        ['TEXT', 'QR', 'BARCODE'].map(type => ({ type, ticket_pos, pad: 4, x_mm: 10, y_mm: 10 }))) };
    const anterior = modelo.numeracao_inicio;
    linhas = [];
    for (const [inicio, pagina, esperado] of [[1, 1, ['0002', '0001']], [1, 2, ['0004', '0003']],
        [0, 1, ['0001', '0000']]]) {
        modelo.numeracao_inicio = inicio;
        card(ticket, pagina);
        for (const tipo of Object.keys(values)) assert.deepEqual(values[tipo].splice(0), esperado, file + ': ' + tipo);
        fundos.length = 0;
        checks++;
    }
    modelo.numeracao_inicio = anterior;
    linhas = banco.csv_data;
    for (const pagina of [1, 2]) {
        const grupo = urls.slice((pagina - 1) * 5, pagina * 5);
        for (const renderizar of [() => draw(ctx, resolvida, modelo, pagina, 1000, 500, 'back'),
            () => card(resolvida, pagina)]) {
            renderizar();
            assert.deepEqual(values.qr.splice(0), grupo, file + ': QR por via');
            assert.deepEqual(values.text.splice(0), grupo, file + ': texto por via');
            checks++;
        }
    }

    const csvPorVia = { csv_headers: ['Link', 'Observação'], csv_data: [
        ...urls.map(Link => ({ Link, Observação: '' })),
        { Link: 'https://example.invalid/ticket/200013', Observação: 'Fora da faixa' },
    ] };
    const camposPorVia = elementos.map((el, i) => ({ ...el, csv_column: 'Link',
        ticket_pos: el.type === 'QR' && i > 1 ? Math.floor(i / 2) + 1 : null }));
    const porVia = { ...peca, elements: camposPorVia };
    const convertida = window.BancoDoModelo.numeracaoResolvida(porVia, csvPorVia, null, modelo);
    assert.deepEqual(convertida.banco_ticket_por_via, { linhas: 10, celulas: 2, excedentes: 1 });
    assert.equal(csvPorVia.csv_data.length, 11);
    linhas = convertida.csv_data;
    for (const pagina of [1, 2]) {
        const grupo = urls.slice((pagina - 1) * 5, pagina * 5);
        for (const renderizar of [() => draw(ctx, convertida, modelo, pagina, 1000, 500, 'back'),
            () => card(convertida, pagina)]) {
            renderizar();
            assert.deepEqual(values.qr.splice(0), grupo, file + ': QR por linha do anexo');
            assert.deepEqual(values.text.splice(0), grupo, file + ': texto por linha do anexo');
            checks++;
        }
    }
    const posicaoEditada = { ...porVia, elements: camposPorVia.map(el =>
        el.id === 'TEXT-0' ? { ...el, ticket_pos: 2 } : el.id === 'TEXT-1' ? { ...el, ticket_pos: 1 } : el) };
    const editada = window.BancoDoModelo.numeracaoResolvida(posicaoEditada, csvPorVia, null, modelo);
    card(editada, 1);
    assert.deepEqual(values.qr.splice(0), urls.slice(0, 5));
    assert.deepEqual(values.text.splice(0), [urls[1], urls[0], ...urls.slice(2, 5)]);
    const wide = window.BancoDoModelo.numeracaoResolvida(posicaoEditada, banco, mapa, modelo);
    assert.equal(wide.elements.find(el => el.id === 'TEXT-0').csv_column, 'Ticket 2 · Link');
    const excessoSemFaixa = { ...csvPorVia, csv_data: csvPorVia.csv_data.slice(0, -1).concat({ Link: 'OPACO' }) };
    const recusada = window.BancoDoModelo.numeracaoResolvida(porVia, excessoSemFaixa, null, modelo);
    assert.match(recusada.erro_banco_ticket, /excedentes/);
    assert.deepEqual(recusada.csv_data, []);
    const semVias = { ...porVia, elements: camposPorVia.map(el => ({ ...el, ticket_pos: null })) };
    assert.match(window.BancoDoModelo.numeracaoResolvida(semVias, csvPorVia, null, modelo).erro_banco_ticket, /posição/);
    if (file === 'script.js') {
        const payload = new Function('window', 'state', 'vinculoDeBancoDoModelo', 'fatiaCsvDoItem',
            ['resolverNumeracaoParaModelo', 'quantidadeContratada', 'linhasDoModeloNoPayload',
                'numeracaoConfirmadaDoModelo'].map(n => extract(src, n)).join('\n') +
                '\nreturn numeracaoConfirmadaDoModelo;')(
            window, { bancosDoPedido: [{ ...csvPorVia, id: 'banco' }] },
            () => ({ banco_id: 'banco', csv_mapa: null }), (_item, num) => num.csv_data);
        const paraImpressao = payload(posicaoEditada, modelo);
        assert.equal(paraImpressao.csv_data.length, 2);
        const texto1 = paraImpressao.elements.find(el => el.id === 'TEXT-0');
        assert.equal(paraImpressao.csv_data[1][texto1.csv_column], urls[6]);
        assert.throws(() => payload(semVias, modelo), /posição/);
        checks += 3;
    }
    checks += 4;
    linhas = banco.csv_data;
    draw(ctx, peca, modelo, 1, 1000, 500, 'back');
    card(peca, 1);
    assert.deepEqual(values.qr, [], file + ': QR sem mapeamento');
    assert.deepEqual(values.text, [], file + ': texto sem mapeamento');
    linhas = [...linhas, ...linhas, ...linhas];
    draw(ctx, resolvida, modelo, 1, 1000, 500, 'back');
    card(resolvida, 1);
    assert.deepEqual(values.qr, [], file + ': QR com tiragem incompatível');
    assert.deepEqual(values.text, [], file + ': texto com tiragem incompatível');
    checks += 4;
}
console.log('OK: '+checks+' cenários de conteúdo Ticket, sequencial, fixo e Banco nas duas prévias.');
