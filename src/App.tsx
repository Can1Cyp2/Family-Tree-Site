import React, { useState, useRef } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import './App.css';
import { useAuth } from './contexts/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import logo from './logo.svg';
import binoopetGif from './Binoopet.gif';

function App() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [showHoverGif, setShowHoverGif] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);

  const handleMouseEnter = () => {
    console.log('=== MOUSE ENTER EVENT TRIGGERED ===');
    console.log('Mouse entered logo area, isHovering:', isHoveringRef.current);
    
    // If already hovering, ignore
    if (isHoveringRef.current) {
      console.log('Already hovering, ignoring');
      return;
    }
    
    isHoveringRef.current = true;
    console.log('Set isHovering to true');
    
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      console.log('Cleared existing timeout');
    }
    
    // Set a new timeout to show the overlay after 300ms
    hoverTimeoutRef.current = setTimeout(() => {
      console.log('Timeout fired, isHovering:', isHoveringRef.current);
      if (isHoveringRef.current) {
        console.log('Showing overlay after delay');
        setShowHoverGif(true);
      }
    }, 300);
    console.log('Set new timeout for 300ms');
  };

  const handleMouseLeave = () => {
    console.log('=== MOUSE LEAVE EVENT TRIGGERED ===');
    console.log('Mouse left logo area, isHovering:', isHoveringRef.current);
    
    // Only process if we were actually hovering
    if (!isHoveringRef.current) {
      console.log('Was not hovering, ignoring');
      return;
    }
    
    isHoveringRef.current = false;
    console.log('Set isHovering to false');
    
    // Clear the show timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
      console.log('Cleared timeout');
    }
    
    // Hide the overlay
    console.log('Hiding overlay');
    setShowHoverGif(false);
  };

  const handleLogoClick = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="loading">
        Loading...
      </div>
    );
  }

  return (
    <div className="App">
      <nav className="navbar">
        <div className="navbar-content">
          <div 
            className="navbar-brand-container"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleLogoClick}
          >
            <div className="navbar-brand">
              <img 
                src={logo} 
                alt="Family Tree Logo" 
                className="navbar-logo"
              />
              <span>Family Tree</span>
            </div>
          </div>
          <div className="navbar-nav">
            {user ? (
              <>
                <span className="user-info">Welcome, {user.email}</span>
                <Link to="/dashboard">Dashboard</Link>
                <button onClick={signOut} className="btn btn-secondary">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Login</Link>
                <Link to="/signup">Sign Up</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hover GIF Overlay */}
      {showHoverGif && (
        <div className="hover-gif-overlay">
          <div className="hover-gif-container">
            <div className="hover-gif-content">
              <img src={binoopetGif} alt="Binoopet Animation" className="hover-logo" />
            </div>
          </div>
        </div>
      )}

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;