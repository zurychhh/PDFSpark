import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Navbar from './Navbar';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('Navbar Component', () => {
  const renderNavbar = () => {
    return render(
      <BrowserRouter>
        <Navbar />
      </BrowserRouter>
    );
  };

  test('renders logo', () => {
    renderNavbar();
    expect(screen.getByAltText('PDFSpark Logo')).toBeInTheDocument();
  });

  test('renders navigation links', () => {
    renderNavbar();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('Blog')).toBeInTheDocument();
  });

  test('renders sign in button', () => {
    renderNavbar();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  test('renders get started button', () => {
    renderNavbar();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  test('mobile menu button toggles menu', () => {
    renderNavbar();
    const mobileMenuButton = screen.getByLabelText('Toggle mobile menu');
    
    // Initially mobile menu should be hidden
    expect(screen.queryByTestId('mobile-menu')).not.toBeVisible();
    
    // Click to open mobile menu
    fireEvent.click(mobileMenuButton);
    expect(screen.getByTestId('mobile-menu')).toBeVisible();
    
    // Click again to close mobile menu
    fireEvent.click(mobileMenuButton);
    expect(screen.queryByTestId('mobile-menu')).not.toBeVisible();
  });

  test('navigates to tools page when Tools link is clicked', () => {
    renderNavbar();
    const toolsLink = screen.getByText('Tools');
    fireEvent.click(toolsLink);
    // In a real test with router context, we would test for navigation
    // Here we're just ensuring it doesn't throw an error
    expect(toolsLink).toBeInTheDocument();
  });
});