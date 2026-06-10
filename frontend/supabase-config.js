const SUPABASE_URL = "https://atsxtuibeitloosckmlc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0c3h0dWliZWl0bG9vc2NrbWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTUyNTcsImV4cCI6MjA5NjU5MTI1N30.KppPhKh4s9tHLjB73zYzaaazLukwsPS9v4FvIFy5yxM";

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase inicializado com sucesso!");
} else {
    console.error("Biblioteca do Supabase não encontrada no escopo global.");
}

// URL base do backend FastAPI.
// Deixe vazio ("") para desenvolvimento local (mesmo domínio).
// Altere para a URL de produção quando publicar o backend online (ex: "https://ideal-imposition-api.onrender.com").
const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.protocol !== 'file:'
    ? ""
    : "https://ideal-imposition.onrender.com";
