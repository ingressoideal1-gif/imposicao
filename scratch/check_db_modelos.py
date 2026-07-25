import urllib.request
import json

url = "https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/produtos_proposta?id_int=eq.18570&select=*"
anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

headers = {
    "apikey": anon_key,
    "Authorization": f"Bearer {anon_key}",
    "Content-Type": "application/json"
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        data = json.loads(html)
        print("PRODUTOS PROPOSTA 18636:")
        for idx, item in enumerate(data):
            print(f"Produto {idx+1}:")
            print(f"  id: {item.get('id')}")
            print(f"  nome_produto: {item.get('nome_produto')}")
            print(f"  qtd: {item.get('qtd')}")
            print(f"  quantidade: {item.get('quantidade')}")
except Exception as e:
    print("Erro ao acessar API:", e)
