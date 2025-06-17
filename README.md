# Face Verification System for React Native WebView

This project provides a complete face verification system using face-api.js in a React Native WebView. It supports both face registration and verification with similarity scoring.

## Features

- **Face Registration**: Capture and store face descriptors
- **Face Verification**: Compare current face with stored descriptor
- **Similarity Scoring**: Calculate similarity percentage between faces
- **Visual Feedback**: Real-time UI updates during verification
- **Error Handling**: Comprehensive error handling and user feedback

## Setup

### 1. Install Dependencies

```bash
npm install react-native-webview
```

### 2. Add HTML Files to Assets

Copy the following files to your React Native project's assets folder:

- `index.html` - Main HTML file with face detection UI
- `script.js` - JavaScript logic for face detection and verification
- `styles.css` - CSS styling for the interface

### 3. Update WebView Source Path

In the React Native component, update the WebView source path according to your platform:

**Android:**
```javascript
source={{ uri: 'file:///android_asset/index.html' }}
```

**iOS:**
```javascript
source={{ uri: 'file:///ios_asset/index.html' }}
```

## Usage

### Basic Implementation

```javascript
import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';

const FaceVerificationScreen = () => {
  const [storedFaceDescriptor, setStoredFaceDescriptor] = useState(null);
  const webViewRef = useRef(null);

  const handleWebViewMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    
    switch (data.type) {
      case 'register_face':
        setStoredFaceDescriptor(data.data.descriptor);
        break;
      case 'verification_success':
        console.log('Verification successful:', data.data.similarity);
        break;
      case 'verification_failed':
        console.log('Verification failed:', data.data.similarity);
        break;
    }
  };

  const startVerification = () => {
    webViewRef.current?.postMessage(JSON.stringify({
      type: 'start_verification',
      descriptor: storedFaceDescriptor
    }));
  };

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity onPress={startVerification}>
        <Text>Verify Face</Text>
      </TouchableOpacity>
      
      <WebView
        ref={webViewRef}
        source={{ uri: 'file:///android_asset/index.html' }}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
      />
    </View>
  );
};
```

## API Reference

### WebView to React Native Messages

#### Registration
```javascript
{
  type: 'register_face',
  data: {
    descriptor: [0.1, 0.2, ...], // 128-dimensional face descriptor
    timestamp: 1234567890
  }
}
```

#### Verification Success
```javascript
{
  type: 'verification_success',
  data: {
    similarity: 0.85, // Similarity score (0-1)
    threshold: 0.6,   // Threshold used for comparison
    timestamp: 1234567890,
    descriptor: [0.1, 0.2, ...]
  }
}
```

#### Verification Failed
```javascript
{
  type: 'verification_failed',
  data: {
    similarity: 0.45, // Similarity score (0-1)
    threshold: 0.6,   // Threshold used for comparison
    timestamp: 1234567890,
    descriptor: [0.1, 0.2, ...]
  }
}
```

#### Error
```javascript
{
  type: 'error',
  message: 'Error description'
}
```

### React Native to WebView Messages

#### Start Verification
```javascript
{
  type: 'start_verification',
  descriptor: [0.1, 0.2, ...] // Stored face descriptor
}
```

#### Start Registration
```javascript
{
  type: 'start_registration'
}
```

#### Clear Stored Face
```javascript
{
  type: 'clear_stored_face'
}
```

## Configuration

### Similarity Threshold

The default similarity threshold is set to 0.6 (60%). You can adjust this in `script.js`:

```javascript
const SIMILARITY_THRESHOLD = 0.6; // Adjust this value
```

- **Higher threshold (0.7-0.8)**: More strict matching, fewer false positives
- **Lower threshold (0.5-0.6)**: More lenient matching, more false positives

### Face Detection Settings

Adjust face detection parameters in `script.js`:

```javascript
const FACE_MOVEMENT_THRESHOLD = 30; // pixels
const MIN_FACE_SIZE = 100; // minimum face size in pixels
const MAX_FACES_ALLOWED = 1;
const MIN_CONFIDENCE_SCORE = 0.7;
```

## Security Considerations

1. **Face Descriptors**: Face descriptors are mathematical representations and cannot be used to reconstruct the original face image
2. **Local Processing**: All face detection and comparison happens locally in the WebView
3. **No Network Calls**: The system doesn't send face data over the network
4. **Temporary Storage**: Face descriptors are stored only in memory during the session

## Troubleshooting

### Common Issues

1. **Camera Permission Denied**
   - Ensure camera permissions are properly configured in your React Native app
   - Check platform-specific permission settings

2. **WebView Not Loading**
   - Verify the HTML file path is correct for your platform
   - Check that all assets are properly bundled

3. **Face Detection Not Working**
   - Ensure face-api.js models are loading correctly
   - Check browser console for any JavaScript errors

4. **Low Similarity Scores**
   - Ensure good lighting conditions
   - Position face properly in the center circle
   - Try adjusting the similarity threshold

### Debug Mode

Enable debug logging by checking the browser console in your WebView. The system logs detailed information about:

- Model loading progress
- Face detection results
- Similarity calculations
- Error messages

## Performance Tips

1. **Model Loading**: Models are loaded once and cached for the session
2. **Detection Frequency**: Face detection runs every 200ms for smooth performance
3. **Memory Management**: Face descriptors are lightweight (128 float values)
4. **GPU Acceleration**: Enable hardware acceleration in WebView for better performance

## License

This project is open source and available under the MIT License.
