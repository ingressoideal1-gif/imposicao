/**
 * Os portoes que ESTE aparelho ja sabe ler.
 *
 * E o chaveiro que acende as luzes verdes da tela inicial sem rede e sem conta
 * -- a situacao do celular do porteiro no dia do evento, que e a unica que
 * importa quando a fila esta andando.
 *
 * PURO de proposito: so `localStorage`, sem DOM e sem rede. As duas coisas que
 * nao podem errar aqui -- a migracao da instalacao antiga e "um portao por
 * aparelho" -- sao testaveis com dados de mesa, do jeito que o
 * `tests/test_chaveiro.py` faz.
 *
 * ## O que este arquivo NAO faz
 *
 * Ele nao guarda a carga do evento. A carga (credenciais, setores, fila de
 * leituras) continua no IndexedDB, de UM evento por vez, no
 * `portaria-deposito.js`. O chaveiro sabe de varios eventos; o aparelho tem um
 * carregado. Quem faz a troca e o `virar-portao.js`.
 *
 * ## Por que as chaves antigas continuam existindo
 *
 * A portaria le `ideal_portaria_token` desde o primeiro dia, e ha portao
 * trabalhando com essa chave agora, na grafica. O chaveiro e camada NOVA por
 * cima: `carregar()` aponta as chaves antigas para o portao escolhido, e o
 * `portaria.js` continua sem saber que o chaveiro existe.
 */
(function () {
    'use strict';

    var CHAVE = 'ideal_control_portoes';
    var CHAVE_TOKEN = 'ideal_portaria_token';
    var CHAVE_EVENTO = 'ideal_portaria_evento';
    // O nome DESTE celular, um so, fora da lista de portoes -- ver
    // `nomeDoAparelho`, mais abaixo.
    var CHAVE_NOME = 'ideal_control_nome_do_aparelho';

    /**
     * Ler do `localStorage` sem nunca lancar.
     *
     * Aba anonima do iOS lanca no `getItem`, e JSON corrompido lanca no
     * `parse`. Os dois, aqui, sao a PRIMEIRA coisa que a tela inicial chama:
     * uma excecao vira tela em branco, sem uma palavra do porque.
     */
    function listar() {
        var bruto = null;
        try { bruto = localStorage.getItem(CHAVE); } catch (e) { return []; }
        if (!bruto) { return []; }
        var lista;
        try { lista = JSON.parse(bruto); } catch (e) { return []; }
        return Object.prototype.toString.call(lista) === '[object Array]' ? lista : [];
    }

    function escrever(lista) {
        try { localStorage.setItem(CHAVE, JSON.stringify(lista)); }
        catch (e) { /* aba anonima ou cota estourada: vale so nesta sessao */ }
        return lista;
    }

    function procurar(evento_id) {
        var achados = listar().filter(function (p) {
            return p && p.evento_id === evento_id;
        });
        return achados.length ? achados[0] : null;
    }

    /**
     * Um portao por aparelho, e nao um por carregamento -- decisao do usuario.
     * Guardar o mesmo evento de novo SUBSTITUI: sem isto, abrir o evento duas
     * vezes no mesmo celular criaria dois portoes na lista do dono, com o mesmo
     * nome, e ele nao teria como saber qual desligar.
     */
    function guardar(entrada) {
        if (!entrada || !entrada.evento_id) { return listar(); }
        var lista = listar().filter(function (p) {
            return p && p.evento_id !== entrada.evento_id;
        });
        lista.push(entrada);
        return escrever(lista);
    }

    /**
     * O nome deste celular.
     *
     * Decisao do usuario em 18/08/2026: "o nome do aparelho e o mesmo para
     * todos os eventos, o nome 'Aparelho' e o nome do dispositivo". Antes cada
     * evento sugeria "Aparelho N" contando os portoes DAQUELE evento, e o mesmo
     * celular aparecia como "Aparelho 1" num evento e "Aparelho 3" no outro --
     * o dono nao tinha como saber que era o mesmo aparelho.
     *
     * Mora aqui, e nao na lista de portoes, porque nao pertence a evento
     * nenhum: e propriedade do aparelho, como o token e o chaveiro. O servidor
     * tambem guarda (a coluna `navegador_id` liga as linhas do mesmo celular),
     * e este e o lado que responde SEM REDE -- que e o que a pergunta "usar
     * este aparelho?" precisa para ja vir preenchida.
     */
    function nomeDoAparelho() {
        try { return localStorage.getItem(CHAVE_NOME) || ''; }
        catch (e) { return ''; }
    }

    function guardarNomeDoAparelho(nome) {
        var limpo = String(nome || '').trim().slice(0, 60);
        if (!limpo) { return ''; }
        try { localStorage.setItem(CHAVE_NOME, limpo); }
        catch (e) { /* aba anonima: vale so nesta sessao */ }
        return limpo;
    }

    function esquecer(evento_id) {
        return escrever(listar().filter(function (p) {
            return p && p.evento_id !== evento_id;
        }));
    }

    /**
     * O evento cuja carga esta neste aparelho agora.
     *
     * AS DUAS CHAVES, e nao so a do evento. `ideal_portaria_evento` sozinho nao
     * prova portao nenhum: a `portaria.js` escreve essa chave como simples
     * MEMORIA de qual evento se trata, em dois momentos em que nao ha token --
     * ao abrir `portaria.html?e=<evento>` antes de o aparelho virar portao, e
     * depois de o dono REVOGAR este aparelho (`aparelhoRevogado` apaga so o
     * token, de proposito, para nao perder a fila de leituras).
     *
     * Acreditar na chave sozinha custou tres relatos do dono em 16/08/2026: a
     * tela inicial via "este evento ja esta carregado", decidia `'ler'`, mandava
     * o aparelho para a `portaria.html` -- e la o arranque nao achava token e
     * voltava com `location.replace('controle.html')`. O toque na barra do
     * evento nao fazia NADA. Sem erro, sem palavra, e sem fim: a barra que ele
     * mais queria tocar era justamente a travada.
     */
    function carregado() {
        try {
            if (!localStorage.getItem(CHAVE_TOKEN)) { return ''; }
            return localStorage.getItem(CHAVE_EVENTO) || '';
        } catch (e) { return ''; }
    }

    /**
     * Aponta as chaves que a portaria le para o portao deste evento.
     *
     * NAO baixa carga e NAO limpa fila: quem cuida disso e o `virar-portao.js`,
     * que sabe recusar a troca com leitura pendente. Chamar isto sozinho, com
     * fila cheia, faria as leituras do evento anterior subirem contadas no
     * evento novo.
     */
    function carregar(evento_id) {
        var p = procurar(evento_id);
        if (!p) { return false; }
        try {
            localStorage.setItem(CHAVE_TOKEN, p.token);
            localStorage.setItem(CHAVE_EVENTO, p.evento_id);
        } catch (e) { return false; }
        return true;
    }

    /**
     * A instalacao antiga vira uma entrada do chaveiro.
     *
     * Todo celular que ja e portao hoje tem `ideal_portaria_token` e nenhum
     * chaveiro. Sem esta conversao, ele acorda com o evento APAGADO na lista --
     * e quem descobre isso e o porteiro, no portao, chamando o dono.
     *
     * Nao apaga as chaves antigas: a portaria continua lendo dali.
     *
     * @returns true se converteu alguma coisa agora.
     */
    function migrar() {
        if (listar().length) { return false; }   // ja migrado, ou ja tem portao
        var token = null, evento = null;
        try {
            token = localStorage.getItem(CHAVE_TOKEN);
            evento = localStorage.getItem(CHAVE_EVENTO);
        } catch (e) { return false; }
        // Token sem evento nao da portao: a lista mostraria uma barra sem nome
        // e sem destino. Melhor deixar o dono carregar o evento de novo.
        if (!token || !evento) { return false; }
        escrever([{
            evento_id: evento,
            // O nome verdadeiro chega no primeiro `/meus-eventos` com sessao,
            // ou na primeira carga. Ate la, alguma palavra e melhor que barra
            // vazia.
            nome_evento: 'Evento',
            aparelho_id: null,
            nome_portao: 'Este portão',
            token: token
        }]);
        return true;
    }

    window.chaveiro = {
        listar: listar, procurar: procurar, guardar: guardar,
        esquecer: esquecer, carregado: carregado, carregar: carregar,
        migrar: migrar,
        nomeDoAparelho: nomeDoAparelho, guardarNomeDoAparelho: guardarNomeDoAparelho
    };
})();
