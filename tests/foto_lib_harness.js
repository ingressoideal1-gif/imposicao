// Testes da regra de casamento de fotos — a parte do Gerenciador de Fotos que
// decide a qual LINHA do banco cada arquivo do lote pertence.
//
// Roda em node, sem navegador: `node tests/foto_lib_harness.js`. Sai com codigo
// 1 se algum caso falhar, que e o que o Pester (CasamentoDeFotos.Tests.ps1) le.
//
// Por que testar isto com tanto cuidado: um casamento errado nao quebra nada —
// ele imprime a credencial da Ana com a foto do Bruno, e so o cliente descobre.

const path = require('path');
const lib = require(path.join(__dirname, '..', 'frontend', 'foto-lib.js'));

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

function arq(nome) { return { nome: nome }; }

function casadaDe(r, nome) {
    return r.casadas.find(c => c.arquivo === nome) || null;
}

// ─── 1. Nome exato ────────────────────────────────────────────────────────────

(function nomeExato() {
    const linhas = [{ Nome: 'Ana', Foto: 'ana.jpg' }, { Nome: 'Bruno', Foto: 'bruno.jpg' }];
    const r = lib.casarFotos([arq('ana.jpg'), arq('bruno.jpg')], linhas, ['Foto']);
    ok(r.casadas.length === 2, 'nome exato casa as duas', r);
    ok(casadaDe(r, 'ana.jpg') && casadaDe(r, 'ana.jpg').linha === 0, 'ana vai para a linha 0', r.casadas);
    ok(r.sobrando.length === 0 && r.semFoto.length === 0, 'nao sobra nada', r);
})();

// ─── 2. Sem extensao ──────────────────────────────────────────────────────────

(function semExtensao() {
    const linhas = [{ Nome: 'Ana', Foto: 'ana' }];
    const r = lib.casarFotos([arq('ana.jpg')], linhas, ['Foto']);
    ok(r.casadas.length === 1, 'a coluna sem extensao ainda casa', r);
    ok(r.casadas[0].regra === 'sem-extensao', 'a regra usada e identificada', r.casadas);
})();

// ─── 3. Normalizado: acento, maiuscula, espaco, separador ─────────────────────

(function normalizado() {
    const linhas = [{ Nome: 'JOSÉ DA SILVA' }, { Nome: 'Márcia Souza' }];
    const r = lib.casarFotos([arq('jose_da_silva.JPG'), arq('marcia-souza.jpeg')], linhas, ['Nome']);
    ok(r.casadas.length === 2, 'acento, caixa e separador nao atrapalham', r);
})();

// ─── 4. So os digitos (o caso do CPF) ─────────────────────────────────────────

(function soDigitos() {
    const linhas = [{ CPF: '123.456.789-00' }, { CPF: '987.654.321-11' }];
    const r = lib.casarFotos([arq('CPF 12345678900.jpg'), arq('98765432111.png')], linhas, ['CPF']);
    ok(r.casadas.length === 2, 'CPF pontuado casa com o arquivo so de digitos', r);
    // "98765432111.png" ja cai na regra normalizada, porque tirar a pontuacao do
    // CPF da o mesmo texto. Quem so a regra dos digitos resolve e o arquivo com
    // palavra no nome: "CPF 12345678900.jpg".
    ok(casadaDe(r, 'CPF 12345678900.jpg').regra === 'digitos', 'o nome com palavra casa pelos digitos', r.casadas);
})();

// Numero curto nao pode virar chave: "1.jpg" casaria com meia planilha.
(function digitoCurtoNaoCasa() {
    const linhas = [{ Cod: 'A-1' }, { Cod: 'B-1' }];
    const r = lib.casarFotos([arq('1.jpg')], linhas, ['Cod']);
    ok(r.casadas.length === 0, 'um digito solto nao casa nada', r);
})();

// ─── 5. Ambiguidade: dois arquivos disputando a mesma linha ───────────────────

(function ambiguidade() {
    const linhas = [{ Nome: 'Ana Paula' }];
    const r = lib.casarFotos([arq('ana paula.jpg'), arq('ANA_PAULA.png')], linhas, ['Nome']);
    ok(r.casadas.length === 0, 'na duvida o sistema nao escolhe sozinho', r);
    ok(r.ambiguas.length === 1, 'a disputa vira uma pendencia', r);
    ok(r.ambiguas[0].candidatos.length === 2, 'os dois candidatos sao oferecidos', r.ambiguas);
})();

// Duas pessoas com o mesmo nome tambem e ambiguidade, do outro lado.
(function homonimos() {
    const linhas = [{ Nome: 'Ana' }, { Nome: 'Ana' }];
    const r = lib.casarFotos([arq('ana.jpg')], linhas, ['Nome']);
    ok(r.casadas.length === 0, 'homonimas nao recebem foto no chute', r);
    ok(r.ambiguas.length === 1, 'a homonimia vira pendencia', r);
})();

// ─── 6. Sobras dos dois lados ─────────────────────────────────────────────────

(function sobras() {
    const linhas = [{ Nome: 'Ana' }, { Nome: 'Bruno' }];
    const r = lib.casarFotos([arq('ana.jpg'), arq('zelia.jpg')], linhas, ['Nome']);
    ok(r.casadas.length === 1, 'casa quem da', r);
    ok(r.sobrando.length === 1 && r.sobrando[0].nome === 'zelia.jpg', 'a foto sem dono aparece', r);
    ok(r.semFoto.length === 1 && r.semFoto[0] === 1, 'a linha sem foto aparece pelo indice', r);
})();

// ─── 7. Sugestao aproximada: oferece, nunca aplica ────────────────────────────

(function sugestao() {
    const linhas = [{ Nome: 'Ana Cristina' }];
    const r = lib.casarFotos([arq('ana cristna.jpg')], linhas, ['Nome']);
    ok(r.casadas.length === 0, 'parecido nao e igual: nao casa sozinho', r);
    ok(r.ambiguas.length === 1 && r.ambiguas[0].regra === 'sugestao', 'vira sugestao', r.ambiguas);
})();

// ─── 8. Varias colunas: a primeira que resolver vale ──────────────────────────

(function variasColunas() {
    const linhas = [{ Nome: 'Ana', CPF: '11122233344' }];
    const r = lib.casarFotos([arq('11122233344.jpg')], linhas, ['Foto', 'Nome', 'CPF']);
    ok(r.casadas.length === 1, 'casa pela coluna que resolver', r);
})();

// ─── 9. Linha desmarcada nao entra no lote ────────────────────────────────────

(function linhaDesmarcada() {
    const linhas = [{ Nome: 'Ana' }, { Nome: 'Bruno', __ativo: false }];
    const r = lib.casarFotos([arq('ana.jpg')], linhas, ['Nome']);
    ok(r.semFoto.length === 0, 'linha que nao imprime nao e cobrada de foto', r);
})();

// ─── 10. A geometria e a mesma do engine.py ───────────────────────────────────

(function geometria() {
    // Cobrir: uma foto 400x200 numa janela 25x32 tem de transbordar na largura
    // e encostar exatamente na altura.
    const g = lib.encaixeFoto(400, 200, 25, 32, 'cover', 0.5, 0.5, 1, 0);
    ok(Math.abs(g.h - 32) < 0.001, 'cobrir encosta na altura', g);
    ok(g.w > 32, 'cobrir transborda na largura', g);
    ok(g.y <= 0.001 && g.y >= -0.001, 'centrado na vertical', g);

    // Caber: a foto inteira dentro, sem corte.
    const c = lib.encaixeFoto(400, 200, 25, 32, 'contain', 0.5, 0.5, 1, 0);
    ok(Math.abs(c.w - 25) < 0.001, 'caber encosta na largura', c);
    ok(c.h < 32, 'caber deixa margem na altura', c);

    // O grude das bordas: cx no extremo nao pode abrir buraco na janela.
    const e = lib.encaixeFoto(400, 200, 25, 32, 'cover', 0.0, 0.5, 1, 0);
    ok(e.x <= 0.001, 'a borda esquerda nunca entra na janela', e);
    ok(e.x + e.w >= 25 - 0.001, 'a direita continua coberta', e);

    // Zoom aproxima proporcionalmente.
    const z = lib.encaixeFoto(400, 400, 25, 25, 'cover', 0.5, 0.5, 2, 0);
    ok(Math.abs(z.w - 50) < 0.001, 'zoom 2 dobra o desenho', z);

    // Rotacao de 90 troca os eixos antes de encaixar.
    const r90 = lib.encaixeFoto(400, 200, 25, 32, 'cover', 0.5, 0.5, 1, 90);
    ok(Math.abs(r90.w - 25) < 0.001, 'girada, a foto deitada encosta na largura', r90);
})();

// ─── 11. fotoDaLinha: __fotos manda, o valor cru serve de reserva ─────────────

(function origemDaFoto() {
    const el = { csv_column: 'Foto' };
    const comMeta = lib.fotoDaLinha(el, { Foto: 'ana.jpg', __fotos: { Foto: { url: 'https://x/ana.jpg', cx: 0.3 } } });
    ok(comMeta.url === 'https://x/ana.jpg', '__fotos manda', comMeta);
    ok(comMeta.cx === 0.3 && comMeta.zoom === 1, 'o padrao completa o que falta', comMeta);

    const cru = lib.fotoDaLinha(el, { Foto: 'C:/fotos/ana.jpg' });
    ok(cru.url === 'C:/fotos/ana.jpg', 'o valor cru da coluna serve', cru);

    ok(lib.fotoDaLinha(el, { Foto: '' }) === null, 'linha vazia devolve null');
    ok(lib.fotoDaLinha(el, { Foto: '', __fotos: { Foto: { url: '' } } }) === null, '__fotos vazio nao vale');
})();

// ─── 12. dpi na janela ────────────────────────────────────────────────────────

(function dpi() {
    // 300 px numa janela de 25,4 mm (uma polegada) = 300 dpi.
    const d = lib.dpiNaJanela(300, 300, 25.4, 25.4, 'cover', 1);
    ok(Math.abs(d - 300) <= 1, 'uma polegada com 300 px da 300 dpi', d);
    const d2 = lib.dpiNaJanela(300, 300, 25.4, 25.4, 'cover', 2);
    ok(Math.abs(d2 - 150) <= 1, 'zoom 2 corta a resolucao pela metade', d2);
})();

console.log((total - falhas) + '/' + total + ' casos passaram');
process.exit(falhas ? 1 : 0);
