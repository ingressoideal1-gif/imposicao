// A decisão de "este nome já existe" do `saveNumeracao`, exercitada fora do
// navegador.
//
// Regra escolhida pelo usuário em 25/08/2026: conferir no banco e PERGUNTAR.
// Até então o `saveNumeracao` procurava a homônima em `state.numeracoes` — um
// retrato tirado no `loadAll()` — e, achando, substituía calada.
//
// São três situações, e elas terminam diferente de propósito:
//
//   1. Numeração EXCLUSIVA DE UM MODELO: o nome É o id do modelo, e a homônima
//      é a versão anterior da numeração desse mesmo modelo. Substitui direto.
//   2. CRIANDO no catálogo: pergunta. Confirmou, substitui; cancelou, não
//      salva nada e diz o que fazer.
//   3. EDITANDO e renomeando para o nome de OUTRA: recusa. "Substituir" ali
//      seria fundir dois registros vivos, que não é o que ninguém pediu.
//
// O bloco é RECORTADO do `script.js` e executado com dependências de mentira,
// para o teste medir o código que roda de verdade — e não uma cópia dele que
// envelhece sozinha.
//
// Roda em node: `node tests/numeracao_homonima_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

// ── O bloco de decisão, recortado ────────────────────────────────────────────
const INICIO = 'const doModelo = !!window.customNumeracaoEditState;';
const FIM = 'const gerarUuid';
const i = SCRIPT.indexOf(INICIO);
if (i < 0) throw new Error('nao achei o bloco de decisao das homonimas');
const BLOCO = SCRIPT.slice(i, SCRIPT.indexOf(FIM, i));

/**
 * Roda o bloco com um cenário montado.
 *
 * @param cenario.doModelo   veio do fluxo da numeração exclusiva do modelo
 * @param cenario.id         o id no formulário ('' = criando)
 * @param cenario.homonimas  o que o banco respondeu
 * @param cenario.confirma   o que a pessoa respondeu ao `confirm`
 */
function decidir(cenario) {
    const visto = { toastTipo: null, toastTexto: null, perguntou: false };

    const corpo = 'return (async () => {\n' + BLOCO + '\n  return { homonima, salvou: true };\n})();';
    const fn = new Function('window', 'name', 'id', 'homonimasDoCatalogo', 'toast', 'confirm', corpo);

    return fn(
        { customNumeracaoEditState: cenario.doModelo ? { itemId: '1000535' } : null },
        cenario.nome || 'Personalizada',
        cenario.id || '',
        async () => cenario.homonimas || [],
        (texto, tipo) => { visto.toastTexto = texto; visto.toastTipo = tipo; return undefined; },
        () => { visto.perguntou = true; return !!cenario.confirma; }
    ).then(r => Object.assign({ salvou: false }, r || {}, visto));
}

(async function () {

    // ── 1. O fluxo da numeração exclusiva do modelo ──────────────────────────

    {
        // O nome é o id do modelo; a homônima é a versão anterior dele mesmo.
        const r = await decidir({ doModelo: true, id: '', nome: '1000535', homonimas: [{ id: 'ANTIGA' }] });
        ok(r.salvou, 'modelo: segue salvando', r);
        ok(r.homonima && r.homonima.id === 'ANTIGA', 'modelo: substitui a anterior do proprio modelo', r);
        ok(!r.perguntou, 'modelo: NAO pergunta -- seria confirmar o obvio a cada salvamento', r);
    }

    // ── 2. Criando no catálogo ───────────────────────────────────────────────

    {
        const r = await decidir({ doModelo: false, id: '', homonimas: [{ id: 'A' }], confirma: true });
        ok(r.perguntou, 'catalogo: pergunta antes de substituir', r);
        ok(r.salvou && r.homonima && r.homonima.id === 'A', 'catalogo: confirmou, substitui', r);
    }

    {
        const r = await decidir({ doModelo: false, id: '', homonimas: [{ id: 'A' }], confirma: false });
        ok(r.perguntou, 'catalogo: perguntou');
        ok(!r.salvou, 'catalogo: cancelou, NAO grava nada', r);
        ok(r.toastTipo === 'warning', 'catalogo: e avisa, sem tratar como erro', r);
        ok(/troque o nome/i.test(r.toastTexto || ''),
            'catalogo: o aviso diz COMO sair da trava', r.toastTexto);
    }

    {
        // O `confirm` que nao aparece devolve `false`. Falhar fechado aqui e o
        // certo: nada e destruido e o operador ve um recado.
        const r = await decidir({ doModelo: false, id: '', homonimas: [{ id: 'A' }], confirma: undefined });
        ok(!r.salvou, 'catalogo: confirm mudo vale por cancelar, e nada e sobrescrito', r);
    }

    // ── 3. Editando e renomeando para o nome de outra ────────────────────────

    {
        const r = await decidir({ doModelo: false, id: 'EU', homonimas: [{ id: 'OUTRA' }], confirma: true });
        ok(!r.salvou, 'editando: recusa', r);
        ok(r.toastTipo === 'error', 'editando: como erro', r);
        ok(!r.perguntou, 'editando: nem chega a oferecer substituir -- seria fundir dois registros', r);
        ok(/nome diferente/i.test(r.toastTexto || ''), 'editando: diz o que fazer', r.toastTexto);
    }

    // ── 4. O nome JÁ está repetido no catálogo ───────────────────────────────

    {
        // E o caso das tres duplicatas que existiam no banco em 25/08/2026.
        // "Substituir" nao teria uma resposta so, e escolher por conta propria
        // seria repetir o defeito que este conserto veio corrigir.
        const r = await decidir({ doModelo: false, id: '', homonimas: [{ id: 'A' }, { id: 'B' }], confirma: true });
        ok(!r.salvou, 'ja duplicado: recusa em vez de escolher uma', r);
        ok(!r.perguntou, 'ja duplicado: nem pergunta', r);
        ok(/2 numera/i.test(r.toastTexto || ''), 'ja duplicado: diz quantas sao', r.toastTexto);
        ok(/renomeie/i.test(r.toastTexto || ''), 'e aponta a saida', r.toastTexto);
    }

    // ── 5. O caminho normal ──────────────────────────────────────────────────

    {
        const r = await decidir({ doModelo: false, id: '', homonimas: [] });
        ok(r.salvou && !r.homonima, 'sem homonima: cria, sem perguntar nada', r);
        ok(!r.perguntou, 'sem homonima: nao incomoda o operador', r);
    }

    {
        const r = await decidir({ doModelo: false, id: 'EU', homonimas: [] });
        ok(r.salvou && !r.homonima, 'editando sem colisao: atualiza a propria linha', r);
    }

    // ── 6. A consulta é ao BANCO, e não ao cache ─────────────────────────────

    {
        const fonte = SCRIPT.slice(SCRIPT.indexOf('async function homonimasDoCatalogo'));
        // Sem as linhas de comentario: elas citam o `ilike` de proposito, para
        // quem ler saber por que ele NAO esta ali -- e uma busca ingenua acha a
        // citacao e acusa o conserto de ser o defeito.
        // `'\n}'`, e nao `'\n}\n'`: o arquivo tem fim de linha CRLF, entao
        // depois da chave vem `\r` e o segundo `\n` nunca casa -- o recorte ia
        // ate o fim do arquivo e pegava um `.ilike` de outra funcao, 25 mil
        // linhas adiante. O erro passou por conserto quebrado por dez minutos.
        const corpo = fonte.slice(0, fonte.indexOf('\n}'))
            .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
        ok(/from\('producao_numeracoes'\)/.test(corpo),
            'homonimasDoCatalogo pergunta ao banco');
        ok(!/ilike/.test(corpo),
            'e NAO com ilike: `%` e `_` sao curinga, e `Ticket_A` casaria com `TicketXA`');
        ok(/String\(n\.id\) !== String\(idAtual/.test(corpo),
            'ignora a propria linha, senao editar sem renomear colidiria consigo mesma');
        ok(/trim\(\)\.toLowerCase\(\)/.test(corpo),
            'compara sem caixa e sem espaco nas pontas');
        ok(/state\.numeracoes/.test(corpo),
            'e cai no cache quando nao ha supabaseClient, em vez de nao conferir nada');
    }

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' conferencias da numeracao homonima.');
})();
