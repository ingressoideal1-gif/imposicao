const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
require('../frontend/banco-do-modelo.js');
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
        'renderQRCodeOnCtx', 'linhas', '_linhaCsv',
        src.slice(inicioDoCard, fimDoCard) + '\nnum.elements.forEach(desenharElementoDaFace);');
    const card = (num, pagina) => desenharCard(window, num, modelo, 'back', ctx, 1, () => '',
        (_ctx, label) => values.qr.push(label), linhas, linhas[pagina - 1]);
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
