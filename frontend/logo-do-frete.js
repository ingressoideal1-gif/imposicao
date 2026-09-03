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
// Texto livre, escrito pelo ERP por gente diferente ao longo de anos. Medido no
// banco em 03/09/2026, só para as transportadoras que têm logo: `SEDEX` (588),
// `sedex`, `Sedex`, `RETIRADA` (105), `RETIRA`, `Retira`, `Retirada Local`,
// `Motoboy` (53), `MOTOBOY`, `VEPPO` (21), `veppo`, `Veppo`, `VEPPO-RS`,
// `Transportadora São Miguel` (17), `SÃO MIGUEL` (12), `EXPRESSO SAO MIGUEL S/A`
// (3), `EXPRESSO SÃO MIGUEL`, `Expresso São Miguel`, `BRASPRESS` (3),
// `Braspress`.
//
// Daí as três regras da busca, nesta ordem: caixa alta, sem acento, e — não
// achando exato — por trecho, nos dois sentidos. É assim que `VEPPO-RS` cai na
// Veppo e que as SEIS grafias da São Miguel caem na mesma logo.
//
// ## Por que sem acento, e não só em maiúsculas
//
// Até 03/09/2026 a chave era `TRANSPORTADORA SÃO MIGUEL`, escrita com til, e a
// comparação era letra a letra. `EXPRESSO SAO MIGUEL S/A` — que é como o ERP
// escreve em cinco pedidos, sem o til — não continha aquela chave nem estava
// contido nela, e saía sem logo nenhuma, aparecendo pelo nome. O comentário
// desta seção chegou a AFIRMAR que `SAO MIGUEL` achava a logo; não achava, e
// ninguém tinha como notar porque a tela não quebra: ela mostra o nome.
//
// Por isso a chave agora é `SAO MIGUEL`, sem acento e sem a palavra
// `TRANSPORTADORA`, e os dois lados da comparação passam pelo `normalizarFrete`.

const LOGO_DO_FRETE = {
    'SEDEX': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293785_Sedex.png',
    // O endereço anterior desta logo (`1785678293565_Sao-Miguel.png`) respondia
    // 400 em 03/09/2026: o arquivo tinha saído do bucket, e a coluna do painel
    // vinha mostrando o texto de reserva no lugar da imagem. A URL abaixo foi
    // mandada pelo usuário nesse dia, junto com a da Braspress.
    'SAO MIGUEL': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1788452516270_Sao-Miguel.png',
    'BRASPRESS': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1788452527708_Braspress.png',
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
 * Caixa alta e sem acento — a forma em que as chaves acima estão escritas.
 *
 * O `São` do português é o motivo desta função existir: o mesmo transportador
 * aparece no banco como `São Miguel` e como `SAO MIGUEL`, e comparar letra a
 * letra deixa a segunda grafia sem logo. Ver o cabeçalho do arquivo.
 */
function normalizarFrete(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

/**
 * O endereço da logo daquela forma de envio, ou `null`.
 *
 * `null` é resposta legítima: transportadora sem logo cadastrada tem de aparecer
 * pelo nome, e não como uma imagem quebrada.
 */
function logoDoFrete(nome) {
    const chave = normalizarFrete(nome);
    if (!chave) return null;

    if (LOGO_DO_FRETE[chave]) return LOGO_DO_FRETE[chave];

    // Correspondência parcial, nos dois sentidos: "EXPRESSO SAO MIGUEL S/A"
    // CONTÉM a chave "SAO MIGUEL", e "RETIRA" ESTÁ CONTIDA na "RETIRADA".
    //
    // A chave mais longa vence. Sem essa ordem, quem decidia era a ordem de
    // escrita do objeto: "RETIRADA LOCAL" casaria com "RETIRADA" ou com
    // "RETIRADA LOCAL" conforme qual aparecesse primeiro. Hoje as duas apontam
    // para o mesmo arquivo e o empate não se vê — no dia em que apontarem para
    // arquivos diferentes, veria-se na tela do operador.
    const parcial = Object.keys(LOGO_DO_FRETE)
        .filter(k => chave.indexOf(k) >= 0 || k.indexOf(chave) >= 0)
        .sort((a, b) => b.length - a.length)[0];
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

/**
 * O rastreio nos Correios, ou `null` — que é o que impede um botão morto de
 * nascer na tela para os pedidos que ainda não postaram.
 *
 * Mora aqui, e não no `cliente-dados.js` onde nasceu, porque desde 25/08/2026
 * DUAS telas mostram o código: a aba de Entrega do link do cliente e a coluna
 * Frete do Painel do Acabamento. Este é o módulo que as duas já carregam, e é o
 * lugar temático — é aqui que mora tudo o que sabe de transportadora.
 */
function linkDeRastreio(codigo) {
    const limpo = codigo ? String(codigo).trim().toUpperCase() : '';
    if (!limpo) return null;
    return 'https://rastreamento.correios.com.br/app/index.php?objeto=' + encodeURIComponent(limpo);
}

/**
 * O código de rastreio como LINK, ou string vazia quando ainda não há código.
 *
 * Pedido do usuário em 25/08/2026: *"quando já existir o link do número de
 * conhecimento do sedex, ao clicar abrir o rastreamento"*.
 *
 * Vazio, e não um traço: quem chama decide o que pôr no lugar. Na coluna Frete
 * do Acabamento o lugar simplesmente não existe até o pedido ser postado — e um
 * traço embaixo da logo da transportadora se leria como "sem rastreio", quando
 * a verdade é "ainda não despachou".
 *
 * `noopener noreferrer` porque o destino é o site dos Correios, fora daqui; e
 * `event.stopPropagation()` porque a linha inteira da tabela é clicável e abre o
 * pedido — sem isso, tocar no código abriria as duas coisas.
 */
function rastreioHtml(codigo, opcoes) {
    const url = linkDeRastreio(codigo);
    if (!url) return '';
    const o = opcoes || {};
    const rotulo = String(codigo).trim().toUpperCase();
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer"'
         + ' onclick="event.stopPropagation();"'
         + ' title="Abrir o rastreamento nos Correios"'
         + ' style="color: var(--blue); font-weight: 700; font-size: '
         + (o.tamanho || '0.72rem') + '; letter-spacing: 0.02em;'
         + ' text-decoration: underline; display: inline-block;'
         + (o.margemTopo ? ' margin-top: ' + o.margemTopo + ';' : '') + '">'
         + escapeHtml(rotulo) + ' ↗</a>';
}

window.LOGO_DO_FRETE = LOGO_DO_FRETE;
window.normalizarFrete = normalizarFrete;
window.logoDoFrete = logoDoFrete;
window.logoDoFreteHtml = logoDoFreteHtml;
window.linkDeRastreio = linkDeRastreio;
window.rastreioHtml = rastreioHtml;
