// Ponte entre o Pester e o modulo de fontes do canvas, que e JavaScript de navegador.
//
// Recebe o caminho de um arquivo JSON com { acao, ... } e imprime o resultado
// como JSON. O arquivo e lido como UTF-8 e tem o BOM removido porque o
// Set-Content do PowerShell 5.1 grava um, e o JSON.parse recusa o arquivo com ele.
//
// Acoes:
//   { acao: 'buildCanvasFont', corpo: 12, fonte: 'system:Arial|bold' }
//   { acao: 'getFontCSS', fonte: 'helv' }
//   { acao: 'cssDoCatalogo', catalogo: [...], servidoPeloAgente: false }
//   { acao: 'fontesDosElementos', elementos: [...] }
//   { acao: 'corridaDeDoisDesenhos', fonte: 'Bebas Neue' }

const fs = require('fs');
const path = require('path');

const modulo = require(path.join(__dirname, '..', 'frontend', 'fonte-canvas.js'));

const bruto = fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '');
const caso = JSON.parse(bruto);

/**
 * Dois desenhos concorrentes pedindo A MESMA fonte.
 *
 * E o que o link do cliente faz de verdade: o `forEach` que monta os cards
 * dispara um `renderItemAmostraCombinada` por modelo sem esperar o anterior, e
 * os modelos de um pedido costumam usar a mesma fonte. Se o segundo desenho nao
 * esperar a fonte que o primeiro foi buscar, ele pinta com uma generica -- e
 * canvas nao reflui, entao fica assim ate alguem redesenhar.
 *
 * Devolve, para cada chamada, se a fonte JA tinha chegado quando ela liberou o
 * traco.
 */
async function corridaDeDoisDesenhos(fonte) {
    let chegou = false;
    let liberar;
    const noAr = new Promise(res => { liberar = res; });

    globalThis.document = {
        fonts: { load: () => noAr },
        getElementById: () => null,
        createElement: () => ({}),
        head: { appendChild: () => {} },
    };
    // Sem catalogo o `carregarCatalogoFontesWeb` cai no catch e segue: o que
    // este caso mede e a espera pela fonte, nao a busca do catalogo.
    setTimeout(() => { chegou = true; liberar(); }, 10);

    const primeiro = modulo.garantirFontesCarregadas([fonte]).then(() => chegou);
    const segundo  = modulo.garantirFontesCarregadas([fonte]).then(() => chegou);
    const [a, b] = await Promise.all([primeiro, segundo]);

    // Depois de tudo pronto, uma terceira chamada nao pode mais esperar nada.
    const terceiro = await modulo.garantirFontesCarregadas([fonte]).then(() => chegou);

    return { primeiroEsperou: a, segundoEsperou: b, terceiroEsperou: terceiro };
}

let saida;
switch (caso.acao) {
    case 'buildCanvasFont':
        saida = { valor: modulo.buildCanvasFont(caso.corpo, caso.fonte) };
        break;
    case 'getFontCSS':
        saida = { valor: modulo.getFontCSS(caso.fonte) };
        break;
    case 'cssDoCatalogo':
        saida = { valor: modulo.cssDoCatalogo(caso.catalogo, !!caso.servidoPeloAgente) };
        break;
    case 'fontesDosElementos':
        saida = { valor: modulo.fontesDosElementos(caso.elementos) };
        break;
    case 'corridaDeDoisDesenhos':
        corridaDeDoisDesenhos(caso.fonte).then(v => {
            process.stdout.write(JSON.stringify({ valor: v }));
        });
        break;
    default:
        throw new Error(`acao desconhecida: ${caso.acao}`);
}

if (saida !== undefined) process.stdout.write(JSON.stringify(saida));
