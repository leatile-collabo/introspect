#!/usr/bin/env python3
"""
Test script to analyze an image and verify the result display
"""

import requests
import json
from io import BytesIO
from PIL import Image
import time

# Configuration
API_URL = "http://localhost:8000/api"
AUTH_EMAIL = "demo@introspect.com"
AUTH_PASSWORD = "password"

def create_test_image():
    """Create a simple test blood smear image"""
    img = Image.new('RGB', (640, 640), color='lightyellow')
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    
    # Draw some circles (simulated cells)
    for i in range(3):
        x = 100 + i * 180
        y = 150
        draw.ellipse([x, y, x+80, y+80], fill='darkred', outline='maroon', width=2)
    
    # Save to bytes
    img_bytes = BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)
    return img_bytes

def login():
    """Login and get auth token"""
    response = requests.post(
        f"{API_URL}/auth/token",
        data={
            "username": AUTH_EMAIL,  # OAuth2PasswordRequestForm uses 'username'
            "password": AUTH_PASSWORD
        }
    )
    if response.status_code == 200:
        data = response.json()
        print(f"✓ Login successful")
        return data['access_token']
    else:
        print(f"✗ Login failed: {response.text}")
        return None

def get_patients(token):
    """Get list of patients"""
    response = requests.get(
        f"{API_URL}/patients",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 200:
        patients = response.json()
        print(f"✓ Found {len(patients)} patients")
        if patients:
            return patients[0]['id']
    else:
        print(f"✗ Failed to get patients: {response.text}")
    return None

def analyze_image(token, patient_id, image_bytes):
    """Analyze an image"""
    files = {
        'image': ('test.jpg', image_bytes, 'image/jpeg')
    }
    data = {
        'patient_id': patient_id,
        'clinic_id': '1812783b-0036-415b-b488-df8a715c-06ba',
        'symptoms': 'fever'
    }
    
    response = requests.post(
        f"{API_URL}/results/analyze",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        data=data
    )
    
    print(f"\n📊 Analysis Response:")
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✓ Analysis successful!")
        print(f"  Result: {result.get('result')}")
        print(f"  Confidence: {result.get('confidence_score', 0)*100:.1f}%")
        print(f"  Processing Time: {result.get('processing_time_ms', 0):.0f}ms")
        print(f"  Detections: {len(result.get('detections', []))} cells")
        print(f"\nFull Response:")
        print(json.dumps(result, indent=2))
        return result
    else:
        print(f"✗ Analysis failed: {response.text}")
        return None

def main():
    print("🧪 Testing Analysis Result Display\n")
    
    # Login
    token = login()
    if not token:
        return
    
    # Get patient
    patient_id = get_patients(token)
    if not patient_id:
        return
    
    print(f"✓ Using patient: {patient_id}")
    
    # Create test image
    print("✓ Creating test image...")
    image_bytes = create_test_image()
    
    # Analyze
    print("📸 Analyzing image...")
    result = analyze_image(token, patient_id, image_bytes)
    
    if result:
        print("\n✅ Analysis completed successfully!")
        print("\n📝 Next steps:")
        print("1. Open http://localhost:8000/analyze in your browser")
        print("2. Open Developer Tools (F12)")
        print("3. Go to Console tab")
        print("4. You should see console.log messages from displayResult()")
        print("5. Check if the result container is visible on the page")
    else:
        print("\n❌ Analysis failed")

if __name__ == '__main__':
    main()
