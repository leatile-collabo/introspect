/**
 * Blood smear analysis functionality
 */

// Track current input method and result
let currentInputMethod = 'upload';
let currentTestResultId = null;
let previewInterval = null;
let previewTimeoutId = null;
let previewFailCount = 0;
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
            const token = localStorage.getItem('access_token');
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
            // Camera capture mode - use capture-and-analyze endpoint
            const captureData = new FormData();
            captureData.append('patient_id', patientId);
            captureData.append('clinic_id', user.clinic_id || '00000000-0000-0000-0000-000000000000');

            const symptoms = formData.get('symptoms');
            if (symptoms) {
                captureData.append('symptoms', symptoms);
            }

            const notes = formData.get('notes');
            if (notes) {
                captureData.append('notes', notes);
            }

            response = await authenticatedFetch('/api/results/capture-and-analyze', {
                method: 'POST',
                body: captureData
            });
        } else {
            // Upload mode - use analyze endpoint
            const imageFile = formData.get('image');
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

function displayResult(result) {
    const container = document.getElementById('result-container');
    const content = document.getElementById('result-content');
    const confirmationSection = document.getElementById('confirmation-section');
    const confirmedResultSelect = document.getElementById('confirmed-result');

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

    content.innerHTML = `
        <div class="flex items-center justify-center p-6 ${resultClass} rounded-xl">
            ${resultIcon}
            <div class="ml-4">
                <h3 class="text-2xl font-bold capitalize">${result.result}</h3>
                <p class="text-sm mt-1">AI Confidence: <span class="${confidenceColor} font-semibold">${confidencePercent}%</span> (${confidenceLevel})</p>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4 mt-6">
            <div class="bg-gray-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">Processing Time</p>
                <p class="text-lg font-semibold text-gray-900">${result.processing_time_ms.toFixed(0)} ms</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">Test Result ID</p>
                <p class="text-xs font-mono text-gray-900">${result.test_result_id.substring(0, 8)}...</p>
            </div>
        </div>

        ${result.result === 'positive' ? `
        <div class="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <div class="flex items-start">
                <svg class="h-5 w-5 text-red-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                <div>
                    <p class="text-sm font-semibold text-red-900">Positive Result Detected</p>
                    <p class="text-sm text-red-800 mt-1">
                        Malaria parasites detected with ${confidencePercent}% confidence.
                        Please review carefully and confirm the diagnosis.
                    </p>
                </div>
            </div>
        </div>
        ` : ''}

        <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p class="text-sm text-blue-800">
                <strong>Note:</strong> This result is generated by an AI model.
                Technician confirmation is required before finalizing the diagnosis.
            </p>
        </div>
    `;

    // Pre-select the AI result in confirmation dropdown
    confirmedResultSelect.value = result.result;

    // Show result and confirmation section
    container.classList.remove('hidden');
    confirmationSection.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth' });
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

function resetForm() {
    // Stop camera preview if active
    stopCameraPreview();

    // Reset form and UI
    document.getElementById('analyze-form').reset();
    document.getElementById('result-container').classList.add('hidden');
    document.getElementById('confirmation-success').classList.add('hidden');
    document.getElementById('preview-container').classList.add('hidden');
    document.getElementById('upload-icon').classList.remove('hidden');
    document.getElementById('confirmation-notes').value = '';

    // Reset state
    currentTestResultId = null;
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

