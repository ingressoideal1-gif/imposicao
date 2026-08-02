import urllib.request, json, re
config = open('frontend/supabase-config.js').read()
apikey = re.search(r'VIBECODE_ANON_KEY = "(.*?)"', config).group(1)
url = 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/bucket'
req = urllib.request.Request(url, headers={'apikey': apikey, 'Authorization': 'Bearer ' + apikey})
try:
    res = urllib.request.urlopen(req)
    buckets = json.loads(res.read().decode())
    print('Buckets:', [b['id'] for b in buckets])
except Exception as e:
    print('Error accessing buckets:', e)
