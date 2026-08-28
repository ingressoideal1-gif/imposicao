/**
 * De onde ESTE modelo tira o dado que vai para o papel.
 * ---------------------------------------------------------------------------
 *
 * Ate 27/08/2026 o CSV morava dentro da numeracao. Desenho e dado no mesmo
 * registro: reusar a peca em outro pedido arrastaria o dado do anterior, e a
 * saida era duplicar — 138 das 171 numeracoes do catalogo nasceram assim.
 *
 * Aqui o banco e um registro do pedido, e o modelo diz a qual deles se liga e
 * qual coluna do banco alimenta cada campo da peca.
 *
 * ── A regra que protege o que ja esta rodando ──────────────────────────────
 *
 * `numeracaoResolvida` sem banco e sem mapa devolve a PROPRIA peca, pela mesma
 * referencia. Nao e economia: o `garantirCsvDaNumeracao` guarda a referencia da
 * numeracao para escrever o `csv_data` nela quando o banco desce. Devolver uma
 * copia faria essa escrita cair num objeto que ninguem mais le, e o trabalho
 * sairia impresso com numero sequencial no lugar do nome da pessoa.
 */
(function (escopo) {
    'use strict';

    function _vazio(mapa) {
        return !mapa || typeof mapa !== 'object' || Object.keys(mapa).length === 0;
    }

    function bancoDoModelo(vinculo, bancos) {
        var id = vinculo && vinculo.banco_id;
        if (!id) return null;
        var achado = (bancos || []).find(function (b) {
            return b && String(b.id) === String(id);
        });
        return achado || null;
    }

    function colunaDoModelo(mapa, pedida) {
        if (_vazio(mapa)) return pedida;
        var destino = mapa[pedida];
        if (destino === null || destino === undefined) return pedida;
        destino = String(destino).trim();
        return destino === '' ? pedida : destino;
    }

    function elementosDoModelo(elements, mapa) {
        var lista = elements || [];
        if (_vazio(mapa)) return lista;
        return lista.map(function (el) {
            if (!el || el.source !== 'database') return el;
            var col = String(el.csv_column || '').trim();
            if (!col) return el;
            var novo = colunaDoModelo(mapa, col);
            if (novo === col) return el;
            return Object.assign({}, el, { csv_column: novo });
        });
    }

    function numeracaoResolvida(num, banco, mapa) {
        if (!num) return num;
        if (!banco && _vazio(mapa)) return num;   // o caminho de hoje, intacto
        var saida = Object.assign({}, num);
        if (banco) {
            saida.csv_data = banco.csv_data;
            saida.csv_headers = banco.csv_headers || [];
            saida.csv_filename = banco.csv_filename || '';
            saida.csv_url = banco.csv_url || '';
        }
        saida.elements = elementosDoModelo(num.elements, mapa);
        return saida;
    }

    escopo.BancoDoModelo = {
        bancoDoModelo: bancoDoModelo,
        colunaDoModelo: colunaDoModelo,
        elementosDoModelo: elementosDoModelo,
        numeracaoResolvida: numeracaoResolvida
    };
})(typeof window !== 'undefined' ? window : globalThis);
