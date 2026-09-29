const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const ctx = { console }; ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['csv-editor.js', 'banco-do-modelo.js', 'pedido-colunas.js']) vm.runInContext(fs.readFileSync(path.join(root, 'frontend', f), 'utf8'), ctx);
const pc = ctx.PedidoColunas;
const clone = x => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepEqual(clone(a), clone(b));
let checks = 0;
async function test(nome, fn) { await fn(); checks++; console.log('OK ' + nome); }
const original = () => ({ id: 'b1', id_int: 123, nome: 'Importado', csv_filename: 'dados.csv', csv_url: '',
    csv_headers: ['Nome', 'Código', 'Foto'], csv_data: [
        { __id: 8, Nome: 'Ana', Código: '0001', Foto: 'ana.jpg', __fotos: { Foto: { url: 'foto-sintetica', zoom: 1 } } },
        { __id: 12, __ativo: false, Nome: 'Bruno', Código: '0002', Foto: '' }
    ] });
function servidor(banco = original()) {
    const s = { bancos: banco ? [clone(banco)] : [], vinculos: banco ? [
        { modelo_id: 'm1', banco_id: banco.id, csv_mapa: { 'el:n': 'Nome' } },
        { modelo_id: 'm2', banco_id: banco.id, csv_mapa: null }
    ] : [], calls: [], fail: null };
    s.api = async (acao, corpo) => {
        assert.equal(corpo.id_int, 123, 'pedido capturado preservado');
        s.calls.push({ acao, corpo: clone(corpo) });
        if (s.fail) await s.fail(acao, corpo, 'antes');
        let result;
        if (acao === 'consultar') result = { bancos: s.bancos, vinculos: s.vinculos };
        else if (acao === 'criar') { const b = { ...corpo, id: 'b' + (s.bancos.length + 1) }; s.bancos.push(b); result = { banco: b }; }
        else if (acao === 'atualizar') {
            const b = s.bancos.find(b => b.id === corpo.banco_id);
            const { banco_id, ...dados } = corpo; Object.assign(b, clone(dados)); result = { banco: b };
        } else if (acao === 'vincular') {
            const v = s.vinculos.find(v => v.modelo_id === corpo.modelo_id); Object.assign(v, clone(corpo)); result = { vinculo: v };
        } else throw Error('Ação inesperada: ' + acao);
        if (s.fail) await s.fail(acao, corpo, 'depois');
        return clone(result);
    };
    return s;
}
(async () => {
    await test('as duas entradas da Lista de Arte carregam o editor e suas dependências', () => {
        for (const pagina of ['index.html', 'producao.html']) {
            const html = fs.readFileSync(path.join(root, 'frontend', pagina), 'utf8');
            const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g), m => m[1].split('?')[0].replace(/^\//, ''));
            for (const dep of ['banco-do-modelo.js', 'csv-editor.js', 'pedido-colunas.js']) {
                assert.ok(scripts.includes(dep), pagina + ' deve carregar ' + dep);
                assert.ok(scripts.indexOf(dep) < scripts.indexOf('script.js'), dep + ' deve preceder script.js');
            }
            assert.ok(html.includes('pedido-colunas.css?v='), pagina + ' deve carregar o estilo');
        }
    });
    await test('colagem é conteúdo: zeros, duplicados, vazios, vírgulas e multiline', () => {
        eq(pc.lerColagem('001\t001\r\n\tB\r\n"Linha 1\nLinha 2"\t"Nome, sobrenome"\r\n'), [['001','001'],['','B'],['Linha 1\nLinha 2','Nome, sobrenome']]);
        eq(pc.lerColagem('Ana; Silva\n\nCarla\n'), [['Ana; Silva'], [''], ['Carla']]);
        assert.throws(() => pc.lerColagem('"aberto\n'), /aspas/);
    });
    await test('colar amplia o CSV sem alterar identidade, inativos, fotos e coluna vizinha', () => {
        const b = original(), antes = clone(b), d = pc.rascunho(b);
        const c = pc.novaColuna(d); pc.renomear(d, c, 'Setor');
        pc.colar(d, 0, c, 'VIP\n\nPista');
        eq(d.rows.map(r => r.Setor), ['VIP', '', 'Pista']);
        eq(d.rows.map(r => r.__id), [8, 12, 13]);
        eq(d.rows.slice(0, 2).map(r => r.Código), ['0001', '0002']);
        assert.equal(d.rows[1].__ativo, false);
        eq(d.rows[0].__fotos, b.csv_data[0].__fotos); eq(b, antes);
        pc.escrever(d, 0, 0, '');
        assert.equal(d.rows.length, 3); assert.equal(d.rows[1].Nome, 'Bruno'); assert.equal(d.rows[0].Código, '0001');
    });
    await test('uma célula não se repete, tabulação cria colunas e primeira linha não vira nome', () => {
        const d = pc.rascunho(null); pc.novaColuna(d); pc.colar(d, 0, 0, 'Ana\tVIP\nBruno\t\nCarla');
        eq(d.headers, ['Coluna 1', 'Coluna 2']); eq(d.rows.map(r => r['Coluna 2']), ['VIP', '', '']);
        assert.equal(d.rows[0]['Coluna 1'], 'Ana');
    });
    await test('renomeações encadeadas preservam fotos; limpar remove foto antiga somente da célula', () => {
        const d = pc.rascunho(original()); pc.renomear(d, 2, 'Imagem'); pc.renomear(d, 2, 'Retrato');
        eq(pc.carga(d).renomeacoes, [{ de: 'Foto', para: 'Retrato' }]);
        assert.equal(d.rows[0].__fotos.Retrato.url, 'foto-sintetica');
        pc.escrever(d, 0, 2, ''); assert.equal(d.rows[0].__fotos.Retrato, undefined);
        d.rows[0].__fotos.Retrato = { url: 'foto-sem-texto' };
        pc.escrever(d, 0, 2, ''); assert.equal(d.rows[0].__fotos.Retrato, undefined);
        assert.throws(() => pc.renomear(d, 2, 'Nome'), /outra coluna/);
        assert.throws(() => pc.renomear(d, 2, '__proto__'), /válido/);
    });
    await test('banco novo é persistido e relido; modelos não são vinculados automaticamente', async () => {
        const s = servidor(null), d = pc.rascunho(null); pc.novaColuna(d); pc.colar(d, 0, 0, '0001\n0002');
        const salvo = await pc.sessaoSalvar(s.api, 123, null, [])(pc.carga(d));
        eq(salvo.csv_data.map(r => r['Coluna 1']), ['0001','0002']);
        eq(s.calls.map(c => c.acao), ['consultar','criar','consultar']); eq(s.vinculos, []);
    });
    await test('adicionar coluna reutiliza o banco importado e preserva os mapas', async () => {
        const b = original(), s = servidor(b), d = pc.rascunho(b), mapas = clone(s.vinculos);
        pc.colar(d, 0, pc.novaColuna(d), 'A\nB');
        const salvo = await pc.sessaoSalvar(s.api, 123, b, [b])(pc.carga(d));
        assert.equal(salvo.id, b.id); eq(s.vinculos, mapas);
        eq(s.calls.map(c => c.acao), ['consultar','atualizar','consultar']);
    });
    await test('falha no segundo vínculo mantém nomes antigos e novos utilizáveis; repetição conclui', async () => {
        const b = original(), s = servidor(b), d = pc.rascunho(b);
        pc.renomear(d, 0, 'Pessoa'); const dados = pc.carga(d), salvar = pc.sessaoSalvar(s.api, 123, b, [b]);
        s.fail = (a, c, etapa) => { if (a === 'vincular' && c.modelo_id === 'm2' && etapa === 'antes') throw Error('Rede simulada'); };
        await assert.rejects(salvar(dados), /Rede simulada/);
        assert.equal(s.bancos[0].csv_data[0].Nome, 'Ana'); assert.equal(s.bancos[0].csv_data[0].Pessoa, 'Ana');
        for (const v of s.vinculos) {
            const num = ctx.BancoDoModelo.numeracaoResolvida({ elements: [{ id:'n', source:'database', csv_column:'Nome' }] }, s.bancos[0], v.csv_mapa);
            assert.equal(num.csv_data[0][num.elements[0].csv_column], 'Ana');
        }
        s.fail = null; const salvo = await salvar(dados);
        eq(salvo.csv_headers, ['Pessoa','Código','Foto']); assert.equal(salvo.csv_data[0].Nome, undefined);
        assert.equal(s.vinculos[0].csv_mapa['el:n'], 'Pessoa'); assert.equal(s.vinculos[1].csv_mapa.Nome, 'Pessoa');
        // Reabrir resolve o novo nome, inclusive em numeração legada sem mapa explícito.
        const reaberto = pc.rascunho(salvo); assert.equal(reaberto.rows[0].Pessoa, 'Ana');
    });
    await test('resposta perdida após atualizar é recuperada sem renomear novamente', async () => {
        const b = original(), s = servidor(b), d = pc.rascunho(b); pc.renomear(d, 0, 'Pessoa');
        const salvar = pc.sessaoSalvar(s.api, 123, b, [b]);
        let falhou = false;
        s.fail = (a, c, etapa) => { if (a === 'atualizar' && etapa === 'depois' && !falhou) { falhou = true; throw Error('Resposta perdida'); } };
        await assert.rejects(salvar(pc.carga(d)), /Resposta perdida/);
        const salvo = await salvar(pc.carga(d)); eq(salvo.csv_headers, ['Pessoa','Código','Foto']);
    });
    await test('resposta perdida ao criar não duplica banco na tentativa seguinte', async () => {
        const s = servidor(null), d = pc.rascunho(null); pc.novaColuna(d);
        const salvar = pc.sessaoSalvar(s.api, 123, null, []);
        s.fail = (a, c, etapa) => { if (a === 'criar' && etapa === 'depois') throw Error('Resposta perdida'); };
        await assert.rejects(salvar(pc.carga(d)), /Resposta perdida/);
        s.fail = null; await salvar(pc.carga(d)); assert.equal(s.bancos.length, 1);
        assert.equal(s.calls.filter(c => c.acao === 'criar').length, 1);
    });
    await test('alteração já concluída em outra tela bloqueia a escrita', async () => {
        const b = original(), s = servidor(b), d = pc.rascunho(b); pc.novaColuna(d);
        const salvar = pc.sessaoSalvar(s.api, 123, b, [b]); s.bancos[0].csv_data[0].Nome = 'Outra edição';
        await assert.rejects(salvar(pc.carga(d)), /outra tela/);
        eq(s.calls.map(c => c.acao), ['consultar']);
    });
    await test('10 mil linhas preservam strings sem renderizar todas simultaneamente', () => {
        const d = pc.rascunho(null); pc.novaColuna(d); pc.colar(d, 0, 0, Array.from({ length:10000 }, (_,i) => String(i).padStart(6,'0')).join('\n'));
        assert.equal(d.rows.length, 10000); assert.equal(d.rows[9999]['Coluna 1'], '009999');
        assert.equal(new Set(d.rows.map(r => r.__id)).size, 10000);
    });
    console.log(`${checks} cenários aprovados.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
