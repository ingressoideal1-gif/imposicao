/**
 * Grava os quadros do vídeo do Ideal Control dirigindo as TELAS DE VERDADE.
 *
 * Nada aqui desenha uma imitação da interface. O que entra no vídeo é o
 * `controle.html` e o `portaria.html` rodando num Chrome, com o mesmo HTML, o
 * mesmo CSS e o mesmo JavaScript que a Vercel serve. O que é falso é só o
 * BACKEND: as chamadas às Edge Functions e ao login do Supabase são
 * interceptadas e respondidas com um evento fictício.
 *
 * O caminho gravado é o de hoje, e ele mudou em 17 e 18/08/2026: o QR do Pedido
 * saiu de cena (não há mais `evento.html`), o código de seis caracteres saiu
 * junto, e um aparelho de portaria nasce quando o dono toca na barra do evento
 * no próprio celular que vai ler. Como esse toque ENCERRA a sessão e manda o
 * navegador para a portaria, a gravação segue com ele: a mesma aba que
 * configurou o evento vira o portão, e as cenas de leitura vêm em seguida.
 *
 * Duas razões para ser assim, e as duas importam mais do que a economia de
 * trabalho:
 *
 *   1. **O vídeo não pode envelhecer sozinho.** Uma imitação continuaria linda
 *      no dia em que a tela mudasse, e ensinaria o cliente a procurar um botão
 *      que não existe mais. Regravar é rodar isto de novo.
 *   2. **O vídeo circula por WhatsApp.** Ele vai parar na mão de gente que não é
 *      cliente. Nenhum dado real aparece: o evento, os setores, os números e o
 *      código do aparelho são inventados aqui embaixo, e nenhum deles abre porta
 *      nenhuma.
 *
 * ## De onde vem o frontend
 *
 * De `--fonte <pasta>`, e o `gerar.ps1` passa um INSTANTÂNEO do último commit,
 * não a pasta `frontend/` viva. O motivo é concreto: este repositório costuma
 * ter mais de uma sessão de trabalho aberta ao mesmo tempo, e um arquivo salvo
 * no meio da gravação produziria um vídeo em que a tela muda de versão entre uma
 * cena e a seguinte — sem erro nenhum, e impossível de perceber a não ser
 * assistindo.
 *
 * ## O que ele deixa pronto
 *
 *   midia/_trabalho/quadros/<cena>/0000.jpg …   os quadros, a 8 por segundo
 *   midia/_trabalho/legendas/<cena>.png          a faixa de legenda, transparente
 *   midia/_trabalho/moldura.png                  a máscara arredondada do celular
 *   midia/_trabalho/barra.png                    o título fixo do topo
 *   midia/_trabalho/cenas.json                   quantos quadros cada cena tem
 *
 * Quem transforma isso em MP4 — narração, legenda queimada e montagem — é o
 * `montar.ps1`. A divisão existe porque só o PowerShell alcança a voz do
 * Windows, e só o ffmpeg monta vídeo.
 *
 * Uso:
 *   node ferramentas/video/gravar.js --fonte <pasta> --saida <pasta>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));
const ROTEIRO = require('./roteiro.js');

// ── Argumentos ───────────────────────────────────────────────────────────────

function arg(nome, padrao) {
    const i = process.argv.indexOf('--' + nome);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const FONTE = path.resolve(arg('fonte', path.join(REPO, 'frontend')));
const SAIDA = path.resolve(arg('saida', path.join(REPO, 'midia', '_trabalho')));

// ── Medidas ──────────────────────────────────────────────────────────────────
//
// O celular é capturado em 400×700 com escala 2, ou seja 800×1400 pixels. O
// `montar.ps1` compõe isso numa tela vertical de 1080×1920 — o formato que o
// WhatsApp e o Instagram mostram sem cortar —, com o título em cima e a legenda
// embaixo. As três medidas precisam bater com as do `montar.ps1`.
const LARGURA = 400, ALTURA = 700, ESCALA = 2;
const FPS = 8;
const PORTA = 9321;   // nunca 9000: é a porta do NewProd.exe na estação

// ── O evento fictício ────────────────────────────────────────────────────────
//
// Inventado de ponta a ponta. O número do pedido não existe, o sal é aleatório
// desta execução, e os códigos que a portaria "lê" no vídeo são só três números
// escolhidos para produzir os três resultados que o porteiro precisa reconhecer:
// verde, laranja e vermelho.

const EVENTO_ID = 'evento-de-demonstracao';
const PEDIDO = 20991;
const SAL = crypto.randomBytes(32).toString('hex');
const NOME_APARELHO = 'Portão A';
const EMAIL = 'contato@festaideal.com.br';

const SETORES = [
    { id: 's1', nome: 'PISTA', quantidade: 3000, numero_de: 1, numero_ate: 3000 },
    { id: 's2', nome: 'VIP', quantidade: 800, numero_de: 3001, numero_ate: 3800 },
    { id: 's3', nome: 'CAMAROTE', quantidade: 200, numero_de: 3801, numero_ate: 4000 },
];

const BLOQUEIO = { id: 'b1', setor_id: 's1', de: 500, ate: 560,
                   motivo: 'lote não pago pelo ponto de venda do Centro' };

// Os três ingressos que o vídeo lê, e o que cada um demonstra.
const INGRESSOS = [
    { texto: '000123', setor: 's1', n: 123, id: 'cred-1' },   // verde
    { texto: '003105', setor: 's2', n: 3105, id: 'cred-2' },  // laranja: outra porta
    { texto: '000512', setor: 's1', n: 512, id: 'cred-3' },   // vermelho: faixa bloqueada
];

/** O painel que a tela do dono recebe. Muda durante a gravação: o aparelho
 *  criado na cena 15 precisa existir nas chamadas seguintes. */
const painel = {
    evento: {
        id: EVENTO_ID,
        nome_evento: 'Festa Ideal 2026',
        data_evento: '2026-09-12T23:00:00-03:00',
        local_evento: 'Clube Atlântico',
    },
    setores: SETORES.map(function (s) {
        return {
            id: s.id, nome: s.nome, quantidade: s.quantidade,
            tipo_uso: 'unico', abre_em: null, fecha_em: null,
            bloqueios: [], pedido_id_int: PEDIDO, modelo_id: 1000110 + Number(s.id[1]),
            numero_de: s.numero_de, numero_ate: s.numero_ate, codigos_cliente: 0,
        };
    }),
    aparelhos: [],
    pedidos: [{ pedido_id_int: PEDIDO, publicado_em: '2026-08-16T12:00:00Z',
                total_credenciais: 4000 }],
    codigos_cliente: 0,
};

/** O que "Meus Pedidos" lista: o pedido já impresso, pronto para virar evento. */
const MEUS_PEDIDOS = {
    pedidos: [{
        pedido: PEDIDO,
        data: '2026-08-14T12:00:00Z',
        nome_evento: 'Festa Ideal 2026',
        setores: SETORES.map(function (s) {
            return { nome: s.nome, quantidade: s.quantidade, impresso: true };
        }),
    }],
};

/** A elevação: os quinze minutos em que a configuração fica liberada. */
function elevacao() {
    return { token: 'elevacao-de-demonstracao',
             expira_em: Math.floor(Date.now() / 1000) + 900 };
}

const SESSAO = {
    access_token: 'sessao-de-demonstracao',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'renovacao-de-demonstracao',
    user: {
        id: 'usuario-de-demonstracao', aud: 'authenticated', role: 'authenticated',
        email: 'contato@festaideal.com.br', email_confirmed_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {}, identities: [],
    },
};

/** A carga da portaria. As credenciais de verdade entram depois que o navegador
 *  calcula os hashes — ver `prepararCarga()`. */
let carga = null;

/** O evento só existe depois de o pedido ser carregado, na cena 05. Antes
 *  disso a casa precisa aparecer VAZIA. */
let eventoExiste = false;

// ── O servidor do frontend ───────────────────────────────────────────────────

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function subirServidor() {
    const servidor = http.createServer(function (req, res) {
        const caminho = decodeURIComponent(req.url.split('?')[0]);

        // A página em branco onde as legendas e a moldura são desenhadas. Vive
        // numa rota do servidor, e não em `about:blank`, para que a origem seja
        // a mesma do frontend — assim ela alcança a logomarca sem CORS.
        if (caminho === '/__estudio') {
            res.writeHead(200, TIPOS['.html']
                ? { 'Content-Type': TIPOS['.html'] } : {});
            res.end('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
                + '</head><body style="margin:0"></body></html>');
            return;
        }

        const arquivo = path.join(FONTE, caminho === '/' ? 'index.html' : caminho);
        if (!arquivo.startsWith(FONTE) || !fs.existsSync(arquivo)
            || fs.statSync(arquivo).isDirectory()) {
            res.writeHead(404); res.end('nao achei'); return;
        }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
        res.end(fs.readFileSync(arquivo));
    });
    return new Promise(function (ok) {
        servidor.listen(PORTA, '127.0.0.1', function () { ok(servidor); });
    });
}

const BASE = 'http://127.0.0.1:' + PORTA;

// ── O backend falso ──────────────────────────────────────────────────────────

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
};

function json(req, corpo, atrasoMs) {
    const responder = function () {
        req.respond({ status: 200, contentType: 'application/json',
                      headers: CORS, body: JSON.stringify(corpo) });
    };
    if (atrasoMs) { setTimeout(responder, atrasoMs); } else { responder(); }
}

/** Quanto tempo cada página da carga demora a responder. A cena "Baixando o
 *  evento" precisa DURAR para caber no vídeo; num backend de verdade ela dura
 *  por causa da rede. */
let atrasoDaFaixa = 0;

function rotear(req) {
    const url = req.url();
    const metodo = req.method();

    if (url.startsWith(BASE)) { return req.continue(); }

    if (url.includes('supabase.co') && metodo === 'OPTIONS') {
        return req.respond({ status: 204, headers: CORS });
    }

    // O login. É o SDK do Supabase de verdade que faz esta chamada, e é ele que
    // guarda a sessão devolvida — por isso o `controle.html` já abre logado
    // depois que o `evento.html` entrou.
    if (url.includes('/auth/v1/token')) { return json(req, SESSAO); }
    if (url.includes('/auth/v1/user')) { return json(req, SESSAO.user); }
    if (url.includes('/auth/v1/logout')) { return json(req, {}); }
    if (url.includes('/auth/v1/recover')) { return json(req, {}); }

    // Os quinze minutos comprados no login, que fazem o Carregar não pedir a
    // senha de novo.
    //
    // ANTES do `/minha-conta`, e não depois: o endereço desta chamada é
    // `.../acesso-conta/minha-conta/elevar`, e ele contém o outro por inteiro.
    // Na ordem trocada, o login recebia a resposta de "quem é a conta" no lugar
    // do bilhete, o Carregar voltava a pedir a senha e a cena morria com
    // "Digite a sua senha para carregar o pedido".
    if (url.includes('/minha-conta/elevar')) { return json(req, elevacao()); }

    // A conta: quem é, e se a senha ainda é provisória.
    if (url.includes('/acesso-conta/minha-conta')) {
        return json(req, { clientes: [{ id_cliente: 14, nome: 'FESTA IDEAL PRODUÇÕES' }],
                           precisa_trocar_senha: false });
    }

    if (url.includes('/acesso-conta/meus-pedidos')) { return json(req, MEUS_PEDIDOS); }

    // Carregar o pedido: é aqui que o evento nasce.
    if (/\/pedidos\/\d+\/carregar/.test(url) && metodo === 'POST') {
        eventoExiste = true;
        return json(req, { criado: true, evento_id: EVENTO_ID,
                           nome_evento: painel.evento.nome_evento,
                           setores_criados: SETORES.length,
                           elevacao: elevacao() });
    }

    // A lista da casa. Antes de carregar o pedido ela vem VAZIA -- senão o
    // vídeo mostraria o evento já pronto na tela em que ele ainda vai nascer.
    if (url.includes('/acesso-conta/meus-eventos')) {
        return json(req, { eventos: eventoExiste ? [{
            id: EVENTO_ID,
            nome_evento: painel.evento.nome_evento,
            data_evento: painel.evento.data_evento,
            local_evento: painel.evento.local_evento,
            status: 'ativo',
            entradas: 0,
        }] : [] });
    }
    if (url.includes('/elevar')) { return json(req, elevacao()); }

    // O aparelho nascendo NO PRÓPRIO celular: devolve o token direto, sem
    // código intermediário. Foi o que substituiu o pareamento por código.
    if (url.includes('/aparelhos/aqui') && metodo === 'POST') {
        const corpo = JSON.parse(req.postData() || '{}');
        const novo = { id: 'ap-1', nome: corpo.nome || NOME_APARELHO, status: 'ativo',
                       ultimo_visto: null, setores: corpo.setores || ['s1'] };
        painel.aparelhos = [novo];
        if (carga) { carga.aparelho = { id: novo.id, nome: novo.nome, setores: novo.setores }; }
        return json(req, { id: novo.id, nome: novo.nome, setores: novo.setores,
                           token: 'aparelho-de-demonstracao' });
    }
    if (url.includes('/aparelhos') && metodo === 'PATCH') {
        return json(req, { ok: true });
    }
    if (url.includes('/setores/') && metodo === 'PATCH') {
        const corpo = JSON.parse(req.postData() || '{}');
        const id = url.split('/setores/')[1].split(/[/?]/)[0];
        const s = painel.setores.filter(function (x) { return x.id === id; })[0];
        if (s) { Object.keys(corpo).forEach(function (k) { s[k] = corpo[k]; }); }
        return json(req, { ok: true });
    }
    if (url.includes('/bloqueios') && metodo === 'POST') {
        const corpo = JSON.parse(req.postData() || '{}');
        const s = painel.setores.filter(function (x) { return x.id === 's1'; })[0];
        s.bloqueios = [{ id: 'b1', setor_id: 's1', de: Number(corpo.de),
                         ate: Number(corpo.ate), motivo: corpo.motivo }];
        return json(req, { ok: true });
    }
    if (/\/acesso-conta\/eventos\/[^/]+(\?|$)/.test(url)) { return json(req, painel); }

    // A portaria.
    if (url.includes('/portaria/entrar')) {
        return json(req, { token: 'aparelho-de-demonstracao' });
    }
    if (url.includes('/portaria/faixa')) {
        const desde = Number((url.match(/desde=(\d+)/) || [])[1] || 0);
        const porPagina = 2000;
        const fatia = carga.credenciais.slice(desde, desde + porPagina);
        const proxima = desde + porPagina < carga.credenciais.length
            ? desde + porPagina : null;
        const pagina = desde === 0
            ? Object.assign({}, carga, { credenciais: fatia, proxima: proxima })
            : { credenciais: fatia, proxima: proxima };
        return json(req, pagina, atrasoDaFaixa);
    }
    if (url.includes('/portaria/leituras')) { return json(req, { ok: true }); }
    // A corrida da entrada única: quem chegou primeiro naquele ingresso. No
    // vídeo, este aparelho é sempre o primeiro — a recusa por "já entrou" não
    // faz parte do roteiro, e forjá-la aqui seria ensinar uma tela que o
    // aplicativo produz por outro caminho.
    if (url.includes('/portaria/entrada')) { return json(req, { primeira: true }); }
    // A rota leve, que o aparelho chama a cada cinco minutos. No vídeo ela só
    // precisa não falhar.
    if (url.includes('/portaria/sincronizar')) {
        return json(req, { evento: { ativo: true }, setores: [], bloqueios: [],
                           credenciais: [], totais: {}, proxima_desde: null });
    }

    // Qualquer outra coisa que saia da máquina não entra no vídeo. O aviso
    // importa: uma rota que mudou de nome cai aqui e devolve `{}`, e a tela
    // falha com uma mensagem genérica que não diz qual chamada ficou sem
    // resposta. Sem esta linha, o defeito custou uma gravação inteira.
    //
    // `data:` fica de fora: são os ícones que o próprio Chrome embute nos
    // campos (o calendário do `datetime-local`, por exemplo), e avisar sobre
    // eles afogaria o aviso que interessa.
    if (!url.startsWith('data:')) {
        console.log('    [rota sem resposta] ' + metodo + ' ' + url);
    }
    return req.respond({ status: 200, contentType: 'application/json',
                         headers: CORS, body: '{}' });
}

// ── O gravador ───────────────────────────────────────────────────────────────

class Gravador {
    constructor(page) {
        this.page = page;
        this.cena = null;
        this.n = 0;
        this.contagem = {};
    }

    abrirCena(id) {
        this.cena = id;
        this.n = 0;
        this.pasta = path.join(SAIDA, 'quadros', id);
        fs.mkdirSync(this.pasta, { recursive: true });
        for (const f of fs.readdirSync(this.pasta)) { fs.unlinkSync(path.join(this.pasta, f)); }
        process.stdout.write('  ' + id + ' … ');
    }

    fecharCena() {
        this.contagem[this.cena] = this.n;
        console.log(this.n + ' quadros (' + (this.n / FPS).toFixed(1) + 's)');
    }

    _arquivo(i) { return path.join(this.pasta, String(i).padStart(4, '0') + '.jpg'); }

    /** Um quadro de verdade: fotografa a tela como ela está agora. */
    async quadro() {
        const buf = await this.page.screenshot({ type: 'jpeg', quality: 88 });
        fs.writeFileSync(this._arquivo(this.n++), buf);
    }

    /**
     * Segura a imagem parada por N segundos.
     *
     * Fotografa UMA vez e copia o arquivo. Fotografar sessenta vezes a mesma
     * tela imóvel custaria dez segundos de gravação por cada segundo de vídeo, e
     * o resultado seria idêntico.
     */
    async segurar(segundos) {
        await this.quadro();
        const origem = this._arquivo(this.n - 1);
        const restantes = Math.max(0, Math.round(segundos * FPS) - 1);
        for (let i = 0; i < restantes; i++) { fs.copyFileSync(origem, this._arquivo(this.n++)); }
    }

    /** Segura fotografando de verdade — para quando há algo se movendo na tela
     *  (a câmera, um carregamento). */
    async segurarVivo(segundos) {
        const quadros = Math.round(segundos * FPS);
        for (let i = 0; i < quadros; i++) { await this.quadro(); }
    }

    /**
     * Estica o ÚLTIMO quadro já gravado, sem fotografar de novo.
     *
     * Serve para quando a tela já mudou mas a legenda ainda está falando da
     * anterior. É o caso do "Baixando o evento": a carga termina em poucos
     * segundos, e um `segurar()` normal fotografaria a tela de leitura — a
     * narração diria "espere terminar" por cima de uma tela que já terminou.
     */
    segurarUltimo(segundos) {
        if (!this.n) { return; }
        const origem = this._arquivo(this.n - 1);
        const quantos = Math.round(segundos * FPS);
        for (let i = 0; i < quantos; i++) { fs.copyFileSync(origem, this._arquivo(this.n++)); }
    }

    async rolarAte(seletor, quadros = 10) {
        const alvo = await this.page.$eval(seletor, function (el) {
            const r = el.getBoundingClientRect();
            return Math.max(0, window.scrollY + r.top - 150);
        });
        const de = await this.page.evaluate(function () { return window.scrollY; });
        if (Math.abs(alvo - de) < 4) { return; }
        for (let i = 1; i <= quadros; i++) {
            const y = de + (alvo - de) * (i / quadros);
            await this.page.evaluate(function (y) { window.scrollTo(0, y); }, y);
            await this.quadro();
        }
    }

    /** Toca num elemento, mostrando ONDE o dedo encostou. Sem o anel, o vídeo
     *  mostra a tela mudando sozinha e quem assiste não descobre qual botão. */
    async tocar(seletor) {
        await this.rolarAte(seletor, 6);
        const ponto = await this.page.$eval(seletor, function (el) {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        for (const escala of [0.45, 0.75, 1.05]) {
            await this.page.evaluate(function (x, y, e) { window.__toque(x, y, e); },
                                     ponto.x, ponto.y, escala);
            await this.quadro();
        }
        await this.page.click(seletor);
        await this.page.evaluate(function () { window.__semToque(); });
        await this.segurar(0.5);
    }

    /** Digita letra por letra, um quadro a cada duas letras. */
    async digitar(seletor, texto) {
        await this.rolarAte(seletor, 6);
        await this.page.click(seletor);
        await this.page.evaluate(function (s) {
            document.querySelector(s).value = '';
        }, seletor);
        for (let i = 0; i < texto.length; i++) {
            await this.page.type(seletor, texto[i], { delay: 0 });
            if (i % 2 === 1 || i === texto.length - 1) { await this.quadro(); }
        }
        await this.segurar(0.35);
    }
}

// ── Utilidades de página ─────────────────────────────────────────────────────

const ANEL = function () {
    window.__toque = function (x, y, escala) {
        let d = document.getElementById('__anel');
        if (!d) {
            d = document.createElement('div');
            d.id = '__anel';
            d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;'
                + 'border-radius:50%;border:3px solid #14b8a6;'
                + 'background:rgba(20,184,166,.28);box-sizing:border-box;';
            document.documentElement.appendChild(d);
        }
        const r = 26 * escala;
        d.style.left = (x - r) + 'px';
        d.style.top = (y - r) + 'px';
        d.style.width = d.style.height = (2 * r) + 'px';
        d.style.opacity = String(Math.max(0.25, 1.15 - escala * 0.7));
        d.style.display = 'block';
    };
    window.__semToque = function () {
        const d = document.getElementById('__anel');
        if (d) { d.style.display = 'none'; }
    };
    // O convite para instalar aparece quando o navegador dispara
    // `beforeinstallprompt`. Num Chrome sem loja de aplicativos ele nunca
    // dispara, então a gravação o dispara à mão — com o mesmo formato que o
    // `instalar.js` espera. O BOTÃO que aparece é o de verdade, criado por ele.
    window.__convidarInstalacao = function () {
        const e = new Event('beforeinstallprompt');
        e.prompt = function () { return Promise.resolve(); };
        e.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(e);
    };
};

async function novaPagina(browser, opcoes) {
    opcoes = opcoes || {};
    const page = await browser.newPage();
    await page.setViewport({ width: LARGURA, height: ALTURA, deviceScaleFactor: ESCALA,
                             isMobile: true, hasTouch: true });
    if (opcoes.userAgent) { await page.setUserAgent(opcoes.userAgent); }
    await page.evaluateOnNewDocument(ANEL);
    page.on('dialog', function (d) { d.accept('a-senha-do-cliente'); });
    page.on('pageerror', function (e) { console.log('    [erro na página] ' + e.message); });
    await page.setRequestInterception(true);
    page.on('request', rotear);
    return page;
}

/** Espera um seletor existir, sem explodir a gravação se ele mudou de nome. */
async function existe(page, seletor) {
    return page.$(seletor).then(function (el) { return !!el; });
}

// ── A carga da portaria ──────────────────────────────────────────────────────

/**
 * Monta a faixa que o aparelho baixa.
 *
 * Os hashes são calculados pelo `qr-ideal-hash.js` DA PÁGINA — a mesma função
 * que a portaria usa para conferir. Calculá-los aqui em Node, com outra
 * implementação, seria montar uma carga que o aparelho recusaria: o vídeo
 * mostraria três telas vermelhas e ninguém saberia por quê.
 *
 * Os quatro mil ingressos existem para que a tela "Baixando o evento" mostre um
 * número plausível e duas páginas de carga. Só três deles têm hash de verdade;
 * o resto é enchimento aleatório, que nenhum código bate.
 */
async function prepararCarga(page) {
    const hashes = await page.evaluate(async function (ingressos, sal) {
        const saida = [];
        for (const i of ingressos) { saida.push(await window.qrIdealHash(i.texto, sal)); }
        return saida;
    }, INGRESSOS, SAL);

    const credenciais = INGRESSOS.map(function (i, k) {
        return { id: i.id, h: hashes[k], s: i.setor, n: i.n };
    });
    while (credenciais.length < 4000) {
        credenciais.push({
            id: 'x' + credenciais.length,
            h: crypto.randomBytes(32).toString('hex'),
            s: SETORES[credenciais.length % 3].id,
            n: credenciais.length,
        });
    }

    carga = {
        evento: { id: EVENTO_ID, nome: painel.evento.nome_evento },
        aparelho: { id: 'ap-1', nome: 'Portão A', setores: ['s1'] },
        setores: SETORES.map(function (s) {
            // `quantidade` é o DENOMINADOR do contador da portaria ("137 / 800").
            // Sem ela, o vídeo mostrava "1 / 0" na cena mais vista de todas.
            return { id: s.id, nome: s.nome, tipo_uso: 'unico', quantidade: s.quantidade,
                     abre_em: null, fecha_em: null };
        }),
        bloqueios: [BLOQUEIO],
        sais: { [String(PEDIDO)]: SAL },
        credenciais: credenciais,
        proxima: null,
    };
}

// ── Cartelas, legendas e moldura ─────────────────────────────────────────────

// Aspas SIMPLES em "Segoe UI", e isto não é estilo de escrita.
//
// Esta constante é interpolada dentro de atributos `style="…"`. Com aspas
// duplas, o atributo TERMINA no `"` antes de Segoe, e tudo o que vem depois —
// inclusive o `color` — deixa de ser estilo e vira atributo solto que o
// navegador ignora. O sintoma foi título e legenda saindo em preto sobre fundo
// escuro: praticamente invisíveis, num vídeo em que a legenda é metade do
// recado.
const FONTE_CSS = "-apple-system, 'Segoe UI', Roboto, sans-serif";

async function desenharPecas(browser) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', rotear);
    await page.goto(BASE + '/__estudio', { waitUntil: 'domcontentloaded' });

    fs.mkdirSync(path.join(SAIDA, 'legendas'), { recursive: true });

    // A barra do topo: diz o tempo todo de que aplicativo é o vídeo.
    await page.setViewport({ width: 1080, height: 120, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0;background:#0a0f1e">
      <div style="height:120px;display:flex;align-items:center;gap:18px;padding:0 44px;
                  font-family:${FONTE_CSS};color:#e2e8f0">
        <img src="${BASE}/Logo%20Ideal%20Dark.png" style="height:44px;border-radius:6px">
        <div style="line-height:1.2">
          <div style="font-size:30px;font-weight:800;letter-spacing:.01em">Ideal Control</div>
          <div style="font-size:19px;color:#94a3b8">como instalar e usar</div>
        </div>
      </div></body>`, { waitUntil: 'networkidle0' });
    fs.writeFileSync(path.join(SAIDA, 'barra.png'), await page.screenshot({ type: 'png' }));

    // A moldura: uma máscara com um buraco arredondado. O `box-shadow` enorme
    // preenche tudo o que fica FORA do buraco com a cor do fundo, e é isso que
    // arredonda os cantos da tela do celular sem precisar recortar imagem.
    await page.setViewport({ width: 880, height: 1480, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0;overflow:hidden">
      <div style="position:absolute;left:40px;top:40px;width:800px;height:1400px;
                  border-radius:30px;box-sizing:border-box;
                  border:2px solid rgba(148,163,184,.38);
                  box-shadow:0 0 0 600px #0a0f1e"></div></body>`);
    fs.writeFileSync(path.join(SAIDA, 'moldura.png'),
                     await page.screenshot({ type: 'png', omitBackground: true }));

    // As legendas, uma por cena. Vão como PNG transparente em vez de texto do
    // ffmpeg: o `drawtext` não quebra linha sozinho e exige escapar acento e
    // pontuação num filtro de uma linha só. Aqui a tipografia é a do navegador,
    // e o texto se ajusta sozinho.
    await page.setViewport({ width: 1080, height: 300, deviceScaleFactor: 1 });
    for (const cena of ROTEIRO) {
        const texto = cena.legenda || cena.narracao;
        await page.setContent(`<body style="margin:0">
          <div style="width:1080px;height:300px;box-sizing:border-box;
                      display:flex;align-items:center;justify-content:center;
                      padding:26px 64px;border-top:2px solid rgba(148,163,184,.22);
                      font-family:${FONTE_CSS};color:#f1f5f9;text-align:center;
                      font-size:44px;font-weight:600;line-height:1.32;
                      text-shadow:0 2px 6px rgba(0,0,0,.55)">${
            texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div></body>`);
        fs.writeFileSync(path.join(SAIDA, 'legendas', cena.id + '.png'),
                         await page.screenshot({ type: 'png', omitBackground: true }));
    }

    await desenharIngresso(page);
    await page.close();
}

/**
 * O ingresso que aparece na câmera da portaria.
 *
 * Sem isto, o Chrome alimenta a câmera com o cartão de teste dele — um retângulo
 * verde-limão com um relógio — e a cena mais importante do vídeo passa a mostrar
 * uma tela que parece defeito.
 *
 * O arquivo é um `.mjpeg`: fotos JPEG emendadas uma atrás da outra, que é um dos
 * dois formatos que o `--use-file-for-fake-video-capture` aceita. Escrevê-lo é
 * concatenar bytes, e por isso não precisa de ffmpeg aqui.
 *
 * O QR do ingresso é de verdade — gerado pela mesma biblioteca do painel — e sai
 * PELA BORDA do quadro de propósito. Um QR inteiro e legível seria lido pela
 * portaria no instante em que a câmera ligasse, e pintaria a tela de verde no
 * meio da cena que ainda está explicando como apontar. Cortado, ele é o que é:
 * um adereço, com a aparência certa e sem decodificar.
 */
async function desenharIngresso(page) {
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0;overflow:hidden;background:#0b0d12">
      <div style="position:absolute;inset:0;
                  background:radial-gradient(ellipse at 38% 42%, #2b3444 0%, #0b0d12 72%)"></div>
      <div style="position:absolute;left:300px;top:112px;width:440px;height:250px;
                  transform:rotate(-7deg);border-radius:10px;background:#f8fafc;
                  box-shadow:0 18px 40px rgba(0,0,0,.6);display:flex;
                  font-family:${FONTE_CSS};overflow:hidden">
        <div style="flex:1;padding:22px 20px;color:#0f172a">
          <div style="font-size:11px;letter-spacing:.18em;color:#64748b;font-weight:700">
            FESTA IDEAL 2026</div>
          <div style="font-size:34px;font-weight:800;margin-top:6px">PISTA</div>
          <div style="font-size:12px;color:#64748b;margin-top:14px">INGRESSO</div>
          <div style="font-size:30px;font-weight:800;letter-spacing:.06em">000123</div>
        </div>
        <div style="width:170px;border-left:2px dashed #cbd5e1;display:flex;
                    align-items:center;justify-content:center">
          <canvas id="qr" width="130" height="130"></canvas>
        </div>
      </div></body>`);

    // Os scripts entram por `addScriptTag`, e não por `<script src>` dentro do
    // `setContent`: ali o `networkidle0` ficava esperando para sempre, e o
    // erro que aparecia era um tempo esgotado de navegação, que não diz nada
    // sobre o que faltou carregar.
    await page.addScriptTag({ url: BASE + '/qrcode-generator.min.js' });
    await page.addScriptTag({ url: BASE + '/qr-canvas.js' });
    await page.evaluate(function () {
        const ctx = document.getElementById('qr').getContext('2d');
        ctx.translate(65, 65);
        window.renderQRCodeOnCtx(ctx, '000123', 0, 0, 130, '#0f172a', '#ffffff');
    });

    // Quadros REPETIDOS o bastante para durar a gravação inteira. Com noventa
    // — o que bastava quando a portaria era a primeira tela gravada — a câmera
    // secava no meio do caminho e o visor aparecia preto nas cinco cenas de
    // leitura, que são as mais importantes do vídeo. A qualidade cai para 55
    // porque é a MESMA foto repetida: o que cresce é só o tamanho do arquivo.
    const foto = await page.screenshot({ type: 'jpeg', quality: 55 });
    const pedacos = [];
    for (let i = 0; i < 2400; i++) { pedacos.push(foto); }
    fs.writeFileSync(path.join(SAIDA, 'ingresso.mjpeg'), Buffer.concat(pedacos));
}

/** As duas cartelas — abertura e fecho — são desenhadas na mesma medida da tela
 *  do celular, para caírem dentro da moldura como as outras cenas. */
async function cartela(page, titulo, subtitulo) {
    await page.setContent(`<body style="margin:0;background:#0a0f1e;height:${ALTURA}px">
      <div style="height:${ALTURA}px;display:flex;flex-direction:column;
                  align-items:center;justify-content:center;gap:18px;padding:0 40px;
                  font-family:${FONTE_CSS};text-align:center">
        <img src="${BASE}/icones/portaria-192.png" style="width:104px;border-radius:22px">
        <div style="font-size:34px;font-weight:800;color:#e2e8f0">${titulo}</div>
        <div style="font-size:18px;color:#94a3b8;line-height:1.5">${subtitulo}</div>
      </div></body>`, { waitUntil: 'networkidle0' });
}

// ── A gravação ───────────────────────────────────────────────────────────────

async function main() {
    if (!fs.existsSync(path.join(FONTE, 'controle.html'))) {
        console.error('Não achei o frontend em ' + FONTE);
        process.exit(1);
    }
    fs.mkdirSync(SAIDA, { recursive: true });

    const servidor = await subirServidor();

    // Dois navegadores, e a ordem é obrigatória: o segundo precisa receber o
    // arquivo de câmera falsa como argumento de linha de comando, e quem produz
    // esse arquivo é o primeiro. Não dá para trocar a câmera de um Chrome que
    // já subiu.
    console.log('Desenhando barra, moldura, legendas e o ingresso…');
    const oficina = await puppeteer.launch({ args: ['--no-sandbox'] });
    await desenharPecas(oficina);
    await oficina.close();

    const browser = await puppeteer.launch({
        args: ['--no-sandbox',
               '--use-fake-ui-for-media-stream',
               '--use-fake-device-for-media-stream',
               '--use-file-for-fake-video-capture=' + path.join(SAIDA, 'ingresso.mjpeg'),
               '--autoplay-policy=no-user-gesture-required'],
    });

    console.log('Gravando as cenas:');

    // A carga da portaria é montada AGORA, numa página qualquer que já tenha o
    // `qr-ideal-hash.js`: quando o celular virar aparelho, ele vai pedi-la na
    // hora, e não há tempo de calcular hash no meio da navegação.
    // Numa página vazia com o script do código carregado à mão, e nao na
    // portaria: sem token, ela se manda para a lista de eventos antes de
    // qualquer script rodar -- e a espera pelo `qrIdealHash` estourava.
    const cozinha = await novaPagina(browser);
    await cozinha.goto(BASE + '/__estudio', { waitUntil: 'domcontentloaded' });
    await cozinha.addScriptTag({ url: '/qr-ideal-hash.js' });
    await cozinha.waitForFunction(function () { return !!window.qrIdealHash; });
    await prepararCarga(cozinha);
    await cozinha.close();

    // ── Abertura ─────────────────────────────────────────────────────────────
    const page = await novaPagina(browser);
    await page.goto(BASE + '/__estudio', { waitUntil: 'domcontentloaded' });
    const g = new Gravador(page);

    g.abrirCena('01-abertura');
    await cartela(page, 'Ideal Control',
                  'Confira os ingressos na porta do seu evento.<br>Funciona sem internet.');
    await g.segurar(8);
    g.fecharCena();

    // ── Instalar ─────────────────────────────────────────────────────────────
    await page.goto(BASE + '/controle.html', { waitUntil: 'networkidle0' });
    // A parede de instalação decide um segundo e meio depois de a página abrir,
    // e só aparece se o navegador tiver oferecido instalar. Num Chrome sem loja
    // isso nunca acontece: a gravação dispara o convite à mão, no mesmo formato
    // que o aplicativo espera.
    await page.evaluate(function () { window.__convidarInstalacao(); });
    await page.waitForSelector('#parede-pwa', { timeout: 10000 });

    g.abrirCena('02-instalar');
    await g.segurar(7);
    await g.tocar('#parede-pwa button');
    await g.segurar(2.5);
    g.fecharCena();

    // O navegador de verdade fecha a parede sozinho ao instalar. Aqui não há
    // instalação nenhuma para acontecer, então a gravação a retira.
    await page.evaluate(function () {
        const p = document.getElementById('parede-pwa');
        if (p) { p.remove(); }
    });

    // ── Entrar ───────────────────────────────────────────────────────────────
    await page.waitForSelector('#bloco-entrar:not(.sumindo)', { timeout: 10000 });

    g.abrirCena('03-entrar');
    await g.segurar(2);
    await g.digitar('#email', EMAIL);
    await g.digitar('#senha', 'a-senha-do-cliente');
    await g.segurar(1.5);
    await g.tocar('#btn-entrar');
    // Conta sem evento nenhum cai direto em Meus Pedidos: é lá que o primeiro
    // evento nasce.
    await page.waitForSelector('#meus-pedidos:not(.sumindo)', { timeout: 20000 });
    await g.segurar(2);
    g.fecharCena();

    // ── Meus Pedidos ─────────────────────────────────────────────────────────
    g.abrirCena('04-pedidos');
    await g.segurar(4);
    await g.rolarAte('#pedido-' + PEDIDO, 8);
    await g.segurar(4);
    g.fecharCena();

    // ── Carregar ─────────────────────────────────────────────────────────────
    g.abrirCena('05-carregar');
    await g.tocar('#carregar-' + PEDIDO);
    await page.waitForSelector('#caixa-carregar:not(.sumindo)', { timeout: 15000 });
    await g.segurar(2.5);
    await g.digitar('#carregar-nome', 'Festa Ideal 2026');
    await g.segurar(1.5);
    await g.tocar('#btn-carregar-confirmar');
    // Em seguida o aplicativo pergunta se ESTE celular vai ler os ingressos.
    // Aqui a resposta é não: quem configura é o celular do dono, e o leitor
    // nasce na cena 09, no celular da porta.
    await page.waitForSelector('#fundo-confirmar', { timeout: 20000 }).catch(async function () {
        const diag = await page.evaluate(function () {
            const t = function (id) {
                const e = document.getElementById(id);
                return e ? (e.textContent || '').trim().slice(0, 200) : '(sem elemento)';
            };
            const v = function (id) {
                const e = document.getElementById(id);
                return e ? !e.classList.contains('sumindo') : false;
            };
            return {
                erroCarregar: t('erro-carregar'),
                caixaAberta: v('caixa-carregar'),
                semSenha: v('carregar-sem-senha'),
                erroArranque: t('erro-arranque'),
                aviso: t('aviso-gravacao'),
            };
        });
        console.log('    [diagnóstico do carregar] ' + JSON.stringify(diag));
        throw new Error('a caixa de confirmação não apareceu');
    });
    await g.segurar(3);
    await g.tocar('#btn-confirmar-nao');
    await page.waitForSelector('#lista:not(.sumindo)', { timeout: 20000 });
    await g.segurar(1.5);
    g.fecharCena();

    // ── A casa ───────────────────────────────────────────────────────────────
    await page.waitForFunction(function () {
        return document.querySelectorAll('#eventos .barra-evento').length > 0;
    }, { timeout: 20000 });

    g.abrirCena('06-casa');
    await g.segurar(6);
    g.fecharCena();

    // ── A configuração ───────────────────────────────────────────────────────
    g.abrirCena('07-configurar');
    await g.tocar('#config-' + EVENTO_ID);
    await page.waitForSelector('#engrenagem:not(.sumindo)', { timeout: 20000 });
    await page.waitForFunction(function () {
        return document.querySelectorAll('#setores .cartao').length > 0;
    }, { timeout: 20000 });
    await g.segurar(3);
    // As cinco seções nascem recolhidas. A de setores é a que interessa aqui.
    await g.tocar('#abrir-setores');
    await g.segurar(1.5);
    await g.rolarAte('#setores', 10);
    await g.tocar('#setor-configurar-s1');
    await g.rolarAte('#setor-config-s1', 10);
    await g.segurar(1);
    if (await existe(page, '#setor-nome-s1')) {
        await g.digitar('#setor-nome-s1', 'PISTA');
    }
    await g.segurar(3);
    g.fecharCena();

    g.abrirCena('08-uso');
    if (await existe(page, '#uso-s1-reentrada')) {
        await g.rolarAte('#uso-s1-reentrada', 8);
        await g.segurar(1.5);
        await g.tocar('#uso-s1-reentrada');
        await g.segurar(2);
        await g.tocar('#uso-s1-unico');
    }
    await g.segurar(4);
    g.fecharCena();

    // ── O celular da porta ───────────────────────────────────────────────────
    //
    // Daqui em diante a MESMA aba vira o aparelho: confirmar o nome encerra a
    // sessão da conta e leva o navegador para a portaria. É o caminho real, e
    // é por isso que ele fica por último.
    await g.tocar('#btn-fechar-engrenagem');
    await page.waitForSelector('#lista:not(.sumindo)', { timeout: 20000 });

    g.abrirCena('09-aparelho');
    await g.segurar(1.5);
    await g.tocar('#evento-' + EVENTO_ID);
    // Ligar um celular ao evento é escrita de configuração, e por isso passa
    // pela senha — mesmo com a conta aberta. O e-mail já vem preenchido.
    await page.waitForSelector('#caixa-entrar-config:not(.sumindo)', { timeout: 20000 });
    await g.segurar(2);
    await g.digitar('#entrar-config-senha', 'a-senha-do-cliente');
    await g.tocar('#btn-entrar-config');
    await page.waitForSelector('#fundo-confirmar', { timeout: 20000 });
    await g.segurar(4);
    if (await existe(page, '#campo-nome-aparelho')) {
        await g.digitar('#campo-nome-aparelho', NOME_APARELHO);
        await g.segurar(1.5);
    }
    // O atraso é o que dá DURAÇÃO à cena seguinte. Num aparelho de verdade quem
    // demora é a rede; aqui o backend falso responde na hora, e sem isto a tela
    // "Baixando o evento" apareceria por um quadro e sumiria.
    atrasoDaFaixa = 2600;
    // Um `click` cru, e não o `tocar` que fotografa: este toque encerra a
    // sessão e TROCA A PÁGINA, e uma fotografia em voo durante a navegação
    // deixa o Chrome pendurado até o tempo do protocolo esgotar.
    await page.click('#btn-confirmar-sim');
    g.fecharCena();

    // ── Baixando o evento ────────────────────────────────────────────────────
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
        .catch(function () { /* já navegou antes de a espera começar */ });
    await page.waitForSelector('#tela-carregando, #tela-lendo', { timeout: 30000 });

    g.abrirCena('10-baixando');
    // Fotografa ENQUANTO carrega, e não por um tempo fixo: cada foto custa
    // tempo real, então "cinco segundos de quadros" acaba muito depois de o
    // carregamento ter terminado — e a cena mostrava a câmera já ligada.
    for (let i = 0; i < 80; i++) {
        const carregando = await page.$('#tela-carregando:not(.sumindo)');
        if (!carregando) { break; }
        await g.quadro();
    }
    // Estica o último quadro DO CARREGAMENTO, e não a tela seguinte: a legenda
    // ainda está dizendo "espere terminar antes de ir para a porta".
    g.segurarUltimo(6);
    await page.waitForSelector('#tela-lendo:not(.sumindo)', { timeout: 40000 });
    atrasoDaFaixa = 0;
    g.fecharCena();

    // ── A leitura ────────────────────────────────────────────────────────────
    //
    // O véu "Toque para começar a ler" cobre a tela até alguém encostar nela: é
    // o toque que libera o som no celular. No vídeo ele também é um toque.
    if (await existe(page, '#btn-toque:not(.sumindo)')) {
        await g.tocar('#btn-toque');
    }

    g.abrirCena('11-lendo');
    await g.segurarVivo(8);
    g.fecharCena();

    // Os três resultados. A leitura passa pelo caminho de verdade — "Digitar o
    // número" e "Conferir" —, que corre exatamente as mesmas regras da câmera.
    // Encenar um QR na frente de uma webcam falsa daria a mesma tela por um
    // caminho que ninguém conseguiria repetir.
    async function digitarIngresso(numero) {
        if (await page.$('#caixa-digitar.sumindo')) { await page.click('#btn-digitar'); }
        await g.digitar('#campo-numero', numero);
        await g.tocar('#btn-conferir');
    }

    /** A RECUSA ocupa a tela e exige um toque para sair. */
    async function lerRecusado(cenaId, numero, segundos) {
        g.abrirCena(cenaId);
        await digitarIngresso(numero);
        await page.waitForSelector('#tela-resposta:not(.sumindo)', { timeout: 15000 });
        await g.segurar(segundos);
        await page.click('#btn-proximo');
        g.fecharCena();
    }

    // O ingresso BOM não ocupa a tela: ele troca a faixa verde e a câmera
    // segue lendo. Esperar a tela de resposta aqui seria esperar uma tela que
    // o aplicativo deixou de mostrar de propósito — o que dá certo não pode
    // custar um toque ao porteiro.
    g.abrirCena('12-verde');
    await digitarIngresso(INGRESSOS[0].texto);
    await page.waitForFunction(function () {
        const f = document.getElementById('faixa-ultima');
        return f && !f.classList.contains('vazia');
    }, { timeout: 15000 });
    await g.segurarVivo(6);
    g.fecharCena();

    // O MESMO ingresso da cena anterior. O aparelho já o registrou, e o setor
    // dele vale uma entrada só — a recusa sai do próprio aparelho, sem rede.
    await lerRecusado('13-ja-entrou', INGRESSOS[0].texto, 7);
    await lerRecusado('14-vermelho', INGRESSOS[2].texto, 7.5);

    // A recusa fica na tela enquanto a legenda diz que não há como contorná-la.
    // Mostrar a câmera aqui sugeriria que a conversa acabou e o porteiro seguiu
    // em frente, que é justamente o momento em que alguém insiste.
    g.abrirCena('15-recusa');
    if (await page.$('#caixa-digitar.sumindo')) { await page.click('#btn-digitar'); }
    // O texto tem de ser o do ingresso, com os zeros à esquerda: o código é
    // conferido sobre o que está ESCRITO no papel. "512" e "000512" são
    // diferentes, e o segundo é o que existe na faixa.
    await g.digitar('#campo-numero', INGRESSOS[2].texto);
    await g.tocar('#btn-conferir');
    await page.waitForSelector('#tela-resposta:not(.sumindo)', { timeout: 15000 });
    await g.segurar(7);
    g.fecharCena();

    // ── Fecho ────────────────────────────────────────────────────────────────
    await page.goto(BASE + '/__estudio', { waitUntil: 'domcontentloaded' });
    g.abrirCena('16-fecho');
    await cartela(page, 'Ingresso Ideal',
                  'Configure antes do evento.<br>No dia, a portaria precisa só do celular.');
    await g.segurar(9);
    g.fecharCena();

    // ── O manifesto ──────────────────────────────────────────────────────────
    const contagem = g.contagem;
    const cenas = ROTEIRO.map(function (c) {
        return {
            id: c.id,
            quadros: contagem[c.id] || 0,
            narracao: c.narracao,
            legenda: c.legenda || c.narracao,
        };
    });
    const faltando = cenas.filter(function (c) { return !c.quadros; });
    fs.writeFileSync(path.join(SAIDA, 'cenas.json'),
                     JSON.stringify({ fps: FPS, cenas: cenas }, null, 2), 'utf8');

    await browser.close();
    servidor.close();

    if (faltando.length) {
        console.error('\nCenas sem quadro nenhum: '
            + faltando.map(function (c) { return c.id; }).join(', '));
        process.exit(1);
    }
    const total = cenas.reduce(function (t, c) { return t + c.quadros; }, 0);
    console.log('\nPronto: ' + cenas.length + ' cenas, '
        + (total / FPS).toFixed(0) + 's de imagem, em ' + SAIDA);
}

main().catch(function (e) {
    console.error(e);
    process.exit(1);
});
