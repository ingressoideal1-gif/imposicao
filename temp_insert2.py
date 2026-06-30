import os, json
from supabase import create_client
url = 'https://vwbtitjlpelrcnsytzqw.supabase.co'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o'
client = create_client(url, key)
try:
    res = client.table('producao_mapas_teatro').insert([{
        'name': 'Mapa Teste',
        'config': {}
    }]).execute()
    print("Sucesso!")
    print(res)
except Exception as e:
    print(f"Erro: {e}")
