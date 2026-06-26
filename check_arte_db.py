import requests, json
url = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/produtos_proposta?select=id,id_int,amostra_arte_base64&limit=10&order=updated_at.desc'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o'
}
r = requests.get(url, headers=headers)
print('Status:', r.status_code)
try:
    data = r.json()
    for row in data:
        base64_val = row.get('amostra_arte_base64')
        has_art = bool(base64_val and len(base64_val) > 10)
        print(f"ID: {row['id']} - OS: {row.get('id_int')} - Tem Arte? {has_art} - Length: {len(base64_val) if base64_val else 0}")
except Exception as e:
    print(e)
