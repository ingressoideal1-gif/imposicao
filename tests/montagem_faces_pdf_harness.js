// Regressões com o código completo da Montagem e PDFs reais, sem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PDFLib = require('pdf-lib');
const raiz = path.dirname(__dirname);
const contexto = {
    window: { PDFLib }, Blob, console,
    state: { numeracoes: [], osItens: {}, formatos: [], saidas: [] },
    document: { getElementById: () => null },
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(raiz, 'frontend/montagem.js'), 'utf8'), contexto);

async function testar() {
    const { PDFDocument, PDFName, PDFString } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle('Montagem sintética');
    const perfil = doc.context.stream(new Uint8Array([1, 2, 3, 4]), { N: 3 });
    const intent = doc.context.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1',
        OutputConditionIdentifier: PDFString.of('Perfil de teste'), DestOutputProfile: doc.context.register(perfil) });
    doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([doc.context.register(intent)]));
    for (let i = 0; i < 6; i++) {
        const p = doc.addPage([300 + i, 400]);
        p.setRotation(PDFLib.degrees(i % 2 ? 90 : 0));
        p.drawText((i % 2 ? 'VERSO ' : 'FRENTE ') + Math.floor(i / 2 + 1), { x: 30, y: 40 });
    }
    const blob = new Blob([await doc.save()], { type: 'application/pdf' });
    for (const modo of ['duplex', 'duplex_unico']) {
        for (const face of ['both', 'front', 'back']) {
            const saida = await contexto.selecionarFacesDoPdfDaMontagem(blob, face, modo, 3);
            const pdf = await PDFDocument.load(await saida.arrayBuffer());
            const indices = face === 'both' ? [0, 1, 2, 3, 4, 5] : face === 'front' ? [0, 2, 4] : [1, 3, 5];
            assert.deepEqual(pdf.getPages().map(p => p.getWidth()), indices.map(i => 300 + i));
            assert.deepEqual(pdf.getPages().map(p => p.getRotation().angle), indices.map(i => i % 2 ? 90 : 0));
            assert.equal(pdf.getTitle(), 'Montagem sintética');
            const intents = pdf.catalog.lookup(PDFName.of('OutputIntents'));
            const icc = intents.lookup(0).lookup(PDFName.of('DestOutputProfile'));
            assert.deepEqual(Array.from(icc.getContents()), [1, 2, 3, 4]);
        }
    }
    await assert.rejects(contexto.selecionarFacesDoPdfDaMontagem(blob, 'back', 'front', 3), /não possui verso/);
    await assert.rejects(contexto.selecionarFacesDoPdfDaMontagem(blob, 'front', 'duplex', 2), /quantidade inesperada/);
    await assert.rejects(contexto.selecionarFacesDoPdfDaMontagem(new Blob(['inválido']), 'back', 'duplex', 1));
    const leitor = contexto.window.PDFLib;
    contexto.window.PDFLib = null;
    await assert.rejects(contexto.selecionarFacesDoPdfDaMontagem(blob, 'back', 'duplex', 3), /leitor de PDF/);
    contexto.window.PDFLib = leitor;

    contexto.state.numeracoes = [{ id: 'F', print_mode: 'front' }, { id: 'V', print_mode: 'duplex' }, { id: 'U', print_mode: 'duplex_unico' }];
    const peca = item => ({ formato_id: 'F1', saida_id: 'S1', cor: 'azul', print_mode: contexto.modoDoModeloNaMontagem(item) });
    const frente = peca({ numeracao_id: 'F', verso_tipo: 'FRENTE E VERSO', verso: true });
    const verso = peca({ numeracao_id: 'V', verso_tipo: 'Frente' });
    assert.equal(frente.print_mode, 'front');
    assert.equal(verso.print_mode, 'duplex');
    assert.match(contexto.porQueNaoCabeNaMontagem(frente, verso), /frente e verso/);
    assert.equal(contexto.porQueNaoCabeNaMontagem(verso, peca({ numeracao_id: 'V', verso: true })), null);
    assert.match(contexto.porQueNaoCabeNaMontagem(verso, peca({ numeracao_id: 'U' })), /paginações/);
    for (const legado of ['Frente', 'SÓ FRENTE', 'SO FRENTE', ' frente ']) {
        assert.equal(contexto.modoDoModeloNaMontagem({ verso_tipo: legado }), 'front');
    }
    assert.equal(contexto.modoDoModeloNaMontagem({ verso: true }), 'duplex');

    // Uma face que mudou no catálogo precisa ser recusada antes do construtor.
    const item = { id: 'M', formato_id: 'F1', saida_id: 'S1', cor: 'azul', numeracao_id: 'V', qtd: 10 };
    contexto.state.formatos = [{ id: 'F1', cols: 1, rows: 10 }];
    contexto.state.osItens = { A: [item] };
    contexto.state.ordens = [{ id: 'A', status_interno: 'EM PRODUCAO' }, { id: 'B', status_interno: 'EM PRODUCAO' }];
    contexto.arteDoModeloParaFolha = () => { throw new Error('não deveria construir'); };
    contexto.arteParaOMotor = x => x;
    await assert.rejects(contexto.prepararArtesDaMontagem([{ osId: 'A', itemId: 'M', peca: frente }]), /mudou desde a montagem/);

    item.status_impressao = 'Impresso';
    await assert.rejects(contexto.prepararArtesDaMontagem([{ osId: 'A', itemId: 'M', peca: verso }]), /modelo M Aguardando/);
    item.status_impressao = 'Aguardando';
    contexto.state.ordens[0].status_interno = 'EXPEDICAO';
    await assert.rejects(contexto.prepararArtesDaMontagem([{ osId: 'A', itemId: 'M', peca: verso }]), /precisa estar Em produção/);
    contexto.state.ordens[0].status_interno = 'EM PRODUCAO';

    // Banco de outro pedido no intervalo assíncrono nunca chega à arte.
    contexto.garantirBancosDoTrabalho = async () => { contexto.state._bancosPedidoDe = 'B'; };
    await assert.rejects(contexto.prepararArtesDaMontagem([{ osId: 'A', itemId: 'M', peca: verso }]), /bancos de dados/);

    // Não iniciar geração com carregamentos pendentes, nem exibir uma resposta antiga.
    contexto.state.montagem = contexto.montagemVazia();
    contexto.state.osItens = { A: [{ id: 'MA' }], B: [{ id: 'MB' }] };
    const pedido = { value: 'A' }, modelo = {}, pendentes = {}, avisos = [];
    contexto.document.getElementById = id => ({ 'mtg-pedido': pedido, 'mtg-modelo': modelo }[id] || null);
    contexto.escapeHtml = String;
    contexto.renderMontagem = () => {};
    contexto.toast = m => avisos.push(m);
    contexto.garantirBancosDoTrabalho = async () => {};
    contexto.loadOSItens = id => new Promise(r => { pendentes[id] = r; });
    const a = contexto.onMontagemPedidoChange();
    pedido.value = 'B';
    const b = contexto.onMontagemPedidoChange();
    await contexto.gerarPdfDaMontagem();
    assert.match(avisos[0], /Aguarde o carregamento/);
    pendentes.B(); await b;
    pendentes.A(); await a;
    assert.equal(contexto.state.montagem.carregando, 0);
    assert.match(modelo.innerHTML, /MB/);
    assert.doesNotMatch(modelo.innerHTML, /MA/);
    console.log('OK: faces, ordem, rotação, perfil ICC, compatibilidade e revalidação da Montagem.');
}

// Usado pelo teste de integração: recebe exclusivamente PDFs sintéticos do tmp_path.
if (process.argv[2]) {
    const [entrada, frente, verso, modo, folhas] = process.argv.slice(2);
    (async () => {
        const blob = new Blob([fs.readFileSync(entrada)], { type: 'application/pdf' });
        for (const [face, arquivo] of [['front', frente], ['back', verso]]) {
            const resultado = await contexto.selecionarFacesDoPdfDaMontagem(blob, face, modo, Number(folhas));
            fs.writeFileSync(arquivo, Buffer.from(await resultado.arrayBuffer()));
        }
    })().catch(e => { console.error(e); process.exitCode = 1; });
} else testar().catch(e => { console.error(e); process.exitCode = 1; });
