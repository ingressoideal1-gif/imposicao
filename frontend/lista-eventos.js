/**
 * A tela inicial do Ideal Control: os eventos, com a luz de cada um.
 *
 * A LUZ VERDE SIGNIFICA UMA COISA SO: este aparelho ja e portao daquele
 * evento. Decisao do usuario em 16/08/2026, contra as alternativas "o evento
 * esta ativo" e "as duas juntas". Se o evento estiver desligado, isso vai em
 * TEXTO ao lado do nome -- duas informacoes na mesma luz seriam duas
 * informacoes perdidas.
 *
 * A lista soma duas fontes, e a ordem delas e o ponto:
 *
 *   o chaveiro deste aparelho  -- sempre, sem rede e sem conta
 *   `/meus-eventos` da conta   -- so quando ha sessao aberta
 *
 * A primeira e o celular do porteiro no dia do evento, sem sinal e sem a conta
 * do dono. E a unica que nao pode falhar.
 */
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    /**
     * As duas fontes viram uma lista desenhavel.
     *
     * @param doChaveiro  o que `chaveiro.listar()` devolveu
     * @param daConta     o que `/meus-eventos` devolveu (vazio sem sessao)
     * @returns [{ id, nome, ativo, ehAparelho, nomeAparelho }]
     */
    function unir(doChaveiro, daConta) {
        var porId = {};

        (doChaveiro || []).forEach(function (p) {
            if (!p || !p.evento_id) { return; }
            porId[p.evento_id] = {
                id: p.evento_id,
                nome: p.nome_evento || 'Evento',
                // Sem a conta nao da para saber se o evento foi desligado. Um
                // "inativo" chutado na barra seria pior que silencio: o dono
                // desligaria um portao que esta trabalhando.
                ativo: true,
                ehAparelho: true,
                nomeAparelho: p.nome_portao || ''
            };
        });

        (daConta || []).forEach(function (ev) {
            if (!ev || !ev.id) { return; }
            if (ev.status === 'finalizado') {
                // Finalizado sai de "Meus Eventos" — ele tem lista própria,
                // logo abaixo. Sai INCLUSIVE quando este aparelho ainda tem a
                // chave dele no chaveiro: o servidor é a origem da verdade, e
                // uma barra verde de um evento que acabou mandaria o porteiro
                // tentar ler ingresso num portão que a portaria já recusa.
                delete porId[ev.id];
                return;
            }
            var ja = porId[ev.id];
            porId[ev.id] = {
                id: ev.id,
                // O servidor vence a copia do chaveiro. Regra deste projeto: o
                // que o parceiro escreve no banco e a origem da verdade, e um
                // nome guardado aqui envelhece assim que o dono o troca la.
                nome: ev.nome_evento || (ja ? ja.nome : 'Evento'),
                ativo: ev.status !== 'encerrado',
                ehAparelho: !!ja,
                nomeAparelho: ja ? ja.nomeAparelho : ''
            };
        });

        var linhas = Object.keys(porId).map(function (k) { return porId[k]; });
        // A ordem, do que mais serve ao que menos serve a quem esta no portao:
        //
        //   1. os ATIVOS em que este aparelho ja e portao   (luz verde)
        //   2. os outros ativos da conta                    (luz cinza)
        //   3. os INATIVOS                                  (luz vermelha)
        //
        // Inativo no fim e decisao do usuario, 17/08/2026. Um evento desligado
        // no meio da lista rouba a posicao do que esta acontecendo agora, e
        // quem procura com pressa toca no errado.
        linhas.sort(function (a, b) {
            if (a.ativo !== b.ativo) { return a.ativo ? -1 : 1; }
            if (a.ehAparelho !== b.ehAparelho) { return a.ehAparelho ? -1 : 1; }
            return a.nome.localeCompare(b.nome, 'pt-BR');
        });
        return linhas;
    }

    /**
     * Os eventos que ja acabaram, do mais recente para o mais antigo.
     *
     * Um evento acontece e TERMINA -- ele nao deixa de ter existido. Por isso
     * ele nao some da tela: vem para ca, com a data e com quanta gente entrou,
     * que e o numero pelo qual o dono se lembra do evento.
     *
     * So a conta sabe disso: o chaveiro deste aparelho nao guarda situacao
     * nenhuma, e chutar "finalizado" sem o servidor esconderia da lista um
     * evento que esta acontecendo.
     *
     * @returns [{ id, nome, data, entradas }]
     */
    function finalizados(daConta) {
        var linhas = (daConta || []).filter(function (ev) {
            return ev && ev.id && ev.status === 'finalizado';
        }).map(function (ev) {
            return {
                id: ev.id,
                nome: ev.nome_evento || 'Evento',
                data: ev.data_evento || null,
                // `|| 0` e nao "sem numero": um evento finalizado sem nenhuma
                // entrada e um caso real -- o teste que nunca virou festa.
                entradas: typeof ev.entradas === 'number' ? ev.entradas : 0
            };
        });
        linhas.sort(function (a, b) {
            var da = a.data || '', db = b.data || '';
            if (da !== db) { return da < db ? 1 : -1; }   // o mais recente em cima
            return a.nome.localeCompare(b.nome, 'pt-BR');
        });
        return linhas;
    }

    // ── Os icones, desenhados aqui ──────────────────────────────────────────
    //
    // SVG embutido, e nao PNG: esta tela precisa abrir sem rede, e cada arquivo
    // de imagem e mais uma requisicao que pode faltar. Alem disso o SVG segue a
    // cor do tema; um PNG de cor fixa nao segue.

    function svg(caminhos, rotulo) {
        var el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.setAttribute('viewBox', '0 0 24 24');
        el.setAttribute('width', '24');
        el.setAttribute('height', '24');
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', 'currentColor');
        el.setAttribute('stroke-width', '2');
        el.setAttribute('stroke-linecap', 'round');
        el.setAttribute('stroke-linejoin', 'round');
        el.setAttribute('aria-hidden', 'true');
        caminhos.forEach(function (d) {
            var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            el.appendChild(p);
        });
        if (rotulo) { el.setAttribute('role', 'img'); }
        return el;
    }

    function iconeCelularQR() {
        return svg([
            'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
            'M9 7h2v2H9z', 'M13 7h2v2h-2z', 'M9 11h2v2H9z', 'M13 11h2v2h-2z',
            'M12 18h.01'
        ]);
    }

    function iconeEngrenagem() {
        return svg([
            'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
            'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06'
            + 'a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09'
            + 'A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83'
            + 'l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09'
            + 'A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83'
            + 'l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09'
            + 'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83'
            + 'l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09'
            + 'a1.65 1.65 0 0 0-1.51 1z'
        ]);
    }

    /** Uma barra de evento, com a engrenagem ao lado dela — e nao dentro. */
    function linhaDeEvento(ev) {
        var linha = document.createElement('div');
        linha.className = 'linha-evento';

        var barra = document.createElement('button');
        barra.type = 'button';
        barra.className = 'barra-evento';
        barra.id = 'evento-' + ev.id;

        var luz = document.createElement('span');
        // Tres estados, e o vermelho VENCE o verde: portao de evento desligado
        // nao le nada, entao anunciar "este aparelho e portao" ali seria a
        // informacao certa na hora errada.
        //
        //   verde    -- este aparelho ja e portao deste evento
        //   cinza    -- evento ativo, este aparelho nao e portao dele
        //   vermelho -- evento inativo (usuario, 17/08/2026)
        luz.className = 'luz' + (!ev.ativo ? ' inativa'
                                           : (ev.ehAparelho ? ' acesa' : ''));
        // A luz e cor, e cor sozinha nao e rotulo. Quem usa leitor de tela --
        // ou quem nao distingue as duas -- precisa da palavra, e ela esta no
        // `aria-label` da barra inteira, logo abaixo.
        luz.setAttribute('aria-hidden', 'true');
        barra.appendChild(luz);

        var nome = document.createElement('span');
        nome.className = 'nome-evento';
        nome.textContent = ev.nome;          // digitado por pessoas: TEXTO
        barra.appendChild(nome);

        if (!ev.ativo) {
            // Em texto, e nao na luz: a luz ja diz outra coisa. Sem esta
            // palavra, um evento desligado fica identico a um ligado na tela de
            // quem vai abrir o portao.
            var marca = document.createElement('span');
            marca.className = 'marca-inativo';
            marca.textContent = 'inativo';
            barra.appendChild(marca);
        }

        var icone = document.createElement('span');
        icone.className = 'icone-ler';
        icone.appendChild(iconeCelularQR());
        barra.appendChild(icone);

        // O `aria-label` SUBSTITUI o conteúdo da barra para quem usa leitor de
        // tela, então a palavra "inativo" tem de ser repetida aqui — senão ela
        // existe só para quem enxerga a marca ao lado do nome.
        barra.setAttribute('aria-label',
            (ev.ehAparelho
                ? ('Ler ingressos de ' + ev.nome)
                : ('Usar este aparelho no evento ' + ev.nome))
            + (ev.ativo ? '' : ' — evento inativo'));
        barra.addEventListener('click', function () {
            window.virarPortao.abrir(ev.id, ev.nome);
        });
        linha.appendChild(barra);

        var engrenagem = document.createElement('button');
        engrenagem.type = 'button';
        engrenagem.className = 'botao-engrenagem';
        engrenagem.id = 'config-' + ev.id;
        engrenagem.appendChild(iconeEngrenagem());
        engrenagem.setAttribute('aria-label', 'Configurar ' + ev.nome);
        engrenagem.title = 'Configurar ' + ev.nome;
        engrenagem.addEventListener('click', function () {
            window.Controle.abrirEngrenagem(ev.id, ev.nome);
        });
        linha.appendChild(engrenagem);

        return linha;
    }

    function desenhar(linhas) {
        var caixa = $('eventos');
        if (!caixa) { return; }
        caixa.innerHTML = '';
        linhas.forEach(function (ev) { caixa.appendChild(linhaDeEvento(ev)); });
        $('sem-eventos').classList.toggle('sumindo', linhas.length > 0);
    }

    // ── Os eventos finalizados ──────────────────────────────────────────────

    /** "12/09/2026". Sem data cadastrada devolve texto vazio, e a linha fica
     *  com nome e contagem -- uma data inventada seria pior que nenhuma. */
    function dataCurta(iso) {
        if (!iso) { return ''; }

        // DATA SEM HORA vira texto direto, sem passar pelo `new Date`.
        // "2026-07-12" e lido pelo JavaScript como meia-noite em UTC, e no
        // Brasil isso volta como 11/07 -- um dia a menos, em silencio. A coluna
        // e TIMESTAMPTZ e normalmente traz hora, entao o caminho de baixo esta
        // certo; mas quem escreve nela e o sistema do parceiro, e um dia a menos
        // na data do evento e o tipo de erro que ninguem confere.
        var so_data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
        if (so_data) {
            return so_data[3] + '/' + so_data[2] + '/' + so_data[1];
        }

        var d = new Date(iso);
        if (isNaN(d.getTime())) { return ''; }
        return d.toLocaleDateString('pt-BR');
    }

    /** "4.812 entraram" — em pt-BR, que e como o resto do sistema escreve
     *  numero, e no singular quando foi uma pessoa so. */
    function quantosEntraram(n) {
        var quantos = n || 0;
        return quantos === 1 ? '1 entrou'
                             : quantos.toLocaleString('pt-BR') + ' entraram';
    }

    /**
     * Uma linha de evento finalizado: nome · data · quantos entraram, e
     * "Reabrir" ao lado.
     *
     * Sem luz e sem o icone de ler, ao contrario da barra de "Meus Eventos":
     * evento finalizado nao e portao, e a barra inteira aqui NAO e botao --
     * tocar nela nao pode levar a camera de leitura de um evento que acabou.
     */
    function linhaFinalizada(ev) {
        var linha = document.createElement('div');
        linha.className = 'linha-finalizada';
        linha.id = 'finalizado-' + ev.id;

        var dados = document.createElement('div');
        dados.className = 'dados-finalizado';

        var nome = document.createElement('span');
        nome.className = 'nome-evento';
        nome.textContent = ev.nome;          // digitado por pessoas: TEXTO
        dados.appendChild(nome);

        var detalhe = document.createElement('span');
        detalhe.className = 'detalhe-finalizado';
        var partes = [];
        var data = dataCurta(ev.data);
        if (data) { partes.push(data); }
        partes.push(quantosEntraram(ev.entradas));
        // SEM separador na frente. Ele existia de quando o nome e o detalhe
        // ficavam na mesma linha; hoje o detalhe tem linha propria, e o "·"
        // solto no comeco fica pendurado sem nada a separar.
        detalhe.textContent = partes.join(' · ');
        dados.appendChild(detalhe);
        linha.appendChild(dados);

        var reabrir = document.createElement('button');
        reabrir.type = 'button';
        reabrir.className = 'secundario botao-reabrir';
        reabrir.id = 'reabrir-' + ev.id;
        reabrir.textContent = 'Reabrir';
        reabrir.setAttribute('aria-label', 'Reabrir ' + ev.nome);
        reabrir.addEventListener('click', function () {
            window.botaoEspera.comecar(reabrir, 'Reabrindo…');
            // `reabrir_` engole os proprios erros (a caixa de senha
            // cancelada, a falha de rede) e devolve um aviso na tela -- por
            // isso ela nunca rejeita. Os dois ramos aqui sao so a garantia:
            // se algum dia ela passar a rejeitar, o botao ainda volta.
            reabrir_(ev).then(function () {
                window.botaoEspera.terminar(reabrir);
            }, function () {
                window.botaoEspera.terminar(reabrir);
            });
        });
        linha.appendChild(reabrir);

        return linha;
    }

    /**
     * Reabrir devolve o evento a "Meus Eventos" INATIVO.
     *
     * Quem decide o status e o `Controle.reabrirEvento`, que tambem pede a
     * senha -- e a mesma escrita de sempre, e nesta tela pode nem haver sessao
     * aberta. Aqui so cuidamos do que a pessoa ve: a lista se refaz sozinha, e
     * a falha vira texto no unico aviso que vive FORA dos blocos de estado.
     */
    function reabrir_(ev) {
        var aviso = $('erro-arranque');
        return Promise.resolve()
            .then(function () { return window.Controle.reabrirEvento(ev.id); })
            .then(function () {
                if (aviso) { aviso.classList.add('sumindo'); }
                return recarregar();
            })
            .catch(function (e) {
                // Desistir da senha nao e erro: a caixa ja se fechou sozinha, e
                // um aviso vermelho aqui acusaria o dono de um engano que ele
                // nao cometeu.
                if (e && e.message === 'cancelado') { return; }
                if (!aviso) { return; }
                aviso.textContent = 'Não consegui reabrir "' + ev.nome + '" agora. '
                    + 'Confira a internet e tente de novo em instantes.';
                aviso.classList.remove('sumindo');
            });
    }

    /**
     * Desenha a lista dos finalizados, dentro do menu geral.
     *
     * Sem nenhum, a lista some e entra uma FRASE no lugar. Antes de 17/08/2026
     * o bloco inteiro sumia, titulo junto -- fazia sentido na tela inicial, onde
     * um titulo sobre o vazio faria o dono procurar o que ele nunca finalizou.
     * Aqui dentro do menu a conta se inverte: quem tocou no olho procurando os
     * finalizados encontraria um painel em branco, sem uma palavra dizendo se
     * nao ha nenhum ou se a tela quebrou.
     */
    function desenharFinalizados(linhas) {
        var caixa = $('finalizados');
        if (!caixa) { return; }
        caixa.innerHTML = '';
        linhas.forEach(function (ev) { caixa.appendChild(linhaFinalizada(ev)); });
        var vazio = linhas.length === 0;
        var bloco = $('bloco-finalizados');
        if (bloco) { bloco.classList.toggle('sumindo', vazio); }
        var frase = $('sem-finalizados');
        if (frase) { frase.classList.toggle('sumindo', !vazio); }
    }

    /**
     * Junta as duas fontes e desenha.
     *
     * A do chaveiro e sincrona e nao falha; a da conta e rede e pode falhar. A
     * lista sai com o que houver -- prender a tela inteira na resposta do
     * servidor deixaria o porteiro sem lista por causa de um 4G ruim.
     */
    function carregar(sessao) {
        var doChaveiro = window.chaveiro.listar();
        desenhar(unir(doChaveiro, []));      // a tela ja aparece, sem esperar
        // Sem a conta nao ha finalizado nenhum a mostrar: quem sabe que um
        // evento acabou e o servidor.
        desenharFinalizados([]);

        // A casa abre na tela de entrar quando nao ha nada que sirva de casa:
        // sem aparelho no chaveiro e sem sessao. Com aparelho, a lista basta.
        if (window.conta) {
            var abertura = window.conta.decidirAbertura(sessao, doChaveiro.length > 0);
            if (abertura === 'entrar') { window.conta.mostrarEntrar(); }
            else { window.conta.esconderEntrar(); }

            // A senha provisoria barra tambem quem NAO acabou de entrar. Ela
            // era conferida so no caminho do login, e sessao no celular dura
            // dias: na segunda abertura o cliente ia direto para a lista com a
            // senha da grafica ainda valendo. Sem `return`: a lista nao espera
            // pela pergunta, e a pergunta nao espera a pessoa escolher a senha.
            if (sessao) { window.conta.conferirSenhaProvisoria(sessao); }
        }

        if (!sessao) { return Promise.resolve(); }
        return window.AcessoConta.pedir('/meus-eventos', {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        }).then(function (d) {
            var eventos = d.eventos || [];
            desenhar(unir(doChaveiro, eventos));
            desenharFinalizados(finalizados(eventos));
        }).catch(function () {
            // A lista do chaveiro ja esta na tela. Aqui so avisamos que o resto
            // nao veio -- silencio faria o dono achar que perdeu um evento.
            var aviso = $('erro-arranque');
            aviso.textContent = 'Não consegui buscar os seus outros eventos '
                + 'agora. Os que este aparelho já lê estão na lista.';
            aviso.classList.remove('sumindo');
        });
    }

    /**
     * O arranque da casa.
     *
     * `migrar()` primeiro, e sem rede: todo celular que ja e portao hoje tem a
     * chave antiga e nenhum chaveiro, e sem a conversao ele acorda com o evento
     * FORA da lista -- quem descobriria isso e o porteiro, no portao.
     *
     * A sessao vem depois, e so acrescenta. `Promise.resolve().then(...)`
     * porque `AcessoConta.sessao()` LANCA de forma sincrona quando o
     * `supabaseClient` e nulo (sem rede, ou o modo offline deliberado do
     * `supabase-config.js`) -- um throw solto aqui deixaria a lista do chaveiro
     * fora da tela, que e justamente a que nao pode faltar.
     */
    /**
     * O recado que a portaria deixa quando volta por falta de token.
     *
     * Ela sai de la com `location.replace`, e o `replace` nao deixa rastro: a
     * tela pisca e o dono esta de volta na lista sem uma palavra. Enquanto esse
     * desvio foi mudo, "o conserto nao funcionou" e "este aparelho nao e portao
     * deste evento" eram a mesma imagem na tela -- e foi o que consumiu o dia
     * 16/08/2026.
     *
     * A marca e consumida na leitura: ela explica UMA volta, e nao fica
     * pendurada acusando a proxima abertura do aplicativo.
     */
    function explicarVoltaDaPortaria() {
        var marca = null;
        try { marca = localStorage.getItem('ideal_portaria_sem_token'); }
        catch (e) { return; }
        if (!marca) { return; }
        try { localStorage.removeItem('ideal_portaria_sem_token'); }
        catch (e) { /* aba anônima */ }

        var aviso = $('erro-arranque');
        if (!aviso) { return; }
        aviso.textContent = 'Este aparelho ainda não lê nenhum evento, '
            + 'e por isso a leitura não abriu. Toque na barra do evento e entre '
            + 'com a sua senha para ligar este aparelho aqui.';
        aviso.classList.remove('sumindo');
    }

    function arrancar() {
        if (!$('eventos')) { return Promise.resolve(); }

        window.chaveiro.migrar();
        explicarVoltaDaPortaria();

        // A barra do topo e o `+` ao lado dela sao de quem os desenha: desde
        // 17/08/2026 os dois abrem "Meus Pedidos", e quem os liga e o
        // `meus-pedidos.js`. Ligá-los aqui TAMBEM poria dois ouvintes no mesmo
        // botao, e um toque valeria por dois.
        return recarregar();
    }

    /**
     * A lista inteira, de novo, com a sessao que houver.
     *
     * Separada do `arrancar()` porque quem refaz a lista depois de finalizar ou
     * de reabrir um evento nao pode reinstalar os ouvintes de clique junto: um
     * segundo ouvinte no mesmo botao faria um toque valer por dois.
     */
    function recarregar() {
        return Promise.resolve().then(function () {
            return window.AcessoConta.sessao();
        }).catch(function () {
            return null;            // sem conta: a lista do chaveiro basta
        }).then(function (s) {
            return carregar(s);
        });
    }

    window.listaEventos = {
        unir: unir, finalizados: finalizados,
        desenhar: desenhar, desenharFinalizados: desenharFinalizados,
        carregar: carregar, recarregar: recarregar, arrancar: arrancar,
        explicarVoltaDaPortaria: explicarVoltaDaPortaria
    };
    document.addEventListener('DOMContentLoaded', arrancar);
})();
