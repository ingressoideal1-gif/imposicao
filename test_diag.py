import requests, json
url = "http://127.0.0.1:8080/api/impose"
payload = {
    "formato": {"name":"A4", "width_mm":210, "height_mm":297, "cols":1, "rows":1},
    "saida": {"width_mm":210, "height_mm":297},
    "schema": "multi_artes",
    "multi_artes": [{"qtd": 1, "has_raw_file": True}]
}
pdf_content = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000109 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n196\n%%EOF"
res = requests.post(url, data={"payload": json.dumps(payload)}, files={"ma_file_0": ("test.pdf", pdf_content)})
print("Impose status:", res.status_code)

if res.status_code == 200:
    with open("output_diag.pdf", "wb") as f:
        f.write(res.content)
    import fitz
    doc = fitz.open("output_diag.pdf")
    for page in doc:
        print("PDF Text:", page.get_text())
    doc.close()

diag = requests.get("http://127.0.0.1:8080/api/diag")
print("Diag logs:")
for l in diag.json().get("logs", []):
    print(l)
