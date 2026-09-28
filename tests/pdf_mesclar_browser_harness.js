// Canvas real com arte sintetica. Nenhuma API, credencial ou arquivo comercial.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
function extrair(src, name) {
    const a = src.indexOf(`function ${name}(`);
    assert(a >= 0, name);
    const begin = src.slice(a - 6, a) === 'async ' ? a - 6 : a;
    return src.slice(begin, src.indexOf('\n}', a) + 2);
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    let total = 0;
    try {
        for (const file of ['frontend/script.js', 'frontend/cliente.js']) {
            const src = fs.readFileSync(path.join(root, file), 'utf8');
            const page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', r => r.url().startsWith('data:') ? r.continue() : r.abort());
            await page.setContent('<canvas id="saida"></canvas>');
            await page.addScriptTag({ content: `
                const state = { numElements: [], osItens: {}, formatos: [{id:'f',width_mm:100,height_mm:50}] };
                function saveNumHistory() {}
                function drawCanvas() {}
                function pdfDuplicarParaVersoDoModelo() { return false; }
                function pdfCopiaNoPortal() { return false; }
                function escalaDaArteDoModelo() { return {h:100,v:100}; }
                function linhaDaAmostra() { return {}; }
                function linhasDaAmostra() { return [{}]; }
                function paginaDaAmostra() { return 0; }
                async function garantirPdfDaCor() {}
                async function garantirFontesCarregadas() {}
                function fontesDosElementos() { return []; }
                async function rasterDaAmostra(chave, desenhar) { return desenhar(); }
                function colorCanvas(color) {
                    const c = document.createElement('canvas'); c.width=100; c.height=50;
                    const ctx=c.getContext('2d'); ctx.fillStyle=color; ctx.fillRect(0,0,100,50); return c;
                }
                const pdfjsLib = { getDocument: () => ({destroy:async()=>{},promise: Promise.resolve({
                    numPages:1, getPage:async () => ({
                        getViewport: ({scale}) => ({width:283.46*scale,height:141.73*scale}),
                        render: ({canvasContext:c,viewport:v}) => {
                            c.fillStyle='#80ffff'; c.fillRect(0,0,v.width,v.height);
                            return {promise:Promise.resolve()};
                        }
                    })
                })})};
                ${file.endsWith('cliente.js') ? extrair(src,'arteDaFaceParaComposicao') : ''}
                ${['elementoMesclaComArte','elementosNaOrdemDeComposicao','opacidadeDoElemento',
                    'drawImageContain','drawArteDoElemento','drawAmostraFace',
                    'drawNumeracaoElementsOverCanvas'].map(n => extrair(src, n)).join('\n')}
                window.drawTest = drawAmostraFace;
                window.overlayTest = drawNumeracaoElementsOverCanvas;
                window.element = (color, extra={}) => ({type:'PDF',x_mm:50,y_mm:25,
                    width_mm:100,height_mm:50,_pdfCanvas:colorCanvas(color),...extra});
                window.renderTest = async (elements, face='front', cor=null, draw=window.drawTest) => {
                    const canvas=document.getElementById('saida');
                    const item={id:'teste',_dbLoaded:true,arte_url:colorCanvas('#3366cc').toDataURL(),
                        verso_arte_url:colorCanvas('#3366cc').toDataURL()};
                    await draw(item,face,canvas,null,state.formatos[0],cor,{id:'n',elements},0,'os',1);
                    return Array.from(canvas.getContext('2d').getImageData(50,25,1,1).data);
                };
            ` });
            if (file.endsWith('script.js')) {
                const checkbox = src.match(/\$\{el\.type === 'PDF' \? `\s+<div class="form-group el-full">[\s\S]+?` : ''\}/)[0];
                const a = src.indexOf('window.updateEl = function');
                await page.addScriptTag({content:src.slice(a,src.indexOf('\n};',a)+3)});
                const controls = await page.evaluate(template => {
                    const html = new Function('el','return `'+template+'`;');
                    const host=document.createElement('div'); document.body.append(host);
                    const a={id:'pdf-a',type:'PDF'}, b={id:'pdf-b',type:'PDF'};
                    state.numElements=[a,b];
                    host.innerHTML=html(a)+html(b);
                    const inputs=host.querySelectorAll('input');
                    const defaults=[inputs[0].checked,inputs[1].checked];
                    inputs[0].click();
                    const saved=JSON.parse(JSON.stringify(state.numElements));
                    host.innerHTML=html(saved[0])+html(saved[1]);
                    const restored=Array.from(host.querySelectorAll('input'),i=>i.checked);
                    host.querySelector('input').click();
                    return {defaults,restored,disabled:a.mesclar_com_arte,
                        svg:html({id:'svg',type:'SVG',mesclar_com_arte:true})};
                },checkbox);
                assert.deepEqual(controls,{defaults:[false,false],restored:[true,false],disabled:false,svg:''});
                total+=4;
                const selectStart=src.indexOf('window.onAmostraNumeracaoSelect = function');
                await page.addScriptTag({content: `
                    function getAmostraScale() { return 1; }
                    function getAmostraFormato() { return state.formatos[0]; }
                    ${extrair(src,'renderAmostraCombinada')}
                    ${src.slice(selectStart,src.indexOf('\n};',selectStart)+3)}
                `});
                const legacy=await page.evaluate(()=>{
                    const host=document.createElement('div');document.body.append(host);
                    host.innerHTML='<input id="amostra-numeracao" value="n"><input id="amostra-cor">'
                        +'<input id="amostra-arte-file" type="file"><canvas id="amostra-comb-canvas"></canvas>'
                        +'<canvas id="amostra-num-canvas"></canvas>';
                    const art=colorCanvas('#3366cc');art.id='amostra-arte-canvas';host.append(art);
                    const dt=new DataTransfer();dt.items.add(new File(['teste'],'teste.png'));
                    document.getElementById('amostra-arte-file').files=dt.files;
                    const el=element('#ffffff',{mesclar_com_arte:true});
                    state.cores=[];state.numeracoes=[{id:'n',formato_id:'f',elements:[el]}];
                    const pixel=()=>Array.from(document.getElementById('amostra-comb-canvas')
                        .getContext('2d').getImageData(50,25,1,1).data);
                    onAmostraNumeracaoSelect();const marked=pixel();
                    el.mesclar_com_arte=false;onAmostraNumeracaoSelect();const unchecked=pixel();
                    return {marked,unchecked};
                });
                assert.deepEqual(legacy,{marked:[51,102,204,255],unchecked:[255,255,255,255]});
                total+=2;
            }
            const result = await page.evaluate(async () => {
                const out = {};
                out.normal = await renderTest([element('#ffff00'),element('#0000ff')]);
                out.marked = await renderTest([element('#ffff00',{mesclar_com_arte:true}),element('#0000ff')]);
                out.half = await renderTest([element('#ffff00',{mesclar_com_arte:true,opacity:0.5}),element('#0000ff')]);
                out.back = await renderTest([element('#ffff00',{mesclar_com_arte:true,face:'front'}),element('#0000ff')],'back');
                out.white = await renderTest([element('#ffffff',{mesclar_com_arte:true})]);
                out.paper = await renderTest([element('#ffffff',{mesclar_com_arte:true})],'front',
                    {id:'cor',pdf_base64:'AA==',width_mm:100,height_mm:50});
                out.several = await renderTest([element('#80ffff',{mesclar_com_arte:true}),
                    element('#ff80ff',{mesclar_com_arte:true}),element('#ffffff')]);
                const c=colorCanvas('#0000ff');
                overlayTest(c.getContext('2d'), {formato_id:'f', elements:[
                    element('#ffff00',{mesclar_com_arte:true}), element('#0000ff')]}, {},1,100,50);
                out.paged=Array.from(c.getContext('2d').getImageData(50,25,1,1).data);
                return out;
            });
            for (const [name, expected] of Object.entries({normal:[0,0,255,255],marked:[0,0,0,255],
                half:[0,0,128,255],back:[0,0,255,255],white:[51,102,204,255],
                paper:[26,102,204,255],several:[128,128,255,255],paged:[0,0,0,255]})) {
                assert(result[name].every((v,i)=>Math.abs(v-expected[i])<=1), `${file} ${name}: ${result[name]}`);
                total++;
            }
            // Comparacao opcional com revisao base: bitmap inteiro, campo ausente e false.
            if (process.env.PDF_MESCLAR_BASE) {
                const old = execFileSync('git',['show',`${process.env.PDF_MESCLAR_BASE}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
                await page.addScriptTag({content: extrair(old,'drawAmostraFace').replace('drawAmostraFace(', 'drawAnterior(')});
                assert(await page.evaluate(async () => {
                    for (const opacity of [0,0.5,1]) {
                        for (const face of ['front','back']) {
                            const els=[element('#ff00ff',{opacity,rotation:25}), element('#00ffff',{face:'back'})];
                            await renderTest(els,face,null,drawAnterior);
                            const before=document.getElementById('saida').toDataURL();
                            for (const flag of [undefined,false]) {
                                await renderTest(els.map(e=>({...e,mesclar_com_arte:flag})),face);
                                if(document.getElementById('saida').toDataURL()!==before) return false;
                            }
                        }
                    }
                    return true;
                }), file+' mudou com checkbox desmarcado');
                total+=12;
            }
            await page.close();
        }
        console.log(`OK: ${total} verificacoes de composicao em canvas real.`);
    } finally { await browser.close(); }
})().catch(e=>{ console.error(e.stack || e.message); process.exit(1); });
