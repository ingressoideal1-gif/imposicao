// O PDF Gabarito conta UMA pagina por face impressa.
//
// Roda em node, sem navegador: `node tests/gabarito_frente_e_verso_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// As funcoes sao LIDAS do `script.js` e avaliadas aqui -- nao copiadas. Uma
// copia continuaria passando depois de o original mudar.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrair(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

const { modeloTemVerso, elementoVisivelNaFace } = new Function(
    'const window = {};\n'
    + extrair('modeloTemVerso')
    + extrair('elementoVisivelNaFace')
    + '\nreturn { modeloTemVerso, elementoVisivelNaFace };'
)();

// A linha de verdade do export: ela e lida de dentro do exportarPdfGabarito,
// para que apagar o verso de la reprove aqui.
const facesDoModelo = (() => {
    const corpo = SCRIPT.slice(SCRIPT.indexOf('async function exportarPdfGabarito('));
    const m = corpo.match(/const faces = ([^\n;]+);/);
    if (!m) throw new Error('nao achei o calculo das faces no exportarPdfGabarito');
    return new Function('modeloTemVerso', 'item', 'const faces = ' + m[1] + '; return faces;')
        .bind(null, modeloTemVerso);
})();

// ─────────────────────────────────────────────────────────────────────────────
// 1. O caso que o usuario descreveu: dois modelos, um so frente e outro frente
//    e verso, tem de dar TRES paginas.
// ─────────────────────────────────────────────────────────────────────────────
{
    const itens = [
        { id: 101, verso: false, verso_tipo: 'Frente' },
        { id: 102, verso: true, verso_tipo: 'FxVerso' },
    ];
    const paginas = itens.reduce((n, it) => n + facesDoModelo(it).length, 0);
    ok(paginas === 3, 'dois modelos, um duplex: tres paginas', { obtido: paginas });

    ok(JSON.stringify(facesDoModelo(itens[0])) === '["front"]',
        'modelo so frente: uma pagina de frente', facesDoModelo(itens[0]));
    ok(JSON.stringify(facesDoModelo(itens[1])) === '["front","back"]',
        'modelo duplex: frente e depois verso, nesta ordem', facesDoModelo(itens[1]));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. O dado do verso mora em dois nomes na memoria. Ler so um deixava o
//    gabarito com uma contagem de paginas diferente da do PDF Arte.
// ─────────────────────────────────────────────────────────────────────────────
{
    ok(modeloTemVerso({ verso: true }) === true, 'verso booleano sozinho basta');
    ok(modeloTemVerso({ verso_tipo: 'FxVerso' }) === true, 'verso_tipo sozinho basta');
    ok(modeloTemVerso({ verso: false, verso_tipo: 'FxVerso' }) === true,
        'verso_tipo vale mesmo com o booleano atrasado');
    ok(modeloTemVerso({ verso_tipo: 'VERSO COMUM' }) === true, 'valor legado VERSO COMUM');
    ok(modeloTemVerso({ verso_tipo: 'VERSO VARI\u00c1VEL' }) === true, 'valor legado VERSO VARIAVEL');
    ok(modeloTemVerso({ verso_tipo: 'Frente' }) === false, 'Frente nao tem verso');
    ok(modeloTemVerso({ verso_tipo: 'S\u00d3 FRENTE' }) === false, 'legado SO FRENTE nao tem verso');
    ok(modeloTemVerso({ verso_tipo: 'SO FRENTE' }) === false, 'legado SO FRENTE sem acento');
    ok(modeloTemVerso({}) === false, 'modelo sem os dois campos nao tem verso');
    ok(modeloTemVerso(null) === false, 'item ausente nao tem verso');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cada pagina leva SO os elementos da sua face. Sem isto, o modelo frente e
//    verso saia com as duas faces impressas uma por cima da outra na frente.
// ─────────────────────────────────────────────────────────────────────────────
{
    const frente = { type: 'TEXT', face: 'front' };
    const verso = { type: 'TEXT', face: 'back' };
    const ambas = { type: 'TEXT', face: 'both' };
    const semFace = { type: 'TEXT' };
    const picote = { type: 'PICOTE', face: 'front' };

    ok(elementoVisivelNaFace(frente, 'front') === true, 'frente aparece na frente');
    ok(elementoVisivelNaFace(frente, 'back') === false, 'frente NAO aparece no verso');
    ok(elementoVisivelNaFace(verso, 'back') === true, 'verso aparece no verso');
    ok(elementoVisivelNaFace(verso, 'front') === false, 'verso NAO aparece na frente');
    ok(elementoVisivelNaFace(ambas, 'front') === true && elementoVisivelNaFace(ambas, 'back') === true,
        'both aparece nas duas');
    ok(elementoVisivelNaFace(semFace, 'front') === true && elementoVisivelNaFace(semFace, 'back') === true,
        'sem face vale both, como no editor');
    ok(elementoVisivelNaFace(picote, 'back') === true,
        'PICOTE atravessa as duas faces: e corte de papel');
}

if (falhas) {
    console.error(`\n${falhas} de ${total} conferencias falharam.`);
    process.exit(1);
}
console.log(`OK: ${total} conferencias do gabarito frente e verso passaram.`);
