const SUPABASE_URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o';

async function run() {
    let r1 = await fetch(SUPABASE_URL + '/rest/v1/propostas?select=*&limit=1', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let data1 = await r1.json();
    console.log('=== propostas ===');
    if (Array.isArray(data1) && data1.length > 0) {
        console.log('Campos:', Object.keys(data1[0]).join(', '));
    } else {
        console.log('Resposta:', JSON.stringify(data1).substring(0, 500));
    }

    // Ver como pedido 17823 aparece no Vibecode
    let r2 = await fetch(SUPABASE_URL + '/rest/v1/propostas?limit=1&id_int=eq.17823', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let data2 = await r2.json();
    console.log('\n=== propostas 17823 ===');
    console.log('Resposta:', JSON.stringify(data2).substring(0, 500));
}
run().catch(console.error);
