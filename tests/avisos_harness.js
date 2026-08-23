// O QUADRO DE AVISOS dos paineis (23/08/2026).
//
// Nada aqui e copia da regra: o `frontend/avisos.js` inteiro e executado dentro
// de um DOM de mentira, e o que se mede e o HTML que ele produz e o que ele
// manda para o banco.
//
// O que estes testes protegem, em uma frase cada:
//
//   1. sao OITO quadros — 4 setores x 2 paineis — e quadro sem aviso nao
//      desenha barra nenhuma;
//   2. a barra segue o filtro de setor do painel, lido pelas pilulas;
//   3. o aviso de um painel nunca aparece no outro;
//   4. aviso vencido some da barra sozinho, sem ninguem lembrar;
//   5. urgente vem primeiro, e nao deixa recolher antes de alguem confirmar;
//   6. o dropdown lista os operadores do PERFIL daquele painel;
//   7. marcar leitura grava, nao duplica, e desfaz na tela se o banco recusar;
//   8. trocar o texto pedindo confirmacao de novo cria aviso NOVO, para o
//      historico continuar respondendo quem foi avisado de que;
//   9. a barra avisa a propria altura, para o toast nao cair em cima dela.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const FONTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'avisos.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── Um DOM de mentira, do tamanho exato do que a barra pede ────────────────

function criarElemento(id) {
    const classes = new Set();
    const el = {
        id,
        textContent: '',
        innerHTML: '',
        value: '',
        style: { display: '', setProperty(k, v) { this[k] = v; } },
        filhos: [],
        atributos: {},
        classList: {
            add: c => classes.add(c),
            remove: c => classes.delete(c),
            contains: c => classes.has(c),
            toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
        },
        getAttribute: nome => (el.atributos[nome] !== undefined ? el.atributos[nome] : null),
        setAttribute: (nome, v) => { el.atributos[nome] = v; },
        appendChild: f => { el.filhos.push(f); },
        addEventListener: () => {},
        getBoundingClientRect: () => ({ height: el.innerHTML ? 76 : 0, width: 1180 }),
        // So o seletor que o avisos.js usa de verdade: as pilulas de setor.
        querySelectorAll: sel => (sel === '.filter-btn-pill'
            ? el.filhos.filter(f => f.classList.contains('filter-btn-pill'))
            : []),
        querySelector: () => null,
    };
    return el;
}

function pilula(setor, acesa) {
    const p = criarElemento('pilula-' + setor);
    p.classList.add('filter-btn-pill');
    if (acesa) p.classList.add('active');
    p.setAttribute('data-setor', setor);
    return p;
}

/** Uma cadeia do PostgREST que devolve sempre a mesma resposta. */
function cadeia(resposta, aoTerminar) {
    const c = {
        select: () => c,
        eq: () => c,
        in: () => c,
        order: () => c,
        then: (res, rej) => {
            if (aoTerminar) aoTerminar();
            return Promise.resolve(resposta).then(res, rej);
        },
    };
    return c;
}

const HOJE = (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0');
})();

const ONTEM = (() => {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0');
})();

function montarAmbiente(config) {
    const conf = config || {};
    const elementos = {};
    const escritas = [];

    const documento = {
        documentElement: criarElemento('html'),
        getElementById(id) {
            if (!elementos[id]) elementos[id] = criarElemento(id);
            return elementos[id];
        },
        addEventListener: () => {},
    };

    // As duas secoes de painel, e a que estiver aberta ganha `active`.
    const aberto = conf.painelAberto === undefined ? 'producao' : conf.painelAberto;
    const secaoProd = documento.getElementById('view-lista-impressao');
    const secaoAcab = documento.getElementById('view-acabamento');
    if (aberto === 'producao') secaoProd.classList.add('active');
    if (aberto === 'acabamento') secaoAcab.classList.add('active');

    // As pilulas dos dois paineis, com os setores acesos que o teste pedir.
    const acesosProd = conf.setoresProducao || [];
    const acesosAcab = conf.setoresAcabamento || [];
    ['FLEXO', 'PVC', 'TEXTIL', 'LASER'].forEach(s => {
        documento.getElementById('filter-container-setor')
            .appendChild(pilula(s, acesosProd.includes(s)));
        documento.getElementById('filter-container-setor-acab')
            .appendChild(pilula(s, acesosAcab.includes(s)));
    });

    const avisosNoBanco = conf.avisos || [];
    const leiturasNoBanco = conf.leituras || [];
    const operadores = conf.operadores || [
        { id: 1, nome: 'Ana Paula', role: 'impressor', ativo: true },
        { id: 2, nome: 'Carlos M.', role: 'impressor', ativo: true },
        { id: 3, nome: 'Beatriz L.', role: 'acabamento', ativo: true },
        { id: 4, nome: 'Sandro P.', role: 'acabamento', ativo: true },
        { id: 5, nome: 'Rafaela T.', role: 'admin', ativo: true },
    ];

    const banco = {
        from(tabela) {
            if (tabela === 'imposition_avisos') {
                return {
                    select: () => cadeia(conf.erroAvisos
                        ? { data: null, error: conf.erroAvisos }
                        : { data: avisosNoBanco.filter(a => a.ativo !== false), error: null }),
                    insert: payload => {
                        escritas.push({ tabela, tipo: 'insert', payload });
                        return Promise.resolve({ error: conf.erroAoGravar || null });
                    },
                    update: payload => ({
                        eq: (coluna, valor) => {
                            escritas.push({ tabela, tipo: 'update', payload, coluna, valor });
                            return Promise.resolve({ error: conf.erroAoGravar || null });
                        },
                    }),
                };
            }
            if (tabela === 'imposition_avisos_leituras') {
                return {
                    select: () => cadeia({ data: leiturasNoBanco, error: null }),
                    insert: payload => {
                        escritas.push({ tabela, tipo: 'insert', payload });
                        return Promise.resolve({ error: conf.erroAoMarcar || null });
                    },
                };
            }
            if (tabela === 'imposition_operadores') {
                return { select: () => cadeia({ data: operadores, error: null }) };
            }
            return { select: () => cadeia({ data: [], error: null }) };
        },
    };

    const avisosDoToast = [];
    const janela = {
        escapeHtml: v => String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
        toast: (texto, tipo) => avisosDoToast.push({ texto, tipo }),
        confirm: () => conf.confirmar !== false,
    };

    new Function('window', 'document', 'supabaseClient', 'confirm', FONTE)(
        janela, documento, banco, janela.confirm);

    return {
        janela, documento, elementos, banco, escritas, avisosDoToast,
        painel: janela.AvisosPainel,
        barra: () => documento.getElementById('barra-avisos'),
    };
}

/**
 * Digitar no campo do aviso, como o navegador faz.
 *
 * O `oninput` da textarea chama `digitou(this.value)` DEPOIS de o campo ja
 * guardar o texto — e o editor releia o campo antes de qualquer redesenho, para
 * nao perder o que estava escrito. Sem espelhar as duas coisas aqui, o teste
 * mediria um caminho que nao existe no navegador.
 */
function digitar(amb, texto) {
    amb.documento.getElementById('aviso-texto').value = texto;
    amb.painel.digitou(texto);
}

function aviso(extra) {
    return Object.assign({
        id: 'a1',
        painel: 'producao',
        setor: 'FLEXO',
        texto: 'Tinta branca do Flexo em manutencao ate quinta.',
        prioridade: 'normal',
        vale_ate: null,
        ativo: true,
        publicado_por: 'junior',
        publicado_em: '2026-08-23T07:40:00Z',
    }, extra || {});
}

// ─── 1. Os oito quadros ─────────────────────────────────────────────────────

(async function quadroSemAvisoNaoDesenhaNada() {
    const amb = montarAmbiente({ avisos: [] });
    await amb.painel.recarregar();
    ok(amb.barra().style.display === 'none', 'sem aviso nenhum, a barra nao existe',
       amb.barra().style.display);
    ok(amb.barra().innerHTML === '', 'e nao deixa marcacao para tras');
})();

(async function oAvisoDoSetorApareceNaBarra() {
    const amb = montarAmbiente({ avisos: [aviso()] });
    await amb.painel.recarregar();
    const html = amb.barra().innerHTML;
    ok(amb.barra().style.display === '', 'com aviso, a barra aparece');
    ok(html.indexOf('Tinta branca do Flexo') !== -1, 'com o texto do recado', html.slice(0, 200));
    ok(html.indexOf('Produção · Flexo') !== -1, 'e dizendo de que painel e de que setor ele e');
    ok(html.indexOf('Marcar minha leitura') !== -1, 'e com o botao da confirmacao');
})();

// ─── 2. A barra segue o filtro de setor ─────────────────────────────────────

(async function aPilulaAcesaFiltraOAviso() {
    const dois = [aviso(), aviso({ id: 'a2', setor: 'PVC', texto: 'Cartao PVC com cordao preto.' })];

    const todos = montarAmbiente({ avisos: dois });
    await todos.painel.recarregar();
    ok(/Aviso 1 de 2/.test(todos.barra().innerHTML),
       'sem setor escolhido, a barra mostra os dois do painel', todos.barra().innerHTML.slice(0, 300));

    const soPvc = montarAmbiente({ avisos: dois, setoresProducao: ['PVC'] });
    await soPvc.painel.recarregar();
    const html = soPvc.barra().innerHTML;
    ok(html.indexOf('Cartao PVC') !== -1, 'com PVC aceso, aparece o do PVC');
    ok(html.indexOf('Tinta branca') === -1, 'e o do Flexo sai de cena');
    ok(/Aviso 1 de 2/.test(html) === false, 'e sem paginacao, porque sobrou um so');
})();

(async function osSetoresSomam() {
    const tres = [
        aviso(),
        aviso({ id: 'a2', setor: 'PVC', texto: 'Cartao PVC com cordao preto.' }),
        aviso({ id: 'a3', setor: 'LASER', texto: 'Exaustor da Laser em revisao.' }),
    ];
    const amb = montarAmbiente({ avisos: tres, setoresProducao: ['FLEXO', 'LASER'] });
    await amb.painel.recarregar();
    ok(/Aviso 1 de 2/.test(amb.barra().innerHTML),
       'dois setores acesos somam os dois avisos', amb.barra().innerHTML.slice(0, 200));
    ok(amb.barra().innerHTML.indexOf('Cartao PVC') === -1, 'e o setor apagado fica de fora');
})();

// ─── 3. Um painel nao ve o aviso do outro ───────────────────────────────────

(async function oAvisoNaoAtravessaDePainel() {
    const so = [aviso({ painel: 'acabamento', setor: 'TEXTIL', texto: 'Dobrar em quatro e ensacar de dez.' })];

    const naProducao = montarAmbiente({ avisos: so, painelAberto: 'producao' });
    await naProducao.painel.recarregar();
    ok(naProducao.barra().style.display === 'none',
       'aviso do Acabamento nao aparece na Producao');

    const noAcabamento = montarAmbiente({ avisos: so, painelAberto: 'acabamento' });
    await noAcabamento.painel.recarregar();
    ok(noAcabamento.barra().innerHTML.indexOf('Dobrar em quatro') !== -1,
       'e aparece no Acabamento');
    ok(noAcabamento.barra().innerHTML.indexOf('Acabamento · Têxtil') !== -1,
       'com o nome do painel e do setor daquele quadro');
})();

(async function foraDosPaineisABarraSome() {
    const amb = montarAmbiente({ avisos: [aviso()], painelAberto: null });
    await amb.painel.recarregar();
    ok(amb.barra().style.display === 'none',
       'em qualquer outra tela a barra nao aparece — o recado e dos dois paineis');
})();

// ─── 4. O prazo vence sozinho ───────────────────────────────────────────────

(async function avisoVencidoSaiDaBarra() {
    const amb = montarAmbiente({ avisos: [aviso({ vale_ate: ONTEM })] });
    await amb.painel.recarregar();
    ok(amb.barra().style.display === 'none',
       'aviso com prazo de ontem nao aparece hoje, sem ninguem tirar');

    const hoje = montarAmbiente({ avisos: [aviso({ vale_ate: HOJE })] });
    await hoje.painel.recarregar();
    ok(hoje.barra().style.display === '', 'o do prazo de HOJE ainda vale — o dia inteiro');

    const semPrazo = montarAmbiente({ avisos: [aviso({ vale_ate: null })] });
    await semPrazo.painel.recarregar();
    ok(semPrazo.barra().style.display === '', 'e o sem prazo fica ate alguem tirar');
})();

// ─── 5. Urgente ─────────────────────────────────────────────────────────────

(async function urgenteVemPrimeiroENaoRecolhe() {
    const dois = [
        aviso({ id: 'a1', texto: 'Recado comum.', publicado_em: '2026-08-23T09:00:00Z' }),
        aviso({ id: 'a2', texto: 'Parar a impressao do 21085.', prioridade: 'urgente',
                publicado_em: '2026-08-23T07:00:00Z' }),
    ];
    const amb = montarAmbiente({ avisos: dois });
    await amb.painel.recarregar();
    const html = amb.barra().innerHTML;
    ok(html.indexOf('Parar a impressao') !== -1,
       'o urgente assume o topo, mesmo sendo mais antigo', html.slice(0, 300));
    ok(html.indexOf('Urgente') !== -1, 'e sai marcado como urgente');
    ok(html.indexOf('confirme a leitura para poder recolher') !== -1,
       'e nao deixa recolher antes de alguem confirmar');
    ok(html.indexOf('cursor: not-allowed') !== -1, 'com a seta apagada, e nao escondida');
})();

(async function urgenteJaLidoVoltaARecolher() {
    const amb = montarAmbiente({
        avisos: [aviso({ prioridade: 'urgente' })],
        leituras: [{ aviso_id: 'a1', nome: 'Ana Paula', lido_em: '2026-08-23T08:00:00Z' }],
    });
    await amb.painel.recarregar();
    ok(amb.barra().innerHTML.indexOf('AvisosPainel.recolher(') !== -1,
       'com uma confirmacao ja gravada, o urgente volta a poder ser recolhido');
})();

// ─── 6. O dropdown e a lista do PERFIL daquele painel ───────────────────────

(async function oDropListaOsOperadoresDoPainel() {
    const amb = montarAmbiente({ avisos: [aviso()] });
    await amb.painel.recarregar();
    amb.painel.alternarLista('a1');
    const html = amb.barra().innerHTML;
    ok(html.indexOf('Confirmar leitura') !== -1, 'o drop abre com o titulo do que ele faz');
    ok(html.indexOf('Toque no seu nome') !== -1, 'e dizendo o que fazer ali');
    ok(html.indexOf('Ana Paula') !== -1 && html.indexOf('Carlos M.') !== -1,
       'com os impressores, que sao quem trabalha na Producao');
    ok(html.indexOf('Beatriz L.') === -1, 'sem quem e do acabamento');
    ok(html.indexOf('Rafaela T.') === -1, 'e sem quem e do escritorio');
})();

(async function noAcabamentoAListaEOutra() {
    const amb = montarAmbiente({
        avisos: [aviso({ painel: 'acabamento', setor: 'TEXTIL' })],
        painelAberto: 'acabamento',
    });
    await amb.painel.recarregar();
    amb.painel.alternarLista('a1');
    const html = amb.barra().innerHTML;
    ok(html.indexOf('Beatriz L.') !== -1 && html.indexOf('Sandro P.') !== -1,
       'no Acabamento o drop traz quem tem o perfil do acabamento');
    ok(html.indexOf('Ana Paula') === -1, 'e nao os impressores');
})();

(async function semOperadorODropDizOQueFazer() {
    const amb = montarAmbiente({ avisos: [aviso()], operadores: [] });
    await amb.painel.recarregar();
    amb.painel.alternarLista('a1');
    ok(/Usuários → Acesso Local/.test(amb.barra().innerHTML),
       'lista vazia nao e uma caixa muda: ela diz onde cadastrar',
       amb.barra().innerHTML.slice(-400));
})();

(async function quemLeuEPerdeuOAcessoContinuaNaLista() {
    const amb = montarAmbiente({
        avisos: [aviso()],
        leituras: [{ aviso_id: 'a1', nome: 'Quem Saiu', lido_em: '2026-08-23T08:00:00Z' }],
    });
    await amb.painel.recarregar();
    amb.painel.alternarLista('a1');
    ok(amb.barra().innerHTML.indexOf('Quem Saiu') !== -1,
       'a leitura e um fato datado: o nome fica mesmo sem acesso local');
})();

// ─── 7. Marcar a leitura ────────────────────────────────────────────────────

(async function marcarGravaEMostraNaHora() {
    const amb = montarAmbiente({ avisos: [aviso()] });
    await amb.painel.recarregar();
    amb.painel.alternarLista('a1');
    await amb.painel.marcar('a1', 'Ana Paula');

    const gravou = amb.escritas.find(e => e.tabela === 'imposition_avisos_leituras');
    ok(!!gravou, 'a confirmacao vai para o banco', JSON.stringify(amb.escritas));
    ok(gravou && gravou.payload.aviso_id === 'a1' && gravou.payload.nome === 'Ana Paula',
       'com o aviso e o nome', JSON.stringify(gravou && gravou.payload));
    ok(amb.barra().innerHTML.indexOf('1 de 2 leram') !== -1,
       'e o contador da barra sobe', amb.barra().innerHTML.slice(0, 400));
})();

(async function oMesmoNomeDuasVezesNaoDuplica() {
    const amb = montarAmbiente({
        avisos: [aviso()],
        leituras: [{ aviso_id: 'a1', nome: 'Ana Paula', lido_em: '2026-08-23T08:00:00Z' }],
    });
    await amb.painel.recarregar();
    await amb.painel.marcar('a1', 'Ana Paula');
    ok(amb.escritas.filter(e => e.tabela === 'imposition_avisos_leituras').length === 0,
       'quem ja marcou nao grava de novo — a tela nem chama o banco');
})();

(async function aTravaDeUnicidadeNaoEErroParaQuemOlha() {
    const amb = montarAmbiente({
        avisos: [aviso()],
        erroAoMarcar: { code: '23505', message: 'duplicate key' },
    });
    await amb.painel.recarregar();
    await amb.painel.marcar('a1', 'Ana Paula');
    ok(amb.barra().innerHTML.indexOf('1 de 2 leram') !== -1,
       'alguem ja tinha marcado aquele nome: o fato esta registrado, e a marca fica');
    ok(!amb.avisosDoToast.some(a => a.tipo === 'error'),
       'e ninguem ve mensagem de erro', JSON.stringify(amb.avisosDoToast));
})();

(async function bancoRecusandoDesfazAMarca() {
    const amb = montarAmbiente({
        avisos: [aviso()],
        erroAoMarcar: { code: '42501', message: 'sem permissao' },
    });
    await amb.painel.recarregar();
    await amb.painel.marcar('a1', 'Ana Paula');
    ok(amb.barra().innerHTML.indexOf('0 de 2 leram') !== -1,
       'gravacao recusada desfaz a marca — confirmacao que so existe na tela e pior que nenhuma',
       amb.barra().innerHTML.slice(0, 400));
    ok(amb.avisosDoToast.some(a => a.tipo === 'error'), 'e a tela diz que nao deu');
})();

// ─── 8. O ADM ───────────────────────────────────────────────────────────────

(async function aGradeTemOitoQuadros() {
    const amb = montarAmbiente({ avisos: [aviso()] });
    await amb.painel.recarregar();
    await amb.painel.renderAdm();
    const html = amb.elementos['adm-tab-avisos'].innerHTML;
    const editar = (html.match(/AvisosPainel\.abrirEditor\(/g) || []).length;
    ok(editar === 8, 'a aba mostra os oito quadros — 4 setores x 2 paineis', editar + ' encontrados');
    ok(html.indexOf('Painel de Produção') !== -1 && html.indexOf('Painel do Acabamento') !== -1,
       'com as duas colunas nomeadas');
    ok(html.indexOf('Sem aviso') !== -1, 'e o quadro vazio dizendo que esta vazio');
})();

(async function publicarSemTextoERecusado() {
    const amb = montarAmbiente({ avisos: [] });
    await amb.painel.recarregar();
    amb.painel.abrirEditor('producao', 'FLEXO');
    await amb.painel.publicar();
    ok(amb.escritas.length === 0, 'aviso vazio nao vai para o banco');
    ok(amb.elementos['adm-tab-avisos'].innerHTML.indexOf('Escreva o aviso antes de publicar') !== -1,
       'e a tela diz por que');
})();

(async function trocarOTextoComLeituraCriaAvisoNovo() {
    const amb = montarAmbiente({
        avisos: [aviso()],
        leituras: [{ aviso_id: 'a1', nome: 'Ana Paula', lido_em: '2026-08-23T08:00:00Z' }],
    });
    await amb.painel.recarregar();
    amb.painel.abrirEditor('producao', 'FLEXO');
    digitar(amb, 'Recado novo, outro assunto.');
    await amb.painel.publicar();

    const desativou = amb.escritas.find(e => e.tipo === 'update' && e.payload.ativo === false);
    const inseriu = amb.escritas.find(e => e.tipo === 'insert' && e.tabela === 'imposition_avisos');
    ok(!!desativou, 'o aviso antigo sai do ar', JSON.stringify(amb.escritas));
    ok(desativou && desativou.valor === 'a1', 'e e o antigo mesmo');
    ok(!!inseriu, 'e entra um aviso NOVO, com leituras zeradas');
    ok(inseriu && inseriu.payload.texto === 'Recado novo, outro assunto.',
       'com o texto digitado', JSON.stringify(inseriu && inseriu.payload));
    ok(inseriu && inseriu.payload.painel === 'producao' && inseriu.payload.setor === 'FLEXO',
       'no quadro certo');
})();

(async function desmarcandoOReinicioOTextoEAtualizadoNoLugar() {
    const amb = montarAmbiente({
        avisos: [aviso()],
        leituras: [{ aviso_id: 'a1', nome: 'Ana Paula', lido_em: '2026-08-23T08:00:00Z' }],
    });
    await amb.painel.recarregar();
    amb.painel.abrirEditor('producao', 'FLEXO');
    digitar(amb, 'Mesma coisa, so corrigindo a grafia.');
    amb.painel.alternarReiniciar();      // desmarca
    await amb.painel.publicar();

    const inseriu = amb.escritas.find(e => e.tipo === 'insert' && e.tabela === 'imposition_avisos');
    const atualizou = amb.escritas.find(e => e.tipo === 'update' && e.payload.texto);
    ok(!inseriu, 'sem pedir confirmacao de novo, nao nasce aviso nenhum');
    ok(!!atualizou, 'o texto e corrigido no lugar');
    ok(atualizou && atualizou.valor === 'a1', 'no mesmo aviso — e quem ja leu continua valendo');
})();

(async function quadroVazioPublicaDeCara() {
    const amb = montarAmbiente({ avisos: [] });
    await amb.painel.recarregar();
    amb.painel.abrirEditor('acabamento', 'TEXTIL');
    digitar(amb, 'Camiseta do Rodeio: dobrar em quatro.');
    await amb.painel.publicar();
    const inseriu = amb.escritas.find(e => e.tipo === 'insert' && e.tabela === 'imposition_avisos');
    ok(!!inseriu, 'quadro vazio publica direto');
    ok(inseriu && inseriu.payload.painel === 'acabamento' && inseriu.payload.setor === 'TEXTIL',
       'no painel e no setor do quadro aberto', JSON.stringify(inseriu && inseriu.payload));
    ok(!amb.escritas.some(e => e.tipo === 'update'), 'sem desativar nada, porque nao havia nada');
})();

// ─── 9. A barra nao atropela o toast ────────────────────────────────────────

(async function aBarraPublicaAPropriaAltura() {
    const amb = montarAmbiente({ avisos: [aviso()] });
    await amb.painel.recarregar();
    const raiz = amb.documento.documentElement;
    ok(raiz.style['--avisos-altura'] === '90px',
       'com a barra na tela, a altura dela vai para a variavel que empurra o toast',
       raiz.style['--avisos-altura']);

    const vazio = montarAmbiente({ avisos: [] });
    await vazio.painel.recarregar();
    ok(vazio.documento.documentElement.style['--avisos-altura'] === '0px',
       'e sem barra a variavel zera, devolvendo o toast ao canto de sempre',
       vazio.documento.documentElement.style['--avisos-altura']);
})();

// ─── 10. Nada aqui derruba o painel ─────────────────────────────────────────

(async function bancoForaDoArNaoQuebraOPainel() {
    const amb = montarAmbiente({ erroAvisos: { code: '42P01', message: 'relation does not exist' } });
    await amb.painel.recarregar();
    ok(amb.barra().style.display === 'none',
       'tabela que ainda nao existe nao aparece na cara do operador');
    await amb.painel.renderAdm();
    ok(amb.elementos['adm-tab-avisos'].innerHTML.indexOf('avisos_dos_paineis.sql') !== -1,
       'mas no ADM a tela diz o que rodar para resolver',
       amb.elementos['adm-tab-avisos'].innerHTML.slice(0, 300));
})();

// ─── Fecho ──────────────────────────────────────────────────────────────────

setTimeout(() => {
    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes do Quadro de Avisos passaram.');
}, 50);
