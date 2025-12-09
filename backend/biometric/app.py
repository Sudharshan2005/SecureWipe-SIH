# face_verification_server.py - HEADLESS VERSION
import cv2
import numpy as np
import pickle
import os
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import base64
import json

class FaceVerificationSystem:
    def __init__(self, data_dir='face_data', threshold=0.6):
        self.data_dir = data_dir
        self.threshold = threshold
        self.known_faces = {}
        self.verification_logs = []
        
        os.makedirs(data_dir, exist_ok=True)
        
        # Initialize camera
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            print("Warning: Could not open camera. Camera functions will be disabled.")
            self.camera_available = False
        else:
            self.camera_available = True
        
        # Initialize face detection
        try:
            self.face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            )
            self.cascade_loaded = True
        except:
            print("Warning: Could not load Haar Cascade. Face detection will use DNN only.")
            self.cascade_loaded = False
        
        # Load deep learning model if available
        self.dnn_model = self.load_dnn_model()
    
    def load_dnn_model(self):
        """Load OpenCV DNN face detection model for better accuracy"""
        try:
            # Try to load OpenCV Face Detector
            modelFile = "res10_300x300_ssd_iter_140000_fp16.caffemodel"
            configFile = "deploy.prototxt"
            
            if os.path.exists(modelFile) and os.path.exists(configFile):
                net = cv2.dnn.readNetFromCaffe(configFile, modelFile)
                print("✓ Loaded DNN face detection model")
                return net
            else:
                print("⚠ DNN model files not found. Download them for better accuracy.")
                print("   deploy.prototxt: https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/deploy.prototxt")
                print("   res10_300x300_ssd_iter_140000_fp16.caffemodel: https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20180205_fp16/res10_300x300_ssd_iter_140000_fp16.caffemodel")
                return None
        except Exception as e:
            print(f"⚠ Failed to load DNN model: {e}")
            return None
    
    def detect_faces_dnn(self, frame):
        """Detect faces using DNN model"""
        if self.dnn_model is None:
            return []
        
        h, w = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(cv2.resize(frame, (300, 300)), 1.0,
                                     (300, 300), (104.0, 177.0, 123.0))
        self.dnn_model.setInput(blob)
        detections = self.dnn_model.forward()
        
        faces = []
        for i in range(detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            if confidence > 0.5:  # Confidence threshold
                box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                x1, y1, x2, y2 = box.astype("int")
                # Ensure coordinates are within frame
                x1 = max(0, x1)
                y1 = max(0, y1)
                x2 = min(w, x2)
                y2 = min(h, y2)
                faces.append((x1, y1, x2-x1, y2-y1))
        
        return faces
    
    def detect_faces_haar(self, frame):
        """Detect faces using Haar Cascade"""
        if not self.cascade_loaded:
            return []
        
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.1, 
                minNeighbors=5,
                minSize=(30, 30)
            )
            return faces
        except:
            return []
    
    def detect_faces(self, frame):
        """Detect faces using best available method"""
        # Try DNN first
        faces = self.detect_faces_dnn(frame)
        
        # If no faces found with DNN, try Haar
        if len(faces) == 0:
            faces = self.detect_faces_haar(frame)
        
        return faces
    
    def extract_face_encoding(self, face_image):
        """Extract face encoding using deep learning or fallback"""
        # Ensure face image is valid
        if face_image is None or face_image.size == 0:
            return None, 'invalid'
        
        try:
            # Try deep learning with face_recognition
            import face_recognition
            rgb_image = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
            encodings = face_recognition.face_encodings(rgb_image)
            if encodings:
                return encodings[0], 'deep_learning'
        except ImportError:
            pass
        except Exception as e:
            print(f"Deep learning encoding failed: {e}")
        
        # Fallback to feature-based encoding
        try:
            face_resized = cv2.resize(face_image, (128, 128))
            
            # Extract multiple features
            features = []
            
            # Color histogram for each channel
            for channel in range(3):
                hist = cv2.calcHist([face_resized], [channel], None, [32], [0, 256])
                if hist is not None:
                    hist = cv2.normalize(hist, hist).flatten()
                    features.extend(hist)
            
            # LBP features
            gray = cv2.cvtColor(face_resized, cv2.COLOR_BGR2GRAY)
            lbp = self.extract_lbp_features(gray)
            features.extend(lbp)
            
            # Edge features
            edges = cv2.Canny(gray, 100, 200)
            edge_hist, _ = np.histogram(edges.flatten(), bins=20, range=(0, 256))
            edge_hist = edge_hist.astype("float")
            if edge_hist.sum() > 0:
                edge_hist /= edge_hist.sum()
            features.extend(edge_hist)
            
            return np.array(features), 'feature_based'
        except Exception as e:
            print(f"Feature-based encoding failed: {e}")
            return None, 'error'
    
    def extract_lbp_features(self, image, radius=2, points=16):
        """Extract Local Binary Pattern features"""
        try:
            height, width = image.shape
            lbp_image = np.zeros((height-2*radius, width-2*radius), dtype=np.uint8)
            
            for i in range(radius, height-radius):
                for j in range(radius, width-radius):
                    center = image[i, j]
                    binary_code = 0
                    power = 0
                    for p in range(points):
                        angle = 2 * np.pi * p / points
                        x = int(j + radius * np.cos(angle))
                        y = int(i - radius * np.sin(angle))
                        if x >= 0 and x < width and y >= 0 and y < height:
                            binary_code |= (image[y, x] >= center) << power
                        power += 1
                    lbp_image[i-radius, j-radius] = binary_code
            
            # Histogram of LBP
            hist, _ = np.histogram(lbp_image.ravel(), bins=256, range=(0, 256))
            hist = hist.astype("float")
            if hist.sum() > 0:
                hist /= hist.sum()
            return hist
        except:
            return np.zeros(256)
    
    def compare_faces(self, encoding1, encoding2, method='deep_learning'):
        """Compare two face encodings"""
        if encoding1 is None or encoding2 is None:
            return float('inf')
        
        try:
            if method == 'deep_learning':
                # Cosine distance for deep learning encodings
                return np.linalg.norm(encoding1 - encoding2)
            else:
                # Weighted Euclidean distance for feature-based
                weights = np.ones_like(encoding1)
                if len(weights) > 96:  # If we have LBP features
                    weights[96:] = 2.0  # Double weight for LBP features
                weighted_diff = weights * (encoding1 - encoding2)
                return np.sqrt(np.sum(weighted_diff ** 2))
        except:
            return float('inf')
    
    def capture_frame(self):
        """Capture a single frame from camera"""
        if not self.camera_available:
            return None
        
        try:
            ret, frame = self.cap.read()
            if ret:
                return frame
            return None
        except:
            return None
    
    def register_user(self, username, num_samples=3):
        """Register a new user without GUI windows"""
        print(f"Registering user: {username}")
        
        if not self.camera_available:
            print("Camera not available for registration")
            return False
        
        samples = []
        sample_count = 0
        start_time = datetime.now()
        
        print("Look at the camera. Capturing samples...")
        
        while sample_count < num_samples:
            # Check timeout (30 seconds)
            if (datetime.now() - start_time).seconds > 30:
                print("Registration timeout (30 seconds)")
                return False
            
            frame = self.capture_frame()
            if frame is None:
                continue
            
            faces = self.detect_faces(frame)
            
            if len(faces) > 0:
                x, y, w, h = faces[0]
                face = frame[y:y+h, x:x+w]
                
                if face.size > 0:
                    # Ensure face is reasonably sized
                    if w > 100 and h > 100:
                        encoding, method = self.extract_face_encoding(face)
                        if encoding is not None:
                            samples.append((encoding, method))
                            sample_count += 1
                            print(f"✓ Captured sample {sample_count}/{num_samples}")
                            
                            # Wait a moment between samples
                            import time
                            time.sleep(0.5)
                    else:
                        print("⚠ Face too small. Move closer to camera.")
            else:
                print("⚠ No face detected. Look directly at camera.")
            
            # Small delay
            import time
            time.sleep(0.1)
        
        if samples:
            # Separate encodings by method
            deep_learning_samples = [e for e, m in samples if m == 'deep_learning']
            feature_samples = [e for e, m in samples if m == 'feature_based']
            
            if deep_learning_samples:
                avg_encoding = np.mean(deep_learning_samples, axis=0)
                method = 'deep_learning'
            elif feature_samples:
                avg_encoding = np.mean(feature_samples, axis=0)
                method = 'feature_based'
            else:
                print("No valid samples collected")
                return False
            
            self.known_faces[username] = {
                'encoding': avg_encoding,
                'method': method,
                'samples': len(samples),
                'registered': datetime.now().isoformat()
            }
            
            self.save_data()
            print(f"✓ User '{username}' registered successfully!")
            
            # Log registration
            self.log_verification(username, 'registration', True, {'samples': len(samples)})
            return True
        
        print("✗ No valid faces detected during registration")
        return False
    
    def verify_user(self, username, max_attempts=3):
        """Verify user identity without GUI windows"""
        if username not in self.known_faces:
            print(f"User '{username}' not registered")
            return False
        
        if not self.camera_available:
            print("Camera not available for verification")
            return False
        
        user_data = self.known_faces[username]
        registered_encoding = user_data['encoding']
        method = user_data['method']
        
        print(f"Verifying user: {username}")
        
        for attempt in range(max_attempts):
            print(f"Attempt {attempt + 1}/{max_attempts}")
            
            frame = self.capture_frame()
            if frame is None:
                print("Could not capture frame")
                continue
            
            faces = self.detect_faces(frame)
            best_distance = float('inf')
            
            for (x, y, w, h) in faces:
                face = frame[y:y+h, x:x+w]
                if face.size > 0 and w > 100 and h > 100:
                    encoding, detected_method = self.extract_face_encoding(face)
                    if encoding is not None:
                        # Use appropriate comparison method
                        if method == detected_method:
                            distance = self.compare_faces(encoding, registered_encoding, method)
                        else:
                            # If methods don't match, use feature-based
                            distance = self.compare_faces(encoding, registered_encoding, 'feature_based')
                        
                        best_distance = min(best_distance, distance)
                        
                        print(f"  Face detected, distance: {distance:.4f}")
            
            # Check verification
            if best_distance < self.threshold:
                print(f"✓ Verification successful! Distance: {best_distance:.4f}")
                self.log_verification(username, 'verification', True, {'distance': best_distance})
                return True
            else:
                print(f"✗ Verification failed. Best distance: {best_distance:.4f} (threshold: {self.threshold})")
            
            # Small delay between attempts
            import time
            time.sleep(0.5)
        
        print("✗ All verification attempts failed")
        self.log_verification(username, 'verification', False, {'attempts': max_attempts})
        return False
    
    def log_verification(self, username, action, success, details=None):
        """Log verification events"""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'username': username,
            'action': action,
            'success': success,
            'details': details or {}
        }
        self.verification_logs.append(log_entry)
        
        # Save logs periodically
        if len(self.verification_logs) % 10 == 0:
            self.save_logs()
    
    def save_logs(self):
        """Save verification logs"""
        logs_file = os.path.join(self.data_dir, 'verification_logs.json')
        try:
            with open(logs_file, 'w') as f:
                json.dump(self.verification_logs[-1000:], f, indent=2)  # Keep last 1000 logs
        except:
            pass
    
    def get_verification_stats(self, username):
        """Get verification statistics for a user"""
        user_logs = [log for log in self.verification_logs if log.get('username') == username]
        
        successful = len([log for log in user_logs if log['success']])
        failed = len(user_logs) - successful
        
        last_success = None
        last_failure = None
        
        for log in reversed(user_logs):
            if log['success'] and not last_success:
                last_success = log['timestamp']
            elif not log['success'] and not last_failure:
                last_failure = log['timestamp']
            if last_success and last_failure:
                break
        
        return {
            'total_attempts': len(user_logs),
            'successful': successful,
            'failed': failed,
            'success_rate': (successful / len(user_logs)) * 100 if user_logs else 0,
            'last_success': last_success,
            'last_failure': last_failure
        }
    
    def save_data(self):
        """Save registered face data"""
        data_file = os.path.join(self.data_dir, 'faces.pkl')
        try:
            with open(data_file, 'wb') as f:
                pickle.dump(self.known_faces, f)
            print(f"✓ Saved face data for {len(self.known_faces)} users")
        except Exception as e:
            print(f"✗ Failed to save face data: {e}")
    
    def load_data(self):
        """Load registered face data"""
        data_file = os.path.join(self.data_dir, 'faces.pkl')
        if os.path.exists(data_file):
            try:
                with open(data_file, 'rb') as f:
                    self.known_faces = pickle.load(f)
                print(f"✓ Loaded face data for {len(self.known_faces)} users")
                return True
            except Exception as e:
                print(f"✗ Failed to load face data: {e}")
                self.known_faces = {}
        return False
    
    def test_camera(self):
        """Test if camera is working"""
        if not self.camera_available:
            return None, "Camera not available"
        
        try:
            ret, frame = self.cap.read()
            if ret:
                faces = self.detect_faces(frame)
                return frame, f"Camera working. Detected {len(faces)} faces."
            else:
                return None, "Could not read from camera"
        except Exception as e:
            return None, f"Camera error: {e}"
    
    def get_snapshot(self):
        """Get a snapshot from camera"""
        if not self.camera_available:
            return None
        
        try:
            ret, frame = self.cap.read()
            if ret:
                # Convert to base64
                _, buffer = cv2.imencode('.jpg', frame)
                img_str = base64.b64encode(buffer).decode('utf-8')
                return img_str
            return None
        except:
            return None

# Flask Application
app = Flask(__name__)
CORS(app)

face_system = FaceVerificationSystem(threshold=0.55)

@app.route('/api/face/status', methods=['GET'])
def system_status():
    """Get system status"""
    return jsonify({
        'success': True,
        'status': 'running',
        'registered_users': len(face_system.known_faces),
        'threshold': face_system.threshold,
        'using_dnn': face_system.dnn_model is not None,
        'camera_available': face_system.camera_available,
        'cascade_loaded': face_system.cascade_loaded
    })

@app.route('/api/face/register', methods=['POST'])
def register_face():
    """Register a new user's face"""
    data = request.json
    username = data.get('username')
    
    if not username:
        return jsonify({'success': False, 'error': 'Username is required'}), 400
    
    # Check if already registered
    if username in face_system.known_faces:
        return jsonify({
            'success': False,
            'error': 'User already registered',
            'registered_at': face_system.known_faces[username]['registered']
        }), 400
    
    if not face_system.camera_available:
        return jsonify({
            'success': False,
            'error': 'Camera not available. Please check camera connection.'
        }), 503
    
    # Start registration in thread
    def registration_task():
        success = face_system.register_user(username, num_samples=3)
        return success
    
    thread = threading.Thread(target=registration_task)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'Registration started. Please look at your camera.',
        'username': username,
        'note': 'Registration may take 10-15 seconds. The system will capture 3 samples.'
    })

@app.route('/api/face/verify', methods=['POST'])
def verify_face():
    """Verify user's face"""
    data = request.json
    username = data.get('username')
    
    if not username:
        return jsonify({'success': False, 'error': 'Username is required'}), 400
    
    if username not in face_system.known_faces:
        return jsonify({'success': False, 'error': 'User not registered'}), 404
    
    if not face_system.camera_available:
        return jsonify({
            'success': False,
            'error': 'Camera not available. Please check camera connection.'
        }), 503
    
    verified = face_system.verify_user(username, max_attempts=3)
    
    return jsonify({
        'success': verified,
        'verified': verified,
        'username': username,
        'message': 'Identity verified successfully' if verified else 'Verification failed'
    })

@app.route('/api/face/quick-verify', methods=['POST'])
def quick_verify():
    """Quick verification with single attempt"""
    data = request.json
    username = data.get('username')
    
    if not username:
        return jsonify({'success': False, 'error': 'Username is required'}), 400
    
    if username not in face_system.known_faces:
        return jsonify({'success': False, 'error': 'User not registered'}), 404
    
    if not face_system.camera_available:
        return jsonify({
            'success': False,
            'error': 'Camera not available'
        }), 503
    
    # Quick verification with single attempt
    verified = face_system.verify_user(username, max_attempts=1)
    
    return jsonify({
        'success': verified,
        'verified': verified,
        'username': username,
        'message': 'Quick verification successful' if verified else 'Quick verification failed'
    })

@app.route('/api/face/check-registered', methods=['POST'])
def check_registered():
    """Check if user is registered"""
    data = request.json
    username = data.get('username')
    
    if not username:
        return jsonify({'success': False, 'error': 'Username is required'}), 400
    
    is_registered = username in face_system.known_faces
    user_data = face_system.known_faces.get(username, {})
    
    return jsonify({
        'success': True,
        'registered': is_registered,
        'username': username,
        'registered_at': user_data.get('registered'),
        'samples': user_data.get('samples', 0),
        'method': user_data.get('method', 'unknown'),
        'camera_available': face_system.camera_available
    })

@app.route('/api/face/users', methods=['GET'])
def list_users():
    """List all registered users"""
    users = []
    for username, data in face_system.known_faces.items():
        users.append({
            'username': username,
            'registered_at': data.get('registered'),
            'samples': data.get('samples', 0),
            'method': data.get('method', 'unknown')
        })
    
    return jsonify({
        'success': True,
        'users': users,
        'total': len(users)
    })

@app.route('/api/face/stats/<username>', methods=['GET'])
def get_user_stats(username):
    """Get verification statistics for a user"""
    if username not in face_system.known_faces:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    
    stats = face_system.get_verification_stats(username)
    return jsonify({'success': True, 'stats': stats, 'username': username})

@app.route('/api/face/logs', methods=['GET'])
def get_verification_logs():
    """Get recent verification logs"""
    limit = int(request.args.get('limit', 50))
    username = request.args.get('username')
    
    logs = face_system.verification_logs
    if username:
        logs = [log for log in logs if log.get('username') == username]
    
    return jsonify({
        'success': True,
        'logs': logs[-limit:],
        'total': len(logs)
    })

@app.route('/api/face/update-threshold', methods=['POST'])
def update_threshold():
    """Update verification threshold"""
    data = request.json
    threshold = data.get('threshold')
    
    try:
        threshold = float(threshold)
        if 0.1 <= threshold <= 1.0:
            old_threshold = face_system.threshold
            face_system.threshold = threshold
            return jsonify({
                'success': True,
                'message': f'Threshold updated from {old_threshold} to {threshold}',
                'threshold': threshold
            })
        else:
            return jsonify({'success': False, 'error': 'Threshold must be between 0.1 and 1.0'}), 400
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Invalid threshold value'}), 400

@app.route('/api/face/delete-user', methods=['POST'])
def delete_user():
    """Delete a registered user"""
    data = request.json
    username = data.get('username')
    
    if not username:
        return jsonify({'success': False, 'error': 'Username is required'}), 400
    
    if username in face_system.known_faces:
        del face_system.known_faces[username]
        face_system.save_data()
        return jsonify({
            'success': True,
            'message': f'User {username} deleted successfully',
            'username': username
        })
    else:
        return jsonify({'success': False, 'error': 'User not found'}), 404

@app.route('/api/face/test-camera', methods=['GET'])
def test_camera():
    """Test camera functionality"""
    if not face_system.camera_available:
        return jsonify({
            'success': False,
            'camera_working': False,
            'error': 'Camera not available'
        })
    
    frame, message = face_system.test_camera()
    
    if frame is not None:
        # Convert to base64 for response
        _, buffer = cv2.imencode('.jpg', frame)
        img_str = base64.b64encode(buffer).decode('utf-8')
        
        # Detect faces
        faces = face_system.detect_faces(frame)
        
        return jsonify({
            'success': True,
            'camera_working': True,
            'faces_detected': len(faces),
            'image': img_str,
            'message': message,
            'resolution': f'{frame.shape[1]}x{frame.shape[0]}'
        })
    else:
        return jsonify({
            'success': False,
            'camera_working': False,
            'error': message
        })

@app.route('/api/face/snapshot', methods=['GET'])
def get_snapshot():
    """Get current camera snapshot"""
    img_str = face_system.get_snapshot()
    
    if img_str:
        return jsonify({
            'success': True,
            'image': img_str,
            'timestamp': datetime.now().isoformat()
        })
    else:
        return jsonify({
            'success': False,
            'error': 'Could not capture snapshot'
        })

@app.route('/api/face/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'system_info': {
            'registered_users': len(face_system.known_faces),
            'camera_available': face_system.camera_available,
            'dnn_available': face_system.dnn_model is not None,
            'cascade_available': face_system.cascade_loaded,
            'threshold': face_system.threshold,
            'logs_count': len(face_system.verification_logs)
        }
    })

if __name__ == '__main__':
    # Load existing data
    face_system.load_data()
    
    print("\n" + "="*60)
    print("FACE VERIFICATION SERVER - HEADLESS VERSION")
    print("="*60)
    print(f"Registered users: {len(face_system.known_faces)}")
    print(f"Verification threshold: {face_system.threshold}")
    print(f"Camera available: {face_system.camera_available}")
    print(f"Using DNN model: {face_system.dnn_model is not None}")
    print(f"Haar Cascade loaded: {face_system.cascade_loaded}")
    print("\nAvailable endpoints:")
    print("  GET  /api/face/status          - System status")
    print("  POST /api/face/register        - Register new user")
    print("  POST /api/face/verify          - Verify user identity")
    print("  POST /api/face/quick-verify    - Quick verification")
    print("  POST /api/face/check-registered - Check registration")
    print("  GET  /api/face/users           - List users")
    print("  GET  /api/face/stats/<user>    - User statistics")
    print("  GET  /api/face/logs            - Verification logs")
    print("  POST /api/face/update-threshold - Update threshold")
    print("  POST /api/face/delete-user     - Delete user")
    print("  GET  /api/face/test-camera     - Test camera")
    print("  GET  /api/face/snapshot        - Get camera snapshot")
    print("  GET  /api/face/health          - Health check")
    print("="*60)
    print("\n⚠ IMPORTANT: This is a headless server. No GUI windows will appear.")
    print("  All face detection happens in the background.")
    print("  Make sure your camera is connected and accessible.\n")
    
    # Test camera on startup
    if face_system.camera_available:
        print("Testing camera...")
        frame, message = face_system.test_camera()
        if frame is not None:
            print(f"✓ Camera test passed: {message}")
        else:
            print(f"✗ Camera test failed: {message}")
    else:
        print("⚠ Camera not available. Face registration/verification will not work.")
    
    print("\nStarting server on http://0.0.0.0:5002")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)