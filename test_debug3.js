const SUPABASE_URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o';

async function run() {
    // Listar TODAS as colunas da tabela propostas
    let r1 = await fetch(SUPABASE_URL + '/rest/v1/propostas?id_int=eq.17823&select=*', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let data1 = await r1.json();
    console.log('=== propostas colunas ===');
    if (data1.length > 0) {
        console.log('Campos:', Object.keys(data1[0]).join(', '));
        // Mostrar campos que parecem ter status
        Object.keys(data1[0]).forEach(function(k) {
            if (k.toLowerCase().includes('status') || k.toLowerCase().includes('arte') || k.toLowerCase().includes('etapa')) {
                console.log('  ' + k + ':', data1[0][k]);
            }
        });
    }
}
run().catch(console.error);
