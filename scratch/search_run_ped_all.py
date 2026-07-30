import os, sys

sys.stdout.reconfigure(encoding='utf-8')

dir_path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"
matches = []

for root, dirs, files in os.walk(dir_path):
    for f in files:
        if f.endswith(".js") or f.endswith(".html"):
            p = os.path.join(root, f)
            with open(p, "r", encoding="utf-8", errors="ignore") as file:
                for idx, line in enumerate(file, 1):
                    if "runpedimposition" in line.lower() or "pedqueue" in line.lower():
                        matches.append((f, idx, line.strip()[:140]))

print(f"Total matches: {len(matches)}")
for filename, line_no, text in matches:
    print(f"{filename}:{line_no} -> {text}")
