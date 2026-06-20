const SUPABASE_URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o';

async function run() {
    // Tentar atualizar o campo status_arte na pedidos_links_cliente
    // Se a coluna nao existir, criar via RPC ou teremos que adicionar
    let r1 = await fetch(SUPABASE_URL + '/rest/v1/pedidos_links_cliente?id=eq.50ccb3cf-3502-4991-9e34-395a7fa4c9ee', {
        method: 'PATCH',
        headers: { 
            'apikey': ANON_KEY, 
            'Authorization': 'Bearer ' + ANON_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({ status_arte: 'Enviar ARTE' })
    });
    let d1 = await r1.json();
    console.log('=== UPDATE pedidos_links_cliente com status_arte ===');
    console.log(JSON.stringify(d1, null, 2));
}
run().catch(console.error);
