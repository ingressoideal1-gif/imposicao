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

    /**
     * As colunas que a peca PEDE: os nomes que os campos de banco dela leem,
     * sem repetir e na ordem em que aparecem.
     *
     * Repare que a peca nao declara isso em lugar nenhum -- sai dos proprios
     * campos. E de proposito: nenhuma numeracao existente precisa ser alterada
     * para entrar no caminho novo, que era a condicao do usuario.
     */
    function colunasQueAPecaPede(num) {
        var vistas = [];
        ((num && num.elements) || []).forEach(function (el) {
            if (!el || el.source !== 'database') return;
            var col = String(el.csv_column || '').trim();
            if (!col || vistas.indexOf(col) !== -1) return;
            vistas.push(col);
        });
        return vistas;
    }

    /**
     * As colunas pedidas que o banco do pedido nao consegue alimentar.
     *
     * Sem banco, nada falta: a peca le o CSV dela e quem avisa de coluna
     * errada continua sendo o `bancoDeDadosIncompletoDoModelo`.
     */
    function colunasQueFaltam(num, banco, mapa) {
        if (!banco) return [];
        var cabecalho = (banco.csv_headers || []).map(String);
        return colunasQueAPecaPede(num).filter(function (col) {
            return cabecalho.indexOf(colunaDoModelo(mapa, col)) === -1;
        });
    }

    /**
     * O mapa sem o que nao vale a pena guardar: entrada que aponta para a
     * propria coluna e entrada de coluna que a peca nao pede mais.
     *
     * Devolve `null` quando nao sobra nada -- ausente e mapa vazio significam a
     * mesma coisa em toda a regra, e guardar `{}` faria uma linha existir em
     * `pedidos_modelos_banco` para dizer que nao ha nada a dizer.
     */
    function mapaLimpo(mapa, pedidas) {
        if (_vazio(mapa)) return null;
        var saida = {}, quantas = 0;
        (pedidas || []).forEach(function (col) {
            var destino = mapa[col];
            if (destino === null || destino === undefined) return;
            destino = String(destino).trim();
            if (!destino || destino === col) return;
            saida[col] = destino;
            quantas++;
        });
        return quantas ? saida : null;
    }

    escopo.BancoDoModelo = {
        bancoDoModelo: bancoDoModelo,
        colunaDoModelo: colunaDoModelo,
        elementosDoModelo: elementosDoModelo,
        numeracaoResolvida: numeracaoResolvida,
        colunasQueAPecaPede: colunasQueAPecaPede,
        colunasQueFaltam: colunasQueFaltam,
        mapaLimpo: mapaLimpo
    };
})(typeof window !== 'undefined' ? window : globalThis);
