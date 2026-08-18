/**
 * "Meus Pedidos": os pedidos ja impressos do cliente, e o Carregar.
 *
 * O servidor decide o que e "apto" (impresso, legivel, nao cancelado, ainda
 * nao carregado); esta tela so desenha e manda para a caixa do Carregar.
 * Sem sessao, pede para entrar primeiro e volta para ca.
 *
 * ## O sexto estado de topo da casa
 *
 * `#meus-pedidos` entra ao lado de `#lista` + `#bloco-novo-evento`, do
 * `#menu-geral`, da `#engrenagem`, do `#bloco-entrar` e do `#trocar-senha` --
 * seis ao todo, e, como eles, nunca convive com os outros.
 *
 * Quem esconde e devolve a tela inicial e o `conta.js`, por
 * `conta.esconderTelaInicial()`. Este arquivo NAO guarda uma copia da lista de
 * blocos: essa copia foi o defeito original desta pagina -- dois donos sem
 * contrato entre si, cada um sabendo de metade dos blocos, e telas empilhadas
 * como resultado. Chamando a dona, `#menu-geral` e `#engrenagem` saem do
 * caminho junto, e o `NA_FRENTE` dela protege a volta.
 *
 * ## A engrenagem sai ANTES, e nao junto
 *
 * Esconder a `#engrenagem` nao bastaria. Ela e a unica tela desta pagina com
 * uma senha por tras: o `fecharEngrenagem()` e o unico lugar que apaga a
 * elevacao de 15 minutos e desfaz o login relampago. Sair dela pela barra sem
 * passar por ali deixaria o aparelho -- que fica com o porteiro -- com a conta
 * do dono aberta e a configuracao liberada.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };

    function numero(n) { return Number(n || 0).toLocaleString('pt-BR'); }
    function dataCurta(iso) {
        if (!iso) { return ''; }
        // "2026-08-12" sem hora e lido como meia-noite em UTC, e no Brasil isso
        // volta um dia a menos -- em silencio. O meio-dia local resolve sem
        // depender do fuso de quem esta olhando.
        var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
    }
    function texto(pai, tag, conteudo, classe) {
        var el = document.createElement(tag);
        el.textContent = conteudo;          // escrito por gente ou pelo ERP: TEXTO
        if (classe) { el.className = classe; }
        pai.appendChild(el);
        return el;
    }

    /**
     * O icone de lista da barra do topo.
     *
     * SVG embutido, e nao PNG, pelo mesmo motivo dos icones do
     * `lista-eventos.js`: esta tela precisa abrir sem rede, e cada arquivo de
     * imagem e mais uma requisicao que pode faltar. `aria-hidden` porque o
     * rotulo em texto esta ao lado, dentro do proprio botao -- anunciado duas
     * vezes, o leitor de tela leria "lista Meus Pedidos".
     */
    function iconeLista() {
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
        ['M8 6h13', 'M8 12h13', 'M8 18h13',
         'M3 6h.01', 'M3 12h.01', 'M3 18h.01'].forEach(function (d) {
            var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            el.appendChild(p);
        });
        return el;
    }

    function cartaoDePedido(p, sessao) {
        var c = document.createElement('div');
        c.className = 'cartao cartao-pedido';
        // A linha verde-agua a esquerda: este pedido tem pelo menos um setor JA
        // IMPRESSO, ou seja, carregar agora ja poe gente para dentro. Ela e
        // resumo, nunca a unica fonte -- a palavra continua no selo de cada
        // setor, para quem nao distingue as cores.
        if ((p.setores || []).some(function (s) { return !!s.impresso; })) {
            c.className += ' tem-impresso';
        }
        c.id = 'pedido-' + p.pedido;
        var topo = document.createElement('div');
        topo.className = 'pedido-topo';
        texto(topo, 'strong', 'Pedido ' + p.pedido);
        texto(topo, 'span', dataCurta(p.data), 'pedido-data');
        c.appendChild(topo);
        texto(c, 'div', p.nome_evento, 'pedido-nome');
        var setores = document.createElement('div');
        setores.className = 'pedido-setores';
        (p.setores || []).forEach(function (s) {
            var linha = document.createElement('div');
            linha.className = 'pedido-setor';
            texto(linha, 'span', s.nome + ' · ' + numero(s.quantidade));
            texto(linha, 'span', s.impresso ? 'impresso' : 'aguardando impressão',
                  'selo-impressao ' + (s.impresso ? 'sim' : 'nao'));
            setores.appendChild(linha);
        });
        c.appendChild(setores);
        var acoes = document.createElement('div');
        acoes.className = 'pedido-acoes';
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'carregar-' + p.pedido;
        b.textContent = 'Carregar';
        // "Carregar" sozinho se repete em cada cartao: sem o numero do pedido,
        // quem usa leitor de tela ouve a mesma palavra varias vezes sem saber
        // de qual pedido se trata.
        b.setAttribute('aria-label', 'Carregar o pedido ' + p.pedido);
        b.addEventListener('click', function () {
            if (!window.carregarPedido) { return; }
            window.carregarPedido.abrir(p.pedido, sessao, p);
        });
        acoes.appendChild(b);
        c.appendChild(acoes);
        return c;
    }

    function desenhar(resposta, sessao) {
        var caixa = $('pedidos');
        var vazio = $('sem-pedidos');
        caixa.innerHTML = '';
        var lista = (resposta && resposta.pedidos) || [];
        lista.forEach(function (p) { caixa.appendChild(cartaoDePedido(p, sessao)); });
        // O vazio precisa de frase, e sao DUAS frases diferentes: "ainda nao
        // imprimimos nada seu" e "esta conta nao esta ligada a cliente nenhum"
        // mandam o cliente fazer coisas diferentes.
        if (resposta && resposta.sem_cliente) {
            vazio.textContent = 'Sua conta ainda não está ligada a um cliente. Peça à gráfica para liberar o seu acesso.';
        } else {
            vazio.textContent = 'Nenhum pedido impresso para carregar. Assim que a gráfica imprimir um pedido seu, ele aparece aqui.';
        }
        vazio.classList.toggle('sumindo', lista.length > 0);
    }

    /** Entrar, e voltar para ca. Um `depois` so, consumido na primeira vez. */
    function pedirParaEntrar() {
        return window.conta.mostrarEntrar({ depois: function () { return abrir(); } });
    }

    /**
     * A frase de uma falha que NAO e sessao vencida.
     *
     * Sem status a rede e que faltou, e ai a frase tem de dizer o que fazer --
     * a tela nao pode ficar em "Buscando…" para sempre. Com status, o servidor
     * escreve em portugues quando tem o que dizer; quando nao tem, o
     * `acesso-conta.js` inventa um "Erro N" para nao devolver texto vazio, e
     * esse e o unico texto que nao pode chegar ao dono: ele nao informa nem
     * oferece saida. Comparar com o texto inventado e exato -- adivinhar "isto
     * parece uma frase?" jogaria fora mensagem legitima e curta do servidor.
     */
    function fraseDoErro(e) {
        if (!e || !e.status) {
            return 'Preciso de internet para buscar os seus pedidos. Confira a conexão e tente de novo.';
        }
        var inventada = 'Erro ' + e.status;
        if (e.message && e.message !== inventada && e.message.indexOf(' ') !== -1) {
            return e.message;
        }
        return 'Não consegui buscar os seus pedidos agora (código ' + e.status + ').';
    }

    /**
     * A engrenagem tem de FECHAR, e nao so sumir.
     *
     * O `fecharEngrenagem()` apaga a elevacao de 15 minutos e encerra a sessao
     * que nasceu ali dentro. Escondê-la por fora deixaria as duas de pe.
     */
    function fecharEngrenagemSeAberta() {
        return Promise.resolve().then(function () {
            var eng = $('engrenagem');
            if (!eng || eng.classList.contains('sumindo')) { return; }
            if (!window.Controle || !window.Controle.fecharEngrenagem) { return; }
            return window.Controle.fecharEngrenagem();
        });
    }

    function abrir() {
        // O `.catch` cobre os dois passos de proposito. `AcessoConta.sessao()`
        // LANCA de forma sincrona quando o `supabaseClient` e nulo -- sem rede
        // na primeira abertura, ou no modo offline deliberado do
        // `supabase-config.js` --, e um throw solto sairia do ouvinte do toque
        // como erro nao tratado: o dono tocaria na barra e nao aconteceria
        // absolutamente nada. Tratar as duas falhas como "sem sessao" leva a
        // tela de entrar, que e uma saida; e o `mostrarEntrar` esconde a
        // engrenagem de qualquer jeito, se o fechamento dela e que falhou.
        return fecharEngrenagemSeAberta().then(function () {
            return window.AcessoConta.sessao();
        }).catch(function () { return null; }).then(function (s) {
            if (!s) { return pedirParaEntrar(); }
            // A dona das telas primeiro, o nosso bloco depois: `#meus-pedidos`
            // esta na lista que ela esconde, entao a ordem inversa o apagaria
            // no mesmo gesto que o abriu.
            window.conta.esconderTelaInicial(true);
            $('meus-pedidos').classList.remove('sumindo');
            $('pedidos').innerHTML = '';
            var vazio = $('sem-pedidos');
            vazio.textContent = 'Buscando os seus pedidos…';
            vazio.classList.remove('sumindo');
            return window.AcessoConta.pedir('/meus-pedidos', {
                headers: { Authorization: 'Bearer ' + s.access_token }
            }).then(function (r) { desenhar(r, s); }).catch(function (e) {
                // SESSAO VENCIDA e a falha mais provavel daqui: sessao no
                // celular dura dias, e o cliente abre o aplicativo semanas
                // depois. "Erro 401" na tela nao diz nada e nao oferece saida
                // nenhuma -- entrar de novo E a saida, e o `depois` traz a
                // pessoa de volta para os pedidos sem ela tocar em mais nada.
                if (e && e.status === 401) { return pedirParaEntrar(); }
                vazio.textContent = fraseDoErro(e);
                vazio.classList.remove('sumindo');
            });
        });
    }

    function fechar() {
        // `sumindo` em si mesmo ANTES de pedir a tela inicial de volta: e o que
        // o contrato do `conta.js` exige de quem fecha um estado de topo --
        // senao o `NA_FRENTE` dela ve esta tela na frente e nao devolve nada.
        $('meus-pedidos').classList.add('sumindo');
        window.conta.esconderTelaInicial(false);
        return window.listaEventos.recarregar();
    }

    function ligar() {
        if (!$('meus-pedidos')) { return; }
        // O icone entra ANTES do rotulo, e por JS: o `controle.html` nao
        // carrega SVG solto em lugar nenhum, e as barras de evento ja desenham
        // os icones delas assim. O rotulo em texto continua no HTML -- o icone
        // nao substitui palavra nenhuma nesta tela.
        var barra = $('btn-meus-pedidos');
        if (barra && !barra.querySelector('.icone-lista')) {
            var caixa = document.createElement('span');
            caixa.className = 'icone-lista';
            caixa.appendChild(iconeLista());
            barra.insertBefore(caixa, barra.firstChild);
        }
        // As duas portas da MESMA acao: a barra e o rotulo em texto, o `+`
        // fecha a coluna da direita onde cada evento tem a sua engrenagem.
        ['btn-meus-pedidos', 'btn-meus-pedidos-mais'].forEach(function (id) {
            var b = $(id);
            if (b) { b.addEventListener('click', function () { abrir(); }); }
        });
        $('btn-voltar-pedidos').addEventListener('click', function () { fechar(); });
    }

    window.meusPedidos = { abrir: abrir, fechar: fechar, desenhar: desenhar };
    document.addEventListener('DOMContentLoaded', ligar);
})();
