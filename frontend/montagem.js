/* ══════════════════════════════════════════════════════════════════════════
   MONTAGEM — refazer células de pedidos diferentes numa folha só
   ══════════════════════════════════════════════════════════════════════════

   O "Refazer Célula" da tela do Pedido já repõe o item que estragou: o
   operador digita as posições (1, 6, 22) e o motor as compacta numa folha,
   sem buraco. O limite dele é que a folha é de UM modelo de UM pedido — e a
   gráfica estraga uma célula aqui, outra ali, em pedidos diferentes do mesmo
   produto, e acaba gastando uma folha inteira de PVC para repor três cartões.

   Esta tela junta essas células. Pedido do usuário em 29/08/2026.

   ── O QUE JÁ EXISTIA, E POR ISSO NENHUM PYTHON MUDOU ─────────────────────

   O motor já monta folha com modelos de pedidos DIFERENTES desde 18/08/2026
   (o `multi_artes` do aproveitamento de folha): cada arte carrega o seu
   `pedido`, e item que chega sem saber de qual pedido veio levanta erro em vez
   de sair com a coluna do pool errada.

   E o `refazer_celulas` do motor indexa o `multi_map` — a lista ordenada dos
   itens do trabalho INTEIRO —, não uma conta de esquema. Cada entrada do
   `multi_map` carrega `modelo`, `pedido`, `csv_row` e `local_idx` do item
   original.

   A consequência é o que torna esta tela segura: o código do QR Ideal é
   `indice(pedido, modelo, item)`, determinístico. Refazer a posição 6 do
   modelo X do pedido Y devolve **exatamente o mesmo código** do original. A
   célula refeita SUBSTITUI o ingresso perdido; ela não cria um segundo
   ingresso válido para a mesma entrada.

   ── O QUE ESTA TELA FAZ ──────────────────────────────────────────────────

   Traduz. O operador pensa em "a posição 6 do modelo 1000565"; o motor espera
   posições no fluxo combinado. `posicoesCombinadas()` faz a conta, e ela é a
   função mais delicada do arquivo — ver o comentário lá.
   ══════════════════════════════════════════════════════════════════════════ */

// ─── O estado da tela ───────────────────────────────────────────────────────
//
// `grupos` é a montagem: um por (pedido, modelo), na ordem em que o operador
// adicionou. A ordem importa — é ela que decide qual célula ocupa qual posição
// na folha, e é a mesma ordem que o motor recebe em `multi_artes`.
if (typeof state !== 'undefined' && state && !state.montagem) {
    state.montagem = { grupos: [], pedidoSel: null, modeloSel: null };
}

/* ══════════════════════════════════════════════════════════════════════════
   O NÚCLEO — funções puras, que o harness roda sem tela nenhuma
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * As posições digitadas viram uma lista de inteiros.
 *
 * Mesma sintaxe do Refazer Célula da tela do Pedido, de propósito: o operador
 * já digita `1,6,22` e `1-4` ali, e inventar outra gramática aqui só criaria
 * duas coisas para lembrar.
 *
 * A diferença é o `total`, que aqui vem por parâmetro em vez de um global:
 * cada modelo da montagem tem o seu, e um global só poderia guardar o do
 * último escolhido — deixando passar a posição 3000 de um modelo de 150.
 *
 * A ORDEM DIGITADA É PRESERVADA. É ela que decide qual célula ocupa qual
 * posição na folha compactada; ordenar aqui mudaria o papel sem ninguém pedir.
 */
function posicoesDaMontagem(texto, total) {
    const vistas = [];
    const invalidos = [];
    const limite = parseInt(total) || 0;

    const aceitar = n => {
        if (vistas.indexOf(n) === -1) vistas.push(n);
    };

    for (const bruto of String(texto || '').split(/[,;\s]+/)) {
        const parte = bruto.trim();
        if (!parte) continue;

        const faixa = parte.match(/^(\d+)\s*-\s*(\d+)$/);
        if (faixa) {
            const ini = parseInt(faixa[1]);
            const fim = parseInt(faixa[2]);
            if (ini >= 1 && fim >= ini && (!limite || fim <= limite)) {
                for (let c = ini; c <= fim; c++) aceitar(c);
            } else {
                invalidos.push(parte);
            }
            continue;
        }

        const n = parseInt(parte);
        if (!isNaN(n) && String(n) === parte && n >= 1 && (!limite || n <= limite)) {
            aceitar(n);
        } else {
            invalidos.push(parte);
        }
    }

    return { posicoes: vistas, invalidos };
}

/**
 * Quantos itens este modelo imprime — o total contra o qual a posição vale.
 *
 * É o mesmo número que a prévia do Pedido mostra, e vem do BANCO quando há
 * banco: a quantidade contratada e o que o modelo de fato imprime podem
 * divergir (ver docs/conferencia_pedido_21202.md), e quem manda é o que vira
 * papel. Sem banco, a faixa numérica.
 */
function totalDeItensDoModelo(item, num) {
    if (!item) return 0;

    if (num && num.csv_data && num.csv_data.length) {
        if (typeof fatiaCsvDoItem === 'function') {
            const fatia = fatiaCsvDoItem(item, num);
            if (fatia && fatia.length) return fatia.length;
        }
        return num.csv_data.length;
    }

    const ini = parseInt(item.num_inicial !== undefined && item.num_inicial !== null
        ? item.num_inicial : (item.numeracao_inicio || 0)) || 0;
    const fim = parseInt(item.num_final !== undefined && item.num_final !== null
        ? item.num_final : (item.numeracao_fim || 0)) || 0;
    if (ini > 0 && fim >= ini) return fim - ini + 1;

    const q = parseInt(item.quantidade !== undefined && item.quantidade !== null
        ? item.quantidade : item.qtd);
    return isNaN(q) ? 0 : q;
}

/**
 * O FORMATO deste modelo, resolvido aqui — e essa é a parte que quase custou
 * caro.
 *
 * `formato_id` NÃO existe em `pedidos_modelos`: quem o preenche na memória é o
 * DESENHO da fila do Pedido (`renderPedOSQueue`), a partir do produto do ERP.
 * A Montagem carrega os modelos com o `loadOSItens` e nunca desenha aquela
 * fila, então os itens chegavam aqui **sem formato**.
 *
 * Isso produziu duas falhas em 29/08/2026, e a segunda é pior que a primeira:
 *
 *  1. o payload ia com `formato: null` e o motor recusava — "Formato não
 *     encontrado", que ao menos aparece na tela;
 *  2. o `porQueNaoCabeNaMontagem` comparava `'' !== ''` e devolvia "cabe"
 *     SEMPRE. A regra que o usuário decidiu — formato, cor, saída e face —
 *     estava **inerte**, e uma folha com dois materiais diferentes teria
 *     passado sem um aviso.
 *
 * A regra abaixo é a MESMA do desenho da fila, e não uma aproximação: produto
 * do item → `id_formato` do produto → o formato cujo `id_formato_num` casa.
 * Sem produto ou sem casamento, vale o `formato_id` que o item porventura
 * traga do banco.
 *
 * Não grava nada. O desenho da fila escreve o resultado de volta com
 * `autoSaveOSItemField`; a Montagem é tela de leitura e não tem por que
 * carimbar o pedido de ninguém.
 */
function formatoDoItem(item) {
    if (!item) return null;

    const prodId = item._vibe_id_produto;
    if (prodId && prodId !== 'sem_produto') {
        const prod = (state.produtosGlobais || [])
            .find(p => String(p.id_produto) === String(prodId));
        if (prod && prod.id_formato) {
            const f = (state.formatos || [])
                .find(x => String(x.id_formato_num) === String(prod.id_formato));
            if (f) return f;
        }
    }

    if (item.formato_id) {
        return (state.formatos || [])
            .find(x => String(x.id) === String(item.formato_id)) || null;
    }

    return null;
}

/** A saída: a do item, ou a padrão do formato — a mesma ordem do desenho da fila. */
function saidaIdDoItem(item, fmt) {
    if (item && item.saida_id) return String(item.saida_id);
    if (fmt && fmt.default_saida_id) return String(fmt.default_saida_id);
    return '';
}

/**
 * A peça normalizada: o que a conferência compara e o que o payload usa.
 *
 * Existe para os dois lerem a MESMA coisa. Enquanto a conferência olhava
 * `item.formato_id` cru e o payload resolvia por outro caminho, dava para a
 * tela aceitar uma célula que o motor recusaria — que foi exatamente o que
 * aconteceu.
 */
function pecaDaMontagem(item) {
    const fmt = formatoDoItem(item);
    return {
        formato_id: fmt ? String(fmt.id) : '',
        formato_nome: fmt ? (fmt.nome || '') : '',
        celulas_por_folha: fmt ? ((parseInt(fmt.cols) || 0) * (parseInt(fmt.rows) || 0)) : 0,
        saida_id: saidaIdDoItem(item, fmt),
        cor: item ? (item.cor || item.padrao || '') : '',
        verso_tipo: item ? item.verso_tipo : null,
        _item: item,
    };
}

/**
 * Por que estas duas peças NÃO podem dividir a mesma folha de montagem.
 *
 * Devolve o motivo em português, ou `null` quando cabem.
 *
 * ── Por que não é só o formato ───────────────────────────────────────────
 *
 * O usuário abriu o pedido dizendo que a única condição seria o mesmo formato.
 * Três das quatro conferências abaixo não são preferência, são impossibilidade
 * física da folha, e por isso ficaram (decisão dele em 29/08/2026, depois de a
 * diferença ser apontada):
 *
 *   · COR    — a folha é de um material só. Triband azul e Triband dourado não
 *              saem da mesma passagem pela impressora.
 *   · SAÍDA  — é o tamanho da folha física.
 *   · FACE   — o verso da folha existe ou não existe; não há meio termo.
 *
 * ── E por que o modo de impressão saiu ───────────────────────────────────
 *
 * O `porQueNaoCombina` da tela do Pedido recusa também Sequencial × Blocado,
 * e ali isso está certo: a ordem das células decide como a pilha é cortada.
 * Aqui não há pilha. A montagem compacta as células numa folha, na ordem
 * digitada, e o corte não existe — recusar por isso barraria combinação
 * legítima sem proteger nada.
 *
 * O modo PDF também saiu: ele decide de onde a ARTE vem para a tiragem
 * inteira, e cada célula da montagem já traz a arte do seu próprio modelo.
 */
function porQueNaoCabeNaMontagem(a, b) {
    if (!a || !b) return null;

    // Peça sem formato conhecido NAO passa. Antes de 29/08/2026 ela passava:
    // duas pecas sem formato comparavam '' com '' e a conferencia dizia "cabe",
    // deixando a regra inteira inerte. Quem nao sabe o proprio formato nao pode
    // ser comparado com ninguem.
    if (!a.formato_id) return 'não sei o formato da folha desta montagem';
    if (!b.formato_id) return 'não dá para saber o formato deste modelo — abra o pedido na tela do Pedido uma vez e volte aqui';

    const cor = x => String(x.cor || x.padrao || '').toLowerCase().trim();
    const face = x => (x.verso_tipo && x.verso_tipo !== 'Frente' && x.verso_tipo !== 'SÓ FRENTE')
        ? 'verso' : 'frente';

    if (String(a.formato_id || '') !== String(b.formato_id || '')) return 'o formato é outro';
    if (cor(a) !== cor(b)) return 'a cor do material é outra';
    if (String(a.saida_id || '') !== String(b.saida_id || '')) return 'a saída é outra';
    if (face(a) !== face(b)) return 'um imprime frente e verso e o outro só frente';

    return null;
}

/**
 * As posições por modelo viram posições no fluxo COMBINADO.
 *
 * ── A função mais delicada do arquivo ────────────────────────────────────
 *
 * O motor recebe `multi_artes` — uma arte por modelo, cada uma com a sua
 * tiragem INTEIRA — e monta o `multi_map` percorrendo as artes na ordem em que
 * chegaram. O `refazer_celulas` então indexa esse mapa.
 *
 * Ou seja: a posição 6 do SEGUNDO modelo não é 6, é `qtd do primeiro + 6`.
 *
 * O deslocamento é a QUANTIDADE TOTAL do modelo anterior, e não o número de
 * células pedidas dele. Confundir os dois é o erro que este comentário existe
 * para evitar: pedir três células do primeiro modelo e somar 3 em vez de 3.000
 * faria o segundo modelo imprimir os itens errados — com os códigos de QR
 * errados, descobertos na portaria.
 */
function posicoesCombinadas(grupos) {
    const saida = [];
    let base = 0;

    for (const g of (grupos || [])) {
        for (const p of (g.posicoes || [])) {
            saida.push(base + p);
        }
        base += parseInt(g.qtd) || 0;
    }

    return saida;
}

/** Quantas células a montagem tem hoje. */
function totalDeCelulasDaMontagem(grupos) {
    return (grupos || []).reduce((s, g) => s + ((g.posicoes || []).length), 0);
}

/**
 * Folhas e sobra da montagem, pela mesma conta do aproveitamento de folha:
 * total de células ÷ células do formato, e a sobra é o RESTO.
 */
function contaDaMontagem(grupos, porFolha) {
    const celulas = totalDeCelulasDaMontagem(grupos);
    const p = parseInt(porFolha) || 0;
    if (!p) return { celulas, folhas: 0, vazias: 0, porFolha: 0 };

    const folhas = Math.ceil(celulas / p);
    const resto = celulas % p;
    return { celulas, folhas, vazias: resto === 0 ? 0 : p - resto, porFolha: p };
}

/**
 * O grupo que já está na montagem para este par (pedido, modelo), se houver.
 *
 * Adicionar o mesmo modelo duas vezes tem de SOMAR as posições ao grupo que já
 * existe, e não criar um segundo: dois grupos do mesmo modelo dariam duas
 * artes iguais no `multi_artes`, e o deslocamento do `posicoesCombinadas`
 * passaria a contar a tiragem daquele modelo duas vezes — todas as posições
 * dos modelos seguintes sairiam erradas.
 */
function grupoDaMontagem(grupos, osId, itemId) {
    return (grupos || []).find(g =>
        String(g.osId) === String(osId) && String(g.itemId) === String(itemId)) || null;
}

if (typeof window !== 'undefined') {
    window.posicoesDaMontagem = posicoesDaMontagem;
    window.totalDeItensDoModelo = totalDeItensDoModelo;
    window.porQueNaoCabeNaMontagem = porQueNaoCabeNaMontagem;
    window.posicoesCombinadas = posicoesCombinadas;
    window.totalDeCelulasDaMontagem = totalDeCelulasDaMontagem;
    window.contaDaMontagem = contaDaMontagem;
    window.grupoDaMontagem = grupoDaMontagem;
}

/* ══════════════════════════════════════════════════════════════════════════
   A TELA
   ══════════════════════════════════════════════════════════════════════════ */

/** O item (modelo) escolhido no par pedido+modelo do compositor. */
function _mtgItemEscolhido() {
    const m = state.montagem;
    if (!m || !m.pedidoSel || !m.modeloSel) return null;
    return (state.osItens[m.pedidoSel] || [])
        .find(i => String(i.id) === String(m.modeloSel)) || null;
}

/** A numeração daquele modelo, já resolvida (banco do pedido incluído). */
function _mtgNumeracaoDoItem(item) {
    if (!item) return null;
    const id = (typeof numeracaoIdDoItem === 'function')
        ? numeracaoIdDoItem(item)
        : (item.amostra_num_id || item.numeracao_id);
    let num = (state.numeracoes || []).find(n => String(n.id) === String(id)) || null;
    if (typeof resolverNumeracaoParaModelo === 'function') {
        num = resolverNumeracaoParaModelo(num, item);
    }
    return num;
}

/** Quantas células cabem na folha desta montagem. */
function _mtgCelulasPorFolha(grupos) {
    // Vem da PECA resolvida, e nao de uma busca propria: duas resolucoes do
    // mesmo formato podem discordar, e ai a conta da folha diria uma coisa e o
    // papel sairia outra.
    return (grupos && grupos.length) ? (grupos[0].peca.celulas_por_folha || 0) : 0;
}

/**
 * Os pedidos que a tela oferece: os impressos nos ÚLTIMOS 30 DIAS.
 *
 * Refazer célula é sempre sobre material que JÁ SAIU — oferecer a fila inteira
 * encheria o seletor de pedidos que não têm célula nenhuma para repor. Pedido
 * mais antigo entra pelo número, digitado no mesmo campo.
 */
function pedidosParaMontagem(dias) {
    const limite = Date.now() - ((parseInt(dias) || 30) * 24 * 60 * 60 * 1000);
    const saida = [];

    for (const os of (state.ordens || [])) {
        const quando = (typeof quandoOPedidoFicouImpresso === 'function')
            ? quandoOPedidoFicouImpresso(os) : null;
        if (quando === null || quando < limite) continue;
        saida.push({ os, quando });
    }

    // Do mais recente ao mais antigo: o que acabou de sair da impressora é o
    // que tem chance de ter estragado uma folha.
    saida.sort((a, b) => b.quando - a.quando);
    return saida.map(x => x.os);
}

/** Enche o seletor de pedidos. */
function encherPedidosDaMontagem() {
    const sel = document.getElementById('mtg-pedido');
    if (!sel) return;

    const atual = sel.value;
    const lista = pedidosParaMontagem(30);

    sel.innerHTML = '<option value="">Escolha ou digite o número…</option>'
        + lista.map(os => {
            const num = escapeHtml(String(os.numero || os.id));
            const nome = escapeHtml(String(os.cliente_nome || os.titulo || '').slice(0, 40));
            return `<option value="${escapeHtml(String(os.id))}">${num}${nome ? ' · ' + nome : ''}</option>`;
        }).join('');

    if (atual) sel.value = atual;
}

async function onMontagemPedidoChange() {
    const sel = document.getElementById('mtg-pedido');
    const osId = sel ? sel.value : '';
    state.montagem.pedidoSel = osId || null;
    state.montagem.modeloSel = null;

    const selMod = document.getElementById('mtg-modelo');
    if (!selMod) return;

    if (!osId) {
        selMod.innerHTML = '<option value="">—</option>';
        selMod.disabled = true;
        renderMontagem();
        return;
    }

    selMod.innerHTML = '<option value="">Carregando…</option>';
    selMod.disabled = true;

    // O MESMO loadOSItens da tela, e não uma consulta própria: `formato_id` e
    // `saida_id` NÃO existem em `pedidos_modelos` — são resolvidos em memória a
    // partir do texto do ERP. Uma consulta crua traria modelos sem formato, e a
    // conferência de compatibilidade recusaria todos.
    if (typeof loadOSItens === 'function') {
        try { await loadOSItens(osId); } catch (e) { console.warn('[montagem]', e); }
    }

    const itens = state.osItens[osId] || [];
    selMod.innerHTML = '<option value="">Escolha o modelo…</option>'
        + itens.map(it => {
            const nome = escapeHtml(String(it.nome_modelo || it.produto || 'modelo').slice(0, 60));
            return `<option value="${escapeHtml(String(it.id))}">${escapeHtml(String(it.id))} · ${nome}</option>`;
        }).join('');
    selMod.disabled = itens.length === 0;

    renderMontagem();
}

function onMontagemModeloChange() {
    const sel = document.getElementById('mtg-modelo');
    state.montagem.modeloSel = sel && sel.value ? sel.value : null;
    onMontagemPosicoesChange();
}

/**
 * A cada tecla: diz quantas células vão entrar, ou por que não dá.
 *
 * A recusa aparece AQUI, e não no clique em Adicionar: descobrir que a cor não
 * bate depois de digitar quinze posições é fazer o operador trabalhar à toa.
 */
function onMontagemPosicoesChange() {
    const item = _mtgItemEscolhido();
    const campo = document.getElementById('mtg-posicoes');
    const botao = document.getElementById('mtg-add');
    const dica = document.getElementById('mtg-dica');
    const caixaRecusa = document.getElementById('mtg-recusa');

    let podeAdicionar = false;
    let recusa = null;

    if (item) {
        const peca = pecaDaMontagem(item);
        const grupos = state.montagem.grupos;
        if (!peca.formato_id) {
            // Sem formato nao da para conferir nem para impor: melhor dizer
            // aqui do que deixar o motor recusar com o material ja esperando.
            recusa = 'não dá para saber o formato deste modelo — abra o pedido na tela do Pedido uma vez e volte aqui';
        } else if (grupos.length) {
            recusa = porQueNaoCabeNaMontagem(grupos[0].peca, peca);
        }
    }

    if (caixaRecusa) {
        if (recusa && item) {
            const daFolha = state.montagem.grupos.length ? state.montagem.grupos[0].peca : null;
            caixaRecusa.innerHTML = _mtgHtmlDaRecusa(recusa, daFolha, pecaDaMontagem(item));
            caixaRecusa.style.display = 'flex';
        } else {
            caixaRecusa.style.display = 'none';
        }
    }

    if (item && !recusa) {
        const num = _mtgNumeracaoDoItem(item);
        const total = totalDeItensDoModelo(item, num);
        const { posicoes, invalidos } = posicoesDaMontagem(campo ? campo.value : '', total);

        podeAdicionar = posicoes.length > 0;

        if (dica) {
            if (invalidos.length) {
                dica.innerHTML = `<span style="color:var(--red);">Fora da tiragem ou inválido: <strong>${escapeHtml(invalidos.join(', '))}</strong></span>`
                    + ` — este modelo tem <strong>${total.toLocaleString('pt-BR')}</strong> item(ns).`;
            } else if (posicoes.length) {
                dica.innerHTML = `<strong>${posicoes.length}</strong> célula(s) deste modelo, de <strong>${total.toLocaleString('pt-BR')}</strong>.`;
            } else {
                dica.innerHTML = `Este modelo tem <strong>${total.toLocaleString('pt-BR')}</strong> item(ns). A posição é a do item <strong>dentro do modelo</strong>. Faixas valem: <code>1-4</code>.`;
            }
        }
    } else if (dica && !recusa) {
        dica.innerHTML = 'A posição é a do item <strong>dentro do modelo</strong> — o 1º, o 6º, o 22º da tiragem, onde quer que ele tenha caído na folha. Faixas valem: <code>1-4</code>.';
    }

    if (botao) botao.disabled = !podeAdicionar;
}

/** O aviso de que este modelo não cabe — com o que difere E o que fazer. */
function _mtgHtmlDaRecusa(motivo, aceita, tentado) {
    const cor = x => escapeHtml(String((x && (x.cor || x.padrao)) || '—'));
    // Sem folha ainda (o primeiro modelo e' que nao tem formato), a comparacao
    // nao existe — e prometer uma comparacao vazia so' confundiria.
    const comparacao = aceita ? `
          <p style="margin:0 0 10px;font-size:0.82rem;color:var(--text);line-height:1.55;">
            A folha já está em <strong>${cor(aceita)}</strong> e este modelo é <strong>${cor(tentado)}</strong>.
            Uma folha é de um material só — as duas não saem da mesma passagem pela impressora.
          </p>` : '';
    const saida = aceita ? `
          <button type="button" class="btn btn-secondary btn-sm" onclick="limparMontagem()">
            Começar uma montagem com este modelo
          </button>
          <span style="font-size:0.76rem;color:var(--text-faint);margin-left:8px;">a montagem atual é descartada</span>` : '';
    return `
        <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" style="flex-shrink:0;color:var(--red);margin-top:1px;">
          <path fill="currentColor" d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/></svg>
        <div style="min-width:0;">
          <p style="margin:0 0 7px;font-size:0.9rem;font-weight:700;color:#fca5a5;line-height:1.4;">
            Este modelo não cabe nesta montagem: ${escapeHtml(motivo)}.
          </p>
          ${comparacao}${saida}
        </div>`;
}

/** Junta as posições digitadas ao grupo daquele modelo, ou cria o grupo. */
function adicionarNaMontagem() {
    const item = _mtgItemEscolhido();
    if (!item) return;

    const peca = pecaDaMontagem(item);
    // A ULTIMA barreira antes do papel. A tela ja avisa ao escolher o modelo,
    // mas quem decide o que entra na montagem e' esta linha: sem formato, ou
    // incompativel, nao entra.
    if (!peca.formato_id) return;

    const grupos = state.montagem.grupos;
    if (grupos.length && porQueNaoCabeNaMontagem(grupos[0].peca, peca)) return;

    const num = _mtgNumeracaoDoItem(item);
    const total = totalDeItensDoModelo(item, num);
    const campo = document.getElementById('mtg-posicoes');
    void num;
    const { posicoes } = posicoesDaMontagem(campo ? campo.value : '', total);
    if (!posicoes.length) return;

    const osId = state.montagem.pedidoSel;
    // Somar ao grupo que existe, nunca criar um segundo do mesmo modelo: duas
    // artes iguais no multi_artes fariam o deslocamento contar a tiragem duas
    // vezes, e todas as posições seguintes sairiam erradas.
    let g = grupoDaMontagem(grupos, osId, item.id);
    if (!g) {
        g = {
            osId: osId,
            itemId: item.id,
            pedidoNumero: (typeof numeroDoPedidoDoItem === 'function')
                ? numeroDoPedidoDoItem(osId) : osId,
            nome: item.nome_modelo || item.produto || 'modelo',
            qtd: total,
            posicoes: [],
            peca: peca,
        };
        grupos.push(g);
    }

    for (const p of posicoes) {
        if (g.posicoes.indexOf(p) === -1) g.posicoes.push(p);
    }

    if (campo) campo.value = '';
    onMontagemPosicoesChange();
    renderMontagem();
}

function removerDaMontagem(indice) {
    const grupos = state.montagem.grupos;
    if (indice >= 0 && indice < grupos.length) grupos.splice(indice, 1);
    onMontagemPosicoesChange();
    renderMontagem();
}

function limparMontagem() {
    state.montagem.grupos = [];
    onMontagemPosicoesChange();
    renderMontagem();
}

/** Desenha a lista, o selo, a trava e a prévia. */
function renderMontagem() {
    const grupos = state.montagem.grupos;
    const lista = document.getElementById('mtg-lista');
    const selo = document.getElementById('mtg-selo');
    const trava = document.getElementById('mtg-trava');
    const resumo = document.getElementById('mtg-resumo');
    const previa = document.getElementById('mtg-previa');
    const btnPdf = document.getElementById('mtg-btn-pdf');
    const btnLimpar = document.getElementById('mtg-btn-limpar');
    const badge = document.getElementById('badge-montagem');
    if (!lista) return;

    const celulas = totalDeCelulasDaMontagem(grupos);
    const porFolha = _mtgCelulasPorFolha(grupos);
    const conta = contaDaMontagem(grupos, porFolha);

    if (btnPdf) btnPdf.disabled = celulas === 0;
    if (btnLimpar) btnLimpar.disabled = grupos.length === 0;
    if (badge) {
        badge.textContent = String(celulas);
        badge.style.display = celulas ? '' : 'none';
    }

    // ── A trava ────────────────────────────────────────────────────────────
    // Nasce escondida e aparece com a primeira célula: o operador não escolhe
    // um formato num seletor, ele adiciona e a folha passa a dizer o que aceita.
    if (trava) {
        if (!grupos.length) {
            trava.style.display = 'none';
        } else {
            const p = grupos[0].peca;
            const sai = (state.saidas || []).find(s => String(s.id) === String(p.saida_id));
            const face = (p.verso_tipo && p.verso_tipo !== 'Frente' && p.verso_tipo !== 'SÓ FRENTE')
                ? 'Frente e verso' : 'Só frente';
            trava.innerHTML = `
                <span class="mtg-trava-titulo">
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2zm-8-2a3 3 0 0 1 6 0v2H9V7z"/></svg>
                  A folha aceita
                </span>
                <span class="mtg-chip">${escapeHtml(p.formato_nome || ('formato ' + p.formato_id))}</span>
                <span class="mtg-chip">${escapeHtml(String(p.cor || 'sem cor'))}</span>
                <span class="mtg-chip">${escapeHtml(sai ? sai.nome : 'saída ' + p.saida_id)}</span>
                <span class="mtg-chip">${face}</span>
                <span style="margin-left:auto;font-size:0.75rem;color:var(--text-faint);">definido pela primeira célula</span>`;
            trava.style.display = 'flex';
        }
    }

    if (resumo) {
        const pedidos = new Set(grupos.map(g => String(g.osId)));
        resumo.textContent = grupos.length
            ? `${pedidos.size} pedido(s) · ${grupos.length} modelo(s)` : '';
    }

    // ── A lista ────────────────────────────────────────────────────────────
    if (!grupos.length) {
        lista.innerHTML = `
            <div class="mtg-vazio">
              <svg viewBox="0 0 48 48" width="52" height="52" aria-hidden="true">
                <rect x="6" y="9"  width="36" height="6" rx="1.5" fill="none" stroke="#334a6b" stroke-width="2"/>
                <rect x="6" y="19" width="36" height="6" rx="1.5" fill="none" stroke="#334a6b" stroke-width="2"/>
                <rect x="6" y="29" width="36" height="6" rx="1.5" fill="#1e3a5f" stroke="#3b82f6" stroke-width="2"/>
                <rect x="6" y="39" width="36" height="6" rx="1.5" fill="none" stroke="#334a6b" stroke-width="2" stroke-dasharray="3 3"/>
              </svg>
              <h3>Nenhuma célula na montagem ainda</h3>
              <p>Escolha o pedido, o modelo e digite as posições que precisam sair de novo. Repita para quantos pedidos quiser: <strong>a folha aceita células de pedidos diferentes</strong>, desde que sejam do mesmo formato, cor, saída e face.</p>
              <div class="mtg-garantia">
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style="flex-shrink:0;"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1.3 13.6-3.2-3.2 1.4-1.4 1.8 1.8 4.6-4.6 1.4 1.4-6 6z"/></svg>
                <span>O código do ingresso refeito é <strong>o mesmo do original</strong> — a célula substitui, não duplica.</span>
              </div>
            </div>`;
    } else {
        lista.innerHTML = `
            <table class="data-table">
              <tr><th>Pedido</th><th>Modelo</th><th>Posições</th><th style="text-align:right;">Células</th><th style="width:40px;"></th></tr>
              ${grupos.map((g, i) => `
                <tr>
                  <td>${escapeHtml(String(g.pedidoNumero || g.osId))}</td>
                  <td><span style="color:var(--text);">${escapeHtml(String(g.itemId))}</span><br>
                      <span style="font-size:0.78rem;">${escapeHtml(String(g.nome).slice(0, 46))}</span></td>
                  <td><span class="mtg-posicoes">${g.posicoes.map(p => `<span class="mtg-pos">#${p}</span>`).join('')}</span></td>
                  <td style="text-align:right;">${g.posicoes.length}</td>
                  <td style="text-align:right;"><span class="mtg-tirar" title="Tirar este modelo da montagem" onclick="removerDaMontagem(${i})">&times;</span></td>
                </tr>`).join('')}
            </table>`;
    }

    // ── O selo ─────────────────────────────────────────────────────────────
    // Mesma frase, mesmas cores e mesma regra do selo de sobra do Pedido:
    // verde quando a folha fecha certo, amarelo quando sobra célula. O amarelo
    // é reservado à sobra — pintar "fecha certo" de amarelo faria o amarelo
    // deixar de significar atenção.
    if (selo) {
        if (!celulas) {
            selo.style.display = 'none';
        } else if (!porFolha) {
            selo.className = 'selo-sobra';
            selo.style.display = 'flex';
            selo.innerHTML = `<span class="selo-sobra-texto">📄 ${celulas} célula(s) · não sei quantas cabem na folha deste formato</span>`;
        } else {
            selo.className = 'selo-sobra ' + (conta.vazias === 0 ? 'fecha-certo' : 'tem-sobra');
            selo.style.display = 'flex';
            const fim = conta.vazias === 0
                ? 'a folha fecha certo, sem sobra'
                : `sobram ${conta.vazias} célula(s) (${Math.round(conta.vazias / porFolha * 100)}% de uma folha)`;
            selo.innerHTML = `<span class="selo-sobra-texto">📄 ${conta.folhas} folha(s) · ${celulas} célula(s) · ${fim}</span>`;
        }
    }

    // ── A prévia da primeira folha ─────────────────────────────────────────
    if (previa) {
        const numFolha = document.getElementById('mtg-folha-num');
        if (!celulas || !porFolha) {
            previa.innerHTML = '';
            if (numFolha) numFolha.textContent = '';
        } else {
            const tons = ['#dbeafe|#93c5fd|#1e3a5f', '#ede9fe|#c4b5fd|#3b2a6b',
                          '#dcfce7|#86efac|#14532d', '#fef3c7|#fcd34d|#713f12',
                          '#fce7f3|#f9a8d4|#701a45'];
            const linhas = [];
            grupos.forEach((g, gi) => {
                const [bg, br, fg] = tons[gi % tons.length].split('|');
                for (const p of g.posicoes) {
                    if (linhas.length >= porFolha) return;
                    linhas.push(`<div class="mtg-celula" style="background:${bg};border-color:${br};color:${fg};">${escapeHtml(String(g.pedidoNumero || g.osId))} · ${escapeHtml(String(g.itemId))} · #${p}</div>`);
                }
            });
            while (linhas.length < porFolha) {
                linhas.push('<div class="mtg-celula mtg-celula-vazia">vazia</div>');
            }
            previa.innerHTML = linhas.join('');
            if (numFolha) numFolha.textContent = `FOLHA 1 DE ${conta.folhas}`;
        }
    }
}

/** Chamada ao entrar na tela. */
async function abrirMontagem() {
    if (!state.montagem) state.montagem = { grupos: [], pedidoSel: null, modeloSel: null };
    encherPedidosDaMontagem();
    onMontagemPosicoesChange();
    renderMontagem();
}

/**
 * Monta o payload e manda gerar.
 *
 * O destino é SEMPRE a estação. Não há caminho para a nuvem, e não é por
 * desempenho apenas: impressão só acontece pela estação da gráfica. Sem agente
 * respondendo, a resposta certa ao operador é que não dá — e não um plano B.
 */
async function gerarPdfDaMontagem() {
    const grupos = state.montagem.grupos;
    if (!grupos.length) return;

    const btn = document.getElementById('mtg-btn-pdf');
    const rotulo = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Montando…'; }

    try {
        const base = await _mtgEstacao();
        if (!base) {
            throw new Error('Nenhuma estação respondeu. A montagem é gerada na estação da gráfica — '
                + 'abra o agente NewProd nesta máquina e tente de novo.');
        }

        const payload = payloadDaMontagem(grupos);
        const fd = new FormData();
        fd.append('payload', JSON.stringify(payload));

        const resp = await fetch(base + '/api/impose', { method: 'POST', body: fd });
        if (!resp.ok) {
            const detalhe = (typeof descreverErroHttp === 'function')
                ? await descreverErroHttp(resp, base + '/api/impose')
                : `Erro ${resp.status}`;
            throw new Error(detalhe);
        }

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);

        if (typeof toast === 'function') {
            toast(`Montagem gerada: ${totalDeCelulasDaMontagem(grupos)} célula(s).`, 'success');
        }
    } catch (e) {
        console.error('[montagem]', e);
        if (typeof toast === 'function') toast(e.message || String(e), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = rotulo; }
    }
}

/** A estação desta máquina, ou null. Sem plano B na nuvem, de propósito. */
async function _mtgEstacao() {
    for (const base of ['http://localhost:8080', 'http://127.0.0.1:9000']) {
        try {
            const r = await fetch(base + '/api/status', { signal: AbortSignal.timeout(2500) });
            if (!r.ok) continue;
            const d = await r.json();
            if (d && d.onde !== 'nuvem') return base;
        } catch (_) {}
    }
    return null;
}

/**
 * O payload da montagem.
 *
 * Uma arte por (pedido, modelo), com a TIRAGEM INTEIRA de cada um — é sobre ela
 * que o motor monta o `multi_map`, e é o `multi_map` que dá a cada item o seu
 * modelo, o seu pedido e a sua linha do banco. As posições combinadas então
 * indexam esse mapa.
 *
 * Mandar a tiragem recortada seria mais leve e estaria ERRADO: o índice do item
 * é o que decide o código do QR Ideal, e recortar embaralharia todos.
 */
function payloadDaMontagem(grupos) {
    const primeiro = grupos[0].peca;
    // O formato e a saida vem da PECA — resolvidos uma vez, no `pecaDaMontagem`.
    // Buscar de novo aqui abriria espaco para a tela e o payload discordarem,
    // que foi o defeito de 29/08/2026.
    const fmt = (state.formatos || []).find(f => String(f.id) === String(primeiro.formato_id)) || null;
    const sai = (state.saidas || []).find(s => String(s.id) === String(primeiro.saida_id)) || null;

    const artes = grupos.map(g => {
        const it = g.peca._item || {};
        const num = _mtgNumeracaoDoItem(it);
        return {
            qtd: g.qtd,
            pdf_url: it.arte_url || null,
            pdf_verso_url: it.arte_verso_url || null,
            pdf_name: g.nome,
            nome: '',
            nome_color: '#000000',
            num1_id: num ? num.id : null,
            num2_id: null,
            start: parseInt(it.num_inicial || it.numeracao_inicio || 1) || 1,
            numeracao: num,
            numeracao_2: null,
            has_raw_file: false,
            q_cam: parseInt(it.q_cam) || 0,
            l_cam: parseInt(it.l_cam) || 1,
            modelo: g.itemId,
            pedido: g.pedidoNumero || null,
        };
    });

    return {
        formato_id: primeiro.formato_id,
        saida_id: primeiro.saida_id,
        formato: fmt,
        saida: sai,
        layout_schema: 'multi_artes',
        multi_artes: artes,
        suggested_filename: 'montagem_' + new Date().toISOString().slice(0, 10) + '.pdf',
        stream: false,
        print_mode: 'simplex',
        rotate_page: 0,
        seq_start: 1,
        seq_increment: 1,
        // Aqui está a tradução. Ver posicoesCombinadas().
        refazer_de: 0,
        refazer_ate: 0,
        refazer_set: 1,
        refazer_celulas: posicoesCombinadas(grupos),
    };
}

if (typeof window !== 'undefined') {
    window.abrirMontagem = abrirMontagem;
    window.pedidosParaMontagem = pedidosParaMontagem;
    window.encherPedidosDaMontagem = encherPedidosDaMontagem;
    window.onMontagemPedidoChange = onMontagemPedidoChange;
    window.onMontagemModeloChange = onMontagemModeloChange;
    window.onMontagemPosicoesChange = onMontagemPosicoesChange;
    window.adicionarNaMontagem = adicionarNaMontagem;
    window.removerDaMontagem = removerDaMontagem;
    window.limparMontagem = limparMontagem;
    window.renderMontagem = renderMontagem;
    window.gerarPdfDaMontagem = gerarPdfDaMontagem;
    window.payloadDaMontagem = payloadDaMontagem;
}

/**
 * Busca o pedido pelo número e o escolhe.
 *
 * O seletor lista os IMPRESSOS NOS ÚLTIMOS 30 DIAS, que é o caso normal: refazer
 * célula é sobre material que acabou de sair. Este campo cobre o outro caso — o
 * pedido antigo que voltou do cliente, e que não está naquela lista.
 *
 * Procura em TODOS os pedidos que o painel tem em memória, e não só nos
 * impressos: um pedido pode ter voltado sem que o status diga isso, e recusar a
 * busca por causa do status seria travar o operador por um dado que não é dele.
 */
function buscarPedidoDaMontagem() {
    const campo = document.getElementById('mtg-buscar');
    const alvo = String((campo && campo.value) || '').trim();
    if (!alvo) return;

    const os = (state.ordens || []).find(o =>
        String(o.numero) === alvo || String(o.id) === alvo);

    if (!os) {
        if (typeof toast === 'function') {
            toast(`O pedido ${alvo} não está entre os que o painel carregou. `
                + `Abra-o uma vez no Painel de Produção e volte aqui.`, 'warning');
        }
        return;
    }

    const sel = document.getElementById('mtg-pedido');
    if (sel) {
        // O pedido buscado pode não estar na lista dos 30 dias: entra como opção
        // própria, senão o `sel.value` não pegaria e a busca não faria nada.
        if (!Array.from(sel.options).some(o => o.value === String(os.id))) {
            const opt = document.createElement('option');
            opt.value = String(os.id);
            opt.textContent = String(os.numero || os.id) + ' · buscado';
            sel.appendChild(opt);
        }
        sel.value = String(os.id);
    }

    if (campo) campo.value = '';
    onMontagemPedidoChange();
}

if (typeof window !== 'undefined') {
    window.buscarPedidoDaMontagem = buscarPedidoDaMontagem;
}
