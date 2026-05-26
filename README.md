# Auctus Accounting

Open-source accounting software for small businesses. Supports invoicing, bills, bank reconciliation, GST/BAS reporting, and multi-currency — across web and mobile.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web | React 19, Vite, TypeScript |
| Mobile | Expo (React Native) |
| API | Node.js, TypeScript |
| Database | Supabase (PostgreSQL) |
| Shared Logic | `accounting-core` package |

## Project Structure

```
auctus-accounting/
├── apps/
│   ├── web/          # Vite + React web app
│   ├── mobile/       # Expo mobile app (iOS & Android)
│   └── api/          # Backend API
├── packages/
│   ├── accounting-core/   # Shared accounting domain logic
│   └── shared-types/      # Shared TypeScript types
├── supabase/         # Database migrations and config
└── tests/            # E2E tests (Playwright)
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Install

```bash
npm install
```

### Environment Variables

Copy the example env file and fill in your Supabase credentials:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local
```

### Run locally

```bash
# Web
npm run dev:web

# API
npm run dev:api

# Mobile
npm run dev:mobile
```

## Features

- **Invoicing & Bills** — create, send, and track invoices and bills
- **Bank Reconciliation** — match transactions to bank feeds
- **GST / BAS Reporting** — cash and accrual basis, GST-registered and non-registered businesses
- **Credit Notes** — partial allocation across multiple invoices
- **Transfers** — track movements between bank, cash, and credit card accounts
- **Multi-platform** — web and mobile (iOS & Android)

## Testing

```bash
# E2E tests
npm run e2e

# E2E tests with browser UI
npm run e2e:headed
```

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL v3)](LICENSE).

AGPL v3 is a strong copyleft license. Key conditions:

- **Use freely** — run, study, and modify the code for any purpose
- **Share modifications** — if you distribute a modified version, you must release the source under AGPL v3
- **Network use triggers copyleft** — if you run a modified version as a network service (e.g. SaaS), you must make the source code available to users. This is the key difference from GPL v3.

For commercial licensing that does not require source disclosure, contact the project maintainers.
