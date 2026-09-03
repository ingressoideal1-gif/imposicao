/* ══════════════════════════════════════════════════════════════════════════
   MONTAGEM — refazer células de pedidos diferentes numa folha só
   ══════════════════════════════════════════════════════════════════════════

   O "Refazer Célula" da tela do Pedido já repõe o item que estragou: o
   operador digita as posições (1, 6, 22) e o motor as compacta numa folha,
   sem buraco. O limite dele é que a folha é de UM modelo de UM pedido — e a
   gráfica estraga uma célula aqui, outra ali, em pedidos diferentes do mesmo
   produto, e acaba gastando uma folha inteira de PVC para repor três cartões.

   Esta tela junta essas células. Pedido do usuário em 29/08/2026.

   ── O QUE O MOTOR JÁ FAZIA ───────────────────────────────────────────────

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

   A única coisa que o motor ganhou POR CAUSA desta tela (03/09/2026) foi a
   chave `refazer_repetir`: com ela, posição repetida em `refazer_celulas`
   imprime duas vezes. É o que o botão ⧉ de cada célula pede. Sem a chave, o
   motor continua tirando repetidas — e é assim que a tela do Pedido manda.

   ── O QUE ESTA TELA FAZ ──────────────────────────────────────────────────

   Traduz. O operador pensa em "a posição 6 do modelo 1000565"; o motor espera
   posições no fluxo combinado. `posicoesCombinadas()` faz a conta, e ela é a
   função mais delicada do arquivo — ver o comentário lá.

   E monta cada arte EXATAMENTE como a tela do Pedido monta — pelas mesmas
   funções (`arteDoModeloParaFolha` e `arteParaOMotor`, do pedido.js). A
   primeira versão montava a sua própria arte, e uma célula refeita aqui saía
   diferente da original em sete coisas: sem o verso, com a amostra de
   aprovação no lugar da arte, sem o banco do pedido, com as linhas do banco
   fora de lugar, sem a escala do modelo, sem a rotação da folha. Ver
   `prepararArtesDaMontagem()`.
   ══════════════════════════════════════════════════════════════════════════ */

// ─── O estado da tela ───────────────────────────────────────────────────────
//
// Duas listas, de propósito separadas:
//
// `celulas` é a folha: uma entrada por célula, NA ORDEM EM QUE VÃO SAIR NO
// PAPEL. É a lista que o operador arrasta, duplica e tira, célula a célula.
// Cada entrada é `{ osId, itemId, pos }` — a posição do item dentro do modelo.
//
// `modelos` é o registro de cada par (pedido, modelo) que entrou, na ordem em
// que entrou. É a ordem do `multi_artes` do motor, e portanto é ela que decide
// o deslocamento de cada posição (ver `posicoesCombinadas`). Ela NÃO precisa
// bater com a ordem das células: o operador pode pôr a célula do segundo
// modelo antes da do primeiro, e o motor recebe a folha nessa ordem.
if (typeof state !== 'undefined' && state && (!state.montagem || !state.montagem.celulas)) {
    state.montagem = { celulas: [], modelos: [], pedidoSel: null, modeloSel: null };
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
 *
 * Posição repetida na digitação entra UMA vez: "6,6" é engano de dedo. Quem
 * quer a mesma célula duas vezes usa o ⧉ dela na folha — um gesto explícito.
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
 * É a MESMA conta que o motor vai fazer com a arte que a tela do Pedido monta
 * (`arteParaOMotor`): a quantidade contratada é quantos itens o motor cria; o
 * banco, quando há banco, é quantos deles têm dado. Quem manda é o menor dos
 * dois — item além do banco sairia com número no lugar do nome, e posição
 * além da quantidade o motor recusa.
 *
 * Com distribuição do banco (`csv_selecao`) vale a fatia, e só ela: é o que o
 * modelo imprime, e a quantidade contratada deixa de ser o limite.
 */
function totalDeItensDoModelo(item, num) {
    if (!item) return 0;

    const contratada = parseInt(item.qtd !== undefined && item.qtd !== null
        ? item.qtd : item.quantidade) || 0;

    if (num && num.csv_data && num.csv_data.length) {
        const fatia = (typeof fatiaCsvDoItem === 'function')
            ? (fatiaCsvDoItem(item, num) || [])
            : num.csv_data;
        if (item.csv_selecao) return fatia.length;
        return contratada > 0 ? Math.min(contratada, fatia.length) : fatia.length;
    }

    if (contratada > 0) return contratada;

    const ini = parseInt(item.num_inicial !== undefined && item.num_inicial !== null
        ? item.num_inicial : (item.numeracao_inicio || 0)) || 0;
    const fim = parseInt(item.num_final !== undefined && item.num_final !== null
        ? item.num_final : (item.numeracao_fim || 0)) || 0;
    if (ini > 0 && fim >= ini) return fim - ini + 1;

    return 0;
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

/** A chave de um par (pedido, modelo) — serve para célula e para modelo. */
function chaveDoModelo(x) {
    return String(x.osId) + '|' + String(x.itemId);
}

/**
 * O modelo já registrado na montagem para este par (pedido, modelo), se houver.
 *
 * Adicionar o mesmo modelo duas vezes tem de reaproveitar o registro, e não
 * criar um segundo: dois registros do mesmo modelo dariam duas artes iguais no
 * `multi_artes`, e o deslocamento do `posicoesCombinadas` passaria a contar a
 * tiragem daquele modelo duas vezes — todas as posições dos modelos seguintes
 * sairiam erradas.
 */
function modeloDaMontagem(modelos, osId, itemId) {
    return (modelos || []).find(m =>
        String(m.osId) === String(osId) && String(m.itemId) === String(itemId)) || null;
}

/** As posições das células deste modelo, na ordem da folha — com repetição. */
function celulasDoModelo(celulas, modelo) {
    const k = chaveDoModelo(modelo);
    return (celulas || []).filter(c => chaveDoModelo(c) === k).map(c => c.pos);
}

/** Os modelos que ainda têm ao menos uma célula na folha, na ordem do registro. */
function modelosComCelula(celulas, modelos) {
    const usadas = new Set((celulas || []).map(chaveDoModelo));
    return (modelos || []).filter(m => usadas.has(chaveDoModelo(m)));
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
 *
 * A ordem da SAÍDA é a ordem das células, que é a ordem da folha. A ordem dos
 * MODELOS só decide o deslocamento. As duas são independentes de propósito: o
 * operador arrasta células, e o `multi_artes` não muda por isso.
 */
function posicoesCombinadas(celulas, modelos) {
    const deslocamento = {};
    let base = 0;
    for (const m of (modelos || [])) {
        deslocamento[chaveDoModelo(m)] = base;
        base += parseInt(m.qtd) || 0;
    }

    return (celulas || []).map(c => (deslocamento[chaveDoModelo(c)] || 0) + c.pos);
}

/** Quantas células a montagem tem hoje — com as repetidas. */
function totalDeCelulasDaMontagem(celulas) {
    return (celulas || []).length;
}

/**
 * Folhas e sobra da montagem, pela mesma conta do aproveitamento de folha:
 * total de células ÷ células do formato, e a sobra é o RESTO.
 */
function contaDaMontagem(celulas, porFolha) {
    const total = totalDeCelulasDaMontagem(celulas);
    const p = parseInt(porFolha) || 0;
    if (!p) return { celulas: total, folhas: 0, vazias: 0, porFolha: 0 };

    const folhas = Math.ceil(total / p);
    const resto = total % p;
    return { celulas: total, folhas, vazias: resto === 0 ? 0 : p - resto, porFolha: p };
}

/**
 * Repete a célula `i` logo depois dela — a mesma peça, impressa duas vezes.
 *
 * Pedido do usuário em 03/09/2026: "ícone que duplica o modelo na próxima
 * célula". A cópia é IGUAL: mesmo pedido, mesmo modelo, mesma posição — e por
 * isso o mesmo código de QR. Não é a posição seguinte do modelo: para essa, o
 * operador digita.
 */
function duplicarCelula(celulas, i) {
    if (!celulas || i < 0 || i >= celulas.length) return celulas;
    const c = celulas[i];
    celulas.splice(i + 1, 0, { osId: c.osId, itemId: c.itemId, pos: c.pos });
    return celulas;
}

/** Tira SÓ a célula `i` da folha. As outras do mesmo modelo ficam. */
function tirarCelula(celulas, i) {
    if (!celulas || i < 0 || i >= celulas.length) return celulas;
    celulas.splice(i, 1);
    return celulas;
}

/**
 * Move a célula `de` para a posição `para` da folha.
 *
 * `para` é o índice em que ela FICA depois do movimento: mover a célula 0
 * para 3 a deixa em quarto lugar. Soltar sobre uma célula vazia, na tela,
 * manda para o fim.
 */
function moverCelula(celulas, de, para) {
    if (!celulas) return celulas;
    const n = celulas.length;
    if (de < 0 || de >= n || para < 0 || para >= n || de === para) return celulas;
    const [c] = celulas.splice(de, 1);
    celulas.splice(para, 0, c);
    return celulas;
}

/**
 * As células cuja posição passou da tiragem que o motor vai criar.
 *
 * `artes[j]` é a arte pronta do `modelos[j]`, com `_tiragem` — quantos itens
 * daquele modelo têm como sair certo (ver `prepararArtesDaMontagem`). O banco
 * pode ter mudado entre o operador adicionar a célula e mandar gerar, e a
 * posição que existia pode não existir mais.
 */
function celulasForaDaTiragem(celulas, modelos, artes) {
    const tiragem = {};
    (modelos || []).forEach((m, j) => {
        const a = artes && artes[j];
        tiragem[chaveDoModelo(m)] = a && a._tiragem > 0 ? a._tiragem : 0;
    });
    return (celulas || []).filter(c => {
        const t = tiragem[chaveDoModelo(c)];
        return t > 0 && c.pos > t;
    });
}

/**
 * O modo de impressão da folha: `front`, `duplex` ou `duplex_unico` — os três
 * valores que o motor conhece (`tem_verso` / `verso_unico` no engine.py).
 *
 * Vem de `modoDeVersoDoModelo`, a mesma regra que a tela do Pedido aplica ao
 * modelo ativo. A trava da montagem já garante que todos os modelos têm a
 * mesma face; o que pode variar entre eles é só o verso comum × verso único,
 * e o único vence porque é o único que diz ao motor como ler as páginas.
 *
 * A primeira versão mandava `'simplex'`, valor que o motor não conhece e trata
 * como frente — o verso nunca saía.
 */
function modoDaFolhaDaMontagem(modelos) {
    let modo = 'front';
    for (const m of (modelos || [])) {
        const it = m.peca && m.peca._item;
        const dele = (typeof modoDeVersoDoModelo === 'function' && it)
            ? modoDeVersoDoModelo(it) : 'front';
        if (dele === 'duplex_unico') return 'duplex_unico';
        if (dele === 'duplex') modo = 'duplex';
    }
    return modo;
}

if (typeof window !== 'undefined') {
    window.posicoesDaMontagem = posicoesDaMontagem;
    window.totalDeItensDoModelo = totalDeItensDoModelo;
    window.porQueNaoCabeNaMontagem = porQueNaoCabeNaMontagem;
    window.chaveDoModelo = chaveDoModelo;
    window.modeloDaMontagem = modeloDaMontagem;
    window.celulasDoModelo = celulasDoModelo;
    window.modelosComCelula = modelosComCelula;
    window.posicoesCombinadas = posicoesCombinadas;
    window.totalDeCelulasDaMontagem = totalDeCelulasDaMontagem;
    window.contaDaMontagem = contaDaMontagem;
    window.duplicarCelula = duplicarCelula;
    window.tirarCelula = tirarCelula;
    window.moverCelula = moverCelula;
    window.celulasForaDaTiragem = celulasForaDaTiragem;
    window.modoDaFolhaDaMontagem = modoDaFolhaDaMontagem;
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

/**
 * O número do modelo vai IMPRESSO em cada item?
 *
 * Mesmo conceito das "Opções do modelo" da tela do Pedido, e a mesma mecânica:
 * o motor imprime `arte["nome"]` deitado na borda de cada item, e esse campo é
 * o ÚNICO que decide se ele sai. Marcada a caixa, o payload leva o número;
 * desmarcada, leva vazio.
 *
 * ── Duas diferenças em relação ao Pedido, e as duas são deliberadas ────────
 *
 * É UMA escolha para a montagem inteira, e não uma por modelo. No Pedido a
 * opção mora em `pedidos_modelos` e vale para aquele modelo; aqui a folha
 * mistura modelos de pedidos diferentes, e uma caixa por linha faria o operador
 * decidir o mesmo N vezes para o mesmo papel.
 *
 * E ela NÃO é gravada no modelo. A Montagem é reposição avulsa: marcar aqui não
 * pode mudar como aquele modelo sai na próxima tiragem inteira dele. A escolha
 * que fica salva continua sendo a da tela do Pedido.
 *
 * Nasce DESMARCADA, como no Pedido: novidade que muda o que sai no papel entra
 * desligada, e o operador liga quando quiser.
 */
function imprimirNumeroNaMontagem() {
    return document.getElementById('mtg-imprimir-numero')?.checked === true;
}

/** Quantas células cabem na folha desta montagem. */
function _mtgCelulasPorFolha(modelos) {
    // Vem da PECA resolvida, e nao de uma busca propria: duas resolucoes do
    // mesmo formato podem discordar, e ai a conta da folha diria uma coisa e o
    // papel sairia outra.
    return (modelos && modelos.length) ? (modelos[0].peca.celulas_por_folha || 0) : 0;
}

/** O número do pedido, para as mensagens — ou o id, quando não se sabe. */
function _mtgNumeroDoPedido(osId) {
    const n = (typeof numeroDoPedidoDoItem === 'function') ? numeroDoPedidoDoItem(osId) : null;
    return n || String(osId);
}

/**
 * Os pedidos que a tela oferece: os impressos nos ÚLTIMOS 30 DIAS.
 *
 * Refazer célula é sempre sobre material que JÁ SAIU — oferecer a fila inteira
 * encheria o seletor de pedidos que não têm célula nenhuma para repor. Pedido
 * mais antigo entra pelo número, no campo ao lado.
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

    // "Impressos nos últimos 30 dias", e não "escolha ou digite": um <select>
    // não se digita, e o campo do número fica ao lado. Prometer aqui o que a
    // tela cumpre em outro lugar só confunde.
    sel.innerHTML = '<option value="">Impressos nos últimos 30 dias…</option>'
        + lista.map(os => {
            const num = escapeHtml(String(os.numero || os.id));
            const nome = escapeHtml(String(os.cliente_nome || os.titulo || '').slice(0, 40));
            return `<option value="${escapeHtml(String(os.id))}">${num}${nome ? ' · ' + nome : ''}</option>`;
        }).join('');

    if (atual) sel.value = atual;
}

/**
 * Os bancos e o CSV de cada numeração deste pedido, na mão.
 *
 * É o que a tela do Pedido faz antes de montar o payload
 * (`garantirCsvDoTrabalho` e `garantirBancosDoTrabalho`, na `runPedImposition`).
 * A primeira versão da Montagem não fazia: quem nunca tivesse aberto o pedido
 * na tela do Pedido nesta sessão via a tiragem errada na lista, e o motor
 * recebia a numeração sem uma linha do banco — imprimindo número sequencial no
 * lugar do nome, sem erro nenhum.
 *
 * Nunca lança: aqui é o compositor, e falhar a carga não pode travar a
 * digitação. Quem recusa o trabalho é o `prepararArtesDaMontagem`, na hora de
 * gerar, com a mensagem do que fazer.
 */
async function _mtgGarantirBancosDoPedido(osId) {
    const itens = state.osItens[osId] || [];
    try {
        if (typeof garantirBancosDoTrabalho === 'function') {
            await garantirBancosDoTrabalho([osId]);
        }
        const ids = itens
            .map(it => (typeof numeracaoIdDoItem === 'function')
                ? numeracaoIdDoItem(it) : (it.amostra_num_id || it.numeracao_id))
            .filter(Boolean);
        if (typeof garantirCsvDoTrabalho === 'function') {
            await garantirCsvDoTrabalho(ids);
        }
    } catch (e) {
        console.warn('[montagem] nao consegui garantir os bancos do pedido', osId, e);
    }
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
    // E os bancos deste pedido, para a tiragem da lista sair certa.
    await _mtgGarantirBancosDoPedido(osId);

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
    // Redesenha porque a linha ativa da lista sai daqui: escolher pelo seletor
    // tem de marcar a mesma linha que clicar nela marcaria.
    renderMontagem();
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
        const modelos = state.montagem.modelos;
        if (!peca.formato_id) {
            // Sem formato nao da para conferir nem para impor: melhor dizer
            // aqui do que deixar o motor recusar com o material ja esperando.
            recusa = 'não dá para saber o formato deste modelo — abra o pedido na tela do Pedido uma vez e volte aqui';
        } else if (modelos.length) {
            recusa = porQueNaoCabeNaMontagem(modelos[0].peca, peca);
        }
    }

    if (caixaRecusa) {
        if (recusa && item) {
            const daFolha = state.montagem.modelos.length ? state.montagem.modelos[0].peca : null;
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

/** Junta as posições digitadas à folha, registrando o modelo se for novo. */
function adicionarNaMontagem() {
    const item = _mtgItemEscolhido();
    if (!item) return;

    const peca = pecaDaMontagem(item);
    // A ULTIMA barreira antes do papel. A tela ja avisa ao escolher o modelo,
    // mas quem decide o que entra na montagem e' esta linha: sem formato, ou
    // incompativel, nao entra.
    if (!peca.formato_id) return;

    const { celulas, modelos } = state.montagem;
    if (modelos.length && porQueNaoCabeNaMontagem(modelos[0].peca, peca)) return;

    const num = _mtgNumeracaoDoItem(item);
    const total = totalDeItensDoModelo(item, num);
    const campo = document.getElementById('mtg-posicoes');
    const { posicoes } = posicoesDaMontagem(campo ? campo.value : '', total);
    if (!posicoes.length) return;

    const osId = state.montagem.pedidoSel;
    // Reaproveitar o registro que existe, nunca criar um segundo do mesmo
    // modelo: duas artes iguais no multi_artes fariam o deslocamento contar a
    // tiragem duas vezes, e todas as posições seguintes sairiam erradas.
    let m = modeloDaMontagem(modelos, osId, item.id);
    if (!m) {
        m = {
            osId: osId,
            itemId: item.id,
            pedidoNumero: _mtgNumeroDoPedido(osId),
            nome: item.nome_modelo || item.produto || 'modelo',
            qtd: total,
            posicoes: [],
            peca: peca,
        };
        modelos.push(m);
    }

    // Posição que já está na folha não entra de novo pela digitação; para
    // repetir de propósito existe o ⧉ da célula.
    const jaTem = celulasDoModelo(celulas, m);
    for (const p of posicoes) {
        if (jaTem.indexOf(p) === -1) celulas.push({ osId: osId, itemId: item.id, pos: p });
    }

    if (campo) campo.value = '';
    onMontagemPosicoesChange();
    renderMontagem();
}

/**
 * Este modelo é o que o compositor está mostrando agora?
 *
 * Derivado, e não um "índice selecionado" guardado à parte: a marca continua
 * certa quando o operador escolhe o modelo pelos seletores em vez de clicar na
 * linha, e não há um segundo estado para manter em dia quando a lista muda de
 * ordem ou perde um modelo.
 */
function _mtgLinhaAtiva(m) {
    return String(m.osId) === String(state.montagem.pedidoSel)
        && String(m.itemId) === String(state.montagem.modeloSel);
}

/**
 * Clicar na linha devolve aquele modelo ao compositor.
 *
 * Pedido do usuário em 29/08/2026. Refazer célula é trabalho de descoberta: o
 * operador acha mais uma pulseira estragada depois de já ter montado a folha, e
 * sem isto ele teria de reescolher o pedido no seletor, esperar o
 * `loadOSItens`, reescolher o modelo na lista e só então digitar. A linha já
 * sabe de qual pedido e de qual modelo se trata; ela é o caminho mais curto.
 *
 * O campo de posições fica VAZIO, e não preenchido com o que já foi pedido: o
 * operador vem acrescentar, e ver a lista antiga no campo faria parecer que ele
 * precisa apagá-la primeiro. O `adicionarNaMontagem` soma às células que existem.
 */
async function retomarDaMontagem(indice) {
    const m = state.montagem.modelos[indice];
    if (!m) return;

    const sel = document.getElementById('mtg-pedido');
    if (sel) {
        // O pedido pode não estar na lista dos 30 dias — foi buscado pelo número,
        // ou o seletor foi redesenhado depois. Sem a opção, o `value` não pega e
        // o clique não faria nada.
        if (!Array.from(sel.options).some(o => o.value === String(m.osId))) {
            const opt = document.createElement('option');
            opt.value = String(m.osId);
            opt.textContent = String(m.pedidoNumero || m.osId) + ' · na montagem';
            sel.appendChild(opt);
        }
        sel.value = String(m.osId);
    }

    // Recarrega os modelos daquele pedido, que é o que enche o segundo seletor.
    await onMontagemPedidoChange();

    const selMod = document.getElementById('mtg-modelo');
    if (selMod) {
        selMod.value = String(m.itemId);
        onMontagemModeloChange();
    }

    const campo = document.getElementById('mtg-posicoes');
    if (campo) { campo.value = ''; campo.focus(); }
}

/** Tira o modelo `indice` da montagem — e todas as células dele da folha. */
function removerDaMontagem(indice) {
    const { celulas, modelos } = state.montagem;
    const m = modelos[indice];
    if (!m) return;
    const k = chaveDoModelo(m);
    state.montagem.celulas = celulas.filter(c => chaveDoModelo(c) !== k);
    modelos.splice(indice, 1);
    onMontagemPosicoesChange();
    renderMontagem();
}

/** O ⧉ da célula: a mesma peça, repetida logo abaixo. */
function duplicarCelulaDaMontagem(i) {
    duplicarCelula(state.montagem.celulas, i);
    renderMontagem();
}

/**
 * O × da célula: tira só ela. Modelo que ficou sem célula sai do registro
 * — uma arte sem célula nenhuma no `multi_artes` não imprime nada, mas
 * continuaria na lista e no deslocamento, confundindo quem confere.
 */
function removerCelulaDaMontagem(i) {
    tirarCelula(state.montagem.celulas, i);
    state.montagem.modelos = modelosComCelula(state.montagem.celulas, state.montagem.modelos);
    onMontagemPosicoesChange();
    renderMontagem();
}

/** O arrasto: a célula `de` passa a ocupar a posição `para` da folha. */
function moverCelulaDaMontagem(de, para) {
    moverCelula(state.montagem.celulas, de, para);
    renderMontagem();
}

/**
 * Liga o arrasto das células, uma vez só, por delegação no container.
 *
 * Por delegação porque a prévia é redesenhada a cada mudança — ouvintes
 * presos a cada célula morreriam junto com o HTML. E HTML5 drag-and-drop, e
 * não uma biblioteca: cada estação da gráfica usa um navegador diferente, e
 * isto funciona em todos eles sem instalar nada.
 */
function _mtgLigarArrasto() {
    const previa = document.getElementById('mtg-previa');
    if (!previa || previa._mtgArrastoLigado) return;
    previa._mtgArrastoLigado = true;

    let de = null;
    const celulaDe = ev => (ev.target && ev.target.closest) ? ev.target.closest('.mtg-celula') : null;
    const limpar = () => previa.querySelectorAll('.mtg-celula-arrastando, .mtg-celula-alvo')
        .forEach(e => e.classList.remove('mtg-celula-arrastando', 'mtg-celula-alvo'));

    previa.addEventListener('dragstart', ev => {
        const el = celulaDe(ev);
        if (!el || !el.hasAttribute('draggable')) return;
        de = parseInt(el.dataset.i);
        el.classList.add('mtg-celula-arrastando');
        try {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', String(de));
        } catch (_) {}
    });

    previa.addEventListener('dragover', ev => {
        const el = celulaDe(ev);
        if (de === null || !el) return;
        ev.preventDefault();
        try { ev.dataTransfer.dropEffect = 'move'; } catch (_) {}
        previa.querySelectorAll('.mtg-celula-alvo').forEach(e => e.classList.remove('mtg-celula-alvo'));
        el.classList.add('mtg-celula-alvo');
    });

    previa.addEventListener('drop', ev => {
        const el = celulaDe(ev);
        if (de === null || !el) return;
        ev.preventDefault();
        const origem = de;
        de = null;
        limpar();
        // Soltar numa célula vazia é mandar para o fim da folha.
        const para = el.classList.contains('mtg-celula-vazia')
            ? state.montagem.celulas.length - 1
            : parseInt(el.dataset.i);
        if (!isNaN(para)) moverCelulaDaMontagem(origem, para);
    });

    previa.addEventListener('dragend', () => { de = null; limpar(); });
}

function limparMontagem() {
    state.montagem.celulas = [];
    state.montagem.modelos = [];
    onMontagemPosicoesChange();
    renderMontagem();
}

// As cores das células, uma por modelo. Fundo claro, borda e texto escuros:
// a folha é PAPEL, e a cor é para o olho separar os modelos de relance.
const _MTG_TONS = ['#dbeafe|#93c5fd|#1e3a5f', '#ede9fe|#c4b5fd|#3b2a6b',
                   '#dcfce7|#86efac|#14532d', '#fef3c7|#fcd34d|#713f12',
                   '#fce7f3|#f9a8d4|#701a45'];

/** Uma célula da folha, com a alça de arrasto, o ⧉ e o ×. */
function _mtgHtmlDaCelula(c, i, modelos) {
    const k = chaveDoModelo(c);
    let j = modelos.findIndex(m => chaveDoModelo(m) === k);
    if (j < 0) j = 0;
    const m = modelos[j] || {};
    const [bg, br, fg] = _MTG_TONS[j % _MTG_TONS.length].split('|');
    const rotulo = `${escapeHtml(String(m.pedidoNumero || c.osId))} · ${escapeHtml(String(c.itemId))} · #${c.pos}`;
    return `<div class="mtg-celula" draggable="true" data-i="${i}" style="background:${bg};border-color:${br};color:${fg};" title="Arraste para mudar a ordem na folha">`
        + `<span class="mtg-celula-alca" aria-hidden="true">⋮⋮</span>`
        + `<span class="mtg-celula-rotulo">${rotulo}</span>`
        + `<button type="button" class="mtg-celula-btn" title="Repetir esta célula logo abaixo — a mesma peça, impressa duas vezes" onclick="event.stopPropagation(); duplicarCelulaDaMontagem(${i})">&#10697;</button>`
        + `<button type="button" class="mtg-celula-btn mtg-celula-tirar" title="Tirar só esta célula da folha" onclick="event.stopPropagation(); removerCelulaDaMontagem(${i})">&times;</button>`
        + `</div>`;
}

/** Desenha a lista, o selo, a trava e a folha. */
function renderMontagem() {
    const celulas = state.montagem.celulas;
    const modelos = state.montagem.modelos;
    const lista = document.getElementById('mtg-lista');
    const selo = document.getElementById('mtg-selo');
    const trava = document.getElementById('mtg-trava');
    const resumo = document.getElementById('mtg-resumo');
    const previa = document.getElementById('mtg-previa');
    const btnPdf = document.getElementById('mtg-btn-pdf');
    const btnLimpar = document.getElementById('mtg-btn-limpar');
    const badge = document.getElementById('badge-montagem');
    if (!lista) return;

    const total = totalDeCelulasDaMontagem(celulas);
    const porFolha = _mtgCelulasPorFolha(modelos);
    const conta = contaDaMontagem(celulas, porFolha);

    if (btnPdf) btnPdf.disabled = total === 0;
    if (btnLimpar) btnLimpar.disabled = modelos.length === 0 && total === 0;
    if (badge) {
        badge.textContent = String(total);
        badge.style.display = total ? '' : 'none';
    }

    // ── A trava ────────────────────────────────────────────────────────────
    // Nasce escondida e aparece com a primeira célula: o operador não escolhe
    // um formato num seletor, ele adiciona e a folha passa a dizer o que aceita.
    if (trava) {
        if (!modelos.length) {
            trava.style.display = 'none';
        } else {
            const p = modelos[0].peca;
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
        const pedidos = new Set(modelos.map(m => String(m.osId)));
        resumo.textContent = modelos.length
            ? `${pedidos.size} pedido(s) · ${modelos.length} modelo(s)` : '';
    }

    // ── A lista, por modelo ────────────────────────────────────────────────
    if (!modelos.length) {
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
              <tr><th>Pedido</th><th>Modelo</th><th style="text-align:right;">Tiragem</th><th>Posições</th><th style="text-align:right;">Células</th><th style="width:40px;"></th></tr>
              ${modelos.map((m, j) => {
                  // As posições deste modelo, com a repetição dita: "#6 ×2".
                  const vezes = {};
                  const ordem = [];
                  for (const p of celulasDoModelo(celulas, m)) {
                      if (!vezes[p]) { vezes[p] = 0; ordem.push(p); }
                      vezes[p]++;
                  }
                  const chips = ordem.map(p =>
                      `<span class="mtg-pos">#${p}${vezes[p] > 1 ? ' ×' + vezes[p] : ''}</span>`).join('');
                  const quantas = celulasDoModelo(celulas, m).length;
                  return `
                <tr class="mtg-linha${_mtgLinhaAtiva(m) ? ' mtg-linha-ativa' : ''}"
                    onclick="retomarDaMontagem(${j})"
                    title="Voltar a este modelo para acrescentar posições">
                  <td>${escapeHtml(String(m.pedidoNumero || m.osId))}</td>
                  <td><span style="color:var(--text);">${escapeHtml(String(m.itemId))}</span><br>
                      <span style="font-size:0.78rem;">${escapeHtml(String(m.nome).slice(0, 46))}</span></td>
                  <td style="text-align:right;" title="Quantos itens este modelo imprime ao todo — é contra este número que a posição vale.">${(m.qtd || 0).toLocaleString('pt-BR')}</td>
                  <td><span class="mtg-posicoes">${chips}</span></td>
                  <td style="text-align:right;">${quantas}</td>
                  <td style="text-align:right;"><span class="mtg-tirar" title="Tirar este modelo da montagem, com todas as células dele" onclick="event.stopPropagation(); removerDaMontagem(${j})">&times;</span></td>
                </tr>`;
              }).join('')}
            </table>
            <p class="mtg-dica" style="margin-top:10px;">
              Clique numa linha para <strong>voltar àquele modelo</strong> e acrescentar posições — elas se somam às que já estão lá.
            </p>`;
    }

    // ── O selo ─────────────────────────────────────────────────────────────
    // Mesma frase, mesmas cores e mesma regra do selo de sobra do Pedido:
    // verde quando a folha fecha certo, amarelo quando sobra célula. O amarelo
    // é reservado à sobra — pintar "fecha certo" de amarelo faria o amarelo
    // deixar de significar atenção.
    if (selo) {
        if (!total) {
            selo.style.display = 'none';
        } else if (!porFolha) {
            selo.className = 'selo-sobra';
            selo.style.display = 'flex';
            selo.innerHTML = `<span class="selo-sobra-texto">📄 ${total} célula(s) · não sei quantas cabem na folha deste formato</span>`;
        } else {
            selo.className = 'selo-sobra ' + (conta.vazias === 0 ? 'fecha-certo' : 'tem-sobra');
            selo.style.display = 'flex';
            const fim = conta.vazias === 0
                ? 'a folha fecha certo, sem sobra'
                : `sobram ${conta.vazias} célula(s) (${Math.round(conta.vazias / porFolha * 100)}% de uma folha)`;
            selo.innerHTML = `<span class="selo-sobra-texto">📄 ${conta.folhas} folha(s) · ${total} célula(s) · ${fim}</span>`;
        }
    }

    // ── A folha montada: todas as células, na ordem, folha a folha ─────────
    //
    // TODAS, e não só a primeira folha: é aqui que o operador arrasta, repete
    // e tira célula, e uma célula que estivesse na segunda folha sem aparecer
    // seria uma célula que ele não consegue mexer. As vazias só aparecem na
    // última folha, que é a única que pode ter sobra.
    if (previa) {
        const numFolha = document.getElementById('mtg-folha-num');
        if (!total || !porFolha) {
            previa.innerHTML = '';
            if (numFolha) numFolha.textContent = '';
        } else {
            const html = [];
            for (let f = 0; f < conta.folhas; f++) {
                if (conta.folhas > 1) {
                    html.push(`<div class="mtg-folha-titulo">Folha ${f + 1} de ${conta.folhas}</div>`);
                }
                for (let p = 0; p < porFolha; p++) {
                    const i = f * porFolha + p;
                    html.push(i < total
                        ? _mtgHtmlDaCelula(celulas[i], i, modelos)
                        : '<div class="mtg-celula mtg-celula-vazia">vazia</div>');
                }
            }
            previa.innerHTML = html.join('');
            if (numFolha) {
                numFolha.textContent = conta.folhas > 1
                    ? `${conta.folhas} FOLHAS · ${total} CÉLULAS`
                    : `1 FOLHA · ${total} CÉLULA(S)`;
            }
        }
    }
}

/** Chamada ao entrar na tela. */
async function abrirMontagem() {
    if (!state.montagem || !state.montagem.celulas) {
        state.montagem = { celulas: [], modelos: [], pedidoSel: null, modeloSel: null };
    }
    encherPedidosDaMontagem();
    _mtgLigarArrasto();
    onMontagemPosicoesChange();
    renderMontagem();
    // As pastas da estacao entram DEPOIS, sem segurar a tela: a rota tem prazo
    // de 1,5s para conferir cada pasta (pasta de rede fora do ar trava o
    // os.path.isdir), e o operador nao precisa esperar por isso para digitar.
    encherPastasDaMontagem();
}

/* ════════════════════════════════════════════════════════════════════════════
   ONDE O PDF VAI PARAR
   ════════════════════════════════════════════════════════════════════════════

   A primeira versao entregava o PDF com `window.open(blobUrl)`, e em producao
   isso nao entregava nada. O navegador so' deixa abrir janela nova enquanto o
   gesto do operador ainda vale -- o Chrome da' cinco segundos --, e uma folha
   montada demora mais do que isso. O trabalho era gerado (o log do agente
   registrou as tres tentativas de 29/08, todas com as duas artes) e sumia sem
   erro nenhum na tela: o toast dizia "montagem gerada" e nao havia PDF.

   Agora ha dois caminhos, e nenhum depende de janela nova:

   - GRAVAR NA PASTA da estacao. Quem abre o seletor de pastas e quem escreve
     no disco e' o agente, nao o navegador -- por isso funciona em qualquer
     navegador da grafica, sem permissao e sem configuracao. E' a mesma lista
     de pastas autorizadas, e o mesmo `soltar()`, que a tela do Pedido ja usa
     para o hot folder do RIP: pasta so' entra na lista pelo seletor nativo, e
     a estacao recusa gravar em pasta que nao esta nela.
   - BAIXAR pelo navegador, quando nao ha pasta escolhida. Um `<a download>`
     nao e' bloqueado por bloqueador de pop-up nenhum.

   E, marcada a caixa, o PDF ainda ABRE NA TELA, na mesma janela do painel --
   a lightbox que o anexo do pedido ja usa.
*/

/** A pasta escolhida, ou '' -- que quer dizer "baixar pelo navegador". */
function pastaDaMontagem() {
    const sel = document.getElementById('mtg-pasta');
    return sel ? String(sel.value || '').trim() : '';
}

/** O PDF abre na tela ao terminar? */
function abrirNaTelaDaMontagem() {
    return document.getElementById('mtg-abrir')?.checked === true;
}

/**
 * O nome do arquivo, com data E hora.
 *
 * Com a hora porque duas montagens do mesmo dia sao a regra, nao a excecao --
 * a gente refaz celula o dia inteiro. O `soltar()` da estacao ainda desvia
 * para "nome (2).pdf" se houver colisao, mas um nome que ja nasce distinto e'
 * o que o operador consegue reconhecer na pasta sem abrir.
 */
function nomeDoArquivoDaMontagem(quando) {
    const d = quando || new Date();
    const p = n => String(n).padStart(2, '0');
    return 'montagem_' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + '_' + p(d.getHours()) + p(d.getMinutes()) + '.pdf';
}

/** A dica embaixo do seletor diz o que vai acontecer com o arquivo. */
function _mtgDicaDoDestino() {
    const dica = document.getElementById('mtg-destino-dica');
    if (!dica) return;
    dica.textContent = pastaDaMontagem()
        ? 'Quem grava é a estação, direto no disco. Se esta for a pasta que o RIP observa, '
          + 'o material entra na fila de impressão assim que o arquivo chegar.'
        : 'Sem pasta escolhida, o PDF desce pelos downloads do navegador desta máquina.';
}

/**
 * Enche o seletor com as pastas que esta estacao ja autorizou.
 *
 * Falha em silencio de proposito: sem estacao no ar o seletor fica so' com
 * "Baixar pelo navegador", que continua funcionando. Barrar a tela por causa
 * da lista de pastas seria travar o operador por um detalhe do destino.
 */
async function encherPastasDaMontagem() {
    const sel = document.getElementById('mtg-pasta');
    if (!sel) return;

    let lembrada = '';
    try { lembrada = localStorage.getItem('montagem_pasta') || ''; } catch (_) {}
    const anterior = pastaDaMontagem() || lembrada;

    let pastas = [];
    try {
        const base = await _mtgEstacao();
        if (base) {
            const r = await fetch(base + '/api/hotfolder/listar', { signal: AbortSignal.timeout(6000) });
            const d = r.ok ? await r.json() : null;
            if (d && Array.isArray(d.pastas)) pastas = d.pastas;
        }
    } catch (e) {
        console.warn('[montagem] nao consegui listar as pastas da estacao:', e);
    }

    // `existe === false` e' "conferi e nao achei"; `null` e' "nao deu tempo de
    // conferir" -- pasta de rede lenta. Acusar de sumida quem so' demorou seria
    // mentir, entao so' quem responde `false` sai marcado.
    sel.innerHTML = '<option value="">Baixar pelo navegador</option>'
        + pastas.map(p => '<option value="' + escapeHtml(p.path) + '">' + escapeHtml(p.nome)
            + (p.existe === false ? ' (não encontrada)' : '') + '</option>').join('');

    if (anterior && pastas.some(p => p.path === anterior)) sel.value = anterior;
    _mtgDicaDoDestino();
}

/** Guarda a escolha para a proxima montagem desta maquina. */
function onMontagemPastaChange() {
    try { localStorage.setItem('montagem_pasta', pastaDaMontagem()); } catch (_) {}
    _mtgDicaDoDestino();
}

/**
 * Abre o seletor de pastas NA ESTACAO.
 *
 * A resposta demora o tempo que o operador levar para escolher: e' uma janela
 * modal do Windows, aberta na maquina, e nao ha como ser diferente -- o
 * navegador nao enxerga o disco de la.
 */
async function escolherPastaDaMontagem() {
    const btn = document.getElementById('mtg-btn-pasta');
    const rotulo = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Escolha na janela&hellip;'; }
    try {
        const base = await _mtgEstacao();
        if (!base) {
            throw new Error('nenhuma estação respondeu — abra o agente NewProd nesta máquina');
        }
        const r = await fetch(base + '/api/hotfolder/escolher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inicial: pastaDaMontagem() }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (d.cancelado) return;
        if (!d.ok) throw new Error(d.detail || 'a estação recusou a pasta');

        await encherPastasDaMontagem();
        const sel = document.getElementById('mtg-pasta');
        if (sel) sel.value = d.path;
        onMontagemPastaChange();
        if (typeof toast === 'function') toast('O PDF será gravado em ' + d.path, 'success');
    } catch (e) {
        console.error('[montagem]', e);
        if (typeof toast === 'function') {
            toast('Não deu para abrir o seletor de pastas: ' + (e.message || e)
                + '. Deixe em "Baixar pelo navegador" e o PDF desce pelos downloads.', 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = rotulo; }
    }
}

/** Grava o PDF na pasta da estacao e devolve o caminho gravado. */
async function gravarPdfNaEstacao(base, pasta, blob, nome) {
    const fd = new FormData();
    fd.append('file', blob, nome);
    fd.append('folder', pasta);
    const r = await fetch(base + '/api/hotfolder/drop', { method: 'POST', body: fd });
    if (!r.ok) {
        let motivo = 'HTTP ' + r.status;
        try { motivo = (await r.json()).detail || motivo; } catch (_) {}
        throw new Error(motivo);
    }
    const d = await r.json();
    return d.path || pasta;
}

/** O caminho que sempre funciona: baixar pelo navegador. */
function baixarPdfDaMontagem(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Abre o PDF na tela, na mesma janela do painel.
 *
 * O endereco do PDF anterior e' devolvido ao navegador ao abrir o proximo: sao
 * dezenas de MB por montagem, e o operador faz varias por turno.
 */
function abrirPdfDaMontagemNaTela(blob, nome) {
    if (window._mtgUrlAberta) {
        try { URL.revokeObjectURL(window._mtgUrlAberta); } catch (_) {}
    }
    window._mtgUrlAberta = URL.createObjectURL(blob);
    if (typeof openAnexoLightbox === 'function') {
        openAnexoLightbox(window._mtgUrlAberta, nome, 'pdf');
    }
}

/* ════════════════════════════════════════════════════════════════════════════
   AS ARTES — montadas pelas MESMAS funções da tela do Pedido
   ════════════════════════════════════════════════════════════════════════════

   `arteDoModeloParaFolha` e `arteParaOMotor` (pedido.js) são o corpo da
   `runPedImposition`, extraído em 03/09/2026 para que esta tela e a do Pedido
   montem a mesma arte para o mesmo modelo. A primeira versão da Montagem
   montava a sua, e divergia em sete pontos — cada um deles uma célula refeita
   diferente da original:

     1. o verso: lia `arte_verso_url`, campo que não existe, e mandava
        `print_mode: 'simplex'`, que o motor não conhece — o verso nunca saía;
     2. a arte da frente ia sem o filtro `arteParaImpor`, que barra a amostra
        de aprovação (JPEG a 150 dpi, com a logo no QR);
     3. os bancos do pedido e o CSV não eram garantidos antes do payload;
     4. o `csv_data` ia inteiro, sem a fatia do modelo e sem o limite da
        quantidade, e a posição N apontava para outra linha do banco;
     5. a escala da arte de cada modelo (`arte_escala_h/v`) ficava em 100%;
     6. a rotação da folha ia 0 fixo, ignorando o formato;
     7. os elementos marcados como Layout iam junto (o motor de hoje os ignora;
        um agente antigo, não).

   Nada disso é regra desta tela. É regra da tela do Pedido, e por isso mora
   lá — aqui só se chama.
*/

/**
 * Uma arte pronta para o motor por modelo da montagem, na ordem de `modelos`.
 *
 * Pedido a pedido, em série, porque `state.bancosDoPedido` e
 * `state.vinculosDeBanco` guardam os bancos de UM pedido por vez — é assim que
 * a tela de Amostras e a do Pedido trabalham, e o `resolverNumeracaoParaModelo`
 * lê dali. Carregar os bancos do pedido B antes de montar as artes do pedido A
 * deixaria as artes de A sem o banco delas. Então: carrega A, monta as artes
 * de A; carrega B, monta as de B.
 *
 * Cada arte sai com `_tiragem`: quantos itens daquele modelo têm como sair
 * certo (ver `totalDeItensDoModelo`). É contra ela que as posições da folha
 * são conferidas na hora de gerar.
 *
 * Lança com a mensagem para o operador quando não há como montar certo — e
 * nunca deixa passar uma arte cuja numeração pede banco e chegou sem linha
 * nenhuma, que é o defeito mais silencioso deste sistema: sai número
 * sequencial no lugar do nome, sem erro em tela.
 */
async function prepararArtesDaMontagem(modelos) {
    if (typeof arteDoModeloParaFolha !== 'function' || typeof arteParaOMotor !== 'function') {
        throw new Error('O painel desta estação está desatualizado: falta o construtor de arte '
            + 'da tela do Pedido (pedido.js). Atualize o agente NewProd e tente de novo.');
    }

    const artes = new Array((modelos || []).length).fill(null);
    const ordemDosPedidos = [];
    const indicesPorPedido = {};
    (modelos || []).forEach((m, j) => {
        const k = String(m.osId);
        if (!indicesPorPedido[k]) { indicesPorPedido[k] = []; ordemDosPedidos.push(k); }
        indicesPorPedido[k].push(j);
    });

    for (const osId of ordemDosPedidos) {
        if (!(state.osItens[osId] || []).length && typeof loadOSItens === 'function') {
            try { await loadOSItens(osId); } catch (e) { console.warn('[montagem]', e); }
        }
        const itens = state.osItens[osId] || [];

        // Os bancos do PEDIDO, e a certeza de que foram lidos.
        if (typeof garantirBancosDoTrabalho === 'function') {
            await garantirBancosDoTrabalho([osId]);
        }
        if (typeof pedidosComBancoDesconhecido === 'function'
            && pedidosComBancoDesconhecido([osId]).length) {
            throw new Error('Não consegui ler os bancos de dados do pedido ' + _mtgNumeroDoPedido(osId)
                + '. Gerar agora sairia com número sequencial no lugar do código. '
                + 'Confira a conexão da estação e clique de novo.');
        }

        // E o CSV de cada numeração que estes modelos usam.
        const ids = indicesPorPedido[osId].map(j => {
            const it = itens.find(i => String(i.id) === String(modelos[j].itemId));
            if (!it) return null;
            return (typeof numeracaoIdDoItem === 'function')
                ? numeracaoIdDoItem(it) : (it.amostra_num_id || it.numeracao_id);
        }).filter(Boolean);
        if (typeof garantirCsvDoTrabalho === 'function') {
            await garantirCsvDoTrabalho(ids);
        }

        for (const j of indicesPorPedido[osId]) {
            const m = modelos[j];
            const it = itens.find(i => String(i.id) === String(m.itemId));
            if (!it) {
                throw new Error('O modelo ' + m.itemId + ' do pedido ' + _mtgNumeroDoPedido(osId)
                    + ' não está mais no pedido. Tire-o da montagem e gere de novo.');
            }

            const arte = arteDoModeloParaFolha({ osId: m.osId, itemId: m.itemId }, null, { comPrevia: false });
            // Uma caixa para a montagem inteira, e não a opção salva em cada
            // modelo — ver `imprimirNumeroNaMontagem`.
            arte._imprimirNumero = imprimirNumeroNaMontagem();

            const pronta = arteParaOMotor(arte, true);
            if (typeof numeracaoSemElementosDeLayout === 'function') {
                if (pronta.numeracao) pronta.numeracao = numeracaoSemElementosDeLayout(pronta.numeracao);
                if (pronta.numeracao_2) pronta.numeracao_2 = numeracaoSemElementosDeLayout(pronta.numeracao_2);
            }
            pronta._tiragem = totalDeItensDoModelo(it, pronta.numeracao);
            artes[j] = pronta;
        }
    }

    // A última conferência, sobre as artes PRONTAS: numeração que lê banco e
    // chegou sem linha nenhuma não vai ao motor. Ver `bancoVazioNoPayload`.
    if (typeof bancoVazioNoPayload === 'function') {
        const semBanco = bancoVazioNoPayload(null, artes);
        if (semBanco.length) {
            throw new Error((typeof recadoDeBancoVazio === 'function')
                ? recadoDeBancoVazio(semBanco)
                : 'A numeração ' + semBanco.join(', ') + ' lê um banco do pedido e chegou sem linhas.');
        }
    }

    return artes;
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
 *
 * `artes[j]` é a arte pronta de `modelos[j]` (ver `prepararArtesDaMontagem`).
 * O deslocamento das posições usa a `qtd` da ARTE, que é o que o motor conta —
 * e não a tiragem guardada na lista, que é a mesma conta feita mais cedo e
 * pode ter envelhecido.
 */
function payloadDaMontagem(celulas, modelos, artes) {
    const primeiro = modelos[0].peca;
    // O formato e a saida vem da PECA — resolvidos uma vez, no `pecaDaMontagem`.
    // Buscar de novo aqui abriria espaco para a tela e o payload discordarem,
    // que foi o defeito de 29/08/2026.
    const fmt = (state.formatos || []).find(f => String(f.id) === String(primeiro.formato_id)) || null;
    const sai = (state.saidas || []).find(s => String(s.id) === String(primeiro.saida_id)) || null;

    const comTiragemDoMotor = modelos.map((m, j) =>
        Object.assign({}, m, { qtd: (artes[j] && artes[j].qtd) || m.qtd }));

    return {
        // Sem pedido e sem modelo "do trabalho": cada arte carrega os seus, e
        // numa folha que mistura pedidos o do trabalho seria o de um deles.
        pedido: null,
        modelo: null,
        formato_id: primeiro.formato_id,
        saida_id: primeiro.saida_id,
        formato: fmt,
        saida: sai,
        numeracao_id: null,
        numeracao: null,
        numeracao_2_id: null,
        numeracao_2: null,
        // `schema`, que e' a chave que o app.py le. A primeira versao mandava
        // `layout_schema`, que ele ignora.
        schema: 'multi_artes',
        multi_artes: artes,
        suggested_filename: 'montagem_' + new Date().toISOString().slice(0, 10) + '.pdf',
        stream: false,
        print_mode: modoDaFolhaDaMontagem(modelos),
        rotate_page: (typeof rotacaoDaFolhaDoFormato === 'function') ? rotacaoDaFolhaDoFormato(fmt) : 0,
        seq_start: 1,
        seq_increment: 1,
        cut_stack_mode: 'independent',
        sheets_per_block: 50,
        block_depth: 1,
        c_ini: 1,
        q_cam: 0,
        l_cam: 1,
        // Aqui está a tradução. Ver posicoesCombinadas().
        refazer_de: 0,
        refazer_ate: 0,
        refazer_set: 1,
        refazer_celulas: posicoesCombinadas(celulas, comTiragemDoMotor),
        // O ⧉: célula repetida imprime duas vezes. Sem esta chave o motor tira
        // as repetidas, que é o certo para o Refazer Célula do Pedido.
        refazer_repetir: true,
        // A escala vai POR ARTE (ver `arteParaOMotor`); a do trabalho é a reserva.
        arte_escala_h: 100,
        arte_escala_v: 100,
        entregar_por_bloco: false,
    };
}

/**
 * Monta o payload, manda gerar e ENTREGA o arquivo.
 *
 * Quem gera é SEMPRE a estação. Não há caminho para a nuvem, e não é por
 * desempenho apenas: impressão só acontece pela estação da gráfica. Sem agente
 * respondendo, a resposta certa ao operador é que não dá — e não um plano B.
 *
 * A entrega tem três partes, e estão separadas de propósito: gravar na pasta
 * pode falhar por motivo do DISCO (a pasta sumiu, a rede caiu) muito depois de
 * a montagem ter dado certo. Nesse caso o PDF não se perde — ele desce pelo
 * navegador, e o operador fica sabendo o que falhou. Ver o bloco "ONDE O PDF
 * VAI PARAR" acima.
 */
async function gerarPdfDaMontagem() {
    const celulas = state.montagem.celulas;
    const modelos = state.montagem.modelos;
    if (!celulas.length || !modelos.length) return;

    const btn = document.getElementById('mtg-btn-pdf');
    const rotulo = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Montando…'; }

    const pasta = pastaDaMontagem();
    const nome = nomeDoArquivoDaMontagem();

    try {
        const base = await _mtgEstacao();
        if (!base) {
            throw new Error('Nenhuma estação respondeu. A montagem é gerada na estação da gráfica — '
                + 'abra o agente NewProd nesta máquina e tente de novo.');
        }

        // As artes, pelas funções da tela do Pedido — com os bancos na mão.
        const artes = await prepararArtesDaMontagem(modelos);

        // O banco pode ter mudado desde que a célula entrou na folha.
        const fora = celulasForaDaTiragem(celulas, modelos, artes);
        if (fora.length) {
            const lista = fora.slice(0, 6).map(c => `#${c.pos} do modelo ${c.itemId}`).join(', ');
            throw new Error('Posição que não existe mais: ' + lista
                + (fora.length > 6 ? ' e mais ' + (fora.length - 6) : '')
                + '. O banco do modelo mudou desde que a célula entrou. Tire-a da folha '
                + 'e confira a tiragem na lista.');
        }

        const payload = payloadDaMontagem(celulas, modelos, artes);
        payload.suggested_filename = nome;
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
        const total = totalDeCelulasDaMontagem(celulas);

        let onde = '';
        if (pasta) {
            try {
                onde = await gravarPdfNaEstacao(base, pasta, blob, nome);
            } catch (e) {
                console.error('[montagem] a estação não gravou na pasta:', e);
                if (typeof toast === 'function') {
                    toast('Não deu para gravar em ' + pasta + ': ' + (e.message || e)
                        + '. O PDF está descendo pelos downloads do navegador.', 'warning');
                }
                baixarPdfDaMontagem(blob, nome);
            }
        } else {
            baixarPdfDaMontagem(blob, nome);
        }

        if (abrirNaTelaDaMontagem()) abrirPdfDaMontagemNaTela(blob, nome);

        if (typeof toast === 'function') {
            toast(onde
                ? `Montagem gerada (${total} célula(s)) e gravada em ${onde}`
                : `Montagem gerada: ${total} célula(s). O PDF desceu pelos downloads.`, 'success');
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

if (typeof window !== 'undefined') {
    window.abrirMontagem = abrirMontagem;
    window.pedidosParaMontagem = pedidosParaMontagem;
    window.encherPedidosDaMontagem = encherPedidosDaMontagem;
    window.onMontagemPedidoChange = onMontagemPedidoChange;
    window.onMontagemModeloChange = onMontagemModeloChange;
    window.onMontagemPosicoesChange = onMontagemPosicoesChange;
    window.adicionarNaMontagem = adicionarNaMontagem;
    window.removerDaMontagem = removerDaMontagem;
    window.retomarDaMontagem = retomarDaMontagem;
    window.duplicarCelulaDaMontagem = duplicarCelulaDaMontagem;
    window.removerCelulaDaMontagem = removerCelulaDaMontagem;
    window.moverCelulaDaMontagem = moverCelulaDaMontagem;
    window.limparMontagem = limparMontagem;
    window.renderMontagem = renderMontagem;
    window.prepararArtesDaMontagem = prepararArtesDaMontagem;
    window.gerarPdfDaMontagem = gerarPdfDaMontagem;
    window.payloadDaMontagem = payloadDaMontagem;
    window.imprimirNumeroNaMontagem = imprimirNumeroNaMontagem;
    window.pastaDaMontagem = pastaDaMontagem;
    window.abrirNaTelaDaMontagem = abrirNaTelaDaMontagem;
    window.nomeDoArquivoDaMontagem = nomeDoArquivoDaMontagem;
    window.encherPastasDaMontagem = encherPastasDaMontagem;
    window.onMontagemPastaChange = onMontagemPastaChange;
    window.escolherPastaDaMontagem = escolherPastaDaMontagem;
    window.gravarPdfNaEstacao = gravarPdfNaEstacao;
    window.baixarPdfDaMontagem = baixarPdfDaMontagem;
    window.abrirPdfDaMontagemNaTela = abrirPdfDaMontagemNaTela;
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
