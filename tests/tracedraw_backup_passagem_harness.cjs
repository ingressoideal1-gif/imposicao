const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'tracedraw-runtime.js'), 'utf8');

async function testarIndicador(manifesto, respostaBackup, pendente) {
    const chamadas = [];
    let adaptador;
    const window = { ImpositionTraceDraw: { configure: valor => { adaptador = valor; } } };
    const supabaseClient = { async rpc(nome, args) {
        assert.equal(args.p_pedido, 123);
        assert.equal(args.p_modelo, 7);
        chamadas.push(nome);
        return nome === 'imposition_tracedraw_estado' ? { data: { manifesto } } : respostaBackup;
    } };

    vm.runInNewContext(fonte, { window, supabaseClient });
    const estado = await adaptador.status({ order: '123', model: '7' });
    assert.equal(estado.backup_pending, pendente);
    const esperado = ['imposition_tracedraw_estado'];
    if (manifesto.backup_job_id) esperado.push('imposition_tracedraw_backup_estado');
    assert.deepEqual(chamadas, esperado);
}

(async () => {
    const manifesto = { backup_job_id: 'job-sintetico' };
    await testarIndicador(manifesto, { data: { pending: true } }, true);
    await testarIndicador(manifesto, { data: { pending: false } }, false);
    await testarIndicador(manifesto, { error: true }, true);
    await testarIndicador({}, null, false);
    console.log('TraceDraw: indicador consulta o backup sem esperar confirmação');
})().catch(erro => { console.error(erro); process.exitCode = 1; });
