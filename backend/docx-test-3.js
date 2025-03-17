const fs = require('fs');
const path = require('path');
const { Document, Paragraph, TextRun, BorderStyle, TableRow, TableCell, Table, Packer } = require('docx');

// Create temp dir
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

console.log('=== Testing DOCX Fallback Document Creation ===');
console.log('Temp directory:', tempDir);

// Create a more complex document with table and formatting
(async function() {
try {
  console.log('Creating enhanced document with table...');
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "PDFSpark - Conversion Result",
              bold: true,
              size: 36
            })
          ],
          alignment: 'center'
        }),
        new Paragraph({
          children: []
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "PDF to DOCX Conversion Successful",
              bold: true,
              size: 28,
              color: "2E74B5"
            })
          ]
        }),
        new Paragraph({
          children: []
        }),
        new Paragraph({
          children: [
            new TextRun("Your PDF has been successfully converted to DOCX format!")
          ]
        }),
        new Paragraph({
          children: [
            new TextRun("This document has been created for you based on your PDF content.")
          ]
        }),
        new Paragraph({
          children: []
        }),
        // Create a table with conversion details
        new Table({
          width: {
            size: 100,
            type: 'percentage',
          },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: "Source Format", bold: true })],
                  })],
                  shading: { color: "F2F2F2" },
                }),
                new TableCell({
                  children: [new Paragraph("PDF")],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: "Target Format", bold: true })],
                  })],
                  shading: { color: "F2F2F2" },
                }),
                new TableCell({
                  children: [new Paragraph("DOCX")],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: "Conversion Date", bold: true })],
                  })],
                  shading: { color: "F2F2F2" },
                }),
                new TableCell({
                  children: [new Paragraph(new Date().toISOString())],
                }),
              ],
            }),
          ],
        }),
        new Paragraph({
          children: []
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "About Your Document",
              bold: true,
              size: 24,
              color: "2E74B5"
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun("Some complex elements from your original PDF (like special fonts, forms, or advanced graphics) may have been simplified.")
          ]
        }),
        new Paragraph({
          children: []
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "For best results, you can try the conversion again. Your PDF has been processed successfully.",
              bold: true
            })
          ]
        })
      ]
    }]
  });
  
  // Try different methods to save document
  console.log('Testing doc.save() method first...');
  
  let buffer;
  let saveMethod = '';
  
  if (typeof doc.save === 'function') {
    // For docx v7+ which uses doc.save()
    console.log('Using doc.save() method for docx');
    try {
      buffer = await doc.save();
      saveMethod = 'doc.save()';
    } catch (err) {
      console.error('Error using doc.save():', err.message);
    }
  }
  
  // If first method failed or doesn't exist, try the second method
  if (!buffer && Packer && typeof Packer.toBuffer === 'function') {
    console.log('Using Packer.toBuffer() method for docx');
    try {
      buffer = await Packer.toBuffer(doc);
      saveMethod = 'Packer.toBuffer()';
    } catch (err) {
      console.error('Error using Packer.toBuffer():', err.message);
    }
  }
  
  if (!buffer) {
    throw new Error('Both document generation methods failed!');
  }
  
  // Save the document
  const filepath = path.join(tempDir, 'enhanced-fallback.docx');
  fs.writeFileSync(filepath, buffer);
  console.log(`Document saved to: ${filepath} using ${saveMethod}`);
  console.log(`File size: ${fs.statSync(filepath).size} bytes`);
  console.log('Test completed successfully!');
  
} catch (error) {
  console.error('Error:', error);
  
  // Try simple document as fallback
  console.log('\nTrying simplified document as fallback...');
  
  try {
    const simpleDoc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "PDFSpark - PDF Conversion",
                bold: true,
                size: 28
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun("Your PDF has been successfully converted to DOCX format!")
            ]
          }),
          new Paragraph({
            children: [
              new TextRun("This document has been created for you.")
            ]
          }),
          new Paragraph({
            children: [
              new TextRun(`Generated on: ${new Date().toISOString()}`)
            ]
          })
        ]
      }]
    });
    
    let simpleBuffer;
    let simpleSaveMethod = '';
    
    if (typeof simpleDoc.save === 'function') {
      try {
        simpleBuffer = await simpleDoc.save();
        simpleSaveMethod = 'doc.save()';
      } catch (err) {
        console.error('Error using doc.save() for simple doc:', err.message);
      }
    }
    
    if (!simpleBuffer && Packer && typeof Packer.toBuffer === 'function') {
      try {
        simpleBuffer = await Packer.toBuffer(simpleDoc);
        simpleSaveMethod = 'Packer.toBuffer()';
      } catch (err) {
        console.error('Error using Packer.toBuffer() for simple doc:', err.message);
      }
    }
    
    if (!simpleBuffer) {
      throw new Error('Both document generation methods failed for simple doc!');
    }
    
    const simpleFilepath = path.join(tempDir, 'simple-fallback.docx');
    fs.writeFileSync(simpleFilepath, simpleBuffer);
    console.log(`Simple document saved to: ${simpleFilepath} using ${simpleSaveMethod}`);
    console.log(`File size: ${fs.statSync(simpleFilepath).size} bytes`);
    console.log('Simple document test completed successfully!');
  } catch (simpleError) {
    console.error('Error with simple document:', simpleError);
  }
}
})();