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

   O motor ganhou duas coisas por causa desta tela:
   `refazer_repetir` (03/09/2026) faz posição repetida imprimir duas vezes —
   é o ⧉ de cada célula; e `nome_size` / `nome_pos` / `nome_rot` tornam
   configurável o número do modelo que ele imprime na borda do item, que até
   então só aceitava a cor.

   ── O QUE ESTA TELA FAZ ──────────────────────────────────────────────────

   Traduz. O operador pensa em "a posição 6 do modelo 1000565"; o motor espera
   posições no fluxo combinado. `posicoesCombinadas()` faz a conta, e ela é a
   função mais delicada do arquivo — ver o comentário lá.

   E monta cada arte EXATAMENTE como a tela do Pedido monta — pelas mesmas
   funções (`arteDoModeloParaFolha` e `arteParaOMotor`, do pedido.js). A
   primeira versão montava a sua própria arte, e uma célula refeita aqui saía
   diferente da original em sete coisas. Ver `prepararArtesDaMontagem()`.

   ── O REDESENHO DE 03/09/2026 ────────────────────────────────────────────

   Pedido do usuário: *"rever usabilidade geral, precisamos a janela de
   visualização da Folha Montada maior com melhor nível de detalhamento e
   posição privilegiada, também precisamos montar na visualização o número do
   modelo, com opção de alterar posição, rotação, tamanho da fonte e cor na
   impressão, maior controle sobre as ações"*.

   O que mudou, e por quê:

   · A FOLHA TROCOU DE LUGAR. Ela vivia numa coluna fixa de 380 px na direita
     enquanto a tabela de modelos tomava a largura toda. Mas o trabalho do
     operador acontece na folha — é lá que ele arrasta, repete e tira. A folha
     foi para a esquerda, a tabela virou referência compacta ao lado.

   · A FOLHA É UMA FOLHA, não uma lista. Até aqui a prévia empilhava as células
     verticalmente, sempre. Isso só está certo para o Triband, que é 1 coluna
     por 10 linhas; numa credencial PVC (2 × 2) a tela mostrava quatro linhas
     empilhadas e o papel saía em quadrado — a prévia mentia sobre a posição.
     Agora ela desenha a GRADE do formato, na proporção real, pela mesma
     geometria que o motor usa (ver `geometriaDaFolha`).

   · O NÚMERO DO MODELO APARECE NA CÉLULA, na posição, rotação, tamanho e cor
     que vão para o papel. Conferir isso antes de gerar era impossível.

   · DESFAZER E REFAZER. Era a falta mais grave: um × no lugar errado apagava
     a célula sem volta, e o operador tinha de reescolher o pedido, esperar o
     carregamento e redigitar.

   ── A JANELA SEM ROLAGEM, DE 04/09/2026 ──────────────────────────────────

   Pedido do usuário: *"trazer a janela de visualização de forma que não
   precise utilizar o scroll, abrindo a janela no tamanho do formato. Como já
   funciona no painel de produção na edição do pedido/MODELO"*.

   O que ele encontrava: a tela abria no modo `Peça`, que amplia as células até
   encherem a largura. Numa tira Triband isso dava uma folha de 3.389 px de
   altura numa área de 740 px — quatro telas e meia de rolagem —, e as folhas
   ainda vinham empilhadas uma embaixo da outra.

   Três mudanças, e as três copiam a janela do Pedido:

   · A TELA ABRE NO MODO `Folha`, que é o que cabe: a escala vem da largura E
     da altura da janela, então o papel inteiro aparece. `Peça` e `100%`
     continuam ali para ampliar — aí a janela rola, mas por escolha do
     operador, não porque ele abriu a tela.

   · UMA FOLHA POR VEZ, com o seletor `Folha ‹ 1 › de 2` na barra — o mesmo
     par de setas do seletor de páginas da janela do Pedido. Duas folhas
     empilhadas nunca caberiam na tela.

   · A ALTURA É MEDIDA, e não escrita num `calc()` do CSS. Ver
     `alturaDaJanelaDaMontagem` e `_mtgAjustarAlturaDaJanela`.

   O que a mudança tirou, e por onde voltou:

   · O arrasto de uma célula para OUTRA folha, que existia porque as duas
     estavam na tela. Voltou como gesto: soltar a célula sobre a seta a manda
     para a folha vizinha (ver `_mtgLigarArrasto`). Pelo teclado, as setas já
     atravessavam a fronteira, e agora a janela vai junto.

   · O ⧉ e o × DENTRO da célula, que numa tira de 21 px não cabem. Voltaram
     pela barra da seleção, que passou a aparecer com UMA célula marcada — até
     aqui ela só aparecia com duas ou mais, justamente porque "com uma só, os
     botões da própria célula já resolvem".
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
function montagemVazia() {
    return {
        celulas: [],
        modelos: [],
        pedidoSel: null,
        modeloSel: null,
        // Os índices das células selecionadas. Repetir, tirar e mover passam a
        // valer para todas de uma vez — repor doze células custava doze cliques.
        selecao: [],
        // A JANELA MOSTRA UMA FOLHA POR VEZ, no tamanho do formato. Ver
        // `folhaVisivelDaMontagem` e `_mtgRenderFolha`.
        zoom: 'folha',
        folha: 0,
        numero: numeroPadraoDaMontagem(),
        // Instantâneos para o desfazer. Ver `guardarNaHistoria`.
        historia: [],
        futuro: [],
    };
}

if (typeof state !== 'undefined' && state && (!state.montagem || !state.montagem.celulas)) {
    state.montagem = montagemVazia();
}

/* ══════════════════════════════════════════════════════════════════════════
   O NÚCLEO — funções puras, que o harness roda sem tela nenhuma
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Como o número do modelo sai impresso, antes de o operador mexer.
 *
 * Os quatro valores reproduzem EXATAMENTE o que o motor sempre fez, e é por
 * isso que ligar a caixa hoje imprime o mesmo de ontem: 14 pt, na borda
 * esquerda, girado 90 graus, preto. Novidade que muda o papel entra no padrão
 * de hoje, e o operador escolhe sair dele.
 *
 * `imprimir` nasce DESLIGADO, como a caixa equivalente da tela do Pedido.
 */
function numeroPadraoDaMontagem() {
    return { imprimir: false, pos: 'esquerda', rot: 90, size: 14, cor: '#000000' };
}

/** Os quatro valores que o motor aceita em cada campo. */
const MTG_POSICOES_DO_NUMERO = ['esquerda', 'direita', 'topo', 'base'];
const MTG_ROTACOES_DO_NUMERO = [0, 90, 180, 270];
const MTG_TAMANHO_MIN = 6;
const MTG_TAMANHO_MAX = 24;

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
 * A peça normalizada: o que a conferência compara, o que o payload usa e o que
 * a folha desenha.
 *
 * Existe para os três lerem a MESMA coisa. Enquanto a conferência olhava
 * `item.formato_id` cru e o payload resolvia por outro caminho, dava para a
 * tela aceitar uma célula que o motor recusaria — que foi exatamente o que
 * aconteceu.
 *
 * As medidas em milímetros entraram em 03/09/2026, para a folha ser desenhada
 * na grade e na proporção reais em vez de uma pilha vertical.
 */
function pecaDaMontagem(item) {
    const fmt = formatoDoItem(item);
    const cols = fmt ? (parseInt(fmt.cols) || 0) : 0;
    const rows = fmt ? (parseInt(fmt.rows) || 0) : 0;
    return {
        formato_id: fmt ? String(fmt.id) : '',
        formato_nome: fmt ? (fmt.nome || '') : '',
        cols: cols,
        rows: rows,
        celulas_por_folha: cols * rows,
        item_w_mm: fmt ? (parseFloat(fmt.width_mm) || 0) : 0,
        item_h_mm: fmt ? (parseFloat(fmt.height_mm) || 0) : 0,
        gap_h_mm: fmt ? (parseFloat(fmt.gap_h_mm) || 0) : 0,
        gap_v_mm: fmt ? (parseFloat(fmt.gap_v_mm) || 0) : 0,
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
 * ONDE a célula `i` cai na folha: em que folha, linha e coluna.
 *
 * Esta é a conta do MOTOR, e não uma escolha de desenho. No caminho compactado
 * do `engine.py` (`if empacotando:`) a célula é consumida assim:
 *
 *     k = S * poses_per_sheet + P,  com  P = row * cols + col
 *
 * Ou seja: LINHA primeiro, da esquerda para a direita, de cima para baixo. A
 * prévia antiga empilhava tudo numa coluna, o que só coincide com a verdade
 * quando o formato tem uma coluna só — o Triband. Numa credencial PVC (2 × 2)
 * a tela mostrava quatro linhas e o papel saía em quadrado.
 */
function lugarDaCelulaNaFolha(i, cols, rows) {
    const c = parseInt(cols) || 1;
    const r = parseInt(rows) || 1;
    const porFolha = c * r;
    const p = i % porFolha;
    return {
        folha: Math.floor(i / porFolha),
        linha: Math.floor(p / c),
        coluna: p % c,
    };
}

/**
 * As medidas da folha em MILÍMETROS, pela mesma geometria do motor.
 *
 * O `engine.py` calcula, com tudo em pontos:
 *
 *     used_w  = cols * item_w + (cols - 1) * gap_h
 *     start_x = (sheet_w - used_w) / 2
 *
 * Aqui é a mesma conta em mm, e é ela que faz a prévia coincidir com o papel.
 * `null` quando não dá para saber (peça sem formato, saída não encontrada) —
 * quem chama desenha a lista simples nesse caso, em vez de inventar medida.
 */
function geometriaDaFolha(peca, saida) {
    if (!peca || !peca.cols || !peca.rows || !peca.item_w_mm || !peca.item_h_mm) return null;

    const sheetW = saida ? (parseFloat(saida.width_mm) || 0) : 0;
    const sheetH = saida ? (parseFloat(saida.height_mm) || 0) : 0;

    const usedW = peca.cols * peca.item_w_mm + (peca.cols - 1) * peca.gap_h_mm;
    const usedH = peca.rows * peca.item_h_mm + (peca.rows - 1) * peca.gap_v_mm;

    return {
        cols: peca.cols,
        rows: peca.rows,
        itemW: peca.item_w_mm,
        itemH: peca.item_h_mm,
        gapH: peca.gap_h_mm,
        gapV: peca.gap_v_mm,
        usedW: usedW,
        usedH: usedH,
        sheetW: sheetW || usedW,
        sheetH: sheetH || usedH,
        startX: sheetW ? (sheetW - usedW) / 2 : 0,
        startY: sheetH ? (sheetH - usedH) / 2 : 0,
        // Sem saída conhecida a folha é a própria área imposta: melhor desenhar
        // a grade certa sem o papel em volta do que inventar um papel.
        temPapel: !!(sheetW && sheetH),
    };
}

/**
 * Quantos píxeis vale um milímetro, no modo de zoom escolhido.
 *
 *   · `peca`  — as células enchem a largura. É o modo de trabalho: conferir o
 *               conteúdo de cada uma, que é o que o operador faz aqui.
 *   · `folha` — a folha inteira cabe na área. É onde a SOBRA aparece pelo
 *               tamanho, e não só por um número no selo.
 *   · `100`   — tamanho real, a 96 dpi. Para conferir corpo de fonte.
 */
function escalaDaFolhaDaMontagem(zoom, geo, largura, altura) {
    if (!geo) return 0;
    if (zoom === '100') return 96 / 25.4;
    if (zoom === 'folha') {
        const w = geo.sheetW > 0 ? (largura / geo.sheetW) : 0;
        const h = geo.sheetH > 0 ? (altura / geo.sheetH) : 0;
        return Math.max(0.1, Math.min(w, h));
    }
    return geo.usedW > 0 ? Math.max(0.1, largura / geo.usedW) : 0;
}

/**
 * Qual folha a janela mostra, presa entre a primeira e a última que existem.
 *
 * A janela mostra UMA folha por vez — pedido do usuário em 04/09/2026:
 * *"trazer a janela de visualização de forma que não precise utilizar o
 * scroll, abrindo a janela no tamanho do formato. Como já funciona no painel
 * de produção na edição do pedido/MODELO"*. Empilhadas, duas folhas nunca
 * caberiam na tela; uma de cada vez cabe, e as outras ficam a uma seta de
 * distância, como na janela do Pedido.
 *
 * O prendedor não é enfeite: tirar as células da última folha some com ela, e
 * sem isto a janela ficaria apontando para uma folha que não existe mais.
 */
function folhaVisivelDaMontagem(folha, folhas) {
    const n = parseInt(folha);
    if (!folhas || folhas < 1) return 0;
    if (isNaN(n) || n < 0) return 0;
    return Math.min(n, folhas - 1);
}

/**
 * A altura da janela: o que sobra da tela para ela, depois de todo o resto.
 *
 * Medida, e não chutada num `calc()` do CSS. O que vem acima muda de altura
 * sozinho — o compositor quebra em duas linhas em tela estreita, a trava e a
 * recusa aparecem quando o modelo não cabe, a barra da seleção múltipla
 * aparece com duas células marcadas — e uma constante no CSS erraria em todos
 * esses casos. `restoDoCard` é o que divide o card com ela: a barra do título,
 * o selo da sobra, a linha dos atalhos e os paddings.
 *
 * O piso de 380 px é o ponto em que a folha ainda diz alguma coisa. Numa tela
 * baixa a conta desce abaixo disso, e aí é melhor a página rolar um pouco do
 * que a folha virar uma tarja — o que o operador precisa ver é a folha.
 */
function alturaDaJanelaDaMontagem(topoDoCard, alturaDaTela, restoDoCard) {
    const sobra = (alturaDaTela || 0) - (topoDoCard || 0) - (restoDoCard || 0) - 24;
    return Math.max(380, Math.round(sobra));
}

/**
 * Repete a célula `i` logo depois dela — a mesma peça, impressa duas vezes.
 *
 * Pedido do usuário em 03/09/2026: "ícone que duplica o modelo na próxima
 * célula", e ele confirmou o comportamento: *"duplicar deve ocupar a próxima
 * célula da imposição movendo todas as outras para a célula subsequente"*.
 * A cópia é IGUAL: mesmo pedido, mesmo modelo, mesma posição — e por isso o
 * mesmo código de QR. Não é a posição seguinte do modelo: para essa, o
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
 * Repete as células que já estão na folha até fechá-la, sem sobra.
 *
 * A sobra é papel pago igual: uma folha de PVC com duas células vazias custa o
 * mesmo que uma cheia. Isto percorre as células na ordem, em voltas, repetindo
 * cada uma logo depois da sua cópia anterior — assim o material sai agrupado,
 * que é o que facilita separar depois de cortar.
 *
 * Devolve o que FOI feito, para a tela poder dizer antes de fazer: nenhuma
 * decisão de papel deste projeto acontece calada.
 */
function completarAFolha(celulas, porFolha) {
    const p = parseInt(porFolha) || 0;
    const n = (celulas || []).length;
    if (!p || !n) return { celulas: celulas, entraram: 0 };

    const resto = n % p;
    if (resto === 0) return { celulas: celulas, entraram: 0 };

    const faltam = p - resto;
    // Da ÚLTIMA para a primeira, inserindo cada cópia logo depois da original:
    // percorrer do fim evita que uma inserção mova o índice das que ainda não
    // foram copiadas.
    const originais = celulas.slice();
    let entraram = 0;
    let volta = 0;
    while (entraram < faltam) {
        const alvo = originais[entraram % originais.length];
        // Cada volta acrescenta a cópia depois da última cópia daquela célula.
        const chave = chaveDoModelo(alvo) + '|' + alvo.pos;
        let ultima = -1;
        for (let k = 0; k < celulas.length; k++) {
            if (chaveDoModelo(celulas[k]) + '|' + celulas[k].pos === chave) ultima = k;
        }
        celulas.splice(ultima + 1, 0, { osId: alvo.osId, itemId: alvo.itemId, pos: alvo.pos });
        entraram++;
        volta++;
        if (volta > faltam + originais.length + 10) break;   // trava de segurança
    }

    return { celulas: celulas, entraram: entraram };
}

/**
 * Reordena as células da folha.
 *
 * `modelo` agrupa tudo do mesmo modelo junto, na ordem do registro (que é a do
 * `multi_artes`); `pedido` agrupa por pedido. Dentro de cada grupo a ordem
 * relativa que o operador montou é preservada — reordenar não pode embaralhar
 * o que ele já arrastou de propósito.
 *
 * Isso NÃO muda o código de ingresso nenhum: cada célula continua levando o
 * deslocamento do seu modelo (ver `posicoesCombinadas`). Muda só onde ela cai
 * no papel.
 */
function ordenarCelulas(celulas, modelos, criterio) {
    const lista = (celulas || []).slice();
    if (criterio !== 'modelo' && criterio !== 'pedido') return lista;

    const ordemDoModelo = {};
    (modelos || []).forEach((m, j) => { ordemDoModelo[chaveDoModelo(m)] = j; });

    const ordemDoPedido = [];
    (modelos || []).forEach(m => {
        if (ordemDoPedido.indexOf(String(m.osId)) === -1) ordemDoPedido.push(String(m.osId));
    });

    const grupoDe = c => criterio === 'modelo'
        ? (ordemDoModelo[chaveDoModelo(c)] ?? 9999)
        : (ordemDoPedido.indexOf(String(c.osId)) < 0 ? 9999 : ordemDoPedido.indexOf(String(c.osId)));

    // Ordenação ESTÁVEL pelo índice original: `Array.prototype.sort` é estável
    // em todo navegador atual, mas o desempate explícito documenta a intenção.
    return lista
        .map((c, i) => ({ c, i }))
        .sort((a, b) => (grupoDe(a.c) - grupoDe(b.c)) || (a.i - b.i))
        .map(x => x.c);
}

/* ── O aproveitamento da folha (03/09/2026) ──────────────────────────────── */

// Os tipos de elemento que NÃO mudam de um item para o outro. Tudo o que não
// estiver nesta lista — TEXT, QR, QR_IDEAL, BARCODE, FOTO, CAMAROTE, TEATRO,
// METADATA — imprime uma coisa diferente em cada peça.
//
// A classificação erra DE PROPÓSITO para o lado seguro: elemento de tipo
// desconhecido conta como variável, e arte fixa que leia coluna do banco (a
// foto da credencial é o caso comum) também. Errar para o outro lado ofereceria
// ao operador repetir a mesma folha — e com ela o mesmo código — N vezes.
const MTG_ELEMENTOS_SEM_DADO = ['FIXED', 'PICOTE', 'SVG', 'PDF'];

// Acima disto a folha distribuída deixa de caber na tela: são células
// desenhadas uma a uma, com alça, rótulo e dois botões cada.
const MTG_MAX_CELULAS_DISTRIBUIDAS = 800;

/** Este elemento imprime coisa diferente em cada item? */
function elementoDaNumeracaoVaria(el) {
    if (!el) return false;
    const tipo = String(el.type || 'TEXT').toUpperCase();
    if (MTG_ELEMENTOS_SEM_DADO.indexOf(tipo) === -1) return true;
    return el.source === 'database' || String(el.csv_column || '').trim() !== '';
}

/**
 * Esta numeração faz cada peça sair diferente da anterior?
 *
 * É a pergunta que decide se a folha pode ser IMPRESSA REPETIDA. Numeração sem
 * elemento nenhum é caso comum e legítimo neste projeto — a folha sai só com a
 * arte —, e aí as N impressões saem iguais, que é o que o gang run quer. Com
 * qualquer elemento variável, repetir a folha repete o código.
 */
function numeracaoTemDadoVariavel(num) {
    return !!(num && (num.elements || []).some(elementoDaNumeracaoVaria));
}

/**
 * Este MODELO faz cada peça sair diferente da anterior?
 *
 * Diferente de `numeracaoTemDadoVariavel`, que só olha a numeração já lida:
 * aqui entra o caso em que a tela NÃO conseguiu ler a numeração do modelo —
 * banco que não desceu, id que não casa. Modelo sem numeração nenhuma é arte
 * só, e é caso comum e legítimo; modelo COM numeração que não se conseguiu ler
 * conta como variável, porque o erro tem de cair para o lado seguro. Chutar
 * "arte fixa" ali faria a tela recomendar a folha repetida para um ingresso.
 */
function modeloTemDadoVariavel(item, num) {
    if (num) return numeracaoTemDadoVariavel(num);
    const id = (typeof numeracaoIdDoItem === 'function')
        ? numeracaoIdDoItem(item)
        : (item && (item.amostra_num_id || item.numeracao_id));
    return !!id;
}

/**
 * A folha mais aproveitada para as tiragens que estão na montagem.
 *
 * Pedido do usuário em 03/09/2026: "ao carregar 2 modelos ou mais, ao analisar
 * a quantidade de cada modelo, sugerir a quantidade de repetições de cada
 * modelo para que com a impressão repetida da folha imposta se atinja o melhor
 * número de aproveitamento. Exemplo: formato com 10 células, modelo 1, 30
 * unidades, modelo 2, 70 unidades. Montagem sugerida 3x o modelo 1 e 7x o
 * modelo 2". A quantidade de cada modelo é a TIRAGEM dele — escolha do usuário
 * na mesma conversa.
 *
 * ## A conta
 *
 * O desperdício de uma folha impressa `R` vezes é `P * R - Q`: tudo o que sai
 * do papel e não vira peça pedida, seja célula vazia ou peça a mais. `P`
 * (células da folha) e `Q` (o que se precisa ao todo) são dados, então
 * desperdiçar menos é IMPRIMIR MENOS VEZES — a conta se resume a achar o menor
 * `R` que caiba.
 *
 * Para um `R` qualquer, o mínimo de células que o modelo `i` precisa na folha é
 * `ceil(q_i / R)`: com menos que isso, `R` impressões não fecham a tiragem
 * dele. Se a soma desses mínimos cabe na folha, aquele `R` serve. Basta então
 * varrer `R` de baixo para cima e parar no primeiro que couber.
 *
 * No exemplo do usuário (P = 10, q = 30 e 70): R = 9 pede 4 + 8 = 12 células e
 * não cabe; R = 10 pede 3 + 7 = 10 e cabe. Sai exatamente a montagem que ele
 * descreveu, com desperdício zero.
 *
 * O piso da varredura é `ceil(Q / P)` — abaixo disso nem o total caberia. O
 * teto é a maior tiragem, onde cada modelo pede uma célula só; por isso a
 * varredura sempre acha resposta enquanto houver célula para um de cada.
 *
 * ## A sobra da folha
 *
 * O que sobrar de célula depois dos mínimos é distribuído pelo método da maior
 * sobra, proporcional à tiragem. O papel daquela folha já está comprado: deixar
 * a célula vazia desperdiça igual e não entrega nada. Vira peça a mais, e a
 * tela diz quantas — silenciar isso seria imprimir código que ninguém pediu.
 */
function sugestaoDeAproveitamento(modelos, porFolha) {
    const P = parseInt(porFolha) || 0;
    const lista = (modelos || []);
    const vazia = {
        viavel: false, motivo: '', porFolha: P, impressoes: 0, folhas: 0,
        total: 0, itens: [], celulasUsadas: 0, temDadoVariavel: false,
    };

    if (lista.length < 2) {
        return Object.assign(vazia, {
            motivo: 'A sugestão precisa de dois modelos ou mais na folha.' });
    }
    if (!P) {
        return Object.assign(vazia, {
            motivo: 'Sem o formato resolvido não dá para saber quantas células cabem na folha.' });
    }
    if (lista.length > P) {
        return Object.assign(vazia, {
            motivo: 'A folha tem ' + P + ' célula(s) e há ' + lista.length + ' modelos: '
                + 'não cabe nem um de cada. Tire modelos da montagem, ou use um formato maior.' });
    }

    const qtds = lista.map(m => parseInt(m.qtd) || 0);
    const semTiragem = lista.filter((m, j) => qtds[j] <= 0);
    if (semTiragem.length) {
        return Object.assign(vazia, {
            motivo: 'O modelo ' + semTiragem.map(m => m.itemId).join(', ') + ' está sem '
                + 'tiragem conhecida, e sem ela não há proporção a calcular. Abra o pedido '
                + 'na tela do Pedido uma vez e volte aqui.' });
    }

    const Q = qtds.reduce((a, b) => a + b, 0);
    const teto = Math.max.apply(null, qtds);
    let impressoes = 0;
    let celulas = null;
    for (let R = Math.max(1, Math.ceil(Q / P)); R <= teto; R++) {
        const c = qtds.map(q => Math.ceil(q / R));
        if (c.reduce((a, b) => a + b, 0) <= P) { impressoes = R; celulas = c; break; }
    }
    if (!celulas) {
        return Object.assign(vazia, {
            motivo: 'Não achei uma divisão da folha que atenda estas tiragens.' });
    }

    // A sobra da folha, pelo método da maior sobra sobre a tiragem.
    const livres = P - celulas.reduce((a, b) => a + b, 0);
    if (livres > 0) {
        const ideal = qtds.map(q => livres * q / Q);
        const inteiro = ideal.map(x => Math.floor(x));
        const ordem = ideal
            .map((x, j) => ({ j: j, frac: x - Math.floor(x) }))
            .sort((a, b) => (b.frac - a.frac) || (qtds[b.j] - qtds[a.j]) || (a.j - b.j));
        let dados = inteiro.reduce((a, b) => a + b, 0);
        for (let k = 0; dados < livres; k++, dados++) inteiro[ordem[k % ordem.length].j]++;
        for (let j = 0; j < celulas.length; j++) celulas[j] += inteiro[j];
    }

    const itens = lista.map((m, j) => ({
        osId: m.osId, itemId: m.itemId, nome: m.nome,
        pedidoNumero: m.pedidoNumero, variavel: m.variavel === true,
        qtd: qtds[j], celulas: celulas[j],
        produz: celulas[j] * impressoes,
        sobra: celulas[j] * impressoes - qtds[j],
    }));

    return {
        viavel: true, motivo: '', porFolha: P,
        impressoes: impressoes,
        // Distribuindo as peças de verdade o número de folhas é OUTRO: elas se
        // empacotam melhor do que uma folha repetida. Ver `celulasDistribuidas`.
        folhas: Math.ceil(Q / P),
        total: Q, itens: itens,
        celulasUsadas: celulas.reduce((a, b) => a + b, 0),
        temDadoVariavel: itens.some(it => it.variavel),
        // Distribuir desenha uma celula por peca. Acima do teto a tela nao da'
        // conta, e o botao precisa nascer travado com o motivo a vista em vez
        // de recusar depois do clique.
        podeDistribuir: Q <= MTG_MAX_CELULAS_DISTRIBUIDAS,
    };
}

/**
 * UMA folha com a mistura sugerida — o gang run.
 *
 * As posições são 1..células de cada modelo. A folha sai uma vez no PDF, e o
 * operador a manda para a impressora `impressoes` vezes. Só é honesto quando a
 * peça não tem dado variável: com dado variável, as N impressões saem com o
 * MESMO código, e é isso que a tela avisa antes de aplicar.
 */
function celulasDaFolhaUnica(sug) {
    const out = [];
    if (!sug || !sug.viavel) return out;
    for (const it of sug.itens) {
        for (let p = 1; p <= it.celulas; p++) {
            out.push({ osId: it.osId, itemId: it.itemId, pos: p });
        }
    }
    return out;
}

/**
 * TODAS as peças, arrumadas para cada folha sair com a mistura sugerida.
 *
 * É o mesmo aproveitamento, feito de um jeito que serve também à peça com dado
 * variável: cada célula é um item DIFERENTE, e nenhuma folha se repete. A
 * mistura por folha é a da sugestão; quando um modelo acaba antes dos outros, a
 * vaga que ele deixa é preenchida por quem ainda tem peça, para a folha não
 * sair com buraco — papel é custo de produção.
 */
function celulasDistribuidas(sug) {
    const out = [];
    if (!sug || !sug.viavel) return out;

    const filas = sug.itens.map(it => {
        const f = [];
        for (let p = 1; p <= it.qtd; p++) f.push(p);
        return f;
    });
    const P = sug.porFolha;

    for (;;) {
        let naFolha = 0;
        for (let j = 0; j < filas.length && naFolha < P; j++) {
            const it = sug.itens[j];
            for (let n = 0; n < it.celulas && filas[j].length && naFolha < P; n++) {
                out.push({ osId: it.osId, itemId: it.itemId, pos: filas[j].shift() });
                naFolha++;
            }
        }
        for (let j = 0; j < filas.length && naFolha < P; j++) {
            const it = sug.itens[j];
            while (filas[j].length && naFolha < P) {
                out.push({ osId: it.osId, itemId: it.itemId, pos: filas[j].shift() });
                naFolha++;
            }
        }
        if (naFolha === 0) break;
    }
    return out;
}

/**
 * Qual dos dois caminhos a tela recomenda.
 *
 * Peça com dado variável não pode ter a folha repetida — seria o mesmo código
 * saindo N vezes, que é exatamente o que esta tela existe para não fazer.
 */
function modoSugeridoDaMontagem(sug) {
    return (sug && sug.temDadoVariavel) ? 'distribuir' : 'unica';
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

/**
 * Os valores do número do modelo, saneados como o MOTOR os saneia.
 *
 * A tela e o motor precisam concordar sobre o que é um valor válido, senão a
 * prévia mostra uma coisa e o papel sai outra — que é o defeito que este
 * projeto mais repete. Valor fora da lista cai no padrão, dos dois lados.
 */
function numeroDaMontagemSaneado(n) {
    const p = numeroPadraoDaMontagem();
    if (!n) return p;

    const size = parseFloat(n.size);
    const rot = parseInt(n.rot);

    return {
        imprimir: n.imprimir === true,
        pos: MTG_POSICOES_DO_NUMERO.indexOf(n.pos) >= 0 ? n.pos : p.pos,
        rot: MTG_ROTACOES_DO_NUMERO.indexOf(rot) >= 0 ? rot : p.rot,
        size: (isFinite(size) && size >= MTG_TAMANHO_MIN && size <= MTG_TAMANHO_MAX)
            ? size : p.size,
        cor: /^#[0-9a-fA-F]{6}$/.test(String(n.cor || '')) ? String(n.cor) : p.cor,
    };
}

if (typeof window !== 'undefined') {
    window.montagemVazia = montagemVazia;
    window.numeroPadraoDaMontagem = numeroPadraoDaMontagem;
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
    window.lugarDaCelulaNaFolha = lugarDaCelulaNaFolha;
    window.geometriaDaFolha = geometriaDaFolha;
    window.escalaDaFolhaDaMontagem = escalaDaFolhaDaMontagem;
    window.duplicarCelula = duplicarCelula;
    window.tirarCelula = tirarCelula;
    window.moverCelula = moverCelula;
    window.completarAFolha = completarAFolha;
    window.ordenarCelulas = ordenarCelulas;
    window.celulasForaDaTiragem = celulasForaDaTiragem;
    window.modoDaFolhaDaMontagem = modoDaFolhaDaMontagem;
    window.numeroDaMontagemSaneado = numeroDaMontagemSaneado;
    window.textoDoNumeroDoModelo = textoDoNumeroDoModelo;
    window._mtgEspacoDoNumero = _mtgEspacoDoNumero;
}

/* ══════════════════════════════════════════════════════════════════════════
   O HISTÓRICO — desfazer e refazer
   ══════════════════════════════════════════════════════════════════════════

   Era a falta mais grave da tela: um × no lugar errado apagava a célula sem
   volta, e repor custava reescolher o pedido, esperar o `loadOSItens`,
   reescolher o modelo e redigitar as posições.

   O instantâneo é barato porque a folha é feita de dados planos: as células
   são `{osId, itemId, pos}` e se clonam com espalhamento; os modelos são
   guardados POR REFERÊNCIA (um `slice`), porque o objeto de modelo não muda
   depois de criado — clonar levaria junto o `peca._item`, que é o item vivo do
   `state.osItens` e não pode ser duplicado.
*/

const MTG_HISTORIA_MAX = 60;

/** Guarda o estado atual antes de mexer nele. Chame ANTES da mudança. */
function guardarNaHistoria() {
    const m = state.montagem;
    m.historia.push({
        celulas: m.celulas.map(c => ({ osId: c.osId, itemId: c.itemId, pos: c.pos })),
        modelos: m.modelos.slice(),
        selecao: m.selecao.slice(),
    });
    if (m.historia.length > MTG_HISTORIA_MAX) m.historia.shift();
    // Mexer depois de desfazer apaga o futuro: é o comportamento que todo
    // editor tem, e o contrário confundiria mais do que ajudaria.
    m.futuro = [];
}

function _mtgAplicar(instantaneo) {
    const m = state.montagem;
    m.celulas = instantaneo.celulas.map(c => ({ osId: c.osId, itemId: c.itemId, pos: c.pos }));
    m.modelos = instantaneo.modelos.slice();
    m.selecao = (instantaneo.selecao || []).slice();
}

function _mtgInstantaneoAtual() {
    const m = state.montagem;
    return {
        celulas: m.celulas.map(c => ({ osId: c.osId, itemId: c.itemId, pos: c.pos })),
        modelos: m.modelos.slice(),
        selecao: m.selecao.slice(),
    };
}

function desfazerMontagem() {
    const m = state.montagem;
    if (!m.historia.length) return;
    m.futuro.push(_mtgInstantaneoAtual());
    _mtgAplicar(m.historia.pop());
    onMontagemPosicoesChange();
    renderMontagem();
}

function refazerMontagem() {
    const m = state.montagem;
    if (!m.futuro.length) return;
    m.historia.push(_mtgInstantaneoAtual());
    _mtgAplicar(m.futuro.pop());
    onMontagemPosicoesChange();
    renderMontagem();
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
 * o motor imprime `arte["nome"]` na borda de cada item, e esse campo é o ÚNICO
 * que decide se ele sai. Ligado, o payload leva o número; desligado, vazio.
 *
 * ── Duas diferenças em relação ao Pedido, e as duas são deliberadas ────────
 *
 * É UMA escolha para a montagem inteira, e não uma por modelo. No Pedido a
 * opção mora em `pedidos_modelos` e vale para aquele modelo; aqui a folha
 * mistura modelos de pedidos diferentes, e uma caixa por linha faria o operador
 * decidir o mesmo N vezes para o mesmo papel.
 *
 * E ela NÃO é gravada no modelo. A Montagem é reposição avulsa: escolher aqui
 * não pode mudar como aquele modelo sai na próxima tiragem inteira dele. O que
 * fica salvo continua sendo a escolha da tela do Pedido.
 */
function imprimirNumeroNaMontagem() {
    return state.montagem.numero.imprimir === true;
}

/** Quantas células cabem na folha desta montagem. */
function _mtgCelulasPorFolha(modelos) {
    // Vem da PECA resolvida, e nao de uma busca propria: duas resolucoes do
    // mesmo formato podem discordar, e ai a conta da folha diria uma coisa e o
    // papel sairia outra.
    return (modelos && modelos.length) ? (modelos[0].peca.celulas_por_folha || 0) : 0;
}

/** A saída desta montagem, do catálogo. */
function _mtgSaidaDaFolha(modelos) {
    if (!modelos || !modelos.length) return null;
    return (state.saidas || []).find(s => String(s.id) === String(modelos[0].peca.saida_id)) || null;
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
 *
 * O rótulo do campo passou a carregar a TIRAGEM (03/09/2026). Ela só aparecia
 * na tabela, depois de adicionar — e é contra ela que a posição vale, então o
 * operador digitava no escuro até errar.
 */
function onMontagemPosicoesChange() {
    const item = _mtgItemEscolhido();
    const campo = document.getElementById('mtg-posicoes');
    const botao = document.getElementById('mtg-add');
    const dica = document.getElementById('mtg-dica');
    const rotulo = document.getElementById('mtg-label-posicoes');
    const caixaRecusa = document.getElementById('mtg-recusa');

    let podeAdicionar = false;
    let recusa = null;
    let total = 0;

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
        total = totalDeItensDoModelo(item, num);
        const { posicoes, invalidos } = posicoesDaMontagem(campo ? campo.value : '', total);

        podeAdicionar = posicoes.length > 0;

        if (dica) {
            if (invalidos.length) {
                dica.innerHTML = `<span style="color:var(--red);">Fora da tiragem ou inválido: <strong>${escapeHtml(invalidos.join(', '))}</strong></span>`
                    + ` — este modelo tem <strong>${total.toLocaleString('pt-BR')}</strong> item(ns).`;
            } else if (posicoes.length) {
                dica.innerHTML = `<strong>${posicoes.length}</strong> célula(s) deste modelo entram na folha.`;
            } else {
                dica.innerHTML = 'A posição é a do item <strong>dentro do modelo</strong> — o 1º, o 6º, o 22º da tiragem, onde quer que ele tenha caído na folha. Faixas valem: <code>1-4</code>.';
            }
        }
    } else if (dica && !recusa) {
        dica.innerHTML = 'A posição é a do item <strong>dentro do modelo</strong> — o 1º, o 6º, o 22º da tiragem, onde quer que ele tenha caído na folha. Faixas valem: <code>1-4</code>.';
    }

    // A TIRAGEM NO RÓTULO: é contra este número que a posição vale, e sem ele
    // à vista o operador digita no escuro.
    if (rotulo) {
        rotulo.innerHTML = total
            ? `Posições <span style="color:var(--text-dim);text-transform:none;letter-spacing:0;">· de ${total.toLocaleString('pt-BR')}</span>`
            : 'Posições';
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

    guardarNaHistoria();

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
            // Lido AQUI, com a numeracao ja resolvida: e' o que decide se a
            // folha pode ser impressa repetida sem repetir codigo.
            variavel: modeloTemDadoVariavel(item, num),
            peca: peca,
        };
        modelos.push(m);
    }

    // Posição que já está na folha não entra de novo pela digitação; para
    // repetir de propósito existe o ⧉ da célula.
    const jaTem = celulasDoModelo(celulas, m);
    let primeiraNova = -1;
    for (const p of posicoes) {
        if (jaTem.indexOf(p) === -1) {
            if (primeiraNova < 0) primeiraNova = celulas.length;
            celulas.push({ osId: osId, itemId: item.id, pos: p });
        }
    }
    // A janela acompanha o que acabou de entrar: acrescentar seis células numa
    // folha cheia abre a folha seguinte, e o operador precisa vê-las.
    if (primeiraNova >= 0) _mtgSeguirCelula(primeiraNova);

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
 * precisa apagá-la primeiro.
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
    guardarNaHistoria();
    const k = chaveDoModelo(m);
    state.montagem.celulas = celulas.filter(c => chaveDoModelo(c) !== k);
    modelos.splice(indice, 1);
    state.montagem.selecao = [];
    onMontagemPosicoesChange();
    renderMontagem();
}

/* ── Os gestos sobre as células ──────────────────────────────────────────── */

/**
 * As células em que o gesto vai valer: a seleção, ou a célula clicada.
 *
 * Selecionar várias e clicar no ⧉ de uma delas repete TODAS — é isso que faz
 * repor doze células custar um clique em vez de doze.
 */
function _mtgAlvosDoGesto(i) {
    const sel = state.montagem.selecao;
    return (sel.length > 1 && sel.indexOf(i) >= 0) ? sel.slice().sort((a, b) => a - b) : [i];
}

/** O ⧉ da célula: a mesma peça, repetida logo abaixo. */
function duplicarCelulaDaMontagem(i) {
    const alvos = _mtgAlvosDoGesto(i);
    guardarNaHistoria();
    // Do fim para o começo: cada inserção empurra os índices seguintes, e
    // percorrer ao contrário mantém os alvos ainda não tratados no lugar.
    for (let k = alvos.length - 1; k >= 0; k--) duplicarCelula(state.montagem.celulas, alvos[k]);
    state.montagem.selecao = [];
    renderMontagem();
}

/**
 * O × da célula: tira só ela. Modelo que ficou sem célula sai do registro
 * — uma arte sem célula nenhuma no `multi_artes` não imprime nada, mas
 * continuaria na lista e no deslocamento, confundindo quem confere.
 */
function removerCelulaDaMontagem(i) {
    const alvos = _mtgAlvosDoGesto(i);
    guardarNaHistoria();
    for (let k = alvos.length - 1; k >= 0; k--) tirarCelula(state.montagem.celulas, alvos[k]);
    state.montagem.modelos = modelosComCelula(state.montagem.celulas, state.montagem.modelos);
    state.montagem.selecao = [];
    onMontagemPosicoesChange();
    renderMontagem();
}

/** O arrasto: a célula `de` passa a ocupar a posição `para` da folha. */
function moverCelulaDaMontagem(de, para) {
    guardarNaHistoria();
    moverCelula(state.montagem.celulas, de, para);
    state.montagem.selecao = [];
    _mtgSeguirCelula(para);
    renderMontagem();
}

/**
 * Clicar numa célula seleciona; Shift estende; Ctrl (ou Cmd) alterna.
 *
 * A seleção não é enfeite: com ela, repetir e tirar valem para todas de uma
 * vez. Repor doze células estragadas custava doze cliques em doze botões
 * diferentes.
 */
function selecionarCelulaDaMontagem(i, ev) {
    const m = state.montagem;
    const multi = ev && (ev.ctrlKey || ev.metaKey);
    const faixa = ev && ev.shiftKey;

    if (faixa && m.selecao.length) {
        const ancora = m.selecao[m.selecao.length - 1];
        const de = Math.min(ancora, i);
        const ate = Math.max(ancora, i);
        const nova = [];
        for (let k = de; k <= ate; k++) nova.push(k);
        m.selecao = nova;
    } else if (multi) {
        const j = m.selecao.indexOf(i);
        if (j >= 0) m.selecao.splice(j, 1); else m.selecao.push(i);
    } else {
        m.selecao = (m.selecao.length === 1 && m.selecao[0] === i) ? [] : [i];
    }
    renderMontagem();
}

/** Completa a folha repetindo as células que já estão nela. */
function completarAFolhaDaMontagem() {
    const m = state.montagem;
    const porFolha = _mtgCelulasPorFolha(m.modelos);
    const conta = contaDaMontagem(m.celulas, porFolha);
    if (!porFolha || !m.celulas.length || conta.vazias === 0) return;

    guardarNaHistoria();
    const r = completarAFolha(m.celulas, porFolha);
    m.selecao = [];
    renderMontagem();
    if (typeof toast === 'function' && r.entraram) {
        toast(`${r.entraram} célula(s) repetida(s) — a folha fecha certo agora.`, 'success');
    }
}

/** Reordena a folha e diz o que fez. */
function ordenarMontagem(criterio) {
    const m = state.montagem;
    if (!m.celulas.length) return;
    guardarNaHistoria();
    m.celulas = ordenarCelulas(m.celulas, m.modelos, criterio);
    m.selecao = [];
    renderMontagem();
    if (typeof toast === 'function') {
        toast(criterio === 'modelo'
            ? 'Células agrupadas por modelo. O código de cada uma não mudou — só a ordem no papel.'
            : 'Células agrupadas por pedido. O código de cada uma não mudou — só a ordem no papel.', 'success');
    }
}

/** Troca o zoom da folha. */
function zoomDaMontagem(qual) {
    state.montagem.zoom = qual;
    renderMontagem();
}

function limparMontagem() {
    guardarNaHistoria();
    state.montagem.celulas = [];
    state.montagem.modelos = [];
    state.montagem.selecao = [];
    onMontagemPosicoesChange();
    renderMontagem();
}

/* ── O aproveitamento da folha, na tela ──────────────────────────────────── */

/** A sugestão para a montagem de agora. */
function _mtgSugestaoAtual() {
    const m = state.montagem;
    return sugestaoDeAproveitamento(m.modelos, _mtgCelulasPorFolha(m.modelos));
}

/**
 * Aplica a mistura sugerida à folha.
 *
 * `modo` é `auto` (o que a peça recomenda), `unica` (uma folha, N impressões)
 * ou `distribuir` (todas as peças, N folhas com a mesma mistura). Os três ficam
 * oferecidos na tela, por decisão do usuário em 03/09/2026 — mas o caminho que
 * repete a folha com dado variável passa por uma confirmação que diz, em texto,
 * que os códigos vão sair repetidos.
 *
 * SUBSTITUI as células da folha: é uma montagem sugerida, e não um acréscimo. O
 * que havia antes fica no desfazer.
 */
async function aplicarSugestaoDaMontagem(modo) {
    const sug = _mtgSugestaoAtual();
    if (!sug.viavel) {
        if (typeof toast === 'function') toast(sug.motivo, 'error');
        return;
    }

    const escolhido = (!modo || modo === 'auto') ? modoSugeridoDaMontagem(sug) : modo;

    // A folha distribuída desenha uma célula por peça. Tiragem inteira não é
    // trabalho desta tela, e a saída está na frase.
    if (escolhido === 'distribuir' && !sug.podeDistribuir) {
        if (typeof toast === 'function') {
            toast('São ' + sug.total + ' peças ao todo, e distribuir desenharia uma célula para '
                + 'cada uma. Tiragem desse tamanho é trabalho da tela do Pedido. Aqui, use '
                + '"Uma folha, ' + sug.impressoes + ' impressões".', 'error');
        }
        return;
    }

    if (escolhido === 'unica' && sug.temDadoVariavel) {
        const quais = sug.itens.filter(it => it.variavel).map(it => it.itemId).join(', ');
        const segue = (typeof confirmarPopup === 'function') ? await confirmarPopup({
            titulo: 'A folha repetida sai com o mesmo código',
            mensagem: 'O modelo ' + quais + ' tem numeração com dado variável: cada peça sai '
                + 'diferente da anterior. Imprimir esta folha ' + sug.impressoes + ' vezes '
                + 'imprime ' + sug.impressoes + ' vezes as <strong>mesmas peças</strong>, com '
                + 'os mesmos códigos.',
            detalhe: 'Se o que você quer são peças diferentes, cancele e use "Distribuir em '
                + sug.folhas + ' folhas": a mesma mistura em cada folha, e cada célula um item.',
            textoOk: 'Montar assim mesmo',
            textoCancelar: 'Cancelar',
        }) : true;
        if (!segue) return;
    }

    guardarNaHistoria();
    state.montagem.celulas = (escolhido === 'unica')
        ? celulasDaFolhaUnica(sug)
        : celulasDistribuidas(sug);
    state.montagem.selecao = [];
    renderMontagem();

    if (typeof toast === 'function') {
        toast(escolhido === 'unica'
            ? 'Folha montada: ' + sug.itens.map(it => it.celulas + '× ' + it.itemId).join(' + ')
                + '. Imprima ' + sug.impressoes + ' vez(es).'
            : sug.total + ' peça(s) distribuída(s) em ' + sug.folhas + ' folha(s), com a mesma '
                + 'mistura em cada uma.', 'success');
    }
}

/** O painel do aproveitamento: só existe com dois modelos ou mais na folha. */
function _mtgRenderSugestao() {
    const caixa = document.getElementById('mtg-sugestao');
    if (!caixa) return;

    const modelos = state.montagem.modelos;
    if (modelos.length < 2) { caixa.style.display = 'none'; caixa.innerHTML = ''; return; }
    caixa.style.display = '';

    const cab = '<div class="mtg-num-cabecalho"><h2>Aproveitamento da folha</h2></div>';
    const sug = _mtgSugestaoAtual();

    if (!sug.viavel) {
        caixa.innerHTML = cab + '<p class="mtg-dica" style="margin:0;">'
            + escapeHtml(sug.motivo) + '</p>';
        return;
    }

    const recomendado = modoSugeridoDaMontagem(sug);
    // Distribuir desenha uma célula por peça: acima do teto a tela não dá conta,
    // e o botão nasce travado dizendo por quê e para onde ir. Quando é o
    // recomendado que está travado, a montagem inteira é tiragem de produção — e
    // o lugar dela é a tela do Pedido, não esta.
    const semDistribuir = !sug.podeDistribuir;
    const recTravado = semDistribuir && recomendado === 'distribuir';
    const motivoTravado = 'São ' + sug.total + ' peças: distribuir desenharia uma célula '
        + 'para cada uma, e a tela não dá conta. Tiragem desse tamanho se imprime pela tela '
        + 'do Pedido.';
    const linhas = sug.itens.map(it => `
      <tr>
        <td title="${escapeHtml(it.nome)}">${escapeHtml(it.itemId)}${it.variavel
            ? ' <span class="mtg-sug-var" title="numeração com dado variável: cada peça sai diferente">var</span>' : ''}</td>
        <td class="num">${it.qtd}</td>
        <td class="num forte">${it.celulas}</td>
        <td class="num">${it.produz}</td>
        <td class="num ${it.sobra > 0 ? 'sobra' : ''}">${it.sobra > 0 ? '+' + it.sobra : '—'}</td>
      </tr>`).join('');

    const mistura = sug.itens.map(it => it.celulas + '× ' + it.itemId).join(' + ');

    caixa.innerHTML = cab + `
      <p class="mtg-dica" style="margin:0 0 10px;">A folha tem <strong>${sug.porFolha}</strong>
        célula(s) e as tiragens somam <strong>${sug.total}</strong> peça(s). A divisão abaixo é a
        que gasta menos papel.</p>

      <table class="mtg-sug-tabela">
        <thead><tr><th>Modelo</th><th class="num">Tiragem</th><th class="num">Por folha</th>
          <th class="num">Produz</th><th class="num">Sobra</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>

      <p class="mtg-sug-frase"><strong>${escapeHtml(mistura)}</strong> por folha.</p>

      <div class="mtg-sug-botoes">
        <button type="button" class="btn-primary mtg-sug-rec" ${recTravado ? 'disabled' : ''}
                title="${recTravado ? escapeHtml(motivoTravado) : ''}"
                onclick="aplicarSugestaoDaMontagem('auto')">
          ${recomendado === 'unica'
            ? 'Aplicar o recomendado &mdash; uma folha, ' + sug.impressoes + ' impress&otilde;es'
            : 'Aplicar o recomendado &mdash; distribuir em ' + sug.folhas + ' folhas'}
        </button>
        <button type="button" class="btn-secondary"
                onclick="aplicarSugestaoDaMontagem('unica')">Uma folha, ${sug.impressoes} impress&otilde;es</button>
        <button type="button" class="btn-secondary" ${semDistribuir ? 'disabled' : ''}
                title="${semDistribuir ? escapeHtml(motivoTravado) : ''}"
                onclick="aplicarSugestaoDaMontagem('distribuir')">Distribuir em ${sug.folhas} folhas</button>
      </div>

      <p class="mtg-dica" style="margin:10px 0 0;">${recTravado
        ? '<strong>' + escapeHtml(motivoTravado) + '</strong> Aqui a folha repetida também não '
          + 'serve: há modelo com dado variável, e repetir a folha repetiria o código.'
        : sug.temDadoVariavel
        ? 'Há modelo com dado variável na folha: <strong>repetir a mesma folha repetiria o '
          + 'código</strong>. Por isso o recomendado é distribuir — mesma mistura em cada folha, '
          + 'cada célula um item diferente.'
        : 'Nenhum modelo tem dado variável: as peças saem iguais, então a mesma folha impressa '
          + sug.impressoes + ' vez(es) entrega a tiragem inteira. É o caminho mais curto.'}</p>

      <p class="mtg-dica" style="margin:6px 0 0;">Aplicar <strong>substitui</strong> as células
        que estão na folha. <code>Ctrl+Z</code> devolve.</p>`;
}

/* ── O número do modelo no papel ─────────────────────────────────────────── */

function alternarNumeroDaMontagem() {
    const n = state.montagem.numero;
    n.imprimir = !n.imprimir;
    renderMontagem();
}

function mudarNumeroDaMontagem(campo, valor) {
    const n = state.montagem.numero;
    if (campo === 'size') n.size = parseFloat(valor);
    else if (campo === 'rot') n.rot = parseInt(valor);
    else n[campo] = valor;
    state.montagem.numero = Object.assign(numeroDaMontagemSaneado(n), { imprimir: n.imprimir });
    renderMontagem();
}

/**
 * O texto do número, como o motor o escreve.
 *
 * O motor faz `str(arte_nome).zfill(6)`: preenche com zeros à ESQUERDA até
 * seis casas, e deixa passar inteiro o que já tem mais. Os ids de
 * `pedidos_modelos` da gráfica têm sete dígitos (1000565), então na prática
 * quase nada é preenchido — mas o modelo de id 4200 sai "004200", e a prévia
 * tem de mostrar isso.
 */
function textoDoNumeroDoModelo(itemId) {
    return String(itemId == null ? '' : itemId).padStart(6, '0');
}

/**
 * Quanto o número ocupa na célula, em px, na direção perpendicular à borda.
 *
 * O rótulo da célula (pedido · modelo · #posição) tem de recuar essa medida,
 * senão o número fica POR CIMA dele — foi o que a primeira foto da tela nova
 * mostrou: "21202" virava "02" atrás do número desenhado.
 */
function _mtgEspacoDoNumero(num, escala, texto) {
    if (!num || !num.imprimir) return { esquerda: 0, direita: 0 };
    const px = Math.max(4, (num.size / (72 / 25.4)) * escala);
    const recuo = Math.max(2, px * 0.35);
    const deitado = (num.rot === 90 || num.rot === 270);
    const espessura = deitado ? px : (String(texto || '000000').length * px * 0.46);
    const total = Math.round(recuo + espessura + 4);
    if (num.pos === 'esquerda') return { esquerda: total, direita: 0 };
    if (num.pos === 'direita') return { esquerda: 0, direita: total };
    return { esquerda: 0, direita: 0 };
}

/**
 * O estilo do número desenhado dentro de uma célula da prévia.
 *
 * Reproduz o que o motor faz: o texto encostado na borda escolhida,
 * centralizado ao longo dela, girado. `escala` é px por milímetro; o corpo da
 * fonte vem em PONTOS (como no motor) e se converte por 72 pt = 25,4 mm.
 *
 * ── Por que posiciona pelo CENTRO, e não pela borda ──────────────────────
 *
 * Girar um texto muda a caixa que ele ocupa: a 90° a ALTURA visual passa a ser
 * a largura do texto. Encostar `top: recuo` num texto girado põe a borda de
 * cima da caixa NÃO-girada ali, e metade do texto vaza para fora da célula —
 * onde o `overflow: hidden` o decepa. Foi o que a revisão do desenho pegou:
 * com Topo ou Base mais 90°, que é o padrão, o número saía cortado.
 *
 * Então o cálculo é: descobrir a espessura do texto na direção perpendicular à
 * borda, e pôr o CENTRO dele a meia espessura da borda. A largura do texto é
 * estimada (0,46 do corpo por caractere, que é a proporção da Impact, uma
 * condensada) — é prévia, e o motor mede a de verdade com a fonte na mão.
 */
function _mtgEstiloDoNumero(num, escala, texto) {
    const mm = num.size / (72 / 25.4);            // pt -> mm
    const px = Math.max(4, mm * escala);
    const recuo = Math.max(2, px * 0.35);
    const largura = String(texto || '000000').length * px * 0.46;
    const deitado = (num.rot === 90 || num.rot === 270);

    // A espessura que o texto ocupa em cada eixo, já girado.
    const espessuraX = deitado ? px : largura;
    const espessuraY = deitado ? largura : px;

    const base = 'position:absolute;white-space:nowrap;line-height:1;'
        // Aspas SIMPLES na familia com espaco: este texto vai dentro de um
        // atributo `style="..."`, e uma aspa dupla aqui fecharia o atributo no
        // meio — o numero saia sem cor, sem tamanho e sem giro. O harness da
        // tela pegou isso desenhando num Chrome de verdade.
        + "font-family:Impact,Haettenschweiler,'Arial Narrow',sans-serif;letter-spacing:0.04em;"
        + 'font-size:' + px.toFixed(1) + 'px;color:' + num.cor + ';pointer-events:none;'
        + 'transform-origin:center;';
    const centro = `transform:translate(-50%,-50%) rotate(-${num.rot}deg);`;

    if (num.pos === 'direita') return base + `right:${(recuo + espessuraX / 2).toFixed(1)}px;top:50%;` + centro.replace('translate(-50%,-50%)', 'translate(50%,-50%)');
    if (num.pos === 'topo')    return base + `left:50%;top:${(recuo + espessuraY / 2).toFixed(1)}px;` + centro;
    if (num.pos === 'base')    return base + `left:50%;bottom:${(recuo + espessuraY / 2).toFixed(1)}px;` + centro.replace('translate(-50%,-50%)', 'translate(-50%,50%)');
    return base + `left:${(recuo + espessuraX / 2).toFixed(1)}px;top:50%;` + centro;
}

/** Desenha o painel do número do modelo. */
function _mtgRenderNumero() {
    const caixa = document.getElementById('mtg-numero');
    if (!caixa) return;
    const n = state.montagem.numero;

    const botao = (campo, valor, rotulo, ligado) =>
        `<button type="button" class="mtg-num-op${ligado ? ' ativo' : ''}"
                 onclick="mudarNumeroDaMontagem('${campo}', '${valor}')">${rotulo}</button>`;

    const swatch = hex =>
        `<span class="mtg-num-cor${n.cor === hex ? ' ativa' : ''}" title="${hex}"
               style="background:${hex};" onclick="mudarNumeroDaMontagem('cor', '${hex}')"></span>`;

    const pct = Math.round(((n.size - MTG_TAMANHO_MIN) / (MTG_TAMANHO_MAX - MTG_TAMANHO_MIN)) * 100);

    caixa.innerHTML = `
      <div class="mtg-num-cabecalho">
        <h2>Número do modelo no papel</h2>
        <label class="mtg-num-liga" title="Sai deitado na borda de cada item">
          <input type="checkbox" id="mtg-num-imprimir" ${n.imprimir ? 'checked' : ''}
                 onchange="alternarNumeroDaMontagem()">
          <span>Imprimir</span>
        </label>
      </div>
      <p class="mtg-dica" style="margin:0 0 12px;">Numa folha que mistura pedidos, é por ele que se separa o material depois de cortar.</p>

      <div class="mtg-num-grade${n.imprimir ? '' : ' desligado'}">
        <div class="mtg-num-campo">
          <span class="mtg-num-rotulo">Posição</span>
          <div class="mtg-num-linha">
            ${botao('pos', 'esquerda', 'Esquerda', n.pos === 'esquerda')}
            ${botao('pos', 'direita', 'Direita', n.pos === 'direita')}
            ${botao('pos', 'topo', 'Topo', n.pos === 'topo')}
            ${botao('pos', 'base', 'Base', n.pos === 'base')}
          </div>
        </div>

        <div class="mtg-num-campo">
          <span class="mtg-num-rotulo">Rotação</span>
          <div class="mtg-num-linha">
            ${MTG_ROTACOES_DO_NUMERO.map(g => botao('rot', g, g + '°', n.rot === g)).join('')}
          </div>
        </div>

        <div class="mtg-num-campo">
          <span class="mtg-num-rotulo">Tamanho <strong>${n.size} pt</strong></span>
          <div class="mtg-num-faixa">
            <input type="range" id="mtg-num-size" min="${MTG_TAMANHO_MIN}" max="${MTG_TAMANHO_MAX}" step="1"
                   value="${n.size}" oninput="mudarNumeroDaMontagem('size', this.value)"
                   style="--pct:${pct}%;">
          </div>
        </div>

        <div class="mtg-num-campo">
          <span class="mtg-num-rotulo">Cor</span>
          <div class="mtg-num-linha" style="gap:7px;">
            ${['#000000', '#ffffff', '#ef4444', '#3b82f6', '#22c55e'].map(swatch).join('')}
            <input type="color" id="mtg-num-cor" value="${n.cor}"
                   onchange="mudarNumeroDaMontagem('cor', this.value)" title="Outra cor">
          </div>
        </div>
      </div>

      <p class="mtg-dica" style="margin:11px 0 0;">${n.imprimir
        ? 'A folha ao lado mostra como sai, na posição e no corpo que vão para o papel.'
        : 'Desligado: o papel sai sem o número, como em toda tiragem normal.'}</p>`;
}

/* ── A folha ─────────────────────────────────────────────────────────────── */

// As cores das células, uma por modelo. Fundo claro, borda e texto escuros: a
// folha é PAPEL, e a cor é para o olho separar os modelos de relance.
const _MTG_TONS = ['#dbeafe|#93c5fd|#1e3a5f', '#ede9fe|#c4b5fd|#3b2a6b',
                   '#dcfce7|#86efac|#14532d', '#fef3c7|#fcd34d|#713f12',
                   '#fce7f3|#f9a8d4|#701a45'];

/** O índice do modelo de uma célula, para escolher o tom. */
function _mtgIndiceDoModelo(c, modelos) {
    const k = chaveDoModelo(c);
    const j = modelos.findIndex(m => chaveDoModelo(m) === k);
    return j < 0 ? 0 : j;
}

/**
 * Desenha a folha: a grade real do formato, na proporção real, folha a folha.
 *
 * TODAS as células aparecem, e não só as da primeira folha: é aqui que o
 * operador arrasta, repete e tira, e uma célula da segunda folha que não
 * aparecesse seria uma célula sem alcance. As vazias só existem na última
 * folha, que é a única que pode ter sobra.
 */
function _mtgRenderFolha() {
    const alvo = document.getElementById('mtg-folha');
    const numFolha = document.getElementById('mtg-folha-num');
    if (!alvo) return;

    const { celulas, modelos, selecao, zoom, numero } = state.montagem;
    const porFolha = _mtgCelulasPorFolha(modelos);
    const total = celulas.length;

    if (!total || !porFolha) {
        alvo.innerHTML = '';
        alvo.className = 'mtg-folha vazia';
        if (numFolha) numFolha.textContent = '';
        // A folha limpa devolve o card à altura natural e recolhe o seletor:
        // sem isto, o card ficaria do tamanho da montagem que acabou de sair.
        _mtgSoltarAlturaDaJanela(alvo);
        _mtgRenderSeletorDeFolha(0, 0);
        return;
    }

    const geo = geometriaDaFolha(modelos[0].peca, _mtgSaidaDaFolha(modelos));
    const conta = contaDaMontagem(celulas, porFolha);

    if (!geo) {
        // Sem medidas não dá para desenhar uma folha honesta. Melhor uma lista
        // simples do que um papel inventado — e o operador precisa saber.
        alvo.className = 'mtg-folha sem-medida';
        alvo.innerHTML = '<p class="mtg-dica" style="padding:14px;">'
            + 'Não sei as medidas deste formato, então não desenho a folha. As células estão na lista ao lado, na ordem em que vão sair.</p>';
        if (numFolha) numFolha.textContent = `${total} célula(s)`;
        _mtgSoltarAlturaDaJanela(alvo);
        _mtgRenderSeletorDeFolha(0, 0);
        return;
    }

    // A janela ganha a altura que sobra na tela ANTES de a escala ser
    // calculada: a escala do modo Folha vem da altura medida, e medir depois
    // de desenhar daria a escala da janela antiga.
    _mtgAjustarAlturaDaJanela(alvo);

    // A área disponível decide a escala. `clientWidth` é o que sobra depois do
    // padding do container — medir aqui, e não chutar, é o que faz a folha
    // caber em qualquer largura de tela da gráfica.
    const larg = Math.max(240, (alvo.clientWidth || 700) - 24);
    const alt = Math.max(240, (alvo.clientHeight || 520) - 24);
    const escala = escalaDaFolhaDaMontagem(zoom, geo, larg, alt);
    const px = mm => (mm * escala);

    const mostraPapel = geo.temPapel && zoom !== 'peca';
    const larguraDesenho = mostraPapel ? geo.sheetW : geo.usedW;
    const alturaDesenho = mostraPapel ? geo.sheetH : geo.usedH;
    const deslocX = mostraPapel ? geo.startX : 0;
    const deslocY = mostraPapel ? geo.startY : 0;

    const alturaCelulaPx = px(geo.itemH);
    const larguraCelulaPx = px(geo.itemW);
    // Abaixo de certo tamanho o rótulo não cabe e vira borrão: some, e ficam a
    // cor do modelo e o número. Melhor uma célula limpa do que texto ilegível.
    //
    // Os limites baixaram em 04/09/2026, quando a janela passou a abrir com a
    // folha inteira: numa tira Triband a célula fica com 21 px de altura, e os
    // números antigos (26 e 34) apagavam rótulo e botões logo no modo padrão.
    // A fonte da célula tem 10,5 px, então 16 px de caixa a comportam; o botão
    // mede 19 px, e por isso o limite dele é maior — um botão que não cabe na
    // célula vaza para a vizinha.
    const cabeRotulo = alturaCelulaPx >= 16 && larguraCelulaPx >= 96;
    const cabemBotoes = alturaCelulaPx >= 23 && larguraCelulaPx >= 110;

    // UMA FOLHA POR VEZ. Empilhadas, a segunda folha empurrava a primeira para
    // fora da tela e o operador rolava para tudo; agora a folha visível cabe
    // inteira e as outras ficam nas setas da barra.
    const visivel = folhaVisivelDaMontagem(state.montagem.folha, conta.folhas);
    state.montagem.folha = visivel;

    const html = [];
    for (let f = visivel; f <= visivel; f++) {
        const celulasDaFolha = [];

        for (let p = 0; p < porFolha; p++) {
            const i = f * porFolha + p;
            const lugar = lugarDaCelulaNaFolha(i, geo.cols, geo.rows);
            const x = deslocX + lugar.coluna * (geo.itemW + geo.gapH);
            const y = deslocY + lugar.linha * (geo.itemH + geo.gapV);
            const caixa = `left:${px(x).toFixed(1)}px;top:${px(y).toFixed(1)}px;`
                + `width:${larguraCelulaPx.toFixed(1)}px;height:${alturaCelulaPx.toFixed(1)}px;`;

            if (i >= total) {
                celulasDaFolha.push(
                    `<div class="mtg-celula mtg-celula-vazia" style="${caixa}" data-i="${i}">`
                    + (cabeRotulo ? '<span class="mtg-celula-rotulo">vazia</span>' : '')
                    + '</div>');
                continue;
            }

            const c = celulas[i];
            const j = _mtgIndiceDoModelo(c, modelos);
            const m = modelos[j] || {};
            const [bg, br, fg] = _MTG_TONS[j % _MTG_TONS.length].split('|');
            const repetida = celulas.findIndex(o =>
                chaveDoModelo(o) === chaveDoModelo(c) && o.pos === c.pos) !== i;
            const marcada = selecao.indexOf(i) >= 0;

            const rotulo = cabeRotulo
                ? `<span class="mtg-celula-rotulo">${escapeHtml(String(m.pedidoNumero || c.osId))} · ${escapeHtml(String(c.itemId))} · #${c.pos}`
                  + (repetida ? ' <em>repetida</em>' : '') + '</span>'
                : '';
            const botoes = cabemBotoes ? `
                <button type="button" class="mtg-celula-btn" title="Repetir esta célula na próxima, empurrando as outras"
                        onclick="event.stopPropagation(); duplicarCelulaDaMontagem(${i})">&#10697;</button>
                <button type="button" class="mtg-celula-btn mtg-celula-tirar" title="Tirar só esta célula da folha"
                        onclick="event.stopPropagation(); removerCelulaDaMontagem(${i})">&times;</button>` : '';
            const textoNum = textoDoNumeroDoModelo(c.itemId);
            const numeroHtml = numero.imprimir
                ? `<span style="${_mtgEstiloDoNumero(numero, escala, textoNum)}">${escapeHtml(textoNum)}</span>`
                : '';
            // O rótulo recua o que o número ocupa: sem isto ele fica por baixo.
            const espaco = _mtgEspacoDoNumero(numero, escala, textoNum);
            const recuo = (espaco.esquerda || espaco.direita)
                ? `padding-left:${7 + espaco.esquerda}px;padding-right:${4 + espaco.direita}px;` : '';

            celulasDaFolha.push(
                `<div class="mtg-celula${marcada ? ' marcada' : ''}${repetida ? ' repetida' : ''}"
                      draggable="true" data-i="${i}"
                      style="${caixa}${recuo}background:${bg};border-color:${br};color:${fg};"
                      onclick="selecionarCelulaDaMontagem(${i}, event)"
                      title="${escapeHtml(String(m.nome || ''))} — clique para selecionar, arraste para mudar a ordem">
                   ${numeroHtml}${rotulo}${botoes}
                 </div>`);
        }

        html.push(
            `<div class="mtg-papel${mostraPapel ? '' : ' sem-papel'}" `
            + `style="width:${px(larguraDesenho).toFixed(1)}px;height:${px(alturaDesenho).toFixed(1)}px;">`
            + celulasDaFolha.join('') + '</div>');
    }

    alvo.className = 'mtg-folha';
    alvo.innerHTML = html.join('');

    if (numFolha) {
        const medida = geo.temPapel
            ? `${Math.round(geo.sheetW)}×${Math.round(geo.sheetH)} mm`
            : `${geo.cols}×${geo.rows}`;
        numFolha.textContent = `${conta.folhas} folha(s) · ${total} célula(s) · ${medida}`;
    }

    _mtgRenderSeletorDeFolha(conta.folhas, visivel);
}

/**
 * A altura da janela, medida na tela e aplicada nela.
 *
 * Fica separada do desenho porque é o único ponto do arquivo que toca a
 * geometria da PÁGINA, e não a do papel.
 */
function _mtgAjustarAlturaDaJanela(alvo) {
    if (!alvo || typeof window === 'undefined' || !alvo.closest) return;
    const card = alvo.closest('.mtg-folha-card');
    if (!card) return;
    // A medida vai no CARD, e não na janela. A janela é `flex: 1` dentro dele:
    // dar altura a ela não adianta nada, porque o flex a estica de volta para
    // o tamanho do card — foi o que a primeira versão desta função fez, e a
    // folha continuou passando da tela.
    const resto = Math.max(0, card.offsetHeight - alvo.offsetHeight);
    const altura = alturaDaJanelaDaMontagem(
        card.getBoundingClientRect().top, window.innerHeight, resto);
    card.style.height = (altura + resto) + 'px';
}

/** Devolve o card à altura natural — sem folha desenhada, não há o que medir. */
function _mtgSoltarAlturaDaJanela(alvo) {
    if (!alvo || !alvo.closest) return;
    const card = alvo.closest('.mtg-folha-card');
    if (card) card.style.height = '';
}

/** O seletor `Folha ‹ 1 › de 3` da barra: espelha o da janela do Pedido. */
function _mtgRenderSeletorDeFolha(folhas, visivel) {
    const caixa = document.getElementById('mtg-folha-pag');
    if (!caixa) return;
    // Com uma folha só o seletor não tem o que oferecer, e uma caixa morta na
    // barra é ruído — a montagem de um retoque costuma caber numa folha.
    caixa.style.display = (folhas > 1) ? 'flex' : 'none';
    const campo = document.getElementById('mtg-folha-input');
    if (campo) {
        campo.max = String(folhas);
        campo.value = String(visivel + 1);
    }
    const de = document.getElementById('mtg-folha-de');
    if (de) de.textContent = 'de ' + folhas;
    const ant = document.getElementById('mtg-folha-ant');
    if (ant) ant.disabled = visivel <= 0;
    const prox = document.getElementById('mtg-folha-prox');
    if (prox) prox.disabled = visivel >= folhas - 1;
}

/** Vira a janela para a folha `n` (contada de 0). */
function irParaFolhaDaMontagem(n) {
    const porFolha = _mtgCelulasPorFolha(state.montagem.modelos);
    const conta = contaDaMontagem(state.montagem.celulas, porFolha);
    const nova = folhaVisivelDaMontagem(n, conta.folhas);
    if (nova === state.montagem.folha) {
        // Mesmo sem mudar, o seletor volta ao valor válido: o operador pode
        // ter digitado 9 numa montagem de 2 folhas.
        _mtgRenderSeletorDeFolha(conta.folhas, nova);
        return;
    }
    state.montagem.folha = nova;
    _mtgRenderFolha();
}

/**
 * Leva a janela até a folha onde a célula `i` está.
 *
 * Sem isto, com uma folha por vez, a célula que o operador acabou de mover ou
 * de acrescentar podia cair na folha seguinte e simplesmente sumir da tela —
 * ele teria de descobrir sozinho que precisava virar a folha.
 */
function _mtgSeguirCelula(i) {
    const porFolha = _mtgCelulasPorFolha(state.montagem.modelos);
    if (!porFolha || i === undefined || i === null || i < 0) return;
    state.montagem.folha = Math.floor(i / porFolha);
}

/** A folha anterior. */
function folhaAnteriorDaMontagem() {
    irParaFolhaDaMontagem((state.montagem.folha || 0) - 1);
}

/** A próxima folha. */
function proximaFolhaDaMontagem() {
    irParaFolhaDaMontagem((state.montagem.folha || 0) + 1);
}

/**
 * Liga o arrasto das células, uma vez só, por delegação no container.
 *
 * Por delegação porque a folha é redesenhada a cada mudança — ouvintes presos
 * a cada célula morreriam junto com o HTML. E HTML5 drag-and-drop, e não uma
 * biblioteca: cada estação da gráfica usa um navegador diferente, e isto
 * funciona em todos eles sem instalar nada.
 */
function _mtgLigarArrasto() {
    const folha = document.getElementById('mtg-folha');
    if (!folha || folha._mtgArrastoLigado) return;
    folha._mtgArrastoLigado = true;

    let de = null;
    const celulaDe = ev => (ev.target && ev.target.closest) ? ev.target.closest('.mtg-celula') : null;
    const limpar = () => folha.querySelectorAll('.mtg-celula-arrastando, .mtg-celula-alvo')
        .forEach(e => e.classList.remove('mtg-celula-arrastando', 'mtg-celula-alvo'));

    folha.addEventListener('dragstart', ev => {
        const el = celulaDe(ev);
        if (!el || !el.hasAttribute('draggable')) return;
        de = parseInt(el.dataset.i);
        el.classList.add('mtg-celula-arrastando');
        try {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', String(de));
        } catch (_) {}
    });

    folha.addEventListener('dragover', ev => {
        const el = celulaDe(ev);
        if (de === null || !el) return;
        ev.preventDefault();
        try { ev.dataTransfer.dropEffect = 'move'; } catch (_) {}
        folha.querySelectorAll('.mtg-celula-alvo').forEach(e => e.classList.remove('mtg-celula-alvo'));
        el.classList.add('mtg-celula-alvo');
    });

    folha.addEventListener('drop', ev => {
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

    folha.addEventListener('dragend', () => { de = null; limpar(); });

    // ARRASTAR ENTRE FOLHAS. Com uma folha por vez, a folha de destino não
    // está na tela — soltar a célula SOBRE A SETA a manda para a folha
    // vizinha, e a janela vira junto para mostrar onde ela caiu. Sem isto, o
    // arrasto perderia o alcance que tinha quando as folhas ficavam
    // empilhadas.
    [['mtg-folha-ant', -1], ['mtg-folha-prox', 1]].forEach(([id, passo]) => {
        const seta = document.getElementById(id);
        if (!seta) return;
        seta.addEventListener('dragover', ev => {
            if (de === null) return;
            ev.preventDefault();
            seta.classList.add('mtg-seta-alvo');
        });
        seta.addEventListener('dragleave', () => seta.classList.remove('mtg-seta-alvo'));
        seta.addEventListener('drop', ev => {
            if (de === null) return;
            ev.preventDefault();
            seta.classList.remove('mtg-seta-alvo');
            const origem = de;
            de = null;
            limpar();
            const porFolha = _mtgCelulasPorFolha(state.montagem.modelos);
            if (!porFolha) return;
            const conta = contaDaMontagem(state.montagem.celulas, porFolha);
            const alvoFolha = folhaVisivelDaMontagem((state.montagem.folha || 0) + passo, conta.folhas);
            if (alvoFolha === state.montagem.folha) return;
            // Entra na primeira vaga da folha de destino, que é o lugar que o
            // operador vê primeiro ao chegar nela.
            const destino = Math.min(alvoFolha * porFolha, state.montagem.celulas.length - 1);
            moverCelulaDaMontagem(origem, destino);
        });
    });
}

/**
 * O teclado sobre a folha.
 *
 * Setas movem a célula selecionada, Del tira, Ctrl+D repete, Ctrl+Z desfaz.
 * Arrastar com o mouse continua sendo o caminho principal; isto é para quem
 * repete o gesto o dia inteiro.
 *
 * Só age quando a tela da Montagem está aberta e o foco NÃO está num campo de
 * digitação — senão Delete apagaria a folha enquanto o operador corrige uma
 * posição no compositor.
 */
function _mtgLigarTeclado() {
    if (window._mtgTecladoLigado) return;
    window._mtgTecladoLigado = true;

    document.addEventListener('keydown', ev => {
        const view = document.getElementById('view-montagem');
        if (!view || !view.classList.contains('active')) return;

        const alvo = ev.target;
        const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA'
            || alvo.tagName === 'SELECT' || alvo.isContentEditable);

        const m = state.montagem;
        const ctrl = ev.ctrlKey || ev.metaKey;

        if (ctrl && (ev.key === 'z' || ev.key === 'Z')) {
            ev.preventDefault();
            if (ev.shiftKey) refazerMontagem(); else desfazerMontagem();
            return;
        }
        if (ctrl && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); refazerMontagem(); return; }

        if (digitando || !m.selecao.length) return;

        const i = m.selecao[0];
        if (ctrl && (ev.key === 'd' || ev.key === 'D')) {
            ev.preventDefault(); duplicarCelulaDaMontagem(i); return;
        }
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
            ev.preventDefault(); removerCelulaDaMontagem(i); return;
        }
        if (ev.key === 'Escape') { ev.preventDefault(); m.selecao = []; renderMontagem(); return; }

        const passo = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[ev.key];
        if (passo === undefined || m.selecao.length !== 1) return;
        const destino = i + passo;
        if (destino < 0 || destino >= m.celulas.length) return;
        ev.preventDefault();
        moverCelula(m.celulas, i, destino);
        m.selecao = [destino];
        // As setas atravessam a fronteira da folha — é assim que se leva uma
        // célula da folha 1 para a 2 agora que só uma aparece por vez.
        _mtgSeguirCelula(destino);
        renderMontagem();
    });
}

/** Desenha a lista, o selo, a trava, a folha e o painel do número. */
function renderMontagem() {
    const { celulas, modelos, selecao } = state.montagem;
    const lista = document.getElementById('mtg-lista');
    const selo = document.getElementById('mtg-selo');
    const trava = document.getElementById('mtg-trava');
    const resumo = document.getElementById('mtg-resumo');
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

    // ── As ações que dependem do que há na folha ───────────────────────────
    const ligar = (id, ativo, titulo) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = !ativo;
        if (titulo) el.title = titulo;
    };
    ligar('mtg-desfazer', state.montagem.historia.length > 0,
          state.montagem.historia.length ? 'Desfazer o último gesto (Ctrl+Z)' : 'Nada a desfazer');
    ligar('mtg-refazer', state.montagem.futuro.length > 0,
          state.montagem.futuro.length ? 'Refazer (Ctrl+Shift+Z)' : 'Nada a refazer');
    ligar('mtg-completar', total > 0 && porFolha > 0 && conta.vazias > 0,
          conta.vazias > 0 ? `Repetir células até fechar a folha — entram ${conta.vazias}`
                           : 'A folha já fecha certo');
    ligar('mtg-ordenar', total > 1, 'Agrupar as células por modelo ou por pedido');

    // A barra da seleção. Até 04/09/2026 ela só aparecia com DUAS células ou
    // mais, porque "com uma só, os botões da própria célula já resolvem". Isso
    // deixou de ser verdade quando a janela passou a abrir com a folha inteira:
    // numa célula de 21 px o ⧉ e o × não cabem, e sem a barra o operador
    // ficaria só com o teclado. Agora ela aparece com uma célula marcada
    // também — e é ela que dá os dois gestos com o rótulo escrito.
    const barraSel = document.getElementById('mtg-selecao');
    if (barraSel) {
        if (selecao.length >= 1) {
            const varias = selecao.length > 1;
            barraSel.style.display = 'flex';
            barraSel.innerHTML = `
              <span><strong>${selecao.length}</strong> célula${varias ? 's' : ''} selecionada${varias ? 's' : ''}</span>
              <button type="button" class="btn btn-secondary btn-sm" onclick="duplicarCelulaDaMontagem(${selecao[0]})">&#10697; Repetir ${varias ? 'todas' : 'na próxima'}</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="removerCelulaDaMontagem(${selecao[0]})">&times; Tirar ${varias ? 'todas' : 'da folha'}</button>
              <button type="button" class="mtg-escolher-pasta" style="margin-left:auto;" onclick="state.montagem.selecao=[];renderMontagem();">Limpar seleção</button>`;
        } else {
            barraSel.style.display = 'none';
        }
    }

    // ── A trava ────────────────────────────────────────────────────────────
    // Nasce escondida e aparece com a primeira célula: o operador não escolhe
    // um formato num seletor, ele adiciona e a folha passa a dizer o que aceita.
    if (trava) {
        if (!modelos.length) {
            trava.style.display = 'none';
        } else {
            const p = modelos[0].peca;
            const sai = _mtgSaidaDaFolha(modelos);
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
              <svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true">
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
              <tr><th>Modelo</th><th style="text-align:right;">Tiragem</th><th>Na folha</th><th style="width:32px;"></th></tr>
              ${modelos.map((m, j) => {
                  const vezes = {};
                  const ordem = [];
                  for (const p of celulasDoModelo(celulas, m)) {
                      if (!vezes[p]) { vezes[p] = 0; ordem.push(p); }
                      vezes[p]++;
                  }
                  const [bg] = _MTG_TONS[j % _MTG_TONS.length].split('|');
                  const chips = ordem.map(p =>
                      `<span class="mtg-pos${vezes[p] > 1 ? ' repetida' : ''}">#${p}${vezes[p] > 1 ? ' ×' + vezes[p] : ''}</span>`).join('');
                  const quantas = celulasDoModelo(celulas, m).length;
                  return `
                <tr class="mtg-linha${_mtgLinhaAtiva(m) ? ' mtg-linha-ativa' : ''}"
                    onclick="retomarDaMontagem(${j})"
                    title="Voltar a este modelo para acrescentar posições">
                  <td>
                    <div style="display:flex;align-items:center;gap:7px;">
                      <span class="mtg-tom" style="background:${bg};"></span>
                      <div style="min-width:0;">
                        <div style="color:var(--text);font-weight:600;">${escapeHtml(String(m.pedidoNumero || m.osId))} · ${escapeHtml(String(m.itemId))}</div>
                        <div style="font-size:0.75rem;">${escapeHtml(String(m.nome).slice(0, 40))}</div>
                      </div>
                    </div>
                  </td>
                  <td style="text-align:right;" title="Quantos itens este modelo imprime ao todo — é contra este número que a posição vale.">${(m.qtd || 0).toLocaleString('pt-BR')}</td>
                  <td><span class="mtg-posicoes">${chips}</span> <span style="color:var(--text-faint);font-size:0.74rem;">(${quantas})</span></td>
                  <td style="text-align:right;"><span class="mtg-tirar" title="Tirar este modelo da montagem, com todas as células dele" onclick="event.stopPropagation(); removerDaMontagem(${j})">&times;</span></td>
                </tr>`;
              }).join('')}
            </table>
            <p class="mtg-dica" style="margin-top:10px;">
              Clique numa linha para <strong>voltar àquele modelo</strong> e acrescentar posições.
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

    // ── O zoom marcado ─────────────────────────────────────────────────────
    ['peca', 'folha', '100'].forEach(z => {
        const b = document.getElementById('mtg-zoom-' + z);
        if (b) b.classList.toggle('ativo', state.montagem.zoom === z);
    });

    _mtgRenderSugestao();
    _mtgRenderNumero();
    _mtgRenderFolha();
}

/** Chamada ao entrar na tela. */
async function abrirMontagem() {
    if (!state.montagem || !state.montagem.celulas) state.montagem = montagemVazia();
    encherPedidosDaMontagem();
    _mtgLigarArrasto();
    _mtgLigarTeclado();
    onMontagemPosicoesChange();
    renderMontagem();
    // A folha se redesenha quando a janela muda de tamanho: a escala vem da
    // largura medida, e sem isto ela ficaria com a escala da abertura.
    if (!window._mtgRedesenhoLigado) {
        window._mtgRedesenhoLigado = true;
        let t = null;
        window.addEventListener('resize', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                const v = document.getElementById('view-montagem');
                if (v && v.classList.contains('active')) _mtgRenderFolha();
            }, 150);
        });
    }
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

    const numero = numeroDaMontagemSaneado(state.montagem.numero);
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
            // Uma escolha para a montagem inteira, e não a opção salva em cada
            // modelo — ver `imprimirNumeroNaMontagem`.
            arte._imprimirNumero = numero.imprimir;

            const pronta = arteParaOMotor(arte, true);

            // COMO o número sai no papel. O motor tem os quatro campos desde
            // 03/09/2026; antes disso só a cor passava, e os outros três eram
            // constantes no `engine.py`. Agente velho ignora os campos novos e
            // imprime como sempre — que é exatamente o padrão desta tela.
            pronta.nome_color = numero.cor;
            pronta.nome_size = numero.size;
            pronta.nome_pos = numero.pos;
            pronta.nome_rot = numero.rot;

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
    window.selecionarCelulaDaMontagem = selecionarCelulaDaMontagem;
    window.completarAFolhaDaMontagem = completarAFolhaDaMontagem;
    window.ordenarMontagem = ordenarMontagem;
    window.zoomDaMontagem = zoomDaMontagem;
    window.irParaFolhaDaMontagem = irParaFolhaDaMontagem;
    window.folhaAnteriorDaMontagem = folhaAnteriorDaMontagem;
    window.proximaFolhaDaMontagem = proximaFolhaDaMontagem;
    window.desfazerMontagem = desfazerMontagem;
    window.refazerMontagem = refazerMontagem;
    window.guardarNaHistoria = guardarNaHistoria;
    window.alternarNumeroDaMontagem = alternarNumeroDaMontagem;
    window.mudarNumeroDaMontagem = mudarNumeroDaMontagem;
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
    window.buscarPedidoDaMontagem = buscarPedidoDaMontagem;
}
