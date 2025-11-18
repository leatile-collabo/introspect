/**
 * Blood smear analysis functionality
 */

// Track current input method and result
let currentInputMethod = 'upload';
let currentTestResultId = null;
let previewInterval = null;
let previewTimeoutId = null;
let previewFailCount = 0;
let capturedImageFile = null;  // Store captured image from camera
const MAX_PREVIEW_FAILURES = 3;
const PREVIEW_TIMEOUT_MS = 10000; // 10 second timeout per request

function selectInputMethod(method) {
    currentInputMethod = method;

    // Update button styles
    const cameraBtn = document.getElementById('btn-camera');
    const uploadBtn = document.getElementById('btn-upload');
    const cameraSection = document.getElementById('camera-section');
    const uploadSection = document.getElementById('upload-section');
    const imageUpload = document.getElementById('image-upload');

    if (method === 'camera') {
        cameraBtn.classList.add('active', 'border-cyan-500', 'bg-cyan-50');
        cameraBtn.classList.remove('border-gray-300');
        uploadBtn.classList.remove('active', 'border-cyan-500', 'bg-cyan-50');
        uploadBtn.classList.add('border-gray-300');

        cameraSection.classList.remove('hidden');
        uploadSection.classList.add('hidden');
        imageUpload.removeAttribute('required');

        // Start camera preview
        startCameraPreview();
    } else {
        uploadBtn.classList.add('active', 'border-cyan-500', 'bg-cyan-50');
        uploadBtn.classList.remove('border-gray-300');
        cameraBtn.classList.remove('active', 'border-cyan-500', 'bg-cyan-50');
        cameraBtn.classList.add('border-gray-300');

        uploadSection.classList.remove('hidden');
        cameraSection.classList.add('hidden');
        imageUpload.setAttribute('required', 'required');

        // Stop camera preview
        stopCameraPreview();
    }
}

async function startCameraPreview() {
    try {
        // Check authentication first
        const userResponse = await authenticatedFetch('/users/me');
        if (!userResponse.ok) {
            // Session expired - redirect to index
            window.location.href = '/';
            return;
        }

        // Start preview on backend
        await authenticatedFetch('/api/results/camera/start-preview', {
            method: 'POST'
        });

        // Reset failure count when starting fresh
        previewFailCount = 0;

        // Start polling for preview frames
        previewInterval = setInterval(refreshPreview, 500); // Update every 500ms

        // Initial load
        refreshPreview();
    } catch (error) {
        console.error('Error starting camera preview:', error);
        showToast('Failed to start camera preview', 'error');
    }
}

async function stopCameraPreview() {
    // Stop polling
    if (previewInterval) {
        clearInterval(previewInterval);
        previewInterval = null;
    }

    // Reset failure count
    previewFailCount = 0;

    try {
        // Stop preview on backend
        await authenticatedFetch('/api/results/camera/stop-preview', {
            method: 'POST'
        });
    } catch (error) {
        console.error('Error stopping camera preview:', error);
    }
}

async function refreshPreview() {
    try {
        // Create an abort controller with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);

        try {
            const token = getAuthToken();
            const response = await fetch('/api/results/camera/preview-frame', {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);
                const previewImg = document.getElementById('camera-preview');
                const loadingDiv = document.getElementById('preview-loading');

                previewImg.src = imageUrl;
                loadingDiv.classList.add('hidden');
                
                // Reset failure count on success
                previewFailCount = 0;
            } else {
                previewFailCount++;
                console.warn(`Preview request failed with status ${response.status}`);
                
                if (previewFailCount >= MAX_PREVIEW_FAILURES) {
                    handlePreviewFailure('Camera preview unavailable. Please check camera connection.');
                }
            }
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                previewFailCount++;
                console.warn('Preview request timed out');
                
                if (previewFailCount >= MAX_PREVIEW_FAILURES) {
                    handlePreviewFailure('Camera preview is taking too long to respond. Please check the camera.');
                }
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error refreshing preview:', error);
        previewFailCount++;
        
        if (previewFailCount >= MAX_PREVIEW_FAILURES) {
            handlePreviewFailure('Failed to load camera preview.');
        }
    }
}

function handlePreviewFailure(message) {
    // Stop the preview polling
    if (previewInterval) {
        clearInterval(previewInterval);
        previewInterval = null;
    }

    // Stop camera preview on backend
    stopCameraPreview();

    const loadingDiv = document.getElementById('preview-loading');
    const previewImg = document.getElementById('camera-preview');

    // Show error message
    if (loadingDiv) {
        loadingDiv.innerHTML = `
            <div class="text-center text-white">
                <svg class="inline h-12 w-12 mb-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-sm mt-2">${message}</p>
                <button onclick="switchToUploadMode()" class="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white text-sm">
                    Use Upload Instead
                </button>
            </div>
        `;
        loadingDiv.classList.remove('hidden');
    }

    showToast(message, 'error');
}

function switchToUploadMode() {
    // Switch input method back to upload
    selectInputMethod('upload');
    showToast('Switched to image upload mode', 'info');
}

async function captureFromCamera() {
    try {
        const captureBtn = document.getElementById('capture-btn');
        captureBtn.disabled = true;
        
        // Get the current preview image
        const previewImg = document.getElementById('camera-preview');
        if (!previewImg.src) {
            showToast('Preview not ready. Please wait for preview to load.', 'error');
            captureBtn.disabled = false;
            return;
        }

        // Fetch the image from preview URL and convert to File
        const response = await fetch(previewImg.src);
        const blob = await response.blob();
        
        // Create a File object from the blob
        const timestamp = new Date().toLocaleString().replace(/[\/\s:]/g, '_');
        capturedImageFile = new File(
            [blob], 
            `camera_capture_${timestamp}.jpg`, 
            { type: 'image/jpeg' }
        );

        // Show captured image preview
        const capturePreviewUrl = URL.createObjectURL(blob);
        showCapturedImagePreview(capturePreviewUrl);

        // Show captured image with visual feedback
        showToast('✓ Image captured! Review below before submitting.', 'success');
        
        // Visually indicate capture
        const previewContainer = previewImg.parentElement;
        previewContainer.style.borderColor = '#10b981';
        previewContainer.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
        
        // Reset border after 2 seconds
        setTimeout(() => {
            previewContainer.style.borderColor = '#d1d5db';
            previewContainer.style.boxShadow = 'none';
        }, 2000);

        captureBtn.disabled = false;
    } catch (error) {
        console.error('Error capturing from camera:', error);
        showToast('Failed to capture image', 'error');
        const captureBtn = document.getElementById('capture-btn');
        captureBtn.disabled = false;
    }
}

function showCapturedImagePreview(imageUrl) {
    // Hide camera section and show captured image preview
    const cameraSection = document.getElementById('camera-section');
    const previewSection = document.getElementById('capture-preview-section');
    
    if (!previewSection) {
        // Create preview section if it doesn't exist
        const newSection = document.createElement('div');
        newSection.id = 'capture-preview-section';
        newSection.className = 'space-y-4 mt-6 p-4 bg-gray-50 rounded-xl border-2 border-green-200';
        newSection.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <h4 class="font-medium text-gray-900">✓ Image Captured</h4>
                <button type="button" onclick="clearCapturedImage()" class="text-sm px-3 py-1 text-gray-600 hover:bg-gray-200 rounded">
                    Retake
                </button>
            </div>
            <img id="captured-image-preview" src="${imageUrl}" alt="Captured" class="w-full rounded-lg border border-gray-300">
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-white p-3 rounded border border-gray-200">
                    <p class="text-xs text-gray-600">File Size</p>
                    <p id="capture-file-size" class="text-sm font-semibold text-gray-900">-</p>
                </div>
                <div class="bg-white p-3 rounded border border-gray-200">
                    <p class="text-xs text-gray-600">Ready for Analysis</p>
                    <p class="text-sm font-semibold text-green-600">✓ Yes</p>
                </div>
            </div>
            <p class="text-xs text-gray-600">
                Image preview shows the captured blood smear. Scroll down and click "Analyze Image" to run AI inference.
            </p>
        `;
        cameraSection.insertAdjacentElement('afterend', newSection);
    } else {
        // Update existing preview
        document.getElementById('captured-image-preview').src = imageUrl;
        previewSection.classList.remove('hidden');
    }
    
    // Update file size
    if (capturedImageFile) {
        const sizeMB = (capturedImageFile.size / 1024 / 1024).toFixed(2);
        document.getElementById('capture-file-size').textContent = `${sizeMB} MB`;
    }
}

function clearCapturedImage() {
    capturedImageFile = null;
    const previewSection = document.getElementById('capture-preview-section');
    if (previewSection) {
        previewSection.classList.add('hidden');
    }
    showToast('Image cleared. Take another capture.', 'info');
}

async function loadUserInfo() {
    try {
        const response = await authenticatedFetch('/users/me');
        const user = await response.json();
        document.getElementById('user-name').textContent = `${user.first_name} ${user.last_name}`;
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

async function loadPatients() {
    try {
        const response = await authenticatedFetch('/api/patients');
        const patients = await response.json();
        
        const select = document.getElementById('patient-select');
        
        if (patients.length === 0) {
            select.innerHTML = '<option value="">No patients found - Add a patient first</option>';
            return;
        }
        
        select.innerHTML = '<option value="">Select a patient...</option>' +
            patients.map(p => `
                <option value="${p.id}">
                    ${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)} - ${p.age || 'N/A'} yrs - ${escapeHtml(p.national_id || 'No ID')}
                </option>
            `).join('');
        
        // Pre-select if patient_id in URL
        const urlParams = new URLSearchParams(window.location.search);
        const patientId = urlParams.get('patient_id');
        if (patientId) {
            select.value = patientId;
        }
        
    } catch (error) {
        console.error('Error loading patients:', error);
        showToast('Failed to load patients', 'error');
    }
}

function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file size (20MB)
    if (file.size > 20 * 1024 * 1024) {
        showToast('File size must be less than 20MB', 'error');
        event.target.value = '';
        return;
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('image-preview');
        const container = document.getElementById('preview-container');
        const icon = document.getElementById('upload-icon');
        
        preview.src = e.target.result;
        container.classList.remove('hidden');
        icon.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

document.getElementById('analyze-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const patientId = formData.get('patient_id');

    if (!patientId) {
        showToast('Please select a patient', 'error');
        return;
    }

    // Validate based on input method
    if (currentInputMethod === 'upload') {
        const imageFile = formData.get('image');
        if (!imageFile || imageFile.size === 0) {
            showToast('Please select an image', 'error');
            return;
        }
    } else if (currentInputMethod === 'camera') {
        if (!capturedImageFile) {
            showToast('Please capture an image from camera first', 'error');
            return;
        }
    }

    // Show loading state
    const submitBtn = document.getElementById('submit-btn');
    const submitText = document.getElementById('submit-text');
    const submitLoading = document.getElementById('submit-loading');

    submitBtn.disabled = true;
    submitText.classList.add('hidden');
    submitLoading.classList.remove('hidden');

    try {
        // Get user info for clinic_id
        const userResponse = await authenticatedFetch('/users/me');
        const user = await userResponse.json();

        let response;

        if (currentInputMethod === 'camera') {
            // Camera capture mode - use analyze endpoint with captured image
            const uploadData = new FormData();
            uploadData.append('image', capturedImageFile);
            uploadData.append('patient_id', patientId);
            uploadData.append('clinic_id', user.clinic_id || '00000000-0000-0000-0000-000000000000');

            const symptoms = formData.get('symptoms');
            if (symptoms) {
                uploadData.append('symptoms', symptoms);
            }

            const notes = formData.get('notes');
            if (notes) {
                uploadData.append('notes', notes);
            }

            response = await authenticatedFetch('/api/results/analyze', {
                method: 'POST',
                body: uploadData
            });
        } else {
            // Upload mode - use analyze endpoint
            const imageFile = formData.get('image');
            capturedImageFile = imageFile;  // Store for display
            const uploadData = new FormData();
            uploadData.append('image', imageFile);
            uploadData.append('patient_id', patientId);
            uploadData.append('clinic_id', user.clinic_id || '00000000-0000-0000-0000-000000000000');

            const symptoms = formData.get('symptoms');
            if (symptoms) {
                uploadData.append('symptoms', symptoms);
            }

            const notes = formData.get('notes');
            if (notes) {
                uploadData.append('notes', notes);
            }

            response = await authenticatedFetch('/api/results/analyze', {
                method: 'POST',
                body: uploadData
            });
        }
        
        if (response.ok) {
            const result = await response.json();
            currentTestResultId = result.test_result_id;
            displayResult(result);
            showToast('Analysis complete! Please confirm the result.', 'success');
        } else {
            const error = await response.json();
            showToast(error.detail || 'Analysis failed', 'error');
        }
        
    } catch (error) {
        console.error('Error analyzing image:', error);
        showToast('Failed to analyze image', 'error');
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        submitText.classList.remove('hidden');
        submitLoading.classList.add('hidden');
    }
});

// Draw bounding boxes on canvas for detections
async function drawDetectionsOnImage(imageSrc, detections) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            // Draw the image
            ctx.drawImage(img, 0, 0);

            // Draw detections if available
            if (detections && detections.length > 0) {
                detections.forEach((detection, index) => {
                    const x1 = Math.max(0, detection.x1);
                    const y1 = Math.max(0, detection.y1);
                    const x2 = Math.min(canvas.width, detection.x2);
                    const y2 = Math.min(canvas.height, detection.y2);

                    // Random color for each detection
                    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
                    const color = colors[index % colors.length];

                    // Draw bounding box
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

                    // Draw label background
                    const label = `${detection.class} ${(detection.confidence * 100).toFixed(1)}%`;
                    ctx.font = 'bold 14px Arial';
                    const textMetrics = ctx.measureText(label);
                    const textWidth = textMetrics.width;
                    const textHeight = 20;

                    ctx.fillStyle = color;
                    ctx.fillRect(x1, Math.max(0, y1 - textHeight - 5), textWidth + 10, textHeight + 5);

                    // Draw label text
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(label, x1 + 5, y1 - 5);
                });
            }

            // Convert canvas to blob
            canvas.toBlob((blob) => {
                resolve(URL.createObjectURL(blob));
            }, 'image/jpeg', 0.95);
        };
        img.src = imageSrc;
    });
}

function displayResult(result) {
    console.log('=== DISPLAY RESULT CALLED ===');
    console.log('Result:', result);
    
    // Get DOM elements
    const container = document.getElementById('result-container');
    const content = document.getElementById('result-content');
    const confirmationSection = document.getElementById('confirmation-section');
    const confirmedResultSelect = document.getElementById('confirmed-result');
    
    console.log('DOM Check:', { container: !!container, content: !!content, confirmationSection: !!confirmationSection, confirmedResultSelect: !!confirmedResultSelect });
    
    if (!container || !content) {
        console.error('Required elements not found!');
        return;
    }
    
    // Calculate display values
    const resultClass = getResultClass(result.result);
    const resultIcon = getResultIcon(result.result);
    const confidencePercent = (result.confidence_score * 100).toFixed(1);
    
    // Determine confidence level description
    let confidenceLevel = '';
    let confidenceColor = '';
    if (result.confidence_score >= 0.85) {
        confidenceLevel = 'High Confidence';
        confidenceColor = 'text-green-600';
    } else if (result.confidence_score >= 0.65) {
        confidenceLevel = 'Moderate Confidence';
        confidenceColor = 'text-amber-600';
    } else {
        confidenceLevel = 'Low Confidence';
        confidenceColor = 'text-red-600';
    }

    // Build image HTML section
    let capturedImageHtml = '';
    if (capturedImageFile) {
        const imageUrl = URL.createObjectURL(capturedImageFile);
        capturedImageHtml = `
            <div class="mb-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Blood Smear Image Analysis</h3>
                
                <!-- Zoom Controls -->
                <div class="flex items-center justify-between mb-4 p-3 bg-gray-100 rounded-lg">
                    <div class="flex items-center space-x-2">
                        <button onclick="zoomOut()" class="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition" title="Zoom Out">
                            <svg class="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"></path>
                            </svg>
                        </button>
                        <span id="zoom-level" class="text-sm font-medium text-gray-700 min-w-fit">100%</span>
                        <button onclick="zoomIn()" class="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition" title="Zoom In">
                            <svg class="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"></path>
                            </svg>
                        </button>
                        <button onclick="resetZoom()" class="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium text-gray-600" title="Reset Zoom">
                            Reset
                        </button>
                    </div>
                    <p class="text-xs text-gray-600">Drag to pan • Use buttons to zoom</p>
                </div>

                <!-- Zoomable Image Container -->
                <div id="image-container" class="relative rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-50" style="height: 500px; cursor: grab; background: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/><rect fill=%22%23e5e7eb%22 x=%220%22 y=%220%22 width=%2250%22 height=%2250%22/><rect fill=%22%23e5e7eb%22 x=%2250%22 y=%2250%22 width=%2250%22 height=%2250%22/></svg>');">
                    <div id="image-wrapper" class="w-full h-full" style="overflow: auto; position: relative; transform-origin: top left;">
                        <img id="analyzed-image" src="${imageUrl}" alt="Analyzed Blood Smear" class="w-full h-auto" style="display: block; user-select: none; cursor: grab;">
                    </div>
                    <div class="absolute top-3 right-3 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-xs z-10">
                        Interactive Zoom
                    </div>
                </div>
                
                <p class="text-xs text-gray-500 mt-2">💡 Examine the bounding boxes by zooming in. This helps technicians verify cell detection accuracy.</p>
            </div>
        `;
    } else {
        capturedImageHtml = `
            <div class="mb-6 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                <p class="text-sm text-yellow-800">⚠️ Note: Image display not available. Analysis result shown below.</p>
            </div>
        `;
    }

    // Build complete result HTML
    content.innerHTML = `
        ${capturedImageHtml}
        
        <div class="flex items-center justify-center p-6 ${resultClass} rounded-xl">
            ${resultIcon}
            <div class="ml-4">
                <h3 class="text-2xl font-bold capitalize">${result.result}</h3>
                <p class="text-sm mt-1">AI Confidence: <span class="${confidenceColor} font-semibold">${confidencePercent}%</span> (${confidenceLevel})</p>
            </div>
        </div>

        <!-- Confidence Score Progress Bar -->
        <div class="mt-6 bg-white rounded-lg p-4 border border-gray-200">
            <div class="flex justify-between items-center mb-2">
                <p class="text-sm font-medium text-gray-700">Confidence Score</p>
                <p class="text-lg font-bold ${confidenceColor}">${confidencePercent}%</p>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-3">
                <div class="bg-gradient-to-r from-cyan-500 to-blue-600 h-3 rounded-full transition-all" style="width: ${confidencePercent}%"></div>
            </div>
            <p class="text-xs text-gray-600 mt-2">
                ${confidenceLevel} - AI model assessment confidence level
            </p>
        </div>

        <!-- Detailed Analysis Stats -->
        <div class="grid grid-cols-3 gap-4 mt-6">
            <div class="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
                <p class="text-sm text-gray-600">AI Result</p>
                <p class="text-lg font-bold text-blue-600 capitalize">${result.result}</p>
            </div>
            <div class="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                <p class="text-sm text-gray-600">Analysis Time</p>
                <p class="text-lg font-bold text-purple-600">${result.processing_time_ms.toFixed(0)}ms</p>
            </div>
            <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-300">
                <p class="text-sm text-gray-600">Detections</p>
                <p class="text-lg font-bold text-gray-700">${result.detections ? result.detections.length : 0} cells</p>
            </div>
        </div>

        <!-- Detections List -->
        ${result.detections && result.detections.length > 0 ? `
        <div class="mt-6 bg-white rounded-lg p-4 border border-gray-200">
            <h4 class="text-md font-semibold text-gray-900 mb-3">🔬 Detected Cells (${result.detections.length})</h4>
            <div class="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                ${result.detections.map((det, idx) => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded border-l-4 border-cyan-500">
                    <div>
                        <p class="text-sm font-medium text-gray-900">Cell #${idx + 1}</p>
                        <p class="text-xs text-gray-600">${det.class || 'Plasmodium'}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-bold text-cyan-600">${(det.confidence * 100).toFixed(1)}%</p>
                        <p class="text-xs text-gray-500">confidence</p>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        ${result.result === 'positive' ? `
        <div class="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <div class="flex items-start">
                <svg class="h-6 w-6 text-red-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                <div>
                    <p class="text-sm font-semibold text-red-900">⚠️ Positive Result Detected</p>
                    <p class="text-sm text-red-800 mt-1">
                        Malaria parasites detected in the blood smear with <span class="font-bold">${confidencePercent}%</span> confidence.
                        <br><br>
                        <strong>Action Required:</strong> Technician confirmation recommended. This result requires immediate attention and follow-up treatment.
                    </p>
                </div>
            </div>
        </div>
        ` : result.result === 'negative' ? `
        <div class="mt-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
            <div class="flex items-start">
                <svg class="h-6 w-6 text-green-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                    <p class="text-sm font-semibold text-green-900">✓ Negative Result</p>
                    <p class="text-sm text-green-800 mt-1">
                        No malaria parasites detected in the blood smear with <span class="font-bold">${confidencePercent}%</span> confidence.
                        <br><br>
                        <strong>Assessment:</strong> The sample appears normal. No evidence of malaria infection detected.
                    </p>
                </div>
            </div>
        </div>
        ` : `
        <div class="mt-6 p-4 bg-amber-50 border-2 border-amber-200 rounded-lg">
            <div class="flex items-start">
                <svg class="h-6 w-6 text-amber-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                    <p class="text-sm font-semibold text-amber-900">⚠️ Inconclusive Result</p>
                    <p class="text-sm text-amber-800 mt-1">
                        The analysis is borderline with <span class="font-bold">${confidencePercent}%</span> confidence.
                        <br><br>
                        <strong>Recommendation:</strong> Consider retaking the sample for AI analysis confirmation. Technician review is recommended for borderline cases.
                    </p>
                </div>
            </div>
        </div>
        `}

        <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p class="text-sm text-blue-800">
                <strong>Important:</strong> This result is generated by an AI model and should not be used as the sole basis for clinical decision-making. Technician/clinician confirmation is required before finalizing the diagnosis.
            </p>
        </div>
    `;

    console.log('Content HTML set successfully');

    // Show result container
    container.classList.remove('hidden');
    console.log('Result container now visible');

    // Show confirmation section if it exists
    if (confirmationSection) {
        confirmationSection.classList.remove('hidden');
        // Pre-select the AI result
        if (confirmedResultSelect) {
            confirmedResultSelect.value = result.result;
            console.log('Confirmation section pre-selected with:', result.result);
        }
    }
    
    // Scroll to result
    setTimeout(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        console.log('Scrolled to result');
    }, 100);
    
    // Setup zoom/pan listeners
    setTimeout(() => {
        console.log('Setting up pan listeners');
        setupPanListeners();
    }, 150);
    
    // Draw detections on the image
    if (result.detections && result.detections.length > 0 && capturedImageFile) {
        setTimeout(() => {
            const imageUrl = URL.createObjectURL(capturedImageFile);
            drawDetectionsOnImage(imageUrl, result.detections).then((annotatedImageUrl) => {
                const analyzedImg = document.getElementById('analyzed-image');
                if (analyzedImg) {
                    analyzedImg.src = annotatedImageUrl;
                    console.log('Image updated with detection boxes');
                }
            });
        }, 200);
    }
}

async function confirmResult() {
    const confirmedResult = document.getElementById('confirmed-result').value;
    const confirmationNotes = document.getElementById('confirmation-notes').value;

    if (!confirmedResult) {
        showToast('Please select a confirmed result', 'error');
        return;
    }

    if (!currentTestResultId) {
        showToast('No test result to confirm', 'error');
        return;
    }

    // Show loading state
    const confirmBtn = document.getElementById('confirm-btn');
    const confirmText = document.getElementById('confirm-text');
    const confirmLoading = document.getElementById('confirm-loading');

    confirmBtn.disabled = true;
    confirmText.classList.add('hidden');
    confirmLoading.classList.remove('hidden');

    try {
        const response = await authenticatedFetch(`/api/results/${currentTestResultId}/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                confirmed_result: confirmedResult,
                confirmation_notes: confirmationNotes || null
            })
        });

        if (response.ok) {
            const result = await response.json();

            // Hide result container and show success message
            document.getElementById('result-container').classList.add('hidden');
            document.getElementById('confirmation-success').classList.remove('hidden');
            document.getElementById('confirmation-success').scrollIntoView({ behavior: 'smooth' });

            showToast('Result confirmed successfully!', 'success');
        } else {
            const error = await response.json();
            showToast(error.detail || 'Failed to confirm result', 'error');
        }
    } catch (error) {
        console.error('Error confirming result:', error);
        showToast('Failed to confirm result', 'error');
    } finally {
        // Reset button state
        confirmBtn.disabled = false;
        confirmText.classList.remove('hidden');
        confirmLoading.classList.add('hidden');
    }
}

function getResultClass(result) {
    const classes = {
        'positive': 'bg-red-50 border-2 border-red-200',
        'negative': 'bg-green-50 border-2 border-green-200',
        'inconclusive': 'bg-amber-50 border-2 border-amber-200'
    };
    return classes[result] || 'bg-gray-50 border-2 border-gray-200';
}

function getResultIcon(result) {
    const icons = {
        'positive': `
            <svg class="h-16 w-16 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
        `,
        'negative': `
            <svg class="h-16 w-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
        `,
        'inconclusive': `
            <svg class="h-16 w-16 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
        `
    };
    return icons[result] || '';
}

// Zoom and Pan Functionality
let currentZoom = 1;
const minZoom = 0.5;
const maxZoom = 4;
const zoomStep = 0.25;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOffsetX = 0;
let panOffsetY = 0;

function zoomIn() {
    if (currentZoom < maxZoom) {
        currentZoom = Math.min(currentZoom + zoomStep, maxZoom);
        applyZoom();
    }
}

function zoomOut() {
    if (currentZoom > minZoom) {
        currentZoom = Math.max(currentZoom - zoomStep, minZoom);
        applyZoom();
    }
}

function resetZoom() {
    currentZoom = 1;
    panOffsetX = 0;
    panOffsetY = 0;
    applyZoom();
}

function applyZoom() {
    const wrapper = document.getElementById('image-wrapper');
    const image = document.getElementById('analyzed-image');
    const zoomLevel = document.getElementById('zoom-level');
    
    if (wrapper && image) {
        // Apply zoom and pan offset by scaling and translating the image
        image.style.transform = `scale(${currentZoom}) translate(${panOffsetX}px, ${panOffsetY}px)`;
        image.style.transformOrigin = 'top left';
        
        // Update zoom level display
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
        }
    }
}

// Pan functionality with mouse drag
function setupPanListeners() {
    const container = document.getElementById('image-container');
    const image = document.getElementById('analyzed-image');
    
    if (!container || !image) {
        console.warn('Image container or image not found for zoom setup');
        return;
    }
    
    // Prevent duplicate listeners
    if (container.dataset.zoomInitialized === 'true') {
        return;
    }
    container.dataset.zoomInitialized = 'true';
    
    // Mouse down - start dragging/panning
    container.addEventListener('mousedown', (e) => {
        if (currentZoom > 1) {
            isPanning = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            container.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });
    
    // Mouse move - drag/pan the image
    container.addEventListener('mousemove', (e) => {
        if (isPanning && currentZoom > 1) {
            e.preventDefault();
            const deltaX = e.clientX - panStartX;
            const deltaY = e.clientY - panStartY;
            
            // Update pan offset - move in the direction of cursor movement
            panOffsetX += deltaX / currentZoom;
            panOffsetY += deltaY / currentZoom;
            
            // Update start position for next movement
            panStartX = e.clientX;
            panStartY = e.clientY;
            
            applyZoom();
        } else if (currentZoom > 1) {
            container.style.cursor = 'grab';
        } else {
            container.style.cursor = 'auto';
        }
    });
    
    // Mouse up - end dragging/panning
    container.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            if (currentZoom > 1) {
                container.style.cursor = 'grab';
            } else {
                container.style.cursor = 'auto';
            }
        }
    });
    
    // Mouse leave - end dragging/panning
    container.addEventListener('mouseleave', () => {
        if (isPanning) {
            isPanning = false;
            container.style.cursor = 'auto';
        }
    });
    
    // Touch support for mobile dragging
    let touchStartX = 0;
    let touchStartY = 0;
    
    container.addEventListener('touchstart', (e) => {
        if (currentZoom > 1 && e.touches.length === 1) {
            isPanning = true;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    });
    
    container.addEventListener('touchmove', (e) => {
        if (isPanning && currentZoom > 1 && e.touches.length === 1) {
            const deltaX = e.touches[0].clientX - touchStartX;
            const deltaY = e.touches[0].clientY - touchStartY;
            
            panOffsetX += deltaX / currentZoom;
            panOffsetY += deltaY / currentZoom;
            
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            
            applyZoom();
        }
    });
    
    container.addEventListener('touchend', () => {
        isPanning = false;
    });
    
    // Mouse wheel zoom
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    }, { passive: false });
    
    // Pinch zoom for touch devices
    let lastDistance = 0;
    
    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const distance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            if (lastDistance && currentZoom > minZoom && currentZoom < maxZoom) {
                if (distance > lastDistance) {
                    zoomIn();
                } else {
                    zoomOut();
                }
            }
            lastDistance = distance;
        }
    });
    
    container.addEventListener('touchend', () => {
        lastDistance = 0;
    });
    
    console.log('Zoom/pan/drag listeners initialized successfully');
}

function resetForm() {
    // Stop camera preview if active
    stopCameraPreview();

    // Reset zoom level
    currentZoom = 1;

    // Reset form and UI
    document.getElementById('analyze-form').reset();
    document.getElementById('result-container').classList.add('hidden');
    document.getElementById('confirmation-success').classList.add('hidden');
    document.getElementById('preview-container').classList.add('hidden');
    document.getElementById('upload-icon').classList.remove('hidden');
    document.getElementById('confirmation-notes').value = '';

    // Reset state
    currentTestResultId = null;
    capturedImageFile = null;
    previewFailCount = 0;

    // Switch back to upload mode
    selectInputMethod('upload');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Add page unload handler to clean up resources
window.addEventListener('beforeunload', () => {
    if (previewInterval) {
        clearInterval(previewInterval);
    }
    stopCameraPreview();
});

// Handle page visibility change to stop preview when tab is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentInputMethod === 'camera' && previewInterval) {
        stopCameraPreview();
    }
});

