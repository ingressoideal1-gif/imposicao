import requests
import sys
import json

url = "https://ideal-imposition.onrender.com/api/impose"
files = {
    'files_0_0': ('teste_render.pdf', open('teste_render.pdf', 'rb'), 'application/pdf')
}

payload_dict = {
    'config': {"sheet_w": 210, "sheet_h": 297, "item_w": 50, "item_h": 50, "margin_left": 0, "margin_top": 0, "margin_right": 0, "margin_bottom": 0, "spacing_x": 0, "spacing_y": 0, "cut_marks": False, "mark_length": 5, "mark_offset": 2, "print_mode": "simplex", "layout_schema": "multi_artes", "seq_start": 1, "seq_increment": 1, "elements": []},
    'artes': [{"id": 0, "amount": 1}],
    'mode': 'multi_arte'
}

data = {
    'payload': json.dumps(payload_dict)
}

print("Sending request to Render...")
try:
    response = requests.post(url, files=files, data=data, timeout=60)
    print("Status:", response.status_code)
    if response.status_code == 200:
        print("Success! PDF size:", len(response.content))
        with open("output_render.pdf", "wb") as f:
            f.write(response.content)
    else:
        print("Error:", response.text)
except Exception as e:
    print("Exception:", str(e))
