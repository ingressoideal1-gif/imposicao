// Chromium real, Quill local, dados sintéticos e rede bloqueada.
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
    const browser = await puppeteer.launch({headless:true});
    try {
        const page = await browser.newPage();
        const requests = [], errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', r => { requests.push(r.url()); r.abort(); });
        await page.setViewport({width:1000,height:950});
        await page.setContent('<!doctype html><html><body></body></html>');
        for (const file of ['frontend/vendor/quill-2.0.3/quill.core.css','frontend/style.css']) {
            await page.addStyleTag({content:fs.readFileSync(file,'utf8').replace(/^@import[^\n]*\n/m,'')});
        }
        await page.addScriptTag({content:fs.readFileSync('frontend/vendor/quill-2.0.3/quill.js','utf8')});
        await page.addScriptTag({content:fs.readFileSync('frontend/briefing-editor.js','utf8')});
        const inicio = source.indexOf('        let obsAccordionHtml = uniqueProducts.map');
        const fim = source.indexOf("        }).join('');", inicio) + "        }).join('');".length;
        await page.addScriptTag({content:`
            const uniqueProducts = [{id:'p1',nome:'Ingresso sintético',quantidade:100},{id:'p2',nome:'Pulseira sintética',quantidade:50}];
            const osNum = '1';
            ${source.slice(inicio,fim)}
            document.body.innerHTML = '<main style="max-width:550px;margin:24px auto">' + obsAccordionHtml + '</main>';
            const CHAVE_INFORMACOES_PENDENTES = '_pendencias';
            const state = {pedidosArtesData:{1:{observacoes:{p1:'Texto revisado\\nNova linha'}}},osItens:{teste:[{id_produto_proposta_origem:'p1'},{id_produto_proposta_origem:'p2',observacoes:'  Linha original\\n\\n    Recuo preservado  '}]}};
            const painelPendenciasBriefingEstaAberto = () => false;
            const atualizarResumoPendenciasBriefing = () => {};
            const saves = [];
            const saveBriefingField = (...args) => {saves.push(args); state.pedidosArtesData[args[0]].observacoes[args[4]] = args[2];};
            ${extrair('criarConteudoObservacaoBriefing')}
            ${extrair('atualizarLeituraObservacaoBriefing')}
            ${extrair('updateBriefingUI')}
            const campo = () => document.getElementById('briefing-obs-item-p1');
            const quill = () => campo()._quillBriefing;
            updateBriefingUI('teste',1);
        `});
        assert.equal(await page.evaluate(() => !!campo()._quillBriefing), false, 'Inicialização sob demanda');
        await page.click('.briefing-obs-edicao summary');
        await page.waitForSelector('#briefing-obs-item-p1 .ql-editor');
        assert.equal(await page.evaluate(() => saves.length),0,'Abrir não grava');
        assert.equal(await page.evaluate(() => quill().getText()),'Texto revisado\nNova linha\n');
        // Seleção com teclado real, seguida por botão e seletores reais.
        await page.click('#briefing-obs-item-p1 .ql-editor');
        await page.keyboard.down('Control'); await page.keyboard.press('Home'); await page.keyboard.up('Control');
        await page.keyboard.down('Shift');
        for (let i=0;i<5;i++) await page.keyboard.press('ArrowRight');
        await page.keyboard.up('Shift');
        await page.waitForFunction(() => campo()._briefingFaixa?.length === 5);
        await page.click('[data-acao="bold"]');
        await page.focus('select[aria-label="Tamanho da fonte"]');
        await page.evaluate(() => { window.instancia = quill(); updateBriefingUI('teste',1); });
        assert.equal(await page.evaluate(() => quill() === window.instancia),true);
        await page.select('select[aria-label="Tamanho da fonte"]','24px');
        await page.select('select[aria-label="Cor do texto"]','#b91c1c');
        const formato = await page.evaluate(() => ({primeiro:quill().getFormat(0,5),restante:quill().getFormat(6,8),texto:quill().getText()}));
        assert.equal(formato.primeiro.bold,true);
        assert.equal(formato.primeiro.size,'24px');
        assert.equal(formato.primeiro.color,'#b91c1c');
        assert.equal(formato.restante.bold,undefined);
        assert.equal(formato.restante.size,undefined);
        assert.equal(formato.restante.color,undefined);
        assert.equal(formato.texto,'Texto revisado\nNova linha\n');
        const botao = async texto => {
            const buttons = await page.$$('.briefing-obs-edicao button');
            for (const b of buttons) if (await b.evaluate((el, alvo) => el.textContent.trim() === alvo, texto)) { await b.click(); return; }
            throw Error('Botão não encontrado: '+texto);
        };
        await botao('Desfazer');
        assert.equal(await page.evaluate(() => quill().getFormat(0,5).color),undefined);
        await botao('Refazer');
        assert.equal(await page.evaluate(() => quill().getFormat(0,5).color),'#b91c1c');
        // Sem seleção: não aplica ao restante nem envia nova gravação.
        await page.evaluate(() => quill().setSelection(6,0,'user'));
        const antes = await page.evaluate(() => saves.length);
        await page.select('select[aria-label="Tamanho da fonte"]','18px');
        assert.equal(await page.evaluate(() => saves.length),antes);
        // Reabre uma instância nova com o HTML efetivamente enviado à persistência.
        const salvo = await page.evaluate(() => state.pedidosArtesData[1].observacoes.p1);
        await page.evaluate(() => {
            const area = campo().closest('details'); area.open = false;
            const novo = campo().cloneNode(false); novo.className = 'briefing-obs-editor'; campo().replaceWith(novo);
            updateBriefingUI('teste',1); area.open = true; BriefingEditor.abrir(area);
        });
        assert.equal(await page.evaluate(() => quill().getFormat(0,5).size),'24px');
        assert.equal(await page.evaluate(() => quill().getFormat(0,5).color),'#b91c1c');
        assert.equal(await page.evaluate(() => state.pedidosArtesData[1].observacoes.p1),salvo);
        // Arraste real seleciona apenas 'revisado'.
        const pontos = await page.evaluate(() => {
            const [no,offset] = quill().getLeaf(6), [fim,offsetFim] = quill().getLeaf(14);
            const a = document.createRange(); a.setStart(no.domNode,offset); a.collapse(true);
            const b = document.createRange(); b.setStart(fim.domNode,offsetFim); b.collapse(true);
            const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
            return {x1:ra.x,y1:ra.y+ra.height/2,x2:rb.x,y2:rb.y+rb.height/2};
        });
        await page.mouse.move(pontos.x1,pontos.y1); await page.mouse.down();
        await page.mouse.move(pontos.x2,pontos.y2,{steps:12}); await page.mouse.up();
        await page.waitForFunction(() => campo()._briefingFaixa?.length === 8);
        await page.select('select[aria-label="Cor do texto"]','#1d4ed8');
        assert.equal(await page.evaluate(() => quill().getFormat(6,8).color),'#1d4ed8');
        assert.equal(await page.evaluate(() => quill().getFormat(0,5).color),'#b91c1c');
        await botao('Selecionar tudo');
        await page.select('select[aria-label="Tamanho da fonte"]','18px');
        assert.equal(await page.evaluate(() => quill().getFormat(0,quill().getLength()-1).size),'18px');
        // Conteúdo ERP: formatação, listas com início diferente, espaços e tabela.
        const compat = await page.evaluate(() => {
            const area = campo().closest('details'); area.open = false;
            state.pedidosArtesData[1].observacoes.p1 = '<p><strong>ATENÇÃO</strong>  <em>Evento</em></p><ol start="3"><li>Frente azul</li><li>Verso branco</li></ol><table><tbody><tr><td>Setor A</td><td>Setor B</td></tr></tbody></table>';
            updateBriefingUI('teste',1); area.open = true;
            const q = quill(); q.setSelection(0,7,'user');
            BriefingEditor.formatar(area.querySelector('select'), 'color','#047857');
            return {html:state.pedidosArtesData[1].observacoes.p1,text:q.getText()};
        });
        assert.match(compat.html,/<ol start="3">/);
        assert.match(compat.html,/<table/);
        assert.match(compat.html,/Setor&nbsp;A/);
        assert.match(compat.html,/Setor&nbsp;B/);
        assert.match(compat.text,/ATENÇÃO  Evento/);
        // A edição do produto 1 não altera o produto 2.
        assert.equal(await page.evaluate(() => state.pedidosArtesData[1].observacoes.p2),undefined);
        // Colagem maliciosa não entra no DOM ou no HTML salvo.
        await page.$eval('#briefing-obs-item-p1 .ql-editor', el => {
            el.focus(); const dt = new DataTransfer();
            dt.setData('text/html','<p><b>Colado</b><img src="https://invalid.example/x" onerror="window.invadiu=1"><script>window.invadiu=1</script></p>');
            el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));
        });
        assert.equal(await page.evaluate(() => !!campo().querySelector('img,script,[onerror]') || !!window.invadiu),false);
        assert.doesNotMatch(await page.evaluate(() => state.pedidosArtesData[1].observacoes.p1),/img|script|onerror/);
        // Outra instância mantém os espaços e linhas vazias sem gravação ao abrir.
        const totalAntesSegundo = await page.evaluate(() => saves.length);
        await page.evaluate(() => {
            const area = document.getElementById('briefing-obs-item-p2').closest('details');
            area.open = true; BriefingEditor.abrir(area);
        });
        assert.equal(await page.evaluate(() => document.getElementById('briefing-obs-item-p2')._quillBriefing.getText()), '  Linha original\n\n    Recuo preservado  \n');
        assert.equal(await page.evaluate(() => saves.length),totalAntesSegundo);
        // Seleção entre parágrafos formata só os caracteres selecionados.
        await page.evaluate(() => {
            const p2 = document.getElementById('briefing-obs-item-p2');
            p2._quillBriefing.setSelection(4,20,'user');
            BriefingEditor.formatar(p2.closest('details').querySelector('button'), 'bold');
        });
        assert.equal(await page.evaluate(() => document.getElementById('briefing-obs-item-p2')._quillBriefing.getFormat(4,20).bold),true);
        assert.equal(await page.evaluate(() => document.getElementById('briefing-obs-item-p2')._quillBriefing.getFormat(0,2).bold),undefined);
        // Primeira carga atrasada pode chegar depois de o campo ser aberto.
        await page.evaluate(() => {
            const p2 = document.getElementById('briefing-obs-item-p2');
            const novo = p2.cloneNode(false); novo.className = 'briefing-obs-editor'; p2.replaceWith(novo);
            BriefingEditor.abrir(novo.closest('details'));
            BriefingEditor.carregar(novo, 'Carregamento inicial atrasado');
        });
        assert.equal(await page.evaluate(() => document.getElementById('briefing-obs-item-p2')._quillBriefing.getText()),'Carregamento inicial atrasado\n');
        // Falta da biblioteca mantém a leitura e oferece mensagem de recuperação.
        await page.evaluate(() => {
            const p2 = document.getElementById('briefing-obs-item-p2');
            const novo = p2.cloneNode(false); novo.className = 'briefing-obs-editor'; p2.replaceWith(novo);
            const anterior = window.Quill; window.Quill = undefined;
            BriefingEditor.abrir(novo.closest('details')); window.Quill = anterior;
        });
        assert.match(await page.$eval('#briefing-obs-item-p2', el => el.closest('details').querySelector('[role="status"]').textContent), /Atualize a página/);
        await page.evaluate(() => { document.getElementById('briefing-obs-item-p2').closest('details').open = false; });
        await page.setViewport({width:390,height:950});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
        if (process.env.BRIEFING_SCREENSHOT) await page.screenshot({path:process.env.BRIEFING_SCREENSHOT,fullPage:true});
        assert.deepEqual(requests,[]);
        assert.deepEqual(errors,[]);
        console.log('OK: Quill local, seleção por teclado/arraste, atualização concorrente, cor/tamanho/negrito, undo/redo, reabertura, listas/tabela, isolamento, colagem segura e mobile.');
    } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
