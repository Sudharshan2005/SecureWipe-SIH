"use client";

import React, { useState } from 'react';
import axios from 'axios';
import { useRouter } from "next/navigation";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  FiMail,
  FiLock,
  FiLogIn,
  FiUserPlus,
  FiShield,
  FiBuilding,
  FiUsers,
  FiUser
} from 'react-icons/fi';

const AUTH_API_URL = process.env.REACT_APP_AUTH_API_URL || 'http://localhost:5001';

const Login = () => {
  const navigate = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.post(`${AUTH_API_URL}/api/auth/login`, formData);
      
      // Store token and user info in sessionStorage
      sessionStorage.setItem('authToken', response.data.token);
      sessionStorage.setItem('userEmail', response.data.user.email);
      sessionStorage.setItem('userRole', response.data.user.role);
      sessionStorage.setItem('userId', response.data.user.id);
      
      if (response.data.user.organizationId) {
        sessionStorage.setItem('organizationId', response.data.user.organizationId);
      }
      
      // Store session ID (using token as session ID)
      sessionStorage.setItem('sessionId', response.data.token.split('.')[2]);
      
      toast.success('Login successful!');
      
      // Redirect based on role
      setTimeout(() => {
        navigate.push('/dashboard');
      }, 1000);
      
    } catch (error) {
      console.error('Login error:', error);
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
              {showSignup ? 'Create Account' : 'Welcome Back'}
            </h2>
            
            <form onSubmit={handleLogin}>
              {/* Email */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiMail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="you@example.com"
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
                    {showSignup ? 'Create Account' : 'Sign In'}
                  </div>
                )}
              </button>
            </form>
            
            {/* Role Selection for Signup */}
            {showSignup && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Account Type
                </label>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    className="p-4 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                    onClick={() => {
                      sessionStorage.setItem('signupRole', 'individual');
                      setFormData({...formData, role: 'individual'});
                    }}
                  >
                    <div className="flex items-center">
                      <FiUser className="w-6 h-6 text-blue-600 mr-3" />
                      <div>
                        <div className="font-semibold text-gray-900">Individual</div>
                        <div className="text-sm text-gray-600">Personal file deletion</div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    type="button"
                    className="p-4 border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors text-left"
                    onClick={() => {
                      sessionStorage.setItem('signupRole', 'organization-manager');
                      setFormData({...formData, role: 'organization-manager'});
                    }}
                  >
                    <div className="flex items-center">
                      <FiBuilding className="w-6 h-6 text-green-600 mr-3" />
                      <div>
                        <div className="font-semibold text-gray-900">Organization Manager</div>
                        <div className="text-sm text-gray-600">Manage team file deletion</div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    type="button"
                    className="p-4 border-2 border-gray-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-colors text-left"
                    onClick={() => {
                      sessionStorage.setItem('signupRole', 'organization-employee');
                      setFormData({...formData, role: 'organization-employee'});
                    }}
                  >
                    <div className="flex items-center">
                      <FiUsers className="w-6 h-6 text-purple-600 mr-3" />
                      <div>
                        <div className="font-semibold text-gray-900">Organization Employee</div>
                        <div className="text-sm text-gray-600">Team member file deletion</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}
            
            {/* Toggle between Login/Signup */}
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowSignup(!showSignup)}
                className="text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center mx-auto"
              >
                {showSignup ? (
                  <>
                    <FiLogIn className="w-4 h-4 mr-2" />
                    Already have an account? Sign In
                  </>
                ) : (
                  <>
                    <FiUserPlus className="w-4 h-4 mr-2" />
                    Don't have an account? Sign Up
                  </>
                )}
              </button>
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