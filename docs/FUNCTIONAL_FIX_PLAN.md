# Functional Remediation Plan

**Prepared:** November 12, 2025  
**Scope:** Backend API, Frontend UI, Real-time services (non-security)  
**Reference Analysis:** Task "Functionality gap review" completed prior to this document

---

## 🔍 Executive Summary
- Core user workflows (shift planner, vehicle tracking, messaging) are blocked by data-contract mismatches between backend responses and frontend expectations.
- Several UI affordances expose features that lack backend support (export, filtering, read receipts), leading to broken experiences.
- API responses are inconsistent (sometimes raw, sometimes `{ success, data }`), increasing coupling and duplicating transformation logic on the client.

**Goal:** Restore the three mission-critical experiences (shift scheduling, fleet monitoring, messaging) and align API contracts so future features can ship without ad-hoc fixes.

---

## ✅ Success Criteria
- Shift drag-and-drop planner renders assignments, supports slot moves, and persists updates without errors.
- Vehicle list shows correct online/idle/offline status immediately after load, and map markers remain in sync.
- Messaging view loads readable timestamps, plays voice notes from the latest API payload, and filters conversations by unread/urgent correctly.
- All touched endpoints return consistent response envelopes; frontend consumes new types without manual property guards.

---

## 🧭 Implementation Roadmap

### Phase 1 – Core Workflow Restorations (High Priority)
1. **Shift Planner Contract Fix**  
   - Add `slots` metadata (code, label) to `/api/shifts` response.  
   - Normalize planner payload to `{ shifts, employees, slots, period }` for future extension.  
   - Update frontend to use server-provided slots, compare dates with `dayKey` (ISO date), and encode droppable IDs as `${dayKey}__${slot.code}` to avoid hyphen collisions.  
   - Ensure PATCH/PUT payload sends `slot` enum (e.g., `MORNING`) and ISO `day`; backend should accept and validate.

2. **Vehicle Status Alignment**  
   - Extend backend mapper to include `lastLocation` + `lastTelemetry` (alias `currentLocation` if necessary).  
   - Update frontend state to derive status from `lastLocation` timestamps and display `fuelLevel` from telemetry immediately on load.  
   - Verify websocket handlers update both `lastLocation` and list state to keep markers/list synchronized.

3. **Messaging Payload Bridging**  
   - Backend: include `audioUrl` (signed or relative), `timestamp` (alias `createdAt`), and `readBy` array in `/api/messages` responses; propagate priority fields into conversation aggregation.  
   - Frontend: guard against missing URLs, display timestamps via `new Date(message.timestamp || message.createdAt)`, and hide read receipts until data exists.

### Phase 2 – API Contract Consistency (Medium Priority)
4. **Standardize Response Envelopes**  
   - Adopt `{ success: boolean, data, error? }` shape for all REST responses touched above.  
   - Update Axios client typings to reflect the envelope and remove ad-hoc `.data` accessors.  
   - Adjust React Query selectors to unpack the `data` payload only once in the api client helper.

5. **Expose Missing Metadata**  
   - Shift planner: include employee roster (id, name, department) and available slots in a single call to remove redundant `/api/employees` fetch.  
   - Messaging conversations: surface conversation-level `priority` (highest unread message priority) and `lastTimestamp` for accurate filtering.

### Phase 3 – UX Completion & Polish (Medium / Low Priority)
6. **Implement Export & Filtering Actions**  
   - Backend: add endpoints for `GET /api/shifts/export?week=YYYY-MM-DD` (CSV/Excel) and optional `GET /api/vehicles?status=online|idle|offline`.  
   - Frontend: wire “Dışa Aktar” and “Filtrele” buttons to actual flows (download file or open filter drawers).  

7. **Regression Coverage & Clean Up**  
   - Add integration tests (React Testing Library) for planner drag/drop and message voice playback fallback.  
   - Confirm websocket subscriptions are cleaned up (`websocketService.off(...)`) to prevent duplicate toasts.  
   - Validate Mapbox token presence at startup; display inline warning if missing.

---

## 📋 Work Breakdown (Composer Tasks)

| Task ID | Description | Components | Priority |
|---------|-------------|------------|----------|
| WF-01 | Update `/api/shifts` response to include slots + employees, normalize payload structure, adjust PATCH handler for ISO day & enum slot | `backend/src/routes/shifts.ts`, Prisma mapper | High |
| WF-02 | Refactor `ShiftsPage` drag/drop to use server slots, safe droppable IDs, and updated payload contract | `frontend/src/pages/ShiftsPage.tsx` | High |
| WF-03 | Extend vehicle API mapper with `lastLocation`/`lastTelemetry`; adjust frontend list & websocket handlers to consume them | Backend vehicles route, `frontend/src/pages/VehiclesPage.tsx`, `frontend/src/services/websocketService.ts` | High |
| WF-04 | Modify messaging routes to return `audioUrl`, `timestamp`, `readBy`, conversation `priority`; update UI rendering + filters | `backend/src/routes/messages.ts`, `frontend/src/pages/MessagesPage.tsx` | High |
| WF-05 | Standardize API envelopes and Axios client typings; ensure React Query consumers read new structure | `backend/src/routes/*`, `frontend/src/services/api.ts`, React Query hooks | Medium |
| WF-06 | Implement shift export endpoint and vehicle filtering; hook up corresponding UI controls | Backend + `frontend/src/pages/ShiftsPage.tsx`, `frontend/src/pages/VehiclesPage.tsx` | Medium |
| WF-07 | Add regression tests for planner/messaging, enforce websocket cleanup, and add Mapbox token guard | Frontend tests + `websocketService.ts` | Low |

> **Note:** Execute WF-01 through WF-04 in order; each step unblocks a user-facing workflow. Subsequent tasks can proceed in parallel once core functionality is restored.

---

## 🧪 Validation Checklist
- [ ] Dragging a shift to a new slot shows immediate UI update and persists after refresh.  
- [ ] Vehicle list displays correct statuses within 5 seconds of load; offline vehicles remain grey.  
- [ ] Voice messages play from the conversation view; timestamps show localized date & time.  
- [ ] “Acil” filter lists high-priority conversations.  
- [ ] All modified API responses include `{ success, data }`; frontend Axios calls still resolve without manual `.data.data` chaining.  
- [ ] Export button downloads the week’s schedule; vehicle filter changes list contents or opens filter UI.  
- [ ] New tests pass; no lingering websocket listeners (verified via React dev tools/logging).

---

## 📎 Notes for Composer
- Coordinate schema tweaks with frontend typing updates; TypeScript strict mode will surface any missed fields.  
- When generating `audioUrl`, consider using an existing file-serving endpoint (e.g., `/api/messages/:id/audio`); ensure relative URLs align with Vite proxy settings.  
- Keep the plan incremental: merge after completing WF-01/WF-02 (core planner fix) before tackling subsequent tasks to reduce PR risk.
