/**
 * A ENGRENAGEM: toda a configuração do evento, atrás de uma senha.
 *
 * Este arquivo já foi a tela inteira do dono — lista de eventos, leitura de QR e
 * configuração no mesmo lugar. Desde 16/08/2026 ele faz uma coisa só. Quem
 * desenha a casa é o `lista-eventos.js`; quem transforma este celular em portão
 * é o `virar-portao.js`; quem guarda os portões deste aparelho é o
 * `chaveiro.js`. Aqui mora o que abre pelo ícone de engrenagem ao lado da barra
 * do evento.
 *
 * ## Como esta tela autoriza
 *
 * No celular do porteiro NÃO existe sessão — ela foi encerrada quando o aparelho
 * virou portão, e é isso que impede quem ficar com ele de entrar na conta do
 * cliente. A engrenagem faz um login relâmpago (`comSenha`): entra, deixa
 * configurar por 15 minutos, e sai da conta ao fechar.
 *
 * Cada setor mostra o que o ERP contratou e nada mais: a lotação de um setor É a
 * quantidade contratada, então não há onde digitar outra. O que se configura por
 * setor fica atrás do botão "Configurar", num painel que abre no próprio cartão.
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
        elevacao: null,            // { token, expira_em, evento_id }
        // A sessão foi aberta PELA engrenagem? É esta bandeira que faz o
        // `fecharEngrenagem` saber se precisa desfazê-la. Uma sessão que já
        // existia — o dono no próprio celular — não pode ser encerrada só
        // porque uma caixa de configuração foi fechada.
        sessaoDaEngrenagem: false
    };

    // Achado da revisão final: `desenhar()` reatribuía `campo-nome-evento`,
    // `campo-local` e `campo-data` do ZERO a cada chamada. `elevar()` chama
    // `desenhar()`, e qualquer `gravar()` de outro cartão desta tela chama
    // `carregarPainel()` — que também chama `desenhar()`. Sem esta bandeira,
    // o dono digitando um nome novo via a senha vencer no meio da edição
    // recuperava o texto ANTIGO assim que a senha era aceita, sob o próprio
    // aviso de "Modo configuração". Depois da primeira vez, o valor que já
    // está em tela é preservado — a mesma ideia que os cartões de aparelho já
    // usam com `edicoesDeAparelhoAntes`, abaixo.
    var jaDesenhouEvento = false;

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
     * impede toque: sem `disabled`, o dono digita uma nova data, vê o campo
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
              + '"Digitar a Senha Cadastrada" — é a mesma senha com que você '
              + 'entrou aqui.'
            : '';
        // A tranca inteira some quando não há o que destrancar. Ela é
        // `sticky`, então deixá-la em tela durante o modo configuração
        // roubaria uma faixa do alto para dizer o que a faixa âmbar, logo
        // acima, já está dizendo.
        $('tranca').classList.toggle('sumindo', !leitura);

        document.querySelectorAll('#engrenagem input, #engrenagem select, #engrenagem textarea')
            .forEach(function (el) { el.disabled = leitura; });
        document.querySelectorAll('#engrenagem button.so-com-senha, #engrenagem .so-com-senha button')
            .forEach(function (el) { el.disabled = leitura; });
    }

    function desenhar() {
        var p = estado.painel;
        if (!p) { return; }

        $('nome-evento-titulo').textContent = p.evento.nome_evento;
        // Só sincroniza com o servidor na PRIMEIRA vez: dali em diante, o
        // valor que já está em tela — sincronizado antes, ou sendo digitado
        // agora — é preservado. Ver o comentário de `jaDesenhouEvento` acima.
        if (!jaDesenhouEvento) {
            $('campo-nome-evento').value = p.evento.nome_evento || '';
            $('campo-local').value = p.evento.local_evento || '';
            // `datetime-local` só aceita "AAAA-MM-DDTHH:MM"; o banco devolve
            // com segundos e fuso, e o campo fica VAZIO em silêncio se o
            // formato não bater — o dono acharia que a data nunca foi
            // gravada.
            //
            // Passa pela conversão de fuso em vez de um `.slice(0, 16)` cru: a
            // coluna é TIMESTAMPTZ, então um horário gravado às 22:00 de
            // Brasília volta como 01:00 do dia seguinte em UTC, e o corte
            // mostraria esse 01:00 na tela. Ver `deISOParaCampo`.
            $('campo-data').value = deISOParaCampo(p.evento.data_evento);
            jaDesenhouEvento = true;
        }

        // Mesma ideia dos cartões de aparelho, um degrau abaixo: cada cartão
        // de setor é reconstruído a cada painel, e sem capturar o que já
        // estava em tela ANTES de apagar, o dono perderia o que tinha acabado
        // de escolher — e o painel de configuração se fecharia sozinho — se
        // qualquer outro cartão desta tela disparar um redesenho por baixo
        // dele. Gravar uma opção JÁ é um desses redesenhos: `gravarSetor`
        // termina em `carregarPainel()`.
        var edicoesDeSetorAntes = {};
        p.setores.forEach(function (s) {
            var painelConfig = $('setor-config-' + s.id);
            if (!painelConfig) { return; }
            var marcado = document.querySelector('input[name="uso-' + s.id + '"]:checked');
            var valor = function (id) {
                var el = $(id + '-' + s.id);
                return el ? el.value : '';
            };
            edicoesDeSetorAntes[s.id] = {
                aberto: !painelConfig.classList.contains('sumindo'),
                tipo_uso: marcado ? marcado.value : s.tipo_uso,
                nome: valor('setor-nome'),
                abre_em: valor('setor-abre_em'),
                fecha_em: valor('setor-fecha_em'),
                // O formulário de bloqueio conta MAIS do que os outros campos:
                // o dono digita três coisas seguidas, e um redesenho disparado
                // por outro cartão no meio disso apagaria os três — sem ele ter
                // tocado neste formulário.
                bloq_de: valor('bloq-de'),
                bloq_ate: valor('bloq-ate'),
                bloq_motivo: valor('bloq-motivo'),
                // O motivo de bloquear o SETOR INTEIRO, pela mesma razão: o
                // dono escreve a frase que o porteiro vai ler em voz alta, e um
                // redesenho no meio da digitação a apagaria.
                setor_bloq_motivo: valor('setor-bloq-motivo'),
                // Pelo mesmo motivo, e com mais razão ainda: a lista de
                // códigos de staff é colada de uma planilha e pode ter
                // centenas de linhas. Perdê-la num redesenho é perder o
                // trabalho todo.
                codigos: valor('codigos-texto')
            };
        });

        $('setores').innerHTML = '';
        p.setores.forEach(function (s) {
            $('setores').appendChild(cartaoDeSetor(s, edicoesDeSetorAntes[s.id]));
        });

        // Mesma lógica, um degrau abaixo: cada cartão de aparelho tem seu
        // próprio campo de nome e suas próprias caixas de setor, e o cartão
        // inteiro é substituído a cada painel. Sem isto, o dono que está
        // editando o nome de um aparelho e marcando setores perde os dois se
        // QUALQUER outra gravação nesta tela disparar um `carregarPainel()` por
        // baixo dele.
        var edicoesDeAparelhoAntes = {};
        (p.aparelhos || []).forEach(function (a) {
            var campoNome = $('aparelho-nome-' + a.id);
            if (!campoNome) { return; }
            edicoesDeAparelhoAntes[a.id] = {
                nome: campoNome.value,
                setores: setoresAcesos('aparelho-setores-' + a.id)
            };
        });

        $('aparelhos').innerHTML = '';
        p.aparelhos.forEach(function (a) {
            $('aparelhos').appendChild(cartaoDeAparelho(a, edicoesDeAparelhoAntes[a.id]));
        });

        desenharAtivacao();

        // Depois dos cartões de setor existirem no DOM: são eles que trazem os
        // campos de uso e de bloqueio que a trava também precisa desligar.
        travarCampos();
        desenharFaixa();
    }

    /**
     * Ligar e desligar o evento INTEIRO.
     *
     * A ressalva vai junto, no `confirm` e no texto do bloco: um portão SEM
     * REDE só descobre a inativação quando sincronizar. Não há como ser
     * diferente — a decisão no portão é tomada com a carga que o aparelho tem.
     * Sem essa frase, o dono guarda o celular achando que os portões pararam no
     * mesmo segundo.
     */
    function desenharAtivacao() {
        var botao = $('btn-ativar-evento');
        if (!botao) { return; }
        var inativo = (estado.painel.evento || {}).status !== 'ativo';
        botao.textContent = inativo ? 'Ativar este evento' : 'Inativar este evento';
        botao.onclick = function () {
            if (!inativo && !window.confirm(
                    'Inativar "' + estado.painel.evento.nome_evento + '"? Todos '
                    + 'os portões param de aceitar ingresso. Portão sem internet '
                    + 'só recebe a mudança quando voltar a ter sinal.')) {
                return;
            }
            gravar('/eventos/' + estado.evento_id,
                   { status: inativo ? 'ativo' : 'encerrado' }, 'PATCH')
                .then(carregarPainel)
                .catch(function () { /* `gravar()` já avisou na tela */ });
        };
    }

    /**
     * `edicaoAnterior`, se vier, é o que já estava em tela (digitado pelo
     * dono ou sincronizado da rodada anterior) ANTES deste redesenho — ver o
     * comentário em `desenhar()`. O mesmo papel que `edicaoAnterior` faz em
     * `cartaoDeAparelho`.
     */
    function cartaoDeSetor(s, edicaoAnterior) {
        var el = document.createElement('div');
        el.className = 'cartao';

        var titulo = document.createElement('h3');
        titulo.textContent = s.nome;            // vem do ERP: TEXTO, nunca HTML
        el.appendChild(titulo);

        // A lotação do setor É a quantidade contratada. Por isso ela aparece
        // como informação e não como campo: um número digitado à parte seria
        // uma segunda fonte da verdade, que discorda do contrato assim que o
        // cliente aumenta o pedido no ERP.
        //
        // Junto vem a faixa impressa, porque só a quantidade não identifica o
        // lote: dois setores de 400 são indistinguíveis na tela, e o que o
        // dono tem na mão para conferir é um ingresso com um número escrito.
        var contratado = document.createElement('p');
        contratado.className = 'contratado';
        var faixa = faixaImpressa(s);
        contratado.textContent = s.quantidade.toLocaleString('pt-BR') + ' ingressos contratados'
            + (faixa ? ' · ' + faixa : '');
        el.appendChild(contratado);

        // ── Configurar ───────────────────────────────────────────────────────
        //
        // O painel nasce fechado e vive DENTRO do cartão, sem modal: a tela é
        // de uma coluna, usada no celular, e uma janela por cima esconderia
        // qual setor está sendo configurado bem na hora de escolher.
        var painel = document.createElement('div');
        painel.id = 'setor-config-' + s.id;
        painel.className = 'config-setor sumindo';

        // Sem `so-com-senha`: abrir o painel é só mostrar, e o resto da tela
        // já segue essa regra — os campos do evento aparecem preenchidos e
        // `disabled` no modo leitura. Travar o botão esconderia do dono qual
        // uso o setor tem hoje até ele digitar a senha, o que é pior. Quem
        // recusa o toque são os rádios lá dentro, que `travarCampos()` desliga.
        var btnConfigurar = document.createElement('button');
        btnConfigurar.type = 'button';
        btnConfigurar.className = 'secundario';
        btnConfigurar.id = 'setor-configurar-' + s.id;
        btnConfigurar.textContent = 'Configurar';
        btnConfigurar.setAttribute('aria-expanded', 'false');
        btnConfigurar.setAttribute('aria-controls', painel.id);
        btnConfigurar.addEventListener('click', function () {
            var fechado = painel.classList.toggle('sumindo');
            btnConfigurar.textContent = fechado ? 'Configurar' : 'Fechar';
            btnConfigurar.setAttribute('aria-expanded', fechado ? 'false' : 'true');
        });
        el.appendChild(btnConfigurar);

        // Reabre sozinho depois de um redesenho, senão gravar uma opção — que
        // chama `carregarPainel()` — fecharia o painel debaixo do dono, no
        // instante seguinte ao toque dele.
        if (edicaoAnterior && edicaoAnterior.aberto) {
            painel.classList.remove('sumindo');
            btnConfigurar.textContent = 'Fechar';
            btnConfigurar.setAttribute('aria-expanded', 'true');
        }

        // O aviso de gravado é UM por setor, no fim do painel: todos os grupos
        // acima gravam sozinhos, e um "✓ salvo" por grupo seria quatro avisos
        // repetindo a mesma coisa num cartão de celular.
        var recado = document.createElement('span');
        recado.className = 'salvo sumindo';
        recado.id = 'setor-salvo-' + s.id;
        recado.setAttribute('role', 'status');
        recado.textContent = '✓ salvo';

        painel.appendChild(nomeNaPortaria(s, edicaoAnterior));
        painel.appendChild(quandoVale(s, edicaoAnterior));
        painel.appendChild(opcoesDeUso(s, edicaoAnterior));
        painel.appendChild(recado);
        painel.appendChild(bloqueioDoSetorInteiro(s, edicaoAnterior));
        painel.appendChild(bloqueiosDoSetor(s, edicaoAnterior));
        painel.appendChild(codigosDoSetor(s, edicaoAnterior));
        el.appendChild(painel);

        return el;
    }

    /**
     * Desligar o setor INTEIRO.
     *
     * Diferente de "Bloquear ingressos", logo abaixo, que suspende uma faixa de
     * números. Aqui a porta para de receber, e o motivo é o que o porteiro lê em
     * voz alta para quem está na fila. Bloqueio mudo vira "não sei, o sistema
     * não deixou" na frente da fila.
     */
    function bloqueioDoSetorInteiro(s, edicaoAnterior) {
        var caixa = grupo('Bloquear este setor');

        var ajuda = document.createElement('p');
        ajuda.className = 'config-ajuda';
        ajuda.textContent = 'A portaria para de aceitar TODOS os ingressos deste '
            + 'setor e mostra o motivo que você escrever. Portão sem internet '
            + 'só recebe a mudança quando voltar a ter sinal.';
        caixa.appendChild(ajuda);

        if (s.bloqueado) {
            var agora = document.createElement('p');
            agora.className = 'config-ajuda';
            // O motivo é escrito pelo dono: TEXTO, nunca HTML.
            agora.textContent = 'Bloqueado: ' + (s.bloqueado_motivo || '');
            caixa.appendChild(agora);

            var liberar = document.createElement('button');
            liberar.type = 'button';
            liberar.className = 'secundario so-com-senha';
            liberar.id = 'setor-liberar-' + s.id;
            liberar.textContent = 'Liberar este setor';
            liberar.addEventListener('click', function () {
                gravarSetor(s.id, { bloqueado: false })
                    .then(function () { avisarSalvo(s.id); })
                    .catch(function () { /* `gravar()` já avisou na tela */ });
            });
            caixa.appendChild(liberar);
            return caixa;
        }

        var rot = document.createElement('label');
        rot.setAttribute('for', 'setor-bloq-motivo-' + s.id);
        rot.textContent = 'Motivo (a portaria vai ler isto)';
        caixa.appendChild(rot);

        var motivo = document.createElement('input');
        motivo.type = 'text';
        motivo.id = 'setor-bloq-motivo-' + s.id;
        motivo.placeholder = 'Ex.: camarote interditado pelos bombeiros';
        motivo.value = edicaoAnterior ? (edicaoAnterior.setor_bloq_motivo || '') : '';
        caixa.appendChild(motivo);

        var botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'so-com-senha';
        botao.id = 'setor-bloquear-' + s.id;
        botao.textContent = 'Bloquear este setor';
        botao.addEventListener('click', function () {
            gravarSetor(s.id, {
                bloqueado: true, bloqueado_motivo: motivo.value
            }).then(function () { avisarSalvo(s.id); })
              .catch(function () { /* `gravar()` já avisou na tela */ });
        });
        caixa.appendChild(botao);

        return caixa;
    }

    /**
     * Os códigos que o cliente fornece: staff, cortesia, lista VIP.
     *
     * Vivia numa seção própria no fim da tela, com um `<select>` de setor ao
     * lado e um contador global de "N códigos carregados". As duas coisas
     * eram redundantes aqui dentro: o dono já está configurando UM setor, e
     * qual ele é não precisa ser escolhido de novo numa lista onde dá para
     * errar. O contador global também não dizia nada acionável — 42 códigos
     * em qual portão? Aqui ele conta o que pertence a ESTE setor.
     *
     * O melhor momento de carregar é este, e não o fim da tela: é quando o
     * dono está decidindo como o setor funciona que ele lembra de quem entra
     * sem ingresso impresso.
     */
    function codigosDoSetor(s, edicaoAnterior) {
        var caixa = grupo('Códigos de staff e cortesia');

        var ajuda = document.createElement('p');
        ajuda.className = 'config-ajuda';
        ajuda.textContent = 'Códigos que não foram impressos no pedido e mesmo '
            + 'assim entram por este setor. A portaria aceita cada um uma vez, '
            + 'igual a um ingresso.';
        caixa.appendChild(ajuda);

        var quantos = document.createElement('p');
        quantos.className = 'config-ajuda';
        quantos.id = 'codigos-total-' + s.id;
        var n = s.codigos_cliente || 0;
        quantos.textContent = n === 1 ? '1 código carregado neste setor'
                                      : n + ' códigos carregados neste setor';
        caixa.appendChild(quantos);

        var rot = document.createElement('label');
        rot.setAttribute('for', 'codigos-texto-' + s.id);
        rot.textContent = 'Cole os códigos, um por linha';
        caixa.appendChild(rot);

        var texto = document.createElement('textarea');
        texto.id = 'codigos-texto-' + s.id;
        texto.rows = 5;
        texto.style.width = '100%';
        texto.style.fontFamily = 'inherit';
        texto.style.fontSize = '1rem';
        // Preservado no redesenho como todo o resto do painel: o dono cola uma
        // lista longa, e uma gravação de outro cartão por baixo dele apagaria
        // tudo antes de ele chegar ao botão.
        texto.value = edicaoAnterior ? (edicaoAnterior.codigos || '') : '';
        caixa.appendChild(texto);

        var botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'so-com-senha';
        botao.id = 'codigos-carregar-' + s.id;
        botao.textContent = 'Carregar códigos neste setor';
        botao.addEventListener('click', function () {
            importarCodigos(texto.value, s.id)
                .then(function () {
                    var atual = $('codigos-texto-' + s.id);
                    if (atual) { atual.value = ''; }
                })
                .catch(function () { /* `gravar()` já avisou na tela */ });
        });
        caixa.appendChild(botao);

        return caixa;
    }

    /**
     * Avisa que gravou, achando o elemento NOVO pelo id.
     *
     * Toda gravação termina em `carregarPainel()`, que reconstrói o cartão
     * inteiro: qualquer referência capturada antes da chamada já saiu do
     * documento quando a promessa resolve, e mexer nela não apareceria na tela.
     */
    function avisarSalvo(setor_id) {
        var atual = $('setor-salvo-' + setor_id);
        if (atual) { atual.classList.remove('sumindo'); }
    }

    /**
     * "de 0005 a 0500" — a faixa que está impressa nos ingressos do setor.
     *
     * Com zeros à esquerda de propósito: é assim que o número sai no papel, e
     * o que o dono faz com esta linha é comparar a tela com um ingresso na
     * mão. Quatro dígitos no mínimo pela mesma razão — abaixo disso a tela
     * escreveria "de 5 a 500" para um ingresso que diz "0005".
     *
     * Devolve texto vazio quando o modelo não tem faixa cadastrada no ERP:
     * linha nenhuma é melhor que uma faixa inventada.
     */
    function faixaImpressa(s) {
        var de = s.numero_de, ate = s.numero_ate;
        if (de === null || de === undefined || ate === null || ate === undefined) {
            return '';
        }
        var largura = Math.max(4, String(ate).length, String(de).length);
        var zeros = function (n) { return String(n).padStart(largura, '0'); };
        return 'de ' + zeros(de) + ' a ' + zeros(ate);
    }

    function grupo(rotulo) {
        var caixa = document.createElement('div');
        var titulo = document.createElement('p');
        titulo.className = 'config-titulo';
        titulo.textContent = rotulo;
        caixa.appendChild(titulo);
        return caixa;
    }

    /**
     * O nome que a portaria lê.
     *
     * O nome nasce do nome do modelo no ERP — coisas como "PISTA 2026 FRENTE
     * VERNIZ". Quem está na porta precisa ler "PISTA". O `PATCH /setores/{id}`
     * aceita `nome` desde a parte 3a; esta é a tela que faltava.
     *
     * Grava no `change`, que num campo de texto dispara ao sair do campo — e
     * não a cada tecla, o que mandaria um PATCH por letra digitada.
     */
    function nomeNaPortaria(s, edicaoAnterior) {
        var caixa = grupo('Nome na portaria');
        var campo = document.createElement('input');
        campo.type = 'text';
        campo.id = 'setor-nome-' + s.id;
        campo.value = edicaoAnterior ? edicaoAnterior.nome : (s.nome || '');
        campo.addEventListener('change', function () {
            var novo = campo.value.trim();
            if (!novo || novo === s.nome) { return; }
            gravarSetor(s.id, { nome: novo })
                .then(function () { avisarSalvo(s.id); })
                .catch(function () { /* `gravar()` já avisou na tela */ });
        });
        caixa.appendChild(campo);
        return caixa;
    }

    /**
     * A janela em que o setor vale na portaria. Vazio dos dois lados = sempre.
     *
     * FUSO HORÁRIO, e é o ponto todo destas duas funções: o `datetime-local` do
     * navegador não tem fuso nenhum — ele entrega "2026-09-28T20:00", que é a
     * hora do RELÓGIO de quem digitou. Mandar isso cru para uma coluna
     * TIMESTAMPTZ faz o Postgres lê-la como UTC, e no Brasil o portão passaria a
     * abrir às 17:00. A conversão tem de acontecer aqui, onde o fuso do dono é
     * conhecido; o servidor não tem como adivinhá-lo.
     */
    function doCampoParaISO(local) {
        if (!local) { return null; }
        var d = new Date(local);        // interpretado no fuso de quem digitou
        return isNaN(d.getTime()) ? null : d.toISOString();
    }

    function deISOParaCampo(iso) {
        if (!iso) { return ''; }
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return ''; }
        // `toISOString()` devolveria UTC de novo. Estes cinco campos montam a
        // hora local, que é o que o `datetime-local` espera.
        var p = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
             + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function quandoVale(s, edicaoAnterior) {
        var caixa = grupo('Quando vale');

        // Dizer em frase o que "(vazio = sempre)" dizia entre parênteses no
        // título. O dono lia aquilo como instrução do que ele PRECISA
        // preencher, e o caso comum — a festa de uma noite só, sem horário de
        // corte — é justamente o de não preencher nada.
        var ajuda = document.createElement('p');
        ajuda.className = 'config-ajuda';
        ajuda.textContent = 'Se você não configurar data e hora, este setor já está '
            + 'valendo: a portaria aceita a qualquer momento. Preencha só se quiser '
            + 'que ele abra ou feche em hora marcada.';
        caixa.appendChild(ajuda);

        [['abre_em', 'Abre'], ['fecha_em', 'Fecha']].forEach(function (par) {
            var rot = document.createElement('label');
            rot.setAttribute('for', 'setor-' + par[0] + '-' + s.id);
            rot.textContent = par[1];
            caixa.appendChild(rot);

            var campo = document.createElement('input');
            campo.type = 'datetime-local';
            campo.id = 'setor-' + par[0] + '-' + s.id;
            campo.value = edicaoAnterior ? edicaoAnterior[par[0]]
                                         : deISOParaCampo(s[par[0]]);
            campo.addEventListener('change', function () {
                var corpo = {};
                corpo[par[0]] = doCampoParaISO(campo.value);
                gravarSetor(s.id, corpo)
                    .then(function () { avisarSalvo(s.id); })
                    .catch(function () { /* `gravar()` já avisou na tela */ });
            });
            caixa.appendChild(campo);
        });

        return caixa;
    }

    /**
     * As opções de uso do ingresso, que gravam ao serem escolhidas.
     *
     * Não há botão de salvar: o cartão tem uma escolha só, e um botão para
     * confirmar um rádio é um passo a mais para o dono errar esquecendo de
     * tocá-lo. O "✓ salvo" ao lado é o que impede que gravar sozinho vire
     * gravar em silêncio.
     */
    function opcoesDeUso(s, edicaoAnterior) {
        var tipoAtual = edicaoAnterior ? edicaoAnterior.tipo_uso : s.tipo_uso;
        var caixa = grupo('Uso do ingresso');

        [['unico', 'Vale uma entrada só'],
         ['reentrada', 'Permite sair e voltar']].forEach(function (par) {
            var linha = document.createElement('div');
            linha.className = 'opcao';
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'uso-' + s.id;
            radio.id = 'uso-' + s.id + '-' + par[0];
            radio.value = par[0];
            radio.checked = (tipoAtual === par[0]);
            radio.addEventListener('change', function () {
                if (radio.value === s.tipo_uso) { return; }   // nada mudou de verdade
                gravarSetor(s.id, { tipo_uso: radio.value })
                    .then(function () { avisarSalvo(s.id); })
                    .catch(function () { /* `gravar()` já avisou na tela */ });
            });
            var rot = document.createElement('label');
            rot.setAttribute('for', radio.id);
            rot.textContent = par[1];
            linha.appendChild(radio);
            linha.appendChild(rot);
            caixa.appendChild(linha);
        });

        return caixa;
    }

    /**
     * Bloquear faixas de ingresso, e a lista do que está bloqueado.
     *
     * Aqui HÁ um botão, e ele é diferente do "Salvar" que saiu do cartão: aquele
     * confirmava uma escolha que já estava feita na tela; este cria uma coisa
     * nova a partir de três campos, e não teria como disparar sozinho sem
     * bloquear faixa pela metade a cada tecla digitada.
     */
    function bloqueiosDoSetor(s, edicaoAnterior) {
        var caixa = grupo('Bloquear ingressos');

        var explicacao = document.createElement('p');
        explicacao.className = 'config-ajuda';
        explicacao.textContent = 'Do primeiro ao último ingresso do lote. '
            + 'A portaria recusa e mostra o motivo que você escrever.';
        caixa.appendChild(explicacao);

        var faixa = document.createElement('div');
        faixa.className = 'faixa';
        var campos = {};
        [['de', 'De', 'number'], ['ate', 'a', 'number']].forEach(function (par) {
            var rot = document.createElement('label');
            rot.setAttribute('for', 'bloq-' + par[0] + '-' + s.id);
            rot.textContent = par[1];
            var campo = document.createElement('input');
            campo.type = par[2];
            campo.min = '1';
            campo.inputMode = 'numeric';
            campo.id = 'bloq-' + par[0] + '-' + s.id;
            campo.value = edicaoAnterior ? edicaoAnterior['bloq_' + par[0]] : '';
            campos[par[0]] = campo;
            faixa.appendChild(rot);
            faixa.appendChild(campo);
        });
        caixa.appendChild(faixa);

        var rotMotivo = document.createElement('label');
        rotMotivo.setAttribute('for', 'bloq-motivo-' + s.id);
        rotMotivo.textContent = 'Motivo (a portaria vai ler isto)';
        caixa.appendChild(rotMotivo);

        var motivo = document.createElement('input');
        motivo.type = 'text';
        motivo.id = 'bloq-motivo-' + s.id;
        motivo.placeholder = 'Ex.: lote não pago pelo PDV Centro';
        motivo.value = edicaoAnterior ? edicaoAnterior.bloq_motivo : '';
        caixa.appendChild(motivo);

        var botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'so-com-senha';
        botao.id = 'bloq-criar-' + s.id;
        botao.textContent = 'Bloquear esta faixa';
        botao.addEventListener('click', function () {
            var corpo = {
                de: campos.de.value,
                ate: campos.ate.value,
                motivo: motivo.value
            };
            gravar('/setores/' + s.id + '/bloqueios', corpo, 'POST')
                .then(function () {
                    // Limpa ANTES de recarregar, porque quem restaura os campos
                    // no redesenho é a captura feita em `desenhar()` — ela lê o
                    // que estiver na tela naquele instante. Limpar depois seria
                    // limpar elementos que já saíram do documento, e o dono
                    // veria a faixa recém-bloqueada ainda escrita no formulário,
                    // convidando a bloqueá-la de novo.
                    campos.de.value = '';
                    campos.ate.value = '';
                    motivo.value = '';
                    return carregarPainel();
                })
                .then(function () { avisarSalvo(s.id); })
                .catch(function () { /* `gravar()` já avisou na tela */ });
        });
        caixa.appendChild(botao);

        // ── O que já está bloqueado ──────────────────────────────────────────
        //
        // Sem esta lista, o dono não tem como saber o que bloqueou nem como
        // desfazer — e um lote bloqueado por engano só apareceria na porta, com
        // a fila esperando.
        var lista = document.createElement('div');
        lista.id = 'bloq-lista-' + s.id;
        var ativos = s.bloqueios || [];

        var cabeca = document.createElement('p');
        cabeca.className = 'config-titulo';
        cabeca.textContent = ativos.length
            ? 'Bloqueados'
            : 'Nenhum ingresso bloqueado neste setor.';
        lista.appendChild(cabeca);

        ativos.forEach(function (b) {
            var linha = document.createElement('div');
            linha.className = 'bloqueado';

            var texto = document.createElement('span');
            // Texto, nunca HTML: o motivo é escrito pelo dono do evento.
            texto.textContent = b.de.toLocaleString('pt-BR') + ' a '
                + b.ate.toLocaleString('pt-BR') + ' · ' + b.motivo;
            linha.appendChild(texto);

            var liberar = document.createElement('button');
            liberar.type = 'button';
            liberar.className = 'secundario so-com-senha';
            liberar.id = 'bloq-liberar-' + b.id;
            liberar.textContent = 'Liberar';
            liberar.addEventListener('click', function () {
                if (!window.confirm('Liberar os ingressos ' + b.de + ' a ' + b.ate
                        + '? Eles voltam a entrar na portaria.')) { return; }
                gravar('/setores/' + s.id + '/bloqueios/' + b.id, {}, 'DELETE')
                    .then(carregarPainel)
                    .catch(function () { /* `gravar()` já avisou na tela */ });
            });
            linha.appendChild(liberar);
            lista.appendChild(linha);
        });

        caixa.appendChild(lista);
        return caixa;
    }

    /** Toda gravação de setor passa por aqui — ver `gravar()` para o
     * protocolo de elevação vencida e o `carregarPainel()` no fim, que
     * sincroniza o cartão com o que o banco realmente gravou. */
    function gravarSetor(setor_id, corpo) {
        return gravar('/setores/' + setor_id, corpo, 'PATCH').then(carregarPainel);
    }

    function renomearAparelho(aparelho_id, nome) {
        return gravar('/aparelhos/' + aparelho_id, { nome: nome }, 'PATCH')
            .then(carregarPainel);
    }

    function trocarSetoresDoAparelho(aparelho_id, setores) {
        return gravar('/aparelhos/' + aparelho_id, { setores: setores }, 'PATCH')
            .then(carregarPainel);
    }

    function revogarAparelho(aparelho_id) {
        return gravar('/aparelhos/' + aparelho_id, { status: 'revogado' }, 'PATCH')
            .then(carregarPainel);
    }

    /**
     * Os setores de um aparelho, em botões que acendem.
     *
     * Eram caixas de marcar, e saíam tortas: a regra `input { width: 100% }`
     * desta folha esticava o quadradinho por toda a linha — 385px de largura
     * por 13px de altura, medidos — e empurrava o nome do setor para o canto
     * direito, longe da caixa que ele nomeia. O dono lia "CAMAROTE" num
     * extremo e marcava um risco fino no outro. Num botão, o alvo do toque É
     * o nome do setor, e não há como errar qual dos dois se está tocando.
     *
     * `aoTrocar`, quando vem, recebe a lista nova a cada toque — é o que faz
     * o setor "passar a valer" na hora num aparelho que já existe.
     */
    function botoesDeSetor(id, escolhidos, aoTrocar) {
        var caixa = document.createElement('div');
        caixa.id = id;
        caixa.className = 'setores-botoes';

        (estado.painel.setores || []).forEach(function (s) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'setor-botao so-com-senha';
            b.id = id + '-' + s.id;
            // `dataset` e não o texto do botão: o nome do setor é editável
            // pelo dono ("Nome na portaria"), e ler a escolha pelo rótulo
            // ligaria a gravação ao que está escrito na tela.
            b.dataset.setor = s.id;
            b.textContent = s.nome;          // vem do ERP: TEXTO, nunca HTML
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

    /**
     * Quais setores estão acesos numa caixa de botões.
     *
     * O estado mora no `aria-pressed` do próprio botão, e não numa variável
     * fechada dentro de `botoesDeSetor`: `desenhar()` reconstrói estas caixas
     * a cada painel, e quem lê a escolha depois não tem como alcançar uma
     * variável de outra chamada. Perguntar ao DOM é a única leitura que
     * continua verdadeira depois de um redesenho.
     */
    function setoresAcesos(id) {
        var caixa = $(id);
        if (!caixa) { return []; }
        return Array.prototype.slice
            .call(caixa.querySelectorAll('button[aria-pressed="true"]'))
            .map(function (b) { return b.dataset.setor; });
    }

    /**
     * O cliente cola de uma planilha, do WhatsApp, de onde for. Linha vazia e
     * espaço em volta não são erro dele — são como o texto chega.
     */
    function importarCodigos(texto, setor_id) {
        var codigos = String(texto || '')
            .split(/[\r\n]+/)
            .map(function (l) { return l.trim(); })
            .filter(function (l) { return l.length > 0; });

        return gravar('/eventos/' + estado.evento_id + '/codigos',
                      { codigos: codigos, setor_id: setor_id }, 'POST')
            .then(function (r) {
                // `gravados` e `ja_existiam` juntos: reenviar a mesma lista —
                // o que o dono faz depois de escolher o setor errado — não
                // pode parabenizá-lo com "42 códigos entraram" quando zero
                // linha nova foi escrita.
                var msg = r.gravados + ' código' + (r.gravados === 1 ? '' : 's')
                    + ' entraram na lista deste setor.';
                if (r.ja_existiam) {
                    msg += ' ' + r.ja_existiam + ' já estavam lá.';
                }
                avisar(msg, 'ok');
                return carregarPainel().then(function () { return r; });
            });
    }

    /**
     * O cartão de um portão: nome, situação, os setores que ele valida e a
     * revogação.
     *
     * TODOS os portões do evento aparecem, de todos os celulares — decisão do
     * usuário em 16/08/2026. Por isso o portão DESTE aparelho vem marcado com
     * ★: sem a marca, o dono renomeia ou revoga o errado, e revogar desliga o
     * aparelho na hora, no meio do evento.
     *
     * `edicaoAnterior`, se vier, é o que o dono tinha digitado/marcado ANTES
     * do painel recarregar por baixo dele — ver o comentário em `desenhar()`.
     */
    function cartaoDeAparelho(a, edicaoAnterior) {
        var el = document.createElement('div');
        el.className = 'cartao';

        var titulo = document.createElement('h3');
        titulo.textContent = a.nome;            // digitado pelo cliente: TEXTO
        el.appendChild(titulo);

        // Qual destes portões é ESTE celular. O chaveiro responde sem rede: é
        // ele que sabe qual aparelho foi criado aqui.
        var meu = window.chaveiro ? window.chaveiro.procurar(estado.evento_id) : null;
        if (meu && meu.aparelho_id === a.id) {
            var marca = document.createElement('p');
            marca.className = 'config-ajuda';
            marca.textContent = '★ Este é o portão deste aparelho.';
            el.appendChild(marca);
        }

        var situacao = document.createElement('p');
        situacao.style.fontSize = '.84rem';
        situacao.style.color = 'var(--dim)';
        var nomes = (estado.painel.setores || [])
            .filter(function (s) { return a.setores.indexOf(s.id) >= 0; })
            .map(function (s) { return s.nome; });
        situacao.textContent = (a.status === 'ativo' ? 'Ativo. ' : 'Revogado. ')
            + (nomes.length ? 'Valida: ' + nomes.join(', ') : 'Ainda não valida nenhum setor.');
        el.appendChild(situacao);

        // ── Editar nome e setores ───────────────────────────────────────────
        var rotNome = document.createElement('label');
        rotNome.setAttribute('for', 'aparelho-nome-' + a.id);
        rotNome.textContent = 'Nome do portão';
        el.appendChild(rotNome);

        var campoNome = document.createElement('input');
        campoNome.type = 'text';
        campoNome.id = 'aparelho-nome-' + a.id;
        campoNome.value = edicaoAnterior ? edicaoAnterior.nome : a.nome;
        el.appendChild(campoNome);

        var rotSetores = document.createElement('p');
        rotSetores.style.fontSize = '.82rem';
        rotSetores.style.color = 'var(--dim)';
        rotSetores.style.margin = '12px 0 4px';
        rotSetores.textContent = 'Toque nos setores que este portão valida. '
            + 'O que estiver aceso vale na hora.';
        el.appendChild(rotSetores);

        // Passa a valer no toque, sem botão de confirmar: é a mesma regra que
        // o "Uso do ingresso" do cartão de setor já segue. O aviso de gravado
        // fica logo abaixo, porque gravar sozinho não pode ser gravar calado.
        var marcadosAgora = edicaoAnterior ? edicaoAnterior.setores : a.setores;
        var recado = document.createElement('span');
        recado.className = 'salvo sumindo';
        recado.id = 'aparelho-salvo-' + a.id;
        recado.setAttribute('role', 'status');
        recado.textContent = '✓ salvo';

        el.appendChild(botoesDeSetor('aparelho-setores-' + a.id, marcadosAgora,
            function (setores) {
                trocarSetoresDoAparelho(a.id, setores)
                    .then(function () {
                        var atual = $('aparelho-salvo-' + a.id);
                        if (atual) { atual.classList.remove('sumindo'); }
                    })
                    .catch(function () { /* `gravar()` já avisou na tela */ });
            }));
        el.appendChild(recado);

        var btnSalvar = document.createElement('button');
        btnSalvar.type = 'button';
        btnSalvar.className = 'so-com-senha';
        btnSalvar.id = 'aparelho-salvar-' + a.id;
        // Só o nome: os setores já gravaram sozinhos ao serem tocados. Um
        // botão que continuasse dizendo "e setores" prometeria uma gravação
        // que não acontece mais aqui.
        btnSalvar.textContent = 'Salvar nome';
        btnSalvar.addEventListener('click', function () {
            var novoNome = campoNome.value;
            // Nenhum PATCH vazio se o dono só olhou o campo e não mexeu.
            if (novoNome === a.nome) { return; }
            renomearAparelho(a.id, novoNome).catch(function () { /* já avisado */ });
        });
        el.appendChild(btnSalvar);

        if (a.status === 'ativo') {
            var btnRevogar = document.createElement('button');
            btnRevogar.type = 'button';
            btnRevogar.className = 'so-com-senha secundario';
            btnRevogar.id = 'aparelho-revogar-' + a.id;
            btnRevogar.textContent = 'Revogar (desliga o aparelho)';
            btnRevogar.addEventListener('click', function () {
                // Confirmação, não senha de novo: a elevação já cobre isso. O
                // que falta avisar é o tamanho do estrago — revogar desconecta
                // o aparelho na hora, no meio do evento.
                var confirmou = window.confirm(
                    'Revogar "' + a.nome + '"? Isso DESLIGA o aparelho agora — ele para '
                    + 'de validar QR na portaria imediatamente. Nesta versão não há como '
                    + 'reativar um portão revogado — para voltar a usar, será preciso '
                    + 'abrir o evento de novo naquele celular.'
                );
                if (!confirmou) { return; }
                revogarAparelho(a.id).catch(function () { /* já avisado */ });
            });
            el.appendChild(btnRevogar);
        }

        return el;
    }

    // ── A senha, e quem abre e fecha a engrenagem ────────────────────────────

    var CHAVE_EMAIL = 'ideal_control_email';

    /**
     * A senha, no aparelho que não tem conta.
     *
     * No celular do porteiro não existe sessão — ela foi encerrada quando o
     * aparelho virou portão, e é isso que impede quem ficar com ele de entrar na
     * conta do cliente. A engrenagem faz um login RELÂMPAGO: entra, deixa
     * configurar por 15 minutos, e sai ao fechar.
     *
     * O e-mail fica lembrado; a senha, nunca. Ela vive no argumento desta função
     * e morre com ela — a mesma regra que o `entrarEElevar` já segue.
     *
     * `prompt` de propósito para a senha: é a única caixa de texto que o
     * navegador não guarda em preenchimento automático, e a senha do dono não
     * pode ficar memorizada no celular do porteiro.
     */
    function comSenha(evento_id, tarefa) {
        return sessaoOuLogin(evento_id).then(function (r) {
            return tarefa(r.sessao, r.elevacao);
        });
    }

    function emailLembrado() {
        try { return localStorage.getItem(CHAVE_EMAIL) || ''; }
        catch (e) { return ''; }
    }

    /**
     * Três situações, e cada uma pede uma coisa diferente da pessoa:
     *
     *   sessão + elevação válida  — nada. Já está autorizado.
     *   sessão sem elevação       — só a SENHA. O dono está no próprio celular e
     *                               já entrou; pedir o e-mail que ele acabou de
     *                               digitar seria uma chance de errar sem ganho.
     *   sem sessão                — e-mail e senha, numa digitação só
     *                               (`entrarEElevar`). É o celular do porteiro.
     *
     * `Promise.resolve().then(...)` — e não chamar `AcessoConta.sessao()` direto
     * — porque ela NÃO é async: com `supabaseClient` nulo (sem rede, ou o modo
     * offline deliberado do `supabase-config.js`) ela LANÇA na hora, e o throw
     * síncrono escaparia deste encadeamento inteiro.
     */
    function sessaoOuLogin(evento_id) {
        return Promise.resolve().then(function () {
            return AcessoConta.sessao();
        }).then(function (s) {
            if (s) { estado.sessao = s; }
            if (s && elevado()) {
                return { sessao: s, elevacao: estado.elevacao };
            }
            if (s) {
                return abrirCaixaDeSenha().then(function () {
                    return { sessao: s, elevacao: estado.elevacao };
                });
            }

            var email = window.prompt(
                'E-mail da sua conta do Vibe — a mesma com que você acompanha '
                + 'os seus pedidos.', emailLembrado());
            if (!email) { return Promise.reject(new Error('cancelado')); }
            var senha = window.prompt('Senha desta conta. Ela libera as '
                + 'alterações por ' + acesso_minutos() + ' minutos.');
            if (!senha) { return Promise.reject(new Error('cancelado')); }
            // O e-mail sim, a senha nunca: no portão o dono digita isto de pé,
            // com pressa, e o e-mail é a metade que não é segredo.
            try { localStorage.setItem(CHAVE_EMAIL, email); } catch (e) { /* aba anônima */ }

            return AcessoConta.entrarEElevar(email, senha, evento_id)
                .then(function (r) {
                    estado.sessao = r.sessao;
                    // A sessão foi aberta AQUI: é esta bandeira que faz o
                    // `fecharEngrenagem` saber que precisa desfazê-la.
                    estado.sessaoDaEngrenagem = true;
                    guardarElevacao({
                        token: r.elevacao.token,
                        expira_em: r.elevacao.expira_em,
                        evento_id: evento_id
                    });
                    return { sessao: r.sessao, elevacao: r.elevacao };
                });
        });
    }

    /**
     * O toque na engrenagem, ao lado da barra do evento.
     *
     * A senha vem ANTES de a tela aparecer: mostrar a configuração e só então
     * pedir a senha deixaria o nome do evento, os setores e a lista de portões
     * à vista de quem estiver com o celular do porteiro na mão.
     */
    function abrirEngrenagem(evento_id, nome) {
        estado.evento_id = evento_id;
        // Evento novo, campos novos: sem isto, abrir a engrenagem de um segundo
        // evento na mesma sessão da página manteria o nome e a data do primeiro
        // escritos nos campos, porque `jaDesenhouEvento` os protege de
        // redesenhos. Ver o comentário daquela bandeira.
        jaDesenhouEvento = false;
        restaurarElevacao();
        return comSenha(evento_id, function () {
            $('engrenagem').classList.remove('sumindo');
            $('lista').classList.add('sumindo');
            if (nome) { $('nome-evento-titulo').textContent = nome; }
            return carregarPainel();
        }).catch(function () {
            // Cancelou a senha, ou ela não conferiu: a lista continua na tela,
            // que é onde ele já estava. Quem explica o erro é o `avisar()` de
            // dentro de `abrirCaixaDeSenha`.
        });
    }

    /**
     * Fechar a engrenagem tira a conta do aparelho.
     *
     * O celular fica com o porteiro. Sessão esquecida ali entrega a conta
     * inteira do cliente — eventos, configuração, tudo. A elevação de 15
     * minutos morre junto.
     */
    function fecharEngrenagem() {
        guardarElevacao(null);
        $('engrenagem').classList.add('sumindo');
        $('lista').classList.remove('sumindo');
        if (!estado.sessaoDaEngrenagem) { return Promise.resolve(); }
        estado.sessaoDaEngrenagem = false;
        estado.sessao = null;
        try {
            return supabaseClient.auth.signOut().catch(function () { });
        } catch (e) {
            return Promise.resolve();   // sem SDK: não há sessão para encerrar
        }
    }

    /**
     * "Sair deste portão": este aparelho deixa de ler os ingressos deste evento.
     *
     * NÃO apaga a fila — a mesma regra do `desparear()` da portaria: o que a
     * fila guarda é contagem que o cliente pagou para ter, e ela sobe sozinha
     * quando a internet voltar.
     *
     * As chaves antigas saem junto SÓ se apontarem para este evento. Deixá-las
     * seria dizer "saí do portão" e o celular continuar validando ingresso.
     */
    function sairDoPortao() {
        if (!window.confirm('Sair deste portão? Este aparelho deixa de ler os '
                + 'ingressos deste evento. As leituras que ainda não subiram '
                + 'continuam guardadas e sobem quando a internet voltar.')) {
            return Promise.resolve();
        }
        window.chaveiro.esquecer(estado.evento_id);
        try {
            if (localStorage.getItem('ideal_portaria_evento') === estado.evento_id) {
                localStorage.removeItem('ideal_portaria_token');
                localStorage.removeItem('ideal_portaria_evento');
            }
        } catch (e) { /* aba anônima */ }
        return Promise.resolve(fecharEngrenagem()).then(function () {
            // Recarregar, e não redesenhar: a lista é montada pelo
            // `lista-eventos.js` no arranque, e recarregar é o único caminho que
            // não põe dois arquivos decidindo quem manda na mesma tela.
            location.reload();
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

    /**
     * Lê a elevação de volta do `sessionStorage`, se houver uma válida PARA
     * ESTE EVENTO. Achado da revisão final: o token era gravado e nunca lido
     * de volta — e a tela recarregava a cada navegação, então o dono digitava
     * a senha de novo toda vez. Chamada de dentro de `abrirEngrenagem()`,
     * antes de `comSenha()`, para que uma elevação ainda viva dispense a senha.
     */
    function restaurarElevacao() {
        var bruto = null;
        try { bruto = sessionStorage.getItem(CHAVE_ELEVACAO); } catch (err) { return; }
        if (!bruto) { return; }

        var e;
        try { e = JSON.parse(bruto); } catch (err) { return; }
        if (!e || e.evento_id !== estado.evento_id) {
            // Token de outro evento nesta mesma aba: não é deste evento, e
            // não é o caso de apagar o que pode servir a OUTRA aba/evento.
            return;
        }
        if (!(e.expira_em * 1000 > Date.now())) {
            guardarElevacao(null);   // vencida: não deixa lixo no storage
            return;
        }
        estado.elevacao = e;
    }

    function elevar(senha) {
        return AcessoConta.pedir('/eventos/' + estado.evento_id + '/elevar', {
            method: 'POST',
            headers: cabecalhos({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ senha: senha, navegador: AcessoConta.navegadorId() })
        }).then(function (r) {
            guardarElevacao({ token: r.token, expira_em: r.expira_em, evento_id: estado.evento_id });
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
        // "A mesma com que você entrou nesta tela", e não "a senha do dono":
        // o dono lia aquilo como uma segunda senha, especial, que ele nunca
        // recebeu — e desistia de configurar achando que faltava algo.
        var senha = window.prompt(
            'Digite a sua senha cadastrada — a mesma com que você entrou nesta '
            + 'tela — para liberar as alterações por ' + acesso_minutos() + ' minutos.'
        );
        if (!senha) {
            // Cancelar não é o mesmo caso que errar a senha nem que ficar sem
            // rede — cada um já tem a própria frase. Sem esta, o dono toca em
            // "Cancelar" no meio de uma gravação e a tela fica muda: ele guarda
            // o celular achando que gravou.
            avisar('Você cancelou o pedido de senha. Não gravei nada — o que '
                 + 'você digitou continua na tela.', 'erro');
            return Promise.reject(new Error('cancelado'));
        }
        return elevar(senha).catch(function (e) {
            avisar(e.message, 'erro');
            throw e;
        });
    }

    function acesso_minutos() { return 15; }

    document.addEventListener('DOMContentLoaded', function () {
        // A engrenagem pode não estar nesta página (o arquivo é carregado só
        // pelo `controle.html`, mas o teste de outra tela o serve junto).
        if (!$('engrenagem')) { return; }

        $('btn-sair-config').addEventListener('click', function () {
            // Fechar a faixa devolve a tela ao modo leitura SEM sair da
            // engrenagem: quem sai dela é o "Fechar configuração", abaixo.
            sairDaConfiguracao();
        });

        $('btn-fechar-engrenagem').addEventListener('click', function () {
            fecharEngrenagem();
        });

        $('btn-elevar').addEventListener('click', function () {
            // O `.catch` vazio existe porque a promessa desta caixa serve a
            // OUTRO chamador: o `gravar()`, que precisa saber se a senha veio
            // para repetir a gravação. Aqui não há gravação repetindo, e uma
            // rejeição solta viraria erro no console -- a recusa e o motivo já
            // foram escritos na tela pelo `avisar()`.
            abrirCaixaDeSenha().catch(function () { });
        });

        $('btn-sair-do-portao').addEventListener('click', function () {
            sairDoPortao();
        });

        $('btn-gravar-evento').addEventListener('click', function () {
            gravar('/eventos/' + estado.evento_id, {
                nome_evento: $('campo-nome-evento').value,
                local_evento: $('campo-local').value,
                // Convertido, e não mandado cru: o `datetime-local` entrega a
                // hora do relógio de quem digitou, sem fuso nenhum, e a coluna
                // é TIMESTAMPTZ. Cru, "22:00" viraria 22:00 UTC — 19:00 em
                // Brasília — e o evento apareceria três horas mais cedo para
                // todo mundo. Ver `doCampoParaISO`.
                data_evento: doCampoParaISO($('campo-data').value)
            }, 'PATCH').then(carregarPainel).catch(function () { /* já avisado */ });
        });

        // O formulário de login continua sendo a porta de quem abre o
        // aplicativo com a conta e sem nenhum portão guardado. Ao entrar, quem
        // redesenha a casa é o `lista-eventos.js` — ele é o dono da lista.
        $('btn-entrar').addEventListener('click', function () {
            var erro = $('erro-login');
            erro.classList.add('sumindo');
            AcessoConta.entrar($('email').value, $('senha').value)
                .then(function () {
                    $('bloco-entrar').classList.add('sumindo');
                    return window.listaEventos.arrancar();
                })
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

        // O e-mail vem da sessão, e não de um campo: quem está aqui já entrou.
        // Pedir para digitar de novo o e-mail com que ele acabou de entrar
        // seria uma chance de errar sem nenhum ganho.
        $('btn-esqueci-config').addEventListener('click', function () {
            var email = ((estado.sessao || {}).user || {}).email || emailLembrado();
            if (!email) {
                avisar('Não consegui identificar a sua conta agora. Recarregue a '
                     + 'página e tente de novo.', 'erro');
                return;
            }
            AcessoConta.esqueciSenha(email).then(function (frase) {
                avisar(frase, 'ok');
            });
        });
    });

    window.Controle = {
        estado: estado,
        carregarPainel: carregarPainel,
        desenhar: desenhar,
        elevado: elevado,
        elevar: elevar,
        gravar: gravar,
        gravarSetor: gravarSetor,
        sairDaConfiguracao: sairDaConfiguracao,
        // O que a lista e o `virar-portao.js` chamam.
        abrirEngrenagem: abrirEngrenagem,
        fecharEngrenagem: fecharEngrenagem,
        comSenha: comSenha,
        sairDoPortao: sairDoPortao,
        renomearAparelho: renomearAparelho,
        trocarSetoresDoAparelho: trocarSetoresDoAparelho,
        revogarAparelho: revogarAparelho,
        importarCodigos: importarCodigos,
        // A conversão de fuso é a única lógica desta tela que dá para errar sem
        // que nada apareça errado: um horário três horas fora ainda é um
        // horário. Exposta para ser testada de ida E de volta.
        doCampoParaISO: doCampoParaISO,
        deISOParaCampo: deISOParaCampo
    };
})();
