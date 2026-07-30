import os, sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend\script.js"
matches = []

with open(path, "r", encoding="utf-8", errors="ignore") as file:
    for idx, line in enumerate(file, 1):
        if any(kw in line.lower() for kw in ["font_family", "font_name", "fontes", "@font-face", "loadcatalogofontes"]):
            matches.append((idx, line.strip()[:140]))

print(f"Total matches in script.js: {len(matches)}")
for line_no, text in matches:
    print(f"{filename if 'filename' in locals() else 'script.js'}:{line_no} -> {text}")
