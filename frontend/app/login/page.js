"use client";

import axios from 'axios';
import { useRouter } from "next/navigation";
import { useState } from 'react';
import {
    FiLock,
    FiLogIn,
    FiShield,
    FiUser
} from 'react-icons/fi';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || process.env.REACT_APP_AUTH_API_URL || 'http://localhost:5001';

const Login = () => {
  const navigate = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    
    try {
      console.log('[Login] Sending request', { url: `${AUTH_API_URL}/api/auth/login`, username: formData.username });
      const response = await axios.post(`${AUTH_API_URL}/api/auth/login`, formData);
      console.log('[Login] Response received', response.data);
      // Store token, session ID, and user info in sessionStorage
      sessionStorage.setItem('authToken', response.data.token);
      sessionStorage.setItem('sessionId', response.data.sessionId);
      sessionStorage.setItem('username', response.data.user.username);
      sessionStorage.setItem('userRole', response.data.user.role);
      sessionStorage.setItem('userId', response.data.user.id);
      
      if (response.data.user.organizationId) {
        sessionStorage.setItem('organizationId', response.data.user.organizationId);
      }
      
      toast.success('Login successful!');
      
      // Redirect based on role
      setTimeout(() => {
        navigate.push('/dashboard');
      }, 1000);
      
    } catch (error) {
      console.error('[Login] Error', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      const errorMessage = error.response?.data?.error || 'Login failed. Please try again.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <ToastContainer position="top-right" />
      
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-center">
            <div className="inline-block p-4 bg-white/10 rounded-2xl backdrop-blur-sm mb-4">
              <FiShield className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">SecureWipe Pro</h1>
            <p className="text-blue-100">Military-grade file deletion platform</p>
          </div>
          
          {/* Login Form */}
          <div className="p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
              Welcome Back
            </h2>
            
            <form onSubmit={handleLogin}>
              {/* Username */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiUser className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>
              
              {/* Password */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiLock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="••••••••"
                    minLength="6"
                    required
                  />
                </div>
              </div>
              
              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all ${
                  loading 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-t-2 border-white rounded-full animate-spin mr-2"></div>
                    Processing...
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <FiLogIn className="w-5 h-5 mr-2" />
                    Sign In
                  </div>
                )}
              </button>
            </form>
            
            {/* Link to Signup */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Don't have an account?{' '}
                <button
                  onClick={() => navigate.push('/signup')}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Sign Up
                </button>
              </p>
            </div>
          </div>
          
          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              SecureWipe Pro © 2024 • Military-grade file deletion
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;