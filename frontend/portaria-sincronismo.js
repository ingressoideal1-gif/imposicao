/**
 * O sincronismo de cinco minutos do portao.
 *
 * O aparelho baixa o evento INTEIRO uma vez -- com a lista de ingressos, que e
 * a parte pesada -- e depois, de cinco em cinco minutos, busca so o que muda:
 * o evento continua ativo, que setores o dono bloqueou, que faixas de numeros
 * suspendeu, quem entrou por qualquer outro portao, e os totais do contador.
 * Em 4G de portao, e a diferenca entre alguns kB e varias paginas.
 *
 * Por isso `aplicar` MESCLA e nunca substitui. E a regra inteira deste arquivo:
 *
 *   - substituir a CARGA pelo que veio apagaria as credenciais, e o portao
 *     passaria a recusar todo mundo como "desconhecido";
 *   - substituir o EVENTO levaria embora o sal, sem o qual nao se calcula hash
 *     nenhum;
 *   - substituir um SETOR levaria embora o nome e a quantidade contratada, que
 *     e o denominador do contador.
 *
 * A excecao e a lista de faixas bloqueadas, que a rota manda inteira: e assim
 * que uma faixa DESBLOQUEADA pelo dono some. Mesclar faixa a faixa deixaria o
 * lote suspenso para sempre.
 *
 * A outra excecao e o zeramento. Quando o dono recomeca a contagem de um evento
 * de teste, a rota manda `entradas_zeradas_em`; se essa marca for mais nova que
 * a guardada, o aparelho esvazia as entradas e os totais ANTES de mesclar --
 * so as entradas e os totais, nunca as credenciais. E a unica coisa aqui que
 * tira em vez de acrescentar, e o resto do arquivo continua valendo.
 *
 * PURO de proposito, como o portaria-validacao.js: nada de rede, DOM ou
 * IndexedDB aqui. Quem vai ao servidor entra por injecao em `ligar`, e quem
 * grava e o chamador -- e por isso os testes rodam em milissegundos em vez de
 * cinco minutos.
 */
(function () {
    'use strict';

    /** Cinco minutos. Ver a secao 5 do desenho da tela de leitura. */
    var INTERVALO_MS = 300000;

    function copiaRasa(o) {
        var novo = {};
        Object.keys(o || {}).forEach(function (k) { novo[k] = o[k]; });
        return novo;
    }

    /** `b` por cima de `a`, sem mexer em nenhum dos dois. */
    function mesclar(a, b) {
        var novo = copiaRasa(a);
        Object.keys(b || {}).forEach(function (k) { novo[k] = b[k]; });
        return novo;
    }

    function mesclarSetores(atuais, chegando) {
        var porId = {};
        (chegando || []).forEach(function (s) { if (s && s.id) porId[s.id] = s; });
        return (atuais || []).map(function (s) {
            return porId[s.id] ? mesclar(s, porId[s.id]) : s;
        });
        // Setor que o aparelho nao conhece fica de fora de proposito: a rota
        // leve nao traz nome nem quantidade contratada, e acrescenta-lo poria
        // um setor sem nome na tela e um denominador vazio no contador. Setor
        // novo chega na carga inteira, com as credenciais dele junto.
    }

    /**
     * Quem entrou primeiro entrou primeiro.
     *
     * As duas pontas erram: o relogio do servidor nao pode reescrever um
     * horario que ESTE aparelho registrou antes, e o horario deste aparelho nao
     * pode esconder que a pessoa ja tinha entrado no outro portao. Fica o mais
     * antigo dos dois, que e a hora que o porteiro le em voz alta ao recusar.
     */
    function mesclarEntradas(atuais, chegando) {
        var mapa = copiaRasa(atuais);
        (chegando || []).forEach(function (e) {
            if (!e || !e.credencial_id || !e.momento) return;
            var local = mapa[e.credencial_id];
            if (!local || maisAntigo(e.momento, local)) mapa[e.credencial_id] = e.momento;
        });
        return mapa;
    }

    /** `a` aconteceu antes de `b`? */
    function maisAntigo(a, b) {
        var ta = Date.parse(a), tb = Date.parse(b);
        // Comparacao de texto so quando a data nao se deixa ler -- ela acerta
        // com ISO no mesmo formato e erra com fusos diferentes ("Z" e "+00:00").
        if (isNaN(ta) || isNaN(tb)) return String(a) < String(b);
        return ta < tb;
    }

    /**
     * O dono zerou as entradas no painel depois da marca que o aparelho guarda?
     *
     * Sem marca guardada, qualquer marca do servidor e novidade -- e o primeiro
     * zeramento da vida do evento.
     */
    function precisaEsquecer(base, novidade) {
        if (!novidade.entradas_zeradas_em) return false;
        if (!base.entradas_zeradas_em) return true;
        return maisAntigo(base.entradas_zeradas_em, novidade.entradas_zeradas_em);
    }

    /**
     * A carga nova. Nao mexe na que recebeu: ela e a que esta guardada no
     * IndexedDB do celular, e suja-la deixaria o aparelho com um estado que
     * ninguem gravou.
     */
    function aplicar(carga, novidade) {
        var base = carga || {};
        var nova = copiaRasa(base);
        novidade = novidade || {};

        // Esquecer vem ANTES de mesclar, e e a unica coisa neste arquivo que
        // TIRA em vez de acrescentar.
        //
        // Apagar as entradas no servidor nao zera nada no portao: cada aparelho
        // ja tem as entradas baixadas e o sincronismo so acrescenta. Sem
        // comparar a marca, o contador continuaria mostrando o publico do teste
        // e a regra `ja_entrou` continuaria barrando quem entrou nele.
        //
        // Compara-la e o que impede o remedio de virar doenca: a MESMA marca
        // chega em todo sincronismo, e esvaziar por ela de novo apagaria as
        // entradas dos cinco minutos anteriores -- o contador nunca sairia do
        // zero, e a noite inteira passaria despercebida.
        //
        // As credenciais NAO saem junto: zerar e sobre a contagem, os ingressos
        // continuam valendo, e leva-las embora faria o portao recusar todo
        // mundo como "desconhecido".
        if (precisaEsquecer(base, novidade)) {
            nova.entradas = {};
            nova.totais = {};
            nova.entradas_zeradas_em = novidade.entradas_zeradas_em;
        }

        if (novidade.evento) nova.evento = mesclar(base.evento, novidade.evento);

        if (novidade.setores && novidade.setores.length) {
            nova.setores = mesclarSetores(base.setores, novidade.setores);
        }

        // Lista inteira, sempre. Ver o cabecalho.
        if (novidade.bloqueios) nova.bloqueios = novidade.bloqueios.slice();

        // Daqui para baixo a base e `nova`, e nao `base`: o que vem no MESMO
        // sincronismo do zeramento e POSTERIOR a ele e tem de sobreviver.
        if (novidade.entradas && novidade.entradas.length) {
            nova.entradas = mesclarEntradas(nova.entradas, novidade.entradas);
        }

        if (novidade.totais) nova.totais = mesclar(nova.totais, novidade.totais);

        return nova;
    }

    // ── O relogio ───────────────────────────────────────────────────────────

    var temporizador = null;
    var emCurso = false;
    var desde = null;

    function tique(pedir, aoAplicar) {
        // O tique anterior ainda nao voltou -- rede de portao chega a demorar
        // mais que cinco minutos, e dois pedidos em voo gravariam um por cima
        // do outro fora de ordem.
        if (emCurso) return Promise.resolve();
        emCurso = true;

        var pedido;
        try {
            pedido = Promise.resolve(pedir(desde));
        } catch (e) {
            // `fetch` explode sozinho quando o 4G cai no meio do caminho.
            emCurso = false;
            return Promise.resolve();
        }

        return pedido.then(function (novidade) {
            if (!novidade) return;
            return Promise.resolve(aoAplicar ? aoAplicar(novidade) : null)
                .then(function () {
                    // O ponto de continuacao so anda DEPOIS de a novidade ter
                    // sido guardada, e vem do relogio do SERVIDOR. Anda-lo antes
                    // perderia de vez as entradas daquele intervalo, e a mesma
                    // pessoa entraria duas vezes, calada, por dois portoes.
                    if (novidade.momento) desde = novidade.momento;
                });
        }).catch(function () {
            // Uma sincronizacao que falha nao interrompe nada e nao muda a
            // tela: o portao segue lendo com o que tem e tenta de novo em cinco
            // minutos. Uma excecao solta aqui viraria tela travada no meio da
            // fila -- e o portao nunca espera rede.
        }).then(function () { emCurso = false; });
    }

    /**
     * Liga o relogio.
     *
     * `pedir(desde)` vai ao servidor e devolve uma promessa com a novidade;
     * `desde` e nulo no primeiro pedido, e a rota entao responde as entradas
     * todas. `aoAplicar(novidade)` e quem grava -- normalmente chama `aplicar`
     * e leva o resultado ao deposito.
     */
    function ligar(pedir, aoAplicar) {
        desligar();
        temporizador = setInterval(function () {
            // Devolve a promessa do tique de proposito: e o que permite ao
            // teste esperar a ida ao servidor terminar.
            return tique(pedir, aoAplicar);
        }, INTERVALO_MS);
        return temporizador;
    }

    /** Para o relogio. A tela de leitura sai do ar quando o porteiro volta. */
    function desligar() {
        if (temporizador !== null) {
            clearInterval(temporizador);
            temporizador = null;
        }
    }

    window.portariaSincronismo = {
        aplicar: aplicar,
        ligar: ligar,
        desligar: desligar,
        INTERVALO_MS: INTERVALO_MS,
    };
})();
