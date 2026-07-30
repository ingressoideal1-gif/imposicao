import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend\pedido.js"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

depth = 0
for i, line in enumerate(lines, 1):
    # Count braces outside of strings (simplified)
    stripped = line.strip()
    if stripped.startswith('//'):
        continue
    opens = line.count('{') - line.count('\\{')
    closes = line.count('}') - line.count('\\}')
    prev_depth = depth
    depth += opens - closes
    if depth < 0:
        print(f"NEGATIVE DEPTH at line {i}: depth={depth}, line={stripped[:120]}")
    if abs(opens - closes) > 0 and (prev_depth <= 1 or depth <= 1):
        print(f"L{i}: depth {prev_depth}->{depth}: {stripped[:120]}")

print(f"\nFinal depth: {depth}")
