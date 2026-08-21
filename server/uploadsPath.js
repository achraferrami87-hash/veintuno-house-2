const fs = require('fs');
const path = require('path');

// In production this should point into a persistent volume (e.g. Railway
// volume mounted at /data) via the UPLOADS_DIR env var — otherwise uploaded
// images/videos are lost on every redeploy. Falls back to a local folder
// for development.
const uploadsPath = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');

fs.mkdirSync(uploadsPath, { recursive: true });

module.exports = uploadsPath;
