import urllib.request
import json

headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"
}

# Count total, count null id_cliente
req_tot = urllib.request.Request("https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/propostas?select=id&limit=1", headers={"Prefer": "count=exact", **headers})
try:
    with urllib.request.urlopen(req_tot) as res_tot:
        total = res_tot.headers.get("Content-Range").split("/")[-1]
        print(f"Total propostas: {total}")
        
    req_null = urllib.request.Request("https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/propostas?id_cliente=is.null&select=id&limit=1", headers={"Prefer": "count=exact", **headers})
    with urllib.request.urlopen(req_null) as res_null:
        null_count = res_null.headers.get("Content-Range").split("/")[-1]
        print(f"Propostas with null id_cliente: {null_count}")
except Exception as e:
    print("Error:", e)
