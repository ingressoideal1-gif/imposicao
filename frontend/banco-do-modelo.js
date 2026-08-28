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

    /**
     * A coluna que ESTE elemento le neste modelo.
     *
     * Desde 28/08/2026 o apontamento e por ELEMENTO (`el:<id>` no mapa): a
     * peca nova nao tem `csv_column` — guarda so um "Exemplo:" — e a coluna e
     * escolhida no modelo, direto do banco anexado. A chave por elemento vence
     * SEMPRE; sem ela, vale o caminho legado (`csv_column` da peca, passado
     * pelo mapa por nome) — e e assim que toda numeracao ja criada continua
     * funcionando ate ser substituida, como o usuario exigiu.
     */
    function colunaDoElemento(mapa, el) {
        if (!el) return '';
        if (!_vazio(mapa) && el.id !== undefined && el.id !== null) {
            var porElemento = mapa['el:' + el.id];
            if (porElemento !== null && porElemento !== undefined) {
                porElemento = String(porElemento).trim();
                if (porElemento !== '') return porElemento;
            }
        }
        var col = String(el.csv_column || '').trim();
        if (!col) return '';
        return colunaDoModelo(mapa, col);
    }

    function elementosDoModelo(elements, mapa) {
        var lista = elements || [];
        if (_vazio(mapa)) return lista;
        return lista.map(function (el) {
            if (!el || el.source !== 'database') return el;
            var novo = colunaDoElemento(mapa, el);
            var col = String(el.csv_column || '').trim();
            if (novo === col || novo === '') return el;
            return Object.assign({}, el, { csv_column: novo });
        });
    }

    /**
     * Os elementos de banco deste modelo que ainda NAO tem coluna no banco:
     * sem apontamento nenhum, ou apontados para coluna que o banco nao tem.
     *
     * Sem banco, lista vazia — a peca le o CSV dela e quem avisa e o caminho
     * legado. Elemento sem coluna imprime VAZIO sem erro nenhum, entao esta
     * lista alimenta a trava de impressao e o aviso do card.
     */
    function elementosSemColunaNoBanco(num, banco, mapa) {
        if (!banco) return [];
        var cabecalho = (banco.csv_headers || []).map(String);
        return ((num && num.elements) || []).filter(function (el) {
            if (!el || el.source !== 'database') return false;
            var col = colunaDoElemento(mapa, el);
            return col === '' || cabecalho.indexOf(col) === -1;
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
    function mapaLimpo(mapa, pedidas, elementos) {
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
        // As chaves por ELEMENTO (28/08/2026): entram as dos elementos que a
        // peca ainda tem, com destino de verdade. Apontamento igual ao
        // `csv_column` legado do proprio elemento nao vale a pena guardar — o
        // fallback ja o encontra pelo nome.
        (elementos || []).forEach(function (el) {
            if (!el || el.source !== 'database' || el.id === undefined || el.id === null) return;
            var destino = mapa['el:' + el.id];
            if (destino === null || destino === undefined) return;
            destino = String(destino).trim();
            if (!destino) return;
            var legado = String(el.csv_column || '').trim();
            if (destino === legado) return;
            saida['el:' + el.id] = destino;
            quantas++;
        });
        return quantas ? saida : null;
    }

    /**
     * O mapa depois de o banco renomear colunas.
     *
     * A armadilha e a coluna IMPLICITA: quando a peca pede `NOME` e o banco tem
     * uma coluna `NOME`, nao existe entrada no mapa -- as duas se acham pelo
     * proprio nome. Renomeado o banco para `PARTICIPANTE`, o apontamento se
     * perde em silencio, e o campo passa a ler uma coluna que nao existe mais.
     *
     * Por isso a reconstrucao parte do que cada coluna pedida le HOJE, e nao
     * das entradas que o mapa por acaso tem: a implicita ganha entrada, a
     * explicita e atualizada, e o que nao foi renomeado fica como estava.
     */
    function mapaAposRenomear(mapa, pedidas, de2para, elementos) {
        var trocas = de2para || {};
        var novo = {};
        (pedidas || []).forEach(function (col) {
            var atual = colunaDoModelo(mapa, col);
            novo[col] = Object.prototype.hasOwnProperty.call(trocas, atual) ? trocas[atual] : atual;
        });
        // As chaves por elemento apontam DIRETO para a coluna do banco: a
        // renomeacao as acompanha uma a uma.
        (elementos || []).forEach(function (el) {
            if (!el || el.source !== 'database' || el.id === undefined || el.id === null) return;
            var atual = colunaDoElemento(mapa, el);
            if (!atual) return;
            novo['el:' + el.id] = Object.prototype.hasOwnProperty.call(trocas, atual) ? trocas[atual] : atual;
        });
        return mapaLimpo(novo, pedidas, elementos);
    }

    escopo.BancoDoModelo = {
        bancoDoModelo: bancoDoModelo,
        colunaDoModelo: colunaDoModelo,
        colunaDoElemento: colunaDoElemento,
        elementosDoModelo: elementosDoModelo,
        elementosSemColunaNoBanco: elementosSemColunaNoBanco,
        numeracaoResolvida: numeracaoResolvida,
        colunasQueAPecaPede: colunasQueAPecaPede,
        colunasQueFaltam: colunasQueFaltam,
        mapaLimpo: mapaLimpo,
        mapaAposRenomear: mapaAposRenomear
    };
})(typeof window !== 'undefined' ? window : globalThis);
