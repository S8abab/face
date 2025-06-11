const video = document.getElementById("video");
const errorDiv = document.getElementById("error");
const canvas = document.getElementById("overlay");
let displaySize = { width: 0, height: 0 };

// Add loading screen element
const loadingScreen = document.createElement('div');
loadingScreen.id = 'loading-screen';
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
  } else {
    errorDiv.style.display = "none";
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

    // Load only essential models for face detection
    const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ]);
    
    // Hide loading screen after models are loaded
    loadingScreen.style.display = 'none';
    return faceapi;
  } catch (err) {
    logError("Error loading models: " + err.message);
    throw err;
  }
}

// Add CSS for loading screen
const style = document.createElement('style');
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
        frameRate: { ideal: 30 }
      },
    });

    console.log("Camera access granted, setting up video...");
    video.srcObject = stream;
    video.play(); // Explicitly start video playback

    // Log video readiness state
    console.log("Video readyState:", video.readyState);
    console.log("Video dimensions:", video.videoWidth, video.videoHeight);

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
        // Check if video is ready before processing
        if (video.readyState < 4) {
          return;
        }

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
            .withFaceLandmarks();

          // Resize detections to match display size
          const resizedDetections = faceapi.resizeResults(
            detections,
            displaySize
          );

          // Clear canvas
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Draw circle when face is detected
          if (resizedDetections.length > 0) {
            const box = resizedDetections[0].detection.box;
            const size = Math.max(box.width, box.height) * 1.2;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            // Draw circle
            ctx.beginPath();
            ctx.arc(centerX, centerY, size / 2, 0, 2 * Math.PI);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        } catch (err) {
          logError("Face detection error: " + err.message);
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
