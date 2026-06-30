import re

with open('frontend/script.js', 'r', encoding='utf-8') as f:
    text = f.read()

pattern = re.compile(r"const\s+csvFileEl\s*=\s*document\.getElementById\('csv-file'\);\s*if\s*\(!csvFileEl\s*\|\|\s*!csvFileEl\.files\.length\)\s*\{\s*state\.csvData\s*=\s*null;\s*\}")

if pattern.search(text):
    print('Achou!')
    new_text = pattern.sub('''const csvFileEl = document.getElementById('csv-file');\n        if (!csvFileEl || !csvFileEl.files.length) {\n            const ms = document.getElementById('mapaTeatroSelect');\n            if (!ms || !ms.value) {\n                state.csvData = null;\n            }\n        }''', text)
    with open('frontend/script.js', 'w', encoding='utf-8') as f:
        f.write(new_text)
else:
    print('Nao achou')
