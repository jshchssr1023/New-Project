# Chronos Scheduler

**AITX Rail Car Service Scheduler** - A production-grade fleet management and service planning platform for rail car qualification, maintenance scheduling, and S&OP (Sales & Operations Planning).

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748.svg)](https://www.prisma.io/)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Security](#security)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## Overview

Chronos Scheduler is a comprehensive rail car fleet management system designed for:

- **Fleet Owners**: Track qualification dates, maintenance schedules, and shop assignments
- **Planning Teams**: Create and manage service plans, scenarios, and capacity allocations
- **Shop Networks**: Manage 3rd party shop relationships and take-or-pay commitments
- **Operations**: Real-time visibility into car status, shop performance, and KPIs

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, React Query |
| **Backend** | Node.js, Express 4, TypeScript, Prisma ORM |
| **Database** | SQLite (dev) / PostgreSQL (prod) |
| **Real-time** | Socket.io for live collaboration |
| **Authentication** | JWT with httpOnly cookies |

---

## Features

### Core Modules

| Module | Description |
|--------|-------------|
| **Fleet Management** | Master car database with 300+ fields, qualification tracking, shopping status |
| **Shop Management** | Shop master data, capacity management, network hierarchies |
| **Service Plan Builder** | Customer-specific service plans with option comparison |
| **S&OP Planning** | Monthly capacity commitments, network allocations, variance tracking |
| **Qualification Engine** | Lease contract tracking, qualification event scheduling |
| **Analytics** | Dashboard KPIs, shop performance metrics, custom reports |

### Key Capabilities

- **Multi-tenant Architecture** - Company-based data isolation
- **Real-time Collaboration** - Live presence indicators, instant updates
- **Role-based Access Control** - Admin, Planner, Viewer roles
- **Audit Logging** - Complete change tracking for compliance
- **CSV Import/Export** - Intelligent field mapping with 1200+ synonyms
- **PDF Generation** - Customer schedules, shop work orders
- **Scheduled Reports** - Automated email delivery
- **API Keys** - Third-party integration support

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Pages   │ │Components│ │ Contexts │ │   React Query    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP/WebSocket
┌─────────────────────────────┴───────────────────────────────────┐
│                        Backend (Express)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Routes  │ │Middleware│ │ Services │ │   Background     │   │
│  │  (29)    │ │  (Auth,  │ │  (44+)   │ │     Jobs         │   │
│  │          │ │   CORS)  │ │          │ │                  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Prisma ORM
┌─────────────────────────────┴───────────────────────────────────┐
│                     Database (42 Tables)                         │
│  Car, Shop, Plan, Scenario, MasterPlan, ServicePlan, etc.       │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
chronos-scheduler/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema (42 tables)
│   │   └── migrations/        # Version history
│   └── src/
│       ├── middleware/        # Auth, CORS, rate limiting
│       ├── routes/            # 29 API endpoint files
│       ├── services/          # 44+ business logic services
│       ├── schemas/           # Zod validation schemas
│       ├── jobs/              # Background jobs
│       └── utils/             # Logger, errors, helpers
├── frontend/
│   └── src/
│       ├── components/        # Reusable UI components
│       ├── contexts/          # React Context providers
│       ├── hooks/             # Custom React hooks
│       ├── pages/             # 25 page components
│       └── services/          # API clients
├── docs/                      # Architecture documentation
└── package.json               # Workspace configuration
```

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **npm** 9+ or **yarn** 1.22+
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/chronos-scheduler.git
cd chronos-scheduler

# Install dependencies
npm install

# Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env with your settings (see Configuration)

# Initialize database
npm run db:setup

# Start development servers
npm run dev
```

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | React application |
| Backend API | http://localhost:4000 | Express REST API |
| Prisma Studio | http://localhost:5555 | Database GUI (run `npm run db:studio`) |

---

## Configuration

### Environment Variables

Create `backend/.env` from the example file:

```bash
# Required
DATABASE_URL=file:./dev.db
JWT_SECRET=your-secure-secret-minimum-32-characters
ALLOWED_ORIGINS=http://localhost:3000

# Optional
PORT=4000
LOG_LEVEL=info

# Email (for scheduled reports)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
SMTP_FROM=noreply@example.com
```

### Security Requirements

| Setting | Requirement |
|---------|-------------|
| `JWT_SECRET` | Minimum 32 characters, use `openssl rand -base64 32` |
| `ALLOWED_ORIGINS` | Explicit whitelist, no wildcards in production |
| HTTPS | Required in production for secure cookies |

---

## API Reference

### Authentication

```bash
# Login
POST /api/auth/login
Content-Type: application/json
{"email": "user@example.com", "password": "password"}

# Response: Sets httpOnly cookie, returns user object
```

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cars` | List cars with filtering |
| `POST` | `/api/cars` | Create car |
| `GET` | `/api/shops` | List shops |
| `GET` | `/api/plans` | List plans |
| `POST` | `/api/plans` | Create plan |
| `POST` | `/api/plans/:id/assignments` | Add assignment |
| `GET` | `/api/analytics` | Dashboard analytics |
| `GET` | `/api/service-plans` | List service plans |

### API Keys (Third-party Integration)

```bash
# Authenticate with API key
GET /api/v1/cars
X-API-Key: chr_live_xxxxxxxxxxxx
```

See full API documentation at `/api/docs` (when running).

---

## Security

### Authentication & Authorization

- **JWT Tokens**: 1-hour expiration with refresh capability
- **httpOnly Cookies**: Prevents XSS token theft
- **Role-based Access**: Admin, Planner, Viewer permissions
- **Company Isolation**: Multi-tenant data separation

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 requests | 1 minute |
| `/api/*` (authenticated) | 100 requests | 1 minute |
| `/api/v1/*` (API key) | Per-key limit | 1 minute |

### Security Headers

- HSTS (Strict Transport Security)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Content Security Policy

### Audit Logging

All create, update, and delete operations are logged with:
- User ID and email
- Timestamp
- IP address and user agent
- Before/after values (sensitive fields redacted)

---

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start frontend + backend
npm run dev:frontend     # Frontend only (port 3000)
npm run dev:backend      # Backend only (port 4000)

# Database
npm run db:setup         # Initialize database
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema changes
npm run db:seed          # Seed sample data
npm run db:studio        # Open Prisma Studio

# Build
npm run build            # Build for production

# Testing
npm run test             # Run tests
npm run test:coverage    # Coverage report
```

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured for React + Node
- **Prettier**: Auto-formatting
- **Commit Messages**: Conventional commits (feat, fix, docs, etc.)

### Adding a New Feature

1. Create service in `backend/src/services/`
2. Add routes in `backend/src/routes/`
3. Add Zod validation schema if needed
4. Create React components in `frontend/src/components/`
5. Add page in `frontend/src/pages/`
6. Update routes in `frontend/src/App.tsx`

---

## Testing

### Backend Tests

```bash
cd backend
npm run test              # Run once
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

### Frontend Tests

```bash
cd frontend
npm run test              # Vitest
npm run test:coverage     # Coverage report
```

### Test Structure

```
backend/src/__tests__/
├── middleware/
│   └── auth.test.ts
├── services/
│   └── shoppingStatusService.test.ts
└── setup.ts

frontend/src/__tests__/
└── setup.ts
```

---

## Deployment

### Production Build

```bash
# Build both frontend and backend
npm run build

# Start production server
npm run start
```

### Environment Setup

1. Set `NODE_ENV=production`
2. Configure `JWT_SECRET` with secure random value
3. Set `ALLOWED_ORIGINS` to production domain(s)
4. Enable HTTPS (required for secure cookies)
5. Configure database (PostgreSQL recommended)

### Docker (Optional)

```dockerfile
# Example Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["npm", "start"]
```

### Health Check

```bash
GET /api/health
# Returns: {"status": "healthy", "timestamp": "..."}
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [DATABASE_INDEX.md](./DATABASE_INDEX.md) | Complete schema reference (42 tables) |
| [CODE_REVIEW_AUDIT.md](./CODE_REVIEW_AUDIT.md) | Security audit and fixes |
| [docs/CHRONOS_SOP_PLANNING_ENGINE.md](./docs/CHRONOS_SOP_PLANNING_ENGINE.md) | S&OP module documentation |
| [docs/DATABASE_DIAGRAMS.md](./docs/DATABASE_DIAGRAMS.md) | Entity relationship diagrams |
| [docs/DATA_INTEGRITY_SSOT_RESCUE_PLAN.md](./docs/DATA_INTEGRITY_SSOT_RESCUE_PLAN.md) | Data consistency strategies |

---

## Recent Security Updates

The following security improvements were implemented (see `CODE_REVIEW_AUDIT.md` for details):

### Critical Fixes
- Rate limiting on login endpoint (prevents brute force)
- CORS configuration hardened (rejects requests without Origin)
- JWT removed from response body (httpOnly cookie only)
- Transaction semantics fixed (prevents data corruption)

### High Priority Fixes
- Bcrypt rounds increased to 12
- API key permissions no longer leaked in errors
- Frontend token storage moved from localStorage to cookies
- Company authorization added to all data operations

### Performance Improvements
- Database indexes added for common query patterns
- Console.log replaced with centralized logger
- Connection pooling configured

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

```
feat: add new feature
fix: bug fix
docs: documentation only
style: formatting, no code change
refactor: code restructuring
test: adding tests
chore: maintenance tasks
```

---

## License

Proprietary - AITX Corporation. All rights reserved.

---

## Support

For issues and feature requests, please use the GitHub issue tracker.

**Maintainers**: AITX Chronos Team
