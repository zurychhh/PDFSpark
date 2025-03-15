import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Footer from './Footer';

describe('Footer Component', () => {
  const renderFooter = () => {
    return render(
      <BrowserRouter>
        <Footer />
      </BrowserRouter>
    );
  };

  test('renders company tagline', () => {
    renderFooter();
    expect(screen.getByText('Fast. Accurate. No complications.')).toBeInTheDocument();
  });

  test('renders copyright information with current year', () => {
    renderFooter();
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${currentYear} PDFSpark`))).toBeInTheDocument();
  });

  test('renders social media links', () => {
    renderFooter();
    const socialLinks = screen.getAllByRole('link', { name: /social/i });
    expect(socialLinks.length).toBeGreaterThanOrEqual(3);
  });

  test('renders navigation sections', () => {
    renderFooter();
    expect(screen.getByText('Convert')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
  });

  test('renders PDF conversion links', () => {
    renderFooter();
    expect(screen.getByText('PDF to Word')).toBeInTheDocument();
    expect(screen.getByText('PDF to Excel')).toBeInTheDocument();
    expect(screen.getByText('PDF to PowerPoint')).toBeInTheDocument();
  });

  test('renders tool links', () => {
    renderFooter();
    expect(screen.getByText('Compress PDF')).toBeInTheDocument();
    expect(screen.getByText('Merge PDF')).toBeInTheDocument();
    expect(screen.getByText('Split PDF')).toBeInTheDocument();
  });

  test('renders company links', () => {
    renderFooter();
    expect(screen.getByText('About Us')).toBeInTheDocument();
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('Blog')).toBeInTheDocument();
  });

  test('renders legal links', () => {
    renderFooter();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
    expect(screen.getByText('Cookie Policy')).toBeInTheDocument();
  });
});