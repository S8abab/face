const video = document.getElementById('video');
const errorDiv = document.getElementById('error');
const canvas = document.getElementById('overlay');
let displaySize = { width: 0, height: 0 };

function logError(message) {
    console.error(message);
    if (message && message.trim() !== '') {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    } else {
        errorDiv.style.display = 'none';
    }
}

function updateDisplaySize() {
    const container = document.querySelector('.container');
    displaySize = {
        width: container.clientWidth,
        height: container.clientHeight
    };
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    console.log('updateDisplaySize:', displaySize);
}

function waitForFaceAPI() {
    return new Promise((resolve, reject) => {
        const checkFaceAPI = () => {
            if (window.faceapi) {
                resolve(window.faceapi);
            } else {
                setTimeout(checkFaceAPI, 100);
            }
        };
        checkFaceAPI();
        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('Timeout waiting for face-api.js')), 10000);
    });
}

async function loadModels() {
    try {
        const faceapi = await waitForFaceAPI();
        console.log('Face API loaded, loading models...');
        
        // Load models from CDN with correct path
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        console.log('Models loaded');
        return faceapi;
    } catch (err) {
        logError('Error loading models: ' + err.message);
        throw err;
    }
}

async function startCamera() {
    try {
        console.log('Checking mediaDevices support...');
        if (!navigator.mediaDevices) {
            navigator.mediaDevices = {};
        }

        if (!navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia = function(constraints) {
                const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                
                if (!getUserMedia) {
                    return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
                }

                return new Promise(function(resolve, reject) {
                    getUserMedia.call(navigator, constraints, resolve, reject);
                });
            }
        }

        console.log('Requesting camera permissions...');
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        console.log('Camera access granted, setting up video...');
        video.srcObject = stream;
        video.play(); // Explicitly start video playback

        // Log video readiness state
        console.log('Video readyState:', video.readyState);
        console.log('Video dimensions:', video.videoWidth, video.videoHeight);

        // Load models after camera access is granted
        const faceapi = await loadModels();
        console.log('loadModels completed.');

        console.log('About to set up detection interval with delay...');
        
        // Start face detection after a short delay, independent of video events
        setTimeout(() => {
            console.log('Inside setTimeout, initiating detection interval.');
            // Initial update of display size
            updateDisplaySize();
            console.log('Initial displaySize updated.');

            // Update display size on window resize
            window.addEventListener('resize', updateDisplaySize);

            setInterval(async () => {
                console.log('setInterval callback triggered');
                
                // Check if video is ready before processing
                if (video.readyState < 4) {
                    console.log('Video not ready (readyState:', video.readyState, '). Skipping detection.');
                    return; 
                }

                try {
                    if (displaySize.width === 0 || displaySize.height === 0) {
                        updateDisplaySize();
                        return;
                    }

                    console.log('Current displaySize:', displaySize);

                    const detections = await faceapi.detectAllFaces(
                        video, 
                        new faceapi.TinyFaceDetectorOptions({
                            inputSize: 416,
                            scoreThreshold: 0.3
                        })
                    ).withFaceLandmarks().withFaceExpressions().withFaceDescriptors();

                    // Resize detections to match display size
                    const resizedDetections = faceapi.resizeResults(detections, displaySize);
                    
                    // Clear canvas
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // Update scan elements when face is detected
                    const scanCircle = document.querySelector('.scan-circle');
                    const scanRing = document.querySelector('.scan-ring');
                    const scanRing2 = document.querySelector('.scan-ring-2');
                    const scanRing3 = document.querySelector('.scan-ring-3');
                    const scanDots = document.querySelector('.scan-dots');
                    const scanLine = document.querySelector('.scan-line');
                    
                    if (resizedDetections.length > 0) {
                        const box = resizedDetections[0].detection.box;
                        const size = Math.max(box.width, box.height) * 1.2; // Make circle slightly larger than face
                        const centerX = box.x + box.width / 2;
                        const centerY = box.y + box.height / 2;
                        
                        // Update scan circle
                        scanCircle.style.display = 'block';
                        scanCircle.style.width = size + 'px';
                        scanCircle.style.height = size + 'px';
                        scanCircle.style.left = (centerX - size/2) + 'px';
                        scanCircle.style.top = (centerY - size/2) + 'px';
                        
                        // Update scan rings
                        [scanRing, scanRing2, scanRing3].forEach((ring, index) => {
                            ring.style.display = 'block';
                            ring.style.width = (size * (1 + index * 0.1)) + 'px';
                            ring.style.height = (size * (1 + index * 0.1)) + 'px';
                            ring.style.left = (centerX - (size * (1 + index * 0.1))/2) + 'px';
                            ring.style.top = (centerY - (size * (1 + index * 0.1))/2) + 'px';
                        });
                        
                        // Update scan line
                        scanLine.style.display = 'block';
                        scanLine.style.left = centerX + 'px';
                        scanLine.style.top = centerY + 'px';
                        
                        // Update scan dots
                        scanDots.style.display = 'block';
                        scanDots.style.width = size + 'px';
                        scanDots.style.height = size + 'px';
                        scanDots.style.left = (centerX - size/2) + 'px';
                        scanDots.style.top = (centerY - size/2) + 'px';
                        
                        // Create dots around the circle
                        scanDots.innerHTML = '';
                        const numDots = 12;
                        for (let i = 0; i < numDots; i++) {
                            const dot = document.createElement('div');
                            dot.className = 'scan-dot';
                            const angle = (i * 360 / numDots) * Math.PI / 180;
                            const x = size/2 + Math.cos(angle) * (size/2 - 10);
                            const y = size/2 + Math.sin(angle) * (size/2 - 10);
                            dot.style.left = x + 'px';
                            dot.style.top = y + 'px';
                            dot.style.animationDelay = (i * 0.1) + 's';
                            scanDots.appendChild(dot);
                        }

                        // Log detection info for debugging
                        console.log('Face detected:', {
                            box: {
                                x: box.x,
                                y: box.y,
                                width: box.width,
                                height: box.height,
                                score: resizedDetections[0].detection.score
                            },
                            hasDescriptor: !!resizedDetections[0].descriptor,
                            descriptorLength: resizedDetections[0].descriptor?.length,
                            landmarks: resizedDetections[0].landmarks?.positions?.length,
                            expressions: resizedDetections[0].expressions
                        });

                        console.log('Number of detections:', resizedDetections.length);
                    } else {
                        scanCircle.style.display = 'none';
                        scanRing.style.display = 'none';
                        scanRing2.style.display = 'none';
                        scanRing3.style.display = 'none';
                        scanDots.style.display = 'none';
                        scanLine.style.display = 'none';
                    }
                } catch (err) {
                    logError('Face detection error: ' + err.message);
                }
            }, 100);
        }, 500); // 500ms delay

        console.log('Camera access granted');
    } catch (err) {
        const errorMessage = 'Camera Error: ' + err.message + '\n' + 
                           'Name: ' + err.name + '\n' +
                           'Stack: ' + err.stack;
        logError(errorMessage);
    }
}

// Wait for the page to be fully loaded
if (document.readyState === 'complete') {
    startCamera();
} else {
    window.addEventListener('load', startCamera);
} 