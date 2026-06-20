const SUPABASE_URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o';

async function run() {
    // Simular exatamente o que initClientePage faz agora
    const numero = '17823';
    const token = 'zi1v27';
    const osId = 'vibe_17823';

    // 1. Validar token (como o front faz)
    let r1 = await fetch(SUPABASE_URL + '/rest/v1/pedidos_links_cliente?numero_pedido=eq.' + numero + '&token=eq.' + token + '&ativo=eq.true', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let linkData = (await r1.json())[0];
    console.log('1. Link encontrado:', !!linkData);
    console.log('   status_arte:', linkData ? linkData.status_arte : 'N/A');

    // 2. Buscar itens de produtos_proposta (como o front faz para vibe_)
    let r2 = await fetch(SUPABASE_URL + '/rest/v1/produtos_proposta?id_int=eq.' + parseInt(numero), {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    let prodData = await r2.json();
    console.log('2. Itens de produtos_proposta:', prodData.length);
    prodData.forEach(function(p, i) {
        console.log('   item ' + i + ': id=' + p.id + ', nome=' + (p.nome_produto || 'N/A') + ', arte=' + (p.amostra_arte_base64 ? 'SIM' : 'NAO'));
    });

    // 3. Verificar se o status seria "Enviar ARTE"
    const isVibeOS = osId.startsWith('vibe_');
    console.log('3. isVibeOS:', isVibeOS);
    console.log('   Status final que o switch vai usar:', linkData ? linkData.status_arte : 'ARTE_EM_ANDAMENTO');
    console.log('   Vai renderizar janelas?', (linkData && linkData.status_arte === 'Enviar ARTE') ? 'SIM!' : 'NAO');
}
run().catch(console.error);
