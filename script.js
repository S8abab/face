const video = document.getElementById("video");
const errorDiv = document.getElementById("error");
const canvas = document.getElementById("overlay");
let displaySize = { width: 0, height: 0 };
let isRegistrationMode = false;
let isVerificationMode = false;
let storedFaceDescriptor = null;
let registrationTimer = null;
let registrationStartTime = null;
let lastFacePosition = null;
let faceMovementCount = 0;
let faceQualityScores = [];

// Constants for security checks
const FACE_MOVEMENT_THRESHOLD = 30; // pixels
const MIN_FACE_QUALITY_SCORE = 0.6;
const MIN_FACE_SIZE = 100; // minimum face size in pixels
const MAX_FACES_ALLOWED = 1;
const MIN_CONFIDENCE_SCORE = 0.7;

// Add loading screen element
const loadingScreen = document.createElement("div");
loadingScreen.id = "loading-screen";
loadingScreen.innerHTML = `
  <div class="loading-content">
    <div class="loading-spinner"></div>
    <div class="loading-text">Please wait...</div>
  </div>
`;
document.body.appendChild(loadingScreen);

function logError(message) {
  console.error(message);
  if (message && message.trim() !== "") {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
    // Send error to React Native
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "error",
          message: message
        })
      );
    }
  } else {
    errorDiv.style.display = "none";
  }
}

// Add logging functions for different event types
function sendToReactNative(type, message, data = null) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: type,
        message: message,
        data: data
      })
    );
  }
}

function updateDisplaySize() {
  const container = document.querySelector(".container");
  displaySize = {
    width: container.clientWidth,
    height: container.clientHeight,
  };
  canvas.width = displaySize.width;
  canvas.height = displaySize.height;
  console.log("updateDisplaySize:", displaySize);
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
    setTimeout(
      () => reject(new Error("Timeout waiting for face-api.js")),
      10000
    );
  });
}

async function loadModels() {
  try {
    const faceapi = await waitForFaceAPI();

    // Load models including face recognition
    const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    // Hide loading screen after models are loaded
    loadingScreen.style.display = "none";
    return faceapi;
  } catch (err) {
    logError("Error loading models: " + err.message);
    throw err;
  }
}

// Add CSS for loading screen
const style = document.createElement("style");
style.textContent = `
  #loading-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  }
  .loading-content {
    text-align: center;
    color: white;
  }
  .loading-spinner {
    width: 50px;
    height: 50px;
    border: 5px solid #f3f3f3;
    border-top: 5px solid #3498db;
    border-radius: 50%;
    margin: 0 auto 20px;
    animation: spin 1s linear infinite;
  }
  .loading-text {
    font-size: 18px;
    font-family: Arial, sans-serif;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

async function startCamera() {
  try {
    console.log("Checking mediaDevices support...");
    sendToReactNative("info", "Checking mediaDevices support...");
    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }

    if (!navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia = function (constraints) {
        const getUserMedia =
          navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

        if (!getUserMedia) {
          return Promise.reject(
            new Error("getUserMedia is not implemented in this browser")
          );
        }

        return new Promise(function (resolve, reject) {
          getUserMedia.call(navigator, constraints, resolve, reject);
        });
      };
    }

    console.log("Requesting camera permissions...");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    });

    console.log("Camera access granted, setting up video...");
    sendToReactNative("success", "Camera access granted");
    video.srcObject = stream;
    video.play(); // Explicitly start video playback

    // Log video readiness state
    console.log("Video readyState:", video.readyState);
    sendToReactNative("info", `Video readyState: ${video.readyState}`);
    console.log("Video dimensions:", video.videoWidth, video.videoHeight);
    sendToReactNative("info", `Video dimensions: ${video.videoWidth}x${video.videoHeight}`);

    // Load models after camera access is granted
    const faceapi = await loadModels();
    console.log("loadModels completed.");

    console.log("About to set up detection interval with delay...");

    // Start face detection after a short delay, independent of video events
    setTimeout(() => {
      // Initial update of display size
      updateDisplaySize();

      // Update display size on window resize
      window.addEventListener("resize", updateDisplaySize);

      setInterval(async () => {
        if (video.readyState < 4) return;

        try {
          if (displaySize.width === 0 || displaySize.height === 0) {
            updateDisplaySize();
            return;
          }

          const detections = await faceapi
            .detectAllFaces(
              video,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 416,
                scoreThreshold: 0.3,
              })
            )
            .withFaceLandmarks()
            .withFaceDescriptors();

          const resizedDetections = faceapi.resizeResults(detections, displaySize);
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Check for multiple faces
          if (resizedDetections.length > MAX_FACES_ALLOWED) {
            sendToReactNative("error", "Multiple faces detected. Please ensure only one face is visible.");
            return;
          }

          if (resizedDetections.length > 0) {
            const detection = resizedDetections[0];
            const box = detection.detection.box;
            const size = Math.max(box.width, box.height) * 1.2;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            // Check face quality
            const qualityCheck = checkFaceQuality(detection);
            if (!qualityCheck.isGood) {
              sendToReactNative("error", qualityCheck.reason);
              return;
            }

            if (isRegistrationMode && registrationStartTime) {
              const elapsedTime = Date.now() - registrationStartTime;
              const progress = Math.min(elapsedTime / 3000, 1);

              // Check liveness during registration
              if (!checkLiveness(detection)) {
                sendToReactNative("info", "Please move your face slightly to verify liveness");
                return;
              }

              // Store quality scores
              faceQualityScores.push(qualityCheck.score);
              
              drawScanningAnimation(ctx, centerX, centerY, size, progress);
            } else {
              ctx.beginPath();
              ctx.arc(centerX, centerY, size / 2, 0, 2 * Math.PI);
              ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
              ctx.lineWidth = 2;
              ctx.stroke();
            }

            const faceDescriptor = detection.descriptor;

            if (isRegistrationMode) {
              // Only register if we have enough good quality samples
              if (faceQualityScores.length >= 5) {
                const avgQuality = faceQualityScores.reduce((a, b) => a + b) / faceQualityScores.length;
                if (avgQuality >= MIN_FACE_QUALITY_SCORE) {
                  registerFace(faceDescriptor);
                } else {
                  sendToReactNative("error", "Face quality too low. Please try again in better lighting.");
                  registrationStartTime = null;
                  faceQualityScores = [];
                }
              }
            } else if (isVerificationMode) {
              verifyFace(faceDescriptor);
            } else {
              sendToReactNative("detection", "Face detected", {
                descriptor: Array.from(faceDescriptor),
                timestamp: Date.now(),
                box: {
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height
                }
              });
            }
          } else if (isRegistrationMode && registrationStartTime) {
            registrationStartTime = null;
            faceQualityScores = [];
            faceMovementCount = 0;
            lastFacePosition = null;
            sendToReactNative("error", "Face lost during registration. Please try again.");
          }
        } catch (err) {
          logError("Face detection error: " + err.message);
          sendToReactNative("error", "Face detection error: " + err.message);
        }
      }, 200);
    }, 500);

    console.log("Camera access granted");
  } catch (err) {
    const errorMessage =
      "Camera Error: " +
      err.message +
      "\n" +
      "Name: " +
      err.name +
      "\n" +
      "Stack: " +
      err.stack;
    logError(errorMessage);
  }
}

// Wait for the page to be fully loaded
if (document.readyState === "complete") {
  startCamera();
} else {
  window.addEventListener("load", startCamera);
}

function drawScanningAnimation(ctx, centerX, centerY, size, progress) {
  // Clear previous drawings
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw outer ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw scanning rings
  const numRings = 3;
  for (let i = 0; i < numRings; i++) {
    const ringProgress = (progress + i / numRings) % 1;
    const ringSize = size * (0.8 + ringProgress * 0.4);
    const opacity = 1 - ringProgress;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringSize / 2, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(0, 255, 255, ${opacity * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw progress arc
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (2 * Math.PI * progress);
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw scanning dots
  const numDots = 8;
  for (let i = 0; i < numDots; i++) {
    const angle = (i / numDots) * 2 * Math.PI;
    const dotX = centerX + Math.cos(angle) * (size / 2);
    const dotY = centerY + Math.sin(angle) * (size / 2);
    
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
    ctx.fill();
  }

  // Draw center dot
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(0, 255, 255, 1)';
  ctx.fill();
}

// Add function to handle face registration
function registerFace(faceDescriptor) {
  if (!registrationStartTime) {
    registrationStartTime = Date.now();
    sendToReactNative("info", "Starting face registration... Hold still for 3 seconds");
    return;
  }

  const elapsedTime = Date.now() - registrationStartTime;
  if (elapsedTime < 3000) {
    // Still counting down
    const remainingTime = Math.ceil((3000 - elapsedTime) / 1000);
    sendToReactNative("info", `Hold still... ${remainingTime} seconds remaining`);
    return;
  }

  // Registration complete
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "register_face",
        data: {
          descriptor: Array.from(faceDescriptor),
          timestamp: Date.now()
        }
      })
    );
  }
  registrationStartTime = null;
  sendToReactNative("success", "Face registration completed!");
}

// Add function to handle face verification
function verifyFace(faceDescriptor) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "verify_face",
        data: {
          descriptor: Array.from(faceDescriptor),
          timestamp: Date.now()
        }
      })
    );
  }
}

// Add function to set operation mode
function setOperationMode(mode) {
  isRegistrationMode = mode === 'register';
  isVerificationMode = mode === 'verify';
  registrationStartTime = null;
  faceQualityScores = [];
  faceMovementCount = 0;
  lastFacePosition = null;
  sendToReactNative("info", `Mode set to: ${mode}`);
}

// Add function to receive stored face descriptor from React Native
function receiveStoredFaceDescriptor(descriptor) {
  storedFaceDescriptor = new Float32Array(descriptor);
}

// Expose functions to React Native
window.faceDetection = {
  setOperationMode,
  receiveStoredFaceDescriptor
};

function checkFaceQuality(detection) {
  const score = detection.detection.score;
  const box = detection.detection.box;
  
  // Check face size
  if (box.width < MIN_FACE_SIZE || box.height < MIN_FACE_SIZE) {
    return {
      isGood: false,
      reason: "Face too small. Please move closer to the camera."
    };
  }

  // Check detection confidence
  if (score < MIN_CONFIDENCE_SCORE) {
    return {
      isGood: false,
      reason: "Low confidence in face detection. Please ensure good lighting."
    };
  }

  // Check face landmarks for proper alignment
  const landmarks = detection.landmarks.positions;
  const leftEye = landmarks[36];
  const rightEye = landmarks[45];
  const nose = landmarks[30];
  
  // Check if eyes are roughly horizontal
  const eyeAngle = Math.abs(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x));
  if (eyeAngle > 0.2) { // about 11 degrees
    return {
      isGood: false,
      reason: "Please look straight at the camera."
    };
  }

  return {
    isGood: true,
    score: score
  };
}

function checkLiveness(detection) {
  const currentPosition = {
    x: detection.detection.box.x,
    y: detection.detection.box.y
  };

  if (lastFacePosition) {
    const movement = Math.sqrt(
      Math.pow(currentPosition.x - lastFacePosition.x, 2) +
      Math.pow(currentPosition.y - lastFacePosition.y, 2)
    );

    if (movement > FACE_MOVEMENT_THRESHOLD) {
      faceMovementCount++;
    }
  }

  lastFacePosition = currentPosition;
  return faceMovementCount >= 2; // Require at least 2 movements for liveness
}
