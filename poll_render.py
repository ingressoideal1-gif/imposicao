import urllib.request, time

start = time.time()
while time.time() - start < 300:
    try:
        res = urllib.request.urlopen('https://ideal-imposition.onrender.com/api/diag')
        if res.status == 200:
            print('Render is UP with new code!')
            break
    except Exception as e:
        print("Waiting...", e)
    time.sleep(5)
