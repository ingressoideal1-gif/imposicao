const SUPABASE_URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o';

async function run() {
    // Verificar campo status na tabela propostas para pedido 17823
    let r1 = await fetch(SUPABASE_URL + '/rest/v1/propostas?id_int=eq.17823&select=id_int,status,status_arte', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let data1 = await r1.json();
    console.log('=== propostas ===');
    console.log(JSON.stringify(data1, null, 2));

    // Verificar tabela pedidos_links_cliente mais detalhes
    let r2 = await fetch(SUPABASE_URL + '/rest/v1/pedidos_links_cliente?numero_pedido=eq.17823&select=*', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let data2 = await r2.json();
    console.log('\n=== pedidos_links_cliente ===');
    console.log(JSON.stringify(data2, null, 2));
}
run().catch(console.error);
