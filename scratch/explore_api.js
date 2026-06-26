const url = "https://vwbtitjlpelrcnsytzqw.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o";

async function query(endpoint) {
    const res = await fetch(`${url}/rest/v1/${endpoint}`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) {
        console.log(`Error ${endpoint}: ${res.status}`);
        return null;
    }
    return res.json();
}

async function main() {
    // Pegar OS 17823 para ver a estrutura
    const osData = await query('producao_os?id=eq.17823&limit=1');
    console.log("OS:", osData);

    const orc_id = osData[0].orcamento_id;
    console.log("Orcamento ID:", orc_id);

    // Pegar orçamento
    const orc = await query(`orcamentos?id=eq.${orc_id}&limit=1`);
    console.log("Orcamento:", orc);

    // Evento ID
    const evento_id = orc[0].evento_id;
    console.log("Evento ID:", evento_id);

    const evento = await query(`eventos?id=eq.${evento_id}&limit=1`);
    console.log("Evento keys:", Object.keys(evento[0]));
    console.log("Evento briefing fields?", evento[0].briefing, evento[0].observacoes);
    
    // Arquivos
    const arq = await query(`pedidos_arquivos?pedido_id=eq.${orc_id}&limit=5`);
    if(arq) console.log("Pedidos_arquivos:", arq);
    
    const arq2 = await query(`arquivos?evento_id=eq.${evento_id}&limit=5`);
    if(arq2) console.log("Arquivos (evento):", arq2);
}
main();
