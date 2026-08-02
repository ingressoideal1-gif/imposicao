import urllib.request, json, re
config = open('frontend/supabase-config.js').read()
apikey = re.search(r'VIBECODE_ANON_KEY = "(.*?)"', config).group(1)
url = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/pedidos_modelos?limit=1'
req = urllib.request.Request(url, headers={'apikey': apikey, 'Authorization': 'Bearer ' + apikey})
res = urllib.request.urlopen(req)
data = json.loads(res.read().decode())
if data:
    print('Columns:', list(data[0].keys()))
else:
    print('No data')
