with open('frontend/index.html', 'rb') as f:
    content = f.read()

import re
matches = [m.start() for m in re.finditer(b'Imposi', content)]
for idx in matches:
    print(repr(content[max(0, idx-10):idx+30]))
