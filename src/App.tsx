import React, { useState, useRef, useEffect } from 'react';
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

  useEffect(() => {
    signOut();
  }, [signOut]);

  const handleMouseEnter = () => {
    console.log('Mouse entered logo area, isHovering:', isHoveringRef.current);
    
    if (isHoveringRef.current) {
      console.log('Already hovering, ignoring');
      return;
    }
    
    isHoveringRef.current = true;
    console.log('Set isHovering to true');
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      console.log('Cleared existing timeout');
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      console.log('Timeout fired, isHovering:', isHoveringRef.current);
      if (isHoveringRef.current) {
        console.log('Showing overlay after delay');
        setShowHoverGif(true);
      }
    }, 3000); // 3 seconds
  };

  const handleMouseLeave = () => {
    console.log('Mouse left logo area, isHovering:', isHoveringRef.current);
    
    if (!isHoveringRef.current) {
      console.log('Was not hovering, ignoring');
      return;
    }
    
    isHoveringRef.current = false;
    console.log('Set isHovering to false');
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
      console.log('Cleared timeout');
    }
    
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

      {/* Hover GIF Overlay - Using a different approach */}
      {showHoverGif && (
        <div 
          className="hover-gif-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000, // Higher than modals
            animation: 'fadeIn 0.3s ease-in-out',
            pointerEvents: 'none' // Allow clicks to pass through
          }}
        >
          <div 
            className="hover-gif-container"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              animation: 'growIn 0.5s ease-out'
            }}
          >
            <div className="hover-gif-content">
              <img 
                src={binoopetGif} 
                alt="Binoopet Animation" 
                className="hover-logo"
                style={{
                  width: '300px',
                  height: '300px',
                  objectFit: 'contain',
                  animation: 'pulse 2s infinite',
                  filter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.5))'
                }}
              />
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