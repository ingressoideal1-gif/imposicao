import os, json
from supabase import create_client
url = 'https://vwbtitjlpelrcnsytzqw.supabase.co'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o'
client = create_client(url, key)
res = client.table('producao_mapas_teatro').select('*').order('created_at', desc=True).execute()
for m in res.data:
    print(f"Mapa: {m['name']} id={m['id']}")
