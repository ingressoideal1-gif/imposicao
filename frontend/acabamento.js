/**
 * PAINEL DO ACABAMENTO — a tela do setor que recebe o material depois da
 * imposição e da impressão.
 *
 * ## O que ela é
 *
 * Um espelho do Painel de Produção: mesma lista de pedidos, mesmos filtros,
 * mesmas colunas, mesmas métricas ao lado. A população é a mesma — os pedidos
 * com `status_interno` de produção — porque é exatamente esse material que
 * chega ao acabamento.
 *
 * ## O que ela NÃO é
 *
 * Não fala com o motor de imposição nem com o agente local. Não impõe, não gera
 * PDF, não imprime, não escolhe formato, saída, cor, numeração nem verso. Tudo
 * o que a Produção deixa editável aqui vira TEXTO.
 *
 * As duas únicas escritas desta tela são campos que nasceram com ela:
 * `pedidos_modelos.acabamento_status` e `pedidos_modelos.acabamento_responsavel`.
 * O `status_impressao`, que é do setor de impressão, não é lido para decidir
 * nada nem escrito em lugar nenhum daqui — os dois setores têm vocabulários
 * diferentes, e misturá-los faria uma tela mentir sobre a outra.
 *
 * ## Por que arquivo próprio
 *
 * O `script.js` já tem 1,4 MB. É a mesma direção que o Portal do Pedido tomou
 * em 20/08/2026, quando virou sete arquivos.
 *
 * ## Como ele se pendura no que já existe
 *
 * Sem tocar em `renderOrdens` nem em `showView`: os dois são EMBRULHADOS no fim
 * deste arquivo. O original roda primeiro, inteiro, e só depois esta tela se
 * redesenha. Assim a lista do acabamento nunca fica atrás da da produção — elas
 * leem o mesmo `state` no mesmo instante — e um defeito aqui não pode derrubar
 * a tela que a gráfica usa todo dia (a chamada vai dentro de try/catch).
 */
(function () {
    'use strict';

    // ─── Vocabulário do acabamento ──────────────────────────────────────────
    //
    // Os quatro estágios, nesta ordem de fluxo.
    //
    // "Aguardando" entrou em 20/08/2026, quando o usuário viu a tela pronta: o
    // modelo que ainda NÃO saiu da impressora não pode aparecer como "Impresso",
    // e a caixa vazia "— Status —" não dizia nada a quem estava olhando. Agora o
    // seletor nunca nasce vazio — ele nasce dizendo a verdade que o banco já
    // sabe, lida do status de impressão (ver `estagioDoModelo`).
    const ESTAGIOS = ['Aguardando', 'Impresso', 'Em acabamento', 'Pronto'];

    const ORDEM_ESTAGIO = { 'Aguardando': 1, 'Impresso': 2, 'Em acabamento': 3, 'Pronto': 4 };

    // O que o banco pode ter guardado com o nome antigo.
    //
    // Até 21/08/2026 o último estágio se chamava "Revisado"; o usuário trocou
    // por "Pronto". A migração `sql/acabamento_status_pronto.sql` reescreve as
    // linhas, mas a tela não pode depender disso: uma estação com a versão
    // anterior em cache ainda grava o nome velho por alguns minutos depois da
    // publicação, e ler "Revisado" como estágio desconhecido tiraria o pedido
    // da conta de concluídos sem ninguém entender por quê.
    const NOME_ANTIGO = { 'revisado': 'Pronto' };

    const SELO = {
        'Aguardando':    { icone: '⏳', cls: 'badge-blue',  texto: 'Aguardando' },
        'Impresso':      { icone: '🖨️', cls: 'badge-teal',  texto: 'Impresso' },
        'Em acabamento': { icone: '✂️', cls: 'badge-amber', texto: 'Em acabamento' },
        'Pronto':        { icone: '✅', cls: 'badge-green', texto: 'Pronto' },
    };

    // Fundo da linha do modelo, na mesma ideia do `statusBg` da fila do Pedido:
    // o estágio se lê de relance, sem procurar o selo.
    // O ESTADO do modelo, e não a pintura da página.
    //
    // Estas quatro cores NÃO acompanham a paleta da tela. Em 20/08/2026 eu as
    // tinha trazido para a família terra junto com o resto, e o usuário mandou
    // devolver: elas dizem em que ponto o modelo está, e quem lê a tela lê
    // primeiro isto. Mexer nelas para combinar com o fundo é trocar informação
    // por decoração.
    const FUNDO_DO_ESTAGIO = {
        'Aguardando':    '#001f3e',   // o que ainda não chegou
        'Impresso':      '#001249',   // o azul da tela — saiu da impressora
        'Em acabamento': '#32352e',   // oliva — em cima da mesa
        'Pronto':        '#14301f',   // verde escuro — conferido
        '':              '#001f3e',
    };

    // ─── A paleta ───────────────────────────────────────────────────────────
    //
    // O Acabamento é, de propósito, a mesma marcação da tela de Produção — as
    // mesmas classes `prod-*`. Isso faz as duas se parecerem e envelhecerem
    // juntas, e foi também o que fez uma ser confundida com a outra de relance
    // na estação. Em 20/08/2026 o usuário pediu que esta fosse derivada de
    // marrom escuro.
    //
    // O grosso da pintura mora no `style.css`, em regras presas a
    // `#view-acabamento` — trocar as classes `prod-*` repintaria a Produção
    // junto. Aqui ficam só os tons que este arquivo escreve inline.
    //
    // Em 21/08/2026 o marrom saiu e entrou a paleta azul que o usuário mandou:
    // #001249 · #123a99 · #2b32af · #4589d7 · #4cc8f0, do mais escuro ao mais
    // claro. O que a paleta não cobre é derivado dela — #0d0e20 é o P1 mais
    // fundo, para campo e cabeçalho de caixa; #cfe6fb é o texto claro puxado do
    // P5. Nenhum tom fora dessa família entra aqui.
    //
    // O azul da PRODUÇÃO continua proibido nesta tela: #3b82f6, #2563eb,
    // #334155, #1e293b e #0f172a têm teste travando. Agora que as duas são
    // azuis, é esse teste que impede as duas de virarem a mesma tela.
    const AZUL = {
        superficie: '#001249',   // a caixa do produto
        fundo:      '#0d0e20',   // o cabeçalho dela, e o fundo dos campos
        fio:        '#2b32af',   // o contorno, no lugar do cinza #918f8c
    };

    // ─── Estado da tela ─────────────────────────────────────────────────────
    //
    // Próprio, e não dentro de `state`: os filtros do acabamento não são os da
    // produção, e compartilhar as chaves faria um painel mexer no outro.
    const tela = {
        prazo: 'geral',       // geral | hoje | atrasados | prontos
        setores: [],        // vazio = todos; os cards SOMAM (ver setFiltroSetor)
        pesos: {},          // 'SETOR' -> { peso, existe } do pedido aberto
        pesosDoPedido: null,// de qual pedido é o mapa acima
        temSessao: null,    // null = ainda não perguntei ao Supabase
        estagio: '',
        sort: null,           // { campo, dir }
        pedidoAberto: null,   // osId do pedido em detalhe
        temAtrasados: false,
        operadores: null,     // null = ainda não buscado
        erroOperadores: '',

        // O estágio e o responsável de cada modelo da fila, por id.
        //
        // Existe porque o `carregarModelosGlobais` do `script.js` pede colunas
        // NOMEADAS, e acrescentar as duas do acabamento lá deixaria o Painel de
        // Produção refém desta tela: enquanto o SQL não tivesse rodado, o
        // PostgREST recusaria a consulta INTEIRA e a lista da gráfica perderia
        // progresso, itens e quantidade. A leitura é daqui, e uma falha nela
        // não sai desta tela.
        acabamento: {},
        erroAcabamento: '',
        avisouDoBanco: false,
        carregandoPedido: false,

        // Os pedidos que o usuário encerrou como TESTE, por número.
        //
        // `propostas.encerrado_teste_em` é o carimbo de hora de quando isso foi
        // feito. Nulo = pedido de verdade. Set, e não array: a lista é
        // consultada uma vez por pedido a cada desenho.
        encerradosTeste: new Set(),
    };

    // ─── Pequenos socorros ──────────────────────────────────────────────────
    //
    // Tudo o que vem do `script.js` é chamado por aqui, com guarda: este arquivo
    // carrega depois dele, mas uma estação com cópia antiga do painel pode não
    // ter alguma função nova — e um `ReferenceError` apagaria a tela inteira.

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

    /**
     * Para `onclick="fn('${escJs(v)}')"`.
     *
     * O `esc` sozinho nao serve ali: o navegador desfaz a camada HTML ao ler o
     * atributo, e uma apostrofe no valor voltaria a fechar a string JS. Espelha
     * o `escapeJsAttr` do `script.js`, e cai nele quando existe.
     */
    function escJs(v) {
        const f = fn('escapeJsAttr');
        if (f) return f(v);
        return esc(String(v === undefined || v === null ? '' : v)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'"));
    }

    /**
     * O `state` do painel.
     *
     * ATENCAO: no `script.js` ele e `const state = {...}` no topo do arquivo —
     * e `const` NAO cria propriedade em `window`. Ler `window.state` devolvia
     * `undefined` sempre, e esta tela nascia com a lista vazia e as metricas
     * zeradas, sem erro nenhum no console. O nome nu resolve pelo escopo global
     * lexical, que e onde ele de fato mora; o `typeof` protege contra a ordem
     * de carregamento e contra um `script.js` que um dia mude o nome.
     */
    function estado() {
        if (typeof state === 'object' && state) return state;
        if (typeof window.state === 'object' && window.state) return window.state;
        return {};
    }

    /** O pedido está em produção? Mesmo recorte da Fila de Produção. */
    function ehDeProducao(os) {
        const st = (os.status_interno || '').toUpperCase();
        return st === 'EM PRODUCAO' || st === 'EM PRODUÇÃO'
            || st === 'EM IMPRESSAO' || st === 'EM IMPRESSÃO';
    }

    function pedidosEmProducao() {
        return (estado().ordens || [])
            .filter(ehDeProducao)
            .filter(os => !tela.encerradosTeste.has(String(os.numero)));
    }

    /**
     * Os modelos de um pedido.
     *
     * `modelosGlobais` é a lista enxuta que o painel carrega para TODOS os
     * pedidos de uma vez (é o que alimenta a tabela); `osItens` é a lista
     * completa, buscada quando o pedido é aberto. A completa vence quando
     * existe, porque só ela tem a amostra e o responsável.
     *
     * ## Mas só quando ela veio mesmo do banco
     *
     * Corrigido em 21/08/2026, com a tela na mão do usuário: pedidos já
     * impressos apareciam na lista como "Aguardando", e o progresso dizia
     * "0/1 mod." num pedido de oito modelos.
     *
     * A causa não é o estágio nem o dado. Antes de o pedido ser aberto,
     * `osItens` não guarda modelo nenhum: guarda o cache da PROPOSTA do
     * parceiro (`_source: 'vibecode'`), montado a partir de
     * `produtos_proposta`. Ali existe uma linha por PRODUTO CONTRATADO, e nela
     * não há `status_impressao` nem `acabamento_status`. O pedido 20975 é o
     * retrato disso: um item de 320 no cache, contra os oito modelos de 40 que
     * a gráfica criou no banco. Sem status de impressão, a derivação só
     * podia responder "Aguardando".
     *
     * Então `osItens` só vence quando todas as linhas trazem `_dbLoaded`, a
     * marca que o `script.js` põe quando busca os modelos de verdade. É a mesma
     * decisão que o `renderOrdens` da Produção toma no `needsFullLoad`.
     */
    function modelosDoPedido(os) {
        if (!os) return [];
        const s = estado();
        const completos = (s.osItens && s.osItens[os.id]) || [];
        if (completos.length && completos.every(i => i && i._dbLoaded === true)) return completos;
        const num = parseInt(os.numero);
        const globais = (s.modelosGlobais && s.modelosGlobais[num]) || [];
        if (globais.length) return globais;
        return completos;
    }

    /**
     * O estágio de acabamento de um modelo.
     *
     * Duas camadas, nesta ordem:
     *
     *  1. **O que alguém escolheu**, se houver — da linha completa (quando o
     *     pedido está aberto) ou do mapa da lista.
     *  2. **O que o banco já sabe**, quando ninguém escolheu nada: modelo com a
     *     impressão concluída entra como "Impresso"; qualquer outra coisa entra
     *     como "Aguardando".
     *
     * A camada 2 é DERIVAÇÃO, nunca gravação. Desenhar a tela não escreve no
     * banco — a regra que o `renderOrdens` do `script.js` aprendeu do jeito
     * difícil. Só o seletor grava, e a partir daí a camada 1 manda.
     *
     * ## "Aguardando" gravado NÃO é uma escolha, e por isso não trava
     *
     * Corrigido em 21/08/2026, com o pedido 19775 na mão: os modelos AVRA e
     * WHISPER estavam `IMPRESSO` na Produção e **`Aguardando`** no acabamento, e
     * o acabamento mostrava Aguardando — a camada 1 vencendo a 2 para sempre.
     * O usuário reportou exatamente isso: *"modelos marcados como IMPRESSO no
     * painel de Produção aparecem no Painel de Acabamento com status IMPRESSO"*.
     *
     * A causa não é o dado, é o vocabulário. "Aguardando" aqui quer dizer *o
     * material ainda não chegou nesta mesa* — é a ausência de trabalho, não uma
     * decisão sobre ele. Quando a impressora termina, o material chegou, e
     * insistir em "Aguardando" é a tela mentindo sobre o mundo físico.
     *
     * Então "Aguardando" cai para a derivação, e as outras três escolhas —
     * Impresso, Em acabamento, Pronto — continuam vencendo tudo. A consequência
     * de que é preciso saber: marcar "Aguardando" num modelo já impresso não
     * gruda; para devolver material à fila, o caminho é o status de impressão.
     */
    function estagioDoModelo(m) {
        if (!m) return '';

        const doMapa = tela.acabamento[String(m.id)];
        let escolhido = (m.acabamento_status || (doMapa ? doMapa.status : '') || '').toString().trim();
        if (escolhido.toLowerCase() === 'aguardando') escolhido = '';
        if (escolhido) {
            const antigo = NOME_ANTIGO[escolhido.toLowerCase()];
            if (antigo) return antigo;
            const achado = ESTAGIOS.find(e => e.toLowerCase() === escolhido.toLowerCase());
            return achado || escolhido;
        }

        return estagioDerivadoDaImpressao(m);
    }

    /**
     * O estágio de partida, lido do setor anterior.
     *
     * Só 'Impresso' conta como impresso. 'Parcial' é meia impressão, e meia
     * impressão não chegou ao acabamento; 'Revisão' é problema na impressão, e
     * também não chegou. As duas entram como "Aguardando", que é a verdade do
     * ponto de vista desta tela.
     */
    function estagioDerivadoDaImpressao(m) {
        const normalizar = fn('normalizarStatusImpressao');
        const bruto = m.status_impressao || m.impressao || m.status_producao || '';
        const st = normalizar ? normalizar(bruto) : String(bruto).trim();
        return String(st).toLowerCase() === 'impresso' ? 'Impresso' : 'Aguardando';
    }

    /** O responsável gravado num modelo, pela mesma regra do estágio. */
    function responsavelDoModelo(m) {
        if (!m) return '';
        if (m.acabamento_responsavel !== undefined) {
            return (m.acabamento_responsavel || '').trim();
        }
        const doMapa = tela.acabamento[String(m.id)];
        return doMapa ? (doMapa.responsavel || '').trim() : '';
    }

    /** A foto do material tirada na revisão, ou '' se ainda não tiraram. */
    function fotoDoModelo(m) {
        if (!m) return '';
        if (m.acabamento_foto_url !== undefined) {
            return (m.acabamento_foto_url || '').trim();
        }
        const doMapa = tela.acabamento[String(m.id)];
        return doMapa ? (doMapa.foto || '').trim() : '';
    }

    /**
     * O estágio do PEDIDO, a partir dos modelos dele.
     *
     * Pronto só quando TODOS estão prontos — é o que faz o pedido sair da fila
     * de trabalho. Qualquer movimento parcial conta como "Em acabamento",
     * inclusive um pronto sozinho no meio de outros: o trabalho está em curso.
     */
    function estagioDoPedido(modelos) {
        if (!modelos || !modelos.length) return 'Aguardando';
        const estagios = modelos.map(estagioDoModelo);
        if (estagios.every(e => e === 'Pronto')) return 'Pronto';
        if (estagios.some(e => e === 'Em acabamento' || e === 'Pronto')) return 'Em acabamento';
        if (estagios.some(e => e === 'Impresso')) return 'Impresso';
        return 'Aguardando';
    }

    function seloDoEstagio(estagioTexto) {
        const s = SELO[estagioTexto] || { icone: '❓', cls: '', texto: estagioTexto || '—' };
        return `<span class="badge ${s.cls}">${s.icone} ${s.texto}</span>`;
    }

    function pedidoTotalmentePronto(os) {
        const modelos = modelosDoPedido(os);
        return modelos.length > 0 && estagioDoPedido(modelos) === 'Pronto';
    }

    // ─── Prazo de entrega ───────────────────────────────────────────────────
    //
    // As regras de data são as do Painel de Produção, chamadas de lá: prazo é
    // `propostas_os.data_termino`, e uma segunda cópia da conta aqui divergiria
    // da de lá no primeiro ajuste.

    function estaAtrasado(os) {
        const f = fn('pedidoEstaAtrasado');
        return f ? !!f(os) : false;
    }

    function ehParaHoje(os) {
        const f = fn('pedidoEhParaHoje');
        return f ? !!f(os) : false;
    }

    function passaNoPrazo(os) {
        // Pedido pronto sai da fila de trabalho: só reaparece com o botão
        // "Pronto" ligado. É o mesmo desenho do botão "Impresso" da Produção.
        if (tela.prazo === 'prontos') return pedidoTotalmentePronto(os);
        if (pedidoTotalmentePronto(os)) return false;
        if (tela.prazo === 'geral') return true;
        if (tela.prazo === 'atrasados') return estaAtrasado(os);
        return ehParaHoje(os);
    }

    // ─── Ordenação da tabela ────────────────────────────────────────────────

    const COLUNAS = {
        numero:     { tipo: 'num',   dirInicial: 'desc' },
        progresso:  { tipo: 'num',   dirInicial: 'desc' },
        itens:      { tipo: 'num',   dirInicial: 'desc' },
        quantidade: { tipo: 'num',   dirInicial: 'desc' },
        frete:      { tipo: 'texto', dirInicial: 'asc'  },
        status:     { tipo: 'texto', dirInicial: 'asc'  },
    };

    function valorDeOrdenacao(os, campo) {
        const modelos = modelosDoPedido(os);
        const total = modelos.length || 1;
        switch (campo) {
            case 'numero':     return parseInt(os.numero) || 0;
            case 'itens':      return modelos.length;
            case 'progresso':  return modelos.filter(m => estagioDoModelo(m) === 'Pronto').length / total;
            case 'quantidade': return modelos.reduce((acc, m) => acc + (parseInt(m.quantidade || m.qtd || 0) || 0), 0);
            case 'frete':      return ((os.frete_escolhido || '').trim() || 'Retirada Local').toUpperCase();
            case 'status': {
                const e = estagioDoPedido(modelos);
                return `${ORDEM_ESTAGIO[e] || 9}_${e}`;
            }
        }
        return '';
    }

    function aplicarSort(lista) {
        const sort = tela.sort;
        if (!sort || !COLUNAS[sort.campo]) return lista;
        const tipo = COLUNAS[sort.campo].tipo;
        const fator = sort.dir === 'asc' ? 1 : -1;
        return lista.slice().sort((a, b) => {
            const va = valorDeOrdenacao(a, sort.campo);
            const vb = valorDeOrdenacao(b, sort.campo);
            let cmp = tipo === 'num'
                ? (va || 0) - (vb || 0)
                : String(va).localeCompare(String(vb), 'pt-BR');
            if (cmp === 0) cmp = (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0);
            return cmp * fator;
        });
    }

    // Estilo inline pelo mesmo motivo do painel vizinho: dentro do <th> sticky
    // a folha externa não vence a cascata. As constantes são daqui, e não
    // emprestadas do `script.js`, para esta tela não quebrar se lá mudarem.
    const TH_BASE = 'display:inline-flex; align-items:center; justify-content:center; gap:6px;'
        + ' padding:7px 14px; border-radius:8px; font-size:0.75rem; font-weight:800;'
        + ' text-transform:uppercase; letter-spacing:0.03em; white-space:nowrap; cursor:pointer;';
    const TH_OFF = 'background:#123a99; border:1px solid rgba(76,200,240,0.24); color:#cfe6fb;'
        + ' box-shadow:0 2px 4px rgba(0,0,0,0.35);';
    const TH_ON = 'background:linear-gradient(135deg,#2b32af,#123a99); border:1px solid #4cc8f0;'
        + ' color:#ffffff; box-shadow:0 0 0 2px rgba(69,137,215,0.35), 0 4px 12px rgba(0,18,73,0.5);';

    function pintarCabecalhos() {
        document.querySelectorAll('#table-acabamento th[data-sort]').forEach(th => {
            const ativo = !!(tela.sort && tela.sort.campo === th.dataset.sort);
            th.classList.toggle('active', ativo);
            th.style.cursor = 'pointer';
            th.style.userSelect = 'none';
            const btn = th.querySelector('.prod-th-btn');
            if (btn) btn.style.cssText = TH_BASE + (ativo ? TH_ON : TH_OFF);
            const seta = th.querySelector('.prod-sort-arrow');
            if (seta) seta.textContent = ativo ? (tela.sort.dir === 'asc' ? '▲' : '▼') : '';
        });
    }

    /**
     * Marca o botão de prazo escolhido.
     *
     * O atributo é `data-prazo-acab`, e não `data-prazo`: o
     * `updateFiltroPrazoBotoes` da Produção varre `button[data-prazo]` no
     * documento INTEIRO, e as duas telas moram no mesmo documento. Com o nome
     * repetido, um painel repintaria os botões do outro.
     */
    function pintarBotoesPrazo() {
        const alertar = (tela.prazo === 'hoje') && tela.temAtrasados;
        document.querySelectorAll('button[data-prazo-acab]').forEach(btn => {
            const alvo = btn.getAttribute('data-prazo-acab');
            const ativo = alvo === tela.prazo;
            btn.classList.toggle('active', ativo);
            // O vermelho existe para uma situação só: olhando "Para Hoje" e
            // havendo pedido atrasado escondido fora da lista.
            btn.style.boxShadow = (!ativo && alvo === 'atrasados' && alertar)
                ? '0 0 10px rgba(239,68,68,0.55)' : '';
            btn.style.borderColor = (!ativo && alvo === 'atrasados' && alertar) ? '#ef4444' : '';
            btn.style.color = (!ativo && alvo === 'atrasados' && alertar) ? '#f87171' : '';
        });
    }

    /**
     * Acende os cards escolhidos, e o "Todos os Setores" quando não há nenhum.
     *
     * O setor de cada card vem do `data-setor`, e não do texto dele: o rótulo
     * na tela é "Têxtil" e o valor é "TEXTIL", e comparar os dois só funcionava
     * porque o `normalizar` tira o acento. Com vários acesos ao mesmo tempo,
     * ler o atributo é o jeito honesto.
     */
    function pintarBotoesSetor() {
        const todos = document.getElementById('btn-filtro-todos-setores-acab');
        if (todos) todos.classList.toggle('active', tela.setores.length === 0);
        document.querySelectorAll('#filter-container-setor-acab .filter-btn-pill').forEach(btn => {
            const meu = normalizar(btn.getAttribute('data-setor') || '');
            btn.classList.toggle('active', !!meu && tela.setores.some(s => normalizar(s) === meu));
        });
    }

    function pintarBotoesEstagio() {
        document.querySelectorAll('#filter-container-status-acab .prod-filter-status').forEach(btn => {
            const rotulo = (btn.textContent || '').replace(/^[^\wÀ-ÿ]+/, '').trim();
            const ativo = tela.estagio
                ? rotulo.toLowerCase() === tela.estagio.toLowerCase()
                : rotulo.toLowerCase() === 'todos';
            btn.classList.toggle('active', ativo);
            btn.classList.toggle('teal', ativo);
        });
    }

    function normalizar(s) {
        return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
    }

    // ─── A lista de pedidos ─────────────────────────────────────────────────

    function filtrar(ordens) {
        const campoBusca = document.getElementById('os-search-acabamento');
        // Mesma guarda da Produção: o Chrome ignora autocomplete=off e enfia o
        // e-mail salvo no campo de busca, e a lista some sem explicação.
        if (campoBusca && campoBusca.value.includes('@')) campoBusca.value = '';
        const busca = (campoBusca ? campoBusca.value : '').trim().toLowerCase();

        const s = estado();
        const rotulo = fn('rotuloDoCliente');

        return ordens.filter(os => {
            const modelos = modelosDoPedido(os);

            if (busca) {
                const num = String(os.numero || '');
                const cli = (rotulo ? rotulo(os) : (os.cliente || '')).toLowerCase();
                const numInt = parseInt(os.numero);
                const arte = (s.todasArtes || []).find(a => a.id_int === numInt && a.nome_evento);
                const evento = arte ? String(arte.nome_evento).toLowerCase() : '';
                if (!num.includes(busca) && !cli.includes(busca) && !evento.includes(busca)) return false;
            }

            if (tela.setores.length) {
                // SOMA: o pedido entra se tiver item em QUALQUER um dos setores
                // escolhidos. Ver a mesma regra no `setFiltroSetor` do script.js.
                const alvos = new Set(tela.setores.map(normalizar));
                const bate = modelos.some(m => alvos.has(normalizar(m.setor)))
                    || (s.osItens[os.id] || []).some(i => alvos.has(normalizar(i.setor)));
                if (!bate) return false;
            }

            if (tela.estagio) {
                if (!modelos.some(m => (estagioDoModelo(m) || 'Aguardando') === tela.estagio)) return false;
            }

            return true;
        });
    }

    function barraDeProgresso(prontos, total) {
        const pct = total > 0 ? Math.round((prontos / total) * 100) : 0;
        return `
            <div style="width: 100%; min-width: 110px;">
                <div style="font-size: 0.72rem; margin-bottom: 3px; color: var(--text-dim); display: flex; justify-content: space-between; font-family: monospace;">
                    <span>${prontos}/${total} mod.</span>
                    <strong>${pct}%</strong>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="width: ${pct}%; height: 100%; background: #4589d7; border-radius: 3px; transition: width 0.3s ease;"></div>
                </div>
            </div>`;
    }

    function render() {
        const tbody = document.getElementById('tbody-acabamento');
        if (!tbody) return;

        const s = estado();
        const emProducao = pedidosEmProducao();

        // ── Métricas ────────────────────────────────────────────────────────
        let emAcabamento = 0, prontos = 0, concluidos = 0;
        emProducao.forEach(os => {
            const modelos = modelosDoPedido(os);
            modelos.forEach(m => {
                const e = estagioDoModelo(m);
                if (e === 'Em acabamento') emAcabamento++;
                if (e === 'Pronto') prontos++;
            });
            if (modelos.length && estagioDoPedido(modelos) === 'Pronto') concluidos++;
        });

        escrever('stat-acab-pedidos-fila', emProducao.length);
        escrever('stat-acab-modelos-acabamento', emAcabamento);
        escrever('stat-acab-modelos-prontos', prontos);
        escrever('stat-acab-pedidos-concluidos', concluidos);
        escrever('badge-acabamento', emProducao.length);

        // O alerta de atraso é global, sobre a fila inteira: não muda conforme
        // setor, estágio ou busca. Pedido já pronto não conta — ele saiu da
        // fila de trabalho.
        tela.temAtrasados = emProducao.some(os => estaAtrasado(os) && !pedidoTotalmentePronto(os));

        // ── A tabela ────────────────────────────────────────────────────────
        let lista = filtrar(emProducao).filter(passaNoPrazo);
        lista = aplicarSort(lista);

        pintarCabecalhos();
        pintarBotoesPrazo();
        pintarBotoesSetor();
        pintarBotoesEstagio();

        const contador = document.getElementById('os-acabamento-count-badge');
        if (contador) contador.textContent = `${lista.length} ${lista.length === 1 ? 'Pedido' : 'Pedidos'}`;

        const vazio = document.getElementById('empty-acabamento');
        const tabela = document.getElementById('table-acabamento');

        if (!lista.length) {
            tbody.innerHTML = '';
            if (vazio) vazio.style.display = 'block';
            if (tabela) tabela.style.display = 'none';
            return;
        }
        if (vazio) vazio.style.display = 'none';
        if (tabela) tabela.style.display = '';

        const rotulo = fn('rotuloDoCliente');
        const logoFrete = fn('logoDoFreteHtml');
        const badgePrazo = fn('formatPrazoBadge');
        const previewArte = fn('previewDaArteDoPedidoHtml');

        tbody.innerHTML = lista.map(os => {
            const modelos = modelosDoPedido(os);
            const total = modelos.length || 1;
            const prontosDoPedido = modelos.filter(m => estagioDoModelo(m) === 'Pronto').length;
            const qtdTotal = modelos.reduce((acc, m) => acc + (parseInt(m.quantidade || m.qtd || 0) || 0), 0);

            const freteBruto = (os.frete_escolhido || '').trim() || 'Retirada Local';
            const freteHtml = logoFrete
                ? `<div style="display:flex; justify-content:center;">${logoFrete(freteBruto)}</div>`
                : esc(freteBruto);

            const numInt = parseInt(os.numero);
            const arte = (s.todasArtes || []).find(a => a.id_int === numInt && a.nome_evento);
            const eventoHtml = arte
                ? `<br><span style="font-size: 0.82rem; color: #4cc8f0;">${esc(arte.nome_evento)}</span>`
                : '';

            // A linha do PEDIDO leva o fundo do estagio, do mesmo jeito que a
            // linha do modelo (ver `linhaDoModelo`). Sem isto ela ficava com o
            // `.os-row` comum as duas telas, e um pedido ainda nao impresso
            // saia com a mesma cor da lista do Painel de Producao — que e
            // exatamente a confusao que a paleta propria desta tela existe
            // para evitar. Com o fundo aplicado, o estagio se le de relance na
            // lista inteira, antes de abrir o pedido.
            const estagioPedido = estagioDoPedido(modelos);
            const fundoPedido = FUNDO_DO_ESTAGIO[estagioPedido] || FUNDO_DO_ESTAGIO[''];

            return `
                <tr class="os-row" onclick="AcabamentoPainel.abrirPedido('${escJs(os.id)}')" style="cursor: pointer; background: ${fundoPedido};" title="Abrir os modelos do pedido ${esc(os.numero)}">
                    <td>
                        <span style="font-size: 1.35rem; font-weight: 900; color: #ffffff; background: linear-gradient(135deg, #2b32af, #001249); padding: 4px 12px; border-radius: 6px; display: inline-block; box-shadow: 0 4px 12px rgba(43, 50, 175, 0.45); text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${esc(os.numero)}</span>
                    </td>
                    <td>
                        <strong>${esc(rotulo ? rotulo(os) : (os.cliente || '')) || '--'}</strong>
                        ${eventoHtml}
                    </td>
                    <td>${barraDeProgresso(prontosDoPedido, total)}</td>
                    <td style="text-align: center; vertical-align: middle;">${previewArte ? previewArte(os) : ''}</td>
                    <td><span class="badge">${modelos.length} ${modelos.length === 1 ? 'modelo' : 'modelos'}</span></td>
                    <td><strong>${qtdTotal.toLocaleString('pt-BR')}</strong></td>
                    <td style="text-align:center; vertical-align:middle;">${freteHtml}</td>
                    <td>${seloDoEstagio(estagioPedido)}</td>
                    <td style="text-align:center; vertical-align:middle;">${badgePrazo ? badgePrazo(os) : ''}</td>
                </tr>`;
        }).join('');
    }

    function escrever(id, valor) {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    }

    // ─── A lista de responsáveis ────────────────────────────────────────────

    /**
     * Os operadores de acesso local da gráfica, só pelo nome.
     *
     * Vem da view `imposition_operadores`, criada em
     * `sql/painel_do_acabamento.sql`. A TABELA por trás dela guarda os códigos
     * de seis caracteres em texto claro e está fechada para as chaves públicas
     * — por isso a leitura passa por uma view que expõe nome, papel e nada
     * mais. A rota `/api/acessos-locais`, que devolve os códigos, exige o
     * módulo Usuários e não serviria aqui: o operador do acabamento não o tem,
     * e na estação da gráfica ele nem sessão do Supabase tem.
     */
    async function carregarOperadores() {
        if (tela.operadores) return tela.operadores;
        tela.erroOperadores = '';
        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                throw new Error('sem conexão com o banco');
            }
            const { data, error } = await supabaseClient
                .from('imposition_operadores')
                .select('id, nome, role, ativo')
                .order('nome', { ascending: true });
            if (error) throw error;
            tela.operadores = (data || [])
                .filter(o => o.ativo !== false && (o.nome || '').trim())
                .map(o => String(o.nome).trim());
        } catch (e) {
            tela.operadores = [];
            tela.erroOperadores = e && e.message ? e.message : String(e);
            console.warn('[acabamento] não deu para ler a lista de operadores:', e);
        }
        return tela.operadores;
    }

    /**
     * Os pedidos que foram encerrados como teste.
     *
     * Consulta própria, pelo mesmo motivo da leitura do estágio: o
     * `loadOrdensFromVibecode` do `script.js` pede colunas NOMEADAS de
     * `propostas`, e acrescentar `encerrado_teste_em` lá deixaria o Painel de
     * Produção refém desta tela — uma coluna que sumisse derrubaria a lista da
     * gráfica inteira, não só esta.
     *
     * São poucas linhas (doze, quando isto foi escrito): o filtro é do lado do
     * banco, e só volta o número do pedido.
     *
     * Falhar aqui NÃO esconde nada nem quebra a tela: o conjunto fica vazio e a
     * fila aparece inteira, que é o comportamento de antes deste recurso.
     */
    async function carregarEncerradosComoTeste() {
        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
            const { data, error } = await supabaseClient
                .from('propostas')
                .select('id_int')
                .not('encerrado_teste_em', 'is', null);
            if (error) throw error;
            tela.encerradosTeste = new Set((data || [])
                .map(p => String(p.id_int))
                .filter(n => n && n !== 'null'));
        } catch (e) {
            console.warn('[acabamento] não deu para ler os pedidos encerrados como teste:', e);
        }
    }

    /**
     * Lê o estágio e o responsável de todos os modelos da fila.
     *
     * Consulta própria, e de propósito: as duas colunas são novas, e enquanto
     * `sql/painel_do_acabamento.sql` não tiver rodado o banco responde que a
     * coluna não existe. Aqui isso vira um recado nesta tela; se estivesse
     * junto da consulta do Painel de Produção, derrubaria a lista da gráfica.
     */
    async function carregarAcabamentoDosModelos() {
        const numeros = pedidosEmProducao()
            .map(os => parseInt(os.numero))
            .filter(n => !isNaN(n));
        if (!numeros.length) { tela.acabamento = {}; return; }

        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                throw new Error('sem conexão com o banco');
            }
            const mapa = {};
            // Em fatias, pelo mesmo motivo do `carregarModelosGlobais`: um `in`
            // com mil números estoura o tamanho da URL.
            for (let i = 0; i < numeros.length; i += 200) {
                const fatia = numeros.slice(i, i + 200);
                const { data, error } = await supabaseClient
                    .from('pedidos_modelos')
                    .select('id, id_int, acabamento_status, acabamento_responsavel, acabamento_foto_url')
                    .in('id_int', fatia);
                if (error) throw error;
                (data || []).forEach(m => {
                    mapa[String(m.id)] = {
                        status: m.acabamento_status || '',
                        responsavel: m.acabamento_responsavel || '',
                        foto: m.acabamento_foto_url || '',
                    };
                });
            }
            tela.acabamento = mapa;
            tela.erroAcabamento = '';
        } catch (e) {
            tela.erroAcabamento = (e && e.message) ? e.message : String(e);
            console.warn('[acabamento] não deu para ler o estágio dos modelos:', e);
            // Uma vez por sessão: repetir o aviso a cada desenho da tela viraria
            // ruído, e o recado é sempre o mesmo.
            if (!tela.avisouDoBanco) {
                tela.avisouDoBanco = true;
                const aviso = fn('toast');
                if (aviso) {
                    aviso('O Painel do Acabamento ainda não foi ligado ao banco. '
                        + 'Peça ao administrador para rodar a atualização do banco. '
                        + 'Até lá a tela lista os pedidos, mas não guarda estágio nem responsável.',
                        'warning');
                }
            }
        }
    }

    // ─── O pedido aberto ────────────────────────────────────────────────────

    /**
     * A amostra que foi enviada ao cliente pelo link.
     *
     * É a imagem COMPOSTA — cor + arte + numeração — que ele viu e aprovou, e é
     * por isso que ela serve de referência para conferir o papel. Mora em
     * `amostra_arte_base64` quando é um render do bucket `amostras_renderizadas`;
     * na falta dele vale a arte do modelo.
     *
     * Amostra em PDF NÃO vira imagem aqui: sai um atalho que abre o arquivo.
     * Rasterizar a arte do cliente está fora de cogitação neste projeto.
     */
    function amostraDoModelo(item) {
        const composta = item.amostra_arte_base64 || '';
        const ehRender = typeof composta === 'string' && composta.indexOf('/amostras_renderizadas/') !== -1;
        if (ehRender) return { src: composta, aprovada: true };
        if (composta) return { src: composta, aprovada: false };
        if (item.arte_url) return { src: item.arte_url, aprovada: false };
        return { src: '', aprovada: false };
    }

    function ehPdf(src) {
        const s = String(src || '');
        return s.startsWith('data:application/pdf') || s.indexOf('JVBERi') !== -1
            || /\.pdf($|\?)/i.test(s);
    }

    function amostraHtml(item, idAmostra) {
        const { src, aprovada } = amostraDoModelo(item);
        // Sem `max-width`: a amostra ocupa a metade que é dela, e quem manda no
        // tamanho é a coluna. Pedido do usuário em 20/08/2026.
        const moldura = 'width: 100%; min-height: 150px;'
            + ' border: 1px dashed rgba(76,200,240,0.26); background: rgba(76,200,240,0.06);'
            + ' display: flex; align-items: center; justify-content: center;';

        if (!src) {
            return `<div style="${moldura} height: 180px; color: var(--text-dim); flex-direction: column; gap: 6px; text-align: center; padding: 12px;">
                        <span style="font-size: 1.8rem;">🖼️</span>
                        <span style="font-size: 0.78rem;">Sem amostra enviada ao cliente</span>
                    </div>`;
        }

        if (ehPdf(src)) {
            return `<div style="${moldura} height: 180px; flex-direction: column; gap: 8px; color: #4cc8f0; cursor: pointer; text-align: center; padding: 12px;"
                         onclick="window.open('${escJs(src)}', '_blank')" title="Amostra em PDF — clique para abrir o arquivo">
                        <span style="font-size: 2rem;">📄</span>
                        <span style="font-size: 0.78rem; font-weight: 700;">Amostra em PDF — abrir arquivo</span>
                    </div>`;
        }

        const legenda = aprovada
            ? 'Amostra aprovada pelo cliente no link — clique para ampliar'
            : 'Arte do modelo — clique para ampliar';

        // SEM fundo branco atras da imagem, por pedido do usuario em
        // 20/08/2026: a arte ja traz o proprio fundo, e a chapa branca em volta
        // dela recortava um retangulo claro no meio da caixa escura.
        return `
            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
                <img id="${idAmostra}" src="${esc(src)}" alt="Amostra do modelo"
                     style="width: 100%; max-height: 360px; object-fit: contain; cursor: zoom-in; display: block; margin: 0 auto;"
                     onclick="AcabamentoPainel.ampliar('${escJs(idAmostra)}')" title="${esc(legenda)}" />
                <span style="font-size: 0.72rem; color: var(--text-dim);">🔍 ${esc(legenda)}</span>
            </div>`;
    }

    function dado(rotuloTexto, valor, cor) {
        return `
            <div style="display: flex; flex-direction: column; gap: 2px; min-width: 92px;">
                <span style="font-size: 0.68rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #94a3b8;">${esc(rotuloTexto)}</span>
                <span style="font-size: 1.02rem; font-weight: 700; color: ${cor || '#ffffff'};">${valor}</span>
            </div>`;
    }

    function nomeNoCatalogo(catalogo, id) {
        const linha = id ? (catalogo || []).find(x => String(x.id) === String(id)) : null;
        return linha ? (linha.name || linha.tipo || '') : '';
    }

    function selectEstagio(item, osId, podeEditar) {
        // Sem opção vazia: o estágio sempre tem um valor, nem que seja o
        // derivado da impressão. Uma linha "— Status —" aqui só serviria para
        // alguém escolher o nada.
        const atual = estagioDoModelo(item);
        const opcoes = ESTAGIOS
            .map(e => `<option value="${esc(e)}" ${atual === e ? 'selected' : ''}>${esc(e)}</option>`)
            .join('');
        return `
            <select ${podeEditar ? '' : 'disabled'} style="${ESTILO_SELECT}${podeEditar ? '' : ESTILO_SELECT_TRAVADO}"
                    onchange="AcabamentoPainel.mudarEstagio('${escJs(item.id)}', '${escJs(osId)}', this.value)"
                    title="Em que ponto do acabamento este modelo está">
                ${opcoes}
            </select>`;
    }

    function selectResponsavel(item, osId, podeEditar) {
        const atual = responsavelDoModelo(item);
        const lista = tela.operadores || [];
        // Um responsável que saiu da lista de acessos continua aparecendo: o
        // nome está gravado no modelo, e apagá-lo da tela faria o trabalho
        // parecer sem dono.
        const nomes = lista.slice();
        if (atual && !nomes.some(n => n.toLowerCase() === atual.toLowerCase())) nomes.unshift(atual);

        const opcoes = ['<option value="">— Responsável —</option>'].concat(
            nomes.map(n => `<option value="${esc(n)}" ${n.toLowerCase() === atual.toLowerCase() ? 'selected' : ''}>${esc(n)}</option>`)
        ).join('');

        // A saída da trava vai escrita na própria tela: sem isso o operador vê
        // um seletor vazio e não tem como saber o que fazer.
        const recado = (!lista.length && tela.erroOperadores)
            ? `<span style="font-size:0.7rem; color:#f87171;">Lista de operadores indisponível. Cadastre em Usuários → Acesso Local, ou tente ATUALIZAR.</span>`
            : (!lista.length
                ? `<span style="font-size:0.7rem; color:var(--text-dim);">Nenhum acesso local cadastrado. Cadastre em Usuários → Acesso Local.</span>`
                : '');

        return `
            <select ${podeEditar ? '' : 'disabled'} style="${ESTILO_SELECT}${podeEditar ? '' : ESTILO_SELECT_TRAVADO}"
                    onchange="AcabamentoPainel.mudarResponsavel('${escJs(item.id)}', '${escJs(osId)}', this.value)"
                    title="Quem é o responsável pelo acabamento deste modelo">
                ${opcoes}
            </select>
            ${recado}`;
    }

    const ESTILO_SELECT = 'appearance: none; -webkit-appearance: none; -moz-appearance: none;'
        + ' background: #0d0e20; border: 1px solid rgba(76,200,240,0.26); border-radius: 6px;'
        + ' color: #ffffff; padding: 8px 12px; font-size: 1.05rem; width: 100%;'
        + ' text-align: center; text-align-last: center; font-weight: 600; cursor: pointer;'
        + ' box-shadow: 0 2px 5px rgba(0,0,0,0.3);';
    const ESTILO_SELECT_TRAVADO = ' opacity: 0.55; cursor: not-allowed; color: rgba(255,255,255,0.55);';

    const ESTILO_BOTAO_CAMERA = 'display: inline-flex; align-items: center; gap: 8px;'
        + ' background: linear-gradient(135deg,#2b32af,#123a99); border: 1px solid #4cc8f0; color: #ffffff;'
        + ' border-radius: 8px; padding: 9px 18px; font-size: 0.95rem; font-weight: 800; cursor: pointer;';
    const ESTILO_BOTAO_CAMERA_OK = 'display: inline-flex; align-items: center; gap: 8px;'
        + ' background: linear-gradient(135deg,#16a34a,#15803d); border: 1px solid #86efac; color: #ffffff;'
        + ' border-radius: 8px; padding: 9px 18px; font-size: 0.95rem; font-weight: 800; cursor: pointer;';
    const ESTILO_BOTAO_CAMERA_FRACO = 'display: inline-flex; align-items: center; gap: 8px;'
        + ' background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.25); color: #cbd5e1;'
        + ' border-radius: 8px; padding: 9px 18px; font-size: 0.95rem; font-weight: 700; cursor: pointer;';

    /** Só quem tem EDITAR do módulo Acabamento mexe nos dois seletores. */
    function podeEditar() {
        const perms = window._currentPerms;
        if (!perms) return true;   // permissões ainda não chegaram: não trancar
        return perms.perm_acabamento_edit === true;
    }

    function linhaDoModelo(item, osId, idx) {
        const s = estado();
        const estagio = estagioDoModelo(item);
        const fundo = FUNDO_DO_ESTAGIO[estagio] || FUNDO_DO_ESTAGIO[''];

        const corId = item.amostra_cor_id;
        const corNome = nomeNoCatalogo(s.cores, corId) || item.cor || item.padrao || '';
        const corObj = corId ? (s.cores || []).find(c => String(c.id) === String(corId)) : null;
        const corHex = corObj ? (corObj.cor_referencia || corObj.hex || '') : '';

        const numNome = nomeNoCatalogo(s.numeracoes, item.amostra_num_id || item.numeracao_id)
            || item.gabarito_operacional || item.numeracao || '';

        const numSel = (item.amostra_num_id || item.numeracao_id)
            ? (s.numeracoes || []).find(n => String(n.id) === String(item.amostra_num_id || item.numeracao_id))
            : null;
        const ehCamarote = !!(numSel && (numSel.tipo === 'CAMAROTE' || numSel.type === 'CAMAROTE'));

        const qtd = item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || 0);
        const ni = item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || '');
        const nf = item.num_final !== undefined && item.num_final !== null ? item.num_final : (item.numeracao_fim || '');

        const numeros = ehCamarote
            ? [
                dado('Q_CAM', esc(item.q_cam || item.Q_CAM || '—'), '#4cc8f0'),
                dado('L_CAM', esc(item.l_cam || item.L_CAM || '—'), '#4cc8f0'),
                dado('C_INI', esc(item.c_ini || item.C_INI || 1), '#4cc8f0'),
            ].join('')
            : [
                dado('Qtd', (parseInt(qtd) || 0).toLocaleString('pt-BR')),
                dado('Nº Inicial', esc(ni || '—')),
                dado('Nº Final', esc(nf || '—')),
                dado('Bloco', esc(item.bloco !== undefined && item.bloco !== null && item.bloco !== '' ? item.bloco : '—')),
            ].join('');

        const impressao = fn('normalizarStatusImpressao')
            ? window.normalizarStatusImpressao(item.status_impressao || item.impressao)
            : (item.status_impressao || item.impressao || '—');

        const idAmostra = `acab-amostra-${esc(osId)}-${esc(item.id)}-${idx}`;

        return `
            <div style="background: ${fundo}; outline: 1px solid ${AZUL.fio}; border-radius: 8px; padding: 14px; margin-bottom: 10px; display: flex; gap: 18px; flex-wrap: wrap; align-items: stretch;">

                <div style="flex: 1 1 320px; min-width: 280px; max-width: 100%; display: flex; align-items: center; justify-content: center;">
                    ${amostraHtml(item, idAmostra)}
                </div>

                <div style="flex: 1 1 320px; min-width: 280px; display: flex; flex-direction: column; gap: 14px;">

                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <span style="width: 22px; height: 22px; min-width: 22px; border-radius: 50%; background-color: ${corHex || 'transparent'}; border: ${corHex ? '2px solid rgba(255,255,255,0.8)' : '2px dashed #918f8c'}; display: inline-block;" title="Cor de referência: ${esc(corNome || 'nenhuma')}"></span>
                        <strong style="font-size: 1.2rem; color: #ffffff;">${esc(item.produto || item.nome_modelo || 'Modelo')}</strong>
                        <span class="badge" title="Código do modelo">#${esc(item.modelo || item.id || '--')}</span>
                        ${seloDoEstagio(estagio)}
                    </div>

                    <div style="display: flex; gap: 18px; flex-wrap: wrap;">
                        ${numeros}
                    </div>

                    <div style="display: flex; gap: 18px; flex-wrap: wrap;">
                        ${dado('Cor', esc(corNome || '—'))}
                        ${dado('Numeração', esc(numNome || '—'))}
                        ${dado('Verso', esc(item.verso_tipo || (item.verso ? 'FxVerso' : 'Frente')))}
                        ${dado('Impressão', esc(impressao || '—'), '#94a3b8')}
                    </div>

                    <div style="display: flex; gap: 14px; flex-wrap: wrap; border-top: 1px dashed rgba(255,255,255,0.18); padding-top: 12px;">
                        <div style="flex: 1 1 220px; display: flex; flex-direction: column; gap: 4px;">
                            <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Status do acabamento</span>
                            ${selectEstagio(item, osId, podeEditar())}
                        </div>
                        <div style="flex: 1 1 220px; display: flex; flex-direction: column; gap: 4px;">
                            <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Responsável</span>
                            ${selectResponsavel(item, osId, podeEditar())}
                        </div>
                    </div>

                    ${faixaDaFoto(item, osId, idx)}

                </div>
            </div>`;
    }

    function renderDetalhe() {
        const corpo = document.getElementById('acab-detalhe-corpo');
        if (!corpo || !tela.pedidoAberto) return;

        const s = estado();
        const buscar = fn('findOSInState');
        const os = buscar ? buscar(tela.pedidoAberto) : (s.ordens || []).find(o => o.id === tela.pedidoAberto);
        const itens = (s.osItens && s.osItens[tela.pedidoAberto]) || [];

        const rotulo = fn('rotuloDoCliente');
        escrever('acab-detalhe-numero', os ? `#${os.numero}` : '');
        const cliEl = document.getElementById('acab-detalhe-cliente');
        if (cliEl) cliEl.textContent = os && rotulo ? rotulo(os) : '';

        if (!itens.length) {
            // "Carregando" so enquanto realmente esta carregando. Pedido sem
            // modelo nenhum existe, e deixa-lo com a frase de espera para sempre
            // faria o operador achar que a tela travou.
            corpo.innerHTML = tela.carregandoPedido
                ? `<div style="padding: 28px; text-align: center; color: var(--text-dim);">Carregando os modelos deste pedido…</div>`
                : `<div style="padding: 28px; text-align: center; color: var(--text-dim);">
                       <div style="font-size: 1.8rem; margin-bottom: 8px;">📦</div>
                       Este pedido não tem modelo cadastrado.<br>
                       <span style="font-size: 0.82rem;">Se isso não está certo, use VOLTAR e depois ATUALIZAR.</span>
                   </div>`;
            escrever('acab-detalhe-progresso', '0/0 prontos');
            return;
        }

        const prontos = itens.filter(i => estagioDoModelo(i) === 'Pronto').length;
        escrever('acab-detalhe-progresso', `${prontos}/${itens.length} prontos`);

        // Agrupado por produto, na mesma ordem em que a fila do Pedido desenha.
        const grupos = {};
        itens.forEach(item => {
            const prodId = item._vibe_id_produto || 'sem_produto';
            if (!grupos[prodId]) grupos[prodId] = [];
            grupos[prodId].push(item);
        });

        const html = Object.keys(grupos).map(prodId => {
            const doGrupo = grupos[prodId];
            let nome = 'Produto Desconhecido';
            let setorPcp = '';
            if (prodId !== 'sem_produto') {
                const prod = (s.produtosGlobais || []).find(p => String(p.id_produto) === String(prodId));
                nome = prod ? (prod.nomeReal || `Produto #${prodId}`) : `Produto #${prodId}`;
                setorPcp = prod ? (prod.setor_pcp || '') : '';
            }
            const selo = setorPcp
                ? `<span class="badge" style="font-size:0.72rem; margin-left:8px; color:#ffffff;">${esc(setorPcp)}</span>`
                : '';

            return `
                <div style="background:${AZUL.superficie}; border: 1px solid ${AZUL.fio}; border-radius: 8px; overflow: hidden; margin-bottom: 14px;">
                    <div style="background:${AZUL.fundo}; padding: 10px 15px; border-bottom: 1px solid ${AZUL.fio};">
                        <h5 style="margin: 0; color: #4cc8f0; font-size: 1.25rem; font-weight: bold;">
                            📦 ${esc(nome)} ${selo}
                            <span style="font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-left: 8px;">${doGrupo.length} ${doGrupo.length === 1 ? 'modelo' : 'modelos'}</span>
                        </h5>
                    </div>
                    <div style="padding: 12px;">
                        ${doGrupo.map((item, idx) => linhaDoModelo(item, tela.pedidoAberto, idx)).join('')}
                    </div>
                </div>`;
        }).join('');

        corpo.innerHTML = boxDePesos(itens, os ? os.numero : '') + html;

        // Os campos de peso são desenhados junto com o pedido, então o valor
        // gravado tem de voltar a eles a cada desenho.
        pintarPesos();
    }

    function mostrarLista() {
        const topo = document.getElementById('acab-top-bar');
        const lista = document.getElementById('acab-lista-card');
        const detalhe = document.getElementById('acab-detalhe-card');
        const vazio = document.getElementById('empty-acabamento');
        const emDetalhe = !!tela.pedidoAberto;

        if (topo) topo.style.display = emDetalhe ? 'none' : '';
        if (lista) lista.style.display = emDetalhe ? 'none' : '';
        if (detalhe) detalhe.style.display = emDetalhe ? 'flex' : 'none';
        if (vazio && emDetalhe) vazio.style.display = 'none';
    }

    // ─── O peso por setor ───────────────────────────────────────────────────
    //
    // Pedido do usuário em 21/08/2026: um box acima dos modelos, com os setores
    // dos produtos daquele pedido e um campo de peso para cada um. "Triband +
    // Credencial + Mobi" são dois setores — Laser e PVC —, e cada um tem a sua
    // linha.
    //
    // ## Onde isso é gravado, e por que ali
    //
    // Em `propostas_os_setores.peso_real_kg`, que é tabela do PARCEIRO. A regra
    // da casa (`docs/REGRAS_BANCO.md`) diz que não se escreve em tabela sem
    // prefixo nosso, e esta é a exceção que o usuário abriu — com razão: a
    // tabela tem `peso_real_kg`, `qtd_volumes`, `tipo_volume` e
    // `responsavel_conferencia`, ou seja, é a ficha de conferência de expedição
    // que o ERP mantém para a gráfica preencher. O ERP já preenche parte dela.
    //
    // A escrita é a mais estreita possível: só a coluna do peso e o
    // `updated_at`. Nada mais da linha é tocado.
    //
    // ## Dois caminhos, porque a estação não tem sessão
    //
    // A tabela tem RLS, e as quatro políticas são de `authenticated`. Na estação
    // da gráfica o operador entra pelo código local, sem sessão do Supabase — e
    // ali a chave anônima lê a tabela e recebe `[]` com HTTP 200: vazio, sem
    // erro nenhum. Medido em 21/08/2026.
    //
    // Em 21/08/2026 o usuário decidiu que a digitação do peso e a escolha dos
    // drops seriam feitas justamente pelo acesso local do agente. Então há dois
    // caminhos, e quem escolhe é QUEM SERVIU a página — o mesmo desenho do
    // catálogo de fontes:
    //
    //   - **estação** → `/api/peso-setores/<pedido>` do agente, que repassa à
    //     Edge Function `acesso-estacao` com o segredo dele e grava com a chave
    //     de serviço. A regra inteira mora em `_compartilhado/pesos.ts`.
    //   - **site, com sessão** → direto no PostgREST, que é o que a sessão do
    //     Vibe já autoriza.
    //
    // Sem nenhum dos dois — página no site sem login —, o box diz o que fazer em
    // vez de mostrar campos que não gravariam nada.

    const TABELA_DE_SETORES = 'propostas_os_setores';

    /**
     * Há um agente servindo esta página?
     *
     * `SERVIDA_PELA_NUVEM` vem do `supabase-config.js`, que toda página carrega
     * antes desta. Ele sai de `window.location` na hora: porta 9000 ou
     * localhost é estação. Ausente conta como nuvem — o caminho que não inventa
     * um agente que não está ali.
     *
     * O identificador NU vem primeiro, e o `window` depois, pela mesma razão do
     * `estado()`: um `const` no topo de um script clássico vive no escopo léxico
     * global e é visto assim pelos outros scripts, mas NÃO vira propriedade de
     * `window`. Ler só pelo `window` daria `undefined` no navegador.
     */
    function pelaEstacao() {
        if (typeof SERVIDA_PELA_NUVEM !== 'undefined') return SERVIDA_PELA_NUVEM === false;
        return (typeof window !== 'undefined') && window.SERVIDA_PELA_NUVEM === false;
    }

    /**
     * O endereço de uma rota do agente.
     *
     * Um lugar só monta o `API_BASE_URL`, e há teste contando: esta tela fala
     * com o agente por estas três rotas e por mais nenhuma.
     */
    function urlDaEstacao(rota, numeroDoPedido) {
        let base = '';
        if (typeof API_BASE_URL !== 'undefined') base = API_BASE_URL;
        else if (typeof window !== 'undefined' && window.API_BASE_URL) base = window.API_BASE_URL;
        return `${base}/api/${rota}/${encodeURIComponent(numeroDoPedido)}`;
    }

    function urlDoPeso(numeroDoPedido) {
        return urlDaEstacao('peso-setores', numeroDoPedido);
    }

    /** O `fetch` da janela, e não o global: é o que o teste consegue trocar. */
    function buscar(url, opcoes) {
        const f = (typeof window !== 'undefined' && window.fetch) ? window.fetch : fetch;
        return f(url, opcoes);
    }

    // Os quatro que o banco aceita: `propostas_os_setores_setor_check`. Escrever
    // qualquer outro devolve 23514, e a ordem aqui é a mesma dos cards da fila.
    const SETORES_DO_BANCO = ['FLEXO', 'PVC', 'TEXTIL', 'LASER'];

    const ROTULO_DO_SETOR = {
        FLEXO:  { nome: 'Flexo',  icone: '🗂️' },
        PVC:    { nome: 'PVC',    icone: '🪪' },
        TEXTIL: { nome: 'Têxtil', icone: '👕' },
        LASER:  { nome: 'Laser',  icone: '☀️' },
    };

    /**
     * Os setores dos produtos deste pedido, na ordem dos cards.
     *
     * Vem do `setor` de cada item, que o `script.js` já resolveu a partir de
     * `produtos.setor_pcp` — a mesma origem dos cards da fila. Setor que o banco
     * não aceita fica de fora: melhor não oferecer o campo do que oferecer um
     * que devolve erro na hora de gravar.
     */
    function setoresDoPedido(itens) {
        const achados = new Set();
        (itens || []).forEach(i => {
            const s = normalizar(i && i.setor);
            if (SETORES_DO_BANCO.indexOf(s) !== -1) achados.add(s);
        });
        return SETORES_DO_BANCO.filter(s => achados.has(s));
    }

    /**
     * Há sessão do Supabase? Sem ela a tabela do parceiro é invisível.
     *
     * Só o SIM fica guardado. O não se re-pergunta a cada vez, de propósito: o
     * painel tem tela de login, e quem entrar no meio do caminho não pode ficar
     * preso a uma resposta de antes — seria um box travado até recarregar a
     * página, sem nada na tela explicando por quê.
     */
    async function temSessaoDoSupabase() {
        if (pelaEstacao()) return false;   // lá o caminho é outro; nem se pergunta
        if (tela.temSessao === true) return true;
        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.auth) {
                tela.temSessao = false;
                return false;
            }
            const { data } = await supabaseClient.auth.getSession();
            tela.temSessao = !!(data && data.session);
        } catch (e) {
            tela.temSessao = false;
        }
        return tela.temSessao;
    }

    /** "4,16" e "4.16" são o mesmo peso; vazio é apagar. */
    function pesoDoTexto(texto) {
        const limpo = String(texto === undefined || texto === null ? '' : texto)
            .trim().replace(',', '.');
        if (!limpo) return null;
        const n = Number(limpo);
        if (!isFinite(n) || n < 0) return undefined;   // undefined = não é peso
        return Math.round(n * 1000) / 1000;
    }

    /** O peso na tela sai com vírgula, que é como a balança da gráfica mostra. */
    function pesoParaTexto(valor) {
        if (valor === null || valor === undefined || valor === '') return '';
        const n = Number(valor);
        if (!isFinite(n)) return '';
        return String(n).replace('.', ',');
    }

    /**
     * Lê as linhas de `propostas_os_setores` daquele pedido.
     *
     * Falha e lista vazia são coisas DIFERENTES aqui, e é por isso que o
     * resultado guarda `existe` por setor: sem linha no banco, gravar precisa
     * inserir; com linha, precisa atualizar sem encostar no resto dela.
     */
    async function carregarPesos(numeroDoPedido) {
        tela.pesos = {};
        tela.pesosDoPedido = numeroDoPedido;

        const idInt = parseInt(numeroDoPedido);
        if (isNaN(idInt)) return;

        const guardar = linhas => (linhas || []).forEach(l => {
            tela.pesos[normalizar(l.setor)] = {
                peso: l.peso_real_kg === null || l.peso_real_kg === undefined
                    ? null : Number(l.peso_real_kg),
                existe: true,
                producao: (l.status_producao || '').trim(),
            };
        });

        try {
            if (pelaEstacao()) {
                const res = await buscar(urlDoPeso(idInt));
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                guardar((await res.json()).setores);
                return;
            }
            if (!(await temSessaoDoSupabase())) return;
            const { data, error } = await supabaseClient
                .from(TABELA_DE_SETORES)
                .select('id, setor, peso_real_kg, status_producao')
                .eq('id_int', idInt);
            if (error) throw error;
            guardar(data);
        } catch (e) {
            console.warn('[acabamento] não deu para ler o peso por setor:', e);
        }
    }

    /**
     * Grava o peso de UM setor.
     *
     * Atualiza primeiro; só insere se a atualização não encontrou linha. É o
     * caminho que menos mexe na tabela do parceiro: hoje 729 dos 758 pares
     * (pedido, setor) ainda não têm linha, porque o ERP as cria na expedição.
     *
     * `UNIQUE (id_int, setor)` protege a corrida entre duas pessoas no mesmo
     * pedido: o segundo INSERT volta 23505 e vira atualização.
     */
    async function gravarPeso(numeroDoPedido, setor, texto) {
        const idInt = parseInt(numeroDoPedido);
        const alvo = normalizar(setor);
        if (isNaN(idInt) || SETORES_DO_BANCO.indexOf(alvo) === -1) return;

        const peso = pesoDoTexto(texto);
        if (peso === undefined) {
            avisar(`"${texto}" não é um peso. Use só números, como 4,16.`, 'error');
            pintarPesos();
            return;
        }

        const antes = tela.pesos[alvo] || { peso: null, existe: false, producao: '' };
        tela.pesos[alvo] = { peso, existe: antes.existe, producao: antes.producao };
        marcarPeso(alvo, 'gravando');

        try {
            if (pelaEstacao()) {
                // A estação não fala com a tabela do parceiro: quem grava é o
                // agente, pela Edge Function. A regra (atualiza, e só insere se
                // não houver linha) mora lá, uma vez só.
                const res = await buscar(urlDoPeso(idInt), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ setor: alvo, peso_real_kg: peso }),
                });
                if (!res.ok) {
                    let detalhe = `HTTP ${res.status}`;
                    try {
                        const corpo = await res.json();
                        if (corpo && corpo.detail) detalhe = corpo.detail;
                    } catch (ignorado) { /* resposta sem JSON: fica o código */ }
                    throw new Error(detalhe);
                }
                tela.pesos[alvo] = { peso, existe: true, producao: antes.producao };
                marcarPeso(alvo, 'gravado');
                return;
            }

            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                throw new Error('sem conexão com o banco');
            }
            if (!(await temSessaoDoSupabase())) {
                throw new Error('esta tela está sem sessão do Vibe');
            }

            const agora = new Date().toISOString();
            const { data: mexidas, error: erroUpdate } = await supabaseClient
                .from(TABELA_DE_SETORES)
                .update({ peso_real_kg: peso, updated_at: agora })
                .eq('id_int', idInt).eq('setor', alvo)
                .select('id');
            if (erroUpdate) throw erroUpdate;

            if (!mexidas || !mexidas.length) {
                // Linha nova. `id_os` sai preenchido quando o ERP já abriu a OS
                // daquele pedido; sem OS ele fica nulo, como as duas linhas que
                // o próprio ERP já tem assim.
                const { data: os } = await supabaseClient
                    .from('propostas_os').select('id').eq('id_int', idInt).limit(1);
                const linha = {
                    id_int: idInt,
                    setor: alvo,
                    peso_real_kg: peso,
                    updated_at: agora,
                };
                if (os && os.length && os[0].id) linha.id_os = os[0].id;

                const { error: erroInsert } = await supabaseClient
                    .from(TABELA_DE_SETORES).insert(linha);
                if (erroInsert) {
                    // 23505 = outra pessoa criou a linha entre o update e o
                    // insert. A escolha dela e a minha são a mesma coluna.
                    const dup = String(erroInsert.code || '') === '23505';
                    if (!dup) throw erroInsert;
                    const { error: erroRetry } = await supabaseClient
                        .from(TABELA_DE_SETORES)
                        .update({ peso_real_kg: peso, updated_at: agora })
                        .eq('id_int', idInt).eq('setor', alvo);
                    if (erroRetry) throw erroRetry;
                }
            }

            tela.pesos[alvo] = { peso, existe: true, producao: antes.producao };
            marcarPeso(alvo, 'gravado');
        } catch (e) {
            console.error('[acabamento] erro ao gravar o peso:', e);
            tela.pesos[alvo] = antes;
            marcarPeso(alvo, 'erro');
            avisar(`Não deu para gravar o peso do setor ${(ROTULO_DO_SETOR[alvo] || {}).nome || alvo}`
                 + ` (${e && e.message ? e.message : e}).`, 'error');
            pintarPesos();
        }
    }

    function avisar(mensagem, tipo) {
        const toast = fn('toast');
        if (toast) toast(mensagem, tipo || 'info');
    }

    /** O sinalzinho ao lado do campo, sem redesenhar o pedido inteiro. */
    function marcarPeso(setor, estado) {
        const el = document.getElementById('acab-peso-sinal-' + setor);
        if (!el) return;
        const desenho = {
            gravando: { texto: '…',          cor: 'var(--text-dim)' },
            gravado:  { texto: '✓ gravado',  cor: '#4ade80' },
            erro:     { texto: '✕ não foi',  cor: '#f87171' },
            '':       { texto: '',           cor: 'var(--text-dim)' },
        }[estado] || { texto: '', cor: 'var(--text-dim)' };
        el.textContent = desenho.texto;
        el.style.color = desenho.cor;
    }

    /** Devolve aos campos o que está no estado, sem tocar no resto da tela. */
    function pintarPesos() {
        Object.keys(ROTULO_DO_SETOR).forEach(setor => {
            const campo = document.getElementById('acab-peso-' + setor);
            if (!campo) return;
            const atual = tela.pesos[setor];
            campo.value = pesoParaTexto(atual ? atual.peso : null);
        });
    }

    /**
     * O box, acima dos modelos.
     *
     * Sem setor nenhum e sem sessão são dois "vazios" diferentes, e cada um diz
     * a sua razão: um box mudo faria o operador procurar defeito onde não há.
     */
    function boxDePesos(itens, numeroDoPedido) {
        const setores = setoresDoPedido(itens);
        const pode = podeEditar();
        // Sem caminho nenhum: nem agente servindo a página, nem sessão do Vibe.
        const semCaminho = !pelaEstacao() && tela.temSessao === false;

        const cabecalho = `
            <div style="display: flex; align-items: center; gap: 10px; padding: 10px 14px;
                        background: ${AZUL.fundo}; border-bottom: 1px solid rgba(76,200,240,0.24);">
                <span style="font-size: 1.1rem;">⚖️</span>
                <strong style="font-size: 0.92rem; letter-spacing: 0.02em;">Peso por setor</strong>
                <span style="font-size: 0.74rem; color: var(--text-dim);">
                    Pedido ${esc(numeroDoPedido)} — um peso para cada setor dos produtos
                </span>
            </div>`;

        let miolo;
        if (!setores.length) {
            miolo = `<div style="padding: 14px; color: var(--text-dim); font-size: 0.84rem;">
                        Os produtos deste pedido não têm setor definido, então não há peso a
                        registrar. O setor vem do cadastro do produto no ERP.
                     </div>`;
        } else if (semCaminho) {
            miolo = `<div style="padding: 14px; color: var(--text-dim); font-size: 0.84rem; line-height: 1.5;">
                        <strong style="color: #4cc8f0;">Para registrar o peso, entre com a sua conta.</strong><br>
                        Esta tela está aberta com o acesso local da estação, e o peso é gravado na
                        ficha de expedição do ERP — que só aceita quem entrou com a conta do Vibe.
                        Abra o painel pelo site e faça login para preencher.
                        <div style="margin-top: 8px;">Setores deste pedido:
                            ${setores.map(s => esc((ROTULO_DO_SETOR[s] || {}).nome || s)).join(' · ')}
                        </div>
                     </div>`;
        } else {
            miolo = `<div style="padding: 12px 14px; display: flex; flex-wrap: wrap; gap: 12px;">
                ${setores.map(setor => {
                    const r = ROTULO_DO_SETOR[setor] || { nome: setor, icone: '📦' };
                    const atual = tela.pesos[setor];
                    const valor = pesoParaTexto(atual ? atual.peso : null);
                    return `
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1 1 240px;
                                background: rgba(76,200,240,0.07); border: 1px solid rgba(76,200,240,0.20);
                                border-radius: 8px; padding: 10px 12px;">
                        <span style="font-size: 1.05rem;">${r.icone}</span>
                        <strong style="min-width: 62px; font-size: 0.86rem;">${esc(r.nome)}</strong>
                        <input type="text" inputmode="decimal" id="acab-peso-${setor}"
                               value="${esc(valor)}" placeholder="0,00" ${pode ? '' : 'disabled'}
                               onchange="AcabamentoPainel.mudarPeso('${escJs(numeroDoPedido)}', '${setor}', this.value)"
                               title="${pode ? 'Peso real deste setor, em quilos' : 'Você tem apenas permissão de ver'}"
                               style="width: 92px; text-align: right; background: #0d0e20;
                                      border: 1px solid rgba(76,200,240,0.26); border-radius: 6px;
                                      color: #cfe6fb; padding: 6px 8px; font-size: 0.92rem;
                                      font-family: monospace; opacity: ${pode ? '1' : '0.5'};" />
                        <span style="font-size: 0.8rem; color: var(--text-dim);">kg</span>
                        <span id="acab-peso-sinal-${setor}" style="font-size: 0.74rem; min-width: 62px;
                              color: var(--text-dim);"></span>
                    </div>`;
                }).join('')}
            </div>`;
        }

        return `
            <div style="background: ${AZUL.superficie}; border: 1px solid ${AZUL.fio};
                        border-radius: 10px; overflow: hidden; margin-bottom: 14px;">
                ${cabecalho}
                <div style="display: flex; align-items: stretch; gap: 12px; flex-wrap: wrap;">
                    <div style="flex: 1 1 420px; min-width: 0;">${miolo}</div>
                    ${botaoDeExpedicao(itens, numeroDoPedido)}
                </div>
            </div>`;
    }

    /**
     * O botão EXPEDIÇÃO, à direita do peso.
     *
     * Ele NÃO fica escondido quando o pedido não está pronto, e isso é de
     * propósito: apagado e clicável, ele responde o que falta. Escondido, o
     * operador ficaria procurando um botão que a tela não mostra.
     */
    function botaoDeExpedicao(itens, numeroDoPedido) {
        const pronto = pedidoProntoParaExpedicao(itens);
        const pendentes = setoresPendentes(itens);
        const pode = podeEditar();

        const cor = pronto && pode
            ? `background: linear-gradient(135deg, ${'#4a61e8'}, ${'#120a8f'}); border-color: ${'#4cc8f0'}; color: #ffffff;`
            : `background: rgba(43,50,175,0.35); border-color: rgba(76,205,246,0.20); color: #7fa9d4;`;

        const explicacao = !pode
            ? 'Você tem apenas permissão de ver'
            : (pronto
                ? 'Mandar este pedido para a expedição'
                : 'Clique para ver o que ainda falta');

        const rodape = pronto
            ? `<span style="font-size: 0.72rem; color: ${'#4cc8f0'};">todos os modelos prontos</span>`
            : `<span style="font-size: 0.72rem; color: #7fa9d4;">${
                  pendentes.length === 1 ? '1 setor pendente' : `${pendentes.length} setores pendentes`
               }</span>`;

        return `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;
                        gap: 6px; padding: 12px 16px; border-left: 1px solid rgba(76,205,246,0.16);">
                <button type="button" id="acab-btn-expedicao"
                        onclick="AcabamentoPainel.expedir('${escJs(tela.pedidoAberto)}')"
                        title="${esc(explicacao)}"
                        style="${cor} border-width: 1px; border-style: solid; border-radius: 8px;
                               padding: 12px 22px; font-size: 0.95rem; font-weight: 800;
                               letter-spacing: 0.06em; cursor: pointer; white-space: nowrap;">
                    📦 EXPEDIÇÃO
                </button>
                ${rodape}
            </div>`;
    }

    // ─── A expedição ────────────────────────────────────────────────────────
    //
    // Pedido do usuário em 21/08/2026, no mesmo box do peso:
    //
    //  - um botão **EXPEDIÇÃO**, à direita, que só fica ativo quando TODOS os
    //    modelos de TODOS os setores do pedido estão em "Pronto";
    //  - clicado antes disso, ele diz QUAIS setores ainda têm modelo pendente;
    //  - e, à parte do botão, cada setor recebe **CONCLUIDO** em
    //    `propostas_os_setores.status_producao` assim que o último modelo dele
    //    fica pronto — mesmo com os outros setores ainda trabalhando.
    //
    // Quem decide se terminou é esta tela, que conhece os modelos. O servidor só
    // grava: é ele que conhece o `CHECK` da coluna e que não pisa no que o ERP
    // escreveu (ver `_compartilhado/pesos.ts`).

    const SETOR_SEM_NOME = '(sem setor)';

    /** Os modelos do pedido agrupados por setor, na ordem dos cards. */
    function modelosPorSetor(itens) {
        const grupos = {};
        (itens || []).forEach(i => {
            const s = normalizar(i && i.setor);
            const chave = SETORES_DO_BANCO.indexOf(s) !== -1 ? s : SETOR_SEM_NOME;
            (grupos[chave] = grupos[chave] || []).push(i);
        });
        const ordem = SETORES_DO_BANCO.filter(s => grupos[s]);
        if (grupos[SETOR_SEM_NOME]) ordem.push(SETOR_SEM_NOME);
        return ordem.map(setor => ({
            setor,
            modelos: grupos[setor],
            faltam: grupos[setor].filter(m => estagioDoModelo(m) !== 'Pronto').length,
        }));
    }

    /**
     * Os setores que ainda têm modelo fora do "Pronto".
     *
     * Modelo sem setor entra como "(sem setor)" em vez de ser ignorado: ele é
     * material do pedido do mesmo jeito, e um pedido que sai para a expedição
     * com um modelo pendente é o erro caro desta tela.
     */
    function setoresPendentes(itens) {
        return modelosPorSetor(itens).filter(g => g.faltam > 0);
    }

    function pedidoProntoParaExpedicao(itens) {
        return (itens || []).length > 0 && setoresPendentes(itens).length === 0;
    }

    /** O rótulo do setor como o operador o vê nos cards. */
    function nomeDoSetor(setor) {
        const r = ROTULO_DO_SETOR[setor];
        return r ? r.nome : setor;
    }

    /**
     * Põe (ou tira) o CONCLUIDO do setor daquele modelo, depois de uma gravação.
     *
     * Chamado do `gravar`, e só quando o campo mexido foi o estágio. Falha aqui
     * não desfaz a escolha do operador: o estágio já está gravado, e o carimbo é
     * consequência — por isso o erro vira aviso, e não desfaz nada.
     */
    async function sincronizarConclusaoDoSetor(osId, setorDoModelo) {
        const setor = normalizar(setorDoModelo);
        if (SETORES_DO_BANCO.indexOf(setor) === -1) return;

        const s = estado();
        const os = (s.ordens || []).find(o => String(o.id) === String(osId));
        if (!os) return;
        const idInt = parseInt(os.numero);
        if (isNaN(idInt)) return;

        const grupo = modelosPorSetor(modelosDoPedido(os)).find(g => g.setor === setor);
        if (!grupo) return;
        const concluido = grupo.faltam === 0;

        const jaEstava = ((tela.pesos[setor] || {}).producao || '') === 'CONCLUIDO';
        if (concluido === jaEstava) return;   // nada mudou: não incomoda o banco

        try {
            if (pelaEstacao()) {
                const res = await buscar(urlDoSetorConcluido(idInt), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ setor, concluido }),
                });
                if (!res.ok) throw new Error(await motivoDaResposta(res));
            } else {
                await concluirSetorDireto(idInt, setor, concluido);
            }
            const atual = tela.pesos[setor] || { peso: null, existe: false };
            atual.producao = concluido ? 'CONCLUIDO' : 'EM ACABAMENTO';
            tela.pesos[setor] = atual;
        } catch (e) {
            console.error('[acabamento] erro ao carimbar o setor:', e);
            avisar(`O estágio foi gravado, mas não deu para marcar o setor `
                 + `${nomeDoSetor(setor)} como concluído (${e && e.message ? e.message : e}).`,
                   'warning');
        }
    }

    /**
     * O carimbo do setor pelo caminho da nuvem.
     *
     * A regra de quando desfazer mora na Edge Function, e aqui ela é repetida
     * porque este caminho não passa por lá: só descarimba o que está EXATAMENTE
     * em CONCLUIDO, para não apagar o que o ERP escreveu.
     */
    async function concluirSetorDireto(idInt, setor, concluido) {
        if (!(await temSessaoDoSupabase())) {
            throw new Error('esta tela está sem sessão do Vibe');
        }
        const agora = new Date().toISOString();
        const consulta = supabaseClient.from(TABELA_DE_SETORES)
            .update({
                status_producao: concluido ? 'CONCLUIDO' : 'EM ACABAMENTO',
                status_producao_em: agora,
                updated_at: agora,
            })
            .eq('id_int', idInt).eq('setor', setor);
        const { error } = concluido ? await consulta : await consulta.eq('status_producao', 'CONCLUIDO');
        if (error) throw error;
    }

    /** O motivo que o servidor deu, ou o código HTTP quando não há corpo. */
    async function motivoDaResposta(res) {
        try {
            const corpo = await res.json();
            if (corpo && corpo.detail) return corpo.detail;
        } catch (ignorado) { /* resposta sem JSON */ }
        return `HTTP ${res.status}`;
    }

    function urlDoSetorConcluido(numeroDoPedido) {
        return urlDaEstacao('setor-concluido', numeroDoPedido);
    }

    function urlDaExpedicao(numeroDoPedido) {
        return urlDaEstacao('expedicao', numeroDoPedido);
    }

    /**
     * O clique no botão: abre o popup e PARA por aí.
     *
     * Pedido do usuário em 21/08/2026 — "deve abrir um popup em tela com as
     * informações e aguardar ok". Nada é gravado antes do OK, e é essa a razão
     * de o popup existir: expedir é irreversível pela tela do acabamento (o
     * pedido sai da fila e quem o traz de volta é o ERP).
     *
     * O popup atende os DOIS estados do botão. Pronto, ele mostra o resumo do
     * que vai embora — setor por setor, com peso — e espera o OK. Pendente, ele
     * mostra o que falta, e o único botão é o de fechar.
     */
    function mandarParaExpedicao(osId) {
        abrirPopupDaExpedicao(osId);
    }

    /**
     * O envio de verdade, depois do OK.
     *
     * A conferência é refeita AQUI, e não só no `disabled` do botão nem no
     * popup: quem digitar a função no console passaria direto pelos dois, e o
     * preço seria um pedido saindo da gráfica com modelo pendente.
     */
    async function confirmarExpedicao(osId) {
        const s = estado();
        const os = (s.ordens || []).find(o => String(o.id) === String(osId));
        if (!os) return;
        const itens = modelosDoPedido(os);
        const idInt = parseInt(os.numero);

        const pendentes = setoresPendentes(itens);
        if (pendentes.length || !itens.length) {
            avisar(textoDoQueFalta(pendentes, itens), 'warning');
            fecharPopupDaExpedicao();
            return;
        }
        if (!podeEditar()) {
            avisar('Você tem apenas permissão de ver. Peça a quem edita o acabamento.', 'warning');
            fecharPopupDaExpedicao();
            return;
        }

        const botao = document.getElementById('acab-expedicao-ok');
        if (botao) { botao.disabled = true; botao.textContent = 'Enviando…'; }

        try {
            if (pelaEstacao()) {
                const res = await buscar(urlDaExpedicao(idInt), { method: 'POST' });
                if (!res.ok) throw new Error(await motivoDaResposta(res));
            } else {
                if (!(await temSessaoDoSupabase())) {
                    throw new Error('esta tela está sem sessão do Vibe');
                }
                const { error } = await supabaseClient.from('propostas')
                    .update({ status_interno: 'EXPEDICAO' })
                    .eq('id_int', idInt);
                if (error) throw error;
            }

            // A tela anda junto: o pedido some da fila do acabamento, que é o
            // recorte de quem está EM PRODUÇÃO.
            os.status_interno = 'EXPEDICAO';
            os.status = 'EXPEDICAO';
            fecharPopupDaExpedicao();
            avisar(`Pedido ${esc(os.numero)} enviado para EXPEDIÇÃO. 📦`, 'success');
            AcabamentoPainel.fecharPedido();
        } catch (e) {
            console.error('[acabamento] erro ao mandar para expedição:', e);
            // O popup FICA aberto: o operador precisa ver o motivo e poder
            // tentar de novo sem reabrir tudo.
            const recado = document.getElementById('acab-expedicao-recado');
            if (recado) {
                recado.innerHTML = `<span style="color: #f87171;">Não deu para enviar: `
                    + `${esc(e && e.message ? e.message : e)}</span>`;
            }
            if (botao) { botao.disabled = false; botao.textContent = 'OK — ENVIAR'; }
            avisar(`Não deu para mandar o pedido para a expedição `
                 + `(${e && e.message ? e.message : e}).`, 'error');
        }
    }


    // ─── O popup da expedição ───────────────────────────────────────────────
    //
    // "Ao clicar em EXPEDIÇÃO deve abrir um popup em tela com as informações e
    // aguardar ok" — pedido do usuário em 21/08/2026.
    //
    // Ele existe porque expedir não tem volta por esta tela: o pedido sai da
    // fila do Acabamento e quem o traz de volta é o ERP. Um clique sem
    // confirmação, num botão grande ao lado de campos que o operador está
    // digitando, é o tipo de acidente que só se descobre depois.

    function montarPopupDaExpedicao() {
        let caixa = document.getElementById('acab-expedicao');
        if (caixa) return caixa;

        caixa = document.createElement('div');
        caixa.id = 'acab-expedicao';
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100002; display: none;'
            + ' align-items: center; justify-content: center; background: rgba(6,7,13,0.92); padding: 18px;';
        caixa.innerHTML = `
            <div style="width: min(680px, 96vw); background: ${AZUL.fundo};
                        border: 1px solid rgba(76,200,240,0.28); border-radius: 12px;
                        display: flex; flex-direction: column; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px;
                            background: ${'#120a8f'}; border-bottom: 1px solid rgba(76,200,240,0.24);">
                    <span style="font-size: 1.2rem;">📦</span>
                    <strong id="acab-expedicao-titulo" style="font-size: 1.05rem; color: #ffffff;"></strong>
                    <button type="button" id="acab-expedicao-fechar"
                            style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px;
                                   font-weight: 700; cursor: pointer;">✕</button>
                </div>

                <div id="acab-expedicao-corpo" style="padding: 16px 18px; color: #cfe6fb;
                                                      font-size: 0.9rem; line-height: 1.55;
                                                      max-height: 62vh; overflow-y: auto;"></div>

                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px;
                            border-top: 1px solid rgba(76,200,240,0.18); flex-wrap: wrap;">
                    <span id="acab-expedicao-recado" style="font-size: 0.8rem; color: #7fa9d4;"></span>
                    <div style="margin-left: auto; display: flex; gap: 10px;">
                        <button type="button" id="acab-expedicao-cancelar"
                                style="background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);
                                       color: #cfe6fb; border-radius: 8px; padding: 10px 18px;
                                       font-weight: 700; cursor: pointer;">Cancelar</button>
                        <button type="button" id="acab-expedicao-ok"
                                style="background: linear-gradient(135deg, ${'#4a61e8'}, ${'#120a8f'});
                                       border: 1px solid ${'#4cc8f0'}; color: #ffffff; border-radius: 8px;
                                       padding: 10px 22px; font-weight: 800; letter-spacing: 0.05em;
                                       cursor: pointer;">OK — ENVIAR</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(caixa);

        const fechar = () => fecharPopupDaExpedicao();
        const btnX = document.getElementById('acab-expedicao-fechar');
        const btnCancelar = document.getElementById('acab-expedicao-cancelar');
        const btnOk = document.getElementById('acab-expedicao-ok');
        if (btnX) btnX.addEventListener('click', fechar);
        if (btnCancelar) btnCancelar.addEventListener('click', fechar);
        if (btnOk) btnOk.addEventListener('click', () => confirmarExpedicao(tela.pedidoAberto));
        return caixa;
    }

    function fecharPopupDaExpedicao() {
        const caixa = document.getElementById('acab-expedicao');
        if (caixa) caixa.style.display = 'none';
    }

    /** O peso digitado de um setor, para o resumo. */
    function pesoDoSetor(setor) {
        const linha = tela.pesos[setor];
        return linha && linha.peso !== null && linha.peso !== undefined ? linha.peso : null;
    }

    /**
     * Abre o popup com o resumo do pedido.
     *
     * Dois conteúdos, um para cada estado do botão — e é de propósito que o
     * estado PENDENTE também abra o popup, em vez de um aviso que some sozinho:
     * a lista do que falta é a informação que o operador vai usar, e ela não
     * pode desaparecer enquanto ele lê.
     */
    function abrirPopupDaExpedicao(osId) {
        const s = estado();
        const os = (s.ordens || []).find(o => String(o.id) === String(osId));
        if (!os) return;

        const itens = modelosDoPedido(os);
        const grupos = modelosPorSetor(itens);
        const pendentes = setoresPendentes(itens);
        const pronto = pedidoProntoParaExpedicao(itens);
        const pode = podeEditar();

        montarPopupDaExpedicao();

        const titulo = document.getElementById('acab-expedicao-titulo');
        const corpo = document.getElementById('acab-expedicao-corpo');
        const recado = document.getElementById('acab-expedicao-recado');
        const btnOk = document.getElementById('acab-expedicao-ok');
        const btnCancelar = document.getElementById('acab-expedicao-cancelar');

        const cliente = (fn('rotuloDoCliente') ? fn('rotuloDoCliente')(os) : os.cliente) || '';
        const cabeca = `<div style="margin-bottom: 12px; font-size: 0.95rem;">
                <strong style="color: #ffffff;">Pedido ${esc(os.numero)}</strong>
                ${cliente ? `<span style="color: ${'#4cc8f0'};"> — ${esc(cliente)}</span>` : ''}
            </div>`;

        const linhas = grupos.map(g => {
            const peso = pesoDoSetor(g.setor);
            const faltando = g.faltam > 0;
            return `
                <tr>
                    <td style="padding: 7px 10px; border-bottom: 1px solid rgba(76,200,240,0.14);">
                        ${esc(nomeDoSetor(g.setor))}
                    </td>
                    <td style="padding: 7px 10px; border-bottom: 1px solid rgba(76,200,240,0.14); text-align: right;">
                        ${g.modelos.length}
                    </td>
                    <td style="padding: 7px 10px; border-bottom: 1px solid rgba(76,200,240,0.14); text-align: right;
                               font-family: monospace;">
                        ${peso === null ? '<span style="color:#7fa9d4;">—</span>' : esc(pesoParaTexto(peso)) + ' kg'}
                    </td>
                    <td style="padding: 7px 10px; border-bottom: 1px solid rgba(76,200,240,0.14); text-align: right;">
                        ${faltando
                            ? `<span style="color: #fbbf24;">faltam ${g.faltam}</span>`
                            : `<span style="color: #4ade80;">pronto</span>`}
                    </td>
                </tr>`;
        }).join('');

        const tabela = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem;">
                <thead>
                    <tr style="color: ${'#4cc8f0'}; text-align: left; font-size: 0.72rem;
                               text-transform: uppercase; letter-spacing: 0.06em;">
                        <th style="padding: 0 10px 6px;">Setor</th>
                        <th style="padding: 0 10px 6px; text-align: right;">Modelos</th>
                        <th style="padding: 0 10px 6px; text-align: right;">Peso</th>
                        <th style="padding: 0 10px 6px; text-align: right;">Estado</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>`;

        if (pronto && pode) {
            const semPeso = grupos.filter(g => pesoDoSetor(g.setor) === null);
            const aviso = semPeso.length
                ? `<div style="margin-top: 12px; padding: 10px 12px; border-radius: 8px;
                               background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.35);
                               color: #fbbf24; font-size: 0.84rem;">
                       Sem peso digitado em ${semPeso.map(g => esc(nomeDoSetor(g.setor))).join(', ')}.
                       Dá para enviar assim, mas a ficha de expedição vai sem esse número.
                   </div>`
                : '';
            if (titulo) titulo.textContent = 'Enviar para a expedição';
            if (corpo) {
                corpo.innerHTML = cabeca + tabela + aviso
                    + `<div style="margin-top: 14px; font-size: 0.86rem;">
                           Ao confirmar, o pedido passa para <strong>EXPEDIÇÃO</strong> no ERP e
                           sai da fila do Acabamento. Trazer de volta é pelo ERP.
                       </div>`;
            }
            if (btnOk) { btnOk.style.display = ''; btnOk.disabled = false; btnOk.textContent = 'OK — ENVIAR'; }
            if (btnCancelar) btnCancelar.textContent = 'Cancelar';
            if (recado) recado.textContent = '';
        } else {
            if (titulo) {
                titulo.textContent = pode ? 'Ainda não dá para expedir' : 'Somente leitura';
            }
            const motivo = !pode
                ? `<div style="margin-top: 12px;">Você tem apenas permissão de ver.
                       Quem edita o acabamento é quem envia.</div>`
                : `<div style="margin-top: 12px; padding: 10px 12px; border-radius: 8px;
                               background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.35);
                               color: #fbbf24; font-size: 0.86rem;">
                       ${esc(textoDoQueFalta(pendentes, itens))}
                   </div>`;
            if (corpo) corpo.innerHTML = cabeca + tabela + motivo;
            if (btnOk) btnOk.style.display = 'none';
            if (btnCancelar) btnCancelar.textContent = 'Entendi';
            if (recado) recado.textContent = '';
        }

        const caixa = document.getElementById('acab-expedicao');
        if (caixa) caixa.style.display = 'flex';
    }

    /** O que dizer a quem clicou cedo demais. */
    function textoDoQueFalta(pendentes, itens) {
        if (!itens || !itens.length) {
            return 'Este pedido não tem modelo nenhum para conferir.';
        }
        const lista = pendentes.map(g => {
            const quantos = g.faltam === 1 ? '1 modelo' : `${g.faltam} modelos`;
            return `${nomeDoSetor(g.setor)} (${quantos})`;
        }).join(', ');
        return `Ainda não dá para expedir: falta terminar ${lista}. `
             + 'Um pedido só vai para a expedição com todos os modelos em "Pronto".';
    }

    // ─── Gravação ───────────────────────────────────────────────────────────

    /**
     * Grava um dos dois campos do acabamento no modelo.
     *
     * Mesmo caminho que o painel já usa para o `status_impressao`: `update`
     * direto na tabela `pedidos_modelos`, pelo id. O id pode ser numérico ou
     * texto conforme a origem da linha, e a comparação errada devolve zero
     * linhas em silêncio — por isso a distinção abaixo.
     */
    // Que chave do mapa da lista corresponde a cada coluna do banco.
    const CAMPO_NO_MAPA = {
        acabamento_status: 'status',
        acabamento_responsavel: 'responsavel',
        acabamento_foto_url: 'foto',
    };
    const NOME_DO_CAMPO = {
        acabamento_status: 'o status',
        acabamento_responsavel: 'o responsável',
        acabamento_foto_url: 'a foto',
    };

    async function gravar(itemId, osId, campo, valor) {
        const s = estado();
        const limpo = (valor || '').trim() || null;

        // A tela anda na frente do banco de propósito: o operador não pode
        // esperar a rede para ver a própria escolha. Se a gravação falhar, o
        // aviso aparece e a lista é redesenhada a partir do banco na próxima
        // atualização.
        const itens = (s.osItens && s.osItens[osId]) || [];
        const item = itens.find(i => String(i.id) === String(itemId));
        if (item) item[campo] = limpo;

        // O mapa da lista anda junto: sem isto, voltar para a lista mostraria o
        // estágio anterior até a próxima leitura do banco.
        const noMapa = tela.acabamento[String(itemId)] || { status: '', responsavel: '', foto: '' };
        noMapa[CAMPO_NO_MAPA[campo] || campo] = limpo || '';
        tela.acabamento[String(itemId)] = noMapa;

        const num = parseInt(String(osId).replace('vibe_', ''));
        if (s.modelosGlobais && s.modelosGlobais[num]) {
            const global = s.modelosGlobais[num].find(m => String(m.id) === String(itemId));
            if (global) global[campo] = limpo;
        }

        renderDetalhe();
        render();

        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                throw new Error('sem conexão com o banco');
            }
            const ehNumero = /^\d+$/.test(String(itemId).trim());
            let consulta = supabaseClient.from('pedidos_modelos').update({ [campo]: limpo });
            consulta = ehNumero
                ? consulta.eq('id', parseInt(itemId, 10))
                : consulta.eq('id', itemId);
            const { error } = await consulta;
            if (error) throw error;

            // O estágio mudou: o setor daquele modelo pode ter acabado de
            // terminar (ou de deixar de estar terminado).
            if (campo === 'acabamento_status') {
                await sincronizarConclusaoDoSetor(osId, item ? item.setor : '');
                renderDetalhe();
            }
        } catch (e) {
            console.error(`[acabamento] erro ao gravar ${campo}:`, e);
            const aviso = fn('toast');
            if (aviso) {
                aviso(`Não deu para gravar ${NOME_DO_CAMPO[campo] || campo} `
                    + `deste modelo (${e && e.message ? e.message : e}). Tente de novo.`, 'error');
            }
        }
    }

    // ─── A foto do material ─────────────────────────────────────────────────
    //
    // Pedido do usuário em 20/08/2026: uma câmera em cada modelo, que abre a
    // webcam da estação, tira a foto e guarda no bucket. É o registro do que o
    // revisor viu — a amostra aprovada de um lado, o papel que saiu do outro.

    const BUCKET_DA_FOTO = 'artes';
    const PASTA_DA_FOTO = 'acabamento-fotos';

    // Lado maior da foto guardada. 1600 px chega para ler tipografia miúda numa
    // credencial e mantém o arquivo em algumas centenas de KB — a estação sobe
    // isso pela internet da gráfica sem o operador esperar na frente da tela.
    const LADO_MAXIMO = 1600;

    function faixaDaFoto(item, osId, idx) {
        const foto = fotoDoModelo(item);
        const idFoto = `acab-foto-${escJs(osId)}-${escJs(item.id)}-${idx}`;
        const pode = podeEditar();

        const botao = `
            <button type="button" ${pode ? '' : 'disabled'}
                    onclick="AcabamentoPainel.abrirCamera('${escJs(item.id)}', '${escJs(osId)}')"
                    title="${pode ? 'Abrir a câmera e fotografar o material' : 'Você tem apenas permissão de ver'}"
                    style="display: inline-flex; align-items: center; gap: 8px; background: rgba(69,137,215,0.16);
                           border: 1px solid rgba(69,137,215,0.50); color: #4cc8f0; border-radius: 8px;
                           padding: 8px 14px; font-size: 0.9rem; font-weight: 700;
                           cursor: ${pode ? 'pointer' : 'not-allowed'}; opacity: ${pode ? '1' : '0.5'};">
                <span style="font-size: 1.15rem;">📷</span> ${foto ? 'Refazer foto' : 'Fotografar'}
            </button>`;

        const miniatura = foto
            ? `<img id="${idFoto}" src="${esc(foto)}" alt="Foto do acabamento"
                    onclick="AcabamentoPainel.ampliar('${idFoto}')"
                    title="Foto do material — clique para ampliar"
                    style="height: 74px; object-fit: contain; cursor: zoom-in; display: block;" />`
            : `<span style="font-size: 0.76rem; color: var(--text-dim);">Nenhuma foto do material ainda.</span>`;

        return `
            <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
                        border-top: 1px dashed rgba(255,255,255,0.18); padding-top: 12px;">
                <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; width: 100%;">Foto do material</span>
                ${botao}
                ${miniatura}
            </div>`;
    }

    // ─── A câmera ───────────────────────────────────────────────────────────
    //
    // ## Duas coisas que mordem, e o que fazemos com elas
    //
    // 1. **A webcam só abre em contexto seguro.** `https://…` e `127.0.0.1`
    //    valem; o painel servido por IP da LAN em `http://` NÃO vale, e o
    //    navegador nem pergunta — `navigator.mediaDevices` simplesmente não
    //    existe. Sem tratar isso, o botão viraria um botão que não faz nada.
    //
    // 2. **A câmera pede permissão**, uma vez por navegador e endereço. Se
    //    alguém negar, não há como pedir de novo por código.
    //
    // Para os dois casos existe a mesma saída, e ela NÃO depende de configurar
    // navegador nenhum: escolher um arquivo. No celular isso abre a câmera do
    // aparelho; no computador, o seletor de arquivos. A foto entra pelo mesmo
    // caminho e vai para o mesmo lugar.

    const camera = { fluxo: null, itemId: null, osId: null, blob: null, urlPrevia: '' };

    function montarCamera() {
        let caixa = document.getElementById('acab-camera');
        if (caixa) return caixa;

        caixa = document.createElement('div');
        caixa.id = 'acab-camera';
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100001; display: none;'
            + ' align-items: center; justify-content: center; background: rgba(2,6,23,0.94); padding: 18px;';
        caixa.innerHTML = `
            <div style="width: min(920px, 96vw); background: ${AZUL.fundo}; border: 1px solid rgba(76,200,240,0.24);
                        border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <strong style="font-size: 1.05rem; color: #ffffff;">📷 Foto do material</strong>
                    <span id="acab-camera-modelo" style="color: #94a3b8; font-size: 0.88rem;"></span>
                    <button type="button" id="acab-camera-fechar"
                            style="margin-left: auto; background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.35);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px; font-weight: 700; cursor: pointer;">✕ Fechar</button>
                </div>

                <div style="background: #000000; border-radius: 8px; overflow: hidden; min-height: 240px;
                            display: flex; align-items: center; justify-content: center;">
                    <video id="acab-camera-video" autoplay playsinline muted
                           style="width: 100%; max-height: 58vh; object-fit: contain; display: none;"></video>
                    <img id="acab-camera-previa" alt="Prévia da foto"
                         style="width: 100%; max-height: 58vh; object-fit: contain; display: none;" />
                    <div id="acab-camera-recado" style="color: #cbd5e1; font-size: 0.9rem; text-align: center; padding: 24px; line-height: 1.5;"></div>
                </div>

                <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                    <button type="button" id="acab-camera-tirar" style="${ESTILO_BOTAO_CAMERA}; display: none;">📸 Fotografar</button>
                    <button type="button" id="acab-camera-repetir" style="${ESTILO_BOTAO_CAMERA_FRACO}; display: none;">↺ Repetir</button>
                    <button type="button" id="acab-camera-salvar" style="${ESTILO_BOTAO_CAMERA_OK}; display: none;">💾 Salvar foto</button>

                    <label id="acab-camera-arquivo-rotulo" style="${ESTILO_BOTAO_CAMERA_FRACO}; margin: 0;">
                        🗂️ Escolher arquivo
                        <input type="file" id="acab-camera-arquivo" accept="image/*" capture="environment" style="display: none;" />
                    </label>
                    <span id="acab-camera-estado" style="color: #94a3b8; font-size: 0.85rem; margin-left: auto;"></span>
                </div>
            </div>`;
        document.body.appendChild(caixa);

        document.getElementById('acab-camera-fechar').onclick = fecharCamera;
        document.getElementById('acab-camera-tirar').onclick = fotografar;
        document.getElementById('acab-camera-repetir').onclick = repetirFoto;
        document.getElementById('acab-camera-salvar').onclick = salvarFoto;
        document.getElementById('acab-camera-arquivo').onchange = escolherArquivo;
        // Clique NO FUNDO fecha; clique dentro da caixa não. Sem esta distinção,
        // apertar "Fotografar" fecharia a janela junto.
        caixa.onclick = ev => { if (ev.target === caixa) fecharCamera(); };
        document.addEventListener('keydown', ev => {
            if (ev.key === 'Escape' && caixa.style.display === 'flex') fecharCamera();
        });
        return caixa;
    }

    function mostrarBotoesDaCamera(quais) {
        [['acab-camera-tirar', 'tirar'], ['acab-camera-repetir', 'repetir'],
         ['acab-camera-salvar', 'salvar']].forEach(([id, chave]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = quais.indexOf(chave) !== -1 ? 'inline-flex' : 'none';
        });
    }

    function recadoDaCamera(texto) {
        const el = document.getElementById('acab-camera-recado');
        if (el) {
            el.innerHTML = texto || '';
            el.style.display = texto ? 'block' : 'none';
        }
    }

    function estadoDaCamera(texto) {
        const el = document.getElementById('acab-camera-estado');
        if (el) el.textContent = texto || '';
    }

    async function abrirCamera(itemId, osId) {
        if (!podeEditar()) return;

        camera.itemId = itemId;
        camera.osId = osId;
        camera.blob = null;

        const caixa = montarCamera();
        caixa.style.display = 'flex';
        estadoDaCamera('');

        const s = estado();
        const item = ((s.osItens && s.osItens[osId]) || []).find(i => String(i.id) === String(itemId));
        const rotulo = document.getElementById('acab-camera-modelo');
        if (rotulo) rotulo.textContent = item ? (item.produto || item.nome_modelo || '') : '';

        const video = document.getElementById('acab-camera-video');
        const previa = document.getElementById('acab-camera-previa');
        previa.style.display = 'none';
        video.style.display = 'none';
        mostrarBotoesDaCamera([]);
        recadoDaCamera('Abrindo a câmera…');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            // Quase sempre isto: painel aberto por um endereço `http://` que não
            // é `localhost`. A saída está escrita na tela, e não numa
            // configuração do navegador.
            recadoDaCamera('Este navegador não abre a câmera neste endereço.<br>'
                + 'A câmera exige um endereço <strong>https</strong> ou a própria estação '
                + '(<strong>127.0.0.1</strong>).<br><br>'
                + 'Use <strong>Escolher arquivo</strong> aqui embaixo — no celular ele abre a câmera do aparelho.');
            return;
        }

        try {
            camera.fluxo = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
            video.srcObject = camera.fluxo;
            await video.play();
            recadoDaCamera('');
            video.style.display = 'block';
            mostrarBotoesDaCamera(['tirar']);
        } catch (e) {
            console.warn('[acabamento] câmera não abriu:', e);
            const nome = e && e.name ? e.name : '';
            const motivo = nome === 'NotAllowedError'
                ? 'A câmera está bloqueada para este endereço.'
                : (nome === 'NotFoundError' || nome === 'OverconstrainedError'
                    ? 'Nenhuma câmera foi encontrada nesta máquina.'
                    : 'Não deu para abrir a câmera.');
            recadoDaCamera(motivo + '<br><br>Use <strong>Escolher arquivo</strong> aqui embaixo — '
                + 'a foto entra pelo mesmo caminho.');
        }
    }

    function desligarCamera() {
        const video = document.getElementById('acab-camera-video');
        if (video) { video.srcObject = null; video.style.display = 'none'; }
        if (camera.fluxo) {
            camera.fluxo.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
            camera.fluxo = null;
        }
    }

    function fecharCamera() {
        desligarCamera();
        if (camera.urlPrevia) {
            try { URL.revokeObjectURL(camera.urlPrevia); } catch (e) {}
            camera.urlPrevia = '';
        }
        camera.blob = null;
        camera.itemId = null;
        camera.osId = null;
        const caixa = document.getElementById('acab-camera');
        if (caixa) caixa.style.display = 'none';
    }

    /** Encolhe para o lado máximo e devolve um JPEG. */
    function paraJpeg(fonte, larguraNatural, alturaNatural) {
        const maior = Math.max(larguraNatural, alturaNatural) || 1;
        const escala = maior > LADO_MAXIMO ? LADO_MAXIMO / maior : 1;
        const tela2d = document.createElement('canvas');
        tela2d.width = Math.round(larguraNatural * escala);
        tela2d.height = Math.round(alturaNatural * escala);
        tela2d.getContext('2d').drawImage(fonte, 0, 0, tela2d.width, tela2d.height);
        return new Promise(resolve => tela2d.toBlob(resolve, 'image/jpeg', 0.85));
    }

    function mostrarPrevia(blob) {
        camera.blob = blob;
        if (camera.urlPrevia) { try { URL.revokeObjectURL(camera.urlPrevia); } catch (e) {} }
        camera.urlPrevia = URL.createObjectURL(blob);
        const previa = document.getElementById('acab-camera-previa');
        previa.src = camera.urlPrevia;
        previa.style.display = 'block';
        const video = document.getElementById('acab-camera-video');
        if (video) video.style.display = 'none';
        recadoDaCamera('');
        mostrarBotoesDaCamera(['repetir', 'salvar']);
        estadoDaCamera(`${Math.round(blob.size / 1024)} KB`);
    }

    async function fotografar() {
        const video = document.getElementById('acab-camera-video');
        if (!video || !video.videoWidth) return;
        const blob = await paraJpeg(video, video.videoWidth, video.videoHeight);
        if (!blob) return;
        // A câmera é desligada assim que a foto existe: deixar a luz da webcam
        // acesa enquanto o operador decide se salva é desconfortável, e não
        // serve para nada — repetir religa.
        desligarCamera();
        mostrarPrevia(blob);
    }

    function repetirFoto() {
        const previa = document.getElementById('acab-camera-previa');
        if (previa) previa.style.display = 'none';
        camera.blob = null;
        estadoDaCamera('');
        abrirCamera(camera.itemId, camera.osId);
    }

    function escolherArquivo(ev) {
        const arquivo = ev.target && ev.target.files && ev.target.files[0];
        ev.target.value = '';   // escolher o MESMO arquivo de novo tem de disparar
        if (!arquivo) return;
        const img = new Image();
        img.onload = async () => {
            const blob = await paraJpeg(img, img.naturalWidth, img.naturalHeight);
            URL.revokeObjectURL(img.src);
            if (blob) { desligarCamera(); mostrarPrevia(blob); }
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            recadoDaCamera('Este arquivo não é uma imagem que o navegador consiga abrir.');
        };
        img.src = URL.createObjectURL(arquivo);
    }

    async function salvarFoto() {
        if (!camera.blob || !camera.itemId) return;
        const itemId = camera.itemId;
        const osId = camera.osId;

        estadoDaCamera('Enviando…');
        mostrarBotoesDaCamera([]);

        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                throw new Error('sem conexão com o banco');
            }
            const buscar = fn('findOSInState');
            const os = buscar ? buscar(osId) : null;
            const pedido = os ? os.numero : 'sem-pedido';
            // Nome novo a cada foto: o anterior fica no bucket. Sobrescrever
            // seria mais limpo e mais arriscado — duas estações revisando o
            // mesmo pedido apagariam a foto uma da outra.
            const caminho = `${PASTA_DA_FOTO}/${pedido}_${itemId}_${Date.now()}.jpg`;

            const { error: erroUpload } = await supabaseClient.storage
                .from(BUCKET_DA_FOTO)
                .upload(caminho, camera.blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
            if (erroUpload) throw erroUpload;

            const { data } = supabaseClient.storage.from(BUCKET_DA_FOTO).getPublicUrl(caminho);
            const url = data && data.publicUrl;
            if (!url) throw new Error('o Storage não devolveu o endereço da foto');

            await gravar(itemId, osId, 'acabamento_foto_url', url);
            fecharCamera();
            const aviso = fn('toast');
            if (aviso) aviso('Foto do material guardada.', 'success');
        } catch (e) {
            console.error('[acabamento] falha ao guardar a foto:', e);
            estadoDaCamera('');
            mostrarBotoesDaCamera(['repetir', 'salvar']);
            recadoDaCamera('Não deu para guardar a foto: ' + esc(e && e.message ? e.message : String(e))
                + '<br>A foto continua aqui — tente Salvar de novo.');
        }
    }

    // ─── Lightbox próprio ───────────────────────────────────────────────────
    //
    // O `openClienteLightbox` mora no `cliente.js`, que o painel da gráfica não
    // carrega — chamá-lo daqui seria um clique que não faz nada. São vinte
    // linhas, e a ampliação é justamente o que faz a amostra servir para
    // conferir a impressão.

    function ampliar(idImagem) {
        const img = document.getElementById(idImagem);
        if (!img || !img.src) return;

        let overlay = document.getElementById('acab-lightbox');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'acab-lightbox';
            overlay.style.cssText = 'position: fixed; inset: 0; z-index: 100000; display: none;'
                + ' align-items: center; justify-content: center; background: rgba(2, 6, 23, 0.92);'
                + ' padding: 24px; cursor: zoom-out;';
            overlay.innerHTML = `
                <img id="acab-lightbox-img" alt="Amostra ampliada"
                     style="width: 90vw; height: 84vh; object-fit: contain;" />
                <button type="button" title="Fechar (Esc)"
                        style="position: absolute; top: 14px; right: 18px; z-index: 1; background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.35); color: #ffffff; border-radius: 8px; padding: 6px 14px; font-size: 1rem; font-weight: 700; cursor: pointer;">✕ Fechar</button>`;
            overlay.addEventListener('click', fecharLightbox);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', ev => {
                if (ev.key === 'Escape') fecharLightbox();
            });
        }
        const alvo = document.getElementById('acab-lightbox-img');
        if (alvo) alvo.src = img.src;
        overlay.style.display = 'flex';
    }

    function fecharLightbox() {
        const overlay = document.getElementById('acab-lightbox');
        if (overlay) overlay.style.display = 'none';
    }

    // ─── O que a tela oferece ao HTML ───────────────────────────────────────

    const AcabamentoPainel = {
        render,

        setFiltroPrazo(valor) {
            tela.prazo = ['hoje', 'atrasados', 'prontos'].includes(valor) ? valor : 'geral';
            render();
        },

        /**
         * Liga ou desliga um setor. Desde 21/08/2026 os cards SOMAM: clicar num
         * segundo setor não troca o primeiro, acrescenta — pedido do usuário,
         * na mesma leva do Painel de Produção. Clicar de novo num card aceso
         * tira aquele setor; `setFiltroSetor('')` limpa tudo.
         */
        setFiltroSetor(valor) {
            if (!valor) {
                tela.setores = [];
            } else {
                const i = tela.setores.indexOf(valor);
                if (i === -1) tela.setores.push(valor);
                else tela.setores.splice(i, 1);
            }
            render();
        },

        setFiltroStatus(valor) {
            tela.estagio = valor || '';
            render();
        },

        setSort(campo) {
            if (!COLUNAS[campo]) return;
            const atual = tela.sort;
            tela.sort = (atual && atual.campo === campo)
                ? { campo, dir: atual.dir === 'asc' ? 'desc' : 'asc' }
                : { campo, dir: COLUNAS[campo].dirInicial };
            render();
        },

        /** Volta ao padrão e recarrega a lista. Não fala com o agente local. */
        atualizar() {
            tela.sort = null;
            tela.prazo = 'geral';
            tela.setores = [];
            tela.estagio = '';
            tela.operadores = null;
            carregarOperadores().then(() => { if (tela.pedidoAberto) renderDetalhe(); });
            tela.encerradosTeste = new Set();
            Promise.all([carregarEncerradosComoTeste(), carregarAcabamentoDosModelos()])
                .then(() => render());
            const carregar = fn('loadOrdens');
            return carregar ? carregar() : Promise.resolve(render());
        },

        async abrirPedido(osId) {
            tela.pedidoAberto = osId;
            tela.carregandoPedido = true;
            tela.pesos = {};
            tela.pesosDoPedido = null;
            mostrarLista();
            renderDetalhe();
            try {
                await carregarOperadores();
                const carregar = fn('loadOSItens');
                if (carregar) await carregar(osId);
            } finally {
                tela.carregandoPedido = false;
            }
            renderDetalhe();
            render();

            // O peso vem DEPOIS do desenho, de propósito: ele é do parceiro e
            // pode demorar ou nem responder, e o pedido não espera por ele.
            const os = (estado().ordens || []).find(o => String(o.id) === String(osId));
            if (os) {
                await carregarPesos(os.numero);
                renderDetalhe();
            }
        },

        fecharPedido() {
            fecharCamera();
            fecharPopupDaExpedicao();
            tela.pedidoAberto = null;
            mostrarLista();
            render();
        },

        mudarEstagio(itemId, osId, valor) {
            return gravar(itemId, osId, 'acabamento_status', valor);
        },

        mudarPeso(numeroDoPedido, setor, valor) {
            return gravarPeso(numeroDoPedido, setor, valor);
        },

        expedir(osId) {
            return mandarParaExpedicao(osId);
        },

        /** O OK do popup. Só ele grava. */
        confirmarExpedicao(osId) {
            return confirmarExpedicao(osId || tela.pedidoAberto);
        },

        fecharPopupDaExpedicao,

        mudarResponsavel(itemId, osId, valor) {
            return gravar(itemId, osId, 'acabamento_responsavel', valor);
        },

        ampliar,

        abrirCamera,
        fecharCamera,

        /** Chamado quando a tela é aberta pelo menu. */
        aoAbrir() {
            // Clicar no menu volta para o começo: a lista, nunca o detalhe de um
            // pedido aberto numa visita anterior. Sem isto o operador reencontrava
            // a tela do pedido 123 sem topo, sem filtros e sem lista, e tinha de
            // achar o VOLTAR para chegar onde o menu prometia levá-lo.
            fecharCamera();
            fecharPopupDaExpedicao();
            tela.pedidoAberto = null;
            mostrarLista();
            carregarOperadores().then(() => { if (tela.pedidoAberto) renderDetalhe(); });
            Promise.all([carregarEncerradosComoTeste(), carregarAcabamentoDosModelos()])
                .then(() => render());
            const carregar = fn('loadOrdens');
            if (carregar) carregar();
            render();
        },

        // Para os testes: dá acesso às regras puras sem precisar de uma tela.
        _regras: {
            ehDeProducao,
            setoresDoPedido,
            pesoDoTexto,
            pesoParaTexto,
            pelaEstacao,
            urlDoPeso,
            urlDaEstacao,
            modelosPorSetor,
            setoresPendentes,
            pedidoProntoParaExpedicao,
            textoDoQueFalta,
            encerradosTeste: tela.encerradosTeste,
            estagioDoModelo,
            estagioDerivadoDaImpressao,
            responsavelDoModelo,
            fotoDoModelo,
            BUCKET_DA_FOTO,
            PASTA_DA_FOTO,
            estagioDoPedido,
            amostraDoModelo,
            ehPdf,
            valorDeOrdenacao,
            ESTAGIOS,
        },
    };

    window.AcabamentoPainel = AcabamentoPainel;

    // ─── Embrulhos: nada do que já existe é reescrito ────────────────────────

    (function embrulharRenderOrdens() {
        const original = window.renderOrdens;
        if (typeof original !== 'function') return;
        window.renderOrdens = function () {
            const r = original.apply(this, arguments);
            try {
                render();
                if (tela.pedidoAberto) renderDetalhe();
            } catch (e) {
                console.warn('[acabamento] falha ao desenhar a tela:', e);
            }
            return r;
        };
    })();

    (function embrulharShowView() {
        const original = window.showView;
        if (typeof original !== 'function') return;
        window.showView = function (viewId) {
            const r = original.apply(this, arguments);
            if (viewId === 'view-acabamento') {
                const secao = document.getElementById('view-acabamento');
                // Só depois de confirmar que a seção abriu MESMO: o porteiro de
                // permissão do `showView` original pode ter recusado, e carregar
                // pedidos para uma tela que não abriu seria trabalho jogado fora.
                if (secao && secao.classList.contains('active')) {
                    try { AcabamentoPainel.aoAbrir(); } catch (e) {
                        console.warn('[acabamento] falha ao abrir a tela:', e);
                    }
                }
            }
            return r;
        };
    })();

    document.addEventListener('DOMContentLoaded', () => {
        try { pintarBotoesPrazo(); pintarCabecalhos(); } catch (e) {}
    });
})();
