# 🔌 API Documentation

## 📋 İçindekiler
- [Authentication](#authentication)
- [Backend API Endpoints](#backend-api-endpoints)
- [AI Service Endpoints](#ai-service-endpoints)
- [WebSocket Events](#websocket-events)
- [MQTT Topics](#mqtt-topics)
- [Error Handling](#error-handling)

## 🔐 Authentication

### JWT Token Kullanımı
```bash
# Login
POST /api/auth/login
{
  "email": "admin@oltubelediyesi.gov.tr",
  "password": "admin123"
}

# Response
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "sessionId": "uuid",
  "user": {
    "id": "uuid",
    "email": "admin@oltubelediyesi.gov.tr",
    "firstName": "System",
    "lastName": "Administrator",
    "role": "ADMIN",
    "employee": {
      "id": "emp_uuid",
      "department": "IT",
      "position": "Administrator"
    }
  }
}

# API Request Headers
Authorization: Bearer <accessToken>
```

### Role-Based Access Control
- **ADMIN**: Tüm endpoints
- **SUPERVISOR**: Vardiya yönetimi, raporlama
- **OPERATOR**: Kendi verilerini görme, araç kullanım bildirme
- **MESSENGER**: Sesli mesajlaşma

## 🛠️ Backend API Endpoints

### Base URL: `http://localhost:3001/api`

#### Authentication
```bash
POST   /auth/login           # Kullanıcı girişi
POST   /auth/refresh         # Token yenileme
POST   /auth/logout          # Güvenli çıkış (session revoke)
GET    /auth/me              # Mevcut kullanıcı profili
```

#### Shifts (Vardiya Yönetimi)
```bash
GET    /shifts               # Vardiyalar (week query param ile)
POST   /shifts/generate      # AI ile vardiya oluştur
PATCH  /shifts/:id           # Vardiya güncelle
PUT    /shifts/:id           # Vardiya güncelle (frontend compat)
DELETE /shifts/:id           # Vardiya sil
```

#### Employees (Çalışan Yönetimi)
```bash
GET    /employees            # Aktif çalışanlar listesi
GET    /employees/:id        # Çalışan detayı
GET    /employees/:id/shifts # Çalışan vardiya geçmişi
```

**Example: Generate Shifts**
```bash
POST /api/shifts/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "employees": [
    {
      "id": "emp_123",
      "name": "Ahmet Yılmaz",
      "skills": ["driving", "cleaning"],
      "performance_score": 4.2,
      "max_hours_per_week": 40,
      "availability": {
        "monday": ["morning", "afternoon"],
        "tuesday": ["morning", "afternoon", "night"]
      }
    }
  ],
  "constraints": {
    "max_hours_per_week": 40,
    "min_rest_hours": 12,
    "max_consecutive_days": 6
  },
  "period": {
    "start_date": "2024-01-15T00:00:00Z",
    "end_date": "2024-01-21T23:59:59Z"
  },
  "optimize_for": "efficiency"
}
```

#### Vehicles (Araç Takip)
```bash
GET    /vehicles             # Tüm araçlar
GET    /vehicles/locations   # Son araç konumları (hours param ile)
GET    /vehicles/live        # Canlı araç verileri (range param ile)
POST   /vehicles/telemetry   # Telemetri verisi gönder
GET    /vehicles/:id/routes  # Araç rota geçmişi
GET    /vehicles/:id/fuel-reports # Yakıt raporları
POST   /vehicles/:id/fuel-prediction # AI yakıt tahmini
```

**Example: Post Telemetry**
```bash
POST /api/vehicles/telemetry
{
  "vehicleId": "vehicle_123",
  "gps": {
    "lat": 40.3456,
    "lng": 42.1234
  },
  "speed": 45.5,
  "fuelLevel": 75.0,
  "engineHours": 1250.5,
  "alerts": [
    {
      "type": "maintenance",
      "message": "Oil change required",
      "priority": "medium"
    }
  ]
}
```

#### Messages (Sesli Mesajlaşma)
```bash
GET    /messages/conversations # Konuşmalar listesi
GET    /messages              # Kullanıcı mesajları (type, unread params)
POST   /messages              # Multipart mesaj gönder (text/voice)
GET    /messages/:id/audio    # Ses dosyası erişimi
PATCH  /messages/:id/read     # Mesajı okundu olarak işaretle
DELETE /messages/:id          # Mesaj sil
```

#### Dashboard
```bash
GET    /dashboard/summary   # Dashboard özet verileri
GET    /dashboard/metrics   # Performans metrikleri
```

## 🤖 AI Service Endpoints

### Base URL: `http://localhost:8000/ai`

#### Shift Optimization
```bash
POST   /shifts/generate     # Vardiya optimizasyonu
POST   /shifts/analyze      # Mevcut vardiya analizi
GET    /shifts/optimization-status/:taskId  # Durum kontrol
POST   /shifts/batch-optimize # Toplu optimizasyon
```

#### Fuel Prediction
```bash
POST   /fuel/predict        # Yakıt tüketim tahmini
POST   /fuel/analyze        # Fleet analizi
POST   /fuel/optimize       # Yakıt optimizasyonu
GET    /fuel/efficiency/rankings # Verimlilik sıralaması
GET    /fuel/consumption/trends # Tüketim trendleri
```

**Example: Fuel Prediction**
```bash
POST /ai/fuel/predict
{
  "vehicle": {
    "id": "vehicle_123",
    "plate_number": "25 OLT 001",
    "vehicle_type": "TRUCK",
    "fuel_type": "DIESEL",
    "fuel_capacity": 80.0,
    "year": 2022,
    "model": "Ford Transit"
  },
  "historical_data": [
    {
      "date": "2024-01-01",
      "fuel_consumed": 25.5,
      "distance_traveled": 120.0,
      "avg_speed": 35.0,
      "route_type": "urban"
    }
  ],
  "prediction_period": {
    "start_date": "2024-01-15",
    "end_date": "2024-01-22"
  },
  "external_factors": {
    "weather": "rain",
    "traffic_level": "medium",
    "fuel_price_per_liter": 25.50
  }
}
```

#### Emissions Estimation
```bash
POST   /emissions/estimate  # Emisyon hesaplama
POST   /emissions/carbon-footprint # Karbon ayak izi
POST   /emissions/reduction-plan # Azaltım planı
GET    /emissions/benchmarks # Karşılaştırma verileri
```

## 🔄 WebSocket Events

### Connection: `ws://localhost:3001`

#### Authentication
```javascript
// Client connection
const socket = io('http://localhost:3001', {
  auth: {
    token: 'Bearer <accessToken>'
  }
});
```

#### Events

##### Shift Updates
```javascript
// Subscribe to shift updates
socket.emit('shift:subscribe');

// Listen for updates
socket.on('shift:updated', (data) => {
  console.log('Shift updated:', data);
});

// Unsubscribe
socket.emit('shift:unsubscribe');
```

##### Vehicle Tracking
```javascript
// Subscribe to vehicle updates
socket.emit('vehicle:subscribe', ['vehicle_123', 'vehicle_456']);

// Listen for location updates
socket.on('vehicle:location', (data) => {
  console.log('Vehicle location:', data.vehicleId, data.data);
});

// Listen for telemetry alerts
socket.on('telemetry:alert', (data) => {
  console.log('Alert:', data.vehicleId, data.data.message);
});
```

##### Voice Messages
```javascript
// Subscribe to message updates
socket.emit('message:subscribe');

// Listen for new messages
socket.on('message:new', (data) => {
  console.log('New message:', data);
});

// Typing indicators
socket.emit('message:typing', { receiverId: 'user_123' });
socket.emit('message:stop-typing', { receiverId: 'user_123' });
```

## 📡 MQTT Topics

### Broker: `mqtt://localhost:1883`

#### Vehicle Telemetry
```bash
# Topic pattern
vehicles/{vehicleId}/telemetry
vehicles/{vehicleId}/alerts
vehicles/{vehicleId}/status

# Example payload - Telemetry
{
  "gps": { "lat": 40.3456, "lng": 42.1234 },
  "speed": 45.5,
  "fuelLevel": 75.0,
  "engineHours": 1250.5,
  "timestamp": "2024-01-15T10:30:00Z"
}

# Example payload - Alert
{
  "type": "maintenance_required",
  "severity": "HIGH",
  "message": "Engine temperature high",
  "data": { "temperature": 95.5 },
  "timestamp": "2024-01-15T10:30:00Z"
}

# Example payload - Status
{
  "status": "active",
  "engineStatus": "started",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### IoT Device Integration
```javascript
// Node.js example
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

// Publish telemetry
client.publish('vehicles/vehicle_123/telemetry', JSON.stringify({
  gps: { lat: 40.3456, lng: 42.1234 },
  speed: 45.5,
  fuelLevel: 75.0,
  timestamp: new Date().toISOString()
}));
```

## 📊 Response Format

### Standard Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // API response data
  },
  "metadata": {
    // Optional metadata (pagination, counts, etc.)
  }
}
```

### Pagination Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

## ❌ Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "email",
    "message": "Invalid email format"
  }
}
```

### HTTP Status Codes
- **200**: Success
- **201**: Created
- **400**: Bad Request (validation errors)
- **401**: Unauthorized (authentication required)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **429**: Too Many Requests (rate limited)
- **500**: Internal Server Error

### Common Error Types
```bash
# Authentication errors
401 - "Access token required"
401 - "Invalid token or user not active"
403 - "Insufficient permissions"

# Validation errors  
400 - "Validation failed"
400 - "Invalid vehicle ID format"
400 - "Historical data is required for prediction"

# Resource errors
404 - "Vehicle not found"
404 - "Shift not found"
404 - "Message not found"

# Rate limiting
429 - "Too many requests from this IP"
```

### Error Handling Best Practices
```javascript
// Frontend error handling
try {
  const response = await fetch('/api/shifts/current', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }
  
  const data = await response.json();
  return data;
} catch (error) {
  console.error('API Error:', error.message);
  // Show user-friendly error message
}
```

## 📝 Request/Response Examples

### Complete API Flow Example
```bash
# 1. Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@oltubelediyesi.gov.tr",
    "password": "admin123"
  }'

# 2. Get current shifts
curl -X GET http://localhost:3001/api/shifts/current \
  -H "Authorization: Bearer <accessToken>"

# 3. Generate new shifts with AI
curl -X POST http://localhost:3001/api/shifts/generate \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d @shift-request.json

# 4. Get vehicle telemetry
curl -X GET "http://localhost:3001/api/vehicles/live?range=24h" \
  -H "Authorization: Bearer <accessToken>"

# 5. AI fuel prediction
curl -X POST http://localhost:8000/ai/fuel/predict \
  -H "Content-Type: application/json" \
  -d @fuel-prediction-request.json
```

Bu dokümantasyon, tüm API endpoint'lerin kullanımını, WebSocket event'lerini ve MQTT topic'lerini kapsar. Geliştirme sürecinde referans olarak kullanılabilir.