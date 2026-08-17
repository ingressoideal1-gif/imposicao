/**
 * A conta do cliente na casa do aplicativo: entrar, trocar a senha, sair.
 *
 * Decisoes de 17/08/2026: o app abre DIRETO na tela de entrar quando o
 * celular nao e aparelho de nenhum evento e nao ha sessao; a senha
 * provisoria que a grafica passou obriga a trocar antes de qualquer coisa;
 * "Esqueci minha senha" manda falar com a grafica (nao ha e-mail no projeto).
 *
 * A sessao fica no celular ate ele virar aparelho -- quem a encerra nesse
 * momento e o `aparelho.js`. Aqui so se entra e se sai por vontade.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var SENHA_MINIMA = 8;
    var depoisDeEntrarCb = null;

    /** Puro. 'entrar' so quando nao ha nada que sirva de casa. */
    function decidirAbertura(sessao, temAparelho) {
        if (sessao) { return 'lista'; }
        return temAparelho ? 'lista' : 'entrar';
    }

    function esconderTelaInicial(esconder) {
        ['lista', 'bloco-novo-evento'].forEach(function (id) {
            var el = $(id);
            if (el) { el.classList.toggle('sumindo', esconder); }
        });
    }

    function mostrarEntrar(opcoes) {
        opcoes = opcoes || {};
        depoisDeEntrarCb = opcoes.depois || null;
        if (window.menuGeral) { window.menuGeral.fechar(); }
        esconderTelaInicial(true);
        var bloco = $('bloco-entrar');
        if (!bloco) { return; }
        $('erro-login').classList.add('sumindo');
        $('senha').value = '';
        bloco.classList.remove('sumindo');
        (($('email').value || '') ? $('senha') : $('email')).focus();
    }

    function esconderEntrar() {
        var bloco = $('bloco-entrar');
        if (bloco) { bloco.classList.add('sumindo'); }
        $('senha').value = '';
        esconderTelaInicial(false);
    }

    function mostrarErroLogin(texto) {
        var erro = $('erro-login');
        erro.textContent = texto;
        erro.classList.remove('sumindo');
    }

    /**
     * Depois de a sessao existir (recem-entrada ou restaurada): a troca
     * obrigatoria vem antes de tudo; depois, a lista -- ou Meus Pedidos, se a
     * conta ainda nao tem evento nenhum.
     */
    function depoisDeEntrar(sessao) {
        esconderEntrar();
        return window.AcessoConta.minhaConta(sessao).then(function (c) {
            if (c && c.precisa_trocar_senha) {
                // A promessa devolvida NÃO espera a pessoa trocar a senha: ela
                // termina assim que a tela obrigatória está na frente. Esperar
                // deixaria pendurado quem chamou — o botão "Entrar" — por todo
                // o tempo que alguém leva para escolher uma senha no celular, e
                // um `await` inocente lá em cima travaria a tela inteira. O que
                // vem DEPOIS da troca se pendura na própria troca, aqui.
                mostrarTrocarSenha({ obrigatoria: true }).then(function () {
                    return seguirParaACasa(sessao, c);
                }).catch(function () { /* a tela ja escreveu o motivo */ });
                return;
            }
            return seguirParaACasa(sessao, c);
        }).catch(function () {
            // /minha-conta fora do ar: a lista do chaveiro e o que ha.
            return window.listaEventos.recarregar();
        });
    }

    function seguirParaACasa(sessao, minha) {
        if (depoisDeEntrarCb) {
            var cb = depoisDeEntrarCb; depoisDeEntrarCb = null;
            return cb(sessao);
        }
        return window.listaEventos.recarregar().then(function () {
            var temEvento = document.querySelectorAll('#eventos .linha-evento').length > 0;
            if (!temEvento && window.meusPedidos) { return window.meusPedidos.abrir(); }
        });
    }

    /**
     * A troca de senha. Resolve quando trocou; com `obrigatoria`, nao ha
     * Cancelar -- a tela so sai depois de trocar.
     */
    function mostrarTrocarSenha(opcoes) {
        opcoes = opcoes || {};
        var obrigatoria = !!opcoes.obrigatoria;
        if (window.menuGeral) { window.menuGeral.fechar(); }
        esconderTelaInicial(true);
        var tela = $('trocar-senha');
        $('trocar-senha-titulo').textContent = obrigatoria ? 'Escolha a sua senha' : 'Trocar minha senha';
        $('trocar-senha-ajuda').textContent = obrigatoria
            ? 'A senha que a gráfica te passou era provisória. Escolha agora a sua: pelo menos 8 caracteres.'
            : 'Digite a senha atual e escolha a nova: pelo menos 8 caracteres.';
        $('bloco-senha-atual').classList.toggle('sumindo', obrigatoria);
        $('btn-cancelar-trocar-senha').classList.toggle('sumindo', obrigatoria);
        ['campo-senha-atual', 'campo-senha-nova', 'campo-senha-confirma'].forEach(function (id) { $(id).value = ''; });
        $('erro-trocar-senha').classList.add('sumindo');
        tela.classList.remove('sumindo');
        (obrigatoria ? $('campo-senha-nova') : $('campo-senha-atual')).focus();

        function erro(texto) {
            var e = $('erro-trocar-senha');
            e.textContent = texto;
            e.classList.remove('sumindo');
        }
        function fechar() {
            tela.classList.add('sumindo');
            ['campo-senha-atual', 'campo-senha-nova', 'campo-senha-confirma'].forEach(function (id) { $(id).value = ''; });
            esconderTelaInicial(false);
        }
        return new Promise(function (resolver) {
            $('btn-trocar-senha').onclick = function () {
                var atual = $('campo-senha-atual').value || '';
                var nova = $('campo-senha-nova').value || '';
                var confirma = $('campo-senha-confirma').value || '';
                if (nova.length < SENHA_MINIMA) {
                    return erro('A senha nova precisa ter pelo menos 8 caracteres.');
                }
                if (nova !== confirma) {
                    return erro('As duas senhas não conferem. Digite a mesma nas duas caixas.');
                }
                window.AcessoConta.sessao().then(function (s) {
                    if (!s) { throw new Error('Sua sessão caiu. Entre de novo.'); }
                    return window.AcessoConta.trocarSenha(s, obrigatoria ? '' : atual, nova);
                }).then(function () {
                    fechar();
                    resolver(true);
                }).catch(function (e) {
                    erro((e && e.message) || 'Não consegui trocar a senha agora. Tente de novo.');
                });
            };
            $('btn-cancelar-trocar-senha').onclick = function () {
                if (obrigatoria) { return; }
                fechar();
                resolver(false);
            };
        });
    }

    function sair() {
        return window.AcessoConta.sair().then(function () {
            if (window.menuGeral) { window.menuGeral.fechar(); }
            return window.listaEventos.recarregar();
        });
    }

    function ligar() {
        if (!$('bloco-entrar')) { return; }
        $('btn-entrar').addEventListener('click', function () {
            $('erro-login').classList.add('sumindo');
            var email = ($('email').value || '').trim();
            var senha = $('senha').value || '';
            if (!email || !senha) { return mostrarErroLogin('Preencha o e-mail e a senha.'); }
            try { localStorage.setItem('ideal_control_email', email); } catch (e) { /* aba anonima */ }
            window.AcessoConta.entrar(email, senha)
                .then(depoisDeEntrar)
                .catch(function (e) { mostrarErroLogin(e.message); });
        });
        $('senha').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('btn-entrar').click(); }
        });
        $('btn-esqueci').addEventListener('click', function () {
            window.AcessoConta.esqueciSenha().then(mostrarErroLogin);
        });
        try { $('email').value = localStorage.getItem('ideal_control_email') || ''; } catch (e) { /* aba anonima */ }

        var trocar = $('btn-trocar-minha-senha');
        if (trocar) {
            trocar.addEventListener('click', function () {
                window.AcessoConta.sessao().then(function (s) {
                    if (s) { return mostrarTrocarSenha({ obrigatoria: false }); }
                    mostrarEntrar({ depois: function () { return mostrarTrocarSenha({ obrigatoria: false }); } });
                });
            });
        }
        var sairBtn = $('btn-sair-conta');
        if (sairBtn) { sairBtn.addEventListener('click', sair); }
    }

    window.conta = {
        decidirAbertura: decidirAbertura,
        mostrarEntrar: mostrarEntrar, esconderEntrar: esconderEntrar,
        depoisDeEntrar: depoisDeEntrar, mostrarTrocarSenha: mostrarTrocarSenha,
        sair: sair
    };
    document.addEventListener('DOMContentLoaded', ligar);
})();
