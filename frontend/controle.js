/**
 * A tela do dono do evento.
 *
 * Ela mostra dois números lado a lado em cada setor: o que o ERP encomendou e o
 * que está publicado. Divergência entre os dois é a única pista visível de que
 * ou a impressão ainda não terminou de publicar, ou alguém publicou o que não
 * devia — e por isso ela aparece em texto, nunca só numa cor.
 *
 * Enquanto não houver elevação, a tela se declara somente leitura. Aceitar o
 * toque e não gravar seria a pior das combinações.
 */
(function () {
    'use strict';

    var estado = {
        sessao: null,
        evento_id: null,
        painel: null,
        elevacao: null       // { token, expira_em }
    };

    var $ = function (id) { return document.getElementById(id); };

    function cabecalhos(extra) {
        var h = { Authorization: 'Bearer ' + (estado.sessao || {}).access_token };
        if (extra) { Object.keys(extra).forEach(function (k) { h[k] = extra[k]; }); }
        return h;
    }

    function carregarPainel() {
        return AcessoConta.pedir('/eventos/' + estado.evento_id, { headers: cabecalhos() })
            .then(function (p) { estado.painel = p; desenhar(); return p; });
    }

    function elevado() {
        return !!(estado.elevacao && estado.elevacao.expira_em * 1000 > Date.now());
    }

    function desenhar() {
        var p = estado.painel;
        if (!p) { return; }

        document.body.classList.toggle('somente-leitura', !elevado());
        $('aviso-leitura').textContent = elevado()
            ? ''
            : 'Você está vendo o evento. Para alterar qualquer coisa, toque em '
              + '"Digitar a senha do dono".';

        $('nome-evento-titulo').textContent = p.evento.nome_evento;
        $('campo-nome-evento').value = p.evento.nome_evento || '';
        $('campo-local').value = p.evento.local_evento || '';
        // `datetime-local` só aceita "AAAA-MM-DDTHH:MM"; o banco devolve com
        // segundos e fuso, e o campo fica VAZIO em silêncio se o formato não
        // bater — o dono acharia que a data nunca foi gravada.
        $('campo-data').value = (p.evento.data_evento || '').slice(0, 16);

        $('setores').innerHTML = '';
        p.setores.forEach(function (s) { $('setores').appendChild(cartaoDeSetor(s)); });

        $('aparelhos').innerHTML = '';
        p.aparelhos.forEach(function (a) { $('aparelhos').appendChild(cartaoDeAparelho(a)); });

        $('codigos-total').textContent = p.codigos_cliente + ' códigos carregados';
    }

    function cartaoDeSetor(s) {
        var el = document.createElement('div');
        el.className = 'cartao';

        var titulo = document.createElement('h3');
        titulo.textContent = s.nome;            // vem do ERP: TEXTO, nunca HTML
        el.appendChild(titulo);

        var contagem = document.createElement('p');
        contagem.style.fontSize = '.84rem';
        if (s.publicadas === s.quantidade) {
            contagem.className = 'confere';
            contagem.textContent = s.quantidade.toLocaleString('pt-BR')
                + ' ingressos encomendados, e os mesmos ' + s.publicadas.toLocaleString('pt-BR')
                + ' já estão no ar. Confere.';
        } else {
            contagem.className = 'divergente';
            contagem.textContent = s.quantidade.toLocaleString('pt-BR')
                + ' ingressos encomendados, mas ' + s.publicadas.toLocaleString('pt-BR')
                + ' estão no ar. Faltam ' + (s.quantidade - s.publicadas).toLocaleString('pt-BR')
                + ' — confira com a gráfica antes do evento.';
        }
        el.appendChild(contagem);

        var rotulo = document.createElement('label');
        rotulo.setAttribute('for', 'lotacao-' + s.id);
        rotulo.textContent = 'Lotação máxima (deixe vazio para sem limite)';
        el.appendChild(rotulo);

        var campo = document.createElement('input');
        campo.id = 'lotacao-' + s.id;
        campo.type = 'number';
        campo.min = '0';
        campo.inputMode = 'numeric';
        campo.value = (s.lotacao === null || s.lotacao === undefined) ? '' : s.lotacao;
        el.appendChild(campo);

        // A quantidade encomendada NÃO vira campo: quem manda nela é o ERP.
        el.appendChild(opcoesDeUso(s));
        return el;
    }

    function opcoesDeUso(s) {
        var caixa = document.createElement('div');
        var titulo = document.createElement('p');
        titulo.textContent = 'Uso do ingresso';
        titulo.style.margin = '14px 0 4px';
        titulo.style.fontSize = '.82rem';
        titulo.style.color = 'var(--dim)';
        caixa.appendChild(titulo);

        [['unico', 'Vale uma entrada só'],
         ['reentrada', 'Permite sair e voltar']].forEach(function (par) {
            var linha = document.createElement('div');
            linha.className = 'opcao';
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'uso-' + s.id;
            radio.id = 'uso-' + s.id + '-' + par[0];
            radio.value = par[0];
            radio.checked = (s.tipo_uso === par[0]);
            var rot = document.createElement('label');
            rot.setAttribute('for', radio.id);
            rot.textContent = par[1];
            linha.appendChild(radio);
            linha.appendChild(rot);
            caixa.appendChild(linha);
        });
        return caixa;
    }

    function cartaoDeAparelho(a) {
        var el = document.createElement('div');
        el.className = 'cartao';

        var titulo = document.createElement('h3');
        titulo.textContent = a.nome;            // digitado pelo cliente: TEXTO
        el.appendChild(titulo);

        var situacao = document.createElement('p');
        situacao.style.fontSize = '.84rem';
        situacao.style.color = 'var(--dim)';
        var nomes = (estado.painel.setores || [])
            .filter(function (s) { return a.setores.indexOf(s.id) >= 0; })
            .map(function (s) { return s.nome; });
        situacao.textContent = (a.status === 'ativo' ? 'Ativo. ' : 'Revogado. ')
            + (nomes.length ? 'Valida: ' + nomes.join(', ') : 'Ainda não valida nenhum setor.');
        el.appendChild(situacao);
        return el;
    }

    // ── O arranque ───────────────────────────────────────────────────────────
    //
    // Três caminhos, nesta ordem: sem sessão, entrar; com sessão e `?evento=`,
    // abrir aquele evento; com sessão e sem evento, listar os que a conta tem.

    var mostrar = function (id) { $(id).classList.remove('sumindo'); };
    var esconder = function (id) { $(id).classList.add('sumindo'); };

    function abrir() {
        return AcessoConta.sessao().then(function (s) {
            if (!s) {
                mostrar('bloco-entrar');
                return null;
            }
            estado.sessao = s;
            esconder('bloco-entrar');

            var pedido = new URLSearchParams(location.search).get('evento');
            if (pedido) {
                estado.evento_id = pedido;
                mostrar('evento');
                return carregarPainel();
            }
            return listarEventos();
        });
    }

    function listarEventos() {
        return AcessoConta.pedir('/meus-eventos', { headers: cabecalhos() })
            .then(function (d) {
                var eventos = d.eventos || [];
                mostrar('lista-eventos');
                if (!eventos.length) { mostrar('sem-eventos'); return; }

                var caixa = $('eventos');
                caixa.innerHTML = '';
                eventos.forEach(function (ev) {
                    var link = document.createElement('a');
                    link.href = '/controle.html?evento=' + encodeURIComponent(ev.id);
                    link.className = 'cartao';
                    link.style.display = 'block';
                    link.style.textDecoration = 'none';
                    link.style.color = 'inherit';
                    link.textContent = ev.nome_evento;   // digitado pelo cliente: TEXTO
                    caixa.appendChild(link);
                });
            });
    }

    document.addEventListener('DOMContentLoaded', function () {
        $('btn-entrar').addEventListener('click', function () {
            var erro = $('erro-login');
            erro.classList.add('sumindo');
            AcessoConta.entrar($('email').value, $('senha').value)
                .then(abrir)
                .catch(function (e) {
                    erro.textContent = e.message;
                    erro.classList.remove('sumindo');
                });
        });
        $('senha').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('btn-entrar').click(); }
        });
        $('btn-esqueci').addEventListener('click', function () {
            AcessoConta.esqueciSenha($('email').value).then(function (frase) {
                var erro = $('erro-login');
                erro.textContent = frase;
                erro.classList.remove('sumindo');
            });
        });
        abrir();
    });

    window.Controle = {
        estado: estado,
        carregarPainel: carregarPainel,
        desenhar: desenhar,
        elevado: elevado,
        abrir: abrir
    };
})();
