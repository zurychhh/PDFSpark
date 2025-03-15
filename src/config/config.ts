// Environment variables with fallbacks
export const API_URL = import.meta.env.VITE_API_URL || 'https://api.pdfspark.com';
export const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 30000;

// File size limits in MB
export const FILE_SIZE_LIMITS = {
  FREE: 5,
  PREMIUM: 100,
};

// Timeouts in milliseconds
export const TIMEOUTS = {
  API_REQUEST: 30000, // 30 seconds
  CONVERSION_POLLING: 60000, // 60 seconds
};

// Supported file formats
export const SUPPORTED_FORMATS = {
  SOURCE: ['application/pdf'],
  TARGET: ['docx', 'xlsx', 'pptx', 'jpg', 'txt'],
};

// Payment-related constants
export const PAYMENT = {
  CURRENCY: 'USD',
  DEFAULT_PRICE: 1.99,
};

// Feature flags
export const FEATURES = {
  PREMIUM_ENABLED: import.meta.env.VITE_PREMIUM_ENABLED === 'true',
  ANALYTICS_ENABLED: import.meta.env.VITE_ANALYTICS_ENABLED === 'true',
};

// Routes configuration
export const ROUTES = {
  HOME: '/',
  CONVERT: {
    PDF_TO_WORD: '/convert/pdf-to-word',
    PDF_TO_EXCEL: '/convert/pdf-to-excel',
    PDF_TO_PPT: '/convert/pdf-to-ppt',
    PDF_TO_IMAGE: '/convert/pdf-to-image',
    PDF_TO_TEXT: '/convert/pdf-to-text',
  },
  TOOLS: {
    ALL: '/tools',
    COMPRESS_PDF: '/tools/compress-pdf',
    MERGE_PDF: '/tools/merge-pdf',
    SPLIT_PDF: '/tools/split-pdf',
  },
};

// Default options for different conversions
export const DEFAULT_CONVERSION_OPTIONS = {
  docx: {
    preserveFormatting: true,
    extractImages: true,
    quality: 'high',
  },
  xlsx: {
    preserveTableStructure: true,
    includeImages: false,
  },
  pptx: {
    preserveFormatting: true,
    extractImages: true,
    slidePerPage: true,
  },
  jpg: {
    quality: 90,
    dpi: 300,
  },
  txt: {
    preserveLineBreaks: true,
    detectParagraphs: true,
  },
};