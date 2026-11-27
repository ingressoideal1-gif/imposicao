// Formato de exportacao compartilhado pelo Ideal Control e pelo Imposition.
(function () {
    'use strict';

    // Relatórios usam Brasília, independente do fuso do navegador.
    // Compatibilidade: o backend antigo enviava as faixas UTC sem o sufixo Z.
    function dataDoRelatorio(iso) {
        if (!iso) return null;
        var texto = String(iso).replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) texto += 'T00:00:00Z';
        else if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(texto)) texto += 'Z';
        var data = new Date(texto);
        return isNaN(data.getTime()) ? null : data;
    }

    var formatadores = {};
    function horarioDoRelatorio(iso, faixa) {
        var data = dataDoRelatorio(iso);
        if (!data) return '';
        var chave = faixa ? 'faixa' : 'data';
        if (!formatadores[chave]) {
            var opcoes = { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
                hour: '2-digit', hourCycle: 'h23' };
            if (!faixa) { opcoes.year = 'numeric'; opcoes.minute = '2-digit'; opcoes.second = '2-digit'; }
            formatadores[chave] = new Intl.DateTimeFormat('pt-BR', opcoes);
        }
        var partes = formatadores[chave].formatToParts(data);
        var p = {};
        partes.forEach(function (parte) { p[parte.type] = parte.value; });
        return p.day + '/' + p.month + (faixa ? ' ' + p.hour + 'h' :
            '/' + p.year + ' ' + p.hour + ':' + p.minute + ':' + p.second);
    }

    function csvDe(leituras) {
        // `;` e não `,`: o Excel em português abre o ponto-e-vírgula em colunas
        // sem perguntar nada, e é nele que este arquivo vai ser aberto.
        var linhas = [[
            'Leitura (Brasília)', 'Recebido no servidor (Brasília)', 'Setor', 'Aparelho',
            'Numero', 'Tipo', 'Resultado', 'Motivo', 'Momento original (ISO)', 'Recebimento original (ISO)'
        ].join(';')];
        leituras.forEach(function (l) {
            linhas.push([
                horarioDoRelatorio(l.momento, false), horarioDoRelatorio(l.recebido_em, false), l.setor || '',
                l.aparelho || '', l.numero === null || typeof l.numero === 'undefined'
                    ? '' : l.numero,
                l.tipo || '', l.resultado || '', l.rotulo_motivo || l.motivo || '',
                l.momento || '', l.recebido_em || ''
            ].map(function (v) {
                // Ponto-e-vírgula e quebra de linha dentro de um campo partem a
                // planilha em colunas que ninguém pediu. Nome de setor é texto
                // digitado por gente: cabe qualquer coisa.
                return '"' + String(v).replace(/"/g, '""') + '"';
            }).join(';'));
        });
        return linhas.join('\r\n');
    }

    function baixarCsv(nomeEvento, leituras) {
        var nome = 'ideal-control-'
            + String(nomeEvento).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            + '.csv';
        // O BOM mantém os acentos ao abrir o arquivo no Excel para Windows.
        var blob = new Blob(['﻿' + csvDe(leituras)], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        var url = URL.createObjectURL(blob);
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        try {
            a.click();
        } finally {
            document.body.removeChild(a);
            // O navegador ainda pode usar a URL depois do clique.
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        }
    }

    function respostaValida(resposta) {
        return !!resposta && typeof resposta === 'object'
            && !('pagina' in resposta) && !('por_pagina' in resposta)
            && Array.isArray(resposta.leituras) && typeof resposta.ha_mais === 'boolean'
            && resposta.leituras.every(function (l) { return l && typeof l === 'object' && !Array.isArray(l); });
    }

    window.IdealControlCsv = {
        horarioDoRelatorio: horarioDoRelatorio,
        csvDe: csvDe,
        baixar: baixarCsv,
        respostaValida: respostaValida
    };
})();
