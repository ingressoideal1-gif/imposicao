import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

url_base = "https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}"
}

for num in [19775, 18560]:
    print(f"\n=================== PEDIDO #{num} ===================")
    
    # 1. Check pedidos_artes
    req = urllib.request.Request(f"{url_base}/pedidos_artes?id_int=eq.{num}", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"--- pedidos_artes ({len(data)} rows) ---")
            for r in data:
                print("keys:", list(r.keys()))
                for k in ['url_arquivo', 'url', 'amostra_arte_base64', 'arq_link', 'arq_final_link']:
                    if k in r and r[k]:
                        print(f"  {k}: {str(r[k])[:80]}...")
    except Exception as e:
        print("pedidos_artes err:", e)

    # 2. Check pedidos_modelos
    req = urllib.request.Request(f"{url_base}/pedidos_modelos?id_int=eq.{num}", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"--- pedidos_modelos ({len(data)} rows) ---")
            for r in data:
                print("keys:", list(r.keys()))
                for k in ['amostra_arte_base64', 'arte_url', 'pdf_url', 'verso_amostra_arte_base64', 'ordem', 'modelo', 'modelo_nome']:
                    if k in r:
                        val = str(r[k]) if r[k] else 'NULL/EMPTY'
                        print(f"  {k}: {val[:80]}")
    except Exception as e:
        print("pedidos_modelos err:", e)

    # 3. Check produtos_proposta
    req = urllib.request.Request(f"{url_base}/produtos_proposta?id_int=eq.{num}", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"--- produtos_proposta ({len(data)} rows) ---")
            for r in data:
                for k in ['amostra_arte_base64', 'arte_url', 'pdf_url', 'nome_produto']:
                    if k in r:
                        val = str(r[k]) if r[k] else 'NULL/EMPTY'
                        print(f"  {k}: {val[:80]}")
    except Exception as e:
        print("produtos_proposta err:", e)

