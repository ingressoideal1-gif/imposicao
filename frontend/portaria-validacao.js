/**
 * As seis regras que decidem se uma pessoa entra no evento.
 *
 * PURO de proposito: nada de rede, DOM ou IndexedDB aqui. E onde mora a decisao
 * de deixar alguem entrar, e queremos poder testa-la com dados de mesa, sem
 * camera e sem navegador de verdade -- do jeito que o
 * `tests/test_portaria_validacao.py` faz.
 *
 * A ORDEM DAS REGRAS E A RESPOSTA. Um ingresso pode falhar por dois motivos ao
 * mesmo tempo, e o porteiro precisa ouvir o que ele consegue resolver:
 *
 *   1. desconhecido          -- nao e deste evento
 *   2. setor_nao_autorizado  -- e deste evento, mas de outra porta
 *   3. fora_da_janela        -- o setor ainda nao abriu, ou ja fechou
 *   4. bloqueado             -- o dono suspendeu esta faixa, e disse por que
 *   5. ja_entrou             -- so para setor de entrada unica
 *   6. permitido
 *
 * Trocar essa ordem nao quebra nada visivelmente: so faz a tela dizer a coisa
 * errada, na frente da fila.
 */
(function () {
    'use strict';

    /** O pedido escrito no comeco do QR Ideal, ao contrario. "06581" -> "18560". */
    function pedidoDoConteudo(texto) {
        if (typeof texto !== 'string' || texto.length < 9) return null;
        // O codigo do pool tem SEMPRE 8 caracteres; o resto, invertido, e o pedido.
        return texto.slice(0, texto.length - 8).split('').reverse().join('');
    }

    /**
     * Os sais a tentar, na ordem.
     *
     * QR Ideal carrega o pedido dentro do proprio codigo, entao ha um sal certo
     * e um hash so. Codigo comum e apenas `000001`: nao diz de que pedido e, e o
     * aparelho tenta o sal de cada pedido do evento mais o do evento (que e o
     * dos codigos que o cliente importou). Sao poucos por evento.
     */
    function saisParaTentar(texto, carga) {
        var sais = carga.sais || {};
        var doPedido = pedidoDoConteudo(texto);
        if (doPedido && sais[doPedido]) return [sais[doPedido]];

        var todos = Object.keys(sais).map(function (p) { return sais[p]; });
        if (carga.evento && carga.evento.sal) todos.push(carga.evento.sal);
        return todos;
    }

    function setorPorId(carga, id) {
        var achados = (carga.setores || []).filter(function (s) { return s.id === id; });
        return achados.length ? achados[0] : null;
    }

    function nomesDosSetoresDoAparelho(carga) {
        return ((carga.aparelho || {}).setores || []).map(function (id) {
            var s = setorPorId(carga, id);
            return s ? s.nome : id;
        });
    }

    function negado(motivo, cand, setor, detalhe) {
        return {
            estado: 'negado',
            motivo: motivo,
            credencial_id: cand ? cand.id : null,
            numero: cand ? cand.n : null,
            setor: setor || null,
            detalhe: detalhe || {},
        };
    }

    function decidir(entrada) {
        var carga = entrada.carga;
        var hashes = entrada.hashes || [];
        var agora = entrada.agora;
        var entradas = entrada.entradas || {};
        var escolhido = entrada.setorEscolhido || null;
        var autorizados = (carga.aparelho || {}).setores || [];

        // 1. Nao e deste evento.
        var todos = (carga.credenciais || []).filter(function (c) {
            return hashes.indexOf(c.h) !== -1;
        });
        if (!todos.length) return negado('desconhecido', null, null, {});

        // 2. E deste evento, mas de outra porta. A carga traz o evento INTEIRO
        //    justamente para este caso existir: se trouxesse so os setores
        //    autorizados, cairia na regra 1 e o porteiro devolveria ingresso bom
        //    achando que e falso.
        var meus = todos.filter(function (c) { return autorizados.indexOf(c.s) !== -1; });
        if (!meus.length) {
            var alheio = todos[0];
            return negado('setor_nao_autorizado', alheio, setorPorId(carga, alheio.s), {
                setoresDoAparelho: nomesDosSetoresDoAparelho(carga),
            });
        }

        // Ambiguidade: o mesmo hash em mais de um setor que ESTE aparelho valida.
        // Acontece com numeracao comum, onde o `0001` de dois setores do mesmo
        // pedido tem o mesmo texto e o mesmo sal. O aparelho nao escolhe.
        if (escolhido) {
            meus = meus.filter(function (c) { return c.s === escolhido; });
            if (!meus.length) return negado('desconhecido', null, null, {});
        } else {
            var setoresDistintos = [];
            meus.forEach(function (c) {
                if (setoresDistintos.indexOf(c.s) === -1) setoresDistintos.push(c.s);
            });
            if (setoresDistintos.length > 1) {
                return {
                    estado: 'ambiguo',
                    candidatos: meus.map(function (c) {
                        return {
                            credencial_id: c.id, numero: c.n,
                            setor: setorPorId(carga, c.s),
                        };
                    }),
                };
            }
        }

        var cand = meus[0];
        var setor = setorPorId(carga, cand.s) || {};

        // 3. O setor tem janela e agora esta fora dela. `abre_em` e `fecha_em`
        //    sao momentos absolutos, nao horas do dia: comparacao ISO direta.
        if (setor.abre_em && agora < setor.abre_em) {
            return negado('fora_da_janela', cand, setor, { abre_em: setor.abre_em });
        }
        if (setor.fecha_em && agora > setor.fecha_em) {
            return negado('fora_da_janela', cand, setor, { fecha_em: setor.fecha_em });
        }

        // 4. Faixa bloqueada. Vem antes de `ja_entrou` porque bloqueio e decisao
        //    do dono, com motivo para ler em voz alta; "ja entrou" e consequencia
        //    e esconderia que aquele lote esta suspenso.
        var bloqueios = (carga.bloqueios || []).filter(function (b) {
            return b.setor_id === cand.s && cand.n >= b.de && cand.n <= b.ate;
        });
        if (bloqueios.length) {
            return negado('bloqueado', cand, setor, { motivoBloqueio: bloqueios[0].motivo });
        }

        // 5. Ja entrou -- so onde o dono configurou entrada unica.
        var anterior = entradas[cand.id];
        if (setor.tipo_uso === 'unico' && anterior) {
            return negado('ja_entrou', cand, setor, { momentoAnterior: anterior });
        }

        // 6. Passou por todas.
        return { estado: 'permitido', credencial_id: cand.id, numero: cand.n, setor: setor };
    }

    window.portariaValidacao = { saisParaTentar: saisParaTentar, decidir: decidir };
})();
