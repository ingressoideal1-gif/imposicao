import json

with open("formats_db.json", "r", encoding="utf-8") as f:
    db = json.load(f)

for key, items in db.items():
    if isinstance(items, list):
        for idx, item in enumerate(items):
            item_str = json.dumps(item).lower()
            if "camarote" in item_str:
                print(f"KEY: {key} | INDEX: {idx} | Name: {item.get('name')} | ID: {item.get('id')}")
                print(json.dumps(item, indent=2))
                print("-" * 50)
