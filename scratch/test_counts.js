const { createClient } = require('@supabase/supabase-js');
const url = 'https://vwbtitjlpelrcnsytzqw.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7Y';
const supabase = createClient(url, key);

async function check() {
    const res1 = await supabase.from('producao_formatos').select('id', {count: 'exact'});
    const res2 = await supabase.from('producao_saidas').select('id', {count: 'exact'});
    const res3 = await supabase.from('producao_cores').select('id', {count: 'exact'});
    const res4 = await supabase.from('producao_numeracoes').select('id', {count: 'exact'});
    console.log('Supabase Counts:', res1.count, res2.count, res3.count, res4.count);
}
check();
