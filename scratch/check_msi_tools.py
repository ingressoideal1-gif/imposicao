import os, sys, subprocess

sys.stdout.reconfigure(encoding='utf-8')

wix_paths = [
    r"C:\Program Files (x86)\WiX Toolset v3.11\bin\candle.exe",
    r"C:\Program Files (x86)\WiX Toolset v3.14\bin\candle.exe",
    r"C:\Program Files\WiX Toolset v4\bin\wix.exe",
    r"C:\Program Files (x86)\MSI Wrapper\msiwrapper.exe",
    r"C:\Program Files\MSI Wrapper\msiwrapper.exe"
]

found = []
for p in wix_paths:
    if os.path.exists(p):
        found.append(p)

print(f"Found MSI tools: {found}")
