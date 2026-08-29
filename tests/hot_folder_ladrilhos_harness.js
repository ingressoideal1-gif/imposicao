// OS LADRILHOS DO HOT FOLDER, DESENHADOS NUM CHROME DE VERDADE.
//
// Pedido do usuario em 29/08/2026: "vamos tirar as opcoes de Hot Folder de
// dentro das configuracoes de impressao, sera um botao a parte, ao clicar e
// selecionar ele ja estara ativo e vai mostrar abaixo do botao icones de pastas
// coloridas e com nomes das pastas, selecionalas escolhe o hot folder".
//
// Tres coisas mudaram de natureza, e sao elas que este harness trava:
//
//   1. NAO HA MAIS CAIXA DE ATIVAR. Escolher a pasta E' ativar. Antes eram dois
//      estados que podiam discordar -- caixa marcada sem pasta chegava ate o
//      botao Imprimir para ser barrada la'.
//   2. O HOT FOLDER SAIU da Configuracao de Impressao e virou grupo proprio,
//      ANTES dela: ele decide para onde o material vai.
//   3. A LISTA DE PASTAS DA ESTACAO virou tela. Ela sempre existiu no
//      hot_folders.json; era invisivel, e cada trabalho recomecava do seletor
//      nativo do Windows.
//
// Roda as funcoes DE VERDADE, recortadas do script.js pelo nome, contra a
// janela de verdade do index.html e o style.css de verdade. Nada sai desta
// maquina: nem CDN, nem banco, nem o agente -- a lista de pastas e' semeada na
// variavel que o fetch preencheria.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function recortarJanela() {
    const i = HTML.indexOf('<div class="imposicao-preview" id="ped-preview-card-container"');
    const f = HTML.indexOf('</div><!-- /ped-preview-home -->');
    if (i < 0 || f < 0) throw new Error('nao achei a janela no index.html');
    return HTML.slice(i, f);
}

// Extrai a funcao pelo nome, do arquivo de verdade. Copiar o corpo para ca'
// aprovaria uma copia velha -- foi a licao dos harnesses anteriores.
function extrair(src, nome) {
    const marca = '\nfunction ' + nome + '(';
    let i = src.indexOf(marca);
    if (i < 0) i = src.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim de ' + nome);
    return src.slice(i, fim + 2);
}

const FUNCOES = [
    '_hotFolderPath', '_hotFolderAtivo', '_hotFolderStatus',
    '_nomeDaPasta', '_corDaPasta', '_svgDaPasta', '_svgDaPastaSumida', '_mesmaPasta',
    'desenharGradeHotFolders', 'escolherHotFolderDaGrade', '_aplicarEstadoHotFolder',
];

(async () => {
    // ── 1. O que se le no ARQUIVO, antes de abrir navegador nenhum ──────────
    ok(!/id="ped-hotfolder-enabled"/.test(HTML),
       'a caixa de "ativar" saiu do index.html — escolher a pasta E o ativar');
    // Pela FORMA, e nao pela palavra: o comentario que registra a remocao no
    // script.js cita o nome de proposito, e citar nao e' chamar.
    ok(!/onPedHotFolderToggle\s*\(/.test(HTML) && !/onPedHotFolderToggle\s*\(/.test(SCRIPT),
       'e o tratador dela saiu junto, sem definicao nem chamada pendurada');

    const iHot = HTML.indexOf('id="jg-hotfolder"');
    const iCfg = HTML.indexOf('id="jg-config"');
    ok(iHot > 0, 'o Hot Folder tem grupo proprio (#jg-hotfolder)');
    ok(iHot > 0 && iCfg > 0 && iHot < iCfg,
       'e ele vem ANTES da Configuracao de Impressao — quem decide o destino vem primeiro');

    const corpoCfg = HTML.slice(iCfg, HTML.indexOf('id="jg-cores"'));
    ok(!/ped-hotfolder/.test(corpoCfg),
       'nao sobrou nada de hot folder dentro da Configuracao de Impressao', corpoCfg.length);

    // O agente precisa saber responder a lista, senao os ladrilhos nascem vazios
    // em toda estacao e o recurso vira so' o "cole o caminho".
    const APP = fs.readFileSync(path.join(RAIZ, 'app.py'), 'utf8');
    ok(/@app\.get\("\/api\/hotfolder\/listar"\)/.test(APP),
       'o agente tem a rota que lista as pastas da estacao');
    ok(/@app\.post\("\/api\/hotfolder\/esquecer"\)/.test(APP),
       'e a rota que tira uma pasta da lista — lista visivel precisa poder ser limpa');

    const navegador = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const aba = await navegador.newPage();
    await aba.setViewport({ width: 1600, height: 1000 });

    await aba.setContent(`<!doctype html><html><head><meta charset="utf-8">
        <style>${CSS}</style></head>
        <body><div id="view-pedido"><div class="imposicao-layout">${recortarJanela()}</div></div></body></html>`,
        { waitUntil: 'load' });

    // A janela e' um card que nasce escondido; o harness a abre para poder medir.
    await aba.evaluate(() => {
        document.getElementById('ped-preview-card-container').style.display = 'block';
    });

    await aba.evaluate(`
        // O que o script.js real espera ao redor destas funcoes.
        let _hotFoldersDaEstacao = [];
        const AGENTE_LOCAL_URL = 'http://127.0.0.1:9000';
        function _getActiveProductInfo() { return { prodId: 1, prodNome: 'teste' }; }
        function escapeHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
        function escolherHotFolder() { window.__pediuSeletor = true; }
        function esquecerHotFolder(p) { window.__pediuEsquecer = p; }
        ${FUNCOES.map(n => extrair(SCRIPT, n)).join('\n')}
        ${extrair(PEDIDO, 'alternarGrupoDaJanela')}
        window.__semear = pastas => { _hotFoldersDaEstacao = pastas; desenharGradeHotFolders(); };
        window.escolherHotFolderDaGrade = escolherHotFolderDaGrade;
        window.escolherHotFolder = escolherHotFolder;
        window.esquecerHotFolder = esquecerHotFolder;
        window.alternarGrupoDaJanela = alternarGrupoDaJanela;
        window.__ativo = () => _hotFolderAtivo();
        window.__caminho = () => _hotFolderPath();
    `);

    // ── 2. O nome da pasta ──────────────────────────────────────────────────
    const nomes = await aba.evaluate(() => ({
        windows: _nomeDaPasta('C:\\RIP\\Epson\\Sublimacao 160g'),
        barra:   _nomeDaPasta('C:/RIP/Epson/Foto Brilho/'),
        unc:     _nomeDaPasta('\\\\servidor\\rip\\Vinil'),
        raiz:    _nomeDaPasta('D:\\'),
        vazio:   _nomeDaPasta(''),
    }));
    ok(nomes.windows === 'Sublimacao 160g', 'o nome e o ultimo trecho do caminho', nomes);
    ok(nomes.barra === 'Foto Brilho', 'barra final nao vira nome vazio', nomes);
    ok(nomes.unc === 'Vinil', 'caminho UNC tambem entrega o nome', nomes);
    ok(nomes.raiz === 'D:', 'raiz de unidade usa o proprio caminho — ladrilho sem rotulo nao serve', nomes);
    ok(nomes.vazio === '', 'caminho vazio nao inventa nome', nomes);

    // ── 3. A cor sai do caminho, e e sempre a mesma ─────────────────────────
    const cores = await aba.evaluate(() => ({
        a1: _corDaPasta('C:\\RIP\\Sublimacao').forte,
        a2: _corDaPasta('C:\\RIP\\Sublimacao').forte,
        maiuscula: _corDaPasta('c:\\rip\\sublimacao').forte,
        b:  _corDaPasta('C:\\RIP\\Vinil').forte,
        distintas: new Set(['Sublimacao', 'Vinil', 'Papel', 'Lona', 'Adesivo', 'Canvas']
            .map(n => _corDaPasta('C:\\RIP\\' + n).forte)).size,
    }));
    ok(cores.a1 === cores.a2, 'a mesma pasta tem sempre a mesma cor', cores);
    ok(cores.a1 === cores.maiuscula, 'caixa do caminho nao muda a cor — Windows nao distingue', cores);
    ok(cores.a1 !== cores.b, 'pastas diferentes ganham cores diferentes', cores);
    ok(cores.distintas >= 4, 'seis pastas nao caem quase todas na mesma cor', cores);

    // ── 4. Dois caminhos, a mesma pasta ─────────────────────────────────────
    const mesma = await aba.evaluate(() => ({
        barra:  _mesmaPasta('C:/RIP/Foto', 'C:\\RIP\\Foto'),
        final:  _mesmaPasta('C:\\RIP\\Foto\\', 'C:\\RIP\\Foto'),
        caixa:  _mesmaPasta('c:\\rip\\foto', 'C:\\RIP\\Foto'),
        outra:  _mesmaPasta('C:\\RIP\\Foto', 'C:\\RIP\\Fotos'),
        vazios: _mesmaPasta('', ''),
    }));
    ok(mesma.barra && mesma.final && mesma.caixa, 'barra, barra final e caixa nao criam pasta nova', mesma);
    ok(!mesma.outra, 'Foto e Fotos continuam sendo duas pastas', mesma);
    ok(!mesma.vazios, 'dois vazios NAO sao a mesma pasta — senao nada escolhido casaria com tudo', mesma);

    // ── 5. A grade desenhada ────────────────────────────────────────────────
    const PASTAS = [
        { path: 'C:\\RIP\\Sublimacao 160g', nome: 'Sublimacao 160g', existe: true },
        { path: 'C:\\RIP\\Vinil',           nome: 'Vinil',           existe: true },
        { path: '\\\\nas\\rip\\Lona',        nome: 'Lona',            existe: false },
    ];
    const grade = await aba.evaluate(pastas => {
        window.__semear(pastas);
        const g = document.getElementById('ped-hotfolder-grade');
        return {
            ladrilhos: g.querySelectorAll('.hf-ladrilho').length,
            add: g.querySelectorAll('.hf-add').length,
            nomes: Array.from(g.querySelectorAll('.hf-ladrilho:not(.hf-add) .hf-nome')).map(e => e.textContent),
            sumiu: Array.from(g.querySelectorAll('.hf-sumiu .hf-nome')).map(e => e.textContent),
            selecionados: g.querySelectorAll('.hf-sel').length,
            comCorPropria: Array.from(g.querySelectorAll('.hf-ladrilho:not(.hf-add)'))
                .filter(e => (e.getAttribute('style') || '').includes('--hf-forte')).length,
            tirar: g.querySelectorAll('.hf-tirar').length,
        };
    }, PASTAS);
    ok(grade.ladrilhos === 4, 'tres pastas + o ladrilho de adicionar', grade);
    ok(grade.add === 1, 'ha exatamente um "Adicionar pasta" — sem ele, pasta nova nunca entraria', grade);
    ok(grade.nomes.join('|') === 'Sublimacao 160g|Vinil|Lona', 'cada ladrilho leva o nome da pasta', grade);
    ok(grade.comCorPropria === 3, 'cada ladrilho carrega a propria cor', grade);
    ok(grade.sumiu.join('') === 'Lona',
       'pasta que a estacao nao acha aparece QUEBRADA — descobrir isso no envio seria com o material pronto', grade);

    // ── 5b. O icone e COLORIDO DE VERDADE ───────────────────────────────────
    //
    // O teste que quase nao foi escrito, e que pegou o erro: com o emoji da
    // pasta a cor vinha da fonte do sistema, `color` era ignorado e as tres
    // pastas sairiam do mesmo amarelo. "Icones de pastas coloridas" viraria
    // "icones de pastas iguais", sem nenhum aviso. Aqui a cor e lida do pixel
    // que o Chrome de fato pintou.
    const pintura = await aba.evaluate(() => {
        const icones = Array.from(document.querySelectorAll('.hf-ladrilho:not(.hf-add) .hf-icone'));
        return {
            temSvg: icones.every(e => e.querySelector('svg') !== null),
            usaCurrentColor: icones.every(e =>
                (e.querySelector('path') || {}).getAttribute?.('fill') === 'currentColor'
                || e.querySelector('path[fill="currentColor"]') !== null),
            cores: icones.map(e => getComputedStyle(e).color),
        };
    });
    ok(pintura.temSvg, 'o icone e SVG, e nao emoji — emoji ignora a cor do ladrilho', pintura);
    ok(pintura.usaCurrentColor, 'e pinta com currentColor, que e como a cor do ladrilho chega ao desenho', pintura);
    ok(new Set(pintura.cores).size === pintura.cores.length,
       'as tres pastas saem em tres cores DIFERENTES no pixel pintado', pintura);
    ok(!pintura.cores.some(c => c === 'rgb(148, 163, 184)'),
       'nenhum icone caiu na cor de reserva — todos receberam a cor da propria pasta', pintura);
    ok(grade.selecionados === 0, 'nada nasce escolhido: a tela abre sem destino, como sempre foi', grade);
    ok(grade.tirar === 3, 'cada pasta tem como sair da lista, e o "Adicionar" nao tem', grade);

    // ── 6. Clicar escolhe — e escolher E ativar ─────────────────────────────
    const aoEscolher = await aba.evaluate(() => {
        escolherHotFolderDaGrade('C:\\RIP\\Vinil');
        const selo = document.getElementById('ped-hotfolder-selo');
        const impressora = document.getElementById('ped-print-printer');
        return {
            ativo: _hotFolderAtivo(),
            caminho: _hotFolderPath(),
            selo: selo.textContent,
            seloVisivel: selo.style.display !== 'none',
            impressoraTravada: impressora ? impressora.disabled : null,
            avisoVisivel: document.getElementById('ped-hotfolder-aviso').style.display !== 'none',
            marcados: Array.from(document.querySelectorAll('.hf-sel .hf-nome')).map(e => e.textContent),
        };
    });
    ok(aoEscolher.ativo === true, 'um clique no ladrilho JA deixa o hot folder ativo', aoEscolher);
    ok(aoEscolher.caminho === 'C:\\RIP\\Vinil', 'e a pasta escolhida e a do ladrilho', aoEscolher);
    ok(aoEscolher.marcados.join('') === 'Vinil', 'so o ladrilho clicado fica marcado', aoEscolher);
    ok(aoEscolher.seloVisivel && aoEscolher.selo === 'Vinil',
       'o selo do botao diz a pasta — o estado nao se esconde ao fechar o grupo', aoEscolher);
    ok(aoEscolher.impressoraTravada === true,
       'a impressora fica inerte: no hot folder quem manda e o preset do RIP', aoEscolher);
    ok(aoEscolher.avisoVisivel,
       'e o aviso do que vem do RIP aparece so quando ele passa a valer', aoEscolher);

    // ── 7. Clicar de novo desliga ───────────────────────────────────────────
    const aoDesligar = await aba.evaluate(() => {
        escolherHotFolderDaGrade('C:\\RIP\\Vinil');
        return {
            ativo: _hotFolderAtivo(),
            caminho: _hotFolderPath(),
            seloVisivel: document.getElementById('ped-hotfolder-selo').style.display !== 'none',
            impressoraTravada: document.getElementById('ped-print-printer').disabled,
            marcados: document.querySelectorAll('.hf-sel').length,
        };
    });
    ok(aoDesligar.ativo === false && aoDesligar.caminho === '',
       'clicar no ladrilho ja escolhido desliga o hot folder', aoDesligar);
    ok(aoDesligar.impressoraTravada === false,
       'e devolve a impressora — senao o trabalho ficaria sem destino nenhum', aoDesligar);
    ok(!aoDesligar.seloVisivel && aoDesligar.marcados === 0, 'o selo e a marca somem junto', aoDesligar);

    // ── 8. Trocar de pasta troca a escolha, nao acumula ─────────────────────
    const aoTrocar = await aba.evaluate(() => {
        escolherHotFolderDaGrade('C:\\RIP\\Vinil');
        escolherHotFolderDaGrade('C:\\RIP\\Sublimacao 160g');
        return {
            caminho: _hotFolderPath(),
            marcados: Array.from(document.querySelectorAll('.hf-sel .hf-nome')).map(e => e.textContent),
        };
    });
    ok(aoTrocar.marcados.length === 1 && aoTrocar.marcados[0] === 'Sublimacao 160g',
       'escolher outra pasta troca a escolha — duas ativas mandariam o PDF para dois lugares', aoTrocar);

    // ── 9. A pasta gravada no produto aparece mesmo fora da lista ───────────
    //
    // Estacao trocada, agente parado: esconder o ladrilho da pasta que ESTA
    // valendo faria a tela mentir sobre o que vai acontecer ao imprimir.
    const foraDaLista = await aba.evaluate(() => {
        escolherHotFolderDaGrade('C:\\RIP\\Sublimacao 160g');   // limpa
        document.getElementById('ped-hotfolder-path').value = 'D:\\Pasta Do Produto';
        _aplicarEstadoHotFolder();
        desenharGradeHotFolders();
        return {
            nomes: Array.from(document.querySelectorAll('.hf-ladrilho:not(.hf-add) .hf-nome')).map(e => e.textContent),
            marcados: Array.from(document.querySelectorAll('.hf-sel .hf-nome')).map(e => e.textContent),
        };
    });
    ok(foraDaLista.nomes[0] === 'Pasta Do Produto',
       'a pasta gravada no produto vira ladrilho mesmo sem estar na lista da estacao', foraDaLista);
    ok(foraDaLista.marcados.join('') === 'Pasta Do Produto',
       'e ja aparece escolhida', foraDaLista);

    // ── 10. Caminho com contrabarra e aspas nao quebra o ladrilho ───────────
    //
    // O caminho vai para dentro de um onclick entre aspas simples. Sem dobrar a
    // contrabarra, "C:\novo" vira quebra de linha dentro do JavaScript e o
    // ladrilho nasce morto -- sem erro nenhum na tela.
    const traicoeiro = await aba.evaluate(() => {
        const p = 'C:\\novo\\tab\\rip d\'agua';
        // Limpa o que o teste anterior deixou no campo escondido, senao aquela
        // pasta continuaria entrando na grade como ladrilho solto.
        document.getElementById('ped-hotfolder-path').value = '';
        window.__semear([{ path: p, nome: 'rip d\'agua', existe: true }]);
        const alvo = document.querySelector('.hf-ladrilho:not(.hf-add)');
        window.__caminhoAntes = _hotFolderPath();
        alvo.click();
        return { escolhido: _hotFolderPath(), esperado: p, nome: alvo.querySelector('.hf-nome').textContent };
    });
    ok(traicoeiro.escolhido === traicoeiro.esperado,
       'caminho com \\n, \\t e aspas simples continua clicavel', traicoeiro);
    ok(traicoeiro.nome === "rip d'agua", 'e o nome sai escapado, sem HTML solto', traicoeiro);

    // ── 11. O layout: os ladrilhos cabem na coluna ──────────────────────────
    const layout = await aba.evaluate(pastas => {
        window.__semear(pastas);
        alternarGrupoDaJanela('jg-hotfolder');
        const g = document.getElementById('ped-hotfolder-grade');
        const col = document.querySelector('.ped-janela-direita');
        const rg = g.getBoundingClientRect();
        const rc = col.getBoundingClientRect();
        const alturas = Array.from(g.querySelectorAll('.hf-ladrilho')).map(e => Math.round(e.getBoundingClientRect().height));
        return {
            larguraGrade: Math.round(rg.width),
            larguraColuna: Math.round(rc.width),
            vazando: Math.round(rg.right) > Math.round(rc.right) + 1,
            alturas,
            linhas: new Set(Array.from(g.querySelectorAll('.hf-ladrilho')).map(e => Math.round(e.getBoundingClientRect().top))).size,
            corpoAberto: document.getElementById('jg-hotfolder-corpo').getBoundingClientRect().height > 0,
        };
    }, PASTAS.concat([
        { path: 'C:\\RIP\\Papel Fotografico Brilhante 260g', nome: 'Papel Fotografico Brilhante 260g', existe: true },
        { path: 'C:\\RIP\\Adesivo', nome: 'Adesivo', existe: true },
    ]));
    ok(layout.corpoAberto, 'o grupo do Hot Folder abre ao ser clicado', layout);
    ok(!layout.vazando, 'a grade nao vaza da coluna das acoes', layout);
    ok(layout.linhas >= 2, 'seis ladrilhos quebram em mais de uma linha, em vez de espremer', layout);
    ok(new Set(layout.alturas).size === 1,
       'nome longo NAO estica o ladrilho — altura variavel embaralharia a grade', layout);

    await navegador.close();

    if (falhas) {
        console.error(`\n${falhas} de ${total} verificacoes FALHARAM.`);
        process.exit(1);
    }
    console.log(`OK: ${total} verificacoes dos ladrilhos do hot folder passaram.`);
})().catch(e => { console.error(e); process.exit(1); });
