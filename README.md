# Bandarban Resort Hub

A responsive resort and hotel discovery platform with a customer app, admin workspace, hotel partner portal, and one shared backend. The development structure follows the Next.js, React, TypeScript, Tailwind 4, and Lucide conventions inspected in `../wide-Computers`. Dependencies were updated to patched versions rather than copying the reference's vulnerable lockfile unchanged.

## Start locally

Requires **Node.js 24+** and npm. SQLite is built into Node; no database server is needed for the local demo.

```sh
npm ci
npm run dev
```

| Application | Address | Purpose |
| --- | --- | --- |
| Customer app | http://localhost:3000 | Discover, compare, save, request a booking, manage trips |
| Admin workspace | http://localhost:3001 | Create hotels/resorts and hotel accounts, publish listings, review refunds |
| Hotel portal | http://localhost:3002 | Maintain assigned properties, rooms, room types, facilities, rates, inventory, photos, and booking requests |
| Shared backend | http://localhost:4000/api/health | Authentication, role checks, database, uploads, inventory, booking and refund calculations |

`npm run dev` starts all four processes. Ctrl+C stops the owned process groups. The frontend apps reload automatically; restart the backend after API source changes, or run its optional `dev:watch` script separately on systems with sufficient file watchers.

Demo accounts are seeded only in local demo mode, and only into an empty database:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@bandarban.demo | Bandarban123! |
| Hotel partner | owner@bandarban.demo | Bandarban123! |
| Traveler | traveler@bandarban.demo | Bandarban123! |

The portals use separate HttpOnly session cookies, so you can keep an admin, hotel, and customer session open at the same time. Data is persisted in `backend/.data/resort-hub.sqlite`; uploaded photos are stored in `backend/.data/uploads/`. These files are gitignored. Tests use a separate in-memory database and temporary upload directory.

## How data flows

```mermaid
flowchart LR
  A[Admin app :3001] <--> API[Shared Express API :4000]
  H[Hotel app :3002] <--> API
  C[Customer app :3000] <--> API
  API <--> DB[(SQLite locally / MySQL optionally)]
  API <--> U[Photo storage]
```

1. Admin adds a hotel or resort in **Resorts**. New properties start pending review.
2. Admin opens **Hotel accounts**, creates the management contact's email/password, and assigns the property. The password is shown once and stored only as a bcrypt hash. Assigning a property transfers access from its previous owner.
3. Hotel management signs into the separate hotel portal. Its API responses and mutations are restricted to assigned properties.
4. Hotel staff edit resort details, cover photos, property facilities, categories, and location. They add or edit room types, names, descriptions, photos, nightly prices, capacity, quantity, room facilities, and open/closed status.
5. Staff block specific quantities of rooms for date ranges in **Availability**. Checkout and block end dates are exclusive. Existing requests/reservations cannot be invalidated by a conflicting block or inventory reduction.
6. Admin publishes the property. The customer app reads published properties and enabled rooms from the backend. New room prices and facilities come from hotel-entered records. Search/category/budget/facility filters and comparison operate on those API results. Saved favorites are local to the browser.
7. A signed-in traveler selects a room and dates. Checkout retrieves date-specific availability from the API, and the backend checks it again in a transaction before creating the request.
8. The request appears in the correct hotel's **Booking requests** tab. Pending requests hold room inventory. The hotel accepts or declines; the traveler sees the updated status in **My trips**. Views refresh on window focus and at short intervals (15 seconds for management, 20 seconds for customers).
9. Declining releases inventory and records a full demo advance refund. A traveler cancelling before check-in receives 80% of the advance, with a 20% cancellation fee. Admin completes the simulated refund record.

## Implemented experience

- Reference-inspired responsive customer homepage with a floating header, original illustrative hillside-lodge hero, cream and sage colors, and a four-column desktop resort grid.
- Full-page resort details, side-by-side comparison with preference filters, checkout, and booking-request confirmation; layouts adapt for tablet and mobile.
- API-backed property discovery, search, filters, price sorting, three-property comparison, and browser-local wishlist.
- Actual hotel-created room information, photo uploads (JPEG/PNG/WebP, up to 5 MB), facilities, rates, and available room counts.
- Registration/login, booking requests, guest details, itemized costs, demo advance payment, trip status, and cancellations.
- Admin overview with data-derived metrics/activity, resort publishing, account creation/password reset, traveler directory, and payment/refund records.
- Hotel portal with property editing, room-type creation/editing, pricing/facilities/inventory controls, date-block calendar, and accept/decline decisions.
- Backend role and ownership checks, input validation, parameterized queries, password hashing, HttpOnly session cookies, mutation origin checks, login rate limiting, server-calculated pricing, transaction-protected inventory, and session revocation on password reset.

## Configuration

Copy `backend/.env.example` to `backend/.env` for optional backend settings; the server loads that file automatically. Each frontend can use `.env.local` with `NEXT_PUBLIC_API_URL` to change the API origin. Frontend configuration is embedded at build time.

For MySQL 8+, create an empty database and set:

```dotenv
DATABASE_URL=mysql://resorthub:password@127.0.0.1:3306/resorthub
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
```

The backend creates the schema and uses MySQL transactions/row locks. SQLite is the fully exercised local database; a running MySQL service was not available for integration testing in this session.

For non-demo operation, set `NODE_ENV=production`, `DEMO_MODE=false`, an appropriate `CORS_ORIGINS`, and a random `JWT_SECRET` of at least 32 characters. Use HTTPS so secure cookies work. Start the API with `npm run start --workspace=@bandarban/backend`. Local preview URLs and cross-app links currently target localhost and need deployment origins before hosting.

Create the first administrator in a clean non-demo database with environment variables `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`, then run:

```sh
npm run create-admin --workspace=@bandarban/backend
```

Do not put real secrets in tracked files or shell history. The bootstrap command refuses an existing email; it does not silently promote an account.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

The integration suite verifies account ownership and role restrictions, hotel room publication through the API, photo uploads, availability blocks, server-calculated prices, booking decisions, cancellation ownership, refund records, peak occupancy across sequential stays, concurrent overbooking prevention, invalid inputs/origins, and session revocation after password resets.

Each frontend builds a static export into its `out/` directory. After building, `npm start` serves all three exported apps on their normal ports and starts the Express API. The included static server handles the `output: export` builds; it does not use `next start`.

Browser visual QA could not be performed because the supplied browser access host was unavailable. Production builds, type checks, HTTP rendering, and API tests are the verification available in this environment.

## Deliberate limits before launch

The six seeded resorts, prices, ratings, reviews, and resort photographs are illustrative. The real Bandarban landscape photograph is by [Atik Chowdhury on Unsplash](https://unsplash.com/photos/green-trees-on-mountain-under-white-clouds-during-daytime-_vL6mbbHZkI). Other image sources and usage context are listed in [ASSETS.md](ASSETS.md).

Payments and refunds are simulated: no bKash/SSLCommerz connection, money movement, real resort reservation, or external notification is performed. Outside demo mode, new bookings are disabled until a real payment flow is integrated. Pending requests hold inventory until staff or the traveler acts; automated hold expiry is not yet implemented. Live support, guest review submission, payment-provider webhooks, email/SMS delivery, object storage, and production deployment remain future integrations.
