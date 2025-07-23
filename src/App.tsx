import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import './App.css';
import { useAuth } from './contexts/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';

function App() {
  const { user, loading, signOut } = useAuth();

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
          <Link to="/" className="navbar-brand">
            Family Tree
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