const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
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
    const window={desenharTextoAjustado(_ctx,_el,label){values.text.push(label)},renderBarcodeOnCtx(_ctx,label){values.barcode.push(label)}};
    const draw=new Function('state','window','buildCanvasFont','renderQRCodeOnCtx','linhasDaAmostra',
        ['elementoMesclaComArte','elementosNaOrdemDeComposicao','drawNumeracaoElementsOverCanvas'].map(n=>extract(src,n)).join('\n')+'\nreturn drawNumeracaoElementsOverCanvas;')(
        state,window,()=>'',(_ctx,label)=>values.qr.push(label),()=>[{Codigo:'BANCO1'},{Codigo:'BANCO2'}]);
    const ctx={save(){},restore(){},translate(){},rotate(){}};
    for(const tipo of ['TICKET','SEQUENCIAL']) for(const face of ['front','back']) for(const page of [1,2]) for(const pos of [1,2,3]) {
        const num={formato_id:'fmt',tipo,ticket_qtd:3,elements:['TEXT','QR','BARCODE'].map(type=>({type,ticket_pos:pos,x_mm:10,y_mm:10,font_size:10,pad:0,face:'both'}))};
        draw(ctx,num,{numeracao_inicio:10},page,1000,500,face);
        const expected=String(tipo==='TICKET'?10+(page-1)*3+pos-1:10+page-1);
        for(const key of Object.keys(values)) assert.deepEqual(values[key].splice(0),[expected],file+':'+key);
        checks++;
    }
    for(const source of ['fixed','database']) {
        const num={formato_id:'fmt',tipo:'TICKET',ticket_qtd:3,elements:['QR','BARCODE'].map(type=>({type,ticket_pos:3,x_mm:10,y_mm:10,fixed:source==='fixed',fixed_value:'FIXO',source,csv_column:'Codigo'}))};
        draw(ctx,num,{numeracao_inicio:10},2,1000,500,'front');
        assert.deepEqual(values.qr.splice(0),[source==='fixed'?'FIXO':'BANCO2']);
        assert.deepEqual(values.barcode.splice(0),[source==='fixed'?'FIXO':'BANCO2']);checks++;
    }
}
console.log('OK: '+checks+' cenários de conteúdo Ticket, sequencial, fixo e Banco nas duas prévias.');
