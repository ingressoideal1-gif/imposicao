// ══════════════════════════════════════════════════════════════════════════
//  A logo da forma de envio — a mesma no painel e na página do cliente
// ══════════════════════════════════════════════════════════════════════════
//
// As imagens moram no bucket público `app-imagens` do Supabase e são as que o
// Painel de Produção já usa na coluna de frete da lista de pedidos. Em
// 20/08/2026 o usuário pediu as mesmas na aba de Entrega do Portal do Pedido.
//
// Elas ficam aqui, e não copiadas nos dois lugares, porque **é o mesmo desenho
// mostrando o mesmo fato**: um dia em que a Veppo trocar de logo, ou em que o
// parceiro escrever o nome de outro jeito, isso é uma linha a mudar, e não duas
// a caçar. É o mesmo motivo do `botaoDoVibeHtml`.
//
// ## O que o campo `frete_escolhido` traz de verdade
//
// Texto livre, escrito pelo ERP. As grafias que já apareceram: `SEDEX`,
// `MOTOBOY`, `RETIRADA`, `RETIRAR`, `Retirada Local`, `VEPPO`, `veppo`, `Veppo`,
// `VEPPO-RS`, `TRANSPORTADORA SÃO MIGUEL`, `SÃO MIGUEL`. Por isso a busca é em
// maiúsculas e, não achando exato, tenta por trecho — é assim que `VEPPO-RS` cai
// na logo da Veppo e `SAO MIGUEL` na da São Miguel.

const LOGO_DO_FRETE = {
    'SEDEX': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293785_Sedex.png',
    'TRANSPORTADORA SÃO MIGUEL': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293565_Sao-Miguel.png',
    'MOTOBOY': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293109_Motoboy.png',
    'RETIRADA LOCAL': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293377_Retira.png',
    'RETIRAR': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293377_Retira.png',
    'RETIRADA': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293377_Retira.png',
    // Uma chave só cobre as quatro grafias que o parceiro já escreveu neste
    // campo — VEPPO, veppo, Veppo e VEPPO-RS: a comparação é em maiúsculas, e o
    // "-RS" entra pela busca parcial.
    'VEPPO': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678294009_Veppo.png'
};

/**
 * O endereço da logo daquela forma de envio, ou `null`.
 *
 * `null` é resposta legítima: transportadora sem logo cadastrada tem de aparecer
 * pelo nome, e não como uma imagem quebrada.
 */
function logoDoFrete(nome) {
    const bruto = nome ? String(nome).trim() : '';
    if (!bruto) return null;

    const chave = bruto.toUpperCase();
    if (LOGO_DO_FRETE[chave]) return LOGO_DO_FRETE[chave];

    // Correspondência parcial, nos dois sentidos: "SAO MIGUEL" acha
    // "TRANSPORTADORA SÃO MIGUEL", e "VEPPO-RS" acha "VEPPO".
    const parcial = Object.keys(LOGO_DO_FRETE)
        .find(k => chave.indexOf(k) >= 0 || k.indexOf(chave) >= 0);
    return parcial ? LOGO_DO_FRETE[parcial] : null;
}

/**
 * A logo em HTML, com o nome em texto de reserva.
 *
 * O `onerror` não é enfeite: a imagem vem de um bucket na internet, e o cliente
 * pode estar num 4G ruim ou num aparelho que bloqueia imagens de outro domínio.
 * Quando ela não carrega, o nome escrito aparece no lugar — a coluna nunca fica
 * vazia sem ninguém saber por quê.
 */
function logoDoFreteHtml(nome, altura) {
    const alt = altura || 28;
    const url = logoDoFrete(nome);
    const rotulo = escapeHtml(String(nome || '').trim());

    if (!url) {
        return '<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text); '
             + 'border: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem;">' + rotulo + '</span>';
    }

    return '<img src="' + escapeHtml(url) + '" alt="' + rotulo + '" title="' + rotulo + '" '
         + 'style="height: ' + alt + 'px; max-width: 96px; object-fit: contain; display: block;" '
         + 'onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'\';">'
         + '<span style="display: none; font-size: 0.85rem; color: var(--text);">' + rotulo + '</span>';
}

window.LOGO_DO_FRETE = LOGO_DO_FRETE;
window.logoDoFrete = logoDoFrete;
window.logoDoFreteHtml = logoDoFreteHtml;
