// PDFs sintéticos, sem rede, sem driver e sem spool.
const assert = require('node:assert/strict');
const fs = require('node:fs');
global.window = {PDFLib:require('../frontend/pdf-lib.min.js')};
const source = fs.readFileSync('frontend/script.js','utf8');
const start = source.indexOf('async function processPrintQueueOptions(');
global.eval(source.slice(start,source.indexOf('\n}',start)+2));
(async()=>{
    const {PDFDocument,PDFName}=window.PDFLib;
    for (const total of [4,5]) for (const duplex of [1,2,3]) {
        const doc=await PDFDocument.create();
        for(let n=1;n<=total;n++) doc.addPage([100+n,200]);
        const perfil=doc.context.register(doc.context.stream(new Uint8Array([1,2,3]),{N:3}));
        const intent=doc.context.obj({Type:'OutputIntent',S:'GTS_PDFX',DestOutputProfile:perfil});
        doc.catalog.set(PDFName.of('OutputIntents'),doc.context.obj([intent]));
        const item={name:'modelo_miolo.pdf',blob:new Blob([await doc.save()])};
        for (const reverse of [false,true]) for (const split of [false,true]) {
            const out=await processPrintQueueOptions([item],{duplex,impressao_reversa:reverse,folha_a_folha:split});
            const grupos=[];
            for(let n=1;n<=total;n+=duplex===1?1:2) grupos.push(duplex===1 || n===total ? [n] : [n,n+1]);
            if(reverse) grupos.reverse();
            const recebido=[];
            for(const arquivo of out) {
                const pdf=await PDFDocument.load(await arquivo.blob.arrayBuffer());
                assert(pdf.catalog.get(PDFName.of('OutputIntents')),'perfil de cor preservado');
                recebido.push(pdf.getPages().map(p=>p.getWidth()-100));
            }
            if(split) assert.deepEqual(recebido,grupos);
            else {
                const esperado=grupos.flatMap((g,i)=>duplex!==1 && g.length===1 && i<grupos.length-1 ? [...g,g[0]] : g);
                assert.deepEqual(recebido,[esperado]);
                if(reverse && duplex!==1 && total%2) {
                    const pdf=await PDFDocument.load(await out[0].blob.arrayBuffer());
                    assert.equal(pdf.getPage(1).node.Contents(),undefined,'verso inserido é vazio');
                }
            }
        }
    }
    await assert.rejects(()=>processPrintQueueOptions([{name:'erro.pdf',blob:new Blob(['inválido'])}],{impressao_reversa:true}));
    window.PDFLib=null;
    await assert.rejects(()=>processPrintQueueOptions([],{folha_a_folha:true}));
    console.log('OK: 24 combinações de simplex/duplex, reversa, separação, páginas pares/ímpares e ICC; falhas não ignoram opções.');
})().catch(e=>{console.error(e);process.exitCode=1;});
