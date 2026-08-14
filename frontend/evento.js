/**
 * A tela onde o QR do Pedido cai.
 *
 * O cliente aponta a câmera do celular para o QR que o atendente mandou, e este
 * arquivo faz três coisas, nesta ordem:
 *
 *   1. troca o token do QR pelo esqueleto do pedido, lido do ERP na hora;
 *   2. pede login, porque o evento fica ligado a uma conta;
 *   3. cria um evento novo — ou anexa a um que a conta já tem.
 *
 * A conta do passo 2 é a que o cliente já tem no ERP Vibe. Não há cadastro
 * separado, e esta tela não oferece criar um: os dois sistemas apontam para o
 * mesmo projeto Supabase, então o mesmo e-mail e a mesma senha já entram aqui.
 *
 * Nada aqui fala com o banco direto. Toda leitura e escrita passa pelo backend,
 * que é quem tem a chave. O que esta página usa do Supabase é só o login.
 *
 * E nada aqui explica como o código do ingresso é formado. O cliente precisa
 * saber o que fazer, não como a coisa funciona por dentro.
 */
(function () {
    'use strict';

    var TOKEN = new URLSearchParams(location.search).get('t') || '';
    var esqueleto = null;

    var $ = function (id) { return document.getElementById(id); };
    var mostrar = function (id) { $(id).classList.remove('sumindo'); };
    var esconder = function (id) { $(id).classList.add('sumindo'); };

    function falhar(caixa, mensagem) {
        var el = $(caixa);
        el.textContent = mensagem;
        el.classList.remove('sumindo');
    }

    // ── 1. Trocar o token pelo esqueleto ─────────────────────────────────────

    function carregar() {
        if (!TOKEN) {
            esconder('carregando');
            mostrar('erro');
            falhar('erro-texto', 'O endereço veio sem o código do QR. Leia o QR de novo com a câmera.');
            return;
        }
        AcessoConta.pedir('/evento?t=' + encodeURIComponent(TOKEN))
            .then(function (d) {
                esqueleto = d;
                desenhar(d);
                esconder('carregando');
                mostrar('pedido');
                return AcessoConta.sessao();
            })
            .then(function (s) { if (s) entrou(s); })
            .catch(function (e) {
                esconder('carregando');
                mostrar('erro');
                falhar('erro-texto', e.message);
            });
    }

    function desenhar(d) {
        $('titulo').textContent = 'Pedido ' + d.pedido;
        document.title = 'Pedido ' + d.pedido + ' — Ideal Control';

        $('setores').innerHTML = d.setores.map(function (s) {
            return '<div class="setor"><span class="nome"></span>'
                 + '<span class="qtd">' + s.quantidade.toLocaleString('pt-BR') + ' ingressos</span></div>';
        }).join('');
        // O nome vem do ERP, então entra como TEXTO e nunca como HTML.
        Array.prototype.forEach.call($('setores').querySelectorAll('.nome'), function (el, i) {
            el.textContent = d.setores[i].nome;
        });

        $('total').textContent = d.total.toLocaleString('pt-BR') + ' ingressos';

        if (d.ja_reivindicado) {
            falhar('erro-cadastro', 'Este pedido já foi cadastrado. Se foi você, entrar aqui abre o evento.');
        }
    }

    // ── 2. Entrar ────────────────────────────────────────────────────────────

    // A conta é a MESMA do ERP Vibe, e não uma daqui: os dois sistemas usam o
    // mesmo projeto Supabase, logo o mesmo `auth.users`. Por isso esta tela não
    // oferece criar conta. Uma conta criada aqui funcionaria — e seria o pior
    // caso, porque o login passaria e só muito depois alguém descobriria que o
    // evento, os setores e a portaria ficaram pendurados numa identidade sem
    // nenhuma relação com o cadastro do cliente no ERP.
    function entrar() {
        var email = $('email').value.trim();
        var senha = $('senha').value;
        if (!email || !senha) {
            falhar('erro-login', 'Preencha e-mail e senha.');
            return;
        }
        esconder('erro-login');
        $('btn-entrar').disabled = $('btn-esqueci').disabled = true;

        AcessoConta.entrar(email, senha)
            .then(function (sess) {
                $('btn-entrar').disabled = $('btn-esqueci').disabled = false;
                entrou(sess);
            })
            .catch(function (e) {
                $('btn-entrar').disabled = $('btn-esqueci').disabled = false;
                falhar('erro-login', e.message);
            });
    }

    // Recuperar age sobre a conta que JÁ existe. É a saída certa para quem
    // esqueceu a senha — criar outra conta "resolveria" o login e quebraria o
    // vínculo com o cadastro do cliente.
    function esqueciSenha() {
        var email = $('email').value.trim();
        if (!email) {
            falhar('erro-login', 'Escreva o seu e-mail acima e toque de novo.');
            return;
        }
        esconder('erro-login');
        $('btn-esqueci').disabled = true;
        AcessoConta.esqueciSenha(email).then(function (frase) {
            $('btn-esqueci').disabled = false;
            falhar('erro-login', frase + ' Depois de trocar, volte a ler este QR.');
        });
    }

    function entrou(sess) {
        esconder('bloco-entrar');
        mostrar('bloco-cadastrar');

        AcessoConta.pedir('/meus-eventos', { headers: { Authorization: 'Bearer ' + sess.access_token } })
            .then(function (d) {
                var destino = $('destino');
                (d.eventos || []).forEach(function (ev) {
                    var op = document.createElement('option');
                    op.value = ev.id;
                    op.textContent = ev.nome_evento;   // textContent: nome digitado pelo cliente
                    destino.appendChild(op);
                });
            })
            .catch(function () { /* sem eventos anteriores é o caso normal */ });
    }

    // ── 3. Cadastrar ─────────────────────────────────────────────────────────

    function cadastrar() {
        esconder('erro-cadastro');
        $('btn-cadastrar').disabled = true;
        $('btn-cadastrar').textContent = 'Cadastrando…';

        AcessoConta.sessao().then(function (sess) {
            if (!sess) throw new Error('Sua sessão expirou. Entre de novo.');
            return AcessoConta.pedir('/reivindicar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + sess.access_token
                },
                body: JSON.stringify({
                    token: TOKEN,
                    evento_id: $('destino').value || null,
                    nome_evento: $('nome-evento').value
                })
            });
        }).then(function (d) {
            esconder('pedido');
            mostrar('pronto');
            $('pronto-texto').textContent = d.novo
                ? 'O evento "' + d.nome_evento + '" foi criado com os setores deste pedido.'
                : 'Este pedido foi anexado ao evento "' + d.nome_evento + '".';
            // Vai direto para ESTE evento, nunca para a lista: o cliente acabou
            // de criar ou anexar o pedido e não deveria ter de procurá-lo de novo.
            $('ir-para-controle').href = '/controle.html?evento=' + encodeURIComponent(d.evento_id);
        }).catch(function (e) {
            $('btn-cadastrar').disabled = false;
            $('btn-cadastrar').textContent = 'Cadastrar evento';
            falhar('erro-cadastro', e.message);
        });
    }

    // ── Ligações ─────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', function () {
        $('btn-entrar').addEventListener('click', function () { entrar(); });
        $('btn-esqueci').addEventListener('click', esqueciSenha);
        $('btn-cadastrar').addEventListener('click', cadastrar);

        // Enter no campo de senha entra, que é o que qualquer pessoa espera.
        $('senha').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') entrar();
        });

        // O nome só faz sentido quando se está criando um evento.
        $('destino').addEventListener('change', function () {
            $('campo-nome').style.display = this.value ? 'none' : '';
        });

        carregar();
    });
})();
