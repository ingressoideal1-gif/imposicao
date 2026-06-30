import io
import re

with io.open('frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Z-Index issue by moving modal-mapa-teatro outside main-content
modal_pattern = re.compile(r'(<!-- Modal de Editor Visual -->\s*<div id="modal-mapa-teatro".*?</div>\s*</div>\s*</div>)\s*</section>', re.DOTALL)
match = modal_pattern.search(content)

if match:
    modal_html = match.group(1)
    # Remove from its current location
    content = content[:match.start()] + '\n            </section>' + content[match.end():]
    
    # Append it right before </body>
    content = content.replace('</body>', modal_html + '\n</body>')
    print("Modal moved successfully!")
else:
    print("Modal not found!")

# Fix Toolbar (removing old static buttons and adding dynamic toolbar)
toolbar_pattern = re.compile(r'<div style="width:1px; background:var\(--border\); margin:0 4px;"></div>\s*<button.*?>.*?♿.*?</button>\s*<button.*?>.*?💺.*?</button>\s*<button.*?>.*?👥.*?</button>\s*<button.*?>.*?✖️.*?</button>\s*</div>', re.DOTALL)
if toolbar_pattern.search(content):
    content = toolbar_pattern.sub(r'<div style="width:1px; background:var(--border); margin:0 4px;"></div>\n                                <div id="mapa-toolbar-tipos" style="display:flex; gap:8px;"></div>\n                            </div>', content)
    print("Toolbar replaced successfully!")
else:
    print("Toolbar not found!")

with io.open('frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
