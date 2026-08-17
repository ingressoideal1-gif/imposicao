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
     * @param texto           a pergunta inteira, ja com as consequencias
     * @param opcoes.rotulo   o que o botao de confirmar diz ("Finalizar", ...)
     * @param opcoes.perigo   true pinta o confirmar de vermelho
     * @returns Promise<boolean> — true so quando a pessoa confirmou
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
                resolver(!!resposta);
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

            // O foco nasce em Cancelar: um "Enter" solto no teclado do celular
            // nao pode finalizar o evento de ninguem.
            nao.focus();
            abertaAgora = function () { fechar(false); };
        });
    }

    window.caixaConfirmar = { perguntar: perguntar };
})();
