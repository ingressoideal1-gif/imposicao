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

    var API = (['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0
               || location.port === '9000') ? '' : 'https://imposicao.onrender.com';
    var BASE = API + '/api/acesso/interno';

    var estado = {
        pedido: null,        // o número pesquisado
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

        (estado.painel.aparelhos || []).forEach(function (a) {
            caixa.appendChild(cartaoDeAparelho(a));
        });
        caixa.appendChild(formularioDeAparelho());
    }

    function cartaoDeAparelho(a) {
        var el = document.createElement('div');
        el.className = 'card ic-aparelho';
        texto(el, 'h4', a.nome);
        texto(el, 'span', (a.status === 'ativo' ? 'Ativo' : 'Revogado')
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

        var codigo = document.createElement('button');
        codigo.className = 'btn btn-sm btn-outline';
        codigo.id = 'ic-ap-codigo-' + a.id;
        codigo.textContent = 'Gerar código de pareamento';
        codigo.addEventListener('click', function () {
            pedir('/aparelhos/' + a.id + '/codigo', { method: 'POST', body: '{}' })
                .then(function (r) { mostrarCodigo(a.nome, r.codigo); })
                .catch(function (e) { avisar(e.message, 'error'); });
        });
        el.appendChild(codigo);

        if (a.status === 'ativo') {
            var revogar = document.createElement('button');
            revogar.className = 'btn btn-sm btn-danger';
            revogar.id = 'ic-ap-revogar-' + a.id;
            revogar.textContent = 'Revogar';
            revogar.addEventListener('click', function () {
                if (!window.confirm('Revogar "' + a.nome + '"? Isso DESLIGA o aparelho '
                        + 'agora — ele para de validar na portaria imediatamente. '
                        + 'Nesta versão não há como reativar.')) { return; }
                gravar('/aparelhos/' + a.id, { status: 'revogado' })
                    .then(recarregar).catch(function () { /* já avisado */ });
            });
            el.appendChild(revogar);
        }
        return el;
    }

    function formularioDeAparelho() {
        var el = document.createElement('div');
        el.className = 'card ic-aparelho';
        texto(el, 'h4', 'Criar um aparelho');
        texto(el, 'p', 'Pré-configure os portões antes de entregar o evento ao '
              + 'cliente: ele recebe o Ideal Control pronto para parear.', 'ic-ajuda');

        var nome = campo(el, 'Nome do novo aparelho', 'text', 'ic-novo-ap-nome', '');
        nome.placeholder = 'Ex.: Portão A';
        texto(el, 'p', 'Toque nos setores que este aparelho valida', 'ic-ajuda');
        el.appendChild(botoesDeSetor('ic-novo-ap-setores', [], null));

        var criar = document.createElement('button');
        criar.className = 'btn btn-sm btn-primary';
        criar.id = 'ic-novo-ap-criar';
        criar.textContent = 'Criar aparelho';
        criar.addEventListener('click', function () {
            gravar('/eventos/' + estado.painel.evento.id + '/aparelhos', {
                nome: nome.value,
                setores: setoresAcesos('ic-novo-ap-setores')
            }, 'POST').then(function (r) {
                mostrarCodigo(r.nome, r.codigo);
                nome.value = '';
                return recarregar();
            }).catch(function () { /* já avisado */ });
        });
        el.appendChild(criar);
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

    /**
     * O código de pareamento aparece UMA vez.
     *
     * Ele não fica guardado em lugar nenhum — o que fica é o hash. Se a tela
     * não disser isso em texto, o atendente fecha a caixa achando que consulta
     * depois, e descobre na porta do evento que não dá.
     */
    function mostrarCodigo(nomeAparelho, codigo) {
        $('ic-codigo-titulo').textContent = 'Código de "' + nomeAparelho + '"';
        $('ic-codigo-valor').textContent = codigo;
        $('ic-codigo-caixa').style.display = '';
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
            abrirPedido($('ic-busca').value);
        });
        $('ic-busca').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { abrirPedido($('ic-busca').value); }
        });
        $('ic-dashboard-abrir').addEventListener('click', carregarDashboard);
        $('ic-codigo-fechar').addEventListener('click', function () {
            $('ic-codigo-caixa').style.display = 'none';
            $('ic-codigo-valor').textContent = '';
        });
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
