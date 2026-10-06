const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const PDFLib = require('pdf-lib');
const root = path.join(__dirname, '..');
const pedido = fs.readFileSync(path.join(root, 'frontend/pedido.js'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
function extract(source, name) {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const fields = {
    'ped-print-faces': {dataset: {}, hidden: true},
    'ped-print-only-front': {checked: false},
    'ped-print-only-back': {checked: false},
    'ped-print-first-front': {checked: false},
    'ped-print-first-back': {checked: false}
};
const context = {window: {PDFLib}, Blob, console,
    state: {printMode: 'duplex', activeOSItem: {itemId: 1}, selectedOSItems: [1]},
    document: {getElementById: id => fields[id] || null}};
vm.createContext(context);
for (const name of ['temVerso', 'atualizarFacesDeImpressaoDoPedido', 'selecionarFaceDeImpressaoDoPedido', 'faceDeImpressaoDoPedido', 'selecionarFacesDoPdfDoPedido', 'folha1DoPedido', 'selecionarFolha1DoPedido']) {
    vm.runInContext(extract(pedido, name), context);
}
async function testarTelasReais() {
    const browser = await require('puppeteer').launch({headless: true});
    try {
        for (const file of ['index.html', 'producao.html']) {
            const html = fs.readFileSync(path.join(root, 'frontend', file), 'utf8');
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setViewport({width: 1366, height: 768});
            await page.setRequestInterception(true);
            page.on('request', request => request.resourceType() === 'stylesheet'
                ? request.respond({status: 200, contentType: 'text/css', body: ''}) : request.abort());
            // O HTML real, sem scripts de inicialização nem serviços externos.
            await page.evaluate(source => {
                const template = document.createElement('template');
                template.innerHTML = source;
                const view = template.content.querySelector('#view-pedido');
                view.querySelectorAll('script, link, img, iframe').forEach(el => el.remove());
                view.classList.add('active');
                document.body.append(view);
                // Janela aberta de um modelo; o grupo começa recolhido no painel principal.
                const preview = document.getElementById('ped-preview-card-container');
                if (preview) preview.style.display = 'block';
                window.state = {printMode: 'front', activeOSItem: {itemId: 1},
                    selectedOSItems: [], numeracoes: [], formatos: [], saidas: []};
                window.trabalhoUsaMapaTeatro = () => false;
                window.liberarMapaTeatroDaTela = () => {};
                window.agendarRedesenhoDaPrevia = () => {};
            }, html);
            await page.addStyleTag({content: fs.readFileSync(path.join(root, 'frontend/style.css'), 'utf8')});
            await page.addScriptTag({content: ['temVerso', 'versoUnico', 'modoDeVersoDoModelo',
                'atualizarFacesDeImpressaoDoPedido', 'selecionarFaceDeImpressaoDoPedido',
                'faceDeImpressaoDoPedido', 'updatePedSummary', 'onPedNumeracaoSelect',
                'alternarGrupoDaJanela']
                .map(name => extract(pedido, name)).join('\n')
                + '\n' + extract(script, 'numeracaoIdDoItem')});
            if (file === 'index.html') await page.click('#jg-config .jg-botao');
            for (const id of ['ped-print-faces', 'ped-print-only-front', 'ped-print-only-back']) {
                assert.equal(await page.$$eval('#' + id, nodes => nodes.length), 1, file + ': ' + id);
            }
            // A numeração vinculada determina o modo usado ao abrir o modelo.
            for (const mode of ['duplex', 'duplex_unico', 'pdf_odd_even', 'pdf_duplicate_back']) {
                const result = await page.evaluate(mode => {
                    const item = {id: 1, amostra_num_id: 10};
                    state.numeracoes = [{id: 10, print_mode: mode}];
                    const original = JSON.stringify([item, state.numeracoes]);
                    const selectedMode = modoDeVersoDoModelo(item);
                    document.getElementById('ped-print-mode').value = selectedMode;
                    updatePedSummary();
                    return {selectedMode, actualMode: state.printMode,
                        hidden: document.getElementById('ped-print-faces').hidden,
                        unchanged: original === JSON.stringify([item, state.numeracoes])};
                }, mode);
                assert.equal(result.actualMode, result.selectedMode, file + ': modo ' + mode);
                assert.equal(result.hidden, false, file + ': faces visíveis em ' + mode);
                assert.equal(result.unchanged, true);
                await page.click('#ped-print-only-front');
                assert.equal(await page.evaluate(() => faceDeImpressaoDoPedido()), 'front');
                await page.click('#ped-print-only-back');
                assert.equal(await page.$eval('#ped-print-only-front', el => el.checked), false);
                assert.equal(await page.evaluate(() => faceDeImpressaoDoPedido()), 'back');
                await page.evaluate(() => updatePedSummary());
                assert.equal(await page.evaluate(() => faceDeImpressaoDoPedido()), 'back');
                await page.click('#ped-print-only-back');
                assert.equal(await page.evaluate(() => faceDeImpressaoDoPedido()), 'both');
                await page.click('#ped-print-only-front');
                await page.evaluate(() => {state.activeOSItem.itemId++; updatePedSummary();});
                assert.equal(await page.evaluate(() => faceDeImpressaoDoPedido()), 'both');
            }
            await page.click('#ped-print-only-back');
            await page.select('#ped-print-mode', 'front');
            assert.equal(await page.$eval('#ped-print-faces', el => el.hidden), true);
            assert.equal(await page.$eval('#ped-print-only-back', el => el.checked), false);
            assert.equal(await page.evaluate(() => faceDeImpressaoDoPedido()), 'both');
            // Trocar a numeração também passa pelo select verdadeiro, inclusive FxVersoUnico.
            await page.evaluate(() => {
                state.numeracoes = [{id: 10, print_mode: 'duplex_unico'}];
                document.getElementById('ped-numeracao').innerHTML = '<option value="10">Sintética</option>';
                onPedNumeracaoSelect();
            });
            assert.equal(await page.evaluate(() => state.printMode), 'duplex_unico');
            assert.equal(await page.$eval('#ped-print-faces', el => el.hidden), false);
            await page.click('#ped-print-only-front');
            await page.evaluate(() => {state.selectedOSItems = [{itemId: 2}]; updatePedSummary();});
            assert.equal(await page.evaluate(() => faceDeImpressaoDoPedido()), 'both');
            await page.setViewport({width: 400, height: 700});
            await page.click('#ped-print-only-back');
            assert.equal(await page.evaluate(() => faceDeImpressaoDoPedido()), 'back');
            assert.deepEqual(errors, [], file + ': erros no navegador');
            await page.close();
        }
    } finally { await browser.close(); }
}
async function main() {
    await testarTelasReais();
    context.atualizarFacesDeImpressaoDoPedido();
    assert.equal(fields['ped-print-faces'].hidden, false);
    assert.equal(context.faceDeImpressaoDoPedido(), 'both');
    fields['ped-print-only-front'].checked = true;
    context.selecionarFaceDeImpressaoDoPedido('front');
    assert.equal(context.faceDeImpressaoDoPedido(), 'front');
    fields['ped-print-only-back'].checked = true;
    context.selecionarFaceDeImpressaoDoPedido('back');
    assert.equal(fields['ped-print-only-front'].checked, false);
    assert.equal(context.faceDeImpressaoDoPedido(), 'back');
    context.atualizarFacesDeImpressaoDoPedido();
    assert.equal(context.faceDeImpressaoDoPedido(), 'back'); // redesenho preserva a escolha
    fields['ped-print-first-front'].checked = true;
    context.selecionarFolha1DoPedido();
    assert.equal(context.faceDeImpressaoDoPedido(), 'both');
    assert.equal(context.folha1DoPedido().face, 'front');
    fields['ped-print-first-back'].checked = true;
    context.selecionarFolha1DoPedido();
    assert.equal(context.folha1DoPedido().face, 'both');
    context.atualizarFacesDeImpressaoDoPedido();
    assert.equal(context.folha1DoPedido().face, 'both');
    fields['ped-print-first-front'].checked = false;
    assert.equal(context.folha1DoPedido().face, 'back');
    fields['ped-print-only-back'].checked = true;
    context.selecionarFaceDeImpressaoDoPedido('back');
    assert.equal(context.folha1DoPedido(), null);
    fields['ped-print-first-front'].checked = true;
    context.state.activeOSItem.itemId = 2;
    context.atualizarFacesDeImpressaoDoPedido();
    assert.equal(context.folha1DoPedido(), null);
    assert.equal(context.faceDeImpressaoDoPedido(), 'both');
    context.state.printMode = 'front';
    fields['ped-print-only-back'].checked = true;
    context.atualizarFacesDeImpressaoDoPedido();
    assert.equal(fields['ped-print-faces'].hidden, true);
    assert.equal(context.faceDeImpressaoDoPedido(), 'both');
    assert.equal(fields['ped-print-first-back'].disabled, true);
    fields['ped-print-first-front'].checked = true;
    context.atualizarFacesDeImpressaoDoPedido();
    assert.equal(context.folha1DoPedido().face, 'front');
    fields['ped-print-first-back'].checked = true;
    assert.match(context.folha1DoPedido().erro, /não possui verso/);

    const {PDFDocument, PDFName, PDFString} = PDFLib;
    const pdf = await PDFDocument.create();
    pdf.setTitle('Faces sintéticas');
    const profile = pdf.context.stream(new Uint8Array([1,2,3,4]), {N: 3});
    const intent = pdf.context.obj({Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('Teste'), DestOutputProfile: pdf.context.register(profile)});
    pdf.catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([pdf.context.register(intent)]));
    for (let i=0; i<6; i++) {
        const page = pdf.addPage([200+i, 300]);
        page.setRotation(PDFLib.degrees(i % 2 ? 180 : 0));
        page.drawText('Pagina ' + i);
    }
    const blob = new Blob([await pdf.save()]);
    for (const mode of ['duplex', 'duplex_unico', 'pdf_odd_even', 'pdf_duplicate_back']) {
        assert.equal(await context.selecionarFacesDoPdfDoPedido(blob, 'both', mode), blob);
        for (const face of ['front', 'back']) {
            const result = await context.selecionarFacesDoPdfDoPedido(blob, face, mode);
            const read = await PDFDocument.load(await result.arrayBuffer());
            const indices = face === 'front' ? [0,2,4] : [1,3,5];
            assert.deepEqual(read.getPages().map(p=>p.getWidth()), indices.map(i=>200+i));
            assert.deepEqual(read.getPages().map(p=>p.getRotation().angle), indices.map(i=>i%2 ? 180 : 0));
            assert.equal(read.getTitle(), 'Faces sintéticas');
            const icc = read.catalog.lookup(PDFName.of('OutputIntents')).lookup(0).lookup(PDFName.of('DestOutputProfile'));
            assert.deepEqual(Array.from(icc.getContents()), [1,2,3,4]);
        }
    }
    const single = await PDFDocument.create(); single.addPage();
    const odd = new Blob([await single.save()]);
    assert.equal(await context.selecionarFacesDoPdfDoPedido(odd, 'front', 'front'), odd);
    await assert.rejects(context.selecionarFacesDoPdfDoPedido(odd, 'back', 'duplex'), /pares completos/);
    await assert.rejects(context.selecionarFacesDoPdfDoPedido(blob, 'back', 'front'), /não possui verso/);
    await assert.rejects(context.selecionarFacesDoPdfDoPedido(new Blob(['invalid']), 'front', 'duplex'));
    assert.equal(await context.selecionarFacesDoPdfDoPedido(odd, 'back', 'duplex', {file_type: 'capa'}), odd);
    assert.equal(await context.selecionarFacesDoPdfDoPedido(odd, 'back', 'duplex', {name: 'modelo_set1_01_03_contracapa.pdf'}), odd);
    context.window.PDFLib = null;
    await assert.rejects(context.selecionarFacesDoPdfDoPedido(blob, 'front', 'duplex'), /leitor de PDF/);

    // Exercita a entrega real com destinos simulados, sem rede nem impressora.
    const entregaSource = extract(script, 'criarEntregaDeImpressao');
    for (const hot of ['', 'C:/synthetic-hotfolder']) {
        const options = {duplex: 2, hot_folder_path: hot};
        const c = {getPedPrintOptions: () => ({printerName: 'synthetic', options}),
            _hotFolderAtivo: () => !!hot, toast: ()=>{}, window: {}, console};
        vm.createContext(c);
        // Executa o início real da fábrica até a decisão do destino.
        vm.runInContext(entregaSource.slice(0, entregaSource.indexOf('    if (_hotFolderAtivo()')) + '\nreturn options;\n}', c);
        assert.equal(c.criarEntregaDeImpressao({apenasUmaFace:true}).duplex, 1);
        assert.equal(options.hot_folder_path, hot);
    }
    // Contratos dos três formatos de resposta: filtrar antes de qualquer destino.
    assert.match(pedido, /const fBlob = await selecionarFacesDoPdfDoPedido\([\s\S]*?payload.print_mode, fileObj\)/);
    assert.match(pedido, /const multiBlobs = await Promise.all\(data.files.map\(async f =>/);
    assert.match(pedido, /blob: await selecionarFacesDoPdfDoPedido\([\s\S]*?payload.print_mode, f\)/);
    assert.match(pedido, /const blob = await selecionarFacesDoPdfDoPedido\(await res.blob\(\), faceDoTrabalho, payload.print_mode\)/);
    for (const queue of ['printBlobQueue', 'multiBlobs', 'queue']) assert(pedido.includes('sendPrintJobDirect(' + queue + ', opcoesDeFace)'));
    assert(pedido.includes('criarEntregaDeImpressao(opcoesDeFace)'));
    console.log('OK: HTMLs reais, modos vinculados, faces, troca de modelo, PDFs reais, ICC, erros e destinos.');
}
main().catch(e=>{console.error(e); process.exitCode=1;});
