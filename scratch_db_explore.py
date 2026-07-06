import urllib.request
import json

headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"
}

# Fetch products where id_formato is not null or id_gabarito is not null
req = urllib.request.Request("https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/produtos?select=id,id_produto,nomeReal,formato,id_formato,id_gabarito&limit=20", headers=headers)
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode('utf-8'))
        print("Products with format values:")
        for r in data:
            if r.get('id_formato') or r.get('id_gabarito') or r.get('formato'):
                print(f"  id: {r.get('id')} | nomeReal: {r.get('nomeReal')} | formato: {r.get('formato')} | id_formato: {r.get('id_formato')} | id_gabarito: {r.get('id_gabarito')}")
except Exception as e:
    print("Error:", e)
