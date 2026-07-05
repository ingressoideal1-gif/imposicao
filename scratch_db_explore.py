import urllib.request
import json

headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"
}

# Fetch proposals where id_cliente is null and see if id_faturado is populated
req = urllib.request.Request("https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/propostas?id_cliente=is.null&select=id_int,cliente,id_cliente,id_faturado", headers=headers)
try:
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode('utf-8'))
        print("Propostas where id_cliente is null:")
        for r in data:
            print(f"  id_int: {r.get('id_int')} | cliente: {r.get('cliente')} | id_cliente: {r.get('id_cliente')} | id_faturado: {r.get('id_faturado')}")
except Exception as e:
    print("Error:", e)
