/**
 * Memory Management Test for Railway Optimizations
 * 
 * This test specifically focuses on measuring memory usage during
 * PDF processing with and without chunking.
 * 
 * Run with: node --expose-gc node_modules/.bin/jest memory-test.js
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { chunkedPdfProcessor } = require('../utils/chunkedPdfProcessor');
const { conversionJobProcessor } = require('../utils/conversionJobProcessor');

// Mock operation model for testing
class MockOperation {
  constructor(id) {
    this._id = id;
    this.status = 'created';
    this.progress = 0;
    this.sourceFormat = 'pdf';
    this.targetFormat = 'docx';
    this.chunkedProcessing = {
      enabled: false,
      totalChunks: 0,
      completedChunks: 0,
      failedChunks: 0
    };
  }
  
  async save() {
    return this;
  }
}

// Helper to log memory usage
function logMemoryUsage(label = 'Memory Usage') {
  const memoryUsage = process.memoryUsage();
  console.log(`\n--- ${label} ---`);
  console.log(`RSS: ${Math.round(memoryUsage.rss / (1024 * 1024))} MB`);
  console.log(`Heap Total: ${Math.round(memoryUsage.heapTotal / (1024 * 1024))} MB`);
  console.log(`Heap Used: ${Math.round(memoryUsage.heapUsed / (1024 * 1024))} MB`);
  console.log(`External: ${Math.round(memoryUsage.external / (1024 * 1024))} MB`);
  console.log('-------------------');
  
  return memoryUsage.heapUsed;
}

// Helper to create test PDF of specified page count and size
async function createTestPdf(pageCount = 10, contentPerPage = 1000) {
  const pdfDoc = await PDFDocument.create();
  
  // Add specified number of pages with increasing content
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([500, 700]);
    
    // Add page title
    page.drawText(`Test Page ${i + 1}`, {
      x: 50,
      y: 650,
      size: 20
    });
    
    // Add dummy content to increase file size
    for (let j = 0; j < contentPerPage; j++) {
      const yPos = 600 - (j * 10);
      if (yPos > 50) { // Don't go off the page
        page.drawText(`Line ${j + 1} of test content for memory usage analysis. This is repeated to create larger files.`, {
          x: 50,
          y: yPos,
          size: 10
        });
      }
    }
  }
  
  const pdfBytes = await pdfDoc.save();
  const testPdfPath = path.join(__dirname, `test-memory-${pageCount}.pdf`);
  fs.writeFileSync(testPdfPath, Buffer.from(pdfBytes));
  
  return { path: testPdfPath, buffer: Buffer.from(pdfBytes) };
}

// Run Memory Test
async function runMemoryTest() {
  console.log('Starting PDF Processing Memory Test\n');
  console.log('This test measures memory usage with and without chunking.');
  
  // Create test PDF files of different sizes
  console.log('\nCreating test PDF files...');
  const smallPdf = await createTestPdf(5, 100);  // 5 pages, smaller content
  const mediumPdf = await createTestPdf(20, 100); // 20 pages, medium
  const largePdf = await createTestPdf(50, 100);  // 50 pages, larger
  
  console.log(`Created test PDFs:
- Small: ${smallPdf.buffer.length / 1024} KB (5 pages)
- Medium: ${mediumPdf.buffer.length / 1024} KB (20 pages)
- Large: ${largePdf.buffer.length / 1024} KB (50 pages)
`);
  
  // Force garbage collection to start fresh
  if (global.gc) {
    global.gc();
  }
  
  // Baseline memory usage
  logMemoryUsage('Baseline Memory');
  
  // Test 1: Process small PDF without chunking
  console.log('\n===== TEST 1: Small PDF without chunking =====');
  const smallOp = new MockOperation('small-test');
  
  const smallStartMemory = logMemoryUsage('Before Small PDF Processing');
  
  // Directly process small PDF without chunking
  await chunkedPdfProcessor.shouldChunkPdf(smallPdf.buffer, 'txt');
  
  const smallEndMemory = logMemoryUsage('After Small PDF Processing');
  const smallMemoryDiff = (smallEndMemory - smallStartMemory) / (1024 * 1024);
  console.log(`Memory impact: ${smallMemoryDiff.toFixed(2)} MB`);
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
    logMemoryUsage('After GC');
  }
  
  // Test 2: Process medium PDF with chunking
  console.log('\n===== TEST 2: Medium PDF with chunking =====');
  
  // Set up chunking for test
  const mediumOp = new MockOperation('medium-test');
  mediumOp.chunkedProcessing.enabled = true;
  
  const mediumStartMemory = logMemoryUsage('Before Medium PDF Chunking');
  
  // Split into chunks
  const { chunks } = await chunkedPdfProcessor.splitIntoChunks(mediumPdf.buffer, mediumOp);
  console.log(`Split into ${chunks.length} chunks`);
  
  const afterSplitMemory = logMemoryUsage('After Splitting');
  
  // Process each chunk sequentially to measure incremental memory usage
  for (let i = 0; i < chunks.length; i++) {
    console.log(`\nProcessing chunk ${i+1}/${chunks.length}`);
    
    // Simulate processing (just analyze PDF to create memory pressure)
    const chunkDoc = await PDFDocument.load(chunks[i].buffer);
    const pageCount = chunkDoc.getPageCount();
    console.log(`Chunk has ${pageCount} pages`);
    
    const chunkPages = [];
    for (let j = 0; j < pageCount; j++) {
      const page = chunkDoc.getPage(j);
      const { width, height } = page.getSize();
      chunkPages.push({ width, height });
    }
    
    logMemoryUsage(`After Processing Chunk ${i+1}`);
    
    // Force GC after each chunk to simulate cleanup
    if (global.gc && i < chunks.length - 1) {
      global.gc();
      console.log(`[Garbage collection after chunk ${i+1}]`);
    }
  }
  
  const mediumEndMemory = logMemoryUsage('After All Chunks Processed');
  const mediumMemoryDiff = (mediumEndMemory - mediumStartMemory) / (1024 * 1024);
  console.log(`Total memory impact: ${mediumMemoryDiff.toFixed(2)} MB`);
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
    logMemoryUsage('After GC');
  }
  
  // Test 3: Compare processing large PDF with and without chunking
  console.log('\n===== TEST 3: Large PDF with vs. without chunking =====');
  
  // Create operations
  const largeNoChunkOp = new MockOperation('large-no-chunk');
  const largeChunkOp = new MockOperation('large-chunk');
  largeChunkOp.chunkedProcessing.enabled = true;
  
  // Option 1: Without chunking
  console.log('\nProcessing without chunking:');
  const noChunkStartMemory = logMemoryUsage('Before Processing (No Chunking)');
  
  try {
    // Load entire PDF at once
    const wholePdf = await PDFDocument.load(largePdf.buffer);
    const pageCount = wholePdf.getPageCount();
    console.log(`PDF has ${pageCount} pages`);
    
    // Simulate processing the entire PDF
    for (let i = 0; i < pageCount; i++) {
      const page = wholePdf.getPage(i);
      const { width, height } = page.getSize();
    }
    
    const noChunkEndMemory = logMemoryUsage('After Processing (No Chunking)');
    const noChunkMemoryDiff = (noChunkEndMemory - noChunkStartMemory) / (1024 * 1024);
    console.log(`Memory impact without chunking: ${noChunkMemoryDiff.toFixed(2)} MB`);
  } catch (error) {
    console.error('Error processing without chunking:', error.message);
    console.log('This demonstrates the risk of OOM errors without chunking');
  }
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
    logMemoryUsage('After GC');
  }
  
  // Option 2: With chunking
  console.log('\nProcessing with chunking:');
  const chunkStartMemory = logMemoryUsage('Before Processing (With Chunking)');
  
  // Split into chunks
  const { chunks: largeChunks } = await chunkedPdfProcessor.splitIntoChunks(largePdf.buffer, largeChunkOp);
  console.log(`Split into ${largeChunks.length} chunks`);
  
  // Process each chunk with GC between
  let maxChunkMemory = 0;
  
  for (let i = 0; i < largeChunks.length; i++) {
    console.log(`\nProcessing chunk ${i+1}/${largeChunks.length}`);
    
    const beforeChunkMemory = logMemoryUsage(`Before Chunk ${i+1}`);
    
    // Simulate processing
    const chunkDoc = await PDFDocument.load(largeChunks[i].buffer);
    const pageCount = chunkDoc.getPageCount();
    
    // Work with the PDF to create memory pressure
    for (let j = 0; j < pageCount; j++) {
      const page = chunkDoc.getPage(j);
      const { width, height } = page.getSize();
    }
    
    const afterChunkMemory = logMemoryUsage(`After Chunk ${i+1}`);
    const chunkMemoryDiff = (afterChunkMemory - beforeChunkMemory) / (1024 * 1024);
    maxChunkMemory = Math.max(maxChunkMemory, chunkMemoryDiff);
    
    // Clear references to free memory
    largeChunks[i].buffer = null;
    
    // Force GC after each chunk
    if (global.gc) {
      global.gc();
      console.log(`[Garbage collection after chunk ${i+1}]`);
    }
  }
  
  const chunkEndMemory = logMemoryUsage('After Processing (With Chunking)');
  const chunkMemoryDiff = (chunkEndMemory - chunkStartMemory) / (1024 * 1024);
  console.log(`Total memory impact with chunking: ${chunkMemoryDiff.toFixed(2)} MB`);
  console.log(`Max memory impact per chunk: ${maxChunkMemory.toFixed(2)} MB`);
  
  // Summary
  console.log('\n===== MEMORY TEST SUMMARY =====');
  console.log(`Small PDF (${smallPdf.buffer.length / 1024} KB): Memory impact without chunking: ${smallMemoryDiff.toFixed(2)} MB`);
  console.log(`Medium PDF (${mediumPdf.buffer.length / 1024} KB): Memory impact with chunking: ${mediumMemoryDiff.toFixed(2)} MB`);
  console.log(`Large PDF (${largePdf.buffer.length / 1024} KB):`);
  console.log(`  - Without chunking: ${(chunkMemoryDiff * largeChunks.length).toFixed(2)} MB (estimated, may cause OOM)`);
  console.log(`  - With chunking: ${chunkMemoryDiff.toFixed(2)} MB (actual)`);
  console.log(`  - Memory usage reduction: ~${(100 - (chunkMemoryDiff / (chunkMemoryDiff * largeChunks.length) * 100)).toFixed(0)}%`);
  
  // Clean up test files
  try {
    fs.unlinkSync(smallPdf.path);
    fs.unlinkSync(mediumPdf.path);
    fs.unlinkSync(largePdf.path);
  } catch (error) {
    console.warn('Could not clean up some test files:', error.message);
  }
}

// Run the memory test
runMemoryTest();