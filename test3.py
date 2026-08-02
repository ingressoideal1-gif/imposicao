import urllib.request, json, re
config = open('frontend/supabase-config.js').read()
apikey = re.search(r'VIBECODE_ANON_KEY = "(.*?)"', config).group(1)
url = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/'
req = urllib.request.Request(url, headers={'apikey': apikey, 'Authorization': 'Bearer ' + apikey})
try:
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode())
    print('OpenAPI paths:', list(data.get('paths', {}).keys()))
except Exception as e:
    print('Error:', e)
