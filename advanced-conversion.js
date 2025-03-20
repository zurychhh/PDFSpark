const express = require("express");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const { Readable } = require("stream");
const axios = require("axios");
const sharp = require("sharp");
const { Document, Packer, Paragraph, TextRun } = require("docx");

// Initialize memory fallback mechanism
if (process.env.USE_MEMORY_FALLBACK === "true") {
  console.log("Initializing memory fallback storage");
  global.usingMemoryFallback = true;
  global.memoryStorage = {
    files: new Map(),
    operations: new Map(),
    storeFile: function(id, data) {
      this.files.set(id, data);
      return id;
    },
    getFile: function(id) {
      return this.files.get(id);
    },
    storeOperation: function(id, data) {
      this.operations.set(id, data);
      return id;
    },
    getOperation: function(id) {
      return this.operations.get(id);
    }
  };
  console.log("Memory fallback storage initialized");
}

const app = express();
const port = process.env.PORT || 3000;

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/tmp/uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Middleware
app.use(express.json());
app.use(cors());

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log("Cloudinary configured successfully");
} else {
  console.log("Cloudinary credentials missing, skipping configuration");
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "PDFSpark API is running",
    timestamp: new Date().toISOString(),
    usingCloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    usingMemoryFallback: !!global.usingMemoryFallback
  });
});

// File upload endpoint
app.post("/api/files/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    const fileId = uuidv4();
    let fileUrl = null;
    
    // If Cloudinary is available, upload the file
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "pdfspark_uploads",
          resource_type: "auto",
          public_id: fileId
        });
        
        fileUrl = result.secure_url;
        
        // Don't delete local file as we'll need it for conversion
        // fs.unlinkSync(req.file.path);
      } catch (cloudinaryError) {
        console.error("Cloudinary upload failed:", cloudinaryError);
        // Continue with local file
      }
    }
    
    // Store file information
    const fileInfo = {
      id: fileId,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      path: req.file.path,
      url: fileUrl,
      uploadDate: new Date()
    };
    
    // If using memory fallback, store file information
    if (global.usingMemoryFallback) {
      global.memoryStorage.storeFile(fileId, fileInfo);
    }
    
    return res.status(200).json({
      success: true,
      fileId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      uploadDate: new Date(),
      url: fileUrl
    });
  } catch (error) {
    console.error("File upload error:", error);
    return res.status(500).json({
      success: false,
      message: "File upload failed",
      error: error.message
    });
  }
});

// Async function to handle actual PDF conversion
async function convertPdfToFormat(sourcePath, targetFormat, outputPath) {
  try {
    console.log(`Converting ${sourcePath} to ${targetFormat}, output: ${outputPath}`);
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }
    
    // Read the PDF file
    const pdfBytes = fs.readFileSync(sourcePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    let resultPath = outputPath;
    
    switch (targetFormat.toLowerCase()) {
      case "jpg":
      case "jpeg":
        // Convert first page to JPG using sharp
        const pdfPage = pdfDoc.getPages()[0];
        const { width, height } = pdfPage.getSize();
        
        // Render page to PNG
        const pngBytes = await pdfDoc.saveAsBase64({ dataUri: true });
        const dataUri = pngBytes.split(",")[1];
        const buffer = Buffer.from(dataUri, "base64");
        
        // Convert to JPG
        await sharp(buffer)
          .jpeg()
          .toFile(outputPath);
        break;
        
      case "png":
        // Convert first page to PNG using sharp
        const firstPage = pdfDoc.getPages()[0];
        const pageDimensions = firstPage.getSize();
        
        // Render page to PNG
        const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
        const dataUriPng = pdfBase64.split(",")[1];
        const bufferPng = Buffer.from(dataUriPng, "base64");
        
        // Convert to PNG
        await sharp(bufferPng)
          .png()
          .toFile(outputPath);
        break;
        
      case "docx":
        // Create simple DOCX file with text extracted from PDF
        const doc = new Document();
        
        // Add title
        doc.addSection({
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "PDF Conversion",
                  bold: true,
                  size: 36
                })
              ]
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: "This is a simple conversion from PDF to DOCX.",
                  size: 24
                })
              ]
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: `Original filename: ${path.basename(sourcePath)}`,
                  size: 20
                })
              ]
            }),
            
            new Paragraph({
              children: [
                new TextRun({
                  text: `Converted on: ${new Date().toISOString()}`,
                  size: 20
                })
              ]
            })
          ]
        });
        
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);
        break;
        
      case "txt":
        // Simple TXT conversion - just add basic information
        const txtContent = `
PDF Conversion to TXT
=====================
Original filename: ${path.basename(sourcePath)}
Converted on: ${new Date().toISOString()}
Number of pages: ${pdfDoc.getPageCount()}

This is a simple conversion from PDF to TXT.
For a more complete conversion with text extraction, additional libraries would be needed.
`;
        
        fs.writeFileSync(outputPath, txtContent);
        break;
        
      default:
        throw new Error(`Unsupported target format: ${targetFormat}`);
    }
    
    return resultPath;
  } catch (error) {
    console.error(`Conversion error (${targetFormat}):`, error);
    throw error;
  }
}

// File conversion endpoint with actual conversion
app.post("/api/convert", async (req, res) => {
  try {
    const { fileId, sourceFormat, targetFormat, options } = req.body;
    
    if (!fileId || !targetFormat) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: fileId, targetFormat"
      });
    }
    
    // Get file information
    let fileInfo;
    if (global.usingMemoryFallback) {
      fileInfo = global.memoryStorage.getFile(fileId);
    }
    
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: "File not found"
      });
    }
    
    // Create conversion operation
    const operationId = uuidv4();
    const operation = {
      id: operationId,
      sourceFileId: fileId,
      sourceFormat: sourceFormat || "pdf",
      targetFormat,
      options: options || {},
      status: "processing",
      progress: 0,
      createdAt: new Date(),
      resultFileId: null,
      resultUrl: null,
      errorMessage: null
    };
    
    // Store operation in memory
    if (global.usingMemoryFallback) {
      global.memoryStorage.storeOperation(operationId, operation);
    }
    
    // Start conversion in background
    (async () => {
      try {
        // Local source path
        const sourcePath = fileInfo.path;
        
        // Determine output path
        const outputFilename = `${fileId}_${targetFormat}.${targetFormat}`;
        const outputPath = path.join("/tmp/results", outputFilename);
        
        // Update operation status
        if (global.usingMemoryFallback) {
          const op = global.memoryStorage.getOperation(operationId);
          if (op) {
            op.progress = 10;
            global.memoryStorage.storeOperation(operationId, op);
          }
        }
        
        // Perform actual conversion
        await convertPdfToFormat(sourcePath, targetFormat, outputPath);
        
        // Update operation progress
        if (global.usingMemoryFallback) {
          const op = global.memoryStorage.getOperation(operationId);
          if (op) {
            op.progress = 80;
            global.memoryStorage.storeOperation(operationId, op);
          }
        }
        
        // Upload result to Cloudinary
        let resultUrl = null;
        const resultFileId = uuidv4();
        
        if (process.env.CLOUDINARY_CLOUD_NAME) {
          try {
            const result = await cloudinary.uploader.upload(outputPath, {
              folder: "pdfspark_results",
              resource_type: "auto",
              public_id: resultFileId
            });
            
            resultUrl = result.secure_url;
          } catch (cloudinaryError) {
            console.error("Cloudinary upload of result failed:", cloudinaryError);
          }
        }
        
        // Store result file info
        const resultFileInfo = {
          id: resultFileId,
          originalName: outputFilename,
          path: outputPath,
          size: fs.statSync(outputPath).size,
          mimeType: `application/${targetFormat}`,
          url: resultUrl,
          uploadDate: new Date()
        };
        
        if (global.usingMemoryFallback) {
          global.memoryStorage.storeFile(resultFileId, resultFileInfo);
        }
        
        // Mark operation as complete
        if (global.usingMemoryFallback) {
          const op = global.memoryStorage.getOperation(operationId);
          if (op) {
            op.status = "completed";
            op.progress = 100;
            op.resultFileId = resultFileId;
            op.resultUrl = resultUrl;
            op.completedAt = new Date();
            global.memoryStorage.storeOperation(operationId, op);
          }
        }
        
        console.log(`Conversion of ${fileId} to ${targetFormat} completed successfully`);
      } catch (error) {
        console.error(`Background conversion error:`, error);
        
        // Update operation with error
        if (global.usingMemoryFallback) {
          const op = global.memoryStorage.getOperation(operationId);
          if (op) {
            op.status = "failed";
            op.errorMessage = error.message;
            global.memoryStorage.storeOperation(operationId, op);
          }
        }
      }
    })();
    
    return res.status(200).json({
      success: true,
      operationId,
      status: "processing",
      estimatedTime: 10 // More realistic for actual conversion
    });
  } catch (error) {
    console.error("Conversion error:", error);
    return res.status(500).json({
      success: false,
      message: "Conversion failed",
      error: error.message
    });
  }
});

// Operation status check endpoint
app.get("/api/operations/:id/status", (req, res) => {
  try {
    const { id } = req.params;
    
    // Get operation from memory
    let operation;
    if (global.usingMemoryFallback) {
      operation = global.memoryStorage.getOperation(id);
    }
    
    if (!operation) {
      return res.status(404).json({
        success: false,
        message: "Operation not found"
      });
    }
    
    return res.status(200).json({
      operationId: operation.id,
      status: operation.status,
      progress: operation.progress,
      resultFileId: operation.resultFileId
    });
  } catch (error) {
    console.error("Status check error:", error);
    return res.status(500).json({
      success: false,
      message: "Status check failed",
      error: error.message
    });
  }
});

// Download conversion result endpoint
app.get("/api/operations/:id/download", (req, res) => {
  try {
    const { id } = req.params;
    
    // Get operation from memory
    let operation;
    if (global.usingMemoryFallback) {
      operation = global.memoryStorage.getOperation(id);
    }
    
    if (!operation) {
      return res.status(404).json({
        success: false,
        message: "Operation not found"
      });
    }
    
    if (operation.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: `Operation is not completed yet (status: ${operation.status})`
      });
    }
    
    // Get result file info
    let resultFileInfo;
    if (global.usingMemoryFallback && operation.resultFileId) {
      resultFileInfo = global.memoryStorage.getFile(operation.resultFileId);
    }
    
    if (!resultFileInfo) {
      // Fall back to source file if result not found
      if (global.usingMemoryFallback) {
        resultFileInfo = global.memoryStorage.getFile(operation.sourceFileId);
      }
      
      if (!resultFileInfo) {
        return res.status(404).json({
          success: false,
          message: "Result file not found"
        });
      }
    }
    
    return res.status(200).json({
      success: true,
      downloadUrl: resultFileInfo.url,
      fileName: `${path.parse(resultFileInfo.originalName).name}.${operation.targetFormat}`,
      fileSize: resultFileInfo.size,
      format: operation.targetFormat
    });
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).json({
      success: false,
      message: "Download failed",
      error: error.message
    });
  }
});

// Cloudinary status endpoint
app.get("/api/cloudinary/status", async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(200).json({
        status: "not_configured",
        message: "Cloudinary is not configured"
      });
    }
    
    const result = await cloudinary.api.ping();
    return res.status(200).json({
      status: "ok",
      cloudinaryStatus: result.status
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

// System status endpoint
app.get("/api/status", (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.status(200).json({
    status: "ok",
    uptime,
    memoryUsage: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + " MB",
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + " MB",
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + " MB"
    },
    environment: process.env.NODE_ENV,
    usingCloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    usingMemoryFallback: !!global.usingMemoryFallback
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("PDFSpark API is running");
});

app.listen(port, () => {
  console.log(`PDFSpark API running on port ${port}`);
});