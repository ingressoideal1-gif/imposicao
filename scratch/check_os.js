const url = "https://vwbtitjlpelrcnsytzqw.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o";

async function query(endpoint) {
    const res = await fetch(`${url}/rest/v1/${endpoint}`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) {
        return null;
    }
    return res.json();
}

async function main() {
    const tables = ['arquivos', 'anexos', 'arquivos_propostas', 'propostas_arquivos', 'pedidos_anexos', 'arquivos_pedidos', 'galeria', 'uploads'];
    for (const t of tables) {
        const res = await query(`${t}?limit=1`);
        if (res) {
            console.log(`FOUND TABLE: ${t}`);
            if (res.length > 0) console.log(`Keys for ${t}:`, Object.keys(res[0]));
        }
    }
}
main();
