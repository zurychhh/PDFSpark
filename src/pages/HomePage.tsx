import './HomePage.css';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              PDF tools made <span className="accent">simple</span>
            </h1>
            <p className="hero-description">
              Fast, reliable, and secure PDF tools that save you time.
              Convert, edit, and optimize your PDF files in seconds.
            </p>
            <div className="hero-buttons">
              <Link to="/convert/pdf-to-word" className="btn-primary">
                Convert PDF to Word
              </Link>
              <Link to="/tools" className="btn-secondary">
                View All Tools
              </Link>
            </div>
          </div>
          <div className="hero-image">
            <img src="/hero-illustration.svg" alt="PDF conversion illustration" />
          </div>
        </div>
      </section>

      {/* Popular Tools Section */}
      <section className="tools-section">
        <div className="section-container">
          <h2 className="section-title">Popular PDF Tools</h2>
          <p className="section-description">
            Quick, easy-to-use PDF tools to help you work more efficiently.
          </p>

          <div className="tools-grid">
            <Link to="/convert/pdf-to-word" className="tool-card">
              <div className="tool-icon">📄</div>
              <h3 className="tool-title">PDF to Word</h3>
              <p className="tool-description">
                Convert PDF to editable Word documents with formatting intact.
              </p>
            </Link>

            <Link to="/convert/pdf-to-excel" className="tool-card">
              <div className="tool-icon">📊</div>
              <h3 className="tool-title">PDF to Excel</h3>
              <p className="tool-description">
                Extract tables from PDFs into Excel spreadsheets.
              </p>
            </Link>

            <Link to="/tools/compress-pdf" className="tool-card">
              <div className="tool-icon">🗜️</div>
              <h3 className="tool-title">Compress PDF</h3>
              <p className="tool-description">
                Reduce PDF file size while maintaining quality.
              </p>
            </Link>

            <Link to="/tools/merge-pdf" className="tool-card">
              <div className="tool-icon">🔗</div>
              <h3 className="tool-title">Merge PDF</h3>
              <p className="tool-description">
                Combine multiple PDFs into a single document.
              </p>
            </Link>

            <Link to="/tools/split-pdf" className="tool-card">
              <div className="tool-icon">✂️</div>
              <h3 className="tool-title">Split PDF</h3>
              <p className="tool-description">
                Extract pages or split PDFs into multiple files.
              </p>
            </Link>

            <Link to="/convert/pdf-to-ppt" className="tool-card">
              <div className="tool-icon">📝</div>
              <h3 className="tool-title">PDF to PowerPoint</h3>
              <p className="tool-description">
                Convert PDFs to editable PowerPoint presentations.
              </p>
            </Link>
          </div>

          <div className="see-all-link">
            <Link to="/tools">See all PDF tools →</Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-container">
          <h2 className="section-title">Why Choose PDFSpark?</h2>
          <p className="section-description">
            PDFSpark is designed to make working with PDF files quick, easy, and painless.
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3 className="feature-title">Lightning Fast</h3>
              <p className="feature-description">
                Get your PDFs processed in seconds, not minutes. Our optimized algorithms ensure you never wait long.
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
              <h3 className="feature-title">Transparent Pricing</h3>
              <p className="feature-description">
                No hidden fees or surprise charges. Pay only for premium features you need, or subscribe for unlimited access.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section">
        <div className="section-container">
          <h2 className="section-title">How It Works</h2>
          <p className="section-description">
            PDFSpark makes PDF conversion simple and straightforward.
          </p>

          <div className="steps-container">
            <div className="step-item">
              <div className="step-number">1</div>
              <h3 className="step-title">Upload Your PDF</h3>
              <p className="step-description">
                Upload your PDF file by dragging and dropping it or choosing it from your device.
              </p>
            </div>

            <div className="step-item">
              <div className="step-number">2</div>
              <h3 className="step-title">Choose Your Options</h3>
              <p className="step-description">
                Select the output format and any additional settings you need.
              </p>
            </div>

            <div className="step-item">
              <div className="step-number">3</div>
              <h3 className="step-title">Download Result</h3>
              <p className="step-description">
                Get your converted file instantly and download it to your device.
              </p>
            </div>
          </div>

          <div className="cta-container">
            <Link to="/convert/pdf-to-word" className="btn-primary">Try It Now</Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;