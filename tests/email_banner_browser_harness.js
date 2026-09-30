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
            const state = {amostrasOSAtivo:'vibe_11',ordens:[{id:'vibe_11',numero:11,cliente:'Cliente Exemplo',status:'Enviar Arte'}],
                todasArtes:[{id:'arte-11',id_int:11,status:'Enviar Arte'}],osItens:{vibe_11:[{amostra_status:'PRONTO'}]}};
            const localStorage = {getItem:()=> 'vibe_99',removeItem:()=>{}};
            const linksClienteEmAndamento = new Set();
            const CLIENTE_BASE_URL = 'https://portal.example';
            const API_PAINEL = 'https://synthetic.example';
            window.opcoes = {email:'cliente@example.com',link:true,preparo:true,http:true,automatico:false};
            window.envios = []; window.avisos = []; window.preparos = 0; window.retornos = [];
            let statusLink = 'Enviar Arte';
            window.gravacoes = []; window.fechamentos = 0;
            async function garantirLinhaDePedidoArte(numero) {
                window.retornos.push({osId:'vibe_11', numero});
                return true;
            }
            function clearAmostrasOS() { window.fechamentos++; state.amostrasOSAtivo = null; }
            function pedidoCancelado() { return false; }
            function pedidoSaiuDaArte() { return false; }
            function modeloEmCorrecaoDeArte() { return false; }
            function toast(msg) { window.avisos.push(msg); }
            const supabaseClient = {
                auth:{getSession:async()=>({data:{session:{access_token:'sintetico'}}})},
                from:tabela=>{
                    if (!['pedidos_links_cliente','pedidos_artes'].includes(tabela)) throw new Error('Tabela inesperada');
                    let payload;
                    const filtros = {};
                    return {
                        update(dados) { payload = dados; return this; },
                        eq(campo, valor) { filtros[campo] = valor; return this; },
                        select() {
                            window.gravacoes.push({tabela,payload,filtros});
                            if (opcoes.erroStatus) return {data:[],error:null};
                            if (tabela === 'pedidos_links_cliente') {
                                if (filtros.os_id !== 'vibe_11' || filtros.ativo !== true) throw new Error('Link sem filtro');
                                statusLink = payload.status_arte;
                                return {data:[{id:'link-11',os_id:'vibe_11',status_arte:statusLink}]};
                            }
                            if (filtros.id_int !== 11) throw new Error('Arte sem filtro');
                            return {data:[{id:'arte-11',status:payload.status}]};
                        }
                    };
                }
            };
            async function requisitarPropostas(acao, corpo) {
                if (acao !== 'cadastro' || corpo.pedido !== 11 || corpo.escopo !== 'contato' || corpo.exigir_cadastro !== true)
                    throw new Error('Envio direto deve exigir cadastro inequivoco');
                if (opcoes.erroCadastro) throw new Error('falha sintetica');
                return {vendedor:'Atendente Exemplo',cliente:{email_financeiro:opcoes.email}};
            }
            async function buscarLinkClienteAtivo(id) {
                return opcoes.link ? {os_id:id,numero_pedido:11,token:'abc123',ativo:true,
                    status_arte:statusLink,arte_pronta_em:'2026-09-01'} : null;
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
            ${extrair('linkPrecisaPrepararArte')}
            ${extrair('nomePreferencialDoCliente')}
            ${extrair('buscarDadosEmailCliente',true)}
            ${extrair('montarMensagemEmailCliente')}
            ${extrair('mostrarSucessoEnvioEmail')}
            ${extrair('atualizarPedidoArteConfirmado',true)}
            ${extrair('concluirEnvioLinkParaAtendimento',true)}
            ${['ARTE_APROVADOS','ARTE_REPROVADOS','ARTE_EM_APROVACAO','ARTE_COM_O_DESIGNER'].map(nome => source.match(new RegExp('const ' + nome + ' =[^;]+;'))[0]).join('\n')}
            ${extrair('classificarPedidoNaArte')}
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
        assert.equal(await page.evaluate(() => retornos.length),0,'Aguarda confirmação do operador');
        await page.evaluate(() => { opcoes.erroStatus = true; });
        await page.click('#modal-email-sucesso button');
        await page.waitForFunction(() => retornos.length === 1);
        assert.equal(await page.evaluate(() => state.amostrasOSAtivo),'vibe_11','Falha mantém pedido aberto');
        assert.match(await page.$eval('#modal-email-sucesso', e=>e.textContent),/e-mail já foi enviado/);
        await page.evaluate(() => { opcoes.erroStatus = false; });
        await page.click('#modal-email-sucesso button');
        await page.waitForFunction(() => !document.getElementById('modal-email-sucesso'));
        assert.equal(await page.evaluate(() => state.amostrasOSAtivo),null,'Confirmação devolve ao Atendimento');
        assert.deepEqual(await page.evaluate(() => retornos),[{osId:'vibe_11',numero:11},{osId:'vibe_11',numero:11}]);
        assert.equal(await page.evaluate(() => envios.length),1,'Repetir o retorno não reenvia e-mail');
        assert.deepEqual(await page.evaluate(() => classificarPedidoNaArte(state.ordens[0])),
            {statusCalculado:'Em Aprovação',fila:'aprovacao'},'Classificação real muda imediatamente de card/status');
        assert.equal(await page.evaluate(() => state.linksClienteData.vibe_11.cliente_abriu_em),undefined,'Envio não inventa acesso do cliente');
        await page.evaluate(() => { state.amostrasOSAtivo = 'vibe_11'; });
        await page.evaluate(() => gerarLinkClienteBanner());
        assert.equal(await page.evaluate(() => envios.length),1,'Novo clique após aceite não duplica mensagem');
        await page.evaluate(async () => {
            state.amostrasOSAtivo = null;
            state.activeOSId = 'vibe_99';
            await gerarLinkClienteBanner();
        });
        assert.equal(await page.evaluate(() => envios.length),1,'Pedido fechado não envia para seleção antiga');
        assert.match(await page.evaluate(() => avisos.at(-1)),/Nenhum pedido ativo/);
        await page.evaluate(() => { state.amostrasOSAtivo = 'vibe_11'; });
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
        assert.equal(await page.evaluate(() => envios.at(-1).os_id),'vibe_11','Pedido aberto prevalece sobre seleção antiga');
        assert.equal(await page.$('#modal-envio-email-cliente'),null,'Editor não é criado nem no sucesso nem na falha');
        await page.evaluate(() => { opcoes.link=true; state.amostrasOSAtivo='vibe_99'; });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('modal-email-sucesso'));
        assert.equal(await page.evaluate(() => state.amostrasOSAtivo),'vibe_99','Retorno do envio não fecha outro pedido');
        assert.equal(await page.evaluate(() => fechamentos),1);
        assert.equal(await page.evaluate(() => envios.length),3,'Escape conclui sem reenviar');
        assert.deepEqual(erros,[]);
        console.log('OK: banner envia sem editor; sucesso após aceite, duplicidade, cadastro inválido, preparo e falha');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
