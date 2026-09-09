// Campos reais em um navegador, com dados sinteticos e toda a rede bloqueada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const puppeteer = require('puppeteer');
const raiz = path.dirname(__dirname);
const fonte = fs.readFileSync(path.join(raiz, 'frontend/acabamento.js'), 'utf8');

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1100, height: 800 });
        await page.setRequestInterception(true);
        page.on('request', req => req.abort());
        await page.setContent('<html><body style="background:#0d0e20;color:white;font-family:Arial"></body></html>');
        // Exposicao apenas nesta copia em memoria para montar os componentes reais.
        const gancho = 'window.__camposPeso = { montarPopupDaLiberacao, montarPopupDoPeso, '
            + 'htmlDoPesoDoGrupo, htmlDasLinhasDoRegistro, blocoDePesoNoResumo };';
        const fim = fonte.lastIndexOf('})();');
        assert(fim > 0);
        await page.addScriptTag({ content: fonte.slice(0, fim) + gancho + fonte.slice(fim) });
        await page.evaluate(() => {
            window._currentPerms = { perm_acabamento_edit: true };
            const t = AcabamentoPainel._tela;
            t.temSessao = true;
            t.pesos = { PVC: { peso: 4.16, existe: true } };
            t.registroEmCurso = { linhas: [{ modeloId: 1, qtd: 1, peso: 4.16 }], pesoDoGrupo: '4160' };
            const grupo = document.createElement('div');
            grupo.innerHTML = __camposPeso.htmlDoPesoDoGrupo();
            document.body.appendChild(grupo);
            t.registroEmCurso.porModelo = true;
            const linha = document.createElement('div');
            linha.innerHTML = __camposPeso.htmlDasLinhasDoRegistro();
            document.body.appendChild(linha);
            const setor = document.createElement('div');
            setor.innerHTML = __camposPeso.blocoDePesoNoResumo([{ setor: 'PVC' }], 200);
            document.body.appendChild(setor);
            __camposPeso.montarPopupDoPeso();
            __camposPeso.montarPopupDaLiberacao().style.display = 'flex';
        });
        for (const id of ['acab-reg-peso', 'acab-reg-peso-0', 'acab-peso-PVC']) {
            const valor = await page.$eval('#' + id, el => ({ valor: el.value, unidade: el.nextElementSibling.textContent.trim() }));
            assert.deepEqual(valor, { valor: '4160', unidade: 'g' }, id);
        }
        assert.equal(await page.$eval('#acab-peso-obrig-campo', el => el.nextElementSibling.textContent.trim()), 'g');
        await page.type('#acab-liberacao-senha', 'x00');
        const senha = await page.$eval('#acab-liberacao-senha', el => ({ tipo: el.type, mascara: getComputedStyle(el).webkitTextSecurity, valor: el.value }));
        assert.equal(senha.tipo, 'password');
        assert.equal(senha.mascara, 'disc');
        assert.equal(senha.valor, 'X00');
        const preview = path.join(os.tmpdir(), 'acabamento-gramas-senha.png');
        await page.screenshot({ path: preview });
        await page.click('#acab-liberacao-cancelar');
        assert.equal(await page.$eval('#acab-liberacao-senha', el => el.value), '');
        console.log('OK: campos em gramas e senha mascarada no navegador. Preview: ' + preview);
    } finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
