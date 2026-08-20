// ══════════════════════════════════════════════════════════════════════════
//  O casco do Portal do Pedido — o selo do status e as cinco abas
// ══════════════════════════════════════════════════════════════════════════
//
// Até 20/08/2026 esta página era um funil: só abria em `Enviar Arte` ou
// `Aguard. Aprovação`, e em qualquer outro status mostrava uma frase e acabava.
// Medido no banco naquele dia: 36 dos 50 links estavam num status em que ela não
// mostrava nada. O link que o cliente guardou no WhatsApp deixava de servir no
// dia seguinte à aprovação — justamente quando ele quer saber do prazo, do
// endereço e de como pagar.
//
// Agora ela é o Portal do Pedido: cinco seções sempre abertas, e a aprovação de
// arte é uma delas.
//
// ## Por que a barra fica no rodapé
//
// Quem abre este link é o cliente, no celular, pelo navegador embutido do
// WhatsApp. No rodapé, os cinco destinos ficam ao alcance do polegar; no topo,
// ele precisaria trocar a mão de posição a cada troca de aba. No desktop a mesma
// barra vira uma coluna à esquerda — é a mesma marcação, decidida no CSS.

/** As cinco seções, na ordem em que aparecem na barra. */
const SECOES = ['arte', 'entrega', 'faturamento', 'orcamento', 'pagamento'];

/** Quem desenha cada seção, registrado por ela mesma. */
const desenhistasDeSecao = {};

/** Seções já desenhadas: cada uma monta uma vez só. */
const secoesProntas = {};

/** A seção aberta agora. */
let secaoAtual = null;

/**
 * Texto sem acento e em caixa alta, para comparar status.
 *
 * A coluna `status_arte` é texto livre e foi escrita por três telas ao longo de
 * um ano: no banco convivem `Aguard. Aprovação` e `AGUARDANDO_APROVACAO`,
 * `EM PRODUCAO` e `EM IMPRESSÃO`. Comparar letra a letra deixaria o cliente
 * numa tela em branco por causa de um cedilha.
 */
function semAcento(texto) {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

/**
 * O status do pedido traduzido para o selo do cabeçalho.
 *
 * Devolve `{chave, texto, cor}`. A `chave` é o que o resto da página usa para
 * decidir o que mostrar; o `texto` é o que o cliente lê.
 *
 * Status desconhecido cai em `preparando` de propósito: um status novo escrito
 * pelo ERP não pode virar tela vazia na frente do cliente.
 */
function seloDoStatus(statusArte) {
    const s = semAcento(statusArte);

    if (s.indexOf('ENVIAR ARTE') >= 0 || s.indexOf('AGUARD') >= 0) {
        return { chave: 'aprovar', texto: 'Aguardando sua aprovação', cor: '#f59e0b' };
    }
    if (s.indexOf('ALTERAC') >= 0 || s.indexOf('CORRECAO') >= 0 || s.indexOf('REPROVAD') >= 0) {
        return { chave: 'correcao', texto: 'Alteração solicitada', cor: '#f97316' };
    }
    if (s.indexOf('APROVAD') >= 0) {
        return { chave: 'aprovado', texto: 'Artes aprovadas', cor: '#22c55e' };
    }
    if (s.indexOf('PRODUCAO') >= 0 || s.indexOf('IMPRESSAO') >= 0) {
        return { chave: 'producao', texto: 'Pedido em produção', cor: '#38bdf8' };
    }
    return { chave: 'preparando', texto: 'Arte em preparação', cor: '#94a3b8' };
}

/**
 * A ordem dos testes acima importa e não é alfabética:
 *
 * - `ALTERAC`/`REPROVAD` vem antes de `APROVAD` porque `REPROVADO` contém
 *   `PROVAD`, e um teste de `APROVAD` colocado antes engoliria a reprovação —
 *   o cliente que pediu alteração veria "Artes aprovadas".
 * - `AGUARD` vem primeiro porque `Aguard. Aprovação` também contém `APROVA`.
 */

/** Se o nome pode virar seção. O hash da URL é escrito por qualquer um. */
function secaoValida(nome) {
    return typeof nome === 'string' && SECOES.indexOf(nome) >= 0;
}

/**
 * Uma seção diz quem a desenha. Ela é chamada na primeira vez que a aba abre —
 * e não na carga da página: montar cinco seções de uma vez atrasaria a que o
 * cliente veio ver.
 */
function registrarSecao(nome, desenhista) {
    desenhistasDeSecao[nome] = desenhista;
}

/**
 * Abre uma seção. Não recarrega a página nem refaz consulta: os dados das cinco
 * abas vieram de uma chamada só, e estão em `window.portalDados`.
 */
function abrirSecao(nome) {
    if (!secaoValida(nome)) nome = 'arte';
    secaoAtual = nome;

    SECOES.forEach(s => {
        const secao = document.getElementById('secao-' + s);
        if (secao) secao.hidden = (s !== nome);
        const botao = document.querySelector('.portal-aba[data-abre="' + s + '"]');
        if (botao) {
            botao.classList.toggle('ativa', s === nome);
            botao.setAttribute('aria-current', s === nome ? 'true' : 'false');
        }
    });

    if (!secoesProntas[nome] && typeof desenhistasDeSecao[nome] === 'function') {
        secoesProntas[nome] = true;
        try {
            desenhistasDeSecao[nome]();
        } catch (e) {
            // Uma seção que quebra não pode levar as outras quatro junto.
            secoesProntas[nome] = false;
            console.error('[portal] a seção ' + nome + ' não desenhou:', e);
            const secao = document.getElementById('secao-' + nome);
            if (secao) {
                secao.innerHTML = '<div class="portal-cartao portal-vazio">'
                    + 'Não conseguimos mostrar esta parte agora. Recarregue a página; '
                    + 'se continuar, fale com seu atendimento.</div>';
            }
        }
    }

    // `replaceState` e não `location.hash`: trocar o hash direto empilha uma
    // entrada no histórico por aba visitada, e o botão Voltar do celular
    // passaria a percorrer abas em vez de sair da página.
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + '#' + nome);
    }

    // A rolagem volta ao topo: a aba nova começa do começo.
    if (window.scrollTo) window.scrollTo(0, 0);
}

/** Marca uma seção para ser desenhada de novo na próxima abertura. */
function redesenharSecao(nome) {
    secoesProntas[nome] = false;
    if (secaoAtual === nome) abrirSecao(nome);
}

/** O selo do status no cabeçalho. */
function pintarSeloDoStatus(statusArte) {
    const el = document.getElementById('portal-selo');
    if (!el) return;
    const selo = seloDoStatus(statusArte);
    el.textContent = selo.texto;
    el.style.color = selo.cor;
    el.style.borderColor = selo.cor;
    el.dataset.chave = selo.chave;
}

/**
 * Liga a barra de abas e abre a seção certa.
 *
 * O hash existe para o cliente poder recarregar sem voltar ao começo — e para o
 * atendente poder mandar o link já na aba que interessa.
 */
function montarPortal(statusArte) {
    pintarSeloDoStatus(statusArte);

    document.querySelectorAll('.portal-aba').forEach(botao => {
        botao.addEventListener('click', () => abrirSecao(botao.dataset.abre));
    });

    const doHash = (window.location.hash || '').replace('#', '');
    abrirSecao(secaoValida(doHash) ? doHash : 'arte');

    const barra = document.getElementById('portal-abas');
    if (barra) barra.hidden = false;
}

window.SECOES = SECOES;
window.seloDoStatus = seloDoStatus;
window.secaoValida = secaoValida;
window.registrarSecao = registrarSecao;
window.abrirSecao = abrirSecao;
window.redesenharSecao = redesenharSecao;
window.montarPortal = montarPortal;
