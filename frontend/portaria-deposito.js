/**
 * O que o aparelho da portaria guarda no proprio celular.
 *
 * Tres lojas, e cada uma existe por um motivo diferente:
 *
 *   carga    -- o evento inteiro, baixado uma vez. E o que permite decidir sem
 *               rede, que e a razao de a parte 2 existir.
 *   fila     -- as leituras que AINDA NAO subiram. Encolhe quando o servidor
 *               confirma. Se uma linha se perder aqui, a contagem que o cliente
 *               pagou para ter sai errada e ninguem descobre.
 *   entradas -- quem ja entrou, por credencial. Separada da fila DE PROPOSITO:
 *               a fila esvazia quando a rede volta, e a regra `ja_entrou` tem de
 *               continuar valendo depois disso. A pessoa entrou as 21h, a fila
 *               subiu as 21h05, e as 22h ela tenta de novo. Guarda tambem o que
 *               os OUTROS portoes leram, que chega pelo sincronismo.
 *   totais   -- quantos ja entraram em cada setor, o numero do contador. Vem do
 *               servidor, que e quem enxerga todos os portoes. Fica gravado
 *               porque o contador nao pode nascer zerado no meio do evento: o
 *               porteiro nao tem como desconfiar de um numero errado na tela.
 */
(function () {
    'use strict';

    var NOME = 'ideal-portaria';
    // Subiu de 1 para 2 quando a loja `totais` entrou. Loja nova SO nasce dentro
    // de um `onupgradeneeded`, e ele so roda se a versao pedida for maior que a
    // gravada -- sem subir o numero, o celular que ja tem o banco antigo abriria
    // sem `totais` e quebraria no portao, e nao aqui.
    var VERSAO = 2;
    var bd = null;

    function abrir() {
        if (bd) return Promise.resolve(bd);
        return new Promise(function (ok, erro) {
            var req = indexedDB.open(NOME, VERSAO);
            req.onupgradeneeded = function () {
                // Cada loja e criada SO se faltar, e nenhuma e apagada ou
                // recriada. E o que faz a migracao do banco antigo preservar a
                // fila: leitura que ainda nao subiu e contagem que o cliente
                // pagou para ter, e um `createObjectStore` por cima (ou um
                // `deleteObjectStore` "para comecar limpo") a jogaria fora sem
                // ninguem perceber -- so no meio do evento, no portao.
                var b = req.result;
                if (!b.objectStoreNames.contains('carga')) b.createObjectStore('carga');
                if (!b.objectStoreNames.contains('fila')) {
                    b.createObjectStore('fila', { keyPath: 'id_local' });
                }
                if (!b.objectStoreNames.contains('entradas')) b.createObjectStore('entradas');
                if (!b.objectStoreNames.contains('totais')) b.createObjectStore('totais');
            };
            req.onsuccess = function () { bd = req.result; ok(bd); };
            req.onerror = function () { erro(req.error); };
        });
    }

    function comLoja(nome, modo, tarefa) {
        return abrir().then(function (b) {
            return new Promise(function (ok, erro) {
                var t = b.transaction(nome, modo);
                var resultado;
                tarefa(t.objectStore(nome), function (v) { resultado = v; });
                t.oncomplete = function () { ok(resultado); };
                t.onerror = function () { erro(t.error); };
            });
        });
    }

    // Variante para quando duas lojas precisam terminar juntas ou nenhuma
    // terminar -- `enfileirar` usa para `fila` e `entradas` nao se separarem
    // se o app morrer no meio do caminho. `tarefa` recebe a transacao inteira
    // e busca cada loja com `t.objectStore(nome)`.
    function comLojas(nomes, modo, tarefa) {
        return abrir().then(function (b) {
            return new Promise(function (ok, erro) {
                var t = b.transaction(nomes, modo);
                var resultado;
                t.oncomplete = function () { ok(resultado); };
                t.onerror = function () { erro(t.error); };
                t.onabort = function () { erro(t.error || new Error('Gravação local cancelada.')); };
                try { tarefa(t, function (v) { resultado = v; }); }
                catch (e) { t.abort(); erro(e); }
            });
        });
    }

    function gravarCarga(carga) {
        return comLoja('carga', 'readwrite', function (loja) {
            loja.clear();                 // substitui a carga INTEIRA
            loja.put(carga, 'unica');
            loja.put(carga.entradas_zeradas_em || null, 'zeramento');
        });
    }

    function lerCarga() {
        return comLoja('carga', 'readonly', function (loja, devolver) {
            var r = loja.get('unica');
            r.onsuccess = function () { devolver(r.result === undefined ? null : r.result); };
        });
    }

    // Primeira carga por QR: só anuncia pronta depois de gravar o evento,
    // as entradas e os totais juntos. Uma fila pendente impede a troca.
    function gravarEventoPreparado(cargaNova) {
        return comLojas(['carga', 'entradas', 'totais', 'fila'], 'readwrite', function (t) {
            var conta = t.objectStore('fila').count();
            conta.onsuccess = function () {
                if (conta.result) { t.abort(); return; }
                var carga = t.objectStore('carga'), entradas = t.objectStore('entradas'), totais = t.objectStore('totais');
                carga.clear(); entradas.clear(); totais.clear();
                carga.put(cargaNova, 'unica');
                carga.put(cargaNova.entradas_zeradas_em || null, 'zeramento');
                Object.keys(cargaNova.entradas || {}).forEach(function (id) { entradas.put(cargaNova.entradas[id], id); });
                Object.keys(cargaNova.totais || {}).forEach(function (id) { totais.put(cargaNova.totais[id], id); });
            };
        });
    }

    function antesDoZeramento(momento, marca) {
        var limite = Date.parse(marca);
        return !isNaN(limite) && Date.parse(momento) <= limite;
    }

    // Carga, entradas e totais passam a representar o mesmo sincronismo, ou
    // nenhuma loja muda. A fila continua até o servidor confirmar seu recebimento.
    function gravarNovidades(novidade, eventoId) {
        return comLojas(['carga', 'entradas', 'totais'], 'readwrite', function (t, devolver) {
            var carga = t.objectStore('carga');
            var pedido = carga.get('unica');
            pedido.onsuccess = function () {
                try {
                    var atual = pedido.result;
                    if (!atual || !atual.evento || atual.evento.id !== eventoId) {
                        throw new Error('O evento do aparelho mudou durante o sincronismo.');
                    }
                    var marcaAtual = Date.parse(atual.entradas_zeradas_em);
                    var marcaRecebida = Date.parse(novidade.entradas_zeradas_em);
                    // Resposta iniciada antes de um zeramento já aplicado.
                    if (!isNaN(marcaAtual) && (isNaN(marcaRecebida) || marcaRecebida < marcaAtual)) {
                        devolver(atual);
                        return;
                    }
                    var nova = window.portariaSincronismo.aplicar(atual, novidade);
                    var marca = nova.entradas_zeradas_em;
                    var entradas = t.objectStore('entradas');
                    function juntarEntradas() {
                        (novidade.entradas || []).forEach(function (e) {
                            if (!e || !e.credencial_id || !e.momento || antesDoZeramento(e.momento, marca)) return;
                            var existente = entradas.get(e.credencial_id);
                            existente.onsuccess = function () {
                                if (!existente.result || Date.parse(e.momento) < Date.parse(existente.result)) {
                                    entradas.put(e.momento, e.credencial_id);
                                }
                            };
                        });
                    }
                    if (!isNaN(Date.parse(marca))) {
                        var cursor = entradas.openCursor();
                        cursor.onsuccess = function () {
                            var item = cursor.result;
                            if (item) {
                                if (antesDoZeramento(item.value, marca)) item.delete();
                                item.continue();
                            } else juntarEntradas();
                        };
                    } else juntarEntradas();
                    // Reaplicar a marca também repara cargas gravadas pela versão
                    // antiga, que zerava o mapa da carga mas deixava a loja intacta.
                    Object.keys(nova.entradas || {}).forEach(function (id) {
                        if (antesDoZeramento(nova.entradas[id], marca)) delete nova.entradas[id];
                    });
                    var totais = t.objectStore('totais');
                    if (!isNaN(marcaRecebida) && (isNaN(marcaAtual) || marcaRecebida > marcaAtual)) totais.clear();
                    Object.keys(novidade.totais || {}).forEach(function (id) { totais.put(novidade.totais[id], id); });
                    carga.put(nova, 'unica');
                    carga.put(marca || null, 'zeramento');
                    devolver(nova);
                } catch (e) { t.abort(); }
            };
        });
    }

    function enfileirar(leitura) {
        // MESMA transacao para `fila` e `entradas`: se o app morrer entre
        // gravar a leitura na fila e marcar a entrada -- celular ligado horas
        // a fio, bateria acabando, troca de app -- o IndexedDB desfaz as duas
        // juntas. Duas transacoes separadas deixariam a leitura na fila sem a
        // marca de entrada, e depois que a fila subisse e fosse removida essa
        // credencial nunca apareceria em `entradasPermitidas()`.
        return comLojas(['carga', 'fila', 'entradas'], 'readwrite', function (t, devolver) {
            t.objectStore('fila').put(leitura);   // `keyPath: id_local` ignora o repetido
            // Uma chave leve evita clonar milhares de credenciais por leitura.
            var marca = t.objectStore('carga').get('zeramento');
            marca.onsuccess = function () {
                // Uma leitura em voo não pode recriar a entrada que um
                // sincronismo concorrente acabou de zerar.
                var zerada = antesDoZeramento(leitura.momento, marca.result);
                if (!zerada && leitura.resultado === 'permitido' && leitura.credencial_id) {
                    t.objectStore('entradas').put(leitura.momento, leitura.credencial_id);
                }
                devolver(!zerada);
            };
        });
    }

    function lerFila(limite) {
        return comLoja('fila', 'readonly', function (loja, devolver) {
            // `getAll(query, count)` corta pela ordem da CHAVE PRIMARIA
            // (`id_local`, um UUID sem relacao com o tempo), NAO pela ordem de
            // chegada -- limitar ali e so entao ordenar reordenaria um
            // subconjunto ja cortado errado, podendo descartar a leitura mais
            // antiga (a mais dificil de reconstituir se a rede cair nesse
            // meio-tempo). Por isso le a fila inteira (volume e de centenas de
            // leituras) e so corta em JavaScript, DEPOIS de ordenar.
            var r = loja.getAll();
            r.onsuccess = function () {
                // Mais antigas primeiro: se a rede cair no meio do envio, o que
                // fica para tras e o mais recente.
                var ordenada = (r.result || []).sort(function (a, b) {
                    return String(a.momento || '').localeCompare(String(b.momento || ''));
                });
                devolver(ordenada.slice(0, limite));
            };
        });
    }

    function removerDaFila(idsLocais) {
        return comLoja('fila', 'readwrite', function (loja) {
            (idsLocais || []).forEach(function (id) { loja.delete(id); });
        });
    }

    function contarFila() {
        return comLoja('fila', 'readonly', function (loja, devolver) {
            var r = loja.count();
            r.onsuccess = function () { devolver(r.result); };
        });
    }

    function entradasPermitidas() {
        return comLoja('entradas', 'readonly', function (loja, devolver) {
            var chaves = loja.getAllKeys();
            var valores = loja.getAll();
            valores.onsuccess = function () {
                var mapa = {};
                (chaves.result || []).forEach(function (k, i) { mapa[k] = valores.result[i]; });
                devolver(mapa);
            };
        });
    }

    function gravarEntradas(mapa) {
        // As entradas que o sincronismo trouxe -- inclusive as dos OUTROS
        // portoes. JUNTA, nunca substitui: a fila deste aparelho pode ter
        // leituras que ainda nao subiram, e o servidor nao sabe delas. Trocar o
        // mapa inteiro pelo dele apagaria justamente essas, e a mesma credencial
        // passaria de novo por aqui como se nunca tivesse entrado.
        return comLoja('entradas', 'readwrite', function (loja) {
            Object.keys(mapa || {}).forEach(function (credencial) {
                var deFora = mapa[credencial];
                if (!deFora) return;
                var atual = loja.get(credencial);
                atual.onsuccess = function () {
                    // Empate de credencial: vence o momento MAIS ANTIGO. Quem
                    // entrou primeiro entrou primeiro, e e esse horario que a
                    // faixa vermelha mostra quando o porteiro pergunta "ja
                    // entrou quando?". Relogio de servidor nao reescreve o que
                    // este aparelho registrou antes, nem o contrario.
                    var aqui = atual.result;
                    if (aqui === undefined ||
                        String(deFora).localeCompare(String(aqui)) < 0) {
                        loja.put(deFora, credencial);
                    }
                };
            });
        });
    }

    function gravarTotais(mapa) {
        // Quantos ja entraram em cada setor, somando todos os portoes -- so o
        // servidor enxerga isso. JUNTA por setor: o sincronismo manda o que
        // mudou, e zerar na tela o setor que ficou parado seria inventar uma
        // queda de publico que nao houve.
        return comLoja('totais', 'readwrite', function (loja) {
            Object.keys(mapa || {}).forEach(function (setor) {
                loja.put(mapa[setor], setor);
            });
        });
    }

    function lerTotais() {
        return comLoja('totais', 'readonly', function (loja, devolver) {
            var chaves = loja.getAllKeys();
            var valores = loja.getAll();
            valores.onsuccess = function () {
                var mapa = {};
                (chaves.result || []).forEach(function (k, i) { mapa[k] = valores.result[i]; });
                devolver(mapa);
            };
        });
    }

    function esquecerFila() {
        // Existe para UM caso, e nao deve ser usada fora dele: o aparelho
        // trocou de EVENTO. A fila e gravada no servidor com o evento do token
        // ATUAL, entao leitura que sobrou do evento anterior viraria entrada de
        // um evento contada em outro.
        //
        // Em qualquer outra situacao, apagar a fila e perder a contagem que o
        // cliente pagou para ter -- e por isso que nem o 401 da sincronizacao
        // faz isso (ver `aparelhoRevogado`, no portaria.js). `entradas` fica:
        // a chave dela e o id da credencial, unico entre eventos, entao o que e
        // do evento antigo simplesmente nunca casa.
        return comLoja('fila', 'readwrite', function (loja) { loja.clear(); });
    }

    function limpar() {
        // Despareou: nada do evento anterior pode ficar. Os totais entram aqui
        // porque contador de um cliente na tela do outro e numero errado.
        return Promise.all(['carga', 'fila', 'entradas', 'totais'].map(function (nome) {
            return comLoja(nome, 'readwrite', function (loja) { loja.clear(); });
        })).then(function () { });
    }

    window.portariaDeposito = {
        gravarEventoPreparado: gravarEventoPreparado,
        gravarCarga: gravarCarga, lerCarga: lerCarga,
        gravarNovidades: gravarNovidades,
        enfileirar: enfileirar, lerFila: lerFila,
        removerDaFila: removerDaFila, contarFila: contarFila,
        entradasPermitidas: entradasPermitidas, gravarEntradas: gravarEntradas,
        gravarTotais: gravarTotais, lerTotais: lerTotais,
        esquecerFila: esquecerFila, limpar: limpar,
    };
})();
