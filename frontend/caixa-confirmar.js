/**
 * A confirmacao "tem certeza?", desenhada NA PAGINA.
 *
 * ## Por que nao `window.confirm`
 *
 * Porque no aplicativo INSTALADO ela nao responde. Em 16/08/2026 o dono nao
 * conseguia configurar o evento: a senha era pedida por `window.prompt` e a
 * caixa simplesmente nao aparecia no celular dele -- a tela ficava muda, sem
 * erro e sem reacao. Trocamos aquele `prompt` por uma caixa desenhada na
 * pagina e o problema acabou.
 *
 * O `window.confirm` ficou, e em 17/08/2026 voltou pela outra porta: "Finalizar
 * Evento" e "Inativar Evento" nao funcionavam. As duas comecam com um
 * `window.confirm`, e uma confirmacao que nao responde vale por "cancelar" --
 * a funcao devolve na primeira linha e nada acontece. Nenhum aviso, porque
 * cancelar nao E um erro.
 *
 * Repare em qual metade funcionava: "ATIVAR este evento" seguia normal, porque
 * ligar nao pede confirmacao. Era a mesma linha de codigo, e so o caminho com
 * `confirm` morria. E o teste da tela passava, porque no Chrome de teste o
 * dialogo responde -- ele provava a logica, e o que falhava era o mecanismo.
 *
 * ## O que esta caixa garante
 *
 * Ela e DOM da nossa pagina: aparece onde o resto da tela aparece, e nao
 * depende de o navegador querer desenhar dialogo nativo. Some com Escape e com
 * o toque fora, e o foco nasce em "Cancelar" -- quem confirma por engano perde
 * dado, quem cancela por engano toca de novo.
 */
(function () {
    'use strict';

    var abertaAgora = null;

    function botao(rotulo, id, classe) {
        var b = document.createElement('button');
        b.type = 'button';
        b.id = id;
        b.className = classe;
        b.textContent = rotulo;        // escrito por nos: TEXTO, nunca HTML
        return b;
    }

    /**
     * @param texto            a pergunta inteira, ja com as consequencias
     * @param opcoes.rotulo    o que o botao de confirmar diz ("Finalizar", ...)
     * @param opcoes.perigo    true pinta o confirmar de vermelho
     * @param opcoes.campo     { id, rotulo, valor, maxlength } — quando vem,
     *                         a caixa ganha um `<label>` + `<input>` entre o
     *                         texto e os botoes
     * @returns Promise<boolean|string|null>
     *          Sem `campo`: true so quando a pessoa confirmou (como sempre).
     *          Com `campo`: a string digitada (`trim`; vazia vira o `valor`
     *          sugerido) ao confirmar, `null` ao cancelar.
     */
    function perguntar(texto, opcoes) {
        opcoes = opcoes || {};

        // Duas caixas ao mesmo tempo seriam duas perguntas empilhadas sobre a
        // mesma tela, e a de baixo ficaria esperando para sempre.
        if (abertaAgora) { abertaAgora(); }

        return new Promise(function (resolver) {
            var fundo = document.createElement('div');
            fundo.className = 'fundo-confirmar';
            fundo.id = 'fundo-confirmar';

            var caixa = document.createElement('div');
            caixa.className = 'caixa-confirmar';
            caixa.setAttribute('role', 'alertdialog');
            caixa.setAttribute('aria-modal', 'true');

            var frase = document.createElement('p');
            frase.id = 'texto-confirmar';
            // O nome do evento vem do ERP e e digitado por pessoas: TEXTO.
            frase.textContent = texto;
            caixa.appendChild(frase);

            // Entre o texto e os botoes, so quando `opcoes.campo` vem.
            var campo = null;
            if (opcoes.campo) {
                var rotuloCampo = document.createElement('label');
                rotuloCampo.setAttribute('for', opcoes.campo.id);
                rotuloCampo.textContent = opcoes.campo.rotulo;
                caixa.appendChild(rotuloCampo);

                campo = document.createElement('input');
                campo.type = 'text';
                campo.id = opcoes.campo.id;
                // So quando vier: `maxLength = undefined` vira 0 no DOM, e um
                // campo com maxLength 0 nao aceita tecla nenhuma.
                if (opcoes.campo.maxlength) { campo.maxLength = opcoes.campo.maxlength; }
                campo.value = opcoes.campo.valor || '';
                campo.autocomplete = 'off';
                caixa.appendChild(campo);
            }

            var acoes = document.createElement('div');
            acoes.className = 'acoes-confirmar';
            var nao = botao('Cancelar', 'btn-confirmar-nao', 'secundario');
            var sim = botao(opcoes.rotulo || 'Confirmar', 'btn-confirmar-sim',
                            opcoes.perigo ? 'perigo' : '');
            acoes.appendChild(nao);
            acoes.appendChild(sim);
            caixa.appendChild(acoes);
            fundo.appendChild(caixa);
            document.body.appendChild(fundo);

            function fechar(resposta) {
                if (!fundo.parentNode) { return; }
                document.removeEventListener('keydown', naTecla, true);
                fundo.parentNode.removeChild(fundo);
                abertaAgora = null;
                if (!campo) {
                    resolver(!!resposta);
                    return;
                }
                // Cancelar tem de dizer "nada foi escolhido", e um `''`
                // resolvido tambem seria verdadeiro em `if (resultado)` --
                // so `null` deixa a duvida fora do caminho de quem chama.
                if (!resposta) { resolver(null); return; }
                var digitado = campo.value.trim();
                var final = digitado || opcoes.campo.valor;
                // O `maxlength` do HTML so trava a DIGITACAO: um autofill ou
                // uma extensao do navegador escreve em `campo.value` por
                // fora do teclado, e esse texto passa reto por cima do
                // atributo. Sem este corte aqui, ele ia inteiro ao servidor
                // e voltava 422 -- o limite tem de valer no dado, nao so na
                // tela.
                if (opcoes.campo.maxlength) {
                    final = final.slice(0, opcoes.campo.maxlength);
                }
                resolver(final);
            }

            function naTecla(ev) {
                if (ev.key === 'Escape') { fechar(false); }
            }

            // Registrado ANTES de resolver qualquer promessa: fechar com Escape
            // e a saida de quem abriu a caixa sem querer.
            document.addEventListener('keydown', naTecla, true);
            nao.onclick = function () { fechar(false); };
            sim.onclick = function () { fechar(true); };
            fundo.onclick = function (ev) {
                // So o toque FORA da caixa cancela. Sem esta conferencia, um
                // toque no proprio texto fecharia a pergunta.
                if (ev.target === fundo) { fechar(false); }
            };

            if (campo) {
                // Aqui o Enter E o gesto esperado: a pessoa esta com o teclado
                // aberto, digitando um nome, e o mesmo campo em toda outra
                // caixa deste projeto confirma no Enter (`carregar-pedido.js`,
                // a senha da engrenagem). Nao ha dado destrutivo em jogo --
                // so um nome, sempre com uma sugestao pronta -- entao o foco
                // nasce NELE, e nao em Cancelar.
                campo.onkeydown = function (ev) {
                    if (ev.key === 'Enter') { fechar(true); }
                };
                campo.focus();
                campo.select();
            } else {
                // O foco nasce em Cancelar: um "Enter" solto no teclado do
                // celular nao pode finalizar o evento de ninguem.
                nao.focus();
            }
            abertaAgora = function () { fechar(false); };
        });
    }

    window.caixaConfirmar = { perguntar: perguntar };
})();
