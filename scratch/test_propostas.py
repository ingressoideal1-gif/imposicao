import urllib.request
import json

URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7Y'

headers = {
    'apikey': KEY,
    'Authorization': f'Bearer {KEY}'
}

req = urllib.request.Request(f"{URL}/propostas?select=*&limit=2", headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
