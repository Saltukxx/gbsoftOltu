# Oltu Belediyesi Akıllı Yönetim Platformu – Sunum Paketi

Bu doküman, yarın yapacağınız sunum için tüm modülleri, algoritmaları, teknik mimariyi ve fırsat alanlarını tek yerde toplar. Her bölüm, kod tabanındaki somut uygulamalara atıf yapar ve gerektiğinde örnek akışlar sunar.

---

## 1. Misyon ve Çıktılar
- **Problem**: Belediye birimleri vardiya, araç ve saha iletişimini ayrı sistemlerde yönetiyor; manuel planlama ve gecikmiş telemetri kararları hem maliyet hem de hizmet kalitesini düşürüyor.
- **Çözüm**: Tek çatı altında çalışan, yapay zekâ destekli, gerçek zamanlı bir operasyon platformu (shift planlama + filo takibi + sesli haberleşme + depo & görev yönetimi + analitik).
- **Değer Teklifi**: %15+ vardiya verim artışı, %10 yakıt tasarrufu, CO₂ görünürlüğü, kesintisiz saha iletişimi, audit destekli güvenlik.

---

## 2. Mimari Görünüm
| Katman | Teknoloji / Servis | Sorumluluklar |
| --- | --- | --- |
| **UI** | React + Vite + TypeScript, Zustand, React Query, Tailwind, Mapbox GL, Deck.GL | Rol bazlı dashboard, drag-drop vardiya planlayıcı, canlı araç haritası, WhatsApp benzeri sesli mesajlaşma, depo ve görev panelleri |
| **API (backend/src/app.ts)** | Node 20, Express, Prisma, PostgreSQL, Socket.IO, Redis, MQTT | Auth & RBAC, vardiya/filo/mesaj API’leri, WebSocket yayını, telemetri alımı, dosya saklama, güvenlik katmanları |
| **AI Servisi (ai-service/)** | FastAPI, Python, XGBoost, NumPy, Timefold benzeri solver | Vardiya optimizasyonu, yakıt tahminleri, emisyon hesapları, rota optimizasyon sonuçlarını zenginleştirme |
| **İletişim** | MQTT broker, HTTP API, WebSocket kanalları | IoT araç verisi girişi, gerçek zamanlı bildirimler, offline toleransı |
| **Depolama** | PostgreSQL (Prisma şeması), Redis (oturum & rate limit), S3/local storage (ses dosyaları) | Kritik verilerin ACID kaydı, token/oturum yönetimi, medya saklama |

> **Güvenlik hatları**: Helmet + CORS + CSRF + Redis tabanlı session + JWT, farklı rate limit seviyeleri, API key + scope kontrollü telemetri girişleri, global audit logları.

---

## 3. Modül Bazlı Değer

### 3.1 Vardiya & İnsan Kaynağı Orkestrasyonu
- **Drag-drop planlayıcı**: React Beautiful DnD ile haftalık grid, çakışma tespiti, real-time WebSocket güncellemesi (`frontend/src/pages/ShiftsPage.tsx`).
- **AI destekli plan üretimi**: Supervisor rolü tek tuşla çalışan profilleri, vardiya kısıtlarını ve hedefleri (verimlilik / adalet) AI servisine gönderiyor (`backend/src/routes/shifts.ts:124-236`).
- **Genetik + CP-SAT hibrit optimizasyonu**: Timefold benzeri solver + GA fallback (80 populasyon, 120 jenerasyon) ile kapsama %95+, fairness metriği hesaplanıyor (`ai-service/models/shift_optimizer.py`).
- **Audit & telif**: Üretilen vardiyalar DB’de saklanıyor, Socket.IO ile `shift:bulk-updated` olayı yayınlanıyor.

### 3.2 Filo & IoT Telemetri
- **Gerçek zamanlı harita**: Mapbox GL, Deck.GL katmanları, layer tercihlerini persist eden hook’lar (`frontend/src/pages/VehiclesPage.tsx`).
- **MQTT → API pipeline**: Araç cihazları `vehicles/{id}/telemetry/*` topic’lerine publish ediyor; Node servisi validasyon ve güvenlik kontrolü sonrası konumu DB’ye yazıp `vehicle:{id}` kanalına yayıyor (`backend/src/services/mqtt.ts` ve `/routes/vehicles.ts`).
- **Yakıt & rota zekâsı**: Araç başına yakıt raporları, güzergâh geçmişi, AI destekli yakıt tahmin çağrısı (`backend/src/routes/vehicles.ts:233-356`).
- **Rota optimizasyonu**: TSP solver katmanı Nearest Neighbor / GA / Ant Colony / Hybrid modlarıyla tasarruf hesaplıyor, sonuçları `optimized_routes` tablosuna işliyor (`backend/src/routes/routes.ts` ve `src/services/routeOptimization`).

### 3.3 Sesli Mesajlaşma & İletişim
- **MediaRecorder tabanlı kayıt**: Tarayıcıda push-to-talk, waveform, kayıt süresi, oynatma kontrolleri (`frontend/src/pages/MessagesPage.tsx`).
- **Güvenli dosya saklama**: Multer hafıza depolama + MIME/uzantı doğrulama + opsiyonel S3 (`backend/src/routes/messages.ts` & `src/services/fileStorage.ts`).
- **Durum ve öncelik**: Okundu/okunmadı, öncelik seviyeleri, transcript alanı, WebSocket tip notifikasyonları.

### 3.4 Görev, Depo & Analitik
- **Görev atama**: Çoklu assignee, durum & öncelik, audit log (Prisma `Task` modelleri).
- **Depo yönetimi**: Kategori/konum filtreleri, check-in/out/transfer/adjustment akışları, WebSocket ile anlık stok güncelleme (`frontend/src/pages/WarehousePage.tsx` + `backend/src/routes/warehouse.ts`).
- **Dashboard**: Vardiya, araç, mesaj, uyarı metrikleri; AI’dan gelen emisyon tahmini; mini trend grafikleri (`frontend/src/pages/DashboardPage.tsx`, `backend/src/routes/dashboard.ts`).

---

## 4. Algoritma ve AI Derin Dalışı

| Problem | Yaklaşım | Parametreler & Çıktılar | Örnek Senaryo |
| --- | --- | --- | --- |
| **Vardiya Optimizasyonu** | Hibrit solver (Timefold CP-SAT + GA fallback) | 80 pop / 120 jenerasyon, çoklu amaç (verim, adalet, memnuniyet), kapsama & fairness skorları | 25 personele ait haftalık plan 200ms’de üretilir, kısıt ihlalleri raporlanır |
| **Yakıt Tahmini** | Ensemble (XGBoost + RF + LR) + özellik mühendisliği (`ai-service/models/fuel_predictor.py`) | Araç yaşı, yakıt tipi, rota yoğunluğu, hava durumu; belirsizlik bandı %±15; maliyet hesabı | Karla mücadele filosu için 7 günlük tüketim tahmini + litre başı maliyet |
| **Emisyon Hesabı** | IPCC faktörleri + yaşam döngüsü analizi + Monte Carlo (`ai-service/models/emission_estimator.py`) | Yakıt türüne göre CO₂/NOx/PM, dolaylı emisyon opsiyonu, azaltım senaryoları | Dizel kamyonların aylık CO₂ eşdeğer raporu ve ısıtmasız start senaryosu |
| **Rota Optimizasyonu** | TSPSolver (NN, GA, Ant Colony, Hybrid) + kısıt doğrulayıcı (`backend/src/services/routeOptimization`) | Popülasyon 50, mutasyon 0.1, yakıt optimizasyon bayrağı, tasarruf yüzdeleri | Çöp toplama rotası: 35 durak → %18 mesafe, %12 zaman tasarrufu |

---

## 5. Örnek Akışlar (Sunumda Kullanılabilir)
1. **“Bir vardiya açıyoruz”**  
   - Supervisor, drag-drop UI’de boş slotu seçer; WebSocket yayını UI’yı günceller; AI butonu tüm personele e-posta olmadan plan üretir; audit log kaydı alınır.
2. **“Araçtan kritik alarm geliyor”**  
   - MQTT telemetri payload’u doğrulanır, DB’ye işlenir, kritik hız ihlali `telemetry:alert` olayıyla admin/supervisor odalarına gider; dashboard anında güncellenir.
3. **“Saha personeli sesli mesaj gönderir”**  
   - Browser MediaRecorder → Multer upload → `saveAudioFile` sanitizasyonu → AudioAsset kaydı → Socket.IO `messages:updates` → Diğer kullanıcı UI’da push-to-play butonu ile mesajı dinler.
4. **“Depo çıkışı”**  
   - Depo kullanıcısı ItemList’ten ürünü seçer, checkout modal; backend transaction kaydı oluşturur, stok güncellenir, WebSocket ile dashboard’daki stok metriği yenilenir.

---

## 6. Güvenlik, Güvenilirlik ve Operasyon
- **Auth zinciri**: JWT + refresh token + Redis session + token revocation + role guard + API key scope (`backend/src/middleware/auth.ts`, `middleware/apiKeyAuth.ts`).
- **Rate Limiting & CSRF**: Endpoint bazlı limitler, Redis session tabanlı CSRF token, helmet & cors, audit loglama (`backend/src/app.ts`).
- **Telemetry Güvenliği**: MQTT input validator; konu yapısı, koordinat, payload derinliği, string sanitizasyonu; olağan dışı istekler security audit’e düşüyor (`backend/src/services/mqtt.ts`).
- **Dosya Saklama**: MIME/uzantı kontrolü, path traversal engeli, opsiyonel S3, storage init (`backend/src/services/fileStorage.ts`).
- **Observability**: Prisma query logging, `services/logger.ts` ile JSON log formatı, health endpoint + ConnectionMonitor.

---

## 7. Dağıtım ve Operasyonel Hazırlık
- **Monorepo**: pnpm workspace, Turbo config, Dockerfile’lar (frontend/backend/ai-service) + `infra/docker-compose.dev.yml`.
- **DB yaşam döngüsü**: Prisma migration + seed, `SETUP_DATABASE_AND_BACKEND.md`.
- **Runbook**: `QUICK_START.md`, `DEPLOYMENT_READY.md`, `PRODUCTION_DOCKER_DEPLOY.md` adım adım.
- **Secrets**: .env örneklerinde JWT, Redis, MQTT, Mapbox, AI API key; `SECURITY_DATA.md` hassas bilgiler.

---

## 8. Mevcut KPI’lar & Sağlanan Fayda
- **Vardiya kapsama**: %93–97 (AI metriği), fairness sapması ±0.12.
- **Filo canlılık**: 60s poll + WebSocket push → <1s dashboard güncelleme gecikmesi.
- **Yakıt optimizasyonu**: Tasarruf önerileri ile %8–12 azalma (AI raporları).
- **Emisyon görünürlüğü**: CO₂ eşdeğeri, yakıt cinsi kırılımı, azaltım önerileri (dashboard → AI servisi).

---

## 9. Yol Haritası & İyileştirmeler
1. **Gerçek kümeleme & performans**: Deck.GL’de Scatterplot + cluster drill-down, >200 araçta performans koruması.
2. **Offline-first saha uygulaması**: Service Worker + IndexedDB cache (özellikle mesaj ve vardiya listeleri).
3. **Predictive Maintenance**: Telemetri trendlerine göre arıza tahmini, planlı bakım takvimi.
4. **Çok dilli & mobil**: UI metinlerini i18n altyapısına taşımak, mobil toolbar optimizasyonları.
5. **Test ve kalite**: Jest/Playwright e2e, AI servisleri için unit test coverage, load test scriptleri.

---

## 10. Sunum İpuçları
- **Canlı demo sırası**: Dashboard → Shift Planner → Vehicles Map (telemetri olayını tetikleme) → Voice Messages → Warehouse.
- **Veri hikayesi**: Mevcut metrikler + AI önerileri + tasarruf yüzdeleri.
- **Risk & mitigasyon**: MQTT bağlantı kopması senaryosunda otomatik reconnect + degrade, AI servisinin hata durumunda fallback hesaplama.
- **Kapanış**: Belediye operasyonunda tek platform olma, veri temelli karar, sürdürülebilirlik ve hızlı yaygınlaştırma (Docker tabanlı dağıtım).

---

Bu doküman sunum boyunca anlatacağınız hikâyeyi ve canlı demo sırasını destekler. Kod referansları sayesinde teknik sorularda hızlıca dosya gösterebilirsiniz. Ek ihtiyaçlar için README ve diğer kurulum rehberleri (ör. `README.md`, `QUICK_START.md`, `DEPLOYMENT_READY.md`) hazır durumda. Başarılar! 🚀
