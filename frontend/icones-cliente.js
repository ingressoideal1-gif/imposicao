// ══════════════════════════════════════════════════════════════════════════
//  Os ícones do link do cliente — desenhados, e não emoji
// ══════════════════════════════════════════════════════════════════════════
//
// Até 25/08/2026 esta página inteira usava emoji como ícone: 🎨 📦 🧾 💰 💳 nas
// abas, ✅ ❌ ⏳ nos botões e nos selos, 🧪 no título de cada modelo.
//
// ## Por que eles saíram
//
// Emoji não é desenho nosso: é uma FONTE do aparelho de quem abre. Quem abre
// este link é o cliente da gráfica, no celular dele, pelo navegador embutido do
// WhatsApp — e ali o 🎨 do Android tem outra forma, outra paleta e outro peso
// que o do iPhone, que por sua vez não é o do Windows. Três aparelhos, três
// interfaces diferentes para a mesma tela; nenhuma delas escolhida por nós.
//
// Pior no detalhe que ninguém antecipa: emoji é colorido por definição, então
// ele NÃO acompanha a cor do texto ao lado. A aba ativa fica azul e o ícone
// dela continua multicolorido; o selo âmbar fica âmbar e o ⏳ continua roxo.
// E emoji não tem peso de traço: ao lado de um rótulo de 0,66rem, ele aparece
// grande demais ou some, dependendo da fonte que o sistema escolheu.
//
// O traço de 1,8 px numa grade de 24 px resolve os três: é o mesmo desenho em
// todo aparelho, herda a cor do texto por `currentColor`, e escala sem borrar.
//
// ## Como usar
//
// `iconeCliente('arte')` devolve o SVG como TEXTO, para entrar no `innerHTML`
// que o resto da página já monta. Nada aqui toca no DOM sozinho.
//
//     iconeCliente('arte')                → 20 px, na cor do texto
//     iconeCliente('check', 14)           → 14 px
//     iconeCliente('alerta', 16, '#f97316')  → na cor pedida
//
// Nome desconhecido devolve string VAZIA, de propósito: um ícone que falta não
// pode virar um quadrado de "caractere ausente" na frente do cliente, e o
// rótulo em texto ao lado continua dizendo o que a coisa é.
//
// ## O rótulo em texto continua obrigatório
//
// Trocar emoji por SVG não muda a regra da casa: ícone sozinho não diz para
// onde leva. Toda aba, todo botão e todo selo desta página seguem com a palavra
// escrita ao lado do desenho.

/** O miolo de cada ícone: só os traços, dentro de uma grade de 24×24. */
const TRACOS_DOS_ICONES = {
    // ── As cinco abas ──────────────────────────────────────────────────────
    arte:      '<rect x="3" y="4" width="18" height="16" rx="2"></rect>'
             + '<circle cx="8.5" cy="9.5" r="1.5"></circle>'
             + '<path d="M21 15l-5-5L5 20"></path>',
    entrega:   '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"></path>'
             + '<path d="M3 8l9 5 9-5"></path><path d="M12 13v8"></path>',
    nota:      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path>'
             + '<path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h4"></path>',
    orcamento: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1z"></path>'
             + '<path d="M9 8h6"></path><path d="M9 12h6"></path>',
    pagar:     '<rect x="2" y="5" width="20" height="14" rx="2"></rect>'
             + '<path d="M2 10h20"></path><path d="M6 15h4"></path>',

    // ── Estado ─────────────────────────────────────────────────────────────
    check:     '<path d="M4 12.5l5 5L20 6.5"></path>',
    alerta:    '<path d="M12 3.5L2.5 20h19L12 3.5z"></path>'
             + '<path d="M12 10v4"></path><path d="M12 17.2v.1"></path>',
    relogio:   '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
    info:      '<circle cx="12" cy="12" r="9"></circle>'
             + '<path d="M12 11v5.5"></path><path d="M12 7.5v.1"></path>',

    // ── Ações ──────────────────────────────────────────────────────────────
    lapis:     '<path d="M16.5 3.5l4 4L8 20H4v-4z"></path>',
    lupa:      '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5L21 21"></path>'
             + '<path d="M10.5 8v5"></path><path d="M8 10.5h5"></path>',
    copiar:    '<rect x="9" y="9" width="12" height="12" rx="2"></rect>'
             + '<path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"></path>',
    chat:      '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"></path>',
    salvar:    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>'
             + '<path d="M8 21v-7h8v7"></path><path d="M8 3v4h6"></path>',

    // ── Navegação ──────────────────────────────────────────────────────────
    direita:   '<path d="M9 5l7 7-7 7"></path>',
    esquerda:  '<path d="M15 5l-7 7 7 7"></path>',
    fora:      '<path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path>'
             + '<path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
    fechar:    '<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>',
    arrastar:  '<path d="M12 3v18"></path><path d="M3 12h18"></path>'
             + '<path d="M6 9l-3 3 3 3"></path><path d="M18 9l3 3-3 3"></path>'
             + '<path d="M9 6l3-3 3 3"></path><path d="M9 18l3 3 3-3"></path>',

    // ── Coisas do pedido ───────────────────────────────────────────────────
    caminhao:  '<rect x="1.5" y="6.5" width="12" height="9" rx="1"></rect>'
             + '<path d="M13.5 9.5h4l3 3v3h-7z"></path>'
             + '<circle cx="6" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle>',
    pin:       '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"></path>'
             + '<circle cx="12" cy="10" r="2.5"></circle>',
    impressora:'<path d="M6 9V3h12v6"></path>'
             + '<rect x="3" y="9" width="18" height="8" rx="2"></rect>'
             + '<path d="M6 15h12v6H6z"></path>',
    duplex:    '<path d="M16 3h3a2 2 0 0 1 2 2v3"></path>'
             + '<path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>'
             + '<path d="M21 16v3a2 2 0 0 1-2 2h-3"></path>'
             + '<path d="M3 8V5a2 2 0 0 1 2-2h3"></path>',
    pagina:    '<rect x="4" y="3" width="16" height="18" rx="2"></rect>'
             + '<path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>'
};

/**
 * Um ícone do link do cliente, como texto SVG pronto para `innerHTML`.
 *
 * `cor` fica de fora na maioria das chamadas: sem ela o desenho sai em
 * `currentColor` e acompanha a cor do texto — é o que faz o ícone da aba ativa
 * ficar azul junto com o rótulo, e o do selo âmbar ficar âmbar. Passar cor só
 * quando o ícone precisa DESTOAR do texto ao redor.
 *
 * `aria-hidden` sempre: o rótulo em texto ao lado é que é lido em voz alta, e
 * um ícone anunciado junto faria o leitor de tela repetir a mesma palavra duas
 * vezes.
 */
function iconeCliente(nome, tamanho, cor) {
    const tracos = TRACOS_DOS_ICONES[nome];
    if (!tracos) return '';

    const px = tamanho || 20;
    // O traço afina quando o ícone cresce e engorda quando ele encolhe: a 13 px
    // um traço de 1,8 some, e a 24 px um de 2,4 fica pesado ao lado do texto.
    const peso = px <= 14 ? 2.2 : (px >= 22 ? 1.7 : 1.9);

    return '<svg class="icone-cliente" width="' + px + '" height="' + px + '" viewBox="0 0 24 24" '
         + 'fill="none" stroke="' + (cor || 'currentColor') + '" stroke-width="' + peso + '" '
         + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
         + tracos + '</svg>';
}

/**
 * O mesmo ícone, com o traço mais grosso — para o visto que aparece pequeno
 * dentro de um chip ou em cima de uma aba, onde 2,2 ainda lê fino.
 */
function iconeClienteForte(nome, tamanho, cor) {
    return iconeCliente(nome, tamanho, cor).replace(/stroke-width="[\d.]+"/, 'stroke-width="3"');
}

/**
 * Preenche todo `<span data-icone="nome">` da página com o desenho.
 *
 * É assim que as cinco abas ganham ícone sem o SVG estar escrito no
 * `cliente.html`: o HTML guarda só o NOME, e o desenho mora aqui, num lugar só.
 * Se este arquivo não carregar, as abas ficam sem ícone e COM o rótulo — que é
 * o que importa para o cliente achar o destino.
 */
function pintarIconesDaPagina(raiz) {
    const alvo = raiz || document;
    alvo.querySelectorAll('[data-icone]').forEach(el => {
        const svg = iconeCliente(el.dataset.icone, parseInt(el.dataset.iconeTamanho, 10) || undefined);
        if (svg) el.innerHTML = svg;
    });
}

window.iconeCliente = iconeCliente;
window.iconeClienteForte = iconeClienteForte;
window.pintarIconesDaPagina = pintarIconesDaPagina;
