const url = "https://vwbtitjlpelrcnsytzqw.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o";

async function main() {
    const res = await fetch(`${url}/rest/v1/pedidos_artes?limit=1`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) {
        console.log("pedidos_artes failed", await res.text());
        return;
    }
    const data = await res.json();
    if (data.length > 0) {
        console.log("Keys in pedidos_artes:", Object.keys(data[0]));
        console.log("Sample:", data[0]);
    } else {
        console.log("Table empty");
    }
}
main();
