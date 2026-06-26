const { PDFDocument, PDFName, PDFString, PDFNumber } = require('pdf-lib');
const fs = require('fs');

async function create() {
    const pdfDoc = await PDFDocument.create();
    
    pdfDoc.addPage([200, 200]);
    pdfDoc.addPage([200, 200]);
    
    const nums = [];
    
    // Page 0
    nums.push(PDFNumber.of(0));
    nums.push(pdfDoc.context.obj({
        Type: 'PageLabel',
        P: PDFString.of('1000001')
    }));
    
    // Page 1
    nums.push(PDFNumber.of(1));
    nums.push(pdfDoc.context.obj({
        Type: 'PageLabel',
        P: PDFString.of('1000002')
    }));
    
    const numTree = pdfDoc.context.obj({
        Nums: nums
    });
    
    pdfDoc.catalog.set(PDFName.of('PageLabels'), numTree);
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('test_labels.pdf', pdfBytes);
    console.log('test_labels.pdf saved.');
}

create().catch(console.error);
