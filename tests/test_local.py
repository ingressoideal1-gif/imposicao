import requests, json

url = "http://127.0.0.1:8000/api/impose"
payload = {
    "formato": {"name":"A4", "width":210, "height":297}, 
    "saida": {"width":210, "height":297, "margin_top":0, "margin_bottom":0, "margin_left":0, "margin_right":0}, 
    "schema": "multi_artes", 
    "multi_artes": [{"qtd": 1, "has_raw_file": True}]
}

pdf_content = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000109 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n196\n%%EOF"

res = requests.post(url, data={"payload": json.dumps(payload)}, files={"ma_file_0": ("test.pdf", pdf_content)})
print(res.status_code, res.headers)
with open("test_out.pdf", "wb") as f:
    f.write(res.content)
