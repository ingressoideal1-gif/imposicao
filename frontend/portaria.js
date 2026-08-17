/**
 * O aparelho da portaria: carga, leitura e fila.
 *
 * O pareamento por codigo de seis caracteres saiu daqui em 16/08/2026. Quem poe
 * um portao no ar agora e o dono, na casa do aplicativo, com a conta dele --
 * este arquivo so trabalha com o token que ja esta guardado, e manda para a
 * lista de eventos o celular que nao tem nenhum.
 *
 * A decisao de deixar entrar NAO mora aqui -- mora no `portaria-validacao.js`,
 * que e puro e testado com dados de mesa. Este arquivo orquestra: pega o texto
 * lido, calcula os hashes, pergunta ao validador, pinta a tela e enfileira.
 *
 * ## A tela nova, de 16/08/2026
 *
 * O caso comum e o ingresso BOM, e ele deixou de pedir alguma coisa de alguem.
 * A camera fica ligada, a faixa verde troca de conteudo, o aparelho apita e
 * vibra curto, e a proxima pessoa passa. Antes, cada leitura desligava a camera
 * e ocupava a tela: numa noite de dois mil ingressos, dois mil toques em "Ler o
 * proximo", com uma mao, no escuro.
 *
 * Desligar a camera a cada leitura era tambem, sem querer, a protecao contra
 * ler o mesmo QR duas vezes -- ela le o mesmo codigo cerca de vinte vezes por
 * segundo enquanto o papel estiver na frente da lente. No lugar dela ficou o
 * SILENCIO POR CODIGO: ver `silenciado`, que e a peca mais importante deste
 * arquivo.
 *
 * REGRA QUE GOVERNA ESTA TELA: recusa e recusa. Nao existe "deixar entrar assim
 * mesmo" -- decisao do usuario em 15/08/2026. Quem for recusado procura o dono
 * do evento.
 */
(function () {
    'use strict';

    var D = window.portariaDeposito;
    var V = window.portariaValidacao;
    var CHAVE_TOKEN = 'ideal_portaria_token';
    var CHAVE_EVENTO = 'ideal_portaria_evento';
    // Escrita pelo `aparelho.js` quando o dono configura este celular na tela
    // dele. Ver `recarregarDepoisDeConfigurar`.
    var CHAVE_RECONFIG = 'ideal_portaria_reconfigurado';
    // O recado que esta tela deixa para a casa do aplicativo quando ela volta
    // por falta de token. Ver o arranque.
    var CHAVE_SEM_TOKEN = 'ideal_portaria_sem_token';

    // Quanto tempo o MESMO codigo fica em silencio depois de lido. Decisao do
    // usuario, 16/08/2026 (eu havia sugerido 3 segundos). Ver `silenciado`.
    var SILENCIO_MS = 2000;

    // O teto da conferencia on-line. Estourou, decide-se local e a leitura vai
    // para a fila como sempre. O portao NUNCA espera rede -- e a mesma regra que
    // governa o resto desta aplicacao.
    var TETO_DA_REDE_MS = 800;

    // Quantas paginas de entradas o sincronismo busca de uma vez. Sem isto, um
    // evento com milhares de entradas andaria uma pagina a cada cinco minutos --
    // e enquanto ele nao alcancasse, quem ja entrou por outro portao passaria de
    // novo aqui, calado.
    var MAXIMO_DE_PAGINAS = 10;

    var estado = {
        carga: null, token: null, pendente: null,
        // Quantas entradas ESTE aparelho contou desde o ultimo sincronismo. O
        // contador da tela soma isto ao total do servidor: entre um sincronismo
        // e outro, o numero tem de subir a cada pessoa que passa, senao ele fica
        // cinco minutos parado e o porteiro deixa de acreditar nele.
        entradasDesdeOSincronismo: 0,
    };

    function $(id) { return document.getElementById(id); }
    function mostrar(qual) {
        // 'pareando' saiu daqui em 16/08/2026, junto com o codigo de seis
        // caracteres: nao ha mais o que digitar nesta tela. No lugar dela ficou
        // 'aviso', que so diz por que este aparelho parou de ler.
        ['aviso', 'carregando', 'lendo', 'resposta', 'ambiguo'].forEach(function (t) {
            $('tela-' + t).classList.toggle('sumindo', t !== qual);
        });
        // O retorno para a lista aparece so nas duas telas em que o aparelho
        // ficaria PRESO sem ele: a de leitura e a de aviso. Nas outras ele
        // atrapalha -- em `resposta` a tela inteira e a decisao, lida de longe,
        // e nada pode competir com o "Ler o proximo"; em `carregando` ainda nao
        // ha o que abandonar.
        $('btn-voltar').classList.toggle('sumindo',
            qual !== 'lendo' && qual !== 'aviso');
        $('erro-configurar').classList.add('sumindo');
        // A trava vale nas telas de trabalho -- ler o codigo e mostrar a
        // resposta. Nas de aviso e carga o aparelho pode dormir.
        if (qual === 'lendo' || qual === 'resposta' || qual === 'ambiguo') acenderTela();
        else apagarPermitido();
    }

    // ── A tela nao apaga ────────────────────────────────────────────────────
    // No portao o aparelho fica na mao, lendo um ingresso a cada poucos
    // segundos -- e ainda assim o celular apaga a tela sozinho em 30s, porque
    // ler QR nao conta como "uso" para o sistema. Cada apagada custa um
    // desbloqueio com a fila parada.
    var trava = null, querAcesa = false;

    function acenderTela() {
        querAcesa = true;
        if (!('wakeLock' in navigator) || trava) return;
        navigator.wakeLock.request('screen').then(function (t) {
            trava = t;
            // O sistema pode soltar por conta propria (bateria fraca, tela
            // desligada pelo botao). Zerar aqui e o que permite repedir.
            t.addEventListener('release', function () { trava = null; });
        }).catch(function () {
            // Recusa e normal: navegador sem suporte, economia de bateria, aba
            // em segundo plano. A portaria funciona igual -- so apaga a tela
            // como qualquer site. Nao vale incomodar o porteiro com isso.
        });
    }

    function apagarPermitido() {
        querAcesa = false;
        if (trava) { trava.release(); trava = null; }
    }

    document.addEventListener('visibilitychange', function () {
        // Voltar do segundo plano SEMPRE solta a trava, sem avisar. Sem este
        // repedido, a tela fica acesa ate a primeira vez que o porteiro atende
        // uma ligacao -- e nunca mais.
        if (document.visibilityState === 'visible' && querAcesa) acenderTela();
    });

    function base() {
        // 16/08/2026: a portaria passou a ser Edge Function, ao lado do banco.
        // Antes era `https://imposicao.onrender.com/api/acesso/portaria`, e cada
        // consulta pagava DUAS travessias de internet (celular -> Render ->
        // Supabase e volta), num servico que dorme quando ninguem usa. No
        // portao, com fila e 4G, isso se sentia.
        //
        // O Python continua no ar no endereco antigo durante a transicao. Para
        // voltar atras: troque esta linha de volta e republique. Os dois falam
        // com o mesmo banco e dividem o mesmo freio de forca bruta, entao o
        // aparelho nao percebe a diferenca -- o token continua valendo, e a
        // fila que ele tiver acumulado sobe igual.
        //
        // O CAMINHO INTEIRO mora aqui, e nao so o host, de proposito. Os dois
        // lados pedem prefixos diferentes (`/api/acesso/portaria` contra
        // `/functions/v1/portaria`), e trocar so o host montaria
        // `.../functions/v1/portaria/api/acesso/portaria/entrar` -- que o
        // `rotaPedida` da funcao ACEITARIA, porque o `.*` dele e guloso e casa
        // ate o ultimo `/portaria/`. Seria uma URL sem sentido passando nos
        // testes, esperando o dia em que aquela regex mudasse.
        return 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria';
    }

    function api(caminho, opcoes) {
        opcoes = opcoes || {};
        opcoes.headers = opcoes.headers || {};
        if (estado.token) opcoes.headers['Authorization'] = 'Bearer ' + estado.token;
        if (opcoes.body) opcoes.headers['Content-Type'] = 'application/json';
        return fetch(base() + caminho, opcoes).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (corpo) {
                if (!r.ok) {
                    var e = new Error(corpo.detail || ('erro ' + r.status));
                    e.status = r.status;
                    throw e;
                }
                return corpo;
            });
        });
    }

    // ── O evento deste aparelho ─────────────────────────────────────────────

    /** A tela de recado, com a frase que explica por que este celular parou. */
    function avisar(frase) {
        pararDeSincronizar();
        mostrar('aviso');
        $('erro-aviso').textContent = frase;
        $('erro-aviso').classList.remove('sumindo');
    }

    function eventoDaUrl() {
        // O `start_url` do manifesto e `/portaria.html`, SEM `?e=`. Tem de ser
        // assim: o endereco que o dono compartilha carrega o evento, mas o
        // icone na tela de inicio e um so, e um `?e=` cravado nele prenderia o
        // aparelho no primeiro evento para sempre.
        //
        // Com o aparelho ja no portao nada disso importa -- o token e que
        // manda, e o boot le a carga do IndexedDB. O caso que estas linhas
        // cobrem e o porteiro que INSTALA o aplicativo antes de o aparelho
        // virar portao: ele abre pelo icone, a URL vem limpa, e sem esta
        // memoria a casa do aplicativo nao saberia de que evento se trata.
        var daUrl = new URLSearchParams(window.location.search).get('e') || '';
        if (daUrl) {
            // try/catch nao e decoracao: em aba privada do Safari o setItem
            // LANCA, e um throw aqui derrubaria o arranque inteiro.
            try { localStorage.setItem(CHAVE_EVENTO, daUrl); } catch (e) { }
            return daUrl;
        }
        try { return localStorage.getItem(CHAVE_EVENTO) || ''; } catch (e) { return ''; }
    }

    /**
     * O retorno para a lista de eventos, no `←` do topo.
     *
     * Ele NAO exige fila zerada, e isso e de proposito: a trava que espera a
     * fila existe para quando o aparelho troca de IDENTIDADE -- vira portao de
     * outro evento, com token novo, e leitura enfileirada sob o token velho nao
     * sobe mais. Ir e voltar da lista nao troca token nenhum: a fila continua no
     * celular e sobe igual quando ele voltar a ler. Prender o porteiro aqui
     * seria uma trava que nao protege nada e atrapalha o tempo todo.
     */
    function voltarParaALista() {
        if (window.portariaCamera) window.portariaCamera.desligar();
        pararDeSincronizar();
        // Sem esperar: a fila sobe quando der, e o que ficar para tras continua
        // guardado. Segurar a navegacao ate o servidor responder seria fazer o
        // porteiro esperar rede para trocar de tela.
        sincronizar();
        window.location.href = 'controle.html';
    }

    /**
     * A saida que TROCA A IDENTIDADE deste celular.
     *
     * Nada e apagado aqui, e nao pode ser -- e essa e a trava inteira. Quem
     * apaga e o dono, do outro lado, depois da senha.
     *
     * Antes de sair, a fila sobe. Configurar cunha um token NOVO para este
     * celular, e leitura enfileirada sob o token velho nao sobe mais depois:
     * some a contagem que o cliente pagou para ter. Se ela nao subir, este
     * caminho recusa e diz por que -- configurar exige rede de qualquer jeito
     * (e login e gravacao no servidor), entao esperar o sinal nao custa nada
     * que ja nao fosse necessario.
     *
     * O BOTAO que a chamava saiu da tela de trabalho em 16/08/2026, junto com o
     * "Atualizar o evento": o `←` do topo ja leva a mesma lista, e o caminho de
     * trocar a identidade passa pela engrenagem do evento, que pede a senha do
     * dono. A funcao fica -- e a unica que sabe conferir a fila antes de o token
     * mudar, e essa conferencia nao pode se perder.
     */
    function irParaConfiguracao() {
        if (window.portariaCamera) window.portariaCamera.desligar();
        pararDeSincronizar();
        $('erro-configurar').classList.add('sumindo');
        return sincronizar().then(function () {
            return D.contarFila();
        }).catch(function () {
            return 0;   // IndexedDB fora do ar: nao ha fila a proteger
        }).then(function (n) {
            // Sem token nao ha o que mandar: o dono revogou este aparelho na
            // tela dele, e o servidor ja recusa essas leituras. Prender o
            // celular aqui nao as salvaria -- o que as salva e reconfigurar
            // para o MESMO evento, e o arranque cuida disso.
            if (n > 0 && estado.token) {
                $('erro-configurar').textContent =
                    (n === 1
                        ? 'Há 1 leitura que ainda não subiu'
                        : 'Há ' + n + ' leituras que ainda não subiram')
                    + ' para o servidor. Conecte este aparelho à internet e espere'
                    + ' a fila zerar: configurar dá a este celular uma identidade'
                    + ' nova, e o que ficou para trás não sobe mais.';
                $('erro-configurar').classList.remove('sumindo');
                return;
            }
            // A lista de eventos, e nao mais a tela de login: a engrenagem de
            // cada evento e que pede a senha agora. A marca que este endereco
            // levava servia para pular o desvio que mandava aparelho com token
            // direto ao portao -- desvio que saiu junto com a tela de codigo.
            window.location.href = 'controle.html';
        });
    }

    function desparear() {
        // Ate 16/08/2026 esta funcao apagava tudo aqui mesmo -- token, carga,
        // fila e entradas -- sem que ninguem tivesse de provar quem era. Isso e
        // o oposto de uma trava: bastava o celular na mao para desfazer o
        // trabalho inteiro do aparelho. A decisao do usuario foi que reeditar E
        // apagar passam pela senha.
        //
        // Agora ela so LEVA para a configuracao, e nao apaga nada no caminho.
        return irParaConfiguracao();
    }

    /**
     * O aparelho acabou de receber uma configuracao nova, feita pelo dono na
     * tela dele, neste mesmo celular.
     *
     * A carga guardada e do aparelho ANTERIOR: ela traz o nome do portao e a
     * lista de setores que ele valida. Ler ingresso com ela mostraria o nome
     * velho no topo e recusaria ingresso bom como "OUTRA PORTA", sem nada na
     * tela que explicasse. Por isso a carga vem do servidor de novo, antes da
     * primeira leitura.
     */
    function recarregarDepoisDeConfigurar() {
        var eventoAntes = null;
        return D.lerCarga().then(function (c) {
            eventoAntes = c && c.evento ? c.evento.id : null;
            return baixarCarga();
        }).then(function () {
            var eventoAgora = estado.carga && estado.carga.evento
                ? estado.carga.evento.id : null;
            // Trocou de EVENTO. O que sobrou na fila e leitura de outro evento,
            // e o servidor grava a fila com o evento do token ATUAL -- entrada
            // de um evento contada em outro. Essas leituras ja nao tinham como
            // subir (o token que as criou se foi), e o que resta e nao
            // corromper a contagem nova. Mesmo evento: a fila FICA, e sobe com
            // o token novo.
            if (eventoAntes && eventoAgora && eventoAntes !== eventoAgora) {
                return D.esquecerFila();
            }
        }).then(function () {
            // So agora a marca sai. Se a carga nova nao tivesse chegado, a
            // proxima abertura precisa tentar de novo, e nunca trabalhar com a
            // carga do aparelho anterior.
            try { localStorage.removeItem(CHAVE_RECONFIG); } catch (e) { }
        }).catch(function () {
            avisar('Não deu para baixar o evento neste aparelho. Conecte-o à '
                + 'internet e abra de novo.');
        });
    }

    function aparelhoRevogado() {
        // O dono revogou ESTE aparelho na tela dele -- nao e despareamento
        // deliberado do porteiro. A fila pode ter leituras que o servidor
        // ainda nao confirmou (Portao B ficou horas sem sinal, acumulou
        // centenas de leituras; o dono revoga o aparelho ERRADO na tela
        // dele); apaga-las e perder a contagem que o cliente pagou para ter
        // -- contra a spec escrita, achado em revisao de codigo, 15/08/2026.
        // So esquece o token. Carga, fila e entradas continuam no celular.
        localStorage.removeItem(CHAVE_TOKEN);
        estado.token = null;
        avisar('Este aparelho foi desligado pelo organizador. Peça ao dono do '
            + 'evento para ligá-lo de novo na tela dele.');
        return Promise.resolve();
    }

    // ── A carga ─────────────────────────────────────────────────────────────

    function baixarCarga() {
        mostrar('carregando');
        var acumulada = null;
        function pagina(desde) {
            return api('/faixa?desde=' + desde).then(function (p) {
                if (!acumulada) acumulada = p;
                else acumulada.credenciais = acumulada.credenciais.concat(p.credenciais);
                $('carregando-conta').textContent =
                    acumulada.credenciais.length.toLocaleString('pt-BR') + ' ingressos';
                if (p.proxima !== null && p.proxima !== undefined) return pagina(p.proxima);
                return D.gravarCarga(acumulada).then(function () {
                    estado.carga = acumulada;
                    entrarEmLeitura();
                });
            });
        }
        return pagina(0);
    }

    function marcarLanterna(acesa) {
        var b = $('btn-lanterna');
        b.classList.toggle('acesa', !!acesa);
        // O icone nao diz sozinho se a luz esta acesa. O rotulo de acessibilidade
        // diz -- e e ele que o leitor de tela e o toque longo mostram.
        b.setAttribute('aria-label', acesa ? 'Apagar a lanterna' : 'Acender a lanterna');
    }

    function ligarCamera() {
        if (!window.portariaCamera) return;
        // O rotulo volta ao repouso a cada abertura: a lanterna se apaga junto
        // com a camera, e um botao dizendo "acesa" com a luz apagada e pior do
        // que botao nenhum.
        marcarLanterna(false);
        // `pararAoAchar: false` e o coracao da tela nova: a camera SEGUE ligada
        // depois de achar um codigo. Quem para a camera agora e esta tela, e so
        // quando algo ocupa o aparelho -- recusa, escolha de setor, digitacao.
        //
        // A funcao vai junto: a camera nao conhece mais esta tela pelo nome --
        // ela e usada tambem pela casa do aplicativo, que faz outra coisa com o
        // texto lido, e que continua querendo a camera parada ao achar.
        window.portariaCamera.ligar(validarTexto, { pararAoAchar: false })
            .then(function () {
                // So AGORA da para perguntar: antes de o getUserMedia resolver
                // nao ha trilha de video, e a resposta seria sempre "nao tem".
                $('btn-lanterna').classList.toggle(
                    'sumindo', !window.portariaCamera.temLanterna());
            });
    }

    // O porteiro ja tocou na tela nesta abertura da pagina? E o que destrava o
    // audio -- e o que decide se a capa "Toque para comecar a ler" aparece.
    var somDestravado = false;

    /**
     * Abre a leitura de verdade.
     *
     * Navegador nenhum toca audio antes de a pessoa encostar na tela, e ler QR
     * nao conta como encostar. Por isso a capa: um toque, e o aviso sonoro passa
     * a valer para a noite inteira. Ela reaparece se o porteiro sair da leitura
     * e voltar, porque sair da pagina leva o `AudioContext` junto.
     *
     * A capa NAO volta entre uma recusa e a proxima leitura: o "Ler o proximo"
     * ja e o toque, e pedir outro seria dois toques para o mesmo gesto.
     */
    function comecarALer() {
        if (!somDestravado) {
            $('btn-toque').classList.remove('sumindo');
            return;   // a camera abre no toque, junto com o som
        }
        $('btn-toque').classList.add('sumindo');
        ligarCamera();
    }

    function entrarEmLeitura() {
        var c = estado.carga;
        $('topo-aparelho').textContent = c.aparelho.nome;
        $('topo-setores').textContent = c.aparelho.setores.map(function (id) {
            var s = setorPorId(c, id);
            return s ? s.nome : id;
        }).join(' · ');
        atualizarContador();
        mostrar('lendo');
        ligarSincronismo();
        comecarALer();
    }

    function setorPorId(carga, id) {
        return ((carga && carga.setores) || []).filter(function (s) {
            return s.id === id;
        })[0] || null;
    }

    // ── O contador ──────────────────────────────────────────────────────────

    function emPortugues(n) {
        return Number(n || 0).toLocaleString('pt-BR');
    }

    /**
     * `1.234 / 5.000 · 12 nao enviadas`.
     *
     * O numerador soma TODOS os setores deste portao -- decisao do usuario,
     * contra um seletor de setor na tela: um controle a mais para tocar por
     * engano, no escuro, com a fila andando. Ele conta o que os OUTROS portoes
     * leram tambem, porque os totais vem do servidor, que e quem enxerga todos.
     *
     * O denominador e a quantidade CONTRATADA no ERP, que e a regra do projeto
     * para lotacao -- nunca um numero digitado por alguem.
     */
    function atualizarContador() {
        return Promise.all([D.contarFila(), D.lerTotais()]).then(function (r) {
            var naFila = r[0] || 0;
            var totais = r[1] || {};
            var c = estado.carga || {};
            var meus = (c.aparelho && c.aparelho.setores) || [];
            var entraram = estado.entradasDesdeOSincronismo;
            var contratado = 0;
            meus.forEach(function (id) {
                entraram += Number(totais[id] || 0);
                var s = setorPorId(c, id);
                contratado += (s && Number(s.quantidade)) || 0;
            });
            $('contador-numeros').textContent =
                emPortugues(entraram) + ' / ' + emPortugues(contratado);
            // Some quando zera -- decisao do usuario. Uma marca fixa dizendo
            // "0 nao enviadas" e ruido no unico numero que o porteiro olha.
            $('contador-pendentes').textContent = naFila
                ? (' · ' + emPortugues(naFila)
                    + (naFila === 1 ? ' não enviada' : ' não enviadas'))
                : '';
        }).catch(function () {
            // IndexedDB fora do ar. O contador some, e a leitura segue: numero
            // errado na tela e pior que numero nenhum.
        });
    }

    // ── O sincronismo de cinco minutos ──────────────────────────────────────

    /**
     * A rota leve, paginada.
     *
     * Ela desce so o que muda -- evento, setores, bloqueios, as entradas de
     * QUALQUER aparelho e os totais do contador. A lista de ingressos, que e a
     * parte pesada, continua vindo so pelo `/faixa`.
     */
    function pedirNovidades(desde) {
        if (!estado.token || !navigator.onLine) return Promise.resolve(null);
        var entradas = [];
        function pagina(daqui, quantas) {
            var caminho = '/sincronizar'
                + (daqui ? '?desde=' + encodeURIComponent(daqui) : '');
            return api(caminho).then(function (p) {
                entradas = entradas.concat(p.entradas || []);
                if (p.proxima_desde && quantas < MAXIMO_DE_PAGINAS) {
                    return pagina(p.proxima_desde, quantas + 1);
                }
                p.entradas = entradas;
                // Onde o PROXIMO tique comeca. Vem do relogio do SERVIDOR, e nao
                // deste celular: um aparelho adiantado pularia as entradas
                // registradas no intervalo, e a mesma pessoa entraria duas
                // vezes, calada, por dois portoes. Sem entrada nenhuma, fica
                // nulo e o proximo pedido baixa tudo de novo -- sao poucos kB, e
                // baixar demais e sempre melhor que baixar de menos aqui.
                p.momento = entradas.length
                    ? entradas[entradas.length - 1].momento : null;
                return p;
            });
        }
        return pagina(desde, 1);
    }

    /** Guarda o que a rota leve trouxe, sem perder nada do que ja havia. */
    function aplicarNovidades(novidade) {
        var S = window.portariaSincronismo;
        if (!S || !novidade) return Promise.resolve();
        var nova = S.aplicar(estado.carga, novidade);
        estado.carga = nova;
        var deFora = {};
        (novidade.entradas || []).forEach(function (e) {
            if (e && e.credencial_id && e.momento) deFora[e.credencial_id] = e.momento;
        });
        return D.gravarCarga(nova).then(function () {
            return D.gravarEntradas(deFora);
        }).then(function () {
            return D.gravarTotais(novidade.totais || {});
        }).then(function () {
            // O servidor ja enxerga o que este aparelho vinha somando a mao:
            // continuar somando contaria as mesmas pessoas duas vezes. Leitura
            // feita sem sinal entra na conta assim que a fila subir e o
            // sincronismo seguinte a contar.
            estado.entradasDesdeOSincronismo = 0;
            return atualizarContador();
        });
    }

    function ligarSincronismo() {
        if (window.portariaSincronismo) {
            window.portariaSincronismo.ligar(pedirNovidades, aplicarNovidades);
        }
    }

    function pararDeSincronizar() {
        if (window.portariaSincronismo) window.portariaSincronismo.desligar();
    }

    /** Um tique agora, fora do relogio. E o caminho que os testes exercitam. */
    function puxarNovidades() {
        return pedirNovidades(null).then(aplicarNovidades).catch(function () {
            // Sincronismo que falha nao interrompe nada e nao muda a tela: o
            // portao segue lendo com o que tem e tenta de novo em cinco minutos.
        });
    }

    // ── A leitura ───────────────────────────────────────────────────────────

    // Quando cada codigo apareceu pela ultima vez na frente da lente.
    var vistos = {};

    /**
     * O mesmo codigo e ignorado por 2 segundos. E a peca que substituiu o
     * desligar-a-camera-a-cada-leitura.
     *
     * A camera le o mesmo QR cerca de vinte vezes por segundo enquanto o papel
     * estiver na frente da lente. Sem este silencio, o segundo disparo cairia na
     * regra `ja_entrou` e pintaria a tela de VERMELHO para um ingresso BOM, um
     * piscar depois do verde -- e o porteiro devolveria quem tinha direito de
     * entrar. E o pior resultado possivel desta tela.
     *
     * O silencio e POR CODIGO, e nao por tempo de tela: outro ingresso,
     * diferente, passa na hora. E a contagem recomeca a cada aparicao, e nao so
     * na que valeu -- o papel fica na frente da lente por segundos e a camera
     * insiste; com a contagem parada na primeira leitura, a insistencia venceria
     * o silencio e o vermelho apareceria assim mesmo.
     */
    function silenciado(texto) {
        var agora = Date.now();
        var visto = vistos[texto];
        // Limpeza: sem ela o mapa guardaria um item por ingresso lido a noite
        // inteira. So sobrevive quem apareceu nos ultimos dois segundos.
        Object.keys(vistos).forEach(function (k) {
            if (agora - vistos[k] >= SILENCIO_MS) delete vistos[k];
        });
        vistos[texto] = agora;
        return visto !== undefined && (agora - visto) < SILENCIO_MS;
    }

    function validarTexto(texto, setorEscolhido) {
        var carga = estado.carga;
        // A escolha de setor passa por fora do silencio, de proposito: o texto e
        // exatamente o que a camera acabou de ler, e o porteiro acabou de tocar
        // no botao. Sem esta saida, a propria escolha dele cairia no silencio e
        // a tela nao responderia nada.
        if (!setorEscolhido && silenciado(texto)) return Promise.resolve();
        // TUDO dentro da cadeia de promise, inclusive o primeiro calculo --
        // sem isto um erro SINCRONO (ex.: `saisParaTentar` recebendo carga
        // incompleta) escapava do .catch la embaixo e a tela nao mudava:
        // nem verde, nem vermelho, nada. Achado em revisao de codigo,
        // 15/08/2026.
        return Promise.resolve().then(function () {
            var sais = V.saisParaTentar(texto, carga);
            return Promise.all(sais.map(function (s) { return window.qrIdealHash(texto, s); }));
        })
            .then(function (hashes) {
                return D.entradasPermitidas().then(function (entradas) {
                    return V.decidir({
                        hashes: hashes, carga: carga,
                        agora: new Date().toISOString(),
                        entradas: entradas, setorEscolhido: setorEscolhido || null,
                    });
                });
            })
            .then(function (v) {
                if (v.estado === 'ambiguo') {
                    estado.pendente = { texto: texto };
                    return perguntarSetor(v.candidatos);
                }
                var leitura = leituraDe(v);
                return conferirNaRede(v, leitura).then(function (decidido) {
                    return registrar(leitura).then(function () {
                        return anunciar(decidido);
                    });
                });
            })
            .catch(function (e) {
                // Qualquer excecao daqui para cima -- IndexedDB sem espaco,
                // crypto.subtle ausente, carga com campo faltando -- tinha o
                // MESMO sintoma: porteiro le o QR, tela nao muda. Um erro
                // visivel e infinitamente melhor que um silencio.
                console.error('erro ao validar leitura da portaria:', e);
                anunciar({ estado: 'negado', motivo: 'erro_de_leitura', setor: null, detalhe: {} });
            });
    }

    function perguntarSetor(candidatos) {
        // Escolher ocupa o aparelho: a camera para, como em qualquer recusa.
        // Sem isto ela seguiria lendo por tras da pergunta e responderia outra
        // coisa por cima.
        if (window.portariaCamera) window.portariaCamera.desligar();
        var caixa = $('escolha-setores');
        caixa.innerHTML = '';
        candidatos.forEach(function (c) {
            var b = document.createElement('button');
            // textContent, sempre: o nome do setor e escrito pelo dono do evento.
            b.textContent = c.setor.nome;
            b.onclick = function () {
                mostrar('lendo');
                comecarALer();
                validarTexto(estado.pendente.texto, c.setor.id);
            };
            caixa.appendChild(b);
        });
        mostrar('ambiguo');
        avisarBarrado();
    }

    function uuid() {
        // `crypto.randomUUID` nao existe em Safari antigo, e este id e a chave
        // de idempotencia: sem ele a fila reenviada duplicaria a lotacao.
        if (crypto.randomUUID) return crypto.randomUUID();
        var b = crypto.getRandomValues(new Uint8Array(16));
        return Array.prototype.map.call(b, function (x) {
            return x.toString(16).padStart(2, '0');
        }).join('');
    }

    function leituraDe(v) {
        return {
            id_local: uuid(),
            momento: new Date().toISOString(),
            credencial_id: v.credencial_id || null,
            setor_id: (v.setor && v.setor.id) || null,
            resultado: v.estado === 'permitido' ? 'permitido' : 'negado',
            motivo: v.motivo || null,
        };
    }

    /**
     * A conferencia on-line, com teto de 800 ms.
     *
     * Cinco minutos de sincronismo e tempo de sobra para a mesma pessoa entrar
     * por dois portoes. Com sinal isso fecha: o servidor registra a entrada SO
     * se ainda nao houver uma, numa operacao so, e responde qual das duas coisas
     * aconteceu. Quem perde a corrida ouve `ja_entrou`, com a hora e o nome do
     * portao que ganhou.
     *
     * Se o servidor nao responder em 800 ms, o aparelho decide sozinho com o que
     * tem e a leitura segue para a fila como sempre. O portao NUNCA espera rede.
     *
     * So o caminho PERMITIDO passa por aqui. Recusa ja travou a tela, e nao ha
     * entrada nenhuma a reivindicar -- mandar a leitura negada pela fila, como
     * sempre foi, custa menos ao porteiro que uma espera na frente do vermelho.
     */
    function conferirNaRede(v, leitura) {
        if (v.estado !== 'permitido' || !estado.token || !navigator.onLine) {
            return Promise.resolve(v);
        }
        return comTeto(api('/entrada', {
            method: 'POST', body: JSON.stringify(leitura),
        })).then(function (r) {
            if (!r || r.primeira !== false) return v;
            var a = r.anterior || {};
            // A fila leva o veredito do SERVIDOR, e nao o local: e ele que vale.
            leitura.resultado = 'negado';
            leitura.motivo = 'ja_entrou';
            return {
                estado: 'negado', motivo: 'ja_entrou',
                setor: v.setor, numero: v.numero,
                credencial_id: v.credencial_id,
                detalhe: { momentoAnterior: a.momento, portaoAnterior: a.portao },
            };
        });
    }

    /** A promessa, ou `null` quando o tempo estourou. Nunca lanca. */
    function comTeto(promessa) {
        return new Promise(function (ok) {
            var decidido = false;
            var relogio = setTimeout(function () {
                if (decidido) return;
                decidido = true;
                ok(null);
            }, TETO_DA_REDE_MS);
            promessa.then(function (r) {
                if (decidido) return;
                decidido = true;
                clearTimeout(relogio);
                ok(r);
            }).catch(function () {
                if (decidido) return;
                decidido = true;
                clearTimeout(relogio);
                ok(null);
            });
        });
    }

    function registrar(leitura) {
        // Somada aqui, e nao ao pintar: e a leitura GRAVADA que conta. Zerada a
        // cada sincronismo, quando o numero do servidor passa a incluir esta.
        if (leitura.resultado === 'permitido') estado.entradasDesdeOSincronismo += 1;
        return D.enfileirar(leitura).then(atualizarContador)
            .then(function () { sincronizar(); });
    }

    var TITULOS = {
        evento_inativo: 'EVENTO INATIVO',
        desconhecido: 'NÃO É DESTE EVENTO',
        setor_nao_autorizado: 'OUTRA PORTA',
        setor_bloqueado: 'SETOR BLOQUEADO',
        fora_da_janela: 'FORA DO HORÁRIO',
        bloqueado: 'FAIXA BLOQUEADA',
        ja_entrou: 'JÁ ENTROU',
        erro_de_leitura: 'ERRO AO LER',
    };

    function hora(iso) {
        try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return iso; }
    }

    function avisarPassagem() {
        // Enfeite, e enfeite nao pode derrubar a leitura: o modulo inteiro do
        // aviso trabalha em try/catch, e aqui basta ele existir.
        if (window.avisoSonoro) window.avisoSonoro.liberado();
    }

    function avisarBarrado() {
        if (window.avisoSonoro) window.avisoSonoro.barrado();
    }

    function anunciar(v) {
        if (v.estado === 'permitido') return anunciarPassagem(v);
        return anunciarRecusa(v);
    }

    /**
     * O caminho feliz: a faixa verde troca, o aparelho apita curto, e a camera
     * SEGUE ligada. Ninguem toca em nada.
     */
    function anunciarPassagem(v) {
        var setor = v.setor || {};
        var faixa = $('faixa-ultima');
        faixa.classList.remove('vazia');
        // textContent, sempre: o nome do setor e escrito pelo dono do evento.
        // A hora entra por decisao do usuario -- numa fila rapida, sem ela o
        // porteiro nao distingue "acabou de passar" de "isto e de trinta
        // segundos atras".
        faixa.textContent = (setor.nome || 'Ingresso') + ' · ' + v.numero
            + ' · ' + hora(new Date().toISOString());
        avisarPassagem();
    }

    /**
     * A recusa: a cor ocupa a tela, o motivo aparece grande, o aparelho apita
     * longo e vibra duas vezes, e o porteiro toca em "Ler o proximo". E a unica
     * forma de garantir que ele viu.
     */
    function anunciarRecusa(v) {
        // A camera para: a tela inteira e a decisao, e ler por tras dela
        // responderia outro ingresso por cima deste.
        if (window.portariaCamera) window.portariaCamera.desligar();
        pintar(v);
        avisarBarrado();
    }

    function pintar(v) {
        var caixa = $('resposta-caixa');
        var d = v.detalhe || {};
        // `v.setor` pode vir null: a regra 2 (setor_nao_autorizado) chama
        // `setorPorId`, que devolve null quando o setor do ingresso alheio
        // nao esta mais em `carga.setores` (setor virou status != 'ativo' no
        // servidor). Acessar `.nome` direto travava a tela -- nem verde, nem
        // vermelho, indistinguivel de celular travado. Achado em revisao de
        // codigo, 15/08/2026.
        var setor = v.setor || {};
        // O laranja (`porta`) e SO do `setor_nao_autorizado`: ele significa
        // "ingresso bom, porta errada -- mande a pessoa para a outra fila".
        // `evento_inativo` e `setor_bloqueado` sao vermelhos porque, neles, o
        // ingresso nao entra em porta nenhuma.
        //
        // Nao ha mais ramo verde aqui: o ingresso bom nao ocupa a tela desde
        // 16/08/2026 -- ele troca a faixa em `anunciarPassagem` e a camera segue.
        caixa.className = 'resposta ' + (
            v.motivo === 'setor_nao_autorizado' ? 'porta' : 'recusa');
        $('resposta-marca').textContent = '✕';
        $('resposta-titulo').textContent = TITULOS[v.motivo] || 'RECUSADO';
        $('resposta-grande').textContent = '';
        $('resposta-motivo').textContent = '';

        if (v.motivo === 'evento_inativo') {
            // Nao ha setor nem numero a mostrar: a recusa e do evento inteiro,
            // e vem antes de o aparelho saber de que ingresso se trata.
            $('resposta-detalhe').textContent =
                'Este evento foi desligado pelo organizador. Procure-o.';
        } else if (v.motivo === 'setor_nao_autorizado') {
            $('resposta-detalhe').textContent =
                'Este ingresso é ' + (setor.nome || 'de outro setor') + '. Este aparelho lê ' +
                (d.setoresDoAparelho || []).join(', ') + '.';
        } else if (v.motivo === 'setor_bloqueado') {
            // Mesma forma da `bloqueado` (faixa) logo abaixo: o setor e o
            // numero na linha de detalhe, e o motivo do dono no corpo grande,
            // que e o que o porteiro le em voz alta para a fila.
            $('resposta-detalhe').textContent = setor.nome + ' · nº ' + v.numero;
            $('resposta-motivo').textContent = d.motivoBloqueio;
        } else if (v.motivo === 'fora_da_janela') {
            $('resposta-detalhe').textContent = d.abre_em
                ? (setor.nome + ' abre às ' + hora(d.abre_em))
                : (setor.nome + ' fechou às ' + hora(d.fecha_em));
        } else if (v.motivo === 'bloqueado') {
            $('resposta-detalhe').textContent = setor.nome + ' · nº ' + v.numero;
            $('resposta-motivo').textContent = d.motivoBloqueio;
        } else if (v.motivo === 'ja_entrou') {
            // O portao anterior so existe quando quem decidiu foi o SERVIDOR --
            // e a recusa mais dificil de explicar na frente da pessoa, e sem o
            // nome do portao ela vira "nao sei, o sistema nao deixou".
            $('resposta-detalhe').textContent =
                setor.nome + ' · nº ' + v.numero + ' — entrou às ' + hora(d.momentoAnterior)
                + (d.portaoAnterior ? (' no ' + d.portaoAnterior) : '');
        } else if (v.motivo === 'erro_de_leitura') {
            $('resposta-detalhe').textContent = 'Erro ao ler — chame o organizador.';
        } else {
            $('resposta-detalhe').textContent = 'Este código não é deste evento.';
        }
        mostrar('resposta');
    }

    // ── A fila sobe ─────────────────────────────────────────────────────────

    var sincronizando = false;

    function sincronizar() {
        if (sincronizando || !estado.token || !navigator.onLine) return Promise.resolve();
        sincronizando = true;
        return D.lerFila(200).then(function (lote) {
            if (!lote.length) return;
            return api('/leituras', {
                method: 'POST', body: JSON.stringify({ leituras: lote }),
            }).then(function () {
                // So AGORA sai da fila. Remover antes seria perder leitura
                // quando a resposta se perde no caminho.
                return D.removerDaFila(lote.map(function (l) { return l.id_local; }));
            }).then(atualizarContador);
        }).catch(function (e) {
            if (e.status === 401) return aparelhoRevogado();
        }).then(function () { sincronizando = false; });
    }

    window.addEventListener('online', sincronizar);
    setInterval(sincronizar, 30000);

    // ── Amarração da tela ───────────────────────────────────────────────────

    $('btn-toque').onclick = function () {
        // O gesto que o navegador exige para o audio existir. Ele vale para a
        // pagina inteira, e nao so para este toque.
        if (window.avisoSonoro) window.avisoSonoro.liberar();
        somDestravado = true;
        $('btn-toque').classList.add('sumindo');
        ligarCamera();
    };

    $('btn-voltar').onclick = voltarParaALista;

    $('btn-proximo').onclick = function () {
        mostrar('lendo');
        comecarALer();
    };

    $('btn-lanterna').onclick = function () {
        window.portariaCamera.alternarLanterna().then(marcarLanterna);
    };

    $('btn-digitar').onclick = function () {
        var caixa = $('caixa-digitar');
        var abrindo = caixa.classList.contains('sumindo');
        caixa.classList.toggle('sumindo');
        if (abrindo) {
            // A camera para enquanto a caixa esta aberta. Ela continua lendo com
            // o <video> na tela, e um QR que entre no quadro no meio da
            // digitacao responderia por cima do numero digitado -- sem que nada
            // avise a qual ingresso a tela esta respondendo.
            if (window.portariaCamera) window.portariaCamera.desligar();
            $('campo-numero').focus();
        } else {
            comecarALer();
        }
    };

    $('btn-conferir').onclick = function () {
        var t = ($('campo-numero').value || '').trim();
        if (!t) return;
        $('campo-numero').value = '';
        // Desligar aqui tambem, e nao so ao abrir a caixa: e a ultima linha
        // antes de validar, e e a que garante que a camera nao responde por cima
        // desta leitura. Achado em revisao de codigo, 15/08/2026.
        if (window.portariaCamera) window.portariaCamera.desligar();
        $('caixa-digitar').classList.add('sumindo');
        // Passa pelas MESMAS seis regras. Digitar nao e atalho -- e outra forma
        // de entrada, para o ingresso rasgado e para o codigo de barras que o
        // navegador do iPhone nao le.
        //
        // Fora do silencio de 2 segundos, de proposito: quem digitou quer uma
        // resposta, mesmo que seja o mesmo numero de novo.
        delete vistos[t];
        validarTexto(t).then(function () {
            // A camera volta quando a tela continua sendo a de leitura. Depois
            // de uma recusa quem a religa e o "Ler o proximo".
            if (!$('tela-lendo').classList.contains('sumindo')) comecarALer();
        });
    };

    // ── Partida ─────────────────────────────────────────────────────────────

    function recemConfigurado() {
        try { return !!localStorage.getItem(CHAVE_RECONFIG); }
        catch (e) { return false; }   // aba anonima: nao ha marca a ler
    }

    function arrancar() {
        // Lembrar o evento ASSIM QUE A PAGINA ABRE, e nao so quando alguem
        // precisar dele: o porteiro abre o endereco compartilhado
        // (`/portaria.html?e=<evento>`), INSTALA o aplicativo, e o icone passa
        // a abrir `/portaria.html` sem query nenhuma.
        eventoDaUrl();

        estado.token = localStorage.getItem(CHAVE_TOKEN);
        // Sem token, este celular nao e portao de nada. A casa do aplicativo e
        // que resolve isso agora -- o dono toca na barra do evento e o portao
        // nasce ali. Nao ha mais codigo para digitar, e por isso nao ha mais
        // tela nenhuma a mostrar aqui.
        if (!estado.token) {
            // A MARCA, antes de sair. Este desvio era MUDO: a tela ia embora e
            // voltava para a lista sem uma palavra, e quem tocou na barra do
            // evento via o aplicativo simplesmente nao reagir. Foi assim que o
            // defeito de 16/08/2026 ficou invisivel por um dia inteiro, com o
            // dono relatando tres vezes que nada acontecia.
            //
            // O conserto de raiz esta no `chaveiro.carregado()`, que agora exige
            // o token; esta marca e a rede por baixo dele. Se algum caminho
            // futuro trouxer um aparelho sem token para ca de novo, a volta vem
            // com o motivo escrito em vez de silencio.
            try { localStorage.setItem(CHAVE_SEM_TOKEN, '1'); } catch (e) { }
            window.location.replace('controle.html');
            return;
        }
        if (recemConfigurado()) {
            recarregarDepoisDeConfigurar();
            return;
        }
        D.lerCarga().then(function (c) {
            if (c) { estado.carga = c; entrarEmLeitura(); sincronizar(); }
            else {
                baixarCarga().catch(function () {
                    avisar('Não deu para baixar o evento neste aparelho. '
                        + 'Conecte-o à internet e abra de novo.');
                });
            }
        });
    }

    window.portaria = {
        estado: estado, validarTexto: validarTexto,
        sincronizar: sincronizar, desparear: desparear,
        puxarNovidades: puxarNovidades,
    };

    // Depois do `window.portaria`, de proposito: o arranque pode navegar para
    // fora daqui (aparelho sem token), e quem inspeciona esta pagina -- o
    // harness dos testes, o console do navegador -- precisa do objeto exportado
    // de qualquer jeito.
    arrancar();
})();
