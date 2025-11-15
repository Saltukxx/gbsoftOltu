# Task Assignment Feature Implementation Plan

## Objectives
- Allow higher-ranking users to assign actionable tasks to lower-ranking teammates.
- Enable assigned workers to update task status to “Done” and optionally leave a private completion note.
- Ensure completion notes are only visible to the assigner, the assignee, and the President role.
- Provide dashboards for Presidents (global visibility), assigning users (tasks they issued), and workers (tasks assigned to them).
- Deliver a production-ready, observable, and secure implementation compatible with existing backend/frontend stack.

## Roles & Hierarchy
- Extend `UserRole` enum to include `PRESIDENT` at the top of the hierarchy.
- Define role precedence (highest → lowest): `PRESIDENT` > `ADMIN` > `SUPERVISOR` > `OPERATOR` > `MESSENGER`.
- “Higher user” means any user with strictly higher precedence than the assignee.
- Only `PRESIDENT`, `ADMIN`, `SUPERVISOR` can assign tasks. (Adjust if business confirms other roles should assign.)
- Every role can mark tasks assigned to them as done.

## Functional Requirements
- **Task Creation**
  - Assigners select one worker (single assignee) and provide title, description, due date (optional), priority.
  - Validation ensures assigner has higher role precedence than assignee and assignee is active.
  - Task defaults to `OPEN` status; record timestamps for creation and updates.
- **Task Updates**
  - Assignee can mark task as `IN_PROGRESS`, `BLOCKED`, or `DONE`.
  - When marking `DONE`, assignee may add a completion note (optional). Note visibility restricted to assigner, assignee, President(s).
- **Visibility**
  - Presidents: view all tasks with filtering, sorting, and search.
  - Assigners: view tasks they created, grouped by status.
  - Assignees: view current and historical tasks assigned to them.
  - Authorization enforced across REST and WebSocket channels.
- **Notifications**
  - Optional real-time socket update to assigner when assignee changes status or leaves completion note.
  - Email/push hook left for future; log entries added to audit trail.
- **Retention**
  - Persist tasks indefinitely unless explicitly deleted by President (optional future enhancement).

## Data Model Changes (Prisma)
- **Enum** `TaskStatus`: `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`.
- **Enum** `TaskPriority`: `LOW`, `NORMAL`, `HIGH`, `CRITICAL`.
- **Model** `Task`:
  - `id` (uuid)
  - `title` (string 150 chars max)
  - `description` (string?)
  - `priority` (`TaskPriority`, default `NORMAL`)
  - `status` (`TaskStatus`, default `OPEN`)
  - `dueDate` (DateTime?)
  - `assignerId` (FK → `User`, set null on delete? probably restrict)
  - `assigneeId` (FK → `User`, set null on delete? probably cascade to soft delete)
  - `completedAt`, `createdAt`, `updatedAt`
  - `completionNote` (text?) — store encrypted if sensitive.
  - `completionNoteVisibility` implicit via query filters.
- Add indexes:
  - `@@index([assigneeId, status])`
  - `@@index([assignerId, status])`
  - `@@index([dueDate])`
- Optional `TaskActivity` model for history (status changes). Initially log via audit trail.
- Migration script ensures new enums and roles.

## Backend Workstream
1. **Role Precedence Utility**
   - Implement helper `getRoleRank(role: UserRole)` to compare hierarchy; reuse in middleware.
2. **Authorization Middleware**
   - New middleware `requireHigherRoleThan(targetUserId)` or reuse service to validate assigner > assignee.
3. **Routes**
   - `POST /api/tasks`: create task (assigner only).
   - `GET /api/tasks/assigned-by`: returns tasks created by current user.
   - `GET /api/tasks/assigned-to`: returns tasks assigned to current user.
   - `GET /api/tasks`: Presidents only (with filters).
   - `PATCH /api/tasks/:id/status`: assignee updates status (validate transitions).
   - `PATCH /api/tasks/:id/completion-note`: assignee optionally attaches note when marking done.
   - `GET /api/tasks/:id`: accessible to assigner, assignee, President.
4. **Services**
   - Task service layer handling creation, status transitions, note storage, and permission checks.
   - Ensure completion note is only returned to authorized roles; exclude in generic list responses unless requesting user qualifies.
5. **WebSocket Integration**
   - Broadcast events (`task:created`, `task:updated`, `task:completed`) to assigner, assignee, President channel.
   - Update `websocketService` to manage new event names.
6. **Validation & Sanitization**
   - Add express-validator rules for task payloads.
   - Leverage existing sanitization middleware for text fields (title, description, notes).
7. **Audit Logging**
   - Record task creation, status updates, note submissions in `audit_logs`.
8. **Error Handling**
   - Utilize `createAppError` for consistency; return meaningful HTTP status codes (403 unauthorized, 400 invalid transition, etc.).

## Frontend Workstream
1. **API Client Updates (`frontend/src/services/api.ts`)**
   - Add typed endpoints for tasks (create, list, update status, add note).
2. **State Management**
   - Leverage React Query with keys `['tasks', 'assigned-by']`, `['tasks', 'assigned-to']`, `['tasks', 'president']`.
   - Optimistic updates when toggling status; rollback on error.
3. **UI Components**
   - `TasksPage` with tabbed views:
     - Assigners see “Tasks I Created”.
     - Workers see “My Tasks”.
     - Presidents see global dashboard with filters (status, priority, due date, assigner, assignee).
   - Task creation modal (accessible to assigners).
   - Task detail drawer showing full description, history, completion note (if authorized).
4. **Status Update Controls**
   - Workers update status via dropdown or segmented buttons.
   - When selecting `DONE`, prompt for optional note (textarea, 500 chars limit).
5. **Real-time Updates**
   - Subscribe to `task:*` WebSocket events to invalidate caches and show toast notifications.
6. **Accessibility & UX**
   - Provide color-coded priority chips, due-date warnings, and status badges.
   - Show note visibility disclaimer when entering completion note.
7. **Internationalization**
   - Reuse existing localization strategy (if any); otherwise ensure strings centralized for future translation.

## Security & Privacy
- Ensure only allowed users can fetch tasks (assigner/assignee/President). Use route-level guards.
- Completion note stored as plain text initially; consider AES encryption if note contains sensitive data.
- Prevent privilege escalation by verifying role precedence on every assignment and update.
- Log unauthorized access attempts for monitoring.

## Observability & Operations
- Extend logger to include task operations with structured metadata (taskId, assignerId, assigneeId).
- Add metrics (e.g., count of open tasks, overdue tasks) via existing monitoring pipeline if available.
- Implement health endpoint or log for WebSocket events to verify delivery.
- Add feature flag `TASKS_ENABLED` to toggle feature in staging/production rollout.

## Testing Strategy
- **Unit Tests**
  - Role comparison utility.
  - Task service: creation validation, status transitions, note handling.
- **Integration Tests (Backend)**
  - API tests covering CRUD, access control, note visibility.
  - Negative tests (assigner not higher, unauthorized fetches).
- **Frontend Testing**
  - Component tests for task list rendering, status change flow, note modal.
  - Integration tests using MSW to mock API responses.
- **End-to-End (optional)**
  - Cypress/Playwright scenario: assigner creates task → worker marks done with note → assigner and President verify note visibility.

## Deployment Plan
- Apply Prisma migration adding `PRESIDENT` role, enums, and `Task` model.
- Regenerate Prisma client (`pnpm prisma generate`).
- Backend: deploy with new routes, env config, cron (if any), WebSocket updates.
- Frontend: build with new pages/components; ensure navigation includes Tasks entry based on role.
- Update documentation (`docs/API.md`, user guide) detailing new endpoints and UI workflows.
- Train support team on feature usage and escalation paths.

## Acceptance Criteria
- Assigner can create tasks for lower-ranked users; unauthorized attempts rejected.
- Assignees can view all active and historical tasks and update statuses.
- Completion note visible only to assigner, assignee, President.
- Presidents have global view with filtering and accurate status counts.
- Real-time notifications update relevant parties without page refresh.
- All automated tests pass; deployment checklist complete; No open critical bugs post-release.

