import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleToolsDropdown = () => {
    setIsToolsDropdownOpen(!isToolsDropdownOpen);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <Link to="/" className="logo">
            <span className="logo-text">PDF</span>
            <span className="logo-accent">Spark</span>
          </Link>
        </div>

        <div className={`navbar-menu ${isMenuOpen ? 'active' : ''}`}>
          <ul className="navbar-nav">
            <li className="nav-item has-dropdown">
              <button 
                className="nav-link dropdown-toggle"
                onClick={toggleToolsDropdown}
              >
                Tools
                <svg 
                  className={`dropdown-icon ${isToolsDropdownOpen ? 'open' : ''}`}
                  width="10" 
                  height="6" 
                  viewBox="0 0 10 6" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className={`dropdown-menu ${isToolsDropdownOpen ? 'show' : ''}`}>
                <div className="dropdown-header">Convert PDF to</div>
                <Link to="/convert/pdf-to-word" className="dropdown-item">
                  <span className="dropdown-item-icon">📄</span>
                  Word
                </Link>
                <Link to="/convert/pdf-to-excel" className="dropdown-item">
                  <span className="dropdown-item-icon">📊</span>
                  Excel
                </Link>
                <Link to="/convert/pdf-to-ppt" className="dropdown-item">
                  <span className="dropdown-item-icon">📝</span>
                  PowerPoint
                </Link>
                <Link to="/convert/pdf-to-image" className="dropdown-item">
                  <span className="dropdown-item-icon">🖼️</span>
                  Image
                </Link>
                <div className="dropdown-divider"></div>

                <div className="dropdown-header">PDF Tools</div>
                <Link to="/tools/compress-pdf" className="dropdown-item">
                  <span className="dropdown-item-icon">🗜️</span>
                  Compress PDF
                </Link>
                <Link to="/tools/merge-pdf" className="dropdown-item">
                  <span className="dropdown-item-icon">🔗</span>
                  Merge PDF
                </Link>
                <Link to="/tools/split-pdf" className="dropdown-item">
                  <span className="dropdown-item-icon">✂️</span>
                  Split PDF
                </Link>
              </div>
            </li>
            <li className="nav-item">
              <Link to="/pricing" className="nav-link">Pricing</Link>
            </li>
            <li className="nav-item">
              <Link to="/blog" className="nav-link">Blog</Link>
            </li>
            <li className="nav-item">
              <Link to="/contact" className="nav-link">Contact</Link>
            </li>
          </ul>

          <div className="navbar-auth">
            <Link to="/login" className="btn-login">Login</Link>
            <Link to="/signup" className="btn-signup">Sign Up</Link>
          </div>
        </div>

        <button 
          className={`navbar-toggler ${isMenuOpen ? 'active' : ''}`}
          onClick={toggleMenu}
        >
          <span className="toggler-bar"></span>
          <span className="toggler-bar"></span>
          <span className="toggler-bar"></span>
        </button>
      </div>
    </nav>
  );
};

export default Navbar;