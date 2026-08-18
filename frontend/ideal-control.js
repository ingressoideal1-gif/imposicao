/**
 * Ideal Control — a tela da gráfica.
 *
 * O mesmo evento que o cliente configura em `controle.html`, visto de dentro
 * do painel. A diferença que importa é a porta: aqui não há senha de evento
 * nenhuma. Quem está logado como ADM ou Atendimento configura qualquer
 * pedido, porque o trabalho da gráfica é **entregar o Ideal Control já
 * pré-configurado** — o cliente recebe o QR do Pedido e encontra os setores
 * com nome de portaria, horário e aparelhos prontos, em vez de uma tela em
 * branco.
 *
 * Arquivo separado do `script.js` de propósito: aquele já passa de trinta mil
 * linhas, e esta tela não compartilha estado com nenhuma outra. O que ela usa
 * de fora é só a sessão do Supabase (para o cabeçalho `Authorization`) e o
 * `toast()` do painel.
 *
 * ## O que esta tela NÃO mostra
 *
 * O código do QR Ideal. A lista de ingressos traz o NÚMERO impresso e a
 * situação; o código em claro não existe em lugar nenhum do sistema — só o
 * hash, e nem ele sai do servidor. Código visível só aparece nos de staff e
 * cortesia, que são a lista do próprio cliente.
 */
(function () {
    'use strict';

    // 16/08/2026: esta tela passou a falar com uma Edge Function, ao lado do
    // banco. Antes era o `/api/acesso/interno` de um servidor Python que ficava
    // na nuvem, e cada consulta pagava DUAS travessias de internet (navegador ->
    // servidor -> Supabase e volta), num servico que dormia quando ninguem
    // usava. Some-se a isso que aquele servidor perguntava ao Supabase QUEM
    // ESTA FALANDO a cada chamada; na Edge Function o proprio portao ja
    // conferiu o JWT antes de invocar.
    //
    // Aquele servidor saiu do ar em 17/08/2026: nao ha mais para onde voltar
    // atras, e nao deve haver. O endereco abaixo e o unico.
    //
    // O CAMINHO INTEIRO mora aqui, e nao so o host, de proposito. Os dois lados
    // pediam prefixos diferentes (`/api/acesso/interno` contra
    // `/functions/v1/acesso-interno`), e trocar so o host montaria uma URL sem
    // sentido que o roteamento da funcao aceitaria por acidente.
    //
    // O desvio por `localhost`/porta 9000 SUMIU junto, e isso conserta uma
    // tela que nunca funcionou ali: na estacao o `app.py` nem monta o
    // `/api/acesso/*` -- a chave de servico do banco nao vai para as estacoes,
    // por decisao registrada em `acesso_api.py`. Quem abrisse o Ideal Control
    // pela porta 9000 recebia 404 em tudo. Agora fala com a nuvem, como o resto
    // desta tela sempre precisou.
    var BASE = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/acesso-interno';

    var estado = {
        cliente: null,       // o número do cliente pesquisado
        painelCliente: null, // a resposta de /clientes/{n}
        // Quem o bloco "Acesso do cliente" está mostrando AGORA. Ele é
        // desenhado por dois caminhos -- a busca por cliente e a abertura de um
        // pedido --, e quem grava precisa saber de quem está falando sem
        // adivinhar por qual porta a tela entrou.
        clienteAberto: null,
        pedido: null,        // o pedido aberto, quando há um
        painel: null,        // a resposta do servidor
        ingressos: {},       // { setor_id: { pagina, ha_mais, lista, busca } }
        dashboard: null      // so existe depois de alguem pedir
    };

    var $ = function (id) { return document.getElementById(id); };

    function avisar(texto, tipo) {
        if (typeof window.toast === 'function') { window.toast(texto, tipo || 'info'); }
    }

    /**
     * O cliente do Supabase do painel — pelo IDENTIFICADOR NU, nunca por
     * `window`.
     *
     * `supabase-config.js` faz `let supabaseClient = null;` no topo de um
     * script clássico, e `let`/`const` ali criam a ligação no **escopo de
     * script**, não em `window` — só `var` cria propriedade no objeto global.
     * Medido no navegador: `typeof window.supabaseClient` é `"undefined"` e
     * `window` nem tem a chave, enquanto o identificador nu entrega o cliente
     * com `.auth`.
     *
     * Foi por isso que esta tela nunca falou com o motor: eu escrevi
     * `window.supabaseClient`, que é sempre nulo, e concluí "modo offline". O
     * resto do painel sempre usou o nome nu — ver `script.js`, que faz
     * exatamente `typeof supabaseClient !== 'undefined' && supabaseClient`.
     *
     * O `try` cobre a zona morta temporal: se um dia esta tela carregar antes
     * do `supabase-config.js`, ler a ligação lançaria `ReferenceError` em vez
     * de devolver `undefined`.
     */
    function clienteDoPainel() {
        try {
            return (typeof supabaseClient !== 'undefined' && supabaseClient
                    && supabaseClient.auth) ? supabaseClient : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * O cabeçalho de toda chamada.
     *
     * O token vem da sessão do Supabase, a mesma do resto do painel. Sem ele o
     * servidor responde 401 — e é ele que prova QUEM está pedindo, mesmo que
     * esta tela não peça senha de evento nenhuma.
     *
     * `Promise.resolve().then(...)`, e não a chamada direta: sem cliente,
     * `supabaseClient.auth` LANÇA na hora — um throw síncrono, que escapa do
     * `.catch()` de quem chamou porque a corrente de promessas nem chegou a
     * existir. O resultado observado em 16/08/2026 foi o pior possível: a tela
     * ficou em "Carregando…" por três minutos, sem uma palavra. É a mesma
     * armadilha que o `controle.js` documenta no cabeçalho dele.
     */
    function cabecalhos() {
        return Promise.resolve().then(function () {
            var cliente = clienteDoPainel();
            if (!cliente) {
                throw new Error('Esta tela precisa da sua conta do painel, e o '
                    + 'login não carregou neste navegador. Recarregue a página '
                    + '(Ctrl+F5). Se continuar, saia e entre de novo no painel.');
            }
            return cliente.auth.getSession();
        }).then(function (r) {
            var s = (r && r.data && r.data.session) || null;
            if (!s || !s.access_token) {
                throw new Error('Sua sessão expirou. Entre de novo no painel.');
            }
            return { 'Authorization': 'Bearer ' + s.access_token,
                     'Content-Type': 'application/json' };
        });
    }

    /**
     * Uma chamada ao backend.
     *
     * O desvio para o teste é lido AQUI, a cada chamada, e não montado depois
     * por cima da função: o teste de navegador não tem backend, e um gancho
     * instalado por reatribuição só funcionaria para quem resolvesse o nome
     * depois — uma diferença silenciosa entre o que o teste exercita e o que
     * a página faz.
     */
    function pedir(caminho, opcoes) {
        // Também dentro de uma promessa: se o desvio de teste lançar — ou se
        // qualquer coisa aqui lançar —, quem chamou recebe uma REJEIÇÃO, e não
        // uma exceção que passa por cima do `.catch()` dele.
        return Promise.resolve().then(function () {
            if (window.IdealControl && window.IdealControl._pedirParaTeste) {
                return window.IdealControl._pedirParaTeste(caminho, opcoes);
            }
            return _pedirNaRede(caminho, opcoes);
        });
    }

    function _pedirNaRede(caminho, opcoes) {
        return cabecalhos().then(function (h) {
            var o = opcoes || {};
            o.headers = h;
            return fetch(BASE + caminho, o);
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (corpo) {
                if (!r.ok) {
                    var detalhe = corpo.detail;
                    var texto = (detalhe && detalhe.mensagem) || detalhe
                                || ('Erro ' + r.status);
                    var e = new Error(typeof texto === 'string' ? texto : 'Erro ' + r.status);
                    e.status = r.status;
                    throw e;
                }
                return corpo;
            });
        });
    }

    function gravar(caminho, corpo, metodo) {
        return pedir(caminho, {
            method: metodo || 'PATCH',
            body: JSON.stringify(corpo || {})
        }).then(function (r) {
            avisar('Gravado.', 'success');
            return r;
        }).catch(function (e) {
            avisar(e.message, 'error');
            throw e;
        });
    }

    // ── Formatação ──────────────────────────────────────────────────────────

    /**
     * "de 0001 a 0400" — a faixa impressa, com o mesmo piso de quatro dígitos
     * da tela do cliente. As duas telas mostram o mesmo lote; escrevê-lo de
     * dois jeitos diferentes faria o atendente e o cliente discordarem ao
     * telefone sobre qual ingresso é qual.
     */
    function faixaImpressa(de, ate) {
        if (de === null || de === undefined || ate === null || ate === undefined) {
            return '';
        }
        var largura = Math.max(4, String(ate).length, String(de).length);
        var zeros = function (n) { return String(n).padStart(largura, '0'); };
        return 'de ' + zeros(de) + ' a ' + zeros(ate);
    }

    function numero(n) {
        return (n === null || n === undefined) ? '—' : Number(n).toLocaleString('pt-BR');
    }

    /**
     * "15,0%". Uma casa SEMPRE, e vírgula.
     *
     * `String(15.0)` em JavaScript é "15", e o servidor manda 15.0 e 7.5 na
     * mesma coluna — a tabela sairia com "15%" ao lado de "7,5%", desalinhada
     * e parecendo dois números de precisões diferentes.
     */
    function porcento(p) {
        return (p === null || p === undefined)
            ? '—' : Number(p).toFixed(1).replace('.', ',') + '%';
    }

    function quando(iso) {
        if (!iso) { return '—'; }
        var d = new Date(iso);
        return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
    }

    /** "2026-08-15T22:00" → "22h". Só a hora: o eixo já diz o dia. */
    function horaCurta(h) {
        return h ? h.slice(11, 13) + 'h' : '—';
    }

    /** `datetime-local` ⇄ ISO, igual ao `controle.js`. A coluna é TIMESTAMPTZ:
     *  mandar a hora do relógio crua gravaria 22:00 UTC — 19:00 em Brasília. */
    function doCampoParaISO(local) {
        if (!local) { return null; }
        var d = new Date(local);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    function deISOParaCampo(iso) {
        if (!iso) { return ''; }
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return ''; }
        var p = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
             + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /** Texto, nunca HTML: nome de evento e de setor são digitados por gente. */
    function texto(pai, tag, conteudo, classe) {
        var el = document.createElement(tag);
        el.textContent = conteudo === null || conteudo === undefined ? '' : String(conteudo);
        if (classe) { el.className = classe; }
        pai.appendChild(el);
        return el;
    }

    // ── Buscar ──────────────────────────────────────────────────────────────

    function abrirPedido(pedido) {
        var n = parseInt(String(pedido || '').replace(/\D/g, ''), 10);
        if (!n) {
            avisar('Digite o número do pedido.', 'warning');
            return Promise.resolve();
        }
        // A lista de ingressos aberta só é jogada fora quando o PEDIDO muda.
        // Toda gravação termina aqui (`recarregar`), e limpar sempre fecharia
        // a lista debaixo de quem estava procurando um ingresso — no instante
        // seguinte a ele salvar o nome do setor, sem ter tocado na lista.
        if (estado.pedido !== n) { estado.ingressos = {}; estado.dashboard = null; }
        estado.pedido = n;
        $('ic-carregando').style.display = '';
        $('ic-conteudo').style.display = 'none';
        $('ic-vazio').style.display = 'none';

        // O `.catch` cobre o `desenhar()` TAMBÉM, e não só a ida à rede: um erro
        // ao montar a tela — um campo que o servidor deixou de mandar, por
        // exemplo — deixaria o "Carregando…" na tela para sempre se ficasse de
        // fora. Nesta tela, ficar carregando é o pior fim possível: o atendente
        // espera, e não há o que ele possa fazer.
        return pedir('/pedidos/' + n).then(function (p) {
            estado.painel = p;
            desenhar();
        }).catch(function (e) {
            estado.painel = null;
            $('ic-carregando').style.display = 'none';
            $('ic-conteudo').style.display = 'none';
            $('ic-vazio').style.display = '';
            $('ic-vazio').textContent = e && e.status === 404
                ? ('O pedido ' + n + ' não existe no ERP, ou não tem modelo cadastrado.')
                : ((e && e.message) || 'Não consegui abrir este pedido.');
            // No console fica o erro inteiro, com a pilha — a tela recebe uma
            // frase, quem for investigar recebe o resto.
            if (window.console) { console.error('[ideal-control] abrirPedido', e); }
        });
    }

    /**
     * A busca desta tela: o NUMERO DO CLIENTE (usuario, 18/08/2026).
     *
     * Mostra quem e o cliente, as contas dele e os pedidos dele que tem
     * controle de acesso. O painel de configuracao continua sendo por PEDIDO --
     * um evento pertence a um pedido --, e tocar num deles o abre logo abaixo.
     */
    function abrirCliente(numeroDigitado) {
        var n = parseInt(String(numeroDigitado || '').replace(/\D/g, ''), 10);
        if (!n) {
            avisar('Digite o número do cliente.', 'warning');
            return Promise.resolve();
        }
        estado.cliente = n;
        // O painel do pedido some: ele e de OUTRO cliente ate alguem tocar num
        // pedido desta lista, e deixa-lo na tela faria o atendente configurar o
        // evento errado.
        estado.pedido = null;
        estado.painel = null;
        estado.ingressos = {};
        estado.dashboard = null;
        $('ic-conteudo').style.display = 'none';
        $('ic-cliente-secao').style.display = 'none';
        $('ic-carregando').style.display = '';
        $('ic-vazio').style.display = 'none';

        return pedir('/clientes/' + n).then(function (r) {
            estado.painelCliente = r;
            desenharCliente();
        }).catch(function (e) {
            estado.painelCliente = null;
            $('ic-carregando').style.display = 'none';
            $('ic-cliente-secao').style.display = 'none';
            $('ic-vazio').style.display = '';
            $('ic-vazio').textContent = e && e.status === 404
                ? ('O cliente ' + n + ' não existe no ERP.')
                : ((e && e.message) || 'Não consegui abrir este cliente.');
            if (window.console) { console.error('[ideal-control] abrirCliente', e); }
        });
    }

    function desenharCliente() {
        var r = estado.painelCliente;
        var c = r.cliente;
        $('ic-carregando').style.display = 'none';
        $('ic-cliente-secao').style.display = '';

        $('ic-cliente-nome').textContent = c.nome || ('Cliente ' + c.id_cliente);
        $('ic-cliente-dados').textContent = 'Cliente ' + c.id_cliente
            + (c.fantasia && c.fantasia !== c.nome ? ' · ' + c.fantasia : '')
            + (c.email ? ' · ' + c.email : '');

        var caixa = $('ic-cliente-pedidos');
        caixa.innerHTML = '';
        var pedidos = r.pedidos || [];
        $('ic-cliente-sem-pedido').style.display = pedidos.length ? 'none' : '';
        pedidos.forEach(function (p) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-sm btn-outline ic-pedido-do-cliente';
            b.id = 'ic-pedido-' + p.pedido_id_int;
            var partes = ['#' + p.pedido_id_int];
            partes.push(p.nome_evento || 'sem evento ainda');
            if (p.data_evento) { partes.push(quando(p.data_evento)); }
            // A situacao do evento vem junto: e o espelho do que o cliente fez
            // no aplicativo dele, e e a primeira coisa que o atendente precisa
            // saber antes de abrir o pedido.
            if (p.status_evento && p.status_evento !== 'ativo') {
                partes.push(SITUACAO_DO_EVENTO[p.status_evento] || p.status_evento);
            }
            b.textContent = partes.join(' · ');
            b.addEventListener('click', function () { abrirPedido(p.pedido_id_int); });
            caixa.appendChild(b);
        });

        // O bloco de liberar acesso vive aqui TAMBEM, e nao so dentro de um
        // pedido: cliente novo ainda nao tem pedido com controle nenhum, e era
        // justamente ele quem precisava do acesso liberado.
        desenharAcessoDoCliente(c);
    }

    /** As palavras da situacao do evento, as MESMAS do aplicativo do cliente. */
    var SITUACAO_DO_EVENTO = {
        ativo: 'Ativo',
        encerrado: 'Inativo',
        finalizado: 'Finalizado'
    };

    function listarRecentes() {
        return pedir('/pedidos?limite=30').then(function (r) {
            var caixa = $('ic-recentes');
            caixa.innerHTML = '';
            (r.pedidos || []).forEach(function (p) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn btn-sm btn-ghost';
                b.textContent = '#' + p.pedido_id_int
                    + (p.nome_evento ? ' · ' + p.nome_evento : ' · sem evento');
                b.addEventListener('click', function () {
                    $('ic-busca').value = p.pedido_id_int;
                    abrirPedido(p.pedido_id_int);
                });
                caixa.appendChild(b);
            });
        }).catch(function (e) {
            $('ic-recentes').textContent = e.status === 403
                ? 'O Ideal Control da gráfica é para ADM e Atendimento.'
                : e.message;
        });
    }

    // ── Desenhar ────────────────────────────────────────────────────────────

    function desenhar() {
        var p = estado.painel;
        $('ic-carregando').style.display = 'none';
        $('ic-vazio').style.display = 'none';
        $('ic-conteudo').style.display = '';

        $('ic-titulo').textContent = 'Pedido ' + p.pedido
            + (p.evento ? ' · ' + p.evento.nome_evento : '');

        desenharSituacao();
        desenharAcessoDoCliente(estado.painel.cliente);
        // A seção do público aparece com o BOTÃO, e não com os números: eles
        // só são buscados se alguém pedir.
        $('ic-dashboard-secao').style.display = p.tem_dashboard ? '' : 'none';
        $('ic-dashboard-abrir').style.display = estado.dashboard ? 'none' : '';
        $('ic-dashboard-abrir').disabled = false;
        $('ic-dashboard-abrir').textContent = 'Ver o painel de público';
        desenharDashboard();
        desenharEvento();
        desenharSetores();
        desenharAparelhos();
    }

    /**
     * A faixa de situação: o que este pedido JÁ é no Ideal Control.
     *
     * É a primeira pergunta do atendente ao telefone — "o controle de acesso
     * desse pedido está de pé?" — e antes disto ela só tinha resposta olhando
     * o banco.
     */
    function desenharSituacao() {
        var p = estado.painel, caixa = $('ic-situacao');
        caixa.innerHTML = '';

        var sobem = p.modelos.filter(function (m) { return m.sobe_ao_controle; });
        var fora = p.modelos.filter(function (m) { return !m.sobe_ao_controle; });

        selo(caixa, p.evento ? 'Evento cadastrado' : 'Sem evento ainda',
             p.evento ? 'badge-green' : 'badge-amber');
        selo(caixa, sobem.length + ' modelo(s) no controle', 'badge-blue');
        if (fora.length) {
            // Aparece SEMPRE que existir, e não só quando alguém procura: é o
            // modelo que o atendente conta na tela, não encontra como setor, e
            // abre chamado achando que o sistema perdeu.
            selo(caixa, fora.length + ' sem código (não sobe)', 'badge-amber');
        }
        selo(caixa, numero(p.publicacao.total_credenciais) + ' publicadas', 'badge-teal');
        selo(caixa, p.publicacao.aberta ? 'Publicação aberta' : 'Publicação fechada',
             p.publicacao.aberta ? 'badge-green' : 'badge-purple');

        var lista = $('ic-modelos');
        lista.innerHTML = '';
        p.modelos.forEach(function (m) {
            var linha = document.createElement('div');
            linha.className = 'ic-modelo';
            texto(linha, 'strong', m.nome);
            var faixa = faixaImpressa(m.numero_de, m.numero_ate);
            texto(linha, 'span', numero(m.quantidade) + ' ingressos'
                  + (faixa ? ' · ' + faixa : ''), 'ic-dim');
            var marca = document.createElement('span');
            marca.className = 'badge ' + (m.sobe_ao_controle ? 'badge-green' : 'badge-amber');
            marca.textContent = m.sobe_ao_controle ? 'no controle' : 'sem código';
            marca.title = m.sobe_ao_controle
                ? 'A portaria tem como ler este modelo.'
                : 'A numeração deste modelo não tem QR, QR Ideal nem código de '
                  + 'barras. Ele não vira setor do evento — e isso não é defeito: '
                  + 'o ingresso simplesmente não é controlado na entrada.';
            linha.appendChild(marca);
            lista.appendChild(linha);
        });
    }

    function selo(pai, rotulo, classe) {
        var s = document.createElement('span');
        s.className = 'badge ' + (classe || 'badge-blue');
        s.textContent = rotulo;
        pai.appendChild(s);
        return s;
    }

    // ── Acesso do cliente ──────────────────────────────────────────

    /**
     * O endereço único de instalação do aplicativo.
     *
     * O servidor manda o dele em `GET /instalacao`; este aqui é o mesmo valor,
     * repetido de propósito. O QR precisa aparecer NA HORA em que o bloco é
     * desenhado — esperar uma ida à rede deixaria um quadrado branco na tela
     * de quem só quer mostrar o código ao cliente que está no balcão. A
     * resposta do servidor troca este valor depois, se um dia divergirem.
     */
    var URL_INSTALACAO_PADRAO = 'https://ideal-imposition.vercel.app/ic/';
    var urlInstalacao = URL_INSTALACAO_PADRAO;
    var jaPerguntouInstalacao = false;

    /**
     * Copiar sem depender de configuração do navegador.
     *
     * Cada estação da gráfica usa um navegador diferente, e nenhuma solução
     * daqui pode pedir permissão ou flag. `navigator.clipboard` é o caminho
     * bom; quando ele não existe ou é recusado, o `execCommand` antigo ainda
     * funciona dentro de um clique. Só se os dois falharem é que a tela pede
     * para copiar à mão — e aí o valor continua na tela, para selecionar.
     */
    function copiar(conteudo, avisoOk) {
        return Promise.resolve().then(function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(conteudo);
            }
            return copiarNaMarra(conteudo);
        }).catch(function () {
            return copiarNaMarra(conteudo);
        }).then(function () {
            avisar(avisoOk, 'success');
        }).catch(function () {
            avisar('Não consegui copiar; selecione o texto na tela e copie à mão.',
                   'warning');
        });
    }

    function copiarNaMarra(conteudo) {
        var caixa = document.createElement('textarea');
        caixa.value = conteudo;
        caixa.setAttribute('readonly', 'readonly');
        caixa.style.position = 'fixed';
        caixa.style.top = '-1000px';
        document.body.appendChild(caixa);
        caixa.select();
        var deu = false;
        try { deu = document.execCommand('copy'); } catch (e) { deu = false; }
        document.body.removeChild(caixa);
        if (!deu) { throw new Error('a cópia não foi aceita'); }
    }

    /**
     * O QR de instalação — um só, genérico, igual para todos os clientes.
     *
     * A folga branca em volta é desenhada AQUI. O `renderQRCodeOnCtx` nasceu
     * para o papel, onde a margem é o próprio ingresso em volta do elemento, e
     * por isso ele desenha com margem zero, centrado em (x, y). Na tela não há
     * ingresso nenhum em volta: sem esta folga o código encosta na borda do
     * canvas e o celular do cliente não lê.
     */
    function desenharQrInstalacao(url) {
        $('ic-qr-link').textContent = url;
        var canvas = $('ic-qr-instalacao');
        if (canvas && canvas.getContext && typeof window.renderQRCodeOnCtx === 'function') {
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            var lado = Math.min(canvas.width, canvas.height) - 32;
            window.renderQRCodeOnCtx(ctx, url, canvas.width / 2, canvas.height / 2, lado);
        }
        $('ic-qr-copiar').onclick = function () { copiar(url, 'Link copiado.'); };
    }

    /**
     * O bloco "Acesso do cliente".
     *
     * Decisão de 17/08/2026: o QR do Pedido saiu da tela. Quem traz os pedidos
     * para o aplicativo passou a ser a CONTA do cliente — a mesma que ele já
     * tem no ERP Vibe, quando tem. Este bloco é a porta por onde a gráfica
     * abre esse acesso, e some inteiro quando o pedido não tem cliente no ERP:
     * sem e-mail não há o que liberar, e um formulário vazio só faria o
     * atendente tentar.
     */
    /**
     * @param c o cliente a mostrar -- do pedido aberto ou da busca por cliente.
     *          Sem ele o bloco some, que e o caso do pedido sem cliente no ERP.
     */
    function desenharAcessoDoCliente(c) {
        var secao = $('ic-acesso-secao');
        estado.clienteAberto = c || null;
        secao.style.display = c ? '' : 'none';
        if (!c) { return; }

        $('ic-acesso-cliente').textContent = c.nome + ' (cliente ' + c.id_cliente + ')'
            + (c.email ? ' · ' + c.email : '');

        var contas = $('ic-acesso-contas');
        contas.innerHTML = '';
        var lista = c.contas || [];
        if (!lista.length) {
            texto(contas, 'div', 'Sem acesso ainda. Confira o e-mail abaixo e toque '
                  + 'em "Liberar acesso".');
        }
        lista.forEach(function (ct) { contas.appendChild(linhaDeConta(ct)); });

        $('ic-acesso-email').value = c.email || '';
        $('ic-acesso-senha').style.display = 'none';
        $('ic-acesso-senha-valor').textContent = '';
        // O link de WhatsApp some junto: o `href` dele carrega e-mail e senha
        // em claro, e deixá-lo no DOM escondido seria o mesmo vazamento que
        // limpar o `textContent` acima existe para evitar.
        $('ic-acesso-whatsapp').style.display = 'none';
        $('ic-acesso-whatsapp').removeAttribute('href');
        $('ic-acesso-aviso').style.display = 'none';
        $('ic-acesso-aviso').textContent = '';
        $('ic-acesso-liberar').disabled = false;
        $('ic-acesso-liberar').onclick = liberarAcesso;

        desenharQrInstalacao(urlInstalacao);
        if (!jaPerguntouInstalacao) {
            jaPerguntouInstalacao = true;
            pedir('/instalacao').then(function (r) {
                if (r && r.url && r.url !== urlInstalacao) {
                    urlInstalacao = r.url;
                    if ($('ic-acesso-secao').style.display !== 'none') {
                        desenharQrInstalacao(urlInstalacao);
                    }
                }
            }).catch(function () { /* fica o endereço padrão, que é o mesmo */ });
        }
    }

    function linhaDeConta(ct) {
        var linha = document.createElement('div');
        linha.className = 'ic-conta';
        var criadoEm = ct.criado_em ? new Date(ct.criado_em) : null;
        texto(linha, 'span',
              (ct.criada_aqui ? 'Acesso liberado aqui' : 'Conta do Vibe ligada')
              + ' para ' + ct.email
              + (criadoEm && !isNaN(criadoEm.getTime())
                 ? ' em ' + criadoEm.toLocaleDateString('pt-BR') : '')
              + (ct.senha_provisoria ? ' · ainda com a senha provisória' : ''));
        if (ct.criada_aqui) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-sm btn-outline';
            b.style.marginLeft = '8px';
            b.textContent = 'Nova senha provisória';
            b.addEventListener('click', function () { novaSenhaProvisoria(ct, b); });
            linha.appendChild(b);
        } else {
            // A gráfica não mexe na senha de uma conta que já era do cliente no
            // ERP: ela não nasceu aqui, e trocar a senha dela derrubaria o
            // acesso da pessoa ao Vibe.
            texto(linha, 'span', ' — entra com a senha que já usa', 'ic-dim');
        }
        return linha;
    }

    /**
     * A senha provisória aparece UMA vez, como o código de pareamento do
     * aparelho — e pelo mesmo motivo: o que fica guardado é o hash dela. Se a
     * tela não disser isso em texto, o atendente fecha o pedido achando que
     * consulta depois.
     *
     * O link "Enviar por WhatsApp" nasce aqui, junto com ela: a mensagem leva
     * e-mail e senha em claro, então só existe enquanto a caixa da senha
     * existe. `desenharAcessoDoCliente` é quem o esconde de novo.
     */
    function mostrarSenhaProvisoria(senha, email) {
        $('ic-acesso-senha-valor').textContent = senha;
        $('ic-acesso-senha').style.display = '';
        $('ic-acesso-senha-copiar').onclick = function () {
            copiar(senha, 'Senha copiada.');
        };

        var mensagem = 'Olá! Seu acesso ao Ideal Control (controle de acesso da '
            + 'Ingresso Ideal) está liberado.\n\n'
            + '1) Instale o aplicativo: ' + urlInstalacao + '\n'
            + '2) Entre com o e-mail: ' + (email || '') + '\n'
            + '3) Senha provisória: ' + senha + '\n\n'
            + 'No primeiro acesso o aplicativo pede para você escolher a sua senha.';
        // `setAttribute`, nunca `innerHTML`: e-mail e senha são dado de gente,
        // e aqui só entram na URL passando por `encodeURIComponent`.
        $('ic-acesso-whatsapp').setAttribute('href',
            'https://wa.me/?text=' + encodeURIComponent(mensagem));
        $('ic-acesso-whatsapp').style.display = '';
    }

    /**
     * A tela ainda é a do pedido que fez a chamada?
     *
     * Esta pergunta existe por causa do pior defeito que este bloco poderia
     * ter. O atendente toca em "Liberar acesso" no pedido A, a resposta demora,
     * e ele abre o pedido B enquanto espera. Sem esta conferência, a senha
     * provisória de A apareceria na tela de B, embaixo do nome de B — e o
     * atendente a passaria ao cliente errado. Uma senha mostrada sob o cliente
     * errado é exatamente a falha que este bloco inteiro existe para evitar.
     *
     * Confere as DUAS coisas: o número do pedido e o id do cliente. Só o
     * pedido não bastaria — o parceiro pode trocar o cliente de uma proposta,
     * e nesse caso o mesmo número na tela já é outra gente.
     */
    /** A tela ainda esta mostrando o MESMO cliente de quando o pedido saiu? */
    function aindaNaTela(pedidoAlvo, clienteAlvo) {
        var c = estado.clienteAberto;
        return !!c && c.id_cliente === clienteAlvo;
    }

    /** O recado de quem trocou de cliente antes de a resposta chegar. */
    function avisarQueTrocouDePedido(nomeAlvo, pedidoAlvo, jaTinhaConta) {
        avisar(jaTinhaConta
            ? ('O acesso de ' + nomeAlvo + ' foi ligado à conta que ele já tinha, mas '
               + 'você já abriu outro cliente. Abra ' + nomeAlvo
               + ' de novo para ver a lista de contas.')
            : ('A senha do cliente ' + nomeAlvo + ' foi gerada, mas você já abriu '
               + 'outro cliente. Abra ' + nomeAlvo + ' de novo para gerar '
               + 'outra.'), 'warning');
    }

    function liberarAcesso() {
        var c = estado.clienteAberto;
        if (!c) { return Promise.resolve(); }
        var aviso = $('ic-acesso-aviso');
        var campo = $('ic-acesso-email');
        var email = (campo.value || '').trim().toLowerCase();
        if (!email) {
            aviso.textContent = 'Escreva o e-mail do cliente.';
            aviso.style.display = '';
            return Promise.resolve();
        }
        // O campo é `type="email"`: o próprio navegador sabe dizer se aquilo é
        // um endereço. Perguntar a ele custa nada e poupa uma ida à rede que
        // voltaria com a mesma resposta — e, numa gráfica, a volta da rede é
        // tempo de gente parada no balcão.
        if (campo.checkValidity && !campo.checkValidity()) {
            aviso.textContent = 'Escreva um e-mail válido.';
            aviso.style.display = '';
            return Promise.resolve();
        }

        // O alvo é fotografado AQUI, antes de sair da tela. Ler `estado.pedido`
        // lá na volta leria o pedido que estiver aberto NAQUELE momento, que
        // pode não ser este.
        var pedidoAlvo = estado.pedido;
        var clienteAlvo = c.id_cliente;
        var nomeAlvo = c.nome;

        $('ic-acesso-liberar').disabled = true;
        aviso.style.display = 'none';
        return pedir('/clientes/' + clienteAlvo + '/contas', {
            method: 'POST',
            body: JSON.stringify({ email: email })
        }).then(function (r) {
            if (!aindaNaTela(pedidoAlvo, clienteAlvo)) {
                avisarQueTrocouDePedido(nomeAlvo, pedidoAlvo, r && r.ja_tinha_conta);
                return;
            }
            var avisoTexto = '';
            if (r && r.ja_tinha_conta) {
                avisoTexto = 'Esse e-mail já tem conta; ela foi ligada a este cliente '
                    + 'e a pessoa entra com a senha que já usa.';
            } else if (r && r.senha_provisoria) {
                mostrarSenhaProvisoria(r.senha_provisoria, (r && r.email) || email);
            }
            // Relê o pedido para a lista de contas se atualizar. O redesenho
            // limpa a caixa da senha, então ela é reposta logo depois: perder a
            // senha provisória por causa de um refresh seria perdê-la de vez.
            return pedir('/pedidos/' + pedidoAlvo).then(function (novo) {
                if (!aindaNaTela(pedidoAlvo, clienteAlvo)) { return; }
                estado.painel = novo;
                var senhaNaTela = $('ic-acesso-senha').style.display !== 'none'
                    ? $('ic-acesso-senha-valor').textContent : '';
                desenharAcessoDoCliente();
                var emailNaTela = (r && r.email) || email;
                $('ic-acesso-email').value = emailNaTela;
                if (senhaNaTela) { mostrarSenhaProvisoria(senhaNaTela, emailNaTela); }
                if (avisoTexto) {
                    aviso.textContent = avisoTexto;
                    aviso.style.display = '';
                }
            }, function () {
                // A RELEITURA falhou — o acesso foi liberado do mesmo jeito, e a
                // senha está na tela. Dizer "não consegui liberar o acesso" aqui
                // seria mentir sobre o que aconteceu, e o atendente jogaria fora
                // uma senha boa que não aparece de novo.
                if (!aindaNaTela(pedidoAlvo, clienteAlvo)) { return; }
                $('ic-acesso-liberar').disabled = false;
                if (avisoTexto) {
                    aviso.textContent = avisoTexto;
                    aviso.style.display = '';
                }
                avisar('Acesso liberado. Não consegui atualizar a lista de contas '
                       + 'agora — recarregue o pedido para vê-la.', 'warning');
            });
        }, function (e) {
            // Rejeição do POST, e SÓ dela: um `.catch()` no fim da corrente
            // pegaria também um erro do bloco de sucesso acima e o anunciaria
            // como "não consegui liberar", depois de o acesso já ter sido
            // liberado. Por isso o segundo argumento do `.then`.
            if (!aindaNaTela(pedidoAlvo, clienteAlvo)) { return; }
            $('ic-acesso-liberar').disabled = false;
            aviso.textContent = (e && e.message) || 'Não consegui liberar o acesso agora.';
            aviso.style.display = '';
        }).catch(function (e) {
            // Rede de segurança: sem ela, um erro ao montar a tela viraria uma
            // promessa rejeitada sem dono. A frase já foi dada acima.
            if (window.console) { console.error('[ideal-control] liberarAcesso', e); }
        });
    }

    /**
     * Gerar outra senha provisória — com a pergunta DENTRO da tela.
     *
     * Nada de `confirm()`: a caixa do navegador é a mesma para tudo, não diz de
     * qual conta se trata, e cada estação da gráfica usa um navegador
     * diferente. Aqui o próprio botão vira a pergunta, com "Sim, gerar" e
     * "Não" ao lado — e a pergunta nomeia a conta que perde a senha atual.
     */
    function novaSenhaProvisoria(conta, botao) {
        var pai = botao.parentNode;
        botao.style.display = 'none';

        var pergunta = document.createElement('span');
        pergunta.className = 'ic-dim';
        pergunta.style.marginLeft = '8px';
        pergunta.textContent = 'A senha atual de ' + conta.email
            + ' deixa de valer. Gerar outra? ';
        var sim = document.createElement('button');
        sim.type = 'button';
        sim.className = 'btn btn-sm btn-primary';
        sim.textContent = 'Sim, gerar';
        var nao = document.createElement('button');
        nao.type = 'button';
        nao.className = 'btn btn-sm btn-ghost';
        nao.style.marginLeft = '6px';
        nao.textContent = 'Não';
        pai.appendChild(pergunta);
        pai.appendChild(sim);
        pai.appendChild(nao);

        function limpar() {
            [pergunta, sim, nao].forEach(function (el) {
                if (el.parentNode) { el.parentNode.removeChild(el); }
            });
            botao.style.display = '';
        }
        nao.addEventListener('click', limpar);
        sim.addEventListener('click', function () {
            sim.disabled = true;
            // Mesmo cuidado do `liberarAcesso`: o alvo é fotografado antes de
            // sair da tela. A conta também — assim um redesenho que troque o
            // objeto `conta` não muda a URL de uma chamada já em voo.
            var pedidoAlvo = estado.pedido;
            var dono = (estado.painel && estado.painel.cliente) || {};
            var clienteAlvo = dono.id_cliente;
            var nomeAlvo = dono.nome || conta.email;
            var contaAlvo = conta.auth_user_id;
            pedir('/contas/' + contaAlvo + '/nova-senha', {
                method: 'POST', body: '{}'
            }).then(function (r) {
                if (!aindaNaTela(pedidoAlvo, clienteAlvo)) {
                    avisarQueTrocouDePedido(nomeAlvo, pedidoAlvo, false);
                    return;
                }
                limpar();
                mostrarSenhaProvisoria(r.senha_provisoria, conta.email);
            }, function (e) {
                if (!aindaNaTela(pedidoAlvo, clienteAlvo)) { return; }
                limpar();
                avisar((e && e.message) || 'Não consegui gerar a senha agora.', 'error');
            }).catch(function (e) {
                if (window.console) { console.error('[ideal-control] novaSenhaProvisoria', e); }
            });
        });
    }

    /**
     * O dashboard de público.
     *
     * Números primeiro, gráfico depois. O que o atendente precisa responder ao
     * telefone é "quantos entraram?" e "por que fulano foi recusado?" — as duas
     * perguntas estão nos cartões de cima e na lista de recusas.
     */
    /**
     * O painel de público, pedido em separado.
     *
     * Ele custa cinco contagens, uma varredura das leituras e uma passada por
     * setor. Quem abre um pedido para renomear um setor não pode pagar por
     * isso — por decisão do usuário em 16/08/2026, depois de a tela levar três
     * minutos para abrir.
     */
    function carregarDashboard() {
        var botao = $('ic-dashboard-abrir');
        botao.disabled = true;
        botao.textContent = 'Carregando o painel de público…';
        return pedir('/pedidos/' + estado.pedido + '/dashboard').then(function (d) {
            estado.dashboard = d;
            botao.style.display = 'none';
            desenharDashboard();
        }).catch(function (e) {
            botao.disabled = false;
            botao.textContent = 'Ver o painel de público';
            avisar((e && e.message) || 'Não consegui carregar o painel.', 'error');
        });
    }

    function desenharDashboard() {
        var d = estado.dashboard, caixa = $('ic-dashboard');
        caixa.innerHTML = '';
        $('ic-dashboard-numeros').style.display = d ? '' : 'none';
        if (!d) { return; }

        var p = d.publico;
        [['Contratado', numero(p.contratado), 'o que o ERP vendeu, só o que tem código'],
         ['Publicado', numero(p.publicado), 'ingressos que a portaria já reconhece'],
         ['Entraram', numero(p.entraram), 'leituras aceitas na entrada'],
         ['Presentes', numero(p.presentes), 'entraram menos os que saíram'],
         ['Comparecimento', porcento(p.comparecimento_pct), 'entraram ÷ publicado'],
         ['Recusadas', numero(p.recusadas), 'leituras negadas — veja o motivo abaixo'],
         ['Cortesias', numero(p.cortesias), 'códigos de staff carregados'],
         ['Bloqueados', numero(p.bloqueados), 'ingressos dentro de faixa bloqueada']
        ].forEach(function (par) {
            var c = document.createElement('div');
            c.className = 'ic-kpi';
            c.title = par[2];
            texto(c, 'span', par[0], 'ic-kpi-rotulo');
            texto(c, 'strong', par[1], 'ic-kpi-valor');
            texto(c, 'span', par[2], 'ic-kpi-ajuda');
            caixa.appendChild(c);
        });

        // Por setor
        var porSetor = $('ic-por-setor');
        porSetor.innerHTML = '';
        (d.por_setor || []).forEach(function (s) {
            var linha = document.createElement('div');
            linha.className = 'ic-barra-linha';
            texto(linha, 'span', s.nome, 'ic-barra-nome');
            var trilho = document.createElement('div');
            trilho.className = 'ic-barra-trilho';
            var barra = document.createElement('div');
            barra.className = 'ic-barra';
            barra.style.width = Math.min(100, s.ocupacao_pct || 0) + '%';
            trilho.appendChild(barra);
            linha.appendChild(trilho);
            texto(linha, 'span', numero(s.entraram) + ' / ' + numero(s.contratado)
                  + ' · ' + porcento(s.ocupacao_pct), 'ic-dim');
            porSetor.appendChild(linha);
        });

        // Recusas
        var recusas = $('ic-recusas');
        recusas.innerHTML = '';
        if (!(d.recusas || []).length) {
            texto(recusas, 'p', 'Nenhuma leitura recusada até agora.', 'ic-dim');
        }
        (d.recusas || []).forEach(function (r) {
            var linha = document.createElement('div');
            linha.className = 'ic-barra-linha';
            texto(linha, 'span', r.rotulo, 'ic-barra-nome');
            texto(linha, 'strong', numero(r.quantas));
            recusas.appendChild(linha);
        });

        // Entradas por hora
        var grafico = $('ic-por-hora');
        grafico.innerHTML = '';
        var horas = d.por_hora || [];
        if (!horas.length) {
            texto(grafico, 'p', 'Nenhuma leitura registrada ainda.', 'ic-dim');
        } else {
            var maior = Math.max.apply(null, horas.map(function (h) {
                return h.entradas + h.recusas;
            }).concat([1]));
            horas.forEach(function (h) {
                var col = document.createElement('div');
                col.className = 'ic-coluna';
                col.title = horaCurta(h.hora) + ' · ' + h.entradas + ' entradas, '
                          + h.recusas + ' recusas, ' + h.saidas + ' saídas';
                var pilha = document.createElement('div');
                pilha.className = 'ic-pilha';
                var e = document.createElement('div');
                e.className = 'ic-parte-entrada';
                e.style.height = (h.entradas / maior * 100) + '%';
                var n = document.createElement('div');
                n.className = 'ic-parte-recusa';
                n.style.height = (h.recusas / maior * 100) + '%';
                pilha.appendChild(n);
                pilha.appendChild(e);
                col.appendChild(pilha);
                texto(col, 'span', horaCurta(h.hora), 'ic-coluna-rotulo');
                grafico.appendChild(col);
            });
        }

        // Nenhum corte silencioso: se o gráfico não coube, ele diz.
        var aviso = $('ic-grafico-aviso');
        aviso.style.display = d.grafico_truncado ? '' : 'none';
        aviso.textContent = 'Este gráfico mostra as primeiras '
            + numero(d.leituras_lidas) + ' leituras deste evento. Os números '
            + 'acima continuam contando o evento inteiro.';

        var pico = $('ic-pico');
        pico.textContent = d.pico
            ? ('Pico de entrada: ' + horaCurta(d.pico))
            : 'Sem pico ainda — nenhuma entrada registrada.';
    }

    function desenharEvento() {
        var ev = estado.painel.evento;
        $('ic-evento-secao').style.display = ev ? '' : 'none';
        $('ic-sem-evento').style.display = ev ? 'none' : '';
        if (!ev) { return; }
        $('ic-ev-nome').value = ev.nome_evento || '';
        $('ic-ev-local').value = ev.local_evento || '';
        $('ic-ev-data').value = deISOParaCampo(ev.data_evento);
        desenharSituacaoDoEvento(ev);
    }

    /**
     * A situacao do evento, espelhada do aplicativo do cliente.
     *
     * As tres palavras sao as dele, e o efeito de cada botao e o mesmo que a
     * engrenagem do celular faz -- a grafica e o cliente mexem na MESMA coluna.
     *
     * "Inativar" para o evento inteiro: nenhum aparelho aceita ingresso
     * enquanto estiver assim. "Finalizar" arquiva: o evento sai de Meus Eventos
     * e vai para a lista de finalizados do cliente. Nenhum dos dois apaga nada.
     */
    function desenharSituacaoDoEvento(ev) {
        var ativo = ev.status === 'ativo';
        var finalizado = ev.status === 'finalizado';
        $('ic-ev-situacao').textContent = finalizado
            ? 'Finalizado. Ele saiu de "Meus Eventos" no aplicativo do cliente e está '
              + 'na lista de finalizados dele.'
            : (ativo
                ? 'Ativo. Os aparelhos deste evento estão aceitando ingresso.'
                : 'Inativo. Nenhum aparelho deste evento aceita ingresso agora — '
                  + 'aparelho sem internet só recebe a mudança quando voltar a ter sinal.');

        var ativar = $('ic-ev-ativar');
        ativar.textContent = ativo ? 'Inativar este evento' : 'Ativar este evento';
        // Um evento finalizado nao se inativa: ele ja saiu de cena, e o caminho
        // de volta e o "Reabrir" ao lado.
        ativar.style.display = finalizado ? 'none' : '';
        ativar.onclick = function () {
            trocarStatusDoEvento(ativo ? 'encerrado' : 'ativo');
        };

        var finalizar = $('ic-ev-finalizar');
        finalizar.textContent = finalizado ? 'Reabrir este evento' : 'Finalizar este evento';
        finalizar.onclick = function () {
            trocarStatusDoEvento(finalizado ? 'ativo' : 'finalizado');
        };
    }

    function trocarStatusDoEvento(status) {
        return gravar('/eventos/' + estado.painel.evento.id, { status: status })
            .then(recarregar).catch(function () { /* já avisado */ });
    }

    // ── Setores ─────────────────────────────────────────────────────────────

    function desenharSetores() {
        var caixa = $('ic-setores');
        caixa.innerHTML = '';
        var setores = estado.painel.setores || [];
        $('ic-setores-secao').style.display = setores.length ? '' : 'none';
        setores.forEach(function (s) { caixa.appendChild(cartaoDeSetor(s)); });
    }

    function cartaoDeSetor(s) {
        var el = document.createElement('div');
        el.className = 'card ic-setor';
        el.id = 'ic-setor-' + s.id;

        var topo = document.createElement('div');
        topo.className = 'ic-setor-topo';
        texto(topo, 'h3', s.nome);
        // Só o que veio do ERP: quantidade contratada e faixa impressa. As
        // contagens (publicadas, entradas, cortesias) custam três idas ao
        // banco POR SETOR, e por decisão do usuário elas só acontecem quando
        // ele abre a lista deste setor. Até lá, esta linha não mente — ela
        // apenas não fala de números que ninguém pediu.
        var faixa = faixaImpressa(numeroDeDoSetor(s), numeroAteDoSetor(s));
        texto(topo, 'span', numero(s.quantidade) + ' contratados'
              + (faixa ? ' · ' + faixa : ''), 'ic-dim');
        var numeros = texto(topo, 'span', '', 'ic-dim');
        numeros.id = 'ic-numeros-' + s.id;
        el.appendChild(topo);

        // ── Configuração ───────────────────────────────────────────────────
        var grade = document.createElement('div');
        grade.className = 'ic-grade';

        campo(grade, 'Nome na portaria', 'text', 'ic-setor-nome-' + s.id, s.nome,
              'É o que o porteiro lê na tela do celular.');

        var uso = document.createElement('div');
        uso.className = 'ic-campo';
        texto(uso, 'label', 'Uso do ingresso');
        var sel = document.createElement('select');
        sel.className = 'form-control';
        sel.id = 'ic-setor-uso-' + s.id;
        [['unico', 'Vale uma entrada só'],
         ['reentrada', 'Permite sair e voltar']].forEach(function (par) {
            var op = document.createElement('option');
            op.value = par[0];
            op.textContent = par[1];
            op.selected = (s.tipo_uso === par[0]);
            sel.appendChild(op);
        });
        uso.appendChild(sel);
        grade.appendChild(uso);

        campo(grade, 'Abre em', 'datetime-local', 'ic-setor-abre-' + s.id,
              deISOParaCampo(s.abre_em),
              'Vazio = já está valendo. A portaria aceita a qualquer momento.');
        campo(grade, 'Fecha em', 'datetime-local', 'ic-setor-fecha-' + s.id,
              deISOParaCampo(s.fecha_em), 'Vazio = não fecha.');
        el.appendChild(grade);

        var salvar = document.createElement('button');
        salvar.className = 'btn btn-sm btn-primary';
        salvar.id = 'ic-setor-salvar-' + s.id;
        salvar.textContent = 'Salvar configuração do setor';
        salvar.addEventListener('click', function () {
            gravar('/setores/' + s.id, {
                nome: $('ic-setor-nome-' + s.id).value,
                tipo_uso: $('ic-setor-uso-' + s.id).value,
                abre_em: doCampoParaISO($('ic-setor-abre-' + s.id).value),
                fecha_em: doCampoParaISO($('ic-setor-fecha-' + s.id).value)
            }).then(recarregar).catch(function () { /* já avisado */ });
        });
        el.appendChild(salvar);

        el.appendChild(bloqueioDoSetorInteiro(s));
        el.appendChild(bloqueiosDoSetor(s));
        el.appendChild(codigosDoSetor(s));
        el.appendChild(ingressosDoSetor(s));
        return el;
    }

    /** O setor guarda o modelo; a faixa impressa está no modelo. */
    function numeroDeDoSetor(s) { return (modeloDoSetor(s) || {}).numero_de; }
    function numeroAteDoSetor(s) { return (modeloDoSetor(s) || {}).numero_ate; }
    function modeloDoSetor(s) {
        return (estado.painel.modelos || []).find(function (m) {
            return String(m.modelo_id) === String(s.modelo_id);
        });
    }

    function campo(pai, rotulo, tipo, id, valor, ajuda) {
        var c = document.createElement('div');
        c.className = 'ic-campo';
        var l = texto(c, 'label', rotulo);
        l.setAttribute('for', id);
        var i = document.createElement('input');
        i.type = tipo;
        i.id = id;
        i.className = 'form-control';
        i.value = valor === null || valor === undefined ? '' : valor;
        c.appendChild(i);
        if (ajuda) { texto(c, 'span', ajuda, 'ic-ajuda'); }
        pai.appendChild(c);
        return i;
    }

    /**
     * O setor INTEIRO bloqueado -- espelho do que o cliente faz no aplicativo.
     *
     * E diferente de bloquear uma faixa: aqui nenhum ingresso daquele setor
     * entra, e o motivo e o que o porteiro le em voz alta para a pessoa na
     * frente dele. Ate 18/08/2026 a grafica nao via este estado, e o atendente
     * atendia o telefone sem saber que o proprio dono tinha fechado o portao.
     */
    function bloqueioDoSetorInteiro(s) {
        var el = document.createElement('div');
        el.className = 'ic-bloco';
        el.id = 'ic-setor-bloqueio-' + s.id;
        texto(el, 'h4', 'Setor inteiro');

        if (s.bloqueado) {
            texto(el, 'p', 'BLOQUEADO — nenhum ingresso deste setor entra. Motivo: '
                  + (s.bloqueado_motivo || 'sem motivo escrito'), 'ic-alerta');
            var liberar = document.createElement('button');
            liberar.className = 'btn btn-sm btn-primary';
            liberar.id = 'ic-setor-liberar-' + s.id;
            liberar.textContent = 'Liberar o setor';
            liberar.addEventListener('click', function () {
                gravar('/setores/' + s.id, { bloqueado: false })
                    .then(recarregar).catch(function () { /* já avisado */ });
            });
            el.appendChild(liberar);
            return el;
        }

        texto(el, 'p', 'Bloquear para o porteiro recusar TODOS os ingressos deste '
              + 'setor, com o motivo na tela dele.', 'ic-ajuda');
        var motivo = campo(el, 'Motivo', 'text', 'ic-setor-bloq-motivo-' + s.id, '',
                           'O porteiro lê isto em voz alta.');
        var bloquear = document.createElement('button');
        bloquear.className = 'btn btn-sm btn-outline';
        bloquear.id = 'ic-setor-bloquear-' + s.id;
        bloquear.textContent = 'Bloquear o setor inteiro';
        bloquear.addEventListener('click', function () {
            gravar('/setores/' + s.id, {
                bloqueado: true, bloqueado_motivo: motivo.value
            }).then(recarregar).catch(function () { /* já avisado */ });
        });
        el.appendChild(bloquear);
        return el;
    }

    function bloqueiosDoSetor(s) {
        var caixa = document.createElement('div');
        caixa.className = 'ic-bloco';
        texto(caixa, 'h4', 'Bloquear ingressos');
        texto(caixa, 'p', 'A portaria recusa a faixa e mostra o motivo que você '
              + 'escrever. Serve para lote não pago ou roubado.', 'ic-ajuda');

        var linha = document.createElement('div');
        linha.className = 'ic-grade';
        campo(linha, 'Do ingresso', 'number', 'ic-bloq-de-' + s.id, '');
        campo(linha, 'Até o', 'number', 'ic-bloq-ate-' + s.id, '');
        campo(linha, 'Motivo (a portaria vai ler isto)', 'text',
              'ic-bloq-motivo-' + s.id, '');
        caixa.appendChild(linha);

        var b = document.createElement('button');
        b.className = 'btn btn-sm btn-danger';
        b.id = 'ic-bloq-criar-' + s.id;
        b.textContent = 'Bloquear esta faixa';
        b.addEventListener('click', function () {
            gravar('/setores/' + s.id + '/bloqueios', {
                de: $('ic-bloq-de-' + s.id).value,
                ate: $('ic-bloq-ate-' + s.id).value,
                motivo: $('ic-bloq-motivo-' + s.id).value
            }, 'POST').then(recarregar).catch(function () { /* já avisado */ });
        });
        caixa.appendChild(b);

        var lista = document.createElement('div');
        lista.className = 'ic-lista-bloqueios';
        if (!(s.bloqueios || []).length) {
            texto(lista, 'p', 'Nenhum ingresso bloqueado neste setor.', 'ic-dim');
        }
        (s.bloqueios || []).forEach(function (bl) {
            var l = document.createElement('div');
            l.className = 'ic-bloqueio';
            texto(l, 'span', bl.de + ' a ' + bl.ate + ' · ' + bl.motivo);
            var liberar = document.createElement('button');
            liberar.className = 'btn btn-sm btn-ghost';
            liberar.id = 'ic-bloq-liberar-' + bl.id;
            liberar.textContent = 'Liberar';
            liberar.addEventListener('click', function () {
                if (!window.confirm('Liberar os ingressos ' + bl.de + ' a ' + bl.ate
                        + '? Eles voltam a entrar na portaria.')) { return; }
                gravar('/setores/' + s.id + '/bloqueios/' + bl.id, {}, 'DELETE')
                    .then(recarregar).catch(function () { /* já avisado */ });
            });
            l.appendChild(liberar);
            lista.appendChild(l);
        });
        caixa.appendChild(lista);
        return caixa;
    }

    function codigosDoSetor(s) {
        var caixa = document.createElement('div');
        caixa.className = 'ic-bloco';
        texto(caixa, 'h4', 'Códigos de staff e cortesia');
        texto(caixa, 'p', 'Códigos que não foram impressos no pedido e mesmo assim '
              + 'entram por este setor.', 'ic-ajuda');

        var area = document.createElement('textarea');
        area.className = 'form-control';
        area.id = 'ic-codigos-' + s.id;
        area.rows = 4;
        area.placeholder = 'Um código por linha';
        caixa.appendChild(area);

        var b = document.createElement('button');
        b.className = 'btn btn-sm btn-secondary';
        b.id = 'ic-codigos-enviar-' + s.id;
        b.textContent = 'Carregar códigos neste setor';
        b.addEventListener('click', function () {
            var codigos = String(area.value || '').split(/[\r\n]+/)
                .map(function (l) { return l.trim(); })
                .filter(function (l) { return l.length > 0; });
            if (!codigos.length) {
                avisar('Cole ao menos um código.', 'warning');
                return;
            }
            gravar('/setores/' + s.id + '/codigos', { codigos: codigos }, 'POST')
                .then(function (r) {
                    avisar(r.gravados + ' código(s) entraram; '
                           + r.ja_existiam + ' já estavam lá.', 'success');
                    area.value = '';
                    return recarregar();
                }).catch(function () { /* já avisado */ });
        });
        caixa.appendChild(b);
        return caixa;
    }

    /**
     * A lista de ingressos do setor.
     *
     * Paginada, e a paginação não é enfeite: um setor de 5.000 traria 5.000
     * linhas para o navegador desenhar, e o PostgREST cortaria em 1.000 sem
     * avisar. Ela abre fechada — quem procura um ingresso específico usa a
     * busca, e quem só está configurando o setor não precisa da lista aberta.
     */
    function ingressosDoSetor(s) {
        var caixa = document.createElement('div');
        caixa.className = 'ic-bloco';

        var abrir = document.createElement('button');
        abrir.className = 'btn btn-sm btn-outline';
        abrir.id = 'ic-ingressos-abrir-' + s.id;
        abrir.textContent = 'Ver os ingressos deste setor';
        abrir.setAttribute('aria-expanded', 'false');
        caixa.appendChild(abrir);

        var painel = document.createElement('div');
        painel.id = 'ic-ingressos-' + s.id;
        painel.style.display = 'none';
        caixa.appendChild(painel);

        abrir.addEventListener('click', function () {
            var fechado = painel.style.display === 'none';
            painel.style.display = fechado ? '' : 'none';
            abrir.setAttribute('aria-expanded', fechado ? 'true' : 'false');
            abrir.textContent = fechado ? 'Fechar a lista'
                                        : 'Ver os ingressos deste setor';
            if (fechado && !estado.ingressos[s.id]) {
                painel.textContent = 'Carregando os ingressos deste setor…';
                carregarIngressos(s.id, 1);
            }
        });

        if (estado.ingressos[s.id]) {
            painel.style.display = '';
            abrir.setAttribute('aria-expanded', 'true');
            abrir.textContent = 'Fechar a lista';
            pintarIngressos(painel, s.id);
        }
        return caixa;
    }

    function carregarIngressos(setor_id, pagina, busca) {
        var caminho = '/setores/' + setor_id + '/ingressos?pagina=' + pagina
                    + '&por_pagina=200';
        if (busca) { caminho += '&busca=' + encodeURIComponent(busca); }
        return pedir(caminho).then(function (r) {
            var antes = estado.ingressos[setor_id] || {};
            estado.ingressos[setor_id] = {
                pagina: r.pagina, ha_mais: r.ha_mais, lista: r.ingressos,
                busca: busca || '', setor: r.setor,
                // Os números só vêm na primeira página. Nas seguintes, o
                // servidor manda nulo e o que já estava na tela continua
                // valendo — senão a linha do setor piscaria para vazio a cada
                // "Próximos".
                numeros: r.numeros || antes.numeros || null
            };
            pintarNumeros(setor_id);
            var painel = $('ic-ingressos-' + setor_id);
            if (painel) { pintarIngressos(painel, setor_id); }
        }).catch(function (e) {
            var painel = $('ic-ingressos-' + setor_id);
            if (painel) {
                painel.textContent = 'Não consegui carregar os ingressos: '
                    + ((e && e.message) || 'erro desconhecido');
            }
            avisar((e && e.message) || 'Não consegui carregar os ingressos.', 'error');
        });
    }

    /** A linha de números do setor, preenchida quando eles chegam. */
    function pintarNumeros(setor_id) {
        var el = $('ic-numeros-' + setor_id);
        var n = (estado.ingressos[setor_id] || {}).numeros;
        if (!el || !n) { return; }
        el.textContent = ' · ' + numero(n.publicadas) + ' publicadas · '
            + numero(n.entradas) + ' entraram · '
            + numero(n.codigos_cliente) + ' cortesias';
    }

    var SITUACAO = {
        disponivel: ['Disponível', 'badge-blue'],
        entrou: ['Entrou', 'badge-green'],
        bloqueado: ['Bloqueado', 'badge-red'],
        cancelado: ['Cancelado', 'badge-amber']
    };

    function pintarIngressos(painel, setor_id) {
        var dados = estado.ingressos[setor_id];
        painel.innerHTML = '';
        if (!dados) { return; }

        var barra = document.createElement('div');
        barra.className = 'ic-busca-linha';
        var busca = document.createElement('input');
        busca.type = 'search';
        busca.className = 'form-control';
        busca.id = 'ic-busca-ingresso-' + setor_id;
        busca.placeholder = 'Procurar pelo número do ingresso';
        busca.value = dados.busca || '';
        busca.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { carregarIngressos(setor_id, 1, busca.value); }
        });
        barra.appendChild(busca);
        var b = document.createElement('button');
        b.className = 'btn btn-sm btn-outline';
        b.textContent = 'Procurar';
        b.addEventListener('click', function () {
            carregarIngressos(setor_id, 1, busca.value);
        });
        barra.appendChild(b);
        painel.appendChild(barra);

        if (!dados.lista.length) {
            texto(painel, 'p', dados.busca
                  ? 'Nenhum ingresso com esse número neste setor.'
                  : 'Este setor ainda não tem ingresso publicado. Os códigos '
                    + 'entram quando o modelo é impresso.', 'ic-dim');
            return;
        }

        var tabela = document.createElement('div');
        tabela.className = 'ic-ingressos';
        dados.lista.forEach(function (i) {
            var linha = document.createElement('div');
            linha.className = 'ic-ingresso';
            texto(linha, 'span', i.numero === null || i.numero === undefined
                  ? (i.codigo || '—') : i.numero, 'ic-ingresso-numero');
            var par = SITUACAO[i.situacao] || [i.situacao, 'badge-blue'];
            var marca = document.createElement('span');
            marca.className = 'badge ' + par[1];
            marca.textContent = par[0];
            linha.appendChild(marca);
            texto(linha, 'span', i.situacao === 'entrou' ? quando(i.entrou_em)
                  : (i.motivo_bloqueio || ''), 'ic-dim');
            tabela.appendChild(linha);
        });
        painel.appendChild(tabela);

        var rodape = document.createElement('div');
        rodape.className = 'ic-paginacao';
        if (dados.pagina > 1) {
            var anterior = document.createElement('button');
            anterior.className = 'btn btn-sm btn-ghost';
            anterior.id = 'ic-pagina-anterior-' + setor_id;
            anterior.textContent = '← Anteriores';
            anterior.addEventListener('click', function () {
                carregarIngressos(setor_id, dados.pagina - 1, dados.busca);
            });
            rodape.appendChild(anterior);
        }
        texto(rodape, 'span', 'Página ' + dados.pagina, 'ic-dim');
        if (dados.ha_mais) {
            var proxima = document.createElement('button');
            proxima.className = 'btn btn-sm btn-ghost';
            proxima.id = 'ic-pagina-proxima-' + setor_id;
            proxima.textContent = 'Próximos →';
            proxima.addEventListener('click', function () {
                carregarIngressos(setor_id, dados.pagina + 1, dados.busca);
            });
            rodape.appendChild(proxima);
        }
        painel.appendChild(rodape);
    }

    // ── Aparelhos ───────────────────────────────────────────────────────────

    function desenharAparelhos() {
        var caixa = $('ic-aparelhos');
        caixa.innerHTML = '';
        var ev = estado.painel.evento;
        $('ic-aparelhos-secao').style.display = ev ? '' : 'none';
        if (!ev) { return; }

        var lista = estado.painel.aparelhos || [];
        lista.forEach(function (a) { caixa.appendChild(cartaoDeAparelho(a)); });

        // Como nasce um aparelho HOJE. O formulario "Criar um aparelho" saiu em
        // 18/08/2026 junto com o codigo de seis caracteres: a tela que o pedia
        // foi removida da portaria em 16/08, e o codigo gerado aqui nao tinha
        // mais onde ser digitado. Sem esta frase no lugar, quem procurasse o
        // botao acharia que a tela quebrou.
        var comoCriar = document.createElement('div');
        comoCriar.className = 'card ic-aparelho';
        comoCriar.id = 'ic-como-criar-aparelho';
        texto(comoCriar, 'h4', 'Como entra um aparelho novo');
        texto(comoCriar, 'p', 'Quem põe um aparelho no ar é o próprio cliente, no '
              + 'celular: ele abre o Ideal Control, toca na barra do evento e digita '
              + 'a senha da conta dele. O nome que ele escolher vale para esse '
              + 'celular em todos os eventos.', 'ic-ajuda');
        if (!lista.length) {
            texto(comoCriar, 'p', 'Este evento ainda não tem nenhum aparelho.', 'ic-dim');
        }
        caixa.appendChild(comoCriar);
    }

    function cartaoDeAparelho(a) {
        var el = document.createElement('div');
        el.className = 'card ic-aparelho';
        texto(el, 'h4', a.nome);
        texto(el, 'span', (a.status === 'ativo' ? 'Ativo'
                           : (a.status === 'pausado' ? 'Pausado' : 'Desligado'))
              + ' · ' + (a.pareado ? 'já pareado' : 'nunca pareado')
              + ' · visto ' + quando(a.ultimo_visto), 'ic-dim');

        var nome = campo(el, 'Nome do aparelho', 'text', 'ic-ap-nome-' + a.id, a.nome);

        texto(el, 'p', 'Toque nos setores que este aparelho valida. O que estiver '
              + 'aceso vale na hora.', 'ic-ajuda');
        el.appendChild(botoesDeSetor('ic-ap-setores-' + a.id, a.setores,
            function (setores) {
                gravar('/aparelhos/' + a.id, { setores: setores })
                    .then(recarregar).catch(function () { /* já avisado */ });
            }));

        var salvar = document.createElement('button');
        salvar.className = 'btn btn-sm btn-primary';
        salvar.id = 'ic-ap-salvar-' + a.id;
        salvar.textContent = 'Salvar nome';
        salvar.addEventListener('click', function () {
            if (nome.value === a.nome) { return; }
            gravar('/aparelhos/' + a.id, { nome: nome.value })
                .then(recarregar).catch(function () { /* já avisado */ });
        });
        el.appendChild(salvar);

        // Pausar e Excluir, o mesmo par que o Ideal Control do cliente oferece
        // desde 18/08/2026. "Revogar" saiu: ele desligava o aparelho e o
        // deixava na lista para sempre, que nao era nenhuma das duas coisas que
        // alguem quer fazer com um portao que nao serve mais.
        var ativo = a.status === 'ativo';
        var pausar = document.createElement('button');
        pausar.className = 'btn btn-sm btn-outline';
        pausar.id = 'ic-ap-pausar-' + a.id;
        pausar.textContent = ativo ? 'Pausar' : 'Retomar';
        pausar.addEventListener('click', function () {
            if (ativo && !window.confirm('Pausar "' + a.nome + '"? Ele para de validar '
                    + 'ingresso agora, e volta quando você tocar em "Retomar".')) { return; }
            gravar('/aparelhos/' + a.id, { status: ativo ? 'pausado' : 'ativo' })
                .then(recarregar).catch(function () { /* já avisado */ });
        });
        el.appendChild(pausar);

        var excluir = document.createElement('button');
        excluir.className = 'btn btn-sm btn-danger';
        excluir.id = 'ic-ap-excluir-' + a.id;
        excluir.textContent = 'Excluir';
        excluir.addEventListener('click', function () {
            if (!window.confirm('Excluir "' + a.nome + '"? Ele sai da lista para sempre '
                    + 'e para de validar ingresso agora. As entradas que ele já leu '
                    + 'continuam contadas no evento.')) { return; }
            gravar('/aparelhos/' + a.id, null, 'DELETE')
                .then(recarregar).catch(function () { /* já avisado */ });
        });
        el.appendChild(excluir);
        return el;
    }

    /** Igual ao `controle.js`: botão que acende, e o estado mora no
     *  `aria-pressed` — não numa variável que o redesenho perderia. */
    function botoesDeSetor(id, escolhidos, aoTrocar) {
        var caixa = document.createElement('div');
        caixa.id = id;
        caixa.className = 'ic-setores-botoes';
        (estado.painel.setores || []).forEach(function (s) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ic-setor-botao';
            b.id = id + '-' + s.id;
            b.dataset.setor = s.id;
            b.textContent = s.nome;
            b.setAttribute('aria-pressed',
                (escolhidos || []).indexOf(s.id) >= 0 ? 'true' : 'false');
            b.addEventListener('click', function () {
                var aceso = b.getAttribute('aria-pressed') === 'true';
                b.setAttribute('aria-pressed', aceso ? 'false' : 'true');
                if (aoTrocar) { aoTrocar(setoresAcesos(id)); }
            });
            caixa.appendChild(b);
        });
        return caixa;
    }

    function setoresAcesos(id) {
        var caixa = $(id);
        if (!caixa) { return []; }
        return Array.prototype.slice
            .call(caixa.querySelectorAll('button[aria-pressed="true"]'))
            .map(function (b) { return b.dataset.setor; });
    }

    function recarregar() {
        return estado.pedido ? abrirPedido(estado.pedido) : Promise.resolve();
    }

    // ── Arranque ────────────────────────────────────────────────────────────

    /**
     * Liga a tela. Chamada a cada abertura da view.
     *
     * Os ouvintes são ligados UMA vez — abrir a tela duas vezes com dois
     * ouvintes no mesmo botão faria cada clique gravar duas vezes —, mas a
     * lista de pedidos recentes recarrega sempre: um pedido publicado enquanto
     * o atendente estava em outra tela precisa aparecer quando ele volta.
     */
    var jaLigou = false;

    function iniciar() {
        if (jaLigou) { return listarRecentes(); }
        jaLigou = true;

        $('ic-buscar').addEventListener('click', function () {
            abrirCliente($('ic-busca').value);
        });
        $('ic-busca').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { abrirCliente($('ic-busca').value); }
        });
        $('ic-dashboard-abrir').addEventListener('click', carregarDashboard);
        $('ic-ev-salvar').addEventListener('click', function () {
            gravar('/eventos/' + estado.painel.evento.id, {
                nome_evento: $('ic-ev-nome').value,
                local_evento: $('ic-ev-local').value,
                data_evento: doCampoParaISO($('ic-ev-data').value)
            }).then(recarregar).catch(function () { /* já avisado */ });
        });
        return listarRecentes();
    }

    window.IdealControl = {
        estado: estado,
        iniciar: iniciar,
        abrirCliente: abrirCliente,
        abrirPedido: abrirPedido,
        listarRecentes: listarRecentes,
        desenhar: desenhar,
        carregarIngressos: carregarIngressos,
        setoresAcesos: setoresAcesos,
        // Expostas porque são a única lógica desta tela que erra em silêncio:
        // uma faixa mal formatada ainda é uma faixa, e um fuso errado ainda é
        // um horário.
        faixaImpressa: faixaImpressa,
        doCampoParaISO: doCampoParaISO,
        deISOParaCampo: deISOParaCampo,
        // Substituível pelo teste de navegador, que não tem backend. Lido
        // dentro de `pedir()`, a cada chamada.
        _pedirParaTeste: null
    };
})();
