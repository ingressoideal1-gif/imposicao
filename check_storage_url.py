import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

url_base = "https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}"
}

req = urllib.request.Request(f"{url_base}/pedidos_modelos?id_int=eq.19775&select=amostra_arte_base64,arte_url", headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    for row in data:
        img_url = row.get('amostra_arte_base64') or row.get('arte_url')
        print("Testing URL:", img_url)
        if img_url:
            try:
                img_req = urllib.request.Request(img_url)
                with urllib.request.urlopen(img_req) as img_resp:
                    print("  Status:", img_resp.status, "Content-Length:", len(img_resp.read()))
            except Exception as e:
                print("  Fetch error:", e)

