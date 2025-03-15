import { useEffect, useState } from 'react';
import PDFConverter from '../components/PDFConverter';
import './ConversionPage.css';

interface ConversionPageProps {
  defaultFormat?: 'docx' | 'xlsx' | 'pptx' | 'jpg' | 'txt';
}

const ConversionPage: React.FC<ConversionPageProps> = ({ defaultFormat = 'docx' }) => {
  const [formatName, setFormatName] = useState<string>('Word');

  useEffect(() => {
    // Update the format name based on the default format
    switch (defaultFormat) {
      case 'docx':
        setFormatName('Word');
        break;
      case 'xlsx':
        setFormatName('Excel');
        break;
      case 'pptx':
        setFormatName('PowerPoint');
        break;
      case 'jpg':
        setFormatName('Image');
        break;
      case 'txt':
        setFormatName('Text');
        break;
      default:
        setFormatName('Word');
    }
  }, [defaultFormat]);

  return (
    <div className="conversion-page">
      <div className="page-header">
        <h1 className="page-title">Convert PDF to {formatName}</h1>
        <p className="page-description">
          Convert your PDF documents to {formatName} format with our easy-to-use online tool.
          Get high-quality conversions in seconds.
        </p>
      </div>

      <div className="converter-wrapper">
        <PDFConverter defaultFormat={defaultFormat} />
      </div>

      <div className="features-section">
        <h2 className="section-title">Why use PDFSpark for PDF to {formatName} conversion?</h2>
        
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3 className="feature-title">Lightning Fast</h3>
            <p className="feature-description">
              Convert your PDFs in seconds, not minutes. Our optimized algorithms ensure you never wait long.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3 className="feature-title">100% Secure</h3>
            <p className="feature-description">
              Your files are automatically deleted after processing. We never store your data longer than necessary.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">💯</div>
            <h3 className="feature-title">High Quality</h3>
            <p className="feature-description">
              Professional-grade results that preserve formatting, images, and layouts better than other online tools.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">💸</div>
            <h3 className="feature-title">Completely Free</h3>
            <p className="feature-description">
              Convert PDFs without limitations. No hidden fees, no complicated pricing plans.
            </p>
          </div>
        </div>
      </div>

      <div className="how-it-works-section">
        <h2 className="section-title">How It Works</h2>
        
        <div className="steps-container">
          <div className="step-item">
            <div className="step-number">1</div>
            <h3 className="step-title">Upload</h3>
            <p className="step-description">
              Upload your PDF file by dragging and dropping it or choosing it from your device.
            </p>
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <h3 className="step-title">Convert</h3>
            <p className="step-description">
              Click the Convert button and let our tool process your document. It usually takes just a few seconds.
            </p>
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <h3 className="step-title">Download</h3>
            <p className="step-description">
              Download your converted {formatName} file and start using it right away!
            </p>
          </div>
        </div>
      </div>

      <div className="faq-section">
        <h2 className="section-title">Frequently Asked Questions</h2>
        
        <div className="faq-items">
          <div className="faq-item">
            <h3 className="faq-question">How accurate is the PDF to {formatName} conversion?</h3>
            <p className="faq-answer">
              Our conversion engine preserves the original formatting, fonts, images, and layout as closely as possible. 
              For complex documents, minor adjustments might be needed, but most conversions are highly accurate.
            </p>
          </div>

          <div className="faq-item">
            <h3 className="faq-question">Is there a file size limit?</h3>
            <p className="faq-answer">
              Free users can convert PDFs up to 5MB. For larger files, consider upgrading to our premium plan.
            </p>
          </div>

          <div className="faq-item">
            <h3 className="faq-question">How long does the conversion take?</h3>
            <p className="faq-answer">
              Most conversions complete in less than 30 seconds. Very large or complex documents might take a bit longer.
            </p>
          </div>

          <div className="faq-item">
            <h3 className="faq-question">Is my data secure?</h3>
            <p className="faq-answer">
              Yes, we take security seriously. All file transfers are encrypted, and files are automatically deleted from 
              our servers after processing. We don't access or analyze your document content.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversionPage;