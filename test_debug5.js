const SUPABASE_URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o';

async function run() {
    // 1. Verificar schema de producao_ordens_servico
    let r1 = await fetch(SUPABASE_URL + '/rest/v1/producao_ordens_servico?limit=1', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let d1 = await r1.json();
    console.log('=== producao_ordens_servico sample ===');
    if (Array.isArray(d1) && d1.length > 0) {
        console.log('Colunas:', Object.keys(d1[0]).join(', '));
        console.log('Exemplo id:', d1[0].id, 'tipo:', typeof d1[0].id);
    } else {
        console.log('Tabela vazia ou erro:', JSON.stringify(d1).substring(0, 200));
    }
    
    // 2. Verificar schema de producao_os_itens  
    let r2 = await fetch(SUPABASE_URL + '/rest/v1/producao_os_itens?limit=1', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let d2 = await r2.json();
    console.log('\n=== producao_os_itens sample ===');
    if (Array.isArray(d2) && d2.length > 0) {
        console.log('Colunas:', Object.keys(d2[0]).join(', '));
        console.log('Exemplo os_id:', d2[0].os_id, 'tipo:', typeof d2[0].os_id);
    } else {
        console.log('Tabela vazia ou erro:', JSON.stringify(d2).substring(0, 200));
    }

    // 3. Tentar inserir em producao_ordens_servico com string id
    let r3 = await fetch(SUPABASE_URL + '/rest/v1/producao_ordens_servico', {
        method: 'POST',
        headers: { 
            'apikey': ANON_KEY, 
            'Authorization': 'Bearer ' + ANON_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({ id: 'vibe_17823', status: 'Enviar ARTE', numero: '17823' })
    });
    let d3 = await r3.json();
    console.log('\n=== INSERT producao_ordens_servico com vibe_17823 ===');
    console.log(JSON.stringify(d3, null, 2));
}
run().catch(console.error);
