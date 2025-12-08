'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  FiUpload,
  FiX,
  FiCheck,
  FiAlertCircle,
  FiLock,
  FiUnlock,
  FiCloud,
  FiFile,
  FiFolder
} from 'react-icons/fi';

const S3UploadModal = ({ 
  isOpen, 
  onClose, 
  selectedFiles = [],  // Ensure default is array
  sessionId,
  onUploadComplete 
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadResults, setUploadResults] = useState([]);
  const [errors, setErrors] = useState([]);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setUploadProgress(0);
      setUploadStatus('');
      setUploadResults([]);
      setErrors([]);
    }
  }, [isOpen]);

  // Validate selectedFiles
  const validFiles = Array.isArray(selectedFiles) ? selectedFiles : [];
  
  // Ensure files have required properties
  const processedFiles = validFiles.map(file => {
    if (typeof file === 'string') {
      return {
        path: file,
        name: file.split('/').pop() || file,
        type: 'file'
      };
    }
    return {
      path: file.path || '',
      name: file.name || '',
      type: file.type || 'file'
    };
  }).filter(file => file.path && file.name);

  // In the handleUpload function of S3UploadModal.js
// In S3UploadModal.js - Update the handleUpload function

const handleUpload = async () => {
  if (processedFiles.length === 0) {
    setErrors([{ message: 'No valid files selected for upload' }]);
    return;
  }

  setIsUploading(true);
  setUploadProgress(0);
  setUploadStatus('Preparing files...');
  setUploadResults([]);
  setErrors([]);

  try {
    // Prepare request data - ensure processedFiles is a proper array
    const requestData = {
      files: processedFiles,
      password: password.trim() || null,
      sessionId: sessionId
    };

    console.log('📤 Sending upload request data:', JSON.stringify(requestData, null, 2));
    console.log('Number of files:', processedFiles.length);
    console.log('File details:', processedFiles);

    setUploadStatus('Uploading to S3...');
    setUploadProgress(30);

    // Use FormData instead of JSON for better compatibility
    const formData = new FormData();
    formData.append('data', JSON.stringify(requestData));

    // Make the API call
    const response = await axios.post(`${API_BASE_URL}/api/s3/upload`, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 300000,
    });

    console.log('✅ Upload response:', response.data);
    
    setUploadProgress(100);
    setUploadStatus('Upload complete!');
    
    if (response.data.success) {
      setUploadResults(response.data.uploads || []);
      
      if (onUploadComplete) {
        onUploadComplete(response.data);
      }
      
      setTimeout(() => {
        if (isOpen) {
          onClose();
        }
      }, 3000);
    } else {
      setErrors([{ message: response.data.error || 'Upload failed' }]);
    }

  } catch (error) {
    console.error('❌ Upload error:', error);
    console.error('❌ Error response:', error.response?.data);
    
    setUploadProgress(0);
    setUploadStatus('Upload failed');
    
    let errorMessage = 'Upload failed. Please try again.';
    
    if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.message.includes('Network Error')) {
      errorMessage = 'Network error. Please check your connection and server status.';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout. The server may be busy or the file is too large.';
    }
    
    setErrors([{ message: errorMessage }]);
    
    // Log full error details
    console.error('Full error details:', {
      message: error.message,
      response: error.response,
      request: error.request
    });
  } finally {
    setIsUploading(false);
  }
};

  const handleClose = () => {
    if (!isUploading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-white/20 rounded-lg">
                <FiCloud className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Backup to AWS S3</h2>
                <p className="text-blue-100 mt-1">Upload files securely before wiping</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* File Selection Summary */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <FiFile className="w-5 h-5 mr-2 text-blue-600" />
              Files to Upload ({processedFiles.length})
            </h3>
            <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              {processedFiles.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No files selected</p>
              ) : (
                processedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded">
                    <div className="flex items-center space-x-2">
                      <FiFile className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{file.type}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Password Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              <FiLock className="w-4 h-4 mr-2" />
              Optional Encryption Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to encrypt files (optional)"
                className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                disabled={isUploading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-500 hover:text-gray-700"
                disabled={isUploading}
              >
                {showPassword ? <FiUnlock className="w-5 h-5" /> : <FiLock className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Files will be encrypted with AES-256. Keep this password safe!
            </p>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{uploadStatus}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Upload Results */}
          {uploadResults.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-green-700 mb-3 flex items-center">
                <FiCheck className="w-5 h-5 mr-2" />
                Upload Successful ({uploadResults.length} files)
              </h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                {uploadResults.map((result, index) => (
                  <div key={index} className="p-2 hover:bg-green-100 rounded">
                    <div className="flex items-center space-x-2">
                      <FiCloud className="w-4 h-4 text-green-600" />
                      <div className="flex-1">
                        <p className="text-sm text-green-800 truncate">{result.originalName}</p>
                        <p className="text-xs text-green-600">
                          {result.isRealS3 ? 'Uploaded to AWS S3' : 'Saved locally (simulation)'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-red-700 mb-3 flex items-center">
                <FiAlertCircle className="w-5 h-5 mr-2" />
                Upload Errors
              </h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                {errors.map((error, index) => (
                  <p key={index} className="text-sm text-red-700">
                    {error.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Information Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
              <FiCloud className="w-4 h-4 mr-2" />
              About AWS S3 Backup
            </h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Files are stored in secure AWS S3 buckets</li>
              <li>• Optional AES-256 encryption with password protection</li>
              <li>• Downloadable anytime with secure links</li>
              <li>• Files are kept separate from wipe operations</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="flex-1 py-3 px-6 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading || processedFiles.length === 0}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                isUploading || processedFiles.length === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
              }`}
            >
              {isUploading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <FiUpload className="w-5 h-5" />
                  <span>Upload to S3 ({processedFiles.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default S3UploadModal;