import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';

// Components
import Layout from './components/Layout';

// Pages
import HomePage from './pages/HomePage';
import ConversionPage from './pages/ConversionPage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/convert/pdf-to-word" element={<ConversionPage defaultFormat="docx" />} />
          <Route path="/convert/pdf-to-excel" element={<ConversionPage defaultFormat="xlsx" />} />
          <Route path="/convert/pdf-to-ppt" element={<ConversionPage defaultFormat="pptx" />} />
          <Route path="/convert/pdf-to-image" element={<ConversionPage defaultFormat="jpg" />} />
          <Route path="/convert/pdf-to-text" element={<ConversionPage defaultFormat="txt" />} />
          <Route path="/tools/compress-pdf" element={<ConversionPage defaultFormat="docx" />} />
          <Route path="/tools/merge-pdf" element={<ConversionPage defaultFormat="docx" />} />
          <Route path="/tools/split-pdf" element={<ConversionPage defaultFormat="docx" />} />
          <Route path="/tools/protect-pdf" element={<ConversionPage defaultFormat="docx" />} />
          <Route path="/tools/unlock-pdf" element={<ConversionPage defaultFormat="docx" />} />
          <Route path="/tools" element={<HomePage />} />
          <Route path="/pricing" element={<HomePage />} />
          <Route path="/blog" element={<HomePage />} />
          <Route path="/contact" element={<HomePage />} />
          <Route path="/about" element={<HomePage />} />
          <Route path="/careers" element={<HomePage />} />
          <Route path="/privacy-policy" element={<HomePage />} />
          <Route path="/terms-of-service" element={<HomePage />} />
          <Route path="/cookie-policy" element={<HomePage />} />
          <Route path="/gdpr" element={<HomePage />} />
          <Route path="/sitemap" element={<HomePage />} />
          <Route path="/help" element={<HomePage />} />
          <Route path="/feedback" element={<HomePage />} />
          <Route path="/login" element={<HomePage />} />
          <Route path="/signup" element={<HomePage />} />
          
          {/* Add fallback route */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
