import PyPDF2

try:
    reader = PyPDF2.PdfReader('test_labels.pdf')
    print("Num pages:", len(reader.pages))
    
    # Try to access page labels using the /PageLabels catalog entry
    catalog = reader.trailer["/Root"]
    if "/PageLabels" in catalog:
        print("PageLabels found in catalog:", catalog["/PageLabels"])
        nums = catalog["/PageLabels"]["/Nums"]
        print("Nums array:", nums)
    else:
        print("No PageLabels found in catalog.")
except Exception as e:
    print("Error:", e)
