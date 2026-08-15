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
 *               subiu as 21h05, e as 22h ela tenta de novo.
 */
(function () {
    'use strict';

    var NOME = 'ideal-portaria';
    var VERSAO = 1;
    var bd = null;

    function abrir() {
        if (bd) return Promise.resolve(bd);
        return new Promise(function (ok, erro) {
            var req = indexedDB.open(NOME, VERSAO);
            req.onupgradeneeded = function () {
                var b = req.result;
                if (!b.objectStoreNames.contains('carga')) b.createObjectStore('carga');
                if (!b.objectStoreNames.contains('fila')) {
                    b.createObjectStore('fila', { keyPath: 'id_local' });
                }
                if (!b.objectStoreNames.contains('entradas')) b.createObjectStore('entradas');
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
                tarefa(t, function (v) { resultado = v; });
                t.oncomplete = function () { ok(resultado); };
                t.onerror = function () { erro(t.error); };
            });
        });
    }

    function gravarCarga(carga) {
        return comLoja('carga', 'readwrite', function (loja) {
            loja.clear();                 // substitui a carga INTEIRA
            loja.put(carga, 'unica');
        });
    }

    function lerCarga() {
        return comLoja('carga', 'readonly', function (loja, devolver) {
            var r = loja.get('unica');
            r.onsuccess = function () { devolver(r.result === undefined ? null : r.result); };
        });
    }

    function enfileirar(leitura) {
        // MESMA transacao para `fila` e `entradas`: se o app morrer entre
        // gravar a leitura na fila e marcar a entrada -- celular ligado horas
        // a fio, bateria acabando, troca de app -- o IndexedDB desfaz as duas
        // juntas. Duas transacoes separadas deixariam a leitura na fila sem a
        // marca de entrada, e depois que a fila subisse e fosse removida essa
        // credencial nunca apareceria em `entradasPermitidas()`.
        return comLojas(['fila', 'entradas'], 'readwrite', function (t) {
            t.objectStore('fila').put(leitura);   // `keyPath: id_local` ignora o repetido
            if (leitura.resultado === 'permitido' && leitura.credencial_id) {
                t.objectStore('entradas').put(leitura.momento, leitura.credencial_id);
            }
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

    function limpar() {
        return Promise.all(['carga', 'fila', 'entradas'].map(function (nome) {
            return comLoja(nome, 'readwrite', function (loja) { loja.clear(); });
        })).then(function () { });
    }

    window.portariaDeposito = {
        gravarCarga: gravarCarga, lerCarga: lerCarga,
        enfileirar: enfileirar, lerFila: lerFila,
        removerDaFila: removerDaFila, contarFila: contarFila,
        entradasPermitidas: entradasPermitidas, limpar: limpar,
    };
})();
