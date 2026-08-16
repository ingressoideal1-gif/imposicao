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

    var estado = { carga: null, token: null, pendente: null };

    function $(id) { return document.getElementById(id); }
    function mostrar(qual) {
        ['pareando', 'carregando', 'lendo', 'resposta', 'ambiguo'].forEach(function (t) {
            $('tela-' + t).classList.toggle('sumindo', t !== qual);
        });
    }

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
        return new URLSearchParams(window.location.search).get('e') || '';
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

    function desparear() {
        // Despareamento DELIBERADO -- o operador escolheu tirar este evento
        // do aparelho (celular trocado de mao, por exemplo). Apaga TUDO:
        // carga, fila e entradas. Nao chamar isto a partir de um 401 de
        // sincronizacao: ver `aparelhoRevogado` abaixo.
        localStorage.removeItem(CHAVE_TOKEN);
        estado.token = null;
        estado.carga = null;
        return D.limpar().then(function () { mostrar('pareando'); });
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

    function entrarEmLeitura() {
        var c = estado.carga;
        $('topo-aparelho').textContent = c.aparelho.nome;
        $('topo-setores').textContent = c.aparelho.setores.map(function (id) {
            var s = c.setores.filter(function (x) { return x.id === id; })[0];
            return s ? s.nome : id;
        }).join(' · ');
        atualizarFila();
        mostrar('lendo');
        if (window.portariaCamera) window.portariaCamera.ligar();
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
        desconhecido: 'NÃO É DESTE EVENTO',
        setor_nao_autorizado: 'OUTRA PORTA',
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
        } else if (v.motivo === 'setor_nao_autorizado') {
            $('resposta-detalhe').textContent =
                'Este ingresso é ' + (setor.nome || 'de outro setor') + '. Este aparelho lê ' +
                (d.setoresDoAparelho || []).join(', ') + '.';
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
        if (window.portariaCamera) window.portariaCamera.ligar();
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

    // ── Partida ─────────────────────────────────────────────────────────────

    estado.token = localStorage.getItem(CHAVE_TOKEN);
    if (!estado.token) {
        mostrar('pareando');
    } else {
        D.lerCarga().then(function (c) {
            if (c) { estado.carga = c; entrarEmLeitura(); sincronizar(); }
            else { baixarCarga().catch(function () { mostrar('pareando'); }); }
        });
    }

    window.portaria = {
        estado: estado, validarTexto: validarTexto,
        sincronizar: sincronizar, parear: parear, desparear: desparear,
    };
})();
