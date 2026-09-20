'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');

const raiz = path.join(__dirname, '..');
const htmlCompleto = fs.readFileSync(path.join(raiz, 'frontend', 'index.html'), 'utf8');
const dashboardHtml = htmlCompleto.match(/<section id="dashboard-arte"[\s\S]*?<\/section>/)[0];

['index.html', 'producao.html'].forEach(arquivo => {
    const pagina = fs.readFileSync(path.join(raiz, 'frontend', arquivo), 'utf8');
    const listaArte = pagina.slice(pagina.indexOf('<section id="view-lista-arte"'));
    const grade = listaArte.slice(listaArte.indexOf('<div class="stats-grid">'), listaArte.indexOf('<section id="dashboard-arte"'));
    assert.ok(grade.indexOf('card-stat-dashboard-arte') < grade.indexOf('card-stat-pedidos-todos'), `${arquivo}: dashboard é o primeiro card`);
    assert.match(pagina, /dashboard-arte\.js\?v=917/, `${arquivo}: carrega o dashboard`);
});

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', erro => erros.push(erro.message));
        await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 1 });
        await page.setContent(`<!doctype html><meta charset="utf-8"><body style="background:#080f1d;color:#fff;margin:24px">
            <select id="os-filter-designer"><option value="">Todos</option><option>Ana</option><option>Bia</option></select>
            ${dashboardHtml}</body>`);
        await page.addStyleTag({ path: path.join(raiz, 'frontend', 'style.css') });
        await page.addScriptTag({ content: `
            const agora = new Date();
            const iso = (dias, horas) => new Date(agora.getTime() - dias * 86400000 - horas * 3600000).toISOString();
            const state = {
                ordens: [
                    {id:'1',numero:1,_fila_arte:'concluidos',status_calculado:'APROVADO',created_at:iso(0,7)},
                    {id:'2',numero:2,_fila_arte:'concluidos',status_calculado:'APROVADO',created_at:iso(1,5)},
                    {id:'3',numero:3,_fila_arte:'fila',status_calculado:'Em Arte',created_at:iso(0,3)},
                    {id:'4',numero:4,_fila_arte:'fila',status_calculado:'Em Alteração',created_at:iso(0,4)},
                    {id:'5',numero:5,_fila_arte:'aprovacao',status_calculado:'Em Aprovação',created_at:iso(2,2)}
                ],
                todasArtes: [
                    {id_int:1,designer_nome:'Ana'},{id_int:2,designer_nome:'Bia'},
                    {id_int:3,designer_nome:'Ana'},{id_int:4,designer_nome:'Bia'},{id_int:5,designer_nome:'Ana'}
                ],
                modelosGlobais: {
                    1:[{nome_modelo:'Ingresso VIP'},{nome_modelo:'Ingresso VIP'}],
                    2:[{nome_modelo:'Credencial'}],3:[{nome_modelo:'Pulseira'}],
                    4:[{nome_modelo:'Ingresso Padrão'}],5:[{nome_modelo:'Credencial'}]
                },
                temposNoCard: {
                    1:{card:'concluidos',desde:iso(0,2),saiu_da_fila_em:iso(0,2),credito_segundos:5100},
                    2:{card:'concluidos',desde:iso(1,1),saiu_da_fila_em:iso(1,1),credito_segundos:9300},
                    3:{card:'fila',desde:iso(0,2),saiu_da_fila_em:null,credito_segundos:600},
                    4:{card:'fila',desde:iso(0,3),saiu_da_fila_em:null,credito_segundos:1200}
                }
            };
            function getOSDesigner(id, numero) { return state.todasArtes.find(a => a.id_int === Number(numero))?.designer_nome || ''; }
            function pedidoIgnoradoNosPaineis() { return false; }
        ` });
        await page.addScriptTag({ path: path.join(raiz, 'frontend', 'dashboard-arte.js') });
        await page.evaluate(() => {
            document.getElementById('dashboard-arte').hidden = false;
            renderDashboardArte();
        });

        assert.equal(await page.$$eval('.dashboard-arte-kpi', els => els.length), 6, 'seis indicadores principais');
        assert.equal(await page.$$eval('.dashboard-arte-tabela', els => els.length), 2, 'tabelas por designer e modelo');
        assert.ok(await page.$$eval('.dashboard-arte-barra-col', els => els.length) >= 7, 'série diária desenhada');
        assert.match(await page.$eval('#dashboard-arte-periodo-texto', el => el.textContent), /Toda a equipe/);

        await page.select('#os-filter-designer', 'Ana');
        await page.evaluate(() => renderDashboardArte());
        assert.match(await page.$eval('#dashboard-arte-periodo-texto', el => el.textContent), /^Ana/);

        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
        const largura = await page.$eval('#dashboard-arte', el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
        assert.ok(largura.scroll <= largura.client + 2, `dashboard móvel sem estouro (${JSON.stringify(largura)})`);
        assert.deepEqual(erros, [], erros.join('\n'));

        if (process.argv[2]) await page.screenshot({ path: process.argv[2], fullPage: true });
        console.log('dashboard_arte_browser_harness: ok');
    } finally {
        await browser.close();
    }
})().catch(erro => {
    console.error(erro);
    process.exitCode = 1;
});
