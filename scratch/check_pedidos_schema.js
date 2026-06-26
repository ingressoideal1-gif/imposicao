const url = "https://vwbtitjlpelrcnsytzqw.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o";

async function main() {
    const res = await fetch(`${url}/rest/v1/pedidos?limit=1`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    console.log(data);
}
main();
