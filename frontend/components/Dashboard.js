import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import {
  FiUser,
  FiShield,
  FiSettings,
  FiLogOut,
  FiBell,
  FiBarChart2,
  FiFileText,
  FiUsers,
  FiHome,
  FiActivity,
  FiHardDrive
} from 'react-icons/fi';

const Dashboard = () => {
  const { user, logout, getSessionData } = useAuth();
  const navigate = useNavigate();
  const sessionData = getSessionData();

  useEffect(() => {
    // Log session data for debugging
    console.log('Session Data:', sessionData);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getWelcomeMessage = () => {
    if (!user) return 'Welcome';
    
    switch(user.role) {
      case 'individual':
        return `Welcome, ${user.email}`;
      case 'organization-manager':
        return `Welcome, Manager ${user.email}`;
      case 'organization-employee':
        return `Welcome, ${user.email}`;
      default:
        return 'Welcome';
    }
  };

  const getRoleBadge = () => {
    if (!user) return null;
    
    const roleConfig = {
      'individual': { color: 'bg-blue-100 text-blue-800', label: 'Individual' },
      'organization-manager': { color: 'bg-green-100 text-green-800', label: 'Organization Manager' },
      'organization-employee': { color: 'bg-purple-100 text-purple-800', label: 'Organization Employee' }
    };
    
    const config = roleConfig[user.role];
    if (!config) return null;
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <FiShield className="h-8 w-8 text-blue-600" />
                <span className="ml-2 text-xl font-bold text-gray-900">SecureWipe Pro</span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <a
                  href="#"
                  className="border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  <FiHome className="w-4 h-4 mr-2" />
                  Dashboard
                </a>
                <a
                  href="#"
                  className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  <FiFileText className="w-4 h-4 mr-2" />
                  Wipe History
                </a>
                {user?.role === 'organization-manager' && (
                  <a
                    href="#"
                    className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    <FiUsers className="w-4 h-4 mr-2" />
                    Manage Team
                  </a>
                )}
                <a
                  href="#"
                  className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  <FiBarChart2 className="w-4 h-4 mr-2" />
                  Analytics
                </a>
              </div>
            </div>
            <div className="flex items-center">
              <button className="p-2 text-gray-400 hover:text-gray-500">
                <FiBell className="h-6 w-6" />
              </button>
              <div className="ml-3 relative">
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {user?.email}
                    </div>
                    {getRoleBadge()}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none"
                  >
                    <FiLogOut className="w-4 h-4 mr-1" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {getWelcomeMessage()}
                  </h1>
                  <p className="mt-1 text-sm text-gray-600">
                    Session ID: {sessionData.sessionId?.substring(0, 12)}...
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <FiActivity className="w-6 h-6 text-green-500" />
                  <span className="text-sm font-medium text-green-600">Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Role-Based Features */}
        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Available Actions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Secure Wipe - Available for all */}
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <FiHardDrive className="h-10 w-10 text-blue-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Secure File Wipe
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900">
                          Delete Files Securely
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => navigate('/wipe')}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
                  >
                    Start Wiping
                  </button>
                </div>
              </div>
            </div>

            {/* Wipe History - Available for all */}
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <FiFileText className="h-10 w-10 text-green-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Wipe History
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900">
                          View Past Deletions
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => navigate('/history')}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none"
                  >
                    View History
                  </button>
                </div>
              </div>
            </div>

            {/* Team Management - Only for organization managers */}
            {user?.role === 'organization-manager' && (
              <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiUsers className="h-10 w-10 text-purple-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Team Management
                        </dt>
                        <dd>
                          <div className="text-lg font-medium text-gray-900">
                            Manage Organization
                          </div>
                        </dd>
                      </dl>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => navigate('/team')}
                      className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none"
                    >
                      Manage Team
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Settings - Available for all */}
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <FiSettings className="h-10 w-10 text-gray-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Account Settings
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900">
                          Manage Account
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => navigate('/settings')}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none"
                  >
                    Open Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Session Info Card */}
        <div className="mt-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Session Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Email:</span>
                    <span className="text-sm font-medium">{sessionData.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Role:</span>
                    <span className="text-sm font-medium">{sessionData.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">User ID:</span>
                    <span className="text-sm font-medium text-gray-500">
                      {sessionData.userId?.substring(0, 8)}...
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Session ID:</span>
                    <span className="text-sm font-medium text-gray-500">
                      {sessionData.sessionId?.substring(0, 12)}...
                    </span>
                  </div>
                  {sessionData.organizationId && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Organization ID:</span>
                      <span className="text-sm font-medium text-gray-500">
                        {sessionData.organizationId?.substring(0, 8)}...
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Login Time:</span>
                    <span className="text-sm font-medium">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;