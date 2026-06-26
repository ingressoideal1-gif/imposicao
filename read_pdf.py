import re
with open('test_labels.pdf', 'rb') as f:
    content = f.read()
    
# Find PageLabels
matches = re.finditer(b'/PageLabels', content)
for m in matches:
    start = max(0, m.start() - 50)
    end = min(len(content), m.end() + 100)
    print(content[start:end])
