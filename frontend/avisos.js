/**
 * QUADRO DE AVISOS DOS PAINÉIS — a barra na base da tela (23/08/2026).
 *
 * Pedido do usuário: *"um quadro de avisos que vai aparecer no Painel de
 * Produção e Painel de Acabamento, uma barra flutuante na base da página,
 * teremos uma barra para cada painel para cada setor (atualmente 8 barras),
 * será gerenciada no menu ADM, aba Avisos, será para visualização de um aviso e
 * com um drop para os usuários marcarem seus nomes confirmando a leitura"*.
 *
 * ## Os oito quadros não se cadastram
 *
 * Um quadro é o par (painel, setor): dois painéis vezes os quatro setores da
 * gráfica. O que se publica e se tira do ar é o AVISO que está nele. Quadro sem
 * aviso não desenha nada — a barra simplesmente não existe, e o painel fica
 * como era antes deste recurso.
 *
 * ## Por que a barra lê o filtro de setor pelo DOM
 *
 * Os dois painéis guardam o filtro em lugares diferentes e privados: a Produção
 * em `state.filtroSetores`, o Acabamento num `tela` fechado dentro do
 * `acabamento.js`. O que os dois têm em comum, e é público, são as pílulas na
 * tela — `.filter-btn-pill.active[data-setor]`, que o `pintarCardsDeSetor` de
 * cada painel mantém. Ler dali é o único jeito de esta barra servir aos dois
 * sem furar o encapsulamento de nenhum, e é a mesma fonte que a lista embaixo
 * está usando para se filtrar.
 *
 * ## A estação da gráfica é anônima
 *
 * Quem trabalha nos dois painéis entra pelo código de acesso local, sem sessão
 * do Supabase. Por isso as duas tabelas são NOSSAS e têm política de `public`
 * (ver `sql/avisos_dos_paineis.sql`): a leitura do aviso e a gravação da
 * confirmação saem direto pelo PostgREST, sem rota nova e sem desvio pelo
 * agente. Publicar é outra história — mora no menu ADM, que só o administrador
 * enxerga.
 *
 * ## Nada aqui derruba o painel
 *
 * Toda consulta falha para dentro: sem banco, sem tabela ou sem rede, a barra
 * não aparece e o painel segue exatamente como antes. Um recado que não chegou
 * é um problema; uma fila de produção que não abre é outro, bem maior.
 */
(function () {
    'use strict';

    // ─── Os dois painéis ────────────────────────────────────────────────────
    //
    // `perfil` é o papel do acesso local de quem trabalha naquele painel, e é
    // ele que decide quais nomes entram no dropdown da confirmação. Espelha a
    // regra que o Acabamento já usa no seletor de Responsável (22/08/2026): a
    // lista é a do setor, não a da gráfica inteira.
    const PAINEIS = {
        producao: {
            view: 'view-lista-impressao',
            pilulas: 'filter-container-setor',
            perfil: 'impressor',
            rotulo: 'Produção',
            cor: '#3b82f6',
            corFundo: 'rgba(59,130,246,0.15)',
        },
        acabamento: {
            view: 'view-acabamento',
            pilulas: 'filter-container-setor-acab',
            perfil: 'acabamento',
            rotulo: 'Acabamento',
            cor: '#14b8a6',
            corFundo: 'rgba(20,184,166,0.15)',
        },
    };

    const SETORES = ['FLEXO', 'PVC', 'TEXTIL', 'LASER'];

    // Os nomes como a gráfica escreve, que é como as pílulas dos dois painéis
    // já escrevem. O banco guarda a versão sem acento (o `check` do SQL), e a
    // tela mostra a com acento — a conversão mora aqui, num lugar só.
    const NOME_DO_SETOR = { FLEXO: 'Flexo', PVC: 'PVC', TEXTIL: 'Têxtil', LASER: 'Laser' };

    // A escala do painel. Âmbar é o mesmo tom que o resto do app usa para
    // "olhe para isto"; verde é o de trabalho feito. Não é enfeite: é a cor que
    // diz o estado, e por isso ela não acompanha nenhuma repintura de paleta.
    const TOM = {
        normal:  { accent: '#f59e0b', fundo: 'rgba(245,158,11,0.14)', borda: 'rgba(148,163,184,0.28)', rotulo: 'Aviso' },
        urgente: { accent: '#ef4444', fundo: 'rgba(239,68,68,0.16)',  borda: 'rgba(239,68,68,0.40)',   rotulo: 'Urgente' },
        lido:    { accent: '#22c55e', fundo: 'rgba(34,197,94,0.14)',  borda: 'rgba(34,197,94,0.35)',   rotulo: 'Você leu' },
    };

    const LIMITE_DO_TEXTO = 280;   // o mesmo do `check` da tabela

    // ─── Estado da tela ─────────────────────────────────────────────────────
    //
    // Próprio, como o do Acabamento: os avisos não são estado de pedido, e
    // pendurá-los no `state` do painel faria uma falha aqui viajar para lá.
    const tela = {
        avisos: null,          // null = ainda não buscado
        leituras: {},          // id do aviso -> [{ nome, lido_em }]
        operadores: null,      // null = ainda não buscado
        erro: '',
        erroOperadores: '',
        indice: 0,             // qual aviso da lista está à vista
        listaAberta: null,     // id do aviso com o dropdown aberto
        recolhidos: new Set(), // ids recolhidos NESTA estação, nesta sessão
        gravando: null,        // 'avisoId|nome' enquanto o banco não responde
        admEditando: null,     // { painel, setor } com o editor aberto
        admRascunho: null,     // o que o editor tem digitado
        admSalvando: false,
        admRecado: '',
    };

    // ─── Pequenos socorros ──────────────────────────────────────────────────
    //
    // Mesmo padrão do `acabamento.js`: tudo o que vem do `script.js` é chamado
    // com guarda, porque uma estação com cópia antiga do painel pode não ter a
    // função nova — e um `ReferenceError` apagaria a tela inteira.

    function fn(nome) {
        return (typeof window[nome] === 'function') ? window[nome] : null;
    }

    function esc(v) {
        const f = fn('escapeHtml');
        if (f) return f(v);
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** Para `onclick="fn('${escJs(v)}')"` — ver a mesma função no acabamento.js. */
    function escJs(v) {
        const f = fn('escapeJsAttr');
        if (f) return f(v);
        return String(v === undefined || v === null ? '' : v)
            .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '');
    }

    function avisar(texto, tipo) {
        const t = fn('toast');
        if (t) t(texto, tipo || 'info');
        else console.log('[avisos] ' + texto);
    }

    function banco() {
        return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
    }

    /** "2026-08-23" no fuso de quem está olhando, para comparar com `vale_ate`. */
    function hojeISO() {
        const d = new Date();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + mes + '-' + dia;
    }

    /** "23/08 14:35" — curto, porque o espaço na barra é do recado. */
    function quando(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return dia + '/' + mes + ' ' + hh + ':' + mm;
    }

    /** "25/08" a partir de "2026-08-25", sem passar por `Date` (o fuso mordia). */
    function dataCurta(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
        return m ? m[3] + '/' + m[2] : '';
    }

    function iniciais(nome) {
        return String(nome || '').replace(/[()]/g, '').trim().split(/\s+/)
            .map(p => p[0] || '').join('').slice(0, 2).toUpperCase();
    }

    // ─── O banco ────────────────────────────────────────────────────────────

    /**
     * Os avisos e as leituras, numa ida só cada.
     *
     * São poucas linhas — no máximo oito ativas, e o histórico não é lido aqui.
     * Falhar não esconde a tela: `tela.avisos` fica vazio, a barra não aparece,
     * e o painel segue.
     */
    async function carregarAvisos() {
        const db = banco();
        if (!db) { tela.avisos = []; tela.erro = 'sem conexão com o banco'; return tela.avisos; }
        try {
            const { data, error } = await db
                .from('imposition_avisos')
                .select('id, painel, setor, texto, prioridade, vale_ate, ativo, publicado_por, publicado_em')
                .eq('ativo', true)
                .order('publicado_em', { ascending: false });
            if (error) throw error;
            tela.avisos = data || [];
            tela.erro = '';
            await carregarLeituras(tela.avisos.map(a => a.id));
        } catch (e) {
            tela.avisos = [];
            tela.erro = (e && e.message) ? e.message : String(e);
            console.warn('[avisos] não deu para ler os avisos:', e);
        }
        return tela.avisos;
    }

    async function carregarLeituras(ids) {
        tela.leituras = {};
        const db = banco();
        if (!db || !ids || !ids.length) return;
        try {
            const { data, error } = await db
                .from('imposition_avisos_leituras')
                .select('aviso_id, nome, lido_em')
                .in('aviso_id', ids)
                .order('lido_em', { ascending: true });
            if (error) throw error;
            (data || []).forEach(l => {
                if (!tela.leituras[l.aviso_id]) tela.leituras[l.aviso_id] = [];
                tela.leituras[l.aviso_id].push({ nome: l.nome, lido_em: l.lido_em });
            });
        } catch (e) {
            console.warn('[avisos] não deu para ler as confirmações:', e);
        }
    }

    /**
     * Os operadores do acesso local, pela view `imposition_operadores`.
     *
     * A mesma view que o seletor de Responsável do Acabamento usa, e pelo mesmo
     * motivo: a TABELA por trás guarda os códigos de seis caracteres e está
     * fechada para as chaves públicas. A view expõe nome, papel e nada mais.
     */
    async function carregarOperadores() {
        if (tela.operadores) return tela.operadores;
        const db = banco();
        tela.erroOperadores = '';
        if (!db) {
            tela.operadores = [];
            tela.erroOperadores = 'sem conexão com o banco';
            return tela.operadores;
        }
        try {
            const { data, error } = await db
                .from('imposition_operadores')
                .select('id, nome, role, ativo')
                .order('nome', { ascending: true });
            if (error) throw error;
            tela.operadores = (data || [])
                .filter(o => o.ativo !== false && String(o.nome || '').trim())
                .map(o => ({
                    nome: String(o.nome).trim(),
                    role: String(o.role || '').trim().toLowerCase(),
                }));
        } catch (e) {
            tela.operadores = [];
            tela.erroOperadores = (e && e.message) ? e.message : String(e);
            console.warn('[avisos] não deu para ler a lista de operadores:', e);
        }
        return tela.operadores;
    }

    // ─── Que painel está aberto, e com quais setores ────────────────────────

    /** 'producao' | 'acabamento' | null — pela seção que está `active`. */
    function painelAberto() {
        for (const chave of Object.keys(PAINEIS)) {
            const secao = document.getElementById(PAINEIS[chave].view);
            if (secao && secao.classList && secao.classList.contains('active')) return chave;
        }
        return null;
    }

    /**
     * Os setores acesos nas pílulas daquele painel. Vazio = todos.
     *
     * Lê o `data-setor` do botão, e não o texto: o rótulo tem acento e o banco
     * não, e foi por isso que o próprio painel passou a ler o atributo.
     */
    function setoresEscolhidos(painel) {
        const conf = PAINEIS[painel];
        const caixa = conf && document.getElementById(conf.pilulas);
        if (!caixa || !caixa.querySelectorAll) return [];
        const acesos = [];
        caixa.querySelectorAll('.filter-btn-pill').forEach(btn => {
            const meu = String((btn.getAttribute && btn.getAttribute('data-setor')) || '').trim().toUpperCase();
            const aceso = btn.classList && btn.classList.contains('active');
            if (meu && aceso && SETORES.includes(meu)) acesos.push(meu);
        });
        return acesos;
    }

    /** O aviso está no ar hoje? (`ativo` já veio filtrado do banco.) */
    function noPrazo(aviso) {
        if (!aviso.vale_ate) return true;
        return String(aviso.vale_ate) >= hojeISO();
    }

    /**
     * A fila de avisos do painel aberto, na ordem em que a barra os mostra.
     *
     * Sem setor escolhido a barra mostra os do painel inteiro — é o que o
     * operador vê ao abrir a tela, antes de filtrar, e esconder tudo ali faria
     * o recado depender de um clique que ninguém pediu.
     */
    function avisosDoPainel(painel) {
        const escolhidos = setoresEscolhidos(painel);
        return (tela.avisos || [])
            .filter(a => a.painel === painel && noPrazo(a))
            .filter(a => !escolhidos.length || escolhidos.includes(String(a.setor).toUpperCase()))
            .sort((a, b) => {
                // Urgente primeiro; depois o mais novo. Quem tem três avisos e
                // olha um só precisa que o primeiro seja o que não pode esperar.
                const ua = a.prioridade === 'urgente' ? 0 : 1;
                const ub = b.prioridade === 'urgente' ? 0 : 1;
                if (ua !== ub) return ua - ub;
                return String(b.publicado_em || '').localeCompare(String(a.publicado_em || ''));
            });
    }

    function quemLeu(avisoId) {
        return tela.leituras[avisoId] || [];
    }

    /** Os nomes que podem confirmar naquele painel. */
    function operadoresDoPainel(painel) {
        const perfil = (PAINEIS[painel] || {}).perfil;
        return (tela.operadores || []).filter(o => o.role === perfil);
    }

    // ─── A barra ────────────────────────────────────────────────────────────

    function elementoDaBarra() {
        return document.getElementById('barra-avisos');
    }

    /**
     * Desenha (ou apaga) a barra do painel que está aberto.
     *
     * Chamada a cada desenho das duas listas — é assim que ela acompanha a
     * troca de setor sem que nenhum dos dois painéis precise saber que ela
     * existe.
     */
    function render() {
        const caixa = elementoDaBarra();
        if (!caixa) return;

        const painel = painelAberto();
        if (!painel) return esconder(caixa);

        // Ainda não buscado: some, e busca. O desenho volta sozinho quando o
        // banco responder — a barra nunca mostra "carregando", que na base da
        // tela seria só ruído.
        if (tela.avisos === null) {
            esconder(caixa);
            carregar().then(() => { try { render(); } catch (e) {} });
            return;
        }

        const fila = avisosDoPainel(painel);
        if (!fila.length) return esconder(caixa);

        if (tela.indice >= fila.length) tela.indice = 0;
        const aviso = fila[tela.indice];

        // Recolhida: vira a abinha de 38 px, que devolve a tela ao painel.
        if (tela.recolhidos.has(aviso.id)) {
            caixa.style.display = '';
            caixa.innerHTML = abinhaHtml(painel, fila.length);
            medirAltura(caixa);
            return;
        }

        caixa.style.display = '';
        caixa.innerHTML = barraHtml(painel, aviso, fila.length);
        medirAltura(caixa);
    }

    function esconder(caixa) {
        caixa.style.display = 'none';
        caixa.innerHTML = '';
        medirAltura(caixa);
    }

    /**
     * Diz ao resto do app quanto espaço a barra ocupa embaixo.
     *
     * O `.toast-container` nasce no mesmo canto (24 px da base, à direita) e
     * cairia por cima do recado. Em vez de mover o toast para outro lugar — ele
     * está ali desde sempre e o operador o procura ali —, a barra publica a
     * própria altura numa variável e o CSS empurra o toast para cima dela.
     */
    function medirAltura(caixa) {
        const raiz = document.documentElement;
        if (!raiz || !raiz.style) return;
        const visivel = caixa.style.display !== 'none';
        const altura = visivel && caixa.getBoundingClientRect
            ? Math.round(caixa.getBoundingClientRect().height)
            : 0;
        raiz.style.setProperty('--avisos-altura', (altura ? altura + 14 : 0) + 'px');
    }

    function abinhaHtml(painel, quantos) {
        const conf = PAINEIS[painel];
        const rotulo = quantos === 1 ? '1 aviso' : quantos + ' avisos';
        return `
        <div style="display: flex;">
            <div onclick="AvisosPainel.abrirBarra()" title="Abrir o quadro de avisos"
                 style="display: inline-flex; align-items: center; gap: 10px; padding: 9px 16px;
                        border-radius: 12px 12px 0 0; background: rgba(23,32,52,0.94);
                        border: 1px solid rgba(148,163,184,0.25); border-bottom: none;
                        box-shadow: 0 -4px 20px rgba(0,0,0,0.35); cursor: pointer;">
                ${iconeMegafone('#f59e0b', 16)}
                <span style="font-size: 0.85rem; font-weight: 600; color: #cbd5e1;">${esc(rotulo)} em ${esc(conf.rotulo)}</span>
                ${iconeSeta('cima', '#64748b', 14)}
            </div>
        </div>`;
    }

    function iconeMegafone(cor, tamanho) {
        return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="${cor}"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 11v2a1 1 0 0 0 1 1h2l4 3.5V6.5L6 10H4a1 1 0 0 0-1 1z"></path>
                  <path d="M14 8.5a4 4 0 0 1 0 7"></path>
                  <path d="M16.5 5.5a7.5 7.5 0 0 1 0 13"></path>
                </svg>`;
    }

    function iconeAlerta(cor, tamanho) {
        return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="${cor}"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 9v4"></path><path d="M12 17h.01"></path>
                  <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>
                </svg>`;
    }

    function iconeCheck(tamanho) {
        return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5"></path></svg>`;
    }

    function iconeSeta(lado, cor, tamanho) {
        const d = { cima: 'M6 15l6-6 6 6', baixo: 'M6 9l6 6 6-6', esq: 'M15 18l-6-6 6-6', dir: 'M9 18l6-6-6-6' }[lado];
        return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="${cor}"
                     stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"></path></svg>`;
    }

    function barraHtml(painel, aviso, quantos) {
        const conf = PAINEIS[painel];
        const urgente = aviso.prioridade === 'urgente';
        const leram = quemLeu(aviso.id);
        const gente = operadoresDoPainel(painel);
        const total = gente.length;
        const lidos = leram.length;
        const tom = urgente ? TOM.urgente : TOM.normal;

        const selo = urgente
            ? `<span style="${ESTILO_SELO}background: ${TOM.urgente.fundo}; color: ${TOM.urgente.accent};">Urgente</span>`
            : `<span style="${ESTILO_SELO}background: ${TOM.normal.fundo}; color: ${TOM.normal.accent};">${quantos > 1 ? 'Aviso ' + (tela.indice + 1) + ' de ' + quantos : 'Aviso'}</span>`;

        const prazo = aviso.vale_ate ? ' · vale até ' + dataCurta(aviso.vale_ate) : '';
        const assinatura = aviso.publicado_por ? ' por ' + esc(aviso.publicado_por) : '';

        const setas = quantos > 1 ? `
            <div style="flex-shrink: 0; display: flex; align-items: center; gap: 6px;">
                <div onclick="AvisosPainel.passar(-1)" title="Aviso anterior" style="${ESTILO_SETA}">${iconeSeta('esq', '#94a3b8', 14)}</div>
                <span style="font-size: 0.78rem; font-weight: 700; color: #94a3b8; min-width: 34px; text-align: center;">${tela.indice + 1}/${quantos}</span>
                <div onclick="AvisosPainel.passar(1)" title="Próximo aviso" style="${ESTILO_SETA}">${iconeSeta('dir', '#94a3b8', 14)}</div>
            </div>` : '';

        const contador = quantos > 1 ? '' : `
            <div style="flex-shrink: 0; width: 132px;">
                <div style="font-size: 0.78rem; font-weight: 600; color: #94a3b8; margin-bottom: 6px;">${lidos} de ${total} leram</div>
                <div style="height: 6px; border-radius: 3px; background: rgba(148,163,184,0.18); overflow: hidden;">
                    <div style="height: 6px; width: ${total ? Math.round((lidos / total) * 100) : 0}%; border-radius: 3px; background: #22c55e;"></div>
                </div>
            </div>`;

        // A seta de recolher some no urgente enquanto ninguém confirmou: é a
        // única diferença de comportamento entre os dois níveis, e é ela que
        // dá sentido a marcar um aviso como urgente.
        const podeRecolher = !urgente || lidos > 0;
        const recolher = `
            <div ${podeRecolher ? `onclick="AvisosPainel.recolher('${escJs(aviso.id)}')"` : ''}
                 title="${podeRecolher ? 'Recolher a barra' : 'Aviso urgente: confirme a leitura para poder recolher'}"
                 style="flex-shrink: 0; width: 34px; height: 34px; border-radius: 8px; display: flex;
                        align-items: center; justify-content: center;
                        color: ${podeRecolher ? '#64748b' : '#475569'};
                        cursor: ${podeRecolher ? 'pointer' : 'not-allowed'};">
                ${iconeSeta('cima', 'currentColor', 16)}
            </div>`;

        return `
        <div style="position: relative;">
            ${tela.listaAberta === aviso.id ? listaHtml(painel, aviso) : ''}
            <div style="display: flex; align-items: center; gap: 18px; padding: 14px 18px 14px 0;
                        background: rgba(23,32,52,0.94); backdrop-filter: blur(14px);
                        border: 1px solid ${tom.borda}; border-left: 5px solid ${tom.accent};
                        border-radius: 14px; box-shadow: 0 -6px 34px rgba(0,0,0,0.45);">

                <div style="flex-shrink: 0; width: 44px; height: 44px; margin-left: 14px; border-radius: 12px;
                            display: flex; align-items: center; justify-content: center; background: ${tom.fundo};">
                    ${urgente ? iconeAlerta(tom.accent, 22) : iconeMegafone(tom.accent, 22)}
                </div>

                <div style="flex: 1 1 auto; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap;">
                        ${selo}
                        <span style="${ESTILO_SELO}background: ${conf.corFundo}; color: ${conf.cor};">${esc(conf.rotulo)} · ${esc(NOME_DO_SETOR[aviso.setor] || aviso.setor)}</span>
                        <span style="font-size: 0.78rem; color: #64748b;">publicado ${esc(quando(aviso.publicado_em))}${assinatura}${esc(prazo)}</span>
                    </div>
                    <div style="font-size: 1.12rem; font-weight: 700; line-height: 1.3; color: #f1f5f9; text-wrap: pretty;">${esc(aviso.texto)}</div>
                </div>

                ${setas}
                ${contador}
                ${botaoHtml(painel, aviso)}
                ${recolher}
            </div>
        </div>`;
    }

    const ESTILO_SELO = 'display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 20px;'
        + ' font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; ';

    const ESTILO_SETA = 'width: 34px; height: 34px; border-radius: 8px; border: 1px solid rgba(148,163,184,0.25);'
        + ' display: flex; align-items: center; justify-content: center; cursor: pointer;';

    function botaoHtml(painel, aviso) {
        const aberto = tela.listaAberta === aviso.id;
        const urgente = aviso.prioridade === 'urgente';
        const fundo = urgente
            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : 'linear-gradient(135deg, #3b82f6, #6366f1)';
        const sombra = urgente ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)';
        return `
            <div onclick="AvisosPainel.alternarLista('${escJs(aviso.id)}')"
                 title="Ver quem leu e marcar o seu nome"
                 style="flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px;
                        padding: 11px 18px; border-radius: 8px; font-size: 0.88rem; font-weight: 700;
                        cursor: pointer; background: ${fundo}; color: #ffffff; box-shadow: 0 4px 14px ${sombra};">
                ${iconeCheck(16)}
                Marcar minha leitura
                ${iconeSeta(aberto ? 'cima' : 'baixo', 'currentColor', 12)}
            </div>`;
    }

    /**
     * O dropdown: a lista de nomes, aberta para cima.
     *
     * Para cima porque a barra vive na base da página — abrir para baixo a
     * jogaria para fora da tela. Quem já leu fica com a hora ao lado; quem não
     * leu tem o "sou eu" clicável.
     */
    function listaHtml(painel, aviso) {
        const gente = operadoresDoPainel(painel);
        const leram = quemLeu(aviso.id);
        const horaDe = {};
        leram.forEach(l => { horaDe[String(l.nome).toLowerCase()] = l.lido_em; });

        // Quem confirmou e depois perdeu o acesso local continua na lista: a
        // leitura é um fato datado, e sumir com o nome faria o aviso parecer
        // menos lido do que foi.
        const nomes = gente.map(o => o.nome);
        leram.forEach(l => {
            if (!nomes.some(n => n.toLowerCase() === String(l.nome).toLowerCase())) nomes.push(l.nome);
        });

        const linhas = nomes.map(nome => {
            const hora = horaDe[nome.toLowerCase()];
            const gravando = tela.gravando === aviso.id + '|' + nome.toLowerCase();
            const marca = hora ? '✓ ' + quando(hora) : (gravando ? 'gravando…' : 'sou eu');
            return `
            <div ${hora || gravando ? '' : `onclick="AvisosPainel.marcar('${escJs(aviso.id)}', '${escJs(nome)}')"`}
                 style="display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px;
                        cursor: ${hora || gravando ? 'default' : 'pointer'};
                        background: ${hora ? 'transparent' : 'rgba(59,130,246,0.08)'};">
                <div style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: flex;
                            align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700;
                            background: ${hora ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)'};
                            color: ${hora ? '#22c55e' : '#94a3b8'};">${esc(iniciais(nome))}</div>
                <div style="flex: 1 1 auto; min-width: 0; font-size: 0.9rem; font-weight: 600;
                            color: ${hora ? '#94a3b8' : '#e2e8f0'};">${esc(nome)}</div>
                <div style="font-size: 0.76rem; font-weight: 600;
                            color: ${hora ? '#22c55e' : '#3b82f6'};">${esc(marca)}</div>
            </div>`;
        }).join('');

        // A saída da trava vai escrita na própria tela, como no seletor de
        // Responsável: sem isso o operador vê uma lista vazia e não tem como
        // saber o que fazer.
        const recado = nomes.length ? '' : `
            <div style="padding: 16px 18px; font-size: 0.8rem; color: #94a3b8; line-height: 1.5;">
                ${tela.erroOperadores
                    ? 'Lista de operadores indisponível. Tente ATUALIZAR.'
                    : `Nenhum acesso local com o perfil <b>${esc(PAINEIS[painel].perfil)}</b>. Cadastre em <b>Usuários → Acesso Local</b> e volte aqui.`}
            </div>`;

        return `
        <div style="position: absolute; right: 0; bottom: 100%; margin-bottom: 12px; width: 380px; max-width: 92vw;
                    background: rgba(15,23,42,0.98); border: 1px solid rgba(148,163,184,0.3);
                    border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,0.6); overflow: hidden;">
            <div style="padding: 14px 18px 12px; border-bottom: 1px solid rgba(148,163,184,0.2);">
                <div style="font-size: 0.95rem; font-weight: 700; color: #e2e8f0;">Confirmar leitura</div>
                <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 3px;">Toque no seu nome. Quem já leu fica com a hora ao lado.</div>
            </div>
            <div style="max-height: 288px; overflow-y: auto; padding: 6px;">${linhas}${recado}</div>
        </div>`;
    }

    // ─── O que os cliques fazem ─────────────────────────────────────────────

    async function carregar() {
        await Promise.all([carregarAvisos(), carregarOperadores()]);
    }

    /**
     * Grava a confirmação de uma pessoa.
     *
     * A tela é atualizada ANTES do banco responder: quem tocou o próprio nome
     * vê a hora aparecer no mesmo instante, que é o que faz o gesto parecer ter
     * funcionado. Se a gravação falhar, a marca é desfeita e o aviso diz por
     * quê — em vez de deixar uma confirmação que só existe nesta tela.
     */
    async function marcar(avisoId, nome) {
        const limpo = String(nome || '').trim();
        if (!avisoId || !limpo) return;
        if (quemLeu(avisoId).some(l => String(l.nome).toLowerCase() === limpo.toLowerCase())) return;

        tela.gravando = avisoId + '|' + limpo.toLowerCase();
        if (!tela.leituras[avisoId]) tela.leituras[avisoId] = [];
        tela.leituras[avisoId].push({ nome: limpo, lido_em: new Date().toISOString() });
        render();

        const db = banco();
        try {
            if (!db) throw new Error('sem conexão com o banco');
            const { error } = await db
                .from('imposition_avisos_leituras')
                .insert({ aviso_id: avisoId, nome: limpo });
            // 23505 é a trava de unicidade: alguém já tinha marcado este nome.
            // Não é erro para quem está olhando — o fato que ele queria
            // registrar já está registrado.
            if (error && error.code !== '23505') throw error;
            avisar(`Leitura de ${limpo} confirmada.`, 'success');
        } catch (e) {
            tela.leituras[avisoId] = (tela.leituras[avisoId] || [])
                .filter(l => String(l.nome).toLowerCase() !== limpo.toLowerCase());
            avisar('Não deu para confirmar a leitura: ' + ((e && e.message) || e), 'error');
        } finally {
            tela.gravando = null;
            render();
        }
    }

    // ─── A aba Avisos do ADM ────────────────────────────────────────────────

    function admCaixa() {
        return document.getElementById('adm-tab-avisos');
    }

    /** O aviso que está no ar naquele quadro, ou null. */
    function avisoDoQuadro(painel, setor) {
        return (tela.avisos || []).find(a => a.painel === painel && a.setor === setor && noPrazo(a)) || null;
    }

    /** O que está gravado mas fora do prazo — some da barra, fica no ADM. */
    function avisoVencidoDoQuadro(painel, setor) {
        return (tela.avisos || []).find(a => a.painel === painel && a.setor === setor && !noPrazo(a)) || null;
    }

    async function renderAdm() {
        const caixa = admCaixa();
        if (!caixa) return;
        if (tela.avisos === null) {
            caixa.innerHTML = `<div style="padding: 28px; text-align: center; color: var(--text-dim);">Carregando os avisos…</div>`;
            await carregar();
        }
        caixa.innerHTML = tela.admEditando ? admEditorHtml() : admGradeHtml();
    }

    function admGradeHtml() {
        const linhas = SETORES.map(setor => `
            <div style="display: grid; grid-template-columns: 132px minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: stretch; margin-bottom: 14px;">
                <div style="align-self: center; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim);">${esc(NOME_DO_SETOR[setor])}</div>
                ${admQuadroHtml('producao', setor)}
                ${admQuadroHtml('acabamento', setor)}
            </div>`).join('');

        const recado = tela.erro
            ? `<div style="margin-bottom: 16px; padding: 14px 18px; border-radius: 10px; border: 1px solid rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); color: #fca5a5; font-size: 0.88rem;">
                   Não deu para ler os avisos: ${esc(tela.erro)}. Se a tabela ainda não existe, rode <b>sql/avisos_dos_paineis.sql</b> no editor SQL do Supabase.
               </div>`
            : '';

        return `
        ${recado}
        <div style="max-width: 760px; margin-bottom: 20px;">
            <div style="font-size: 1.05rem; font-weight: 700; color: #f1f5f9; margin-bottom: 6px;">Um quadro por setor, em cada painel</div>
            <div style="font-size: 0.88rem; color: var(--text-dim); line-height: 1.55;">
                São oito quadros fixos — os quatro setores, no Painel de Produção e no do Acabamento. Cada quadro
                mostra um aviso de cada vez na base da tela daquele painel, e guarda quem leu, com a hora.
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 132px minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: center; margin-bottom: 10px;">
            <div></div>
            <div style="font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${PAINEIS.producao.cor};">🏭 Painel de Produção</div>
            <div style="font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${PAINEIS.acabamento.cor};">✂️ Painel do Acabamento</div>
        </div>
        ${linhas}`;
    }

    function admQuadroHtml(painel, setor) {
        const aviso = avisoDoQuadro(painel, setor);
        const vencido = aviso ? null : avisoVencidoDoQuadro(painel, setor);
        const alvo = aviso || vencido;

        const estado = aviso
            ? (aviso.prioridade === 'urgente'
                ? { rotulo: 'Urgente', cor: TOM.urgente.accent, fundo: TOM.urgente.fundo }
                : { rotulo: 'Ativo', cor: TOM.normal.accent, fundo: TOM.normal.fundo })
            : (vencido
                ? { rotulo: 'Vencido', cor: '#475569', fundo: 'rgba(148,163,184,0.12)' }
                : { rotulo: 'Sem aviso', cor: 'rgba(148,163,184,0.4)', fundo: 'rgba(148,163,184,0.12)' });

        const total = operadoresDoPainel(painel).length;
        const lidos = alvo ? quemLeu(alvo.id).length : 0;

        return `
        <div style="background: var(--card); border: 1px solid var(--border); border-left: 4px solid ${estado.cor};
                    border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; min-height: 160px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <span style="${ESTILO_SELO}background: ${estado.fundo}; color: ${estado.cor};">${esc(estado.rotulo)}</span>
                <span style="font-size: 0.76rem; color: var(--text-faint);">${alvo ? esc(quando(alvo.publicado_em)) : '—'}</span>
            </div>
            <div style="flex: 1 1 auto;">
                <div style="font-size: 0.92rem; font-weight: 600; line-height: 1.4; text-wrap: pretty;
                            color: ${alvo && aviso ? 'var(--text)' : 'var(--text-faint)'};">${esc(alvo ? alvo.texto : 'Nenhum aviso publicado.')}</div>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid rgba(148,163,184,0.15); padding-top: 10px;">
                <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-dim);">${alvo ? lidos + ' de ' + total + ' leram' : 'sem leituras'}</span>
                <span onclick="AvisosPainel.abrirEditor('${escJs(painel)}', '${escJs(setor)}')"
                      style="font-size: 0.8rem; font-weight: 700; color: #60a5fa; cursor: pointer;">${aviso ? 'Editar' : 'Publicar aviso'}</span>
            </div>
        </div>`;
    }

    function admEditorHtml() {
        const { painel, setor } = tela.admEditando;
        const conf = PAINEIS[painel];
        const aviso = avisoDoQuadro(painel, setor);
        const r = tela.admRascunho || {};
        const texto = r.texto !== undefined ? r.texto : (aviso ? aviso.texto : '');
        const prioridade = r.prioridade !== undefined ? r.prioridade : (aviso ? aviso.prioridade : 'normal');
        const valeAte = r.vale_ate !== undefined ? r.vale_ate : (aviso ? (aviso.vale_ate || '') : '');
        const reiniciar = r.reiniciar !== undefined ? r.reiniciar : true;

        const gente = operadoresDoPainel(painel);
        const leram = aviso ? quemLeu(aviso.id) : [];
        const horaDe = {};
        leram.forEach(l => { horaDe[String(l.nome).toLowerCase()] = l.lido_em; });

        const listaDeLeitura = gente.length
            ? gente.map(o => {
                const hora = horaDe[o.nome.toLowerCase()];
                return `
                <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px;">
                    <div style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center;
                                justify-content: center; font-size: 0.72rem; font-weight: 700;
                                background: ${hora ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.12)'};
                                color: ${hora ? '#22c55e' : 'var(--text-faint)'};">${esc(iniciais(o.nome))}</div>
                    <div style="flex: 1 1 auto; font-size: 0.9rem; font-weight: 600; color: ${hora ? 'var(--text)' : 'var(--text-faint)'};">${esc(o.nome)}</div>
                    <div style="font-size: 0.78rem; font-weight: 600; color: ${hora ? '#22c55e' : 'var(--text-faint)'};">${hora ? '✓ ' + esc(quando(hora)) : 'não leu'}</div>
                </div>`;
            }).join('')
            : `<div style="padding: 16px 18px; font-size: 0.8rem; color: var(--text-dim); line-height: 1.5;">
                   Nenhum acesso local com o perfil <b>${esc(conf.perfil)}</b>. Cadastre em <b>Usuários → Acesso Local</b>.
               </div>`;

        // A caixa só aparece quando há o que reiniciar: sem aviso no ar, ou sem
        // ninguém tendo lido, ela seria uma pergunta sobre nada.
        const caixaReiniciar = (aviso && leram.length) ? `
            <div onclick="AvisosPainel.alternarReiniciar()"
                 style="margin-top: 24px; padding: 14px 16px; cursor: pointer;
                        border: 1px solid ${reiniciar ? 'rgba(245,158,11,0.3)' : 'var(--border)'};
                        background: ${reiniciar ? 'rgba(245,158,11,0.08)' : 'transparent'};
                        border-radius: 10px; display: flex; gap: 12px; align-items: flex-start;">
                <div style="width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0; margin-top: 1px;
                            display: flex; align-items: center; justify-content: center;
                            border: 2px solid ${reiniciar ? '#f59e0b' : 'var(--text-faint)'};
                            background: ${reiniciar ? '#f59e0b' : 'transparent'}; color: #0a0f1e;">
                    ${reiniciar ? iconeCheck(11) : ''}
                </div>
                <div>
                    <div style="font-size: 0.88rem; font-weight: 700; color: ${reiniciar ? '#fbbf24' : 'var(--text-dim)'};">Pedir a confirmação de novo</div>
                    <div style="font-size: 0.8rem; color: var(--text-dim); line-height: 1.5; margin-top: 4px;">
                        Marcado, ${leram.length === 1 ? 'a leitura' : 'as ' + leram.length + ' leituras'} de hoje ${leram.length === 1 ? 'vai' : 'vão'} para o histórico e a barra volta a pedir
                        o nome de todo mundo — que é o certo quando o recado é outro. Desmarcado, quem já leu continua valendo.
                    </div>
                </div>
            </div>` : '';

        const recado = tela.admRecado
            ? `<div style="margin-top: 14px; font-size: 0.85rem; color: #fca5a5;">${esc(tela.admRecado)}</div>`
            : '';

        return `
        <div style="display: flex; align-items: center; gap: 10px; font-size: 0.84rem; color: var(--text-faint); margin-bottom: 18px;">
            <span onclick="AvisosPainel.fecharEditor()" style="cursor: pointer;">📢 Avisos</span>
            ${iconeSeta('dir', 'currentColor', 12)}
            <span style="color: var(--text); font-weight: 600;">${esc(conf.rotulo)} · ${esc(NOME_DO_SETOR[setor])}</span>
        </div>

        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 22px;">
            <div>
                <div style="font-size: 1.3rem; font-weight: 800; color: #f1f5f9; letter-spacing: -0.02em;">Quadro do ${esc(NOME_DO_SETOR[setor])} — Painel ${painel === 'producao' ? 'de Produção' : 'do Acabamento'}</div>
                <div style="font-size: 0.9rem; color: var(--text-dim); margin-top: 5px;">O que estiver aqui aparece na base da tela de quem abre esse painel.</div>
            </div>
            <button class="btn btn-secondary" onclick="AvisosPainel.fecharEditor()" style="flex-shrink: 0;">← Voltar aos 8 quadros</button>
        </div>

        <div style="display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 20px; align-items: start;">
            <div class="card" style="padding: 0; margin: 0;">
                <div class="card-header" style="padding: 18px 22px 14px; margin: 0;">
                    <span class="card-title"><span class="icon">📢</span> O aviso</span>
                    ${aviso ? `<span style="${ESTILO_SELO}background: ${TOM.normal.fundo}; color: ${TOM.normal.accent};">No ar</span>` : ''}
                </div>
                <div style="padding: 20px 22px 24px;">
                    <div style="font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px;">Texto que aparece na barra</div>
                    <textarea id="aviso-texto" class="form-control" rows="3" maxlength="${LIMITE_DO_TEXTO}"
                              oninput="AvisosPainel.digitou(this.value)"
                              style="width: 100%; resize: vertical; font-size: 1.02rem; font-weight: 600; line-height: 1.45;"
                              placeholder="O recado, em uma ou duas frases.">${esc(texto)}</textarea>
                    <div style="font-size: 0.8rem; color: var(--text-faint); line-height: 1.5; margin-top: 8px;">
                        Duas linhas na tela do operador, lidas de pé, a um metro da máquina.
                        <b id="aviso-contador" style="color: var(--text-dim);">${texto.length}/${LIMITE_DO_TEXTO}</b> caracteres.
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px;">
                        <div>
                            <div style="font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px;">Prioridade</div>
                            <div style="display: flex; gap: 8px;">
                                <button class="filter-btn-pill ${prioridade === 'normal' ? 'active' : ''}" onclick="AvisosPainel.escolherPrioridade('normal')">Normal</button>
                                <button class="filter-btn-pill ${prioridade === 'urgente' ? 'active' : ''}" onclick="AvisosPainel.escolherPrioridade('urgente')">Urgente</button>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-faint); line-height: 1.5; margin-top: 8px;">Urgente pinta a barra de vermelho e não deixa recolher antes de alguém confirmar.</div>
                        </div>
                        <div>
                            <div style="font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px;">Vale até</div>
                            <input type="date" id="aviso-vale-ate" class="form-control" style="width: 100%;"
                                   value="${esc(valeAte)}" onchange="AvisosPainel.escolherPrazo(this.value)">
                            <div style="font-size: 0.8rem; color: var(--text-faint); line-height: 1.5; margin-top: 8px;">Em branco, o aviso fica no ar até alguém tirar.</div>
                        </div>
                    </div>

                    ${caixaReiniciar}

                    <div style="display: flex; gap: 10px; margin-top: 26px; align-items: center; flex-wrap: wrap;">
                        <button class="btn btn-primary" onclick="AvisosPainel.publicar()" ${tela.admSalvando ? 'disabled' : ''}>
                            ${tela.admSalvando ? 'Publicando…' : 'Publicar no painel'}
                        </button>
                        ${aviso ? `<button class="btn btn-danger" onclick="AvisosPainel.tirarDoAr()" ${tela.admSalvando ? 'disabled' : ''}>Tirar do ar</button>` : ''}
                        <div style="flex: 1 1 auto;"></div>
                        ${aviso && aviso.publicado_por ? `<span style="font-size: 0.8rem; color: var(--text-faint);">publicado por ${esc(aviso.publicado_por)} · ${esc(quando(aviso.publicado_em))}</span>` : ''}
                    </div>
                    ${recado}
                </div>
            </div>

            <div class="card" style="padding: 0; margin: 0;">
                <div class="card-header" style="padding: 18px 22px 14px; margin: 0;">
                    <span class="card-title"><span class="icon">✅</span> Quem já leu</span>
                    <span style="font-size: 0.8rem; font-weight: 700; color: #22c55e;">${leram.length} de ${gente.length}</span>
                </div>
                <div style="padding: 8px 10px 14px;">${listaDeLeitura}</div>
                <div style="padding: 12px 20px 16px; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--text-faint); line-height: 1.5;">
                    A lista é a dos operadores do acesso local com o perfil <b style="color: var(--text-dim);">${esc(conf.perfil)}</b> — a mesma que o Acabamento usa em <b style="color: var(--text-dim);">Responsável</b>.
                </div>
            </div>
        </div>`;
    }

    /** Quem está publicando, para o aviso levar assinatura. */
    function quemSou() {
        const el = document.getElementById('user-email-display');
        const email = el && el.textContent ? el.textContent.trim() : '';
        if (email && email !== '—') return email.split('@')[0];
        const local = (window._acessoLocal && window._acessoLocal.nome) || '';
        return String(local || '').trim();
    }

    async function publicar() {
        if (!tela.admEditando || tela.admSalvando) return;
        const { painel, setor } = tela.admEditando;
        const aviso = avisoDoQuadro(painel, setor);
        const r = tela.admRascunho || {};
        const texto = String(r.texto !== undefined ? r.texto : (aviso ? aviso.texto : '')).trim();
        const prioridade = r.prioridade !== undefined ? r.prioridade : (aviso ? aviso.prioridade : 'normal');
        const valeAte = r.vale_ate !== undefined ? r.vale_ate : (aviso ? (aviso.vale_ate || '') : '');
        const reiniciar = r.reiniciar !== undefined ? r.reiniciar : true;

        tela.admRecado = '';
        if (!texto) { tela.admRecado = 'Escreva o aviso antes de publicar.'; return renderAdm(); }
        if (texto.length > LIMITE_DO_TEXTO) {
            tela.admRecado = 'O aviso passa de ' + LIMITE_DO_TEXTO + ' caracteres e seria cortado na barra.';
            return renderAdm();
        }

        const db = banco();
        if (!db) { tela.admRecado = 'Sem conexão com o banco.'; return renderAdm(); }

        tela.admSalvando = true;
        renderAdm();
        try {
            const temLeitura = aviso && quemLeu(aviso.id).length > 0;
            // Trocar o texto pedindo confirmação de novo é aviso NOVO: o antigo
            // sai do ar com as leituras dele intactas, e vira histórico. Sem
            // isso, "quem foi avisado" passaria a responder pelo recado errado.
            const substituir = !aviso || (reiniciar && temLeitura);

            if (aviso && substituir) {
                const { error } = await db.from('imposition_avisos').update({ ativo: false }).eq('id', aviso.id);
                if (error) throw error;
            }

            if (substituir) {
                const { error } = await db.from('imposition_avisos').insert({
                    painel, setor, texto, prioridade,
                    vale_ate: valeAte || null,
                    publicado_por: quemSou() || null,
                });
                if (error) throw error;
            } else {
                const { error } = await db.from('imposition_avisos').update({
                    texto, prioridade, vale_ate: valeAte || null,
                }).eq('id', aviso.id);
                if (error) throw error;
            }

            tela.avisos = null;
            tela.admEditando = null;
            tela.admRascunho = null;
            await carregarAvisos();
            avisar('Aviso publicado no ' + PAINEIS[painel].rotulo + ' · ' + NOME_DO_SETOR[setor] + '.', 'success');
        } catch (e) {
            tela.admRecado = 'Não deu para publicar: ' + ((e && e.message) || e);
        } finally {
            tela.admSalvando = false;
            renderAdm();
            try { render(); } catch (err) {}
        }
    }

    async function tirarDoAr() {
        if (!tela.admEditando || tela.admSalvando) return;
        const { painel, setor } = tela.admEditando;
        const aviso = avisoDoQuadro(painel, setor);
        if (!aviso) return;
        if (!confirm('Tirar este aviso da base do painel? Ele continua no histórico, com quem leu.')) return;

        const db = banco();
        if (!db) { tela.admRecado = 'Sem conexão com o banco.'; return renderAdm(); }

        tela.admSalvando = true;
        renderAdm();
        try {
            const { error } = await db.from('imposition_avisos').update({ ativo: false }).eq('id', aviso.id);
            if (error) throw error;
            tela.avisos = null;
            tela.admEditando = null;
            tela.admRascunho = null;
            await carregarAvisos();
            avisar('Aviso retirado.', 'info');
        } catch (e) {
            tela.admRecado = 'Não deu para tirar do ar: ' + ((e && e.message) || e);
        } finally {
            tela.admSalvando = false;
            renderAdm();
            try { render(); } catch (err) {}
        }
    }

    // ─── A porta de entrada ─────────────────────────────────────────────────

    const AvisosPainel = {
        render,
        renderAdm,

        /** Chamada quando um dos dois painéis abre. */
        aoAbrir() {
            tela.indice = 0;
            tela.listaAberta = null;
            if (tela.avisos === null) carregar().then(() => { try { render(); } catch (e) {} });
            else render();
        },

        /** O botão ATUALIZAR dos painéis relê tudo, inclusive os avisos. */
        recarregar() {
            tela.avisos = null;
            tela.operadores = null;
            return carregar().then(() => { try { render(); } catch (e) {} });
        },

        alternarLista(id) {
            tela.listaAberta = (tela.listaAberta === id) ? null : id;
            render();
        },

        marcar,

        passar(delta) {
            const painel = painelAberto();
            if (!painel) return;
            const fila = avisosDoPainel(painel);
            if (fila.length < 2) return;
            tela.indice = (tela.indice + delta + fila.length) % fila.length;
            tela.listaAberta = null;
            render();
        },

        recolher(id) {
            tela.recolhidos.add(id);
            tela.listaAberta = null;
            render();
        },

        abrirBarra() {
            tela.recolhidos.clear();
            render();
        },

        // ── ADM ──
        abrirEditor(painel, setor) {
            tela.admEditando = { painel, setor };
            tela.admRascunho = null;
            tela.admRecado = '';
            renderAdm();
        },

        fecharEditor() {
            tela.admEditando = null;
            tela.admRascunho = null;
            tela.admRecado = '';
            renderAdm();
        },

        digitou(valor) {
            if (!tela.admRascunho) tela.admRascunho = {};
            tela.admRascunho.texto = valor;
            // O contador é a única coisa que muda; redesenhar aqui tiraria o
            // cursor do operador do meio da frase. Pelo id, e não pelo primeiro
            // `<b>` da aba: qualquer negrito novo no editor roubaria o lugar.
            const conta = document.getElementById('aviso-contador');
            if (conta) conta.textContent = String(valor || '').length + '/' + LIMITE_DO_TEXTO;
        },

        escolherPrioridade(valor) {
            if (!tela.admRascunho) tela.admRascunho = {};
            tela.admRascunho.prioridade = valor === 'urgente' ? 'urgente' : 'normal';
            guardarTextoDigitado();
            renderAdm();
        },

        escolherPrazo(valor) {
            if (!tela.admRascunho) tela.admRascunho = {};
            tela.admRascunho.vale_ate = valor || '';
        },

        alternarReiniciar() {
            if (!tela.admRascunho) tela.admRascunho = {};
            const atual = tela.admRascunho.reiniciar !== undefined ? tela.admRascunho.reiniciar : true;
            tela.admRascunho.reiniciar = !atual;
            guardarTextoDigitado();
            renderAdm();
        },

        publicar,
        tirarDoAr,

        // Para os testes: o estado por dentro, sem precisar de banco.
        _tela: tela,
        _avisosDoPainel: avisosDoPainel,
        _setoresEscolhidos: setoresEscolhidos,
    };

    /** Antes de qualquer redesenho do editor, o que estava digitado se guarda. */
    function guardarTextoDigitado() {
        const campo = document.getElementById('aviso-texto');
        if (campo && typeof campo.value === 'string') {
            if (!tela.admRascunho) tela.admRascunho = {};
            tela.admRascunho.texto = campo.value;
        }
    }

    window.AvisosPainel = AvisosPainel;

    // ─── Embrulhos: nada do que já existe é reescrito ────────────────────────
    //
    // Os dois painéis desenham por caminhos diferentes, e nenhum deles sabe que
    // esta barra existe. Envolver os dois desenhos é o que faz a barra
    // acompanhar a troca de setor sem uma linha nova dentro deles.

    (function embrulharRenderOrdens() {
        const original = window.renderOrdens;
        if (typeof original !== 'function') return;
        window.renderOrdens = function () {
            const r = original.apply(this, arguments);
            try { render(); } catch (e) { console.warn('[avisos] falha ao desenhar a barra:', e); }
            return r;
        };
    })();

    (function embrulharAcabamento() {
        const painel = window.AcabamentoPainel;
        if (!painel || typeof painel.render !== 'function') return;
        const original = painel.render;
        painel.render = function () {
            const r = original.apply(this, arguments);
            try { render(); } catch (e) { console.warn('[avisos] falha ao desenhar a barra:', e); }
            return r;
        };
    })();

    (function embrulharShowView() {
        const original = window.showView;
        if (typeof original !== 'function') return;
        window.showView = function (viewId) {
            const r = original.apply(this, arguments);
            try {
                const conhecido = Object.keys(PAINEIS).some(k => PAINEIS[k].view === viewId);
                if (conhecido) AvisosPainel.aoAbrir();
                else {
                    // Saiu dos painéis: a barra é deles, e continuar na tela de
                    // Formatos seria um recado fora de contexto.
                    const caixa = elementoDaBarra();
                    if (caixa) esconder(caixa);
                }
                if (viewId === 'view-adm') renderAdm();
            } catch (e) {
                console.warn('[avisos] falha ao trocar de tela:', e);
            }
            return r;
        };
    })();

    (function embrulharSwitchAdmTab() {
        const original = window.switchAdmTab;
        if (typeof original !== 'function') return;
        window.switchAdmTab = function (tabId) {
            const r = original.apply(this, arguments);
            if (tabId === 'avisos') { try { renderAdm(); } catch (e) {} }
            return r;
        };
    })();
})();
