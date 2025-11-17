"""
AI Inference Service for Malaria Detection using YOLOv11
Supports both placeholder mode (for testing) and real YOLOv11 inference.
"""

import time
import random
from typing import Tuple, Optional, List, Dict
from PIL import Image
import numpy as np
import logging
from enum import Enum
from pathlib import Path
import os

class InferenceResult(Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    INCONCLUSIVE = "inconclusive"

class MalariaInferenceService:
    """
    Malaria detection service using YOLOv11 for object detection.
    Falls back to placeholder mode if model is not available.
    """

    def __init__(self, model_path: str = None):
        # Try YOLO8 ONNX first, then fallback to YOLO11
        default_model = "models/malaria_yolo8.onnx"
        if not Path(default_model).exists():
            default_model = "models/malaria_yolov11.onnx"
        
        self.model_path = model_path or os.getenv("YOLO_MODEL_PATH", default_model)
        self.model_version = "malaria-yolo8-v1.0.0"
        self.is_loaded = False
        self.model = None
        self.use_placeholder = False
        self.use_onnx = False
        self.ultralytics_model = None

        # YOLOv11 configuration
        self.confidence_threshold = float(os.getenv("YOLO_CONFIDENCE_THRESHOLD", "0.25"))
        self.iou_threshold = float(os.getenv("YOLO_IOU_THRESHOLD", "0.45"))
        self.image_size = int(os.getenv("YOLO_IMAGE_SIZE", "640"))

        logging.info(f"Initializing Malaria Inference Service with model: {self.model_path}")

    def load_model(self):
        """
        Load the YOLOv8 model (ONNX or PyTorch).
        Falls back to placeholder mode if model file doesn't exist or dependencies not installed.
        """
        if self.is_loaded:
            return

        # Check if model file exists
        if not Path(self.model_path).exists():
            logging.warning(f"Model file not found at {self.model_path}. Using placeholder mode.")
            self.use_placeholder = True
            self.is_loaded = True
            return

        # Check if it's an ONNX model
        if self.model_path.endswith('.onnx'):
            try:
                # Try to use YOLO with ONNX model for better inference handling
                from ultralytics import YOLO
                self.ultralytics_model = YOLO(self.model_path)
                self.use_onnx = True
                self.use_placeholder = False
                self.is_loaded = True
                logging.info(f"YOLOv8 ONNX model loaded successfully from {self.model_path}")
                return
            except Exception as e:
                logging.warning(f"Error loading ONNX model with ultralytics: {str(e)}. Trying ONNXRuntime...")
                
                try:
                    import onnxruntime as ort
                    self.model = ort.InferenceSession(self.model_path)
                    self.use_onnx = True
                    self.use_placeholder = False
                    self.is_loaded = True
                    logging.info(f"YOLOv8 ONNX model loaded successfully with ONNXRuntime from {self.model_path}")
                    return
                except ImportError:
                    logging.warning("ONNXRuntime not installed. Using placeholder mode. Install with: pip install onnxruntime")
                    self.use_placeholder = True
                    self.is_loaded = True
                    return
                except Exception as e:
                    logging.error(f"Error loading ONNX model: {str(e)}. Using placeholder mode.")
                    self.use_placeholder = True
                    self.is_loaded = True
                    return

        # Try PyTorch model
        try:
            from ultralytics import YOLO
            self.ultralytics_model = YOLO(self.model_path)
            logging.info(f"YOLOv8 PyTorch model loaded successfully from {self.model_path}")
            self.use_placeholder = False
            self.is_loaded = True
        except ImportError:
            logging.warning("Ultralytics not installed. Using placeholder mode. Install with: pip install ultralytics")
            self.use_placeholder = True
            self.is_loaded = True
        except Exception as e:
            logging.error(f"Error loading YOLOv8 model: {str(e)}. Using placeholder mode.")
            self.use_placeholder = True
            self.is_loaded = True

    def preprocess_image(self, image: Image.Image) -> np.ndarray:
        """
        Preprocess blood smear image for model inference.
        YOLOv11 handles most preprocessing internally, but we ensure RGB format.

        Args:
            image: PIL Image object

        Returns:
            Preprocessed numpy array or PIL Image
        """
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')

        return image

    def _run_yolo_inference(self, image_path: str) -> Tuple[InferenceResult, float, float, Optional[List[Dict]]]:
        """
        Run YOLOv8 inference on the image.

        Returns:
            Tuple of (result, confidence_score, processing_time_ms, detections)
        """
        start_time = time.time()

        try:
            # Use ultralytics model if available
            if self.ultralytics_model is not None:
                # Run inference
                results = self.ultralytics_model.predict(
                    source=image_path,
                    conf=self.confidence_threshold,
                    iou=self.iou_threshold,
                    imgsz=self.image_size,
                    verbose=False
                )

                # Process results
                detections = []
                max_confidence = 0.0

                if len(results) > 0:
                    result = results[0]
                    boxes = result.boxes

                    for box in boxes:
                        conf = float(box.conf[0])
                        cls = int(box.cls[0])
                        class_name = result.names[cls] if cls in result.names else f"class_{cls}"
                        
                        # Get bounding box coordinates
                        xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]

                        detection = {
                            "class": class_name,
                            "confidence": conf,
                            "bbox": xyxy,
                            "x1": xyxy[0],
                            "y1": xyxy[1],
                            "x2": xyxy[2],
                            "y2": xyxy[3]
                        }
                        detections.append(detection)

                        if conf > max_confidence:
                            max_confidence = conf

                # Determine result based on detections
                if len(detections) > 0:
                    if max_confidence > 0.7:
                        inference_result = InferenceResult.POSITIVE
                    elif max_confidence > 0.4:
                        inference_result = InferenceResult.INCONCLUSIVE
                    else:
                        inference_result = InferenceResult.NEGATIVE
                else:
                    inference_result = InferenceResult.NEGATIVE
                    max_confidence = 0.95  # High confidence in negative result

            processing_time = (time.time() - start_time) * 1000

            logging.info(f"YOLOv8 inference: {inference_result.value} (confidence: {max_confidence:.2f}, "
                        f"detections: {len(detections)}, time: {processing_time:.2f}ms)")

            return inference_result, max_confidence, processing_time, detections

        except Exception as e:
            logging.error(f"Error during YOLOv8 inference: {str(e)}")
            raise

    def _run_placeholder_inference(self, image_path: str) -> Tuple[InferenceResult, float, float, Optional[List[Dict]]]:
        """
        Placeholder inference for testing when model is not available.
        Simulates realistic malaria detection with dummy detections.

        Returns:
            Tuple of (result, confidence_score, processing_time_ms, detections)
        """
        start_time = time.time()

        # Simulate processing time
        time.sleep(random.uniform(0.1, 0.3))

        # Simulate realistic detection scenarios
        scenario = random.random()
        detections = []

        if scenario < 0.3:  # 30% chance of positive
            # Simulate detecting malaria parasites
            num_parasites = random.randint(1, 5)
            for i in range(num_parasites):
                detection = {
                    "class": "plasmodium",
                    "confidence": random.uniform(0.75, 0.95),
                    "bbox": [
                        random.uniform(100, 500),
                        random.uniform(100, 400),
                        random.uniform(520, 600),
                        random.uniform(420, 500)
                    ]
                }
                detections.append(detection)

            max_confidence = max(d["confidence"] for d in detections)
            result = InferenceResult.POSITIVE
            confidence = max_confidence

        elif scenario < 0.85:  # 55% chance of negative
            # No parasites detected
            result = InferenceResult.NEGATIVE
            confidence = random.uniform(0.88, 0.98)
            detections = []

        else:  # 15% chance of inconclusive
            # Borderline detection
            detection = {
                "class": "plasmodium",
                "confidence": random.uniform(0.35, 0.55),
                "bbox": [
                    random.uniform(100, 500),
                    random.uniform(100, 400),
                    random.uniform(520, 600),
                    random.uniform(420, 500)
                ]
            }
            detections.append(detection)
            result = InferenceResult.INCONCLUSIVE
            confidence = detection["confidence"]

        processing_time = (time.time() - start_time) * 1000

        logging.info(f"Placeholder inference: {result.value} (confidence: {confidence:.2f}, "
                    f"detections: {len(detections)}, time: {processing_time:.2f}ms)")

        return result, confidence, processing_time, detections

    def analyze_image(self, image_path: str) -> Tuple[InferenceResult, float, float, Optional[List[Dict]]]:
        """
        Analyze a blood smear image for malaria parasites.

        Args:
            image_path: Path to the blood smear image

        Returns:
            Tuple of (result, confidence_score, processing_time_ms, detections)
        """
        try:
            # Ensure model is loaded
            if not self.is_loaded:
                self.load_model()

            # Run inference (YOLOv8 or placeholder)
            if self.use_placeholder:
                result, confidence, processing_time, detections = self._run_placeholder_inference(image_path)
            else:
                result, confidence, processing_time, detections = self._run_yolo_inference(image_path)

            return result, confidence, processing_time, detections

        except Exception as e:
            logging.error(f"Error during image analysis: {str(e)}")
            raise
    
    def validate_image(self, image_path: str) -> bool:
        """
        Validate that the image is suitable for analysis.
        
        Args:
            image_path: Path to the image file
            
        Returns:
            True if image is valid, False otherwise
        """
        try:
            image = Image.open(image_path)
            
            # Check image format
            if image.format not in ['JPEG', 'PNG', 'JPG']:
                logging.warning(f"Invalid image format: {image.format}")
                return False
            
            # Check image size (minimum dimensions)
            min_width, min_height = 100, 100
            if image.width < min_width or image.height < min_height:
                logging.warning(f"Image too small: {image.width}x{image.height}")
                return False
            
            # Check file size (max 10MB)
            import os
            file_size = os.path.getsize(image_path)
            max_size = 10 * 1024 * 1024  # 10MB
            if file_size > max_size:
                logging.warning(f"Image file too large: {file_size} bytes")
                return False
            
            return True
            
        except Exception as e:
            logging.error(f"Error validating image: {str(e)}")
            return False


# Singleton instance
_inference_service = None

def get_inference_service() -> MalariaInferenceService:
    """Get or create the singleton inference service instance."""
    global _inference_service
    if _inference_service is None:
        _inference_service = MalariaInferenceService()
        _inference_service.load_model()
    return _inference_service

