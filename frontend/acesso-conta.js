/**
 * A conta do cliente, compartilhada pela tela dele.
 *
 * `controle.html` — a casa do aplicativo — usa este login. Ate 17/08/2026 o
 * `evento.html` tambem o usava, com as mesmas frases; a tela saiu junto com o
 * QR do Pedido, e o compartilhamento — que existia para duas copias nao
 * divergirem — ficou como garantia contra uma terceira tela que volte a
 * duplicar o login.
 *
 * A conta é a MESMA que o cliente já tem no ERP Vibe: os dois sistemas apontam
 * para o mesmo projeto Supabase, logo o mesmo `auth.users`. Por isso não existe
 * criar conta aqui. Uma conta criada nesta tela funcionaria — e seria o pior
 * caso, porque o login passaria e só muito depois alguém descobriria que o
 * evento ficou pendurado numa identidade sem nenhuma relação com o cadastro do
 * cliente na gráfica.
 *
 * Nada aqui fala com o banco direto. O que este módulo usa do Supabase é só o
 * login; toda leitura e escrita de tabela passa pelo backend, que tem a chave.
 */
(function () {
    'use strict';

    // 16/08/2026: as telas do cliente passaram a falar com Edge Functions, ao
    // lado do banco. Antes era o `/api/acesso` de um servidor Python que ficava
    // na nuvem, e cada toque pagava DUAS travessias de internet (navegador ->
    // servidor -> Supabase e volta) — mais uma terceira, escondida, porque
    // aquele servidor perguntava ao Supabase quem estava falando a cada
    // chamada. Quem sente é o dono do evento no celular, no dia do evento.
    //
    // Aquele servidor saiu do ar em 17/08/2026: não há mais para onde voltar
    // atrás, e não deve haver. O endereço abaixo é o único.
    var BASE = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/acesso-conta';

    // `/evento` mora numa função SEPARADA, e isso não é organização: é a única
    // rota sem login — o cliente a abre lendo o QR com a câmera, antes de ter
    // conta —, e a verificação de JWT do Supabase é por FUNÇÃO, não por rota.
    // Se as duas morassem juntas, desligar a verificação por causa desta
    // desligaria para todas, e um estranho montaria um token com o `sub` do
    // dono para configurar o evento dele.
    var BASE_EVENTO = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/acesso-evento';

    function endereco(caminho) {
        return /^\/evento(\?|$)/.test(caminho)
            ? BASE_EVENTO + caminho.slice('/evento'.length)
            : BASE + caminho;
    }

    /**
     * Uma chamada ao backend. Erro vira `Error` com `.status` e `.corpo`, para
     * quem chama poder distinguir "sessão caiu" de "elevação venceu".
     */
    function pedir(caminho, opcoes) {
        return fetch(endereco(caminho), opcoes).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (corpo) {
                if (!r.ok) {
                    var detalhe = corpo.detail;
                    var texto = (detalhe && detalhe.mensagem) || detalhe || ('Erro ' + r.status);
                    var erro = new Error(typeof texto === 'string' ? texto : 'Erro ' + r.status);
                    erro.status = r.status;
                    erro.corpo = detalhe;
                    throw erro;
                }
                return corpo;
            });
        });
    }

    function sessao() {
        return supabaseClient.auth.getSession().then(function (r) {
            return (r.data && r.data.session) || null;
        });
    }

    function entrar(email, senha) {
        return supabaseClient.auth
            .signInWithPassword({ email: (email || '').trim(), password: senha || '' })
            .then(function (r) {
                if (r.error) {
                    // A mensagem do Supabase vem em inglês e fala de "credentials".
                    // Quem lê é o cliente, no celular, e o que ele precisa saber é
                    // QUAL conta tentar.
                    throw new Error('E-mail ou senha não conferem. Use o acesso que a '
                        + 'gráfica liberou para você.');
                }
                if (!r.data.session) {
                    throw new Error('Não consegui abrir a sessão. Tente de novo em instantes.');
                }
                return r.data.session;
            });
    }

    /**
     * Entra e eleva com a MESMA senha digitada.
     *
     * São duas chamadas ao servidor, e continuam sendo: o login é do Supabase,
     * e a elevação é nossa — assinada, com prazo, e presa a este navegador. O
     * que a decisão do usuário proíbe é a PESSOA digitar duas vezes, e no
     * portão, com ele de pé na frente do aparelho, isso pesa.
     *
     * A senha não é guardada em lugar nenhum: ela vive no argumento desta
     * função e morre com ela.
     *
     * A elevação vem DEPOIS do login de propósito. O contrário não existe: o
     * endpoint de elevar exige a sessão para saber de quem é a senha que está
     * conferindo.
     */
    function entrarEElevar(email, senha, eventoId) {
        return entrar(email, senha).then(function (sessao) {
            return _pedir('/eventos/' + eventoId + '/elevar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + sessao.access_token
                },
                body: JSON.stringify({ senha: senha, navegador: navegadorId() })
            }).then(function (elevacao) {
                return { sessao: sessao, elevacao: elevacao };
            });
        });
    }

    /**
     * Recuperar age sobre a conta que JÁ existe — criar outra "resolveria" o
     * login e quebraria o vínculo com o cadastro do cliente.
     *
     * Quem recupera é a GRÁFICA, e não um e-mail automático. O projeto não tem
     * SMTP configurado: o link do Supabase simplesmente não chegava, e a frase
     * antiga ("enviamos o link") mandava o cliente esperar por uma mensagem que
     * nunca sairia — pior que não oferecer saída nenhuma.
     */
    // Sem SMTP no projeto, e-mail nao chega. Quem recupera e a grafica, com
    // uma senha provisoria nova -- a anterior deixa de valer no mesmo ato.
    function esqueciSenha() {
        return Promise.resolve('Peça à gráfica uma nova senha provisória. Ela deixa '
            + 'a anterior sem valor, e você escolhe a sua no primeiro acesso.');
    }

    // Memorizado aqui, e não só no `localStorage`: quando o `setItem` falha
    // (aba anônima do iOS, quota estourada), cada chamada sem isto sortearia
    // um UUID NOVO — `elevar()` assinaria com o id A e o `gravar()` seguinte
    // mandaria o id B, a assinatura nunca bateria, e o dono digitaria a senha
    // certa duas vezes só para ver "digite a senha do dono" de novo. Uma
    // variável de módulo garante que, dentro da vida desta página, o id é
    // sempre o mesmo — vindo do `localStorage` quando ele funciona, ou só da
    // memória quando não funciona.
    var _idMemorizado = null;

    /**
     * O identificador desta instalação do navegador.
     *
     * A elevação de 15 minutos é assinada junto com ele, para que o bilhete não
     * viaje de um aparelho para outro. NÃO confundir com o aparelho de portaria
     * cadastrado no banco: aquele tem nome, código e lista de setores; este é só
     * "este navegador, nesta instalação".
     *
     * Sem ponto, nunca: o corpo assinado da elevação é montado com pontos, e um
     * ponto aqui deslocaria os campos.
     */
    function navegadorId() {
        if (_idMemorizado) { return _idMemorizado; }

        var CHAVE = 'acesso_navegador_id';
        var id = null;
        try { id = localStorage.getItem(CHAVE); } catch (e) { id = null; }
        if (!id) {
            id = (crypto.randomUUID
                ? crypto.randomUUID()
                : Array.from(crypto.getRandomValues(new Uint8Array(16)))
                    .map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''));
            try { localStorage.setItem(CHAVE, id); } catch (e) { /* aba anônima: guarda so na memoria desta pagina */ }
        }
        _idMemorizado = id;
        return id;
    }

    // ── A conta de quem já entrou ───────────────────────────────────────────
    //
    // As três coisas que o cliente faz com a própria conta depois do login: ver
    // de quem ela é (`/minha-conta` devolve os clientes do ERP ligados a ela, e
    // se a senha ainda é a provisória que a gráfica passou), trocar a senha, e
    // sair. Ficam aqui, e não no `conta.js`, porque este é o arquivo que
    // conhece o endereço do backend e o formato do erro.

    function comSessao(sessao) {
        return { Authorization: 'Bearer ' + sessao.access_token,
                 'Content-Type': 'application/json' };
    }

    // `window.AcessoConta.pedir`, e não o `pedir` daqui de dentro: é a mesma
    // função, mas pela referência EXPORTADA — que é o único ponto por onde o
    // teste de navegador desvia o backend (o `controle.js` já faz isto no
    // `_pedir` dele, pelo mesmo motivo). Chamando a de dentro, um desvio de
    // teste não pegaria estas duas rotas e elas iriam à rede de verdade.
    function _pedir(caminho, opcoes) {
        return window.AcessoConta.pedir(caminho, opcoes);
    }

    function minhaConta(sessao) {
        return _pedir('/minha-conta', { headers: comSessao(sessao) });
    }
    function trocarSenha(sessao, atual, nova) {
        return _pedir('/minha-conta/senha', {
            method: 'POST', headers: comSessao(sessao),
            body: JSON.stringify({ senha_atual: atual || '', senha_nova: nova || '' })
        });
    }
    function sair() {
        return Promise.resolve().then(function () {
            return supabaseClient.auth.signOut();
        }).catch(function () { /* sem rede: a sessao local ja foi apagada */ });
    }

    window.AcessoConta = {
        API: BASE,
        endereco: endereco,
        pedir: pedir,
        sessao: sessao,
        entrar: entrar,
        entrarEElevar: entrarEElevar,
        esqueciSenha: esqueciSenha,
        minhaConta: minhaConta,
        trocarSenha: trocarSenha,
        sair: sair,
        navegadorId: navegadorId
    };
})();
