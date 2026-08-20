// O PDF de referencia da cor nao vem mais no catalogo.
//
// `producao_cores` guarda o PDF inteiro dentro da linha, em base64. Sao 24
// linhas e 17,8 MiB de JSON -- 16,8 MiB de `pdf_base64`/`pdf_verso_base64` e
// 1 MiB de `preview_base64`, coluna que nenhum arquivo do frontend le. Tudo o
// que a tela mostra cabe em 11,7 KiB.
//
// Enquanto a lista vinha com `select('*')`, abrir o painel baixava esses 18 MB
// antes de qualquer tela aparecer: era o que fazia o parceiro esperar ao clicar
// no link direto do pedido, e o cliente esperar na pagina de aprovacao.
//
// Este harness recorta `garantirPdfDaCor` do script.js e a executa contra um
// banco de mentira, e depois confere, na fonte, que ninguem voltou a pedir as
// colunas pesadas na lista.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const F = n => fs.readFileSync(path.join(RAIZ, 'frontend', n), 'utf8');
const SCRIPT = F('script.js');
const CLIENTE = F('cliente.js');
const PEDIDO = F('pedido.js');
const CRIADOR = F('criador-arte.js');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

function recortarAsync(fonte, nome) {
    const i = fonte.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

// ─── O banco de mentira ──────────────────────────────────────────────────────

function bancoFalso(linhas) {
    let consultas = 0;
    const cliente = {
        consultas: () => consultas,
        from() {
            return {
                select() { return this; },
                eq(campo, valor) { this._id = valor; return this; },
                maybeSingle() {
                    consultas++;
                    const linha = linhas[this._id];
                    return Promise.resolve({ data: linha === undefined ? null : linha, error: null });
                },
            };
        },
    };
    return cliente;
}

function montar(fonte, linhas, cores) {
    const banco = bancoFalso(linhas);
    const state = { cores: cores || [] };
    const fn = new Function('state', 'supabaseClient', 'console',
        'const _pdfDeCorEmVoo = new Map();\n'
        + recortarAsync(fonte, 'garantirPdfDaCor') + '\nreturn garantirPdfDaCor;')(
        state, banco, { warn() {} });
    return { fn, banco, state };
}

// ─── 1. Uma cor da lista enxuta busca o PDF e guarda ─────────────────────────

(async function buscaUmaVezEGuarda() {
    const cor = { id: 'c1', name: 'Mobi' };            // sem as colunas base64
    const { fn, banco } = montar(SCRIPT, { c1: { pdf_base64: 'data:pdf;base64,AAA', pdf_verso_base64: 'data:pdf;base64,BBB' } }, [cor]);

    await fn(cor);
    ok(cor.pdf_base64 === 'data:pdf;base64,AAA', 'a frente chega na cor', cor.pdf_base64);
    ok(cor.pdf_verso_base64 === 'data:pdf;base64,BBB', 'o verso chega na cor', cor.pdf_verso_base64);
    ok(banco.consultas() === 1, 'uma consulta', banco.consultas());

    await fn(cor);
    ok(banco.consultas() === 1, 'a segunda chamada NAO volta ao banco', banco.consultas());
})();

// ─── 2. Cor sem arquivo nao vira consulta repetida ───────────────────────────

(async function corSemArquivoNaoRepete() {
    const cor = { id: 'c2', name: 'Sem PDF' };
    const { fn, banco } = montar(SCRIPT, {}, [cor]);   // o banco nao tem a linha

    await fn(cor);
    ok(cor.pdf_base64 === null, 'cor sem arquivo fica com null, nao com undefined', String(cor.pdf_base64));
    await fn(cor);
    ok(banco.consultas() === 1, 'cor sem arquivo nao e perguntada duas vezes', banco.consultas());
})();

// ─── 3. Dois desenhos ao mesmo tempo, uma consulta so ────────────────────────

(async function duasChamadasJuntasUmaConsulta() {
    const cor = { id: 'c3', name: 'UP' };
    const { fn, banco } = montar(SCRIPT, { c3: { pdf_base64: 'X', pdf_verso_base64: null } }, [cor]);

    await Promise.all([fn(cor), fn(cor)]);
    ok(banco.consultas() === 1, 'duas chamadas simultaneas fazem UMA consulta', banco.consultas());
})();

// ─── 4. A copia no state recebe o mesmo PDF ──────────────────────────────────

(async function acopiaNoStateTambemRecebe() {
    const noEstado = { id: 'c4', name: 'Creme' };
    const copia = { id: 'c4', name: 'Creme' };          // outro objeto, mesmo id
    const { fn } = montar(SCRIPT, { c4: { pdf_base64: 'Y', pdf_verso_base64: null } }, [noEstado]);

    await fn(copia);
    ok(noEstado.pdf_base64 === 'Y', 'a linha do state tambem fica com o PDF', String(noEstado.pdf_base64));
})();

// ─── 5. A lista, na fonte, nao pede nenhuma coluna base64 ────────────────────

(function aListaNaoPedeAsColunasPesadas() {
    const m = SCRIPT.match(/const COLUNAS_DA_COR_NA_LISTA = '([^']+)'/);
    ok(!!m, 'COLUNAS_DA_COR_NA_LISTA existe no script.js');
    if (m) {
        const cols = m[1].split(',').map(s => s.trim());
        ['pdf_base64', 'pdf_verso_base64', 'preview_base64'].forEach(c =>
            ok(cols.indexOf(c) < 0, 'a lista de cores NAO traz ' + c));
        ['id', 'name', 'formato_id', 'width_mm', 'height_mm', 'cor_referencia', 'pdf_filename', 'name_verso', 'frente_verso']
            .forEach(c => ok(cols.indexOf(c) >= 0, 'a lista de cores traz ' + c + ', que a tela usa'));
    }

    [['script.js', SCRIPT], ['cliente.js', CLIENTE], ['pedido.js', PEDIDO]].forEach(([nome, fonte]) => {
        ok(!/from\(['"]producao_cores['"]\)[\s\S]{0,40}?select\(['"]\*['"]\)/.test(fonte),
            nome + ' nao pede producao_cores com select(*)');
    });

    ok(CLIENTE.indexOf('preview_base64') < 0 || !/select\('id, empresa_id[^']*preview_base64/.test(CLIENTE),
        'a pagina do cliente nao pede preview_base64');
})();

// ─── 6. Quem desenha a cor pede o PDF antes ──────────────────────────────────

(function quemDesenhaPedeAntes() {
    const casos = [
        ['script.js / drawAmostraFace', SCRIPT, 'drawAmostraFace'],
        ['cliente.js / drawAmostraFace', CLIENTE, 'drawAmostraFace'],
        ['criador-arte.js / renderEditorLayer1Cor', CRIADOR, 'renderEditorLayer1Cor'],
    ];
    casos.forEach(([rotulo, fonte, nome]) => {
        const corpo = recortarAsync(fonte, nome);
        const iPede = corpo.indexOf('garantirPdfDaCor');
        const iUsa = corpo.indexOf('cor.pdf_base64');
        ok(iPede >= 0, rotulo + ' chama garantirPdfDaCor');
        ok(iPede >= 0 && iUsa >= 0 && iPede < iUsa, rotulo + ' pede o PDF ANTES de ler cor.pdf_base64');
    });

    // A previa do pedido e sincrona de proposito: ela pede e redesenha.
    const previa = PEDIDO.slice(PEDIDO.indexOf('\nfunction drawPedPreview('));
    const iPede = previa.indexOf('garantirPdfDaCor');
    const iUsa = previa.indexOf('const corPdfUrl = isBack');
    ok(iPede >= 0 && iUsa >= 0 && iPede < iUsa, 'drawPedPreview pede o PDF antes de montar a arte da cor');
    ok(/garantirPdfDaCor\(corObj\)\.then\(/.test(previa), 'drawPedPreview redesenha quando o PDF chega');
})();

// ─── 7. O link de download da lista nao embute o arquivo ─────────────────────

(function oLinkDaListaNaoEmbuteOArquivo() {
    ok(SCRIPT.indexOf('href="${c.pdf_base64}"') < 0, 'a lista de cores nao embute o PDF no href');
    ok(SCRIPT.indexOf('window.baixarPdfDaCor') >= 0, 'existe baixarPdfDaCor para o clique');
    ok(/baixarPdfDaCor\('\$\{c\.id\}', 'frente'\)/.test(SCRIPT), 'o botao Frente chama baixarPdfDaCor');
    ok(/baixarPdfDaCor\('\$\{c\.id\}', 'verso'\)/.test(SCRIPT), 'o botao Verso chama baixarPdfDaCor');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

setTimeout(() => {
    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' conferencias falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' conferencias do PDF da cor sob demanda.');
}, 50);
