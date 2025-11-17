from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from src.entities.test_result import TestStatus, SyncStatus

class Detection(BaseModel):
    """Detection model for individual parasite detections."""
    class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float
    bbox: Optional[List[float]] = None

class TestResultBase(BaseModel):
    patient_id: UUID
    clinic_id: UUID
    result: TestStatus
    confidence_score: Optional[float] = None
    notes: Optional[str] = None
    symptoms: Optional[str] = None

class TestResultCreate(TestResultBase):
    pass

class TestResultUpdate(BaseModel):
    result: Optional[TestStatus] = None
    notes: Optional[str] = None
    symptoms: Optional[str] = None

class TestResultResponse(TestResultBase):
    id: UUID
    health_worker_id: UUID
    test_date: datetime
    image_path: str
    image_filename: str
    model_version: Optional[str] = None
    processing_time_ms: Optional[float] = None
    sync_status: SyncStatus
    synced_at: Optional[datetime] = None
    is_confirmed: bool
    confirmed_by: Optional[UUID] = None
    confirmed_at: Optional[datetime] = None
    confirmation_notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class AnalysisRequest(BaseModel):
    """Request model for image analysis."""
    patient_id: UUID
    clinic_id: UUID
    notes: Optional[str] = None
    symptoms: Optional[str] = None

class AnalysisResponse(BaseModel):
    """Response model for image analysis."""
    test_result_id: UUID
    result: TestStatus
    confidence_score: float
    processing_time_ms: float
    message: str
    image_path: str
    detections: Optional[List[Dict[str, Any]]] = None

class ConfirmResultRequest(BaseModel):
    """Request model for confirming a test result."""
    confirmed_result: TestStatus
    confirmation_notes: Optional[str] = None

class ConfirmResultResponse(BaseModel):
    """Response model for result confirmation."""
    test_result_id: UUID
    is_confirmed: bool
    confirmed_by: UUID
    confirmed_at: datetime
    message: str

