/**
 * O olho de mostrar/ocultar senha, em cada campo de senha da casa do
 * aplicativo (`controle.html`).
 *
 * Nasce de um caso real: a senha provisoria que a grafica passa e algo como
 * `K7M2PQ9X` -- letras e numeros dificeis de acertar de cabeca, digitados com
 * o polegar, num campo que esconde cada tecla assim que ela sai do dedo. Sem
 * ver o que foi digitado, o erro so aparece depois do "Entrar" falhar -- e a
 * pessoa nao sabe se foi ela que errou ou se a senha esta errada.
 *
 * So mexe nos campos DESTA pagina: a `portaria.html` nao tem campo de senha
 * nenhum, e por isso nem carrega este arquivo.
 *
 * Ao esconder um bloco de estado inteiro (a classe `.sumindo` num
 * ancestral, como `#bloco-senha-atual` ou `#trocar-senha`), nada precisa ser
 * feito aqui: e `display: none` em CSS, e o campo e o olho somem juntos com
 * o resto do bloco.
 */
(function () {
    'use strict';

    /** Troca `type` entre `password` e `text`, e o rotulo do olho junto. */
    function alternar(botao, campo) {
        var estaEscondida = campo.type === 'password';
        campo.type = estaEscondida ? 'text' : 'password';
        botao.textContent = estaEscondida ? 'Ocultar' : 'Mostrar';
        botao.setAttribute('aria-pressed', estaEscondida ? 'true' : 'false');
    }

    /**
     * Envolve o campo num `<span class="campo-senha">` e poe o olho dentro,
     * depois dele. Idempotente: um campo que ja esta dentro do envoltorio nao
     * ganha um segundo olho -- protege contra `ligar()` rodar mais de uma vez.
     */
    function envolver(campo) {
        var pai = campo.parentNode;
        if (pai && pai.classList && pai.classList.contains('campo-senha')) { return; }

        var envoltorio = document.createElement('span');
        envoltorio.className = 'campo-senha';
        pai.insertBefore(envoltorio, campo);
        envoltorio.appendChild(campo);

        var botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'olho-senha';
        botao.textContent = 'Mostrar';
        botao.setAttribute('aria-pressed', 'false');
        if (campo.id) { botao.setAttribute('aria-controls', campo.id); }
        botao.addEventListener('click', function () { alternar(botao, campo); });
        envoltorio.appendChild(botao);
    }

    function ligar() {
        var campos = document.querySelectorAll('input[type="password"]');
        for (var i = 0; i < campos.length; i++) { envolver(campos[i]); }
    }

    window.mostrarSenha = { ligar: ligar };
    document.addEventListener('DOMContentLoaded', ligar);
})();
