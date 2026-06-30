import os, json
from supabase import create_client

url = "https://vwbtitjlpelrcnsytzqw.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

client = create_client(url, key)
res = client.table('producao_mapas_teatro').select('*').limit(1).execute()
mapa = res.data[0]
config = mapa.get("config", {})
cadeiras = config["setores"][0].get("cadeiras", {})
assentos = list(cadeiras.values())

assentos.sort(key=lambda a: (
    float(a.get("y", 0)) if "y" in a else a.get("prefixo", ""),
    float(a.get("x", 0)) if "x" in a else float(a.get("num", 0))
))

print("Total:", len(assentos))
for i, a in enumerate(assentos[:10]):
    print(f"{i}: prefixo={a.get('prefixo')} num={a.get('num')} x={a.get('x')} y={a.get('y')} tipo={a.get('tipo')} erased={a.get('isErased')}")
