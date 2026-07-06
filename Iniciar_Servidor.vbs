Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 9000", 0, False
