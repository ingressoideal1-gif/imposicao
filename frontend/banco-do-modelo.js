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

    function agruparPorVia({ headers, rows }, celulas, vias) {
        const esperado = celulas * vias;
        if (!Number.isSafeInteger(celulas) || celulas < 1 || !Number.isSafeInteger(vias)
                || vias < 1 || !Number.isSafeInteger(esperado)) {
            throw new Error('Confira a quantidade de células e as vias do gabarito TICKET.');
        }
        if (!headers.length || rows.length !== esperado) {
            const diferenca = esperado - rows.length;
            const complemento = diferenca > 0 ? ` Faltam ${diferenca}.` : diferenca < 0 ? ` Sobram ${-diferenca}.` : '';
            throw new Error(`Este modelo exige ${esperado} linhas de dados (${celulas} células × ${vias} vias). O CSV tem ${rows.length}.${complemento}`);
        }
        const colunas = Array.from({ length: vias }, (_, via) =>
            headers.map(origem => ({ origem, destino: `Ticket ${via + 1} · ${origem}` })));
        const agrupadas = [];
        for (let inicio = 0; inicio < rows.length; inicio += vias) {
            const celula = {};
            for (let via = 0; via < vias; via++) {
                const linha = rows[inicio + via];
                if (!linha || !headers.some(coluna => String(linha[coluna] ?? '').trim() !== '')) {
                    throw new Error(`A linha de dados ${inicio + via + 1} (Ticket ${via + 1}) está vazia.`);
                }
                for (const { origem, destino } of colunas[via]) celula[destino] = linha[origem];
            }
            agrupadas.push(celula);
        }
        return { headers: colunas.flat().map(coluna => coluna.destino), rows: agrupadas };
    }

    // Um excedente só pode ficar fora da geração se a coluna comprovar a
    // sequência inteira desde o NI, inclusive o excedente.
    function sequenciaDesde(rows, coluna, inicio) {
        if (!Number.isSafeInteger(inicio) || inicio < 0 || !Number.isSafeInteger(inicio + rows.length)) return false;
        const separar = valor => /^((?:https?:\/\/[^\s]+\/)?)(\d+)$/i.exec(String(valor ?? '').trim());
        const primeiro = separar(rows[0]?.[coluna]);
        return !!primeiro && rows.every((linha, i) => {
            const parte = separar(linha?.[coluna]);
            return !!parte && parte[1] === primeiro[1] && Number(parte[2]) === inicio + i;
        });
    }

    function atribuirVias(campos, vias) {
        const grupos = new Map();
        for (const campo of campos) {
            const el = campo.el;
            campo.face = el.face || 'both';
            if (el.ticket_pos != null) {
                campo.via = Number(el.ticket_pos);
                if (typeof el.ticket_pos === 'boolean' || !Number.isSafeInteger(campo.via)
                        || campo.via < 1 || campo.via > vias) throw new Error('Confira a posição do Ticket nos campos do banco.');
            }
            const chave = `${campo.face}:${el.type}`;
            if (!grupos.has(chave)) grupos.set(chave, []);
            grupos.get(chave).push(campo);
        }
        const ancoras = new Map();
        const prioridade = tipo => ({ QR: 3, BARCODE: 2, TEXT: 1 }[tipo] || 0);
        for (const grupo of grupos.values()) {
            if (grupo.length !== vias) continue;
            const ocupadas = new Set(grupo.filter(c => c.via).map(c => c.via));
            if (ocupadas.size === vias - 1 && grupo.filter(c => !c.via).length === 1) {
                const faltante = Array.from({length: vias}, (_, i) => i + 1).find(via => !ocupadas.has(via));
                grupo.find(c => !c.via).via = faltante;
            }
            if (new Set(grupo.map(c => c.via)).size === vias && grupo.every(c => c.via)) {
                const anterior = ancoras.get(grupo[0].face);
                if (!anterior || prioridade(grupo[0].el.type) > prioridade(anterior[0].el.type)) {
                    ancoras.set(grupo[0].face, grupo);
                }
            }
        }
        // Gabaritos antigos podem ter texto alinhado aos QRs sem ticket_pos.
        // Usa a separação predominante das vias e exige pareamento inequívoco.
        for (const grupo of grupos.values()) {
            const pendentes = grupo.filter(c => !c.via);
            if (!pendentes.length) continue;
            const base = ancoras.get(grupo[0].face) || ancoras.get('both');
            if (!base) throw new Error('Defina a posição do Ticket nos campos do banco.');
            const medida = eixo => base.map(c => Number(c.el[eixo]));
            const amplitude = pontos => Math.max(...pontos) - Math.min(...pontos);
            const eixo = amplitude(medida('y_mm')) > amplitude(medida('x_mm')) ? 'y_mm' : 'x_mm';
            const pontos = medida(eixo);
            const ocupadas = new Set(grupo.filter(c => c.via).map(c => c.via));
            for (const campo of pendentes) {
                const pos = Number(campo.el[eixo]);
                const perto = base.map((c, i) => ({ via: c.via, d: Math.abs(pos - pontos[i]) })).sort((a, b) => a.d - b.d);
                if (campo.el[eixo] == null || !perto.every(c => Number.isFinite(c.d))
                        || Math.abs(perto[0].d - perto[1].d) < 0.000001
                        || ocupadas.has(perto[0].via)) throw new Error('Defina a posição do Ticket nos campos do banco.');
                campo.via = perto[0].via;
                ocupadas.add(campo.via);
            }
        }
    }

    const cachePorBanco = new WeakMap();

    function bancoPorVia(num, banco, mapa, item) {
        const vias = Number(num.ticket_qtd);
        const celulas = Number(item?.qtd ?? item?.quantidade);
        const total = celulas * vias;
        const rows = banco.csv_data;
        if (num.tipo !== 'TICKET' || !Number.isSafeInteger(vias) || vias < 2
                || !Number.isSafeInteger(celulas) || celulas < 1 || !Number.isSafeInteger(total)
                || !Array.isArray(rows) || rows.length <= celulas) return null;
        const headers = (banco.csv_headers || []).map(String);
        if (headers.some(col => /^Ticket \d+ · /.test(col))) return null;
        const campos = (num.elements || []).filter(el => el?.source === 'database' && !el.fixed)
            .map(el => ({ el, coluna: colunaDoElemento(mapa, el) || (headers.length === 1 ? headers[0] : '') }));
        const chaves = campos.filter(c => c.coluna)
            .map(c => JSON.stringify([c.el.face || 'both', c.el.type, c.coluna]));
        // O banco já distribuído em colunas diferentes permanece no formato por célula.
        if (new Set(chaves).size === chaves.length) return null;

        const inicioBruto = item?.numeracao_inicio ?? item?.num_inicial ?? item?.NUMERACAO_INICIO;
        const inicio = inicioBruto == null || inicioBruto === '' ? NaN : Number(inicioBruto);
        const selecao = item?.csv_selecao;
        const posicoes = JSON.stringify(campos.map(({ el, coluna }) =>
            [el.id, el.type, el.face, el.ticket_pos, el.x_mm, el.y_mm, coluna]));
        const cache = cachePorBanco.get(banco);
        if (cache?.num === num && cache.elements === num.elements && cache.rows === rows && cache.headers === banco.csv_headers
                && cache.posicoes === posicoes && cache.celulas === celulas && cache.vias === vias
                && Object.is(cache.inicio, inicio) && cache.selecao === selecao) return cache.resultado;
        let resultado;
        try {
            if (selecao || rows.some(linha => linha?.__ativo === false)) {
                throw new Error('Confira a seleção e as linhas inativas do banco antes de agrupar as vias.');
            }
            const colunas = [...new Set(campos.map(c => c.coluna))];
            if (colunas.some(col => !headers.includes(col))) throw new Error('Associe as colunas do banco aos campos do Ticket.');
            const codigos = [...new Set(campos.filter(c => ['QR', 'BARCODE'].includes(c.el.type)).map(c => c.coluna))];
            const identificadores = codigos.length ? codigos : colunas;
            if (rows.length > total && !identificadores.every(col => sequenciaDesde(rows, col, inicio))) {
                throw new Error(`São esperadas ${total} linhas por via. Confira os registros excedentes e a faixa do modelo.`);
            }
            const agrupada = agruparPorVia({ headers, rows: rows.slice(0, total) }, celulas, vias);
            atribuirVias(campos, vias);
            const porElemento = new Map(campos.map(c => [c.el, `Ticket ${c.via} · ${c.coluna}`]));
            const usadas = [...new Set(porElemento.values())];
            if (agrupada.rows.some(linha => usadas.some(col => !String(linha[col] ?? '').trim()))) {
                throw new Error('Há campos vazios em uma ou mais vias. Confira as colunas e as linhas do banco.');
            }
            resultado = {
                csv_headers: agrupada.headers, csv_data: agrupada.rows,
                elements: (num.elements || []).map(el => porElemento.has(el)
                    ? { ...el, csv_column: porElemento.get(el) } : el),
                banco_ticket_por_via: { linhas: total, celulas, excedentes: rows.length - total }
            };
        } catch (erro) {
            resultado = { csv_data: [], erro_banco_ticket: erro.message };
        }
        cachePorBanco.set(banco, { num, elements: num.elements, rows, headers: banco.csv_headers, posicoes, celulas, vias, inicio, selecao, resultado });
        return resultado;
    }

    function numeracaoResolvida(num, banco, mapa, item) {
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
        if (banco && item) {
            const porVia = bancoPorVia(num, banco, mapa, item);
            if (porVia) Object.assign(saida, porVia);
            else if (num.tipo === 'TICKET') {
                const headers = saida.csv_headers.map(String);
                saida.elements = saida.elements.map(el => {
                    if (el?.source !== 'database' || el.fixed || el.ticket_pos == null || !el.csv_column) return el;
                    const familia = /^Ticket \d+ · (.+)$/.exec(el.csv_column);
                    const nome = familia?.[1] ?? el.csv_column;
                    if (!familia && !headers.some(h => /^Ticket \d+ · /.test(h) && h.slice(h.indexOf(' · ') + 3) === nome)) return el;
                    const destino = `Ticket ${el.ticket_pos} · ${nome}`;
                    return destino === el.csv_column ? el : { ...el, csv_column: destino };
                });
            }
        }
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

    function mostrarCampoNaPrevia(num, item, el, linha, total) {
        if (num?.erro_banco_ticket && el.source === 'database' && !el.fixed) return false;
        if (num?.tipo !== 'TICKET' || el.fixed || el.source !== 'database'
                || (el.type !== 'QR' && el.type !== 'TEXT')) return true;

        // Cada linha da prévia representa uma célula física. Um CSV ainda
        // organizado por via não serve para desenhar a célula do pedido.
        const qtd = Number(item?.qtd ?? item?.quantidade);
        if (Number.isSafeInteger(qtd) && qtd > 0 && total !== qtd) return false;
        const coluna = el.csv_column;
        return Boolean(coluna && linha && Object.prototype.hasOwnProperty.call(linha, coluna)
            && String(linha[coluna] ?? '').trim());
    }

    escopo.BancoDoModelo = {
        agruparPorVia: agruparPorVia,
        bancoDoModelo: bancoDoModelo,
        colunaDoModelo: colunaDoModelo,
        colunaDoElemento: colunaDoElemento,
        elementosDoModelo: elementosDoModelo,
        elementosSemColunaNoBanco: elementosSemColunaNoBanco,
        numeracaoResolvida: numeracaoResolvida,
        mostrarCampoNaPrevia: mostrarCampoNaPrevia,
        colunasQueAPecaPede: colunasQueAPecaPede,
        colunasQueFaltam: colunasQueFaltam,
        mapaLimpo: mapaLimpo,
        mapaAposRenomear: mapaAposRenomear
    };
})(typeof window !== 'undefined' ? window : globalThis);
