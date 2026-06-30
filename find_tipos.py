import io

with io.open('frontend/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Lines are 1-indexed in the view, 0-indexed in Python
# Remove lines 1758-1769 (0-indexed: 1757-1768) — the Tipos block in the wrong place
# These are: divider, empty, Tipos heading div, list div, divider

# Lines to remove (0-indexed): 1757 to 1768 inclusive (divider thru closing divider)
del lines[1757:1769]

# Now setor-props closing </div> has shifted 12 lines up, it's at original 1800 -> now 1788
# Let's find it by content
setor_props_end_idx = None
in_setor_props = False
depth = 0
for i, line in enumerate(lines):
    if 'id="mapa-setor-props"' in line:
        in_setor_props = True
        depth = 1
        continue
    if in_setor_props:
        depth += line.count('<div') - line.count('</div')
        if depth <= 0:
            setor_props_end_idx = i
            break

print(f"setor-props closing </div> is now at 0-index {setor_props_end_idx} (line {setor_props_end_idx+1})")
print(f"Content: {repr(lines[setor_props_end_idx])}")

# Insert Tipos block AFTER this closing </div> (insert at setor_props_end_idx + 1)
tipos_block = [
    '\n',
    '                            <div class="divider"></div>\n',
    '\n',
    '                            <div style="display:flex; justify-content:space-between; align-items:center;">\n',
    '                                <h3 style="font-size:0.95rem; margin:0;">Tipos / Legenda</h3>\n',
    '                                <button class="btn btn-sm btn-secondary" onclick="adicionarTipoAssentoMapa()">+ Tipo</button>\n',
    '                            </div>\n',
    '\n',
    '                            <div id="mapa-tipos-assento-list" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">\n',
    '                                <!-- Lista de tipos din\u00e2micos -->\n',
    '                            </div>\n',
]

insert_pos = setor_props_end_idx + 1
for j, block_line in enumerate(tipos_block):
    lines.insert(insert_pos + j, block_line)

print(f"Inserted {len(tipos_block)} lines at position {insert_pos}")

with io.open('frontend/index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done!")
