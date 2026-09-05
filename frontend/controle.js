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

    /**
     * Ha bilhete valido PARA ESTE EVENTO?
     *
     * O evento faz parte da pergunta, e nao fazia ate 17/08/2026. A elevacao
     * sempre foi assinada para um evento so -- o servidor recusa o token do
     * evento A numa escrita do evento B --, mas esta funcao olhava apenas o
     * prazo. Enquanto o unico jeito de haver elevacao era o `abrirEngrenagem`
     * grava-la para o evento que acabou de abrir, os dois nunca divergiam.
     *
     * O `receberElevacao` abriu essa porta: agora chega elevacao de FORA desta
     * tela, para um evento que pode nao ser o que esta aberto. Sem esta
     * conferencia, a engrenagem do evento B abriria sem pedir senha nenhuma por
     * causa de um bilhete comprado para o evento A -- e a pessoa so descobriria
     * ao gravar, quando o servidor recusasse.
     */
    function elevado() {
        if (!estado.elevacao) { return false; }
        if (estado.elevacao.evento_id
                && estado.elevacao.evento_id !== estado.evento_id) {
            return false;
        }
        return estado.elevacao.expira_em * 1000 > Date.now();
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

        // `aria-busy` e a marca que o `botaoEspera.comecar()` poe enquanto um
        // PATCH esta em voo (achado da revisao de codigo, 18/08/2026): sem
        // esta guarda, esta funcao — chamada tambem pelo `setInterval` de
        // 20s da faixa — REABILITAVA "Gravando…"/"Salvando…"/"Carregando…"
        // no meio da propria espera, com elevacao valida. O dono via o botao
        // solto de novo e tocava outra vez, mandando um SEGUNDO PATCH — o
        // defeito exato que a espera existe para evitar, e rede fraca no
        // portao passa fácil dos 20s entre redesenhos.
        document.querySelectorAll('#engrenagem input, #engrenagem select, #engrenagem textarea')
            .forEach(function (el) {
                if (el.getAttribute('aria-busy') !== 'true') { el.disabled = leitura; }
            });
        document.querySelectorAll('#engrenagem button.so-com-senha, #engrenagem .so-com-senha button')
            .forEach(function (el) {
                if (el.getAttribute('aria-busy') !== 'true') { el.disabled = leitura; }
            });
    }

    // ── As cinco seções, que nascem recolhidas ──────────────────────────────
    //
    // Em pé, esta configuração tem três telas de altura no celular, e o dono
    // quase sempre entra aqui para mexer em UMA coisa. Recolhida, cada seção
    // ocupa uma linha que já diz o que tem dentro, e ele escolhe onde entrar
    // sem rolar procurando. Ver o comentário grande no `controle.html`.
    var SECOES = ['evento', 'aparelhos', 'setores', 'este-aparelho', 'zona-de-risco'];

    /**
     * O que estava aberto fica guardado POR EVENTO, e só enquanto a aba viver.
     *
     * Por evento porque configurar o baile de sábado e configurar o show de
     * domingo são tarefas diferentes: quem deixou "Setores" aberto num deles
     * não está no meio da mesma coisa no outro, e uma seção que ele não pediu
     * é rolagem que ele não pediu. Evento nunca aberto nasce com tudo fechado.
     *
     * No `sessionStorage`, e não no `localStorage`, pela mesma razão que a
     * elevação (ver `CHAVE_ELEVACAO`, mais abaixo): o celular fica com o
     * porteiro, e fechar a aba tem de deixar a próxima abertura igual à
     * primeira.
     */
    var CHAVE_SECOES = 'ideal_control_secoes:';

    function secoesGuardadas() {
        if (!estado.evento_id) { return []; }
        var bruto;
        try { bruto = sessionStorage.getItem(CHAVE_SECOES + estado.evento_id); }
        catch (e) { return []; }                 // aba anônima
        if (!bruto) { return []; }
        var lista;
        try { lista = JSON.parse(bruto); } catch (e) { return []; }
        return Array.isArray(lista) ? lista : [];
    }

    function guardarSecoes(lista) {
        if (!estado.evento_id) { return; }
        try {
            sessionStorage.setItem(CHAVE_SECOES + estado.evento_id,
                                   JSON.stringify(lista));
        } catch (e) { /* aba anônima: vale só nesta visita */ }
    }

    function secaoAberta(nome) {
        var bloco = $('bloco-' + nome);
        return !!bloco && !bloco.classList.contains('recolhida');
    }

    /**
     * A seção que abre sobe para o alto da tela.
     *
     * Sem isto, abrir "Setores" com a página no meio faz o conteúdo novo
     * crescer ABAIXO da dobra: o dono toca, nada muda onde ele está olhando, e
     * ele toca de novo — fechando o que tinha acabado de abrir.
     *
     * `prefers-reduced-motion` tira o deslizamento, e não a rolagem: quem pede
     * menos movimento continua precisando chegar lá.
     */
    function rolarAte(bloco) {
        var suave = true;
        try {
            suave = !(window.matchMedia
                      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) { /* sem matchMedia: desliza */ }
        try {
            bloco.scrollIntoView(suave
                ? { block: 'start', behavior: 'smooth' }
                : { block: 'start' });
        } catch (e) {
            bloco.scrollIntoView();              // navegador que só aceita booleano
        }
    }

    /**
     * O único lugar que mexe no estado de uma seção: a classe, o `aria-expanded`
     * e o que fica guardado andam sempre juntos.
     */
    function definirSecao(nome, aberta, rolar) {
        var bloco = $('bloco-' + nome);
        var cabecalho = $('abrir-' + nome);
        if (!bloco || !cabecalho) { return; }

        bloco.classList.toggle('recolhida', !aberta);
        cabecalho.setAttribute('aria-expanded', aberta ? 'true' : 'false');

        var lista = secoesGuardadas().filter(function (n) { return n !== nome; });
        if (aberta) { lista.push(nome); }
        guardarSecoes(lista);

        if (aberta && rolar) { rolarAte(bloco); }
    }

    function abrirSecao(nome) { definirSecao(nome, true, true); }
    function fecharSecao(nome) { definirSecao(nome, false, false); }
    function alternarSecao(nome) { definirSecao(nome, !secaoAberta(nome), true); }

    /**
     * Tudo aberto de uma vez, SEM rolar: cinco rolagens disputando a mesma
     * tela deixariam o dono em qualquer lugar menos onde ele quisesse.
     */
    function abrirTodasSecoes() {
        SECOES.forEach(function (nome) { definirSecao(nome, true, false); });
    }

    /**
     * Devolve as seções ao que estavam NESTE evento. Chamada pelo
     * `abrirEngrenagem` depois que a tela aparece.
     *
     * Passa por TODAS as cinco, e não só pelas guardadas: sem isso, abrir a
     * engrenagem de um segundo evento na mesma visita herdaria as seções que
     * ficaram abertas no primeiro.
     */
    function restaurarSecoes() {
        var abertas = secoesGuardadas();
        SECOES.forEach(function (nome) {
            definirSecao(nome, abertas.indexOf(nome) >= 0, false);
        });
    }

    /**
     * "dd/mm HH:mm" para o resumo do evento.
     *
     * Reusa a conversão de fuso do `deISOParaCampo`: a coluna é TIMESTAMPTZ, e
     * um corte cru na string ISO mostraria a hora UTC — três horas fora, e
     * ainda assim um horário plausível, que é o pior jeito de errar.
     */
    function dataCurta(iso) {
        var campo = deISOParaCampo(iso);         // "AAAA-MM-DDTHH:MM"
        if (!campo) { return ''; }
        return campo.slice(8, 10) + '/' + campo.slice(5, 7) + ' ' + campo.slice(11, 16);
    }

    /**
     * O resumo à direita de cada cabeçalho: o que a seção tem dentro, dito numa
     * linha, para o dono escolher qual abrir sem abrir nenhuma.
     *
     * `textContent` em todos, sem exceção: nome de evento, de aparelho e de
     * setor são digitados por gente ou vêm do ERP.
     */
    function desenharResumos() {
        var p = estado.painel;
        if (!p) { return; }

        var escrever = function (nome, texto) {
            var el = $('resumo-' + nome);
            if (el) { el.textContent = texto; }
        };
        var juntar = function (partes) {
            return partes.filter(function (t) { return !!t; }).join(' · ');
        };
        var contar = function (n, singular, plural) {
            return n + ' ' + (n === 1 ? singular : plural);
        };

        var ev = p.evento || {};
        escrever('evento', juntar([
            ev.nome_evento, dataCurta(ev.data_evento), ev.local_evento,
            // A mesma leitura do `desenharAtivacao`: só "ativo" é ativo. Um
            // evento desligado tem de dizer isso na linha recolhida — é a
            // pergunta que o dono faz antes de qualquer outra.
            ev.status === 'ativo' ? '' : 'inativo'
        ]));

        var aparelhos = p.aparelhos || [];
        var revogados = aparelhos.filter(function (a) {
            return a.status !== 'ativo';
        }).length;
        escrever('aparelhos', aparelhos.length
            ? juntar([contar(aparelhos.length, 'aparelho', 'aparelhos'),
                      revogados ? contar(revogados, 'revogado', 'revogados') : ''])
            : 'nenhum ainda');

        var setores = p.setores || [];
        var bloqueados = setores.filter(function (s) { return !!s.bloqueado; }).length;
        escrever('setores', setores.length
            ? juntar([contar(setores.length, 'setor', 'setores'),
                      bloqueados ? contar(bloqueados, 'bloqueado', 'bloqueados') : ''])
            : 'nenhum');

        // O chaveiro responde sem rede: é ele que sabe se ESTE celular é
        // aparelho deste evento, e com que nome.
        var meu = window.chaveiro ? window.chaveiro.procurar(estado.evento_id) : null;
        escrever('este-aparelho', (meu && meu.nome_portao)
            ? meu.nome_portao
            : 'este celular não lê este evento');

        escrever('zona-de-risco', 'zerar entradas · finalizar');
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
        // estava em tela ANTES de substituir, o dono perderia o que tinha acabado
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
                // por outro cartão no meio disso levaria os três embora — sem ele ter
                // tocado neste formulário.
                bloq_de: valor('bloq-de'),
                bloq_ate: valor('bloq-ate'),
                bloq_motivo: valor('bloq-motivo'),
                // O motivo de bloquear o SETOR INTEIRO, pela mesma razão: o
                // dono escreve a frase que o porteiro vai ler em voz alta, e um
                // redesenho no meio da digitação a levaria embora.
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
            var painelNome = $('aparelho-painel-nome-' + a.id);
            var painelSetores = $('aparelho-painel-setores-' + a.id);
            edicoesDeAparelhoAntes[a.id] = {
                nome: campoNome.value,
                setores: setoresAcesos('aparelho-setores-' + a.id),
                // Qual das opcoes estava aberta. Sem isto, marcar um setor --
                // que grava sozinho e recarrega o painel -- fecharia a lista de
                // setores na cara de quem ia marcar o proximo.
                aberto: (painelNome && !painelNome.classList.contains('sumindo')) ? 'nome'
                      : ((painelSetores && !painelSetores.classList.contains('sumindo'))
                         ? 'setores' : '')
            };
        });

        $('aparelhos').innerHTML = '';
        p.aparelhos.forEach(function (a) {
            $('aparelhos').appendChild(cartaoDeAparelho(a, edicoesDeAparelhoAntes[a.id]));
        });

        desenharAtivacao();
        desenharConferirSetores();
        desenharZonaDeRisco();

        // As linhas recolhidas se atualizam junto com o que há dentro delas —
        // e SÓ elas: nada aqui mexe na classe `recolhida`, então um redesenho
        // disparado por qualquer gravação desta tela nunca fecha uma seção que
        // o dono abriu.
        desenharResumos();

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
            // Ligar não pergunta; desligar sim. Repare que era exatamente essa
            // assimetria que denunciava o defeito de 17/08/2026: "Ativar"
            // funcionava e "Inativar" não, na MESMA linha de código — porque só
            // o caminho com confirmação morria. Ver `caixa-confirmar.js`.
            var perguntar = inativo ? Promise.resolve(true)
                : window.caixaConfirmar.perguntar(
                    'Inativar "' + estado.painel.evento.nome_evento + '"? Todos '
                    + 'os aparelhos param de aceitar ingresso. Aparelho sem internet '
                    + 'só recebe a mudança quando voltar a ter sinal.',
                    { rotulo: 'Inativar', perigo: true });

            return perguntar.then(function (sim) {
                if (!sim) { return; }
                return gravar('/eventos/' + estado.evento_id,
                              { status: inativo ? 'ativo' : 'encerrado' }, 'PATCH')
                    .then(carregarPainel)
                    .catch(function () { /* `gravar()` já avisou na tela */ });
            });
        };
    }

    // ── CONFERIR OS SETORES ─────────────────────────────────────────────────
    //
    // Os setores são gravados UMA VEZ, no momento do Carregar. Se depois disso
    // um modelo ganhar uma numeração com código — que é exatamente o conserto
    // quando a gráfica errou a numeração —, o setor dele nunca aparecia.
    //
    // O sintoma é o pior desta casa: ninguém procura um setor que nunca
    // existiu. O dono conta os setores na tela, acha que está tudo lá, e os
    // ingressos daquele modelo são recusados na porta como "não é deste
    // evento".

    function desenharConferirSetores() {
        var caixa = $('pedidos-para-conferir');
        if (!caixa) { return; }
        caixa.innerHTML = '';
        var pedidos = (estado.painel || {}).pedidos || [];
        if (!pedidos.length) {
            var vazio = document.createElement('p');
            vazio.className = 'config-ajuda';
            vazio.textContent = 'Nenhum pedido carregado neste evento.';
            caixa.appendChild(vazio);
            return;
        }
        pedidos.forEach(function (ped) {
            caixa.appendChild(linhaDePedido(
                ped, 'Conferir', 'Conferir os setores do pedido ',
                function (b) { return conferirSetores(ped.pedido_id_int, b); }
            ));
        });
    }

    /**
     * Uma linha "Pedido 20272   [botão]", usada pelos dois cartões.
     *
     * Os dois listam os MESMOS pedidos e diferem só no que o botão faz —
     * duas montagens separadas divergiriam na primeira vez que uma delas
     * ganhasse uma coluna.
     */
    function linhaDePedido(ped, rotulo, ariaPrefixo, aoTocar) {
        var linha = document.createElement('div');
        linha.className = 'linha-pedido-evento';
        var nome = document.createElement('span');
        nome.textContent = 'Pedido ' + ped.pedido_id_int;
        linha.appendChild(nome);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'secundario so-com-senha';
        b.textContent = rotulo;
        // O número do pedido no rótulo lido: "Conferir" sozinho se repete em
        // cada linha, e quem usa leitor de tela ouviria a mesma palavra sem
        // saber de qual pedido se trata.
        b.setAttribute('aria-label', ariaPrefixo + ped.pedido_id_int);
        b.addEventListener('click', function () { aoTocar(b); });
        linha.appendChild(b);
        return linha;
    }

    /**
     * Roda a conferência e DIZ o que mudou, item por item.
     *
     * "Pronto" não serve aqui: o dono precisa saber se algum setor nasceu, e
     * qual. Uma conferência que não relata o resultado é indistinguível de uma
     * que não rodou — e ele a repetiria, achando que não funcionou.
     */
    function conferirSetores(pedido, botao) {
        var aviso = $('aviso-conferir-setores');
        window.botaoEspera.comecar(botao, 'Conferindo…');
        return gravar('/pedidos/' + pedido + '/sincronizar-setores', {}, 'POST')
            .then(function (r) {
                var partes = [];
                if ((r.criados || []).length) {
                    partes.push('Criei ' + r.criados.length + ' setor'
                        + (r.criados.length === 1 ? '' : 'es') + ': '
                        + r.criados.join(', ') + '.');
                }
                if ((r.atualizados || []).length) {
                    partes.push('Acertei a quantidade de: ' + r.atualizados.join(', ') + '.');
                }
                if ((r.desligados || []).length) {
                    partes.push('Desliguei ' + r.desligados.join(', ')
                        + ' — o modelo não tem mais código e o setor estava vazio.');
                }
                if ((r.mantidos_com_ingresso || []).length) {
                    // Desligar um setor que tem ingresso impresso é decisão de
                    // gente, não de rotina. A tela avisa e não faz.
                    partes.push('Atenção: ' + r.mantidos_com_ingresso.join(', ')
                        + ' não tem mais código no pedido, mas tem ingresso publicado. '
                        + 'Deixei como está — fale com a gráfica.');
                }
                if (!partes.length) { partes.push('Está tudo certo: nada a mudar.'); }
                aviso.textContent = partes.join(' ');
                aviso.classList.remove('sumindo');
                return carregarPainel();
            })
            .catch(function () { /* `gravar()` já escreveu o motivo */ })
            .then(function () { window.botaoEspera.terminar(botao); });
    }

    // ── A ZONA DE RISCO ─────────────────────────────────────────────────────
    //
    // Duas ações, no fim de tudo, separadas do resto: zerar a contagem e
    // finalizar o evento. Nenhuma das duas faz o evento deixar de existir —
    // não há esse caminho nesta tela, por decisão do usuário. Um evento
    // acontece e TERMINA.

    function desenharZonaDeRisco() {
        var zerar = $('btn-zerar-entradas');
        if (!zerar) { return; }              // outra página serve o arquivo
        zerar.onclick = function () { zerarEntradas(); };
        desenharPedidosDoEvento();

        var finalizar = $('btn-finalizar-evento');
        // Um evento que JÁ está finalizado só chega a esta tela por reabertura,
        // e oferecer "Finalizar" a ele seria oferecer o que ele já é.
        var jaFinalizado = (estado.painel.evento || {}).status === 'finalizado';
        $('cartao-finalizar-evento').classList.toggle('sumindo', jaFinalizado);
        finalizar.onclick = function () { finalizarEvento(); };
    }

    /**
     * Os pedidos deste evento, cada um com o "Tirar".
     *
     * O cartão inteiro some quando não há pedido nenhum: um "Tirar um pedido
     * deste evento" numa lista vazia só faz o dono procurar o que não está lá.
     */
    function desenharPedidosDoEvento() {
        var caixa = $('pedidos-do-evento');
        if (!caixa) { return; }
        caixa.innerHTML = '';
        var pedidos = (estado.painel || {}).pedidos || [];
        $('cartao-desvincular').classList.toggle('sumindo', !pedidos.length);
        pedidos.forEach(function (ped) {
            caixa.appendChild(linhaDePedido(
                ped, 'Tirar', 'Tirar do evento o pedido ',
                function (b) { return desvincularPedido(ped.pedido_id_int, b); }
            ));
        });
    }

    /**
     * Tirar um pedido do evento — a saída que faltava.
     *
     * Confirmação antes, e a senha que a elevação já cobre: diferente do zerar,
     * isto NÃO destrói nada. Os ingressos continuam existindo, e o pedido pode
     * ser carregado de novo no evento certo — que é justamente o que a pessoa
     * veio fazer.
     *
     * Quem recusa quando já houve leitura é o servidor, e a frase dele chega
     * inteira à tela: repetir a regra aqui seria uma segunda cópia dela, e a
     * cópia é que envelhece.
     */
    function desvincularPedido(pedido, botao) {
        var aviso = $('aviso-desvincular');
        return window.caixaConfirmar.perguntar(
            'Tirar o pedido ' + pedido + ' deste evento? Os setores dele saem '
            + 'daqui e os ingressos voltam a ficar soltos. Nenhum ingresso deixa '
            + 'de valer, e você pode carregar o pedido de novo no evento certo.',
            { rotulo: 'Tirar do evento', perigo: true }
        ).then(function (sim) {
            if (!sim) { return; }
            window.botaoEspera.comecar(botao, 'Tirando…');
            return gravar('/pedidos/' + pedido + '/desvincular', {}, 'POST')
                .then(function (r) {
                    aviso.textContent = 'Pedido ' + pedido + ' fora deste evento. '
                        + ((r.nomes || []).length
                            ? ('Saíram os setores: ' + r.nomes.join(', ') + '. ')
                            : '')
                        + 'Ele volta a aparecer em Meus Pedidos.';
                    aviso.classList.remove('sumindo');
                    return carregarPainel();
                })
                .catch(function () { /* `gravar()` já escreveu o motivo */ })
                .then(function () { window.botaoEspera.terminar(botao); });
        });
    }

    /**
     * Zerar as entradas: a contagem recomeça, e SÓ a contagem.
     *
     * Confirmação E senha de novo, mesmo dentro dos 15 minutos já liberados.
     * É a única ação desta tela que desfaz dado que o cliente pagou para ter,
     * e o celular pode estar na mão do porteiro — a elevação que ele herdou de
     * uma configuração feita meia hora antes não pode servir de autorização
     * para isto.
     *
     * A senha é pedida por `_pedirSenha()`, que é o MESMO caminho que o
     * `gravar()` usa quando a elevação vence: um segundo jeito de pedir senha
     * nesta tela seria um segundo lugar para errar.
     */
    function zerarEntradas() {
        var nome = (estado.painel.evento || {}).nome_evento || 'este evento';
        return window.caixaConfirmar.perguntar(
            'Zerar as entradas de "' + nome + '"? A contagem volta a zero em '
            + 'todos os aparelhos, e quem já entrou passa a poder entrar de '
            + 'novo. Os ingressos, os setores e os aparelhos continuam '
            + 'valendo. Isto não tem volta.',
            { rotulo: 'Zerar as entradas', perigo: true }
        ).then(function (sim) {
            if (!sim) { return; }
            return Promise.resolve(_pedirSenha()).then(function () {
                return gravar('/eventos/' + estado.evento_id + '/zerar-entradas', {}, 'POST');
            }).then(function () {
                avisar('A contagem deste evento recomeçou do zero. Cada aparelho '
                     + 'acerta o contador dele no próximo sincronismo — aparelho '
                     + 'sem internet, quando voltar a ter sinal.', 'ok');
                return carregarPainel();
            }).catch(function () {
                // `abrirCaixaDeSenha()` e `gravar()` já escreveram o motivo.
            });
        });
    }

    /**
     * Finalizar: o evento sai de "Meus Eventos" e vai para a lista dos que
     * acabaram. Os portões param, porque a portaria só aceita evento `ativo`.
     *
     * Sem pedir a senha de novo — a elevação basta: finalizar não desfaz nada,
     * e o próprio "Reabrir" da tela inicial o traz de volta. Cobrar senha por
     * uma ação reversível ensinaria o dono a digitá-la sem ler, e a próxima
     * caixa de senha é a de zerar.
     */
    function finalizarEvento() {
        var nome = (estado.painel.evento || {}).nome_evento || 'este evento';
        return window.caixaConfirmar.perguntar(
            'Finalizar "' + nome + '"? Ele sai de "Meus Eventos" e passa a '
            + 'aparecer em "Eventos finalizados". Todos os aparelhos param de '
            + 'aceitar ingresso. Você pode reabri-lo depois.',
            { rotulo: 'Finalizar', perigo: true }
        ).then(function (sim) {
            if (!sim) { return; }
            return gravar('/eventos/' + estado.evento_id, { status: 'finalizado' }, 'PATCH')
            .then(function () {
                // A engrenagem se fecha sozinha: ela é a configuração de um
                // evento que acabou de sair da lista, e deixá-la aberta
                // convidaria o dono a continuar mexendo no que ele arquivou.
                //
                // Quem refaz a lista é o próprio `fecharEngrenagem`, e nao mais
                // uma chamada daqui. A daqui rodava DEPOIS do `signOut` e, no
                // celular do porteiro, redesenhava a lista sem conta — o evento
                // finalizado reaparecia em "Meus Eventos", porque sem servidor
                // a lista só enxerga o chaveiro deste aparelho.
                return Promise.resolve(fecharEngrenagem());
            })
            .catch(function () { /* `gravar()` já avisou na tela */ });
        });
    }

    /**
     * Reabrir um evento finalizado — chamado pela lista da tela inicial.
     *
     * Volta como `encerrado`, e não como `ativo`: reabrir quase sempre é para
     * corrigir um dado ou consultar quem entrou, e religar os portões de um
     * evento que já acabou é decisão separada, que o dono toma no "Ativar este
     * evento".
     *
     * Passa pelo `comSenha` porque é uma escrita como qualquer outra, e na tela
     * inicial pode não haver nem sessão — é o celular do porteiro.
     */
    function reabrirEvento(evento_id) {
        estado.evento_id = evento_id;
        restaurarElevacao();
        return comSenha(evento_id, function () {
            return gravar('/eventos/' + evento_id, { status: 'encerrado' }, 'PATCH');
        });
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
            + 'setor e mostra o motivo que você escrever. Aparelho sem internet '
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
        // lista longa, e uma gravação de outro cartão por baixo dele levaria
        // tudo embora antes de ele chegar ao botão.
        texto.value = edicaoAnterior ? (edicaoAnterior.codigos || '') : '';
        caixa.appendChild(texto);

        var botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'so-com-senha';
        botao.id = 'codigos-carregar-' + s.id;
        botao.textContent = 'Carregar códigos neste setor';
        botao.addEventListener('click', function () {
            window.botaoEspera.comecar(botao, 'Carregando…');
            importarCodigos(texto.value, s.id)
                .then(function () {
                    var atual = $('codigos-texto-' + s.id);
                    if (atual) { atual.value = ''; }
                    window.botaoEspera.terminar(botao);
                }, function () {
                    window.botaoEspera.terminar(botao);
                    /* `gravar()` já avisou na tela */
                });
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
                window.caixaConfirmar.perguntar(
                    'Liberar os ingressos ' + b.de + ' a ' + b.ate
                    + '? Eles voltam a entrar na portaria.',
                    { rotulo: 'Liberar' }
                ).then(function (sim) {
                    if (!sim) { return; }
                    return gravar('/setores/' + s.id + '/bloqueios/' + b.id, {}, 'DELETE')
                        .then(carregarPainel)
                        .catch(function () { /* `gravar()` já avisou na tela */ });
                });
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

    /**
     * Pausar e retomar.
     *
     * A portaria so aceita `status=eq.ativo`, entao qualquer outro valor ja
     * derruba o aparelho na hora -- pausar nao precisa de mais nada do lado de
     * la. O que muda em relacao a excluir e que este tem volta.
     */
    function pausarAparelho(aparelho_id, pausar) {
        return gravar('/aparelhos/' + aparelho_id,
                      { status: pausar ? 'pausado' : 'ativo' }, 'PATCH')
            .then(carregarPainel);
    }

    /**
     * Excluir de verdade: a linha sai do banco e o aparelho some da lista.
     *
     * Decisao do usuario em 18/08/2026, no lugar do antigo "Revogar", que
     * desligava o aparelho e o deixava na tela para sempre. As entradas que ele
     * ja leu ficam contadas no evento -- quem cuida disso e a chave estrangeira
     * `on delete set null` das leituras, em
     * `sql/schema_acesso_excluir_aparelho.sql`.
     */
    function excluirAparelho(aparelho_id) {
        return gravar('/aparelhos/' + aparelho_id, undefined, 'DELETE')
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
     * A situação do aparelho, em uma frase.
     *
     * `pausado` entrou em 18/08/2026 no lugar de `revogado`, que nenhuma tela
     * cria mais. As linhas antigas com `revogado` continuam no banco, e por
     * isso continuam tendo uma frase aqui: a portaria as recusa igual, e o dono
     * pode retomá-las ou excluí-las.
     */
    function situacaoDoAparelho(a) {
        if (a.status === 'ativo') { return 'Ativo. '; }
        if (a.status === 'pausado') {
            return 'Pausado — não valida ingresso até você retomar. ';
        }
        return 'Desligado — não valida ingresso. ';
    }

    /**
     * O cartão de um portão: o nome, a situação, e as QUATRO coisas que se faz
     * com ele — Renomear, Selecionar os Setores, Pausar e Excluir.
     *
     * As quatro em botões do mesmo tamanho, um abaixo do outro (usuário,
     * 18/08/2026). Antes o cartão despejava campo de nome, botões de setor e a
     * revogação abertos ao mesmo tempo: com três portões, achar o terceiro
     * custava a tela inteira de rolagem. Agora cada opção abre o que é dela, e
     * uma de cada vez.
     *
     * TODOS os portões do evento aparecem, de todos os celulares — decisão do
     * usuário em 16/08/2026. Por isso o portão DESTE aparelho vem marcado com
     * ★: sem a marca, o dono mexe no errado — e excluir não tem volta.
     *
     * `edicaoAnterior`, se vier, é o que o dono tinha digitado, marcado e
     * ABERTO antes de o painel recarregar por baixo dele — ver o comentário em
     * `desenhar()`.
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
            marca.textContent = '★ Este é o aparelho em que você está.';
            el.appendChild(marca);
        }

        var situacao = document.createElement('p');
        situacao.className = 'situacao-aparelho';
        var nomes = (estado.painel.setores || [])
            .filter(function (s) { return a.setores.indexOf(s.id) >= 0; })
            .map(function (s) { return s.nome; });
        situacao.textContent = situacaoDoAparelho(a)
            + (nomes.length ? 'Valida: ' + nomes.join(', ') : 'Ainda não valida nenhum setor.');
        el.appendChild(situacao);

        var opcoes = document.createElement('div');
        opcoes.className = 'opcoes-aparelho';
        el.appendChild(opcoes);

        // Qual opção estava aberta antes do redesenho: '' (nenhuma), 'nome' ou
        // 'setores'.
        var aberto = edicaoAnterior ? edicaoAnterior.aberto : '';
        var abridores = [];

        /**
         * Uma opção que ABRE um painel, e o painel logo abaixo dela.
         *
         * Uma de cada vez: dois painéis abertos empurram o próximo aparelho para
         * fora da tela, e a lista tem quantos portões o evento tiver.
         */
        function abridor(id, rotulo, chave, painel) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'opcao-aparelho so-com-senha';
            b.id = id;
            b.textContent = rotulo;
            b.setAttribute('aria-controls', painel.id);
            b.setAttribute('aria-expanded', aberto === chave ? 'true' : 'false');
            painel.classList.toggle('sumindo', aberto !== chave);
            b.addEventListener('click', function () {
                var vaiAbrir = painel.classList.contains('sumindo');
                abridores.forEach(function (o) {
                    o.painel.classList.add('sumindo');
                    o.botao.setAttribute('aria-expanded', 'false');
                });
                painel.classList.toggle('sumindo', !vaiAbrir);
                b.setAttribute('aria-expanded', vaiAbrir ? 'true' : 'false');
            });
            abridores.push({ botao: b, painel: painel });
            opcoes.appendChild(b);
            opcoes.appendChild(painel);
            return b;
        }

        // ── Renomear ───────────────────────────────────────────

        var painelNome = document.createElement('div');
        painelNome.className = 'painel-opcao';
        painelNome.id = 'aparelho-painel-nome-' + a.id;

        var rotNome = document.createElement('label');
        rotNome.setAttribute('for', 'aparelho-nome-' + a.id);
        rotNome.textContent = 'Nome do aparelho';
        painelNome.appendChild(rotNome);

        var campoNome = document.createElement('input');
        campoNome.type = 'text';
        campoNome.id = 'aparelho-nome-' + a.id;
        campoNome.value = edicaoAnterior ? edicaoAnterior.nome : a.nome;
        painelNome.appendChild(campoNome);

        var btnSalvar = document.createElement('button');
        btnSalvar.type = 'button';
        btnSalvar.className = 'so-com-senha';
        btnSalvar.id = 'aparelho-salvar-' + a.id;
        btnSalvar.textContent = 'Salvar nome';
        btnSalvar.addEventListener('click', function () {
            var novoNome = campoNome.value;
            // Nenhum PATCH vazio se o dono só olhou o campo e não mexeu.
            if (novoNome === a.nome) { return; }
            // Se o portão que está sendo renomeado é ESTE celular, a cópia
            // local acompanha: é ela que preenche a pergunta do próximo evento,
            // e ela responde sem rede. O servidor cuida das outras linhas do
            // mesmo aparelho, pelo `navegador_id`.
            if (meu && meu.aparelho_id === a.id) {
                window.chaveiro.guardarNomeDoAparelho(novoNome);
            }
            window.botaoEspera.comecar(btnSalvar, 'Salvando…');
            renomearAparelho(a.id, novoNome).then(function () {
                // No sucesso, `carregarPainel()` já reconstruiu este cartão
                // inteiro -- este `btnSalvar` nem está mais no documento. O
                // `terminar` aqui é so para o caso de falha, quando o cartão
                // continua sendo o mesmo: idempotente, não custa nada no
                // outro caminho.
                window.botaoEspera.terminar(btnSalvar);
            }, function () {
                window.botaoEspera.terminar(btnSalvar);
                /* já avisado */
            });
        });
        painelNome.appendChild(btnSalvar);

        abridor('aparelho-renomear-' + a.id, 'Renomear', 'nome', painelNome);

        // ── Selecionar os Setores ─────────────────────────────────

        var painelSetores = document.createElement('div');
        painelSetores.className = 'painel-opcao';
        painelSetores.id = 'aparelho-painel-setores-' + a.id;

        var ajudaSetores = document.createElement('p');
        ajudaSetores.className = 'config-ajuda';
        ajudaSetores.textContent = 'Toque nos setores que este aparelho valida. '
            + 'O que estiver aceso vale na hora.';
        painelSetores.appendChild(ajudaSetores);

        // Passa a valer no toque, sem botão de confirmar: é a mesma regra que
        // o "Uso do ingresso" do cartão de setor já segue. O aviso de gravado
        // fica logo abaixo, porque gravar sozinho não pode ser gravar calado.
        var marcadosAgora = edicaoAnterior ? edicaoAnterior.setores : a.setores;
        var recado = document.createElement('span');
        recado.className = 'salvo sumindo';
        recado.id = 'aparelho-salvo-' + a.id;
        recado.setAttribute('role', 'status');
        recado.textContent = '✓ salvo';

        painelSetores.appendChild(botoesDeSetor('aparelho-setores-' + a.id, marcadosAgora,
            function (setores) {
                trocarSetoresDoAparelho(a.id, setores)
                    .then(function () {
                        var atual = $('aparelho-salvo-' + a.id);
                        if (atual) { atual.classList.remove('sumindo'); }
                    })
                    .catch(function () { /* `gravar()` já avisou na tela */ });
            }));
        painelSetores.appendChild(recado);

        abridor('aparelho-escolher-setores-' + a.id, 'Selecionar os Setores',
                'setores', painelSetores);

        // ── Pausar / Retomar ─────────────────────────────────────

        var ativo = a.status === 'ativo';
        var btnPausar = document.createElement('button');
        btnPausar.type = 'button';
        btnPausar.className = 'opcao-aparelho so-com-senha';
        btnPausar.id = 'aparelho-pausar-' + a.id;
        btnPausar.textContent = ativo ? 'Pausar' : 'Retomar';
        btnPausar.addEventListener('click', function () {
            // Retomar não pergunta; pausar sim. A assimetria é a mesma do
            // "Inativar este evento": ligar de volta não quebra a noite de
            // ninguém, e pausar para o portão no meio dela.
            var perguntar = !ativo ? Promise.resolve(true)
                : window.caixaConfirmar.perguntar(
                    'Pausar "' + a.nome + '"? Ele para de validar ingresso agora. '
                    + 'Toque em "Retomar" quando quiser que ele volte a ler.',
                    { rotulo: 'Pausar' }
                );
            return perguntar.then(function (sim) {
                if (!sim) { return; }
                window.botaoEspera.comecar(btnPausar, ativo ? 'Pausando…' : 'Retomando…');
                return pausarAparelho(a.id, ativo).then(function () {
                    window.botaoEspera.terminar(btnPausar);
                }, function () {
                    window.botaoEspera.terminar(btnPausar);
                    /* já avisado */
                });
            });
        });
        opcoes.appendChild(btnPausar);

        // ── Excluir ────────────────────────────────────────────

        var btnExcluir = document.createElement('button');
        btnExcluir.type = 'button';
        btnExcluir.className = 'opcao-aparelho so-com-senha perigo';
        btnExcluir.id = 'aparelho-excluir-' + a.id;
        btnExcluir.textContent = 'Excluir';
        btnExcluir.addEventListener('click', function () {
            // Confirmação, e não senha de novo: a elevação já cobre isso. O que
            // falta avisar é o tamanho do estrago — excluir desliga o aparelho
            // na hora, no meio do evento, e não tem volta.
            window.caixaConfirmar.perguntar(
                'Excluir "' + a.nome + '"? Ele sai da lista para sempre e para de '
                + 'validar ingresso agora. As entradas que ele já leu continuam '
                + 'contadas no evento. Para usar aquele celular de novo, será preciso '
                + 'abrir o evento nele outra vez.',
                { rotulo: 'Excluir', perigo: true }
            ).then(function (sim) {
                if (!sim) { return; }
                window.botaoEspera.comecar(btnExcluir, 'Excluindo…');
                return excluirAparelho(a.id).then(function () {
                    window.botaoEspera.terminar(btnExcluir);
                }, function () {
                    window.botaoEspera.terminar(btnExcluir);
                    /* já avisado */
                });
            });
        });
        opcoes.appendChild(btnExcluir);

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
            // Um caminho só, com ou sem sessão. Antes havia dois, e o de cima
            // — sessão aberta, elevação vencida — pedia a senha num
            // `window.prompt` e escrevia o erro no `#aviso-gravacao`, que vive
            // DENTRO da engrenagem, ainda escondida neste instante. Ou seja:
            // metade dos donos recebia o aviso numa caixa invisível.
            //
            // `haviaSessao` continua importando por uma razão só: se o dono já
            // estava logado no PRÓPRIO celular, fechar a configuração não pode
            // deslogá-lo. Ver `fecharEngrenagem`.
            return pedirEntrada(evento_id, !!s);
        });
    }

    /**
     * A caixa de entrar da configuração.
     *
     * Devolve uma promessa que só resolve quando a conta entra E a elevação
     * chega. Enquanto a senha não conferir, a caixa FICA na tela com o motivo
     * escrito — que é o defeito que ela nasceu para consertar: até 16/08/2026
     * a senha era pedida por `window.prompt`, e uma senha errada não produzia
     * absolutamente nada na tela.
     *
     * Os ouvintes são trocados a cada chamada (`onclick`, e não
     * `addEventListener`): abrir a caixa duas vezes na mesma sessão da página
     * empilharia dois ouvintes, e o segundo toque tentaria entrar duas vezes.
     */
    function pedirEntrada(evento_id, haviaSessao) {
        var caixa = $('caixa-entrar-config');
        var campoEmail = $('entrar-config-email');
        var campoSenha = $('entrar-config-senha');
        var erro = $('erro-entrar-config');
        var botao = $('btn-entrar-config');

        campoEmail.value = emailLembrado();
        campoSenha.value = '';
        // Reabrir a caixa devolve o botão: quem cancelou no meio da ida à rede
        // deixou "Conferindo…" preso até a resposta chegar.
        if (window.botaoEspera) { window.botaoEspera.terminar(botao); }
        erro.classList.add('sumindo');
        $('lista').classList.add('sumindo');
        caixa.classList.remove('sumindo');
        // O foco vai para o campo que falta preencher: com o e-mail lembrado,
        // é a senha.
        (campoEmail.value ? campoSenha : campoEmail).focus();

        function mostrarErro(texto) {
            erro.textContent = texto;
            erro.classList.remove('sumindo');
            window.botaoEspera.terminar(botao);
        }

        function fechar() {
            caixa.classList.add('sumindo');
            campoSenha.value = '';        // a senha não fica na tela nem na memória do DOM
            $('lista').classList.remove('sumindo');
        }

        return new Promise(function (resolver, recusar) {
            botao.onclick = function () {
                var email = (campoEmail.value || '').trim();
                var senha = campoSenha.value || '';
                if (!email || !senha) {
                    return mostrarErro('Preencha o e-mail e a senha.');
                }
                // O e-mail sim, a senha nunca: no portão o dono digita isto de
                // pé, com pressa, e o e-mail é a metade que não é segredo.
                try { localStorage.setItem(CHAVE_EMAIL, email); }
                catch (e) { /* aba anônima */ }

                window.botaoEspera.comecar(botao, 'Conferindo…');
                erro.classList.add('sumindo');
                AcessoConta.entrarEElevar(email, senha, evento_id)
                    .then(function (r) {
                        estado.sessao = r.sessao;
                        // A bandeira que faz o `fecharEngrenagem` desfazer a
                        // sessão — e ela SÓ vale quando não havia sessão antes.
                        // O dono que já estava logado no próprio celular não
                        // pode ser deslogado por ter fechado uma caixa de
                        // configuração; quem precisa sair é o celular do
                        // porteiro, onde a conta chegou agora e só para isto.
                        if (!haviaSessao) { estado.sessaoDaEngrenagem = true; }
                        guardarElevacao({
                            token: r.elevacao.token,
                            expira_em: r.elevacao.expira_em,
                            evento_id: evento_id
                        });
                        window.botaoEspera.terminar(botao);
                        fechar();
                        resolver({ sessao: r.sessao, elevacao: r.elevacao });
                    })
                    .catch(function (e) {
                        // A caixa FICA aberta, com o motivo escrito. Fechá-la
                        // devolveria o dono à lista sem uma palavra — que era
                        // exatamente o defeito.
                        mostrarErro(e && e.message
                            ? e.message
                            : 'Não consegui entrar agora. Confira a internet e '
                              + 'tente de novo.');
                    });
            };

            // Sem pedir o e-mail: não há link a mandar. Quem recupera é a
            // gráfica, com uma senha provisória nova.
            $('btn-esqueci-entrar-config').onclick = function () {
                AcessoConta.esqueciSenha().then(function (frase) {
                    // No mesmo lugar do erro, e não num alerta: é a resposta ao
                    // toque que ele acabou de dar, e tem de aparecer onde ele
                    // está olhando.
                    erro.textContent = frase;
                    erro.classList.remove('sumindo');
                });
            };

            $('btn-cancelar-entrar-config').onclick = function () {
                fechar();
                recusar(new Error('cancelado'));
            };

            campoSenha.onkeydown = function (ev) {
                if (ev.key === 'Enter') { botao.click(); }
            };
            // Mesmo gesto do e-mail para a senha da tela de entrar da casa:
            // o Enter leva ao proximo campo, e so na senha ele confirma.
            campoEmail.onkeydown = function (ev) {
                if (ev.key === 'Enter') { campoSenha.focus(); }
            };
        });
    }

    /**
     * O toque na engrenagem, ao lado da barra do evento.
     *
     * A senha vem ANTES de a tela aparecer: mostrar a configuração e só então
     * pedir a senha deixaria o nome do evento, os setores e a lista de portões
     * à vista de quem estiver com o celular do porteiro na mão.
     */
    /**
     * A abertura em curso, se houver: `{ evento_id, promessa }`.
     *
     * Existe por causa da janela em que a tela NÃO muda. Desde 18/08/2026 o
     * primeiro passo da engrenagem é uma ida ao servidor (a troca do bilhete de
     * conta pelo do evento) que acontece antes de um pixel se mexer — e o botão
     * da lista é um ícone sem estado de espera. Num 4G ruim, o dono toca de
     * novo, e sem esta guarda o segundo toque dispararia um segundo `/elevar` e
     * um segundo `carregarPainel`.
     */
    var aberturaEmCurso = null;

    /**
     * O botão de engrenagem daquele evento, na lista. O id vem do
     * `lista-eventos.js` (`config-<evento_id>`); pode não existir quando a
     * engrenagem é aberta por outro caminho que não o toque na lista.
     */
    function botaoDaEngrenagem(evento_id) {
        return document.getElementById('config-' + evento_id);
    }

    /**
     * `disabled` + `aria-busy`, e NÃO o `botaoEspera`: ele troca o texto do
     * botão, e este não tem texto nenhum — é só o ícone. Trocar o conteúdo
     * levaria o `<svg>` embora e deixaria um botão vazio na lista.
     */
    function engrenagemOcupada(evento_id, ocupada) {
        var botao = botaoDaEngrenagem(evento_id);
        if (!botao) { return; }
        botao.disabled = !!ocupada;
        if (ocupada) { botao.setAttribute('aria-busy', 'true'); }
        else { botao.removeAttribute('aria-busy'); }
    }

    function abrirEngrenagem(evento_id, nome) {
        // O segundo toque no MESMO evento devolve a mesma promessa em vez de
        // recomeçar. Em outro evento passa: é uma escolha diferente, e a
        // primeira já terá trocado `estado.evento_id` de qualquer forma.
        if (aberturaEmCurso && aberturaEmCurso.evento_id === evento_id) {
            return aberturaEmCurso.promessa;
        }
        estado.evento_id = evento_id;
        // Evento novo, campos novos: sem isto, abrir a engrenagem de um segundo
        // evento na mesma sessão da página manteria o nome e a data do primeiro
        // escritos nos campos, porque `jaDesenhouEvento` os protege de
        // redesenhos. Ver o comentário daquela bandeira.
        jaDesenhouEvento = false;
        restaurarElevacao();
        engrenagemOcupada(evento_id, true);
        // ANTES do `comSenha`, pelo mesmo motivo do `restaurarElevacao` acima:
        // ele só pede a senha quando não encontra elevação deste evento, e a
        // troca do bilhete de conta pelo bilhete do evento é justamente o que
        // faz não haver nada a pedir.
        var promessa = trocarPeloBilheteDaConta(evento_id).then(function () {
            return comSenha(evento_id, function () {
                $('engrenagem').classList.remove('sumindo');
                // A BARRA DO TOPO SAI JUNTO com a lista. Ela vive FORA do
                // `#lista` -- o porteiro nao tem conta, e ela precisa aparecer
                // acima do login --, e por isso sobrava por cima da
                // configuracao. Enquanto sobrou, ela era uma saida da
                // engrenagem que NAO passava pelo `fecharEngrenagem()`: tocar
                // em "Meus Pedidos" e depois em "← Voltar" devolvia a casa com
                // a elevacao de 15 minutos de pe e a sessao relampago ainda
                // aberta, num celular que fica com o porteiro.
                $('lista').classList.add('sumindo');
                $('bloco-novo-evento').classList.add('sumindo');
                if (nome) { $('nome-evento-titulo').textContent = nome; }
                // DEPOIS de a engrenagem aparecer, e antes do painel: a tela
                // já nasce com as seções deste evento no lugar certo, em vez
                // de piscar de recolhida para aberta quando a rede responder.
                restaurarSecoes();
                return carregarPainel();
            });
        }).catch(function () {
            // Cancelou a senha, ou ela não conferiu: a lista continua na tela,
            // que é onde ele já estava. Quem explica o erro é o `avisar()` de
            // dentro de `abrirCaixaDeSenha`.
        }).then(function () {
            // Nos DOIS desfechos: a lista volta a ser tocável quando o dono
            // cancela, e a guarda não pode sobreviver à abertura que a criou —
            // um `aberturaEmCurso` pendurado deixaria a engrenagem daquele
            // evento morta para sempre.
            engrenagemOcupada(evento_id, false);
            if (aberturaEmCurso && aberturaEmCurso.evento_id === evento_id) {
                aberturaEmCurso = null;
            }
        });
        aberturaEmCurso = { evento_id: evento_id, promessa: promessa };
        return promessa;
    }

    /**
     * "Entrar libera 15 minutos": a engrenagem sem senha, logo depois do login.
     *
     * O bilhete de CONTA diz que a senha do dono foi digitada há pouco neste
     * navegador. Ele não abre escrita nenhuma sozinho — o servidor recusa um
     * bilhete de conta em qualquer gravação de evento, porque a assinatura é
     * recalculada sobre o id do evento e não bate. O que ele faz é dispensar a
     * DIGITAÇÃO no `POST /eventos/{id}/elevar`, que devolve o bilhete DO EVENTO
     * — o mesmo que a senha devolveria, com o mesmo prazo e as mesmas amarras.
     *
     * Tudo aqui é de melhor esforço. Bilhete vencido, sessão caída, rede ruim,
     * evento de outra conta: qualquer um deles cai no caminho de sempre, a
     * `#caixa-entrar-config` pedindo a senha. Por isso o `catch` engole — não
     * há erro a mostrar, porque não houve promessa nenhuma ao dono.
     */
    function trocarPeloBilheteDaConta(evento_id) {
        // Já há bilhete DESTE evento (o `restaurarElevacao` acabou de lê-lo, ou
        // o `receberElevacao` o entregou): nada a trocar, e uma chamada a menos.
        if (elevado()) { return Promise.resolve(); }
        var daConta = AcessoConta.elevacaoConta();
        if (!daConta) { return Promise.resolve(); }

        // `Promise.resolve().then` e não a chamada direta: `AcessoConta.sessao()`
        // NÃO é async e LANÇA na hora com `supabaseClient` nulo (sem rede, ou o
        // modo offline do `supabase-config.js`). Mesma razão do `sessaoOuLogin`.
        return Promise.resolve().then(function () {
            return AcessoConta.sessao();
        }).then(function (s) {
            if (!s) { return; }
            var navegador = AcessoConta.navegadorId();
            return _pedir('/eventos/' + evento_id + '/elevar', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + s.access_token,
                    'Content-Type': 'application/json',
                    'X-Elevacao': daConta.token,
                    'X-Navegador': navegador
                },
                body: JSON.stringify({ navegador: navegador })
            }).then(function (r) {
                estado.sessao = s;
                // SEM `sessaoDaEngrenagem`: a conta já estava aberta neste
                // aparelho antes de a engrenagem ser tocada — é o celular do
                // próprio dono. Marcá-la aqui faria o `fecharEngrenagem`
                // deslogá-lo por ter fechado uma tela de configuração.
                guardarElevacao({ token: r.token, expira_em: r.expira_em,
                                  evento_id: evento_id });
            });
        }).catch(function () {
            // O caminho de hoje: a caixa pede a senha.
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
        $('bloco-novo-evento').classList.remove('sumindo');

        // A LISTA SE REFAZ AO SAIR DA ENGRENAGEM — e ANTES de a sessão sair.
        //
        // Sem isto, o que o dono acabou de mudar aqui dentro não aparecia lá
        // fora: ele inativava o evento, voltava, e a barra continuava verde,
        // com os dados de quando a tela abriu. Foi o defeito relatado em
        // 17/08/2026 ("inativado ainda não sinaliza inativado na home, e segue
        // verde"). O `finalizarEvento` recarregava a lista por conta própria,
        // e o "Inativar" não — mas o lugar certo é aqui, porque TODO caminho
        // de saída da engrenagem passa por esta função, e assim vale também
        // para o nome, a data e os setores.
        //
        // A ORDEM É O PONTO. Recarregar depois do `signOut` traria a lista sem
        // conta nenhuma — e sem conta a lista só enxerga o chaveiro deste
        // aparelho, que não guarda situação e assume `ativo: true`. O evento
        // voltaria VERDE, que é exatamente o sintoma que esta linha conserta.
        var refeita = window.listaEventos
            ? Promise.resolve()
                .then(function () { return window.listaEventos.recarregar(); })
                .catch(function () { /* a lista já avisa na tela quando falha */ })
            : Promise.resolve();

        return refeita.then(encerrarSessaoRelampago);
    }

    /**
     * Desfaz o login relâmpago — e SÓ ele. Se a conta já estava aberta neste
     * celular antes da caixa de senha, não há nada a desfazer.
     *
     * Vive separado do `fecharEngrenagem` desde 18/08/2026 porque ganhou um
     * segundo chamador: o `virar-portao.js`, quando o dono entra com a conta só
     * para virar aparelho e depois CANCELA a pergunta do nome. Antes não havia
     * como cancelar depois do login — o `criar` vinha em seguida e o
     * `aparelhoAqui.assumir` encerrava a sessão. Sem esta saída, a conta inteira
     * do cliente ficaria aberta num celular que vai para a mão do porteiro.
     */
    function encerrarSessaoRelampago() {
        if (!estado.sessaoDaEngrenagem) { return; }
        estado.sessaoDaEngrenagem = false;
        estado.sessao = null;
        try {
            return supabaseClient.auth.signOut().catch(function () { });
        } catch (e) {
            return;                     // sem SDK: não há sessão para encerrar
        }
    }

    /**
     * "Sair deste aparelho": este aparelho deixa de ler os ingressos deste evento.
     *
     * NÃO descarta a fila — a mesma regra do `desparear()` da portaria: o que a
     * fila guarda é contagem que o cliente pagou para ter, e ela sobe sozinha
     * quando a internet voltar.
     *
     * As chaves antigas saem junto SÓ se apontarem para este evento. Deixá-las
     * seria dizer "saí do aparelho" e o celular continuar validando ingresso.
     */
    function sairDoAparelho() {
        // A FILA VEM PRIMEIRO, e este é o único lugar que pode perdê-la.
        //
        // O token é o que autoriza mandar a fila ao servidor. Descartá-lo com
        // leitura pendente não "guarda para depois": não existe depois — aquelas
        // entradas nunca mais sobem, e é contagem que o cliente pagou para ter.
        //
        // O texto desta confirmação chegou a PROMETER que elas subiriam quando a
        // internet voltasse. Era mentira, e do pior tipo: a promessa aparecia
        // exatamente no instante em que a perda acontecia.
        //
        // É a mesma trava que o `irParaConfiguracao()` da portaria aplica, e o
        // motivo é o mesmo. Sincroniza antes de contar: quase sempre a fila
        // zera aqui e o dono nem vê este caminho.
        return sincronizarAntesDeSair().then(function (naFila) {
            if (naFila > 0) {
                avisar((naFila === 1
                    ? 'Há 1 leitura que ainda não subiu'
                    : 'Há ' + naFila + ' leituras que ainda não subiram')
                    + ' para o servidor. Conecte este aparelho à internet e '
                    + 'espere a fila zerar antes de sair do aparelho: sem o '
                    + 'acesso deste aparelho, elas não sobem mais.', 'erro');
                return;
            }
            return esquecerEsteAparelho();
        });
    }

    /**
     * Manda o que estiver na fila e devolve quantas sobraram.
     *
     * Sem depósito carregado — outra página, teste — devolve 0: não há fila que
     * este aparelho possa perder.
     */
    function sincronizarAntesDeSair() {
        if (!window.portariaDeposito) { return Promise.resolve(0); }
        return window.portariaDeposito.contarFila().catch(function () { return 0; });
    }

    function esquecerEsteAparelho() {
        return window.caixaConfirmar.perguntar(
            'Sair deste aparelho? Este aparelho deixa de ler os ingressos deste '
            + 'evento. Para voltar a ler, o dono precisa entrar de novo e tocar '
            + 'na barra do evento.',
            { rotulo: 'Sair deste aparelho', perigo: true }
        ).then(function (sim) {
            if (!sim) { return; }
            window.chaveiro.esquecer(estado.evento_id);
            try {
                if (localStorage.getItem('ideal_portaria_evento') === estado.evento_id) {
                    localStorage.removeItem('ideal_portaria_token');
                    localStorage.removeItem('ideal_portaria_evento');
                }
            } catch (e) { /* aba anônima */ }
            return Promise.resolve(fecharEngrenagem()).then(function () {
                // Recarregar, e não redesenhar: a lista é montada pelo
                // `lista-eventos.js` no arranque, e recarregar é o único caminho
                // que não põe dois arquivos decidindo quem manda na mesma tela.
                location.reload();
            });
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
            // não é o caso de descartar o que pode servir a OUTRA aba/evento —
            // por isso o `sessionStorage` fica como está.
            //
            // A MEMÓRIA, porém, tem de ser limpa. Sem esta linha, a elevação
            // do evento anterior continuava em `estado.elevacao` depois de a
            // engrenagem trocar de evento: o token guardado era ignorado, mas
            // o que já estava na memória seguia valendo.
            estado.elevacao = null;
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
     * Usa a MESMA caixa de `sessaoOuLogin`, e não uma segunda. Até 17/08/2026
     * esta era pedida por `window.prompt`, o último sobrevivente das caixas
     * nativas nesta tela — e no aplicativo instalado elas não respondem. Foi
     * assim que a configuração ficou muda em 16/08 (o `prompt` da engrenagem) e
     * assim que "Finalizar" e "Inativar" morreram em 17/08 (os `window.confirm`).
     * Deixar este de pé era guardar o mesmo defeito para o dia em que uma
     * elevação vencesse no meio de uma gravação.
     *
     * O comentário que estava aqui defendia o `prompt` por ele não ser guardado
     * no preenchimento automático do navegador. A `#caixa-entrar-config` resolve
     * isso de outro jeito: ela não é um `<form>` e o campo é `autocomplete="off"`,
     * então o navegador também não oferece guardar a senha.
     */
    function abrirCaixaDeSenha() {
        return sessaoOuLogin(estado.evento_id).then(function (r) {
            return r.elevacao;
        }).catch(function (e) {
            // Cancelar não é o mesmo caso que errar a senha nem que ficar sem
            // rede — a caixa já mostra o motivo dos dois últimos. Sem esta
            // frase, o dono toca em "Cancelar" no meio de uma gravação e a tela
            // fica muda: ele guarda o celular achando que gravou.
            if (e && e.message === 'cancelado') {
                avisar('Você cancelou o pedido de senha. Não gravei nada — o que '
                     + 'você digitou continua na tela.', 'erro');
            }
            throw e;
        });
    }

    function acesso_minutos() { return 15; }

    /**
     * A casa se recarrega quando o service worker novo assume.
     *
     * Aqui isso pode; na portaria, não. Lá a câmera pode estar aberta e a fila
     * andando, então a faixa avisa e a hora é do porteiro. Aqui não há leitura
     * em curso nem fila — o pior que a recarga interromperia é uma senha sendo
     * digitada, e por isso ela espera a `caixa-entrar-config` estar fechada.
     *
     * Sem isto, o aplicativo INSTALADO pode ficar na versão do dia da
     * instalação para sempre: ele não tem barra de endereço, e quem só o traz
     * de volta do multitarefa nunca navega de novo. Foi o que aconteceu em
     * 16/08/2026 — o conserto da senha estava publicado e o dono continuava
     * vendo o defeito, porque o celular dele nunca soube.
     */
    function recarregarQuandoTrocarDeVersao() {
        if (!('serviceWorker' in navigator)) { return; }
        var jaRecarregou = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            // O `controllerchange` pode disparar mais de uma vez; recarregar
            // duas vezes seguidas viraria um laço na cara do dono.
            if (jaRecarregou) { return; }
            var caixa = $('caixa-entrar-config');
            if (caixa && !caixa.classList.contains('sumindo')) {
                // Digitando a senha: a faixa de atualização continua na tela e
                // ele aplica quando quiser. Atropelar aqui levaria embora o que ele
                // acabou de escrever.
                return;
            }
            jaRecarregou = true;
            location.reload();
        });
    }

    /**
     * A versão que ESTE arquivo carrega, lida da própria tag que o trouxe.
     *
     * Não é uma constante de propósito: o `publicar.ps1` renumera os `?v=`
     * sozinho, e uma constante aqui teria de ser lembrada a cada release — a
     * que ninguém lembra é a que envelhece e passa a mentir. Mesmo caminho que
     * o `sw-registro.js` usa.
     */
    function versaoDestaTela() {
        var eu = document.currentScript;
        if (!eu) {
            var todos = document.getElementsByTagName('script');
            for (var i = todos.length - 1; i >= 0; i--) {
                if (/controle\.js/.test(todos[i].src || '')) { eu = todos[i]; break; }
            }
        }
        var casou = /[?&]v=(\d+)/.exec((eu && eu.src) || '');
        return casou ? 'v' + casou[1] : 'versão desconhecida';
    }

    var VERSAO_DESTA_TELA = versaoDestaTela();

    /**
     * A saída de emergência para o aplicativo instalado que ficou preso numa
     * versão antiga.
     *
     * Descadastra o service worker e limpa os caches; a recarga seguinte vem
     * inteira do servidor. NÃO toca em `localStorage` nem no IndexedDB — é lá que
     * moram o chaveiro dos portões deste aparelho e a fila de leituras que
     * ainda não subiram, e as duas coisas são do dono, não do cache.
     */
    function forcarAtualizacao() {
        var botao = $('btn-forcar-atualizacao');
        if (botao) { botao.disabled = true; botao.textContent = 'Atualizando…'; }

        var passos = [];
        try {
            if ('serviceWorker' in navigator) {
                passos.push(navigator.serviceWorker.getRegistrations()
                    .then(function (todos) {
                        return Promise.all(todos.map(function (r) { return r.unregister(); }));
                    }));
            }
        } catch (e) { /* navegador sem service worker: nada a descadastrar */ }
        try {
            if (window.caches && caches.keys) {
                passos.push(caches.keys().then(function (nomes) {
                    // A foto de fundo fica: ela mora num cache próprio
                    // (`ideal-fundo-*`, ver `fundo-do-app.js`) justamente para
                    // este botão não a levar junto. Ela é conteúdo, não
                    // aplicativo — e tirá-la daqui obrigava um download novo no
                    // meio do evento. Até 04/09/2026 este botão limpava tudo, e
                    // o fundo sumia no "atualizar".
                    return Promise.all(nomes
                        .filter(function (n) { return n.indexOf('ideal-fundo') !== 0; })
                        .map(function (n) { return caches.delete(n); }));
                }));
            }
        } catch (e) { /* sem Cache Storage: idem */ }

        return Promise.all(passos).catch(function () { }).then(function () {
            // `location.replace` com um parâmetro que muda: alguns navegadores
            // devolvem a página do próprio histórico num `reload()` simples, e
            // aí a atualização não teria acontecido — que é justamente o
            // problema que este botão existe para resolver.
            location.replace('controle.html?atualizado=' + Date.now());
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Fora do `if` abaixo, de propósito: a atualização precisa chegar mesmo
        // nas páginas que não têm a engrenagem.
        recarregarQuandoTrocarDeVersao();

        if ($('versao-do-app')) {
            $('versao-do-app').textContent = VERSAO_DESTA_TELA;
        }
        if ($('btn-forcar-atualizacao')) {
            $('btn-forcar-atualizacao').addEventListener('click', forcarAtualizacao);
        }

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

        $('btn-sair-do-aparelho').addEventListener('click', function () {
            sairDoAparelho();
        });

        // O toque no cabeçalho alterna a seção. Um ouvinte por seção, e não um
        // delegado no `#engrenagem`: os cinco cabeçalhos estão fixos no HTML e
        // nunca são redesenhados, ao contrário de tudo o que há dentro deles.
        SECOES.forEach(function (secao) {
            var cabecalho = $('abrir-' + secao);
            if (cabecalho) {
                cabecalho.addEventListener('click', function () {
                    alternarSecao(secao);
                });
            }
        });

        $('btn-gravar-evento').addEventListener('click', function () {
            var botao = $('btn-gravar-evento');
            window.botaoEspera.comecar(botao, 'Gravando…');
            gravar('/eventos/' + estado.evento_id, {
                nome_evento: $('campo-nome-evento').value,
                local_evento: $('campo-local').value,
                // Convertido, e não mandado cru: o `datetime-local` entrega a
                // hora do relógio de quem digitou, sem fuso nenhum, e a coluna
                // é TIMESTAMPTZ. Cru, "22:00" viraria 22:00 UTC — 19:00 em
                // Brasília — e o evento apareceria três horas mais cedo para
                // todo mundo. Ver `doCampoParaISO`.
                data_evento: doCampoParaISO($('campo-data').value)
            }, 'PATCH').then(carregarPainel).then(function () {
                window.botaoEspera.terminar(botao);
            }, function () {
                window.botaoEspera.terminar(botao);
                /* já avisado */
            });
        });

        // O FORMULÁRIO DE LOGIN saiu daqui em 17/08/2026. Ele é do `conta.js`
        // agora, junto com a troca de senha e a saída da conta — as três coisas
        // que a pessoa faz com a PRÓPRIA conta, num arquivo só. Aqui ficou o
        // que é da configuração de um evento, que é outro assunto e outra
        // senha (a elevação de 15 minutos).

        // Não pede mais o e-mail: não há link a mandar para lugar nenhum. A
        // recuperação passou a ser a gráfica passar uma senha provisória nova.
        $('btn-esqueci-config').addEventListener('click', function () {
            AcessoConta.esqueciSenha().then(function (frase) {
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
        encerrarSessaoRelampago: encerrarSessaoRelampago,
        comSenha: comSenha,
        // As cinco seções recolhíveis. Expostas porque os testes que medem o
        // que há DENTRO de uma delas precisam abri-la primeiro — e porque
        // `abrirTodasSecoes` é a saída de quem quiser a tela inteira em pé.
        abrirSecao: abrirSecao,
        fecharSecao: fecharSecao,
        alternarSecao: alternarSecao,
        abrirTodasSecoes: abrirTodasSecoes,
        // Quem elevou de FORA desta tela — o "carregar pedido" do Meus Pedidos
        // entra e eleva numa digitação só — entrega o bilhete aqui. Sem isto,
        // a engrenagem aberta em seguida pediria a senha de novo, dentro dos 15
        // minutos que a pessoa acabou de comprar.
        receberElevacao: function (evento_id, elevacao) {
            guardarElevacao({ token: elevacao.token, expira_em: elevacao.expira_em,
                              evento_id: evento_id });
        },
        sairDoAparelho: sairDoAparelho,
        // As duas ações da zona de risco, e o caminho de volta que a lista da
        // tela inicial chama.
        zerarEntradas: zerarEntradas,
        finalizarEvento: finalizarEvento,
        reabrirEvento: reabrirEvento,
        renomearAparelho: renomearAparelho,
        trocarSetoresDoAparelho: trocarSetoresDoAparelho,
        pausarAparelho: pausarAparelho,
        excluirAparelho: excluirAparelho,
        importarCodigos: importarCodigos,
        // A conversão de fuso é a única lógica desta tela que dá para errar sem
        // que nada apareça errado: um horário três horas fora ainda é um
        // horário. Exposta para ser testada de ida E de volta.
        doCampoParaISO: doCampoParaISO,
        deISOParaCampo: deISOParaCampo
    };
})();
