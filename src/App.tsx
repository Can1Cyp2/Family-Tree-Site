import React, { useState, useRef } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import './App.css';
import { useAuth } from './contexts/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import logo from './logo.svg';

function App() {
  const { user, loading, signOut } = useAuth();
  const [showHoverGif, setShowHoverGif] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    console.log('Mouse entered logo area');
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Set a new timeout to show the overlay after 3000ms = 3s
    hoverTimeoutRef.current = setTimeout(() => {
      console.log('Showing overlay after delay');
      setShowHoverGif(true);
    }, 3000);
  };

  const handleMouseLeave = () => {
    console.log('Mouse left logo area');
    // Clear the timeout if mouse leaves before the delay
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    // Hide the overlay immediately
    setShowHoverGif(false);
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
          <Link 
            to="/" 
            className="navbar-brand"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <img 
              src={logo} 
              alt="Family Tree Logo" 
              className="navbar-logo"
            />
            <span>Family Tree</span>
          </Link>
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
              <img src="./Binoopet.gif" alt="Binoopet Animation" className="hover-logo" />
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