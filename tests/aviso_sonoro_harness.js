// Roda o aviso sonoro da portaria dentro de um navegador de verdade.
//
// O arquivo nao devolve som: ele PEDE som ao aparelho. O que da para conferir,
// entao, e o que ele pediu -- e para isso os dois aparelhos que ele usa,
// `AudioContext` e `navigator.vibrate`, entram DUBLADOS aqui, antes de o
// arquivo carregar. O dublê anota cada oscilador (frequencia e duracao) e cada
// vibracao, e devolve tudo em JSON.
//
// Dublar tambem e o unico jeito de testar os dois casos que nao podem lancar:
// o iPhone, que nao tem `navigator.vibrate`, e o navegador antigo, que nao tem
// `AudioContext`. Som e enfeite; enfeite nao pode derrubar a leitura do portao.
//
// Recebe o caso pelo stdin em JSON:
//   {chamada, argumentos, sem_audio, sem_vibrar, sem_liberar}
// Imprime em JSON no stdout:
//   {resultado, pronto, osciladores, vibracao, buffers, contextos, lancou}
// Sai 1 se o arquivo nao carregar.

const path = require('path');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

let bruto = '';
process.stdin.on('data', d => (bruto += d));
process.stdin.on('end', () => {
    if (bruto.trim()) return rodar(JSON.parse(bruto));
    // A entrega segura chama o harness sem stdin: executar a suite que fornece
    // os cenarios e verifica as respostas, em vez de interpretar JSON vazio.
    const resultado = require('child_process').spawnSync(
        process.env.IDEAL_TEST_PYTHON || 'python',
        ['-m', 'pytest', '-n', '0', '-q', 'tests/test_aviso_sonoro.py'],
        { cwd: REPO, stdio: 'inherit' }
    );
    if (resultado.error) console.error(resultado.error.message);
    process.exit(resultado.status === null ? 1 : resultado.status);
});

async function rodar(caso) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().startsWith('http://localhost/')) {
            return req.respond({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: '<!doctype html><meta charset="utf-8"><title>aviso sonoro</title>',
            });
        }
        req.continue();
    });
    await page.goto('http://localhost/aviso-sonoro-test');

    // Os dubles entram ANTES do arquivo. Depois seria tarde para o caso do
    // navegador sem audio: quem pega a fabrica de contexto e o proprio arquivo.
    await page.evaluate((c) => {
        var reg = { osciladores: [], vibracao: [], volumes: [], buffers: 0, contextos: 0 };
        window.__registro = reg;

        function Parametro(valor) { this.value = valor; }
        Parametro.prototype.setValueAtTime = function (v) { this.value = v; return this; };
        Parametro.prototype.linearRampToValueAtTime = function (v) { this.value = v; return this; };
        Parametro.prototype.exponentialRampToValueAtTime = function (v) { this.value = v; return this; };
        Parametro.prototype.cancelScheduledValues = function () { return this; };

        function No() { }
        No.prototype.connect = function (destino) { return destino; };
        No.prototype.disconnect = function () { };

        function Contexto() {
            reg.contextos++;
            this.currentTime = 0;
            this.state = 'running';
            this.destination = new No();
        }
        Contexto.prototype.createOscillator = function () {
            var osc = new No();
            var anotacao = null;
            osc.type = 'sine';
            osc.frequency = new Parametro(440);
            osc.start = function (quando) {
                anotacao = {
                    frequencia: osc.frequency.value,
                    tipo: osc.type,
                    inicio: quando || 0,
                    duracao: null,
                };
                reg.osciladores.push(anotacao);
            };
            osc.stop = function (quando) {
                if (anotacao) { anotacao.duracao = (quando || 0) - anotacao.inicio; }
            };
            return osc;
        };
        Contexto.prototype.createGain = function () {
            var no = new No();
            no.gain = new Parametro(1);
            no.gain.setValueAtTime = function (v) { reg.volumes.push(v); this.value = v; return this; };
            return no;
        };
        Contexto.prototype.createBuffer = function () { return {}; };
        Contexto.prototype.createBufferSource = function () {
            var no = new No();
            no.buffer = null;
            // O buffer silencioso e o que destrava o audio. Ele e contado
            // separado dos osciladores DE PROPOSITO: se entrasse na mesma
            // lista, o primeiro "som" de toda leitura seria o silencio.
            no.start = function () { reg.buffers++; };
            no.stop = function () { };
            return no;
        };
        Contexto.prototype.resume = function () {
            this.state = 'running';
            return Promise.resolve();
        };
        Contexto.prototype.close = function () {
            this.state = 'closed';
            return Promise.resolve();
        };

        if (c.sem_audio) {
            // Navegador antigo: a fabrica simplesmente nao existe.
            window.AudioContext = undefined;
            window.webkitAudioContext = undefined;
        } else {
            window.AudioContext = Contexto;
            window.webkitAudioContext = Contexto;
        }

        // `vibrate` mora no prototipo do Navigator; sombrear a propriedade e o
        // jeito de fingir um iPhone sem sair do Chrome.
        Object.defineProperty(navigator, 'vibrate', {
            configurable: true,
            value: c.sem_vibrar ? undefined : function (padrao) {
                var lista = (typeof padrao === 'number') ? [padrao] : (padrao || []);
                for (var i = 0; i < lista.length; i++) { reg.vibracao.push(lista[i]); }
                return true;
            },
        });
    }, caso);

    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'aviso-sonoro.js') });

    const ok = await page.evaluate(() => typeof window.avisoSonoro === 'object');
    if (!ok) {
        console.error('aviso-sonoro.js nao registrou window.avisoSonoro');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate((c) => {
        var reg = window.__registro;
        var lancou = null;
        var resultado = null;
        try {
            // O toque que destrava o audio. `sem_liberar` reproduz a tela que
            // ninguem encostou ainda -- onde tocar som falha em silencio.
            if (!c.sem_liberar) { window.avisoSonoro.liberar(); }
            resultado = window.avisoSonoro[c.chamada].apply(null, c.argumentos || []);
        } catch (e) {
            lancou = String((e && e.message) || e);
        }
        var pronto = null;
        try { pronto = window.avisoSonoro.pronto(); } catch (e) { pronto = null; }
        return {
            resultado: resultado === undefined ? null : resultado,
            pronto: pronto,
            volumes: window.__registro.volumes,
            osciladores: reg.osciladores,
            vibracao: reg.vibracao,
            buffers: reg.buffers,
            contextos: reg.contextos,
            lancou: lancou,
        };
    }, caso);

    await browser.close();
    console.log(JSON.stringify(saida));
}
