// Local/Railway entry point: a normal long-running Express process.
// On Vercel, api/index.js imports server/app.js directly instead (a
// serverless platform calls the exported app per-request; it never runs
// this file or `app.listen`).
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VEINTUNO HOUSE server running at http://localhost:${PORT}`);
});
