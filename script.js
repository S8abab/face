const video = document.getElementById("video");
const errorDiv = document.getElementById("error");
const canvas = document.getElementById("overlay");
let displaySize = { width: 0, height: 0 };

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
    return faceapi;
  } catch (err) {
    logError("Error loading models: " + err.message);
    throw err;
  }
}

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
        width: { ideal: 1280 },
        height: { ideal: 720 },
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
                inputSize: 224, // Must be divisible by 32
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

          // Update scan elements when face is detected
          const scanCircle = document.querySelector(".scan-circle");
          const scanRing = document.querySelector(".scan-ring");
          const scanRing2 = document.querySelector(".scan-ring-2");
          const scanRing3 = document.querySelector(".scan-ring-3");
          const scanDots = document.querySelector(".scan-dots");
          const scanLine = document.querySelector(".scan-line");

          if (resizedDetections.length > 0) {
            const box = resizedDetections[0].detection.box;
            const size = Math.max(box.width, box.height) * 1.2;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            // Only show the main circle
            scanCircle.style.display = "block";
            scanCircle.style.width = size + "px";
            scanCircle.style.height = size + "px";
            scanCircle.style.left = centerX - size / 2 + "px";
            scanCircle.style.top = centerY - size / 2 + "px";

            // Hide all other elements
            scanRing.style.display = "none";
            scanRing2.style.display = "none";
            scanRing3.style.display = "none";
            scanDots.style.display = "none";
            scanLine.style.display = "none";
          } else {
            // Hide all elements when no face is detected
            scanCircle.style.display = "none";
            scanRing.style.display = "none";
            scanRing2.style.display = "none";
            scanRing3.style.display = "none";
            scanDots.style.display = "none";
            scanLine.style.display = "none";
          }
        } catch (err) {
          logError("Face detection error: " + err.message);
        }
      }, 200); // Increased interval from 100ms to 200ms
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
