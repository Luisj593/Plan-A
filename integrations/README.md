# SD Social — Establishment media integrations

Status: **code prepared, not activated in production**. This repository currently has no application source code beyond README; wire these functions into the actual web server after identifying its source. Do not deploy this branch as a replacement for the running app.

## Server-only configuration
- `GOOGLE_PLACES_API_KEY`: Google Maps Platform Places API (New) enabled; billing enabled; restrict key to Places API and server.
- `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID`: Programmable Search Engine image search; verify availability and quota for the account.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Cloudinary upload credentials; never expose API secret to client.

## Suggested admin workflow
1. Admin selects an existing establishment and clicks **Investigar imágenes**.
2. Server invokes `discoverEstablishmentMedia(name, city)`; show matching Google Places records and separate logo candidates.
3. Admin verifies exact business identity. Display Google Places photos according to provider rules and attributions; do not download or rehost them.
4. Logo candidates are **not automatically licensed**. Require source/permission validation and explicit approval before publication.
5. For an authorized, user-provided image file only, invoke `uploadAuthorizedImage` to store it on Cloudinary. Save the returned public ID and URL in the application's existing establishment table.
6. Track approval, provenance, timestamp and attribution; provide a remove/replace control.

## Missing integration steps
- Locate the **actual SD Social application source**, database schema and auth middleware.
- Add admin-authenticated routes and server-side rate limits.
- Connect admin UI and persistence.
- Configure credentials privately in Railway and run end-to-end tests before production release.

Never expose secrets in GitHub, browser JavaScript, or chat.
