import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  useEffect(() => {
    // Handle the auth callback from email link
    const handleAuthCallback = async () => {
      const currentUrl = window.location.href;
      console.log('Current URL:', currentUrl);
      
      // Check if we're on the wrong domain (Backendless URL)
      if (currentUrl.includes('support.backendless.com')) {
        // Extract the token and redirect to correct URL
        const tokenMatch = currentUrl.match(/access_token=([a-f0-9]+)/);
        const typeMatch = currentUrl.match(/type=(\w+)/);
        
        if (tokenMatch && typeMatch) {
          const token = tokenMatch[1];
          const type = typeMatch[1];
          const correctUrl = `http://localhost:3000/Family-Tree-Site/reset-password#access_token=${token}&type=${type}`;
          console.log('Redirecting to correct URL:', correctUrl);
          window.location.href = correctUrl;
          return;
        }
      }
      
      // Extract token from URL (either query params or hash)
      let accessToken = searchParams.get('access_token');
      let type = searchParams.get('type');
      
      // Check URL hash if not in search params
      if (!accessToken) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        accessToken = hashParams.get('access_token');
        type = hashParams.get('type');
      }
      
      // Try to extract from anywhere in the URL as fallback
      if (!accessToken) {
        const tokenMatch = currentUrl.match(/access_token=([a-f0-9]+)/);
        if (tokenMatch) {
          accessToken = tokenMatch[1];
        }
      }
      
      console.log('Access Token:', accessToken);
      console.log('Type:', type);
      
      if (accessToken) {
        try {
          // Use verifyOtp for recovery tokens
          const { error } = await supabase.auth.verifyOtp({
            token_hash: accessToken,
            type: 'recovery'
          });
          
          if (error) {
            console.error('Error with verifyOtp:', error);
            setError('Invalid or expired reset link. Please request a new password reset.');
          } else {
            console.log('Successfully verified token');
            // Token is valid, user can now reset password
          }
        } catch (error: any) {
          console.error('Error in auth callback:', error);
          setError('Error processing reset link. Please try again.');
        }
      } else {
        console.log('No access token found');
        setError('Invalid reset link. Please request a new password reset.');
      }
    };

    handleAuthCallback();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    
    try {
      setError('');
      setLoading(true);
      
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) throw error;
      
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
      
    } catch (error: any) {
      setError(error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
          <h2>Password Updated!</h2>
          <div className="alert alert-success">
            Your password has been successfully updated. Redirecting to login...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
        <h2>Reset Password</h2>
        
        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button 
            type="button"
            onClick={() => navigate('/login')}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#007bff', 
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
          >
            Back to Login
          </button>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
