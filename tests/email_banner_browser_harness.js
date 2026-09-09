// Exercita o botão real do pedido sem rede, dados reais ou envio de e-mail.
const fs = require('fs');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extrair(nome, async = false) {
    const inicio = source.indexOf('function ' + nome + '(');
    return (async ? 'async ' : '') + source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless:true});
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', req => req.abort());
        const botao = fs.readFileSync('frontend/index.html','utf8').match(/<button[^>]*id="btn-enviar-link-os-banner"[^>]*>[\s\S]*?<\/button>/)[0];
        await page.setContent('<!doctype html><body>' + botao + '</body>');
        const transporte = source.slice(source.indexOf('let emailOperacaoEmAndamento'), source.indexOf('window.abrirModalConfigEmail = abrirModalConfigEmail;', source.indexOf('let emailOperacaoEmAndamento')));
        await page.addScriptTag({content: `
            const state = {activeOSId:'vibe_11',ordens:[{id:'vibe_11',numero:11,cliente:'Cliente Exemplo'}]};
            const localStorage = {getItem:()=>null,removeItem:()=>{}};
            const linksClienteEmAndamento = new Set();
            const CLIENTE_BASE_URL = 'https://portal.example';
            const API_PAINEL = 'https://synthetic.example';
            window.opcoes = {email:'cliente@example.com',link:true,preparo:true,http:true,automatico:false};
            window.envios = []; window.avisos = []; window.preparos = 0;
            function toast(msg) { window.avisos.push(msg); }
            const supabaseClient = {
                auth:{getSession:async()=>({data:{session:{access_token:'sintetico'}}})},
                from:tabela=>({select:()=>({eq:()=>({limit:async limite=>{
                    if (limite !== 2) throw new Error('Consulta direta deve recusar ambiguidades');
                    if (opcoes.erroCadastro) return {error:{message:'falha sintetica'}};
                    return {data:tabela==='propostas' ? [{id_faturado:22,vendedor:'Atendente Exemplo'}] : [{email_financeiro:opcoes.email}]};
                }})})})
            };
            async function buscarLinkClienteAtivo(id) {
                return opcoes.link ? {os_id:id,numero_pedido:11,token:'abc123',ativo:true} : null;
            }
            async function prepararLinkDaArtePronta() {
                window.preparos++;
                return {ok:opcoes.preparo,link:opcoes.preparo ? 'https://portal.example/cliente/11-abc123' : null};
            }
            function gravarStatusOverride() {}
            window.fetch = async (_url,op) => {
                window.envios.push(JSON.parse(op.body));
                const resposta = {ok:opcoes.http,json:async()=>opcoes.http ? {ok:true} : {ok:false,error:'Envio recusado'}};
                if (opcoes.automatico) return resposta;
                return new Promise(resolve=>{window.resolverEnvio=()=>resolve(resposta);});
            };
            ${transporte}
            ${extrair('memorizarLinkCliente')}
            ${extrair('buscarDadosEmailCliente',true)}
            ${extrair('montarMensagemEmailCliente')}
            ${extrair('mostrarSucessoEnvioEmail')}
            ${extrair('gerarLinkClienteBanner',true)}
        `});
        await page.click('#btn-enviar-link-os-banner');
        await page.waitForFunction(() => window.envios.length === 1);
        assert.equal(await page.$eval('#btn-enviar-link-os-banner', e=>e.disabled), true);
        assert.equal(await page.$('#modal-envio-email-cliente'), null);
        assert.equal(await page.$('#modal-email-sucesso'), null);
        await page.evaluate(() => gerarLinkClienteBanner());
        assert.equal(await page.evaluate(() => envios.length), 1);
        const dados = await page.evaluate(() => envios[0]);
        assert.equal(dados.to,'cliente@example.com');
        assert.equal(dados.os_id,'vibe_11');
        assert.equal(dados.link_url,'https://portal.example/cliente/11-abc123');
        assert.match(dados.subject,/Pedido #11/);
        assert.match(dados.body_text,/Atendimento: Atendente Exemplo/);
        assert.equal(await page.evaluate(() => preparos),0,'Link existente não regenera arte');
        await page.evaluate(() => resolverEnvio());
        await page.waitForSelector('#modal-email-sucesso[open]');
        assert.equal(await page.$eval('#modal-email-sucesso-destinatario', e=>e.textContent),'cliente@example.com');
        await page.click('#modal-email-sucesso button');
        await page.waitForFunction(() => !document.getElementById('modal-email-sucesso'));
        assert.equal(await page.evaluate(() => document.activeElement.id),'btn-enviar-link-os-banner');
        await page.evaluate(() => gerarLinkClienteBanner());
        assert.equal(await page.evaluate(() => envios.length),1,'Novo clique após aceite não duplica mensagem');
        for (const email of ['', 'email-invalido']) {
            await page.evaluate(async email => { opcoes.email=email; await gerarLinkClienteBanner(); },email);
            assert.equal(await page.evaluate(() => envios.length),1);
            assert.match(await page.evaluate(() => avisos.at(-1)),/e-mail válido cadastrado/);
        }
        await page.evaluate(async () => { opcoes.email='novo@example.com';opcoes.erroCadastro=true;await gerarLinkClienteBanner(); });
        assert.match(await page.evaluate(() => avisos.at(-1)),/confirmar o cadastro/);
        await page.evaluate(async () => { opcoes.erroCadastro=false;opcoes.link=false;opcoes.preparo=false;await gerarLinkClienteBanner(); });
        assert.equal(await page.evaluate(() => envios.length),1);
        assert.match(await page.evaluate(() => avisos.at(-1)),/não foi enviado/);
        await page.evaluate(async () => { opcoes.preparo=true;opcoes.automatico=true;opcoes.http=false;await gerarLinkClienteBanner(); });
        assert.equal(await page.evaluate(() => envios.length),2);
        assert.equal(await page.$('#modal-email-sucesso'),null);
        assert.match(await page.evaluate(() => avisos.at(-1)),/Envio recusado/);
        assert.equal(await page.$eval('#btn-enviar-link-os-banner', e=>e.disabled),false);
        await page.evaluate(async () => { opcoes.http=true;await gerarLinkClienteBanner(); });
        await page.waitForSelector('#modal-email-sucesso[open]');
        assert.equal(await page.$eval('#modal-email-sucesso-destinatario', e=>e.textContent),'novo@example.com');
        assert.equal(await page.$('#modal-envio-email-cliente'),null,'Editor não é criado nem no sucesso nem na falha');
        assert.deepEqual(erros,[]);
        console.log('OK: banner envia sem editor; sucesso após aceite, duplicidade, cadastro inválido, preparo e falha');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
