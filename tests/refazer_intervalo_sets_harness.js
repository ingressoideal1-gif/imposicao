const fs = require('node:fs');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/pedido.js', 'utf8').replace(/\r\n/g, '\n');
function extract(name) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless:true});
    try {
        for (const html of ['index.html', 'producao.html']) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.setRequestInterception(true);
            page.on('request', req => req.abort());
            const full = fs.readFileSync('frontend/' + html, 'utf8');
            const start = full.indexOf('<div id="ped-refazer-inputs"');
            const fragment = full.slice(start, full.indexOf('</div>', start) + 6);
            await page.setViewport({width:390,height:700});
            await page.setContent('<body><input type="checkbox" id="ped-refazer-checkbox" checked>' + fragment + '</body>');
            await page.addScriptTag({content: [
                'refazerFolhasAtivo','refazerCelulasAtivo','intervaloRefazerFolhas',
                'sincronizarSetFinalRefazer','sincronizarLimitesRefazer','montarRefazerPayload','resetRefazerControls'
            ].map(extract).join('\n')});
            await page.addScriptTag({content: fs.readFileSync('frontend/arte-de-impressao.js','utf8')});
            const result = await page.evaluate(() => {
                const el = id => document.getElementById('ped-refazer-' + id);
                el('inputs').style.display='flex';el('set').style.display='inline-block';
                el('set').innerHTML='';
                for(let i=1;i<=20;i++) el('set').add(new Option('Set '+i,i));
                window.pedRefazerFolhasPorSet=Array(20).fill(50);
                window.pedRefazerTotalFolhas=50;
                sincronizarSetFinalRefazer();
                el('set').value='3';el('set-ate').value='20';el('de').value='10';el('ate').value='30';
                sincronizarLimitesRefazer();
                const exemplo=intervaloRefazerFolhas(), payload=montarRefazerPayload(true), texto=el('total').textContent;
                let antigoBloqueado=false;
                try { conferirRecursosDoMotor(payload,{capabilities:[]}); } catch(e) { antigoBloqueado=e.message.includes('Atualize o NewProd'); }
                conferirRecursosDoMotor(payload,{capabilities:['refazer_intervalo_sets_v1']});
                el('set-ate').value='';
                const mesmo=montarRefazerPayload(true);
                conferirRecursosDoMotor(mesmo,{capabilities:[]});
                el('set-ate').value='20';el('ate').value='2';
                const finalMenor=intervaloRefazerFolhas();
                el('set-ate').value='2';const invertido=montarRefazerPayload(true);
                el('set-ate').value='20';window.pedRefazerFolhasPorSet[19]=20;el('ate').value='30';
                sincronizarLimitesRefazer();const fora=montarRefazerPayload(true), maxFinal=el('ate').max;
                el('ate').value='';const vazio=montarRefazerPayload(true);
                el('ate').value='1';el('de').value='1.5';const fracao=montarRefazerPayload(true);
                resetRefazerControls();
                return {exemplo,payload,texto,antigoBloqueado,mesmo,finalMenor,invertido,fora,maxFinal,vazio,fracao,
                    reset:el('set-ate').value==='' && !el('checkbox').checked,
                    largura:document.documentElement.scrollWidth};
            });
            assert.equal(result.exemplo.total,871);
            assert.equal(result.payload.refazer_set,3);
            assert.equal(result.payload.refazer_set_ate,20);
            assert.equal(result.payload.refazer_de,10);
            assert.equal(result.payload.refazer_ate,30);
            assert(result.payload.sufixo.includes('set3_folha10-set20_folha30'));
            assert(result.texto.includes('871 folha(s) físicas'));
            assert(result.antigoBloqueado);
            assert.equal(result.mesmo.refazer_set_ate,undefined);
            assert.equal(result.finalMenor.total,843);
            for(const name of ['invertido','fora','vazio','fracao']) assert(result[name].erro,name);
            assert.equal(result.maxFinal,'20');
            assert(result.reset);
            assert(result.largura<=390);
            assert.deepEqual(errors,[]);
            const draw = extract('drawPedPreview');
            const limite = draw.indexOf('    // ─── REFAZER CÉLULA: A PRÉVIA');
            assert(limite > 0);
            await page.addScriptTag({content: extract('buildStrictAssemblySets') + '\n' + draw.slice(0, limite) + '}'});
            const ticket = await page.evaluate(() => {
                for (const [tag, id] of [['canvas', 'ped-preview-canvas'], ['select', 'ped-preview-set-input']]) {
                    const el = document.createElement(tag);
                    el.id = id;
                    document.body.appendChild(el);
                }
                const linhas = Array.from({length: 8000}, (_, i) => ({codigo: String(200003 + i * 5)}));
                const num = {id: 't', tipo: 'TICKET', ticket_qtd: 5, csv_data: linhas};
                const item = {id: 'm', formato_id: 'f', numeracao_id: 't', saida_id: 's',
                    qtd: 8000, numeracao_inicio: 200003, numeracao_fim: 240002};
                Object.assign(window, {
                    state: {
                        activeOSItem: {osId: 'p', itemId: 'm'}, osItens: {p: [item]},
                        formatos: [{id: 'f', default_schema: 'cut_stack', default_saida_id: 's', default_cut_stack_mode: 'strict_assembly', cols: 30, rows: 1, width_mm: 20, height_mm: 20}],
                        saidas: [{id: 's', width_mm: 650, height_mm: 400}], numeracoes: [num],
                        csvData: [...linhas, {__ativo: false}], printMode: 'front'
                    },
                    atualizarIndicadorModeloComVerso() {},
                    blocagemDoModelo: () => ({folhas: 10}),
                    faixaEfetivaDoModelo: () => ({inicio: 200003, fim: 240002}),
                    modoDeVersoDoModelo: () => 'front',
                    mostrarControleDaPrevia(el, mostrar) { el.style.display = mostrar ? 'inline-block' : 'none'; },
                    linhasAtivasCsv: rows => rows.filter(row => row.__ativo !== false)
                });
                const modo = document.createElement('input');
                modo.id = 'ped-cutstack-mode';
                modo.value = 'strict_assembly';
                document.body.appendChild(modo);
                const el = id => document.getElementById('ped-refazer-' + id);
                const lerTotais = () => ({
                    celulas: window.pedRefazerTotalCelulas,
                    setDe: el('set').options.length,
                    setAte: el('set-ate').options.length - 1,
                    folhasFinais: window.pedRefazerFolhasPorSet.at(-1)
                });
                drawPedPreview();
                const banco = lerTotais();
                el('set').value = '1';
                el('set-ate').value = '27';
                el('de').value = '10';
                el('ate').value = '7';
                const intervalo = intervaloRefazerFolhas();
                el('ate').value = '8';
                const fora = intervaloRefazerFolhas();
                state.csvData = null;
                num.csv_data = [];
                drawPedPreview();
                return {banco, sequencial: lerTotais(), intervalo, fora};
            });
            assert.deepEqual(ticket.banco, {celulas: 8000, setDe: 27, setAte: 27, folhasFinais: 7});
            assert.deepEqual(ticket.sequencial, ticket.banco);
            assert.equal(ticket.intervalo.total, 258);
            assert.match(ticket.fora.erro, /não existe/);
            assert.deepEqual(errors, []);
            console.log(html + ': TICKET de 5 vias com 8000 células, 27 sets e limite do último set OK');
            await page.close();
            console.log(html+': intervalo 3/10 a 20/30, limites, legado, capacidade e 390px OK');
        }
    } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
