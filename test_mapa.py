import os, json
from supabase import create_client

url = "https://vwbtitjlpelrcnsytzqw.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

client = create_client(url, key)
res = client.table('producao_mapas_teatro').select('*').limit(1).execute()

if res.data:
    mapa = res.data[0]
    print("Mapa encontrado:", mapa.get("name"))
    config = mapa.get("config", {})
    if "setores" in config:
        print("Num setores:", len(config["setores"]))
        if len(config["setores"]) > 0:
            cadeiras = config["setores"][0].get("cadeiras", {})
            print("Cadeiras do setor 0:", len(cadeiras))
            if len(cadeiras) > 0:
                print("Primeira cadeira:", json.dumps(list(cadeiras.values())[0]))
else:
    print("Nenhum mapa encontrado")
