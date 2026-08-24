/**
 * O recorte do fundo do PWA, e a promessa de que o script nao derruba a casa.
 *
 * Duas coisas se conferem aqui, e as duas so aparecem em navegador:
 *
 *   1. O RECORTE. Foto deitada, em pe e quadrada tem de virar 9:16 guardando o
 *      pedaco certo. Errar aqui corta a cabeca da plateia, e ninguem descobre
 *      ate a foto estar no celular do cliente.
 *
 *   2. O ARRANQUE do `fundo-do-app.js` com um cliente do Supabase REDUZIDO --
 *      que e o que existe em harness, em tela de teste e em qualquer estado
 *      meio-montado. Ele nao pode lancar excecao: fundo e acabamento, e
 *      acabamento nao pode impedir o cliente de achar o evento dele. Foi
 *      exatamente esse o defeito que 116 testes pegaram em 24/08/2026.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const RAIZ = path.resolve(__dirname, '..');
const FRENTE = path.join(RAIZ, 'frontend');

let falhas = 0;
function confere(nome, condicao, detalhe) {
    if (condicao) { console.log('  ok   ' + nome); }
    else { falhas++; console.log('  FALHOU ' + nome + (detalhe ? ' -> ' + detalhe : '')); }
}

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e)));

    await page.setContent('<!doctype html><html><body></body></html>');

    // ── 1. o recorte ────────────────────────────────────────────────────────
    const inteiro = fs.readFileSync(path.join(FRENTE, 'script.js'), 'utf8');
    const modulo = inteiro.slice(inteiro.indexOf('// ADM → FUNDO DO PWA'));
    await page.addScriptTag({ content: modulo });

    const recortes = await page.evaluate(() => ({
        // Deitada: corta nas laterais, pelo centro.
        deitada: fundoRecorte(1920, 1080, 'centro'),
        // Em pe e alta demais: a ancora manda.
        altaTopo: fundoRecorte(1080, 3000, 'topo'),
        altaBase: fundoRecorte(1080, 3000, 'base'),
        altaCentro: fundoRecorte(1080, 3000, 'centro'),
        // Ja na proporcao: nao mexe.
        exata: fundoRecorte(1080, 1920, 'centro'),
    }));

    const r = recortes.deitada;
    confere('foto deitada vira 9:16', Math.abs(r.sw / r.sh - 1080 / 1920) < 0.01,
            JSON.stringify(r));
    confere('foto deitada corta pelo centro', r.sx > 0 && r.sy === 0, JSON.stringify(r));

    confere('ancora topo comeca no topo', recortes.altaTopo.sy === 0,
            JSON.stringify(recortes.altaTopo));
    confere('ancora base termina embaixo',
            recortes.altaBase.sy + recortes.altaBase.sh === 3000,
            JSON.stringify(recortes.altaBase));
    confere('ancora centro fica no meio',
            recortes.altaCentro.sy > 0
            && recortes.altaCentro.sy < recortes.altaBase.sy,
            JSON.stringify(recortes.altaCentro));
    confere('todas as ancoras dao 9:16',
            [recortes.altaTopo, recortes.altaBase, recortes.altaCentro]
                .every((c) => Math.abs(c.sw / c.sh - 1080 / 1920) < 0.01));
    confere('foto ja na proporcao nao e cortada',
            recortes.exata.sx === 0 && recortes.exata.sy === 0
            && recortes.exata.sw === 1080 && recortes.exata.sh === 1920);

    // O recorte NUNCA pode sair da foto: um `sy` negativo ou passando da altura
    // desenharia borda preta, e ninguem olha o rodape de uma foto de fundo.
    const dentro = Object.values(recortes).every(
        (c) => c.sx >= 0 && c.sy >= 0 && c.sw > 0 && c.sh > 0);
    confere('nenhum recorte sai da foto', dentro, JSON.stringify(recortes));

    // ── 2. o arranque com cliente reduzido ─────────────────────────────────
    const pagina2 = await browser.newPage();
    const erros2 = [];
    pagina2.on('pageerror', (e) => erros2.push(String(e)));
    await pagina2.setContent('<!doctype html><html><body></body></html>');
    await pagina2.evaluate(() => {
        // O que existe num harness: o objeto, sem o PostgREST junto.
        window.supabaseClient = { storage: { from: () => ({ getPublicUrl: () => ({}) }) } };
    });
    await pagina2.addScriptTag({ path: path.join(FRENTE, 'fundo-do-app.js') });
    await new Promise((ok) => setTimeout(ok, 300));
    confere('nao derruba a pagina com cliente reduzido', erros2.length === 0,
            erros2.join(' | '));
    confere('nao poe a classe do fundo sem foto',
            !(await pagina2.evaluate(() => document.documentElement.classList.contains('com-fundo'))));

    // E sem cliente nenhum.
    const pagina3 = await browser.newPage();
    const erros3 = [];
    pagina3.on('pageerror', (e) => erros3.push(String(e)));
    await pagina3.setContent('<!doctype html><html><body></body></html>');
    await pagina3.addScriptTag({ path: path.join(FRENTE, 'fundo-do-app.js') });
    await new Promise((ok) => setTimeout(ok, 300));
    confere('nao derruba a pagina sem cliente nenhum', erros3.length === 0,
            erros3.join(' | '));

    confere('o modulo do ADM nao derruba nada ao carregar', erros.length === 0,
            erros.join(' | '));

    await browser.close();
    console.log(falhas ? `\n${falhas} verificacao(oes) falharam.` : '\nTudo certo.');
    process.exit(falhas ? 1 : 0);
})();
