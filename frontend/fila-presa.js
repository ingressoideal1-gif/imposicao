/**
 * A fila que ficou para tras, e as duas saidas dela.
 *
 * ## O beco sem saida que este arquivo existe para consertar
 *
 * A tela inicial recusa trocar de evento com leitura pendente, e a recusa esta
 * certa: leitura enfileirada sob o token do evento A, enviada depois de o
 * aparelho virar portao do evento B, sobe contada no B. A contagem que o
 * cliente pagou para ter sai errada e ninguem descobre.
 *
 * So que ate 17/08/2026 a trava nao tinha saida NENHUMA. Quem envia a fila e o
 * `sincronizar()` do `portaria.js`, que roda so na tela de leitura e exige
 * token. Um aparelho com fila pendente e sem token -- revogado pelo dono, que
 * apaga o token DE PROPOSITO para nao perder as leituras -- ficava assim:
 *
 *     a tela inicial recusa abrir o evento    porque ha fila
 *     a fila nunca sobe                       porque so a tela de leitura envia
 *     a tela de leitura nunca abre            porque a tela inicial recusa
 *
 * O dono ficou preso nesse circulo, com UMA leitura pendente, sem nada na tela
 * que ele pudesse tocar. Nas palavras dele: "nao consigo sair disso".
 *
 * ## As duas saidas
 *
 * `enviar()` -- a saida boa, e a primeira tentada, sozinha, sem o dono pedir.
 * Na maioria das vezes a fila esta parada so porque nada a cutucou fora da tela
 * de leitura; um POST resolve e o evento abre na sequencia.
 *
 * `descartar()` -- a saida ruim, para quando a fila comprovadamente nao tem
 * como subir (aparelho revogado, ou sem token nenhum). Ela PERDE leitura, entao
 * cobra a senha do dono e diz na cara quantas se perdem. Nao ha terceira opcao
 * honesta: fingir que a fila subiu seria pior, e deixar como estava foi o que
 * prendeu o dono.
 *
 * ## Por que o token do `localStorage` e o token certo para enviar
 *
 * As leituras da fila foram feitas sob o token que estava valendo na epoca. O
 * aparelho so troca de token quando vira portao de outro evento -- e e
 * exatamente essa troca que a trava impede enquanto ha fila. Logo, com fila
 * pendente, o token guardado ainda e o do evento a que ela pertence.
 */
(function () {
    'use strict';

    var CHAVE_TOKEN = 'ideal_portaria_token';

    // O mesmo endereco do `portaria.js`. Duplicado de proposito: esta tela nao
    // carrega o `portaria.js` (ele arranca sozinho e navegaria para fora daqui),
    // e importar meio arquivo para pegar uma constante seria pior.
    var BASE = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria';

    function token() {
        try { return localStorage.getItem(CHAVE_TOKEN) || ''; }
        catch (e) { return ''; }        // aba anônima
    }

    /**
     * Por que esta fila nao pode subir agora — ou '' quando ela pode.
     *
     * Separado do envio porque a resposta muda o que a tela OFERECE: sem token
     * a fila nunca mais sobe, e insistir em "Tentar de novo" seria mandar o dono
     * repetir um gesto que nao tem como dar certo.
     */
    function impedimento() {
        if (!token()) { return 'sem-token'; }
        if (navigator.onLine === false) { return 'sem-internet'; }
        return '';
    }

    /**
     * Manda a fila para o servidor.
     *
     * Remove da fila SO depois de o servidor confirmar — a mesma ordem do
     * `sincronizar()` da portaria. Remover antes perderia leitura toda vez que a
     * resposta se perdesse no caminho, que no portao é o caso comum.
     */
    function enviar() {
        var impede = impedimento();
        if (impede) { return Promise.reject(new Error(impede)); }

        return window.portariaDeposito.lerFila(200).then(function (lote) {
            if (!lote.length) { return { enviadas: 0 }; }
            return fetch(BASE + '/leituras', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token()
                },
                body: JSON.stringify({ leituras: lote })
            }).then(function (r) {
                if (r.status === 401) {
                    // O dono revogou este aparelho. A fila NAO sobe mais, nunca,
                    // e dizer isso e melhor que deixar o dono tentando.
                    throw new Error('revogado');
                }
                if (!r.ok) { throw new Error('servidor'); }
                return window.portariaDeposito.removerDaFila(
                    lote.map(function (l) { return l.id_local; })
                ).then(function () { return { enviadas: lote.length }; });
            });
        });
    }

    /** Joga a fila fora. Quem cobra a senha é o `virar-portao.js`. */
    function descartar() {
        return window.portariaDeposito.esquecerFila();
    }

    /**
     * A frase que explica por que a fila nao subiu.
     *
     * Cada motivo ganha a sua, e nenhuma delas culpa o dono: `sem-token` e
     * `revogado` sao consequencia de um gesto que ELE deu na tela dele, meses ou
     * minutos atras, e que ele nao tem como relacionar com este aviso sozinho.
     */
    function frase(motivo, naFila) {
        var quantas = naFila === 1
            ? '1 leitura que ainda não subiu'
            : naFila + ' leituras que ainda não subiram';

        if (motivo === 'sem-internet') {
            return 'Este aparelho está sem internet, e há ' + quantas
                 + '. Conecte-o e toque em "Enviar agora".';
        }
        if (motivo === 'sem-token' || motivo === 'revogado') {
            return 'Há ' + quantas + ', e elas não têm mais como subir: este '
                 + 'aparelho foi desligado deste portão. Para seguir, é preciso '
                 + 'descartá-las — e isso apaga essas leituras para sempre.';
        }
        return 'Não consegui enviar ' + quantas + ' agora. Confira a internet e '
             + 'tente de novo.';
    }

    /** true quando o motivo é definitivo: insistir não vai adiantar. */
    function semVolta(motivo) {
        return motivo === 'sem-token' || motivo === 'revogado';
    }

    window.filaPresa = {
        enviar: enviar, descartar: descartar,
        impedimento: impedimento, frase: frase, semVolta: semVolta
    };
})();
