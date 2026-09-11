/**
 * Qual arquivo pode servir de ARTE numa imposicao — e qual nunca pode.
 * ---------------------------------------------------------------------------
 *
 * Um modelo pode legitimamente nao ter arte: o ingresso e so numeracao sobre o
 * papel. Nesse caso a imposicao sai com a numeracao e mais nada, e sempre foi
 * assim. O defeito que este arquivo conserta e o sistema INVENTAR uma arte
 * quando ela falta.
 *
 * ── O que estava acontecendo ────────────────────────────────────────────────
 *
 * O estado do painel monta `arte_url` assim (script.js):
 *
 *     arte_url: p.arte_url || p.amostra_arte_base64 || ''
 *
 * Para a TELA isso e razoavel: sem arte, mostre a amostra. Para a IMPOSICAO e
 * um desastre silencioso, porque `amostra_arte_base64` e a **amostra de
 * aprovacao** — o JPEG combinado que o cliente aprova, com tudo achatado
 * dentro:
 *
 *   • a camada da Cor, que o motor nunca desenha e que JAMAIS pode sair
 *     impressa (regra do usuario, 14/08/2026);
 *   • os proprios elementos de numeracao, que o motor desenha DE NOVO por cima,
 *     deixando tudo em duplicata;
 *   • o QR Ideal com a **logo no meio** — que e marca de tela e, no papel,
 *     apaga modulos de verdade. O leitor recusa o ingresso na portaria, com o
 *     lote ja entregue e sem conserto;
 *   • resolucao de amostra. Medido no pedido 18560: 877 x 309 px para um
 *     ingresso de 148,5 x 52,25 mm, ou seja **150 dpi** — metade do minimo de
 *     impressao.
 *
 * Medicao no banco em 14/08/2026: dos 109 modelos, 42 tem arte de verdade
 * (nada muda), 52 nao tem arte nem amostra (ja saiam so com numeracao), e
 * **15** tinham amostra sem arte — esses 15 vinham imprimindo a amostra.
 *
 * ── Por que o corte e aqui, e nao no `arte_url` ─────────────────────────────
 *
 * `arte_url` e lido em cerca de 28 lugares do painel, quase todos de tela:
 * copiar link, mostrar amostra, salvar, botao de remover. Mudar o significado
 * dela consertaria a impressao e quebraria a interface. Entao ela continua como
 * esta, e quem filtra e este arquivo — chamado apenas onde se escolhe o
 * original que vai ao motor.
 *
 * ── A Cor tambem nao entra ──────────────────────────────────────────────────
 *
 * Havia um segundo caminho: `corObj.pdf_url` virava arte quando o modelo nao
 * tinha nenhuma. Regra do usuario: a Cor jamais sai na impressao nem na
 * imposicao de PDF. Medicao no mesmo dia: **nenhuma das 24 cores** do catalogo
 * tem `pdf_url`, entao esse caminho nunca produzia nada — remove-lo cumpre a
 * regra sem mudar um unico trabalho.
 *
 * Este arquivo nao tem dependencia nenhuma de proposito. As duas paginas
 * carregam o `script.js`, entao nao e uma questao de alcance — e de ordem e
 * de risco: um modulo pequeno e sem dependencia carrega cedo, nao pode
 * quebrar por causa de outra coisa, e da para ler inteiro de uma vez quando
 * alguem precisar auditar por que uma arte foi ou nao para o papel.
 */
(function (raiz) {
    'use strict';

    // A pasta do Storage onde a amostra aprovada e gravada. E o unico sinal
    // confiavel: o nome do arquivo varia (frente/verso, pedido, modelo,
    // timestamp), mas o balde nao.
    var PASTA_AMOSTRA = 'amostras_renderizadas';

    /**
     * O arquivo apontado por esta URL e uma amostra de aprovacao?
     *
     * Aceita qualquer coisa (null, undefined, data: URI) sem levantar: quem
     * chama esta no caminho do operador, e uma excecao aqui derrubaria a
     * montagem do trabalho inteiro.
     */
    function ehAmostraRenderizada(url) {
        if (!url || typeof url !== 'string') return false;
        return url.indexOf(PASTA_AMOSTRA) !== -1;
    }

    /**
     * A arte que pode ir ao motor, ou `null` quando nao existe arte de verdade.
     *
     * `null` NAO e erro: e a instrucao de impor so a numeracao, que e o
     * comportamento correto para um modelo sem arte.
     */
    function arteDeImpressao(url) {
        if (!url || typeof url !== 'string') return null;
        if (ehAmostraRenderizada(url)) return null;
        return url;
    }

    // A previa baixa em segundo plano e pode terminar depois do clique em
    // Gerar/Imprimir. O arquivo deste trabalho vem do modelo, nao desse cache.
    async function prepararVersoDoTrabalho(estado, modo, arquivoManual) {
        if (modo !== 'duplex' && modo !== 'duplex_unico') return null;
        function selecao() {
            const ativo = estado.activeOSItem;
            if (!ativo) return null;
            const item = (estado.osItens?.[ativo.osId] || [])
                .find(i => String(i.id) === String(ativo.itemId));
            if (!item) throw new Error('Reabra o modelo antes de gerar a impressão.');
            return { os: String(ativo.osId), id: String(item.id),
                frente: item.arte_url || item.url_arquivo_arte || null,
                verso: item.verso_arte_url || item.url_arquivo_arte_verso || item.verso_url_arquivo || null };
        }
        const inicial = selecao();
        if (!inicial) return arquivoManual || null;
        const url = arteDeImpressao(inicial.verso);
        // Sem original, nunca reaproveitar o verso de outro modelo ou de Cor.
        if (!url) return null;
        const controle = new AbortController();
        const limite = setTimeout(() => controle.abort(), 30000);
        try {
            const resposta = await fetch(url, { signal: controle.signal });
            if (!resposta.ok) throw new Error('Download recusado');
            const blob = await resposta.blob();
            if (!blob.size || /text\/html|application\/json/i.test(blob.type)) {
                throw new Error('Arquivo vazio ou resposta inválida');
            }
            // Os originais aceitos pelo motor sao PDF ou imagem. Uma resposta
            // de erro HTTP 200 nao pode virar um upload com extensao .pdf.
            const bytes = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
            const pdf = new TextDecoder('latin1').decode(bytes).includes('%PDF-');
            const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
            const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
            const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
                && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
            if (!pdf && !png && !jpg && !webp) throw new Error('Formato inválido');
            if (JSON.stringify(selecao()) !== JSON.stringify(inicial)) {
                throw new Error('O modelo ou a arte mudou durante o carregamento. Gere novamente.');
            }
            const extensao = pdf ? 'pdf' : png ? 'png' : jpg ? 'jpg' : 'webp';
            return new File([blob], `verso_${inicial.id}.${extensao}`,
                { type: pdf ? 'application/pdf' : `image/${extensao === 'jpg' ? 'jpeg' : extensao}` });
        } catch (erro) {
            if (erro.message.startsWith('O modelo ou a arte mudou')) throw erro;
            throw new Error('Não foi possível carregar a arte do verso. Confira a conexão e gere novamente.');
        } finally {
            clearTimeout(limite);
        }
    }

    raiz.prepararVersoDoTrabalho = prepararVersoDoTrabalho;
    raiz.ehAmostraRenderizada = ehAmostraRenderizada;
    raiz.arteDeImpressao = arteDeImpressao;
    raiz.PASTA_AMOSTRA_RENDERIZADA = PASTA_AMOSTRA;
})(typeof window !== 'undefined' ? window : globalThis);
