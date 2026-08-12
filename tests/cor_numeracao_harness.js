// Ponte entre o Pester e a regra de reconciliacao, que e JavaScript de navegador.
//
// Recebe o caminho de um arquivo JSON com { linha, cores, numeracoes }, chama
// reconciliarCorNumDoModelo e imprime o resultado como JSON. O arquivo e lido
// como UTF-8 e tem o BOM removido porque o Set-Content do PowerShell 5.1 grava
// um, e o JSON.parse recusa o arquivo com ele.

const fs = require('fs');
const path = require('path');

const modulo = require(path.join(__dirname, '..', 'frontend', 'cor-numeracao-do-modelo.js'));

const bruto = fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '');
const caso = JSON.parse(bruto);

const saida = modulo.reconciliarCorNumDoModelo(caso.linha, caso.cores, caso.numeracoes);
process.stdout.write(JSON.stringify(saida));
