import urllib.request
import json

URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7Y'

headers = {
    'apikey': KEY,
    'Authorization': f'Bearer {KEY}',
    'Prefer': 'count=exact'
}

tables = ['producao_formatos', 'producao_saidas', 'producao_cores', 'producao_numeracoes']

print("Contagem do Supabase:")
for t in tables:
    req = urllib.request.Request(f"{URL}/{t}?select=id", headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            count = response.headers.get('Content-Range').split('/')[1]
            print(f"{t}: {count}")
    except Exception as e:
        print(f"Erro em {t}: {e}")
