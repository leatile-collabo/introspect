# Camera Preview & Confirmation Workflow Features

## Overview

This document describes the new camera preview and technician confirmation features added to the Introspect malaria diagnostics system.

## Features Implemented

### 1. Camera Preview with Positioning

**Purpose**: Allow technicians to position the blood slide correctly before capturing the image.

**How it works**:
- When "Capture from Camera" mode is selected, a live preview stream is displayed
- The preview updates every 500ms showing the current camera view
- Technicians can position the blood slide in the center of the frame
- A "Refresh Preview" button allows manual preview updates
- Works with both real Raspberry Pi Camera Module 3 and mock mode for development

**API Endpoints**:
- `POST /api/results/camera/start-preview` - Start camera preview mode
- `GET /api/results/camera/preview-frame` - Get a single preview frame (JPEG)
- `POST /api/results/camera/stop-preview` - Stop camera preview mode

### 2. Technician Confirmation Workflow

**Purpose**: Require technicians to review and confirm AI-generated results before finalizing.

**How it works**:
1. After AI analysis completes, results are displayed with confidence levels
2. Confidence levels are color-coded:
   - **High Confidence** (≥85%): Green
   - **Moderate Confidence** (65-84%): Amber
   - **Low Confidence** (<65%): Red
3. For positive results, a warning banner is displayed
4. Technicians must:
   - Review the AI result
   - Confirm or modify the diagnosis
   - Optionally add confirmation notes
5. Results are marked as "confirmed" in the database with:
   - Confirmed result (can differ from AI result)
   - Confirming technician ID
   - Confirmation timestamp
   - Optional confirmation notes

**API Endpoints**:
- `POST /api/results/{result_id}/confirm` - Confirm a test result

**Database Schema**:
New fields added to `test_results` table:
- `is_confirmed` (BOOLEAN) - Whether result has been confirmed
- `confirmed_by` (UUID) - ID of confirming technician
- `confirmed_at` (TIMESTAMP) - When result was confirmed
- `confirmation_notes` (TEXT) - Optional notes from technician

### 3. Enhanced AI Inference

**Improvements**:
- Support for ONNX model format (`.onnx` files)
- Dummy ONNX model support for development/testing
- More realistic placeholder inference with:
  - 30% chance of positive results
  - 55% chance of negative results
  - 15% chance of inconclusive results
  - Simulated parasite detections with bounding boxes
  - Realistic confidence scores

**Model Configuration**:
Set environment variables:
```bash
YOLO_MODEL_PATH=models/malaria_yolov11.onnx  # Path to ONNX model
YOLO_CONFIDENCE_THRESHOLD=0.25               # Detection confidence threshold
YOLO_IOU_THRESHOLD=0.45                      # IoU threshold for NMS
YOLO_IMAGE_SIZE=640                          # Input image size
```

## User Interface

### Camera Mode
1. Select "Capture from Camera" on the analyze page
2. Camera preview appears automatically
3. Position blood slide in the frame
4. Click "Refresh Preview" if needed
5. Fill in patient details and symptoms
6. Click "Analyze Image" to capture and analyze

### Upload Mode
1. Select "Upload Image" (default)
2. Drag and drop or browse for image file
3. Preview appears after selection
4. Fill in patient details and symptoms
5. Click "Analyze Image" to analyze

### Confirmation Workflow
1. After analysis, results are displayed with:
   - Result status (Positive/Negative/Inconclusive)
   - AI confidence percentage and level
   - Processing time
   - Test result ID
2. Review the AI result carefully
3. Select confirmed result from dropdown (pre-filled with AI result)
4. Optionally add confirmation notes
5. Click "Confirm Result"
6. Success message is displayed
7. Click "Analyze Another Sample" to continue

## Technical Details

### Camera Service (`src/infrastructure/camera_service.py`)
- Singleton pattern for resource management
- Preview resolution: 640x480 (lower than capture resolution)
- Capture resolution: 2304x1296 (Camera Module 3 default)
- Mock mode generates realistic preview frames for development
- Automatic fallback to mock mode if camera unavailable

### Results Service (`src/results/service.py`)
- New `confirm_test_result()` function
- Validates technician permissions
- Allows modifying AI result during confirmation
- Tracks confirmation metadata

### Frontend (`src/frontend/`)
- Real-time preview updates using polling
- Automatic preview cleanup on mode switch
- Confidence level visualization with color coding
- Special warning for positive results
- Form validation for confirmation

## Development & Testing

### Running with Mock Camera
The system automatically uses mock mode when:
- `picamera2` is not installed
- No camera hardware is detected
- Running on non-Raspberry Pi systems

Mock mode provides:
- Simulated preview frames with random "cells"
- Realistic capture simulation
- Full API compatibility

### Testing Confirmation Workflow
1. Start the development server: `./start_dev.sh`
2. Navigate to `/analyze`
3. Upload or capture an image
4. Review the AI result
5. Test confirming with same result
6. Test modifying the result during confirmation
7. Verify confirmation notes are saved

### Database Migration
Apply the confirmation fields migration:
```bash
python apply_confirmation_migration.py
```

Or use Alembic:
```bash
alembic upgrade head
```

## Production Deployment

### With Real Camera
1. Install dependencies:
   ```bash
   pip install picamera2
   ```
2. Ensure Raspberry Pi Camera Module 3 is connected
3. Enable camera in `raspi-config`
4. Restart the application

### With Real ONNX Model
1. Train YOLOv11 model for malaria detection
2. Export to ONNX format:
   ```python
   from ultralytics import YOLO
   model = YOLO('malaria_yolo8.pt')
   model.export(format='onnx')
   ```
3. Place model file in `models/` directory
4. Update `YOLO_MODEL_PATH` environment variable
5. Install ONNX Runtime:
   ```bash
   pip install onnxruntime
   ```

## Security Considerations

- Camera preview requires authentication (JWT token)
- Only authenticated health workers can confirm results
- Confirmation tracks which technician confirmed each result
- Original AI result is preserved even if modified
- All actions are logged for audit trail

## Future Enhancements

Potential improvements:
- Video stream preview instead of polling frames
- Autofocus controls in preview interface
- Zoom and pan controls
- Multiple image capture for comparison
- Batch confirmation for multiple results
- Confirmation approval workflow (second technician review)
- Export confirmed results to PDF reports

