import os, json
from supabase import create_client

url = "https://vwbtitjlpelrcnsytzqw.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

client = create_client(url, key)
res = client.table('producao_mapas_teatro').select('*').limit(5).execute()

if res.data:
    for mapa in res.data:
        print(f"\n--- Mapa: {mapa.get('name')} ---")
        config = mapa.get("config", {})
        if "setores" in config:
            print("Num setores:", len(config["setores"]))
            for s_idx, setor in enumerate(config["setores"]):
                cadeiras = setor.get("cadeiras", {})
                print(f"  Setor {s_idx} ({setor.get('nome')}): {len(cadeiras)} cadeiras")
                if len(cadeiras) > 0:
                    c1 = list(cadeiras.values())[0]
                    c2 = list(cadeiras.values())[-1]
                    print(f"    Primeira: {json.dumps(c1)}")
                    print(f"    Última:   {json.dumps(c2)}")
        else:
            print("  Sem setores na config")
else:
    print("Nenhum mapa encontrado")
