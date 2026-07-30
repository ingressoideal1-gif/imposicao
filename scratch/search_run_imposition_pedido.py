import os, sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend\pedido.js"
matches = []

with open(path, "r", encoding="utf-8", errors="ignore") as file:
    for idx, line in enumerate(file, 1):
        if "runimposition(" in line.lower() or "sendprintjob" in line.lower():
            matches.append((idx, line.strip()[:140]))

print(f"Total matches in pedido.js: {len(matches)}")
for line_no, text in matches:
    print(f"pedido.js:{line_no} -> {text}")
