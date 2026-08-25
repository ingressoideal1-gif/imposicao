/**
 * A fonte que a tela desenha — uma implementacao so, para as tres telas.
 * ---------------------------------------------------------------------------
 *
 * Desenhar texto em canvas depende de duas coisas que nada avisa quando faltam:
 *
 *   1. `ctx.font` precisa receber um SHORTHAND CSS valido. Se a string for
 *      invalida, o navegador IGNORA a atribuicao em silencio — nao lanca erro,
 *      nao avisa no console — e continua desenhando com a fonte anterior, no
 *      corpo anterior. O nome que o catalogo guarda ("system:Arial|bold") nao e
 *      um shorthand: precisa virar `bold 12px "Arial", sans-serif`. Quem faz
 *      essa traducao e `buildCanvasFont`.
 *
 *   2. O arquivo da fonte precisa ter CHEGADO antes do traco. Canvas e raster:
 *      se a fonte ainda esta baixando, o navegador desenha com uma generica e
 *      NAO redesenha quando ela chega — diferente de texto em HTML, que reflui
 *      sozinho. Por isso `garantirFontesCarregadas` e aguardada antes de pintar.
 *
 * ── Por que este arquivo existe ────────────────────────────────────────────
 *
 * O `cliente.html` — o link que o cliente abre para aprovar a arte — nunca
 * carregou o `script.js`. Ele tinha uma copia sua de `getFontCSS`, mas nao de
 * `buildCanvasFont`, e todas as chamadas de desenho ficaram escritas como
 * `typeof buildCanvasFont === 'function' ? buildCanvasFont(...) : fs + 'px ' + font_name`.
 * No link do cliente o `typeof` sempre dava `undefined`, entao valia o ramo de
 * emergencia — e ele produz exatamente as strings invalidas do item 1.
 *
 * Medicao no banco de producao em 13/08/2026, sobre as 59 numeracoes salvas:
 * 57 elementos usam nomes `system:...` (`system:Arial`, `system:Impact`,
 * `system:Arial|bold`, `system:Comic Sans MS|bold`), que viram shorthand
 * invalido e fazem o `ctx.font` ser ignorado; 18 usam apelidos do PDF (`helv`,
 * `times`, `comic`) que so viram familia de verdade passando por `getFontCSS`;
 * e 15 usam fontes do catalogo web (`gotham book`, `Lobster`, `Cabin`), que
 * ainda precisam do `@font-face` do item 2 para existir na maquina do cliente.
 *
 * Alem disso, o `@font-face` do catalogo era injetado so pelo `loadCatalogoFontes`
 * do `script.js`. Na pagina do cliente ele nunca rodava, entao as fontes da
 * grafica simplesmente nao existiam naquele navegador.
 *
 * Este arquivo e a copia unica das quatro pecas. Ele nao depende de nada do
 * projeto e roda tambem no Node (o harness dos testes o carrega direto), por
 * isso todo acesso a `document`/`fetch` e protegido.
 */
(function (escopo) {
    'use strict';

    // ── 1. Nome do catalogo → familia CSS ──────────────────────────────────
    //
    // Os nomes curtos (`helv`, `times`, `cour`) sao os das fontes base do PDF e
    // precisam casar com o que o engine.py usa, senao a tela promete uma coisa
    // e o papel entrega outra.
    function getFontCSS(font_name) {
        if (!font_name || font_name === 'helv') return 'Arial, Helvetica, sans-serif';
        if (font_name === 'helv-bold') return 'bold Arial, Helvetica, sans-serif';
        if (font_name === 'times') return '"Times New Roman", Times, serif';
        if (font_name === 'times-bold') return 'bold "Times New Roman", Times, serif';
        if (font_name === 'cour') return '"Courier New", Courier, monospace';
        if (font_name === 'cour-bold') return 'bold "Courier New", Courier, monospace';
        // Fonte do sistema: "system:Arial|bold|italic" → bold "Arial", sans-serif
        if (font_name.startsWith('system:')) {
            const parts = font_name.slice(7).split('|'); // "NomeFamilia|bold|italic"
            const family = parts[0];
            const bold = parts.includes('bold') ? 'bold ' : '';
            const italic = parts.includes('italic') ? 'italic ' : '';
            return `${italic}${bold}"${family}", sans-serif`;
        }
        return `"${font_name}", sans-serif`;
    }

    // ── 2. Familia CSS → shorthand do canvas ───────────────────────────────
    //
    // O canvas exige a ordem `[style] [weight] size family`. O `getFontCSS`
    // devolve o peso e o estilo colados na frente da familia ("bold Arial..."),
    // que e valido em `font-family` mas NAO como shorthand — por isso a
    // reorganizacao abaixo, e nao uma concatenacao direta.
    function buildCanvasFont(fontSizePx, fontName) {
        const css = getFontCSS(fontName);
        let weight = '';
        let style = '';
        let family = css;
        if (family.startsWith('italic ')) { style = 'italic '; family = family.slice(7); }
        if (family.startsWith('bold '))   { weight = 'bold '; family = family.slice(5); }
        return `${style}${weight}${fontSizePx}px ${family}`;
    }

    // ── 3. O catalogo web e as regras @font-face ───────────────────────────

    let _catalogo = [];
    let _promessaCatalogo = null;

    function catalogoFontes() {
        return _catalogo;
    }

    // Monta o texto das regras @font-face. Separado da injecao no documento
    // para poder ser conferido pelos testes fora do navegador.
    function cssDoCatalogo(lista, servidoPeloAgente) {
        // Cadeia de origens, na ordem em que o navegador tenta:
        //   1. local()  — fonte ja instalada no Windows: instantanea e offline.
        //                 E por isso que a tela funcionava em maquinas com as
        //                 fontes instaladas e falhava nas da grafica.
        //   2. agente   — so quando a pagina e servida pelo proprio agente
        //                 (porta 9000): ele entrega do cache em disco, entao
        //                 a tela nao depende de alcancar o Supabase a cada
        //                 carregamento. Na nuvem seria mixed content e o
        //                 navegador bloquearia, por isso o condicional.
        //   3. Supabase — origem de verdade, usada na primeira vez. E a unica
        //                 que existe no navegador do cliente, que nao tem as
        //                 fontes da grafica instaladas nem fala com o agente.
        const escapaAspas = (s) => String(s).replace(/'/g, "\\'");

        let cssText = '';
        for (const f of (lista || [])) {
            if (f.arquivo_url && f.font_family) {
                const origens = [`local('${escapaAspas(f.font_family)}')`];
                if (f.nome && f.nome !== f.font_family) {
                    origens.push(`local('${escapaAspas(f.nome)}')`);
                }
                if (servidoPeloAgente && f.arquivo_url.startsWith('http')) {
                    origens.push(`url('/api/fonte?url=${encodeURIComponent(f.arquivo_url)}')`);
                }
                origens.push(`url('${f.arquivo_url}')`);

                cssText += `
                @font-face {
                    font-family: '${escapaAspas(f.font_family)}';
                    src: ${origens.join(', ')};
                    font-display: swap;
                }\n`;
            }
        }
        return cssText;
    }

    function injetarFontFaceDoCatalogo(lista) {
        const servidoPeloAgente = typeof window !== 'undefined'
            && window.location && window.location.port === '9000';
        const cssText = cssDoCatalogo(lista, servidoPeloAgente);
        if (typeof document === 'undefined') return cssText;

        let styleEl = document.getElementById('catalogo-fontes-css');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'catalogo-fontes-css';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = cssText;
        return cssText;
    }

    // Usado por quem ja buscou o catalogo por conta propria (o painel interno,
    // que precisa da lista tambem para a tabela de Fontes e para o seletor do
    // editor). Evita uma segunda ida a rede pelo mesmo JSON.
    function definirCatalogoFontes(lista) {
        _catalogo = lista || [];
        injetarFontFaceDoCatalogo(_catalogo);
        _promessaCatalogo = Promise.resolve(_catalogo);
        return _catalogo;
    }

    // Busca o catalogo e injeta o @font-face. Memorizada: chamar varias vezes
    // custa uma requisicao so.
    function carregarCatalogoFontesWeb() {
        if (_promessaCatalogo) return _promessaCatalogo;
        _promessaCatalogo = (async () => {
            try {
                // `lerCatalogoDeFontes` (supabase-config.js) escolhe entre o
                // disco do agente e a tabela, conforme quem serviu a página.
                _catalogo = await lerCatalogoDeFontes();
                injetarFontFaceDoCatalogo(_catalogo);
                console.log(`[Fonts] Catalogo de fontes web carregado: ${_catalogo.length} fonte(s)`);
            } catch (e) {
                // Sem catalogo o desenho continua — as fontes do sistema ainda
                // funcionam. Travar a tela de aprovacao por causa disso seria pior.
                console.warn('[Fonts] Nao foi possivel carregar o catalogo de fontes web:', e && e.message);
            }
            return _catalogo;
        })();
        return _promessaCatalogo;
    }

    // ── 4. Esperar a fonte chegar antes de desenhar ────────────────────────

    // Uma fonte pode estar em tres estados, e a diferenca entre os dois
    // primeiros e o defeito que este mapa existe para impedir:
    //
    //   • EM VOO   -- alguem ja pediu, o arquivo ainda esta vindo. Fica em
    //                 `_emVoo`, guardando a MESMA promessa para todo mundo.
    //   • PRONTA   -- chegou (ou falhou de vez). Entra em `_prontas`.
    //   • ausente  -- ninguem pediu ainda.
    //
    // Ate 24/08/2026 havia um conjunto so, marcado ANTES da espera. O segundo
    // desenho a pedir a mesma fonte via o nome marcado, achava que estava
    // pronta e pintava na hora -- com uma generica, porque o arquivo ainda
    // estava vindo. Canvas nao reflui: ficava assim. Foi o que apareceu no
    // pedido 21118, cujos tres modelos usam 'Bebas Neue': o link do cliente
    // monta os cards num `forEach` que nao espera um terminar para comecar o
    // proximo, entao dois deles saiam com a fonte errada ate o cliente folhear
    // as paginas -- qualquer redesenho depois da chegada sai certo, inclusive
    // voltando para a pagina 1.
    const _emVoo = new Map();
    const _prontas = new Set();

    function fonteJaCarregada(nome) {
        return _prontas.has(String(nome || '').trim());
    }

    // Devolve os nomes que ESTA chamada teve de esperar -- inclusive os que
    // outro desenho ja tinha posto no ar. Quem desenhou antes da hora usa isso
    // para saber que vale a pena repetir o traco; repetir sem novidade seria
    // redesenhar a tela inteira a toa.
    async function garantirFontesCarregadas(nomes) {
        if (!nomes || !nomes.length) return [];
        // O @font-face precisa estar no documento ANTES do `document.fonts.load`:
        // sem a regra, o navegador nao tem o que baixar e resolve na hora,
        // dizendo que carregou uma fonte que nunca existiu.
        await carregarCatalogoFontesWeb();
        if (typeof document === 'undefined' || !document.fonts) return [];

        const novas = [];
        const pendentes = [];
        for (const bruto of nomes) {
            const nome = String(bruto || '').trim();
            if (!nome || _prontas.has(nome)) continue;
            novas.push(nome);
            let promessa = _emVoo.get(nome);
            if (!promessa) {
                // A string precisa ser um shorthand de font valido, senao load() rejeita
                const spec = buildCanvasFont(16, nome);
                promessa = Promise.resolve()
                    .then(() => document.fonts.load(spec))
                    // Fonte que nao existe entra em `_prontas` do mesmo jeito: sem
                    // isso, todo redesenho tentaria de novo e o `drawPreview` do
                    // painel entraria em laco.
                    .catch(e => console.warn(`[Fonts] nao carregou ${nome}:`, e && e.message))
                    .then(() => { _prontas.add(nome); _emVoo.delete(nome); });
                _emVoo.set(nome, promessa);
            }
            pendentes.push(promessa);
        }
        if (pendentes.length) await Promise.all(pendentes);

        // ── E, na mesma espera, QUAIS CARACTERES essa fonte tem ──
        //
        // Ter a fonte no ar nao basta: o navegador desenha o caractere que ela
        // NAO tem emprestando o traco de outra, calado, e a previa passa a
        // mentir sobre o papel. Quem sabe a diferenca e o `fonte-glifos.js`, e
        // ele precisa da resposta ANTES do primeiro traco -- por isso aqui, na
        // funcao que todo mundo ja espera antes de pintar.
        //
        // Fora do laco acima de proposito: uma fonte ja em `_prontas` nao passa
        // por ele, e a cobertura dela nunca seria pedida. `garantirCoberturas`
        // tem cache proprio, entao repetir a pergunta nao custa rede.
        //
        // Opcional: pagina que ainda nao carrega o `fonte-glifos.js` continua
        // desenhando como antes, em vez de quebrar.
        let novasCoberturas = [];
        if (typeof escopo.garantirCoberturas === 'function') {
            try {
                novasCoberturas = await escopo.garantirCoberturas(nomes, { catalogo: _catalogo }) || [];
            } catch (e) {
                console.warn('[Fonts] nao deu para ler a cobertura de glifos:', e && e.message);
            }
        }
        for (const n of novasCoberturas) if (novas.indexOf(n) < 0) novas.push(n);

        return novas;
    }

    // Extrai os nomes de fonte de uma lista de elementos de numeracao.
    function fontesDosElementos(elementos) {
        const nomes = new Set();
        for (const el of (elementos || [])) {
            const n = el && (el.font_name || el.font_family);
            if (n) nomes.add(n);
        }
        return [...nomes];
    }

    escopo.getFontCSS = getFontCSS;
    escopo.buildCanvasFont = buildCanvasFont;
    escopo.catalogoFontes = catalogoFontes;
    escopo.cssDoCatalogo = cssDoCatalogo;
    escopo.injetarFontFaceDoCatalogo = injetarFontFaceDoCatalogo;
    escopo.definirCatalogoFontes = definirCatalogoFontes;
    escopo.carregarCatalogoFontesWeb = carregarCatalogoFontesWeb;
    escopo.garantirFontesCarregadas = garantirFontesCarregadas;
    escopo.fonteJaCarregada = fonteJaCarregada;
    escopo.fontesDosElementos = fontesDosElementos;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getFontCSS: getFontCSS,
            buildCanvasFont: buildCanvasFont,
            cssDoCatalogo: cssDoCatalogo,
            injetarFontFaceDoCatalogo: injetarFontFaceDoCatalogo,
            definirCatalogoFontes: definirCatalogoFontes,
            carregarCatalogoFontesWeb: carregarCatalogoFontesWeb,
            garantirFontesCarregadas: garantirFontesCarregadas,
            fonteJaCarregada: fonteJaCarregada,
            fontesDosElementos: fontesDosElementos,
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
