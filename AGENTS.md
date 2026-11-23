# Bandarban Resort Hub

This workspace follows the Next.js, React, TypeScript, Tailwind 4, and Lucide conventions inspected in ../wide-Computers.

## Application boundaries

- clientend: customer discovery, comparison, wishlist, booking requests, and trips (port 3000).
- adminend: platform administration, resort creation, hotel credentials, verification, and refunds (port 3001).
- hotelend: hotel management of assigned resorts, rooms, rates, facilities, availability, and requests (port 3002).
- backend: shared Express API, authentication, authorization, persistence, inventory, pricing, and refunds (port 4000).
- shared: reusable management UI and seed fixtures.

All live application data must pass through the backend. Never use frontend-only state as authoritative inventory, pricing, access control, or booking status. Only admins create hotel accounts. Public registration always creates a tourist. Hotel managers can access only assigned resorts; enforce this on every management API action.

Use SQLite for local development and the MySQL adapter for a configured MySQL database. Preserve booking price snapshots. Compute availability using peak overlap and exclusive check-out dates. Confirmations, date blocks, inventory reductions, and cancellations must respect existing reservations. Passwords are hashed; sessions use HttpOnly cookies and are invalidated on admin password reset.

Read the relevant guides in node_modules/next/dist/docs before changing framework conventions. Each frontend also has Next.js-generated AGENTS.md instructions.

## Checks

Run npm test, npm run typecheck, and npm run build from this root. The integration tests use an in-memory database and cover admin/hotel/customer workflows. Do not claim browser visual QA if the browser host is unavailable.

Demo listings and payments are illustrative. Keep the demo notice visible. Live payment collection is intentionally disabled outside local demo mode until a real gateway is implemented.
