# ContactsSync — Cross-Account Contact Synchronization Web App

## Overview

A React + Node.js/Express web app backed by PostgreSQL that connects a user's Gmail, Outlook, and iCloud accounts via OAuth 2.0 (Google & Microsoft) and CardDAV (iCloud). Contacts are imported to a centralized store, where users can detect/merge duplicates and sync missing contacts bidirectionally across providers. A background job handles periodic delta sync using provider sync tokens. The app will be structured for eventual Azure deployment.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     React SPA (Frontend)                         │
│  Dashboard │ Contacts List │ Duplicates │ Sync Settings          │
└──────────────────────┬───────────────────────────────────────────┘
                       │ REST API (JSON)
┌──────────────────────▼───────────────────────────────────────────┐
│                 Node.js / Express (Backend)                       │
│  Auth Routes │ Contact Routes │ Sync Engine │ Duplicate Engine   │
│  ┌───────────┬──────────────┬───────────────┐                    │
│  │ Google    │ Microsoft    │ iCloud        │  ← Provider Adapters│
│  │ People API│ Graph API    │ CardDAV       │                     │
│  └───────────┴──────────────┴───────────────┘                    │
│  Background Scheduler (node-cron)                                │
└──────────────────────┬───────────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   PostgreSQL    │
              │  Users, Contacts│
              │  Provider Links │
              │  Sync State     │
              └─────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Backend | Node.js + Express (TypeScript) |
| Database | PostgreSQL |
| Auth (App) | JWT (jsonwebtoken + bcrypt) |
| Auth (Google) | OAuth 2.0 via `googleapis` |
| Auth (Microsoft) | OAuth 2.0 via `@azure/msal-node` + `@microsoft/microsoft-graph-client` |
| Auth (iCloud) | CardDAV with app-specific password via `tsdav` |
| Deployment Target | Azure (future) |

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | `gen_random_uuid()` |
| email | VARCHAR(320) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| name | VARCHAR(255) | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

### `connected_accounts`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | NOT NULL |
| provider | VARCHAR(20) | 'google' / 'outlook' / 'icloud' |
| provider_email | VARCHAR(320) | |
| access_token | TEXT | Encrypted (AES-256-GCM) |
| refresh_token | TEXT | Encrypted |
| token_expires_at | TIMESTAMPTZ | |
| carddav_password | TEXT | Encrypted, iCloud only |
| connected_at | TIMESTAMPTZ | DEFAULT NOW() |

### `contacts`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | NOT NULL |
| given_name | VARCHAR(255) | |
| family_name | VARCHAR(255) | |
| middle_name | VARCHAR(255) | |
| display_name | VARCHAR(500) | |
| prefix | VARCHAR(50) | |
| suffix | VARCHAR(50) | |
| nickname | VARCHAR(255) | |
| company | VARCHAR(255) | |
| job_title | VARCHAR(255) | |
| department | VARCHAR(255) | |
| birthday | DATE | |
| notes | TEXT | |
| photo_url | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | Soft delete |

### `contact_emails`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| contact_id | UUID (FK → contacts) | ON DELETE CASCADE |
| email | VARCHAR(320) | NOT NULL |
| type | VARCHAR(50) | 'work', 'home', 'other' |
| is_primary | BOOLEAN | DEFAULT FALSE |

### `contact_phones`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| contact_id | UUID (FK → contacts) | ON DELETE CASCADE |
| phone | VARCHAR(50) | NOT NULL |
| type | VARCHAR(50) | 'mobile', 'work', 'home', 'fax' |
| is_primary | BOOLEAN | DEFAULT FALSE |

### `contact_addresses`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| contact_id | UUID (FK → contacts) | ON DELETE CASCADE |
| type | VARCHAR(50) | 'work', 'home', 'other' |
| street | TEXT | |
| city | VARCHAR(255) | |
| region | VARCHAR(255) | State/province |
| postal_code | VARCHAR(20) | |
| country | VARCHAR(100) | |

### `contact_provider_links`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| contact_id | UUID (FK → contacts) | ON DELETE CASCADE |
| provider | VARCHAR(20) | 'google', 'outlook', 'icloud' |
| provider_id | VARCHAR(500) | resourceName / id / vCard URL |
| provider_etag | VARCHAR(500) | ETag/changeKey for conflict detection |
| last_synced_at | TIMESTAMPTZ | |
| raw_data | JSONB | Full provider-specific payload |
| | | UNIQUE(provider, provider_id) |

### `sync_state`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | |
| provider | VARCHAR(20) | |
| sync_token | TEXT | Google syncToken / MS deltaLink / CardDAV sync-token |
| last_full_sync | TIMESTAMPTZ | |
| last_sync | TIMESTAMPTZ | |
| | | UNIQUE(user_id, provider) |

---

## Provider Integration Details

### Google (People API)

- **Auth**: OAuth 2.0 Authorization Code flow → access token + refresh token
- **Scopes**: `https://www.googleapis.com/auth/contacts` (read + write)
- **SDK**: `googleapis` npm package → `google.people({ version: 'v1', auth })`
- **Key endpoints**:
  - List: `GET /v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,...`
  - Create: `POST /v1/people:createContact`
  - Update: `PATCH /v1/{resourceName}:updateContact`
  - Delete: `DELETE /v1/{resourceName}:deleteContact`
  - Batch operations available for create/update/delete
- **Delta sync**: Set `requestSyncToken=true` → receive `nextSyncToken` → use on subsequent calls. Token expires after **7 days**.
- **Rate limits**: Quota-based (~90 read/min, ~60 write/min per user). Handle 429 with retry.

### Microsoft (Graph API)

- **Auth**: OAuth 2.0 via Microsoft Identity Platform (Entra ID)
- **Scopes**: `Contacts.ReadWrite` + `offline_access` (delegated)
- **SDK**: `@azure/msal-node` for auth, `@microsoft/microsoft-graph-client` for API calls
- **Key endpoints**:
  - List: `GET /me/contacts`
  - Create: `POST /me/contacts`
  - Update: `PATCH /me/contacts/{id}`
  - Delete: `DELETE /me/contacts/{id}`
  - Delta: `GET /me/contacts/delta`
- **Delta sync**: `/me/contacts/delta` returns `@odata.deltaLink` → use for incremental sync. `410 Gone` → full resync.
- **Rate limits**: 10,000 requests per 10 min per app+mailbox. Handle 429 with `Retry-After`.

### iCloud (CardDAV)

- **Auth**: HTTP Basic Auth (Apple ID email + app-specific password). **No OAuth available.**
- **Server**: `https://contacts.icloud.com`
- **SDK**: `tsdav` npm package for CardDAV operations, `vcard4`/`vcf` for vCard parsing
- **Operations**:
  - Discovery: `PROPFIND` on principal URL
  - List: `REPORT` with `addressbook-multiget`
  - Create: `PUT` vCard to address book collection
  - Update: `PUT` modified vCard (use `If-Match` with ETag)
  - Delete: `DELETE` on vCard resource URL
- **Delta sync**: `sync-collection` REPORT (RFC 6578) with stored sync-token
- **Limitations**:
  - No OAuth — users must generate app-specific password at appleid.apple.com
  - No push notifications — must poll periodically
  - Undocumented rate limits
  - vCard format (3.0) can be inconsistent

---

## Field Mapping (Normalized Contact ↔ Providers)

| Normalized Field | Google People API | Microsoft Graph | iCloud (vCard) |
|---|---|---|---|
| given_name | `names[].givenName` | `givenName` | `N` component 1 |
| family_name | `names[].familyName` | `surname` | `N` component 0 |
| display_name | `names[].displayName` | `displayName` | `FN` |
| middle_name | `names[].middleName` | `middleName` | `N` component 2 |
| prefix | `names[].honorificPrefix` | `title` | `N` component 3 |
| suffix | `names[].honorificSuffix` | `generation` | `N` component 4 |
| nickname | `nicknames[].value` | `nickName` | `NICKNAME` |
| email | `emailAddresses[].value` | `emailAddresses[].address` | `EMAIL` |
| phone | `phoneNumbers[].value` | `businessPhones[]`, `homePhones[]`, `mobilePhone` | `TEL` |
| address | `addresses[]` | `businessAddress`, `homeAddress`, etc. | `ADR` |
| company | `organizations[].name` | `companyName` | `ORG` |
| job_title | `organizations[].title` | `jobTitle` | `TITLE` |
| department | `organizations[].department` | `department` | `ORG` component |
| birthday | `birthdays[].date` | `birthday` | `BDAY` |
| notes | `biographies[].value` | `personalNotes` | `NOTE` |
| photo | `photos[].url` | `photo` | `PHOTO` |

---

## Implementation Phases

### Phase 1: Project Scaffolding & Database

1. **Initialize monorepo structure**:
   - `/server` — Express backend (TypeScript)
   - `/client` — React frontend (TypeScript, Vite)
   - Root `package.json` with workspaces and shared scripts

2. **Set up Express server** in `/server`:
   - TypeScript config, ESLint, Prettier
   - Dependencies: `express`, `cors`, `helmet`, `dotenv`, `pg`, `jsonwebtoken`, `bcrypt`, `cookie-parser`
   - Folder structure: `src/routes/`, `src/controllers/`, `src/services/`, `src/providers/`, `src/models/`, `src/middleware/`, `src/jobs/`, `src/utils/`

3. **Set up PostgreSQL schema** with `node-pg-migrate`:
   - All tables defined in the Database Schema section above
   - Migration files for reproducible setup

4. **Set up React app** in `/client`:
   - Vite + React + TypeScript
   - Dependencies: `react-router-dom`, `axios`, `@tanstack/react-query`, UI library (shadcn/ui or Ant Design)
   - Pages: Login, Register, Dashboard, Contacts, Duplicates, Settings/Accounts

---

### Phase 2: Authentication & Account Connection

5. **App authentication (JWT)**:
   - `POST /api/auth/register` — create user account
   - `POST /api/auth/login` — return JWT token
   - Auth middleware to protect `/api/*` routes

6. **Google OAuth flow**:
   - Register app in Google Cloud Console, enable People API
   - `GET /api/connect/google` → redirect to Google consent screen
   - `GET /api/connect/google/callback` → exchange code for tokens, store encrypted in DB

7. **Microsoft OAuth flow**:
   - Register app in Azure Portal → App Registrations
   - `GET /api/connect/outlook` → redirect to Microsoft login
   - `GET /api/connect/outlook/callback` → exchange code, store tokens

8. **iCloud connection (CardDAV)**:
   - `POST /api/connect/icloud` → user submits Apple ID + app-specific password
   - Backend validates via `PROPFIND` on `https://contacts.icloud.com`
   - Store encrypted credentials in DB
   - Frontend shows instructions for generating app-specific password

9. **Token refresh middleware**:
   - Auto-refresh Google/Outlook tokens before expiry
   - iCloud: no refresh needed (password-based)

---

### Phase 3: Contact Import & Provider Adapters

10. **Provider adapter interface** (`src/providers/`):
    - `IContactProvider` with methods: `fetchAllContacts()`, `fetchDeltaContacts(syncToken)`, `createContact()`, `updateContact()`, `deleteContact()`
    - Each adapter returns/accepts a `NormalizedContact` type

11. **Google adapter** (`src/providers/google.ts`):
    - Use `googleapis` People API → paginate with `nextPageToken`
    - Map Google fields → `NormalizedContact`
    - Support `requestSyncToken` for delta sync

12. **Outlook adapter** (`src/providers/outlook.ts`):
    - Use `@microsoft/microsoft-graph-client` → paginate with `@odata.nextLink`
    - Map Outlook fields → `NormalizedContact`
    - Support delta queries

13. **iCloud adapter** (`src/providers/icloud.ts`):
    - Use `tsdav` for CardDAV → parse vCards
    - Map vCard fields → `NormalizedContact`
    - Support `sync-collection` for delta sync

14. **Import service** (`src/services/importService.ts`):
    - Fetch contacts from connected provider
    - Upsert into local DB (check `contact_provider_links` for existing entries)
    - Store sync token in `sync_state`
    - API: `POST /api/sync/import/:provider`

---

### Phase 4: Duplicate Detection & Merge

15. **Duplicate detection engine** (`src/services/duplicateService.ts`):
    - **Pass 1 (High confidence)**: Exact match on normalized email (case-insensitive)
    - **Pass 2 (High confidence)**: Exact match on normalized phone (E.164 via `libphonenumber-js`)
    - **Pass 3 (Medium confidence)**: Fuzzy match on name using Jaro-Winkler (threshold ≥ 0.85) via `natural` npm package
    - **Composite scoring**: email match (40pts) + phone match (30pts) + name similarity (20pts) + same company (10pts) = score out of 100
    - API: `GET /api/contacts/duplicates` → returns grouped duplicate sets with confidence scores

16. **Merge service** (`src/services/mergeService.ts`):
    - `POST /api/contacts/merge` → `{ primaryContactId, secondaryContactIds[], fieldOverrides? }`
    - Keep primary, merge missing fields from secondaries
    - Reassign all `contact_provider_links` to primary
    - Soft-delete secondaries
    - Queue outbound sync to update merged contact on all linked providers

17. **Merge UI**:
    - Duplicate groups as expandable cards
    - Side-by-side field comparison
    - User selects which fields to keep
    - "Merge" button triggers API

---

### Phase 5: Sync Missing Contacts & Bidirectional Sync

18. **Sync analysis** (`src/services/syncAnalysisService.ts`):
    - Check `contact_provider_links` per contact to identify missing providers
    - API: `GET /api/sync/analysis` → breakdown of contacts per provider
    - API: `GET /api/sync/missing/:provider` → contacts not linked to this provider

19. **Outbound sync** (`src/services/outboundSyncService.ts`):
    - `POST /api/sync/push/:provider` → push missing contacts to provider
    - Use adapter's `createContact()`, create `contact_provider_links` on success
    - Handle rate limiting (429 + exponential backoff)
    - Support selective sync (user picks which contacts)

20. **Inbound delta sync** (`src/services/inboundSyncService.ts`):
    - Use stored `sync_token` from `sync_state`
    - Call adapter's `fetchDeltaContacts(syncToken)`
    - Process: new → insert, updated → update, deleted → soft-delete
    - Update `sync_token` and `last_sync`
    - Token expired (410) → trigger full resync

21. **Background sync scheduler** (`src/jobs/syncScheduler.ts`):
    - `node-cron` for periodic sync jobs
    - Google & Outlook: every 10 minutes (delta)
    - iCloud: every 15 minutes (sync-collection)
    - Simple in-memory job queue (upgrade to `bull` + Redis for production)
    - Log sync results and errors

---

### Phase 6: Frontend UI

22. **Dashboard page**:
    - Connected accounts with connect/disconnect buttons
    - Total contacts per provider
    - Last sync timestamp per provider
    - Quick stats: duplicates found, contacts needing sync

23. **Contacts page**:
    - Searchable, sortable, paginated contact list
    - Filter by provider (icons showing linked providers)
    - Contact detail view/edit modal
    - Bulk actions: select multiple → sync to provider, delete

24. **Duplicates page**:
    - Duplicate groups with confidence scores
    - Expand → side-by-side field comparison
    - Merge and "Ignore" (dismiss false positives) actions

25. **Sync page**:
    - Visual matrix: contacts × providers (sync status)
    - "Sync missing to ___" buttons per provider
    - Sync history/log

26. **Settings/Accounts page**:
    - Manage connected accounts
    - Sync frequency settings
    - iCloud instructions + app-specific password input

---

### Phase 7: Security & Error Handling

27. **Encryption at rest**:
    - AES-256-GCM (Node.js `crypto` module) for all tokens and credentials
    - Encryption key from environment variable

28. **Error handling**:
    - Global Express error handler middleware
    - Token expired → prompt re-authentication
    - Rate limited → retry with backoff
    - Network errors → queue for retry
    - Frontend: toast notifications for sync status

29. **Input validation** with `zod` on all API endpoints

30. **Security hardening**: CORS, Helmet, rate limiting on Express server

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `googleapis` | Google People API SDK |
| `@azure/msal-node` | Microsoft OAuth |
| `@microsoft/microsoft-graph-client` | Microsoft Graph API |
| `tsdav` | CardDAV client (iCloud) |
| `vcard4` / `vcf` | vCard parsing/generation |
| `natural` | Jaro-Winkler fuzzy matching |
| `libphonenumber-js` | Phone number normalization |
| `node-cron` | Background job scheduling |
| `pg` + `node-pg-migrate` | PostgreSQL client + migrations |
| `jsonwebtoken` + `bcrypt` | App auth |
| `zod` | Request validation |
| `@tanstack/react-query` | Frontend data fetching |
| `react-router-dom` | Frontend routing |
| `axios` | HTTP client (frontend) |

---

## Sync Strategy

| Scenario | Approach |
|---|---|
| First-time import | Full sync → fetch all contacts from provider |
| Regular sync | Delta sync using provider sync tokens (every 10-15 min) |
| Token expired | Fall back to full resync |
| Conflict resolution | Compare ETags before writing; last-write-wins or present to user |
| Sync direction | Inbound first (pull changes), then outbound (push changes) |
| Error recovery | Queue failed operations, retry with exponential backoff |

---

## Verification & Testing

- **Unit tests**: Jest for provider adapters (mock API responses), duplicate detection, merge logic
- **Integration tests**: OAuth callback flows, full import cycle with test accounts
- **Manual testing**: Connect real Gmail, Outlook, and iCloud test accounts; verify contacts appear; test duplicates on intentional duplicates; push contacts cross-provider
- **Dev command**: `npm run dev` starts both client (Vite) and server (ts-node-dev) via `concurrently`

---

## Key Decisions

| Decision | Rationale |
|---|---|
| Monorepo with workspaces | Simpler dev, shared TypeScript types |
| TypeScript everywhere | Type safety across provider adapters and normalized schema |
| JWT auth (not sessions) | Cleaner API-first architecture |
| Soft-delete contacts | Enables undo and audit trail |
| JSONB `raw_data` in provider links | Preserves provider-specific fields for round-trip fidelity |
| Delta sync as default | Saves API quota; full sync only on first import and token expiry |
| Composite duplicate scoring | Reduces false positives while catching fuzzy matches |
| `node-cron` for MVP scheduler | Avoids Redis dependency; upgrade to `bull` + Redis for production |
| iCloud via CardDAV | Only viable approach — Apple has no OAuth API for contacts |
