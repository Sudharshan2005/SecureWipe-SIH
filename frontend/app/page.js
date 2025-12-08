'use client';

import { useState, useEffect, useRef } from 'react';
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
  FiList
} from 'react-icons/fi';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// File Browser Modal Component
const FileBrowserModal = ({ isOpen, onClose, onSelect, currentPath = '', files = [] }) => {
  const [selectedItems, setSelectedItems] = useState([]);
  const [viewMode, setViewMode] = useState('list');

  if (!isOpen) return null;

  const handleItemClick = (item) => {
    setSelectedItems(prev => {
      if (prev.some(i => i.path === item.path)) {
        return prev.filter(i => i.path !== item.path);
      } else {
        return [...prev, item];
      }
    });
  };

  const handleConfirm = () => {
    if (selectedItems.length > 0) {
      onSelect(selectedItems);
      setSelectedItems([]);
      onClose();
    } else {
      toast.error('Please select at least one item');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="bg-gray-800 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Browse Files</h2>
              <p className="text-gray-300 mt-1">Select files and folders to wipe</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-300">
              {selectedItems.length} item(s) selected
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                {viewMode === 'list' ? 'Grid View' : 'List View'}
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {files.length === 0 ? (
            <div className="text-center py-12">
              <FiFolder className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No files found</p>
              <p className="text-sm text-gray-500 mt-2">The directory appears to be empty</p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-2">
              {files.map((item) => (
                <div
                  key={item.path}
                  onClick={() => handleItemClick(item)}
                  className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all hover:bg-gray-50 ${
                    selectedItems.some(i => i.path === item.path)
                      ? 'bg-blue-50 border-blue-300'
                      : 'border-gray-200'
                  }`}
                >
                  <div className={`p-3 rounded-lg mr-4 ${
                    item.type === 'file' ? 'bg-blue-100' : 'bg-green-100'
                  }`}>
                    {item.type === 'file' ? (
                      <FiFile className="w-6 h-6 text-blue-600" />
                    ) : (
                      <FiFolder className="w-6 h-6 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                      <span className="capitalize">{item.type}</span>
                      {item.type === 'directory' && (
                        <span className="flex items-center">
                          <FiFolder className="w-3 h-3 mr-1" />
                          Contains files
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedItems.some(i => i.path === item.path) && (
                    <div className="p-2 bg-blue-100 rounded-full">
                      <FiCheck className="w-5 h-5 text-blue-600" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {files.map((item) => (
                <div
                  key={item.path}
                  onClick={() => handleItemClick(item)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all hover:bg-gray-50 flex flex-col items-center text-center ${
                    selectedItems.some(i => i.path === item.path)
                      ? 'bg-blue-50 border-blue-300'
                      : 'border-gray-200'
                  }`}
                >
                  <div className={`p-4 rounded-lg mb-3 ${
                    item.type === 'file' ? 'bg-blue-100' : 'bg-green-100'
                  }`}>
                    {item.type === 'file' ? (
                      <FiFile className="w-8 h-8 text-blue-600" />
                    ) : (
                      <FiFolder className="w-8 h-8 text-green-600" />
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 truncate w-full">{item.name}</h3>
                  <p className="text-xs text-gray-600 mt-1 capitalize">{item.type}</p>
                  {selectedItems.some(i => i.path === item.path) && (
                    <div className="mt-2 p-1 bg-blue-100 rounded-full">
                      <FiCheck className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {selectedItems.length} item(s) ready for wipe
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={selectedItems.length === 0}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                  selectedItems.length === 0
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <FiPlus className="w-5 h-5" />
                <span>Add Selected ({selectedItems.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Confirmation Dialog Component
const ConfirmationDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  items, 
  wipeSettings 
}) => {
  if (!isOpen) return null;

  const totalFiles = items.filter(item => item.type === 'file').length;
  const totalFolders = items.filter(item => item.type === 'directory').length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-red-50 border-b border-red-200 p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <FiAlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Confirm Secure Wipe</h2>
              <p className="text-gray-600 mt-1">Review items before permanent deletion</p>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <FiFile className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm text-blue-800">Files</p>
                  <p className="text-2xl font-bold text-blue-900">{totalFiles}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-100 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <FiFolder className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm text-green-800">Folders</p>
                  <p className="text-2xl font-bold text-green-900">{totalFolders}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <FiInfo className="w-5 h-5 mr-2 text-blue-600" />
              Wipe Configuration
            </h3>
            <div className="text-sm">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Wipe Standard:</span>
                <span className="font-medium text-gray-900">
                  {wipeSettings.passes === 1 ? 'Single Pass' : 
                   wipeSettings.passes === 3 ? '3-Pass (Basic)' :
                   wipeSettings.passes === 7 ? 'DoD 5220.22-M' :
                   wipeSettings.passes >= 35 ? 'Gutmann (35+ Passes)' :
                   `${wipeSettings.passes}-Pass Custom`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Verification:</span>
                <span className={`font-medium ${wipeSettings.verify ? 'text-green-600' : 'text-yellow-600'}`}>
                  {wipeSettings.verify ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Selected Items:</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {items.map((item, index) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-3">
                    {item.type === 'file' ? (
                      <FiFile className="w-4 h-4 text-blue-500" />
                    ) : (
                      <FiFolder className="w-4 h-4 text-green-500" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {item.type}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Item {index + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <FiAlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-red-800 mb-2">Warning: Irreversible Action</h4>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• Files will be securely overwritten {wipeSettings.passes} times</li>
                  <li>• Data recovery will be impossible</li>
                  <li>• This action cannot be undone</li>
                  <li>• Ensure you have backups if needed</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-6 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 px-6 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
            >
              <FiTrash2 className="w-5 h-5" />
              <span>Confirm & Start Wiping</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Logs Modal Component
const LogsModal = ({ isOpen, onClose, content, sessionId, onDownload }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
        <div className="bg-gray-800 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Wipe Session Logs</h2>
              <p className="text-gray-300 mt-1">Detailed deletion log - Session: {sessionId?.substring(0, 12)}...</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg">
              <FiX className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="p-1">
          <pre className="bg-gray-900 text-gray-100 p-6 rounded-lg text-sm whitespace-pre-wrap overflow-auto max-h-[60vh] font-mono">
            {content}
          </pre>
        </div>
        
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Log length: {content?.length || 0} characters
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-6 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
              <button
                onClick={onDownload}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <FiDownload className="w-4 h-4" />
                <span>Download Log File</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  const [paths, setPaths] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState('windows');
  const [currentSession, setCurrentSession] = useState(null);
  const [isWiping, setIsWiping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusInterval, setStatusInterval] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsContent, setLogsContent] = useState('');
  const [wipeSettings, setWipeSettings] = useState({
    passes: 7,
    verify: true,
    removeEmptyDirs: true
  });
  const [availableFiles, setAvailableFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [wipeStatus, setWipeStatus] = useState(null);
  const [wipeProgress, setWipeProgress] = useState(0);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [allSessions, setAllSessions] = useState([]);
  const [showSessionsList, setShowSessionsList] = useState(false);

  const statusIntervalRef = useRef(null);
  const statusPollingRef = useRef(false);

  // Load available files on mount
  useEffect(() => {
    loadAvailableFiles();
    loadAllSessions();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
    };
  }, []);

  // Load available files
  const loadAvailableFiles = async () => {
    try {
      setLoadingFiles(true);
      const response = await axios.get(`${API_BASE_URL}/api/files`);
      setAvailableFiles(response.data.items || []);
    } catch (error) {
      console.error('Error loading files:', error);
      toast.error('Could not load files');
    } finally {
      setLoadingFiles(false);
    }
  };

  // Load all sessions
  const loadAllSessions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/wipe/sessions`);
      setAllSessions(response.data.sessions || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  // Open file browser
  const openFileBrowser = () => {
    setShowFileBrowser(true);
  };

  // Handle file selection
  const handleFileSelection = (selectedItems) => {
    const newPaths = [...paths];
    
    selectedItems.forEach(item => {
      if (!newPaths.some(p => p.path === item.path)) {
        newPaths.push({
          id: Date.now() + Math.random(),
          path: item.path,
          type: item.type,
          name: item.name
        });
      }
    });
    
    setPaths(newPaths);
    toast.success(`Added ${selectedItems.length} item(s) to wipe list`);
  };

  // Manual path input
  const addManualPath = () => {
    const type = confirm('Add a folder? (Cancel for file)') ? 'directory' : 'file';
    const name = prompt(`Enter ${type} name:`);
    
    if (name && name.trim()) {
      const newPaths = [...paths, {
        id: Date.now() + Math.random(),
        path: name.trim(),
        type: type,
        name: name.trim()
      }];
      setPaths(newPaths);
      toast.info(`Added ${type}: ${name.trim()}`);
    }
  };

  // Remove path
  const removePath = (id) => {
    const newPaths = paths.filter(p => p.id !== id);
    setPaths(newPaths);
    if (paths.length > newPaths.length) {
      toast.info('Item removed');
    }
  };

  // Clear all paths
  const clearAllPaths = () => {
    if (paths.length > 0 && confirm('Clear all selected items?')) {
      setPaths([]);
      setCurrentSession(null);
      setWipeStatus(null);
      setWipeProgress(0);
      setSessionDetails(null);
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      setIsWiping(false);
      statusPollingRef.current = false;
      toast.info('Cleared all selections');
    }
  };

  // Download wipe script
  const downloadScript = async () => {
    try {
      setIsLoading(true);
      const validPaths = paths.map(p => p.path);
      
      if (validPaths.length === 0) {
        toast.error('Please select at least one file or folder');
        return;
      }

      const toastId = toast.loading('Generating wipe script...', {
        position: "top-right",
        autoClose: false,
      });

      const response = await axios.post(
        `${API_BASE_URL}/api/script/generate`,
        { 
          paths: validPaths, 
          platform: selectedPlatform,
          settings: wipeSettings
        },
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 
        selectedPlatform === 'windows' ? 'secure-wipe.ps1' : 'secure-wipe.sh'
      );
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.update(toastId, {
        render: 'Script downloaded successfully!',
        type: toast.TYPE.SUCCESS,
        isLoading: false,
        autoClose: 3000
      });

    } catch (error) {
      console.error('Error downloading script:', error);
      toast.error('Failed to generate script. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Start wipe process
  const startWipe = () => {
    if (paths.length === 0) {
      toast.error('Please select at least one file or folder');
      return;
    }

    setShowConfirmation(true);
  };

  // Confirmed wipe process
  const confirmWipe = async () => {
    setShowConfirmation(false);
    setIsWiping(true);
    setWipeStatus('starting');
    setWipeProgress(0);
    
    try {
      const validPaths = paths.map(p => p.path);
      
      const toastId = toast.loading('Starting secure wipe process...', {
        position: "top-right",
        autoClose: false,
      });

      const response = await axios.post(`${API_BASE_URL}/api/wipe/start`, {
        paths: validPaths,
        settings: wipeSettings
      });

      toast.update(toastId, {
        render: 'Wipe process initiated! Tracking progress...',
        type: toast.TYPE.INFO,
        isLoading: false,
        autoClose: 3000
      });

      const sessionId = response.data.sessionId;
      setCurrentSession(sessionId);
      setWipeStatus('in-progress');

      // Start polling for status
      startStatusPolling(sessionId);

      // Reload sessions list
      loadAllSessions();

    } catch (error) {
      console.error('Error starting wipe:', error);
      const errorMsg = error.response?.data?.error || 'Failed to start wipe process';
      const invalidPaths = error.response?.data?.invalidPaths;
      
      if (invalidPaths) {
        toast.error(`Invalid paths: ${invalidPaths.join(', ')}`);
      } else {
        toast.error(errorMsg);
      }
      
      setIsWiping(false);
      setWipeStatus(null);
      setWipeProgress(0);
    }
  };

  // Start status polling - UPDATED VERSION
const startStatusPolling = (sessionId) => {
  // Clear any existing interval
  if (statusIntervalRef.current) {
    clearInterval(statusIntervalRef.current);
  }
  
  // Set polling state
  statusPollingRef.current = true;
  
  // Initial check with shorter timeout
  checkWipeStatus(sessionId);
  
  // Set up interval for polling (every 1 second for faster updates)
  const interval = setInterval(() => {
    if (statusPollingRef.current) {
      checkWipeStatus(sessionId);
    } else {
      clearInterval(interval);
    }
  }, 1000); // Changed from 2000ms to 1000ms for faster updates
  
  statusIntervalRef.current = interval;
  setStatusInterval(interval);
};

  // Check wipe status
  const checkWipeStatus = async (sessionId) => {
    if (!statusPollingRef.current || !sessionId) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/wipe/status/${sessionId}`);
      const session = response.data;
      
      setSessionDetails(session);
      
      if (session.progress !== undefined) {
        setWipeProgress(session.progress);
      }
      
      if (session.status === 'completed' || session.status === 'failed') {
        statusPollingRef.current = false;
        if (statusIntervalRef.current) {
          clearInterval(statusIntervalRef.current);
          statusIntervalRef.current = null;
        }
        
        setWipeStatus(session.status);
        setIsWiping(false);
        setWipeProgress(100);
        
        if (session.firstCompletionNotification !== false) {
          if (session.status === 'completed') {
            toast.success('✅ Wipe process completed successfully! Certificate is ready for download.', {
              position: "top-right",
              autoClose: 8000,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
          } else {
            toast.error(`❌ Wipe process failed: ${session.error || 'Unknown error'}`, {
              position: "top-right",
              autoClose: 8000,
            });
          }
        }
        
        // Reload sessions list
        loadAllSessions();
        
      } else if (session.status === 'in-progress') {
        setWipeStatus('in-progress');
        setWipeProgress(session.progress || 0);
      }
      
    } catch (error) {
      console.error('Error checking status:', error);
      if (error.response?.status === 404) {
        statusPollingRef.current = false;
        if (statusIntervalRef.current) {
          clearInterval(statusIntervalRef.current);
          statusIntervalRef.current = null;
        }
        setIsWiping(false);
        toast.error('Wipe session not found or expired');
      }
    }
  };

  // Manual status check
  const manualStatusCheck = async () => {
    if (!currentSession) {
      toast.error('No active wipe session');
      return;
    }
    
    try {
      const toastId = toast.loading('Checking wipe status...', {
        position: "top-right",
        autoClose: false,
      });
      
      await checkWipeStatus(currentSession);
      
      toast.update(toastId, {
        render: 'Status checked',
        type: toast.TYPE.INFO,
        isLoading: false,
        autoClose: 2000,
      });
    } catch (error) {
      toast.error('Failed to check status');
    }
  };

  // Download certificate
  const downloadCertificate = async () => {
    if (!currentSession) {
      toast.error('No wipe session found');
      return;
    }

    if (wipeStatus !== 'completed' && sessionDetails?.status !== 'completed') {
      toast.error('Wipe process is not completed yet');
      return;
    }

    try {
      const toastId = toast.loading('Generating certificate...', {
        position: "top-right",
        autoClose: false,
      });

      const response = await axios.get(
        `${API_BASE_URL}/api/wipe/certificate/${currentSession}`,
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `wipe-certificate-${currentSession}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.update(toastId, {
        render: 'Certificate downloaded successfully!',
        type: toast.TYPE.SUCCESS,
        isLoading: false,
        autoClose: 3000
      });

    } catch (error) {
      console.error('Error downloading certificate:', error);
      if (error.response?.status === 400) {
        toast.error('Wipe process is not completed yet');
      } else if (error.response?.status === 404) {
        toast.error('Certificate not found. Session may have expired.');
      } else {
        toast.error('Failed to download certificate.');
      }
    }
  };

  // Download logs
  const downloadLogs = async () => {
    if (!currentSession) {
      toast.error('No active wipe session found');
      return;
    }

    try {
      const toastId = toast.loading('Fetching logs...', {
        position: "top-right",
        autoClose: false,
      });

      // First check if session exists
      try {
        await axios.get(`${API_BASE_URL}/api/wipe/status/${currentSession}`);
      } catch (statusError) {
        if (statusError.response?.status === 404) {
          toast.update(toastId, {
            render: 'Session expired. Retrieving from archive...',
            type: toast.TYPE.WARNING,
            isLoading: true,
          });
        }
      }

      const response = await axios.get(
        `${API_BASE_URL}/api/wipe/logs/${currentSession}`,
        { 
          responseType: 'blob',
          timeout: 30000
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `wipe-logs-${currentSession}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setTimeout(() => window.URL.revokeObjectURL(url), 100);

      toast.update(toastId, {
        render: 'Logs downloaded successfully!',
        type: toast.TYPE.SUCCESS,
        isLoading: false,
        autoClose: 3000
      });

    } catch (error) {
      console.error('Error downloading logs:', error);
      
      let errorMessage = 'Failed to download logs';
      if (error.response?.status === 404) {
        errorMessage = 'Session not found. It may have expired or been cleaned up.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Server may be busy.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      toast.error(errorMessage, {
        autoClose: 5000,
      });
    }
  };

  // View logs in modal
  const viewLogs = async () => {
    if (!currentSession) {
      toast.error('No session selected');
      return;
    }
    
    try {
      const toastId = toast.loading('Loading logs...');
      const response = await axios.get(`${API_BASE_URL}/api/wipe/logs/${currentSession}`, {
        responseType: 'text'
      });
      setLogsContent(response.data);
      setShowLogsModal(true);
      toast.dismiss(toastId);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('Failed to load logs');
    }
  };

  // Download logs from modal
  const downloadLogsFromModal = () => {
    const blob = new Blob([logsContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wipe-logs-${currentSession}.txt`;
    a.click();
    setShowLogsModal(false);
  };

  // Load session from list
  const loadSession = async (sessionId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/wipe/status/${sessionId}`);
      const session = response.data;
      
      setCurrentSession(sessionId);
      setSessionDetails(session);
      setWipeStatus(session.status);
      setWipeProgress(session.progress || 0);
      
      if (session.status === 'in-progress') {
        setIsWiping(true);
        startStatusPolling(sessionId);
      } else {
        setIsWiping(false);
      }
      
      setShowSessionsList(false);
      toast.success(`Loaded session: ${sessionId.substring(0, 8)}`);
      
    } catch (error) {
      toast.error('Failed to load session');
    }
  };

  // Calculate statistics
  const stats = {
    totalFiles: paths.filter(p => p.type === 'file').length,
    totalFolders: paths.filter(p => p.type === 'directory').length,
    totalSize: paths.reduce((total, p) => total + (p.size || 0), 0)
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get status display
  const getStatusText = () => {
    if (!wipeStatus && !currentSession) return 'No active session';
    
    switch (wipeStatus) {
      case 'starting':
        return 'Starting...';
      case 'in-progress':
        return `In Progress (${wipeProgress}%)`;
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return sessionDetails?.status === 'in-progress' 
          ? `In Progress (${wipeProgress}%)` 
          : sessionDetails?.status || 'Unknown';
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (wipeStatus) {
      case 'starting':
        return 'bg-blue-100 text-blue-800';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        if (sessionDetails?.status === 'completed') return 'bg-green-100 text-green-800';
        if (sessionDetails?.status === 'failed') return 'bg-red-100 text-red-800';
        if (sessionDetails?.status === 'in-progress') return 'bg-yellow-100 text-yellow-800';
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (wipeStatus) {
      case 'starting':
        return <FiClock className="w-4 h-4 mr-2" />;
      case 'in-progress':
        return <FiRefreshCw className="w-4 h-4 mr-2 animate-spin" />;
      case 'completed':
        return <FiCheck className="w-4 h-4 mr-2" />;
      case 'failed':
        return <FiAlertCircle className="w-4 h-4 mr-2" />;
      default:
        if (sessionDetails?.status === 'completed') return <FiCheck className="w-4 h-4 mr-2" />;
        if (sessionDetails?.status === 'failed') return <FiAlertCircle className="w-4 h-4 mr-2" />;
        if (sessionDetails?.status === 'in-progress') return <FiRefreshCw className="w-4 h-4 mr-2 animate-spin" />;
        return <FiClock className="w-4 h-4 mr-2" />;
    }
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
      
      {/* Modals */}
      <FileBrowserModal
        isOpen={showFileBrowser}
        onClose={() => setShowFileBrowser(false)}
        onSelect={handleFileSelection}
        files={availableFiles}
      />
      
      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={confirmWipe}
        items={paths}
        wipeSettings={wipeSettings}
      />
      
      <LogsModal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        content={logsContent}
        sessionId={currentSession}
        onDownload={downloadLogsFromModal}
      />
      
      {/* Sessions List Modal */}
      {showSessionsList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            <div className="bg-gray-800 text-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">All Wipe Sessions</h2>
                  <p className="text-gray-300 mt-1">Select a session to view details</p>
                </div>
                <button 
                  onClick={() => setShowSessionsList(false)}
                  className="p-2 hover:bg-gray-700 rounded-lg"
                >
                  <FiX className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {allSessions.length === 0 ? (
                <div className="text-center py-12">
                  <FiArchive className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No sessions found</p>
                  <p className="text-sm text-gray-500 mt-2">Start a wipe process to create sessions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allSessions.map((session) => (
                    <div 
                      key={session.id}
                      onClick={() => loadSession(session.id)}
                      className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer border border-gray-200 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-900">
                              {session.id.substring(0, 12)}...
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              session.status === 'completed' ? 'bg-green-100 text-green-800' :
                              session.status === 'failed' ? 'bg-red-100 text-red-800' :
                              session.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {session.status}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {session.filesWiped} files, {session.directoriesWiped} dirs • {formatFileSize(session.totalSize)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">
                            {session.startTime ? new Date(session.startTime).toLocaleDateString() : 'N/A'}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentSession(session.id);
                              downloadLogs();
                            }}
                            className="mt-2 text-xs bg-gray-800 text-white px-3 py-1 rounded hover:bg-gray-900"
                          >
                            Download Logs
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="border-t border-gray-200 p-6 bg-gray-50">
              <button
                onClick={() => setShowSessionsList(false)}
                className="w-full py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8 md:mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <FiTrash2 className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                  SecureWipe Pro
                </h1>
                <p className="text-gray-600 mt-1">
                  Military-grade secure file deletion with logs
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowSessionsList(true)}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center space-x-2"
              >
                <FiList className="w-4 h-4" />
                <span>Sessions</span>
              </button>
              <button
                onClick={loadAvailableFiles}
                disabled={loadingFiles}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center space-x-2"
              >
                <FiRefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Stats Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow p-4 border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FiFile className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Files Selected</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalFiles}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow p-4 border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <FiFolder className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Folders Selected</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalFolders}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow p-4 border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FiHardDrive className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Items</p>
                  <p className="text-2xl font-bold text-gray-900">{paths.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow p-4 border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <FiArchive className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Active Sessions</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {allSessions.filter(s => s.status === 'in-progress').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Interface */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Select Items for Secure Wiping</h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={addManualPath}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
                  >
                    <FiPlus className="w-4 h-4" />
                    <span>Add Manually</span>
                  </button>
                </div>
              </div>

              {/* Browse Button */}
              <div className="mb-8">
                <button
                  onClick={openFileBrowser}
                  disabled={loadingFiles}
                  className="w-full p-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-dashed border-blue-300 rounded-xl hover:border-blue-400 hover:from-blue-100 hover:to-indigo-100 transition-all flex flex-col items-center justify-center"
                >
                  <div className="p-4 bg-white rounded-full shadow-lg mb-4">
                    <FiSearch className="w-12 h-12 text-blue-600" />
                  </div>
                  <p className="text-xl font-semibold text-gray-900 mb-2">
                    Browse Files & Folders
                  </p>
                  <p className="text-gray-600 text-center max-w-md">
                    Click to open file browser and select items for secure wiping
                  </p>
                  <p className="text-sm text-gray-500 mt-4">
                    {availableFiles.length} items available
                  </p>
                </button>
              </div>

              {/* Selected Items Section */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">
                    Selected Items ({paths.length})
                  </h3>
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                      className="text-sm text-gray-600 hover:text-gray-900 flex items-center space-x-1"
                    >
                      {showSelectedOnly ? (
                        <>
                          <FiEyeOff className="w-4 h-4" />
                          <span>Show All</span>
                        </>
                      ) : (
                        <>
                          <FiEye className="w-4 h-4" />
                          <span>Show Selected Only</span>
                        </>
                      )}
                    </button>
                    {paths.length > 0 && (
                      <button
                        onClick={clearAllPaths}
                        className="text-sm text-red-600 hover:text-red-800 flex items-center space-x-1"
                      >
                        <FiX className="w-4 h-4" />
                        <span>Clear All</span>
                      </button>
                    )}
                  </div>
                </div>
                
                {paths.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {paths.map((item) => (
                      <div 
                        key={item.id} 
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                      >
                        <div className="flex items-center space-x-4 flex-1">
                          <div className={`p-3 rounded-lg ${item.type === 'file' ? 'bg-blue-100' : 'bg-green-100'}`}>
                            {item.type === 'file' ? (
                              <FiFile className="w-5 h-5 text-blue-600" />
                            ) : (
                              <FiFolder className="w-5 h-5 text-green-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <div className="flex items-center space-x-3 text-sm text-gray-600 mt-1">
                              <span className="capitalize px-2 py-1 bg-gray-200 rounded">{item.type}</span>
                              <span className="text-xs">{item.path}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removePath(item.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove"
                        >
                          <FiX className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl">
                    <FiFolder className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No items selected yet</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Click "Browse Files & Folders" to start selecting items
                    </p>
                  </div>
                )}
              </div>

              {/* Advanced Settings */}
              <div className="mb-8">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 mb-4"
                >
                  {showAdvanced ? (
                    <FiChevronUp className="w-5 h-5" />
                  ) : (
                    <FiChevronDown className="w-5 h-5" />
                  )}
                  <span className="font-medium">Advanced Wipe Settings</span>
                </button>
                
                {showAdvanced && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-4 border border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Number of Wipe Passes: <span className="font-bold">{wipeSettings.passes}</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="35"
                        value={wipeSettings.passes}
                        onChange={(e) => setWipeSettings({
                          ...wipeSettings,
                          passes: parseInt(e.target.value)
                        })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>1 (Fast)</span>
                        <span className="font-semibold">7 (DoD Standard)</span>
                        <span>35 (Gutmann)</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-gray-300 hover:border-blue-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wipeSettings.verify}
                          onChange={(e) => setWipeSettings({
                            ...wipeSettings,
                            verify: e.target.checked
                          })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                        />
                        <div>
                          <span className="font-medium text-gray-900">Verify wipe</span>
                          <p className="text-sm text-gray-500">Double-check files after wiping</p>
                        </div>
                      </label>
                      
                      <label className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-gray-300 hover:border-blue-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wipeSettings.removeEmptyDirs}
                          onChange={(e) => setWipeSettings({
                            ...wipeSettings,
                            removeEmptyDirs: e.target.checked
                          })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                        />
                        <div>
                          <span className="font-medium text-gray-900">Remove empty directories</span>
                          <p className="text-sm text-gray-500">Clean up empty folders after wipe</p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Platform Selection */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Platform for Offline Script
                </label>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setSelectedPlatform('windows')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${selectedPlatform === 'windows' ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">W</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">Windows</span>
                        <p className="text-xs text-gray-500">PowerShell Script</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setSelectedPlatform('linux')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${selectedPlatform === 'linux' ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">L</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">Linux/Mac</span>
                        <p className="text-xs text-gray-500">Bash Script</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <button
                  onClick={downloadScript}
                  disabled={isLoading || isWiping || paths.length === 0}
                  className={`flex-1 py-4 px-6 rounded-lg font-semibold transition-all flex items-center justify-center space-x-3 shadow-sm ${isLoading || isWiping || paths.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                >
                  <FiDownload className="w-5 h-5" />
                  <span>{isLoading ? 'Generating...' : 'Download Script'}</span>
                </button>
                
                <button
                  onClick={startWipe}
                  disabled={isWiping || paths.length === 0}
                  className={`flex-1 py-4 px-6 rounded-lg font-semibold transition-all flex items-center justify-center space-x-3 shadow-sm ${isWiping || paths.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                >
                  {isWiping ? (
                    <>
                      <FiRefreshCw className="w-5 h-5 animate-spin" />
                      <span>Wiping in Progress...</span>
                    </>
                  ) : (
                    <>
                      <FiTrash2 className="w-5 h-5" />
                      <span>Start Secure Wipe</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Status & Info */}
          <div className="space-y-6">
            {/* Wipe Status Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Wipe Status</h3>
                {currentSession && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={manualStatusCheck}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                      title="Check status"
                    >
                      <FiRefreshCw className="w-3 h-3" />
                    </button>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      ID: {currentSession.substring(0, 8)}
                    </span>
                  </div>
                )}
              </div>
              
              {currentSession ? (
                <div className="space-y-4">
                  {/* Status Display */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center ${getStatusColor()}`}>
                      {getStatusIcon()}
                      {getStatusText()}
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  {(wipeStatus === 'in-progress' || sessionDetails?.status === 'in-progress') && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Progress</span>
                        <span>{wipeProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${wipeProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  
                  {/* Session Details */}
                  {sessionDetails && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Files:</span>
                        <span className="font-medium">{sessionDetails.filesWiped || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Folders:</span>
                        <span className="font-medium">{sessionDetails.directoriesWiped || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Started:</span>
                        <span className="font-medium">
                          {sessionDetails.startTime ? new Date(sessionDetails.startTime).toLocaleTimeString() : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Data Wiped:</span>
                        <span className="font-medium">
                          {sessionDetails.totalSize ? formatFileSize(sessionDetails.totalSize) : '0 Bytes'}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {(wipeStatus === 'completed' || sessionDetails?.status === 'completed') && (
                      <>
                        <button
                          onClick={downloadCertificate}
                          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 shadow-sm"
                        >
                          <FiDownload className="w-5 h-5" />
                          <span>Download Certificate</span>
                        </button>
                        
                        <button
                          onClick={viewLogs}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                        >
                          <FiArchive className="w-4 h-4" />
                          <span>View Logs</span>
                        </button>
                        
                        <button
                          onClick={downloadLogs}
                          className="w-full py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                        >
                          <FiDownload className="w-4 h-4" />
                          <span>Download Logs</span>
                        </button>
                      </>
                    )}
                    
                    {(wipeStatus === 'failed' || sessionDetails?.status === 'failed') && (
                      <>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-sm text-red-800">
                            <span className="font-semibold">Error:</span> {sessionDetails?.error || 'Unknown error'}
                          </p>
                        </div>
                        <button
                          onClick={downloadLogs}
                          className="w-full py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                        >
                          <FiDownload className="w-4 h-4" />
                          <span>Download Error Logs</span>
                        </button>
                      </>
                    )}
                    
                    {(wipeStatus === 'in-progress' || sessionDetails?.status === 'in-progress') && (
                      <button
                        onClick={downloadLogs}
                        className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                        title="Download partial logs (available during wipe process)"
                      >
                        <FiDownload className="w-4 h-4" />
                        <span>Download Partial Logs</span>
                      </button>
                    )}
                    
                    <button
                      onClick={clearAllPaths}
                      className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                    >
                      Start New Session
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FiClock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No active wipe session</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Select items and click "Start Secure Wipe" to begin
                  </p>
                  <button
                    onClick={() => setShowSessionsList(true)}
                    className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm"
                  >
                    View Past Sessions
                  </button>
                </div>
              )}
            </div>

            {/* Security Standards Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Security Standards</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <FiCheck className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Military-Grade Wiping</h4>
                    <p className="text-sm text-gray-600">Complies with DoD 5220.22-M standard</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FiActivity className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Detailed Logs</h4>
                    <p className="text-sm text-gray-600">Comprehensive logs for audit trail</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <FiFolder className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Recursive Wiping</h4>
                    <p className="text-sm text-gray-600">All subfolders and files included</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <FiArchive className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Session Persistence</h4>
                    <p className="text-sm text-gray-600">Logs available for 7 days after completion</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Guide */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">How It Works</h3>
              <ol className="space-y-3 text-sm">
                <li className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                  <span className="text-gray-700">Browse and select files/folders using the file browser</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                  <span className="text-gray-700">Review selection in confirmation dialog</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                  <span className="text-gray-700">Start wiping or download script for offline use</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">4</div>
                  <span className="text-gray-700">Download certificate and logs after completion</span>
                </li>
              </ol>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-300">
          <div className="text-center">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">SecureWipe Pro v2.5</span> • Professional Secure File Deletion with Logs
            </p>
            <p className="text-xs text-gray-500 mt-2 max-w-2xl mx-auto">
              This tool implements DoD 5220.22-M, Gutmann, and other government-approved secure deletion standards.
              All wipe sessions are logged and available for download for audit purposes.
              <span className="block mt-1 font-semibold text-red-600">
                WARNING: Secure wiping permanently destroys data. Recovery is impossible. Use with extreme caution.
              </span>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}