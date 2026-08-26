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
 * Uma função do `script.js`, recortada e viva.
 *
 * Os corpos destas funções não têm chave na coluna zero antes do fim, então o
 * primeiro fim-de-linha seguido de `}` fecha o recorte. Ver a nota sobre CRLF
 * no recorte do `homonimasDoCatalogo`, mais abaixo.
 */
function recortarFuncao(nome) {
    const j = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (j < 0) throw new Error('nao achei a funcao ' + nome);
    const corpo = SCRIPT.slice(j, SCRIPT.indexOf('\n}', j) + 2);
    return new Function(corpo + '\nreturn ' + nome + ';')();
}

// A regra do nome (26/08/2026) é medida DE VERDADE: é ela que decide se o save
// mexe num modelo só ou no cliente inteiro.
const numeracaoEhCompartilhadaDoCliente = recortarFuncao('numeracaoEhCompartilhadaDoCliente');
const modeloEstaAprovado = recortarFuncao('modeloEstaAprovado');
const nomeCurtoDoModelo = m => String((m && (m.nome_modelo || m.nome_produto)) || 'modelo');

/**
 * Roda o bloco com um cenário montado.
 *
 * @param cenario.doModelo   veio do fluxo da numeração exclusiva do modelo
 * @param cenario.id         o id no formulário ('' = criando)
 * @param cenario.homonimas  o que o banco respondeu
 * @param cenario.confirma   o que a pessoa respondeu ao `confirm`
 * @param cenario.registro   a linha que está sendo editada (`state.numeracoes`)
 * @param cenario.usuarios   os modelos que hoje apontam para ela
 */
function decidir(cenario) {
    const visto = { toastTipo: null, toastTexto: null, perguntou: 0 };

    // `id` e `name` voltam junto: a saída da trava do modelo aprovado é virar
    // cópia deste modelo, e isso troca os dois.
    const corpo = 'return (async () => {\n' + BLOCO + '\n  return { homonima, salvou: true, id, name };\n})();';
    const fn = new Function(
        'window', 'name', 'id', 'homonimasDoCatalogo', 'toast', 'confirm',
        'state', 'document', 'numeracaoEhCompartilhadaDoCliente',
        'modelosQueUsamNumeracao', 'modeloEstaAprovado', 'nomeCurtoDoModelo',
        corpo);

    const registro = cenario.registro || null;

    return fn(
        { customNumeracaoEditState: cenario.doModelo ? { itemId: '1000535', osId: 'os-1' } : null },
        cenario.nome || 'Personalizada',
        cenario.id || '',
        async () => cenario.homonimas || [],
        (texto, tipo) => { visto.toastTexto = texto; visto.toastTipo = tipo; return undefined; },
        () => { visto.perguntou++; return !!cenario.confirma; },
        { numeracoes: registro ? [registro] : [], osItens: { 'os-1': [{ id: '1000535' }] } },
        { getElementById: () => ({ value: '' }) },
        numeracaoEhCompartilhadaDoCliente,
        async () => cenario.usuarios || [],
        modeloEstaAprovado,
        nomeCurtoDoModelo
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

    // ── 5b. A numeração COMPARTILHADA do cliente (26/08/2026) ────────────────
    //
    // Renomeada, ela deixa de ser de um modelo e passa a servir a todos os do
    // cliente. Editá-la de dentro de qualquer um grava para todos — que é o que
    // o usuário pediu, e por isso mesmo não pode acontecer calado.

    const COMPARTILHADA = { id: 'N1', name: 'Camarote VIP', Cli_Num: '4321',
                            is_custom: true, os_item_id: '1000535' };
    const SO_DO_MODELO = { id: 'N1', name: '1000535', Cli_Num: '4321',
                           is_custom: true, os_item_id: '1000535' };

    {
        // So este modelo usa: nao ha mais ninguem a avisar.
        const r = await decidir({
            doModelo: true, id: 'N1', nome: 'Camarote VIP', registro: COMPARTILHADA,
            usuarios: [{ id: '1000535' }], homonimas: [],
        });
        ok(r.salvou && r.id === 'N1', 'compartilhada: grava na propria linha, sem clonar', r);
        ok(!r.perguntou, 'compartilhada sem mais ninguem: nao incomoda o operador', r);
    }

    {
        const r = await decidir({
            doModelo: true, id: 'N1', nome: 'Camarote VIP', registro: COMPARTILHADA,
            usuarios: [{ id: '1000535' }, { id: 'OUTRO', nome_modelo: 'Pista' }],
            homonimas: [], confirma: true,
        });
        ok(r.perguntou, 'compartilhada em uso por outro modelo: avisa antes', r);
        ok(r.salvou && r.id === 'N1', 'confirmou: grava na MESMA linha, valendo para todos', r);
    }

    {
        const r = await decidir({
            doModelo: true, id: 'N1', nome: 'Camarote VIP', registro: COMPARTILHADA,
            usuarios: [{ id: '1000535' }, { id: 'OUTRO' }], homonimas: [], confirma: false,
        });
        ok(!r.salvou, 'compartilhada: cancelou, nada e gravado', r);
        ok(r.toastTipo === 'warning', 'e avisa sem tratar como erro', r);
    }

    {
        // Modelo aprovado nao se altera. A saida esta no proprio aviso: virar
        // copia exclusiva deste modelo, deixando a compartilhada intacta.
        const r = await decidir({
            doModelo: true, id: 'N1', nome: 'Camarote VIP', registro: COMPARTILHADA,
            usuarios: [{ id: 'OUTRO', amostra_status: 'APROVADA' }],
            homonimas: [], confirma: true,
        });
        ok(r.salvou, 'aprovado: a trava tem saida, e ela grava', r);
        ok(r.id === '', 'aprovado: vira INSERT -- nao toca na compartilhada', r);
        ok(r.name === '1000535', 'aprovado: a copia nasce com o nome deste modelo', r);
    }

    {
        const r = await decidir({
            doModelo: true, id: 'N1', nome: 'Camarote VIP', registro: COMPARTILHADA,
            usuarios: [{ id: 'OUTRO', status_arte: 'APROVADA_CLIENTE' }],
            homonimas: [], confirma: false,
        });
        ok(!r.salvou, 'aprovado: recusou a copia, nada e gravado', r);
    }

    {
        // Nome ainda igual ao os_item_id: e de um modelo so, nao ha o que avisar.
        const r = await decidir({
            doModelo: true, id: 'N1', nome: '1000535', registro: SO_DO_MODELO,
            usuarios: [{ id: 'OUTRO', amostra_status: 'APROVADA' }], homonimas: [],
        });
        ok(r.salvou && r.id === 'N1' && !r.perguntou,
            'exclusiva do modelo: segue direto, a guarda so vale para a compartilhada', r);
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
