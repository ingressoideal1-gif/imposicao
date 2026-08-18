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
 * Esta pagina tem SEIS estados de topo, e eles nunca convivem: a tela inicial
 * (`#lista` + `#bloco-novo-evento`), o menu do olho (`#menu-geral`), a
 * configuracao de um evento (`#engrenagem`), "Meus Pedidos"
 * (`#meus-pedidos`), a tela de entrar (`#bloco-entrar`) e a troca de senha
 * (`#trocar-senha`).
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
    var resolverTroca = null;
    var jaConferiuAConta = false;

    /** Puro. 'entrar' so quando nao ha nada que sirva de casa. */
    function decidirAbertura(sessao, temAparelho) {
        if (sessao) { return 'lista'; }
        return temAparelho ? 'lista' : 'entrar';
    }

    // A tela inicial, e os outros estados de topo que NAO sao deste arquivo.
    // Estes ultimos so aparecem na lista de esconder: devolve-los e de quem os
    // abriu.
    //
    // `meus-pedidos` entrou em 17/08/2026, com a barra que era "Novo Evento".
    // Ele precisa dos DOIS papeis: ser escondido quando uma tela de conta
    // abre -- senao o login nasceria por cima da lista de pedidos --, e contar
    // como "esta na frente" quando ela fecha, para o `esconderEntrar()` nao
    // devolver a tela inicial POR BAIXO de Meus Pedidos. Estar aqui da os dois
    // de uma vez, porque o `NA_FRENTE` abaixo e montado a partir desta lista.
    // `caixa-carregar` NAO e um setimo estado: e um cartao DENTRO de Meus
    // Pedidos, e por isso os "seis" acima continuam sendo seis. Ele entra aqui
    // pelos mesmos DOIS papeis: ser escondido quando uma tela de conta abre --
    // senao o login nasceria por cima da caixa com a senha do dono digitada
    // dentro --, e contar como "esta na frente" quando ela fecha, para a tela
    // inicial nao voltar POR BAIXO dele.
    var DA_TELA_INICIAL = ['lista', 'bloco-novo-evento'];
    var DOS_OUTROS = ['menu-geral', 'engrenagem', 'meus-pedidos', 'caixa-carregar'];
    // TUDO o que pode estar na frente da tela inicial -- os estados de fora e
    // as DUAS telas deste arquivo.
    //
    // As duas ultimas faltavam, e a falta era uma fuga do portao: o
    // `esconderEntrar()` roda a cada `carregar()` com sessao, entao um segundo
    // `recarregar()` com a troca obrigatoria aberta devolvia `#lista` e
    // `#bloco-novo-evento` ATRAS dela -- em fluxo normal, tocaveis. Incluir as
    // duas aqui nao atrapalha o fechamento legitimo: os dois caminhos de fechar
    // marcam `sumindo` em si mesmos ANTES de pedir a tela inicial de volta.
    var NA_FRENTE = DOS_OUTROS.concat(['bloco-entrar', 'trocar-senha']);

    function naTela(id) {
        var el = $(id);
        return !!el && !el.classList.contains('sumindo');
    }

    /**
     * A DONA da tela inicial, e por isso exportada.
     *
     * Ela era interna, e cada tela nova que precisava esconder a casa fazia a
     * propria copia da lista de blocos -- foi assim que "Meus Pedidos" nasceu
     * sabendo de `#lista` e `#bloco-novo-evento` e ignorando `#engrenagem` e
     * `#menu-geral`. Duas copias parciais e o mesmo defeito de sempre: telas
     * empilhadas, e um "Voltar" que devolve a casa por baixo de algo aberto.
     * Quem precisar esconder a casa chama esta funcao.
     */
    function esconderTelaInicial(esconder) {
        if (esconder) {
            DA_TELA_INICIAL.concat(DOS_OUTROS).forEach(function (id) {
                var el = $(id);
                if (el) { el.classList.add('sumindo'); }
            });
            // A caixa do Carregar pode estar saindo de cena COM A SENHA DO DONO
            // digitada dentro. Escondê-la nao apaga o valor do campo: ele
            // continuaria no DOM, num celular que fica com o porteiro, ate a
            // pagina recarregar. A mesma limpeza que a caixa de senha da
            // configuracao e a tela de entrar ja fazem ao sair.
            var senhaCarregar = $('carregar-senha');
            if (senhaCarregar) { senhaCarregar.value = ''; }
            return;
        }
        // Ha outro estado na frente: a tela inicial continua atras dele, e quem
        // a traz de volta e o dono daquele estado -- o "← Voltar" do menu, o
        // "← Voltar aos meus eventos" da engrenagem e o de Meus Pedidos.
        // Devolvê-la aqui a desenharia POR BAIXO de uma tela aberta.
        if (NA_FRENTE.some(naTela)) { return; }
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

    /**
     * O bilhete de 15 minutos da CONTA, de melhor esforco.
     *
     * Chamada nos dois pontos em que a senha da conta acaba de ser conferida
     * pelo servidor: o login e a troca de senha (com a senha NOVA, que e a que
     * passa a valer). A senha nao fica em variavel nenhuma depois disto -- ela
     * vive no argumento e morre com a chamada, a mesma regra do
     * `entrarEElevar`.
     */
    function liberarQuinzeMinutos(sessao, senha) {
        if (!sessao || !senha) { return; }
        window.AcessoConta.elevarConta(sessao, senha).catch(function () {
            // Sem bilhete, cada porta pede a senha -- o caminho de sempre.
        });
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
     * O UNICO jeito de a troca sair da tela.
     *
     * Mora no modulo, e nao dentro do `mostrarTrocarSenha`, porque ha um
     * caminho de fora: o `sair`. Sair da conta com a troca aberta deixaria o
     * olho travado e o portao pendurado sobre a tela de entrar da proxima
     * pessoa -- um aparelho sem saida nenhuma.
     */
    function fecharTroca(resultado) {
        var tela = $('trocar-senha');
        if (tela) { tela.classList.add('sumindo'); }
        ['campo-senha-atual', 'campo-senha-nova', 'campo-senha-confirma'].forEach(function (id) {
            var el = $(id);
            if (el) { el.value = ''; }
        });
        travarOlho(false);
        trocaEmAndamento = null;
        var resolver = resolverTroca;
        resolverTroca = null;
        if (resolver) { resolver(resultado); }
        esconderTelaInicial(false);
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
        trocaEmAndamento = new Promise(function (resolver) {
            resolverTroca = resolver;
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
                var botaoSalvar = $('btn-trocar-senha');
                window.botaoEspera.comecar(botaoSalvar, 'Salvando…');
                var aSessao = null;
                window.AcessoConta.sessao().then(function (s) {
                    if (!s) { throw new Error('Sua sessão caiu. Entre de novo.'); }
                    aSessao = s;
                    return window.AcessoConta.trocarSenha(s, obrigatoria ? '' : atual, nova);
                }).then(function () {
                    // Com a senha NOVA: e ela que o servidor vai conferir de
                    // agora em diante. Quem trocou a senha provisoria no
                    // primeiro acesso segue para a casa liberado, sem digitar
                    // uma terceira vez a senha que acabou de escolher duas.
                    liberarQuinzeMinutos(aSessao, nova);
                    aSessao = null;
                    atual = nova = confirma = '';
                    // Antes de `fecharTroca`: ela esconde a tela inteira, e o
                    // rotulo precisa voltar ao normal antes de sumir -- nao
                    // depois, quando o botao ja nao esta mais visivel.
                    window.botaoEspera.terminar(botaoSalvar);
                    fecharTroca(true);
                }, function (e) {
                    window.botaoEspera.terminar(botaoSalvar);
                    erro(fraseDoErro(e));
                });
            };
            $('btn-cancelar-trocar-senha').onclick = function () {
                if (obrigatoria) { return; }
                fecharTroca(false);
            };
        });
        return trocaEmAndamento;
    }

    function sair() {
        return window.AcessoConta.sair().then(function () {
            // A conta pode ser outra na proxima entrada, e a resposta de
            // `/minha-conta` era daquela que saiu.
            jaConferiuAConta = false;
            // Defensivo. Hoje ninguem chega aqui com a troca aberta -- o botao
            // de sair mora no menu, e o menu nao abre por baixo dela --, e e
            // justamente por isso que a limpeza precisa ser explicita: no dia
            // em que um caminho novo chegar, o aparelho ficaria com o olho
            // travado e o portao de uma conta que ja saiu.
            fecharTroca(false);
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
            var botao = $('btn-entrar');
            window.botaoEspera.comecar(botao, 'Entrando…');
            window.AcessoConta.entrar(email, senha)
                .then(function (s) {
                    // "Entrar libera 15 minutos": a MESMA senha que abriu a
                    // sessao compra o bilhete de conta, e dentro dele carregar
                    // um pedido e abrir a configuracao nao a pedem de novo.
                    //
                    // Melhor esforco, de proposito: uma falha aqui nao pode
                    // atrapalhar o login. Sem bilhete, cada porta volta a pedir
                    // a senha -- que e o comportamento de sempre, e nao um erro
                    // que valha uma frase na tela de quem acabou de entrar.
                    liberarQuinzeMinutos(s, senha);
                    senha = '';       // a senha morre aqui, e nao no fim do login
                    return depoisDeEntrar(s);
                })
                // Os DOIS ramos, e nao um `.catch` solto: um catch separado
                // nao pegaria o erro se algo dentro do proprio `.then` de
                // sucesso lancasse, e o botao ficaria preso em "Entrando…"
                // para sempre. `terminar` roda mesmo que `esconderEntrar()`
                // ja tenha escondido este botao da tela -- e idempotente.
                .then(function () { window.botaoEspera.terminar(botao); },
                      function (e) {
                          window.botaoEspera.terminar(botao);
                          mostrarErroLogin(e.message);
                      });
        });
        $('senha').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('btn-entrar').click(); }
        });
        // O Enter percorre o formulario como o dedo percorreria os campos:
        // do e-mail para a senha, e so na senha ele confirma (acima).
        $('email').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('senha').focus(); }
        });
        // A troca de senha tem TRES campos, e o Enter avanca por eles como o
        // "Ir" do teclado prometeria: atual -> nova -> confirma -> salvar. Os
        // ouvintes vivem aqui, e nao em `mostrarTrocarSenha`, porque nao
        // dependem de `obrigatoria` -- so precisam existir uma vez.
        $('campo-senha-atual').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('campo-senha-nova').focus(); }
        });
        $('campo-senha-nova').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('campo-senha-confirma').focus(); }
        });
        $('campo-senha-confirma').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('btn-trocar-senha').click(); }
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
        esconderTelaInicial: esconderTelaInicial,
        sair: sair
    };
    document.addEventListener('DOMContentLoaded', ligar);
})();
