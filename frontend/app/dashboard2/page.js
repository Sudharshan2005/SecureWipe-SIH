'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  FiFolder,
  FiFile,
  FiDownload,
  FiTrash2,
  FiRefreshCw,
  FiCheck,
  FiAlertCircle,
  FiHardDrive,
  FiClock,
  FiActivity,
  FiUpload,
  FiX,
  FiChevronDown,
  FiChevronUp,
  FiAlertTriangle,
  FiInfo,
  FiExternalLink,
  FiPlus,
  FiSearch,
  FiEye,
  FiEyeOff,
  FiArchive,
  FiList,
  FiCloud,
  FiUser,
  FiDatabase,
  FiShield,
  FiLock,
  FiUnlock,
  FiCalendar,
  FiBarChart2,
  FiGrid,
  FiLayout,
  FiServer,
  FiUsers,
  FiShare2,
  FiCopy,
  FiGlobe,
  FiCamera,
  FiVideo,
  FiCheckCircle,
  FiUserCheck,
} from 'react-icons/fi';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const FACE_VERIFICATION_URL = process.env.NEXT_PUBLIC_FACE_VERIFICATION_URL || 'http://localhost:5002';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('sessions');
  const [username, setUsername] = useState('');
  const [sessions, setSessions] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsContent, setLogsContent] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharingSessionId, setSharingSessionId] = useState('');
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalBackups: 0,
    totalFilesWiped: 0,
    totalDataWiped: 0,
    totalBackupFiles: 0
  });
  
  // Face Verification States
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const [registeringFace, setRegisteringFace] = useState(false);
  const [showFaceVerificationModal, setShowFaceVerificationModal] = useState(false);
  const [verificationStep, setVerificationStep] = useState('idle'); // idle, scanning, success, failed
  const [currentBackupToDownload, setCurrentBackupToDownload] = useState(null);

  // Get username from sessionStorage
  useEffect(() => {
    const user = sessionStorage.getItem('username') || 'example@gmail.com';
    setUsername(user);
  }, []);

  // Load all data
  useEffect(() => {
    if (username) {
      loadDashboardData();
      checkFaceRegistration();
    }
  }, [username]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load sessions
      const sessionsResponse = await axios.get(`${API_BASE_URL}/api/user/sessions-simple`, {
        params: { username }
      });
      
      if (sessionsResponse.data.success) {
        setSessions(sessionsResponse.data.sessions || []);
        
        // Load detailed session data
        const detailedSessions = await Promise.all(
          sessionsResponse.data.sessions.map(async (session) => {
            try {
              const wipeSessionResponse = await axios.get(
                `${API_BASE_URL}/api/wipe/status/${session.sessionId}`
              );
              return {
                ...session,
                ...wipeSessionResponse.data,
                certificate: session.certificate,
                logs: session.logs
              };
            } catch (error) {
              return session;
            }
          })
        );
        setSessions(detailedSessions);
      }
      
      // Load backups
      const backupsResponse = await axios.get(`${API_BASE_URL}/api/user/backups-simple`, {
        params: { username }
      });
      
      if (backupsResponse.data.success) {
        setBackups(backupsResponse.data.backups || []);
      }
      
      // Calculate stats
      const totalFilesWiped = sessions.reduce((sum, session) => 
        sum + (session.filesWiped || 0), 0
      );
      
      const totalDataWiped = sessions.reduce((sum, session) => 
        sum + (session.totalSize || 0), 0
      );
      
      const totalBackupFiles = backups.reduce((sum, backup) => 
        sum + (backup.backupUrls?.length || 0), 0
      );
      
      setStats({
        totalSessions: sessions.length,
        totalBackups: backups.length,
        totalFilesWiped,
        totalDataWiped,
        totalBackupFiles
      });
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const checkFaceRegistration = async () => {
    try {
      const response = await axios.post(`${FACE_VERIFICATION_URL}/api/face/check-registered`, {
        username
      });
      setFaceRegistered(response.data.registered);
    } catch (error) {
      console.error('Error checking face registration:', error);
      setFaceRegistered(false);
    }
  };

  const registerFace = async () => {
    try {
      setRegisteringFace(true);
      toast.info('Face registration starting. Please look at your camera...', {
        autoClose: false
      });

      const response = await axios.post(`${FACE_VERIFICATION_URL}/api/face/register`, {
        username
      });

      if (response.data.success) {
        // Poll for registration completion
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max
        const checkInterval = setInterval(async () => {
          attempts++;
          const checkResponse = await axios.post(`${FACE_VERIFICATION_URL}/api/face/check-registered`, {
            username
          });
          
          if (checkResponse.data.registered) {
            clearInterval(checkInterval);
            setFaceRegistered(true);
            setRegisteringFace(false);
            toast.dismiss();
            toast.success('Face registration completed successfully!');
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            setRegisteringFace(false);
            toast.dismiss();
            toast.error('Face registration timeout. Please try again.');
          }
        }, 1000);
      } else {
        setRegisteringFace(false);
        toast.error('Failed to start face registration');
      }
    } catch (error) {
      console.error('Error registering face:', error);
      setRegisteringFace(false);
      toast.error('Face registration service unavailable');
    }
  };

  const verifyFaceForDownload = async (backupUrl, backupName) => {
    setCurrentBackupToDownload({ url: backupUrl, name: backupName });
    setShowFaceVerificationModal(true);
    setVerificationStep('scanning');
  };

  const performFaceVerification = async () => {
    try {
      setVerifyingFace(true);
      
      const response = await axios.post(`${FACE_VERIFICATION_URL}/api/face/verify`, {
        username
      });

      setVerifyingFace(false);
      
      if (response.data.verified) {
        setVerificationStep('success');
        
        // Wait a moment to show success, then download
        setTimeout(() => {
          downloadBackupAfterVerification();
          setShowFaceVerificationModal(false);
          setVerificationStep('idle');
        }, 1500);
        
      } else {
        setVerificationStep('failed');
        toast.error('Face verification failed. Please try again.');
      }
    } catch (error) {
      console.error('Error verifying face:', error);
      setVerifyingFace(false);
      setVerificationStep('failed');
      toast.error('Face verification service unavailable');
    }
  };

  const downloadBackupAfterVerification = () => {
    if (!currentBackupToDownload) return;
    
    const { url, name } = currentBackupToDownload;
    
    const toastId = toast.loading('Starting download...');
    
    // Direct download from S3 URL
    const link = document.createElement('a');
    link.href = url;
    link.download = name || `backup-${Date.now()}.zip`;
    link.target = '_blank';
    link.click();
    
    toast.update(toastId, {
      render: 'Backup download started!',
      type: 'success',
      isLoading: false,
      autoClose: 2000
    });

    // Log the successful verification and download
    logVerificationEvent(username, name, true);
  };

  const logVerificationEvent = async (username, filename, success) => {
    try {
      await axios.post(`${API_BASE_URL}/api/logs/verification`, {
        username,
        filename,
        success,
        timestamp: new Date().toISOString(),
        action: 'backup_download'
      });
    } catch (error) {
      console.error('Error logging verification:', error);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'backup-requested':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <FiCheck className="w-4 h-4 mr-1" />;
      case 'failed':
        return <FiAlertCircle className="w-4 h-4 mr-1" />;
      case 'in-progress':
        return <FiRefreshCw className="w-4 h-4 mr-1 animate-spin" />;
      case 'backup-requested':
        return <FiCloud className="w-4 h-4 mr-1" />;
      default:
        return <FiClock className="w-4 h-4 mr-1" />;
    }
  };

  const downloadCertificate = async (sessionId) => {
    try {
      const toastId = toast.loading('Downloading certificate...');
      
      const session = sessions.find(s => s.sessionId === sessionId);
      
      if (session?.certificateUrl) {
        window.open(session.certificateUrl, '_blank');
      } else {
        const response = await axios.get(
          `${API_BASE_URL}/api/wipe/certificate/${sessionId}`,
          { responseType: 'blob' }
        );
        
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = `certificate-${sessionId}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }
      
      toast.update(toastId, {
        render: 'Certificate downloaded!',
        type: 'success',
        isLoading: false,
        autoClose: 2000
      });
      
    } catch (error) {
      console.error('Error downloading certificate:', error);
      toast.error('Failed to download certificate');
    }
  };

  const downloadLogs = async (sessionId) => {
    try {
      const toastId = toast.loading('Downloading logs...');
      
      const session = sessions.find(s => s.sessionId === sessionId);
      
      if (session?.logsUrl) {
        window.open(session.logsUrl, '_blank');
      } else {
        const response = await axios.get(
          `${API_BASE_URL}/api/wipe/logs/${sessionId}`,
          { responseType: 'blob' }
        );
        
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = `logs-${sessionId}.txt`;
        link.click();
        URL.revokeObjectURL(url);
      }
      
      toast.update(toastId, {
        render: 'Logs downloaded!',
        type: 'success',
        isLoading: false,
        autoClose: 2000
      });
      
    } catch (error) {
      console.error('Error downloading logs:', error);
      toast.error('Failed to download logs');
    }
  };

  const viewLogs = async (sessionId) => {
    try {
      const toastId = toast.loading('Loading logs...');
      
      const response = await axios.get(`${API_BASE_URL}/api/wipe/logs/${sessionId}`);
      
      setLogsContent(response.data);
      setShowLogsModal(true);
      toast.dismiss(toastId);
      
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('Failed to load logs');
    }
  };

  const viewBackupDetails = (backup) => {
    setSelectedSession(backup);
    setShowSessionDetails(true);
  };

  const shareSession = async (sessionId, email) => {
    try {
      const toastId = toast.loading('Sharing session...');
      
      const response = await axios.post(`${API_BASE_URL}/api/user/session/${sessionId}/share`, {
        username,
        usersToShare: [email]
      });
      
      if (response.data.success) {
        toast.update(toastId, {
          render: `Session shared with ${email}`,
          type: 'success',
          isLoading: false,
          autoClose: 2000
        });
        
        setShowShareModal(false);
        setShareEmail('');
        loadDashboardData();
      }
      
    } catch (error) {
      console.error('Error sharing session:', error);
      toast.error('Failed to share session');
    }
  };

  const openShareModal = (sessionId) => {
    setSharingSessionId(sessionId);
    setShowShareModal(true);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const testFaceVerification = async () => {
    try {
      setVerifyingFace(true);
      toast.info('Testing face verification...');
      
      const response = await axios.post(`${FACE_VERIFICATION_URL}/api/face/quick-verify`, {
        username
      });
      
      setVerifyingFace(false);
      
      if (response.data.verified) {
        toast.success('Face verification test successful!');
      } else {
        toast.error('Face verification test failed. Please ensure proper lighting and camera positioning.');
      }
    } catch (error) {
      setVerifyingFace(false);
      toast.error('Verification test failed. Service may be unavailable.');
    }
  };

  // Face Verification Modal Component
  const FaceVerificationModal = () => {
    if (!showFaceVerificationModal) return null;
    
    const renderStepContent = () => {
      switch (verificationStep) {
        case 'scanning':
          return (
            <div className="text-center">
              <div className="relative w-64 h-64 mx-auto mb-6">
                {/* Camera placeholder */}
                <div className="w-full h-full bg-gray-900 rounded-lg flex items-center justify-center">
                  <div className="relative">
                    <div className="w-48 h-36 border-4 border-blue-500 rounded-lg animate-pulse"></div>
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      <FiCamera className="w-12 h-12 text-blue-400 animate-pulse" />
                    </div>
                  </div>
                </div>
                
                {/* Scanning animation */}
                <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-lg animate-spin"></div>
              </div>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Verifying Your Identity
              </h3>
              <p className="text-gray-600 mb-6">
                Please look directly at your camera and stay still...
              </p>
              
              {verifyingFace ? (
                <div className="flex items-center justify-center space-x-2">
                  <FiRefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                  <span className="text-blue-600">Processing face verification...</span>
                </div>
              ) : (
                <button
                  onClick={performFaceVerification}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all font-semibold"
                >
                  Start Verification
                </button>
              )}
            </div>
          );
        
        case 'success':
          return (
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <FiCheckCircle className="w-12 h-12 text-white" />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Verification Successful!
              </h3>
              <p className="text-gray-600 mb-6">
                Your identity has been verified. Download will start automatically.
              </p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm">
                  <span className="font-semibold">User:</span> {username}
                </p>
                <p className="text-green-800 text-sm mt-1">
                  <span className="font-semibold">File:</span> {currentBackupToDownload?.name}
                </p>
              </div>
            </div>
          );
        
        case 'failed':
          return (
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-r from-red-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <FiAlertCircle className="w-12 h-12 text-white" />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Verification Failed
              </h3>
              <p className="text-gray-600 mb-6">
                Could not verify your identity. Please try again.
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => setVerificationStep('scanning')}
                  className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all font-semibold"
                >
                  Try Again
                </button>
                <button
                  onClick={() => {
                    setShowFaceVerificationModal(false);
                    setVerificationStep('idle');
                  }}
                  className="w-full px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        
        default:
          return null;
      }
    };
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-t-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FiUserCheck className="w-8 h-8 text-white" />
                <div>
                  <h2 className="text-xl font-bold text-white">Face Verification</h2>
                  <p className="text-blue-100 text-sm">Secure biometric authentication</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowFaceVerificationModal(false);
                  setVerificationStep('idle');
                  setCurrentBackupToDownload(null);
                }} 
                className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <FiX className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          
          <div className="p-8">
            {renderStepContent()}
            
            {verificationStep === 'scanning' && (
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <FiInfo className="w-4 h-4 mr-2 text-blue-600" />
                  Tips for Best Results:
                </h4>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    Ensure good lighting on your face
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    Look directly at the camera
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    Remove glasses if they cause glare
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    Keep your face within the frame
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Logs Modal Component
  const LogsModal = () => {
    if (!showLogsModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
          <div className="bg-gray-800 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Session Logs</h2>
                <p className="text-gray-300 mt-1">Detailed wipe process log</p>
              </div>
              <button 
                onClick={() => setShowLogsModal(false)} 
                className="p-2 hover:bg-gray-700 rounded-lg"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>
          </div>
          
          <div className="p-1">
            <pre className="bg-gray-900 text-gray-100 p-6 rounded-lg text-sm whitespace-pre-wrap overflow-auto max-h-[60vh] font-mono">
              {logsContent}
            </pre>
          </div>
          
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Log length: {logsContent?.length || 0} characters
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowLogsModal(false)}
                  className="px-6 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([logsContent], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `logs-${selectedSession?.sessionId || 'session'}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                >
                  <FiDownload className="w-4 h-4" />
                  <span>Download Logs</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Share Modal Component
  const ShareModal = () => {
    if (!showShareModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          <div className="bg-blue-50 border-b border-blue-200 p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FiShare2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Share Session</h2>
                <p className="text-gray-600 mt-1">Share this session with other users</p>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User Email
                </label>
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Note:</span> Users you share with will be able to:
                </p>
                <ul className="text-sm text-gray-600 mt-2 space-y-1">
                  <li className="flex items-center">
                    <FiCheck className="w-3 h-3 text-green-500 mr-2" />
                    View session details
                  </li>
                  <li className="flex items-center">
                    <FiCheck className="w-3 h-3 text-green-500 mr-2" />
                    Download logs and certificates
                  </li>
                  <li className="flex items-center">
                    <FiCheck className="w-3 h-3 text-green-500 mr-2" />
                    Access backup files
                  </li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareEmail('');
                }}
                className="flex-1 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => shareSession(sharingSessionId, shareEmail)}
                disabled={!shareEmail || !shareEmail.includes('@')}
                className={`flex-1 py-2 bg-blue-600 text-white rounded-lg font-semibold transition-colors ${
                  !shareEmail || !shareEmail.includes('@')
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-blue-700'
                }`}
              >
                Share Session
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Session Details Modal
  const SessionDetailsModal = () => {
    if (!showSessionDetails || !selectedSession) return null;
    
    const isBackup = selectedSession.backupUrls !== undefined;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
          <div className="bg-gray-800 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  {isBackup ? 'Backup Details' : 'Session Details'}
                </h2>
                <p className="text-gray-300 mt-1">
                  Complete information about {isBackup ? 'backup' : 'wipe session'}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowSessionDetails(false);
                  setSelectedSession(null);
                }} 
                className="p-2 hover:bg-gray-700 rounded-lg"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>
          </div>
          
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <FiInfo className="w-5 h-5 mr-2 text-blue-600" />
                  {isBackup ? 'Backup Information' : 'Session Information'}
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{isBackup ? 'Backup ID:' : 'Session ID:'}</span>
                    <div className="flex items-center">
                      <span className="font-mono text-sm">{selectedSession.sessionId}</span>
                      <button
                        onClick={() => copyToClipboard(selectedSession.sessionId)}
                        className="ml-2 p-1 hover:bg-gray-200 rounded"
                      >
                        <FiCopy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {!isBackup && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={`px-2 py-1 rounded text-sm ${getStatusColor(selectedSession.status)}`}>
                        {selectedSession.status}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created:</span>
                    <span>{formatDate(selectedSession.createdAt)}</span>
                  </div>
                  {!isBackup && selectedSession.endTime && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Completed:</span>
                      <span>{formatDate(selectedSession.endTime)}</span>
                    </div>
                  )}
                </div>
              </div>
              
              {!isBackup ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <FiActivity className="w-5 h-5 mr-2 text-green-600" />
                    Wipe Statistics
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Files Wiped:</span>
                      <span className="font-medium">{selectedSession.filesWiped || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Directories Wiped:</span>
                      <span className="font-medium">{selectedSession.directoriesWiped || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Data:</span>
                      <span className="font-medium">
                        {formatFileSize(selectedSession.totalSize || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <FiCloud className="w-5 h-5 mr-2 text-blue-600" />
                    Backup Information
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Files:</span>
                      <span className="font-medium">
                        {selectedSession.backupUrls?.length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Updated:</span>
                      <span>{formatDate(selectedSession.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {isBackup && selectedSession.backupUrls && selectedSession.backupUrls.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Backup Files</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {selectedSession.backupUrls.map((url, index) => {
                    const fileName = url.split('/').pop() || `backup-file-${index + 1}`;
                    return (
                      <div key={index} className="flex items-center justify-between p-2 bg-white border-b border-gray-100 last:border-b-0">
                        <div className="flex items-center space-x-2">
                          <FiFile className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-mono truncate max-w-xs">{fileName}</span>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => window.open(url, '_blank')}
                            className="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 text-xs flex items-center"
                          >
                            <FiEye className="w-3 h-3 mr-1" />
                            View
                          </button>
                          <button
                            onClick={() => verifyFaceForDownload(url, fileName)}
                            className="px-2 py-1 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded hover:from-green-600 hover:to-teal-600 text-xs flex items-center"
                          >
                            <FiDownload className="w-3 h-3 mr-1" />
                            Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {selectedSession.access && selectedSession.access.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <FiUsers className="w-5 h-5 mr-2 text-purple-600" />
                  Access Permissions
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedSession.access.map((user, index) => (
                    <div key={index} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                      <FiUser className="w-3 h-3 inline mr-1" />
                      {user}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <div className="flex flex-wrap gap-3">
              {!isBackup && (
                <>
                  <button
                    onClick={() => viewLogs(selectedSession.sessionId)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                  >
                    <FiEye className="w-4 h-4" />
                    <span>View Logs</span>
                  </button>
                  <button
                    onClick={() => downloadLogs(selectedSession.sessionId)}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center space-x-2"
                  >
                    <FiDownload className="w-4 h-4" />
                    <span>Download Logs</span>
                  </button>
                  {selectedSession.status === 'completed' && (
                    <button
                      onClick={() => downloadCertificate(selectedSession.sessionId)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
                    >
                      <FiDownload className="w-4 h-4" />
                      <span>Certificate</span>
                    </button>
                  )}
                </>
              )}
              {isBackup && selectedSession.backupUrls && selectedSession.backupUrls.length > 0 && (
                <button
                  onClick={() => {
                    // Download all with face verification for the first file
                    const firstUrl = selectedSession.backupUrls[0];
                    const firstName = firstUrl.split('/').pop() || `backup-1`;
                    verifyFaceForDownload(firstUrl, firstName);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 flex items-center space-x-2"
                >
                  <FiDownload className="w-4 h-4" />
                  <span>Download All (Face Verify)</span>
                </button>
              )}
              <button
                onClick={() => openShareModal(selectedSession.sessionId)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2"
              >
                <FiShare2 className="w-4 h-4" />
                <span>Share</span>
              </button>
              <button
                onClick={() => {
                  setShowSessionDetails(false);
                  setSelectedSession(null);
                }}
                className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <ToastContainer 
        position="top-right" 
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      
      <FaceVerificationModal />
      <LogsModal />
      <ShareModal />
      <SessionDetailsModal />
      
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 md:mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl shadow-lg">
                <FiGrid className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                  User Dashboard
                </h1>
                <div className="flex items-center space-x-2 mt-1">
                  <FiUser className="w-4 h-4 text-gray-600" />
                  <p className="text-gray-600">
                    Welcome, <span className="font-semibold text-blue-600">{username}</span>
                  </p>
                </div>
              </div>
            </div>
            
            {/* Face Verification Status Badge */}
            <div className="flex items-center space-x-4">
              <div className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
                faceRegistered 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' 
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
              }`}>
                {faceRegistered ? (
                  <>
                    <FiUserCheck className="w-5 h-5" />
                    <span className="font-semibold">Face Verified</span>
                  </>
                ) : (
                  <>
                    <FiAlertTriangle className="w-5 h-5" />
                    <span className="font-semibold">Face Not Registered</span>
                  </>
                )}
              </div>
              
              <button
                onClick={loadDashboardData}
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all flex items-center space-x-2 shadow-lg"
              >
                <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">Total Sessions</p>
                  <p className="text-3xl font-bold mt-2">{stats.totalSessions}</p>
                </div>
                <FiArchive className="w-10 h-10 opacity-80" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">Files Wiped</p>
                  <p className="text-3xl font-bold mt-2">{stats.totalFilesWiped}</p>
                </div>
                <FiFile className="w-10 h-10 opacity-80" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">Backups</p>
                  <p className="text-3xl font-bold mt-2">{stats.totalBackupFiles}</p>
                </div>
                <FiCloud className="w-10 h-10 opacity-80" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100">Data Wiped</p>
                  <p className="text-3xl font-bold mt-2">{formatFileSize(stats.totalDataWiped)}</p>
                </div>
                <FiHardDrive className="w-10 h-10 opacity-80" />
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-indigo-500 to-violet-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100">Face Security</p>
                  <p className="text-3xl font-bold mt-2">{faceRegistered ? 'ON' : 'OFF'}</p>
                </div>
                <FiShield className="w-10 h-10 opacity-80" />
              </div>
            </div>
          </div>
        </header>

        {/* Face Verification Section */}
        <div className="mb-8 bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl shadow-2xl p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Face Verification Security</h2>
              <p className="text-gray-300">
                Protect your backups with biometric authentication
              </p>
            </div>
            <div className="flex space-x-3 mt-4 md:mt-0">
              {!faceRegistered ? (
                <button
                  onClick={registerFace}
                  disabled={registeringFace}
                  className={`px-6 py-3 rounded-lg font-semibold flex items-center space-x-2 ${
                    registeringFace 
                      ? 'bg-gray-600 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
                  }`}
                >
                  {registeringFace ? (
                    <FiRefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <FiUser className="w-5 h-5" />
                  )}
                  <span>{registeringFace ? 'Registering...' : 'Register Face'}</span>
                </button>
              ) : (
                <button
                  onClick={testFaceVerification}
                  disabled={verifyingFace}
                  className={`px-6 py-3 rounded-lg font-semibold flex items-center space-x-2 ${
                    verifyingFace 
                      ? 'bg-gray-600 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600'
                  }`}
                >
                  {verifyingFace ? (
                    <FiRefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <FiCamera className="w-5 h-5" />
                  )}
                  <span>{verifyingFace ? 'Verifying...' : 'Test Verification'}</span>
                </button>
              )}
              
              <button
                onClick={() => window.open(FACE_VERIFICATION_URL, '_blank')}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg hover:from-purple-600 hover:to-pink-600 font-semibold flex items-center space-x-2"
              >
                <FiExternalLink className="w-5 h-5" />
                <span>Verification Console</span>
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-800 bg-opacity-50 rounded-xl p-5">
              <div className="flex items-center space-x-3 mb-3">
                <div className="p-2 bg-blue-500 bg-opacity-20 rounded-lg">
                  <FiLock className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="font-semibold">Secure Downloads</h3>
              </div>
              <p className="text-gray-400 text-sm">
                All backup downloads require face verification to ensure only authorized access.
              </p>
            </div>
            
            <div className="bg-gray-800 bg-opacity-50 rounded-xl p-5">
              <div className="flex items-center space-x-3 mb-3">
                <div className="p-2 bg-green-500 bg-opacity-20 rounded-lg">
                  <FiShield className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="font-semibold">Biometric Protection</h3>
              </div>
              <p className="text-gray-400 text-sm">
                Your face is your password. No one else can access your backups.
              </p>
            </div>
            
            <div className="bg-gray-800 bg-opacity-50 rounded-xl p-5">
              <div className="flex items-center space-x-3 mb-3">
                <div className="p-2 bg-purple-500 bg-opacity-20 rounded-lg">
                  <FiDatabase className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="font-semibold">Audit Trail</h3>
              </div>
              <p className="text-gray-400 text-sm">
                Every verification attempt is logged for security monitoring.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <div className="flex space-x-1 bg-gray-200 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'sessions' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <div className="flex items-center space-x-2">
                <FiArchive className="w-5 h-5" />
                <span>Sessions ({sessions.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('backups')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'backups' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <div className="flex items-center space-x-2">
                <FiCloud className="w-5 h-5" />
                <span>Backups ({backups.length})</span>
              </div>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FiRefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Loading dashboard data...</span>
            </div>
          ) : activeTab === 'sessions' ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">All Wipe Sessions</h2>
                <div className="text-sm text-gray-600">
                  Showing {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                </div>
              </div>
              
              {sessions.length === 0 ? (
                <div className="text-center py-12">
                  <FiArchive className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No wipe sessions found</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Start a wipe process to create your first session
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sessions.map((session) => (
                    <div 
                      key={session.sessionId || session._id}
                      className="border border-gray-200 rounded-xl p-5 hover:shadow-lg transition-shadow bg-white"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg ${
                            session.status === 'completed' ? 'bg-green-100' :
                            session.status === 'failed' ? 'bg-red-100' :
                            session.status === 'in-progress' ? 'bg-yellow-100' :
                            'bg-blue-100'
                          }`}>
                            {getStatusIcon(session.status)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {session.sessionId?.substring(0, 12)}...
                            </h3>
                            <p className="text-sm text-gray-500">
                              {formatDate(session.startTime || session.createdAt)}
                            </p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${getStatusColor(session.status)} flex items-center`}>
                          {getStatusIcon(session.status)}
                          {session.status}
                        </span>
                      </div>
                      
                      <div className="space-y-3 mb-4">
                        {session.filesWiped !== undefined && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Files:</span>
                            <span className="font-medium">{session.filesWiped}</span>
                          </div>
                        )}
                        {session.totalSize !== undefined && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Data:</span>
                            <span className="font-medium">
                              {formatFileSize(session.totalSize)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Access:</span>
                          <span className="font-medium flex items-center">
                            <FiUsers className="w-3 h-3 mr-1" />
                            {session.access?.length || 1}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setSelectedSession(session);
                            setShowSessionDetails(true);
                          }}
                          className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm flex items-center justify-center space-x-1"
                        >
                          <FiInfo className="w-3 h-3" />
                          <span>Details</span>
                        </button>
                        <button
                          onClick={() => viewLogs(session.sessionId)}
                          className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm flex items-center justify-center space-x-1"
                        >
                          <FiEye className="w-3 h-3" />
                          <span>Logs</span>
                        </button>
                        {session.status === 'completed' && (
                          <button
                            onClick={() => downloadCertificate(session.sessionId)}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center justify-center space-x-1"
                          >
                            <FiDownload className="w-3 h-3" />
                            <span>Cert</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Backup Files</h2>
                <div className="text-sm text-gray-600">
                  {backups.length} backup{backups.length !== 1 ? 's' : ''} • {stats.totalBackupFiles} files
                </div>
              </div>
              
              {backups.length === 0 ? (
                <div className="text-center py-12">
                  <FiCloud className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No backup files found</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Create backups during wipe process to see them here
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {backups.map((backup, index) => (
                    <div 
                      key={backup._id || index}
                      className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-gradient-to-r from-blue-50 to-indigo-50"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <FiCloud className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {backup.sessionId?.substring(0, 12)}...
                            </h3>
                            <p className="text-sm text-gray-500">
                              Created: {formatDate(backup.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            {backup.backupUrls?.length || 0} file(s)
                          </div>
                          <div className="text-xs text-gray-500 flex items-center">
                            <FiUsers className="w-2 h-2 mr-1" />
                            Access: {backup.access?.length || 1}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <h4 className="font-medium text-gray-700 mb-2">Backup Files:</h4>
                        <div className="space-y-2">
                          {backup.backupUrls?.slice(0, 3).map((url, idx) => {
                            const fileName = url.split('/').pop() || `backup-file-${idx + 1}`;
                            return (
                              <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
                                <div className="flex items-center space-x-2">
                                  <FiFile className="w-4 h-4 text-blue-500" />
                                  <span className="text-sm font-mono truncate max-w-xs">{fileName}</span>
                                </div>
                                <button
                                  onClick={() => verifyFaceForDownload(url, fileName)}
                                  className="px-3 py-1 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg hover:from-green-600 hover:to-teal-600 text-sm flex items-center space-x-1"
                                >
                                  <FiDownload className="w-3 h-3" />
                                  <span>Download</span>
                                </button>
                              </div>
                            );
                          })}
                          {backup.backupUrls && backup.backupUrls.length > 3 && (
                            <div className="text-center text-sm text-gray-500">
                              + {backup.backupUrls.length - 3} more file{backup.backupUrls.length - 3 !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div className="flex flex-wrap gap-1">
                          {backup.access?.slice(0, 2).map((user, idx) => (
                            <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                              <FiUser className="w-2 h-2 inline mr-1" />
                              {user.length > 10 ? `${user.substring(0, 10)}...` : user}
                            </span>
                          ))}
                          {backup.access && backup.access.length > 2 && (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                              +{backup.access.length - 2} more
                            </span>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => viewBackupDetails(backup)}
                            className="px-3 py-1 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm flex items-center space-x-1"
                          >
                            <FiInfo className="w-3 h-3" />
                            <span>Details</span>
                          </button>
                          <button
                            onClick={() => openShareModal(backup.sessionId)}
                            className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm flex items-center space-x-1"
                          >
                            <FiShare2 className="w-3 h-3" />
                            <span>Share</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button
                onClick={() => window.open('/wipe', '_blank')}
                className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg hover:from-red-600 hover:to-pink-600 flex items-center justify-center space-x-2"
              >
                <FiTrash2 className="w-4 h-4" />
                <span>Start New Wipe</span>
              </button>
              <button
                onClick={() => window.open('/backup', '_blank')}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 flex items-center justify-center space-x-2"
              >
                <FiCloud className="w-4 h-4" />
                <span>Create Backup</span>
              </button>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Security Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  {faceRegistered ? (
                    <FiCheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <FiAlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                  <span className="text-sm">Face Verification</span>
                </div>
                <span className={`text-sm font-medium px-2 py-1 rounded ${
                  faceRegistered ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {faceRegistered ? 'Active' : 'Required'}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <FiShield className="w-5 h-5 text-blue-500" />
                  <span className="text-sm">Download Protection</span>
                </div>
                <span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {faceRegistered ? 'Face Locked' : 'Disabled'}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <FiDatabase className="w-5 h-5 text-purple-500" />
                  <span className="text-sm">Audit Logging</span>
                </div>
                <span className="text-sm font-medium bg-green-100 text-green-800 px-2 py-1 rounded">
                  Active
                </span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Storage Info</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Sessions:</span>
                <span className="font-medium">{sessions.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Backups:</span>
                <span className="font-medium">{backups.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Files:</span>
                <span className="font-medium">{stats.totalBackupFiles + stats.totalFilesWiped}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="text-xs text-gray-500">
                  Data stored in AWS S3 with AES-256 encryption
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-300">
          <div className="text-center">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">SecureWipe Pro Dashboard</span> • User: {username}
            </p>
            <p className="text-xs text-gray-500 mt-2 max-w-2xl mx-auto">
              This dashboard shows all your wipe sessions and backup files.
              All backup downloads are protected with face verification for enhanced security.
            </p>
            <div className="flex justify-center space-x-6 mt-4">
              <span className="text-xs text-gray-500 flex items-center">
                <FiShield className="w-3 h-3 mr-1" />
                Face Verification
              </span>
              <span className="text-xs text-gray-500 flex items-center">
                <FiLock className="w-3 h-3 mr-1" />
                AES-256 Encryption
              </span>
              <span className="text-xs text-gray-500 flex items-center">
                <FiDatabase className="w-3 h-3 mr-1" />
                Secure Backups
              </span>
              <span className="text-xs text-gray-500 flex items-center">
                <FiGlobe className="w-3 h-3 mr-1" />
                Cloud Storage
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}