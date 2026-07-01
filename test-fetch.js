const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition/.env', 'utf-8');
let url = '', key = '';
envContent.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});

const supabase = createClient(url, key);

async function run() {
    const { data, error } = await supabase.from('pedidos_modelos').select('*').eq('id_int', 18360);
    console.log(JSON.stringify(data, null, 2));
}

run();
