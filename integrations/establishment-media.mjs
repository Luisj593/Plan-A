/**
 * SD Social — establishment media discovery.
 * Node 20+; no external dependencies. Keep API keys server-side.
 * Photos from Google Places are references for display only; do not persist/rehost.
 */
import { createHash, createHmac } from 'node:crypto';

const env = process.env;
const json = async (url, options = {}) => {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Provider HTTP ${res.status}: ${body.error?.message || 'request failed'}`);
  return body;
};
const clean = (value) => String(value ?? '').trim().slice(0, 180);
const isHttps = (value) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

export function integrationStatus() {
  return {
    googlePlaces: Boolean(env.GOOGLE_PLACES_API_KEY),
    googleSearch: Boolean(env.GOOGLE_SEARCH_API_KEY && env.GOOGLE_SEARCH_ENGINE_ID),
    cloudinary: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
  };
}

export async function findPlace(name, city = 'Santo Domingo, República Dominicana') {
  if (!env.GOOGLE_PLACES_API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');
  const result = await json('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.photos.name,places.photos.authorAttributions'
    },
    body: JSON.stringify({ textQuery: `${clean(name)}, ${clean(city)}`, pageSize: 5 })
  });
  return (result.places ?? []).map(place => ({
    provider: 'google_places',
    id: place.id,
    name: place.displayName?.text,
    address: place.formattedAddress,
    website: place.websiteUri,
    photos: (place.photos ?? []).map(photo => ({
      photoName: photo.name,
      attribution: photo.authorAttributions ?? [],
      displayEndpoint: `/api/establishment-media/places-photo?name=${encodeURIComponent(photo.name)}`,
      storageAllowed: false
    }))
  }));
}

export async function searchLogoCandidates(name, city = 'Santo Domingo') {
  if (!env.GOOGLE_SEARCH_API_KEY || !env.GOOGLE_SEARCH_ENGINE_ID)
    throw new Error('Google image search credentials not configured');
  const params = new URLSearchParams({
    key: env.GOOGLE_SEARCH_API_KEY, cx: env.GOOGLE_SEARCH_ENGINE_ID,
    q: `${clean(name)} ${clean(city)} logo oficial`, searchType: 'image', num: '8', safe: 'active'
  });
  const data = await json(`https://www.googleapis.com/customsearch/v1?${params}`);
  return (data.items ?? []).filter(item => isHttps(item.link)).map(item => ({
    title: item.title, url: item.link, sourcePage: item.image?.contextLink,
    provider: 'google_search', approved: false,
    notice: 'Verify identity, license and reuse permission before publishing or uploading.'
  }));
}

export async function discoverEstablishmentMedia(name, city) {
  const [places, logos] = await Promise.allSettled([findPlace(name, city), searchLogoCandidates(name, city)]);
  return {
    query: { name: clean(name), city: clean(city) },
    places: places.status === 'fulfilled' ? places.value : [],
    logoCandidates: logos.status === 'fulfilled' ? logos.value : [],
    errors: [places, logos].filter(x => x.status === 'rejected').map(x => x.reason.message),
    requiresHumanApproval: true
  };
}

export async function resolvePlacesPhoto(photoName) {
  if (!env.GOOGLE_PLACES_API_KEY) throw new Error('Google Places not configured');
  if (!/^places\\/[A-Za-z0-9_-]+\\/photos\\/[A-Za-z0-9_-]+$/.test(photoName))
    throw new Error('Invalid Google Places photo name');
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1000&skipHttpRedirect=true`;
  const data = await json(url, { headers: { 'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY } });
  return { displayUrl: data.photoUri, cachePolicy: 'Follow Google Places terms; do not persist media URLs long-term' };
}

/** Upload only files whose owner has expressly authorized storage and reuse. */
export async function uploadAuthorizedImage({ bytes, filename, mimeType, authorized }) {
  if (authorized !== true) throw new Error('Media reuse authorization required');
  if (!integrationStatus().cloudinary) throw new Error('Cloudinary not configured');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('Unsupported image format');
  if (!(bytes instanceof Uint8Array) || bytes.length > 8 * 1024 * 1024) throw new Error('Invalid image size');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'sd-social/establishments';
  const signature = createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), clean(filename) || 'establishment.jpg');
  form.append('api_key', env.CLOUDINARY_API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);
  const result = await json(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`, { method: 'POST', body: form });
  return { publicId: result.public_id, url: result.secure_url, width: result.width, height: result.height };
}
