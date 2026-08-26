const { PrismaClient } = require('@prisma/client');

// On a serverless platform (Vercel) each cold start would otherwise create a
// brand new PrismaClient — and therefore a new connection pool — which
// quickly exhausts a small Postgres plan's connection limit. Caching the
// client on `global` lets warm invocations (and dev's hot-reload) reuse the
// same instance instead of piling up connections.
const globalForPrisma = global;

// Cached unconditionally (not just in dev): on Vercel, "production" still
// means short-lived serverless invocations reusing a warm container, so the
// same reuse-across-cold-starts benefit applies there too. On a normal
// long-running process (Railway) this module simply loads once anyway.
const prisma = globalForPrisma.__prisma || new PrismaClient();
globalForPrisma.__prisma = prisma;

module.exports = prisma;
