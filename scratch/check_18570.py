import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o'
BASE = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1'

def get(path):
    req = urllib.request.Request(BASE + path, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

print('=== pedidos_modelos para id_int=18570 ===')
rows = get('/pedidos_modelos?id_int=eq.18570&select=id,id_int,nome_modelo,amostra_cor_id,amostra_num_id,amostra_arte_base64,arte_url,verso_arte_url,status_arte,ordem')
print(f'Registros: {len(rows)}')
for row in rows:
    print(f'\n  id: {row.get("id")}')
    print(f'  nome_modelo: {row.get("nome_modelo")}')
    print(f'  amostra_cor_id: {row.get("amostra_cor_id")}')
    print(f'  amostra_num_id: {row.get("amostra_num_id")}')
    print(f'  amostra_arte_base64: {str(row.get("amostra_arte_base64") or "NULL")[:100]}')
    print(f'  arte_url: {str(row.get("arte_url") or "NULL")[:100]}')
    print(f'  verso_arte_url: {str(row.get("verso_arte_url") or "NULL")[:80]}')
    print(f'  status_arte: {row.get("status_arte")}')

print('\n=== pedidos_links_cliente para os_id=vibe_18570 ===')
links = get('/pedidos_links_cliente?os_id=eq.vibe_18570&select=*')
print(f'Registros: {len(links)}')
for l in links:
    print(f'  os_id: {l.get("os_id")}, token: {l.get("token")}, status_arte: {l.get("status_arte")}')
