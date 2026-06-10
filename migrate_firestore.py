import requests

PROJECT_ID = "ideal-arte-e64f6"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

SUPABASE_URL = "https://atsxtuibeitloosckmlc.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0c3h0dWliZWl0bG9vc2NrbWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTUyNTcsImV4cCI6MjA5NjU5MTI1N30.KppPhKh4s9tHLjB73zYzaaazLukwsPS9v4FvIFy5yxM"

supa_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def extract_firestore_value(val):
    if 'stringValue' in val:
        return val['stringValue']
    elif 'integerValue' in val:
        return int(val['integerValue'])
    elif 'doubleValue' in val:
        return float(val['doubleValue'])
    elif 'booleanValue' in val:
        return val['booleanValue']
    elif 'arrayValue' in val:
        return [extract_firestore_value(v) for v in val['arrayValue'].get('values', [])]
    elif 'mapValue' in val:
        return {k: extract_firestore_value(v) for k, v in val['mapValue'].get('fields', {}).items()}
    elif 'nullValue' in val:
        return None
    return str(val)

def fetch_and_migrate(collection):
    print(f"\nMigrando colecao: {collection}")
    res = requests.get(f"{FIRESTORE_URL}/{collection}?pageSize=100")
    if res.status_code != 200:
        print("Erro ao buscar do firestore:", res.text)
        return
    data = res.json()
    documents = data.get('documents', [])
    for doc in documents:
        fields = doc.get('fields', {})
        parsed = {k: extract_firestore_value(v) for k, v in fields.items()}
        # O id no firestore às vezes vem no path ou tem campo id
        if 'id' not in parsed:
            parsed['id'] = doc['name'].split('/')[-1]
            
        # Push to supabase
        supa_res = requests.post(f"{SUPABASE_URL}/rest/v1/{collection}", headers=supa_headers, json=parsed)
        if supa_res.status_code in [200, 201]:
            print(f"OK {collection} -> {parsed.get('name', parsed.get('id'))}")
        else:
            if "duplicate key" in supa_res.text:
                print(f"Update (ja existe) {collection} -> {parsed.get('name', parsed.get('id'))}")
                # Optional: Patch se ja existe
                requests.patch(f"{SUPABASE_URL}/rest/v1/{collection}?id=eq.{parsed['id']}", headers=supa_headers, json=parsed)
            else:
                print(f"Erro ao inserir {collection} {parsed.get('name')}:", supa_res.text)

if __name__ == "__main__":
    for coll in ['formatos', 'saidas', 'numeracoes', 'cores', 'modelos_imposicao']:
        fetch_and_migrate(coll)
