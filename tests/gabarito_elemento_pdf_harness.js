// O gabarito cola o elemento PDF NO LUGAR DELE, e a pagina e do tamanho do
// modelo.
//
// Roda em node, sem navegador: `node tests/gabarito_elemento_pdf_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// A funcao e LIDA do `script.js` e avaliada aqui -- nao copiada. Uma copia
// continuaria passando depois de o original mudar.

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

function perto(a, b, tol, nome) {
    ok(Math.abs(a - b) <= tol, nome, { esperado: b, obtido: a, tolerancia: tol });
}

function extrair(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

const { caixaDoElementoPdfNaPagina } = new Function(
    extrair('caixaDoElementoPdfNaPagina')
    + '\nreturn { caixaDoElementoPdfNaPagina };'
)();

const MM = 72 / 25.4;

// ─────────────────────────────────────────────────────────────────────────────
// 1. O caso que denunciou o defeito: a Triband.
//
// Formato 245 x 20 mm; o elemento PDF e a logo `Logo_Tri.pdf`, de 10,18 x 14 mm,
// centrada em x=237,61 y=10 -- encostada na ponta direita. A pagina do arquivo
// mede 14,76 x 20,30 mm. Antes, a pagina do gabarito INTEIRO virava esses
// 14,76 mm; agora ela e 245 x 20 mm e a logo fica no canto onde ela esta na arte.
// ─────────────────────────────────────────────────────────────────────────────
{
    const fmt = { width_mm: 245, height_mm: 20 };
    const ptW = 245 * MM, ptH = 20 * MM;
    const el = { type: 'PDF', x_mm: 237.61, y_mm: 10.0, width_mm: 10.18, height_mm: 14.0 };
    const nat = { w: 14.76 * MM, h: 20.30 * MM };

    const c = caixaDoElementoPdfNaPagina(el, fmt, nat.w, nat.h, ptW, ptH);
    ok(!!c, 'triband: devolveu caixa');

    // Sem distorcao: a proporcao do arquivo e mantida.
    perto(c.width / c.height, nat.w / nat.h, 1e-9, 'triband: proporcao do arquivo preservada');

    // Encaixa pelo menor lado, como o `keep_proportion=True` do engine. A caixa
    // do elemento e 10,18 x 14; o arquivo e mais "gordo", entao encosta na largura.
    const escala = Math.min((10.18 * MM) / nat.w, (14.0 * MM) / nat.h);
    perto(c.width, nat.w * escala, 1e-6, 'triband: largura pelo menor lado');
    perto(c.height, nat.h * escala, 1e-6, 'triband: altura pelo menor lado');
    ok(c.width <= 10.18 * MM + 1e-6, 'triband: nao estoura a caixa do elemento na largura');
    ok(c.height <= 14.0 * MM + 1e-6, 'triband: nao estoura a caixa do elemento na altura');

    // O centro cai onde o elemento esta na arte -- x contado da esquerda, y de
    // baixo para cima (o PDF tem origem embaixo).
    perto(c.x + c.width / 2, 237.61 * MM, 1e-6, 'triband: centro em x');
    perto(c.y + c.height / 2, ptH - 10.0 * MM, 1e-6, 'triband: centro em y');

    // E o que mais importa: a logo NAO ocupa a pagina.
    ok(c.width < ptW / 10, 'triband: a logo continua sendo uma logo, e nao a pulseira inteira',
       { larguraDaLogo: c.width, larguraDaPagina: ptW });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. O caso da credencial: o elemento e a arte inteira (1000547, pedido 21146).
//    Formato 105 x 148 mm, elemento 105,71 x 146,21 centrado.
// ─────────────────────────────────────────────────────────────────────────────
{
    const fmt = { width_mm: 105, height_mm: 148 };
    const ptW = 105 * MM, ptH = 148 * MM;
    const el = { type: 'PDF', x_mm: 52.5, y_mm: 75.2, width_mm: 105.71, height_mm: 146.21 };
    const nat = { w: 105.71 * MM, h: 146.21 * MM };

    const c = caixaDoElementoPdfNaPagina(el, fmt, nat.w, nat.h, ptW, ptH);
    // O arquivo tem exatamente o tamanho da caixa: entra 1:1.
    perto(c.width, 105.71 * MM, 1e-6, 'credencial: largura 1:1 com a caixa');
    perto(c.height, 146.21 * MM, 1e-6, 'credencial: altura 1:1 com a caixa');
    perto(c.x + c.width / 2, 52.5 * MM, 1e-6, 'credencial: centro em x');
    perto(c.y + c.height / 2, ptH - 75.2 * MM, 1e-6, 'credencial: centro em y');
    perto(c.rotate, 0, 1e-9, 'credencial: sem rotacao');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rotacao: gira em torno do CENTRO do elemento, e no sentido do canvas.
//
// O canvas gira no sentido horario com `rotation` positivo; o pdf-lib gira no
// anti-horario. Um sinal trocado poe o elemento no lugar certo com a arte de
// cabeca para o outro lado -- erro que nao aparece em elemento quadrado.
// ─────────────────────────────────────────────────────────────────────────────
{
    const fmt = { width_mm: 100, height_mm: 100 };
    const ptW = 100 * MM, ptH = 100 * MM;
    const nat = { w: 40 * MM, h: 20 * MM };
    const base = { type: 'PDF', x_mm: 50, y_mm: 50, width_mm: 40, height_mm: 20 };

    const semGiro = caixaDoElementoPdfNaPagina(base, fmt, nat.w, nat.h, ptW, ptH);
    perto(semGiro.rotate, 0, 1e-9, 'giro 0: rotate zero');

    const noventa = caixaDoElementoPdfNaPagina({ ...base, rotation: 90 }, fmt, nat.w, nat.h, ptW, ptH);
    perto(noventa.rotate, -90, 1e-9, 'giro 90 horario vira -90 no pdf-lib');

    // Girado ou nao, o centro do elemento nao se move.
    const cos = Math.cos(-90 * Math.PI / 180), sen = Math.sin(-90 * Math.PI / 180);
    const cxGirado = noventa.x + (noventa.width / 2 * cos - noventa.height / 2 * sen);
    const cyGirado = noventa.y + (noventa.width / 2 * sen + noventa.height / 2 * cos);
    perto(cxGirado, 50 * MM, 1e-6, 'giro 90: o centro fica onde estava (x)');
    perto(cyGirado, ptH - 50 * MM, 1e-6, 'giro 90: o centro fica onde estava (y)');

    // 180 graus tambem preserva o centro, e o sinal continua invertido.
    const meia = caixaDoElementoPdfNaPagina({ ...base, rotation: 180 }, fmt, nat.w, nat.h, ptW, ptH);
    perto(meia.rotate, -180, 1e-9, 'giro 180 horario vira -180');
    const c2 = Math.cos(Math.PI), s2 = Math.sin(Math.PI);
    perto(meia.x + (meia.width / 2 * c2 - meia.height / 2 * s2), 50 * MM, 1e-6,
          'giro 180: o centro fica onde estava (x)');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Pagina com medida propria (a cor traz width_mm/height_mm).
//
// As coordenadas do elemento estao no espaco do FORMATO. Se a pagina for maior,
// o elemento acompanha na mesma proporcao -- senao o vetor sai de cima da
// mascara rasterizada, que e esticada para a pagina do mesmo jeito.
// ─────────────────────────────────────────────────────────────────────────────
{
    const fmt = { width_mm: 100, height_mm: 50 };
    const el = { type: 'PDF', x_mm: 25, y_mm: 25, width_mm: 20, height_mm: 10 };
    const nat = { w: 20 * MM, h: 10 * MM };

    const normal = caixaDoElementoPdfNaPagina(el, fmt, nat.w, nat.h, 100 * MM, 50 * MM);
    const dobro = caixaDoElementoPdfNaPagina(el, fmt, nat.w, nat.h, 200 * MM, 100 * MM);

    perto(dobro.width, normal.width * 2, 1e-6, 'pagina dobrada: elemento dobra de largura');
    perto(dobro.height, normal.height * 2, 1e-6, 'pagina dobrada: elemento dobra de altura');
    // O centro em fracao da pagina nao muda.
    perto((dobro.x + dobro.width / 2) / (200 * MM),
          (normal.x + normal.width / 2) / (100 * MM), 1e-9,
          'pagina dobrada: o centro fica na mesma fracao da pagina');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Entrada estragada nao derruba a exportacao: devolve null e o gabarito
//    segue sem aquele elemento, em vez de perder o pedido inteiro.
// ─────────────────────────────────────────────────────────────────────────────
{
    const fmt = { width_mm: 100, height_mm: 50 };
    const el = { type: 'PDF', x_mm: 10, y_mm: 10, width_mm: 20, height_mm: 10 };
    ok(caixaDoElementoPdfNaPagina(null, fmt, 10, 10, 100, 50) === null, 'sem elemento: null');
    ok(caixaDoElementoPdfNaPagina(el, null, 10, 10, 100, 50) === null, 'sem formato: null');
    ok(caixaDoElementoPdfNaPagina(el, { width_mm: 0, height_mm: 50 }, 10, 10, 100, 50) === null,
       'formato de largura zero: null');
    ok(caixaDoElementoPdfNaPagina(el, fmt, 0, 10, 100, 50) === null, 'arquivo de largura zero: null');
    ok(caixaDoElementoPdfNaPagina(el, fmt, 10, 0, 100, 50) === null, 'arquivo de altura zero: null');
    ok(caixaDoElementoPdfNaPagina(el, fmt, 10, 10, 0, 50) === null, 'pagina de largura zero: null');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Elemento sem medida gravada cai no padrao de 20 mm, como no engine
//    (`el.get("width_mm", 20)`), em vez de virar NaN e sumir do papel.
// ─────────────────────────────────────────────────────────────────────────────
{
    const fmt = { width_mm: 100, height_mm: 100 };
    const c = caixaDoElementoPdfNaPagina(
        { type: 'PDF', x_mm: 50, y_mm: 50 }, fmt, 20 * MM, 20 * MM, 100 * MM, 100 * MM);
    ok(!!c, 'sem width_mm: devolveu caixa');
    perto(c.width, 20 * MM, 1e-6, 'sem width_mm: usa 20 mm, como o engine');
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. O export em si -- lido do texto do `script.js`.
// ─────────────────────────────────────────────────────────────────────────────
{
    const i = SCRIPT.indexOf('async function exportarPdfGabarito(');
    ok(i > 0, 'achei o exportarPdfGabarito');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);

    ok(!/copyPages\(/.test(corpo),
       'o gabarito NAO copia mais a pagina do arquivo do elemento (era o defeito)');
    ok(/pdfDoc\.addPage\(\[ptW, ptH\]\)/.test(corpo),
       'a pagina do gabarito e do tamanho do modelo');
    ok(/embedPage\(/.test(corpo) && /drawPage\(/.test(corpo),
       'o elemento PDF entra pelo embedPage/drawPage, no lugar dele');
    ok(/caixaDoElementoPdfNaPagina\(/.test(corpo),
       'usa a geometria testada aqui, e nao uma conta propria');
    ok(/!elementoSoLayout\(e\)/.test(corpo),
       'o elemento marcado como Layout continua fora do PDF de producao');
    ok(/opacity: opacidadeDoElemento\(el\)/.test(corpo),
       'a opacidade do elemento e respeitada, como no engine');
    ok(/for \(const el of pdfEls\)/.test(corpo),
       'TODOS os elementos PDF entram, e nao so o primeiro');
    ok(/elements: num\.elements\.filter\(e => e\.type !== 'PDF'\)/.test(corpo),
       'o raster nao redesenha o que ja entrou vetorial (nada de rasterizar a arte)');
    ok(/num\.pdf_content/.test(corpo),
       'o registro legado, que guarda a arte na coluna, continua saindo');
}

console.log((falhas === 0 ? 'OK' : 'FALHOU') + ': ' + (total - falhas) + '/' + total + ' conferencias');
process.exit(falhas === 0 ? 0 : 1);
