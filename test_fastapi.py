import asyncio
from fastapi import FastAPI, Request, File, UploadFile
from fastapi.testclient import TestClient

app = FastAPI()

@app.post('/test')
async def test(request: Request, f1: UploadFile = File(...)):
    form = await request.form()
    # verify if we can access other files from form
    return {'f1': f1.filename, 'keys': list(form.keys()), 'f2': form.get('f2').filename}

client = TestClient(app)
print(client.post('/test', files={'f1': ('f1.txt', b'abc'), 'f2': ('f2.txt', b'def')}).json())
