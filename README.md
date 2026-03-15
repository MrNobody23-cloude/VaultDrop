# VaultDrop — Flash Sale Platform

## The Problem
Inventory going negative. Race conditions at checkout. Phantom orders.

## Our Solution
A Redis Lua atomic gate that makes overselling mathematically impossible.

## Architecture
### Client Layer
- Frontend runtime panel: `frontend/index.html`
  - Live inventory pull + websocket updates
  - Countdown timer and lifecycle visualization
  - Checkout trigger with idempotency key
- CDN/Edge simulation: Nginx reverse proxy at `infra/nginx/nginx.conf`
  - Static frontend delivery
  - WebSocket upgrade forwarding

### API Gateway + Load Balancer
- Nginx upstream + per-IP connection controls: `infra/nginx/nginx.conf`
- API service: `backend/src/server.js`
- Rate limiter middleware (token bucket, 5/min/user): `backend/src/services/rateLimiter.js`
- Auth + session guard (JWT + one active checkout per user): `backend/src/services/auth.js`

### Atomic Inventory Gate
- Redis Lua gate script: `redis/inventory_gate.lua`
- Gate integration + seed/restore logic: `backend/src/services/inventoryGate.js`

### Queue + Worker + Locking
- BullMQ queue producer: `backend/src/services/queue.js`
- Worker consumer: `backend/src/worker.js`
- Distributed product lock with Redlock in worker: `backend/src/worker.js`

### Business Services
- Order write path with idempotency key and transactional DB write: `backend/src/worker.js`
- Payment intent pre-create at queue entry + capture at execution: `backend/src/services/payment.js`
- Audit event log (immutable append): `backend/src/services/audit.js`

### Data Layer
- Redis primary live inventory counter + lock/session/rate-limit keys
- PostgreSQL durable order records: schema at `backend/db/init.sql`

### Notification / Realtime
- Redis pub/sub fan-out channel: `backend/src/services/events.js`
- WebSocket broadcast server: `backend/src/services/websocket.js`

### Monitoring
- Prometheus metrics endpoint `/metrics`: `backend/src/lib/metrics.js`
- Prometheus scraper config: `infra/prometheus/prometheus.yml`

## How to Run
1. Start all services:

	```bash
	cd infra
	docker compose up --build
	```

2. Open frontend console:

	`http://localhost`

3. Validate health and metrics:

	- API health: `http://localhost/api/healthz`
	- API metrics: `http://localhost/metrics`
	- Prometheus UI: `http://localhost:9090`

4. Manual flow test:

	- Click **Issue JWT**
	- Click **BUY NOW** repeatedly
	- Observe queue + order completion events on websocket
	- Continue until `409 SOLD_OUT` appears cleanly

## Request Lifecycle Mapping

Happy path:
1. User clicks buy from frontend.
2. Nginx forwards to API; per-IP guard active.
3. JWT auth validates user.
4. Rate limiter allows or returns `429`.
5. Redis Lua gate decrements atomically or rejects.
6. Payment intent pre-created.
7. BullMQ enqueues checkout job.
8. Worker acquires Redlock and runs transactional order write.
9. Payment capture completes.
10. Audit event appended and websocket broadcast emits updates.

Reject path:
1. Gate returns insufficient inventory.
2. API returns `409 SOLD_OUT`.
3. No order or payment write occurs.
4. Rejection is audit-logged and broadcast.

## Local Dev (Without Docker)
1. Install backend dependencies:

	```bash
	cd backend
	npm install
	```

2. Copy environment template:

	- `backend/.env.example` -> `backend/.env`

3. Run API and worker in separate terminals:

	```bash
	npm run start
	npm run worker
	```

## Tech Stack
- Redis 7 + Lua (atomic gate)
- Node.js + Fastify
- BullMQ (queue)
- WebSocket (ws)
- PostgreSQL
- Stripe (real or mock mode)
- Prometheus