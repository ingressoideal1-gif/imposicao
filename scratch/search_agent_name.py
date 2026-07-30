import os

search_dir = r"c:\Users\Junior\Projetos Ingresso ideal"
matches = []

for root, dirs, files in os.walk(search_dir):
    if any(k in root for k in ["node_modules", ".git", "venv", ".next", "__pycache__", "build", "dist"]):
        continue
    for f in files:
        if f.endswith((".py", ".js", ".html", ".iss", ".ps1", ".md", ".json", ".bat")):
            path = os.path.join(root, f)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as file:
                    for idx, line in enumerate(file, 1):
                        if "IdealImpositionAgent" in line or "idealimpositionagent" in line.lower():
                            matches.append((path, idx, line.strip()))
            except Exception as e:
                pass

print(f"Total matches found: {len(matches)}")
for path, line_no, content in matches:
    print(f"{path}:{line_no} -> {content}")
