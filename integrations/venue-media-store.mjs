import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

let pool;
let initialized;
const allowedTypes = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/avif','avif']]);
function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!pool) pool = new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000});
  return pool;
}
async function ready() {
  if (!initialized) initialized=database().query(`CREATE TABLE IF NOT EXISTS venue_media (
    id UUID PRIMARY KEY, venue_id VARCHAR(90) NOT NULL,
    kind VARCHAR(12) NOT NULL CHECK(kind IN ('establishment','menu','logo')),
    title VARCHAR(160) NOT NULL DEFAULT '',
    content_type VARCHAR(30) NOT NULL,
    bytes BYTEA NOT NULL,
    source_url TEXT, license_note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE INDEX IF NOT EXISTS venue_media_venue_idx ON venue_media(venue_id,kind,created_at);`).catch(e=>{initialized=null;throw e});
  await initialized;
}
export async function listVenueMedia(venueId) {
  await ready();
  const {rows}=await database().query('SELECT id,kind,title,source_url,created_at FROM venue_media WHERE venue_id=$1 ORDER BY created_at DESC LIMIT 80',[venueId]);
  return rows.map(r=>({id:r.id,kind:r.kind,title:r.title,url:'/api/venue-media/'+r.id,sourceUrl:r.source_url,createdAt:r.created_at}));
}
export async function readVenueMedia(id) {
  await ready();
  const {rows}=await database().query('SELECT content_type,bytes FROM venue_media WHERE id=$1',[id]);
  return rows[0]||null;
}
export async function saveVenueMedia({venueId,kind,title,contentType,base64,sourceUrl,licenseNote}) {
  if(!/^[a-z0-9-]{1,90}$/.test(venueId)||!['establishment','menu','logo'].includes(kind))throw new Error('Invalid venue or media kind');
  if(!allowedTypes.has(contentType)||typeof base64!=='string'||base64.length>8_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error('Invalid image data');
  if(typeof licenseNote!=='string'||licenseNote.trim().length<8)throw new Error('A documented usage authorization is required');
  const bytes=Buffer.from(base64,'base64');
  if(!bytes.length||bytes.length>5_000_000)throw new Error('Image exceeds 5 MB');
  const signatures={'image/jpeg':bytes[0]===255&&bytes[1]===216,'image/png':bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),'image/webp':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','image/avif':bytes.toString('ascii',4,12).includes('ftypavif')};
  if(!signatures[contentType])throw new Error('Image content does not match MIME type');
  if(sourceUrl&&(!/^https:\/\//.test(sourceUrl)||sourceUrl.length>1000))throw new Error('Invalid source URL');
  await ready();
  const id=randomUUID();
  await database().query('INSERT INTO venue_media(id,venue_id,kind,title,content_type,bytes,source_url,license_note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,venueId,kind,String(title||'').slice(0,160),contentType,bytes,sourceUrl||null,licenseNote.trim().slice(0,500)]);
  return {id,url:'/api/venue-media/'+id};
}
