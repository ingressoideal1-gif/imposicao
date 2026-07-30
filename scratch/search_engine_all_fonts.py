import os, sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\engine.py"
matches = []

with open(path, "r", encoding="utf-8", errors="ignore") as file:
    for idx, line in enumerate(file, 1):
        if any(kw in line.lower() for kw in ["font_name", "font_file", "font_map", "raw_font_name", "system:"]):
            matches.append((idx, line.strip()[:140]))

print(f"Total matches in engine.py: {len(matches)}")
for line_no, text in matches:
    print(f"engine.py:{line_no} -> {text}")
