import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend\pedido.js"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

depth = 0
# Track depth=2->3 opens and depth=3->2 closes within lines 3292-4160
d2_opens = []
d3_closes = []
for i, line in enumerate(lines, 1):
    stripped = line.strip()
    if stripped.startswith('//'):
        continue
    opens = line.count('{')
    closes = line.count('}')
    prev_depth = depth
    depth += opens - closes
    
    if 3292 <= i <= 4160:
        if prev_depth == 2 and depth == 3:
            d2_opens.append((i, stripped[:120]))
        if prev_depth == 3 and depth == 2:
            d3_closes.append((i, stripped[:120]))

print(f"Opens from depth 2->3 ({len(d2_opens)}):")
for ln, text in d2_opens:
    print(f"  L{ln}: {text}")
print(f"\nCloses from depth 3->2 ({len(d3_closes)}):")
for ln, text in d3_closes:
    print(f"  L{ln}: {text}")
print(f"\nImbalance: {len(d2_opens) - len(d3_closes)} extra opens")
