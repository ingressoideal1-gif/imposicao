const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'frontend/.env' });
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

async function check() {
    const tables = ['eventos', 'orcamentos', 'pedidos_arquivos', 'arquivos', 'producao_os'];
    for (const t of tables) {
        const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
            headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
        });
        if (res.ok) {
            const data = await res.json();
            const keys = data.length > 0 ? Object.keys(data[0]) : 'Empty';
            console.log(`Table ${t}: ${keys}`);
        } else {
            console.log(`Table ${t} erro: ${res.status} ${await res.text()}`);
        }
    }
}
check();
