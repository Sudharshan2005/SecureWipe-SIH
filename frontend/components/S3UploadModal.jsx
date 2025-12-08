// frontend/components/S3UploadModal.jsx
import { useState } from 'react';
import { 
  FiUpload, 
  FiLock, 
  FiUnlock, 
  FiX, 
  FiCheck, 
  FiAlertCircle,
  FiCloud,
  FiFile,
  FiShield
} from 'react-icons/fi';

const S3UploadModal = ({ 
  isOpen, 
  onClose, 
  selectedFiles,
  sessionId,
  onUploadComplete
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState(null);
  const [errors, setErrors] = useState([]);

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (usePassword && password !== confirmPassword) {
      setErrors(['Passwords do not match']);
      return;
    }

    if (usePassword && password.length < 4) {
      setErrors(['Password must be at least 4 characters']);
      return;
    }

    setUploading(true);
    setErrors([]);
    setUploadProgress(0);

    try {
      // Prepare files for upload
      const filesToUpload = selectedFiles.map(file => ({
        path: file.path,
        name: file.name || file.path.split('/').pop()
      }));

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/s3/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesToUpload,
          password: usePassword ? password : null,
          sessionId: sessionId
        })
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const result = await response.json();
      
      if (result.success) {
        setUploadResults(result);
        if (onUploadComplete) {
          onUploadComplete(result);
        }
      } else {
        setErrors([result.error || 'Upload failed']);
      }
    } catch (error) {
      setErrors([`Upload failed: ${error.message}`]);
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = async (fileIndex) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/s3/download/${sessionId}/${fileIndex}`
      );
      const result = await response.json();
      
      if (result.downloadUrl) {
        window.open(result.downloadUrl, '_blank');
      } else if (result.fileUrl) {
        alert(`File URL: ${result.fileUrl}\n\n${result.note || ''}`);
      }
    } catch (error) {
      alert(`Failed to get download link: ${error.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <FiCloud className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Secure Cloud Backup</h2>
                <p className="text-blue-100 mt-1">Upload important files to AWS S3 before wiping</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {uploadResults ? (
            <div className="space-y-6">
              {/* Success Message */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <FiCheck className="w-6 h-6 text-green-600" />
                  <div>
                    <h3 className="font-bold text-green-800">Upload Successful!</h3>
                    <p className="text-green-700 text-sm mt-1">
                      {uploadResults.uploaded} file(s) uploaded to {uploadResults.note}
                    </p>
                  </div>
                </div>
              </div>

              {/* Uploaded Files List */}
              <div>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center">
                  <FiFile className="w-5 h-5 mr-2 text-blue-600" />
                  Uploaded Files
                </h3>
                <div className="space-y-3">
                  {uploadResults.uploads.map((upload, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <FiFile className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{upload.originalName}</p>
                            <div className="flex items-center space-x-3 text-sm text-gray-600 mt-1">
                              <span className="flex items-center">
                                <FiShield className="w-3 h-3 mr-1" />
                                {upload.encrypted ? 'Password Protected' : 'Not Encrypted'}
                              </span>
                              <span>{Math.round(upload.size / 1024)} KB</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => downloadFile(index)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                        >
                          Get Link
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-gray-500 truncate">
                        S3 Key: {upload.s3Key}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Errors (if any) */}
              {uploadResults.errors && uploadResults.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-bold text-red-800 mb-2 flex items-center">
                    <FiAlertCircle className="w-5 h-5 mr-2" />
                    Upload Errors ({uploadResults.errors.length})
                  </h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    {uploadResults.errors.map((error, idx) => (
                      <li key={idx}>• {error.file?.name || 'Unknown'}: {error.error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-bold text-blue-800 mb-2">Next Steps:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Files are safely stored in AWS S3 cloud storage</li>
                  <li>• Use "Get Link" to download files anytime</li>
                  <li>• Links expire after 1 hour for security</li>
                  <li>• Proceed with secure wipe when ready</li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              {/* Files to Upload */}
              <div className="mb-6">
                <h3 className="font-bold text-gray-900 mb-3">
                  Files to Backup ({selectedFiles.length})
                </h3>
                <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                      <div className="flex items-center space-x-2">
                        <FiFile className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium">{file.name || file.path.split('/').pop()}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {file.type === 'file' ? 'File' : 'Folder'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Password Protection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">Password Protection</h3>
                  <button
                    onClick={() => setUsePassword(!usePassword)}
                    className={`px-4 py-2 rounded-lg font-medium flex items-center space-x-2 ${
                      usePassword 
                        ? 'bg-green-100 text-green-800 border border-green-300' 
                        : 'bg-gray-100 text-gray-800 border border-gray-300'
                    }`}
                  >
                    {usePassword ? (
                      <>
                        <FiLock className="w-4 h-4" />
                        <span>Protected</span>
                      </>
                    ) : (
                      <>
                        <FiUnlock className="w-4 h-4" />
                        <span>No Protection</span>
                      </>
                    )}
                  </button>
                </div>

                {usePassword && (
                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Set Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password (min 4 characters)"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm password"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-xs text-gray-600">
                      <p>• Files will be encrypted with AES-256 before upload</p>
                      <p>• Password is required to download and decrypt</p>
                      <p>• We don't store your password - remember it!</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {uploading && (
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Uploading to AWS S3...</span>
                    <span className="font-medium">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Errors */}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center space-x-2 text-red-800">
                    <FiAlertCircle className="w-5 h-5" />
                    <span className="font-medium">Please fix the following:</span>
                  </div>
                  <ul className="mt-2 text-sm text-red-700 space-y-1">
                    {errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Security Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-bold text-blue-800 mb-2 flex items-center">
                  <FiShield className="w-5 h-5 mr-2" />
                  Security Features
                </h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Military-grade AES-256 encryption (if password set)</li>
                  <li>• Secure AWS S3 storage with 99.99% durability</li>
                  <li>• Automatic encryption at rest</li>
                  <li>• Time-limited download links (1 hour expiry)</li>
                  <li>• No access logs stored</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between space-x-4">
            <button
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              {uploadResults ? 'Close' : 'Cancel'}
            </button>
            
            {!uploadResults ? (
              <button
                onClick={handleUpload}
                disabled={uploading || (usePassword && (!password || !confirmPassword))}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                  uploading || (usePassword && (!password || !confirmPassword))
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                }`}
              >
                {uploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <FiUpload className="w-5 h-5" />
                    <span>Upload to AWS S3</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold transition-colors flex items-center space-x-2"
              >
                <FiCheck className="w-5 h-5" />
                <span>Proceed to Wipe</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default S3UploadModal;