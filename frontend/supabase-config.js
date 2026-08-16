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

// URL base do backend FastAPI.
// Deixe vazio ("") para desenvolvimento local (mesmo domínio).
// Altere para a URL de produção quando publicar o backend online (ex: "https://imposicao.onrender.com").
const isPort9000 = window.location.port === "9000";
const API_BASE_URL = (isLocalhost || isPort9000) && window.location.protocol !== 'file:'
    ? ""
    : "https://imposicao.onrender.com";

// O motor da NUVEM, sempre — mesmo quando a página é servida pela estação.
//
// Duas coisas só a nuvem faz: gravar permissões e gravar acessos locais. As duas
// tabelas ganharam RLS em 16/08/2026, e escrever nelas exige a chave de serviço
// do banco — que NÃO vai para as estações, por decisão registrada em
// `acesso_api.py`: ela abre cliente, proposta e financeiro do parceiro.
//
// Sem isto, o administrador que abrisse o Menu Usuários pelo painel da estação
// receberia 503 num botão que sempre funcionou.
const API_NUVEM = "https://imposicao.onrender.com";

// ─── Toda chamada ao motor leva a sessão junto ───────────────────────────────
//
// Até 16/08/2026 nenhuma chamada do painel se identificava, e o motor não pedia
// nada: qualquer um, de qualquer lugar, lia os códigos de acesso local e a grade
// de permissões de `imposicao.onrender.com`, e podia escrever nelas. O conserto
// do lado do servidor está em `app.py` (`precisa_de_sessao`); este é o outro
// lado dele.
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
// 2. O agente local (127.0.0.1:9000) não recebe cabeçalho, e nem precisa: ele
//    vive na LAN da gráfica, atrás da trava do código local, e o operador que
//    entrou offline não tem sessão nenhuma do Supabase para oferecer.
(function () {
    const fetchOriginal = window.fetch.bind(window);

    function eDoNossoMotor(url) {
        const u = String(url || '');
        if (u.includes('supabase.co')) return false;
        if (!u.includes('/api/')) return false;
        if (/^https?:\/\//i.test(u)) {
            // `API_NUVEM` entra aqui de propósito: quando a página é servida
            // pela estação, `API_BASE_URL` é vazio, e sem esta linha a chamada
            // que vai à nuvem por obrigação (permissões, acessos locais) sairia
            // sem sessão e levaria 401.
            if (u.startsWith(API_NUVEM)) return true;
            return API_BASE_URL !== '' && u.startsWith(API_BASE_URL);
        }
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
