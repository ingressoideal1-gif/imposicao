/**
 * O aparelho da portaria: pareamento, carga, leitura e fila.
 *
 * A decisao de deixar entrar NAO mora aqui -- mora no `portaria-validacao.js`,
 * que e puro e testado com dados de mesa. Este arquivo orquestra: pega o texto
 * lido, calcula os hashes, pergunta ao validador, pinta a tela e enfileira.
 *
 * REGRA QUE GOVERNA ESTA TELA: recusa e recusa. Nao existe "deixar entrar mesmo
 * assim" -- decisao do usuario em 15/08/2026. Quem for recusado procura o dono
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

    var estado = { carga: null, token: null, pendente: null };

    function $(id) { return document.getElementById(id); }
    function mostrar(qual) {
        ['pareando', 'carregando', 'lendo', 'resposta', 'ambiguo'].forEach(function (t) {
            $('tela-' + t).classList.toggle('sumindo', t !== qual);
        });
        // A saida para a configuracao aparece so nas duas telas em que o
        // aparelho ficaria PRESO sem ela: a de leitura e a de pareamento. Nas
        // outras ela atrapalha -- em `resposta` a tela inteira e a decisao,
        // lida de longe, e nada pode competir com o "Ler o proximo"; em
        // `carregando` ainda nao ha o que configurar.
        $('btn-configurar-aparelho').classList.toggle('sumindo',
            qual !== 'lendo' && qual !== 'pareando');
        $('erro-configurar').classList.add('sumindo');
        // A trava vale nas telas de trabalho -- ler o codigo e mostrar a
        // resposta. Nas de pareamento e carga o aparelho pode dormir.
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

    // ── Pareamento ──────────────────────────────────────────────────────────

    function eventoDaUrl() {
        // O `start_url` do manifesto e `/portaria.html`, SEM `?e=`. Tem de ser
        // assim: o endereco que o dono compartilha carrega o evento, mas o
        // icone na tela de inicio e um so, e um `?e=` cravado nele prenderia o
        // aparelho no primeiro evento para sempre.
        //
        // Depois de pareado nada disso importa -- o token e que manda, e o boot
        // le a carga do IndexedDB. O caso que estas linhas cobrem e o porteiro
        // que INSTALA antes de parear: ele abre pelo icone, a URL vem limpa, e
        // sem esta memoria o `parear` mandaria `evento_id: ''`.
        var daUrl = new URLSearchParams(window.location.search).get('e') || '';
        if (daUrl) {
            // try/catch nao e decoracao: em aba privada do Safari o setItem
            // LANCA, e um throw aqui derrubaria o pareamento inteiro.
            try { localStorage.setItem(CHAVE_EVENTO, daUrl); } catch (e) { }
            return daUrl;
        }
        try { return localStorage.getItem(CHAVE_EVENTO) || ''; } catch (e) { return ''; }
    }

    function parear(codigo) {
        return api('/entrar', {
            method: 'POST',
            body: JSON.stringify({ evento_id: eventoDaUrl(), codigo: codigo }),
        }).then(function (r) {
            estado.token = r.token;
            localStorage.setItem(CHAVE_TOKEN, r.token);
            return baixarCarga();
        });
    }

    /**
     * A saida do portao: leva para a tela que pede a conta do dono.
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
     */
    function irParaConfiguracao() {
        if (window.portariaCamera) window.portariaCamera.desligar();
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
            window.location.href = 'controle.html?configurar=1';
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
            mostrar('pareando');
            $('erro-pareamento').textContent =
                'Não deu para baixar o evento neste aparelho. Conecte-o à '
                + 'internet e abra de novo.';
            $('erro-pareamento').classList.remove('sumindo');
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
        $('erro-pareamento').textContent = 'Este aparelho foi desligado pelo organizador.';
        $('erro-pareamento').classList.remove('sumindo');
        mostrar('pareando');
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

    function ligarCamera() {
        if (!window.portariaCamera) return;
        // O rotulo volta ao repouso a cada abertura: o `desligar` apaga a
        // lanterna depois de cada leitura, e um botao dizendo "acesa" com a luz
        // apagada e pior do que botao nenhum.
        $('btn-lanterna').textContent = 'Lanterna';
        // A funcao vai junto: a camera nao conhece mais esta tela pelo nome --
        // ela e usada tambem pela casa do aplicativo, que faz outra coisa com o
        // texto lido.
        window.portariaCamera.ligar(validarTexto).then(function () {
            // So AGORA da para perguntar: antes de o getUserMedia resolver nao
            // ha trilha de video, e a resposta seria sempre "nao tem".
            $('btn-lanterna').classList.toggle('sumindo', !window.portariaCamera.temLanterna());
        });
    }

    function entrarEmLeitura() {
        var c = estado.carga;
        $('topo-aparelho').textContent = c.aparelho.nome;
        $('topo-setores').textContent = c.aparelho.setores.map(function (id) {
            var s = c.setores.filter(function (x) { return x.id === id; })[0];
            return s ? s.nome : id;
        }).join(' · ');
        atualizarFila();
        mostrar('lendo');
        ligarCamera();
    }

    function atualizarFila() {
        return D.contarFila().then(function (n) {
            // Fila que cresce e o sinal de que a rede caiu. O porteiro precisa
            // ver isso sem procurar.
            $('topo-fila').textContent = n ? (n + ' na fila') : '';
        });
    }

    // ── A leitura ───────────────────────────────────────────────────────────

    function validarTexto(texto, setorEscolhido) {
        var carga = estado.carga;
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
                return registrar(v).then(function () { return pintar(v); });
            })
            .catch(function (e) {
                // Qualquer excecao daqui para cima -- IndexedDB sem espaco,
                // crypto.subtle ausente, carga com campo faltando -- tinha o
                // MESMO sintoma: porteiro le o QR, tela nao muda. Um erro
                // visivel e infinitamente melhor que um silencio.
                console.error('erro ao validar leitura da portaria:', e);
                pintar({ estado: 'negado', motivo: 'erro_de_leitura', setor: null, detalhe: {} });
            });
    }

    function perguntarSetor(candidatos) {
        var caixa = $('escolha-setores');
        caixa.innerHTML = '';
        candidatos.forEach(function (c) {
            var b = document.createElement('button');
            b.textContent = c.setor.nome;
            b.onclick = function () {
                mostrar('lendo');
                validarTexto(estado.pendente.texto, c.setor.id);
            };
            caixa.appendChild(b);
        });
        mostrar('ambiguo');
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

    function registrar(v) {
        return D.enfileirar({
            id_local: uuid(),
            momento: new Date().toISOString(),
            credencial_id: v.credencial_id || null,
            setor_id: (v.setor && v.setor.id) || null,
            resultado: v.estado === 'permitido' ? 'permitido' : 'negado',
            motivo: v.motivo || null,
        }).then(atualizarFila).then(function () { sincronizar(); });
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
        caixa.className = 'resposta ' + (
            v.estado === 'permitido' ? 'ok' :
            v.motivo === 'setor_nao_autorizado' ? 'porta' : 'recusa');
        $('resposta-marca').textContent = v.estado === 'permitido' ? '✓' : '✕';
        $('resposta-titulo').textContent = v.estado === 'permitido'
            ? 'PODE ENTRAR' : TITULOS[v.motivo] || 'RECUSADO';
        $('resposta-grande').textContent = '';
        $('resposta-motivo').textContent = '';

        if (v.estado === 'permitido') {
            $('resposta-detalhe').textContent = setor.nome;
            $('resposta-grande').textContent = 'nº ' + v.numero;
        } else if (v.motivo === 'evento_inativo') {
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
            $('resposta-detalhe').textContent =
                setor.nome + ' · nº ' + v.numero + ' — entrou às ' + hora(d.momentoAnterior);
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
            }).then(atualizarFila);
        }).catch(function (e) {
            if (e.status === 401) return aparelhoRevogado();
        }).then(function () { sincronizando = false; });
    }

    window.addEventListener('online', sincronizar);
    setInterval(sincronizar, 30000);

    // ── Amarração da tela ───────────────────────────────────────────────────

    $('btn-parear').onclick = function () {
        var codigo = ($('campo-codigo').value || '').trim().toUpperCase();
        $('erro-pareamento').classList.add('sumindo');
        $('btn-parear').disabled = true;
        parear(codigo).catch(function (e) {
            $('erro-pareamento').textContent = e.message;
            $('erro-pareamento').classList.remove('sumindo');
        }).then(function () { $('btn-parear').disabled = false; });
    };

    $('btn-proximo').onclick = function () {
        mostrar('lendo');
        ligarCamera();
    };

    $('btn-lanterna').onclick = function () {
        window.portariaCamera.alternarLanterna().then(function (acesa) {
            // O rotulo diz o ESTADO, nao a acao: no escuro, com a fila andando,
            // "Lanterna acesa" se le mais rapido que "Apagar".
            $('btn-lanterna').textContent = acesa ? 'Lanterna acesa' : 'Lanterna';
        });
    };

    $('btn-digitar').onclick = function () {
        $('caixa-digitar').classList.toggle('sumindo');
        $('campo-numero').focus();
    };

    $('btn-conferir').onclick = function () {
        var t = ($('campo-numero').value || '').trim();
        if (!t) return;
        $('campo-numero').value = '';
        // A camera continua ligada enquanto o <video> fica escondido -- sem
        // desligar aqui, ela pode pegar outro QR no meio da digitacao e
        // pintar a tela com a resposta ERRADA por cima da certa, meio
        // segundo depois. achou() (camera) ja desliga antes de validar;
        // aqui tem de ser igual. Achado em revisao de codigo, 15/08/2026.
        if (window.portariaCamera) window.portariaCamera.desligar();
        // Passa pelas MESMAS seis regras. Digitar nao e atalho -- e outra forma
        // de entrada, para o ingresso rasgado e para o codigo de barras que o
        // navegador do iPhone nao le.
        validarTexto(t);
    };

    $('btn-atualizar-evento').onclick = function () {
        // Sem este botao, um bloqueio criado pelo dono DEPOIS do pareamento
        // nunca chegava a este aparelho -- a regra 4 so valia para quem
        // pareou depois do bloqueio existir. Achado em revisao de codigo,
        // 15/08/2026.
        if (window.portariaCamera) window.portariaCamera.desligar();
        baixarCarga().catch(function () {
            // Uma atualizacao que falha NAO pode jogar o porteiro para a
            // tela de pareamento -- o aparelho ja esta pareado e
            // funcionando, so a atualizacao e que nao completou. Volta para
            // a leitura com a carga que ja tinha (baixarCarga so grava a
            // carga NOVA depois que TODAS as paginas chegam; uma pagina que
            // falha no meio nao troca nada no que ja estava salvo).
            entrarEmLeitura();
        });
    };

    $('btn-configurar-aparelho').onclick = function () {
        var botao = $('btn-configurar-aparelho');
        botao.disabled = true;
        irParaConfiguracao().then(function () { botao.disabled = false; });
    };

    // ── Partida ─────────────────────────────────────────────────────────────

    // Lembrar o evento ASSIM QUE A PAGINA ABRE, e nao so na hora de parear: o
    // porteiro abre o endereco compartilhado (`/portaria.html?e=<evento>`),
    // INSTALA o aplicativo, e so entao digita o codigo -- e o icone abre
    // `/portaria.html` sem query nenhuma. Guardar dentro do `parear` cobriria
    // so o caso que ja funcionava, com a URL ainda na tela.
    eventoDaUrl();

    estado.token = localStorage.getItem(CHAVE_TOKEN);
    if (!estado.token) {
        mostrar('pareando');
    } else if (recemConfigurado()) {
        recarregarDepoisDeConfigurar();
    } else {
        D.lerCarga().then(function (c) {
            if (c) { estado.carga = c; entrarEmLeitura(); sincronizar(); }
            else { baixarCarga().catch(function () { mostrar('pareando'); }); }
        });
    }

    function recemConfigurado() {
        try { return !!localStorage.getItem(CHAVE_RECONFIG); }
        catch (e) { return false; }   // aba anonima: nao ha marca a ler
    }

    window.portaria = {
        estado: estado, validarTexto: validarTexto,
        sincronizar: sincronizar, parear: parear, desparear: desparear,
    };
})();
