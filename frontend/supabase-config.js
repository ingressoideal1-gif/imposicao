// Supabase do Vibecode (ERP parceiro — Banco Único do Ecossistema)
const VIBECODE_SUPABASE_URL = "https://vwbtitjlpelrcnsytzqw.supabase.co";
const VIBECODE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o";

let supabaseClient = null;
let vibeClient = null;

const urlParams = new URLSearchParams(window.location.search);
const forceOffline = urlParams.get('offline') === 'true' || urlParams.get('local') === 'true';
const offlineModeSaved = localStorage.getItem('offline_mode') === 'true';
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "0.0.0.0";

if (typeof supabase !== 'undefined' && !forceOffline && !offlineModeSaved) {
    // Aponta o client padrão do Imposition e do Vibecode para o mesmo banco do parceiro
    supabaseClient = supabase.createClient(VIBECODE_SUPABASE_URL, VIBECODE_ANON_KEY);
    vibeClient = supabaseClient; // alias para manter compatibilidade com códigos novos
    console.log("Supabase Vibecode (Banco Único) inicializado com sucesso!");
} else {
    console.log("Operando em modo 100% local/offline (sem Supabase).");
}

// QUEM SERVIU ESTA PÁGINA — a estação da gráfica, ou a nuvem.
//
// É a pergunta que decide o destino de meia dúzia de chamadas mais abaixo
// (`urlDoProxy`, `lerCatalogoDeFontes`, `urlDeEscritaDeFontes`), e ela não tem
// nada a ver com endereço de servidor: sai de `window.location`, na hora.
//
// A estação serve o painel pela porta 9000 (o agente) ou pela 8080 (o motor em
// desenvolvimento). `file:` fica de fora porque abrir o HTML pelo disco não é
// estação nenhuma — é uma página sem servidor atrás.
const isPort9000 = window.location.port === "9000";
const SERVIDA_PELA_NUVEM = !((isLocalhost || isPort9000)
    && window.location.protocol !== 'file:');

// URL base do motor da ESTAÇÃO, e só dela.
//
// Vazio SEMPRE, desde 17/08/2026. `${API_BASE_URL}/api/...` sai como caminho
// relativo, e caminho relativo chega a quem serviu a página: na estação, o
// agente na 9000, que responde do disco e sem rede. É a razão de o agente
// existir — o operador está de pé na frente da impressora.
//
// Fora da estação essas mesmas chamadas não chegam a lugar nenhum, e isso é o
// desenho, não um descuido. Até 16/08/2026 elas caíam num servidor Python que
// ficava na nuvem; ele saiu, e o usuário fechou o assunto: "impressão só pode
// acontecer pela estação da gráfica". Quem abre o painel abre por
// `http://localhost:9000`.
//
// A constante continua existindo em vez de sumir porque há dezenas de pontos de
// chamada montando `${API_BASE_URL}/api/...`, e o nome diz a qual motor eles
// falam. Trocá-la por um endereço de nuvem é o que NÃO pode voltar a acontecer.
const API_BASE_URL = "";

// As rotas sensíveis do painel — SEMPRE aqui, mesmo na estação.
//
// `/api/user/permissions` e `/api/acessos-locais` mexem nas duas tabelas que
// ganharam RLS em 16/08/2026: escrever nelas exige a chave de serviço do banco,
// que NÃO vai para as estações, por decisão registrada em `acesso_api.py` — ela
// abre cliente, proposta e financeiro do parceiro. Por isso estas duas são a
// exceção à regra do `API_BASE_URL`: o administrador que abre o Menu Usuários
// pelo painel da estação sai desta máquina, de propósito.
//
// O caminho depois da base é o MESMO de antes — a função aceita o prefixo
// `api/` de propósito —, então o corte foi uma troca de base e nada mais.
//
// A função corrige uma coisa que o servidor Python não corrigia: lá, qualquer
// sessão válida gravava na grade de permissões, e "qualquer sessão" inclui todo
// cliente do ERP parceiro, porque a conta é a mesma. Aqui, mexer na grade de
// outra pessoa exige o módulo Usuários, e o primeiro acesso é escrito pelo
// servidor.
const API_PAINEL = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/painel";

// O proxy de arquivos, para quando o `fetch` direto não serve.
const API_ARQUIVO = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/arquivo";

/**
 * O endereço do proxy para buscar um PDF ou imagem.
 *
 * ## Por que existe uma função em vez de uma constante
 *
 * Porque a resposta certa depende de QUEM está servindo a página, e há cinco
 * lugares que perguntam:
 *
 *   - servida pela ESTAÇÃO → o agente local, sempre. Ele tem o arquivo em cache
 *     no disco e responde sem rede. Mandar a estação à nuvem para buscar um PDF
 *     que está do lado dela seria trocar disco por internet no caminho de quem
 *     espera na frente da impressora.
 *   - servida pela NUVEM → a Edge Function, ao lado do banco.
 *
 * Antes daqui, três dos cinco pontos usavam `/api/proxy` relativo — o que na
 * Vercel dependia de um desvio no `vercel.json` para o servidor Python que
 * ficava na nuvem. O desvio saiu em 17/08/2026, junto com o servidor.
 */
function urlDoProxy(endereco) {
    const base = SERVIDA_PELA_NUVEM ? API_ARQUIVO : '';
    return `${base}/api/proxy?url=${encodeURIComponent(endereco)}`;
}

/**
 * O catálogo de fontes compartilhado.
 *
 * ## Dois caminhos, e o motivo de cada um
 *
 * **Servida pela estação** → o agente local, que responde do DISCO e sem rede.
 * Ler o catálogo é passo obrigatório de toda imposição, e o operador está de pé
 * na frente da impressora: pôr a internet nesse caminho é o oposto da razão de
 * o agente existir.
 *
 * **Servida pela nuvem** → a tabela, direto. Ler `catalogo_fontes` com a chave
 * pública é permitido DE PROPÓSITO — é a única das quatro tabelas nossas que
 * continua aberta à leitura depois de 16/08/2026, porque `cliente.html` não tem
 * login e precisa das fontes para desenhar a arte que o cliente vai aprovar.
 * Nome de fonte e URL de Storage não são segredo; o que fechou naquele dia foi
 * a ESCRITA (`sql/fontes_so_escrevem_pelas_funcoes.sql`).
 *
 * Antes daqui esse caminho passava pelo servidor Python que ficava na nuvem, e
 * ele fazia exatamente esta consulta e devolvia o mesmo JSON — uma travessia a
 * mais por nada.
 */
async function lerCatalogoDeFontes() {
    if (SERVIDA_PELA_NUVEM && supabaseClient) {
        const { data, error } = await supabaseClient
            .from('catalogo_fontes').select('*').order('nome', { ascending: true });
        if (error) throw error;
        return data || [];
    }
    // Estação, desenvolvimento, ou modo offline: quem responde é o `/api/fontes`
    // de quem serviu a página.
    const res = await fetch(`${API_BASE_URL}/api/fontes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) || [];
}

/**
 * Onde se ESCREVE no catálogo de fontes.
 *
 * Na nuvem, a Edge Function `painel`, que exige sessão. Na estação, o agente —
 * que desde 16/08/2026 repassa à Edge Function `acesso-estacao` com o segredo
 * dele (`db._catalogo_pela_funcao`). Os dois acabam na mesma função de gravação
 * do lado do banco, e é por isso que a regra de duplicata vale igual nos dois.
 */
function urlDeEscritaDeFontes(sufixo) {
    const base = SERVIDA_PELA_NUVEM ? API_PAINEL : '';
    return `${base}/api/fontes${sufixo || ''}`;
}

// ─── Toda chamada ao motor leva a sessão junto ───────────────────────────────
//
// Até 16/08/2026 nenhuma chamada do painel se identificava, e o motor não pedia
// nada: qualquer um, de qualquer lugar, lia os códigos de acesso local e a grade
// de permissões do servidor Python que ficava na nuvem, e podia escrever nelas.
// O conserto do lado do servidor está em `app.py` (`precisa_de_sessao`), que
// hoje só roda na estação; este é o outro lado dele.
//
// ## Por que aqui, e não em cada chamada
//
// São dezenas de pontos de chamada espalhados por `script.js`, `mapas.js`,
// `pedido.js`, `criador-arte.js`. Cada um deles seria uma chance de esquecer — e
// o esquecimento não apareceria como erro na tela de quem escreveu, só como um
// 401 na tela de outra pessoa, depois. Um lugar só, no arquivo que TODA página
// carrega antes das outras, não tem como ser esquecido.
//
// ## As duas armadilhas
//
// 1. `supabase.co` sai fora ANTES de qualquer coisa. O próprio SDK do Supabase
//    usa `fetch` para renovar a sessão; sem este corte, pedir a sessão dentro do
//    `fetch` chamaria `fetch` de novo, para sempre.
// 2. URL ABSOLUTA do agente local (http://127.0.0.1:9000/...) não recebe
//    cabeçalho, e nem precisa: ele vive na LAN da gráfica, atrás da trava do
//    código local, e o operador que entrou offline não tem sessão nenhuma do
//    Supabase para oferecer. Já o caminho RELATIVO (`${API_BASE_URL}/api/...`,
//    que na estação também leva ao agente) recebe — é o ramo `return true`
//    logo abaixo, e é o mesmo caminho que na nuvem levaria a uma rota nossa.
(function () {
    const fetchOriginal = window.fetch.bind(window);

    function eDoNossoMotor(url) {
        const u = String(url || '');
        // A Edge Function do painel vem ANTES do corte de `supabase.co`, e a
        // ordem é o ponto: ela mora em `supabase.co` e mesmo assim precisa da
        // sessão — é justamente com ela que a função decide quem é você. O corte
        // logo abaixo existe contra RECURSÃO (o SDK usa `fetch` para renovar a
        // sessão), e o `/auth/v1/` que ele protege nunca casa com este prefixo.
        if (u.startsWith(API_PAINEL)) return true;
        if (u.includes('supabase.co')) return false;
        if (!u.includes('/api/')) return false;
        // Endereço ABSOLUTO que não é a função do painel não é nosso motor.
        //
        // Sobrou um caso só, e ele é o do agente: `http://127.0.0.1:9000/api/…`.
        // Ele não recebe cabeçalho, e nem precisa — vive na LAN da gráfica,
        // atrás da trava do código local, e o operador que entrou offline não
        // tem sessão nenhuma do Supabase para oferecer.
        //
        // Até 17/08/2026 havia aqui um terceiro ramo, para o servidor Python
        // que ficava na nuvem. Saiu junto com o servidor.
        if (/^https?:\/\//i.test(u)) return false;
        // Caminho RELATIVO: quem serviu a página é quem responde. Na estação,
        // o agente — e é assim que `${API_BASE_URL}/api/…` chega nele.
        return u.indexOf('/api/') === 0;
    }

    window.fetch = function (entrada, opcoes) {
        // `Request` como primeiro argumento é raro no painel e mesclar
        // cabeçalhos nele daria uma cópia sutilmente diferente. Deixa passar.
        const url = (typeof entrada === 'string') ? entrada : null;
        if (!url || !supabaseClient || !eDoNossoMotor(url)) {
            return fetchOriginal(entrada, opcoes);
        }
        return supabaseClient.auth.getSession().then(function (r) {
            const token = r && r.data && r.data.session && r.data.session.access_token;
            if (!token) return fetchOriginal(entrada, opcoes);
            const novas = Object.assign({}, opcoes || {});
            const cabecalhos = new Headers((opcoes && opcoes.headers) || {});
            // Quem já mandou o seu não é sobrescrito: o QR do Pedido e o Ideal
            // Control montam o cabeçalho na mão, e o deles é o certo.
            if (!cabecalhos.has('Authorization')) {
                cabecalhos.set('Authorization', 'Bearer ' + token);
            }
            novas.headers = cabecalhos;
            return fetchOriginal(entrada, novas);
        }).catch(function () {
            // Falhar ao ler a sessão não pode impedir a chamada: sem sessão o
            // motor recusa com 401, que é uma mensagem que a tela sabe mostrar.
            return fetchOriginal(entrada, opcoes);
        });
    };
})();
