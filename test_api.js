const VIBECODE_SUPABASE_URL = "https://vwbtitjlpelrcnsytzqw.supabase.co";
const VIBECODE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o";

async function run() {
    const osId = 'vibe_17823';
    const numero = '17823';
    
    // 1. producao_os_itens
    let r1 = await fetch(VIBECODE_SUPABASE_URL + '/rest/v1/producao_os_itens?os_id=eq.' + osId, {
        headers: { 'apikey': VIBECODE_ANON_KEY, 'Authorization': 'Bearer ' + VIBECODE_ANON_KEY }
    });
    let prodItems = await r1.json();
    console.log("producao_os_itens count:", prodItems.length);
    if (prodItems.length > 0) {
        console.log("First prodItem amostra_arte_base64 exists?", !!prodItems[0].amostra_arte_base64);
        console.log("First prodItem nome_arquivo_arte exists?", !!prodItems[0].nome_arquivo_arte);
    }
    
    // 2. produtos_proposta
    let r2 = await fetch(VIBECODE_SUPABASE_URL + '/rest/v1/produtos_proposta?id_int=eq.' + numero, {
        headers: { 'apikey': VIBECODE_ANON_KEY, 'Authorization': 'Bearer ' + VIBECODE_ANON_KEY }
    });
    let propItems = await r2.json();
    console.log("produtos_proposta count:", propItems.length);

    // 3. pedidos_artes
    let r3 = await fetch(VIBECODE_SUPABASE_URL + '/rest/v1/pedidos_artes?id_int=eq.' + numero, {
        headers: { 'apikey': VIBECODE_ANON_KEY, 'Authorization': 'Bearer ' + VIBECODE_ANON_KEY }
    });
    let artes = await r3.json();
    console.log("pedidos_artes count:", artes.length);
    if (artes.length > 0) {
        console.log("First arte url_arquivo:", artes[0].url_arquivo);
        console.log("First arte nome_arquivo:", artes[0].nome_arquivo);
    }
}
run().catch(console.error);
