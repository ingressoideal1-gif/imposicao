/**
 * A tela do dono do evento.
 *
 * Cada setor mostra o que o ERP contratou e nada mais: a lotação de um setor É
 * a quantidade contratada, então não há onde digitar outra. O que se configura
 * por setor fica atrás do botão "Configurar", num painel que abre no próprio
 * cartão.
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
        elevacao: null       // { token, expira_em, evento_id }
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
              + '"Digitar a Senha Cadastrada" — é a mesma senha com que você '
              + 'entrou aqui.'
            : '';
        // A tranca inteira some quando não há o que destrancar. Ela é
        // `sticky`, então deixá-la em tela durante o modo configuração
        // roubaria uma faixa do alto para dizer o que a faixa âmbar, logo
        // acima, já está dizendo.
        $('tranca').classList.toggle('sumindo', !leitura);

        document.querySelectorAll('#evento input, #evento select, #evento textarea')
            .forEach(function (el) { el.disabled = leitura; });
        document.querySelectorAll('#evento button.so-com-senha, #evento .so-com-senha button')
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

        // Mesma lógica do formulário de novo aparelho, um degrau abaixo: cada
        // cartão de aparelho tem seu próprio campo de nome e suas próprias
        // caixas de setor, e o cartão inteiro é substituído a cada painel. Sem
        // isto, o dono que está editando o nome de um aparelho e marcando
        // setores perde os dois se QUALQUER outra gravação nesta tela disparar
        // um `carregarPainel()` por baixo dele.
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
        $('aparelhos').appendChild(caixaDePareamento(p.evento.id));

        // Os botões de setor do formulário de aparelho novo. Redesenhados junto
        // com o painel para nunca oferecerem um setor que deixou de existir.
        //
        // Guardar o que já estava aceso ANTES de recriar: um `gravar()` de
        // outro cartão desta mesma tela chama `carregarPainel()` por baixo do
        // dono, e sem isto ele perderia os setores que tinha acabado de
        // escolher aqui — sem nunca ter tocado neste formulário.
        //
        // Sem `aoTrocar`: aqui o aparelho ainda não existe, então não há o que
        // gravar. A escolha só sai da tela no "Criar aparelho".
        var acesosAntes = setoresAcesos('novo-aparelho-setores');
        $('novo-aparelho-setores')
            .replaceWith(botoesDeSetor('novo-aparelho-setores', acesosAntes, null));

        // Depois dos cartões de setor existirem no DOM: são eles que trazem os
        // campos de lotação e uso que a trava também precisa desligar.
        travarCampos();
        desenharFaixa();
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
        painel.appendChild(bloqueiosDoSetor(s, edicaoAnterior));
        painel.appendChild(codigosDoSetor(s, edicaoAnterior));
        el.appendChild(painel);

        return el;
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

    /**
     * Mostra o código curto UMA vez.
     *
     * Ele não está guardado em lugar nenhum — o que fica é um resumo dele. Se a
     * tela não disser isso em texto, o dono fecha a caixa achando que consulta
     * depois, e descobre na porta do evento que não dá.
     *
     * `nomeAparelho`, quando vem, entra no título da caixa. Achado da revisão
     * final: com vários aparelhos configurados, gerar um código novo antes de
     * fechar a caixa do anterior é como um código acaba digitado no celular
     * errado — o título genérico "Código deste aparelho" não dizia QUAL.
     */
    function mostrarCodigo(codigo, nomeAparelho) {
        $('codigo-titulo').textContent = nomeAparelho
            ? ('Código de "' + nomeAparelho + '"') : 'Código deste aparelho';
        $('codigo-valor').textContent = codigo;
        $('caixa-codigo').classList.remove('sumindo');
    }

    function criarAparelho(nome, setores) {
        return gravar('/eventos/' + estado.evento_id + '/aparelhos',
                      { nome: nome, setores: setores }, 'POST')
            .then(function (r) {
                mostrarCodigo(r.codigo, nome);
                return carregarPainel().then(function () { return r; });
            });
    }

    /**
     * Gera outro código para um aparelho que já existe.
     *
     * Recarrega o painel depois de mostrar o código, igual a `criarAparelho`:
     * o cartão deste aparelho pode ter mudado por outro caminho enquanto o
     * dono estava aqui, e a tela não pode ficar desatualizada só porque esta
     * ação não mexeu em nome nem em setor. `mostrarCodigo` roda ANTES do
     * `carregarPainel`, e `desenhar()` nunca toca em `#caixa-codigo` — por
     * isso o código continua na tela depois do redesenho.
     */
    function novoCodigo(aparelho_id) {
        var aparelho = (estado.painel.aparelhos || [])
            .find(function (a) { return a.id === aparelho_id; });
        return gravar('/aparelhos/' + aparelho_id + '/codigo', {}, 'POST')
            .then(function (r) {
                mostrarCodigo(r.codigo, aparelho && aparelho.nome);
                return carregarPainel().then(function () { return r; });
            });
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
     * o setor "passar a valer" na hora num aparelho que já existe. O
     * formulário do aparelho novo não passa nada: ali a escolha só vale
     * quando o dono toca em "Criar aparelho".
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
     * a cada painel, e quem lê a escolha depois — o "Criar aparelho", lá no
     * `DOMContentLoaded` — não tem como alcançar uma variável de outra
     * chamada. Perguntar ao DOM é a única leitura que continua verdadeira
     * depois de um redesenho.
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
     * O cartão de um aparelho: nome, situação, e os três controles que a
     * caixa `#caixa-codigo` promete por escrito desde a Tarefa 9 — gerar
     * outro código, revogar, e editar nome/setores. Uma tela que promete e
     * não entrega o botão está mentindo para o dono tanto quanto uma que
     * mostra o número errado.
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
        rotNome.textContent = 'Nome do aparelho';
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
        rotSetores.textContent = 'Toque nos setores que este aparelho valida. '
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

        // ── Código e revogação ──────────────────────────────────────────────
        var btnNovoCodigo = document.createElement('button');
        btnNovoCodigo.type = 'button';
        btnNovoCodigo.className = 'so-com-senha secundario';
        btnNovoCodigo.id = 'aparelho-novo-codigo-' + a.id;
        btnNovoCodigo.textContent = 'Gerar outro código';
        btnNovoCodigo.addEventListener('click', function () {
            novoCodigo(a.id).catch(function () { /* já avisado */ });
        });
        el.appendChild(btnNovoCodigo);

        if (a.status === 'ativo') {
            var btnRevogar = document.createElement('button');
            btnRevogar.type = 'button';
            btnRevogar.className = 'so-com-senha secundario';
            btnRevogar.id = 'aparelho-revogar-' + a.id;
            btnRevogar.textContent = 'Revogar (desliga o aparelho)';
            btnRevogar.addEventListener('click', function () {
                // Confirmação, não senha de novo: a elevação já cobre isso. O
                // que falta avisar é a diferença para "gerar outro código" —
                // aquele não desconecta ninguém, revogar desconecta na hora.
                var confirmou = window.confirm(
                    'Revogar "' + a.nome + '"? Isso DESLIGA o aparelho agora — ele para '
                    + 'de validar QR na portaria imediatamente. Gerar outro código não '
                    + 'faz isso; só revogar desliga. Nesta versão não há como reativar um '
                    + 'aparelho revogado — para voltar a usar, será preciso criar outro.'
                );
                if (!confirmou) { return; }
                revogarAparelho(a.id).catch(function () { /* já avisado */ });
            });
            el.appendChild(btnRevogar);
        }

        return el;
    }

    /**
     * O endereço que o porteiro abre no aparelho.
     *
     * O código de seis caracteres, sozinho, não leva a lugar nenhum: ninguém
     * adivinha a URL da portaria. `portaria.html` lê o `?e=` para saber de
     * qual evento é o aparelho antes mesmo de pedir o código.
     */
    function enderecoDaPortaria(eventoId) {
        // `/ic/` e o prefixo do aplicativo instalavel. Endereco JA passado a
        // porteiro continua valendo: `/portaria.html` redireciona para ca com
        // a querystring intacta.
        return location.origin + '/ic/portaria.html?e=' + encodeURIComponent(eventoId);
    }

    /**
     * A caixa que mostra o endereço de pareamento, com QR.
     *
     * O porteiro precisa de DOIS dados: onde abrir e qual o código. Mostrar só
     * o código deixa o aparelho parado — ninguém digita 60 caracteres de URL
     * de cabeça. O QR existe pelo mesmo motivo: digitar esses 60 caracteres
     * num celular, no portão, é pedir erro de digitação.
     */
    function caixaDePareamento(eventoId) {
        var caixa = document.createElement('div');
        caixa.className = 'pareamento';

        var url = enderecoDaPortaria(eventoId);

        var texto = document.createElement('p');
        texto.className = 'config-ajuda';
        texto.textContent = 'No celular do porteiro, abra este endereço e digite '
            + 'o código do aparelho:';
        caixa.appendChild(texto);

        var link = document.createElement('a');
        link.href = url;
        link.textContent = url;
        link.target = '_blank';
        link.rel = 'noopener';
        caixa.appendChild(link);

        var tela = document.createElement('canvas');
        tela.width = tela.height = 220;
        if (typeof window.renderQRCodeOnCtx === 'function') {
            var ctx = tela.getContext('2d');
            // `renderQRCodeOnCtx` desenha CENTRADO no ponto (x, y) que recebe
            // — ver frontend/qr-canvas.js — e não a partir do canto. Sem este
            // translate para o centro do canvas, só o quadrante inferior
            // direito do QR apareceria; o resto cairia em coordenada
            // negativa, fora da tela. É o mesmo padrão que o QR do evento usa
            // no script.js.
            ctx.translate(110, 110);
            // Fundo branco explícito: o painel é escuro, e QR preto sobre
            // fundo escuro não é lido por leitor nenhum.
            window.renderQRCodeOnCtx(ctx, url, 0, 0, 220, '#000000', '#ffffff');
        }
        caixa.appendChild(tela);

        return caixa;
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
                restaurarElevacao();
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

    /**
     * Lê a elevação de volta do `sessionStorage`, se houver uma válida PARA
     * ESTE EVENTO. Achado da revisão final: o token era gravado e nunca lido
     * de volta — "← Meus eventos" e todo link de evento são recarga de
     * página inteira, então o dono digitava a senha de novo em toda
     * navegação, e o `sessionStorage` só custava usabilidade sem comprar
     * nada. Chamada de dentro de `abrir()`, antes de `carregarPainel()`, para
     * que a faixa e a trava dos campos já saiam corretas no primeiro
     * `desenhar()`.
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
        $('btn-sair-config').addEventListener('click', sairDaConfiguracao);

        $('btn-elevar').addEventListener('click', function () {
            abrirCaixaDeSenha();
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

        $('btn-fechar-codigo').addEventListener('click', function () {
            $('caixa-codigo').classList.add('sumindo');
            $('codigo-valor').textContent = '';
        });

        $('btn-criar-aparelho').addEventListener('click', function () {
            criarAparelho($('novo-aparelho-nome').value,
                          setoresAcesos('novo-aparelho-setores'))
                .then(function () { $('novo-aparelho-nome').value = ''; })
                .catch(function () { /* já avisado */ });
        });

        // O e-mail vem da sessão, e não de um campo: quem está aqui já entrou.
        // Pedir para digitar de novo o e-mail com que ele acabou de entrar
        // seria uma chance de errar sem nenhum ganho.
        $('btn-esqueci-config').addEventListener('click', function () {
            var email = ((estado.sessao || {}).user || {}).email || '';
            if (!email) {
                avisar('Não consegui identificar a sua conta agora. Recarregue a '
                     + 'página e tente de novo.', 'erro');
                return;
            }
            AcessoConta.esqueciSenha(email).then(function (frase) {
                avisar(frase, 'ok');
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
        gravarSetor: gravarSetor,
        sairDaConfiguracao: sairDaConfiguracao,
        mostrarCodigo: mostrarCodigo,
        criarAparelho: criarAparelho,
        novoCodigo: novoCodigo,
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
