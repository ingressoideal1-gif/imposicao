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
     * @returns [{ id, nome, ativo, ehPortao, nomePortao }]
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
                ehPortao: true,
                nomePortao: p.nome_portao || ''
            };
        });

        (daConta || []).forEach(function (ev) {
            if (!ev || !ev.id) { return; }
            var ja = porId[ev.id];
            porId[ev.id] = {
                id: ev.id,
                // O servidor vence a copia do chaveiro. Regra deste projeto: o
                // que o parceiro escreve no banco e a origem da verdade, e um
                // nome guardado aqui envelhece assim que o dono o troca la.
                nome: ev.nome_evento || (ja ? ja.nome : 'Evento'),
                ativo: ev.status !== 'encerrado',
                ehPortao: !!ja,
                nomePortao: ja ? ja.nomePortao : ''
            };
        });

        var linhas = Object.keys(porId).map(function (k) { return porId[k]; });
        // Os verdes primeiro: quem esta no portao procura o evento que ESTE
        // aparelho le, e nao os outros da conta.
        linhas.sort(function (a, b) {
            if (a.ehPortao !== b.ehPortao) { return a.ehPortao ? -1 : 1; }
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
        luz.className = 'luz' + (ev.ehPortao ? ' acesa' : '');
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

        barra.setAttribute('aria-label',
            ev.ehPortao
                ? ('Ler ingressos de ' + ev.nome)
                : ('Usar este aparelho no portão de ' + ev.nome));
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

        if (!sessao) { return Promise.resolve(); }
        return window.AcessoConta.pedir('/meus-eventos', {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        }).then(function (d) {
            desenhar(unir(doChaveiro, d.eventos || []));
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
     * APAGADO na lista -- quem descobriria isso e o porteiro, no portao.
     *
     * A sessao vem depois, e so acrescenta. `Promise.resolve().then(...)`
     * porque `AcessoConta.sessao()` LANCA de forma sincrona quando o
     * `supabaseClient` e nulo (sem rede, ou o modo offline deliberado do
     * `supabase-config.js`) -- um throw solto aqui deixaria a lista do chaveiro
     * fora da tela, que e justamente a que nao pode faltar.
     */
    function arrancar() {
        if (!$('eventos')) { return Promise.resolve(); }

        window.chaveiro.migrar();

        // O `+` e a barra "Novo Evento" fazem a MESMA coisa: abrem a camera do
        // `ler-qr.js`. Dois alvos para uma acao so porque a barra e o rotulo em
        // texto e o `+` fecha a coluna da direita, onde cada linha de evento tem
        // a sua engrenagem.
        var mais = $('btn-ler-qr-mais');
        if (mais) {
            mais.addEventListener('click', function () { window.lerQR.abrir(); });
        }

        return Promise.resolve().then(function () {
            return window.AcessoConta.sessao();
        }).catch(function () {
            return null;            // sem conta: a lista do chaveiro basta
        }).then(function (s) {
            return carregar(s);
        });
    }

    window.listaEventos = {
        unir: unir, desenhar: desenhar, carregar: carregar, arrancar: arrancar
    };
    document.addEventListener('DOMContentLoaded', arrancar);
})();
