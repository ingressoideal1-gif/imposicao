import os

folder = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
files_to_check = ['cliente.html', 'index.html', 'producao.html']

for filename in files_to_check:
    filepath = os.path.join(folder, filename)
    try:
        with open(filepath, 'rb') as f:
            content = f.read()
        
        # Strip the UTF-8 BOM I accidentally added earlier
        if content.startswith(b'\xef\xbb\xbf'):
            content = content[3:]
            
        # The file is actually windows-1252. Decode it.
        text = content.decode('windows-1252')
        
        # Re-encode it as utf-8 and prepend the BOM
        utf8_content = b'\xef\xbb\xbf' + text.encode('utf-8')
        
        with open(filepath, 'wb') as f:
            f.write(utf8_content)
            
        print(f"Fixed encoding of {filename} to UTF-8 with BOM")
    except Exception as e:
        print(f"Error on {filename}: {e}")
