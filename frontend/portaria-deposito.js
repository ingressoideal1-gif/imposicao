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
        return comLoja('fila', 'readwrite', function (loja) {
            loja.put(leitura);            // `keyPath: id_local` ignora o repetido
        }).then(function () {
            if (leitura.resultado !== 'permitido' || !leitura.credencial_id) return;
            return comLoja('entradas', 'readwrite', function (loja) {
                loja.put(leitura.momento, leitura.credencial_id);
            });
        });
    }

    function lerFila(limite) {
        return comLoja('fila', 'readonly', function (loja, devolver) {
            var r = loja.getAll(undefined, limite);
            r.onsuccess = function () {
                // Mais antigas primeiro: se a rede cair no meio do envio, o que
                // fica para tras e o mais recente.
                devolver((r.result || []).sort(function (a, b) {
                    return String(a.momento || '').localeCompare(String(b.momento || ''));
                }));
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
