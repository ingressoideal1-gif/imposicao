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
 * Nada aqui fala com o banco direto. Toda leitura e escrita passa pelo backend,
 * que é quem tem a chave. O que esta página usa do Supabase é só o login.
 *
 * E nada aqui explica como o código do ingresso é formado. O cliente precisa
 * saber o que fazer, não como a coisa funciona por dentro.
 */
(function () {
    'use strict';

    // Mesma regra do resto do app: servido pela estação, fala com a estação;
    // servido pela Vercel, fala com o motor na nuvem.
    var ehLocal = ['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0;
    var API = (ehLocal || location.port === '9000') ? '' : 'https://imposicao.onrender.com';

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

    function pedir(caminho, opcoes) {
        return fetch(API + '/api/acesso' + caminho, opcoes).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (corpo) {
                if (!r.ok) throw new Error(corpo.detail || ('Erro ' + r.status));
                return corpo;
            });
        });
    }

    function sessao() {
        return supabaseClient.auth.getSession().then(function (r) {
            return (r.data && r.data.session) || null;
        });
    }

    // ── 1. Trocar o token pelo esqueleto ─────────────────────────────────────

    function carregar() {
        if (!TOKEN) {
            esconder('carregando');
            mostrar('erro');
            falhar('erro-texto', 'O endereço veio sem o código do QR. Leia o QR de novo com a câmera.');
            return;
        }
        pedir('/evento?t=' + encodeURIComponent(TOKEN))
            .then(function (d) {
                esqueleto = d;
                desenhar(d);
                esconder('carregando');
                mostrar('pedido');
                return sessao();
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

    function entrar(criandoConta) {
        var email = $('email').value.trim();
        var senha = $('senha').value;
        if (!email || !senha) {
            falhar('erro-login', 'Preencha e-mail e senha.');
            return;
        }
        esconder('erro-login');
        $('btn-entrar').disabled = $('btn-criar-conta').disabled = true;

        var acao = criandoConta
            ? supabaseClient.auth.signUp({ email: email, password: senha })
            : supabaseClient.auth.signInWithPassword({ email: email, password: senha });

        acao.then(function (r) {
            $('btn-entrar').disabled = $('btn-criar-conta').disabled = false;
            if (r.error) { falhar('erro-login', r.error.message); return; }
            if (!r.data.session) {
                // Conta criada mas exigindo confirmação por e-mail: dizer isso,
                // e não deixar a tela parada sem explicação.
                falhar('erro-login', 'Conta criada. Confirme o e-mail que enviamos e volte a ler este QR.');
                return;
            }
            entrou(r.data.session);
        });
    }

    function entrou(sess) {
        esconder('bloco-entrar');
        mostrar('bloco-cadastrar');

        pedir('/meus-eventos', { headers: { Authorization: 'Bearer ' + sess.access_token } })
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

        sessao().then(function (sess) {
            if (!sess) throw new Error('Sua sessão expirou. Entre de novo.');
            return pedir('/reivindicar', {
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
        }).catch(function (e) {
            $('btn-cadastrar').disabled = false;
            $('btn-cadastrar').textContent = 'Cadastrar evento';
            falhar('erro-cadastro', e.message);
        });
    }

    // ── Ligações ─────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', function () {
        $('btn-entrar').addEventListener('click', function () { entrar(false); });
        $('btn-criar-conta').addEventListener('click', function () { entrar(true); });
        $('btn-cadastrar').addEventListener('click', cadastrar);

        // Enter no campo de senha entra, que é o que qualquer pessoa espera.
        $('senha').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') entrar(false);
        });

        // O nome só faz sentido quando se está criando um evento.
        $('destino').addEventListener('change', function () {
            $('campo-nome').style.display = this.value ? 'none' : '';
        });

        carregar();
    });
})();
