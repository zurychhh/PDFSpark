import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FileUploader from './FileUploader';
import { vi, describe, test, expect, beforeEach } from 'vitest';

// Mock the file service
vi.mock('../services/pdfService', () => ({
  uploadFile: vi.fn().mockResolvedValue({
    success: true,
    fileId: 'test-file-id',
    fileName: 'test.pdf',
    fileSize: 1024,
    previewUrl: 'test-preview-url',
  }),
  validateFile: vi.fn().mockReturnValue({
    valid: true,
    message: 'File is valid',
  }),
}));

describe('FileUploader Component', () => {
  const onFileUploadedMock = vi.fn();
  const defaultProps = {
    onFileUploaded: onFileUploadedMock,
    onFileSelected: vi.fn(), // Added missing onFileSelected property
    maxSize: 5,
    acceptedFileTypes: ['application/pdf'],
    allowedFileExtensions: ['.pdf'],
    isPremiumFeature: false,
    userSubscription: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders upload area with instructions', () => {
    render(<FileUploader {...defaultProps} />);
    
    expect(screen.getByText(/Drag and drop your PDF file here/i)).toBeInTheDocument();
    expect(screen.getByText(/or click to select/i)).toBeInTheDocument();
    expect(screen.getByText(/Maximum file size: 5MB/i)).toBeInTheDocument();
  });

  test('shows error message for unsupported file type', async () => {
    render(<FileUploader {...defaultProps} />);
    
    const file = new File(['file content'], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const uploadArea = screen.getByTestId('upload-dropzone');
    
    // Simulate file drop
    fireEvent.drop(uploadArea, {
      dataTransfer: {
        files: [file],
      },
    });
    
    await waitFor(() => {
      expect(screen.getByText(/Only PDF files are supported/i)).toBeInTheDocument();
    });
    
    expect(onFileUploadedMock).not.toHaveBeenCalled();
  });

  test('shows error message for files exceeding size limit', async () => {
    render(<FileUploader {...defaultProps} />);
    
    // Create a mock file larger than the max size
    const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 });
    
    const uploadArea = screen.getByTestId('upload-dropzone');
    
    // Simulate file drop
    fireEvent.drop(uploadArea, {
      dataTransfer: {
        files: [largeFile],
      },
    });
    
    await waitFor(() => {
      expect(screen.getByText(/File size exceeds the 5MB limit/i)).toBeInTheDocument();
    });
    
    expect(onFileUploadedMock).not.toHaveBeenCalled();
  });

  test('shows upload progress during file upload', async () => {
    render(<FileUploader {...defaultProps} />);
    
    const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const uploadArea = screen.getByTestId('upload-dropzone');
    
    // Simulate file drop
    fireEvent.drop(uploadArea, {
      dataTransfer: {
        files: [file],
      },
    });
    
    await waitFor(() => {
      expect(screen.getByText(/Uploading/i)).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  test('calls onFileUploaded callback when upload is successful', async () => {
    render(<FileUploader {...defaultProps} />);
    
    const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const uploadArea = screen.getByTestId('upload-dropzone');
    
    // Simulate file drop
    fireEvent.drop(uploadArea, {
      dataTransfer: {
        files: [file],
      },
    });
    
    await waitFor(() => {
      expect(onFileUploadedMock).toHaveBeenCalledWith({
        success: true,
        fileId: 'test-file-id',
        fileName: 'test.pdf',
        fileSize: 1024,
        previewUrl: 'test-preview-url',
      });
    });
  });

  test('allows larger files for premium subscribers', async () => {
    render(<FileUploader 
      {...defaultProps} 
      isPremiumFeature={true} 
      userSubscription={{ active: true }} 
    />);
    
    // Create a mock file larger than the default max size but allowed for premium
    const largeFile = new File(['x'.repeat(10 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(largeFile, 'size', { value: 10 * 1024 * 1024 });
    
    const uploadArea = screen.getByTestId('upload-dropzone');
    
    // Simulate file drop
    fireEvent.drop(uploadArea, {
      dataTransfer: {
        files: [largeFile],
      },
    });
    
    // Should not show error since user has premium
    await waitFor(() => {
      expect(screen.queryByText(/File size exceeds/i)).not.toBeInTheDocument();
    });
    
    expect(screen.getByText(/Uploading/i)).toBeInTheDocument();
  });
});