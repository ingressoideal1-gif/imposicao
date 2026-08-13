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

const fs = require('fs');
const path = require('path');

const modulo = require(path.join(__dirname, '..', 'frontend', 'fonte-canvas.js'));

const bruto = fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '');
const caso = JSON.parse(bruto);

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
    default:
        throw new Error(`acao desconhecida: ${caso.acao}`);
}

process.stdout.write(JSON.stringify(saida));
