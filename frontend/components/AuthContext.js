import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AUTH_API_URL = process.env.REACT_APP_AUTH_API_URL || 'http://localhost:5001';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = sessionStorage.getItem('authToken');
    
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(
        `${AUTH_API_URL}/api/auth/verify`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.valid) {
        setUser(response.data.user);
        setIsAuthenticated(true);
        
        // Update session storage with latest user data
        sessionStorage.setItem('userEmail', response.data.user.email);
        sessionStorage.setItem('userRole', response.data.user.role);
        sessionStorage.setItem('userId', response.data.user.id);
      } else {
        logout();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${AUTH_API_URL}/api/auth/login`, {
        email,
        password
      });

      // Store auth data
      const { token, user } = response.data;
      sessionStorage.setItem('authToken', token);
      sessionStorage.setItem('userEmail', user.email);
      sessionStorage.setItem('userRole', user.role);
      sessionStorage.setItem('userId', user.id);
      sessionStorage.setItem('sessionId', token.split('.')[2]);
      
      if (user.organizationId) {
        sessionStorage.setItem('organizationId', user.organizationId);
      }

      setUser(user);
      setIsAuthenticated(true);
      
      return { success: true, user };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Login failed' 
      };
    }
  };

  const signup = async (email, password, role) => {
    try {
      const response = await axios.post(`${AUTH_API_URL}/api/auth/signup`, {
        email,
        password,
        role
      });

      // Store auth data
      const { token, user } = response.data;
      sessionStorage.setItem('authToken', token);
      sessionStorage.setItem('userEmail', user.email);
      sessionStorage.setItem('userRole', user.role);
      sessionStorage.setItem('userId', user.id);
      sessionStorage.setItem('sessionId', token.split('.')[2]);
      
      if (user.organizationId) {
        sessionStorage.setItem('organizationId', user.organizationId);
      }

      setUser(user);
      setIsAuthenticated(true);
      
      return { success: true, user };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Signup failed' 
      };
    }
  };

  const logout = () => {
    // Clear session storage
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('userRole');
    sessionStorage.setItem('userId');
    sessionStorage.removeItem('sessionId');
    sessionStorage.removeItem('organizationId');
    
    // Clear state
    setUser(null);
    setIsAuthenticated(false);
    
    // Optional: Call logout API
    const token = sessionStorage.getItem('authToken');
    if (token) {
      axios.post(`${AUTH_API_URL}/api/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(console.error);
    }
  };

  const getAuthToken = () => {
    return sessionStorage.getItem('authToken');
  };

  const getUserRole = () => {
    return sessionStorage.getItem('userRole');
  };

  const isManager = () => {
    return getUserRole() === 'organization-manager';
  };

  const isEmployee = () => {
    return getUserRole() === 'organization-employee';
  };

  const isIndividual = () => {
    return getUserRole() === 'individual';
  };

  const getSessionData = () => {
    return {
      email: sessionStorage.getItem('userEmail'),
      role: sessionStorage.getItem('userRole'),
      userId: sessionStorage.getItem('userId'),
      sessionId: sessionStorage.getItem('sessionId'),
      organizationId: sessionStorage.getItem('organizationId'),
      token: sessionStorage.getItem('authToken')
    };
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    signup,
    logout,
    checkAuth,
    getAuthToken,
    getUserRole,
    isManager,
    isEmployee,
    isIndividual,
    getSessionData
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};