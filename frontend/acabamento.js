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

    /**
     * O rotulo do estagio na TELA. O banco continua guardando 'Pronto'.
     *
     * Em 29/08/2026 o usuario devolveu ao ultimo estagio o nome com que a tela
     * nasceu: com um botao so, ele deixou de ser o quarto de uma escala e virou
     * o carimbo de quem conferiu, e "Revisado" descreve isso melhor. A troca e'
     * so de vocabulario — trocar tambem o valor gravado pediria migracao nova,
     * mexeria no gatilho `trg_carimba_acabamento_pronto_em` (que compara com
     * 'PRONTO') e abriria de novo a janela em que uma estacao com a versao
     * anterior em cache grava o nome velho.
     */
    const ROTULO_NA_TELA = { 'Pronto': 'Revisado' };
    function rotuloDoEstagio(e) { return ROTULO_NA_TELA[e] || e; }

    const SELO = {
        'Aguardando':    { icone: '⏳', cls: 'badge-blue',  texto: 'Aguardando' },
        'Impresso':      { icone: '🖨️', cls: 'badge-teal',  texto: 'Impresso' },
        'Em acabamento': { icone: '✂️', cls: 'badge-amber', texto: 'Em acabamento' },
        'Pronto':        { icone: '✅', cls: 'badge-green', texto: 'Revisado' },
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
        prazo: 'geral',       // geral | hoje | atrasados | expedicao
        setores: [],        // vazio = todos; os cards SOMAM (ver setFiltroSetor)
        pesos: {},          // 'SETOR' -> { peso, existe } do pedido aberto

        // 'os.id' -> { 'p:<produtos_proposta.id>': 'SETOR' } do recorte por
        // setor. Vive um desenho e morre: ver `indiceDeSetorDoPedido`.
        indiceDeSetor: {},
        pesosDoPedido: null,// de qual pedido é o mapa acima
        estimados: {},      // 'SETOR' -> kg estimado (só os que têm; ausente = null)
        gramasPorUnidade: {},// id da linha da proposta -> gramas de UMA unidade
        liberacaoPendente: null, // o peso fora dos 5 % que espera a senha (ver gravarPeso)
        prontoPendente: null,    // o "Pronto" que espera o peso do setor (23/08/2026)
        // Os setores escolhidos DENTRO do pedido aberto (29/08/2026). Vazio é o
        // pedido inteiro. Somam, como os cards da fila: com dois acesos, a tela
        // mostra a união dos dois. Zerado ao abrir e ao fechar um pedido — é
        // recorte de leitura, e não uma preferência que se carrega adiante.
        setoresNoPedido: [],

        // Os VOLUMES do pedido aberto (23/08/2026). Ver a seção "Os volumes".
        volumes: {},             // 'SETOR' -> [volume, volume, …], na ordem do número
        volumesDoPedido: null,   // de qual pedido é o mapa acima
        marcados: {},            // { modeloId: true } — os modelos marcados para registrar em grupo
        registroEmCurso: null,   // o registro que a janela do Pronto está montando
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

        // Os pedidos que o mapa acima JÁ cobre, pelo número.
        //
        // O mapa é montado a partir da lista de pedidos que existe no momento da
        // consulta, e o `loadOrdens` pode trazer pedidos DEPOIS dela — na
        // primeira abertura da tela ele traz a lista inteira, porque
        // `state.ordens` ainda estava vazio. Sem saber o que já foi coberto, a
        // tela desenhava esses pedidos sem estágio nenhum e caía na derivação da
        // impressão. Ver `completarEstagiosDaLista`.
        numerosNoMapa: new Set(),
        buscandoEstagios: false,
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

    /**
     * O pedido já foi entregue à expedição.
     *
     * Pedido do usuário em 23/08/2026: *"ao clicar e enviá-lo para a Expedição,
     * ele deve ir para a lista de PRONTO"* — o botão que hoje se chama
     * EXPEDIÇÃO. Até aqui o pedido sumia da tela no
     * instante em que era enviado — o `status_interno` virava `EXPEDICAO`, que
     * o `ehDeProducao` não aceita, e o operador ficava sem o comprovante do
     * próprio trabalho. Agora ele continua na lista, com o selo PRONTO, até a
     * expedição despachá-lo.
     *
     * A lista não incha por causa disso: assim que a expedição embarca, o ERP
     * troca o status para EM TRANSITO e o pedido sai daqui sozinho.
     */
    function ehExpedido(os) {
        return (os.status_interno || '').toUpperCase() === 'EXPEDICAO';
    }

    function pedidosEmProducao() {
        return (estado().ordens || [])
            .filter(ehDeProducao)
            .filter(os => !tela.encerradosTeste.has(String(os.numero)));
    }

    /**
     * O que a LISTA mostra: a fila de trabalho mais o que já foi expedido.
     *
     * Separado do `pedidosEmProducao` de propósito. As métricas da coluna
     * lateral contam trabalho a fazer — "PEDIDOS EM FILA", o número no menu, o
     * alerta de atraso —, e pedido que já saiu do setor não é trabalho a fazer.
     * Quem cresce é só a lista, que é onde o operador procura o que ele acabou
     * de mandar.
     */
    /**
     * O pedido já passou do chão de fábrica? (EXPEDICAO, EM TRANSITO, ENTREGUE)
     *
     * Regra do usuário de 27/08/2026, escrita uma vez só no `script.js`, porque
     * o Painel de Produção obedece à mesma. Se o `script.js` ainda não
     * carregou, esta tela não esconde nada — esconder por engano é pior do que
     * mostrar a mais.
     */
    function jaPassouDaGrafica(os) {
        const f = fn('pedidoJaPassouDaGrafica');
        return f ? !!f(os) : false;
    }

    function pedidosDoPainel() {
        return (estado().ordens || [])
            // Pedido despachado, em trânsito ou entregue não é mais trabalho
            // desta bancada. O `ehExpedido` logo abaixo é a única exceção, e ela
            // vive só no botão "Expedição": o `passaNoPrazo` tira o expedido de
            // toda tela inicial (Geral, Para Hoje, Atrasados).
            .filter(os => !jaPassouDaGrafica(os) || ehExpedido(os))
            .filter(os => ehDeProducao(os) || ehExpedido(os))
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

    // ─── O recorte por setor ───────────────────────────────────────
    //
    // Regra do usuário, 27/08/2026: *"ao selecionar o filtro por setor, deve
    // levar em consideração apenas o setor selecionado"*. O exemplo dele: um
    // pedido com LASER e TEXTIL, o card LASER aceso e o LASER todo pronto mostra
    // **Pronto**, mesmo com o TEXTIL ainda na bancada.
    //
    // Até aqui o card era filtro de LINHAS: escolhia quais pedidos apareciam, e
    // tudo o que a linha dizia continuava sendo do pedido inteiro. O exemplo
    // acima saía como "Em acabamento", que é o oposto do que ele descreveu.
    //
    // As três bordas da regra, decididas na mesma conversa:
    //
    //  1. O envio à EXPEDIÇÃO continua sendo do pedido inteiro — um setor não se
    //     despacha sozinho, e `pedidoProntoParaExpedicao` continua exigindo
    //     todos. O recorte muda o que a linha DIZ, nunca o que o pedido É.
    //  2. Modelo sem setor SOME do recorte. Não há pílula "(sem setor)" na lista,
    //     e ele só volta a ser contado quando nenhum card está aceso.
    //  3. As métricas da coluna lateral e o alerta de atraso continuam contando
    //     a fila INTEIRA: elas medem trabalho a fazer, e trabalho a fazer não
    //     muda porque o operador filtrou a vista.

    /**
     * `produtos_proposta.id` -> setor, para os produtos deste pedido.
     *
     * Refeito a cada desenho e jogado fora no fim dele (ver `render`): o cache
     * da proposta é remendado pelo `repararSetoresDosItens` do `script.js`
     * enquanto os produtos chegam, e um índice que sobrevivesse ao desenho
     * guardaria o retrato de antes do remendo — que é justamente o retrato sem
     * setor nenhum.
     *
     * As chaves levam prefixo porque duas numerações diferentes entram aqui: a
     * de `produtos_proposta` (2347) e a de `pedidos_modelos` (1000633). Sem o
     * prefixo elas dividiriam o mesmo espaço por acaso.
     */
    function indiceDeSetorDoPedido(os) {
        if (!os) return {};
        const chave = String(os.id);
        if (tela.indiceDeSetor[chave]) return tela.indiceDeSetor[chave];

        const mapa = {};
        const s = estado();
        ((s.osItens && s.osItens[os.id]) || []).forEach(i => {
            const setor = normalizar(i && i.setor);
            if (!setor) return;
            if (i._vibe_produto_id !== undefined && i._vibe_produto_id !== null) {
                mapa['p:' + i._vibe_produto_id] = setor;
            }
            if (i.id_produto_proposta_origem !== undefined && i.id_produto_proposta_origem !== null) {
                mapa['p:' + i.id_produto_proposta_origem] = setor;
            }
            if (i._pedidoModeloId !== undefined && i._pedidoModeloId !== null) {
                mapa['m:' + i._pedidoModeloId] = setor;
            }
            // O `id` do item CARREGADO DO BANCO é o `pedidos_modelos.id`, o
            // mesmo que a lista enxuta usa. É por ele que o recorte funciona no
            // pedido já aberto, cujos itens têm setor mas cuja tabela continua
            // sendo desenhada com `modelosGlobais`. Nos itens do cache da
            // proposta o `id` é "vibe_item_2347", que não casa com modelo nenhum
            // — entra na chave e nunca é encontrado, sem estragar nada.
            if (i.id !== undefined && i.id !== null) mapa['m:' + i.id] = setor;
        });

        tela.indiceDeSetor[chave] = mapa;
        return mapa;
    }

    /**
     * O setor de um modelo, normalizado, ou '' quando não dá para saber.
     *
     * Três camadas, e a ordem importa:
     *
     *  1. O `setor` da própria linha. Existe nos itens que o `script.js` já
     *     resolveu — o pedido aberto, e o cache da proposta.
     *  2. O PRODUTO DE ORIGEM, que é o caminho da lista: a tabela é desenhada
     *     com `modelosGlobais`, e essa consulta não traz setor nenhum.
     *  3. Nada — e aí o modelo fica fora de todo recorte, por decisão.
     *
     * A camada 2 é a que sustenta o recorte na lista, e vale saber por que ela
     * não é o óbvio. `pedidos_modelos.setor` existe no banco e seria o caminho
     * direto, mas estava preenchida em 105 das 355 linhas quando isto foi
     * escrito: filtrar por ela esconderia 70 % dos modelos. Já o
     * `id_produto_proposta_origem` estava em 355 das 355, e fecha a mesma cadeia
     * que o detalhe do pedido sempre usou:
     * `id_produto_proposta_origem` -> `produtos_proposta.id` -> `produtos.setor_pcp`.
     *
     * O último salto não custa consulta nenhuma: o `script.js` pré-carrega os
     * produtos da proposta de TODOS os pedidos em `state.osItens`, com o setor
     * já resolvido e o id da linha em `_vibe_produto_id`.
     */
    function setorDoModelo(m, os) {
        if (!m) return '';

        const direto = normalizar(m.setor);
        if (direto) return direto;

        const doMapa = tela.acabamento[String(m.id)];
        const origem = (m.id_produto_proposta_origem !== undefined && m.id_produto_proposta_origem !== null)
            ? m.id_produto_proposta_origem
            : (doMapa ? doMapa.produtoOrigem : null);

        const indice = indiceDeSetorDoPedido(os);
        if (origem !== undefined && origem !== null && origem !== '') {
            const achado = indice['p:' + origem];
            if (achado) return achado;
        }
        return indice['m:' + m.id] || '';
    }

    /**
     * Os modelos do pedido que o recorte de setor deixa passar.
     *
     * Sem card aceso é o pedido inteiro, e aí esta função é o `modelosDoPedido`
     * de sempre. Com card aceso, o que sobra é o que a linha passa a contar:
     * progresso, itens, quantidade, selo e ordenação.
     */
    function modelosDoRecorte(os) {
        const modelos = modelosDoPedido(os);
        if (!tela.setores.length) return modelos;
        const alvos = new Set(tela.setores.map(normalizar));
        return modelos.filter(m => alvos.has(setorDoModelo(m, os)));
    }

    /** "LASER", ou "LASER + TÊXTIL" — o recorte escrito, na ordem dos cards. */
    function rotuloDoRecorte() {
        if (!tela.setores.length) return '';
        const alvos = new Set(tela.setores.map(normalizar));
        return SETORES_DO_BANCO
            .filter(s => alvos.has(s))
            .map(s => (ROTULO_DO_SETOR[s] ? ROTULO_DO_SETOR[s].nome : s).toUpperCase())
            .join(' + ');
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
            ? `Revisado às ${hora}`
            : `Revisado em ${dd(t.getDate())}/${dd(t.getMonth() + 1)} às ${hora}`;
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
     * O VOLUME fotografado em que este modelo está — ou `null`.
     *
     * É a outra ponta do botão Fotografar da janela da caixa (28/08/2026): uma
     * foto tirada lá vale para todos os modelos que estão dentro dela, e é aqui
     * que o card de cada um a encontra.
     *
     * Ela NÃO substitui a foto do material. `fotoDoModelo` vem primeiro em
     * `blocoDaFoto`: a foto do card é o registro do que o revisor viu, e a da
     * caixa é o registro do que foi embalado. Um modelo em duas caixas mostra a
     * primeira delas que tem foto — as duas são dele, e escolher a primeira é
     * estável, enquanto "a mais recente" mudaria a cada caixa nova.
     */
    function fotoDoVolumeDoModelo(m) {
        if (!m) return null;
        const alvo = String(m.id);
        return todosOsVolumes().find(v => (v.foto || '')
            && (v.registros || []).some(p => String(p.modeloId) === alvo)) || null;
    }

    /**
     * O estágio do PEDIDO, a partir dos modelos dele.
     *
     * Pronto só quando TODOS estão prontos. Qualquer movimento parcial conta
     * como "Em acabamento", inclusive um pronto sozinho no meio de outros: o
     * trabalho está em curso.
     *
     * Isto é o SELO da linha, e nada mais. Quem decide se o pedido sai da lista
     * de trabalho é o `passaNoPrazo`, pelo envio à expedição — até 24/08/2026
     * era este estágio, e era esse o defeito.
     */
    /**
     * O modelo está EM ACABAMENTO agora?
     *
     * Até 29/08/2026 isto era um estágio que alguém marcava a mão, num dos
     * quatro botões do card. Com o card reduzido ao Revisado, ninguém mais
     * grava esse valor — e a conta passou a sair de onde a informação já
     * estava: o RESPONSÁVEL é obrigatório antes do Revisado, então modelo com
     * nome escolhido e ainda não revisado É um modelo em cima da mesa.
     *
     * A conta ficou mais honesta do que a de antes, que dependia de o operador
     * lembrar de dar um clique a mais. Linhas antigas com 'Em acabamento'
     * gravado continuam entrando: elas também têm responsável.
     */
    function emAcabamentoAgora(m) {
        return !!responsavelDoModelo(m) && estagioDoModelo(m) !== 'Pronto';
    }

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
        // Com card de setor aceso este selo fala do SETOR, e não do pedido. Um
        // "Pronto" lido como pedido pronto mandaria o operador despachar
        // material que ainda está na bancada de outro setor.
        const recorte = rotuloDoRecorte();
        const titulo = recorte
            ? ` title="Estágio do setor ${esc(recorte)} neste pedido. Os outros setores não entram nesta conta."`
            : '';
        return `<span class="badge ${s.cls}"${titulo}>${s.icone} ${s.texto}</span>`;
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

    /**
     * O pedido passa no recorte de prazo que está ligado?
     *
     * ## Quem sai da lista de trabalho é quem FOI PARA A EXPEDIÇÃO
     *
     * Regra do usuário, 24/08/2026: *"pedidos do painel de acabamento só saem
     * das listagens, mesmo marcados como prontos, quando forem clicados para
     * enviar para a expedição. Após clicar em enviar para a expedição, aí sim
     * eles vão para a lista de prontos"*.
     *
     * Até aqui quem mandava era o ESTÁGIO: bastava o último modelo virar
     * "Pronto" e o pedido sumia das listas sozinho, sem ninguém decidir nada.
     * Isso escondia o pedido justamente no momento em que ainda faltava o
     * trabalho que fecha o setor — pesar, embalar e ENTREGAR à expedição. O
     * operador terminava o último modelo e o pedido desaparecia da frente dele.
     *
     * Agora o que tira o pedido da lista é um ato: o clique em ENVIAR PARA A
     * EXPEDIÇÃO. Enquanto ele não acontece, o pedido continua na Geral, na Para
     * Hoje e na Atrasados — com o selo PRONTO, para se ver de relance que só
     * falta despachar. Depois do clique ele vai para o botão "Expedição", que é
     * a lista do que esta bancada já entregou.
     *
     * O botão se chamava "Pronto" e foi rebatizado no mesmo dia, a pedido do
     * usuário: com a regra nova, o que ele lista não é o pedido pronto — é o
     * pedido despachado.
     */
    function passaNoPrazo(os) {
        if (tela.prazo === 'expedicao') return ehExpedido(os);
        if (ehExpedido(os)) return false;
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
        // O RECORTE: ordenar por progresso com o card LASER aceso tem de ordenar
        // pelo progresso do LASER, que é o número que a coluna está mostrando.
        // Ordenar por um valor que a tela não exibe embaralha a lista aos olhos
        // do operador.
        const modelos = modelosDoRecorte(os);
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
            if (busca) {
                const num = String(os.numero || '');
                const cli = (rotulo ? rotulo(os) : (os.cliente || '')).toLowerCase();
                const numInt = parseInt(os.numero);
                const arte = (s.todasArtes || []).find(a => a.id_int === numInt && a.nome_evento);
                const evento = arte ? String(arte.nome_evento).toLowerCase() : '';
                if (!num.includes(busca) && !cli.includes(busca) && !evento.includes(busca)) return false;
            }

            // O RECORTE, e não mais o pedido inteiro. Com card aceso, tudo o
            // que vem abaixo passa a falar só dos modelos daquele setor — ver a
            // seção "O recorte por setor".
            //
            // SOMA continua valendo: com dois cards acesos o recorte é a união
            // dos dois. Ver a mesma regra no `setFiltroSetor` do script.js.
            const doRecorte = modelosDoRecorte(os);
            if (tela.setores.length && !doRecorte.length) return false;

            // O estágio pergunta pelos modelos DO RECORTE, e não pelos do pedido.
            //
            // As duas cláusulas eram independentes, e isso era um defeito por
            // conta própria, anterior ao recorte: a de setor perguntava "tem item
            // em LASER?" e a de estágio, "tem ALGUM modelo Pronto?", sem exigir
            // que fosse o mesmo modelo. Com LASER e Pronto acesos entrava na
            // lista o pedido cujo LASER estava aguardando e cujo TÊXTIL estava
            // pronto — uma afirmação que não era verdade em setor nenhum.
            if (tela.estagio) {
                // "Em acabamento" pergunta pelo responsável, e não pela coluna:
                // ninguém grava esse estágio desde 29/08/2026. Ver
                // `emAcabamentoAgora`.
                const combina = tela.estagio === 'Em acabamento'
                    ? (m => emAcabamentoAgora(m))
                    : (m => (estagioDoModelo(m) || 'Aguardando') === tela.estagio);
                if (!doRecorte.some(combina)) return false;
            }

            return true;
        });
    }

    /**
     * A barra, e embaixo dela o recorte por escrito quando ele existe.
     *
     * Sem isto a mesma linha diria "3/3 mod. · 100 %" com o card LASER aceso e
     * "3/8 mod." sem ele, sem nada na tela explicando por que o número mudou —
     * e o operador leria o pedido inteiro como pronto. O recorte tem de se
     * anunciar onde ele age.
     */
    function barraDeProgresso(prontos, total) {
        const pct = total > 0 ? Math.round((prontos / total) * 100) : 0;
        const recorte = rotuloDoRecorte();
        const selo = recorte
            ? `<div style="font-size: 0.64rem; font-weight: 800; letter-spacing: 0.04em;
                           color: #4cc8f0; margin-top: 3px; font-family: monospace;"
                    title="Estes números são só do setor filtrado. Limpe os cards para ver o pedido inteiro.">◧ ${esc(recorte)}</div>`
            : '';
        return `
            <div style="width: 100%; min-width: 110px;">
                <div style="font-size: 0.72rem; margin-bottom: 3px; color: var(--text-dim); display: flex; justify-content: space-between; font-family: monospace;">
                    <span>${prontos}/${total} mod.</span>
                    <strong>${pct}%</strong>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="width: ${pct}%; height: 100%; background: #4589d7; border-radius: 3px; transition: width 0.3s ease;"></div>
                </div>
                ${selo}
            </div>`;
    }

    function render() {
        const tbody = document.getElementById('tbody-acabamento');
        if (!tbody) return;

        // O índice de setor é deste desenho e de mais nenhum: entre um e outro o
        // `script.js` remenda o cache da proposta, e um índice guardado ficaria
        // repetindo o retrato de antes do remendo. Ver `indiceDeSetorDoPedido`.
        tela.indiceDeSetor = {};

        const s = estado();
        const emProducao = pedidosEmProducao();

        // ── Métricas ────────────────────────────────────────────────────────
        let emAcabamento = 0, prontos = 0, concluidos = 0;
        emProducao.forEach(os => {
            const modelos = modelosDoPedido(os);
            modelos.forEach(m => {
                if (emAcabamentoAgora(m)) emAcabamento++;
                if (estagioDoModelo(m) === 'Pronto') prontos++;
            });
            if (modelos.length && estagioDoPedido(modelos) === 'Pronto') concluidos++;
        });

        escrever('stat-acab-pedidos-fila', emProducao.length);
        escrever('stat-acab-modelos-acabamento', emAcabamento);
        escrever('stat-acab-modelos-prontos', prontos);
        escrever('stat-acab-pedidos-concluidos', concluidos);
        escrever('badge-acabamento', emProducao.length);

        // O alerta de atraso é global, sobre a fila inteira: não muda conforme
        // setor, estágio ou busca.
        //
        // Ele conta o mesmo que a lista mostra (24/08/2026). Antes tirava da
        // conta o pedido totalmente pronto; agora quem sai da lista é o
        // expedido, e o `emProducao` já não o traz. Pedido pronto que ainda não
        // foi despachado continua na frente do operador — e um atraso dele é
        // atraso de verdade, porque o material está parado na bancada.
        tela.temAtrasados = emProducao.some(estaAtrasado);

        // ── A tabela ────────────────────────────────────────────────────────
        // Aqui entra o que já foi para a expedição, e nas métricas acima não:
        // o operador precisa reencontrar o pedido que acabou de enviar, mas ele
        // não é mais trabalho na fila. Ver `pedidosDoPainel`.
        let lista = filtrar(pedidosDoPainel()).filter(passaNoPrazo);
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
            // Lista vazia com card de setor aceso tem de dizer QUE card a
            // esvaziou, e como sair dali. Modelo cujo produto não tem setor no
            // PCP não cai em pílula nenhuma — e isso não é raro —, então o
            // operador precisa saber que o botão "Todos os Setores" devolve o
            // que sumiu, em vez de concluir que não há trabalho.
            const recorte = rotuloDoRecorte();
            escrever('empty-acabamento-texto', recorte
                ? `Nenhum pedido com material em ${recorte} neste recorte. `
                  + 'Clique em "Todos os Setores" para ver a fila inteira.'
                : 'Nenhum pedido em produção encontrado para o acabamento.');
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
            // Daqui para baixo a linha fala do RECORTE. Sem card de setor aceso
            // ele é o pedido inteiro, e nada muda.
            const modelos = modelosDoRecorte(os);
            const total = modelos.length || 1;
            const prontosDoPedido = modelos.filter(m => estagioDoModelo(m) === 'Pronto').length;
            const qtdTotal = modelos.reduce((acc, m) => acc + (parseInt(m.quantidade || m.qtd || 0) || 0), 0);

            // A logo da transportadora e, EMBAIXO dela, o número do
            // conhecimento — clicável, quando o pedido já foi postado.
            //
            // Pedido do usuário em 25/08/2026: *"quando já existir o link do
            // número de conhecimento do sedex, ao clicar abrir o rastreamento"*.
            // O código já existia em `propostas_os.codigo_rastreamento` e só
            // aparecia na aba de Entrega do LINK DO CLIENTE. Quem posta o pacote
            // é a gráfica, e ela não o via em tela nenhuma.
            //
            // Sem código, nada é desenhado no lugar. Um traço embaixo da logo se
            // leria como "sem rastreio", quando a verdade é "ainda não despachou"
            // — e a maioria dos pedidos desta tela está justamente nesse estado.
            const freteBruto = (os.frete_escolhido || '').trim() || 'Retirada Local';
            const rastreio = typeof rastreioHtml === 'function'
                ? rastreioHtml(os.codigo_rastreamento, { margemTopo: '4px' })
                : '';
            const freteHtml = logoFrete
                ? `<div style="display:flex; flex-direction:column; align-items:center;">${logoFrete(freteBruto)}${rastreio}</div>`
                : esc(freteBruto) + rastreio;

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
                        ${ehExpedido(os) ? `
                        <span title="Este pedido já foi entregue à expedição. Ele sai daqui quando a expedição embarcá-lo."
                              style="display: block; margin-top: 4px; font-size: 0.66rem; font-weight: 800;
                                     letter-spacing: 0.04em; color: #4cc8f0;">📦 NA EXPEDIÇÃO</span>` : ''}
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
     * Lê o estágio e o responsável de todos os modelos que a LISTA desenha.
     *
     * Consulta própria, e de propósito: as duas colunas são novas, e enquanto
     * `sql/painel_do_acabamento.sql` não tiver rodado o banco responde que a
     * coluna não existe. Aqui isso vira um recado nesta tela; se estivesse
     * junto da consulta do Painel de Produção, derrubaria a lista da gráfica.
     *
     * ## O recorte é o da LISTA, e não o da fila
     *
     * Corrigido em 24/08/2026, com a tela na mão do usuário: *"pedidos que já
     * estavam marcados como pronto voltaram para a lista inicial"*.
     *
     * A causa não era o estágio nem o dado gravado — era este recorte. Ao ir
     * para a expedição o pedido tem o `status_interno` trocado para EXPEDICAO e
     * sai do `pedidosEmProducao`, mas continua na TABELA de propósito (ver
     * `pedidosDoPainel`). Com a consulta presa ao recorte da fila, os modelos
     * dele não entravam no mapa; o `estagioDoModelo` não achava escolha
     * nenhuma, caía na derivação da impressão e respondia "Impresso". O pedido
     * voltava para a lista de trabalho como se o acabamento não tivesse
     * acontecido, e sumia do botão de despachados (hoje "Expedição") — que é
     * exatamente onde o aviso do envio manda o operador procurá-lo.
     *
     * Quem desenha a lista e quem lê o estágio dela precisam enxergar o mesmo
     * conjunto de pedidos. Por isso os dois chamam `pedidosDoPainel`.
     */
    async function carregarAcabamentoDosModelos() {
        const numeros = pedidosDoPainel()
            .map(os => parseInt(os.numero))
            .filter(n => !isNaN(n));
        if (!numeros.length) {
            tela.acabamento = {};
            tela.numerosNoMapa = new Set();
            return;
        }

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
                    .select('id, id_int, acabamento_status, acabamento_responsavel, acabamento_foto_url, acabamento_pronto_em, id_produto_proposta_origem')
                    .in('id_int', fatia);
                if (error) throw error;
                (data || []).forEach(m => {
                    mapa[String(m.id)] = {
                        status: m.acabamento_status || '',
                        responsavel: m.acabamento_responsavel || '',
                        foto: m.acabamento_foto_url || '',
                        prontoEm: m.acabamento_pronto_em || '',
                        // O produto que originou o modelo. É por ele que o
                        // recorte por setor descobre a que setor o modelo
                        // pertence — ver `setorDoModelo`. Vem de carona nesta
                        // consulta, que já percorre os mesmos pedidos: uma coluna
                        // a mais, nenhuma requisição a mais.
                        produtoOrigem: (m.id_produto_proposta_origem === undefined
                            || m.id_produto_proposta_origem === null)
                            ? null : m.id_produto_proposta_origem,
                    };
                });
            }
            tela.acabamento = mapa;
            tela.numerosNoMapa = new Set(numeros.map(String));
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

    /**
     * Há pedido na lista cujo estágio nunca foi buscado?
     *
     * `tela.numerosNoMapa` é o que a última consulta cobriu. Quando o
     * `loadOrdens` traz pedidos depois dela — e na primeira abertura da tela ele
     * traz TODOS, porque `state.ordens` ainda estava vazio quando o mapa foi
     * montado —, esses pedidos ficam sem escolha nenhuma e caem na derivação da
     * impressão. Um pedido inteiro em "Pronto" apareceria como "Impresso".
     */
    function faltamEstagiosNaLista() {
        // O banco já disse que não dá (coluna ainda não existe): insistir só
        // repetiria a falha a cada desenho, e o recado ao operador já foi dado.
        if (tela.erroAcabamento) return false;
        return pedidosDoPainel().some(os => {
            const n = parseInt(os.numero);
            return !isNaN(n) && !tela.numerosNoMapa.has(String(n));
        });
    }

    /**
     * Busca o estágio dos pedidos que chegaram depois da última consulta.
     *
     * Chamada de dentro do `renderOrdens` embrulhado, que é onde a lista de
     * pedidos acaba de ser trocada. Não entra em laço: ou a consulta cobre os
     * novos números — e aí não falta mais nada —, ou ela falha e o
     * `erroAcabamento` fecha a porta.
     */
    function completarEstagiosDaLista() {
        if (tela.buscandoEstagios || !faltamEstagiosNaLista()) return;
        tela.buscandoEstagios = true;
        carregarAcabamentoDosModelos()
            .catch(() => {})
            .then(() => {
                tela.buscandoEstagios = false;
                render();
                if (tela.pedidoAberto) renderDetalhe();
            });
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

    /**
     * A janela da amostra: a pilha de botões é o PISO, não o teto.
     *
     * Duas correções do usuário no mesmo dia, 26/08/2026, e a segunda ajusta a
     * primeira.
     *
     * A primeira foi *"deixar janela da amostra na mesma altura dos botões"*, e
     * virou altura exata: `ALTURA_DA_PILHA`, a conta dos quatro botões mais os
     * espaços entre eles. Com a arte deitada da Triband ficou bom.
     *
     * A segunda veio quando ele abriu um pedido de credencial PVC, cuja arte é
     * EM PÉ: *"altura ficou pequena, imagem não acompanhou tamanho da janela"*.
     * Numa janela larga e baixa, arte em pé encosta na altura antes de usar um
     * décimo da largura — e 194 px de altura deixavam a credencial do tamanho de
     * um selo no meio de uma faixa vazia.
     *
     * Então a altura passou a ser um MÍNIMO: a janela nasce com a altura da
     * pilha de botões (é o que alinha a coluna da amostra com a das decisões) e
     * cresce até o fim da coluna, que é onde a tabela de especificação também
     * termina. O topo continua alinhado com o primeiro botão; o que mudou é que
     * o rodapé agora encosta no rodapé da coluna em vez de parar no meio.
     *
     * A imagem é `position: absolute` com `inset: 0` de propósito. Fora do
     * fluxo, ela não entra na conta da altura da janela — e é essa a diferença
     * entre "a imagem acompanha a janela" e "a imagem manda na janela". Com ela
     * no fluxo e `width: 100%`, uma arte em pé esticada na largura da coluna
     * puxava a altura pela proporção e crescia o card inteiro. O
     * `object-fit: contain` é o que mantém a proporção da arte: ela cresce até
     * encostar no lado mais apertado da janela e para ali.
     */
    function amostraHtml(item, idAmostra) {
        const { src, aprovada } = amostraDoModelo(item);
        // Sem `max-width`: a amostra ocupa a metade que é dela, e quem manda no
        // tamanho é a coluna. Pedido do usuário em 20/08/2026.
        // `flex: 1 1 0` e não `1 1 auto`, e isto não é detalhe de estilo: com
        // base `auto` a janela é medida pelo que está DENTRO dela, e a imagem
        // esticada na largura da coluna arrastava a altura junto pela proporção
        // — uma credencial em pé numa coluna de 600 px pedia 830 px de altura e
        // esticava o card inteiro. Com base 0 quem decide a altura é a COLUNA,
        // e a imagem se acomoda no que sobrou.
        const moldura = 'width: 100%; flex: 1 1 0; min-height: ' + ALTURA_DA_JANELA + 'px;'
            + ' position: relative;'
            + ' border: 1px dashed rgba(76,200,240,0.26); background: rgba(76,200,240,0.06);'
            + ' display: flex; align-items: center; justify-content: center;';
        const caixa = 'display: flex; flex-direction: column; gap: 6px; width: 100%;'
            + ' flex: 1 1 auto; min-height: 0;';

        if (!src) {
            return `<div style="${caixa}">
                        <div style="${moldura} color: var(--text-dim); flex-direction: column; gap: 6px; text-align: center; padding: 12px;">
                            <span style="font-size: 1.8rem;">🖼️</span>
                            <span style="font-size: 0.78rem;">Sem amostra enviada ao cliente</span>
                        </div>
                    </div>`;
        }

        if (ehPdf(src)) {
            return `<div style="${caixa}">
                        <div style="${moldura} flex-direction: column; gap: 8px; color: #4cc8f0; cursor: pointer; text-align: center; padding: 12px;"
                             onclick="window.open('${escJs(src)}', '_blank')" title="Amostra em PDF — clique para abrir o arquivo">
                            <span style="font-size: 2rem;">📄</span>
                            <span style="font-size: 0.78rem; font-weight: 700;">Amostra em PDF — abrir arquivo</span>
                        </div>
                    </div>`;
        }

        const legenda = aprovada
            ? 'Amostra aprovada pelo cliente no link — clique para ampliar'
            : 'Arte do modelo — clique para ampliar';

        // SEM fundo branco atras da imagem, por pedido do usuario em
        // 20/08/2026: a arte ja traz o proprio fundo, e a chapa branca em volta
        // dela recortava um retangulo claro no meio da caixa escura.
        //
        // A moldura tracejada some quando ha arte (`border: none`): ela existe
        // para dar corpo ao aviso de "sem amostra", e em volta da arte era mais
        // um fio competindo com o contorno do card.
        // A legenda vai DENTRO da janela desde 29/08/2026, sobre um degradê:
        // embaixo dela ela custava 27 px de altura em cada modelo, e o pedido do
        // usuário naquele dia foi ganhar espaço vertical.
        return `
            <div style="${caixa}">
                <div style="${moldura} border: none; background: none; overflow: hidden;">
                    <img id="${idAmostra}" src="${esc(src)}" alt="Amostra do modelo"
                         style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; cursor: zoom-in; display: block;"
                         onclick="AcabamentoPainel.ampliar('${escJs(idAmostra)}')" title="${esc(legenda)}" />
                    <span style="${ESTILO_LEGENDA_DENTRO}">🔍 ${esc(legenda)}</span>
                </div>
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

    /**
     * O rótulo de uma coluna do card, da MESMA altura do cabeçalho azul da
     * tabela de especificação.
     *
     * Pedido do usuário em 26/08/2026: ajustar os alinhamentos entre botões e
     * objetos. As três colunas do card — amostra, especificação e acabamento —
     * começavam em alturas diferentes, porque só a do meio tinha cabeçalho e as
     * outras duas eram centradas na vertical. Com um rótulo de altura igual à do
     * cabeçalho azul (36 px, que é o que aquele `th` mede com 9 px de padding e
     * 0,92 rem de fonte), o primeiro item das três colunas nasce na mesma linha.
     *
     * O rótulo é uma FAIXA DE TEXTO, não uma caixa: em 22/08/2026 o usuário
     * pediu que a coluna dos botões não tivesse moldura em volta, porque ela
     * competia com o contorno do card. Um fio embaixo do texto marca o começo da
     * coluna sem fechar nada.
     */
    // A MEDIDA da faixa que abre cada coluna, sem a tipografia do rotulo.
    //
    // Ela existe desde 26/08/2026, quando o botao Fotografar passou a ocupar
    // essa faixa na coluna da especificacao: pendurar o botao no
    // `ROTULO_DA_COLUNA` fazia ele herdar `text-transform: uppercase` e o
    // `letter-spacing` do rotulo -- o recado ao lado saia gritando em caixa
    // alta. A regua e a altura; a tipografia e so de quem escreve rotulo.
    const FAIXA_DA_COLUNA = 'display: flex; align-items: center; height: 36px;'
        + ' padding: 0 2px; border-bottom: 1px solid rgba(76,200,240,0.22);';

    const ROTULO_DA_COLUNA = 'display: flex; align-items: center; height: 36px;'
        + ' font-size: 0.74rem; font-weight: 800; text-transform: uppercase;'
        + ' letter-spacing: 0.08em; color: #8fb6e0; padding: 0 2px;'
        + ' border-bottom: 1px solid rgba(76,200,240,0.22); white-space: nowrap;';

    /** O sub-rótulo de um campo dentro da coluna (o "Responsável", o "Volumes"). */
    const SUBROTULO_DO_CAMPO = 'font-size: 0.7rem; font-weight: 800; text-transform: uppercase;'
        + ' letter-spacing: 0.04em; color: #94a3b8;';

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
        // `height: 100%` para a tabela terminar na mesma linha que a amostra e
        // que os botões: as linhas repartem entre si a sobra da coluna mais
        // alta, em vez de deixar um vão escuro embaixo da tabela.
        return `
            <table style="width: 100%; height: 100%; border-collapse: collapse; border-radius: 10px;
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
    /**
     * O botão REVISADO, único, na barra de título do modelo.
     *
     * Até 29/08/2026 eram QUATRO botões empilhados numa coluna de 210 px:
     * Aguardando · Impresso · Em acabamento · Pronto. Dois deles nunca foram
     * escolha deste setor — `Aguardando` e `Impresso` são DERIVADOS da
     * impressão, e marcar "Aguardando" num modelo já impresso nem grudava.
     * Restava uma decisão de verdade, e ela virou um botão só.
     *
     * Ele fica ao lado do RESPONSÁVEL, que é quem o libera. Enquanto os quatro
     * moravam no pé da terceira coluna e o seletor no alto da barra, a tela
     * precisava de um recado com uma seta ligando um ao outro; lado a lado, o
     * comando e a trava se explicam sozinhos.
     *
     * Clicar quando aceso DESMARCA: grava vazio, e o estágio volta a ser
     * derivado da impressão — que é a verdade sobre o material, e o mesmo
     * caminho que o `tirarDoVolume` já usava.
     *
     * O que se perdeu junto com "Em acabamento" foi a afirmação de que alguém
     * começou o trabalho. Quem responde isso agora é o RESPONSÁVEL, que é
     * obrigatório antes do Revisado: modelo com nome escolhido e ainda não
     * revisado é um modelo em acabamento, e é assim que a métrica da fila e o
     * filtro da lista passaram a contar.
     */
    function botaoDeRevisado(item, osId, pode) {
        const revisado = estagioDoModelo(item) === 'Pronto';
        const temResponsavel = !!responsavelDoModelo(item);
        const liberado = pode && temResponsavel;
        const rgb = COR_DO_ESTAGIO['Pronto'];

        // Texto ESCURO no botão pintado, como nos quatro de antes: o verde é
        // claro, e branco sobre ele some sob a luz da gráfica.
        const cor = revisado
            ? `background: rgb(${rgb}); border-color: rgb(${rgb}); color: #0b1220; font-weight: 800;`
              + ` box-shadow: 0 3px 10px rgba(${rgb},0.32);`
            : `background: rgba(255,255,255,0.045); border-color: rgba(${rgb},0.35);`
              + ` border-left: 4px solid rgb(${rgb}); color: rgb(${rgb}); font-weight: 700;`;

        const titulo = !temResponsavel
            ? 'Escolha o responsável deste modelo, ao lado, para liberar o Revisado'
            : (revisado
                ? 'Este modelo está revisado — clique para desmarcar'
                : 'Marcar este modelo como revisado');

        // Aceso, o clique DESMARCA (grava vazio). Apagado, marca.
        const alvo = revisado ? '' : 'Pronto';

        return `
            <button type="button" data-revisado="${revisado ? '1' : '0'}"
                    aria-pressed="${revisado ? 'true' : 'false'}"
                    ${liberado ? '' : 'disabled'}
                    style="${ESTILO_BOTAO_REVISADO}${cor}${liberado ? '' : ESTILO_BOTAO_TRAVADO}"
                    onclick="AcabamentoPainel.mudarEstagio('${escJs(item.id)}', '${escJs(osId)}', '${alvo}')"
                    title="${esc(titulo)}">${revisado ? '✓ ' : ''}Revisado</button>`;
    }

    /**
     * A saída da trava, escrita na tela.
     *
     * Só para quem PODE editar e ainda não escolheu o responsável — a quem só
     * vê, o recado não serviria de nada. Ele quebra para a linha de baixo da
     * barra sozinho, pelo `flex-wrap` dela.
     */
    function recadoDoResponsavel(item) {
        if (!podeEditar() || responsavelDoModelo(item)) return '';
        return `<span style="font-size:0.7rem; color:#fcd34d; width: 100%; text-align: right;">`
             + `Escolha o <b>Responsável</b> ao lado para liberar o Revisado.</span>`;
    }

    /**
     * A hora em que o modelo foi revisado, para a faixa acima da
     * especificação. Só existe quando o banco carimbou — modelo revisado antes
     * de 23/08/2026 não tem hora, e inventar uma seria pior do que não mostrar.
     */
    function carimboDoRevisado(item) {
        if (estagioDoModelo(item) !== 'Pronto') return '';
        const hora = textoDaHoraDoPronto(prontoEmDoModelo(item));
        if (!hora) return '';
        return `<span style="font-size:0.7rem; color:#4ade80; white-space: nowrap;">🕒 ${esc(hora)}</span>`;
    }

    /**
     * O responsável na BARRA DE TÍTULO do modelo, no lugar onde ficava o
     * botão Fotografar.
     *
     * Pedido do usuário em 26/08/2026. A troca faz sentido pela hierarquia do
     * card: a barra de título responde QUEM — o nome do modelo, o código, o
     * estágio, o setor —, e o responsável é a última pergunta desse grupo. A
     * foto é registro, não decisão, e desceu para junto da especificação.
     *
     * Ele governa os quatro botões de status (sem responsável, nenhum estágio se
     * mexe), e agora esse comando fica ACIMA do que ele comanda, em vez de
     * escondido no fim da terceira coluna.
     *
     * O rótulo vai ao lado, e não em cima: a barra é de uma linha só, e um
     * rótulo empilhado a faria crescer para todos os modelos. Os recados de
     * "nenhum operador cadastrado" continuam saindo do `selectResponsavel`, e
     * quebram para a linha de baixo quando aparecem — é o `flex-wrap` da própria
     * barra que cuida disso.
     */
    function responsavelNoTitulo(item, osId) {
        const pode = podeEditar();
        return `
            <div style="display: flex; align-items: center; justify-content: flex-end;
                        gap: 8px; margin-left: auto; flex: 0 1 420px; min-width: 300px;
                        flex-wrap: wrap;">
                <div style="flex: 1 1 auto; min-width: 150px;">
                    ${selectResponsavel(item, osId, pode)}
                </div>
                ${botaoDeRevisado(item, osId, pode)}
                ${recadoDoResponsavel(item)}
            </div>`;
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

        const opcoes = [`<option value="" style="${ESTILO_OPCAO}">— Responsável —</option>`].concat(
            nomes.map(n => `<option value="${esc(n)}" style="${ESTILO_OPCAO}" `
                + `${n.toLowerCase() === atual.toLowerCase() ? 'selected' : ''}>${esc(n)}</option>`)
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

        // A palavra "Responsável" vai DENTRO da caixa, na mesma linha do nome
        // (pedido do usuário em 29/08/2026: "drop do responsável pode ser menor
        // e sem legenda, legenda pode ficar dentro do próprio box"). O rótulo
        // ao lado custava uma linha de altura em cada modelo, e a tela precisa
        // de espaço vertical. O <select> continua sendo um <select> de verdade:
        // ele fica transparente dentro da caixa, que é quem desenha a moldura.
        return `
            <div style="${ESTILO_CAIXA_DO_SELECT}${podeEditar ? '' : ESTILO_SELECT_TRAVADO}">
                <span style="${SUBROTULO_DENTRO_DA_CAIXA}">Responsável</span>
                <select ${podeEditar ? '' : 'disabled'} style="${ESTILO_SELECT}"
                        onchange="AcabamentoPainel.mudarResponsavel('${escJs(item.id)}', '${escJs(osId)}', this.value)"
                        title="Quem é o responsável pelo acabamento deste modelo">
                    ${opcoes}
                </select>
            </div>
            ${recado}`;
    }

    const ESTILO_CAIXA_DO_SELECT = 'display: flex; align-items: center; gap: 8px;'
        + ' background: #0d0e20; border: 1px solid rgba(76,200,240,0.26); border-radius: 6px;'
        + ' padding: 0 10px; width: 100%; min-width: 0;'
        + ' box-shadow: 0 2px 5px rgba(0,0,0,0.3);';
    const SUBROTULO_DENTRO_DA_CAIXA = 'font-size: 0.62rem; font-weight: 800;'
        + ' text-transform: uppercase; letter-spacing: 0.05em; color: #7f93a8;'
        + ' white-space: nowrap; flex-shrink: 0;';
    // ## O fundo do `<select>` NÃO pode ser `transparent`
    //
    // Em 29/08/2026 o seletor do responsável ficou sem moldura própria, dentro
    // da caixa que desenha a borda — e para isso ele foi posto em
    // `background: transparent`. A caixa continuou igual na tela, e a LISTA
    // sumiu: no Windows o Chrome pinta o balão do `<select>` com a cor de fundo
    // dele, e sem cor nenhuma o balão sai branco. Com o texto em `#ffffff`, os
    // nomes ficaram brancos no branco — o operador abria o drop e via um
    // retângulo vazio. Foi o que o usuário relatou no mesmo dia: "drops dos
    // responsáveis não está trazendo os usuários".
    //
    // A cor aqui é a MESMA da caixa em volta (`ESTILO_CAIXA_DO_SELECT`), então
    // o desenho fechado continua exatamente como ele pediu — quem muda é só o
    // balão, que passa a ter onde se pintar. `ESTILO_OPCAO` repete a cor em
    // cada `<option>`, porque nem todo navegador herda a do select.
    const ESTILO_SELECT = 'appearance: none; -webkit-appearance: none; -moz-appearance: none;'
        + ' background: #0d0e20; border: none; color: #ffffff;'
        + ' padding: 6px 0; font-size: 0.92rem; flex: 1 1 auto; min-width: 0;'
        + ' text-align: center; text-align-last: center; font-weight: 600; cursor: pointer;';
    const ESTILO_OPCAO = 'background: #0d0e20; color: #ffffff;';
    const ESTILO_SELECT_TRAVADO = ' opacity: 0.55; cursor: not-allowed;';

    // O mesmo seletor FORA de uma caixa — nas janelas, onde não há moldura em
    // volta para desenhar a borda por ele.
    const ESTILO_SELECT_SOLTO = ESTILO_SELECT
        + ' border: 1px solid rgba(76,200,240,0.26); border-radius: 6px;'
        + ' padding: 8px 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); width: 100%;'
        + ' box-sizing: border-box;';

    // ## As medidas da pilha de botões, num lugar só
    //
    // 44 px de altura porque na estação se clica de pé, às vezes com a mão suja
    // de tinta — é a regra do usuário de 22/08/2026, e a altura é FIXA e não um
    // mínimo, para os quatro serem do mesmo tamanho mesmo quando um rótulo
    // quebra em duas linhas.
    //
    // `ALTURA_DA_PILHA` sai daqui e é usada também pela janela da amostra, por
    // pedido do usuário em 26/08/2026: *"deixar janela da amostra na mesma
    // altura dos botões"*. As duas colunas passam a começar e a terminar na
    // mesma linha, e não há dois números para manter em sincronia — se um dia a
    // altura do botão mudar, a amostra acompanha sozinha.
    const ALTURA_DO_BOTAO = 44;
    const ESPACO_DOS_BOTOES = 6;

    // A altura mínima das janelas de imagem — a da amostra e, desde 29/08/2026,
    // a da foto do material.
    //
    // Até essa data ela era DERIVADA da pilha de quatro botões de estágio: as
    // duas colunas começavam e terminavam na mesma linha porque compartilhavam
    // a mesma conta. Com a pilha desfeita, o número ficou sem dono, e passou a
    // ser uma constante com o valor que já estava na tela — mudar a altura das
    // janelas agora é decisão própria, e não efeito colateral de outra coisa.
    const ALTURA_DA_JANELA = 194;

    // ## O desenho do botão, refeito em 26/08/2026
    //
    // O usuário olhou a tela e disse que os botões estavam feios. Eram quatro
    // pastilhas de cores diferentes, cada uma com fio de 2 px e fundo tingido na
    // própria cor, e o rótulo CENTRADO — como cada estágio tem um nome de
    // tamanho diferente, o texto começava num ponto diferente em cada botão, e a
    // pilha saía toda desalinhada por dentro. O selecionado ainda ganhava um
    // anel de 3 px por fora, que engordava o botão e o fazia brigar com os
    // vizinhos.
    //
    // Agora os quatro são um SISTEMA: fundo neutro igual para todos, fio de
    // 1 px, e a cor do estágio aparece só onde identifica — numa faixa de 4 px
    // à esquerda, que alinha os quatro numa régua vertical. O ícone mora numa
    // casa de largura fixa e o rótulo começa sempre no mesmo x. O selecionado é
    // o único pintado por dentro, e o ✓ vai encostado na direita, formando
    // coluna própria em vez de empurrar o texto.
    //
    // As quatro cores continuam sendo as de `COR_DO_ESTAGIO`, que o usuário
    // ditou: elas codificam estado e não se repintam para combinar com nada.
    const ESTILO_BOTAO_ESTAGIO = 'display: flex; align-items: center; gap: 9px;'
        + ' width: 100%; min-width: 0; height: 100%; min-height: ' + ALTURA_DO_BOTAO + 'px; padding: 0 11px;'
        + ' border-style: solid; border-width: 1px; border-radius: 9px; cursor: pointer;'
        + ' font-size: 0.85rem; line-height: 1.1; text-align: left; font-family: inherit;'
        + ' transition: background-color .12s ease, border-color .12s ease;';
    // Travado apaga o botão, mas não troca a cor: o operador sem permissão de
    // editar continua LENDO em que ponto o modelo está.
    const ESTILO_BOTAO_TRAVADO = ' opacity: 0.5; cursor: not-allowed; box-shadow: none;';

    // O Revisado da barra de título. Mais baixo que os 44 px dos quatro botões
    // de antes porque ele agora divide a linha com o seletor do responsável, e
    // é a barra inteira que precisa ficar rasa — o pedido do usuário em
    // 29/08/2026 foi ganhar espaço vertical.
    const ESTILO_BOTAO_REVISADO = 'display: inline-flex; align-items: center; gap: 8px;'
        + ' border-style: solid; border-width: 1px; border-radius: 7px; cursor: pointer;'
        + ' padding: 6px 16px; font-size: 0.92rem; line-height: 1.1; white-space: nowrap;'
        + ' font-family: inherit; flex-shrink: 0;'
        + ' transition: background-color .12s ease, border-color .12s ease;';

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
        // O setor do modelo, no cabeçalho do card. Ele já governava o peso e os
        // volumes lá em cima, mas o card não o dizia: para saber de que setor
        // era aquele modelo, o operador tinha de lembrar de qual produto ele
        // vinha. O chip ocupa a faixa vazia que sobrava no meio do cabeçalho
        // (pedido do usuário em 26/08/2026: aproveitar melhor os espaços).
        const setorDoItem = normalizar(item && item.setor);
        const rotuloSetor = ROTULO_DO_SETOR[setorDoItem];
        const chipDoSetor = rotuloSetor
            ? `<span title="Setor deste modelo — é por ele que se contam o peso e os volumes"
                     style="display: inline-flex; align-items: center; gap: 5px;
                            background: rgba(76,200,240,0.10); border: 1px solid rgba(76,200,240,0.30);
                            color: #9fd8f2; border-radius: 999px; padding: 2px 10px;
                            font-size: 0.72rem; font-weight: 700; white-space: nowrap;">
                   ${rotuloSetor.icone} ${esc(rotuloSetor.nome)}
               </span>`
            : '';

        return `
            <div style="background: ${fundo}; ${estiloDoCardNaEscolha(item)} border-radius: 10px; margin-bottom: 12px; overflow: hidden;">

                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 7px 14px; border-bottom: 1px dashed rgba(255,255,255,0.14);">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1 1 auto; min-width: 220px;">
                        ${caixaDeEscolha(item)}
                        <span style="width: 22px; height: 22px; min-width: 22px; border-radius: 50%; background-color: ${corHex || 'transparent'}; border: ${corHex ? '2px solid rgba(255,255,255,0.8)' : '2px dashed rgba(207,230,251,0.45)'}; display: inline-block;" title="Cor de referência: ${esc(corNome || 'nenhuma')}"></span>
                        <strong style="font-size: 1.2rem; color: #ffffff;">${esc(item.produto || item.nome_modelo || 'Modelo')}</strong>
                        <span class="badge" title="Código do modelo">#${esc(item.modelo || item.id || '--')}</span>
                        ${seloDoEstagio(estagio)}
                        ${chipDoSetor}
                    </div>
                    ${responsavelNoTitulo(item, osId)}
                </div>

                <!-- AS TRÊS COLUNAS, refeitas em 29/08/2026 a pedido do usuário:
                     Foto | Amostra | Especificação. A coluna das DECISÕES saiu —
                     o Revisado subiu para a barra de título, ao lado do
                     responsável que o libera — e a foto tomou o lugar dela, do
                     outro lado da amostra: o revisor compara o que o cliente
                     aprovou com o que está na mesa, lado a lado.

                     As LARGURAS: 180 + 200 + 280, mais os dois vãos de 18, dão
                     696 dentro dos ~780 px úteis do corpo do detalhe. Quem
                     decide a quebra de linha é a soma das bases, e não os
                     min-width — estourá-la joga a última coluna para baixo, que
                     é o rodapé que o desenho de 22/08 veio desfazer.

                     As três continuam começando na mesma linha: a faixa de 36 px
                     no alto de cada uma é a régua comum, e ela é a altura exata
                     do cabeçalho azul da tabela de especificação. -->
                <div style="display: flex; gap: 18px; flex-wrap: wrap; align-items: stretch; padding: 12px 14px;">
                    <div style="flex: 0 1 180px; min-width: 150px; display: flex; flex-direction: column; gap: 8px;">
                        ${colunaDaFoto(item, osId, idx)}
                        ${blocoDeVolumesDoModelo(item)}
                    </div>

                    <div style="flex: 1 1 200px; min-width: 180px; max-width: 100%; display: flex; flex-direction: column; gap: 8px;">
                        <div style="${ROTULO_DA_COLUNA}">Amostra</div>
                        ${amostraHtml(item, idAmostra)}
                    </div>

                    <div style="flex: 0 1 280px; min-width: 220px; display: flex; flex-direction: column;">
                        <!-- A faixa que era do botão Fotografar agora carrega a hora
                             do Revisado: ela é a régua desta coluna e não pode sumir,
                             e a hora não tinha mais onde morar depois que a pilha de
                             botões saiu. -->
                        <div style="${FAIXA_DA_COLUNA} justify-content: flex-end; gap: 8px;">
                            ${carimboDoRevisado(item)}
                        </div>
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
                </div>
            </div>`;
    }

    /**
     * O progresso do pedido aberto: o selo e a barra do cabeçalho.
     *
     * Os dois juntos, numa função só, porque dizem a mesma coisa e não podem
     * discordar — um `escrever` solto no selo, sem a barra, deixaria a barra
     * mostrando o pedido anterior.
     */
    /**
     * Os modelos que a tela do pedido mostra AGORA.
     *
     * Com nenhum setor aceso, são todos. Com um ou mais, só os daqueles — a
     * mesma regra de recorte que os cards da fila já aplicam à lista, agora
     * dentro do pedido (pedido do usuário em 29/08/2026).
     */
    function modelosVisiveisDoPedido() {
        const todos = modelosDoPedidoAberto();
        if (!tela.setoresNoPedido.length) return todos;
        return todos.filter(m => tela.setoresNoPedido.indexOf(normalizar(m && m.setor)) !== -1);
    }

    /**
     * A fileira de botões de setor, acima do número do pedido.
     *
     * Os quatro setores da casa aparecem SEMPRE, na ordem do
     * `SETORES_DO_BANCO`, com quantos modelos deste pedido cada um tem. Setor
     * que o pedido não usa fica apagado e sem clique, em vez de sumir: sumindo,
     * a fileira mudaria de tamanho de pedido para pedido e o olho perderia a
     * referência — e a conta ao lado do nome diz, antes do clique, o que há lá
     * dentro.
     */
    function fileiraDeSetoresDoPedido(itens) {
        const conta = {};
        (itens || []).forEach(m => {
            const st = normalizar(m && m.setor);
            if (SETORES_DO_BANCO.indexOf(st) !== -1) conta[st] = (conta[st] || 0) + 1;
        });

        const todos = `<button type="button" class="prod-btn-dark filter-btn-pill${tela.setoresNoPedido.length ? '' : ' active'}"
                    style="${ESTILO_PILULA_SETOR}"
                    onclick="AcabamentoPainel.setSetorDoPedido('')"
                    title="Mostrar todos os modelos deste pedido">🌐 Todos os Setores</button>`;

        const pilulas = SETORES_DO_BANCO.map(st => {
            const r = ROTULO_DO_SETOR[st] || { nome: st, icone: '📦' };
            const quantos = conta[st] || 0;
            const aceso = tela.setoresNoPedido.indexOf(st) !== -1;
            if (!quantos) {
                return `<button type="button" class="prod-btn-dark filter-btn-pill" disabled
                        style="${ESTILO_PILULA_SETOR} opacity: 0.38; cursor: not-allowed;"
                        title="Este pedido não tem modelo em ${esc(r.nome)}">${r.icone} ${esc(r.nome)}
                        <span style="${ESTILO_CONTA_DA_PILULA}">—</span></button>`;
            }
            return `<button type="button" class="prod-btn-dark filter-btn-pill${aceso ? ' active' : ''}"
                    style="${ESTILO_PILULA_SETOR}"
                    onclick="AcabamentoPainel.setSetorDoPedido('${st}')"
                    title="Somar ou tirar o setor ${esc(r.nome)} desta tela">${r.icone} ${esc(r.nome)}
                    <span style="${ESTILO_CONTA_DA_PILULA}">${quantos}</span></button>`;
        }).join('');

        return todos + pilulas
            + `<span style="font-size: 0.68rem; color: var(--text-dim); margin-left: 6px;">clique em mais de um para somar</span>`;
    }

    const ESTILO_PILULA_SETOR = 'padding: 0.4rem 0.8rem; border-radius: 0.75rem;'
        + ' font-size: 0.75rem; font-weight: 700; width: auto; gap: 6px;'
        + ' text-transform: none; white-space: nowrap;';
    const ESTILO_CONTA_DA_PILULA = 'font-size: 0.68rem; font-weight: 800; opacity: 0.75;';

    function pintarProgressoDoPedido(prontos, total) {
        escrever('acab-detalhe-progresso', `${prontos}/${total} revisados`);
        const barra = document.getElementById('acab-detalhe-barra');
        if (barra) barra.style.width = (total > 0 ? Math.round((prontos / total) * 100) : 0) + '%';
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
            escreverHtml('acab-setores-do-pedido', '');
            escreverHtml('acab-lateral-resumo', painelResumoHtml(os, [], []));
            pintarProgressoDoPedido(0, 0);
            return;
        }

        // O RECORTE por setor manda em tudo o que vem abaixo: os modelos
        // desenhados, o progresso e o resumo. Menos a expedição, que é do
        // pedido inteiro — ver `rodapeDaExpedicao`.
        const visiveis = modelosVisiveisDoPedido();
        escreverHtml('acab-setores-do-pedido', fileiraDeSetoresDoPedido(itens));
        escreverHtml('acab-lateral-resumo', painelResumoHtml(os, itens, visiveis));

        const prontos = visiveis.filter(i => estagioDoModelo(i) === 'Pronto').length;
        pintarProgressoDoPedido(prontos, visiveis.length);

        // Agrupado por produto, na mesma ordem em que a fila do Pedido desenha.
        const grupos = {};
        visiveis.forEach(item => {
            const prodId = item._vibe_id_produto || 'sem_produto';
            if (!grupos[prodId]) grupos[prodId] = [];
            grupos[prodId].push(item);
        });
        // E dentro de cada produto, os PRONTOS por último (regra do usuário,
        // 29/08/2026). O que já saiu da mesa não pode ficar na frente do que
        // ainda está nela — de pé na estação, o operador rola a lista para
        // achar o que falta, e não o que acabou.
        Object.keys(grupos).forEach(k => { grupos[k] = ordenarProntosNoFim(grupos[k]); });

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

        // A conta do que foi marcado NÃO vai aqui: ela é fixa contra a janela,
        // no `#acab-barra-escolha`, porque dentro deste contêiner ela sumia da
        // tela — ver o comentário do `barraDaEscolha`.
        // O peso e a expedição saíram daqui em 29/08/2026: eles agora moram no
        // Resumo do pedido, na coluna da direita, que não rola com os modelos.
        corpo.innerHTML = html || `<div style="padding: 28px; text-align: center; color: var(--text-dim);">
                       Nenhum modelo neste setor. Clique em <b>Todos os Setores</b>, no topo, para ver o pedido inteiro.
                   </div>`;
        pintarBarraDaEscolha(itens);

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

        // A coluna da direita troca de moradora: Métricas do Dia com a lista
        // aberta, Resumo do pedido com um pedido aberto. Nunca as duas.
        const metricas = document.getElementById('acab-lateral-metricas');
        const resumo = document.getElementById('acab-lateral-resumo');
        if (metricas) metricas.style.display = emDetalhe ? 'none' : 'flex';
        if (resumo) resumo.style.display = emDetalhe ? 'flex' : 'none';

        // A barra da escolha é fixa contra a janela: fechada a tela do pedido,
        // ela ficaria boiando por cima da lista se ninguém a tirasse daqui.
        pintarBarraDaEscolha([]);
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

    // ─── A balança ──────────────────────────────────────────────────────────
    //
    // Pedido do usuário em 24/08/2026. Na edição do pedido o operador já
    // fotografa o material pela webcam da estação; ele também o pesa, numa
    // balança Urano CP 3/0.5 POP, e até aqui lia o número no visor e digitava.
    // Agora um botão ⚖ ao lado de cada campo de peso traz o número da balança.
    //
    // ## Por que isto passa pelo agente, e não pelo navegador
    //
    // Porta serial no navegador só existe com WebSerial: Chrome, e com permissão
    // concedida à mão em cada máquina. Nenhuma solução deste projeto pode
    // depender de configurar navegador — cada estação usa um diferente. Então o
    // agente lê a porta, e o painel pergunta a ele pela rota local
    // `/api/balanca/peso`, do mesmo jeito que já pergunta o peso por setor.
    //
    // ## Por que o botão não existe no site
    //
    // Porque a balança está numa mesa, ligada a UM computador. Aberto o painel
    // pelo site, não há porta serial nenhuma do outro lado — e botão que não faz
    // nada é pior que botão nenhum. Quem decide é o `pelaEstacao()`.
    //
    // ## Por que "não achei a balança" não chega como erro
    //
    // Porque quase nunca é defeito. Na CP POP a saída de dados (serial RJ45 ou
    // USB) é OPCIONAL de fábrica, e mesmo instalada precisa ser ligada no
    // teclado da balança: FUNÇÃO 8, senha 191249, opção "Tipo 1". Nada disso o
    // operador adivinha. Então a falha abre uma caixa que diz o motivo, mostra o
    // que cada porta COM da máquina respondeu, e escreve os passos do teclado —
    // a saída, na própria tela, como toda trava daqui precisa ter.

    /** Onde cada botão ⚖ escreve o peso que leu. */
    const CAMPO_DA_BALANCA = {
        setor: (numeroDoPedido, setor) => 'acab-peso-' + setor,
        registro: () => 'acab-reg-peso',
        linha: (indice) => 'acab-reg-peso-' + indice,
        obrigatorio: () => 'acab-peso-obrig-campo',
    };

    const balanca = { lendo: false };

    /** Só a estação tem balança ligada; no site não há o que ler. */
    function haBalanca() {
        return pelaEstacao();
    }

    /** O botão ⚖ ao lado de um campo de peso. Vazio fora da estação. */
    function botaoDaBalanca(destino, a, b) {
        const monta = CAMPO_DA_BALANCA[destino];
        if (!haBalanca() || !monta) return '';
        const args = [destino, a, b]
            .filter(v => v !== undefined && v !== null)
            .map(v => `'${escJs(String(v))}'`).join(', ');
        return `<button type="button" id="acab-balanca-btn-${esc(monta(a, b))}"
                        onclick="AcabamentoPainel.lerBalanca(${args})"
                        title="Pesar: ler o peso direto da balança desta estação"
                        style="background: rgba(69,137,215,0.16); border: 1px solid rgba(69,137,215,0.50);
                               color: #4cc8f0; border-radius: 7px; padding: 5px 9px;
                               font-size: 0.88rem; font-weight: 700; cursor: pointer;
                               white-space: nowrap;">⚖</button>`;
    }

    /**
     * Lê a balança e escreve o peso no campo.
     *
     * O agente espera até 4 s o peso estabilizar no prato — quem chama aqui não
     * precisa saber disso. O valor preenchido segue o caminho de sempre: a régua
     * dos 5 %, a senha de liberação e a mesma gravação da digitação à mão.
     */
    async function lerBalanca(destino, a, b) {
        const monta = CAMPO_DA_BALANCA[destino];
        if (!haBalanca() || !monta || balanca.lendo) return false;

        const botao = document.getElementById('acab-balanca-btn-' + monta(a, b));
        balanca.lendo = true;
        if (botao) { botao.disabled = true; botao.textContent = '⏳'; }
        try {
            const r = await buscar(urlDaEstacao('balanca', 'peso'));
            let dados = null;
            try { dados = await r.json(); } catch (ignorado) { dados = null; }
            if (!dados || dados.ok !== true) {
                abrirBalanca(dados || {});
                return false;
            }
            await usarPesoDaBalanca(destino, dados.peso_kg, a, b);
            avisar(`Balança: ${pesoParaTexto(dados.peso_kg)} kg.`, 'success');
            return true;
        } catch (e) {
            abrirBalanca({
                motivo: `Não deu para falar com o agente desta estação (${e && e.message ? e.message : e}).`,
                comoResolver: 'Confira se o NewProd Agent está rodando nesta máquina e '
                    + 'abra o painel por http://localhost:9000.',
            });
            return false;
        } finally {
            balanca.lendo = false;
            if (botao) { botao.disabled = false; botao.textContent = '⚖'; }
        }
    }

    /** O peso lido entra no campo e segue o caminho de sempre daquele campo. */
    async function usarPesoDaBalanca(destino, kg, a, b) {
        const texto = pesoParaTexto(kg);
        const campo = document.getElementById(CAMPO_DA_BALANCA[destino](a, b));
        if (campo) campo.value = texto;

        if (destino === 'setor') return gravarPeso(a, b, texto);
        if (destino === 'registro' || destino === 'linha') { pintarResumoDoRegistro(); return; }
        if (destino === 'obrigatorio') {
            const erro = document.getElementById('acab-peso-obrig-erro');
            if (erro) erro.textContent = '';
        }
    }

    // ─── A caixa que explica a balança que não respondeu ────────────────────

    function montarCaixaDaBalanca() {
        let caixa = document.getElementById('acab-balanca');
        if (caixa) return caixa;

        caixa = document.createElement('div');
        caixa.id = 'acab-balanca';
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100005; display: none;'
            + ' align-items: center; justify-content: center; background: rgba(6,7,13,0.92); padding: 18px;';
        caixa.innerHTML = `
            <div style="width: min(560px, 96vw); max-height: 92vh; background: ${AZUL.fundo};
                        border: 1px solid rgba(76,200,240,0.28); border-radius: 12px;
                        display: flex; flex-direction: column; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px;
                            background: #120a8f; border-bottom: 1px solid rgba(76,200,240,0.24);">
                    <span style="font-size: 1.2rem;">⚖️</span>
                    <strong style="font-size: 1.05rem; color: #ffffff;">Balança desta estação</strong>
                    <button type="button" id="acab-balanca-fechar"
                            style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px;
                                   font-weight: 700; cursor: pointer;">✕</button>
                </div>

                <div style="padding: 16px 18px; color: #cfe6fb; font-size: 0.9rem; line-height: 1.55;
                            overflow: auto;">
                    <div id="acab-balanca-motivo" style="color: #f87171; font-weight: 700;"></div>
                    <div id="acab-balanca-saida" style="margin-top: 8px; color: #cfe6fb;"></div>

                    <button type="button" id="acab-balanca-procurar"
                            style="margin-top: 14px; background: rgba(69,137,215,0.16);
                                   border: 1px solid rgba(69,137,215,0.50); color: #4cc8f0;
                                   border-radius: 8px; padding: 8px 14px; font-weight: 700;
                                   cursor: pointer;">🔎 Procurar a balança nas portas deste computador</button>

                    <div id="acab-balanca-portas" style="margin-top: 12px; display: flex;
                         flex-direction: column; gap: 8px;"></div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px;
                            border-top: 1px solid rgba(76,200,240,0.18); flex-wrap: wrap;">
                    <span style="font-size: 0.78rem; color: #7fa9d4;">O peso continua podendo ser digitado à mão.</span>
                    <button type="button" id="acab-balanca-ok"
                            style="margin-left: auto; background: linear-gradient(135deg, #4a61e8, #120a8f);
                                   border: 1px solid #4cc8f0; color: #ffffff; border-radius: 8px;
                                   padding: 9px 20px; font-weight: 800; cursor: pointer;">Fechar</button>
                </div>
            </div>`;
        document.body.appendChild(caixa);

        ['acab-balanca-fechar', 'acab-balanca-ok'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.onclick = fecharBalanca;
        });
        const procurar = document.getElementById('acab-balanca-procurar');
        if (procurar) procurar.onclick = procurarBalanca;
        return caixa;
    }

    function abrirBalanca(dados) {
        montarCaixaDaBalanca();
        const motivo = document.getElementById('acab-balanca-motivo');
        if (motivo) {
            motivo.textContent = (dados && dados.motivo)
                || 'Não consegui ler a balança desta estação.';
        }
        const saida = document.getElementById('acab-balanca-saida');
        if (saida) {
            saida.textContent = (dados && dados.comoResolver)
                || 'Na balança: FUNÇÃO, 8, senha 191249, e escolha "Tipo 1" — é o modo em '
                 + 'que ela responde ao computador. Confira também o cabo: na CP POP a saída '
                 + 'serial RJ45 e a USB são opcionais de fábrica.';
        }
        const lista = document.getElementById('acab-balanca-portas');
        if (lista) lista.innerHTML = '';
        const caixa = document.getElementById('acab-balanca');
        if (caixa) caixa.style.display = 'flex';
    }

    function fecharBalanca() {
        const caixa = document.getElementById('acab-balanca');
        if (caixa) caixa.style.display = 'none';
    }

    /**
     * O diagnóstico: pergunta ao agente o que cada porta COM respondeu.
     *
     * É o que responde a pergunta que nenhuma tela responde de longe — se a
     * balança está mesmo ligada NESTA máquina, e em qual porta.
     */
    async function procurarBalanca() {
        const lista = document.getElementById('acab-balanca-portas');
        const botao = document.getElementById('acab-balanca-procurar');
        if (botao) { botao.disabled = true; botao.textContent = 'Procurando…'; }
        if (lista) lista.innerHTML = '<span style="color: var(--text-dim);">Procurando…</span>';
        try {
            const r = await buscar(urlDaEstacao('balanca', 'portas'));
            const dados = await r.json();
            if (lista) lista.innerHTML = htmlDasPortas(dados);
        } catch (e) {
            if (lista) {
                lista.innerHTML = `<span style="color: #f87171;">Não deu para perguntar ao agente `
                    + `(${esc(e && e.message ? e.message : e)}).</span>`;
            }
        } finally {
            if (botao) {
                botao.disabled = false;
                botao.textContent = '🔎 Procurar a balança nas portas deste computador';
            }
        }
    }

    function htmlDasPortas(dados) {
        const portas = (dados && dados.portas) || [];
        if (!portas.length) {
            return '<span style="color: #f87171;">Este computador não tem nenhuma porta COM. '
                 + 'A balança não está ligada a ele — ou está sem o conector serial/USB, '
                 + 'que na CP POP é opcional de fábrica.</span>';
        }
        return portas.map(p => {
            const achou = p.respondeu === true;
            const peso = achou && p.peso_kg !== null && p.peso_kg !== undefined
                ? ` — está marcando ${esc(pesoParaTexto(p.peso_kg))} kg` : '';
            return `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
                            background: rgba(76,200,240,0.07); border: 1px solid rgba(76,200,240,0.20);
                            border-radius: 8px; padding: 8px 10px;">
                    <strong style="font-family: monospace; color: ${achou ? '#4ade80' : '#cfe6fb'};">${esc(p.porta)}</strong>
                    <span style="font-size: 0.82rem; color: var(--text-dim);">${esc(p.descricao || '')}</span>
                    <span style="font-size: 0.82rem; color: ${achou ? '#4ade80' : 'var(--text-dim)'};">
                        ${achou ? '✔ é a balança' + peso : esc(p.detalhe || 'não respondeu')}</span>
                    ${achou ? '' : `<button type="button"
                        onclick="AcabamentoPainel.usarPortaDaBalanca('${escJs(p.porta)}')"
                        style="margin-left: auto; background: rgba(69,137,215,0.16);
                               border: 1px solid rgba(69,137,215,0.50); color: #4cc8f0;
                               border-radius: 7px; padding: 4px 10px; font-size: 0.78rem;
                               font-weight: 700; cursor: pointer;">Usar esta</button>`}
                </div>`;
        }).join('');
    }

    /** Quando o operador sabe a porta e o diagnóstico não decidiu por ele. */
    async function usarPortaDaBalanca(porta) {
        try {
            const r = await buscar(urlDaEstacao('balanca', 'porta'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ porta }),
            });
            const dados = await r.json();
            if (dados && dados.ok) {
                avisar(`A balança desta estação passa a ser lida na porta ${porta}.`, 'success');
                fecharBalanca();
            } else {
                avisar((dados && dados.motivo) || 'Não deu para gravar a porta.', 'error');
            }
        } catch (e) {
            avisar(`Não deu para gravar a porta (${e && e.message ? e.message : e}).`, 'error');
        }
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
        tela.gramasPorUnidade = {};
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
            tela.gramasPorUnidade = gramasPorUnidadeDaLinha(data);
        } catch (e) {
            console.warn('[acabamento] não deu para ler o peso estimado por setor:', e);
            tela.estimados = {};
            tela.gramasPorUnidade = {};
        }
    }

    /**
     * Quanto pesa UMA unidade, por linha da proposta: `{ '2281': 5.2 }`.
     *
     * `peso_total` é coluna gerada, `peso_uni * qtd`, em gramas — então a
     * divisão devolve exatamente o `peso_uni` que o ERP guardou. Conferido no
     * pedido 21085 em 23/08/2026: 141.128 g ÷ 27.140 un = 5,2 g.
     *
     * É por unidade, e não por modelo, de propósito: várias credenciais
     * diferentes saem da MESMA linha da proposta (as oito do 21085 saem da
     * linha 2281), e o que elas têm em comum é o peso de cada peça.
     */
    function gramasPorUnidadeDaLinha(linhas) {
        const mapa = {};
        (linhas || []).forEach(l => {
            if (!l) return;
            const qtd = Number(l.qtd);
            const total = Number(l.peso_total);
            if (!isFinite(qtd) || qtd <= 0) return;
            if (!isFinite(total) || total <= 0) return;
            mapa[String(l.id)] = total / qtd;
        });
        return mapa;
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

        // A régua compara o peso digitado com a tiragem inteira do setor —
        // menos quando quem chama sabe de uma base melhor. É o caso do peso
        // que vem da soma das caixas: com metade do setor embalado, a base é o
        // peso esperado do que JÁ ESTÁ em caixa, e não o do setor todo.
        // `'estimado' in opcoes` e não `!== undefined`: o `null` explícito é uma
        // resposta, e não a falta de uma. Ele quer dizer "o que está embalado
        // não tem peso no ERP, não há régua" — e cair no estimado do setor
        // inteiro nesse caso pediria senha em cima de uma caixa que ninguém tem
        // como conferir.
        const estimado = (opcoes && Object.prototype.hasOwnProperty.call(opcoes, 'estimado'))
            ? opcoes.estimado : estimadoDoSetor(alvo);
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
            const texto = pesoParaTexto(atual ? atual.peso : null);
            // Com volumes o campo é um `<span>` de leitura: escrever `value`
            // nele não faria nada, e o operador veria o número velho até o
            // próximo redesenho.
            if (campo.dataset && campo.dataset.somado) campo.textContent = texto || '—';
            else campo.value = texto;
            pintarEstimado(setor);
        });
    }

    /**
     * O box, acima dos modelos.
     *
     * Sem setor nenhum e sem sessão são dois "vazios" diferentes, e cada um diz
     * a sua razão: um box mudo faria o operador procurar defeito onde não há.
     */
    /**
     * O bloco de PESO E VOLUMES, agora dentro do Resumo do pedido.
     *
     * Até 29/08/2026 ele era uma faixa larga acima dos modelos, em grade de
     * cards de 340 px. Ali ele rolava junto com a lista: quem estava no
     * terceiro modelo já não via nem o peso nem o botão da expedição. Agora
     * mora na coluna da direita, que tem 288 px e não sai da tela — e por isso
     * os cards viraram uma pilha, um setor embaixo do outro.
     *
     * Os ids dos campos são os mesmos de antes (`acab-peso-*`), de propósito:
     * é por eles que o `pintarPesos` devolve o valor gravado a cada desenho.
     *
     * Com um setor aceso na fileira do topo, só ele aparece aqui — é a mesma
     * regra de recorte da fila, aplicada dentro do pedido.
     */
    function blocoDePesoNoResumo(itens, numeroDoPedido) {
        const todosOsSetores = setoresDoPedido(itens);
        const setores = tela.setoresNoPedido.length
            ? todosOsSetores.filter(x => tela.setoresNoPedido.indexOf(x) !== -1)
            : todosOsSetores;
        const pode = podeEditar();
        // Sem caminho nenhum: nem agente servindo a página, nem sessão do Vibe.
        const semCaminho = !pelaEstacao() && tela.temSessao === false;

        const titulo = `
            <div style="${ESTILO_TITULO_DO_BLOCO}">
                <span style="font-size: 0.95rem;">⚖️</span> Peso e volumes
            </div>`;

        if (!setores.length) {
            return titulo + `<div style="font-size: 0.78rem; color: var(--text-dim); line-height: 1.45;">
                       Os produtos deste pedido não têm setor definido, então não há peso a
                       registrar. O setor vem do cadastro do produto no ERP.
                   </div>`;
        }

        if (semCaminho) {
            return titulo + `<div style="font-size: 0.78rem; color: var(--text-dim); line-height: 1.5;">
                        <strong style="color: #4cc8f0;">Para registrar o peso, entre com a sua conta.</strong><br>
                        Esta tela está aberta com o acesso local da estação, e o peso é gravado na
                        ficha de expedição do ERP — que só aceita quem entrou com a conta do Vibe.
                        Abra o painel pelo site e faça login para preencher.
                        <div style="margin-top: 8px;">Setores deste pedido:
                            ${setores.map(x => esc((ROTULO_DO_SETOR[x] || {}).nome || x)).join(' · ')}
                        </div>
                     </div>`;
        }

        const cards = setores.map(setor => {
            const r = ROTULO_DO_SETOR[setor] || { nome: setor, icone: '📦' };
            const atual = tela.pesos[setor];
            const valor = pesoParaTexto(atual ? atual.peso : null);
            const estimado = textoDoEstimado(setor);
            // Num pedido COM volumes o campo vira LEITURA: o peso é a soma dos
            // registros, e um campo digitável ao lado dela convidaria a um
            // segundo número que discordaria do primeiro.
            const somado = pedidoTemVolumes();
            const campoDoPeso = somado
                ? `<span id="acab-peso-${setor}" data-somado="1"
                         title="O peso deste setor é a soma dos volumes — cada modelo foi pesado ao entrar num deles"
                         style="${ESTILO_PESO_SOMADO}">${esc(valor || '—')}</span>`
                : `<input type="text" inputmode="decimal" id="acab-peso-${setor}"
                          value="${esc(valor)}" placeholder="0,00" ${pode ? '' : 'disabled'}
                          onchange="AcabamentoPainel.mudarPeso('${escJs(numeroDoPedido)}', '${setor}', this.value)"
                          title="${pode ? 'Peso real deste setor, em quilos' : 'Você tem apenas permissão de ver'}"
                          style="${ESTILO_PESO_CAMPO} opacity: ${pode ? '1' : '0.5'};" />`;

            return `
                <div style="${ESTILO_CARD_DE_SETOR}">
                  <div style="display: flex; align-items: center; gap: 7px;">
                    <span style="font-size: 1rem;">${r.icone}</span>
                    <strong style="font-size: 0.84rem; flex: 1 1 auto; min-width: 0;">${esc(r.nome)}</strong>
                    ${campoDoPeso}
                    <span style="font-size: 0.76rem; color: var(--text-dim);">kg</span>
                    ${(pode && !somado) ? botaoDaBalanca('setor', numeroDoPedido, setor) : ''}
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span id="acab-peso-est-${setor}"
                          title="Peso estimado: a soma dos pesos dos produtos deste setor no pedido, pelo ERP. Acima de 5 % de diferença, gravar pede a senha de liberação."
                          style="font-size: 0.7rem; color: ${estimado.cor};">${esc(estimado.texto)}</span>
                    ${somado ? `<span style="font-size: 0.7rem; color: #22c55e;">soma dos volumes</span>` : ''}
                    <span id="acab-peso-sinal-${setor}" style="font-size: 0.7rem; color: var(--text-dim);"></span>
                  </div>
                  ${faixaDeVolumes(setor, itens, numeroDoPedido)}
                </div>`;
        }).join('');

        return titulo + `<div style="display: flex; flex-direction: column; gap: 10px;">${cards}</div>`;
    }

    const ESTILO_TITULO_DO_BLOCO = 'display: flex; align-items: center; gap: 7px;'
        + ' font-size: 0.7rem; font-weight: 800; text-transform: uppercase;'
        + ' letter-spacing: 0.08em; color: #8fb6e0; padding-bottom: 6px;'
        + ' border-bottom: 1px solid rgba(76,200,240,0.22); margin-bottom: 10px;';
    const ESTILO_CARD_DE_SETOR = 'display: flex; flex-direction: column; gap: 8px; min-width: 0;'
        + ' background: rgba(76,200,240,0.07); border: 1px solid rgba(76,200,240,0.20);'
        + ' border-radius: 8px; padding: 9px 11px;';
    const ESTILO_PESO_SOMADO = 'min-width: 76px; text-align: right; background: rgba(76,200,240,0.06);'
        + ' border: 1px dashed rgba(76,200,240,0.30); border-radius: 6px; color: #cfe6fb;'
        + ' padding: 4px 7px; font-size: 0.9rem; font-family: monospace; display: inline-block;';
    const ESTILO_PESO_CAMPO = 'width: 76px; text-align: right; background: #0d0e20;'
        + ' border: 1px solid rgba(76,200,240,0.26); border-radius: 6px; color: #cfe6fb;'
        + ' padding: 4px 7px; font-size: 0.9rem; font-family: monospace;';

    /**
     * O RESUMO DO PEDIDO: a coluna da direita enquanto um pedido está aberto.
     *
     * Desenho pedido pelo usuário em 29/08/2026. No lugar das Métricas do Dia —
     * que falam da fila inteira e não respondem nada sobre o pedido que está na
     * tela — entram o progresso, os dados que a expedição precisa, o peso e os
     * volumes de cada setor, e o botão de encaminhar preso no rodapé.
     *
     * Ele é FIXO: rola por dentro se precisar, e o botão do rodapé fica onde
     * está. Era esse o defeito do desenho anterior, em que o peso e a expedição
     * moravam numa faixa acima dos modelos e sumiam da tela ao rolar a lista.
     *
     * O recorte por setor vale aqui também (progresso, quantidade, setores e o
     * bloco de peso), MENOS no botão da expedição: expedição é do pedido
     * inteiro, e um setor não se expede sozinho. Por isso o aviso acima do
     * botão quando há recorte na tela — sem ele o operador leria "3 de 3
     * revisados" logo acima de um botão apagado e não entenderia o que falta.
     */
    function painelResumoHtml(os, itens, visiveis) {
        const recortado = tela.setoresNoPedido.length > 0;
        const total = visiveis.length;
        const prontos = visiveis.filter(i => estagioDoModelo(i) === 'Pronto').length;
        const qtd = visiveis.reduce((acc, m) => acc + (parseInt(m.quantidade || m.qtd || 0) || 0), 0);

        const setores = tela.setoresNoPedido.length
            ? tela.setoresNoPedido
            : setoresDoPedido(itens);
        const nomes = setores.map(x => (ROTULO_DO_SETOR[x] || {}).nome || x).join(' · ') || '—';

        const prazo = fn('formatPrazoBadge');
        const frete = ((os && os.frete_escolhido) || '').trim() || 'Retirada Local';

        const selo = recortado
            ? `<div style="font-family: monospace; font-size: 0.7rem; font-weight: 800;
                          letter-spacing: 0.04em; color: #4cc8f0;"
                    title="Estes números são só do setor escolhido no topo. Clique em Todos os Setores para ver o pedido inteiro.">`
              + `◧ SÓ ${esc(nomes.toUpperCase())}</div>`
            : '';

        return `
            <div style="${ESTILO_CAIXA_DO_RESUMO}">
                <div style="${ESTILO_CABECALHO_DO_RESUMO}">
                    <span style="font-size: 1rem;">📋</span>
                    <strong style="font-size: 0.86rem; letter-spacing: 0.02em;">Resumo do pedido</strong>
                </div>

                <div class="custom-scroll" style="flex: 1; min-height: 0; overflow-y: auto;
                            padding: 12px 14px; display: flex; flex-direction: column; gap: 14px;">
                    ${selo}

                    <div style="display: flex; flex-direction: column; gap: 7px;">
                        <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px;">
                            <span style="${SUBROTULO_DO_CAMPO}">Revisados</span>
                            <span class="badge badge-teal" id="acab-detalhe-progresso">${prontos}/${total} revisados</span>
                        </div>
                        <div style="width: 100%; height: 7px; background: rgba(255,255,255,0.08);
                                    border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);"
                             title="Quanto deste pedido já está revisado">
                            <div id="acab-detalhe-barra" style="width: 0%; height: 100%; background: #4589d7;
                                        border-radius: 4px; transition: width 0.3s ease;"></div>
                        </div>
                    </div>

                    <dl style="display: grid; grid-template-columns: auto 1fr; gap: 7px 12px;
                               align-items: baseline; margin: 0;">
                        <dt style="${SUBROTULO_DO_CAMPO}">Prazo</dt>
                        <dd style="${ESTILO_VALOR_DA_FICHA} display: flex; justify-content: flex-end;">${prazo ? prazo(os) : '—'}</dd>
                        <dt style="${SUBROTULO_DO_CAMPO}">Modelos</dt>
                        <dd style="${ESTILO_VALOR_DA_FICHA}">${numeroComPonto(total)}</dd>
                        <dt style="${SUBROTULO_DO_CAMPO}">Quantidade</dt>
                        <dd style="${ESTILO_VALOR_DA_FICHA}">${numeroComPonto(qtd)} un</dd>
                        <dt style="${SUBROTULO_DO_CAMPO}">Setores</dt>
                        <dd style="${ESTILO_VALOR_DA_FICHA}">${esc(nomes)}</dd>
                        <dt style="${SUBROTULO_DO_CAMPO}">Frete</dt>
                        <dd style="${ESTILO_VALOR_DA_FICHA}">${esc(frete)}</dd>
                    </dl>

                    <div>${blocoDePesoNoResumo(itens, os ? os.numero : '')}</div>
                </div>

                ${rodapeDaExpedicao(itens, recortado)}
            </div>`;
    }

    const ESTILO_CAIXA_DO_RESUMO = 'background: rgba(30,41,59,0.85); border: 1px solid rgba(148,163,184,0.25);'
        + ' border-radius: 14px; display: flex; flex-direction: column; overflow: hidden;'
        + ' flex: 1; min-height: 0;';
    const ESTILO_CABECALHO_DO_RESUMO = 'display: flex; align-items: center; gap: 8px;'
        + ' padding: 11px 14px; background: #0b1730; border-bottom: 1px solid rgba(76,200,240,0.24);';
    const ESTILO_VALOR_DA_FICHA = 'font-size: 0.9rem; font-weight: 700; color: #ffffff;'
        + ' text-align: right; margin: 0; font-variant-numeric: tabular-nums;';

    /**
     * O botão EXPEDIÇÃO, à direita do peso.
     *
     * Ele NÃO fica escondido quando o pedido não está pronto, e isso é de
     * propósito: apagado e clicável, ele responde o que falta. Escondido, o
     * operador ficaria procurando um botão que a tela não mostra.
     */
    /**
     * O RODAPÉ do Resumo: o botão de encaminhar à expedição, preso embaixo.
     *
     * Ele NÃO fica escondido quando o pedido não está pronto, e isso é de
     * propósito: apagado e clicável, ele responde o que falta. Escondido, o
     * operador ficaria procurando um botão que a tela não mostra.
     *
     * E ele NÃO entra no recorte por setor. A expedição é do pedido inteiro —
     * um setor não se expede sozinho —, então com um setor aceso o botão
     * continua falando dos modelos todos. Sem o aviso logo acima dele, o
     * operador leria "3 de 3 revisados" no resumo e não entenderia por que o
     * botão segue apagado.
     */
    function rodapeDaExpedicao(itens, recortado) {
        const aviso = recortado
            ? `<span style="font-size: 0.72rem; color: var(--text-dim);">a expedição é do pedido inteiro</span>`
            : '';

        // Já entregue: o botão vira comprovante. Oferecer "enviar" de novo num
        // pedido que já saiu convidaria a uma segunda escrita sem sentido, e
        // esconder o botão deixaria o operador sem saber se o envio pegou.
        const aberto = (estado().ordens || []).find(o => String(o.id) === String(tela.pedidoAberto));
        if (aberto && ehExpedido(aberto)) {
            return `
            <div style="${ESTILO_RODAPE_DA_EXPEDICAO}">
                ${aviso}
                <span style="background: rgba(76,200,240,0.12); border: 1px solid #4cc8f0; color: #4cc8f0;
                             border-radius: 8px; padding: 12px 14px; font-size: 0.9rem; font-weight: 800;
                             letter-spacing: 0.04em; width: 100%; text-align: center;">📦 NA EXPEDIÇÃO</span>
                <span style="font-size: 0.72rem; color: #7fa9d4;">já entregue — sai da lista ao embarcar</span>
            </div>`;
        }

        const pronto = pedidoProntoParaExpedicao(itens);
        const pendentes = setoresPendentes(itens);
        const pode = podeEditar();

        const cor = pronto && pode
            ? `background: linear-gradient(135deg, #4a61e8, #120a8f); border-color: #4cc8f0; color: #ffffff;`
            : `background: rgba(43,50,175,0.35); border-color: rgba(76,205,246,0.20); color: #7fa9d4;`;

        const explicacao = !pode
            ? 'Você tem apenas permissão de ver'
            : (pronto
                ? 'Mandar este pedido para a expedição'
                : 'Clique para ver o que ainda falta');

        const nota = pronto
            ? `<span style="font-size: 0.72rem; color: #4cc8f0;">todos os modelos revisados</span>`
            : `<span style="font-size: 0.72rem; color: #7fa9d4;">${
                  pendentes.length === 1 ? '1 setor pendente' : `${pendentes.length} setores pendentes`
               } — clique para ver o que falta</span>`;

        return `
            <div style="${ESTILO_RODAPE_DA_EXPEDICAO}">
                ${aviso}
                <button type="button" id="acab-btn-expedicao"
                        onclick="AcabamentoPainel.expedir('${escJs(tela.pedidoAberto)}')"
                        title="${esc(explicacao)}"
                        style="${cor} ${ESTILO_BOTAO_DA_EXPEDICAO}">
                    📦 ENCAMINHAR À EXPEDIÇÃO
                </button>
                ${nota}
            </div>`;
    }

    const ESTILO_RODAPE_DA_EXPEDICAO = 'padding: 12px 14px; border-top: 1px solid rgba(76,205,246,0.16);'
        + ' display: flex; flex-direction: column; gap: 6px; align-items: center;'
        + ' background: #0b1730; flex-shrink: 0;';
    const ESTILO_BOTAO_DA_EXPEDICAO = 'border-width: 1px; border-style: solid; border-radius: 8px;'
        + ' padding: 12px 14px; font-size: 0.84rem; font-weight: 800; letter-spacing: 0.04em;'
        + ' cursor: pointer; width: 100%; line-height: 1.3; font-family: inherit;';

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
     *
     * Num pedido COM volumes não há o que cobrar: o peso do setor é a soma dos
     * registros, e ele já entrou junto com o material. Cobrar um número que o
     * operador não digita mais seria uma trava sem saída — e o
     * `fecharModelosEmbalados` a encontraria no caminho do Pronto automático.
     */
    function pesoExigidoAntesDoPronto(item, itens) {
        if (!haComoGravarPeso()) return null;
        if (pedidoTemVolumes()) return null;
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
            // Onde ele foi parar, dito na hora: o pedido não some mais da tela,
            // e o operador precisa saber onde reencontrá-lo.
            avisar(`Pedido ${esc(os.numero)} enviado para EXPEDIÇÃO 📦 — `
                 + `ele continua na tela, no botão EXPEDIÇÃO.`, 'success');
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
             + 'Um pedido só vai para a expedição com todos os modelos revisados.';
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
    // ## O desenho de 29/08/2026, que substitui o de 23/08
    //
    // Naquele dia o usuário reviu o fluxo inteiro e ditou outra regra:
    //
    //   "pedido sem criação de volumes seguem o fluxo existente, ao criar
    //    volumes cada modelo registrado como pronto precisa indicar a qual
    //    volume pertence e registrar seu peso, esse registro pode ser feito em
    //    grupos, volumes já criados podem receber novos modelos ou grupos de
    //    modelos, somando os pesos ao volume, retirar o conceito de caixa e
    //    pacote e rolo, teremos apenas o conceito de volumes."
    //
    // E, sobre o gesto na estação:
    //
    //   "modelos são pesados antes de colocados no volume, as somas dos pesos
    //    dos modelos são o peso do volume. pedidos sem volume criado é pesado
    //    ao final"
    //
    // Três consequências, e é delas que sai todo o resto deste arquivo:
    //
    //  1. **O volume deixa de ser um cadastro paralelo e vira a condição do
    //     PRONTO.** Num pedido que tem volume, clicar em Pronto abre o registro
    //     — em qual volume, quanto vai e quanto pesa — em vez de gravar direto.
    //  2. **O peso é do REGISTRO, não do volume.** Cada modelo vai à balança
    //     antes de entrar; o peso do volume é a soma (`somaDosVolumes`), e
    //     ninguém digita peso de volume em lugar nenhum.
    //  3. **Só existe "volume".** Caixa, pacote, fardo e rolo saíram do
    //     vocabulário — da tela e daqui. A linha de dentro do volume é o
    //     REGISTRO de um modelo, e é assim que ela se chama no código.
    //
    // ## O que não mudou, de propósito
    //
    // Pedido SEM volume nenhum continua exatamente como estava: peso por setor
    // digitado à mão, "1 volume único" dito em texto, e a cobrança do peso ao
    // marcar o último modelo do setor como Pronto — o "pesado ao final" da
    // regra. É a maioria dos pedidos, e ela não ganhou cadastro nenhum.
    //
    // A régua dos 5 % e a senha de liberação continuam, e ficaram melhores: no
    // registro a base é o peso da peça vezes a quantidade daquele modelo, que é
    // mais preciso que o estimado do setor inteiro.
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

    // O TIPO do volume — "Caixa", "Fardo", "Rolo", "Palete" — saiu da tela em
    // 29/08/2026, junto com o "pacote": o usuário decidiu que só existe o
    // conceito de volume. A coluna `producao_volumes.tipo` continua no banco
    // com o que já está gravado e simplesmente deixa de ser escrita — apagá-la
    // perderia a etiqueta de volumes antigos sem ganhar nada. Ver
    // `sql/volumes_por_registro.sql`.

    const ESTILO_BOTAO_VOLUME = 'background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);'
        + ' color: #cfe6fb; border-radius: 6px; padding: 5px 10px; font-size: 0.74rem;'
        + ' font-weight: 700; cursor: pointer; font-family: inherit;';

    /**
     * As linhas cruas do banco viram `{ SETOR: [volume, …] }`, cada volume com
     * os seus REGISTROS. Pura, para o teste.
     *
     * Um registro é a entrada de um modelo no volume: modelo, quantidade, peso,
     * quem fez e quando. Podem existir dois do mesmo modelo no mesmo volume — é
     * o modelo grande que entrou em duas levas, por duas pessoas.
     *
     * O PESO DO VOLUME é a soma dos registros (29/08/2026), e não o `peso_kg`
     * da linha do volume. Aquela coluna continua sendo lida como `pesoGravado`
     * por um motivo só: volume anterior à migração, cujos registros ainda não
     * têm peso, precisa continuar mostrando o número que a balança já leu. Ver
     * `sql/volumes_por_registro.sql`, que desce esse peso para os registros.
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
            const registros = (l[TABELA_DE_ITENS_DO_VOLUME] || l.registros || l.itens || [])
                .map(i => ({
                    id: i.id || null,
                    modeloId: String(i.modelo_id !== undefined ? i.modelo_id : i.modeloId),
                    qtd: Math.max(0, parseInt(i.qtd, 10) || 0),
                    peso: (i.peso_kg === null || i.peso_kg === undefined) ? null : Number(i.peso_kg),
                    responsavel: (i.responsavel || '').trim(),
                    registradoEm: i.registrado_em || '',
                }))
                .filter(i => i.qtd > 0);
            // Na ordem em que entraram, que é o que o operador procura ao abrir
            // um volume que engordou ao longo do dia. Registro sem data — linha
            // anterior à migração — fica no começo, onde de fato ela estava.
            registros.sort((a, b) => String(a.registradoEm).localeCompare(String(b.registradoEm)));
            const gravado = (l.peso_kg === null || l.peso_kg === undefined) ? null : Number(l.peso_kg);
            (porSetor[setor] = porSetor[setor] || []).push({
                id: l.id,
                setor,
                numero: parseInt(l.numero, 10) || 0,
                nome: (l.nome || '').trim(),
                peso: pesoDosRegistros(registros, gravado),
                pesoGravado: gravado,
                responsavel: (l.responsavel || '').trim(),
                observacao: (l.observacao || '').trim(),
                // A foto da caixa (28/08/2026). Uma só por volume, e por isso
                // COMPARTILHADA por todos os modelos que estão dentro dela —
                // ver `fotoDoVolumeDoModelo`.
                foto: (l.foto_url || '').trim(),
                criadoEm: l.criado_em || '',
                registros,
            });
        });
        Object.keys(porSetor).forEach(s => porSetor[s].sort((a, b) => a.numero - b.numero));
        return porSetor;
    }

    /**
     * O peso de um volume: a soma dos registros dele, em kg.
     *
     * Somada em GRAMAS inteiras e dividida no fim. Somar `0,1 + 0,2` em ponto
     * flutuante dá `0,30000000000000004`, e um centésimo de grama fantasma
     * viraria aviso âmbar em cima de um trabalho certo.
     *
     * `gravado` é a saída para o volume ANTERIOR a 29/08/2026: enquanto nenhum
     * registro dele tiver peso, vale o número que a balança leu na época. Assim
     * que um registro ganha peso, quem manda é a soma — o volume passou a ser
     * mantido pela regra nova, e misturar os dois faria o peso contar duas
     * vezes. `null` quando não há nem uma coisa nem outra.
     */
    function pesoDosRegistros(registros, gravado) {
        const lista = registros || [];
        const algumTemPeso = lista.some(r => r && r.peso !== null && r.peso !== undefined);
        if (!algumTemPeso) {
            return (gravado === null || gravado === undefined) ? null : gravado;
        }
        const gramas = lista.reduce((s, r) => {
            const p = Number(r && r.peso);
            return s + (isFinite(p) && p > 0 ? Math.round(p * 1000) : 0);
        }, 0);
        return gramas / 1000;
    }

    /** "V3", ou "V3 · Camarote" quando o operador deu nome à caixa. */
    function rotuloDoVolume(v) {
        return `V${(v && v.numero) || 0}` + (v && v.nome ? ` · ${v.nome}` : '');
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
        (lista || []).forEach(v => (v.registros || []).forEach(i => {
            const id = String(i.modeloId);
            mapa[id] = (mapa[id] || 0) + i.qtd;
        }));
        return mapa;
    }

    /** Todos os registros de um modelo, de todos os volumes da lista. */
    function registrosDoModelo(lista, modeloId) {
        const alvo = String(modeloId);
        return (lista || []).reduce((tudo, v) => tudo.concat(
            (v.registros || []).filter(p => String(p.modeloId) === alvo).map(p => ({ volume: v, registro: p }))
        ), []);
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

    // ─── O fechamento automático do modelo ─────────────────────────────────
    //
    // Pedido do usuário em 23/08/2026:
    //
    //   "modelos com mais de 1 volume ao atingir a quantidade total, quando
    //    mais de 1 responsável mostra no drop responsável o nome do setor e
    //    marca status como pronto, se todos os pacotes do volume são mesmo
    //    responsável marca este como responsável."
    //
    // Com a regra de 29/08/2026 quem abre o caminho é o próprio PRONTO — o
    // operador clica nele e a janela do registro pergunta o volume e o peso.
    // Mas o modelo REPARTIDO continua precisando disto: quem registra 2.000 de
    // 5.000 não terminou o modelo, e ele só fica Pronto quando a última leva
    // entra num volume. É este código que percebe a última leva e fecha.
    //
    // O nome do setor no lugar da pessoa, quando são várias, resolve o modelo
    // grande que passou por três mãos: ele não tem um dono, tem o setor. Quem
    // fez o quê continua escrito, registro a registro, dentro do volume.

    /**
     * Quem assina este modelo, pelos registros — ou `null` se ainda não é hora.
     *
     * Devolve `{ nome, varios }`. `varios` diz se o nome é o do setor (mais de
     * uma pessoa, ou alguma sem nome) em vez do de uma pessoa.
     *
     * `null` em três casos, e cada um por um motivo diferente:
     *  - o modelo ainda tem unidade fora de volume: não acabou;
     *  - ele não tem registro nenhum: não há de quem falar;
     *  - todos os registros estão sem responsável: inventar o nome do setor aqui
     *    carimbaria como concluído um trabalho que ninguém assinou.
     */
    function responsavelPelosRegistros(item, lista) {
        if (!item) return null;
        const meus = registrosDoModelo(lista, item.id).map(x => x.registro);
        if (!meus.length) return null;
        if (faltaEmbalar(item, embaladoPorModelo(lista)) > 0) return null;

        const nomes = [];
        let anonimo = false;
        meus.forEach(p => {
            const nome = (p.responsavel || '').trim();
            if (!nome) { anonimo = true; return; }
            if (!nomes.some(n => n.toLowerCase() === nome.toLowerCase())) nomes.push(nome);
        });
        if (!nomes.length) return null;
        // Um registro sem dono no meio de outros com dono conta como mais uma
        // origem: assinar tudo em nome do único que se identificou atribuiria a
        // ele um trabalho que pode não ter sido dele.
        if (nomes.length === 1 && !anonimo) return { nome: nomes[0], varios: false };
        return { nome: nomeDoSetor(normalizar(item.setor)), varios: true };
    }

    /**
     * Os modelos do setor que os registros acabam de fechar.
     *
     * Só vai para a lista quem MUDA de estado: modelo já em Pronto fica fora,
     * mesmo que o nome calculado seja outro. Um Pronto já dado é decisão de
     * alguém, e a embalagem não desfaz decisão de gente.
     */
    function fechamentosPelosRegistros(setor, itens) {
        const alvo = normalizar(setor);
        const lista = volumesDoSetor(alvo);
        if (!lista.length) return [];
        return (itens || [])
            .filter(i => normalizar(i && i.setor) === alvo)
            .filter(i => estagioDoModelo(i) !== 'Pronto')
            .map(i => ({ item: i, quem: responsavelPelosRegistros(i, lista) }))
            .filter(x => x.quem);
    }

    // ─── O peso esperado de UM volume, e a regra dos 5 % nele ───────────────
    //
    // Pedido do usuário em 23/08/2026, no dia seguinte ao dos volumes:
    //
    //   "Ao criar um volume de apenas 1 modelo (dividir um modelo em mais de um
    //    volume) deve ser informado a quantidade de itens do volume e calcular o
    //    peso da quantidade informada, seguindo a mesma regra dos 5% para cada
    //    volume, ao criar um volume de vários modelos, deve somar as quantidades
    //    dos modelos selecionados e seguir mesma regra dos 5%."
    //
    // É a mesma régua do setor, aplicada à caixa: peso esperado = quantidade ×
    // peso da peça. Um volume com um modelo só e um com cinco seguem a mesma
    // conta — o que muda é quantas parcelas ela tem.
    //
    // Isso fecha um buraco que o peso por setor não alcançava. O setor só é
    // conferido quando o último modelo dele fica pronto; até lá, uma caixa
    // pesada errado — 30 kg digitados numa caixa de 3 — passava sem ninguém
    // ver, e a soma dos volumes só denunciava o engano no fim.

    /**
     * Quanto pesa UMA unidade deste modelo, em gramas — ou `null`.
     *
     * O modelo aponta para a linha da proposta pelo `id_produto_proposta_origem`
     * (o `loadOSItens` traz a coluna, porque lê `*`), e é dela que sai o peso
     * unitário que o ERP guardou.
     */
    function gramasPorUnidadeDoModelo(item) {
        const origem = item && item.id_produto_proposta_origem;
        if (origem === undefined || origem === null || origem === '') return null;
        const g = tela.gramasPorUnidade[String(origem)];
        return (g === undefined || !(Number(g) > 0)) ? null : Number(g);
    }

    /**
     * O peso esperado do volume, em kg, a partir das quantidades que vão nele.
     *
     * Devolve `{ kg, semBase }`. `kg` é `null` quando NENHUM dos modelos tem
     * peso unitário no ERP — sem base não há o que comparar, e inventar uma
     * seria pior do que não conferir.
     *
     * `semBase` conta os modelos que ficaram de fora da conta. Modelo sem peso
     * no meio de outros que têm entra como zero e faz a estimativa sair baixa,
     * o que acusaria divergência em cima de um volume certo — por isso a tela
     * diz quantos são, em vez de esconder o buraco.
     */
    function estimadoDoVolume(registros, modelos) {
        let gramas = 0;
        let comBase = 0;
        let semBase = 0;
        (registros || []).forEach(i => {
            const item = (modelos || []).find(m => String(m.id) === String(i.modeloId));
            const porUn = gramasPorUnidadeDoModelo(item);
            if (porUn === null) { semBase++; return; }
            comBase++;
            gramas += porUn * (i.qtd || 0);
        });
        if (!comBase) return { kg: null, semBase };
        return { kg: Math.round(gramas) / 1000, semBase };
    }

    /**
     * O peso esperado do que JÁ ESTÁ EMBALADO no setor, em kg — ou `null`.
     *
     * É a régua contra a qual o peso automático do setor (a soma dos volumes) é
     * conferido. Não serve o `estimadoDoSetor`, que mede a tiragem inteira: com
     * três das cinco caixas prontas, comparar a soma delas com o setor inteiro
     * acusaria 40 % de divergência num trabalho perfeitamente certo.
     */
    function estimadoDoEmbalado(setor) {
        const registros = volumesDoSetor(setor)
            .reduce((tudo, v) => tudo.concat(v.registros || []), []);
        if (!registros.length) return null;
        return estimadoDoVolume(registros, modelosDoPedidoAberto()).kg;
    }

    /**
     * Os modelos com os PRONTOS no fim, sem mexer no resto da ordem.
     *
     * `sort` é estável em JS desde o ES2019, então o que não é Pronto continua
     * exatamente na ordem em que o pedido o entregou — a mesma da fila. Pura,
     * para o teste.
     */
    function ordenarProntosNoFim(itens) {
        return (itens || []).slice().sort((a, b) =>
            (estagioDoModelo(a) === 'Pronto' ? 1 : 0) - (estagioDoModelo(b) === 'Pronto' ? 1 : 0));
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
                .select('id, setor, numero, nome, tipo, peso_kg, responsavel, observacao, foto_url, criado_em, '
                      + TABELA_DE_ITENS_DO_VOLUME + '(id, modelo_id, qtd, responsavel)')
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

    // ─── A faixa de volumes, dentro do card do setor ────────────────────────

    /**
     * Um chip por volume. Clicar abre o volume.
     *
     * Volume sem peso sai em âmbar em vez de sair escondido: ele existe, conta
     * na carga e não conta na soma, e essa é exatamente a diferença que o
     * operador precisa enxergar antes de mandar para a expedição.
     */
    function chipDoVolume(v) {
        const temPeso = v.peso !== null && v.peso !== undefined && v.peso > 0;
        const peso = temPeso ? `${kgParaTexto(v.peso)} kg` : 'sem peso';
        const quantos = (v.registros || []).length;
        const titulo = `Volume ${v.numero}${v.nome ? ' — ' + v.nome : ''}`
            + ` · ${quantos} ${quantos === 1 ? 'modelo registrado' : 'modelos registrados'}`
            + ' — clique para abrir';
        return `
            <button type="button" onclick="AcabamentoPainel.abrirVolume('${escJs(v.id)}')"
                    title="${esc(titulo)}"
                    style="display: inline-flex; align-items: center; gap: 6px;
                           background: rgba(76,200,240,0.10); border: 1px solid rgba(76,200,240,0.30);
                           border-radius: 6px; padding: 4px 9px; font-size: 0.74rem; color: #cfe6fb;
                           cursor: pointer; font-family: inherit;">
                <strong style="color: #4cc8f0;">V${esc(v.numero)}</strong>
                ${v.nome ? `<span style="color: #ffffff; font-weight: 600;">${esc(v.nome)}</span>` : ''}
                <span style="font-family: monospace; color: ${temPeso ? '#cfe6fb' : '#fbbf24'};">${esc(peso)}</span>
                ${quantos ? `<span style="color: var(--text-dim);">${quantos} ${quantos === 1 ? 'modelo' : 'modelos'}</span>`
                          : `<span style="color: #fbbf24;">vazio</span>`}
            </button>`;
    }

    /**
     * A faixa embaixo do campo do peso.
     *
     * Sem volume ela NÃO fica vazia: diz que o setor sai como volume único e
     * oferece o botão que passa a usar volumes. Espaço em branco ali faria o
     * operador procurar um recurso que a tela não mostra.
     *
     * COM volume ela é o painel de trabalho do setor: quanto cada volume pesa,
     * o que ainda não foi registrado, e por onde criar mais um.
     */
    function faixaDeVolumes(setor, itens, numeroDoPedido) {
        const lista = volumesDoSetor(setor);
        const pode = podeEditar();
        const borda = 'border-top: 1px dashed rgba(76,200,240,0.22); padding-top: 9px;';

        if (!lista.length) {
            const linha = tela.pesos[setor];
            const kg = (linha && linha.peso) ? ` de ${kgParaTexto(linha.peso)} kg` : '';
            return `
                <div style="${borda} display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 0.9rem; opacity: 0.6;">📦</span>
                    <span style="font-size: 0.74rem; color: var(--text-dim);">Sem volumes — este setor sai como
                        <strong style="color: #cfe6fb;">1 volume único</strong>${esc(kg)}, pesado no fim.</span>
                    ${pode ? `<span style="margin-left: auto;">
                        <button type="button" style="${ESTILO_BOTAO_VOLUME}"
                                onclick="AcabamentoPainel.novoVolume('${escJs(setor)}', '${escJs(numeroDoPedido)}')"
                                title="A partir daqui, cada modelo marcado como Revisado vai dizer em qual volume entra e quanto pesa">Dividir em volumes</button></span>` : ''}
                </div>`;
        }

        const soma = somaDosVolumes(lista);
        const faltando = faltandoNoSetor(setor, itens);

        // A LISTA do que falta saiu daqui em 29/08/2026, a pedido do usuário:
        // com nomes de modelo de verdade ("11/set CAMAROTE CORPORATIVO (DO 01
        // AO 140) 25 UND CADA") ela virava um parágrafo dentro do card do
        // setor, e não dizia nada que o card do modelo já não diga — cada um
        // deles carrega o seu próprio "ainda sem volume".
        //
        // O que ficou é só a confirmação, que é curta e responde a pergunta que
        // o operador faz antes de mandar para a expedição.
        const recado = faltando.length
            ? ''
            : `<div style="font-size: 0.72rem; color: #22c55e;">✓ todo o setor está em volume — `
              + `o peso é a soma dos registros, ninguém digita.</div>`;

        return `
            <div style="${borda} display: flex; flex-direction: column; gap: 7px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 0.9rem;">📦</span>
                    <strong style="font-size: 0.78rem;">${lista.length} ${lista.length === 1 ? 'volume' : 'volumes'}</strong>
                    <span style="font-size: 0.74rem; color: var(--text-dim);">somam</span>
                    <span style="font-size: 0.78rem; font-family: monospace;">${esc(kgParaTexto(soma))} kg</span>
                    ${pode ? `<span style="margin-left: auto;">
                        <button type="button" style="${ESTILO_BOTAO_VOLUME}"
                                onclick="AcabamentoPainel.novoVolume('${escJs(setor)}', '${escJs(numeroDoPedido)}')"
                                title="Criar mais um volume neste setor. Ele nasce vazio, e recebe modelos quando eles forem marcados como revisados.">+ Volume</button></span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    ${lista.map(chipDoVolume).join('')}
                </div>
                ${recado}
            </div>`;
    }

    /**
     * O bloco VOLUME no card do modelo, embaixo dos botões de estágio.
     *
     * Só aparece quando o pedido usa volumes. Num pedido de volume único não há
     * nada a dizer no card, e um bloco dizendo "nenhum" seria ruído em cima da
     * coluna mais apertada da tela.
     */
    function blocoDeVolumesDoModelo(item) {
        const setor = normalizar(item && item.setor);
        if (SETORES_DO_BANCO.indexOf(setor) === -1) return '';
        if (!pedidoTemVolumes()) return '';

        const lista = volumesDoSetor(setor);
        const meus = registrosDoModelo(lista, item.id);
        const dentro = meus.reduce((s, x) => s + x.registro.qtd, 0);
        const total = qtdDoModelo(item);
        const falta = Math.max(0, total - dentro);

        if (!meus.length) {
            return `
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <span style="${SUBROTULO_DO_CAMPO}">Volume</span>
                <div style="display: flex; flex-direction: column; gap: 4px; background: rgba(251,191,36,0.07);
                            border: 1px solid rgba(251,191,36,0.30); border-radius: 8px; padding: 8px 10px;">
                    <span style="font-size: 0.78rem; color: #fbbf24;">ainda sem volume</span>
                    <span style="font-size: 0.72rem; color: var(--text-dim);">${numeroComPonto(total)} un a registrar</span>
                </div>
            </div>`;
        }

        // Uma linha por REGISTRO, e não por volume: duas entradas do mesmo
        // modelo no mesmo volume são duas levas, e é isso que o card mostra.
        const linhas = meus.map(x => `
            <div style="display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 0.74rem;">
                <strong style="color: #4cc8f0;">V${esc(x.volume.numero)}</strong>
                <span style="font-family: monospace;">${numeroComPonto(x.registro.qtd)} un</span>
                ${(x.registro.peso !== null && x.registro.peso !== undefined)
                    ? `<span style="font-family: monospace; color: #ffffff;">${esc(kgParaTexto(x.registro.peso))} kg</span>`
                    : `<span style="color: #fbbf24;">sem peso</span>`}
                ${x.registro.responsavel ? `<span style="color: var(--text-dim);">${esc(x.registro.responsavel)}</span>` : ''}
            </div>`).join('');

        const conta = falta > 0
            ? `<span style="font-size: 0.72rem; color: #fbbf24;">${numeroComPonto(dentro)} de `
              + `${numeroComPonto(total)} registrados · ${numeroComPonto(falta)} fora</span>`
            : `<span style="font-size: 0.72rem; color: #22c55e;">✓ ${numeroComPonto(total)} de `
              + `${numeroComPonto(total)} registrados</span>`;

        return `
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <span style="${SUBROTULO_DO_CAMPO}">Volume</span>
                <div style="display: flex; flex-direction: column; gap: 5px;
                            background: rgba(76,200,240,0.07); border: 1px solid rgba(76,200,240,0.20);
                            border-radius: 8px; padding: 8px 10px;">
                    ${linhas}
                    ${conta}
                </div>
            </div>`;
    }

    // ─── A escolha dos modelos, para registrar em grupo ──────────────────────
    //
    // Até 28/08/2026 escolher o que ia num volume era um MODO: clicar em
    // "+ Volume" apagava os cards de outro setor, grudava uma faixa no topo da
    // lista e punha uma barra no rodapé, e a tela do pedido deixava de ser a
    // tela do pedido enquanto durasse.
    //
    // Com a regra de 29/08/2026 o modo perdeu a razão de ser: o registro nasce
    // do PRONTO, e a escolha múltipla é só o atalho para marcar vários de uma
    // vez. As caixas de marcar ficam SEMPRE visíveis, sem modo, e a barra só
    // aparece quando há algo marcado.
    //
    // O que NÃO mudou é onde a barra mora. Ela já errou de lugar duas vezes na
    // estação — solta no fim da lista, e depois com `position: sticky` dentro
    // de um `.prod-table-card` que tem `overflow: hidden`, e ancestral com
    // overflow escondido DESLIGA o sticky do descendente. Ela é fixa contra a
    // JANELA, no `#acab-barra-escolha`, e continua sendo:
    // `tests/escolha_de_volume_harness.js` mede isso em sete tamanhos de tela.

    /**
     * O setor que a escolha atual fixou — ou `''` quando nada está marcado.
     *
     * Um volume não atravessa setor (o peso é conferido por setor, e uma caixa
     * com dois setores dentro não somaria em nenhum dos dois). Então o primeiro
     * modelo marcado decide, e os de outro setor deixam de ser marcáveis.
     */
    function setorDaEscolha() {
        const ids = Object.keys(tela.marcados || {});
        if (!ids.length) return '';
        const itens = modelosDoPedidoAberto();
        for (const id of ids) {
            const item = itens.find(i => String(i.id) === String(id));
            const setor = normalizar(item && item.setor);
            if (SETORES_DO_BANCO.indexOf(setor) !== -1) return setor;
        }
        return '';
    }

    /**
     * Este modelo pode ser marcado agora?
     *
     * Modelo PRONTO fica de fora (regra do usuário, 29/08/2026): ele já está
     * alocado a um volume, e oferecer a caixa de marcar convidaria a pô-lo num
     * segundo — o mesmo material contado duas vezes na carga. A saída é tirá-lo
     * de Pronto, e aí a caixa volta junto com o material, que sai do volume.
     */
    function marcavelNaEscolha(item) {
        const setor = normalizar(item && item.setor);
        if (SETORES_DO_BANCO.indexOf(setor) === -1) return false;
        if (estagioDoModelo(item) === 'Pronto') return false;
        const fixado = setorDaEscolha();
        return !fixado || fixado === setor;
    }

    function marcadoNaEscolha(item) {
        return !!(item && tela.marcados && tela.marcados[String(item.id)]);
    }

    function alternarModeloNaEscolha(itemId) {
        if (!podeEditar()) return;
        const itens = modelosDoPedidoAberto();
        const item = itens.find(i => String(i.id) === String(itemId));
        if (!item || !marcavelNaEscolha(item)) return;
        const id = String(itemId);
        if (tela.marcados[id]) delete tela.marcados[id];
        else tela.marcados[id] = true;
        renderDetalhe();
    }

    function limparEscolha() {
        tela.marcados = {};
        renderDetalhe();
    }

    /** Os modelos marcados agora, na ordem em que a lista os desenha. */
    function modelosMarcados() {
        return modelosDoPedidoAberto().filter(i => marcadoNaEscolha(i));
    }

    /**
     * A caixa de marcar no canto do card.
     *
     * Sempre desenhada — sem ela o card mudaria de largura quando alguém
     * marcasse o primeiro modelo, e a lista inteira daria um pulo. Modelo de
     * outro setor, com escolha em curso, fica tracejado e sem clique.
     */
    function caixaDeEscolha(item) {
        if (!podeEditar()) return '';

        // PRONTO: a caixa aparece MARCADA e travada, porque o modelo de fato já
        // entrou — e o title diz a saída, como toda trava daqui.
        if (estagioDoModelo(item) === 'Pronto') {
            const meus = registrosDoModelo(volumesDoSetor(item && item.setor), item && item.id);
            const onde = meus.length
                ? ` Ele está ${meus.length === 1 ? 'no volume' : 'nos volumes'} `
                  + meus.map(x => 'V' + x.volume.numero).join(', ') + '.'
                : '';
            return `<span title="Este modelo está REVISADO.${esc(onde)} Para mexer nele, tire-o de Revisado — o material sai do volume e o peso sai da soma."
                          style="width: 22px; height: 22px; min-width: 22px; border-radius: 6px;
                                 background: rgba(34,197,94,0.20); border: 1px solid rgba(34,197,94,0.45);
                                 color: #22c55e; display: inline-flex; align-items: center;
                                 justify-content: center; font-weight: 800; font-size: 0.9rem;
                                 cursor: not-allowed;">✓</span>`;
        }

        if (!marcavelNaEscolha(item)) {
            return `<span title="Um volume não mistura setores — a escolha em curso é do setor ${esc(nomeDoSetor(setorDaEscolha()))}"
                          style="width: 22px; height: 22px; min-width: 22px; border-radius: 6px;
                                 background: #0d0e20; border: 1px dashed rgba(207,230,251,0.30);
                                 display: inline-block;"></span>`;
        }
        const marcado = marcadoNaEscolha(item);
        return `
            <button type="button" onclick="AcabamentoPainel.marcarModelo('${escJs(item.id)}')"
                    aria-pressed="${marcado ? 'true' : 'false'}"
                    title="${marcado ? 'Tirar da escolha' : 'Marcar para registrar junto com outros modelos'}"
                    style="width: 22px; height: 22px; min-width: 22px; border-radius: 6px; padding: 0;
                           display: inline-flex; align-items: center; justify-content: center;
                           cursor: pointer; font-weight: 800; font-size: 0.9rem; font-family: inherit;
                           ${marcado
                              ? 'background: #4cc8f0; border: 1px solid #4cc8f0; color: #001249;'
                              : 'background: #0d0e20; border: 1px solid rgba(76,200,240,0.35); color: transparent;'}">✓</button>`;
    }

    /** O contorno do card: marcado salta, outro setor apaga só se há escolha. */
    function estiloDoCardNaEscolha(item) {
        if (marcadoNaEscolha(item)) return 'outline: 2px solid #4cc8f0;';
        if (setorDaEscolha() && !marcavelNaEscolha(item)) {
            return `outline: 1px solid ${AZUL.fio}; opacity: 0.42;`;
        }
        return `outline: 1px solid ${AZUL.fio};`;
    }

    const ID_DA_BARRA_DA_ESCOLHA = 'acab-barra-escolha';

    /** O conteúdo da barra: a conta do que foi marcado e os dois botões. */
    function barraDaEscolha(itens) {
        const marcados = (itens || []).filter(i => marcadoNaEscolha(i));
        if (!marcados.length) return '';
        const setor = setorDaEscolha();
        const embalado = embaladoPorModelo(volumesDoSetor(setor));
        const unidades = marcados.reduce((s, i) => s + faltaEmbalar(i, embalado), 0);

        return `
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
                        background: ${AZUL.fundo};
                        border: 1px solid #4cc8f0; border-radius: 10px; padding: 12px 16px;
                        box-shadow: 0 -6px 24px rgba(0,0,0,0.65);">
                <span style="font-size: 1.05rem;">✅</span>
                <strong style="font-size: 0.9rem; color: #ffffff;">
                    ${marcados.length} ${marcados.length === 1 ? 'modelo marcado' : 'modelos marcados'}
                </strong>
                <span style="font-size: 0.8rem; color: var(--text-dim); font-family: monospace;">${numeroComPonto(unidades)} un</span>
                <span style="font-size: 0.74rem; color: var(--text-dim);">setor ${esc(nomeDoSetor(setor))} — um volume não mistura setores</span>
                <span style="margin-left: auto; display: flex; gap: 10px;">
                    <button type="button" onclick="AcabamentoPainel.cancelarVolume()"
                            style="background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);
                                   color: #cfe6fb; border-radius: 8px; padding: 10px 18px; font-weight: 700;
                                   font-size: 0.86rem; cursor: pointer; font-family: inherit;">Desmarcar</button>
                    <button type="button" onclick="AcabamentoPainel.registrarEmGrupo()"
                            style="border-radius: 8px; padding: 10px 22px; font-weight: 800; letter-spacing: 0.05em;
                                   font-size: 0.86rem; font-family: inherit; cursor: pointer;
                                   background: linear-gradient(135deg, #4a61e8, #120a8f); border: 1px solid #4cc8f0; color: #ffffff;">
                        Registrar ${marcados.length === 1 ? 'num volume' : `os ${marcados.length} num volume`}
                    </button>
                </span>
            </div>`;
    }

    /**
     * Põe a barra na tela — ou a tira, quando nada está marcado.
     *
     * Ela é fixa contra a janela, e por isso não sai sozinha quando o pedido
     * fecha: `renderDetalhe` deixa de desenhar o detalhe, e a barra ficaria
     * boiando sobre a lista. Por isso o `mostrarLista` também chama isto.
     *
     * Três coisas moram neste canto da tela: o Quadro de Avisos, esta barra e
     * os avisos flutuantes. Elas se empilham pela convenção que o quadro criou
     * — cada uma publica a própria altura numa variável, e a de cima se apoia
     * nela. Daqui sai a `--escolha-altura`; o CSS faz o resto.
     */
    function pintarBarraDaEscolha(itens) {
        const caixa = document.getElementById(ID_DA_BARRA_DA_ESCOLHA);
        if (!caixa) return;
        // A tela do Acabamento precisa estar aberta. A barra é fixa contra a
        // janela e não pertence a nenhuma view — sem esta condição ela apareceria
        // por cima de qualquer outra tela do painel.
        const secao = document.getElementById('view-acabamento');
        const aberta = !!(secao && secao.classList && secao.classList.contains('active'));
        const html = (aberta && tela.pedidoAberto) ? barraDaEscolha(itens) : '';
        const raiz = document.documentElement;

        if (!html) {
            caixa.style.display = 'none';
            caixa.innerHTML = '';
            document.body.classList.remove('acab-escolhendo-volume');
            if (raiz && raiz.style) raiz.style.setProperty('--escolha-altura', '0px');
            return;
        }
        caixa.innerHTML = html;
        caixa.style.display = '';
        document.body.classList.add('acab-escolhendo-volume');

        const altura = caixa.getBoundingClientRect
            ? Math.round(caixa.getBoundingClientRect().height) : 0;
        if (raiz && raiz.style) {
            raiz.style.setProperty('--escolha-altura', (altura ? altura + 14 : 0) + 'px');
        }
    }

    // ─── O volume vazio ──────────────────────────────────────────────────────
    //
    // O primeiro volume de um pedido nasce aqui, e nasce VAZIO. É o gesto que
    // diz "este pedido vai ser embalado em volumes" — e é o que liga a trava do
    // Pronto. Depois dele, todo Pronto passa a perguntar em qual volume o
    // modelo entra.
    //
    // Volume vazio é estado legítimo e reversível: ele aparece na faixa com o
    // aviso "vazio" e pode ser excluído, e excluir o último devolve o pedido ao
    // fluxo de sempre. Sem essa saída, criar um volume por engano trancaria a
    // tela (regra da casa: toda trava diz como sair dela).

    async function criarVolumeVazio(setor, numeroDoPedido) {
        if (!podeEditar()) return;
        const alvo = normalizar(setor);
        const idInt = parseInt(numeroDoPedido);
        if (isNaN(idInt)) { avisar('Este pedido não tem número.', 'error'); return; }
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            avisar('Esta tela está sem conexão com o banco.', 'error');
            return;
        }
        const numero = proximoNumeroDeVolume(volumesDoSetor(alvo));
        try {
            const { error } = await supabaseClient.from(TABELA_DE_VOLUMES).insert({
                id_int: idInt, setor: alvo, numero, peso_kg: null,
            });
            if (error) throw error;
            await carregarVolumes(numeroDoPedido);
            renderDetalhe();
            avisar(`Volume ${numero} criado no setor ${nomeDoSetor(alvo)}. `
                 + 'A partir de agora, marcar um modelo como Revisado pergunta em qual volume ele entra.', 'success');
        } catch (e) {
            console.error('[acabamento] erro ao criar o volume:', e);
            const duplicado = String((e && e.message) || '').indexOf('producao_volumes_unico') !== -1;
            avisar(duplicado
                ? 'Outro operador acabou de criar este volume. Clique em "+ Volume" de novo.'
                : `Não deu para criar o volume: ${(e && e.message) ? e.message : e}`, 'error');
        }
    }

    // ─── O registro: em qual volume, quanto vai, quanto pesa ─────────────────
    //
    // É a janela que o PRONTO abre num pedido que tem volumes. Ela responde as
    // três perguntas da regra de 29/08/2026, nesta ordem, que é a ordem do
    // gesto na estação: o operador já está com o material na mão, ao lado da
    // balança.
    //
    // Ela serve tanto a UM modelo (clique no Pronto do card) quanto a VÁRIOS
    // (barra da escolha). É a mesma janela porque é o mesmo trabalho — o que
    // muda é quantas linhas ela tem.
    //
    // Montada inteira a cada abertura, em vez de montada uma vez e repintada: o
    // número de linhas muda a cada registro, e repintar uma lista de tamanho
    // variável dentro de uma casca fixa daria mais código do que refazê-la.

    const ID_DA_JANELA_DO_REGISTRO = 'acab-registro-janela';
    const ID_DA_FOTO_DO_VOLUME = 'acab-reg-foto';

    function fecharRegistro() {
        const caixa = document.getElementById(ID_DA_JANELA_DO_REGISTRO);
        if (caixa && caixa.parentNode) caixa.parentNode.removeChild(caixa);
        tela.registroEmCurso = null;
    }

    /**
     * A janela some da frente sem ser desmontada — e `registroEmCurso` fica.
     *
     * É o que permite o popup da senha aparecer por cima e, no cancelar, a
     * janela voltar com tudo o que o operador já tinha digitado.
     */
    function esconderRegistro() {
        const caixa = document.getElementById(ID_DA_JANELA_DO_REGISTRO);
        if (caixa) caixa.style.display = 'none';
    }

    function mostrarRegistro() {
        const caixa = document.getElementById(ID_DA_JANELA_DO_REGISTRO);
        if (caixa) caixa.style.display = 'flex';
    }

    /** Os modelos do pedido que está aberto. */
    function modelosDoPedidoAberto() {
        const s = estado();
        return (s.osItens && s.osItens[tela.pedidoAberto]) || [];
    }

    /** O pedido aberto usa volumes? É esta pergunta que liga a trava do Pronto. */
    function pedidoTemVolumes() {
        return todosOsVolumes().length > 0;
    }

    /** O texto de um campo de quantidade: "2.000" e "2000" são o mesmo número. */
    function qtdDoTexto(texto) {
        const limpo = String(texto === undefined || texto === null ? '' : texto).replace(/[^\d]/g, '');
        return Math.max(0, parseInt(limpo, 10) || 0);
    }

    /**
     * Quantas unidades deste modelo estão livres para a linha `menos`.
     *
     * Livre = tiragem − o que já está em volume − o que as OUTRAS linhas desta
     * mesma janela já tomaram. Sem a segunda parcela, duas linhas do mesmo
     * modelo apareceriam as duas com a tiragem inteira disponível, e o operador
     * registraria o dobro sem a tela dizer nada.
     */
    function livreParaRegistro(modeloId, menos, linhas) {
        const r = tela.registroEmCurso;
        if (!r) return 0;
        const item = modelosDoPedidoAberto().find(m => String(m.id) === String(modeloId));
        if (!item) return 0;
        const livre = faltaEmbalar(item, embaladoPorModelo(volumesDoSetor(r.setor)));
        const aqui = (linhas || []).reduce((s, l, i) => (
            i !== menos && String(l.modeloId) === String(modeloId) ? s + (l.qtd || 0) : s
        ), 0);
        return livre - aqui;
    }

    /**
     * Reparte um peso de balança entre as linhas do registro. Pura, para o teste.
     *
     * O caso que a criou é o do usuário: três modelos vão juntos ao prato, e a
     * balança devolve UM número. A repartição segue a proporção do PESO
     * ESTIMADO de cada linha — quantidade × peso da peça, que é o número mais
     * preciso que o ERP tem. Sem base no ERP para nenhuma linha, cai para a
     * proporção da quantidade, que é a melhor aproximação que sobra.
     *
     * A conta é feita em GRAMAS inteiras, e a ÚLTIMA linha recebe a sobra do
     * arredondamento: assim a soma das parcelas é exatamente o peso lido, e o
     * volume não engorda nem emagrece um grama por causa da divisão.
     */
    function repartirPeso(linhas, totalKg, modelos) {
        const lista = linhas || [];
        if (!lista.length) return [];
        const total = Math.round((Number(totalKg) || 0) * 1000);

        let pesos = lista.map(l => {
            const item = (modelos || []).find(m => String(m.id) === String(l.modeloId));
            const porUn = gramasPorUnidadeDoModelo(item);
            return porUn === null ? 0 : porUn * (l.qtd || 0);
        });
        if (!pesos.some(p => p > 0)) pesos = lista.map(l => l.qtd || 0);
        const somaDosPesos = pesos.reduce((s, p) => s + p, 0);
        if (!(somaDosPesos > 0)) return lista.map(() => 0);

        const parcelas = pesos.map(p => Math.round(total * p / somaDosPesos));
        const sobra = total - parcelas.reduce((s, p) => s + p, 0);
        parcelas[parcelas.length - 1] += sobra;
        return parcelas.map(g => Math.max(0, g) / 1000);
    }

    /**
     * Monta `tela.registroEmCurso` para os modelos dados.
     *
     * O volume escolhido nasce sendo o ÚLTIMO do setor — é o volume que está
     * aberto na mesa, e é nele que o próximo material entra na esmagadora
     * maioria das vezes. Quantidade nasce com o que AINDA ESTÁ FORA de volume:
     * o caminho de um clique para "este volume leva o resto".
     */
    function prepararRegistro(itens) {
        const s = estado();
        const os = (s.ordens || []).find(o => String(o.id) === String(tela.pedidoAberto));
        const numeroDoPedido = os ? os.numero : tela.pedidoAberto;
        const doSetor = (itens || []).filter(i => SETORES_DO_BANCO.indexOf(normalizar(i && i.setor)) !== -1);
        if (!doSetor.length) return null;

        const setor = normalizar(doSetor[0].setor);
        const lista = volumesDoSetor(setor);
        const embalado = embaladoPorModelo(lista);
        const ultimo = lista[lista.length - 1];

        return {
            numeroDoPedido,
            setor,
            volumeId: ultimo ? ultimo.id : null,
            numeroDoNovo: proximoNumeroDeVolume(lista),
            responsavel: doSetor.length === 1 ? responsavelDoModelo(doSetor[0]) : '',
            fotoUrl: ultimo ? (ultimo.foto || '') : '',
            porModelo: false,
            linhas: doSetor
                .filter(i => normalizar(i.setor) === setor)
                .map(i => ({
                    modeloId: String(i.id),
                    qtd: faltaEmbalar(i, embalado),
                    peso: null,
                }))
                .filter(l => l.qtd > 0),
        };
    }

    /** As linhas como estão AGORA nos campos da janela. */
    function linhasDigitadas() {
        const r = tela.registroEmCurso;
        if (!r) return [];
        return r.linhas.map((l, i) => {
            const qtd = document.getElementById('acab-reg-qtd-' + i);
            const peso = document.getElementById('acab-reg-peso-' + i);
            return {
                modeloId: l.modeloId,
                qtd: qtd ? qtdDoTexto(qtd.value) : l.qtd,
                peso: r.porModelo
                    ? (peso ? pesoDoTexto(peso.value) : l.peso)
                    : l.peso,
            };
        }).filter(l => l.qtd > 0);
    }

    /** O peso total que o operador digitou — de um campo só, ou das linhas. */
    function pesoTotalDigitado() {
        const r = tela.registroEmCurso;
        if (!r) return undefined;
        if (!r.porModelo) {
            const campo = document.getElementById('acab-reg-peso');
            return pesoDoTexto(campo ? campo.value : '');
        }
        let gramas = 0;
        let algum = false;
        r.linhas.forEach((l, i) => {
            const campo = document.getElementById('acab-reg-peso-' + i);
            const p = pesoDoTexto(campo ? campo.value : '');
            if (p === undefined) return;
            algum = true;
            gramas += Math.round(p * 1000);
        });
        return algum ? gramas / 1000 : undefined;
    }

    /** Uma linha da janela: modelo, quanto vai, e o peso quando é um a um. */
    function linhaDoRegistro(l, indice, linhas, doSetor) {
        const item = doSetor.find(m => String(m.id) === String(l.modeloId));
        const livre = livreParaRegistro(l.modeloId, indice, linhas);
        const r = tela.registroEmCurso;
        const cor = corDoModelo(item);

        return `
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
                        background: ${AZUL.superficie}; border: 1px solid rgba(76,200,240,0.20);
                        border-radius: 8px; padding: 10px 12px;">
                ${cor ? `<span style="width: 12px; height: 12px; min-width: 12px; border-radius: 50%;
                                      background: ${esc(cor)}; display: inline-block;"></span>` : ''}
                <span style="flex: 1 1 170px; min-width: 0; font-size: 0.9rem; color: #ffffff;
                             overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(nomeDoModelo(item))}</span>
                <span id="acab-reg-livre-${indice}"
                      style="font-size: 0.72rem; white-space: nowrap; color: ${livre < 0 ? '#fbbf24' : 'var(--text-dim)'};">
                    ${numeroComPonto(Math.max(0, livre))} livres de ${numeroComPonto(qtdDoModelo(item || {}))}
                </span>
                <input type="text" inputmode="numeric" id="acab-reg-qtd-${indice}"
                       value="${esc(numeroComPonto(l.qtd))}"
                       oninput="AcabamentoPainel.recalcularRegistro()"
                       title="Quantas unidades deste modelo entram no volume agora"
                       style="width: 92px; text-align: right; background: ${AZUL.fundo};
                              border: 1px solid rgba(76,200,240,0.26); border-radius: 6px; color: #ffffff;
                              padding: 8px 10px; font-size: 0.92rem; font-family: monospace;" />
                <span style="font-size: 0.78rem; color: var(--text-dim);">un</span>
                ${r && r.porModelo
                    ? `<span style="display: inline-flex; align-items: center; gap: 6px;">
                           <input type="text" inputmode="decimal" id="acab-reg-peso-${indice}"
                                  value="${esc(pesoParaTexto(l.peso))}" placeholder="0,00"
                                  oninput="AcabamentoPainel.recalcularRegistro()"
                                  title="O peso deste modelo na balança"
                                  style="width: 104px; text-align: right; background: ${AZUL.fundo};
                                         border: 1px solid rgba(76,200,240,0.26); border-radius: 6px; color: #ffffff;
                                         padding: 8px 10px; font-size: 0.92rem; font-family: monospace;" />
                           <span style="font-size: 0.78rem; color: var(--text-dim);">kg</span>
                           ${botaoDaBalanca('linha', indice)}
                       </span>`
                    : (linhas.length > 1
                        ? `<span id="acab-reg-parte-${indice}" title="Quanto deste peso vai para este modelo"
                                 style="font-size: 0.82rem; font-family: monospace;
                                        color: #cfe6fb; min-width: 92px; text-align: right;">—</span>`
                        : '')}
                ${linhas.length > 1
                    ? `<button type="button" onclick="AcabamentoPainel.removerLinhaDoRegistro(${indice})"
                               title="Tirar este modelo deste registro"
                               style="background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.35);
                                      color: #f87171; border-radius: 6px; padding: 6px 10px; font-weight: 800;
                                      cursor: pointer; font-family: inherit;">✕</button>`
                    : ''}
            </div>`;
    }

    /** A cor de referência do modelo, para a bolinha da linha. */
    function corDoModelo(item) {
        if (!item) return '';
        const cores = (estado().cores || []);
        const achou = cores.find(c => String(c.id) === String(item.amostra_cor_id));
        return (achou && (achou.hex || achou.cor_hex)) || '';
    }

    function htmlDasLinhasDoRegistro() {
        const r = tela.registroEmCurso;
        if (!r) return '';
        const doSetor = modelosDoPedidoAberto().filter(m => normalizar(m.setor) === r.setor);
        if (!r.linhas.length) {
            return `<div style="font-size: 0.8rem; color: #fbbf24; padding: 8px 2px;">
                        Nenhum modelo neste registro. Feche e marque de novo.
                    </div>`;
        }
        return r.linhas.map((l, i) => linhaDoRegistro(l, i, r.linhas, doSetor)).join('');
    }

    /** Guarda no estado o que está NOS CAMPOS agora, antes de redesenhar. */
    function lerRegistroDoDom() {
        const r = tela.registroEmCurso;
        if (!r) return;
        const campo = document.getElementById('acab-reg-peso');
        if (campo && !r.porModelo) r.pesoDoGrupo = campo.value;
        const resp = document.getElementById('acab-reg-responsavel');
        if (resp) r.responsavel = resp.value;
        r.linhas = r.linhas.map((l, i) => {
            const qtd = document.getElementById('acab-reg-qtd-' + i);
            const peso = document.getElementById('acab-reg-peso-' + i);
            return {
                modeloId: l.modeloId,
                qtd: qtd ? qtdDoTexto(qtd.value) : l.qtd,
                peso: peso ? pesoDoTexto(peso.value) : l.peso,
            };
        });
    }

    function removerLinhaDoRegistro(indice) {
        const r = tela.registroEmCurso;
        if (!r) return;
        lerRegistroDoDom();
        r.linhas.splice(indice, 1);
        repintarRegistro();
    }

    /**
     * "Pesar um a um": cada modelo ganha o seu campo de peso.
     *
     * O padrão é UMA pesagem repartida, porque é o gesto mais comum — os
     * modelos vão juntos ao prato. Mas quando cada um foi pesado sozinho, a
     * repartição por proporção estaria inventando números que o operador já
     * tem na mão, e este botão devolve o controle a ele.
     */
    function alternarPesagemPorModelo() {
        const r = tela.registroEmCurso;
        if (!r) return;
        lerRegistroDoDom();
        const doSetor = modelosDoPedidoAberto();
        if (!r.porModelo) {
            // Ao abrir os campos, eles nascem com a repartição que estava na
            // tela: o operador corrige o que estiver diferente em vez de
            // digitar tudo de novo.
            const total = pesoDoTexto(r.pesoDoGrupo || '');
            if (total !== undefined) {
                const partes = repartirPeso(r.linhas, total, doSetor);
                r.linhas = r.linhas.map((l, i) => Object.assign({}, l, { peso: partes[i] }));
            }
        }
        r.porModelo = !r.porModelo;
        repintarRegistro();
    }

    function repintarRegistro() {
        const alvo = document.getElementById('acab-reg-linhas');
        if (alvo) alvo.innerHTML = htmlDasLinhasDoRegistro();
        const campoDoGrupo = document.getElementById('acab-reg-grupo');
        if (campoDoGrupo) campoDoGrupo.innerHTML = htmlDoPesoDoGrupo();
        pintarResumoDoRegistro();
    }

    /** Repinta só a foto — os campos já digitados na janela ficam onde estão. */
    function pintarFotoDoVolume() {
        const alvo = document.getElementById(ID_DA_FOTO_DO_VOLUME);
        if (alvo) alvo.innerHTML = htmlDaFotoDoVolume();
    }

    /**
     * O botão e a miniatura da foto DO VOLUME.
     *
     * Uma foto por volume, compartilhada por todos os modelos que estão dentro
     * dele (28/08/2026). O ganho é de trabalho do operador: um volume com
     * quatro modelos dentro é UMA foto, e não quatro. Ela NÃO substitui a foto
     * do material, que é o registro do revisor e continua sendo do modelo.
     */
    function htmlDaFotoDoVolume() {
        const r = tela.registroEmCurso;
        if (!r) return '';
        const foto = (r.fotoUrl || '').trim();
        const pode = podeEditar();

        const miniatura = foto
            ? `<img id="acab-reg-foto-img" src="${esc(foto)}" alt="Foto deste volume"
                    onclick="AcabamentoPainel.ampliar('acab-reg-foto-img')"
                    title="Foto deste volume — clique para ampliar"
                    style="height: 40px; object-fit: contain; display: block; cursor: zoom-in;" />`
            : '';

        return `${miniatura}
            <button type="button" ${pode ? '' : 'disabled'}
                    onclick="AcabamentoPainel.fotografarVolume()"
                    title="${pode
                        ? 'Uma foto para o volume inteiro — ela vale para todos os modelos que estão dentro dele'
                        : 'Você tem apenas permissão de ver'}"
                    style="display: inline-flex; align-items: center; gap: 6px; background: rgba(69,137,215,0.16);
                           border: 1px solid rgba(69,137,215,0.50); color: #4cc8f0; border-radius: 7px;
                           padding: 8px 12px; font-size: 0.82rem; font-weight: 700; white-space: nowrap;
                           font-family: inherit; cursor: ${pode ? 'pointer' : 'not-allowed'}; opacity: ${pode ? '1' : '0.5'};">
                📷 ${foto ? 'Refazer' : 'Fotografar'}
            </button>`;
    }

    /** Os chips de volume: os que existem, e o "novo". */
    function htmlDosVolumesDoRegistro() {
        const r = tela.registroEmCurso;
        if (!r) return '';
        const lista = volumesDoSetor(r.setor);

        const chips = lista.map(v => {
            const escolhido = String(v.id) === String(r.volumeId);
            const temPeso = v.peso !== null && v.peso !== undefined && v.peso > 0;
            return `
            <button type="button" onclick="AcabamentoPainel.escolherVolume('${escJs(v.id)}')"
                    aria-pressed="${escolhido ? 'true' : 'false'}"
                    style="display: inline-flex; flex-direction: column; gap: 2px; align-items: flex-start;
                           border-radius: 9px; padding: 9px 14px; min-width: 132px; cursor: pointer;
                           font-family: inherit; text-align: left;
                           ${escolhido
                              ? 'background: rgba(76,200,240,0.16); border: 2px solid #4cc8f0;'
                              : `background: ${AZUL.superficie}; border: 1px solid rgba(76,200,240,0.22);`}">
                <strong style="font-size: 0.88rem; color: ${escolhido ? '#ffffff' : '#cfe6fb'};">
                    V${esc(v.numero)}${v.nome ? ' · ' + esc(v.nome) : ''}${escolhido ? ' ✓' : ''}
                </strong>
                <span style="font-size: 0.76rem; font-family: monospace; color: ${temPeso ? '#cfe6fb' : '#fbbf24'};">
                    ${temPeso ? esc(kgParaTexto(v.peso)) + ' kg' : 'vazio'} ·
                    ${(v.registros || []).length} ${(v.registros || []).length === 1 ? 'modelo' : 'modelos'}
                </span>
            </button>`;
        }).join('');

        const novo = `
            <button type="button" onclick="AcabamentoPainel.escolherVolume('')"
                    aria-pressed="${r.volumeId ? 'false' : 'true'}"
                    style="display: inline-flex; flex-direction: column; gap: 2px; align-items: center;
                           justify-content: center; border-radius: 9px; padding: 9px 14px; min-width: 132px;
                           cursor: pointer; font-family: inherit;
                           ${r.volumeId
                              ? 'background: rgba(76,200,240,0.04); border: 1px dashed rgba(76,200,240,0.40);'
                              : 'background: rgba(76,200,240,0.16); border: 2px solid #4cc8f0;'}">
                <strong style="font-size: 0.88rem; color: #4cc8f0;">＋ Novo volume</strong>
                <span style="font-size: 0.74rem; color: var(--text-dim);">seria o V${esc(r.numeroDoNovo)}</span>
            </button>`;

        return chips + novo;
    }

    /** O campo do peso: um só para o grupo, ou o aviso de que são vários. */
    function htmlDoPesoDoGrupo() {
        const r = tela.registroEmCurso;
        if (!r) return '';
        if (r.porModelo) {
            return `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 0.8rem; color: #cfe6fb;">Cada modelo tem o seu campo de peso, na lista acima.</span>
                    <button type="button" onclick="AcabamentoPainel.pesarPorModelo()"
                            style="${ESTILO_BOTAO_VOLUME} margin-left: auto;">Voltar a uma pesagem só</button>
                </div>`;
        }
        return `
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <input type="text" inputmode="decimal" id="acab-reg-peso" autocomplete="off"
                       value="${esc(r.pesoDoGrupo || '')}" placeholder="0,00"
                       oninput="AcabamentoPainel.recalcularRegistro()"
                       title="O peso do material na balança, antes de ele entrar no volume"
                       style="width: 150px; text-align: right; background: ${AZUL.fundo};
                              border: 1px solid rgba(76,200,240,0.26); border-radius: 6px;
                              color: #ffffff; padding: 8px 10px; font-size: 1.25rem; font-family: monospace;" />
                <span style="font-size: 0.95rem; color: #7fa9d4;">kg</span>
                ${botaoDaBalanca('registro')}
                <span id="acab-reg-est" style="font-size: 0.8rem; color: var(--text-dim); white-space: nowrap;"></span>
                ${r.linhas.length > 1 ? `
                <button type="button" onclick="AcabamentoPainel.pesarPorModelo()"
                        title="Quando cada modelo foi à balança sozinho"
                        style="${ESTILO_BOTAO_VOLUME} margin-left: auto;">Pesar um a um</button>` : ''}
            </div>`;
    }

    /**
     * O "2.000 livres de 5.000" de cada linha, e a parcela de peso dela.
     *
     * Precisa ser vivo porque a conta de uma linha depende das OUTRAS: digitar
     * 3.000 numa linha tira 3.000 do que a outra tem disponível, e um número
     * parado ali levaria o operador a registrar duas vezes o mesmo material.
     */
    function pintarResumoDoRegistro() {
        const r = tela.registroEmCurso;
        if (!r) return;
        const modelos = modelosDoPedidoAberto();
        const agora = r.linhas.map((l, i) => {
            const qtd = document.getElementById('acab-reg-qtd-' + i);
            return { modeloId: l.modeloId, qtd: qtd ? qtdDoTexto(qtd.value) : l.qtd };
        });

        agora.forEach((l, i) => {
            const alvo = document.getElementById('acab-reg-livre-' + i);
            if (!alvo) return;
            const item = modelos.find(m => String(m.id) === String(l.modeloId));
            const livre = livreParaRegistro(l.modeloId, i, agora);
            const sobra = livre - l.qtd;
            alvo.textContent = sobra < 0
                ? `${numeroComPonto(-sobra)} un a mais do que a tiragem`
                : `${numeroComPonto(livre)} livres de ${numeroComPonto(qtdDoModelo(item || {}))}`;
            alvo.style.color = sobra < 0 ? '#fbbf24' : 'var(--text-dim)';
        });

        // A parcela de cada linha, quando a pesagem é uma só. É o que responde
        // "quanto deste peso foi para cada modelo" ANTES de gravar — depois de
        // gravado, quem responde é a lista do volume.
        const total = pesoTotalDigitado();
        if (!r.porModelo) {
            const partes = (total === undefined) ? [] : repartirPeso(agora, total, modelos);
            agora.forEach((l, i) => {
                const alvo = document.getElementById('acab-reg-parte-' + i);
                if (!alvo) return;
                alvo.textContent = (total === undefined) ? '—' : `${kgParaTexto(partes[i])} kg`;
            });
        }

        const est = estimadoDoVolume(agora, modelos);
        const alvoEst = document.getElementById('acab-reg-est');
        if (alvoEst) {
            if (est.kg === null) {
                alvoEst.textContent = 'est. —';
                alvoEst.style.color = 'var(--text-dim)';
            } else {
                let texto = `est. ${kgParaTexto(est.kg)} kg`;
                if (total !== undefined && est.kg > 0) {
                    const pct = (total - est.kg) / est.kg * 100;
                    texto += ` · ${pct < 0 ? '-' : '+'}${Math.abs(pct).toFixed(1).replace('.', ',')}%`;
                }
                if (est.semBase) {
                    texto += ` (${est.semBase} ${est.semBase === 1 ? 'modelo' : 'modelos'} sem peso no ERP)`;
                }
                alvoEst.textContent = texto;
                alvoEst.style.color = (total !== undefined && precisaDeLiberacao(total, est.kg))
                    ? '#fbbf24' : 'var(--text-dim)';
            }
        }

        pintarConsequenciaDoRegistro(agora, total);
    }

    /**
     * "Ao gravar, o V2 passa a 20,560 kg e o modelo fica Pronto."
     *
     * O que o sistema faz sozinho se anuncia (regra da casa). Sem esta linha o
     * operador clicaria em Gravar sem saber que o Pronto vem junto, e voltaria
     * para a lista com um card verde que ele não marcou.
     */
    function pintarConsequenciaDoRegistro(linhas, total) {
        const alvo = document.getElementById('acab-reg-resumo');
        const r = tela.registroEmCurso;
        if (!alvo || !r) return;

        const lista = volumesDoSetor(r.setor);
        const volume = lista.find(v => String(v.id) === String(r.volumeId));
        const antes = volume && volume.peso ? Number(volume.peso) : 0;
        const depois = antes + (total === undefined ? 0 : total);

        const embalado = embaladoPorModelo(lista);
        const modelos = modelosDoPedidoAberto();
        const fecham = (linhas || []).filter(l => {
            const item = modelos.find(m => String(m.id) === String(l.modeloId));
            return item && faltaEmbalar(item, embalado) <= (l.qtd || 0);
        }).length;
        const parciais = (linhas || []).length - fecham;

        const nomeDoVolume = volume ? `V${volume.numero}` : `V${r.numeroDoNovo}`;
        const parte1 = `<strong>${esc(nomeDoVolume)}</strong> passa a `
            + `<strong style="font-family: monospace;">${esc(kgParaTexto(depois))} kg</strong>`;
        const parte2 = fecham
            ? ` e ${fecham === 1 ? 'o modelo fica' : `${fecham} modelos ficam`} <strong style="color: #22c55e;">Revisado${fecham === 1 ? '' : 's'}</strong>`
            : '';
        const parte3 = parciais
            ? `<div style="font-size: 0.74rem; color: #fbbf24; margin-top: 4px;">⚠ `
              + `${parciais === 1 ? 'um modelo entra em parte' : `${parciais} modelos entram em parte`} — `
              + `${parciais === 1 ? 'ele continua' : 'eles continuam'} em acabamento até o resto entrar noutro volume.</div>`
            : '';

        alvo.innerHTML = `<span style="font-size: 0.8rem; color: #cfe6fb; line-height: 1.45;">`
            + `Ao gravar: ${parte1}${parte2}.</span>${parte3}`;
    }

    /**
     * As opções de um seletor de operador do acabamento.
     *
     * Texto livre faria "Ana", "ana" e "Ana Paula" virarem três pessoas na hora
     * de conferir quem embalou o quê — por isso a lista é fechada. Um nome que
     * já está gravado e saiu da lista de acessos volta para ela: apagá-lo da
     * tela faria o registro parecer sem dono.
     */
    function opcoesDeOperador(atual, rotuloVazio) {
        const nomes = (tela.operadores || [])
            .filter(o => o.role === PERFIL_DO_RESPONSAVEL)
            .map(o => o.nome);
        const escolhido = (atual || '').trim();
        if (escolhido && !nomes.some(n => n.toLowerCase() === escolhido.toLowerCase())) {
            nomes.unshift(escolhido);
        }
        return [`<option value="" style="${ESTILO_OPCAO}">${esc(rotuloVazio)}</option>`].concat(
            nomes.map(n => `<option value="${esc(n)}" style="${ESTILO_OPCAO}" `
                + `${n.toLowerCase() === escolhido.toLowerCase() ? 'selected' : ''}>${esc(n)}</option>`)
        ).join('');
    }

    /** Quem fez sai da MESMA lista do responsável do card. */
    function selectDeQuemPesou(atual) {
        return `<select id="acab-reg-responsavel" style="${ESTILO_SELECT_SOLTO} font-size: 0.95rem;">`
            + opcoesDeOperador(atual, '— Quem fez —') + '</select>';
    }

    /**
     * Abre a janela do registro para os modelos dados.
     *
     * Chamada de dois lugares: do PRONTO de um card (um modelo) e da barra da
     * escolha (vários). Modelo que já está inteiro em volume não abre janela
     * nenhuma — não há o que registrar.
     */
    function abrirRegistro(itens) {
        if (!podeEditar()) return false;
        const preparado = prepararRegistro(itens);
        if (!preparado || !preparado.linhas.length) return false;
        tela.registroEmCurso = preparado;
        fecharVolumeAberto();

        const quantos = preparado.linhas.length;
        const doSetor = modelosDoPedidoAberto().filter(m => normalizar(m.setor) === preparado.setor);
        const titulo = quantos === 1
            ? esc(nomeDoModelo(doSetor.find(m => String(m.id) === String(preparado.linhas[0].modeloId))))
            : `${quantos} modelos`;

        const caixa = document.createElement('div');
        caixa.id = ID_DA_JANELA_DO_REGISTRO;
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100005; display: flex;'
            + ' align-items: center; justify-content: center; background: rgba(6,7,13,0.92); padding: 18px;';
        caixa.innerHTML = `
            <div style="width: min(900px, 96vw); max-height: 92vh; overflow: auto; background: ${AZUL.fundo};
                        border: 1px solid rgba(76,200,240,0.28); border-radius: 12px;
                        display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px;
                            background: #120a8f; border-bottom: 1px solid rgba(76,200,240,0.24);">
                    <span style="font-size: 1.2rem;">✅</span>
                    <strong style="font-size: 1.05rem; color: #ffffff;">Revisado — ${titulo}</strong>
                    <span style="font-size: 0.78rem; color: #cfe6fb;">Pedido ${esc(preparado.numeroDoPedido)} · setor ${esc(nomeDoSetor(preparado.setor))}</span>
                    <button type="button" onclick="AcabamentoPainel.fecharRegistro()"
                            style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px; font-weight: 700;
                                   cursor: pointer; font-family: inherit;">✕</button>
                </div>

                <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 15px;">
                    <span style="font-size: 0.82rem; color: #cfe6fb; line-height: 1.5;">
                        Este pedido tem volumes. Diga em qual ${quantos === 1 ? 'este modelo vai' : 'estes modelos vão'}
                        e quanto ${quantos === 1 ? 'ele pesa' : 'eles pesam'} — é o que fecha o Revisado.
                    </span>

                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <span style="${ROTULO_DO_PASSO}">1 · Em qual volume</span>
                        <div id="acab-reg-volumes" style="display: flex; gap: 10px; flex-wrap: wrap;">
                            ${htmlDosVolumesDoRegistro()}
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span style="${ROTULO_DO_PASSO}">2 · Quanto vai</span>
                            <span style="font-size: 0.74rem; color: var(--text-dim);">diminuir a quantidade reparte o modelo: o resto entra noutro volume depois</span>
                        </div>
                        <div id="acab-reg-linhas" style="display: flex; flex-direction: column; gap: 8px;">
                            ${htmlDasLinhasDoRegistro()}
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span style="${ROTULO_DO_PASSO}">3 · Peso na balança</span>
                            <span style="font-size: 0.74rem; color: var(--text-dim);">o material vai à balança antes de entrar no volume</span>
                        </div>
                        <div id="acab-reg-grupo">${htmlDoPesoDoGrupo()}</div>
                    </div>

                    <div style="display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;">
                        <div style="display: flex; flex-direction: column; gap: 6px; flex: 1 1 220px;">
                            <span style="${ROTULO_DO_PASSO}">4 · Quem fez</span>
                            ${selectDeQuemPesou(preparado.responsavel)}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px; flex: 1 1 240px;">
                            <span style="${ROTULO_DO_PASSO}"
                                  title="Uma foto para o volume inteiro, compartilhada por todos os modelos que estão dentro dele">Foto do volume (opcional)</span>
                            <div id="${ID_DA_FOTO_DO_VOLUME}" style="display: flex; align-items: center; gap: 8px;">
                                ${htmlDaFotoDoVolume()}
                            </div>
                        </div>
                    </div>

                    <div id="acab-reg-resumo" style="background: rgba(76,200,240,0.07);
                                border: 1px solid rgba(76,200,240,0.22); border-radius: 8px; padding: 10px 12px;"></div>

                    <div id="acab-reg-erro" style="min-height: 1.2em; font-size: 0.82rem; color: #f87171;"></div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px;
                            border-top: 1px solid rgba(76,200,240,0.18); flex-wrap: wrap;">
                    <span style="font-size: 0.78rem; color: #7fa9d4;">Cancelar deixa ${quantos === 1 ? 'o modelo' : 'os modelos'} como ${quantos === 1 ? 'está' : 'estão'} — em acabamento, sem volume.</span>
                    <span style="margin-left: auto; display: flex; gap: 10px;">
                        <button type="button" onclick="AcabamentoPainel.fecharRegistro()"
                                style="background: rgba(43,50,175,0.35); border: 1px solid rgba(76,200,240,0.22);
                                       color: #cfe6fb; border-radius: 8px; padding: 10px 18px; font-weight: 700;
                                       cursor: pointer; font-family: inherit;">Cancelar</button>
                        <button type="button" id="acab-reg-ok" onclick="AcabamentoPainel.confirmarRegistro()"
                                style="background: linear-gradient(135deg, #4a61e8, #120a8f); border: 1px solid #4cc8f0;
                                       color: #ffffff; border-radius: 8px; padding: 10px 22px; font-weight: 800;
                                       letter-spacing: 0.05em; cursor: pointer; font-family: inherit;">${ROTULO_DO_GRAVAR}</button>
                    </span>
                </div>
            </div>`;
        document.body.appendChild(caixa);

        const campo = document.getElementById('acab-reg-peso');
        if (campo) {
            campo.addEventListener('keydown', ev => {
                if (ev && ev.key === 'Enter') { ev.preventDefault(); confirmarRegistro(); }
            });
            try { campo.focus(); campo.select(); } catch (ignorado) { /* sem foco não há problema */ }
        }
        pintarResumoDoRegistro();
        return true;
    }

    const ROTULO_DO_PASSO = 'font-size: 0.7rem; font-weight: 800; text-transform: uppercase;'
        + ' letter-spacing: 0.05em; color: #8fb6e0;';
    const ROTULO_DO_GRAVAR = 'Gravar e marcar Revisado';

    /** Troca o volume escolhido — e com ele a foto que a janela oferece. */
    function escolherVolume(volumeId) {
        const r = tela.registroEmCurso;
        if (!r) return;
        lerRegistroDoDom();
        r.volumeId = volumeId || null;
        const v = volumesDoSetor(r.setor).find(x => String(x.id) === String(volumeId));
        // A foto pertence ao VOLUME: trocar de volume troca a foto que a janela
        // está mexendo. Sem isto, fotografar aqui carimbaria a foto do volume
        // anterior no volume novo.
        r.fotoUrl = v ? (v.foto || '') : '';
        const alvo = document.getElementById('acab-reg-volumes');
        if (alvo) alvo.innerHTML = htmlDosVolumesDoRegistro();
        pintarFotoDoVolume();
        pintarResumoDoRegistro();
    }

    /**
     * Confere e grava o registro.
     *
     * A régua dos 5 % é a mesma de sempre, aplicada aqui: peso digitado contra
     * quantidade × peso da peça. Ela ficou MELHOR do que era no setor — lá a
     * base é a tiragem inteira, e aqui é exatamente o que vai ao prato.
     */
    async function confirmarRegistro(opcoes) {
        const r = tela.registroEmCurso;
        if (!r) { fecharRegistro(); return; }

        const erro = document.getElementById('acab-reg-erro');
        const dizer = t => { if (erro) erro.textContent = t; };

        const linhas = linhasDigitadas();
        if (!linhas.length) {
            dizer('Nenhum modelo com quantidade. Diga quanto vai neste volume.');
            return;
        }
        const excedida = linhas.some((l, i) => livreParaRegistro(l.modeloId, i, linhas) < l.qtd);
        if (excedida) {
            dizer('Alguma quantidade passou do que ainda falta embalar. Confira as linhas em âmbar.');
            return;
        }

        const total = pesoTotalDigitado();
        if (total === undefined) {
            dizer('Falta o peso na balança. Sem ele o volume não tem como somar.');
            return;
        }
        if (!(total > 0)) {
            dizer('O peso precisa ser maior que zero.');
            return;
        }

        const responsavel = document.getElementById('acab-reg-responsavel');
        const modelos = modelosDoPedidoAberto();
        const partes = r.porModelo
            ? linhas.map(l => (l.peso === undefined || l.peso === null ? 0 : l.peso))
            : repartirPeso(linhas, total, modelos);

        const jaExiste = volumesDoSetor(r.setor).find(v => String(v.id) === String(r.volumeId));
        const dados = {
            numeroDoPedido: r.numeroDoPedido,
            setor: r.setor,
            volumeId: r.volumeId,
            numeroDoNovo: r.numeroDoNovo,
            // O número que o operador vê. O popup da senha o mostra, e ele não
            // pode dizer "volume 4" quando o material vai para o V2.
            numero: jaExiste ? jaExiste.numero : r.numeroDoNovo,
            fotoUrl: r.fotoUrl || '',
            responsavel: responsavel ? responsavel.value : (r.responsavel || ''),
            linhas: linhas.map((l, i) => Object.assign({}, l, { peso: partes[i] })),
            total,
        };

        const est = estimadoDoVolume(linhas, modelos);
        if (est.kg !== null && precisaDeLiberacao(total, est.kg) && !(opcoes && opcoes.liberado)) {
            tela.liberacaoPendente = {
                tipo: 'volume',
                numeroDoPedido: r.numeroDoPedido,
                setor: r.setor,
                peso: total,
                estimado: est.kg,
                volume: dados,
            };
            esconderRegistro();       // sai da frente do popup da senha
            abrirPopupDaLiberacao();
            return;
        }

        await gravarRegistroConferido(dados);
    }

    /**
     * Grava o registro que já passou pela régua dos 5 % — ou pela senha.
     *
     * Separado do `confirmarRegistro` porque tem dois chamadores: o OK da
     * janela, quando não há divergência, e o `liberarDivergencia`, depois da
     * senha certa.
     */
    async function gravarRegistroConferido(dados) {
        const erro = document.getElementById('acab-reg-erro');
        const dizer = t => { if (erro) erro.textContent = t; };
        const botao = document.getElementById('acab-reg-ok');
        if (botao) { botao.disabled = true; botao.textContent = 'Gravando…'; }
        try {
            const numero = await gravarRegistro(dados);
            await carregarVolumes(dados.numeroDoPedido);
            tela.marcados = {};
            fecharRegistro();
            renderDetalhe();
            avisar(`Registrado no volume ${numero} do setor ${nomeDoSetor(dados.setor)}: `
                 + `${kgParaTexto(dados.total)} kg.`, 'success');
            // O peso ANTES do Pronto, e não depois: a regra da casa é que o
            // setor não fecha sem peso registrado, e é a soma dos volumes que o
            // registra agora.
            await atualizarPesoDoSetorPelosVolumes(dados.setor);
            await fecharModelosEmbalados(dados.setor);
        } catch (e) {
            console.error('[acabamento] erro ao gravar o registro:', e);
            const duplicado = String((e && e.message) || '').indexOf('producao_volumes_unico') !== -1;
            mostrarRegistro();   // veio da senha? a janela precisa voltar
            dizer(duplicado
                ? 'Outro operador acabou de criar este volume. Feche e abra o Revisado de novo.'
                : `Não deu para gravar: ${(e && e.message) ? e.message : e}`);
        } finally {
            if (botao) { botao.disabled = false; botao.textContent = ROTULO_DO_GRAVAR; }
        }
    }

    /**
     * Escreve o registro no banco. Devolve o NÚMERO do volume que o recebeu.
     *
     * Três escritas, nesta ordem:
     *
     *  1. o volume, se ele ainda não existe (`volumeId` nulo);
     *  2. uma linha por modelo em `producao_volume_itens`, com o peso — isto é
     *     ACRÉSCIMO, e não substituição: o volume recebe modelos ao longo do
     *     dia, e reescrever a lista apagaria o que já estava lá;
     *  3. o espelho: `producao_volumes.peso_kg` recebe a soma dos registros.
     *
     * O passo 3 não é o que a tela lê — ela soma os registros. Ele existe para
     * a ESTAÇÃO ATRASADA: uma máquina com o painel da versão anterior aberto
     * continua desenhando o chip do volume a partir de `peso_kg`, e sem o
     * espelho ela mostraria o peso congelado no tempo. Mesma precaução que fez
     * `producao_volume_itens` manter o nome.
     */
    async function gravarRegistro(dados) {
        const idInt = parseInt(dados.numeroDoPedido);
        if (isNaN(idInt)) throw new Error('este pedido não tem número');
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            throw new Error('esta tela está sem conexão com o banco');
        }

        let id = dados.volumeId || null;
        let numero = dados.numeroDoNovo;
        if (id) {
            const atual = todosOsVolumes().find(v => String(v.id) === String(id));
            numero = atual ? atual.numero : numero;
        } else {
            const { data, error } = await supabaseClient
                .from(TABELA_DE_VOLUMES)
                .insert({ id_int: idInt, setor: normalizar(dados.setor), numero, peso_kg: null })
                .select('id').single();
            if (error) throw error;
            id = data.id;
        }

        const linhas = (dados.linhas || [])
            .filter(l => l && l.qtd > 0)
            .map(l => ({
                volume_id: id,
                modelo_id: parseInt(l.modeloId, 10),
                qtd: l.qtd,
                peso_kg: (l.peso === null || l.peso === undefined) ? null : l.peso,
                responsavel: (dados.responsavel || '').trim() || null,
            }));
        if (linhas.length) {
            const { error } = await supabaseClient
                .from(TABELA_DE_ITENS_DO_VOLUME).insert(linhas);
            if (error) throw error;
        }

        // A foto e o espelho do peso, numa escrita só. A soma é a do que JÁ
        // estava no volume mais o que acabou de entrar — ler o banco de novo só
        // para isto seria uma ida a mais no meio do caminho do operador.
        const antes = todosOsVolumes().find(v => String(v.id) === String(id));
        const gramas = Math.round(((antes && antes.peso) || 0) * 1000)
                     + linhas.reduce((s, l) => s + Math.round((l.peso_kg || 0) * 1000), 0);
        const campos = { peso_kg: gramas / 1000 };
        const foto = (dados.fotoUrl || '').trim();
        if (foto) campos.foto_url = foto;
        const { error: erroEspelho } = await supabaseClient
            .from(TABELA_DE_VOLUMES).update(campos).eq('id', id);
        if (erroEspelho) throw erroEspelho;

        return numero;
    }

    // ─── O volume por dentro ─────────────────────────────────────────────────
    //
    // Abrir um volume é LER: a lista do que entrou nele, na ordem em que
    // entrou, com peso, nome e hora. Não há peso a digitar aqui — ele é a soma
    // dos registros, e o volume nunca vai à balança (regra do usuário,
    // 29/08/2026).
    //
    // As duas únicas escritas desta janela são o NOME do volume, que a
    // expedição procura na etiqueta, e o TIRAR de um registro.

    function fecharVolumeAberto() {
        const caixa = document.getElementById('acab-volume-janela');
        if (caixa && caixa.parentNode) caixa.parentNode.removeChild(caixa);
    }

    function abrirVolume(volumeId) {
        const v = todosOsVolumes().find(x => String(x.id) === String(volumeId));
        if (!v) return;
        const itens = modelosDoPedidoAberto();
        const s = estado();
        const os = (s.ordens || []).find(o => String(o.id) === String(tela.pedidoAberto));
        const numeroDoPedido = os ? os.numero : tela.pedidoAberto;
        const pode = podeEditar();
        const est = estimadoDoVolume(v.registros || [], itens);

        fecharVolumeAberto();
        const caixa = document.createElement('div');
        caixa.id = 'acab-volume-janela';
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100004; display: flex;'
            + ' align-items: center; justify-content: center; background: rgba(6,7,13,0.92); padding: 18px;';

        const corpo = (v.registros || []).length
            ? (v.registros || []).map(reg => {
                const item = itens.find(x => String(x.id) === String(reg.modeloId));
                const cor = corDoModelo(item);
                return `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
                            background: ${AZUL.superficie}; border: 1px solid rgba(76,200,240,0.20);
                            border-radius: 8px; padding: 9px 12px;">
                    ${cor ? `<span style="width: 12px; height: 12px; min-width: 12px; border-radius: 50%;
                                          background: ${esc(cor)}; display: inline-block;"></span>` : ''}
                    <span style="flex: 1 1 160px; min-width: 0; font-size: 0.88rem; color: #ffffff;">${esc(nomeDoModelo(item))}</span>
                    <span style="font-size: 0.82rem; font-family: monospace; color: #cfe6fb; min-width: 80px; text-align: right;">${numeroComPonto(reg.qtd)} un</span>
                    <span style="font-size: 0.95rem; font-family: monospace; min-width: 92px; text-align: right;
                                 color: ${(reg.peso === null || reg.peso === undefined) ? '#fbbf24' : '#ffffff'};">
                        ${(reg.peso === null || reg.peso === undefined) ? 'sem peso' : esc(kgParaTexto(reg.peso)) + ' kg'}
                    </span>
                    <span style="font-size: 0.76rem; color: ${reg.responsavel ? 'var(--text-dim)' : '#fbbf24'}; min-width: 78px;">
                        ${reg.responsavel ? esc(reg.responsavel) : 'sem nome'}
                    </span>
                    <span style="font-size: 0.74rem; color: var(--text-dim); min-width: 98px;">${esc(textoDoInstante(reg.registradoEm))}</span>
                    ${pode ? `<button type="button" onclick="AcabamentoPainel.tirarDoVolume('${escJs(v.id)}', '${escJs(reg.id)}')"
                            title="Tirar este modelo do volume — ele deixa de estar revisado e o peso sai da soma"
                            style="background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.35);
                                   color: #f87171; border-radius: 6px; padding: 5px 10px; font-size: 0.74rem;
                                   font-weight: 700; cursor: pointer; font-family: inherit;">Tirar</button>` : ''}
                </div>`;
            }).join('')
            : `<div style="padding: 18px; text-align: center; color: var(--text-dim); font-size: 0.86rem;">
                   Este volume ainda está vazio. Ele recebe material quando um modelo deste setor
                   for marcado como <strong style="color: #cfe6fb;">Revisado</strong>.
               </div>`;

        caixa.innerHTML = `
            <div style="width: min(880px, 96vw); max-height: 92vh; overflow: auto; background: ${AZUL.fundo};
                        border: 1px solid rgba(76,200,240,0.28); border-radius: 12px;
                        display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 10px; padding: 14px 18px;
                            background: #120a8f; border-bottom: 1px solid rgba(76,200,240,0.24);">
                    <span style="font-size: 1.2rem;">📦</span>
                    <strong style="font-size: 1.05rem; color: #ffffff;">Volume ${esc(v.numero)}${v.nome ? ' — ' + esc(v.nome) : ''} — setor ${esc(nomeDoSetor(v.setor))}</strong>
                    <span style="font-size: 0.78rem; color: #cfe6fb;">Pedido ${esc(numeroDoPedido)} · ${(v.registros || []).length} ${(v.registros || []).length === 1 ? 'registro' : 'registros'}</span>
                    <button type="button" onclick="AcabamentoPainel.fecharVolumes()"
                            style="margin-left: auto; background: rgba(6,7,13,0.6); border: 1px solid rgba(255,255,255,0.28);
                                   color: #ffffff; border-radius: 8px; padding: 5px 12px; font-weight: 700;
                                   cursor: pointer; font-family: inherit;">✕</button>
                </div>

                <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 14px;">
                    <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
                        ${v.foto ? `<img id="acab-vol-foto-grande" src="${esc(v.foto)}" alt="Foto deste volume"
                                         onclick="AcabamentoPainel.ampliar('acab-vol-foto-grande')"
                                         title="Foto deste volume — clique para ampliar"
                                         style="width: 148px; height: 110px; object-fit: cover;
                                                cursor: zoom-in; display: block;" />` : ''}
                        <div style="flex: 1 1 280px; min-width: 240px; display: flex; flex-direction: column; gap: 8px;">
                            <span style="font-size: 2.2rem; line-height: 1; color: #ffffff; font-family: monospace; font-weight: 700;">
                                ${esc(kgParaTexto(v.peso || 0))} <span style="font-size: 1.1rem; color: #7fa9d4;">kg</span>
                            </span>
                            <span style="font-size: 0.78rem; color: var(--text-dim);">
                                ${(v.registros || []).length === 1
                                    ? 'somado do registro abaixo'
                                    : 'somados dos ' + (v.registros || []).length + ' registros abaixo'}${
                                    est.kg !== null ? ` · est. ${esc(kgParaTexto(est.kg))} kg` : ''}
                            </span>
                            <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
                                <span style="${SUBROTULO_DO_CAMPO}">Nome</span>
                                <input type="text" id="acab-vol-nome" value="${esc(v.nome || '')}" ${pode ? '' : 'disabled'}
                                       placeholder="Camarote, Staff dia 2… (opcional)"
                                       onchange="AcabamentoPainel.renomearVolume('${escJs(v.id)}', this.value)"
                                       title="O nome que a expedição vai procurar na etiqueta"
                                       style="flex: 1 1 auto; background: ${AZUL.fundo}; border: 1px solid rgba(76,200,240,0.26);
                                              border-radius: 6px; color: #ffffff; padding: 8px 10px; font-size: 0.95rem;" />
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="${ROTULO_DO_PASSO}">Modelos neste volume</span>
                            <span style="font-size: 0.74rem; color: var(--text-dim);">na ordem em que foram registrados</span>
                            ${pode ? `<button type="button" style="${ESTILO_BOTAO_VOLUME} margin-left: auto;"
                                    onclick="AcabamentoPainel.excluirVolume('${escJs(v.id)}')">Excluir o volume</button>` : ''}
                        </div>
                        ${corpo}
                    </div>

                    <div style="display: flex; align-items: center; gap: 10px; background: rgba(76,200,240,0.06);
                                border: 1px solid rgba(76,200,240,0.22); border-radius: 8px; padding: 11px 13px;">
                        <span style="font-size: 1rem;">⚖️</span>
                        <span style="font-size: 0.78rem; color: #cfe6fb; line-height: 1.5;">
                            O peso deste volume é a <strong>soma dos registros</strong> acima. Cada modelo vai à
                            balança antes de entrar aqui — o volume não tem peso próprio, e não há nada a
                            preencher nesta tela.
                        </span>
                    </div>
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

    /** "hoje 14:20", "27/08 16:40" — a hora como o operador a lê. */
    function textoDoInstante(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        const hoje = new Date();
        const mesmoDia = d.getFullYear() === hoje.getFullYear()
            && d.getMonth() === hoje.getMonth() && d.getDate() === hoje.getDate();
        if (mesmoDia) return `hoje ${hh}`;
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}`;
    }

    /** O nome do volume, gravado na hora em que o campo perde o foco. */
    async function renomearVolume(volumeId, texto) {
        if (!podeEditar()) return;
        if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
        try {
            const { error } = await supabaseClient.from(TABELA_DE_VOLUMES)
                .update({ nome: (texto || '').trim() || null }).eq('id', volumeId);
            if (error) throw error;
            await carregarVolumes(tela.volumesDoPedido);
            renderDetalhe();
        } catch (e) {
            console.error('[acabamento] erro ao renomear o volume:', e);
            avisar(`Não deu para gravar o nome: ${(e && e.message) ? e.message : e}`, 'error');
        }
    }

    /**
     * Tira um registro do volume.
     *
     * É a saída de quem registrou no volume errado — e ela tem de desfazer as
     * DUAS coisas que o registro fez: o material sai do volume (e o peso sai da
     * soma), e o modelo volta para "Em acabamento". Deixar o Pronto de pé
     * mostraria na tela um modelo concluído que não está em volume nenhum, que
     * é exatamente o estado que a regra nova existe para impedir.
     */
    async function tirarDoVolume(volumeId, registroId) {
        if (!podeEditar()) return;
        const v = todosOsVolumes().find(x => String(x.id) === String(volumeId));
        const reg = v && (v.registros || []).find(r => String(r.id) === String(registroId));
        if (!v || !reg) return;
        const item = modelosDoPedidoAberto().find(m => String(m.id) === String(reg.modeloId));

        const pergunta = `Tirar ${nomeDoModelo(item)} (${numeroComPonto(reg.qtd)} un) do volume ${v.numero}?`
            + ((reg.peso !== null && reg.peso !== undefined) ? ` O peso de ${kgParaTexto(reg.peso)} kg sai da soma.` : '')
            + (item && estagioDoModelo(item) === 'Pronto' ? ' O modelo deixa de estar revisado.' : '');
        const caixa = (typeof window !== 'undefined') ? window.caixaConfirmar : null;
        const ok = (caixa && typeof caixa.perguntar === 'function')
            ? await caixa.perguntar(pergunta, { rotulo: 'Tirar', perigo: true })
            : window.confirm(pergunta);
        if (!ok) return;

        try {
            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                throw new Error('esta tela está sem conexão com o banco');
            }
            const { error } = await supabaseClient
                .from(TABELA_DE_ITENS_DO_VOLUME).delete().eq('id', registroId);
            if (error) throw error;

            await atualizarPesoDoVolume(v, [registroId]);

            if (item && estagioDoModelo(item) === 'Pronto') {
                await gravar(item.id, tela.pedidoAberto, 'acabamento_status', '');
            }
            await carregarVolumes(tela.volumesDoPedido);
            fecharVolumeAberto();
            renderDetalhe();
            avisar(`${nomeDoModelo(item)} saiu do volume ${v.numero}.`, 'success');
            await atualizarPesoDoSetorPelosVolumes(v.setor, { saiuVolume: true });
        } catch (e) {
            console.error('[acabamento] erro ao tirar do volume:', e);
            avisar(`Não deu para tirar do volume: ${(e && e.message) ? e.message : e}`, 'error');
        }
    }

    /**
     * Reescreve `producao_volumes.peso_kg` com a soma dos registros que SOBRAM.
     *
     * "ao excluir modelos de um volume, peso do volume deve atualizar" — o
     * usuário, 29/08/2026. A tela já lia a soma dos registros, mas o espelho no
     * banco precisa acompanhar: é ele que a estação com o painel anterior lê, e
     * é ele que sobra se alguém consultar a tabela por fora.
     *
     * Recalculado do que sobrou, e não subtraído do total: num volume anterior
     * à migração o `peso` pode vir do `peso_kg` gravado em vez da soma, e aí a
     * subtração partiria do número errado.
     */
    async function atualizarPesoDoVolume(volume, idsQueSairam) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
        const fora = (idsQueSairam || []).map(String);
        const gramas = (volume.registros || [])
            .filter(r => fora.indexOf(String(r.id)) === -1)
            .reduce((soma, r) => soma + Math.round(((r.peso === null || r.peso === undefined) ? 0 : r.peso) * 1000), 0);
        const { error } = await supabaseClient.from(TABELA_DE_VOLUMES)
            .update({ peso_kg: gramas / 1000 }).eq('id', volume.id);
        if (error) throw error;
    }

    /**
     * Tira TODOS os registros de um modelo dos volumes do setor dele.
     *
     * É o que acontece quando o modelo sai de Pronto (regra do usuário,
     * 29/08/2026): "ao sair de pronto sai do volume e atualiza peso do volume".
     * Um modelo pode estar repartido em vários volumes, e todos eles precisam
     * devolver o material e encolher o peso.
     *
     * Devolve `false` quando o operador cancela — e aí quem chamou não muda o
     * estágio tampouco, senão o modelo sairia de Pronto continuando no volume.
     * Sem registro nenhum não há o que perguntar: devolve `true` na hora.
     */
    async function tirarModeloDosVolumes(item) {
        const lista = volumesDoSetor(item && item.setor);
        const meus = registrosDoModelo(lista, item && item.id);
        if (!meus.length) return true;

        const kg = meus.reduce((soma, x) => soma
            + Math.round(((x.registro.peso === null || x.registro.peso === undefined) ? 0 : x.registro.peso) * 1000), 0) / 1000;
        const quais = meus.map(x => 'V' + x.volume.numero).join(', ');
        const pergunta = `Tirar ${nomeDoModelo(item)} de Pronto?`
            + ` Ele sai ${meus.length === 1 ? 'do volume' : 'dos volumes'} ${quais}`
            + (kg > 0 ? `, e ${kgParaTexto(kg)} kg saem da soma.` : '.');
        const caixa = (typeof window !== 'undefined') ? window.caixaConfirmar : null;
        const ok = (caixa && typeof caixa.perguntar === 'function')
            ? await caixa.perguntar(pergunta, { rotulo: 'Tirar de Revisado', perigo: true })
            : window.confirm(pergunta);
        if (!ok) return false;

        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            throw new Error('esta tela está sem conexão com o banco');
        }
        const ids = meus.map(x => String(x.registro.id));
        const { error } = await supabaseClient
            .from(TABELA_DE_ITENS_DO_VOLUME).delete().in('id', ids);
        if (error) throw error;

        // Um volume por vez: o modelo pode estar repartido, e cada um tem a sua
        // soma para refazer.
        const tocados = [];
        meus.forEach(x => { if (tocados.indexOf(x.volume) === -1) tocados.push(x.volume); });
        for (const v of tocados) await atualizarPesoDoVolume(v, ids);

        await carregarVolumes(tela.volumesDoPedido);
        avisar(`${nomeDoModelo(item)} saiu ${tocados.length === 1 ? 'do volume' : 'dos volumes'} ${quais}.`, 'success');
        return true;
    }

    /** Os registros vão junto, pelo `on delete cascade` da tabela. */
    async function apagarVolume(volumeId) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            throw new Error('esta tela está sem conexão com o banco');
        }
        const { error } = await supabaseClient
            .from(TABELA_DE_VOLUMES).delete().eq('id', volumeId);
        if (error) throw error;
    }

    async function excluirVolume(volumeId) {
        const v = todosOsVolumes().find(x => String(x.id) === String(volumeId));
        if (!v) return;
        const quantos = (v.registros || []).length;
        const pergunta = `Excluir o volume ${v.numero} do setor ${nomeDoSetor(v.setor)}?`
            + (v.peso ? ` O peso de ${kgParaTexto(v.peso)} kg sai da soma.` : '')
            + (quantos ? ` Os ${quantos} ${quantos === 1 ? 'modelo volta' : 'modelos voltam'} a ficar sem volume.` : '');
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
            fecharVolumeAberto();
            renderDetalhe();
            avisar(`Volume ${v.numero} excluído.`, 'success');
            // O peso do setor acompanha a soma para BAIXO também: o volume saiu
            // da pilha, e o número que a expedição lê tem de refletir isso. O
            // que NÃO se desfaz aqui é o Pronto dos modelos que aquele volume
            // fechou — desfazer decisão de gente é do botão Tirar, um a um.
            await atualizarPesoDoSetorPelosVolumes(v.setor, { saiuVolume: true });
        } catch (e) {
            console.error('[acabamento] erro ao excluir o volume:', e);
            avisar(`Não deu para excluir o volume: ${(e && e.message) ? e.message : e}`, 'error');
        }
    }


    // ─── O que a caixa gravada provoca sozinha ──────────────────────────────

    /**
     * O peso do setor passa a ser a soma das caixas.
     *
     * Pedido do usuário em 23/08/2026: "ao adicionar os volumes, volumes
     * criados a soma de seus pesos vai atualizando o peso real do setor". Até
     * aqui a soma era um botão na lista de volumes; agora ela é o próprio peso,
     * e o botão só aparece quando os dois números divergem.
     *
     * Passa pelo `gravarPeso` de sempre — é ele que conhece os dois caminhos de
     * escrita (estação e site), a régua dos 5 % e o "Pronto" que pode estar
     * esperando. O que muda é a BASE da régua: `estimadoDoEmbalado`, o peso
     * esperado do que já está em caixa, e não o do setor inteiro. Com três das
     * cinco caixas prontas, comparar a soma delas com a tiragem inteira
     * acusaria divergência em cima de um trabalho perfeitamente certo.
     */
    async function atualizarPesoDoSetorPelosVolumes(setor, opcoes) {
        const alvo = normalizar(setor);
        if (!podeEditar() || !haComoGravarPeso()) return;

        const lista = volumesDoSetor(alvo);
        const soma = somaDosVolumes(lista);

        // Quando a soma é ZERO, "zero" pode querer dizer duas coisas opostas, e
        // confundi-las custa caro nas duas direções:
        //
        //  - setor que NUNCA teve volume: o peso é digitado à mão e pesado no
        //    fim. Gravar zero aqui apagaria o número do operador.
        //  - setor que ACABOU de perder o conteúdo — o último registro saiu, ou
        //    o último volume foi excluído: o peso do setor é zero de verdade, e
        //    deixar o número velho na tela é uma mentira. Foi o que o usuário
        //    viu no pedido 21074 em 29/08/2026: excluídos os volumes, o campo
        //    continuava marcando 104 kg de uma soma que não existia mais.
        //
        // Quem sabe a diferença é o CHAMADOR, e não esta função: o estado final
        // dos dois casos é idêntico. Por isso `saiuVolume` — quem acabou de
        // tirar alguma coisa diz que o zero é de verdade.
        const zeroEhZero = !!(opcoes && opcoes.saiuVolume) || lista.length > 0;
        if (!(soma > 0)) {
            if (!zeroEhZero) return;
            const atualVazio = tela.pesos[alvo];
            const tinha = atualVazio && atualVazio.peso !== null && atualVazio.peso !== undefined
                && Number(atualVazio.peso) > 0;
            if (tinha) {
                await gravarPeso(tela.volumesDoPedido, alvo, '');
                // O campo deixou de ser leitura e voltou a ser digitável — é
                // outro elemento na tela, e só o redesenho o troca.
                renderDetalhe();
            }
            return;
        }

        const linha = tela.pesos[alvo];
        const atual = (linha && linha.peso !== null && linha.peso !== undefined)
            ? Number(linha.peso) : null;
        if (atual !== null && Math.round(atual * 1000) === Math.round(soma * 1000)) return;

        await gravarPeso(tela.volumesDoPedido, alvo, pesoParaTexto(soma),
                         { estimado: estimadoDoEmbalado(alvo) });
        // O `gravarPeso` repinta o campo, mas não a faixa dos volumes logo
        // abaixo dele — ele evita o redesenho inteiro de propósito, para não
        // arrancar o foco de quem está digitando. Aqui não há ninguém digitando:
        // a janela da caixa acabou de fechar, e a faixa precisa mostrar que a
        // diferença zerou.
        renderDetalhe();
    }

    /**
     * Os modelos que a embalagem acabou de terminar viram PRONTO sozinhos.
     *
     * Quem decide o nome é o `responsavelPelosRegistros`: uma pessoa só assina
     * com o próprio nome, mais de uma assina com o nome do setor.
     *
     * A trava do peso continua valendo. Se o modelo for o ÚLTIMO pendente do
     * setor e o setor ainda estiver sem peso — nenhuma caixa pesada, por
     * exemplo —, ele fica de fora: o operador clica no PRONTO do card e recebe
     * o popup que pede o peso, como sempre. Fechar por baixo dessa regra
     * deixaria a expedição com um setor concluído e sem quilo nenhum.
     */
    async function fecharModelosEmbalados(setor) {
        if (!podeEditar()) return;
        const s = estado();
        const osId = tela.pedidoAberto;
        const itens = (s.osItens && s.osItens[osId]) || [];

        const feitos = [];
        for (const x of fechamentosPelosRegistros(setor, itens)) {
            if (pesoExigidoAntesDoPronto(x.item, itens)) continue;
            if (responsavelDoModelo(x.item) !== x.quem.nome) {
                await gravar(x.item.id, osId, 'acabamento_responsavel', x.quem.nome);
            }
            await gravar(x.item.id, osId, 'acabamento_status', 'Pronto');
            feitos.push(x);
        }
        if (!feitos.length) return;

        // O que o sistema faz sozinho se anuncia (regra da casa). Sem isto o
        // operador voltaria para a lista e encontraria dois cards verdes que
        // ele não marcou.
        const quais = feitos
            .map(x => `${nomeDoModelo(x.item)} (${x.quem.nome}${x.quem.varios ? ', mais de uma pessoa' : ''})`)
            .join(' · ');
        avisar(feitos.length === 1
            ? `${quais} — todo o modelo entrou em volume, marcado como PRONTO.`
            : `${feitos.length} modelos ficaram REVISADOS ao entrar nos volumes: ${quais}.`, 'success');
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
                        ${botaoDaBalanca('obrigatorio')}
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
                                       cursor: pointer;">Gravar peso e marcar REVISADO</button>
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
                    ${esc(nomeDoSetor(p.setor))}. Ao marcá-lo como <strong>REVISADO</strong> o setor fecha,
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
        if (ok) { ok.disabled = false; ok.textContent = 'Gravar peso e marcar REVISADO'; }

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
            if (ok) { ok.disabled = false; ok.textContent = 'Gravar peso e marcar REVISADO'; }
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
        const era = tela.liberacaoPendente;
        fecharPopupDaLiberacao();
        pintarPesos();

        // O volume que esperava a senha continua montado: a janela volta com o
        // que o operador já tinha digitado, em vez de o trabalho sumir e ele ter
        // de escolher os modelos de novo.
        if (era && era.tipo === 'volume') {
            mostrarRegistro();
            const erro = document.getElementById('acab-reg-erro');
            if (erro) {
                erro.textContent = 'Nada foi gravado — o peso está fora dos 5 %. '
                    + 'Confira a quantidade e o peso, ou grave com a senha de liberação.';
            }
            return;
        }
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
                    <span style="color: ${'#4cc8f0'};"> — ${p.tipo === 'volume'
                        ? `volume ${esc(p.volume.numero)} do setor ${esc(nomeDoSetor(p.setor))}`
                        : `setor ${esc(nomeDoSetor(p.setor))}`}</span>
                </div>
                ${p.tipo === 'volume' ? `
                <div style="font-size: 0.82rem; color: #7fa9d4; margin-bottom: 8px;">
                    ${p.volume.linhas.length === 1
                        ? 'A conta é a quantidade que vai neste volume vezes o peso da peça.'
                        : `A conta é a soma dos ${p.volume.linhas.length} modelos deste registro, cada um pela quantidade que vai nele.`}
                </div>` : ''}
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
            // A mesma senha vale para os dois pesos que esta tela confere: o do
            // setor e o de uma caixa (23/08/2026).
            if (pendente.tipo === 'volume') {
                await gravarRegistroConferido(pendente.volume);
                return;
            }
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
    function colunaDaFoto(item, osId, idx) {
        const foto = fotoDoModelo(item);
        // Sem foto própria, o card mostra a foto do VOLUME em que o modelo
        // está (28/08/2026). O botão continua dizendo "Fotografar", e não
        // "Refazer": este modelo ainda não tem a foto DELE, e o operador
        // precisa saber disso ao olhar o card.
        const doVolume = foto ? null : fotoDoVolumeDoModelo(item);
        const mostrada = foto || (doVolume ? doVolume.foto : '');
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
                📷 ${foto ? 'Refazer' : 'Fotografar'}
            </button>`;

        const miniatura = mostrada
            ? `<img id="${idFoto}" src="${esc(mostrada)}" alt="${doVolume ? 'Foto do volume' : 'Foto do material'}"
                    onclick="AcabamentoPainel.ampliar('${idFoto}')"
                    title="${doVolume
                        ? 'Foto do volume ' + esc(rotuloDoVolume(doVolume)) + ' — o volume em que este modelo está. Clique para ampliar'
                        : 'Foto do material — clique para ampliar'}"
                    style="height: 46px; object-fit: contain; cursor: zoom-in; display: block;" />`
            : '';

        // A frase "Nenhuma foto do material ainda." saiu em 26/08/2026, quando o
        // bloco desceu da barra de título para a faixa acima da especificação.
        //
        // Ali cabe uma linha só, e a frase disputava lugar com o próprio botão.
        // Ela também não dizia nada que o botão já não diga: sem foto ele lê
        // "📷 Fotografar"; com foto ele lê "📷 Refazer foto" e a miniatura
        // aparece ao lado. O estado está no rótulo, que é onde o operador olha.
        // A COLUNA da foto, à esquerda da amostra (pedido do usuário em
        // 29/08/2026). Até aqui a foto era uma miniatura de 46 px encostada no
        // botão, numa faixa acima da especificação: para ver o material era
        // preciso ampliar. Numa janela do tamanho da amostra, o revisor compara
        // o que o cliente aprovou com o que está na mesa lado a lado, que é o
        // trabalho dele.
        //
        // A legenda vai DENTRO da janela, sobre um vidro escuro, e não embaixo:
        // embaixo ela custava 27 px de altura por coluna, e a tela precisa de
        // espaço vertical.
        const moldura = 'width: 100%; flex: 1 1 0; min-height: ' + ALTURA_DA_JANELA + 'px;'
            + ' position: relative; border: 1px solid rgba(76,200,240,0.20);'
            + ' background: #12161f; display: flex; align-items: center;'
            + ' justify-content: center; overflow: hidden;';

        const legenda = doVolume
            ? 'Foto do volume ' + rotuloDoVolume(doVolume)
            : 'Foto do material';

        const janela = mostrada
            ? `<div style="${moldura}">
                   <img id="${idFoto}" src="${esc(mostrada)}" alt="${esc(legenda)}"
                        onclick="AcabamentoPainel.ampliar('${idFoto}')"
                        title="${esc(legenda)} — clique para ampliar"
                        style="position: absolute; inset: 0; width: 100%; height: 100%;
                               object-fit: cover; cursor: zoom-in; display: block;" />
                   <span style="${ESTILO_LEGENDA_DENTRO}">🔍 ${esc(legenda)}</span>
               </div>`
            : `<div style="${moldura} flex-direction: column; gap: 6px; color: #7fa9d4;">
                   <span style="font-size: 1.6rem;">📷</span>
                   <span style="font-size: 0.74rem;">Sem foto do material ainda</span>
               </div>`;

        return `
            <div style="${FAIXA_DA_COLUNA} justify-content: space-between; gap: 8px;">
                <span style="${SUBROTULO_DO_CAMPO}">Foto</span>
                ${botao}
            </div>
            ${janela}`;
    }

    // A legenda por dentro da janela de imagem, sobre um degradê que a separa
    // da foto sem tapar nada — desenho pedido pelo usuário em 29/08/2026.
    const ESTILO_LEGENDA_DENTRO = 'position: absolute; left: 0; right: 0; bottom: 0;'
        + ' padding: 4px 8px; font-size: 0.7rem; color: #cfe6fb; white-space: nowrap;'
        + ' overflow: hidden; text-overflow: ellipsis;'
        + ' background: linear-gradient(to top, rgba(2,6,23,0.82), rgba(2,6,23,0));';

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

    // `alvo` diz de quem é a foto: do MODELO (o registro do revisor, um card)
    // ou do VOLUME (a caixa inteira, compartilhada pelos modelos que estão
    // dentro dela). A câmera, a prévia e o encolhimento são os mesmos; o que
    // muda é para onde o endereço vai depois do upload — ver `salvarFoto`.
    const camera = {
        fluxo: null, alvo: 'modelo', itemId: null, osId: null,
        rotulo: '', blob: null, urlPrevia: '',
    };

    function montarCamera() {
        let caixa = document.getElementById('acab-camera');
        if (caixa) return caixa;

        caixa = document.createElement('div');
        caixa.id = 'acab-camera';
        // Acima da janela do volume (100005): desde 28/08/2026 a câmera também
        // é aberta de DENTRO dela, e num z-index menor ela abriria por baixo —
        // o operador clicaria em Fotografar e não veria nada acontecer.
        caixa.style.cssText = 'position: fixed; inset: 0; z-index: 100006; display: none;'
            + ' align-items: center; justify-content: center; background: rgba(2,6,23,0.94); padding: 18px;';
        caixa.innerHTML = `
            <div style="width: min(920px, 96vw); background: ${AZUL.fundo}; border: 1px solid rgba(76,200,240,0.24);
                        border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <strong id="acab-camera-titulo" style="font-size: 1.05rem; color: #ffffff;">📷 Foto do material</strong>
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

    /** A câmera do card do modelo: a foto é o registro do que o revisor viu. */
    async function abrirCamera(itemId, osId) {
        if (!podeEditar()) return;
        const s = estado();
        const item = ((s.osItens && s.osItens[osId]) || []).find(i => String(i.id) === String(itemId));
        camera.alvo = 'modelo';
        camera.itemId = itemId;
        camera.osId = osId;
        return ligarCamera('📷 Foto do material',
                           item ? (item.produto || item.nome_modelo || '') : '');
    }

    /**
     * A câmera da JANELA DO REGISTRO: uma foto para o volume inteiro.
     *
     * Ela não grava nada sozinha. O "Salvar foto" põe o arquivo no Storage e o
     * endereço em `tela.registroEmCurso.fotoUrl`; quem escreve no banco continua
     * sendo o "Gravar e marcar Pronto", como todo o resto da janela.
     */
    async function abrirCameraDoVolume() {
        if (!podeEditar()) return;
        const r = tela.registroEmCurso;
        if (!r) return;
        const atual = volumesDoSetor(r.setor).find(v => String(v.id) === String(r.volumeId));
        camera.alvo = 'volume';
        camera.itemId = null;
        camera.osId = null;
        return ligarCamera('📷 Foto do volume',
                           `Volume ${atual ? atual.numero : r.numeroDoNovo} — setor ${nomeDoSetor(r.setor)}`);
    }

    async function ligarCamera(titulo, subtitulo) {
        camera.blob = null;
        camera.titulo = titulo || '📷 Foto';
        camera.rotulo = subtitulo || '';

        const caixa = montarCamera();
        caixa.style.display = 'flex';
        estadoDaCamera('');

        const cabecalho = document.getElementById('acab-camera-titulo');
        if (cabecalho) cabecalho.textContent = titulo;
        const rotulo = document.getElementById('acab-camera-modelo');
        if (rotulo) rotulo.textContent = camera.rotulo;

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
        camera.alvo = 'modelo';
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

    /** Religa a câmera SEM trocar de alvo: repetir a foto da caixa é da caixa. */
    function repetirFoto() {
        const previa = document.getElementById('acab-camera-previa');
        if (previa) previa.style.display = 'none';
        camera.blob = null;
        estadoDaCamera('');
        ligarCamera(camera.titulo, camera.rotulo);
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

    /**
     * Põe o JPEG no Storage e devolve o endereço público.
     *
     * Nome novo a cada foto: o anterior fica no bucket. Sobrescrever seria mais
     * limpo e mais arriscado — duas estações no mesmo pedido apagariam a foto
     * uma da outra.
     */
    async function subirFoto(nome, blob) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
            throw new Error('sem conexão com o banco');
        }
        const caminho = `${PASTA_DA_FOTO}/${nome}_${Date.now()}.jpg`;
        const { error: erroUpload } = await supabaseClient.storage
            .from(BUCKET_DA_FOTO)
            .upload(caminho, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
        if (erroUpload) throw erroUpload;

        const { data } = supabaseClient.storage.from(BUCKET_DA_FOTO).getPublicUrl(caminho);
        const url = data && data.publicUrl;
        if (!url) throw new Error('o Storage não devolveu o endereço da foto');
        return url;
    }

    /**
     * O "Salvar foto" quando a câmera foi aberta pela JANELA DO REGISTRO.
     *
     * A foto vai para o Storage agora e para o BANCO só no "Gravar e marcar
     * Pronto" — a janela inteira funciona assim, e um caminho de escrita à
     * parte faria a foto sobreviver a um Cancelar que desfaz todo o resto.
     */
    async function salvarFotoDoVolume() {
        const r = tela.registroEmCurso;
        if (!r) { fecharCamera(); return; }

        estadoDaCamera('Enviando…');
        mostrarBotoesDaCamera([]);
        try {
            const atual = volumesDoSetor(r.setor).find(v => String(v.id) === String(r.volumeId));
            const url = await subirFoto(
                `volume_${r.numeroDoPedido}_${normalizar(r.setor)}_${atual ? atual.numero : r.numeroDoNovo}`,
                camera.blob);
            r.fotoUrl = url;
            pintarFotoDoVolume();
            fecharCamera();
            avisar('Foto do volume guardada. Ela é gravada junto com o registro.', 'success');
        } catch (e) {
            console.error('[acabamento] falha ao guardar a foto do volume:', e);
            estadoDaCamera('');
            mostrarBotoesDaCamera(['repetir', 'salvar']);
            recadoDaCamera('Não deu para guardar a foto: ' + esc(e && e.message ? e.message : String(e))
                + '<br>A foto continua aqui — tente Salvar de novo.');
        }
    }

    async function salvarFoto() {
        if (!camera.blob) return;
        if (camera.alvo === 'volume') return salvarFotoDoVolume();
        if (!camera.itemId) return;
        const itemId = camera.itemId;
        const osId = camera.osId;

        estadoDaCamera('Enviando…');
        mostrarBotoesDaCamera([]);

        try {
            const buscar = fn('findOSInState');
            const os = buscar ? buscar(osId) : null;
            const pedido = os ? os.numero : 'sem-pedido';
            const url = await subirFoto(`${pedido}_${itemId}`, camera.blob);

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
            // Acima de TODAS as janelas desta tela (a maior é a do volume, em
            // 100006 com a câmera): a miniatura da foto da caixa é clicável de
            // dentro delas, e em 100000 a ampliação abria por baixo.
            overlay.style.cssText = 'position: fixed; inset: 0; z-index: 100010; display: none;'
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

        /**
         * "Expedição" é liga/desliga, igual ao botão Impresso da Produção
         * (28/08/2026): o segundo clique no botão aceso volta ao filtro que
         * estava ativo antes dele. Os outros três são escolha simples.
         */
        setFiltroPrazo(valor) {
            const novo = ['hoje', 'atrasados', 'expedicao'].includes(valor) ? valor : 'geral';
            if (novo === 'expedicao' && tela.prazo === 'expedicao') {
                tela.prazo = tela.prazoAnterior || 'geral';
            } else {
                if (novo === 'expedicao') tela.prazoAnterior = tela.prazo || 'geral';
                tela.prazo = novo;
            }
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

        /**
         * Os setores DENTRO do pedido aberto. Somam, como os cards da fila:
         * clicar num setor aceso o tira; `setSetorDoPedido('')` limpa tudo e
         * devolve o pedido inteiro.
         */
        setSetorDoPedido(valor) {
            if (!valor) {
                tela.setoresNoPedido = [];
            } else {
                const i = tela.setoresNoPedido.indexOf(valor);
                if (i === -1) tela.setoresNoPedido.push(valor);
                else tela.setoresNoPedido.splice(i, 1);
            }
            // A escolha de modelos para volume é do recorte anterior: um modelo
            // marcado que sumiu da tela continuaria contando na barra da escolha
            // sem ninguém poder desmarcá-lo.
            tela.marcados = {};
            renderDetalhe();
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
            tela.marcados = {};
            tela.setoresNoPedido = [];
            fecharPopupDaLiberacao();
            fecharPopupDoPeso();
            fecharRegistro();
            fecharVolumeAberto();
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
            fecharRegistro();
            fecharVolumeAberto();
            tela.marcados = {};
            tela.setoresNoPedido = [];
            tela.pedidoAberto = null;
            mostrarLista();
            render();
        },

        async mudarEstagio(itemId, osId, valor) {
            // Aqui, e não só nos botões: botão cinza não impede ninguém de
            // chamar a função pelo console, e esta é a única porta por onde o
            // status do acabamento é gravado.
            if (!responsavelPorId(itemId, osId)) {
                const aviso = fn('toast');
                if (aviso) {
                    aviso('Escolha primeiro o responsável deste modelo — o status só muda com um nome.', 'warning');
                }
                return false;
            }

            // SAIR do Pronto tira o modelo do volume (regra do usuário,
            // 29/08/2026): "ao sair de pronto sai do volume e atualiza peso do
            // volume". As duas coisas andam juntas — deixar o material no
            // volume com o modelo em acabamento faria a carga contar peso de
            // material que voltou para a mesa.
            //
            // E o estágio só muda se a saída do volume acontecer: cancelar a
            // pergunta cancela o clique inteiro, senão o modelo sairia de Pronto
            // continuando dentro do volume.
            if (String(valor).toLowerCase() !== 'pronto') {
                const s0 = estado();
                const itens0 = (s0.osItens && s0.osItens[osId]) || [];
                const item0 = itens0.find(i => String(i.id) === String(itemId));
                if (item0 && estagioDoModelo(item0) === 'Pronto') {
                    try {
                        if (!await tirarModeloDosVolumes(item0)) return false;
                    } catch (e) {
                        console.error('[acabamento] erro ao tirar o modelo do volume:', e);
                        avisar(`Não deu para tirar do volume: ${(e && e.message) ? e.message : e}`, 'error');
                        return false;
                    }
                    await atualizarPesoDoSetorPelosVolumes(item0.setor, { saiuVolume: true });
                }
            }

            // O VOLUME antes do Pronto (regra do usuário, 29/08/2026): num
            // pedido que usa volumes, marcar Pronto abre a janela do registro
            // em vez de gravar. Quem grava o status é o
            // `fecharModelosEmbalados`, depois de o material entrar no volume —
            // e ele só fecha o modelo cuja última leva entrou, que é o que
            // impede um modelo pela metade de ficar verde na lista.
            //
            // Só quando há o que registrar: modelo já inteiro em volume cai no
            // caminho de sempre, senão reclicar num Pronto aceso abriria uma
            // janela sem nenhuma linha dentro.
            if (String(valor).toLowerCase() === 'pronto' && pedidoTemVolumes()) {
                const s = estado();
                const itens = (s.osItens && s.osItens[osId]) || [];
                const item = itens.find(i => String(i.id) === String(itemId));
                if (item && abrirRegistro([item])) return false;
            }

            // O PESO antes do último Pronto do setor (regra do usuário,
            // 23/08/2026), que continua valendo no pedido SEM volume — é o
            // "pesado ao final" da regra de 29/08. Com volumes, o peso do setor
            // é a soma dos registros e não há o que cobrar aqui.
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
                    return false;
                }
            }

            return gravar(itemId, osId, 'acabamento_status', valor);
        },

        mudarPeso(numeroDoPedido, setor, valor) {
            return gravarPeso(numeroDoPedido, setor, valor);
        },

        // A balança da estação (24/08/2026).
        lerBalanca,
        procurarBalanca,
        usarPortaDaBalanca,
        fecharBalanca,

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

        // ── Os volumes (29/08/2026) ──────────────────────────────────────
        /** "+ Volume" / "Dividir em volumes": cria um volume vazio no setor. */
        novoVolume(setor, numeroDoPedido) { return criarVolumeVazio(setor, numeroDoPedido); },
        /** A caixa de marcar no card do modelo, para registrar em grupo. */
        marcarModelo(itemId) { alternarModeloNaEscolha(itemId); },
        /** "Desmarcar" da barra. */
        cancelarVolume() { limparEscolha(); },
        /** "Registrar num volume": abre o registro com os modelos marcados. */
        registrarEmGrupo() { return abrirRegistro(modelosMarcados()); },
        /** O OK da janela do registro. Só ele grava. */
        confirmarRegistro,
        /** Cada tecla nos campos da janela: refaz as parcelas e o esperado. */
        recalcularRegistro: pintarResumoDoRegistro,
        removerLinhaDoRegistro,
        /** "Pesar um a um" / "Voltar a uma pesagem só". */
        pesarPorModelo: alternarPesagemPorModelo,
        /** O chip de volume da janela do registro. `''` escolhe o volume novo. */
        escolherVolume,
        /**
         * "Fotografar" da janela do registro (28/08/2026): UMA foto para o
         * volume inteiro, compartilhada pelos modelos que estão dentro dele.
         */
        fotografarVolume: abrirCameraDoVolume,
        fecharRegistro,
        excluirVolume,
        /** Abre um volume para ler o que entrou nele. */
        abrirVolume,
        fecharVolumes: fecharVolumeAberto,
        renomearVolume,
        tirarDoVolume,

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
            fecharRegistro();
            fecharVolumeAberto();
            tela.marcados = {};
            tela.setoresNoPedido = [];
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
            ehExpedido,
            jaPassouDaGrafica,
            pedidosDoPainel,
            setoresDoPedido,
            // O recorte por setor (27/08/2026)
            setorDoModelo,
            modelosDoRecorte,
            rotuloDoRecorte,
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
            rotuloDoEstagio,
            emAcabamentoAgora,
            modelosVisiveisDoPedido,
            estagioDerivadoDaImpressao,
            faltamEstagiosNaLista,
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
            ordenarProntosNoFim,
            gramasPorUnidadeDaLinha,
            gramasPorUnidadeDoModelo,
            estimadoDoVolume,
            qtdDoTexto,
            marcavelNaEscolha,
            marcadoNaEscolha,
            setorDaEscolha,
            // Os registros dentro do volume (29/08/2026)
            rotuloDoVolume,
            registrosDoModelo,
            responsavelPelosRegistros,
            fechamentosPelosRegistros,
            estimadoDoEmbalado,
            livreParaRegistro,
            pesoDosRegistros,
            repartirPeso,
            pedidoTemVolumes,
            TABELA_DE_VOLUMES,
            TABELA_DE_ITENS_DO_VOLUME,
            responsavelDoModelo,
            fotoDoModelo,
            fotoDoVolumeDoModelo,
            // A câmera não é regra pura, e está aqui por um motivo: sem uma
            // costura, o caminho do "Salvar foto" da caixa só seria medido com
            // uma webcam de verdade na frente da máquina. `camera` deixa o
            // teste pôr um JPEG na mão dela; `subirFoto` e `salvarFoto` fazem o
            // resto do percurso, do Storage até `volumeEmEdicao.fotoUrl`.
            camera,
            subirFoto,
            salvarFoto,
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

    // A SENHA DA GERENCIA E' UMA SO' NO PRODUTO.
    //
    // Ela nasceu aqui, para liberar peso fora dos 5 %. Desde 29/08/2026 a tela
    // do Pedido tambem a pede, para destravar os campos da linha do modelo — e
    // pede a MESMA senha, conferida no MESMO lugar (o servidor; a senha nunca
    // esta no navegador). Exportada em vez de copiada de proposito: duas
    // conferencias seriam duas politicas, e a que ficasse para tras viraria a
    // porta destrancada.
    window.conferirSenhaDeLiberacao = conferirSenhaDeLiberacao;

    // ─── Embrulhos: nada do que já existe é reescrito ────────────────────────

    (function embrulharRenderOrdens() {
        const original = window.renderOrdens;
        if (typeof original !== 'function') return;
        window.renderOrdens = function () {
            const r = original.apply(this, arguments);
            try {
                // A lista de pedidos acabou de ser trocada: se ela cresceu, o
                // estágio dos que chegaram ainda não foi lido.
                completarEstagiosDaLista();
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
            } else {
                // Saiu do Acabamento com uma escolha em curso: a barra é fixa
                // contra a JANELA, e continuaria boiando por cima da tela de
                // Formatos. Ela é daqui, e sai daqui.
                try { pintarBarraDaEscolha([]); } catch (e) {
                    console.warn('[acabamento] falha ao tirar a barra da escolha:', e);
                }
            }
            return r;
        };
    })();

    document.addEventListener('DOMContentLoaded', () => {
        try { pintarBotoesPrazo(); pintarCabecalhos(); } catch (e) {}
    });
})();
