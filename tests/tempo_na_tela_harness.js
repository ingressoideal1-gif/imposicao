// A coluna "Tempo" desenhada num Chrome de verdade.
//
// O harness de regra (`tempo_no_card_harness.js`) prova a conta: quantos
// segundos, qual cor, quem vai ao topo. O que ele nao alcanca e a tela -- se a
// cor escolhida chega mesmo ao pixel, se o numero cabe na coluna e se os
// digitos ficam alinhados de uma linha para a outra.
//
// Esse alinhamento e o detalhe que so aparece olhando: numa fonte comum o "1" e
// mais estreito que o "8", e uma coluna de relogios fica serrilhada. O
// `font-variant-numeric: tabular-nums` resolve, e e a unica prova possivel
// medindo a largura de dois numeros diferentes no navegador.
const fs = require('fs');
const http = require('http');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

const iMapa = SCRIPT.indexOf('const NOME_DO_CARD = {');
const MAPA = SCRIPT.slice(iMapa, SCRIPT.indexOf('};', iMapa) + 2);

const CODIGO = [
    SCRIPT.slice(SCRIPT.indexOf('const TEMPO_AZUL_SEG'), SCRIPT.indexOf(';', SCRIPT.indexOf('const TEMPO_VERMELHO_SEG')) + 1),
    MAPA,
    recortar('escapeHtml'),
    recortar('formatDateTime'),
    recortar('inicioDoTempoNoCard'),
    recortar('formatarTempoNoCard'),
    recortar('corDoTempoNoCard'),
    recortar('celulaDeEntradaEmProducaoHtml'),
    recortar('celulaDeTempoHtml'),
    recortar('atualizarRelogiosDaLista'),
].join('\n');

// O cabecalho real da Lista de Arte, para a celula cair debaixo do titulo certo.
const iTabela = HTML.indexOf('id="table-arte"');
const CABECALHO = HTML.slice(HTML.lastIndexOf('<table', iTabela), HTML.indexOf('</thead>', iTabela) + 8);

const PAGINA = '<!doctype html><meta charset="utf-8">'
    + '<style>body{margin:0;padding:24px;background:#0f172a;color:#e2e8f0;'
    + 'font-family:system-ui,sans-serif}:root{--text:#e2e8f0;--text-dim:#94a3b8;--border:#1e293b}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th{text-align:left;font-size:.72rem;text-transform:uppercase;color:#94a3b8;'
    + 'padding:10px 8px;border-bottom:1px solid #1e293b}'
    + 'td{padding:10px 8px;border-bottom:1px solid #1e293b}</style>'
    + '<body>' + CABECALHO + '<tbody id="corpo"></tbody></table></body>';

const servidor = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGINA);
});

// Um pedido por faixa de cor, mais um sem relogio nenhum.
const CASOS = [
    { numero: 20951, card: 'fila', minutos: 30, espera: '00:30', cor: 'rgb(34, 197, 94)', nome: 'verde' },
    { numero: 20948, card: 'fila', minutos: 95, espera: '01:35', cor: 'rgb(59, 130, 246)', nome: 'azul' },
    { numero: 20935, card: 'aprovacao', minutos: 150, espera: '02:30', cor: 'rgb(249, 115, 22)', nome: 'laranja' },
    { numero: 20911, card: 'aprovados', minutos: 255, espera: '04:15', cor: 'rgb(239, 68, 68)', nome: 'vermelho' },
];

// O concluido nao tem faixa de cor nem relogio: tem o carimbo de quando entrou
// na producao. A hora e fixa de proposito -- o teste confere o texto dela.
const CONCLUIDO = { numero: 20880, card: 'concluidos', desde: '2026-08-21T17:42:00' };

(async () => {
    await new Promise(r => servidor.listen(0, r));
    const porta = servidor.address().port;

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 420 });
    await page.goto('http://localhost:' + porta + '/', { waitUntil: 'domcontentloaded' });

    const medido = await page.evaluate((codigo, casos, concluido) => {
        eval(codigo);
        const agora = Date.now();

        // O `state` que a celula le, montado como o painel monta.
        window.state = { temposNoCard: {} };
        state.temposNoCard[concluido.numero] = {
            id_int: concluido.numero, card: 'concluidos',
            desde: concluido.desde, credito_segundos: 0, saiu_da_fila_em: null,
        };
        casos.forEach(c => {
            state.temposNoCard[c.numero] = {
                id_int: c.numero, card: c.card,
                desde: new Date(agora - c.minutos * 60000).toISOString(),
                credito_segundos: 0, saiu_da_fila_em: null,
            };
        });

        const corpo = document.getElementById('corpo');
        corpo.innerHTML = casos.map(c => '<tr>'
            + '<td>' + c.numero + '</td><td>Cliente de teste</td><td>Vendedor</td><td>arte</td>'
            + celulaDeTempoHtml({ numero: String(c.numero), data_liberacao: '2026-08-19T08:00:00Z', data_pedido: '2026-08-18T14:00:00Z' })
            + '<td>--</td><td>--</td><td>3 itens</td><td>--</td>'
            + '</tr>').join('')
            // A quinta linha e um pedido ja em producao: ali a coluna mostra a
            // data e a hora da entrada, paradas.
            + '<tr><td>' + concluido.numero + '</td><td>Ja em producao</td><td>Vendedor</td><td>arte</td>'
            + celulaDeTempoHtml({ numero: String(concluido.numero), data_liberacao: '2026-08-19T08:00:00Z' })
            + '<td>--</td><td>--</td><td>2 itens</td><td>--</td></tr>'
            // A ultima e um pedido sem relogio: a tabela ainda nao existe no
            // banco, ou e a primeira vez que ele aparece.
            + '<tr><td>20900</td><td>Sem relogio ainda</td><td>Vendedor</td><td>arte</td>'
            + celulaDeTempoHtml({ numero: '20900', data_liberacao: '2026-08-19T08:00:00Z' })
            + '<td>--</td><td>--</td><td>1 item</td><td>--</td></tr>';

        const celulas = [...corpo.querySelectorAll('td.celula-tempo')];
        const lidas = celulas.map(td => ({
            texto: td.textContent.trim(),
            cor: getComputedStyle(td).color,
            largura: Math.round(td.getBoundingClientRect().width),
            titulo: td.getAttribute('title') || '',
        }));

        // A coluna do tempo cai debaixo do titulo "Tempo"?
        const ths = [...document.querySelectorAll('th')].map(t => t.textContent.trim());
        const iTempo = ths.findIndex(t => /tempo/i.test(t));
        const tds = [...corpo.querySelector('tr').children];
        const iCelula = tds.indexOf(corpo.querySelector('tr td.celula-tempo'));

        // O relogio anda sem redesenhar: adianta o inicio em uma hora e chama o
        // tick, como o setInterval faria.
        const carimbo = corpo.querySelector('td.celula-entrou-producao');
        const antesDoTick = carimbo ? carimbo.textContent.trim() : '(nao desenhou)';

        const primeira = celulas[0];
        primeira.setAttribute('data-tempo-inicio', String(agora - 125 * 60000));
        atualizarRelogiosDaLista();

        return {
            lidas,
            carimbo: {
                existe: !!carimbo,
                ehRelogio: !!(carimbo && carimbo.classList.contains('celula-tempo')),
                antes: antesDoTick,
                depois: carimbo ? carimbo.textContent.trim() : '(nao desenhou)',
                titulo: carimbo ? (carimbo.getAttribute('title') || '') : '',
                coluna: carimbo ? [...carimbo.parentElement.children].indexOf(carimbo) : -1,
                largura: carimbo ? Math.round(carimbo.getBoundingClientRect().width) : 0,
            },
            semRelogio: corpo.querySelector('tr:last-child td:nth-child(5)').textContent.trim(),
            tituloSemRelogio: corpo.querySelector('tr:last-child td:nth-child(5)').getAttribute('title') || '',
            iTempo, iCelula, ths,
            depoisDoTick: { texto: primeira.textContent.trim(), cor: getComputedStyle(primeira).color },
        };
    }, CODIGO, CASOS, CONCLUIDO);

    // ─── Cada faixa aparece com a cor dela ───────────────────────────────────
    CASOS.forEach((c, i) => {
        const l = medido.lidas[i] || {};
        ok(l.texto === c.espera, c.minutos + ' minutos aparecem como ' + c.espera, l.texto);
        ok(l.cor === c.cor, 'e em ' + c.nome, l.cor + ' (esperado ' + c.cor + ')');
    });

    // ─── A escala vale nos quatro cards ──────────────────────────────────────
    ok(medido.lidas[2].cor === 'rgb(249, 115, 22)',
        'a Fila de Aprovacao usa a mesma escala', medido.lidas[2].cor);
    ok(medido.lidas[3].cor === 'rgb(239, 68, 68)',
        'e a Fila de Aprovados tambem', medido.lidas[3].cor);

    // ─── As datas nao se perderam ────────────────────────────────────────────
    ok(/Libera/.test(medido.lidas[0].titulo), 'a data de liberacao foi para o titulo', medido.lidas[0].titulo);
    ok(/Pedido:/.test(medido.lidas[0].titulo), 'a data do pedido tambem');
    ok(/Em "Em Arte" desde/.test(medido.lidas[0].titulo), 'e o titulo diz desde quando ele esta no card');
    ok(/Fila de Aprova/.test(medido.lidas[2].titulo), 'com o nome do card por extenso', medido.lidas[2].titulo);

    // ─── Debaixo do titulo certo ─────────────────────────────────────────────
    ok(medido.iTempo >= 0, 'o cabecalho tem a coluna Tempo', medido.ths.join(' | '));
    ok(medido.iCelula === medido.iTempo, 'e a celula do relogio cai debaixo dela',
        'celula=' + medido.iCelula + ' titulo=' + medido.iTempo);

    // ─── Digitos alinhados de uma linha para a outra ─────────────────────────
    const larguras = new Set(medido.lidas.map(l => l.largura));
    ok(larguras.size === 1, 'todas as celulas de tempo tem a mesma largura', [...larguras].join(', '));

    // ─── Pedido sem relogio nao quebra a linha ───────────────────────────────
    ok(medido.semRelogio === '--', 'pedido sem relogio mostra "--"', medido.semRelogio);
    ok(/Libera/.test(medido.tituloSemRelogio), 'e nem assim perde as datas', medido.tituloSemRelogio);

    // ─── O tick troca numero E cor, sem redesenhar ───────────────────────────
    ok(medido.depoisDoTick.texto === '02:05', 'o tick avanca o relogio sozinho', medido.depoisDoTick.texto);
    ok(medido.depoisDoTick.cor === 'rgb(249, 115, 22)',
        'e vira laranja ao passar de 2h, sem a lista ser redesenhada', medido.depoisDoTick.cor);

    // --- O concluido mostra o carimbo, e ele nao anda -----------------------
    //
    // Pedido do usuario em 23/08/2026: no card "Pedidos Concluidos" a coluna
    // deixa de contar tempo e passa a dizer quando o pedido entrou em producao.
    const c = medido.carimbo;
    ok(c.existe, 'o pedido concluido ganha a celula do carimbo');
    ok(!c.ehRelogio, 'e ela nao e um relogio', c.antes);
    ok(/21\/08\/2026/.test(c.antes), 'o carimbo traz a data da entrada em producao', c.antes);
    ok(/17:42/.test(c.antes), 'e a hora dela', c.antes);
    ok(c.depois === c.antes, 'e o tique de meio minuto passa por ele sem mexer',
        c.antes + ' virou ' + c.depois);
    ok(/Entrou em produ/.test(c.titulo), 'o titulo diz o que aquela hora significa', c.titulo);
    ok(c.coluna === medido.iTempo, 'e o carimbo cai na mesma coluna do relogio',
        'carimbo=' + c.coluna + ' titulo=' + medido.iTempo);
    ok(c.largura === medido.lidas[0].largura, 'sem alargar a coluna',
        c.largura + ' contra ' + medido.lidas[0].largura);

    await page.screenshot({ path: path.join(RAIZ, 'tests', '_tempo_na_tela.png') });
    await browser.close();
    servidor.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes passaram.');
})().catch(e => { console.error(String(e && e.stack || e)); servidor.close(); process.exit(1); });
