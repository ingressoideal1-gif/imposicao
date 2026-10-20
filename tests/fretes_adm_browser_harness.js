'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'frontend/index.html'), 'utf8');
const painel = html.slice(html.indexOf('<section id="view-fretes"'), html.indexOf('<section id="view-adm"'));

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        // Apenas fixtures e fetch simulado: nenhuma conexão com Supabase.
        await page.setRequestInterception(true);
        page.on('request', req => req.abort());
        await page.setContent(`<button id="nav-fretes"></button>${painel}`);
        const css = fs.readFileSync(path.join(raiz, 'frontend/style.css'), 'utf8').replace(/^@import[^;]+;/gm, '');
        await page.addStyleTag({ content: css });
        await page.addScriptTag({ path: path.join(raiz, 'frontend/supabase-js.min.js') });
        await page.addScriptTag({ content: `
            window.role = 'operador'; window.papelAtual = () => role;
            window.linha = {id:1,cidade:'Cidade <img src=x onerror=alert(1)>',uf:'RS',
                '1kg_SM':10.12345,extra_SM:2,'1kg_UN':null,extra_UN:null,'1kg_MB':0,extra_MB:0};
            window.registros = Array.from({length:51}, (_,i)=>({...linha,id:i+1}));
            window.chamadas=[]; window.modo='normal'; window.logado=true;
            const simular = async (url, opcoes) => {
                const method=opcoes.method || 'GET';
                const corpo=opcoes.body ? JSON.parse(opcoes.body) : null;
                chamadas.push({url:String(url),method,corpo,prefer:new Headers(opcoes.headers).get('prefer')});
                const params=new URL(url).searchParams;
                const resposta=(dados,status=200)=>new Response(JSON.stringify(dados),{status,headers:{'Content-Type':'application/json'}});
                if (modo === 'erro') return resposta({message:'Acesso recusado'},403);
                if (method === 'GET') {
                    if (params.get('select') === 'id') return resposta(modo === 'duplicata' ? [{id:99}] : []);
                    const offset=Number(params.get('offset')||0), limit=Number(params.get('limit')||51);
                    return resposta(modo === 'sem-resultados' ? [] : registros.slice(offset,offset+limit));
                }
                if (method !== 'PATCH') throw new Error('Escrita inesperada');
                if (modo === 'vazio') return resposta([]);
                const registro=registros.find(r=>params.get('id') === 'eq.'+r.id);
                const confere=registro && Object.keys(linha).every(c=>params.get(c) === (registro[c]===null ? 'is.null' : 'eq.'+registro[c]));
                if (!confere) return resposta([]);
                Object.assign(registro,corpo);
                return resposta([registro]);
            };
            const supabaseClient = supabase.createClient('https://fixture.invalid','fixture',{
                auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:simular}
            });
            supabaseClient.auth.getSession=async()=>({data:{session:logado?{access_token:'fixture'}:null}});
            window.admERP=false;window.falhaPerfil=false;
            supabaseClient.rpc=async()=>({data:admERP,error:falhaPerfil?{message:'Indisponivel'}:null});
        ` });
        const modulo = fs.readFileSync(path.join(raiz, 'frontend/script.js'), 'utf8').split('// INICIO ADM FRETES')[1].split('// FIM ADM FRETES')[0];
        await page.addScriptTag({ content: modulo });
        const script = fs.readFileSync(path.join(raiz, 'frontend/script.js'), 'utf8');
        const porteiro = script.slice(script.indexOf('function podeAbrirView(viewId) {'), script.indexOf('window.podeAbrirView = podeAbrirView;'));
        await page.addScriptTag({ content: porteiro });
        for (const perfil of ['', 'operador', 'financeiro', 'expedidor', 'atendimento', 'admin']) {
            const acesso = await page.evaluate(perfil => {
                role = perfil; FretesAdm.atualizarAcesso();
                return { abrir: podeAbrirView('view-fretes'), menu: document.getElementById('nav-fretes').style.display !== 'none' };
            }, perfil);
            assert.deepEqual(acesso, { abrir: perfil === 'admin', menu: perfil === 'admin' });
        }
        const estrutura = await page.evaluate(html => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return {
                paginaIndependente: !doc.getElementById('view-fretes').parentElement.closest('#view-adm'),
                menuDireto: !doc.getElementById('nav-fretes').closest('.nav-group-corpo'),
                abaAntiga: !!doc.querySelector('[data-adm-tab="fretes"], #adm-tab-fretes')
            };
        }, html);
        assert.deepEqual(estrutura, { paginaIndependente: true, menuDireto: true, abaAntiga: false });
        await page.evaluate(async()=>{role='visualizador';admERP=true;await FretesAdm.atualizarAcesso();});
        assert.equal(await page.evaluate(()=>podeAbrirView('view-fretes')),true,'ADM ERP com perfil local visualizador pode abrir');
        assert.notEqual(await page.$eval('#nav-fretes',e=>e.style.display),'none');
        await page.evaluate(async()=>{falhaPerfil=true;await FretesAdm.atualizarAcesso();});
        assert.equal(await page.evaluate(()=>podeAbrirView('view-fretes')),false,'erro de consulta fecha o acesso ERP');
        await page.evaluate(async()=>{falhaPerfil=false;admERP=false;await FretesAdm.atualizarAcesso();});
        await page.evaluate(() => { role = 'operador'; FretesAdm.atualizarAcesso(); });
        await page.evaluate(() => FretesAdm.abrir());
        assert.equal(await page.evaluate(() => chamadas.length), 0, 'operador não consulta');
        assert.equal(await page.$eval('#nav-fretes', e => e.style.display), 'none');
        await page.evaluate(() => { role = 'admin'; FretesAdm.atualizarAcesso(); document.getElementById('view-fretes').classList.add('active'); });
        await page.evaluate(() => FretesAdm.abrir());
        assert.equal(await page.$$eval('#fretes-linhas tr', e => e.length), 50);
        assert.equal(await page.$$eval('#fretes-linhas img', e => e.length), 0, 'texto não vira HTML');
        await page.click('#fretes-proxima');
        await page.waitForFunction(() => document.getElementById('fretes-pagina').textContent === 'Página 2');
        assert.equal(await page.evaluate(() => Number(new URL(chamadas.at(-1).url).searchParams.get('offset'))), 50);
        await page.click('#fretes-linhas button');
        assert.equal(await page.$eval('[name="1kg_SM"]', e => e.value), '10.12345', 'preserva precisão');
        await page.$eval('[name="extra_SM"]', e => { e.value = '-1'; });
        await page.click('#fretes-form button[type=submit]');
        assert.equal(await page.evaluate(() => chamadas.filter(c => c.method === 'PATCH').length), 0);
        await page.$eval('[name="extra_SM"]', e => { e.value = '2,75'; });
        await page.click('#fretes-form button[type=submit]');
        await page.waitForFunction(() => document.getElementById('fretes-status').textContent === 'Alterações salvas.');
        assert.deepEqual(await page.evaluate(() => chamadas.at(-1).corpo), {extra_SM:2.75});
        assert.match(await page.evaluate(() => chamadas.at(-1).prefer), /return=representation/);
        const filtros = await page.evaluate(() => Object.fromEntries(new URL(chamadas.at(-1).url).searchParams));
        assert.equal(filtros.id, 'eq.51', 'atualiza apenas o registro selecionado');
        assert.equal(filtros['1kg_SM'], 'eq.10.12345', 'confere valor original sem arredondar');
        assert.equal(filtros.extra_UN, 'is.null', 'compara NULL corretamente');
        assert.equal(await page.evaluate(() => registros[0].extra_SM), 2, 'outros registros preservados');
        await page.click('#fretes-linhas button');
        await page.$eval('[name="extra_SM"]', e => { e.value = '3'; });
        await page.evaluate(() => { modo = 'vazio'; });
        await page.click('#fretes-form button[type=submit]');
        await page.waitForFunction(() => document.getElementById('fretes-status').textContent.includes('não foi confirmada'));
        assert.equal(await page.$eval('#fretes-editor', e => e.hidden), false, 'mantém edição na falha');
        await page.evaluate(() => { modo = 'erro'; });
        await page.click('#fretes-form button[type=submit]');
        await page.waitForFunction(() => document.getElementById('fretes-status').textContent.includes('Não foi possível confirmar'));
        await page.evaluate(() => { modo='normal'; registros[50].extra_SM=9; });
        await page.click('#fretes-form button[type=submit]');
        await page.waitForFunction(() => document.getElementById('fretes-status').textContent.includes('não foi confirmada'));
        assert.equal(await page.evaluate(() => registros[50].extra_SM), 9, 'não sobrescreve edição concorrente');
        const antesDuplicata = await page.evaluate(() => chamadas.filter(c => c.method === 'PATCH').length);
        await page.evaluate(() => { modo='duplicata'; });
        await page.$eval('[name="cidade"]', e => { e.value='Outra cidade'; });
        await page.click('#fretes-form button[type=submit]');
        await page.waitForFunction(() => document.getElementById('fretes-status').textContent.includes('já está cadastrada'));
        assert.equal(await page.evaluate(() => chamadas.filter(c => c.method === 'PATCH').length), antesDuplicata);
        await page.click('#fretes-cancelar');
        await page.evaluate(() => { role = 'gerente'; FretesAdm.atualizarAcesso(); });
        assert.equal(await page.$$eval('#fretes-linhas tr', e => e.length), 0, 'limpa dados ao perder ADM');
        assert.equal(await page.$eval('#fretes-editor', e => e.hidden), true);
        const antesSemSessao = await page.evaluate(() => chamadas.length);
        await page.evaluate(async () => { role='admin'; logado=false; await FretesAdm.abrir(); });
        assert.equal(await page.evaluate(() => chamadas.length), antesSemSessao, 'não usa acesso anônimo');
        await page.evaluate(async () => { logado=true; modo='sem-resultados'; await FretesAdm.abrir(); });
        assert.equal(await page.$eval('#fretes-status', e => e.textContent), 'Nenhuma cidade encontrada.');
        assert.equal(await page.$eval('#fretes-proxima', e => e.disabled), true);
        // Layout móvel: tabela pode rolar, formulário permanece dentro da tela.
        await page.setViewport({width:390,height:844});
        await page.evaluate(async () => { role='admin'; modo='normal'; FretesAdm.atualizarAcesso(); document.getElementById('view-fretes').classList.add('active'); await FretesAdm.abrir(); });
        await page.click('#fretes-linhas button');
        assert.ok(await page.$eval('#fretes-form', e => e.getBoundingClientRect().right <= 390));
        await page.click('#fretes-cancelar');
        await page.$eval('#fretes-busca', e => { e.value='100%_cidade*'; });
        await page.$eval('#fretes-uf', e => { e.value='rs'; });
        await page.evaluate(() => FretesAdm.abrir());
        const pesquisa = await page.evaluate(() => Object.fromEntries(new URL(chamadas.at(-1).url).searchParams));
        assert.equal(pesquisa.cidade, 'ilike.%100\\%\\_cidade\\*%');
        assert.equal(pesquisa.uf, 'ilike.RS');
        assert.ok(await page.evaluate(() => chamadas.every(c => new URL(c.url).pathname === '/rest/v1/transportadoras')));
        console.log('Fretes ADM: consulta, paginação, edição, precisão, falhas, acesso e layout móvel aprovados.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
