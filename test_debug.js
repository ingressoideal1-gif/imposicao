const SUPABASE_URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o';

async function run() {
    // 1. Verificar link do cliente
    let r1 = await fetch(SUPABASE_URL + '/rest/v1/pedidos_links_cliente?numero_pedido=eq.17823&ativo=eq.true', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let links = await r1.json();
    console.log('=== pedidos_links_cliente ===');
    if (links.length > 0) {
        console.log('os_id:', links[0].os_id);
        console.log('token:', links[0].token);
        console.log('ativo:', links[0].ativo);
    } else {
        console.log('NENHUM LINK ENCONTRADO!');
    }

    // 2. Verificar status da OS na producao_ordens_servico
    if (links.length > 0) {
        const osId = links[0].os_id;
        let r2 = await fetch(SUPABASE_URL + '/rest/v1/producao_ordens_servico?id=eq.' + osId, {
            headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
        });
        let osData = await r2.json();
        console.log('\n=== producao_ordens_servico ===');
        if (osData.length > 0) {
            console.log('status:', osData[0].status);
        } else {
            console.log('NENHUM REGISTRO! (vai usar default ARTE_EM_ANDAMENTO)');
        }

        // 3. Verificar producao_os_itens
        let r3 = await fetch(SUPABASE_URL + '/rest/v1/producao_os_itens?os_id=eq.' + osId, {
            headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
        });
        let prodItems = await r3.json();
        console.log('\n=== producao_os_itens ===');
        console.log('count:', Array.isArray(prodItems) ? prodItems.length : 'ERROR: ' + JSON.stringify(prodItems));

        // 4. Verificar produtos_proposta como fallback
        let r4 = await fetch(SUPABASE_URL + '/rest/v1/produtos_proposta?id_int=eq.17823', {
            headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
        });
        let propItems = await r4.json();
        console.log('\n=== produtos_proposta (fallback) ===');
        console.log('count:', propItems.length);
        propItems.forEach(function(p, i) {
            console.log('  item ' + i + ': id=' + p.id + ', produto=' + p.produto + ', arte_base64=' + (p.amostra_arte_base64 ? 'EXISTS(' + p.amostra_arte_base64.length + ' chars)' : 'NULL'));
        });
    }
}
run().catch(console.error);
