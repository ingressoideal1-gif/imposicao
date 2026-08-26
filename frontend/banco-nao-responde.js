/**
 * QUANDO O BANCO PARA DE RESPONDER — o aviso que substitui a tela congelada.
 *
 * ## O dia que deu origem a este arquivo
 *
 * Em 26/08/2026, das 15:46 às 15:54, o banco do projeto Supabase do parceiro
 * ficou fora do ar. A internet da gráfica estava perfeita e o agente local
 * continuou de pé servindo o painel na porta 9000 — o que parou foi o serviço
 * de banco, do outro lado. O log do agente marcou os dois extremos:
 *
 *     15:46:35  Heartbeat OK                      <- último normal
 *     15:46:4x  Erro GET print_queue: timed out
 *     15:54:21  Heartbeat OK                      <- voltou sozinho
 *
 * Na tela do operador isso não apareceu como erro nenhum. Apareceu como uma
 * tela **parada**, sem mensagem e sem nada para tocar — nas palavras dele,
 * "aplicação travou". O motivo é simples e vale escrever: as dezenas de
 * chamadas ao banco espalhadas pelo painel não têm tempo limite. Uma promessa
 * que nunca se resolve não cai no `catch` de ninguém; ela só fica pendurada,
 * junto com a tela que a espera.
 *
 * ## O que este arquivo faz, e o que ele DE PROPÓSITO não faz
 *
 * **Faz:** conta o tempo de cada chamada ao banco e, passados 15 segundos sem
 * resposta, põe uma barra no alto da tela dizendo o que está acontecendo, com
 * um botão para recarregar. Quando o banco volta, a barra se anuncia e sai
 * sozinha. É a regra da casa de que toda trava precisa oferecer, na própria
 * tela, o que fazer para sair dela.
 *
 * **Não faz:** cancelar chamada nenhuma. Essa foi a decisão mais importante do
 * desenho, e ela é sobre gravação. Uma chamada abortada aos 15 segundos pode
 * já ter chegado ao banco e gravado; a tela diria "falhou", o operador faria de
 * novo, e a gráfica ficaria com o registro duplicado. O congelamento é um
 * problema; um pedido gravado duas vezes é outro, bem maior. Então a chamada
 * segue viva — o que muda é que a tela para de mentir que está trabalhando.
 *
 * ## Por que o embrulho fica aqui, num arquivo só
 *
 * São 71 pontos de chamada ao banco espalhados por `script.js`, `pedido.js`,
 * `acabamento.js`, `mapas.js` e companhia. Mexer em cada um seria 71 chances de
 * errar num caminho que a gráfica usa o dia inteiro. O `window.fetch` é o
 * funil por onde todos eles passam — inclusive os que o próprio SDK do Supabase
 * dispara por conta dele —, e é o único lugar onde a conta do tempo não tem
 * como ser esquecida.
 *
 * ## Quais chamadas entram na conta
 *
 * Só `/rest/v1/` e `/auth/v1/` do Supabase: as duas que falam com o banco e que,
 * quando ele está de pé, respondem em 60 a 200 ms. Ficam de fora, e cada uma
 * por um motivo:
 *
 *   - **o agente local** (`/api/...`), porque impor e gerar PDF leva minutos por
 *     natureza, e demora ali não é sintoma de nada;
 *   - **o Storage**, porque subir fonte, foto ou PDF grande passa dos 15 s numa
 *     internet ruim sem que exista problema algum;
 *   - **as Edge Functions**, que no dia da queda continuaram respondendo em
 *     110 ms — elas não dependem do banco para atender.
 *
 * ## O que os testes cobrem
 *
 * `tests/banco_nao_responde_harness.js` executa este arquivo dentro de um DOM
 * de mentira e mede o que ele desenha. O que vale lembrar: a barra só aparece
 * DEPOIS do limite (uma chamada de 200 ms não pode piscar nada na tela), some
 * quando o banco volta, e o `fetch` embrulhado devolve a mesma resposta e o
 * mesmo erro que devolveria sem ele.
 */
(function () {
    'use strict';

    // ─── Os três tempos ─────────────────────────────────────────────────────
    //
    // 15 s é folga de 75 a 250 vezes sobre o normal medido (60 a 200 ms), e
    // ainda sobra margem para a consulta pesada do painel numa internet ruim.
    // Errar para baixo aqui custaria caro: barra vermelha piscando enquanto o
    // banco está bem é o tipo de aviso que o operador aprende a ignorar, e aí
    // ele não serve para o dia em que o banco cair de verdade.
    const LIMITE_MS = 15000;   // sem resposta por mais que isto → avisa
    const PASSO_MS = 1000;    // de quanto em quanto tempo o relógio confere
    const ALIVIO_MS = 5000;   // quanto tempo o "voltou" fica na tela

    const Z = 10000000;        // acima de qualquer modal do painel

    // ─── Quem é chamada ao banco ────────────────────────────────────────────

    function eOBanco(url) {
        const u = String(url || '');
        if (u.indexOf('supabase.co') === -1) return false;
        return u.indexOf('/rest/v1/') !== -1 || u.indexOf('/auth/v1/') !== -1;
    }

    // ─── O que está pendurado agora ─────────────────────────────────────────

    const pendentes = new Map();   // marca → instante em que começou
    let proximaMarca = 1;
    let relogio = null;

    // 'oculto' → nada na tela; 'travado' → a barra do banco fora;
    // 'voltou'  → o alívio, que sai sozinho.
    let estado = 'oculto';
    let saidaDoAlivio = null;

    // O relógio sai por uma variável para o arnês poder adiantá-lo. Um teste
    // que precisasse esperar 15 segundos de verdade a cada caso não seria
    // rodado por ninguém — e teste que não se roda não protege nada.
    let lerORelogio = function () { return Date.now(); };
    function agora() { return lerORelogio(); }

    function registrar() {
        const marca = proximaMarca++;
        pendentes.set(marca, agora());
        ligarRelogio();
        return marca;
    }

    function concluir(marca, deuCerto) {
        if (!pendentes.delete(marca)) return;
        // Só resposta BOA prova que o banco voltou. Uma chamada que falhou
        // depressa (rede caída, 500) não desmente a barra — ela confirma.
        if (deuCerto && estado === 'travado') mostrarAlivio();
        if (!pendentes.size && estado === 'oculto') desligarRelogio();
    }

    function ligarRelogio() {
        if (relogio || typeof setInterval !== 'function') return;
        relogio = setInterval(olhar, PASSO_MS);
    }

    function desligarRelogio() {
        if (!relogio) return;
        clearInterval(relogio);
        relogio = null;
    }

    /**
     * A batida do relógio: existe alguma chamada pendurada além do limite?
     *
     * Basta UMA. Não interessa qual tela a disparou — se uma consulta ao banco
     * passou de 15 segundos sem resposta, o banco está fora para todas elas.
     *
     * Repare no que NÃO está aqui: a barra não some quando a chamada presa
     * finalmente FALHA. Falhar depois de 20 segundos é o navegador desistindo,
     * não o banco voltando — e nesse instante a tela deixa de estar congelada
     * mas continua sem os dados. Quem apaga a barra é uma resposta boa, ou o
     * botão de recarregar que ela mesma oferece.
     */
    function olhar() {
        if (estado === 'voltou') return;
        const limite = agora() - LIMITE_MS;
        let presa = false;
        pendentes.forEach(function (comeco) { if (comeco <= limite) presa = true; });
        if (presa) mostrarTravado();
    }

    // ─── A barra ────────────────────────────────────────────────────────────

    function estilo() {
        if (typeof document === 'undefined' || !document.createElement) return;
        if (document.getElementById('banco-fora-css')) return;
        const st = document.createElement('style');
        st.id = 'banco-fora-css';
        st.textContent = `
#banco-fora{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:${Z};
  max-width:min(640px,calc(100vw - 24px));box-sizing:border-box;
  display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  padding:12px 16px;border-radius:12px;font-family:inherit;
  background:rgba(120,53,15,0.97);border:1px solid rgba(245,158,11,0.75);
  color:#fef3c7;box-shadow:0 10px 30px rgba(0,0,0,0.45);}
#banco-fora.voltou{background:rgba(6,78,59,0.97);border-color:rgba(34,197,94,0.75);
  color:#d1fae5;}
#banco-fora .bf-txt{flex:1;min-width:200px;line-height:1.35;}
#banco-fora .bf-tit{display:block;font-weight:800;font-size:0.95rem;
  letter-spacing:0.01em;}
#banco-fora .bf-sub{display:block;font-size:0.82rem;opacity:0.9;margin-top:3px;}
#banco-fora .bf-b{background:rgba(245,158,11,0.22);border:1px solid rgba(245,158,11,0.7);
  color:#fef3c7;border-radius:8px;padding:8px 14px;font-size:0.85rem;font-weight:700;
  cursor:pointer;white-space:nowrap;font-family:inherit;}
#banco-fora .bf-b:hover{background:rgba(245,158,11,0.38);}
#banco-fora.voltou .bf-b{background:rgba(34,197,94,0.22);border-color:rgba(34,197,94,0.7);
  color:#d1fae5;}
#banco-fora.voltou .bf-b:hover{background:rgba(34,197,94,0.38);}
/* No celular — o link do cliente — a barra ocupa a largura toda e o botão
   desce para a linha de baixo, inteiro, em vez de espremer o texto. */
@media (max-width:520px){
  #banco-fora{left:12px;right:12px;transform:none;max-width:none;}
  #banco-fora .bf-b{width:100%;}
}`;
        (document.head || document.body).appendChild(st);
    }

    function caixa() {
        if (typeof document === 'undefined' || !document.createElement) return null;
        let el = document.getElementById('banco-fora');
        if (el) return el;
        estilo();
        el = document.createElement('div');
        el.id = 'banco-fora';
        // `status` e não `alert`: o leitor de tela anuncia sem interromper o
        // que a pessoa está fazendo.
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        (document.body || document.documentElement).appendChild(el);
        return el;
    }

    function pintar(titulo, recado, rotuloDoBotao) {
        const el = caixa();
        if (!el) return;
        el.innerHTML = '';
        const txt = document.createElement('div');
        txt.className = 'bf-txt';
        const t = document.createElement('span');
        t.className = 'bf-tit';
        t.textContent = titulo;
        const s = document.createElement('span');
        s.className = 'bf-sub';
        s.textContent = recado;
        txt.appendChild(t);
        txt.appendChild(s);
        const b = document.createElement('button');
        b.className = 'bf-b';
        b.id = 'bf-recarregar';
        b.type = 'button';
        b.textContent = rotuloDoBotao;
        b.addEventListener('click', recarregar);
        el.appendChild(txt);
        el.appendChild(b);
    }

    function recarregar() {
        try { window.location.reload(); } catch (_) { /* sem janela: teste */ }
    }

    function mostrarTravado() {
        if (estado === 'travado') return;
        estado = 'travado';
        if (saidaDoAlivio) { clearTimeout(saidaDoAlivio); saidaDoAlivio = null; }
        pintar(
            'O banco de dados não está respondendo.',
            'A internet daqui está funcionando — quem parou foi o servidor do '
            + 'banco. As telas que dependem dele ficam paradas até ele voltar. '
            + 'Nada do que você já mandou se perdeu.',
            'Tentar de novo'
        );
        const el = caixa();
        if (el && el.classList) el.classList.remove('voltou');
    }

    /**
     * O alívio: o banco voltou, e a tela diz isso sem ninguém perguntar.
     *
     * Ele existe porque a barra anterior mandava recarregar, e quem recarrega
     * precisa saber QUANDO adianta. Sem este aviso o operador ficaria clicando
     * no botão às cegas — ou, pior, desistiria da tela que já tinha voltado a
     * funcionar.
     */
    function mostrarAlivio() {
        estado = 'voltou';
        pintar(
            'O banco voltou a responder.',
            'Se alguma tela ficou pela metade enquanto ele esteve fora, '
            + 'recarregue para vê-la completa.',
            'Recarregar'
        );
        const el = caixa();
        if (el && el.classList) el.classList.add('voltou');
        if (saidaDoAlivio) clearTimeout(saidaDoAlivio);
        if (typeof setTimeout === 'function') {
            saidaDoAlivio = setTimeout(esconder, ALIVIO_MS);
        }
    }

    function esconder() {
        estado = 'oculto';
        if (saidaDoAlivio) { clearTimeout(saidaDoAlivio); saidaDoAlivio = null; }
        const el = (typeof document !== 'undefined' && document.getElementById)
            ? document.getElementById('banco-fora') : null;
        if (el && el.parentNode && el.parentNode.removeChild) {
            el.parentNode.removeChild(el);
        }
        if (!pendentes.size) desligarRelogio();
    }

    // ─── O embrulho do `fetch` ──────────────────────────────────────────────
    //
    // Embrulha o que já estiver instalado, e não o `fetch` de fábrica: o
    // `supabase-config.js` põe o dele por cima para carimbar a sessão nas
    // chamadas ao nosso motor, e os dois têm de conviver. Por isso este arquivo
    // carrega ANTES dele — quem chega depois embrulha quem chegou antes, e
    // nenhuma das duas contas se perde.
    (function () {
        if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
        const anterior = window.fetch.bind(window);
        window.fetch = function (entrada, opcoes) {
            const url = (typeof entrada === 'string')
                ? entrada
                : (entrada && entrada.url) ? entrada.url : '';
            if (!eOBanco(url)) return anterior(entrada, opcoes);
            const marca = registrar();
            return anterior(entrada, opcoes).then(
                function (r) {
                    // Resposta do gateway não é resposta do banco: no dia da
                    // queda o `401` sem chave voltava em 31 ms enquanto as
                    // consultas de verdade estouravam. Só o que o PostgREST
                    // atendeu conta como "o banco está de pé".
                    concluir(marca, !r || r.status < 500);
                    return r;
                },
                function (e) { concluir(marca, false); throw e; }
            );
        };
    })();

    // O que os testes enxergam. Mexer nisto pela tela não faz sentido nenhum —
    // é a superfície do arnês, e `limite()` existe para ele não ter de esperar
    // 15 segundos de verdade a cada caso.
    window.bancoNaoResponde = {
        eOBanco: eOBanco,
        estado: function () { return estado; },
        pendentes: function () { return pendentes.size; },
        olhar: olhar,
        esconder: esconder,
        LIMITE_MS: LIMITE_MS,
        ALIVIO_MS: ALIVIO_MS,
        _usarRelogio: function (fn) { lerORelogio = fn || function () { return Date.now(); }; },
    };
})();
