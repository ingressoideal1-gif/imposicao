// DOM real, dados sintéticos, sem acesso ao ERP ou ao Supabase.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extrair(nome) {
    const inicio = source.indexOf('function ' + nome + '(');
    assert.ok(inicio >= 0, nome);
    return source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const requests = [];
        await page.setRequestInterception(true);
        page.on('request', request => { requests.push(request.url()); request.abort(); });
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addStyleTag({ content: fs.readFileSync('frontend/style.css', 'utf8').replace(/^@import[^;]+;/m, '') });
        const inicio = source.indexOf('        let obsAccordionHtml = uniqueProducts.map');
        const fim = source.indexOf("        }).join('');", inicio) + "        }).join('');".length;
        await page.addScriptTag({ content: `
            const uniqueProducts = [{id:'p1',nome:'Ingresso sintético',quantidade:100},{id:'p2',nome:'Pulseira sintética',quantidade:50}];
            const osNum = '1';
            ${source.slice(inicio, fim)}
            document.body.innerHTML = '<main style="max-width:440px;margin:24px auto">' + obsAccordionHtml + '</main>';
            const CHAVE_INFORMACOES_PENDENTES = '_pendencias';
            const state = {pedidosArtesData:{}, osItens:{teste:[{id_produto_proposta_origem:'p1'}, {id_produto_proposta_origem:'p2',observacoes:'  Linha original\\n\\n    Recuo preservado  '}]}};
            const painelPendenciasBriefingEstaAberto = () => false;
            const atualizarResumoPendenciasBriefing = () => {};
            const saves = [];
            const saveBriefingField = (...args) => saves.push(args);
            ${extrair('criarConteudoObservacaoBriefing')}
            ${extrair('atualizarLeituraObservacaoBriefing')}
            ${extrair('updateBriefingUI')}
        ` });
        const result = await page.evaluate(() => {
            const html = '<p><strong>ATENÇÃO: aprovação</strong></p><p>Primeira linha<br>Segunda linha</p><ol start="3"><li>Frente azul</li><li><em>Verso branco</em></li></ol><p><span style="color:#b91c1c;background-color:#fef08a">Conferir nomes</span></p>';
            state.pedidosArtesData[1] = {observacoes:{item_p1:html}};
            updateBriefingUI('teste', 1);
            const preview = document.getElementById('briefing-obs-preview-p1');
            const campo = document.getElementById('briefing-obs-item-p1');
            return {
                bold: preview.querySelector('strong').textContent,
                italic: preview.querySelector('em').textContent,
                list: preview.querySelectorAll('li').length,
                color: preview.querySelector('span').style.color,
                plain: campo.value,
                preserved: state.pedidosArtesData[1].observacoes.item_p1 === html,
                fallback: document.getElementById('briefing-obs-item-p2').value,
                whitespace: getComputedStyle(preview).whiteSpace,
                saves: saves.length
            };
        });
        assert.equal(result.bold, 'ATENÇÃO: aprovação');
        assert.equal(result.italic, 'Verso branco');
        assert.equal(result.list, 2);
        assert.equal(result.color, 'rgb(185, 28, 28)');
        assert.match(result.plain, /Primeira linha\nSegunda linha\n3\. Frente azul\n4\. Verso branco/);
        assert.equal(result.preserved, true);
        assert.equal(result.fallback, '  Linha original\n\n    Recuo preservado  ');
        assert.equal(result.whitespace, 'pre-wrap');
        assert.equal(result.saves, 0);
        await page.setViewport({width:390,height:900});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.click('.briefing-obs-edicao summary');
        await page.$eval('#briefing-obs-item-p1', el => { el.value = 'Texto revisado\nNova linha'; el.dispatchEvent(new Event('input', {bubbles:true})); });
        assert.deepEqual(await page.evaluate(() => saves), [['1',null,'Texto revisado\nNova linha',true,'p1']]);
        assert.equal(await page.$eval('#briefing-obs-preview-p1', el => el.textContent), 'Texto revisado\nNova linha');
        const security = await page.evaluate(() => {
            atualizarLeituraObservacaoBriefing('p1', '<script>window.invadiu=1</script><img src="https://invalid.example/x" onerror="window.invadiu=1"><svg onload="window.invadiu=1"></svg><p onclick="window.invadiu=1" style="position:fixed;background-image:url(https://invalid.example/y)">Seguro <a href="javascript:alert(1)">legível</a></p>');
            const preview = document.getElementById('briefing-obs-preview-p1');
            const unsafe = preview.querySelector('script,img,svg,a,[onclick],[src],[href]');
            return {unsafe:!!unsafe, text:preview.textContent, position:preview.querySelector('p').style.position, invadiu:!!window.invadiu};
        });
        assert.deepEqual(security, {unsafe:false,text:'Seguro legível',position:'',invadiu:false});
        await page.evaluate(() => atualizarLeituraObservacaoBriefing('p1', null));
        assert.equal(await page.$eval('#briefing-obs-preview-p1', el => el.textContent), 'Sem observações para este produto.');
        assert.deepEqual(requests, []);
        console.log('OK: formatação ERP, quebras/recuos, fallback, leitura sem gravação, edição, mobile e HTML inseguro.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
