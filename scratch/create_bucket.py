import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

url_base = "https://vwbtitjlpelrcnsytzqw.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

# Verificar se bucket ja existe
req = urllib.request.Request(
    f"{url_base}/storage/v1/bucket",
    headers=headers,
    method='GET'
)
try:
    with urllib.request.urlopen(req) as resp:
        buckets = json.loads(resp.read().decode('utf-8'))
        existing = [b['name'] for b in buckets]
        print("Buckets existentes:", existing)
        if 'app-imagens' in existing:
            print("Bucket 'app-imagens' JA EXISTE!")
        else:
            print("Bucket 'app-imagens' NAO encontrado. Criando...")
            # Criar bucket publico
            body = json.dumps({"id": "app-imagens", "name": "app-imagens", "public": True}).encode()
            create_req = urllib.request.Request(
                f"{url_base}/storage/v1/bucket",
                data=body,
                headers=headers,
                method='POST'
            )
            with urllib.request.urlopen(create_req) as cr:
                result = json.loads(cr.read().decode('utf-8'))
                print("Bucket criado:", result)
except Exception as e:
    print("Erro:", e)
