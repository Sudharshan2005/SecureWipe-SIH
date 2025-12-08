import React, { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation'; // Correct import for App Router
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  FiMail,
  FiLock,
  FiUserPlus,
  FiShield,
  FiUser,
  FiBuilding,
  FiUsers,
  FiArrowLeft
} from 'react-icons/fi';
import Link from 'next/link';

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:5001';

const Signup = () => {
  const router = useRouter(); // Use hook correctly
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    role: 'individual'
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRoleSelect = (role) => {
    setFormData({
      ...formData,
      role
    });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.email || !formData.password || !formData.confirmPassword || !formData.role) {
      toast.error('Please fill in all fields');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.post(`${AUTH_API_URL}/api/auth/signup`, {
        email: formData.email,
        password: formData.password,
        role: formData.role
      });
      
      // Store token and user info in sessionStorage
      sessionStorage.setItem('authToken', response.data.token);
      sessionStorage.setItem('userEmail', response.data.user.email);
      sessionStorage.setItem('userRole', response.data.user.role);
      sessionStorage.setItem('userId', response.data.user.id);
      
      if (response.data.user.organizationId) {
        sessionStorage.setItem('organizationId', response.data.user.organizationId);
      }
      
      // Store session ID
      sessionStorage.setItem('sessionId', response.data.token.split('.')[2]);
      
      toast.success('Account created successfully!');
      
      // Redirect to dashboard
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
      
    } catch (error) {
      console.error('Signup error:', error);
      const errorMessage = error.response?.data?.error || 'Signup failed. Please try again.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4">
      <ToastContainer position="top-right" />
      
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-teal-700 p-8 text-center">
            <div className="inline-block p-4 bg-white/10 rounded-2xl backdrop-blur-sm mb-4">
              <FiShield className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
            <p className="text-green-100">Join SecureWipe Pro today</p>
          </div>
          
          {/* Back to Login */}
          <div className="px-8 pt-6">
            <Link 
              href="/login" 
              className="inline-flex items-center text-green-600 hover:text-green-800"
            >
              <FiArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Link>
          </div>
          
          {/* Signup Form */}
          <div className="p-8">
            <form onSubmit={handleSignup}>
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
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>
              
              {/* Password */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password (min. 6 characters)
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
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    placeholder="••••••••"
                    minLength="6"
                    required
                  />
                </div>
              </div>
              
              {/* Confirm Password */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiLock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    placeholder="••••••••"
                    minLength="6"
                    required
                  />
                </div>
              </div>
              
              {/* Role Selection */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Account Type
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Individual */}
                  <div 
                    onClick={() => handleRoleSelect('individual')}
                    className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      formData.role === 'individual' 
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className={`p-3 rounded-lg mb-2 ${
                        formData.role === 'individual' ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <FiUser className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="font-semibold text-gray-900">Individual</div>
                      <div className="text-xs text-gray-600 mt-1">Personal use</div>
                    </div>
                  </div>
                  
                  {/* Organization Manager */}
                  <div 
                    onClick={() => handleRoleSelect('organization-manager')}
                    className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      formData.role === 'organization-manager' 
                        ? 'border-green-500 bg-green-50 ring-2 ring-green-200' 
                        : 'border-gray-200 hover:border-green-300 hover:bg-green-50'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className={`p-3 rounded-lg mb-2 ${
                        formData.role === 'organization-manager' ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        <FiBuilding className="w-6 h-6 text-green-600" />
                      </div>
                      <div className="font-semibold text-gray-900">Manager</div>
                      <div className="text-xs text-gray-600 mt-1">Create organization</div>
                    </div>
                  </div>
                  
                  {/* Organization Employee */}
                  <div 
                    onClick={() => handleRoleSelect('organization-employee')}
                    className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      formData.role === 'organization-employee' 
                        ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' 
                        : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className={`p-3 rounded-lg mb-2 ${
                        formData.role === 'organization-employee' ? 'bg-purple-100' : 'bg-gray-100'
                      }`}>
                        <FiUsers className="w-6 h-6 text-purple-600" />
                      </div>
                      <div className="font-semibold text-gray-900">Employee</div>
                      <div className="text-xs text-gray-600 mt-1">Join organization</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Role Description */}
              <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                {formData.role === 'individual' && (
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Individual Account:</span> Perfect for personal file deletion needs. Full access to all wiping features.
                  </div>
                )}
                {formData.role === 'organization-manager' && (
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Organization Manager:</span> Create and manage your organization. Add employees and monitor all wiping activities.
                  </div>
                )}
                {formData.role === 'organization-employee' && (
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">Organization Employee:</span> Join an existing organization. Your manager will provide organization details.
                  </div>
                )}
              </div>
              
              {/* Terms and Conditions */}
              <div className="mb-6 text-sm text-gray-600">
                <p>By creating an account, you agree to our <a href="#" className="text-green-600 hover:underline">Terms of Service</a> and <a href="#" className="text-green-600 hover:underline">Privacy Policy</a>.</p>
              </div>
              
              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all ${
                  loading 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-t-2 border-white rounded-full animate-spin mr-2"></div>
                    Creating Account...
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <FiUserPlus className="w-5 h-5 mr-2" />
                    Create Account
                  </div>
                )}
              </button>
            </form>
          </div>
          
          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              Already have an account? <Link href="/login" className="text-green-600 hover:underline font-medium">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;