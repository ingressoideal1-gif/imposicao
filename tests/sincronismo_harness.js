// Roda o sincronismo do portao dentro de um navegador de verdade.
//
// Duas coisas muito diferentes moram no mesmo arquivo, e por isso o harness
// tem tres modos:
//
//   {chamada, argumentos}  -- chama `window.portariaSincronismo[chamada]`.
//                             E o modo de `aplicar`, que e PURA. Devolve
//                             {resultado, argumentos}: os argumentos voltam
//                             junto para o teste poder provar que a funcao nao
//                             remexeu na carga que recebeu -- essa carga e a
//                             que esta guardada no IndexedDB do celular, e
//                             suja-la seria corromper o evento no aparelho.
//
//   {valor: "NOME"}        -- le uma constante exportada (INTERVALO_MS).
//
//   {relogio: {...}}       -- exercita `ligar`/`desligar` com o `setInterval`
//                             DUBLADO. Sem isso, testar o relogio de cinco
//                             minutos custaria cinco minutos por teste. O dublê
//                             guarda a funcao registrada e o teste a dispara na
//                             mao, quantas vezes quiser.
//
// Recebe o caso pelo stdin em JSON e imprime a resposta em JSON no stdout.
// Sai 1 se o arquivo nao carregar.

const path = require('path');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

let bruto = '';
process.stdin.on('data', d => (bruto += d));
process.stdin.on('end', () => rodar(JSON.parse(bruto)));

async function rodar(caso) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().startsWith('http://localhost/')) {
            return req.respond({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: '<!doctype html><meta charset="utf-8"><title>sincronismo</title>',
            });
        }
        req.continue();
    });
    await page.goto('http://localhost/portaria-sincronismo-test');
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'portaria-sincronismo.js') });

    const ok = await page.evaluate(() => typeof window.portariaSincronismo === 'object');
    if (!ok) {
        console.error('portaria-sincronismo.js nao registrou window.portariaSincronismo');
        await browser.close();
        process.exit(1);
    }

    let saida;
    if (caso.relogio) saida = await page.evaluate(relogio, caso.relogio);
    else if (caso.valor) saida = await page.evaluate(
        (nome) => window.portariaSincronismo[nome], caso.valor);
    else saida = await page.evaluate((c) => {
        var r = window.portariaSincronismo[c.chamada].apply(null, c.argumentos);
        return { resultado: r, argumentos: c.argumentos };
    }, caso);

    await browser.close();
    console.log(JSON.stringify(saida === undefined ? null : saida));
}

// Roda dentro da pagina. `c` descreve o cenario:
//   respostas    -- uma por tique: {novidade} ou {erro: "mensagem"} (promessa
//                   recusada) ou {lanca: "mensagem"} (a propria `pedir` explode)
//   tiques       -- quantas vezes disparar o relogio
//   aplicarLanca -- o deposito do celular esta fora do ar
//   desligar     -- chama `desligar()` no fim
async function relogio(c) {
    var trilha = {
        intervalo: null, pedidos: [], aplicados: [],
        cancelamentos: 0, lancou: null,
    };
    var disparar = null;

    // O dublê. O modulo procura `setInterval` no escopo global na hora de
    // `ligar`, entao trocar aqui, DEPOIS de carregar o arquivo, funciona.
    window.setInterval = function (fn, ms) { disparar = fn; trilha.intervalo = ms; return 77; };
    window.clearInterval = function () { trilha.cancelamentos++; };

    var i = 0;
    function pedir(desde) {
        trilha.pedidos.push(desde === undefined ? '(indefinido)' : desde);
        var r = (c.respostas || [])[i++] || {};
        if (r.lanca) throw new Error(r.lanca);
        if (r.erro) return Promise.reject(new Error(r.erro));
        return Promise.resolve(r.novidade === undefined ? {} : r.novidade);
    }

    function aoAplicar(novidade) {
        if (c.aplicarLanca) return Promise.reject(new Error('IndexedDB fora do ar'));
        trilha.aplicados.push(novidade);
    }

    try {
        window.portariaSincronismo.ligar(pedir, aoAplicar);
        for (var t = 0; t < (c.tiques || 0); t++) {
            // `ligar` devolve a promessa do tique de proposito, para o teste
            // conseguir esperar a ida ao servidor terminar.
            await disparar();
        }
        if (c.desligar) window.portariaSincronismo.desligar();
    } catch (e) {
        trilha.lancou = String((e && e.message) || e);
    }
    return trilha;
}
