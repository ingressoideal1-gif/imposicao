import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')
url = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/pedidos_modelos?id_int=eq.19775&select=id,id_int,nome_modelo,amostra_arte_base64,arte_url,status_arte,ordem'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o'
req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read().decode())
    print('Modelos encontrados:', len(data))
    for row in data:
        print('  nome_modelo:', row.get('nome_modelo'))
        aab = str(row.get('amostra_arte_base64') or '')
        au = str(row.get('arte_url') or '')
        print('  amostra_arte_base64:', aab[:100])
        print('  arte_url:', au[:100])
        print('  status_arte:', row.get('status_arte'))
        print()
