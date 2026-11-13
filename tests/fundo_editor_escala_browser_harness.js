// Geometria real do editor em Chromium; não acessa APIs nem grava numerações.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
const start = source.indexOf('function drawCanvasFace(canvas, face)');
assert.ok(start >= 0);
const draw = source.slice(start, source.indexOf('\n}', start) + 2);
const loadStart = source.indexOf('window.autoLoadCorBg = async function');
assert.ok(loadStart >= 0);
const load = source.slice(loadStart, source.indexOf('\n};', loadStart) + 3);
const margins = fs.readFileSync(path.join(__dirname, '../frontend/cor-margens.js'), 'utf8');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', req => req.url().startsWith('data:') ? req.continue() : req.abort());
        await page.setContent('<canvas id="front"></canvas><canvas id="back"></canvas>');
        await page.addScriptTag({ content: `
            const state = {canvasScale:4,bgLoadToken:0,numFormato:{width_mm:100,height_mm:50},
                numElements:[{type:'TEXT',face:'both',_centerAnchor:true,x_mm:25,y_mm:10}]};
            window.testState=state;
            window.positions=[];
            function elementosNaOrdemDeComposicao(elements){return elements;}
            function opacidadeDoFundoNoEditor(){return 1;}
            window.resolveCorDoFormatoBase=()=>window.testCor;
            async function garantirPdfDaCor(){}
            async function fetchPdfBytes(src){return src;}
            window.rasterizePdfToImage=async ()=>window.testImages.shift();
            function atualizarControlesFundoVerso(){}
            function atualizarAvisoDaArteDeFundo(){}
            function drawCanvas(){}
            function drawElement(ctx,el,scale){
                window.positions.push([el.x_mm,el.y_mm,scale]);
                ctx.fillStyle='blue';ctx.fillRect(el.x_mm*scale,el.y_mm*scale,2,2);
            }
            ${draw}
            ${margins}
            ${load}
        ` });
        const results = await page.evaluate(() => {
            const s=window.testState;
            function run(w,h,pdf=true,dpi=254,face='front') {
                const bg=document.createElement('canvas');bg.width=w*10;bg.height=h*10;
                bg.getContext('2d').fillRect(0,0,bg.width,bg.height);
                if(pdf){bg.originalPdfWidthPt=w*72/25.4;bg.originalPdfHeightPt=h*72/25.4;}
                else if(dpi!==null) bg.dpiValue=dpi;
                s.bgImage=face==='front'?bg:null;s.bgImageVerso=face==='back'?bg:null;
                const canvas=document.getElementById(face==='front'?'front':'back');
                canvas.width=400;canvas.height=200;
                const ctx=canvas.getContext('2d'),original=ctx.drawImage;
                let rect;
                ctx.drawImage=function(img,...args){rect=args.map(v=>v/4);return original.call(this,img,...args);};
                const before=JSON.stringify(s.numElements);
                drawCanvasFace(canvas,face);
                ctx.drawImage=original;
                const assertUnchanged=before===JSON.stringify(s.numElements);
                const outside=ctx.getImageData(43,13,1,1).data[0];
                const inside=ctx.getImageData(123,63,1,1).data[0];
                return {rect,assertUnchanged,outside,inside};
            }
            return [run(100,50),run(106,56),run(50,25),run(50,25,false),
                run(106,56,true,254,'back'),run(50,25,false,null),run(50,25,false,0)];
        });
        const expected=[[0,0,100,50],[-3,-3,106,56],[25,12.5,50,25],[25,12.5,50,25],
            [-3,-3,106,56],[(100-500/300*25.4)/2,(50-250/300*25.4)/2,500/300*25.4,250/300*25.4]];
        expected.push(expected[5]);
        results.forEach((r,i)=>{
            r.rect.forEach((v,j)=>assert.ok(Math.abs(v-expected[i][j])<0.00001,`caso ${i}: ${r.rect}`));
            assert.ok(r.assertUnchanged,'posição da numeração preservada');
        });
        assert.equal(results[1].outside,0,'arte maior recortada, sem margens brancas artificiais');
        assert.equal(results[2].outside,255,'arte menor não ampliada');
        assert.equal(results[2].inside,0);
        const asymmetric=await page.evaluate(async ()=>{
            const s=window.testState;
            window.testCor={pdf_url:'frente',pdf_verso_base64:'verso',
                margem_esquerda_mm:5,margem_direita_mm:7,margem_superior_mm:22.5,margem_inferior_mm:5};
            const image=()=>{const c=document.createElement('canvas');c.width=1120;c.height=775;return c;};
            window.testImages=[image(),image()];
            await autoLoadCorBg('formato');
            const rectangles=[];
            for(const face of ['front','back']){
                const canvas=document.getElementById(face),ctx=canvas.getContext('2d'),original=ctx.drawImage;
                ctx.drawImage=function(img,...args){rectangles.push(args.map(v=>v/4));return original.call(this,img,...args);};
                drawCanvasFace(canvas,face);ctx.drawImage=original;
            }
            const noPersistence=s.bgUrl==='' && s.bgUrlVerso==='';
            const manual=image();manual.originalPdfWidthPt=50*72/25.4;manual.originalPdfHeightPt=25*72/25.4;
            s.bgImage=manual;
            const canvas=document.getElementById('front'),ctx=canvas.getContext('2d'),original=ctx.drawImage;
            ctx.drawImage=function(img,...args){rectangles.push(args.map(v=>v/4));return original.call(this,img,...args);};
            drawCanvasFace(canvas,'front');ctx.drawImage=original;
            return {rectangles,noPersistence};
        });
        assert.deepEqual(asymmetric.rectangles.map(rect=>rect.map(n=>Number(n.toFixed(6)))),
            [[-5,-22.5,112,77.5],[-5,-22.5,112,77.5],[25,12.5,50,25]]);
        assert.ok(asymmetric.noPersistence,'margens da cor não persistem no fundo salvo');
        if(process.argv[2]) {
            const folder=process.argv[2];
            const data=JSON.parse(fs.readFileSync(path.join(folder,'dados.json'),'utf8'));
            const dimensions=JSON.parse(fs.readFileSync(path.join(folder,'pdf-dimensoes.json'),'utf8'));
            const image='data:image/png;base64,'+fs.readFileSync(path.join(folder,'fundo.png')).toString('base64');
            const actual=await page.evaluate(async ({data,dimensions,image})=>{
                const s=window.testState,bg=new Image();
                await new Promise((resolve,reject)=>{bg.onload=resolve;bg.onerror=reject;bg.src=image;});
                bg.originalPdfWidthPt=dimensions.width_pt;bg.originalPdfHeightPt=dimensions.height_pt;
                s.numFormato=data.formato;s.canvasScale=2000/data.formato.width_mm;
                s.numElements=data.numeracao.elements.filter(el=>el.type!=='METADATA');
                window.testCor={...data.cor,pdf_url:'fixture',pdf_verso_base64:null};
                window.testImages=[bg];
                await autoLoadCorBg(data.formato.id);
                const canvas=document.getElementById('front');
                canvas.width=Math.round(data.formato.width_mm*s.canvasScale);
                canvas.height=Math.round(data.formato.height_mm*s.canvasScale);
                const ctx=canvas.getContext('2d'),original=ctx.drawImage;let rect;
                ctx.drawImage=function(img,...args){rect=args.map(v=>v/s.canvasScale);return original.call(this,img,...args);};
                drawCanvasFace(canvas,'front');ctx.drawImage=original;
                return {rect,canvas:[canvas.width,canvas.height],elements:s.numElements.length};
            },{data,dimensions,image});
            assert.deepEqual(actual.rect.map(n=>Number(n.toFixed(6))),[-5,-22.5,286,45]);
            await page.setViewport({width:2040,height:220});
            await page.$eval('#back',el=>el.remove());
            await page.screenshot({path:path.join(folder,'editor-pulseira-botao.png')});
            fs.writeFileSync(path.join(folder,'resultado.json'),JSON.stringify(actual,null,2));
            console.log('Pulseira Botão:',JSON.stringify(actual));
        }
        console.log('OK: PDF, DPI, frente/verso, margens assimétricas carregadas, fundo manual independente e coordenadas preservadas.');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
