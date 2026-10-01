// DOM -> payload -> respostas reais em PDF -> destinos simulados, sem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PDFLib = require('pdf-lib');
const {fixture} = require('./impressao_combinada_fluxo_harness.js');
const {extract} = require('./impressao_combinada_harness.js');

async function main() {
    if (process.argv[2] === '--filter') {
        const [, , , input, output, face, mode] = process.argv;
        const f = fixture();
        f.c.PDFLib = PDFLib;
        const blob = await f.c.selecionarFacesDoPdfDoPedido(new Blob([fs.readFileSync(input)]), face, mode);
        fs.writeFileSync(output, Buffer.from(await blob.arrayBuffer()));
        return;
    }
    const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
    for (const [id, text] of [['front', 'FRENTE'], ['back', 'VERSO']]) {
        assert(html.includes(`id="ped-print-first-${id}"`));
        assert(html.includes(`Folha 1 - ${text}`));
    }
    const browser = await require('puppeteer').launch({headless:true});
    try {
        const page = await browser.newPage();
        await page.setViewport({width:400, height:700});
        await page.evaluate(source => {
            const template = document.createElement('template');
            template.innerHTML = source;
            document.body.append(template.content.querySelector('#ped-print-modes-box'));
            window.state = {printMode:'duplex', activeOSItem:{itemId:1}, selectedOSItems:[]};
        }, html);
        const source = fs.readFileSync(path.join(__dirname, '../frontend/pedido.js'), 'utf8');
        await page.addScriptTag({content:['temVerso', 'atualizarFacesDeImpressaoDoPedido',
            'selecionarFolha1DoPedido', 'folha1DoPedido', 'selecionarFaceDeImpressaoDoPedido']
            .map(name => extract(source, name)).join('\n')});
        await page.evaluate(() => atualizarFacesDeImpressaoDoPedido());
        await page.click('#ped-print-first-front');
        assert.equal(await page.evaluate(() => folha1DoPedido().face), 'front');
        await page.click('#ped-print-first-back');
        assert.equal(await page.evaluate(() => folha1DoPedido().face), 'both');
        await page.click('#ped-print-first-front');
        assert.equal(await page.evaluate(() => folha1DoPedido().face), 'back');
        await page.evaluate(() => {state.activeOSItem.itemId = 2; atualizarFacesDeImpressaoDoPedido();});
        assert.equal(await page.evaluate(() => folha1DoPedido()), null);
        await page.evaluate(() => {state.printMode = 'front'; atualizarFacesDeImpressaoDoPedido();});
        assert.equal(await page.$eval('#ped-print-first-back', el => el.disabled), true);
        await page.click('#ped-print-first-front');
        assert.equal(await page.evaluate(() => folha1DoPedido().face), 'front');
    } finally { await browser.close(); }
    for (const kind of ['pdf', 'json', 'stream']) {
        for (const action of ['pdf', 'print']) {
            for (const selected of ['none', 'front', 'back', 'both']) {
                const doc = await PDFLib.PDFDocument.create();
                for (let i = 0; i < (selected === 'none' ? 6 : 2); i++) doc.addPage([200 + i, 300]);
                const bytes = await doc.save();
                const file = {name: 'modelo_folha1.pdf', data: Buffer.from(bytes).toString('base64'), index: 1,
                    sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex')};
                const stream = new TextEncoder().encode('event: file\ndata: ' + JSON.stringify(file)
                    + '\n\nevent: done\ndata: {"files":1}\n\n');
                let read = false;
                const response = {ok: true,
                    headers: {get: () => ({pdf:'application/pdf', json:'application/json', stream:'text/event-stream'})[kind]},
                    blob: async () => new Blob([bytes]), json: async () => ({type:'multi_file', files:[file]}),
                    body: {getReader: () => ({cancel: async () => {},
                        read: async () => read ? {done:true} : (read=true, {done:false, value:stream})})}};
                const f = fixture({response});
                f.c.PDFLib = PDFLib; f.c.atob = atob;
                f.c.state.printMode = 'duplex';
                // Um modelo por vez, como a edição do modelo no Painel de Produção.
                f.c.state.selectedOSItems = [f.c.state.selectedOSItems[0]];
                f.c.state.pedArtFile = new Blob(['arte sintetica']);
                f.c.state.pedArtFile.name = 'arte.pdf';
                f.c.itemAtivoDoPedido = () => f.items[0];
                f.elements['ped-print-first-front'] = {checked: ['front', 'both'].includes(selected)};
                f.elements['ped-print-first-back'] = {checked: ['back', 'both'].includes(selected)};
                const before = JSON.stringify(f.items);
                await f.c.runPedImposition(action);
                assert.equal(f.calls.requests.length, 1, JSON.stringify(f.calls.notices));
                const payload = f.calls.requests[0];
                assert.equal(payload.refazer_de, selected === 'none' ? 0 : 1);
                assert.equal(payload.refazer_ate, selected === 'none' ? 0 : 1);
                assert.equal(payload.refazer_set, 1);
                assert.deepEqual(payload.refazer_celulas, []);
                assert.equal(payload.seq_start, 960);
                assert.equal(payload.seq_end, 963);
                assert.equal(JSON.stringify(f.items), before, 'a saída parcial não altera o modelo');
                assert.equal(payload.suggested_filename.includes('_folha1'), selected !== 'none');
                const delivered = action === 'print' ? f.calls.printed : f.calls.saved;
                assert.equal(delivered.length, 1, JSON.stringify(f.calls.notices));
                const pdf = await PDFLib.PDFDocument.load(await delivered[0].blob.arrayBuffer());
                const widths = {none:[200,201,202,203,204,205], front:[200], back:[201], both:[200,201]};
                assert.deepEqual(pdf.getPages().map(p => p.getWidth()), widths[selected]);
                if (action === 'print') assert.equal(f.calls.printOptions.apenasUmaFace, ['front','back'].includes(selected));
                assert.equal(f.calls.confirmed.length, action === 'print' && selected === 'none' ? 1 : 0);
            }
        }
    }
    for (const error of ['refazer', 'sem-verso']) {
        const f = fixture();
        f.elements['ped-print-first-' + (error === 'refazer' ? 'front' : 'back')] = {checked:true};
        await f.c.runPedImposition('print', error === 'refazer');
        assert.equal(f.calls.requests.length, 0);
        assert.equal(f.calls.printed.length, 0);
        assert.match(f.calls.notices[0][0], error === 'refazer' ? /Desmarque Folha 1/ : /não possui verso/);
    }
    console.log('OK: Folha 1 nas três respostas, PDF/impressão, quatro seleções, payload, status e limites.');
}
main().catch(e => {console.error(e); process.exitCode = 1;});
