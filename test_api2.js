const VIBECODE_SUPABASE_URL = "https://vwbtitjlpelrcnsytzqw.supabase.co";
const VIBECODE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o";

async function run() {
    const numero = '17823';
    let r2 = await fetch(VIBECODE_SUPABASE_URL + '/rest/v1/produtos_proposta?id_int=eq.' + numero, {
        headers: { 'apikey': VIBECODE_ANON_KEY, 'Authorization': 'Bearer ' + VIBECODE_ANON_KEY }
    });
    let propItems = await r2.json();
    console.log("produtos_proposta count:", propItems.length);
    if (propItems.length > 0) {
        propItems.forEach((p, i) => {
            console.log("Item " + i + ": amostra_arte_base64 =", p.amostra_arte_base64 ? 'EXISTS' : 'NULL');
        });
    }

    let r3 = await fetch(VIBECODE_SUPABASE_URL + '/rest/v1/pedidos_artes?id_int=eq.' + numero, {
        headers: { 'apikey': VIBECODE_ANON_KEY, 'Authorization': 'Bearer ' + VIBECODE_ANON_KEY }
    });
    let artes = await r3.json();
    console.log("pedidos_artes count:", artes.length);
    if (artes.length > 0) {
        artes.forEach((a, i) => {
            console.log("Arte " + i + ": url_arquivo =", a.url_arquivo ? 'EXISTS' : 'NULL');
        });
    }
}
run().catch(console.error);
