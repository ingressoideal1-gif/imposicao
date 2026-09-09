const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync('frontend/script.js', 'utf8');
const trecho = source.slice(source.indexOf('let emailOperacaoEmAndamento'), source.indexOf('window.abrirModalConfigEmail = abrirModalConfigEmail;', source.indexOf('let emailOperacaoEmAndamento')));
const campos = {};
const avisos = [];
const removidos = [];
const chamadas = [];
const sucessos = [];
const base = 'https://supabase.example/functions/v1/painel';
let token = 'jwt-sintetico';
let httpOk = true;
let resposta = {ok: true, message: 'Aceito', config: {email_remetente:'arte@example.com', configurado:true}};
const ctx = vm.createContext({
    window: {location: {origin: 'https://painel.example.com'}, _activeEmailModalData: {osId:'vibe_11', linkUrl:'https://painel.example.com/cliente/11-abc123'}},
    API_PAINEL: base,
    supabaseClient: {auth: {getSession: async () => ({data:{session: token ? {access_token:token} : null}})}},
    localStorage: {removeItem: k => removidos.push(k), setItem: () => assert.fail('Não gravar senha')},
    document: {
        getElementById: id => campos[id] ||= {value:'', style:{}, checkValidity: () => true},
        querySelectorAll: () => [],
    },
    _baseDoAgenteAgora: () => assert.fail('E-mail não pode procurar o NewProd'),
    fetch: async (url, opcoes) => {chamadas.push({url, opcoes}); return {ok:httpOk, json: async () => resposta};},
    toast: (msg, tipo) => avisos.push({msg, tipo}),
    mostrarSucessoEnvioEmail: to => sucessos.push(to),
});
vm.runInContext(trecho, ctx);
(async () => {
    assert.deepEqual(removidos, ['ideal_email_remetente_config']);
    await ctx.carregarConfigEmailRemetente();
    assert.equal(campos['config-email-remetente'].textContent, 'arte@example.com');
    assert.equal(campos['btn-testar-email-nuvem'].disabled, false);
    assert.equal(chamadas[0].url, base + '/api/email/config');
    assert.equal(chamadas[0].opcoes.headers.Authorization, 'Bearer jwt-sintetico');
    assert.equal(ctx.salvarConfigEmailRemetente, undefined);
    await ctx.testarEnvioEmailConfig();
    assert.equal(chamadas.at(-1).url, base + '/api/email/testar');
    assert.deepEqual(JSON.parse(chamadas.at(-1).opcoes.body), {});
    campos['modal-email-to'] = {value: 'cliente@example.com', checkValidity: () => true};
    campos['modal-email-subject'] = {value: 'Arte'};
    campos['modal-email-body'] = {value: 'Link de aprovação'};
    const antes = chamadas.length;
    await Promise.all([ctx.dispararEmailDiretoCliente(), ctx.dispararEmailDiretoCliente()]);
    assert.equal(chamadas.length, antes + 1, 'Clique repetido não duplica envio');
    assert.equal(JSON.parse(chamadas.at(-1).opcoes.body).to, 'cliente@example.com');
    assert.deepEqual(sucessos, ['cliente@example.com']);
    assert.equal(JSON.parse(chamadas.at(-1).opcoes.body).os_id, 'vibe_11');
    assert.equal(JSON.parse(chamadas.at(-1).opcoes.body).link_url, ctx.window._activeEmailModalData.linkUrl);
    await ctx.dispararEmailDiretoCliente();
    assert.equal(chamadas.length, antes + 1, 'Mensagem já aceita não é reenviada por novo clique');
    campos['modal-email-subject'].value = 'Outra arte';
    resposta = {ok:false, error:'Login recusado'};
    await ctx.dispararEmailDiretoCliente();
    assert.deepEqual(avisos.at(-1), {msg:'Login recusado', tipo:'error'});
    token = null;
    const semAgente = chamadas.length;
    await ctx.dispararEmailDiretoCliente();
    assert.equal(chamadas.length, semAgente);
    assert.match(avisos.at(-1).msg, /Entre na sua conta/);
    assert.doesNotMatch(avisos.at(-1).msg, /NewProd/);
    ctx.fetch = async () => {throw new Error('rede');};
    token = 'jwt-sintetico';
    await ctx.dispararEmailDiretoCliente();
    assert.match(avisos.at(-1).msg, /antes de tentar novamente/);
    ctx.fetch = async () => ({ok:false, json: async () => {throw new Error('HTML');}});
    await ctx.dispararEmailDiretoCliente();
    assert.match(avisos.at(-1).msg, /confira o recebimento antes de repetir/);
    const semPedido = chamadas.length;
    ctx.window._activeEmailModalData = null;
    await ctx.dispararEmailDiretoCliente();
    assert.equal(chamadas.length, semPedido);
    assert.match(avisos.at(-1).msg, /Aguarde os dados/);
    ctx.fetch = async () => ({ok:true, json: async () => ({ok:true, config:{configurado:false}})});
    await ctx.carregarConfigEmailRemetente();
    assert.equal(campos['btn-testar-email-nuvem'].disabled, true);
    await ctx.testarEnvioEmailConfig();
    assert.match(avisos.at(-1).msg, /configuração/);
    assert.equal(campos['btn-testar-email-nuvem'].disabled, true);
    assert.doesNotMatch(trecho, /_baseDoAgenteAgora|smtp_config|localStorage\.setItem/);
    assert.deepEqual(sucessos, ['cliente@example.com'], 'Erro, timeout e repeticao nao abrem popup de sucesso');
    console.log('OK: e-mail na nuvem, sessão, teste, falhas, pedido e duplicidade sem NewProd');
})().catch(e => {console.error(e); process.exitCode = 1;});
