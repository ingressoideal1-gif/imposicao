/**
 * A conta do cliente, compartilhada pelas duas telas dele.
 *
 * `evento.html` — onde o QR do Pedido cai — e `controle.html` — a tela do dono —
 * fazem o mesmo login, com as mesmas frases. Duas cópias divergem, e divergência
 * de login tranca o cliente para fora do evento dele.
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
    // lado do banco. Antes era `https://imposicao.onrender.com/api/acesso`, e
    // cada toque pagava DUAS travessias de internet (navegador -> Render ->
    // Supabase e volta) — mais uma terceira, escondida, porque o Render
    // perguntava ao Supabase quem estava falando a cada chamada. Quem sente é o
    // dono do evento no celular, no dia do evento.
    //
    // O Python continua no ar no endereço antigo durante a transição. Para
    // voltar atrás: troque estas duas linhas de volta e republique.
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
                    throw new Error('E-mail ou senha não conferem. Use a mesma conta do Vibe, '
                        + 'onde você acompanha os seus pedidos.');
                }
                if (!r.data.session) {
                    throw new Error('Não consegui abrir a sessão. Tente de novo em instantes.');
                }
                return r.data.session;
            });
    }

    /**
     * Recuperar age sobre a conta que JÁ existe. É a saída certa para quem
     * esqueceu a senha — criar outra conta "resolveria" o login e quebraria o
     * vínculo com o cadastro do cliente.
     */
    function esqueciSenha(email) {
        return supabaseClient.auth.resetPasswordForEmail((email || '').trim())
            .then(function () {
                // Sempre a mesma resposta, tenha o e-mail conta ou não: responder
                // diferente diria a um estranho quais e-mails têm cadastro.
                return 'Se este e-mail tiver conta, enviamos o link para trocar a senha.';
            });
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

    window.AcessoConta = {
        API: BASE,
        endereco: endereco,
        pedir: pedir,
        sessao: sessao,
        entrar: entrar,
        esqueciSenha: esqueciSenha,
        navegadorId: navegadorId
    };
})();
