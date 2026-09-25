'use strict';
// Página local para validação humana autenticada. Não executa chamadas remotas ao gerar.
const fs = require('node:fs');
const path = require('node:path');
require('./preparar_validacao_cores_local.js');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp-cores-margens');
const config = fs.readFileSync(path.join(root, 'frontend/supabase-config.js'), 'utf8');
const url = config.match(/const VIBECODE_SUPABASE_URL\s*=\s*"([^"]+)"/)[1];
const anon = config.match(/const VIBECODE_ANON_KEY\s*=\s*"([^"]+)"/)[1];
const reference = new URL(url).hostname;
const controlPath = path.join(output, 'registro-integrado.json');
const control = fs.existsSync(controlPath) ? JSON.parse(fs.readFileSync(controlPath, 'utf8'))
    : { id: require('node:crypto').randomUUID(), name: 'TESTE MARGENS 2026-09-25', project: reference };
if (control.project !== reference) throw Error('Projeto mudou; conferir o alvo antes de gerar.');
fs.writeFileSync(controlPath, JSON.stringify(control, null, 2));
fs.copyFileSync(path.join(root, 'frontend/supabase-js.min.js'), path.join(output, 'supabase-js.min.js'));
let html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
html = html.replace("script-src 'unsafe-inline'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'none'", `connect-src ${url}`);
html = html.replace('Dados fictícios. Salvar mantém os dados apenas nesta aba; atualizar a página apaga o teste. Sem acesso ao banco ou à impressora.',
    `Gravação real no e-deal (${reference}), tabela producao_cores. Somente o registro ${control.id}, chamado ${control.name}. Nenhum pedido ou Formato será alterado. O registro ficará no banco, identificado como teste; não haverá exclusão automática.`);
html = html.replace('Teste local das margens da Cor', 'Validação integrada das margens da Cor');
html = html.replace('<button id="reabrir"', `<form id="login-integrado"><label>E-mail <input id="email-integrado" type="email" autocomplete="username" required></label> <label>Senha <input id="senha-integrada" type="password" autocomplete="current-password" required></label> <button type="submit">Entrar no e-deal e carregar formatos</button></form><p>Após entrar, escolha o Formato, informe as margens e clique em Salvar. Use Reabrir para conferir e editar o mesmo registro. O login vale apenas nesta aba.</p><pre id="evidencia-integrada" style="white-space:pre-wrap"></pre><button id="reabrir"`);
const script = `
const alvoTeste = ${JSON.stringify(control)};
const apiCadastro = api;
let conectado = false;
let formatoAntes = null;
let formatoConferidoId = null;
supabaseClient = null;
document.getElementById('cor-name').value = alvoTeste.name;
document.getElementById('cor-name').readOnly = true;
document.getElementById('btn-cor-save').disabled = true;
api = async function(method, endpoint, body) {
    if (!conectado) throw Error('Entre no e-deal primeiro.');
    if (!['/cores', '/cores/' + alvoTeste.id].includes(endpoint)) throw Error('Operação fora do registro de teste.');
    if (method === 'POST' || method === 'PUT') {
        body = { ...body, name: alvoTeste.name };
        if (method === 'POST') body.id = alvoTeste.id;
        if (!['POST', 'PUT'].includes(method)) throw Error('Operação não permitida.');
        const before = await supabaseClient.from('producao_formatos').select('*').eq('id', body.formato_id).single();
        if (before.error || !before.data) throw Error('Não foi possível conferir o Formato base.');
        formatoAntes = JSON.stringify(before.data); formatoConferidoId = body.formato_id;
    } else if (method !== 'GET') throw Error('Operação não permitida.');
    return apiCadastro(method, endpoint, body);
};
loadAll = async function() {
    const { data, error } = await supabaseClient.from('producao_cores').select('*').eq('id', alvoTeste.id).maybeSingle();
    if (error) throw error;
    state.cores = data ? [data] : [];
    if (data) {
        let formatoPreservado = null;
        if (formatoAntes) {
            const after = await supabaseClient.from('producao_formatos').select('*').eq('id', formatoConferidoId).single();
            if (after.error) throw after.error;
            formatoPreservado = JSON.stringify(after.data) === formatoAntes;
            if (!formatoPreservado) throw Error('O Formato base mudou durante a conferência. Interrompa o teste.');
        }
        const medidas = Object.fromEntries(CorMargens.campos.map(c => [c, data[c]]));
        document.getElementById('evidencia-integrada').textContent = JSON.stringify({ projeto: alvoTeste.project, id: data.id, leitura: new Date().toISOString(), formato_id: data.formato_id, ...medidas, width_mm: data.width_mm, height_mm: data.height_mm, formato_preservado: formatoPreservado }, null, 2);
    }
    document.getElementById('cor-name').value = alvoTeste.name;
};
document.getElementById('login-integrado').onsubmit = async event => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try {
        supabaseClient = supabase.createClient(${JSON.stringify(url)}, ${JSON.stringify(anon)}, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
        const passwordInput = document.getElementById('senha-integrada');
        let password = passwordInput.value; passwordInput.value = '';
        const auth = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('email-integrado').value.trim(), password }); password = '';
        if (auth.error) throw auth.error;
        const schema = await supabaseClient.from('producao_cores').select('id,' + CorMargens.campos.join(',')).limit(0);
        if (schema.error) throw schema.error;
        const formats = await supabaseClient.from('producao_formatos').select('id,name,width_mm,height_mm').order('name');
        if (formats.error) throw formats.error;
        state.formatos = formats.data || []; state.cores = [];
        const select = document.getElementById('cor-formato'); select.replaceChildren(new Option('Selecione um Formato real', ''));
        for (const f of state.formatos) select.add(new Option(f.name + ' — ' + f.width_mm + ' × ' + f.height_mm + ' mm', f.id));
        conectado = true; await loadAll(); atualizarFormatoDaCor();
        event.target.hidden = true; toast('Conectado. Escolha o Formato e salve a Cor de teste.');
    } catch (e) { conectado = false; toast('Não foi possível iniciar: ' + e.message); } finally { button.disabled = false; }
};
document.getElementById('view-cores').addEventListener('click', event => {
    if (!conectado && event.target.closest('#btn-cor-save')) { event.preventDefault(); event.stopImmediatePropagation(); toast('Entre no e-deal primeiro.'); }
}, true);
`;
html = html.replace('</body>', '');
html += `<script src="supabase-js.min.js"></script><script>${script.replace(/<\/script/gi, '<\\/script')}</script>`;
fs.writeFileSync(path.join(output, 'integrado.html'), html);
console.log('Validação integrada: http://127.0.0.1:8766/integrado.html');
