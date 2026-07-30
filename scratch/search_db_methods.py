import os, sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\db.py"
matches = []

with open(path, "r", encoding="utf-8", errors="ignore") as file:
    for idx, line in enumerate(file, 1):
        if any(kw in line.lower() for kw in ["get_formatos", "get_numeracoes", "supabase", "def get_"]):
            matches.append((idx, line.strip()[:140]))

print(f"Total matches in db.py: {len(matches)}")
for line_no, text in matches:
    print(f"db.py:{line_no} -> {text}")
