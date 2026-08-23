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

    // Fundo do bloco do modelo E da linha do pedido na fila: o estágio se lê de
    // relance, sem procurar o selo. O ESTADO do modelo, e não a pintura da
    // página.
    //
    // Estas quatro cores NÃO acompanham a paleta da tela e não se escolhem aqui:
    // são ditadas pelo usuário, que é quem lê esta tela de pé na estação. Em
    // 20/08/2026 eu as tinha unificado com a paleta e ele mandou devolver; os
    // valores abaixo são os que ele passou em 22/08/2026, um a um. Mexer nelas
    // para combinar com o fundo é trocar informação por decoração.
    const FUNDO_DO_ESTAGIO = {
        'Aguardando':    '#003768',   // o que ainda não chegou
        'Impresso':      '#001249',   // saiu da impressora
        'Em acabamento': '#000000',   // em cima da mesa
        'Pronto':        '#00471c',   // conferido
        '':              '#003768',   // sem estágio vale o mesmo que Aguardando
    };

    // A cor de destaque dos quatro botões de estágio, em componentes RGB para
    // compor `rgb()` e `rgba()` na mesma linha.
    //
    // São as MESMAS cores dos selos (`SELO`, e as classes `badge-*` do
    // style.css), de propósito: o botão e o selo do mesmo modelo têm de dizer a
    // mesma coisa. Como o fundo acima, elas NÃO acompanham a paleta da tela —
    // codificam estado, e estado não se repinta para combinar (regra do
    // usuário, 20/08/2026).
    const COR_DO_ESTAGIO = {
        'Aguardando':    '59,130,246',   // azul  — badge-blue
        'Impresso':      '76,200,240',   // ciano — badge-teal desta tela
        'Em acabamento': '245,158,11',   // âmbar — badge-amber
        'Pronto':        '34,197,94',    // verde — badge-green
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
        estimados: {},      // 'SETOR' -> kg estimado (só os que têm; ausente = null)
        liberacaoPendente: null, // o peso fora dos 5 % que espera a senha (ver gravarPeso)
        prontoPendente: null,    // o "Pronto" que espera o peso do setor (23/08/2026)

        // Os VOLUMES do pedido aberto (23/08/2026). Ver a seção "Os volumes".
        volumes: {},             // 'SETOR' -> [volume, volume, …], na ordem do número
        volumesDoPedido: null,   // de qual pedido é o mapa acima
        escolhaDeVolume: null,   // { setor, numeroDoPedido, marcados } enquanto se escolhe
        volumeEmEdicao: null,    // o volume que a janela de pesar está montando
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
     * A HORA em que o modelo ficou Pronto, como o banco a guardou (ISO), ou ''.
     *
     * Pedido do usuário em 23/08/2026: "Modelos prontos devem indicar a hora em
     * que ficaram prontos". Quem escreve é o gatilho
     * `trg_carimba_acabamento_pronto_em` (ver `sql/hora_do_pronto_no_acabamento.sql`),
     * e não esta tela: o estágio também é gravado pela estação e mexido pelo ERP,
     * e um carimbo feito no frontend deixaria buracos justamente nos modelos que
     * a gráfica tocou pelo acesso local.
     *
     * Modelo marcado Pronto ANTES de 23/08/2026 não tem hora, e é assim de
     * propósito: a migração não inventou um histórico aproximado, porque no card
     * ele seria lido como hora de verdade.
     */
    function prontoEmDoModelo(m) {
        if (!m) return '';
        const doMapa = tela.acabamento[String(m.id)];
        const bruto = m.acabamento_pronto_em || (doMapa ? doMapa.prontoEm : '') || '';
        return String(bruto).trim();
    }

    /**
     * "Pronto às 14:32" no mesmo dia; "Pronto em 22/08 às 14:32" nos outros.
     *
     * O operador olha isto de pé na estação, quase sempre no dia em que o
     * trabalho aconteceu — a data ali só atrapalharia a leitura. Nos outros dias
     * ela aparece, porque aí a hora sozinha mentiria.
     */
    function textoDaHoraDoPronto(iso) {
        if (!iso) return '';
        const t = new Date(iso);
        if (isNaN(t.getTime())) return '';
        const dd = n => String(n).padStart(2, '0');
        const hora = `${dd(t.getHours())}:${dd(t.getMinutes())}`;
        const hoje = new Date();
        const mesmoDia = t.getFullYear() === hoje.getFullYear()
            && t.getMonth() === hoje.getMonth()
            && t.getDate() === hoje.getDate();
        return mesmoDia
            ? `Pronto às ${hora}`
            : `Pronto em ${dd(t.getDate())}/${dd(t.getMonth() + 1)} às ${hora}`;
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

    /**
     * O responsável de um modelo pelo ID, venha ele da linha completa do pedido
     * aberto ou do mapa da lista.
     *
     * Existe porque a trava do status (regra do usuário, 22/08/2026) precisa
     * responder "há responsável?" tendo em mãos só o id — que é o que o clique
     * do botão entrega.
     */
    function responsavelPorId(itemId, osId) {
        const s = estado();
        const itens = (s.osItens && s.osItens[osId]) || [];
        const item = itens.find(i => String(i.id) === String(itemId));
        if (item) return responsavelDoModelo(item);
        const noMapa = tela.acabamento[String(itemId)];
        return noMapa ? (noMapa.responsavel || '').trim() : '';
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

            const evento = eventoDoPedido(os);
            const eventoHtml = evento
                ? `<br><span style="font-size: 0.82rem; color: #4cc8f0;">${esc(evento)}</span>`
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
                        <span style="${ESTILO_CRACHA_NUMERO}">${esc(os.numero)}</span>
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

    function escreverHtml(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    /**
     * O nome do evento de um pedido, ou '' quando o briefing ainda não o tem.
     *
     * Mora em `pedidos_artes.nome_evento`, uma linha por arte do pedido — daí a
     * busca pela primeira que tenha o nome preenchido. É a mesma consulta que a
     * fila do Painel de Produção faz; aqui ela serve a três lugares (a busca, a
     * lista e o cabeçalho do pedido aberto), e por isso está escrita uma vez só.
     */
    function eventoDoPedido(os) {
        if (!os) return '';
        const s = estado();
        const numInt = parseInt(os.numero);
        const arte = (s.todasArtes || []).find(a => a.id_int === numInt && a.nome_evento);
        return arte ? String(arte.nome_evento).trim() : '';
    }

    /**
     * A primeira linha do título do pedido aberto: "21085 - Expointer 2026".
     *
     * Mesmo formato do `ped-view-title` da tela de Pedido (`${numero} - ${evento}`).
     * Cada pedaço entra só se existir: pedido sem evento no briefing não vira
     * "21085 - ", com o hífen sozinho no fim.
     */
    function tituloDoPedido(os) {
        if (!os) return '';
        return [os.numero, eventoDoPedido(os)]
            .map(p => String(p === undefined || p === null ? '' : p).trim())
            .filter(Boolean)
            .join(' - ');
    }

    /**
     * A segunda linha: "CLIENTE - 53193".
     *
     * O `rotuloDoCliente` já devolve "NOME - NÚMERO", que é como o resto do
     * painel escreve o cliente; montar o número à parte aqui faria a mesma
     * pessoa aparecer de dois jeitos em duas telas.
     */
    function clienteDoPedido(os) {
        if (!os) return '';
        const rotulo = fn('rotuloDoCliente');
        const texto = rotulo ? rotulo(os) : (os.cliente || '');
        return String(texto === undefined || texto === null ? '' : texto).trim();
    }

    /**
     * O `-webkit-text-fill-color` é obrigatório, não decoração.
     *
     * O `<h1>` do cabeçalho herda o degradê de `.page-header-text h1`, que pinta
     * o texto por `-webkit-background-clip: text` com
     * `-webkit-text-fill-color: transparent`. Esse "transparente" é herdado
     * pelos filhos, e o degradê do `<h1>` é recortado no texto deles também:
     * uma segunda linha só com `color: #fbbf24` sairia **cinza clara**, pintada
     * pelo degradê, com o amarelo todo certo no código e ninguém vendo amarelo
     * na tela. Daí o harness que mede a cor num Chrome de verdade.
     *
     * `0.8em`, e não um tamanho em rem: a segunda linha fica 20% menor que a
     * primeira mesmo que um dia o título inteiro mude de tamanho.
     */
    const ESTILO_LINHA_DO_CLIENTE = 'font-size: 0.8em; color: #fbbf24;'
        + ' -webkit-text-fill-color: #fbbf24; background: none;';

    /**
     * O título do pedido aberto, em duas linhas.
     *
     * Pedido do usuário em 23/08/2026: em cima o número e o evento, como já
     * estava; embaixo, 20% menor e em amarelo, o nome e o número do cliente.
     * Quem trabalha no acabamento tem o EVENTO na mão — é por ele que confere
     * que o material na mesa é o deste pedido —, e o cliente é a informação de
     * apoio, que agora se lê sem competir com a primeira linha.
     *
     * Linha que não existe não é desenhada: pedido sem evento no briefing, ou
     * sem cliente, não deixa uma linha vazia empurrando o resto para baixo.
     */
    function tituloDoPedidoHtml(os) {
        const linhas = [];
        const primeira = tituloDoPedido(os);
        const cliente = clienteDoPedido(os);
        if (primeira) linhas.push(`<div>${esc(primeira)}</div>`);
        if (cliente) linhas.push(`<div style="${ESTILO_LINHA_DO_CLIENTE}">${esc(cliente)}</div>`);
        return linhas.join('');
    }

    /**
     * O número do pedido no crachá que a gráfica já conhece.
     *
     * Mesmo desenho da fila do Painel de Produção — número grande, fundo em
     * degradê, sombra —, porque é assim que o operador acha o pedido de longe,
     * de pé na frente da máquina. Aqui ele serve à lista E ao cabeçalho do
     * pedido aberto, para os dois envelhecerem juntos.
     */
    const ESTILO_CRACHA_NUMERO = 'font-size: 1.35rem; font-weight: 900; color: #ffffff;'
        + ' background: linear-gradient(135deg, #2b32af, #001249); padding: 4px 12px;'
        + ' border-radius: 6px; display: inline-block; box-shadow: 0 4px 12px rgba(43, 50, 175, 0.45);'
        + ' border: 1px solid rgba(255,255,255,0.22);'
        + ' text-shadow: 0 1px 2px rgba(0,0,0,0.3);';

    // ─── A lista de responsáveis ────────────────────────────────────────────

    /**
     * O perfil que responde pelo acabamento de um modelo.
     *
     * Regra do usuário, 22/08/2026: "apenas os perfil Acabamento aparecem como
     * opção no drop responsável". O seletor listava TODO acesso local ativo —
     * designers, impressores, o administrador —, e escolher o responsável virava
     * procurar três nomes no meio de quinze. Quem responde pelo setor é quem
     * trabalha nele.
     *
     * O nome já GRAVADO num modelo continua aparecendo mesmo fora do perfil (ver
     * `selectResponsavel`): apagá-lo da tela faria o trabalho parecer sem dono.
     */
    const PERFIL_DO_RESPONSAVEL = 'acabamento';

    /**
     * Os operadores de acesso local da gráfica: nome e perfil.
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
                .map(o => ({
                    nome: String(o.nome).trim(),
                    role: String(o.role || '').trim().toLowerCase(),
                }));
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
                    .select('id, id_int, acabamento_status, acabamento_responsavel, acabamento_foto_url, acabamento_pronto_em')
                    .in('id_int', fatia);
                if (error) throw error;
                (data || []).forEach(m => {
                    mapa[String(m.id)] = {
                        status: m.acabamento_status || '',
                        responsavel: m.acabamento_responsavel || '',
                        foto: m.acabamento_foto_url || '',
                        prontoEm: m.acabamento_pronto_em || '',
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

    // ─── A tabela de especificação do modelo ────────────────────────────────
    //
    // Desenho pedido pelo usuário em 22/08/2026, com a imagem da tabela em mãos:
    // cabeçalho azul escrito ESPECIFICAÇÃO, uma linha por informação, o rótulo à
    // direita da primeira coluna e o valor na segunda. As informações variáveis
    // — as que mudam de modelo para modelo — vêm em negrito, também a pedido
    // dele: são elas que o operador confere contra o material na mesa.
    //
    // Antes eram oito quadradinhos numa grade que se reorganizava conforme a
    // largura da tela, e ler "qual é o bloco deste modelo" exigia procurar o
    // rótulo no meio dos outros sete. Em tabela, cada informação está sempre na
    // mesma linha, e duas telas lado a lado se comparam.

    const ESPEC_CABECALHO = 'background: #0b63ce; color: #ffffff; font-weight: 900;'
        + ' text-transform: uppercase; letter-spacing: 0.06em; padding: 9px 12px;'
        + ' text-align: center; font-size: 0.92rem;';
    const ESPEC_ROTULO = 'background: #152442; color: #8fb6e0; font-weight: 800;'
        + ' font-size: 0.82rem; text-align: right; padding: 9px 10px; width: 46%;'
        + ' white-space: nowrap; border-bottom: 1px solid rgba(255,255,255,0.07);'
        + ' vertical-align: middle;';
    const ESPEC_VALOR = 'background: #1b2c4e; color: #ffffff; font-weight: 800;'
        + ' font-size: 0.95rem; padding: 9px 10px;'
        + ' border-bottom: 1px solid rgba(255,255,255,0.07); vertical-align: middle;';

    /** Uma linha: o rótulo fixo à esquerda, a informação variável à direita. */
    function linhaEspec(rotuloTexto, valor, cor) {
        return `
            <tr>
                <td style="${ESPEC_ROTULO}">${esc(rotuloTexto)}</td>
                <td style="${ESPEC_VALOR}${cor ? ' color: ' + cor + ';' : ''}">${valor}</td>
            </tr>`;
    }

    /**
     * A tabela inteira.
     *
     * As linhas chegam prontas de `linhaDoModelo`, porque o que entra nelas
     * depende do tipo da numeração: um mapa de teatro (CAMAROTE) fala em
     * quadrantes e lugares, não em numeração inicial e final.
     */
    function tabelaDeEspecificacao(linhas) {
        return `
            <table style="width: 100%; border-collapse: collapse; border-radius: 10px;
                          overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.35);">
                <thead>
                    <tr><th colspan="2" style="${ESPEC_CABECALHO}">Especificação</th></tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>`;
    }

    function nomeNoCatalogo(catalogo, id) {
        const linha = id ? (catalogo || []).find(x => String(x.id) === String(id)) : null;
        return linha ? (linha.name || linha.tipo || '') : '';
    }

    /**
     * Os quatro estágios como BOTÕES, no lugar do seletor.
     *
     * Pedido do usuário, 22/08/2026: *"alterar o drop dos Status para 4 botões,
     * do mesmo tamanho; o botão do status atual estará selecionado; ao
     * selecionar, o status deve ficar muito bem destacado"*.
     *
     * Um seletor fechado mostra um estágio e esconde os outros três: para ver
     * onde o modelo está era preciso abrir a lista, e para mudá-lo, duas ações
     * — abrir e escolher. Os quatro botões mostram o caminho inteiro de
     * relance, e mudar é um clique só, com o alvo do tamanho de um dedo na
     * estação.
     *
     * Uma coluna de `1fr`, os quatro empilhados na lateral direita do card —
     * desenho pedido pelo usuário em 22/08/2026. Empilhados eles têm o mesmo
     * tamanho por construção (mesma coluna da grade), e o caminho do acabamento
     * se lê de cima para baixo, na ordem em que o trabalho acontece. O atual vem
     * pintado por dentro, com anel e sombra da cor do estágio e um ✓ à frente;
     * os outros ficam só contornados. Sem permissão de editar, os quatro
     * aparecem apagados e travados — a tela continua dizendo onde o modelo está,
     * que é o que o operador sem edição precisa ler.
     *
     * O fundo do bloco do modelo continua mudando com o estágio, como já fazia
     * (`FUNDO_DO_ESTAGIO`).
     */
    function botoesDeEstagio(item, osId, podeEditar) {
        // O estágio sempre tem um valor, nem que seja o derivado da impressão —
        // por isso não há botão "nenhum": não existe modelo sem estágio.
        const atual = estagioDoModelo(item);

        // Sem responsável, o status não se mexe (regra do usuário, 22/08/2026).
        // Quem marca um estágio está dizendo que ALGUÉM fez aquele trabalho; sem
        // nome, o registro não responde à pergunta que o setor faz depois — quem
        // acabou este material. Ler continua livre: os quatro botões aparecem, o
        // atual continua marcado, e só o clique é que espera o nome.
        const temResponsavel = !!responsavelDoModelo(item);
        const liberado = podeEditar && temResponsavel;

        const botoes = ESTAGIOS.map(e => {
            const rgb = COR_DO_ESTAGIO[e] || '148,163,184';
            const icone = (SELO[e] || {}).icone || '';
            const ativo = (atual === e);
            // Texto ESCURO no botão pintado, e não branco: as quatro cores são
            // claras (o âmbar e o ciano principalmente), e branco sobre elas
            // fica com menos de 2,5:1 de contraste — some sob a luz da gráfica.
            const cor = ativo
                ? `background: rgb(${rgb}); border-color: rgb(${rgb}); color: #0b1220; font-weight: 900;`
                  + ` box-shadow: 0 0 0 3px rgba(${rgb},0.28), 0 6px 16px rgba(${rgb},0.45);`
                : `background: rgba(${rgb},0.10); border-color: rgba(${rgb},0.34); color: rgb(${rgb});`
                  + ` font-weight: 700;`;
            const titulo = !temResponsavel
                ? 'Escolha o responsável deste modelo para liberar o status'
                : (ativo ? 'Este modelo está em ' + esc(e) : 'Marcar como ' + esc(e));
            return `
                <button type="button" data-estagio="${esc(e)}" aria-pressed="${ativo ? 'true' : 'false'}"
                        ${liberado ? '' : 'disabled'}
                        style="${ESTILO_BOTAO_ESTAGIO}${cor}${liberado ? '' : ESTILO_BOTAO_TRAVADO}"
                        onclick="AcabamentoPainel.mudarEstagio('${escJs(item.id)}', '${escJs(osId)}', '${escJs(e)}')"
                        title="${titulo}">
                    ${ativo ? '✓ ' : ''}${icone} ${esc(e)}
                </button>`;
        }).join('');

        // A saída da trava, escrita na própria tela: sem ela o operador vê
        // quatro botões cinzas e não tem como adivinhar o que falta. Só para
        // quem PODE editar — a quem não pode, o recado não serviria de nada.
        const recado = (podeEditar && !temResponsavel)
            ? `<span style="font-size:0.7rem; color:#fcd34d; display:block; margin-top:2px;">⬇️ Escolha o <b>Responsável</b> abaixo para liberar o status.</span>`
            : '';

        // A hora em que ficou Pronto, logo abaixo dos botões (pedido do usuário,
        // 23/08/2026). Só no Pronto, e só quando existe: modelo concluído antes
        // de 23/08/2026 não tem hora registrada, e inventar uma seria pior do
        // que não mostrar nenhuma.
        const hora = (atual === 'Pronto') ? textoDaHoraDoPronto(prontoEmDoModelo(item)) : '';
        const carimbo = hora
            ? `<span style="font-size:0.7rem; color:#4ade80; display:block; margin-top:4px; text-align:center;">🕒 ${esc(hora)}</span>`
            : '';

        return `<div style="display: grid; grid-template-columns: 1fr; gap: 6px; width: 100%;">${botoes}</div>${carimbo}${recado}`;
    }

    function selectResponsavel(item, osId, podeEditar) {
        const atual = responsavelDoModelo(item);
        const todos = tela.operadores || [];
        // Só o perfil do setor (regra do usuário, 22/08/2026).
        const doSetor = todos.filter(o => o.role === PERFIL_DO_RESPONSAVEL);
        // Um responsável que saiu da lista de acessos — ou que nunca teve o
        // perfil — continua aparecendo: o nome está gravado no modelo, e
        // apagá-lo da tela faria o trabalho parecer sem dono.
        const nomes = doSetor.map(o => o.nome);
        if (atual && !nomes.some(n => n.toLowerCase() === atual.toLowerCase())) nomes.unshift(atual);

        const opcoes = ['<option value="">— Responsável —</option>'].concat(
            nomes.map(n => `<option value="${esc(n)}" ${n.toLowerCase() === atual.toLowerCase() ? 'selected' : ''}>${esc(n)}</option>`)
        ).join('');

        // A saída da trava vai escrita na própria tela: sem isso o operador vê
        // um seletor vazio e não tem como saber o que fazer. São três situações
        // diferentes, e cada uma pede uma providência diferente.
        const recado = (!todos.length && tela.erroOperadores)
            ? `<span style="font-size:0.7rem; color:#f87171;">Lista de operadores indisponível. Cadastre em Usuários → Acesso Local, ou tente ATUALIZAR.</span>`
            : (!todos.length
                ? `<span style="font-size:0.7rem; color:var(--text-dim);">Nenhum acesso local cadastrado. Cadastre em Usuários → Acesso Local.</span>`
                : (!doSetor.length
                    ? `<span style="font-size:0.7rem; color:var(--text-dim);">Nenhum operador com o perfil <b>✂️ Acabamento</b>. Em <b>Usuários → Acesso Local — NewProd</b>, escolha esse perfil para quem trabalha no setor, e volte aqui em <b>ATUALIZAR</b>.</span>`
                    : ''));

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

    // Os botões de estágio. `min-height` generoso porque na estação se clica de
    // pé, às vezes com a mão suja de tinta; `min-width: 0` porque sem ele uma
    // coluna de grade não encolhe abaixo do conteúdo e as quatro deixam de ter
    // o mesmo tamanho na tela estreita.
    const ESTILO_BOTAO_ESTAGIO = 'display: inline-flex; align-items: center; justify-content: center;'
        + ' gap: 5px; width: 100%; min-width: 0; min-height: 44px; padding: 8px 6px;'
        + ' border-style: solid; border-width: 2px; border-radius: 8px; cursor: pointer;'
        + ' font-size: 0.84rem; line-height: 1.15; text-align: center;'
        + ' transition: box-shadow .12s ease, background-color .12s ease;';
    // Travado apaga o botão, mas não troca a cor: o operador sem permissão de
    // editar continua LENDO em que ponto o modelo está.
    const ESTILO_BOTAO_TRAVADO = ' opacity: 0.5; cursor: not-allowed; box-shadow: none;';

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

        const temBloco = item.bloco !== undefined && item.bloco !== null && item.bloco !== '';
        const qtdTexto = `${(parseInt(qtd) || 0).toLocaleString('pt-BR')} un`;
        // "0001 a 4000" numa linha só, como o usuário desenhou. Faltando um dos
        // dois não há intervalo a mostrar, e a linha diz isso em vez de exibir
        // meia informação.
        const temIntervalo = ni !== '' && ni !== undefined && ni !== null
                          && nf !== '' && nf !== undefined && nf !== null;
        const intervalo = temIntervalo ? `${esc(ni)} a ${esc(nf)}` : '—';

        const numeros = ehCamarote
            ? [
                linhaEspec('Quadrantes (Q_CAM)', esc(item.q_cam || item.Q_CAM || '—'), '#4cc8f0'),
                linhaEspec('Lugares (L_CAM)', esc(item.l_cam || item.L_CAM || '—'), '#4cc8f0'),
                linhaEspec('Cadeira inicial (C_INI)', esc(item.c_ini || item.C_INI || 1), '#4cc8f0'),
            ].join('')
            : [
                linhaEspec('Quantidade Total', esc(qtdTexto)),
                linhaEspec('Numeração de', intervalo),
                linhaEspec('Bloco', temBloco ? `${esc(item.bloco)} unidades` : '—'),
            ].join('');

        const impressao = fn('normalizarStatusImpressao')
            ? window.normalizarStatusImpressao(item.status_impressao || item.impressao)
            : (item.status_impressao || item.impressao || '—');

        const idAmostra = `acab-amostra-${esc(osId)}-${esc(item.id)}-${idx}`;

        // ## O desenho do card, refeito em 21/08/2026 a pedido do usuário
        //
        // A versão anterior espalhava tudo numa coluna só: dados, seletores e
        // a faixa da foto empilhados, "muito mal distribuídos" nas palavras
        // dele. A ordem agora conta a história do trabalho:
        //
        //   topo  — QUEM: nome, código e selo à esquerda; a foto do material
        //           à direita, pequena, porque é registro e não tarefa.
        //   meio  — O QUÊ: amostra e os dados do modelo, em grade alinhada.
        //   base  — A DECISÃO: status e responsável, os dois únicos campos
        //           que esta tela escreve, numa faixa própria mais escura.
        return `
            <div style="background: ${fundo}; ${estiloDoCardNaEscolha(item)} border-radius: 10px; margin-bottom: 12px; overflow: hidden;">

                <div style="display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px dashed rgba(255,255,255,0.14);">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1 1 auto; min-width: 220px;">
                        ${caixaDeEscolha(item)}
                        <span style="width: 22px; height: 22px; min-width: 22px; border-radius: 50%; background-color: ${corHex || 'transparent'}; border: ${corHex ? '2px solid rgba(255,255,255,0.8)' : '2px dashed rgba(207,230,251,0.45)'}; display: inline-block;" title="Cor de referência: ${esc(corNome || 'nenhuma')}"></span>
                        <strong style="font-size: 1.2rem; color: #ffffff;">${esc(item.produto || item.nome_modelo || 'Modelo')}</strong>
                        <span class="badge" title="Código do modelo">#${esc(item.modelo || item.id || '--')}</span>
                        ${seloDoEstagio(estagio)}
                    </div>
                    ${blocoDaFoto(item, osId, idx)}
                </div>

                <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: stretch; padding: 14px 16px;">
                    <div style="flex: 1 1 200px; min-width: 180px; max-width: 100%; display: flex; align-items: center; justify-content: center;">
                        ${amostraHtml(item, idAmostra)}
                    </div>
                    <div style="flex: 0 1 280px; min-width: 220px; display: flex; align-items: center;">
                        ${tabelaDeEspecificacao([
                            numeros,
                            // A numeração pelo NOME. Faltava no desenho que o
                            // usuário mandou, e ele pediu que entrasse: é ela que
                            // diz se o modelo leva QR, código de barras ou número
                            // simples.
                            linhaEspec('Numeração', esc(numNome || '—')),
                            linhaEspec('Cor', esc(corNome || '—')),
                            linhaEspec('Impressão', esc(item.verso_tipo || (item.verso ? 'FxVerso' : 'Frente'))),
                            // O que a Produção diz deste modelo. Fica na tabela
                            // porque é dela que o acabamento sabe se o material já
                            // saiu da impressora.
                            linhaEspec('Situação', esc(impressao || '—'), '#9fd8f2'),
                        ].join(''))}
                    </div>

                    <!-- A coluna das DECISÕES, à direita da especificação: os
                         quatro botões de status um abaixo do outro e, embaixo
                         deles, o responsável. Desenho pedido pelo usuário em
                         22/08/2026. Antes isso era uma faixa no rodapé do card,
                         com os botões deitados; de pé na estação, o operador
                         percorria a linha inteira do card para chegar até ela.
                         SEM caixa em volta, por pedido dele no mesmo dia: os
                         botões já têm contorno e cor próprios, e a moldura ao
                         redor deles só competia com a do bloco do modelo. -->
                    <div style="flex: 0 1 210px; min-width: 180px; display: flex; flex-direction: column; gap: 12px; justify-content: center;">
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Status do acabamento</span>
                            ${botoesDeEstagio(item, osId, podeEditar())}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Responsável</span>
                            ${selectResponsavel(item, osId, podeEditar())}
                        </div>
                        ${blocoDeVolumesDoModelo(item)}
                    </div>
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

        // O título em duas linhas, sem caixa em volta: em cima o número e o
        // evento, no tamanho do título da tela de Pedido do Painel de Produção
        // (`ped-view-title`); embaixo o cliente, 20% menor e em amarelo. Pedido
        // do usuário em 22/08/2026 (a primeira linha) e 23/08/2026 (a segunda).
        escreverHtml('acab-detalhe-titulo', tituloDoPedidoHtml(os));

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

        // A faixa do modo de escolha abraça a lista: o anúncio em cima, a conta
        // do que foi marcado embaixo. As duas somem juntas quando não há
        // escolha em curso.
        corpo.innerHTML = boxDePesos(itens, os ? os.numero : '')
                        + faixaDaEscolha()
                        + html
                        + barraDaEscolha(itens);

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
     * O endereço de uma rota nossa: `<base>/api/<rota>/<x>`.
     *
     * É o ÚNICO lugar do arquivo que escreve a raiz `api` — há teste contando.
     * Quem muda é só a base: vazia na estação (o agente serviu a página e
     * responde no caminho relativo) ou a Edge Function do painel, no site.
     */
    function urlDeApi(base, rota, x) {
        return `${base}/api/${rota}/${encodeURIComponent(x)}`;
    }

    /**
     * O endereço de uma rota do agente.
     *
     * Um lugar só lê o `API_BASE_URL`, e há teste contando: esta tela fala
     * com o agente por quatro rotas e por mais nenhuma — três da ficha de
     * expedição (peso, carimbo do setor, envio) e a conferência da senha de
     * liberação do peso (21/08/2026).
     */
    function urlDaEstacao(rota, x) {
        let base = '';
        if (typeof API_BASE_URL !== 'undefined') base = API_BASE_URL;
        else if (typeof window !== 'undefined' && window.API_BASE_URL) base = window.API_BASE_URL;
        return urlDeApi(base, rota, x);
    }

    /**
     * O endereço de uma rota da Edge Function `painel`, para quando a página
     * veio do site e há sessão do Vibe.
     *
     * `API_PAINEL` sai do `supabase-config.js`, e o `window.fetch` embrulhado de
     * lá acrescenta a sessão a toda URL que começa por ele — é assim que a
     * função sabe quem está digitando. Identificador nu primeiro e `window`
     * depois, pela mesma razão do `urlDaEstacao`.
     */
    function urlDoPainel(rota, x) {
        let base = '';
        if (typeof API_PAINEL !== 'undefined') base = API_PAINEL;
        else if (typeof window !== 'undefined' && window.API_PAINEL) base = window.API_PAINEL;
        return urlDeApi(base, rota, x);
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

    // ─── O peso estimado, e a regra dos 5 % ─────────────────────────────────
    //
    // Pedido do usuário em 21/08/2026: ao lado do peso real de cada setor, o
    // peso ESTIMADO — e o real não pode fugir mais de 5 % dele sem a senha de
    // liberação da semana (a que aparece no menu Usuários).
    //
    // O ERP não guarda "estimado por setor". Ele guarda o estimado por LINHA da
    // proposta, em gramas: `produtos_proposta.peso_total` é coluna gerada,
    // `peso_uni * qtd`. O setor da linha é o `setor_pcp` do produto — a mesma
    // origem dos cards da fila. Então o estimado do setor é a soma das linhas
    // daquele setor, ÷ 1000. Conferido contra os pedidos que já tinham peso real
    // (21000/FLEXO est. 4,160 × real 4,16; 21074/FLEXO 270,400 × 270,4).
    //
    // A leitura de `produtos_proposta` é pública, então a soma é feita AQUI, nos
    // dois caminhos — estação sem sessão e site com sessão —, sem rota nova e
    // sem tocar em tabela do parceiro. Quem confere a senha é o servidor; a
    // regra dos 5 % mora nesta tela, como a conferência da expedição.

    const TABELA_DO_ESTIMADO = 'produtos_proposta';
    const TOLERANCIA_DO_PESO = 0.05;

    /** O estimado na tela sempre com três casas: "4,160 kg", como o ERP soma. */
    function kgParaTexto(valor) {
        const n = Number(valor);
        if (valor === null || valor === undefined || !isFinite(n)) return '';
        return n.toFixed(3).replace('.', ',');
    }

    /**
     * Soma o `peso_total` (GRAMAS) das linhas por setor e devolve kg com três
     * casas: `{ FLEXO: 4.16 }`. Pura, para o teste.
     *
     * `setorPorProduto` é `id_produto -> setor_pcp`. Linha cujo produto não tem
     * setor aceito pelo banco não entra em conta nenhuma — ninguém tem campo de
     * peso para ela. Setor cuja soma não passa de zero fica de FORA do mapa: é
     * "sem estimado", e sem estimado não há com o que comparar.
     */
    function estimadoPorSetor(linhas, setorPorProduto) {
        const gramas = {};
        (linhas || []).forEach(l => {
            if (!l) return;
            const setor = normalizar((setorPorProduto || {})[String(l.id_produto)]);
            if (SETORES_DO_BANCO.indexOf(setor) === -1) return;
            const g = Number(l.peso_total);
            if (!isFinite(g) || g <= 0) return;
            gramas[setor] = (gramas[setor] || 0) + g;
        });
        const kg = {};
        Object.keys(gramas).forEach(setor => {
            const total = Math.round(gramas[setor]) / 1000;
            if (total > 0) kg[setor] = total;
        });
        return kg;
    }

    /** O estimado do setor no pedido aberto, ou null quando não há. */
    function estimadoDoSetor(setor) {
        const v = tela.estimados[setor];
        return (v === undefined || v === null || !(Number(v) > 0)) ? null : Number(v);
    }

    /**
     * |real − estimado| / estimado. Null quando não dá para comparar: sem
     * estimado, estimado zero, ou sem peso digitado (apagar o campo não confere).
     */
    function divergencia(real, estimado) {
        const est = Number(estimado);
        if (estimado === null || estimado === undefined || !(est > 0)) return null;
        if (real === null || real === undefined || !isFinite(Number(real))) return null;
        return Math.abs(Number(real) - est) / est;
    }

    /**
     * Acima de 5 % — EXATAMENTE 5 % ainda passa — pede a senha de liberação.
     *
     * A folga de um bilionésimo é só contra o ponto flutuante: 2,1 contra 2,0 dá
     * 0,050000000000000044 em JavaScript, e sem ela a borda "exata" abriria o
     * popup. Peso tem três casas; nada real cabe nessa folga.
     */
    function precisaDeLiberacao(real, estimado) {
        const d = divergencia(real, estimado);
        return d !== null && d > TOLERANCIA_DO_PESO + 1e-9;
    }

    /**
     * Lê `produtos_proposta` daquele pedido e guarda o estimado por setor.
     *
     * Falha aqui não derruba o box: sem estimado a tela mostra "est. —" e grava
     * como gravava antes — é o mesmo espírito do `carregarPesos`. O pedido pode
     * ter sido trocado enquanto a leitura voava; nesse caso o resultado é
     * descartado, para o estimado de um pedido não aparecer no outro.
     */
    async function carregarEstimados(numeroDoPedido) {
        tela.estimados = {};
        const idInt = parseInt(numeroDoPedido);
        if (isNaN(idInt)) return;
        const aberto = tela.pedidoAberto;

        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
            const { data, error } = await supabaseClient
                .from(TABELA_DO_ESTIMADO)
                .select('id, id_produto, qtd, peso_total')
                .eq('id_int', idInt);
            if (error) throw error;
            if (tela.pedidoAberto !== aberto) return;

            const setorPorProduto = {};
            (estado().produtosGlobais || []).forEach(p => {
                if (p && p.id_produto !== undefined && p.id_produto !== null) {
                    setorPorProduto[String(p.id_produto)] = p.setor_pcp || '';
                }
            });
            tela.estimados = estimadoPorSetor(data, setorPorProduto);
        } catch (e) {
            console.warn('[acabamento] não deu para ler o peso estimado por setor:', e);
            tela.estimados = {};
        }
    }

    /**
     * O texto ao lado do `kg` de um setor: "est. 4,160 kg", e, com peso
     * digitado, a divergência ("· +8,2%"). Âmbar acima dos 5 %; sem estimado,
     * "est. —".
     */
    function textoDoEstimado(setor) {
        const est = estimadoDoSetor(setor);
        if (est === null) return { texto: 'est. —', cor: 'var(--text-dim)' };
        const linha = tela.pesos[setor];
        const real = linha && linha.peso !== null && linha.peso !== undefined ? linha.peso : null;
        const d = divergencia(real, est);
        if (d === null) return { texto: `est. ${kgParaTexto(est)} kg`, cor: 'var(--text-dim)' };
        const pct = (real - est) / est * 100;
        const sinal = pct < 0 ? '-' : '+';
        const texto = `est. ${kgParaTexto(est)} kg · ${sinal}${Math.abs(pct).toFixed(1).replace('.', ',')}%`;
        return { texto, cor: precisaDeLiberacao(real, est) ? '#fbbf24' : 'var(--text-dim)' };
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
     *
     * Antes de qualquer escrita, a regra dos 5 %: peso que foge do estimado
     * além disso NÃO é gravado — fica em `tela.liberacaoPendente` e o popup da
     * senha abre. Quem volta aqui com `opcoes.liberado` é o `liberarDivergencia`,
     * depois de o servidor dizer que a senha confere.
     */
    async function gravarPeso(numeroDoPedido, setor, texto, opcoes) {
        const idInt = parseInt(numeroDoPedido);
        const alvo = normalizar(setor);
        if (isNaN(idInt) || SETORES_DO_BANCO.indexOf(alvo) === -1) return;

        const peso = pesoDoTexto(texto);
        if (peso === undefined) {
            avisar(`"${texto}" não é um peso. Use só números, como 4,16.`, 'error');
            pintarPesos();
            return;
        }

        const estimado = estimadoDoSetor(alvo);
        if (precisaDeLiberacao(peso, estimado) && !(opcoes && opcoes.liberado)) {
            tela.liberacaoPendente = { numeroDoPedido, setor: alvo, texto, peso, estimado };
            abrirPopupDaLiberacao();
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
                pintarEstimado(alvo);
                await concluirProntoPendente(alvo);
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
            pintarEstimado(alvo);
            await concluirProntoPendente(alvo);
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

    /**
     * O "est. …" ao lado do campo de UM setor, a partir do estado.
     *
     * Separado do `pintarPesos` de propósito: depois de gravar, só ele é
     * chamado — repintar o CAMPO ali apagaria o que o operador já estivesse
     * digitando no setor vizinho enquanto a gravação voava.
     */
    function pintarEstimado(setor) {
        const est = document.getElementById('acab-peso-est-' + setor);
        if (!est) return;
        const desenho = textoDoEstimado(setor);
        est.textContent = desenho.texto;
        est.style.color = desenho.cor;
    }

    /**
     * Devolve aos campos o que está no estado, sem tocar no resto da tela — e
     * atualiza o estimado ao lado, que depende do peso que está no campo.
     */
    function pintarPesos() {
        Object.keys(ROTULO_DO_SETOR).forEach(setor => {
            const campo = document.getElementById('acab-peso-' + setor);
            if (!campo) return;
            const atual = tela.pesos[setor];
            campo.value = pesoParaTexto(atual ? atual.peso : null);
            pintarEstimado(setor);
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
                    const estimado = textoDoEstimado(setor);
                    // Duas linhas desde 23/08/2026: em cima o peso do setor,
                    // como sempre; embaixo a faixa dos volumes. O card ficou
                    // mais largo (400 em vez de 240) porque a faixa carrega os
                    // chips — com 240 eles quebravam um por linha.
                    return `
                    <div style="display: flex; flex-direction: column; gap: 9px; flex: 1 1 400px;
                                background: rgba(76,200,240,0.07); border: 1px solid rgba(76,200,240,0.20);
                                border-radius: 8px; padding: 10px 12px;">
                      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
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
                        <span id="acab-peso-est-${setor}"
                              title="Peso estimado: a soma dos pesos dos produtos deste setor no pedido, pelo ERP. Acima de 5 % de diferença, gravar pede a senha de liberação."
                              style="font-size: 0.74rem; color: ${estimado.cor}; white-space: nowrap;">${esc(estimado.texto)}</span>
                        <span id="acab-peso-sinal-${setor}" style="font-size: 0.74rem; min-width: 62px;
                              color: var(--text-dim);"></span>
                      </div>
                      ${faixaDeVolumes(setor, itens, numeroDoPedido)}
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

    // ─── O peso obrigatório ao fechar um setor ──────────────────────────────
    //
    // Pedido do usuário em 23/08/2026: "ao marcar o último modelo como pronto
    // deve exigir indicar a informação do peso do setor que está pronto, só
    // alterar status após o peso real for indicado".
    //
    // O peso é o que a expedição usa para cotar o frete e conferir o volume, e
    // até aqui ele dependia de alguém lembrar de digitá-lo no box de cima. O
    // momento certo de cobrar é este: o setor acabou de terminar, o material
    // está na mesa e a balança está ao lado. Depois disso o operador já foi
    // embora para o próximo pedido.
    //
    // A cobrança é por SETOR, e não pelo pedido: um pedido com Laser e PVC
    // termina o Laser primeiro, e é o peso do Laser que se pesa naquela hora.

    /**
     * O setor que ESTE clique em "Pronto" vai fechar — ou `null`.
     *
     * Fecha quando o modelo é o último daquele setor fora do Pronto. Setor sem
     * nome fica de fora: não existe linha de peso para ele na ficha do ERP, e
     * cobrar um peso que não tem onde ser gravado seria uma trava sem saída.
     */
    function setorQueFechaComEstePronto(item, itens) {
        if (!item) return null;
        const setor = normalizar(item.setor);
        if (SETORES_DO_BANCO.indexOf(setor) === -1) return null;

        const grupo = modelosPorSetor(itens).find(g => g.setor === setor);
        if (!grupo) return null;

        // Os que faltam, tirando este — que está prestes a virar Pronto.
        const outrosPendentes = grupo.modelos.filter(m =>
            String(m.id) !== String(item.id) && estagioDoModelo(m) !== 'Pronto').length;
        return outrosPendentes === 0 ? setor : null;
    }

    /** O setor já tem peso real registrado? */
    function setorTemPeso(setor) {
        const linha = tela.pesos[setor];
        return !!(linha && linha.peso !== null && linha.peso !== undefined && linha.peso > 0);
    }

    /**
     * Há caminho para gravar peso nesta tela?
     *
     * Sem estação servindo a página e sem sessão do Vibe, o box de peso já diz
     * "entre com a sua conta" e o campo nem existe. Cobrar o peso ali seria
     * trancar o Pronto sem oferecer saída — e o material continuaria pronto na
     * mesa, com a tela dizendo o contrário.
     */
    function haComoGravarPeso() {
        return pelaEstacao() || tela.temSessao !== false;
    }

    /**
     * O setor cujo peso PRECISA ser digitado antes deste "Pronto" — ou `null`.
     */
    function pesoExigidoAntesDoPronto(item, itens) {
        if (!haComoGravarPeso()) return null;
        const setor = setorQueFechaComEstePronto(item, itens);
        if (!setor) return null;
        return setorTemPeso(setor) ? null : setor;
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

    // ─── O popup da senha de liberação ──────────────────────────────────────
    //
    // Pedido do usuário em 21/08/2026: peso real que foge mais de 5 % do
    // estimado "deve abrir um popup exigindo a senha de liberação". A senha é
    // semanal, de três caracteres, e aparece no menu Usuários — quem a tem é
    // quem pode liberar. Ela NUNCA desce para esta tela: o que sai daqui é o
    // que o operador digitou, e o que volta é sim ou não.
    //
    // Enquanto o popup está aberto nada foi gravado: `tela.pesos` continua com
    // o valor de antes, e Cancelar só redesenha o campo a partir dele.

    function montarPopupDaLiberacao() {
        let caixa = document.getElementById('acab-liberacao');
        if (caixa) return caixa;

        caixa = document.createElement('div');
        caixa.id = 'acab-liberacao';
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100003; display: none;'
            + ' align-items: center; justify-content: center; background: rgba(6,7,13,0.92); padding: 18px;';
        caixa.innerHTML = `
            <div style="width: min(520px, 96vw); background: ${AZUL.fundo};
                        border: 1px solid rgba(76,200,240,0.28); border-radius: 12px;
                        display: flex; flex-direction: column; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px;
                            background: ${'#120a8f'}; border-bottom: 1px solid rgba(76,200,240,0.24);">
                    <span style="font-size: 1.2rem;">⚖️</span>
                    <strong id="acab-liberacao-titulo" style="font-size: 1.05rem; color: #ffffff;">Peso fora do esperado</strong>
                    <button type="button" id="acab-liberacao-fechar"
                            style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px;
                                   font-weight: 700; cursor: pointer;">✕</button>
                </div>

                <div style="padding: 16px 18px; color: #cfe6fb; font-size: 0.9rem; line-height: 1.55;">
                    <div id="acab-liberacao-corpo"></div>
                    <div style="margin-top: 12px; padding: 10px 12px; border-radius: 8px;
                                background: rgba(251,191,36,0.10); border: 1px solid rgba(251,191,36,0.35);
                                color: #fbbf24; font-size: 0.86rem;">
                        Acima de 5 %. Para gravar assim, informe a senha de liberação
                        (está no menu Usuários).
                    </div>
                    <label for="acab-liberacao-senha" style="display: block; margin-top: 14px;
                           font-size: 0.78rem; color: #7fa9d4; text-transform: uppercase;
                           letter-spacing: 0.06em;">Senha de liberação</label>
                    <input type="text" id="acab-liberacao-senha" maxlength="3" autocomplete="off"
                           autocapitalize="characters" spellcheck="false" placeholder="A00"
                           style="margin-top: 6px; width: 120px; text-align: center; background: #0d0e20;
                                  border: 1px solid rgba(76,200,240,0.26); border-radius: 6px;
                                  color: #ffffff; padding: 8px 10px; font-size: 1.25rem;
                                  font-family: monospace; letter-spacing: 0.25em;
                                  text-transform: uppercase;" />
                    <div id="acab-liberacao-erro" style="margin-top: 8px; min-height: 1.2em;
                         font-size: 0.82rem; color: #f87171;"></div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px;
                            border-top: 1px solid rgba(76,200,240,0.18); flex-wrap: wrap;">
                    <span style="font-size: 0.78rem; color: #7fa9d4;">Cancelar devolve o peso de antes ao campo.</span>
                    <div style="margin-left: auto; display: flex; gap: 10px;">
                        <button type="button" id="acab-liberacao-cancelar"
                                style="background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);
                                       color: #cfe6fb; border-radius: 8px; padding: 10px 18px;
                                       font-weight: 700; cursor: pointer;">Cancelar</button>
                        <button type="button" id="acab-liberacao-ok"
                                style="background: linear-gradient(135deg, ${'#4a61e8'}, ${'#120a8f'});
                                       border: 1px solid ${'#4cc8f0'}; color: #ffffff; border-radius: 8px;
                                       padding: 10px 22px; font-weight: 800; letter-spacing: 0.05em;
                                       cursor: pointer;">Liberar</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(caixa);

        const cancelar = () => cancelarLiberacao();
        const btnX = document.getElementById('acab-liberacao-fechar');
        const btnCancelar = document.getElementById('acab-liberacao-cancelar');
        const btnOk = document.getElementById('acab-liberacao-ok');
        const campo = document.getElementById('acab-liberacao-senha');
        if (btnX) btnX.addEventListener('click', cancelar);
        if (btnCancelar) btnCancelar.addEventListener('click', cancelar);
        if (btnOk) btnOk.addEventListener('click', () => liberarDivergencia());
        if (campo) {
            // Maiúsculas enquanto digita: a senha é "K47", nunca "k47", e o
            // operador não deve ter de pensar nisso.
            campo.addEventListener('input', () => { campo.value = String(campo.value || '').toUpperCase(); });
            campo.addEventListener('keydown', e => {
                if (e && e.key === 'Enter') { e.preventDefault(); liberarDivergencia(); }
            });
        }
        return caixa;
    }

    function fecharPopupDaLiberacao() {
        const caixa = document.getElementById('acab-liberacao');
        if (caixa) caixa.style.display = 'none';
        tela.liberacaoPendente = null;
    }

    // ─── Os volumes ─────────────────────────────────────────────────────────
    //
    // Pedido do usuário em 23/08/2026, logo depois de o peso por setor entrar:
    //
    //   "existe a situação em que 1 modelo grande é realizado por vários
    //    responsáveis e situações onde vários modelos são pesados juntos pelo
    //    mesmo usuário, situação onde precisaria selecionar vários modelos e
    //    criar um volume e pesar volumes individualmente, e situações onde
    //    precisa dividir o mesmo modelo em vários volumes, nada disso invalida
    //    o campo já existente onde precisa informar o peso total do setor."
    //
    // O volume é a CAIXA: número, tipo, o peso da balança, quem pesou, e uma
    // lista de modelos com QUANTIDADE. É a quantidade que faz as três primeiras
    // situações caberem num desenho só — um modelo repartido em três volumes,
    // três modelos num volume, e cada volume com o seu dono.
    //
    // ## O que não mudou, de propósito
    //
    // O campo do peso do setor continua digitado à mão, continua comparado com
    // o estimado e continua pedindo a senha acima de 5 %. Os volumes só põem
    // uma SOMA ao lado dele, para conferir, e um botão para adotá-la. Setor sem
    // volume nenhum vale como 1 volume único, e a tela diz isso em texto: o
    // pedido simples, que é a maioria, não ganhou cadastro nenhum.
    //
    // ## Por que as duas tabelas são NOSSAS
    //
    // `propostas_os_setores` tem `qtd_volumes` e `tipo_volume`, e daria para
    // gravar ali. Em 23/08/2026 o usuário decidiu que não — os volumes ficam só
    // do nosso lado, e aquelas colunas continuam sendo do ERP.
    //
    // A decisão tem um efeito prático que vale registrar: a ficha do parceiro
    // tem RLS de `authenticated`, e na estação o operador entra pelo código
    // local, sem sessão — é por isso que o peso precisa do desvio pelo agente e
    // da Edge Function. Em tabela nossa, com política de `public` (a mesma de
    // `producao_numeracoes`), a estação grava DIRETO pelo PostgREST. Os volumes
    // não têm o par de caminhos do `gravarPeso`, e não precisam ter.
    //
    // Ver `sql/volumes_do_acabamento.sql`.

    const TABELA_DE_VOLUMES = 'producao_volumes';
    const TABELA_DE_ITENS_DO_VOLUME = 'producao_volume_itens';

    // Os tipos que a gráfica usa. A coluna é texto livre no banco de propósito —
    // um CHECK ali não protegeria nada e travaria o dia em que aparecer um
    // formato novo —, mas a tela oferece estes cinco para os nomes não
    // divergirem de operador para operador.
    const TIPOS_DE_VOLUME = ['Caixa', 'Pacote', 'Fardo', 'Rolo', 'Palete'];

    const ESTILO_BOTAO_VOLUME = 'background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);'
        + ' color: #cfe6fb; border-radius: 6px; padding: 5px 10px; font-size: 0.74rem;'
        + ' font-weight: 700; cursor: pointer; font-family: inherit;';

    /**
     * As linhas cruas do banco viram `{ SETOR: [volume, …] }`, cada volume com
     * os seus itens. Pura, para o teste.
     *
     * Setor que o banco não aceita fica de fora: não há campo de peso para ele,
     * e um volume pendurado num setor que a tela não desenha seria peso que
     * ninguém encontra depois.
     */
    function agruparVolumes(linhas) {
        const porSetor = {};
        (linhas || []).forEach(l => {
            if (!l) return;
            const setor = normalizar(l.setor);
            if (SETORES_DO_BANCO.indexOf(setor) === -1) return;
            const itens = (l[TABELA_DE_ITENS_DO_VOLUME] || l.itens || [])
                .map(i => ({
                    modeloId: String(i.modelo_id !== undefined ? i.modelo_id : i.modeloId),
                    qtd: Math.max(0, parseInt(i.qtd, 10) || 0),
                }))
                .filter(i => i.qtd > 0);
            (porSetor[setor] = porSetor[setor] || []).push({
                id: l.id,
                setor,
                numero: parseInt(l.numero, 10) || 0,
                tipo: (l.tipo || '').trim(),
                peso: (l.peso_kg === null || l.peso_kg === undefined) ? null : Number(l.peso_kg),
                responsavel: (l.responsavel || '').trim(),
                observacao: (l.observacao || '').trim(),
                criadoEm: l.criado_em || '',
                itens,
            });
        });
        Object.keys(porSetor).forEach(s => porSetor[s].sort((a, b) => a.numero - b.numero));
        return porSetor;
    }

    /** Os volumes de um setor no pedido aberto. Nunca `undefined`. */
    function volumesDoSetor(setor) {
        return tela.volumes[normalizar(setor)] || [];
    }

    function todosOsVolumes() {
        return Object.keys(tela.volumes)
            .reduce((tudo, s) => tudo.concat(tela.volumes[s] || []), []);
    }

    /**
     * A soma dos pesos, em kg.
     *
     * Volume sem peso conta como zero — ele existe, só não foi à balança ainda.
     * A soma é feita em GRAMAS inteiras e dividida no fim: somar `0.1 + 0.2` em
     * ponto flutuante dá `0.30000000000000004`, e a diferença contra o peso do
     * setor viraria um aviso âmbar em cima de nada.
     */
    function somaDosVolumes(lista) {
        const gramas = (lista || []).reduce((s, v) => {
            const p = Number(v && v.peso);
            return s + (isFinite(p) && p > 0 ? Math.round(p * 1000) : 0);
        }, 0);
        return gramas / 1000;
    }

    /** Quantas unidades de cada modelo já estão em algum volume: `id -> qtd`. */
    function embaladoPorModelo(lista) {
        const mapa = {};
        (lista || []).forEach(v => (v.itens || []).forEach(i => {
            const id = String(i.modeloId);
            mapa[id] = (mapa[id] || 0) + i.qtd;
        }));
        return mapa;
    }

    /** A tiragem do modelo, lida do mesmo jeito que o card a lê. */
    function qtdDoModelo(item) {
        const q = (item && item.qtd !== undefined && item.qtd !== null)
            ? item.qtd : (item ? item.quantidade : 0);
        return Math.max(0, parseInt(q, 10) || 0);
    }

    /**
     * Quanto do modelo ainda está fora de volume.
     *
     * Nunca negativo. Se alguém embalou mais do que a tiragem — corrigindo uma
     * quantidade depois, por exemplo —, o que a tela precisa dizer é "não falta
     * nada", e não um número negativo que ninguém sabe ler de pé na estação.
     */
    function faltaEmbalar(item, embalado) {
        const dentro = (embalado || {})[String(item && item.id)] || 0;
        return Math.max(0, qtdDoModelo(item) - dentro);
    }

    /** V1, V2, V3… O próximo é o maior mais um, e buraco não se reaproveita. */
    function proximoNumeroDeVolume(lista) {
        return (lista || []).reduce((m, v) => Math.max(m, v.numero || 0), 0) + 1;
    }

    /**
     * Os modelos do setor que ainda têm unidade fora de volume.
     *
     * Só faz sentido quando HÁ volume: setor sem nenhum é um volume único, e
     * dizer ali que "5.000 estão fora de caixa" seria uma cobrança inventada.
     */
    function faltandoNoSetor(setor, itens) {
        const lista = volumesDoSetor(setor);
        if (!lista.length) return [];
        const embalado = embaladoPorModelo(lista);
        const alvo = normalizar(setor);
        return (itens || [])
            .filter(i => normalizar(i && i.setor) === alvo)
            .map(i => ({ item: i, falta: faltaEmbalar(i, embalado) }))
            .filter(x => x.falta > 0);
    }

    /**
     * Peso do setor menos a soma dos volumes, em GRAMAS. `null` quando não há o
     * que comparar — sem volume, ou sem peso digitado.
     */
    function diferencaDosVolumes(setor) {
        const lista = volumesDoSetor(setor);
        if (!lista.length) return null;
        const linha = tela.pesos[normalizar(setor)];
        const peso = (linha && linha.peso !== null && linha.peso !== undefined)
            ? Number(linha.peso) : null;
        if (peso === null || !isFinite(peso) || peso <= 0) return null;
        const soma = somaDosVolumes(lista);
        if (soma <= 0) return null;
        return Math.round(peso * 1000) - Math.round(soma * 1000);
    }

    /** "20 g", "1,250 kg" — a diferença dita como o operador a lê. */
    function textoDaDiferenca(gramas) {
        const g = Math.abs(gramas || 0);
        return g < 1000 ? `${g} g` : `${kgParaTexto(g / 1000)} kg`;
    }

    /** O nome do modelo como o card o escreve. */
    function nomeDoModelo(item) {
        return (item && (item.produto || item.nome_modelo)) || 'Modelo';
    }

    function numeroComPonto(n) {
        return (parseInt(n, 10) || 0).toLocaleString('pt-BR');
    }

    /**
     * Lê os volumes do pedido.
     *
     * Um caminho só, porque a tabela é nossa: o mesmo código serve à estação
     * (chave anônima) e ao site com sessão. Falha não derruba nada — sem
     * volume a tela mostra "1 volume único", que é o que ela mostraria de
     * qualquer jeito se não houvesse volume nenhum.
     */
    async function carregarVolumes(numeroDoPedido) {
        tela.volumes = {};
        tela.volumesDoPedido = numeroDoPedido;

        const idInt = parseInt(numeroDoPedido);
        if (isNaN(idInt)) return;
        const aberto = tela.pedidoAberto;

        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
            const { data, error } = await supabaseClient
                .from(TABELA_DE_VOLUMES)
                .select('id, setor, numero, tipo, peso_kg, responsavel, observacao, criado_em, '
                      + TABELA_DE_ITENS_DO_VOLUME + '(modelo_id, qtd)')
                .eq('id_int', idInt);
            if (error) throw error;
            // O pedido pode ter sido trocado enquanto a leitura voava; o
            // resultado de um não pode aparecer no outro.
            if (tela.pedidoAberto !== aberto) return;
            tela.volumes = agruparVolumes(data);
        } catch (e) {
            console.warn('[acabamento] não deu para ler os volumes:', e);
            tela.volumes = {};
        }
    }

    /**
     * Grava um volume — novo ou editado — e o que vai dentro dele.
     *
     * Os itens são reescritos por inteiro (apaga tudo e insere de novo) em vez
     * de reconciliados linha a linha. É a operação mais simples que dá o
     * resultado certo, e um volume tem três ou quatro itens, não trezentos.
     */
    async function gravarVolume(v) {
        const idInt = parseInt(v.numeroDoPedido);
        if (isNaN(idInt)) throw new Error('este pedido não tem número');
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            throw new Error('esta tela está sem conexão com o banco');
        }

        const campos = {
            setor: normalizar(v.setor),
            tipo: v.tipo || null,
            peso_kg: (v.peso === null || v.peso === undefined) ? null : v.peso,
            responsavel: v.responsavel || null,
            observacao: v.observacao || null,
        };

        let id = v.volumeId || null;
        if (id) {
            const { error } = await supabaseClient
                .from(TABELA_DE_VOLUMES).update(campos).eq('id', id);
            if (error) throw error;
        } else {
            campos.id_int = idInt;
            campos.numero = v.numero;
            const { data, error } = await supabaseClient
                .from(TABELA_DE_VOLUMES).insert(campos).select('id').single();
            if (error) throw error;
            id = data.id;
        }

        const { error: erroApagar } = await supabaseClient
            .from(TABELA_DE_ITENS_DO_VOLUME).delete().eq('volume_id', id);
        if (erroApagar) throw erroApagar;

        const linhas = (v.itens || [])
            .filter(i => i && i.qtd > 0)
            .map(i => ({ volume_id: id, modelo_id: parseInt(i.modeloId, 10), qtd: i.qtd }));
        if (linhas.length) {
            const { error: erroInserir } = await supabaseClient
                .from(TABELA_DE_ITENS_DO_VOLUME).insert(linhas);
            if (erroInserir) throw erroInserir;
        }
        return id;
    }

    /** Os itens vão junto, pelo `on delete cascade` da tabela. */
    async function apagarVolume(volumeId) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            throw new Error('esta tela está sem conexão com o banco');
        }
        const { error } = await supabaseClient
            .from(TABELA_DE_VOLUMES).delete().eq('id', volumeId);
        if (error) throw error;
    }

    // ─── A faixa de volumes, dentro do card do setor ────────────────────────

    /**
     * Um chip por volume. Clicar abre a lista do setor.
     *
     * Volume sem peso sai em âmbar em vez de sair escondido: ele conta na
     * carga e não conta na soma, e essa é exatamente a diferença que o
     * operador precisa enxergar antes de mandar para a expedição.
     */
    function chipDoVolume(v) {
        const temPeso = v.peso !== null && v.peso !== undefined && v.peso > 0;
        const peso = temPeso ? `${kgParaTexto(v.peso)} kg` : 'sem peso';
        return `
            <button type="button" onclick="AcabamentoPainel.verVolumes('${escJs(v.setor)}')"
                    title="Volume ${esc(v.numero)}${v.tipo ? ' · ' + esc(v.tipo) : ''} — clique para ver a lista"
                    style="display: inline-flex; align-items: center; gap: 6px;
                           background: rgba(76,200,240,0.10); border: 1px solid rgba(76,200,240,0.30);
                           border-radius: 6px; padding: 4px 9px; font-size: 0.74rem; color: #cfe6fb;
                           cursor: pointer; font-family: inherit;">
                <strong style="color: #4cc8f0;">V${esc(v.numero)}</strong>
                <span style="font-family: monospace; color: ${temPeso ? '#cfe6fb' : '#fbbf24'};">${esc(peso)}</span>
                ${v.responsavel ? `<span style="color: var(--text-dim);">${esc(v.responsavel)}</span>` : ''}
            </button>`;
    }

    /**
     * A faixa embaixo do campo do peso.
     *
     * Sem volume ela NÃO fica vazia: diz que o setor sai como volume único e
     * oferece o botão de dividir. Espaço em branco ali faria o operador
     * procurar um recurso que a tela não mostra.
     */
    function faixaDeVolumes(setor, itens, numeroDoPedido) {
        const lista = volumesDoSetor(setor);
        const pode = podeEditar();
        const borda = 'border-top: 1px dashed rgba(76,200,240,0.22); padding-top: 9px;';
        const criar = `<button type="button" style="${ESTILO_BOTAO_VOLUME}"
                onclick="AcabamentoPainel.novoVolume('${escJs(setor)}', '${escJs(numeroDoPedido)}')"`;

        if (!lista.length) {
            const linha = tela.pesos[setor];
            const kg = (linha && linha.peso) ? ` de ${kgParaTexto(linha.peso)} kg` : '';
            return `
                <div style="${borda} display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 0.9rem; opacity: 0.6;">📦</span>
                    <span style="font-size: 0.74rem; color: var(--text-dim);">Sem volumes — este setor sai como
                        <strong style="color: #cfe6fb;">1 volume único</strong>${esc(kg)}.</span>
                    ${pode ? `<span style="margin-left: auto;">${criar}
                        title="Registrar as caixas deste setor, uma a uma">Dividir em volumes</button></span>` : ''}
                </div>`;
        }

        const soma = somaDosVolumes(lista);
        const dif = diferencaDosVolumes(setor);
        const faltando = faltandoNoSetor(setor, itens);

        let recado = '';
        if (faltando.length) {
            const quais = faltando
                .map(x => `${esc(nomeDoModelo(x.item))} (${numeroComPonto(x.falta)})`)
                .join(' · ');
            recado = `<div style="font-size: 0.72rem; color: #fbbf24;">⚠ ainda fora de volume: ${quais}</div>`;
        } else if (dif !== null && dif !== 0) {
            recado = `<div style="font-size: 0.72rem; color: #fbbf24;">⚠ o peso do setor está `
                   + `${esc(textoDaDiferenca(dif))} ${dif > 0 ? 'acima' : 'abaixo'} da soma dos volumes — `
                   + `confira, ou use a soma.</div>`;
        }

        return `
            <div style="${borda} display: flex; flex-direction: column; gap: 7px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 0.9rem;">📦</span>
                    <strong style="font-size: 0.78rem;">${lista.length} ${lista.length === 1 ? 'volume' : 'volumes'}</strong>
                    <span style="font-size: 0.74rem; color: var(--text-dim);">somam</span>
                    <span style="font-size: 0.78rem; font-family: monospace;">${esc(kgParaTexto(soma))} kg</span>
                    <span style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
                        <button type="button" style="${ESTILO_BOTAO_VOLUME}"
                                onclick="AcabamentoPainel.verVolumes('${escJs(setor)}')"
                                title="Ver, editar ou excluir os volumes deste setor">Ver volumes</button>
                        ${pode ? `${criar} title="Criar mais um volume neste setor">+ Volume</button>` : ''}
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    ${lista.map(chipDoVolume).join('')}
                </div>
                ${recado}
            </div>`;
    }

    /**
     * O bloco VOLUMES no card do modelo, embaixo do Responsável.
     *
     * Só aparece quando o setor tem volume. Num setor de volume único não há
     * nada a dizer no card, e um bloco dizendo "nenhum" seria ruído em cima da
     * coluna mais apertada da tela.
     */
    function blocoDeVolumesDoModelo(item) {
        const setor = normalizar(item && item.setor);
        if (SETORES_DO_BANCO.indexOf(setor) === -1) return '';
        const lista = volumesDoSetor(setor);
        if (!lista.length) return '';

        const meus = lista
            .map(v => ({ v, i: (v.itens || []).find(x => String(x.modeloId) === String(item.id)) }))
            .filter(x => x.i);
        const dentro = meus.reduce((s, x) => s + x.i.qtd, 0);
        const total = qtdDoModelo(item);
        const falta = Math.max(0, total - dentro);

        const chips = meus.length
            ? meus.map(x => `
                <span style="display: inline-flex; align-items: center; gap: 5px;
                             background: rgba(76,200,240,0.12); border: 1px solid rgba(76,200,240,0.32);
                             border-radius: 6px; padding: 3px 8px; font-size: 0.74rem;">
                    <strong style="color: #4cc8f0;">V${esc(x.v.numero)}</strong>
                    <span style="font-family: monospace;">${numeroComPonto(x.i.qtd)} un</span>
                </span>`).join('')
            : `<span style="font-size: 0.74rem; color: var(--text-dim);">nenhum volume ainda</span>`;

        const conta = falta > 0
            ? `<span style="font-size: 0.72rem; color: #fbbf24;">${numeroComPonto(dentro)} de `
              + `${numeroComPonto(total)} embalados · ${numeroComPonto(falta)} fora</span>`
            : `<span style="font-size: 0.72rem; color: #22c55e;">✓ ${numeroComPonto(total)} de `
              + `${numeroComPonto(total)} embalados</span>`;

        return `
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Volumes</span>
                <div style="display: flex; flex-direction: column; gap: 5px;
                            background: rgba(76,200,240,0.07); border: 1px solid rgba(76,200,240,0.20);
                            border-radius: 8px; padding: 8px 10px;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">${chips}</div>
                    ${conta}
                </div>
            </div>`;
    }

    // ─── Escolher os modelos que vão no volume ──────────────────────────────
    //
    // O "+ Volume" põe a lista do pedido em modo de escolha, em vez de abrir
    // uma janela com uma segunda lista de modelos dentro. O motivo é que a
    // primeira lista já está na tela, com foto, cor, tiragem e estágio: pedir
    // ao operador que reconheça o mesmo material numa lista mais pobre, dentro
    // de um popup, é trabalho que a tela já fez por ele.
    //
    // Modelo de OUTRO setor continua desenhado, apagado e sem caixa de marcar.
    // Escondê-lo faria o pedido parecer menor do que é bem na hora de conferir
    // o que já está embalado.

    function abrirEscolhaDeModelos(setor, numeroDoPedido) {
        if (!podeEditar()) return;
        tela.escolhaDeVolume = {
            setor: normalizar(setor),
            numeroDoPedido,
            marcados: {},
        };
        renderDetalhe();
    }

    function alternarModeloNaEscolha(itemId) {
        const e = tela.escolhaDeVolume;
        if (!e) return;
        const id = String(itemId);
        if (e.marcados[id]) delete e.marcados[id];
        else e.marcados[id] = true;
        renderDetalhe();
    }

    function cancelarEscolhaDeModelos() {
        tela.escolhaDeVolume = null;
        renderDetalhe();
    }

    /** Este modelo pode ser marcado agora? */
    function marcavelNaEscolha(item) {
        const e = tela.escolhaDeVolume;
        return !!(e && normalizar(item && item.setor) === e.setor);
    }

    function marcadoNaEscolha(item) {
        const e = tela.escolhaDeVolume;
        return !!(e && item && e.marcados[String(item.id)]);
    }

    /** A caixa de marcar no canto do card, só no modo de escolha. */
    function caixaDeEscolha(item) {
        const e = tela.escolhaDeVolume;
        if (!e) return '';
        if (!marcavelNaEscolha(item)) {
            return `<span title="Este modelo é de outro setor"
                          style="width: 22px; height: 22px; min-width: 22px; border-radius: 6px;
                                 background: #0d0e20; border: 1px dashed rgba(207,230,251,0.30);
                                 display: inline-block;"></span>`;
        }
        const marcado = marcadoNaEscolha(item);
        return `
            <button type="button" onclick="AcabamentoPainel.marcarModelo('${escJs(item.id)}')"
                    aria-pressed="${marcado ? 'true' : 'false'}"
                    title="${marcado ? 'Tirar deste volume' : 'Pôr neste volume'}"
                    style="width: 22px; height: 22px; min-width: 22px; border-radius: 6px; padding: 0;
                           display: inline-flex; align-items: center; justify-content: center;
                           cursor: pointer; font-weight: 800; font-size: 0.9rem; font-family: inherit;
                           ${marcado
                              ? 'background: #4cc8f0; border: 1px solid #4cc8f0; color: #001249;'
                              : 'background: #0d0e20; border: 1px solid rgba(76,200,240,0.35); color: transparent;'}">✓</button>`;
    }

    /** O contorno do card durante a escolha: marcado salta, outro setor apaga. */
    function estiloDoCardNaEscolha(item) {
        const e = tela.escolhaDeVolume;
        if (!e) return `outline: 1px solid ${AZUL.fio};`;
        if (!marcavelNaEscolha(item)) return `outline: 1px solid ${AZUL.fio}; opacity: 0.42;`;
        return marcadoNaEscolha(item)
            ? 'outline: 2px solid #4cc8f0;'
            : `outline: 1px solid ${AZUL.fio};`;
    }

    /** A faixa que anuncia o modo, acima dos modelos. */
    function faixaDaEscolha() {
        const e = tela.escolhaDeVolume;
        if (!e) return '';
        return `
            <div style="display: flex; align-items: center; gap: 10px; background: #120a8f;
                        border: 1px solid #4cc8f0; border-radius: 8px; padding: 9px 14px; margin-bottom: 12px;">
                <span style="font-size: 1rem;">📦</span>
                <strong style="font-size: 0.86rem; color: #ffffff;">Escolha o que vai neste volume</strong>
                <span style="font-size: 0.74rem; color: #cfe6fb;">setor ${esc(nomeDoSetor(e.setor))}</span>
                <button type="button" onclick="AcabamentoPainel.cancelarVolume()"
                        style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                               color: #ffffff; border-radius: 8px; padding: 5px 12px; font-size: 0.78rem;
                               font-weight: 700; cursor: pointer; font-family: inherit;">Cancelar</button>
            </div>`;
    }

    /** A barra do fim da lista, com a conta do que foi marcado. */
    function barraDaEscolha(itens) {
        const e = tela.escolhaDeVolume;
        if (!e) return '';
        const marcados = (itens || []).filter(i => marcadoNaEscolha(i));
        const embalado = embaladoPorModelo(volumesDoSetor(e.setor));
        const unidades = marcados.reduce((s, i) => s + faltaEmbalar(i, embalado), 0);
        const vazio = !marcados.length;

        return `
            <div style="display: flex; align-items: center; gap: 12px; background: ${AZUL.fundo};
                        border: 1px solid #4cc8f0; border-radius: 10px; padding: 12px 16px;
                        box-shadow: 0 -6px 24px rgba(0,0,0,0.45);">
                <span style="font-size: 1.05rem;">📦</span>
                <strong style="font-size: 0.9rem; color: #ffffff;">
                    ${vazio ? 'Nenhum modelo escolhido' : `${marcados.length} ${marcados.length === 1 ? 'modelo escolhido' : 'modelos escolhidos'}`}
                </strong>
                ${vazio ? '' : `<span style="font-size: 0.8rem; color: var(--text-dim); font-family: monospace;">${numeroComPonto(unidades)} un</span>`}
                <span style="margin-left: auto; display: flex; gap: 10px;">
                    <button type="button" onclick="AcabamentoPainel.cancelarVolume()"
                            style="background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);
                                   color: #cfe6fb; border-radius: 8px; padding: 10px 18px; font-weight: 700;
                                   font-size: 0.86rem; cursor: pointer; font-family: inherit;">Cancelar</button>
                    <button type="button" onclick="AcabamentoPainel.pesarVolume()" ${vazio ? 'disabled' : ''}
                            style="border-radius: 8px; padding: 10px 22px; font-weight: 800; letter-spacing: 0.05em;
                                   font-size: 0.86rem; font-family: inherit;
                                   ${vazio
                                      ? 'background: rgba(43,50,175,0.35); border: 1px solid rgba(76,205,246,0.20); color: #7fa9d4; cursor: not-allowed;'
                                      : 'background: linear-gradient(135deg, #4a61e8, #120a8f); border: 1px solid #4cc8f0; color: #ffffff; cursor: pointer;'}">
                        Pesar este volume
                    </button>
                </span>
            </div>`;
    }

    // ─── A janela de pesar o volume ─────────────────────────────────────────
    //
    // Diferente das outras janelas deste arquivo, esta é montada INTEIRA a cada
    // abertura, em vez de montada uma vez e repintada. O conteúdo dela depende
    // de quais modelos entraram — o número de linhas muda a cada volume —, e
    // repintar uma lista de tamanho variável dentro de uma casca fixa daria
    // mais código do que refazê-la.

    function fecharPopupDoVolume() {
        const caixa = document.getElementById('acab-volume-janela');
        if (caixa && caixa.parentNode) caixa.parentNode.removeChild(caixa);
        tela.volumeEmEdicao = null;
    }

    /** Monta `tela.volumeEmEdicao` a partir da escolha, ou de um volume que já existe. */
    function prepararVolumeEmEdicao(volumeId) {
        const s = estado();
        const itens = (s.osItens && s.osItens[tela.pedidoAberto]) || [];
        const os = (s.ordens || []).find(o => String(o.id) === String(tela.pedidoAberto));
        const numeroDoPedido = os ? os.numero : tela.pedidoAberto;

        if (volumeId) {
            const v = todosOsVolumes().find(x => String(x.id) === String(volumeId));
            if (!v) return null;
            return {
                numeroDoPedido, setor: v.setor, volumeId: v.id, numero: v.numero,
                tipo: v.tipo || TIPOS_DE_VOLUME[0], peso: v.peso,
                responsavel: v.responsavel, observacao: v.observacao,
                itens: v.itens.map(i => ({ modeloId: i.modeloId, qtd: i.qtd })),
            };
        }

        const e = tela.escolhaDeVolume;
        if (!e) return null;
        const lista = volumesDoSetor(e.setor);
        const embalado = embaladoPorModelo(lista);
        return {
            numeroDoPedido, setor: e.setor, volumeId: null,
            numero: proximoNumeroDeVolume(lista),
            tipo: TIPOS_DE_VOLUME[0], peso: null, responsavel: '', observacao: '',
            // A quantidade nasce com o que AINDA ESTÁ FORA de volume. É o
            // caminho de um clique para "esta caixa leva o resto", e diminuir
            // esse número é o que reparte o modelo em várias caixas.
            itens: Object.keys(e.marcados).map(id => {
                const item = itens.find(i => String(i.id) === id);
                return { modeloId: id, qtd: item ? faltaEmbalar(item, embalado) : 0 };
            }).filter(i => i.qtd > 0),
        };
    }

    function linhaDoItemDoVolume(i, item, livre) {
        return `
            <div style="display: flex; align-items: center; gap: 12px; background: ${AZUL.superficie};
                        border: 1px solid rgba(76,200,240,0.20); border-radius: 8px; padding: 10px 12px;">
                <strong style="font-size: 0.92rem; color: #ffffff; flex: 1 1 auto; min-width: 0;">${esc(nomeDoModelo(item))}</strong>
                <span style="font-size: 0.74rem; color: var(--text-dim); white-space: nowrap;">
                    ${numeroComPonto(livre)} livres de ${numeroComPonto(qtdDoModelo(item))}
                </span>
                <input type="text" inputmode="numeric" id="acab-vol-qtd-${esc(i.modeloId)}"
                       value="${esc(numeroComPonto(i.qtd))}"
                       style="width: 92px; text-align: right; background: ${AZUL.fundo};
                              border: 1px solid rgba(76,200,240,0.26); border-radius: 6px; color: #ffffff;
                              padding: 8px 10px; font-size: 0.92rem; font-family: monospace;" />
                <span style="font-size: 0.78rem; color: var(--text-dim);">un</span>
            </div>`;
    }

    function abrirPopupDoVolume(volumeId) {
        const preparado = prepararVolumeEmEdicao(volumeId);
        if (!preparado) return;
        tela.volumeEmEdicao = preparado;
        fecharPopupDosVolumes();

        const s = estado();
        const itens = (s.osItens && s.osItens[tela.pedidoAberto]) || [];
        const lista = volumesDoSetor(preparado.setor);
        // No modo edição, o que já está NESTE volume não conta como ocupado —
        // senão o próprio item apareceria como "0 livres" e o operador não
        // conseguiria corrigir a quantidade que ele mesmo acabou de gravar.
        const embalado = embaladoPorModelo(
            lista.filter(v => String(v.id) !== String(preparado.volumeId || '')));

        const caixa = document.createElement('div');
        caixa.id = 'acab-volume-janela';
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100005; display: flex;'
            + ' align-items: center; justify-content: center; background: rgba(6,7,13,0.92); padding: 18px;';
        caixa.innerHTML = `
            <div style="width: min(760px, 96vw); max-height: 92vh; overflow: auto; background: ${AZUL.fundo};
                        border: 1px solid rgba(76,200,240,0.28); border-radius: 12px;
                        display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px;
                            background: #120a8f; border-bottom: 1px solid rgba(76,200,240,0.24);">
                    <span style="font-size: 1.2rem;">📦</span>
                    <strong style="font-size: 1.05rem; color: #ffffff;">Volume ${esc(preparado.numero)} — setor ${esc(nomeDoSetor(preparado.setor))}</strong>
                    <span style="font-size: 0.78rem; color: #cfe6fb;">Pedido ${esc(preparado.numeroDoPedido)}</span>
                    <button type="button" onclick="AcabamentoPainel.fecharVolume()"
                            style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px; font-weight: 700;
                                   cursor: pointer; font-family: inherit;">✕</button>
                </div>

                <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 14px;">
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <span style="font-size: 0.78rem; color: #7fa9d4; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;">O que vai dentro</span>
                        ${preparado.itens.map(i => {
                            const item = itens.find(x => String(x.id) === String(i.modeloId));
                            return linhaDoItemDoVolume(i, item || {}, faltaEmbalar(item || {}, embalado));
                        }).join('')}
                        <div style="font-size: 0.74rem; color: var(--text-dim); line-height: 1.5;">
                            A quantidade vem cheia com o que ainda está fora de volume. Diminuir aqui é o que
                            <strong style="color: #cfe6fb;">divide um modelo em vários volumes</strong> —
                            o resto continua livre para o próximo.
                        </div>
                    </div>

                    <div style="border-top: 1px solid rgba(76,200,240,0.18);"></div>

                    <div style="display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;">
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Tipo</span>
                            <select id="acab-vol-tipo" style="${ESTILO_SELECT} width: 150px; font-size: 0.95rem;">
                                ${TIPOS_DE_VOLUME.map(t => `<option value="${esc(t)}" ${t === preparado.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Peso na balança</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <input type="text" inputmode="decimal" id="acab-vol-peso" autocomplete="off"
                                       value="${esc(pesoParaTexto(preparado.peso))}" placeholder="0,00"
                                       style="width: 140px; text-align: right; background: ${AZUL.fundo};
                                              border: 1px solid rgba(76,200,240,0.26); border-radius: 6px;
                                              color: #ffffff; padding: 8px 10px; font-size: 1.25rem;
                                              font-family: monospace;" />
                                <span style="font-size: 0.95rem; color: #7fa9d4;">kg</span>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 5px; flex: 1 1 200px;">
                            <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Quem pesou</span>
                            ${selectDeQuemPesou(preparado.responsavel)}
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;">Observação (opcional)</span>
                        <input type="text" id="acab-vol-obs" value="${esc(preparado.observacao || '')}"
                               placeholder="caixa dupla, fita reforçada…"
                               style="background: ${AZUL.fundo}; border: 1px solid rgba(76,200,240,0.26);
                                      border-radius: 6px; color: #ffffff; padding: 8px 10px; font-size: 0.88rem;" />
                    </div>

                    <div id="acab-vol-erro" style="min-height: 1.2em; font-size: 0.82rem; color: #f87171;"></div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px;
                            border-top: 1px solid rgba(76,200,240,0.18); flex-wrap: wrap;">
                    <span style="font-size: 0.78rem; color: #7fa9d4;">Depois de gravado, o volume aparece na faixa do setor.</span>
                    <span style="margin-left: auto; display: flex; gap: 10px;">
                        <button type="button" onclick="AcabamentoPainel.fecharVolume()"
                                style="background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);
                                       color: #cfe6fb; border-radius: 8px; padding: 10px 18px; font-weight: 700;
                                       cursor: pointer; font-family: inherit;">Cancelar</button>
                        <button type="button" id="acab-vol-ok" onclick="AcabamentoPainel.confirmarVolume()"
                                style="background: linear-gradient(135deg, #4a61e8, #120a8f); border: 1px solid #4cc8f0;
                                       color: #ffffff; border-radius: 8px; padding: 10px 22px; font-weight: 800;
                                       letter-spacing: 0.05em; cursor: pointer; font-family: inherit;">Gravar volume</button>
                    </span>
                </div>
            </div>`;
        document.body.appendChild(caixa);

        const campo = document.getElementById('acab-vol-peso');
        if (campo) {
            campo.addEventListener('keydown', ev => {
                if (ev && ev.key === 'Enter') { ev.preventDefault(); confirmarVolume(); }
            });
            try { campo.focus(); campo.select(); } catch (ignorado) { /* sem foco não há problema */ }
        }
    }

    /**
     * Quem pesou sai da MESMA lista do responsável do card.
     *
     * Texto livre aqui faria "Ana", "ana" e "Ana Paula" virarem três pessoas na
     * hora de conferir quem embalou o quê.
     */
    function selectDeQuemPesou(atual) {
        const todos = (tela.operadores || []).filter(o => o.role === PERFIL_DO_RESPONSAVEL);
        const nomes = todos.map(o => o.nome);
        const escolhido = (atual || '').trim();
        if (escolhido && !nomes.some(n => n.toLowerCase() === escolhido.toLowerCase())) {
            nomes.unshift(escolhido);
        }
        const opcoes = ['<option value="">— Quem pesou —</option>'].concat(
            nomes.map(n => `<option value="${esc(n)}" ${n.toLowerCase() === escolhido.toLowerCase() ? 'selected' : ''}>${esc(n)}</option>`)
        ).join('');
        return `<select id="acab-vol-responsavel" style="${ESTILO_SELECT} font-size: 0.95rem;">${opcoes}</select>`;
    }

    /** O texto de um campo de quantidade: "2.000" e "2000" são o mesmo número. */
    function qtdDoTexto(texto) {
        const limpo = String(texto === undefined || texto === null ? '' : texto).replace(/[^\d]/g, '');
        return Math.max(0, parseInt(limpo, 10) || 0);
    }

    async function confirmarVolume() {
        const v = tela.volumeEmEdicao;
        if (!v) { fecharPopupDoVolume(); return; }

        const erro = document.getElementById('acab-vol-erro');
        const dizer = t => { if (erro) erro.textContent = t; };

        const campoPeso = document.getElementById('acab-vol-peso');
        const textoDoPeso = String(campoPeso && campoPeso.value ? campoPeso.value : '').trim();
        const peso = pesoDoTexto(textoDoPeso);
        if (peso === undefined) {
            dizer(`"${textoDoPeso}" não é um peso. Use só números, como 4,16.`);
            return;
        }

        const itens = v.itens.map(i => {
            const campo = document.getElementById('acab-vol-qtd-' + i.modeloId);
            return { modeloId: i.modeloId, qtd: qtdDoTexto(campo ? campo.value : i.qtd) };
        }).filter(i => i.qtd > 0);

        if (!itens.length) {
            dizer('Um volume precisa de pelo menos um modelo com quantidade.');
            return;
        }

        const tipo = document.getElementById('acab-vol-tipo');
        const responsavel = document.getElementById('acab-vol-responsavel');
        const observacao = document.getElementById('acab-vol-obs');

        const botao = document.getElementById('acab-vol-ok');
        if (botao) { botao.disabled = true; botao.textContent = 'Gravando…'; }
        try {
            await gravarVolume({
                numeroDoPedido: v.numeroDoPedido,
                setor: v.setor,
                volumeId: v.volumeId,
                numero: v.numero,
                tipo: tipo ? tipo.value : '',
                peso,
                responsavel: responsavel ? responsavel.value : '',
                observacao: observacao ? observacao.value : '',
                itens,
            });
            await carregarVolumes(v.numeroDoPedido);
            tela.escolhaDeVolume = null;
            fecharPopupDoVolume();
            renderDetalhe();
            avisar(`Volume ${v.numero} do setor ${nomeDoSetor(v.setor)} gravado.`, 'success');
        } catch (e) {
            console.error('[acabamento] erro ao gravar o volume:', e);
            // A trava do banco: dois operadores criando o mesmo número ao mesmo
            // tempo. A saída é recalcular o número, não pedir que ele adivinhe.
            const duplicado = String((e && e.message) || '').indexOf('producao_volumes_unico') !== -1;
            dizer(duplicado
                ? 'Outro operador acabou de criar este volume. Feche e clique em "+ Volume" de novo.'
                : `Não deu para gravar: ${(e && e.message) ? e.message : e}`);
        } finally {
            if (botao) { botao.disabled = false; botao.textContent = 'Gravar volume'; }
        }
    }

    async function excluirVolume(volumeId) {
        const v = todosOsVolumes().find(x => String(x.id) === String(volumeId));
        if (!v) return;
        const pergunta = `Excluir o volume ${v.numero} do setor ${nomeDoSetor(v.setor)}?`
            + (v.peso ? ` O peso de ${kgParaTexto(v.peso)} kg sai da soma.` : '')
            + ' Os modelos voltam a ficar livres para outro volume.';
        // A caixa da casa, e não o `confirm` do navegador: na estação o diálogo
        // nativo depende de o navegador querer desenhá-lo, e este é um botão
        // que apaga peso já conferido.
        const caixa = (typeof window !== 'undefined') ? window.caixaConfirmar : null;
        const ok = (caixa && typeof caixa.perguntar === 'function')
            ? await caixa.perguntar(pergunta, { rotulo: 'Excluir', perigo: true })
            : window.confirm(pergunta);
        if (!ok) return;

        try {
            await apagarVolume(volumeId);
            await carregarVolumes(tela.volumesDoPedido);
            fecharPopupDosVolumes();
            renderDetalhe();
            avisar(`Volume ${v.numero} excluído.`, 'success');
        } catch (e) {
            console.error('[acabamento] erro ao excluir o volume:', e);
            avisar(`Não deu para excluir o volume: ${(e && e.message) ? e.message : e}`, 'error');
        }
    }

    // ─── A lista dos volumes do setor ───────────────────────────────────────

    function fecharPopupDosVolumes() {
        const caixa = document.getElementById('acab-volumes-lista');
        if (caixa && caixa.parentNode) caixa.parentNode.removeChild(caixa);
    }

    function abrirVolumesDoSetor(setor) {
        const alvo = normalizar(setor);
        const lista = volumesDoSetor(alvo);
        const s = estado();
        const itens = (s.osItens && s.osItens[tela.pedidoAberto]) || [];
        const os = (s.ordens || []).find(o => String(o.id) === String(tela.pedidoAberto));
        const numeroDoPedido = os ? os.numero : tela.pedidoAberto;
        const pode = podeEditar();

        const soma = somaDosVolumes(lista);
        const linhaDoPeso = tela.pesos[alvo];
        const peso = (linhaDoPeso && linhaDoPeso.peso) ? Number(linhaDoPeso.peso) : null;
        const dif = diferencaDosVolumes(alvo);
        const faltando = faltandoNoSetor(alvo, itens);

        fecharPopupDosVolumes();
        const caixa = document.createElement('div');
        caixa.id = 'acab-volumes-lista';
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100004; display: flex;'
            + ' align-items: center; justify-content: center; background: rgba(6,7,13,0.92); padding: 18px;';

        const corpo = lista.length
            ? lista.map(v => {
                const dentro = (v.itens || []).map(i => {
                    const item = itens.find(x => String(x.id) === String(i.modeloId));
                    return `<span style="font-size: 0.76rem; background: rgba(76,200,240,0.08);
                                        border: 1px solid rgba(76,200,240,0.20); border-radius: 6px; padding: 3px 9px;">
                                ${esc(nomeDoModelo(item))} · <span style="font-family: monospace;">${numeroComPonto(i.qtd)} un</span>
                            </span>`;
                }).join('');
                const temPeso = v.peso !== null && v.peso !== undefined && v.peso > 0;
                return `
                <div style="background: ${AZUL.superficie}; border: 1px solid rgba(76,200,240,0.20);
                            border-radius: 8px; padding: 11px 13px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <span style="display: inline-flex; align-items: center; justify-content: center;
                                     min-width: 34px; padding: 4px 8px; border-radius: 6px;
                                     background: rgba(76,200,240,0.14); border: 1px solid rgba(76,200,240,0.35);
                                     color: #4cc8f0; font-weight: 800; font-size: 0.82rem;">V${esc(v.numero)}</span>
                        <span style="font-size: 0.86rem; font-weight: 600; color: #ffffff;">${esc(v.tipo || '—')}</span>
                        <span style="font-size: 0.8rem; color: var(--text-dim);">${esc(v.responsavel || 'sem responsável')}</span>
                        ${v.observacao ? `<span style="font-size: 0.74rem; color: #7fa9d4;">${esc(v.observacao)}</span>` : ''}
                        <span style="margin-left: auto; display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 1rem; font-family: monospace; color: ${temPeso ? '#ffffff' : '#fbbf24'};">
                                ${temPeso ? esc(kgParaTexto(v.peso)) + ' kg' : 'sem peso'}
                            </span>
                            ${pode ? `
                            <button type="button" style="${ESTILO_BOTAO_VOLUME}"
                                    onclick="AcabamentoPainel.editarVolume('${escJs(v.id)}')">Editar</button>
                            <button type="button" style="${ESTILO_BOTAO_VOLUME}"
                                    onclick="AcabamentoPainel.excluirVolume('${escJs(v.id)}')">Excluir</button>` : ''}
                        </span>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">${dentro}</div>
                </div>`;
            }).join('')
            : `<div style="padding: 18px; text-align: center; color: var(--text-dim); font-size: 0.86rem;">
                   Este setor ainda não tem volume. Ele sai como 1 volume único.
               </div>`;

        const cobertura = faltando.length
            ? `<span style="font-size: 0.74rem; color: #fbbf24;">⚠ ainda fora de volume: `
              + faltando.map(x => `${esc(nomeDoModelo(x.item))} (${numeroComPonto(x.falta)})`).join(' · ') + '</span>'
            : (lista.length
                ? `<span style="font-size: 0.74rem; color: #22c55e;">✓ todos os modelos do setor já estão em algum volume</span>`
                : '');

        const conferencia = lista.length ? `
            <div style="display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
                        background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.30);
                        border-radius: 8px; padding: 11px 13px;">
                <span style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;">Soma dos volumes</span>
                    <span style="font-size: 1.1rem; color: #ffffff; font-family: monospace;">${esc(kgParaTexto(soma))} kg</span>
                </span>
                <span style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;">Peso do setor</span>
                    <span style="font-size: 1.1rem; color: #ffffff; font-family: monospace;">${peso ? esc(kgParaTexto(peso)) + ' kg' : '—'}</span>
                </span>
                <span style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;">Diferença</span>
                    <span style="font-size: 1.1rem; font-family: monospace; color: ${dif ? '#fbbf24' : '#22c55e'};">
                        ${dif === null ? '—' : esc(textoDaDiferenca(dif))}
                    </span>
                </span>
                ${(pode && soma > 0) ? `
                <button type="button" style="${ESTILO_BOTAO_VOLUME} margin-left: auto; padding: 9px 16px; font-size: 0.84rem;"
                        onclick="AcabamentoPainel.usarSomaDosVolumes('${escJs(alvo)}')">
                    Usar ${esc(kgParaTexto(soma))} kg como peso do setor
                </button>` : ''}
            </div>` : '';

        caixa.innerHTML = `
            <div style="width: min(820px, 96vw); max-height: 92vh; overflow: auto; background: ${AZUL.fundo};
                        border: 1px solid rgba(76,200,240,0.28); border-radius: 12px;
                        display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px;
                            background: #120a8f; border-bottom: 1px solid rgba(76,200,240,0.24);">
                    <span style="font-size: 1.2rem;">📦</span>
                    <strong style="font-size: 1.05rem; color: #ffffff;">Volumes do setor ${esc(nomeDoSetor(alvo))}</strong>
                    <span style="font-size: 0.78rem; color: #cfe6fb;">Pedido ${esc(numeroDoPedido)} · ${lista.length} ${lista.length === 1 ? 'volume' : 'volumes'}</span>
                    <button type="button" onclick="AcabamentoPainel.fecharVolumes()"
                            style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px; font-weight: 700;
                                   cursor: pointer; font-family: inherit;">✕</button>
                </div>

                <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 10px;">
                    ${corpo}
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 2px;">
                        ${pode ? `<button type="button" style="${ESTILO_BOTAO_VOLUME} padding: 9px 16px; font-size: 0.86rem;"
                                onclick="AcabamentoPainel.novoVolume('${escJs(alvo)}', '${escJs(numeroDoPedido)}')">+ Novo volume</button>` : ''}
                        ${cobertura}
                    </div>
                    ${lista.length ? `<div style="border-top: 1px solid rgba(76,200,240,0.18); margin-top: 4px;"></div>` : ''}
                    ${conferencia}
                    ${lista.length ? `<div style="font-size: 0.74rem; color: var(--text-dim); line-height: 1.5;">
                        A diferença não trava nada — caixa, fita e plástico pesam, e o setor pode ter sido pesado
                        inteiro na balança grande. Ela aparece para o operador decidir qual dos dois números está certo.
                    </div>` : ''}
                </div>

                <div style="display: flex; align-items: center; padding: 12px 18px; border-top: 1px solid rgba(76,200,240,0.18);">
                    <span style="font-size: 0.78rem; color: #7fa9d4;">Fechar não desfaz nada — tudo já está gravado.</span>
                    <button type="button" onclick="AcabamentoPainel.fecharVolumes()"
                            style="margin-left: auto; background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);
                                   color: #cfe6fb; border-radius: 8px; padding: 10px 18px; font-weight: 700;
                                   cursor: pointer; font-family: inherit;">Fechar</button>
                </div>
            </div>`;
        document.body.appendChild(caixa);
    }

    /**
     * Adota a soma dos volumes como peso do setor.
     *
     * Passa pelo `gravarPeso` de sempre, e não por um atalho: é ele que conhece
     * os dois caminhos de escrita, a regra dos 5 % e o "Pronto" que pode estar
     * esperando. Um atalho aqui furaria a senha de liberação.
     */
    function usarSomaDosVolumes(setor) {
        const alvo = normalizar(setor);
        const soma = somaDosVolumes(volumesDoSetor(alvo));
        if (!(soma > 0)) return Promise.resolve(false);
        fecharPopupDosVolumes();
        return gravarPeso(tela.volumesDoPedido, alvo, pesoParaTexto(soma));
    }

    // ─── O popup do peso que fecha o setor ──────────────────────────────────
    //
    // A trava do "Pronto" precisa ter saída na PRÓPRIA tela (regra da casa: toda
    // trava diz o que fazer para sair dela). A saída é este popup: ele pergunta
    // o peso ali mesmo, grava, e só então marca o modelo como Pronto. Mandar o
    // operador "subir e preencher o box lá em cima" seria a mesma trava, com
    // mais passos.

    function montarPopupDoPeso() {
        let caixa = document.getElementById('acab-peso-obrigatorio');
        if (caixa) return caixa;

        caixa = document.createElement('div');
        caixa.id = 'acab-peso-obrigatorio';
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100004; display: none;'
            + ' align-items: center; justify-content: center; background: rgba(6,7,13,0.92); padding: 18px;';
        caixa.innerHTML = `
            <div style="width: min(520px, 96vw); background: ${AZUL.fundo};
                        border: 1px solid rgba(76,200,240,0.28); border-radius: 12px;
                        display: flex; flex-direction: column; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px;
                            background: #120a8f; border-bottom: 1px solid rgba(76,200,240,0.24);">
                    <span style="font-size: 1.2rem;">⚖️</span>
                    <strong style="font-size: 1.05rem; color: #ffffff;">Pese o setor antes de fechar</strong>
                    <button type="button" id="acab-peso-obrig-fechar"
                            style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px;
                                   font-weight: 700; cursor: pointer;">✕</button>
                </div>

                <div style="padding: 16px 18px; color: #cfe6fb; font-size: 0.9rem; line-height: 1.55;">
                    <div id="acab-peso-obrig-corpo"></div>
                    <label for="acab-peso-obrig-campo" style="display: block; margin-top: 14px;
                           font-size: 0.78rem; color: #7fa9d4; text-transform: uppercase;
                           letter-spacing: 0.06em;">Peso real do setor</label>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                        <input type="text" inputmode="decimal" id="acab-peso-obrig-campo"
                               autocomplete="off" spellcheck="false" placeholder="0,00"
                               style="width: 140px; text-align: right; background: #0d0e20;
                                      border: 1px solid rgba(76,200,240,0.26); border-radius: 6px;
                                      color: #ffffff; padding: 8px 10px; font-size: 1.25rem;
                                      font-family: monospace;" />
                        <span style="font-size: 0.95rem; color: #7fa9d4;">kg</span>
                        <span id="acab-peso-obrig-est" style="font-size: 0.8rem; color: var(--text-dim);"></span>
                    </div>
                    <div id="acab-peso-obrig-erro" style="margin-top: 8px; min-height: 1.2em;
                         font-size: 0.82rem; color: #f87171;"></div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px;
                            border-top: 1px solid rgba(76,200,240,0.18); flex-wrap: wrap;">
                    <span style="font-size: 0.78rem; color: #7fa9d4;">Cancelar deixa o modelo como estava.</span>
                    <div style="margin-left: auto; display: flex; gap: 10px;">
                        <button type="button" id="acab-peso-obrig-cancelar"
                                style="background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);
                                       color: #cfe6fb; border-radius: 8px; padding: 10px 18px;
                                       font-weight: 700; cursor: pointer;">Cancelar</button>
                        <button type="button" id="acab-peso-obrig-ok"
                                style="background: linear-gradient(135deg, #4a61e8, #120a8f);
                                       border: 1px solid #4cc8f0; color: #ffffff; border-radius: 8px;
                                       padding: 10px 22px; font-weight: 800; letter-spacing: 0.05em;
                                       cursor: pointer;">Gravar peso e marcar PRONTO</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(caixa);

        const cancelar = () => fecharPopupDoPeso();
        ['acab-peso-obrig-fechar', 'acab-peso-obrig-cancelar'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.addEventListener('click', cancelar);
        });
        const ok = document.getElementById('acab-peso-obrig-ok');
        if (ok) ok.addEventListener('click', () => confirmarPesoDoSetor());
        const campo = document.getElementById('acab-peso-obrig-campo');
        if (campo) {
            campo.addEventListener('keydown', e => {
                if (e && e.key === 'Enter') { e.preventDefault(); confirmarPesoDoSetor(); }
            });
        }
        return caixa;
    }

    function fecharPopupDoPeso() {
        const caixa = document.getElementById('acab-peso-obrigatorio');
        if (caixa) caixa.style.display = 'none';
        tela.prontoPendente = null;
    }

    /**
     * A tira dos volumes dentro da janela que cobra o peso ao fechar o setor.
     *
     * Só aparece quando o setor tem volume PESADO. Sem volume — que é a
     * maioria dos pedidos — a janela é exatamente a de antes, e é isso que se
     * quer: o recurso novo não pode aparecer para quem não o usa.
     */
    function recadoDosVolumesNoFechamento(setor) {
        const lista = volumesDoSetor(setor);
        const soma = somaDosVolumes(lista);
        if (!lista.length || !(soma > 0)) return '';
        return `
            <div style="margin-top: 12px; padding: 10px 12px; border-radius: 8px;
                        background: rgba(76,200,240,0.06); border: 1px dashed rgba(76,200,240,0.34);
                        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <span style="font-size: 1rem;">📦</span>
                <span style="font-size: 0.84rem;">Este setor tem
                    <strong>${lista.length} ${lista.length === 1 ? 'volume' : 'volumes'}</strong>, que somam
                    <span style="font-family: monospace; color: #ffffff;">${esc(kgParaTexto(soma))} kg</span>
                    — já preenchido abaixo. Troque se você pesou o setor inteiro de uma vez.</span>
            </div>`;
    }

    /**
     * Abre o popup para o "Pronto" que está esperando um peso.
     *
     * `tela.prontoPendente` guarda o modelo e o setor; ele é consumido pelo
     * `confirmarPesoDoSetor`, e some no cancelar.
     */
    function abrirPopupDoPeso() {
        const p = tela.prontoPendente;
        if (!p) return;
        montarPopupDoPeso();

        const estimado = estimadoDoSetor(p.setor);
        const corpo = document.getElementById('acab-peso-obrig-corpo');
        if (corpo) {
            corpo.innerHTML = `
                <div style="font-size: 0.95rem; margin-bottom: 10px;">
                    <strong style="color: #ffffff;">Pedido ${esc(p.numeroDoPedido)}</strong>
                    <span style="color: #4cc8f0;"> — setor ${esc(nomeDoSetor(p.setor))}</span>
                </div>
                <div style="padding: 10px 12px; border-radius: 8px;
                            background: rgba(76,200,240,0.10); border: 1px solid rgba(76,200,240,0.32);">
                    Este é o <strong>último modelo</strong> do setor
                    ${esc(nomeDoSetor(p.setor))}. Ao marcá-lo como <strong>PRONTO</strong> o setor fecha,
                    e a expedição precisa do peso real para cotar o frete —
                    <strong>o status só muda depois que o peso for informado</strong>.
                </div>
                ${recadoDosVolumesNoFechamento(p.setor)}`;
        }
        const est = document.getElementById('acab-peso-obrig-est');
        if (est) {
            est.textContent = (estimado !== null && estimado !== undefined && estimado > 0)
                ? `est. ${kgParaTexto(estimado)} kg` : '';
        }
        const erro = document.getElementById('acab-peso-obrig-erro');
        if (erro) erro.textContent = '';

        // O campo nasce com a soma dos volumes quando ela existe. Não é uma
        // trava: é o número que a própria tela já sabe, posto onde o operador
        // ia digitá-lo. Ele apaga e digita outro se pesou o setor inteiro na
        // balança grande — que é o caso em que a soma e o peso divergem.
        const somaDaqueleSetor = somaDosVolumes(volumesDoSetor(p.setor));
        const campo = document.getElementById('acab-peso-obrig-campo');
        if (campo) campo.value = somaDaqueleSetor > 0 ? pesoParaTexto(somaDaqueleSetor) : '';
        const ok = document.getElementById('acab-peso-obrig-ok');
        if (ok) { ok.disabled = false; ok.textContent = 'Gravar peso e marcar PRONTO'; }

        const caixa = document.getElementById('acab-peso-obrigatorio');
        if (caixa) caixa.style.display = 'flex';
        if (campo && typeof campo.focus === 'function') {
            try { campo.focus(); } catch (ignorado) { /* sem foco não há problema */ }
        }
    }

    /**
     * O OK do popup: grava o peso e, SÓ SE ele entrar, marca o Pronto.
     *
     * O peso pode cair no popup da senha de liberação (acima de 5 % do
     * estimado). Nesse caso o `gravarPeso` volta sem gravar, o popup da senha
     * abre por cima, e o `prontoPendente` continua guardado — quem o consome é o
     * `concluirProntoPendente`, chamado de dentro do `gravarPeso` quando o peso
     * finalmente entra no banco. Ou seja: senha certa fecha o setor, senha
     * errada não fecha nada.
     */
    async function confirmarPesoDoSetor() {
        const p = tela.prontoPendente;
        if (!p) { fecharPopupDoPeso(); return; }

        const campo = document.getElementById('acab-peso-obrig-campo');
        const erro = document.getElementById('acab-peso-obrig-erro');
        const texto = String(campo && campo.value ? campo.value : '').trim();
        if (!texto) {
            if (erro) erro.textContent = 'Digite o peso do setor para fechar.';
            return;
        }
        if (pesoDoTexto(texto) === undefined) {
            if (erro) erro.textContent = `"${texto}" não é um peso. Use só números, como 4,16.`;
            return;
        }

        const ok = document.getElementById('acab-peso-obrig-ok');
        if (ok) { ok.disabled = true; ok.textContent = 'Gravando…'; }
        try {
            const caixa = document.getElementById('acab-peso-obrigatorio');
            if (caixa) caixa.style.display = 'none';   // sai da frente do popup da senha
            await gravarPeso(p.numeroDoPedido, p.setor, texto);
        } finally {
            if (ok) { ok.disabled = false; ok.textContent = 'Gravar peso e marcar PRONTO'; }
        }

        // Ainda pendente: o peso não entrou (foi para a senha, ou deu erro). O
        // popup volta com o motivo já dito pelo aviso do `gravarPeso`.
        if (tela.prontoPendente && !tela.liberacaoPendente) {
            const caixa = document.getElementById('acab-peso-obrigatorio');
            if (caixa) caixa.style.display = 'flex';
            if (erro) erro.textContent = 'O peso não foi gravado. Veja o aviso e tente de novo.';
        }
    }

    /**
     * Chamado pelo `gravarPeso` depois de o peso ENTRAR no banco: se havia um
     * "Pronto" esperando por aquele setor, ele acontece agora.
     */
    async function concluirProntoPendente(setorGravado) {
        const p = tela.prontoPendente;
        if (!p || normalizar(setorGravado) !== p.setor) return;
        tela.prontoPendente = null;
        const caixa = document.getElementById('acab-peso-obrigatorio');
        if (caixa) caixa.style.display = 'none';
        await gravar(p.itemId, p.osId, 'acabamento_status', 'Pronto');
    }

    /** Cancelar: nada foi gravado, e o campo volta ao valor de antes. */
    function cancelarLiberacao() {
        fecharPopupDaLiberacao();
        pintarPesos();
        // Se havia um "Pronto" esperando este peso, ele continua esperando: o
        // popup do peso volta, em vez de o operador ficar olhando um card cujo
        // botão não obedeceu e sem nada na tela explicando por quê.
        if (tela.prontoPendente) abrirPopupDoPeso();
    }

    /** Abre o popup com o que está em `tela.liberacaoPendente`. */
    function abrirPopupDaLiberacao() {
        const p = tela.liberacaoPendente;
        if (!p) return;
        montarPopupDaLiberacao();

        const d = divergencia(p.peso, p.estimado);
        const pct = d === null ? 0 : (p.peso - p.estimado) / p.estimado * 100;
        const sinal = pct < 0 ? '-' : '+';
        const corpo = document.getElementById('acab-liberacao-corpo');
        if (corpo) {
            corpo.innerHTML = `
                <div style="font-size: 0.95rem; margin-bottom: 8px;">
                    <strong style="color: #ffffff;">Pedido ${esc(p.numeroDoPedido)}</strong>
                    <span style="color: ${'#4cc8f0'};"> — setor ${esc(nomeDoSetor(p.setor))}</span>
                </div>
                <table style="border-collapse: collapse; font-size: 0.9rem;">
                    <tr><td style="padding: 3px 14px 3px 0; color: #7fa9d4;">Peso digitado</td>
                        <td style="padding: 3px 0; font-family: monospace; color: #ffffff;">${esc(pesoParaTexto(p.peso))} kg</td></tr>
                    <tr><td style="padding: 3px 14px 3px 0; color: #7fa9d4;">Peso estimado</td>
                        <td style="padding: 3px 0; font-family: monospace;">${esc(kgParaTexto(p.estimado))} kg</td></tr>
                    <tr><td style="padding: 3px 14px 3px 0; color: #7fa9d4;">Divergência</td>
                        <td style="padding: 3px 0; font-family: monospace; color: #fbbf24;">${sinal}${esc(Math.abs(pct).toFixed(1).replace('.', ','))}%</td></tr>
                </table>`;
        }
        const erro = document.getElementById('acab-liberacao-erro');
        if (erro) erro.textContent = '';
        const campo = document.getElementById('acab-liberacao-senha');
        if (campo) campo.value = '';
        const botao = document.getElementById('acab-liberacao-ok');
        if (botao) { botao.disabled = false; botao.textContent = 'Liberar'; }

        const caixa = document.getElementById('acab-liberacao');
        if (caixa) caixa.style.display = 'flex';
        if (campo && typeof campo.focus === 'function') {
            try { campo.focus(); } catch (ignorado) { /* sem foco não há problema */ }
        }
    }

    /**
     * Pergunta ao servidor se a senha confere. Só sim ou não volta.
     *
     * Dois caminhos, pelos mesmos motivos do peso: na estação o agente repassa
     * à `acesso-estacao` com o segredo dele; no site a `painel` confere com a
     * sessão do Vibe (o `window.fetch` do `supabase-config.js` a acrescenta).
     */
    async function conferirSenhaDeLiberacao(senha) {
        const url = pelaEstacao()
            ? urlDaEstacao('senha-liberacao', 'conferir')
            : urlDoPainel('senha-liberacao', 'conferir');
        const res = await buscar(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senha }),
        });
        if (!res.ok) throw new Error(await motivoDaResposta(res));
        const corpo = await res.json();
        return !!(corpo && corpo.confere === true);
    }

    /**
     * O botão Liberar (e o Enter no campo).
     *
     * Senha certa → a gravação pendente segue pelo caminho de sempre, com
     * `liberado`. Senha errada ou rede fora → o popup FICA aberto com o motivo,
     * e o operador tenta de novo ou cancela. Nada é gravado antes do sim.
     */
    async function liberarDivergencia() {
        const pendente = tela.liberacaoPendente;
        if (!pendente) { fecharPopupDaLiberacao(); return; }

        const campo = document.getElementById('acab-liberacao-senha');
        const erro = document.getElementById('acab-liberacao-erro');
        const senha = String(campo && campo.value ? campo.value : '').trim().toUpperCase();
        if (!senha) {
            if (erro) erro.textContent = 'Digite a senha de liberação.';
            return;
        }

        const botao = document.getElementById('acab-liberacao-ok');
        if (botao) { botao.disabled = true; botao.textContent = 'Conferindo…'; }
        try {
            const confere = await conferirSenhaDeLiberacao(senha);
            if (!confere) {
                if (erro) erro.textContent = 'Senha incorreta.';
                if (campo) campo.value = '';
                return;
            }
            fecharPopupDaLiberacao();
            await gravarPeso(pendente.numeroDoPedido, pendente.setor, pendente.texto, { liberado: true });
        } catch (e) {
            console.error('[acabamento] erro ao conferir a senha de liberação:', e);
            if (erro) {
                erro.textContent = `Não deu para conferir a senha (${e && e.message ? e.message : e}).`;
            }
        } finally {
            if (botao) { botao.disabled = false; botao.textContent = 'Liberar'; }
        }
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

        // Lido ANTES de escrever: é o que diz se o Pronto é novo ou é o mesmo
        // Pronto de antes sendo reclicado.
        const eraPronto = item ? (estagioDoModelo(item) === 'Pronto') : false;

        if (item) item[campo] = limpo;

        // O mapa da lista anda junto: sem isto, voltar para a lista mostraria o
        // estágio anterior até a próxima leitura do banco.
        const noMapa = tela.acabamento[String(itemId)] || { status: '', responsavel: '', foto: '', prontoEm: '' };
        noMapa[CAMPO_NO_MAPA[campo] || campo] = limpo || '';
        tela.acabamento[String(itemId)] = noMapa;

        // A hora do Pronto é do BANCO (o gatilho a escreve), mas a tela anda na
        // frente: sem este espelho, o carimbo só apareceria na próxima leitura,
        // e o operador marcaria Pronto sem ver hora nenhuma. O valor daqui é o
        // mesmo instante, com a diferença de uma ida de rede.
        //
        // Reclicar no Pronto que já estava aceso NÃO renova a hora — é a mesma
        // regra do gatilho, repetida aqui para a tela não mostrar por um instante
        // uma hora que o banco não vai gravar.
        if (campo === 'acabamento_status') {
            const agoraPronto = String(limpo || '').toLowerCase() === 'pronto';
            if (!agoraPronto) {
                noMapa.prontoEm = '';
                if (item) item.acabamento_pronto_em = null;
            } else if (!eraPronto) {
                const carimbo = new Date().toISOString();
                noMapa.prontoEm = carimbo;
                if (item) item.acabamento_pronto_em = carimbo;
            }
        }

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

    /**
     * A foto do material, no canto superior direito do card.
     *
     * Até 21/08/2026 ela era uma faixa inteira na base do card, com rótulo
     * próprio e botão grande — pesava mais que os seletores, que são o
     * trabalho de verdade desta tela. O usuário mandou encolher e subir:
     * botão pequeno no canto, e a miniatura ao lado dele quando existe.
     * O rótulo "Foto do material" continua existindo, no title dos dois.
     */
    function blocoDaFoto(item, osId, idx) {
        const foto = fotoDoModelo(item);
        const idFoto = `acab-foto-${escJs(osId)}-${escJs(item.id)}-${idx}`;
        const pode = podeEditar();

        const botao = `
            <button type="button" ${pode ? '' : 'disabled'}
                    onclick="AcabamentoPainel.abrirCamera('${escJs(item.id)}', '${escJs(osId)}')"
                    title="${pode ? 'Foto do material — abrir a câmera e fotografar' : 'Você tem apenas permissão de ver'}"
                    style="display: inline-flex; align-items: center; gap: 6px; background: rgba(69,137,215,0.16);
                           border: 1px solid rgba(69,137,215,0.50); color: #4cc8f0; border-radius: 7px;
                           padding: 5px 11px; font-size: 0.78rem; font-weight: 700; white-space: nowrap;
                           cursor: ${pode ? 'pointer' : 'not-allowed'}; opacity: ${pode ? '1' : '0.5'};">
                📷 ${foto ? 'Refazer foto' : 'Fotografar'}
            </button>`;

        const miniatura = foto
            ? `<img id="${idFoto}" src="${esc(foto)}" alt="Foto do material"
                    onclick="AcabamentoPainel.ampliar('${idFoto}')"
                    title="Foto do material — clique para ampliar"
                    style="height: 46px; object-fit: contain; cursor: zoom-in; display: block;" />`
            : '';

        // Sem foto, o card diz isso em texto — minúsculo, mas dito.
        const recado = foto
            ? ''
            : `<span style="font-size: 0.66rem; color: var(--text-dim);">Nenhuma foto do material ainda.</span>`;

        return `
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; margin-left: auto;">
                <div style="display: flex; align-items: center; gap: 8px;">${miniatura}${botao}</div>
                ${recado}
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
            tela.estimados = {};
            tela.volumes = {};
            tela.volumesDoPedido = null;
            tela.escolhaDeVolume = null;
            fecharPopupDaLiberacao();
            fecharPopupDoPeso();
            fecharPopupDoVolume();
            fecharPopupDosVolumes();
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
            // pode demorar ou nem responder, e o pedido não espera por ele. O
            // estimado e os volumes vêm junto, em paralelo: são três leituras
            // independentes, e nenhuma delas segura as outras.
            const os = (estado().ordens || []).find(o => String(o.id) === String(osId));
            if (os) {
                await Promise.all([
                    carregarPesos(os.numero),
                    carregarEstimados(os.numero),
                    carregarVolumes(os.numero),
                ]);
                renderDetalhe();
            }
        },

        fecharPedido() {
            fecharCamera();
            fecharPopupDaExpedicao();
            fecharPopupDaLiberacao();
            fecharPopupDoPeso();
            fecharPopupDoVolume();
            fecharPopupDosVolumes();
            tela.escolhaDeVolume = null;
            tela.pedidoAberto = null;
            mostrarLista();
            render();
        },

        mudarEstagio(itemId, osId, valor) {
            // Aqui, e não só nos botões: botão cinza não impede ninguém de
            // chamar a função pelo console, e esta é a única porta por onde o
            // status do acabamento é gravado.
            if (!responsavelPorId(itemId, osId)) {
                const aviso = fn('toast');
                if (aviso) {
                    aviso('Escolha primeiro o responsável deste modelo — o status só muda com um nome.', 'warning');
                }
                return Promise.resolve(false);
            }

            // O PESO antes do último Pronto do setor (regra do usuário,
            // 23/08/2026). O status não é gravado agora: quem o grava é o
            // `concluirProntoPendente`, depois de o peso entrar no banco.
            if (String(valor).toLowerCase() === 'pronto') {
                const s = estado();
                const itens = (s.osItens && s.osItens[osId]) || [];
                const item = itens.find(i => String(i.id) === String(itemId));
                const setor = pesoExigidoAntesDoPronto(item, itens);
                if (setor) {
                    const os = (s.ordens || []).find(o => String(o.id) === String(osId));
                    tela.prontoPendente = {
                        itemId, osId, setor,
                        numeroDoPedido: os ? os.numero : osId,
                    };
                    abrirPopupDoPeso();
                    return Promise.resolve(false);
                }
            }

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

        /** O "Liberar" do popup da senha: confere no servidor e, só então, grava. */
        liberarDivergencia,
        /** Fecha o popup da senha sem gravar; o campo volta ao valor de antes. */
        fecharPopupDaLiberacao() {
            cancelarLiberacao();
        },

        /** O OK do popup do peso que fecha o setor: grava o peso e, só então, o Pronto. */
        confirmarPesoDoSetor,
        fecharPopupDoPeso,

        // ── Os volumes (23/08/2026) ──────────────────────────────────────
        /** "+ Volume": põe a lista do pedido em modo de escolha. */
        novoVolume(setor, numeroDoPedido) { abrirEscolhaDeModelos(setor, numeroDoPedido); },
        /** A caixa de marcar no card do modelo. */
        marcarModelo(itemId) { alternarModeloNaEscolha(itemId); },
        cancelarVolume() { cancelarEscolhaDeModelos(); },
        /** "Pesar este volume": abre a janela com os modelos marcados. */
        pesarVolume() { abrirPopupDoVolume(null); },
        editarVolume(volumeId) { abrirPopupDoVolume(volumeId); },
        /** O OK da janela. Só ele grava. */
        confirmarVolume,
        fecharVolume: fecharPopupDoVolume,
        excluirVolume,
        verVolumes(setor) { abrirVolumesDoSetor(setor); },
        fecharVolumes: fecharPopupDosVolumes,
        /** Adota a soma dos volumes como peso do setor, pelo `gravarPeso`. */
        usarSomaDosVolumes,

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
            fecharPopupDaLiberacao();
            fecharPopupDoPeso();
            fecharPopupDoVolume();
            fecharPopupDosVolumes();
            tela.escolhaDeVolume = null;
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
        /** O estado da tela, para os testes olharem (e só para isso). */
        _tela: tela,

        _regras: {
            ehDeProducao,
            setoresDoPedido,
            pesoDoTexto,
            pesoParaTexto,
            pelaEstacao,
            urlDoPeso,
            urlDaEstacao,
            urlDoPainel,
            urlDeApi,
            estimadoPorSetor,
            precisaDeLiberacao,
            divergencia,
            modelosPorSetor,
            setoresPendentes,
            pedidoProntoParaExpedicao,
            textoDoQueFalta,
            encerradosTeste: tela.encerradosTeste,
            estagioDoModelo,
            estagioDerivadoDaImpressao,
            prontoEmDoModelo,
            textoDaHoraDoPronto,
            setorQueFechaComEstePronto,
            setorTemPeso,
            haComoGravarPeso,
            pesoExigidoAntesDoPronto,
            // Os volumes (23/08/2026)
            agruparVolumes,
            volumesDoSetor,
            somaDosVolumes,
            embaladoPorModelo,
            qtdDoModelo,
            faltaEmbalar,
            proximoNumeroDeVolume,
            faltandoNoSetor,
            diferencaDosVolumes,
            textoDaDiferenca,
            qtdDoTexto,
            marcavelNaEscolha,
            marcadoNaEscolha,
            TIPOS_DE_VOLUME,
            TABELA_DE_VOLUMES,
            TABELA_DE_ITENS_DO_VOLUME,
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
