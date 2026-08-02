import urllib.request, json, re
config = open('frontend/supabase-config.js').read()
apikey = re.search(r'VIBECODE_ANON_KEY = "(.*?)"', config).group(1)
url = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/fontes?limit=1'
req = urllib.request.Request(url, headers={'apikey': apikey, 'Authorization': 'Bearer ' + apikey})
try:
    res = urllib.request.urlopen(req)
    print('Found fontes table:', json.loads(res.read().decode()))
except Exception as e:
    print('Error accessing fontes:', e)
