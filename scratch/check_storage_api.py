import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

# Tenta com service_role ou anon key para listar e criar bucket
url_base = "https://vwbtitjlpelrcnsytzqw.supabase.co"
anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

# Try GET on storage API to see what error we get
req = urllib.request.Request(
    f"{url_base}/storage/v1/bucket",
    headers={
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json"
    },
    method='GET'
)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print("Response:", json.dumps(data, indent=2)[:2000])
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')
    print(f"HTTP {e.code}: {body[:500]}")
except Exception as e:
    print("Error:", e)
