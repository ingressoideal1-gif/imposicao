import json
import requests

SUPABASE_URL = "https://atsxtuibeitloosckmlc.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0c3h0dWliZWl0bG9vc2NrbWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTUyNTcsImV4cCI6MjA5NjU5MTI1N30.KppPhKh4s9tHLjB73zYzaaazLukwsPS9v4FvIFy5yxM"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def migrate():
    with open('formats_db.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Formatos
    if 'formatos' in data:
        print("Migrando formatos...")
        for item in data['formatos']:
            res = requests.post(f"{SUPABASE_URL}/rest/v1/formatos", headers=headers, json=item)
            if res.status_code in [200, 201]:
                print(f"OK Formato {item.get('name')} inserido.")
            else:
                print(f"Erro formato {item.get('name')}:", res.text)
                
    # Saidas
    if 'saidas' in data:
        print("\nMigrando saídas...")
        for item in data['saidas']:
            res = requests.post(f"{SUPABASE_URL}/rest/v1/saidas", headers=headers, json=item)
            if res.status_code in [200, 201]:
                print(f"OK Saída {item.get('name')} inserida.")
            else:
                print(f"Erro saída {item.get('name')}:", res.text)
                
    # Numerações
    if 'numeracoes' in data:
        print("\nMigrando numerações...")
        for item in data['numeracoes']:
            res = requests.post(f"{SUPABASE_URL}/rest/v1/numeracoes", headers=headers, json=item)
            if res.status_code in [200, 201]:
                print(f"OK Numeração {item.get('name')} inserida.")
            else:
                print(f"Erro numeração {item.get('name')}:", res.text)

if __name__ == '__main__':
    migrate()
