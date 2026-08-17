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
 *
 * ## Quem manda no que aparece na tela
 *
 * Esta pagina tem CINCO estados de topo, e eles nunca convivem: a tela inicial
 * (`#lista` + `#bloco-novo-evento`), o menu do olho (`#menu-geral`), a
 * configuracao de um evento (`#engrenagem`), a tela de entrar
 * (`#bloco-entrar`) e a troca de senha (`#trocar-senha`).
 *
 * Ate a primeira revisao desta tarefa havia DOIS donos sem contrato entre si:
 * o `menu-geral.js`, que escondia a tela inicial atras do olho, e este arquivo,
 * que a escondia atras das duas telas de conta. Nenhum dos dois sabia dos
 * blocos do outro, e o resultado eram telas empilhadas: o "Voltar" do menu
 * devolvia a lista com a troca OBRIGATORIA ainda aberta -- ou seja, o portao
 * que nao se escapa tinha uma saida pelo olho --, e um `recarregar()` disparado
 * de dentro do menu trazia a lista de volta POR BAIXO do menu aberto.
 *
 * O contrato, daqui para a frente:
 *
 *   - quem abre uma tela deste arquivo esconde TODOS os outros estados de topo;
 *   - quem a fecha so devolve a tela inicial se nao houver outro estado na
 *     frente dela;
 *   - enquanto a troca OBRIGATORIA esta na tela, o olho fica travado.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var SENHA_MINIMA = 8;
    var depoisDeEntrarCb = null;
    var trocaEmAndamento = null;
    var jaConferiuAConta = false;

    /** Puro. 'entrar' so quando nao ha nada que sirva de casa. */
    function decidirAbertura(sessao, temAparelho) {
        if (sessao) { return 'lista'; }
        return temAparelho ? 'lista' : 'entrar';
    }

    // A tela inicial, e os outros dois estados de topo que NAO sao deste
    // arquivo. Os dois ultimos so aparecem na lista de esconder: devolve-los e
    // de quem os abriu.
    var DA_TELA_INICIAL = ['lista', 'bloco-novo-evento'];
    var DOS_OUTROS = ['menu-geral', 'engrenagem'];

    function naTela(id) {
        var el = $(id);
        return !!el && !el.classList.contains('sumindo');
    }

    function esconderTelaInicial(esconder) {
        if (esconder) {
            DA_TELA_INICIAL.concat(DOS_OUTROS).forEach(function (id) {
                var el = $(id);
                if (el) { el.classList.add('sumindo'); }
            });
            return;
        }
        // Ha outro estado na frente: a tela inicial continua atras dele, e quem
        // a traz de volta e o dono daquele estado -- o "← Voltar" do menu, o
        // "← Voltar aos meus eventos" da engrenagem. Devolvê-la aqui a
        // desenharia POR BAIXO de uma tela aberta.
        if (DOS_OUTROS.some(naTela)) { return; }
        DA_TELA_INICIAL.forEach(function (id) {
            var el = $(id);
            if (el) { el.classList.remove('sumindo'); }
        });
    }

    /**
     * O olho, travado enquanto a troca obrigatoria esta na tela.
     *
     * Esconder o `#menu-geral` nao basta: o botao continuaria abrindo-o por
     * cima do portao, e o "← Voltar" de la devolveria a lista. `disabled` e o
     * unico jeito de o toque nao acontecer -- e ele tambem anuncia a trava a
     * quem usa leitor de tela.
     */
    function travarOlho(travar) {
        var olho = $('btn-menu-geral');
        if (olho) { olho.disabled = !!travar; }
    }

    function mostrarEntrar(opcoes) {
        opcoes = opcoes || {};
        depoisDeEntrarCb = opcoes.depois || null;
        if (window.menuGeral) { window.menuGeral.fechar(); }
        esconderTelaInicial(true);
        var bloco = $('bloco-entrar');
        if (!bloco) { return; }
        $('erro-login').classList.add('sumindo');
        var campoSenha = $('senha');
        if (campoSenha) { campoSenha.value = ''; }
        // CANCELAR so quando a pessoa ESCOLHEU vir para ca -- o "Trocar minha
        // senha" do menu, num celular que ja e aparelho e ainda nao tem sessao.
        // Sem este botao aquele caminho era uma sala sem porta: a lista estava
        // escondida atras, e nao havia gesto nenhum que a trouxesse de volta.
        // Na abertura FORCADA (sem aparelho e sem sessao) ele fica escondido,
        // porque nao ha para onde cancelar: atras nao ha nada.
        var cancelar = $('btn-cancelar-entrar');
        if (cancelar) { cancelar.classList.toggle('sumindo', !depoisDeEntrarCb); }
        bloco.classList.remove('sumindo');
        (($('email').value || '') ? $('senha') : $('email')).focus();
    }

    function esconderEntrar() {
        var bloco = $('bloco-entrar');
        if (bloco) { bloco.classList.add('sumindo'); }
        var campoSenha = $('senha');
        if (campoSenha) { campoSenha.value = ''; }
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
        // Esta chamada JA e a conferencia da senha provisoria desta abertura.
        // Sem a marca, o `recarregar()` logo abaixo perguntaria `/minha-conta`
        // uma segunda vez, no mesmo segundo e com a mesma resposta.
        jaConferiuAConta = true;
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

    /**
     * A senha provisoria barra tambem quem NAO acabou de entrar.
     *
     * O portao vivia so no caminho do login, e sessao no celular dura dias: na
     * segunda abertura do aplicativo o cliente entrava direto na lista com a
     * senha que a grafica passou ainda valendo. Quem sabe disso e o servidor,
     * entao ha uma pergunta -- UMA -- por abertura do aplicativo.
     *
     * Erro de rede nao levanta portao nenhum: sem resposta nao da para afirmar
     * que a senha e provisoria, e travar a tela por causa de um 4G ruim
     * prenderia o dono do lado de fora do proprio evento.
     */
    function conferirSenhaProvisoria(sessao) {
        if (!sessao || jaConferiuAConta) { return Promise.resolve(); }
        jaConferiuAConta = true;
        return window.AcessoConta.minhaConta(sessao).then(function (c) {
            // Sem `return`: quem chamou nao pode ficar preso esperando a pessoa
            // escolher uma senha.
            if (c && c.precisa_trocar_senha) { mostrarTrocarSenha({ obrigatoria: true }); }
        }).catch(function () { /* sem rede: a lista fica, e o portao espera */ });
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

    /** Os dois erros que o servidor devolve, em portugues escrito. A mensagem
     *  crua vem do backend em minuscula e sem ponto, e e ela que o cliente
     *  leria no celular. */
    function fraseDoErro(e) {
        if (e && e.status === 401) { return 'A senha atual não confere. Tente de novo.'; }
        if (e && e.status === 422) { return 'A senha nova precisa ter pelo menos 8 caracteres.'; }
        return (e && e.message) || 'Não consegui trocar a senha agora. Tente de novo.';
    }

    /**
     * A troca de senha. Resolve quando trocou; com `obrigatoria`, nao ha
     * Cancelar -- a tela so sai depois de trocar.
     */
    function mostrarTrocarSenha(opcoes) {
        // UMA tela de troca por vez. Uma segunda chamada com a primeira na
        // frente reatribuiria os dois `onclick`, e a promessa da primeira
        // ficaria orfa: ninguem mais a resolveria, e quem a esperava -- o
        // `depoisDeEntrar`, que leva a pessoa para a casa depois de trocar --
        // esperaria para sempre. Era alcancavel pelo menu: com o portao
        // obrigatorio aberto, "Trocar minha senha" redesenhava a mesma tela com
        // o Cancelar a vista, e o portao virava opcional.
        if (trocaEmAndamento) { return trocaEmAndamento; }

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
        travarOlho(obrigatoria);
        (obrigatoria ? $('campo-senha-nova') : $('campo-senha-atual')).focus();

        function erro(texto) {
            var e = $('erro-trocar-senha');
            e.textContent = texto;
            e.classList.remove('sumindo');
        }
        function fechar() {
            tela.classList.add('sumindo');
            ['campo-senha-atual', 'campo-senha-nova', 'campo-senha-confirma'].forEach(function (id) { $(id).value = ''; });
            travarOlho(false);
            trocaEmAndamento = null;
            esconderTelaInicial(false);
        }
        trocaEmAndamento = new Promise(function (resolver) {
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
                    erro(fraseDoErro(e));
                });
            };
            $('btn-cancelar-trocar-senha').onclick = function () {
                if (obrigatoria) { return; }
                fechar();
                resolver(false);
            };
        });
        return trocaEmAndamento;
    }

    function sair() {
        return window.AcessoConta.sair().then(function () {
            // A conta pode ser outra na proxima entrada, e a resposta de
            // `/minha-conta` era daquela que saiu.
            jaConferiuAConta = false;
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
        var cancelarEntrar = $('btn-cancelar-entrar');
        if (cancelarEntrar) {
            cancelarEntrar.addEventListener('click', function () {
                // A pessoa desistiu: o que viria depois de entrar nao vem.
                depoisDeEntrarCb = null;
                esconderEntrar();
            });
        }
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
        depoisDeEntrar: depoisDeEntrar, conferirSenhaProvisoria: conferirSenhaProvisoria,
        mostrarTrocarSenha: mostrarTrocarSenha,
        sair: sair
    };
    document.addEventListener('DOMContentLoaded', ligar);
})();
