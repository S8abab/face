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
let registrationCompleted = false;

// Constants for security checks
const FACE_MOVEMENT_THRESHOLD = 30; // pixels
const MIN_FACE_SIZE = 100; // minimum face size in pixels
const MAX_FACES_ALLOWED = 1;
const MIN_CONFIDENCE_SCORE = 0.7;

// Registration descriptor buffer for averaging
let registrationDescriptors = [];
const REGISTRATION_FRAMES = 5;

// Add loading screen element
const loadingScreen = document.createElement("div");
loadingScreen.id = "loading-screen";
loadingScreen.innerHTML = `
  <div class="loading-content">
    <div class="loading-spinner"></div>
    <div class="loading-text">Initializing...</div>
    <div class="loading-status"></div>
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
          message: message,
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
        data: data,
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

function updateLoadingStatus(message) {
  const statusElement = document.querySelector(".loading-status");
  if (statusElement) {
    statusElement.textContent = message;
  }
  console.log("Loading status:", message);
  sendToReactNative("info", message);
}

async function loadModels() {
  try {
    updateLoadingStatus("Waiting for face-api.js...");
    const faceapi = await waitForFaceAPI();

    updateLoadingStatus("Loading...");
    const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    updateLoadingStatus("Models loaded successfully!");
    loadingScreen.style.display = "none";
    return faceapi;
  } catch (err) {
    updateLoadingStatus("Error loading models: " + err.message);
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
    updateLoadingStatus("Checking camera access...");

    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }

    if (!navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia = function (constraints) {
        const getUserMedia =
          navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!getUserMedia) {
          throw new Error("getUserMedia is not implemented in this browser");
        }
        return new Promise(function (resolve, reject) {
          getUserMedia.call(navigator, constraints, resolve, reject);
        });
      };
    }

    updateLoadingStatus("Requesting camera permissions...");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15 },
      },
    });

    updateLoadingStatus("Camera access granted, setting up video...");
    video.srcObject = stream;

    video.onloadedmetadata = () => {
      updateLoadingStatus("Video metadata loaded");
    };

    video.onerror = (error) => {
      updateLoadingStatus("Video error: " + error.message);
      logError("Video error: " + error.message);
    };

    await video.play();
    updateLoadingStatus("Video playback started");

    const faceapi = await loadModels();

    updateDisplaySize();
    window.addEventListener("resize", updateDisplaySize, { passive: true });

    // Set initial mode to default (show only the register button)
    setOperationMode("default");

    // Initialize UI in default mode
    updateUIForMode("default");

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
              inputSize: 160,
              scoreThreshold: 0.4,
            })
          )
          .withFaceLandmarks()
          .withFaceDescriptors();

        const resizedDetections = faceapi.resizeResults(
          detections,
          displaySize
        );
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (resizedDetections.length > MAX_FACES_ALLOWED) {
          updateInstruction(
            "Multiple faces detected. Please ensure only one face is visible."
          );
          return;
        }

        if (resizedDetections.length > 0) {
          const detection = resizedDetections[0];
          const box = detection.detection.box;
          const size = Math.max(box.width, box.height) * 1.2;
          const centerX = box.x + box.width / 2;
          const centerY = box.y + box.height / 2;

          // Check if face is centered
          const centerFrame = document.getElementById("center-frame");
          const frameRect = centerFrame.getBoundingClientRect();
          const isCentered =
            Math.abs(centerX - frameRect.left - frameRect.width / 2) < 50 &&
            Math.abs(centerY - frameRect.top - frameRect.height / 2) < 50;

          if (isRegistrationMode) {
            if (!isCentered) {
              updateInstruction("Move your face to the center circle");
              registrationStartTime = null;
              updateCountdown("");
            } else if (!registrationStartTime) {
              registrationStartTime = Date.now();
              updateInstruction("Keep your face still");
              updateCountdown(3);
            }
          }

          if (isRegistrationMode && registrationStartTime) {
            const currentTime = Date.now();
            const elapsedTime = currentTime - registrationStartTime;
            const progress = Math.min(elapsedTime / 3000, 1);

            drawScanningAnimation(ctx, centerX, centerY, size, progress);

            if (elapsedTime >= 3000) {
              registerFace(detection.descriptor);
            }
          } else {
            ctx.beginPath();
            ctx.arc(centerX, centerY, size / 2, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          const faceDescriptor = detection.descriptor;

          if (isVerificationMode) {
            verifyFace(faceDescriptor);
          } else if (!isRegistrationMode) {
            sendToReactNative("detection", "Face detected", {
              descriptor: Array.from(faceDescriptor),
              timestamp: Date.now(),
              box: {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              },
            });
          }
        } else if (isRegistrationMode) {
          updateInstruction(
            "No face detected. Please position your face in the center circle"
          );
          registrationStartTime = null;
          updateCountdown("");
        }
      } catch (err) {
        logError("Face detection error: " + err.message);
        sendToReactNative("error", "Face detection error: " + err.message);
      }
    }, 500);
  } catch (err) {
    const errorMessage = "Camera Error: " + err.message;
    updateLoadingStatus(errorMessage);
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
  ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
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
  const endAngle = startAngle + 2 * Math.PI * progress;

  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, startAngle, endAngle);
  ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
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
    ctx.fillStyle = "rgba(0, 255, 255, 0.8)";
    ctx.fill();
  }

  // Draw center dot
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0, 255, 255, 1)";
  ctx.fill();
}

// Modify registerFace function to average multiple descriptors
function registerFace(faceDescriptor) {
  if (!registrationStartTime) {
    registrationStartTime = Date.now();
    updateInstruction("Keep your face still");
    updateCountdown(3);
    registrationDescriptors = [];
    return;
  }

  const currentTime = Date.now();
  const elapsedTime = currentTime - registrationStartTime;
  const progress = Math.min(elapsedTime / 3000, 1);

  // Update progress bar
  const progressBar = document.querySelector("#registration-progress");
  if (progressBar) {
    progressBar.style.setProperty("--progress", `${progress * 100}%`);
  }

  if (elapsedTime < 3000) {
    // Still counting down
    const remainingTime = Math.ceil((3000 - elapsedTime) / 1000);
    updateCountdown(remainingTime);
    // Collect descriptors for averaging
    registrationDescriptors.push(faceDescriptor);
    if (registrationDescriptors.length > REGISTRATION_FRAMES) {
      registrationDescriptors.shift(); // Keep only the latest N
    }
    return;
  }

  // Only send descriptor if registration hasn't been completed yet
  if (!registrationCompleted) {
    registrationCompleted = true;

    // Average the collected descriptors
    let averagedDescriptor = null;
    if (registrationDescriptors.length > 0) {
      const length = registrationDescriptors[0].length;
      averagedDescriptor = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        let sum = 0;
        for (let d = 0; d < registrationDescriptors.length; d++) {
          sum += registrationDescriptors[d][i];
        }
        averagedDescriptor[i] = sum / registrationDescriptors.length;
      }
    } else {
      averagedDescriptor = faceDescriptor;
    }

    // Send the averaged descriptor to React Native
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "register_face",
          data: {
            descriptor: Array.from(averagedDescriptor),
            timestamp: Date.now(),
          },
        })
      );
    }

    // Hide instructions and reset
    registrationStartTime = null;
    registrationDescriptors = [];
    setOperationMode("verify");
    updateCountdown("");
    console.log("Face registration completed and averaged descriptor sent");
    sendToReactNative("success", "Face registration completed!");
  }
}

function updateInstruction(message) {
  const instructionElement = document.getElementById("current-instruction");
  if (instructionElement) {
    instructionElement.textContent = message;
  }
}

function updateCountdown(seconds) {
  const countdownElement = document.getElementById("countdown");
  if (countdownElement) {
    countdownElement.textContent = seconds > 0 ? `${seconds}s` : "";
  }
}

// Update verifyFace to use a lower threshold and add debug logging
function verifyFace(faceDescriptor) {
  if (!storedFaceDescriptor) {
    return;
  }

  try {
    // Calculate distance between current face and stored face
    const distance = calculateDistance(faceDescriptor, storedFaceDescriptor);

    // Lower threshold for stricter verification
    const DISTANCE_THRESHOLD = 0.5;

    // Debug logging
    console.log(
      "[Verification] Distance:",
      distance,
      "Threshold:",
      DISTANCE_THRESHOLD
    );
    sendToReactNative(
      "debug",
      `Verification distance: ${distance}, threshold: ${DISTANCE_THRESHOLD}`
    );

    if (distance < DISTANCE_THRESHOLD) {
      // Face verification successful
      updateInstruction(
        `Verification successful! (distance: ${distance.toFixed(3)})`
      );
      showVerificationResult(true, 1 - distance); // or just pass distance
      sendToReactNative(
        "verification_success",
        "Face verification successful",
        {
          distance: distance,
          threshold: DISTANCE_THRESHOLD,
          timestamp: Date.now(),
          descriptor: Array.from(faceDescriptor),
        }
      );
    } else {
      // Face verification failed
      updateInstruction(
        `Verification failed! (distance: ${distance.toFixed(3)})`
      );
      showVerificationResult(false, 1 - distance);
      sendToReactNative("verification_failed", "Face verification failed", {
        distance: distance,
        threshold: DISTANCE_THRESHOLD,
        timestamp: Date.now(),
        descriptor: Array.from(faceDescriptor),
      });
    }
  } catch (error) {
    updateInstruction("Verification error occurred");
    sendToReactNative("error", "Face verification error: " + error.message);
  }
}

// Add function to show verification result with visual feedback
function showVerificationResult(success, similarity) {
  const centerFrame = document.getElementById("center-frame");

  if (success) {
    centerFrame.style.borderColor = "#00ff00";
    centerFrame.style.backgroundColor = "rgba(0, 255, 0, 0.1)";
  } else {
    centerFrame.style.borderColor = "#ff0000";
    centerFrame.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
  }

  // Reset after 3 seconds
  setTimeout(() => {
    centerFrame.style.borderColor = "";
    centerFrame.style.backgroundColor = "";
    updateInstruction("Position your face for verification");
  }, 3000);
}

// Add function to calculate distance between two face descriptors
function calculateDistance(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2) {
    throw new Error("Invalid descriptors provided");
  }
  if (descriptor1.length !== descriptor2.length) {
    throw new Error("Descriptor lengths do not match");
  }
  let sumSquaredDiff = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sumSquaredDiff += diff * diff;
  }
  return Math.sqrt(sumSquaredDiff);
}

// Add function to set operation mode
function setOperationMode(mode) {
  isRegistrationMode = mode === "register";
  isVerificationMode = mode === "verify";
  registrationStartTime = null;

  // Update UI based on mode
  updateUIForMode(mode);

  sendToReactNative("info", `Mode set to: ${mode}`);
}

// Add function to update UI based on current mode
function updateUIForMode(mode) {
  const instructions = document.getElementById("instructions");
  const centerFrame = document.getElementById("center-frame");

  if (mode === "register") {
    // Show registration UI
    instructions.classList.remove("hidden");
    centerFrame.classList.add("active");
    updateInstruction("Position your face in the center circle");
  } else if (mode === "verify") {
    // Verification mode - hide registration UI and register button
    instructions.classList.add("hidden");
    centerFrame.classList.remove("active");
    updateInstruction("");
    updateCountdown("");
  } else {
    // Default mode - show only the register button
    instructions.classList.add("hidden");
    centerFrame.classList.remove("active");
    updateInstruction("");
    updateCountdown("");
  }
}

// Add function to receive stored face descriptor from React Native
function receiveStoredFaceDescriptor(descriptor) {
  try {
    if (!descriptor || !Array.isArray(descriptor)) {
      throw new Error("Invalid descriptor format");
    }

    storedFaceDescriptor = new Float32Array(descriptor);
    sendToReactNative("info", "Stored face descriptor received successfully");
    console.log(
      "Stored face descriptor received:",
      descriptor.length,
      "values"
    );
  } catch (error) {
    sendToReactNative(
      "error",
      "Error receiving stored descriptor: " + error.message
    );
  }
}

// Add function to clear stored face descriptor
function clearStoredFaceDescriptor() {
  storedFaceDescriptor = null;
  sendToReactNative("info", "Stored face descriptor cleared");
}

// Add function to get verification status
function getVerificationStatus() {
  return {
    hasStoredDescriptor: storedFaceDescriptor !== null,
    descriptorLength: storedFaceDescriptor ? storedFaceDescriptor.length : 0,
    isVerificationMode: isVerificationMode,
  };
}

// Expose functions to React Native
window.faceDetection = {
  setOperationMode,
  receiveStoredFaceDescriptor,
  clearStoredFaceDescriptor,
  getVerificationStatus,
  calculateDistance,
};
