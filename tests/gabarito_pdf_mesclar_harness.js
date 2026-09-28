// Executa o exportador real com PDF-lib local, recebendo apenas dados sinteticos.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const PDFLib = require(path.join(root, 'frontend/pdf-lib.min.js'));
const src = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function extrair(name) {
    const a = src.indexOf(`function ${name}(`);
    if (a < 0) throw Error(name);
    return src.slice(src.slice(a-6,a)==='async '?a-6:a,src.indexOf('\n}',a)+2);
}
(async()=>{
    let blob;
    const state={amostrasOSAtivo:'teste',ordens:[],cores:[],
        osItens:{teste:[{id:'modelo',amostra_num_id:'n'}]},
        numeracoes:[{id:'n',elements:input.elements}]};
    const document={getElementById:id=>id==='btn-export-pdf-gabarito'?{innerHTML:'',disabled:false}:null,
        createElement:()=>({click(){}})};
    const names=['elementoMesclaComArte','opacidadeDoElemento','elementoSoLayout',
        'elementoVisivelNaFace','caixaDoElementoPdfNaPagina','exportarPdfGabarito'];
    const run=new Function('window','state','document','URL','Blob','toast','fetchPdfBytes',
        'formatoDoModelo','modeloTemVerso','criarCanvasNumeracaoRasterizada',
        names.map(extrair).join('\n')+'; return exportarPdfGabarito();');
    await run({PDFLib},state,document,{createObjectURL:b=>(blob=b,'blob:teste'),revokeObjectURL(){}},Blob,
        (msg,t)=>{if(t==='error')throw Error(msg);},async b64=>Buffer.from(b64,'base64'),
        ()=>({width_mm:100,height_mm:50}),()=>true,async()=>input.png);
    if(!blob) throw Error('Exportador nao gerou PDF');
    process.stdout.write(Buffer.from(await blob.arrayBuffer()).toString('base64'));
})().catch(e=>{console.error(e.stack);process.exit(1);});
