/**
 * De quem e a verdade sobre a Cor e a Numeracao de um modelo.
 * ---------------------------------------------------------------------------
 *
 * A linha de `pedidos_modelos` guarda o MESMO fato duas vezes:
 *
 *   • o NOME, escrito pelo sistema parceiro  →  `padrao` e `gabarito_operacional`
 *   • o ID, derivado depois por este painel  →  `amostra_cor_id` e `amostra_num_id`
 *
 * Todo o frontend lia isso como `id || nome`: o id ganhava sempre, e o nome so
 * era consultado quando o id estava vazio. Como o id e gravado na primeira vez
 * que o painel salva qualquer coisa do modelo, uma troca de cor feita DEPOIS
 * pelo parceiro nunca mais chegava a tela — nem apertando F5, porque o
 * desencontro mora na linha do banco, e nao em cache do navegador.
 *
 * Medicao no banco de producao em 12/08/2026: 36 modelos tinham `padrao` sem
 * id, 28 tinham `gabarito_operacional` sem id, e NENHUM tinha id sem o texto
 * correspondente. O nome sempre chega primeiro — logo ele e a origem, e e ele
 * que deve vencer quando os dois discordam. Na mesma medicao, 8 modelos ja
 * estavam com a cor do parceiro discordando do id em cache (o pedido 20517, por
 * exemplo, pedia Rosa Bebe e a tela mostrava Amarelo Fluor).
 *
 * ── A assimetria entre Cor e Numeracao ─────────────────────────────────────
 *
 * A tentacao e aplicar a mesma regra nos dois. Seria um estrago:
 *
 * `editCustomNumeracao()` monta uma numeracao exclusiva do modelo e o
 * salvamento que a aplica (script.js, no retorno do editor de numeracao) grava
 * SO o `amostra_num_id`. O `gabarito_operacional` fica apontando para o
 * gabarito base de onde ela saiu. Nesses casos o texto e que esta velho, e
 * segui-lo devolveria a numeracao ao gabarito de fabrica, em silencio, jogando
 * fora o trabalho do operador. Em producao isso vale para 20 dos 23 modelos em
 * que texto e id divergem.
 *
 * Alem disso, nome de numeracao NAO e unico: "Sem Numeracao" existe duas vezes
 * no catalogo, entao "resolver pelo nome" nem sempre tem resposta.
 *
 * Por isso a regra da numeracao guarda o id em tres situacoes: quando ele
 * aponta para uma numeracao customizada, quando o nome dele ja e o texto do
 * parceiro, e quando o texto casa com mais de uma linha do catalogo.
 *
 * ── O principio comum ──────────────────────────────────────────────────────
 *
 * Trocar exige certeza; na duvida, preserva. Nada aqui APAGA uma escolha: um
 * nome que nao existe no catalogo, um catalogo que ainda nao carregou ou um id
 * que nao esta no catalogo carregado (o link do cliente recebe o catalogo
 * filtrado) mantem exatamente o que ja estava.
 *
 * A correcao vale so em memoria. O banco se acerta sozinho no proximo
 * salvamento do modelo, porque o `saveAmostraToDB()` regrava os dois ids a
 * partir do item ja corrigido. Carregar pedido nao escreve no banco.
 */

(function (escopo) {
    'use strict';

    function _normalizar(texto) {
        return (texto === null || texto === undefined ? '' : String(texto))
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function _nomeDe(linhaCatalogo) {
        if (!linhaCatalogo) return '';
        return linhaCatalogo.name || linhaCatalogo.tipo || '';
    }

    function _acharPorId(catalogo, id) {
        if (!id) return null;
        return (catalogo || []).find(function (x) { return String(x.id) === String(id); }) || null;
    }

    function _acharPorNomeExato(catalogo, nome) {
        var alvo = _normalizar(nome);
        if (!alvo) return [];
        return (catalogo || []).filter(function (x) { return _normalizar(_nomeDe(x)) === alvo; });
    }

    /**
     * Decide o id que deve valer, dado o texto do parceiro e o id em cache.
     * Devolve `null` quando nao ha motivo suficiente para trocar.
     *
     * @param {Array}  catalogo   producao_cores ou producao_numeracoes
     * @param {string} texto      padrao ou gabarito_operacional
     * @param {*}      idEmCache  amostra_cor_id ou amostra_num_id
     * @param {Function} [protegido] recebe a linha em cache; true = nao trocar
     */
    function _idQueDeveValer(catalogo, texto, idEmCache, protegido) {
        if (!catalogo || catalogo.length === 0) return null;   // sem catalogo, nao da para conferir

        var emCache = _acharPorId(catalogo, idEmCache);

        // Ha um id escolhido que este catalogo nao conhece: pode ser uma linha
        // filtrada (o link do cliente so recebe as numeracoes do proprio
        // cliente). Trocar seria adivinhar.
        if (idEmCache && !emCache) return null;

        // Ja concordam. Cobre tambem o nome repetido no catalogo: se a linha
        // escolhida ja se chama assim, ela e uma resposta valida.
        if (emCache && _normalizar(_nomeDe(emCache)) === _normalizar(texto)) return null;

        if (emCache && typeof protegido === 'function' && protegido(emCache)) return null;

        var candidatos = _acharPorNomeExato(catalogo, texto);
        if (candidatos.length !== 1) return null;              // ausente ou ambiguo: preserva

        if (String(candidatos[0].id) === String(idEmCache || '')) return null;
        return candidatos[0].id;
    }

    /**
     * @param {Object} linha  a linha crua de pedidos_modelos
     * @param {Array}  cores        state.cores
     * @param {Array}  numeracoes   state.numeracoes
     * @returns {{corId: *, numId: *, corTrocada: boolean, numTrocada: boolean}}
     */
    function reconciliarCorNumDoModelo(linha, cores, numeracoes) {
        var saida = {
            corId: linha ? (linha.amostra_cor_id || null) : null,
            numId: linha ? (linha.amostra_num_id || null) : null,
            corTrocada: false,
            numTrocada: false
        };
        if (!linha) return saida;

        var novaCor = _idQueDeveValer(cores, linha.padrao, saida.corId, null);
        if (novaCor) {
            saida.corId = novaCor;
            saida.corTrocada = true;
        }

        // Numeracao customizada e trabalho do operador: o ERP do parceiro nao
        // tem como nomea-la, entao o texto dele nunca a substitui.
        var novaNum = _idQueDeveValer(
            numeracoes,
            linha.gabarito_operacional,
            saida.numId,
            function (emCache) { return !!emCache.is_custom; }
        );
        if (novaNum) {
            saida.numId = novaNum;
            saida.numTrocada = true;
        }

        return saida;
    }

    escopo.reconciliarCorNumDoModelo = reconciliarCorNumDoModelo;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { reconciliarCorNumDoModelo: reconciliarCorNumDoModelo };
    }
})(typeof window !== 'undefined' ? window : globalThis);
