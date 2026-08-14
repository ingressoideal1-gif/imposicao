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

    /**
     * Escreve no único aviso que fica de FORA de todo bloco de estado — por
     * isso ele é o que sobra visível quando o arranque falha antes de decidir
     * qual bloco mostrar.
     */
    function falharArranque(mensagem) {
        var el = $('erro-arranque');
        el.textContent = mensagem;
        el.classList.remove('sumindo');
    }

    function carregarPainel() {
        return AcessoConta.pedir('/eventos/' + estado.evento_id, { headers: cabecalhos() })
            .then(function (p) { estado.painel = p; desenhar(); return p; })
            .catch(function (e) {
                // Sessão vencida ou rede caindo no meio do carregamento: sem
                // isto a tela fica do jeito que estava — muda, sem o dono
                // saber se algo deu errado ou se é só demora.
                falharArranque('Não consegui carregar este evento. Confira a '
                    + 'internet e tente de novo em instantes.');
            });
    }

    function elevado() {
        return !!(estado.elevacao && estado.elevacao.expira_em * 1000 > Date.now());
    }

    /**
     * A trava de verdade, não só a de olhar.
     *
     * O CSS já esmaece os campos em `body.somente-leitura`, mas opacidade não
     * impede toque: sem `disabled`, o dono digita uma nova lotação, vê o campo
     * reagir, e nada persiste — a mesma armadilha que o cabeçalho deste
     * arquivo condena. `#btn-elevar` e `#btn-sair-config` ficam de fora de
     * propósito: são a saída do modo leitura, e travá-los exigiria senha para
     * pedir senha.
     *
     * Chamada tanto por `desenhar()` quanto pelo `setInterval` da faixa, para
     * que uma elevação que vence NO MEIO dos 20 segundos entre redesenhos
     * realmente devolva a tela ao modo leitura — e não só esconda a faixa
     * enquanto os campos continuam soltos.
     */
    function travarCampos() {
        var leitura = !elevado();
        document.body.classList.toggle('somente-leitura', leitura);
        $('aviso-leitura').textContent = leitura
            ? 'Você está vendo o evento. Para alterar qualquer coisa, toque em '
              + '"Digitar a senha do dono".'
            : '';

        document.querySelectorAll('#evento input, #evento select, #evento textarea')
            .forEach(function (el) { el.disabled = leitura; });
        document.querySelectorAll('#evento button.so-com-senha, #evento .so-com-senha button')
            .forEach(function (el) { el.disabled = leitura; });
    }

    function desenhar() {
        var p = estado.painel;
        if (!p) { return; }

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

        // Depois dos cartões de setor existirem no DOM: são eles que trazem os
        // campos de lotação e uso que a trava também precisa desligar.
        travarCampos();
        desenharFaixa();
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
        esconder('erro-arranque');
        // `Promise.resolve().then(...)` — não chamar `AcessoConta.sessao()`
        // direto — porque ela NÃO é async: se `supabaseClient` for nulo (sem
        // rede, CDN bloqueado, ou o modo offline deliberado do
        // `supabase-config.js`), ela LANÇA na hora, em vez de rejeitar uma
        // promessa. Um throw síncrono aqui escaparia do `.catch()` abaixo e
        // subiria cru até o `DOMContentLoaded`, que não tem tratamento
        // nenhum — a promessa morre em silêncio e os três blocos de estado
        // ficam todos com "sumindo": uma tela em branco, sem uma palavra do
        // porquê.
        return Promise.resolve().then(function () {
            return AcessoConta.sessao();
        }).then(function (s) {
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
        }).catch(function (e) {
            mostrar('bloco-entrar');
            falharArranque('Não consegui verificar a sua conta agora. Pode ser '
                + 'a internet: confira o sinal e toque em "Entrar" de novo.');
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
            })
            .catch(function (e) {
                // Mesma lacuna de `carregarPainel`: sem isto, uma falha aqui
                // deixa a tela sem `lista-eventos` E sem `sem-eventos` — nada.
                falharArranque('Não consegui carregar os seus eventos. Confira '
                    + 'a internet e tente de novo em instantes.');
            });
    }

    var CHAVE_ELEVACAO = 'acesso_elevacao';

    /**
     * Guardar a elevação no `sessionStorage`, e não no `localStorage`: fechar a
     * aba tem de encerrar o modo configuração. O aparelho é da portaria.
     */
    function guardarElevacao(e) {
        estado.elevacao = e;
        try {
            if (e) { sessionStorage.setItem(CHAVE_ELEVACAO, JSON.stringify(e)); }
            else { sessionStorage.removeItem(CHAVE_ELEVACAO); }
        } catch (err) { /* aba anônima */ }
    }

    function elevar(senha) {
        return AcessoConta.pedir('/eventos/' + estado.evento_id + '/elevar', {
            method: 'POST',
            headers: cabecalhos({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ senha: senha, navegador: AcessoConta.navegadorId() })
        }).then(function (r) {
            guardarElevacao({ token: r.token, expira_em: r.expira_em });
            desenhar();
            return r;
        });
    }

    function sairDaConfiguracao() {
        guardarElevacao(null);
        desenhar();
    }

    function avisar(texto, tipo) {
        var el = $('aviso-gravacao');
        el.textContent = texto;
        el.className = 'aviso ' + (tipo || 'ok');
    }

    // Substituíveis pelo teste de navegador, que não tem backend.
    function _pedir(caminho, opcoes) {
        return (window.Controle._pedirParaTeste || AcessoConta.pedir)(caminho, opcoes);
    }
    function _pedirSenha() {
        if (window.Controle._pedirSenhaParaTeste) {
            return window.Controle._pedirSenhaParaTeste();
        }
        return abrirCaixaDeSenha();
    }

    /**
     * Toda gravação passa por aqui.
     *
     * Elevação vencida não perde o que o dono digitou: a chamada volta 401 com
     * `codigo: 'elevacao_expirada'`, a tela pede a senha e REPETE a mesma
     * gravação. Nada é relido da tela nesse caminho, e nada é limpo.
     */
    function gravar(caminho, corpo, metodo, jaTentou) {
        var opcoes = {
            method: metodo || 'PATCH',
            headers: cabecalhos({
                'Content-Type': 'application/json',
                'X-Elevacao': (estado.elevacao || {}).token || '',
                'X-Navegador': AcessoConta.navegadorId()
            }),
            body: JSON.stringify(corpo)
        };

        return _pedir(caminho, opcoes).then(function (r) {
            avisar('Gravado.', 'ok');
            return r;
        }).catch(function (e) {
            var venceu = e.status === 401 && e.corpo && e.corpo.codigo === 'elevacao_expirada';
            if (venceu && !jaTentou) {
                return Promise.resolve(_pedirSenha()).then(function () {
                    return gravar(caminho, corpo, metodo, true);
                });
            }
            if (e.status === undefined) {
                // Sem status: foi a rede, não o servidor. O texto digitado fica.
                avisar('Sem conexão agora. O que você digitou continua aqui — '
                     + 'toque em gravar de novo quando a internet voltar.', 'erro');
            } else {
                avisar(e.message, 'erro');
            }
            throw e;
        });
    }

    /** A faixa que conta o tempo. Redesenha a cada 20 segundos. */
    function desenharFaixa() {
        var faixa = $('faixa-elevacao');
        if (!elevado()) {
            faixa.classList.add('sumindo');
            return;
        }
        faixa.classList.remove('sumindo');
        var falta = Math.max(0, estado.elevacao.expira_em - Math.floor(Date.now() / 1000));
        var m = Math.floor(falta / 60), s = falta % 60;
        $('faixa-tempo').textContent = 'Modo configuração · ' + m + ':'
            + String(s).padStart(2, '0') + ' restante';
    }

    // `travarCampos()` também roda aqui, e não só dentro de `desenhar()`: sem
    // isto, uma elevação que vence no meio dos 20 segundos deixaria a faixa
    // sumir enquanto os campos continuavam destravados — a mesma trava que
    // se desarma calada que a faixa existe para evitar.
    setInterval(function () {
        if (estado.painel) { desenharFaixa(); travarCampos(); }
    }, 20000);

    /**
     * Pede a senha do dono. Devolve uma promessa que resolve quando a elevação
     * chega — é o que permite ao `gravar()` repetir a mesma gravação depois.
     *
     * `prompt` de propósito: é a única caixa de texto que o navegador não guarda
     * em preenchimento automático, e a senha do dono não pode ficar num campo
     * que o celular do porteiro memorize.
     */
    function abrirCaixaDeSenha() {
        var senha = window.prompt(
            'Digite a senha da sua conta do Vibe para liberar as alterações por '
            + acesso_minutos() + ' minutos.'
        );
        if (!senha) { return Promise.reject(new Error('cancelado')); }
        return elevar(senha).catch(function (e) {
            avisar(e.message, 'erro');
            throw e;
        });
    }

    function acesso_minutos() { return 15; }

    document.addEventListener('DOMContentLoaded', function () {
        $('btn-sair-config').addEventListener('click', sairDaConfiguracao);

        $('btn-elevar').addEventListener('click', function () {
            abrirCaixaDeSenha();
        });

        $('btn-gravar-evento').addEventListener('click', function () {
            gravar('/eventos/' + estado.evento_id, {
                nome_evento: $('campo-nome-evento').value,
                local_evento: $('campo-local').value,
                data_evento: $('campo-data').value || null
            }, 'PATCH').then(carregarPainel).catch(function () { /* já avisado */ });
        });

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
        abrir: abrir,
        elevar: elevar,
        gravar: gravar,
        sairDaConfiguracao: sairDaConfiguracao
    };
})();
