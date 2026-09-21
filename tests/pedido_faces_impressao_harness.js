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
    'ped-print-only-back': {checked: false}
};
const context = {window: {PDFLib}, Blob, console,
    state: {printMode: 'duplex', activeOSItem: {itemId: 1}, selectedOSItems: [1]},
    document: {getElementById: id => fields[id] || null}};
vm.createContext(context);
for (const name of ['temVerso', 'atualizarFacesDeImpressaoDoPedido', 'selecionarFaceDeImpressaoDoPedido', 'faceDeImpressaoDoPedido', 'selecionarFacesDoPdfDoPedido']) {
    vm.runInContext(extract(pedido, name), context);
}
async function main() {
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
    context.state.activeOSItem.itemId = 2;
    context.atualizarFacesDeImpressaoDoPedido();
    assert.equal(context.faceDeImpressaoDoPedido(), 'both');
    context.state.printMode = 'front';
    fields['ped-print-only-back'].checked = true;
    context.atualizarFacesDeImpressaoDoPedido();
    assert.equal(fields['ped-print-faces'].hidden, true);
    assert.equal(context.faceDeImpressaoDoPedido(), 'both');

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
    console.log('OK: faces, troca de modelo, PDFs reais, ICC, erros e destinos.');
}
main().catch(e=>{console.error(e); process.exitCode=1;});
