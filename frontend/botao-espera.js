/**
 * O estado de espera de um botao, enquanto uma chamada de rede corre.
 *
 * Nasce de um padrao que se repetia pela casa inteira: um botao que dispara
 * um `fetch` e fica exatamente do jeito que estava enquanto a resposta nao
 * volta -- sem dizer "estou fazendo algo", e sem impedir um segundo toque no
 * meio da espera. No portao isso e grave: um segundo toque em "Salvar nome"
 * manda dois PATCH iguais, e um segundo toque em "Entrar" tenta logar duas
 * vezes com a MESMA senha que a primeira tentativa ainda esta conferindo.
 *
 * `comecar` troca o texto, desabilita e marca `aria-busy` -- o rotulo em
 * texto e a marca de acessibilidade juntos, porque cor ou opacidade sozinha
 * nao avisa quem usa leitor de tela. `terminar` devolve os tres. Os dois sao
 * IDEMPOTENTES e aceitam `null` sem lancar: um botao que a tela escondeu no
 * meio da espera (o "Entrar" que some quando o login da certo) ainda pode
 * chamar `terminar` sobre ele sem que isso quebre nada.
 *
 * A REGRA de quem chama: `terminar` tem de rodar nos DOIS ramos da promessa
 * que `comecar` abriu -- sucesso e erro --, nunca só num `.then` seguido de
 * um `.catch` solto mais adiante. Este projeto e ES5: o jeito de garantir os
 * dois ramos e `promessa.then(function (r) { ... }, function (e) { ... })`,
 * com `terminar` no INICIO de cada uma das duas funcoes. Um `.catch()` em
 * separado nao pega o erro que a propria funcao de sucesso lance depois de
 * `comecar` -- e o botao ficaria preso no rotulo de espera para sempre.
 */
(function () {
    'use strict';

    function comecar(botao, rotulo) {
        if (!botao) { return; }
        // So na primeira chamada: uma segunda `comecar` sobre o mesmo botao
        // (nao deveria acontecer, mas idempotencia e a garantia) nao pode
        // guardar o proprio rotulo de espera como se fosse o original.
        if (botao.dataset.rotuloOriginal === undefined) {
            botao.dataset.rotuloOriginal = botao.textContent;
        }
        botao.disabled = true;
        botao.setAttribute('aria-busy', 'true');
        botao.textContent = rotulo;
    }

    function terminar(botao) {
        if (!botao) { return; }
        if (botao.dataset.rotuloOriginal !== undefined) {
            botao.textContent = botao.dataset.rotuloOriginal;
            delete botao.dataset.rotuloOriginal;
        }
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
    }

    window.botaoEspera = { comecar: comecar, terminar: terminar };
})();
