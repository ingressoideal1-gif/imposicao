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
