// Media storage — Supabase Storage, replacing Vercel Blob (see
// adminUpload.js). Server-only: the service_role key never leaves this
// file. Two public buckets mirror the two upload paths the app actually
// has — one for images (uploaded through this server), one for videos
// (uploaded directly from the browser via a signed URL, so large files
// never pass through a Vercel serverless function's body-size limit).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const IMAGE_BUCKET = 'images';
const VIDEO_BUCKET = 'videos';

let client = null;
function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans les variables d’environnement.');
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

async function uploadBuffer(bucket, key, buffer, contentType) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(bucket).upload(key, buffer, { contentType, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}

// For the browser-direct video upload: the client uploads straight to
// Supabase using this token (via the Supabase SDK's uploadToSignedUrl,
// which also sets the apikey header Supabase's gateway requires on every
// request — a raw PUT without it would be rejected).
async function createSignedUploadUrl(bucket, key) {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(key);
  if (error) throw error;
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
  return { token: data.token, path: data.path, publicUrl: pub.publicUrl };
}

async function removeByKey(bucket, key) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(bucket).remove([key]);
  if (error) throw error;
}

// A Supabase public object URL looks like:
//   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<key>
// Used by the migration script to re-derive bucket/key when needed, and
// available for a future "delete on replace" feature if ever added.
function parsePublicUrl(url) {
  const m = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url || '');
  if (!m) return null;
  return { bucket: m[1], key: decodeURIComponent(m[2]) };
}

module.exports = { getClient, uploadBuffer, createSignedUploadUrl, removeByKey, parsePublicUrl, IMAGE_BUCKET, VIDEO_BUCKET };
