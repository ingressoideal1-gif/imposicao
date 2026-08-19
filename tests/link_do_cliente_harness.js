// O link do cliente mostra a arte -- inclusive quando ela e um PDF.
//
// O defeito, visto no pedido 20927 em 19/08/2026: o cliente abria o link e via
// um icone de imagem quebrada no lugar da pulseira.
//
// A cadeia era esta. O painel salva um "snapshot" -- a previa ja composta de
// cor + arte + numeracao -- em `amostra_arte_base64`, e a tela do cliente
// mostra esse snapshot num `<img>`. Quando ele nao existe, o carregamento faz o
// campo cair para `arte_url` (a arte crua). Se a arte crua e um PDF, o `<img>`
// nao tem o que desenhar: sobra um icone minusculo, sem legenda -- e o aviso
// "arte ainda nao enviada" fica ESCONDIDO, porque o campo esta preenchido.
//
// A correcao nao foi caçar o snapshot que faltou: foi parar de depender dele.
// O `cliente.js` ja sabia compor a peca num canvas e ja sabia ler PDF pelo
// pdfjsLib -- so nunca criava o canvas fora do caso de numeracao com banco.
//
// Roda em node: `node tests/link_do_cliente_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CLIENTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(nome) {
    const i = CLIENTE.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no cliente.js');
    const fim = CLIENTE.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return CLIENTE.slice(i, fim + 2);
}

const ehArquivoPdf = new Function(extrairFuncao('ehArquivoPdf') + '\nreturn ehArquivoPdf;')();

// ─── 1. O que e PDF ──────────────────────────────────────────────────────────

(function reconheceOPdfDeOndeElePuderVir() {
    // O caso real do 20927.
    ok(ehArquivoPdf('https://x.supabase.co/storage/v1/object/public/artes/arte_frente_vibe_20927_1000409_178.pdf'),
        'o arquivo do storage e PDF');
    ok(ehArquivoPdf('https://x/arte.PDF'), 'maiuscula tambem');
    ok(ehArquivoPdf('https://x/arte.pdf?v=2'), 'com parametro na URL tambem');
    ok(ehArquivoPdf('data:application/pdf;base64,AAAA'), 'e o PDF embutido em data:');

    ok(!ehArquivoPdf('https://x/amostras_renderizadas/amostra_frente_1.jpg'), 'a previa JPG nao e PDF');
    ok(!ehArquivoPdf('data:image/png;base64,AAAA'), 'nem a imagem embutida');
    ok(!ehArquivoPdf(''), 'vazio nao e PDF');
    ok(!ehArquivoPdf(null), 'e nulo nao quebra');
    // Uma pasta chamada "pdf" no meio do caminho nao faz do arquivo um PDF.
    ok(!ehArquivoPdf('https://x/pdf/arte.png'), 'a palavra pdf no caminho nao conta');
})();

// ─── 2. Quando a tela desenha ao vivo em vez de mostrar a previa ─────────────

/**
 * A decisao LIDA do cliente.js -- as duas linhas de verdade, avaliadas aqui com
 * as variaveis de que elas dependem. Copiar a regra para o teste faria o teste
 * continuar passando depois de o original mudar, que e o defeito que este
 * projeto ja produziu tres vezes clonando script.js.
 */
function decisao({ item, temArteParaDesenhar, temCsv }) {
    const i = CLIENTE.indexOf('const previaUtil =');
    if (i < 0) throw new Error('nao achei o calculo de previaUtil no cliente.js');
    const fim = CLIENTE.indexOf(';', CLIENTE.indexOf('const desenhoAoVivo', i));
    const fonte = CLIENTE.slice(i, fim + 1);
    return new Function('item', 'temArteParaDesenhar', 'temCsvVariavel', 'numDoModelo', 'ehArquivoPdf',
        fonte + '\nreturn { previaUtil, desenhoAoVivo };')(
        item, temArteParaDesenhar, () => temCsv, null, ehArquivoPdf);
}

const SO_PDF = { arte_url: 'https://x/arte.pdf', amostra_arte_base64: 'https://x/arte.pdf', modo_pdf: false };
const COM_PREVIA = { arte_url: 'https://x/arte.pdf', amostra_arte_base64: 'https://x/previa.jpg', modo_pdf: false };
const SEM_NADA = { arte_url: 'https://x/arte.pdf', amostra_arte_base64: '', modo_pdf: false };

(function oCasoDo20927DesenhaAoVivo() {
    // Sem snapshot, o campo caiu para o arte_url -- que e um PDF.
    const d = decisao({ item: SO_PDF, temArteParaDesenhar: true, temCsv: false });
    ok(d.previaUtil === false, 'um PDF nao serve de previa', d);
    ok(d.desenhoAoVivo === true, 'entao a tela desenha ao vivo no canvas', d);
})();

(function comPreviaDeVerdadeAImagemAprovadaContinuaValendo() {
    // O caminho normal, e o mais barato: nada de baixar e rasterizar PDF no
    // celular do cliente quando o painel ja compos a previa.
    const d = decisao({ item: COM_PREVIA, temArteParaDesenhar: true, temCsv: false });
    ok(d.previaUtil === true, 'a previa em imagem serve', d);
    ok(d.desenhoAoVivo === false, 'e a tela usa a imagem aprovada', d);
})();

(function semPreviaNenhumaTambemDesenha() {
    const d = decisao({ item: SEM_NADA, temArteParaDesenhar: true, temCsv: false });
    ok(d.desenhoAoVivo === true, 'campo vazio tambem cai no desenho ao vivo', d);
})();

(function numeracaoComBancoContinuaDesenhandoSempre() {
    // O motivo original do canvas: folhear os ingressos linha a linha. Uma
    // imagem por linha seria inviavel.
    const d = decisao({ item: COM_PREVIA, temArteParaDesenhar: true, temCsv: true });
    ok(d.desenhoAoVivo === true, 'com banco, desenha ao vivo mesmo tendo previa', d);
})();

(function semArteParaCompoNaoSeDesenhaNada() {
    // Sem `arte_url` o canvas sairia com a cor e a numeracao e SEM a arte --
    // pior do que mostrar o aviso de que a arte ainda nao chegou.
    const d = decisao({ item: SEM_NADA, temArteParaDesenhar: false, temCsv: false });
    ok(d.desenhoAoVivo === false, 'sem arte para compor, nao desenha', d);
})();

(function oModoPdfMultiPaginaFicaComOVisualizadorDele() {
    const d = decisao({ item: { ...SO_PDF, modo_pdf: true }, temArteParaDesenhar: true, temCsv: false });
    ok(d.desenhoAoVivo === false, 'o modo PDF tem o proprio seletor de paginas', d);
})();

// ─── 3. Onde a decisao esta ligada na tela ───────────────────────────────────

(function asTresEscolhasDeCanvasSeguemODesenhoAoVivo() {
    // Frente e verso da peca com verso, e a peca de uma face so. Se alguma
    // ficasse presa no `paginaCsv`, o `<img>` quebrado voltaria por ali.
    const escolhas = CLIENTE.match(/\$\{\w+ \? `<canvas id="amostra-item-canvas/g) || [];
    ok(escolhas.length === 3, 'sao tres lugares que escolhem canvas ou imagem', escolhas);
    const comDesenho = CLIENTE.match(/\$\{desenhoAoVivo \? `<canvas id="amostra-item-canvas/g) || [];
    ok(comDesenho.length === 3, 'e os tres seguem o desenho ao vivo', comDesenho);
})();

(function oSeletorDeIngressosContinuaSoOndeHaBanco() {
    // O `paginaCsv` nao morreu: ele ainda comanda o folhear. Sobre uma arte sem
    // banco nao haveria o que virar.
    const seletores = CLIENTE.match(/\$\{!paginaCsv \? '' : `/g) || [];
    ok(seletores.length === 2, 'os dois seletores de ingresso seguem o banco', seletores);
})();

(function oAvisoDeVazioNaoAparecePorBaixoDoDesenho() {
    ok(!/\$\{paginaCsv \|\| arteVisivel/.test(CLIENTE),
        'o aviso de arte faltando nao decide mais pelo paginaCsv');
    ok(/\$\{desenhoAoVivo \|\| arteVisivel/.test(CLIENTE),
        'ele segue o que a tela realmente vai desenhar');
})();

(function oCampoDaPreviaContinuaCaindoParaAArteCrua() {
    // Esta linha e a origem do PDF dentro do campo da previa. Ela continua util
    // (arte em imagem aparece sem snapshot nenhum), e o teste existe para que
    // quem a ler saiba que o `desenhoAoVivo` e o que a torna segura.
    ok(/amostra_arte_base64: item\.amostra_arte_base64 \|\| item\.arte_url/.test(CLIENTE),
        'o carregamento ainda cai para a arte crua');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
