// Vercel serverless entry point. Files under /api become individual
// functions; this one just re-exports the exact same Express app used
// locally and on Railway (server/app.js) — no route/logic duplication.
module.exports = require('../server/app');
