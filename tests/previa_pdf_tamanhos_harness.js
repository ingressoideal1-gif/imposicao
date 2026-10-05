// Executa a prévia real do Pedido em Chromium com páginas sintéticas, sem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(process.env.PREVIA_PEDIDO_FONTE
    || path.join(root, 'frontend/pedido.js'), 'utf8').replace(/\r/g, '');
function extract(name) {
    const start = source.indexOf('\nfunction ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}

async function main() {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', request => request.url().startsWith('data:')
            ? request.continue() : request.abort());
        await page.setContent(`<div class="ped-preview-canvas-container" style="width:1000px;height:700px">
            <canvas id="ped-preview-canvas"></canvas></div>
            <span id="ped-preview-sheet-num"></span><span id="ped-preview-modelo"></span>
            <input id="ped-schema" value="pdf_multiple"><input id="ped-print-mode" value="duplex">
            <input id="ped-preview-page-input" value="1"><input id="ped-block-depth" value="1">
            <input id="ped-preview-toggle-arte" type="checkbox" checked>`);
        await page.addScriptTag({ content: `
            const MM = 2.8346, MAX_PAGINAS_EM_CACHE = 30;
            function atualizarIndicadorModeloComVerso() {}
            function atualizarAvisoPaginacao() {}
            function atualizarFacesDeImpressaoDoPedido() {}
            function mostrarControleDaPrevia(el, show) { el.style.display = show ? '' : 'none'; }
            function escalaDaArteDoTrabalho() { return window.escalaTeste; }
            const item = {id:'modelo',qtd:10,formato_id:'f',saida_id:'s',numeracao_id:'n',
                num_inicial:1,num_final:10,modo_pdf:true};
            const state = {activeOSItem:{osId:'pedido',itemId:'modelo'},selectedOSItems:[],
                osItens:{pedido:[item]},cores:[],numeracoes:[{id:'n',tipo:'SEQUENCIAL',elements:[]}],
                formatos:[{id:'f',width_mm:57,height_mm:97,cols:5,rows:2,
                    default_schema:'sequential',default_saida_id:'s'}],
                saidas:[{id:'s',width_mm:297,height_mm:210}],printMode:'duplex',
                previewFace:'front',pedArtWidth:57*MM,pedArtHeight:97*MM};
            window.state = state; window.escalaTeste = {h:100,v:100};
            window.errosTeste = [];
            console.error = (...args) => window.errosTeste.push(args.map(String).join(' '));
            window.paginaSintetica = (number, width, height) => ({
                getViewport: ({scale}) => ({width:width*MM*scale,height:height*MM*scale}),
                render: ({canvasContext:ctx,viewport:vp}) => {
                    ctx.fillStyle = number % 2 ? '#2040c0' : '#208040';
                    const s = vp.width/(width*MM);
                    ctx.fillRect((width-57)*MM*s/2,(height-97)*MM*s/2,57*MM*s,97*MM*s);
                    return {promise:Promise.resolve()};
                }
            });
            window.novoPdf = (sizes) => ({numPages:sizes.length,
                getPage: async number => paginaSintetica(number,...sizes[number-1])});
            ${['temVerso','versoUnico','limitarCachePaginas','pdfDaFaceNaPreviaPedido','drawPedPreview'].map(extract).join('\n')}
            window.drawTest = drawPedPreview;
            window.coresDasCelulas = () => {
                const c=document.getElementById('ped-preview-canvas'),ctx=c.getContext('2d');
                const s=c.width/(297*MM), x0=(297-57*5)*MM*s/2,y0=(210-97*2)*MM*s/2;
                const pixel=(x,y)=>Array.from(ctx.getImageData(Math.round(x),Math.round(y),1,1).data);
                return Array.from({length:10},(_,i)=>{
                    const col=i%5,row=Math.floor(i/5),cx=x0+(col+.5)*57*MM*s,cy=y0+(row+.5)*97*MM*s;
                    return {centro:pixel(cx,cy),lateral:pixel(cx+57*MM*s*.32,cy),
                        topo:pixel(cx,cy-97*MM*s*.32)};
                });
            };
        ` });
        const prepare = async (sizes, face = 'front', scale = {h:100,v:100}, mode = 'duplex') => {
            await page.evaluate(({sizes,face,scale,mode}) => {
                state.pedArtPdfDoc=novoPdf(sizes); state.previewFace=face;
                state.printMode=mode; document.getElementById('ped-print-mode').value=mode;
                window.escalaTeste=scale;
                state.pedArtWidth=sizes[0][0]*MM;state.pedArtHeight=sizes[0][1]*MM;
                drawTest();
            }, {sizes,face,scale,mode});
            await page.waitForFunction(() => Object.keys(state.pedArtPdfDoc.pagesCache || {}).length===10
                && Object.keys(state.pedArtPdfDoc.pagesRendering || {}).length===0);
            return page.evaluate(() => {drawTest();return coresDasCelulas();});
        };
        const blue=[32,64,192,255],green=[32,128,64,255];
        const checkCells = (cells,color,label) => {
            assert.equal(cells.length,10);
            cells.forEach((cell,i)=>Object.entries(cell).forEach(([point,pixel])=>
                assert.deepEqual(pixel,color,label+' célula '+(i+1)+' '+point)));
        };
        const mixed=Array.from({length:20},(_,i)=>i===0?[57,97]:[210,297]);
        checkCells(await prepare(mixed),blue,'Frente com páginas de tamanhos diferentes');
        checkCells(await prepare(mixed,'back'),green,'Verso com páginas de tamanhos diferentes');
        checkCells(await prepare(mixed,'front',{h:80,v:75}),blue,'Escala por eixo');
        const margins=await page.evaluate(()=>{
            const c=document.getElementById('ped-preview-canvas'),ctx=c.getContext('2d');
            const s=c.width/(297*MM),cx=(6+57/2)*MM*s,cy=(8+97/2)*MM*s;
            return [Array.from(ctx.getImageData(Math.round(cx+57*MM*s*.45),Math.round(cy),1,1).data),
                Array.from(ctx.getImageData(Math.round(cx),Math.round(cy-97*MM*s*.45),1,1).data)];
        });
        assert.deepEqual(margins,[[255,255,255,255],[255,255,255,255]],
            'A escala escolhida reduz só a arte e preserva as margens');
        checkCells(await prepare(Array.from({length:20},()=>[57,97])),blue,'PDF uniforme');
        checkCells(await prepare(Array.from({length:20},(_,i)=>i%2?[297,210]:[57,97]),'back'),
            green,'Versos com viewport em paisagem');
        // Duplicar para Verso e simplex também folheiam páginas de tamanhos diferentes.
        const ten=mixed.slice(0,10);
        const duplicate=await prepare(ten,'back',{h:100,v:100},'pdf_duplicate_back');
        duplicate.forEach((cell,i)=>Object.values(cell).forEach(pixel=>
            assert.deepEqual(pixel,i%2?green:blue,'Duplicar para Verso célula '+(i+1))));
        const simplex=await prepare(ten,'front',{h:100,v:100},'front');
        assert.deepEqual(simplex,duplicate);
        // Cache anterior à correção não tem metadados: o raster conhecido continua suficiente.
        const legacy=await page.evaluate(()=>{
            Object.values(state.pedArtPdfDoc.pagesCache).forEach(c=>{
                delete c._pdfWidthPt;delete c._pdfHeightPt;
            });drawTest();return coresDasCelulas();
        });
        assert.deepEqual(legacy,simplex);
        const output=await page.evaluate(()=>({errors:errosTeste,dimension:[
            document.getElementById('ped-preview-canvas').width,
            document.getElementById('ped-preview-canvas').height]}));
        assert.deepEqual(output.errors,[]);
        assert(Math.abs(output.dimension[0]/output.dimension[1]-297/210)<.002);
        console.log('OK: prévia real em Chromium, 10 células, frente/verso, páginas mistas, escala, PDF uniforme, simplex, duplicação e cache anterior.');
    } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
