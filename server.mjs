import {register,login,current,logout,assignMerchant,bootstrapSuperAdmin,allMerchants,activateSuperAdminForSession,provisionInitialSuperAdmin} from './integrations/auth.mjs';
import {findOfficialVenueImages} from './integrations/official-venue-image-finder.mjs';
import { readFile } from 'node:fs/promises';
import {listVenueMedia,readVenueMedia,saveVenueMedia} from './integrations/venue-media-store.mjs';
import http from 'node:http';
import {getDishImages} from './integrations/dish-images.mjs';
import { researchRegisteredVenues } from './integrations/official-source-research.mjs';
import { timingSafeEqual } from 'node:crypto';
import { discoverEstablishmentMedia, integrationStatus, resolvePlacesPhoto } from './integrations/establishment-media.mjs';
const port = Number(process.env.PORT || 3000);
const token = process.env.ADMIN_TOKEN || '';
const safeEq = (a,b) => { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
const limiter = new Map();
// Prevent a depleted Places quota from triggering repeated paid provider calls.
const placesPhotoCache = new Map();
const PLACES_PHOTO_TTL = 6 * 60 * 60 * 1000;
const PLACES_QUOTA_BACKOFF = 24 * 60 * 60 * 1000;
let placesQuotaBlockedUntil = 0;

const rateLimit = (ip) => { const now=Date.now(); const s=limiter.get(ip)||{time:now,count:0}; if(now-s.time>60000){s.time=now;s.count=0;}s.count++;limiter.set(ip,s);return s.count<=30; };
const send=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj));};
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="index,follow"><title>SD Social | Descubre establecimientos</title><style>
:root{font-family:Inter,system-ui,Arial,sans-serif;color:#f3f4f6;background:#0c1120}*{box-sizing:border-box}body{margin:0}header{padding:24px max(5vw,20px);display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #263047}.brand{font-weight:900;font-size:22px;letter-spacing:-.5px}.brand span{color:#70d6c5}button{border:0;border-radius:12px;padding:12px 18px;cursor:pointer;font-weight:700;background:#70d6c5;color:#071522}button.secondary{background:#1e293b;color:#fff}.hero{max-width:1050px;margin:65px auto 35px;padding:0 20px}.hero h1{font-size:clamp(35px,6vw,68px);line-height:1.08;max-width:780px;margin:0}.hero p{color:#aeb9cc;max-width:640px;font-size:18px;line-height:1.6}.panel{max-width:1050px;margin:20px auto;padding:25px;border:1px solid #29364c;border-radius:20px;background:#121b2e}.muted{color:#aeb9cc}input{width:100%;padding:14px;border-radius:10px;background:#0c1424;border:1px solid #3b4b65;color:white;font-size:16px}label{display:block;margin:12px 0 6px;font-size:14px}form{display:grid;gap:10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.tile{background:#1a2740;padding:16px;border-radius:14px;overflow-wrap:anywhere}a{color:#91e4d6}small{color:#aeb9cc}.hidden{display:none}footer{padding:35px;text-align:center;color:#9eabc1}#output{white-space:pre-wrap;overflow-wrap:anywhere} .pill{display:inline-block;border:1px solid #45617a;border-radius:20px;padding:6px 12px;margin:4px;font-size:13px}@media(max-width:600px){header{padding:18px}.panel{margin:15px;padding:18px}.hero{margin:45px auto 25px}}
</style></head><body><header><div class="brand">SD <span>Social</span></div><button class="secondary" id="adminBtn">Administración</button></header><main><section class="hero"><h1>Descubre lugares y experiencias de tu ciudad.</h1><p>Explora establecimientos y sus imágenes reales. Estamos preparando el catálogo público; las imágenes se incorporan únicamente después de validar su procedencia.</p><span class="pill">Acceso público</span><span class="pill">Diseño adaptable</span><span class="pill">Fotos verificadas</span></section><section class="panel"><h2>Establecimientos</h2><p class="muted">El catálogo se está preparando. Todavía no hay establecimientos publicados en esta versión.</p></section><section class="panel hidden" id="admin"><h2>Investigador de establecimientos</h2><p class="muted">Acceso administrativo. Las búsquedas consultan proveedores externos cuando están configurados. Los resultados no se publican automáticamente.</p><label>Clave administrativa</label><input id="key" type="password" autocomplete="off" placeholder="Clave configurada en Railway"><form id="search"><label>Nombre del establecimiento<input id="name" required maxlength="180" placeholder="Nombre comercial"></label><label>Ciudad<input id="city" maxlength="180" value="Santo Domingo, República Dominicana"></label><button type="submit">Investigar imágenes y logos</button></form><p id="status" class="muted"></p><div id="output"></div></section></main><footer>SD Social · Versión de pruebas</footer><script>
const admin=document.getElementById('admin'), output=document.getElementById('output'),status=document.getElementById('status');
document.getElementById('adminBtn').onclick=()=>admin.classList.toggle('hidden');
function txt(parent,tag,value){const e=document.createElement(tag);e.textContent=value??'';parent.appendChild(e);return e}
function link(parent,label,url){if(!url||!/^https:\/\//.test(url))return;const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;parent.appendChild(a)}
document.getElementById('search').onsubmit=async(e)=>{e.preventDefault();output.replaceChildren();status.textContent='Consultando fuentes...';const name=document.getElementById('name').value.trim(),city=document.getElementById('city').value.trim(),key=document.getElementById('key').value;try{const r=await fetch('/api/admin/discover',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+key},body:JSON.stringify({name,city})});const data=await r.json();if(!r.ok)throw Error(data.error||'Error');status.textContent='Resultados encontrados (requieren validación):';txt(output,'h3','Establecimientos en Google Places');for(const p of data.places){const d=txt(output,'div','');d.className='tile';txt(d,'h4',p.name);txt(d,'p',p.address);link(d,'Sitio web',p.website);txt(d,'p',(p.photos||[]).length+' fotografías disponibles; consultar atribuciones y condiciones de Google.')}txt(output,'h3','Posibles logotipos');for(const l of data.logoCandidates){const d=txt(output,'div','');d.className='tile';txt(d,'p',l.title);link(d,'Ver imagen original',l.url);txt(d,'p','Pendiente de verificar permisos de uso.')}for(const err of data.errors)txt(output,'p',err);if(!data.places.length&&!data.logoCandidates.length)txt(output,'p','Sin resultados; comprueba las credenciales de los proveedores.')}catch(err){status.textContent=err.message}};
</script></body></html>`;
const security={"content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'","referrer-policy":"strict-origin-when-cross-origin","x-frame-options":"DENY","x-content-type-options":"nosniff","permissions-policy":"camera=(),microphone=(),geolocation=()"};
const server=http.createServer(async(req,res)=>{
  for(const [k,v] of Object.entries(security))res.setHeader(k,v);
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/super-admin'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(await readFile(new URL('./super-admin.html',import.meta.url)))}
  if(req.method==='GET'&&['/mi-cuenta','/mi-comercio'].includes(url.pathname)){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(await readFile(new URL('./my-session.html',import.meta.url)))}
  if(req.method==='GET'&&url.pathname==='/acceso'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(await readFile(new URL('./login.html',import.meta.url)))}
  if(url.pathname.startsWith('/api/auth/')){
    const json=async()=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>12000)throw Error('Solicitud demasiado grande')}return JSON.parse(body)};
    try{
      if(req.method==='GET'&&url.pathname==='/api/auth/me')return send(res,200,{user:await current(req)});
      if(req.method==='POST'&&url.pathname==='/api/auth/register'){const user=await register(await json());return send(res,201,{user,message:user.role==='merchant'?'Cuenta creada. La asignación de un comercio requiere aprobación.':'Cuenta creada. Ya puedes iniciar sesión.'})}
      if(req.method==='POST'&&url.pathname==='/api/auth/login'){const result=await login(await json());res.setHeader('set-cookie','plana_session='+result.token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800');return send(res,200,{user:result.user})}
      if(req.method==='POST'&&url.pathname==='/api/auth/logout'){await logout(req);res.setHeader('set-cookie','plana_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');return send(res,200,{ok:true})}
      if(req.method==='POST'&&url.pathname==='/api/auth/assign-merchant'){const actor=await current(req);if(!actor||actor.role!=='super_admin')return send(res,403,{error:'Solo Super Admin'});const data=await json();const catalog=JSON.parse(await readFile(new URL('./data/venue-directory-seed.json',import.meta.url),'utf8'));if(!catalog.venues.some(v=>v.id===data.venueId))return send(res,404,{error:'Comercio no registrado'});return send(res,200,{user:await assignMerchant(data.email,data.venueId)})}
      if(req.method==='POST'&&url.pathname==='/api/auth/activate-admin-session'){return send(res,200,await activateSuperAdminForSession(req))}
      if(req.method==='POST'&&url.pathname==='/api/auth/bootstrap-admin'){return send(res,200,await bootstrapSuperAdmin(await json()))}
      if(req.method==='GET'&&url.pathname==='/api/auth/admin-dashboard'){const user=await current(req);if(!user||user.role!=='super_admin')return send(res,403,{error:'Solo Super Admin'});const catalog=JSON.parse(await readFile(new URL('./data/venue-directory-seed.json',import.meta.url),'utf8'));return send(res,200,{user,venues:catalog.venues.map(v=>({id:v.id,name:v.name})),merchants:await allMerchants()})}
      if(req.method==='POST'&&url.pathname==='/api/auth/admin-assign'){const user=await current(req);if(!user||user.role!=='super_admin')return send(res,403,{error:'Solo Super Admin'});const data=await json();const catalog=JSON.parse(await readFile(new URL('./data/venue-directory-seed.json',import.meta.url),'utf8'));if(!catalog.venues.some(v=>v.id===data.venueId))return send(res,404,{error:'Comercio no registrado'});return send(res,200,{user:await assignMerchant(data.email,data.venueId)})}
      if(req.method==='GET'&&url.pathname==='/api/auth/merchant-dashboard'){const user=await current(req);if(!user)return send(res,401,{error:'Inicia sesión'});if(user.role!=='merchant')return send(res,403,{error:'Solo comercios'});return send(res,200,{user,venueAssigned:!!user.venueId})}
      if(req.method==='GET'&&url.pathname==='/api/auth/client-dashboard'){const user=await current(req);if(!user)return send(res,401,{error:'Inicia sesión'});if(user.role!=='client')return send(res,403,{error:'Solo clientes'});return send(res,200,{user})}
      return send(res,404,{error:'Not found'});
    }catch(e){console.error('Auth operation',String(e.message).slice(0,100));return send(res,/registrado|inválid|incorrectas|grande|JSON/i.test(String(e.message))?400:503,{error:String(e.message).slice(0,180)})}
  }
  if(req.method==='GET'&&url.pathname.startsWith('/api/venue-media/')&&/^[0-9a-f-]{36}$/.test(url.pathname.split('/').pop())){
    try{const item=await readVenueMedia(url.pathname.split('/').pop());if(!item)return send(res,404,{error:'Image not found'});res.writeHead(200,{'content-type':item.content_type,'cache-control':'public, max-age=86400','x-content-type-options':'nosniff'});return res.end(item.bytes)}catch(e){console.error('Venue media read',e.message);return send(res,503,{error:'Media storage unavailable'})}
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/venue-image-search'){
    if((!token||!safeEq(req.headers.authorization||'','Bearer '+token))&&(await current(req))?.role!=='super_admin')return send(res,401,{error:'Acceso Super Admin requerido'});
    try{return send(res,200,await findOfficialVenueImages((url.searchParams.get('venueId')||'').slice(0,90),(url.searchParams.get('sourceUrl')||'').slice(0,2000)))}catch(e){return send(res,502,{error:String(e.message).slice(0,180)})}
  }
  if(req.method==='GET'&&url.pathname==='/admin/imagenes'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    return res.end(await readFile(new URL('./admin-images.html',import.meta.url)));
  }
  if(req.method==='GET'&&url.pathname==='/api/venue-media'){
    try{return send(res,200,{photos:await listVenueMedia((url.searchParams.get('venueId')||'').slice(0,90))})}catch(e){console.error('Venue media list',e.message);return send(res,503,{error:'Media storage unavailable'})}
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/venue-media'){
    if(!token||!safeEq(req.headers.authorization||'','Bearer '+token))return send(res,401,{error:'Unauthorized'});
    try{
      let body='';for await(const chunk of req){body+=chunk;if(body.length>7_000_000)return send(res,413,{error:'Payload too large'})}
      const input=JSON.parse(body);
      const catalog=JSON.parse(await readFile(new URL('./data/venue-directory-seed.json',import.meta.url),'utf8'));
      if(!catalog.venues.some(v=>v.id===input.venueId))return send(res,404,{error:'Unknown venue'});
      return send(res,201,await saveVenueMedia(input));
    }catch(e){return send(res,400,{error:String(e.message).slice(0,200)})}
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/import-venue-image'){
    const actor=await current(req);if(!actor||actor.role!=='super_admin')return send(res,403,{error:'Solo Super Admin'});
    try{
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)return send(res,413,{error:'Solicitud demasiado grande'})}
      const input=JSON.parse(raw),source=new URL(input.imageUrl);
      if(source.protocol!=='https:'||source.port||source.username||source.password||source.hostname==='localhost')return send(res,400,{error:'URL HTTPS pública requerida'});
      const {lookup}=await import('node:dns/promises');const {isIP}=await import('node:net');
      if(isIP(source.hostname))return send(res,400,{error:'No se permiten direcciones IP'});
      const addresses=await lookup(source.hostname,{all:true});
      if(!addresses.length||addresses.some(x=>x.family===4&&(/^(0|10|127|169\\.254|192\\.168)\\./.test(x.address)||/^172\\.(1[6-9]|2[0-9]|3[01])\\./.test(x.address))||x.family===6&&(/^(::1|fc|fd|fe80|::ffff:)/i.test(x.address))))return send(res,400,{error:'Origen no permitido'});
      const catalog=JSON.parse(await readFile(new URL('./data/venue-directory-seed.json',import.meta.url),'utf8'));
      if(!catalog.venues.some(v=>v.id===input.venueId))return send(res,404,{error:'Comercio no encontrado'});
      // Image CDNs commonly redirect to a separate public image host.
      // Validate every redirect destination before making the next request.
      let target=source,response;
      for(let hop=0;hop<4;hop++){
        const addresses=await lookup(target.hostname,{all:true});
        const blocked=addresses.some(x=>x.family===4&&(/^(0|10|127|169\\.254|192\\.168)\\./.test(x.address)||/^172\\.(1[6-9]|2[0-9]|3[01])\\./.test(x.address))||x.family===6&&(/^(::1|fc|fd|fe80|::ffff:)/i.test(x.address)));
        if(target.protocol!=='https:'||target.port||target.username||target.password||isIP(target.hostname)||!addresses.length||blocked)throw Error('Redirección a origen no permitido');
        response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{accept:'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8','user-agent':'Mozilla/5.0 (compatible; PlanAImageImporter/1.0)'}});
        if([301,302,303,307,308].includes(response.status)){
          const location=response.headers.get('location');if(!location)throw Error('Redirección sin destino');
          target=new URL(location,target);continue;
        }
        break;
      }
      if([301,302,303,307,308].includes(response.status))throw Error('Demasiadas redirecciones');
      if(!response.ok)throw Error('La fuente rechazó la descarga de la imagen (HTTP '+response.status+'). Usa un enlace directo y público.');
      const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!['image/jpeg','image/png','image/webp','image/avif'].includes(contentType))throw Error('La URL no devuelve una imagen JPEG, PNG, WebP o AVIF (tipo: '+(contentType||'desconocido')+').');
      if(Number(response.headers.get('content-length')||0)>5000000)throw Error('Imagen supera 5 MB');
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>5000000)throw Error('Imagen supera 5 MB');
      const saved=await saveVenueMedia({venueId:input.venueId,kind:input.kind,title:input.title||'Imagen de establecimiento',contentType,base64:bytes.toString('base64'),sourceUrl:source.href,licenseNote:input.licenseNote});
      return send(res,201,saved);
    }catch(e){console.error('Venue image import failed:',String(e.message).slice(0,250));return send(res,400,{error:String(e.message).slice(0,180)})}
  }
  if(req.method==='GET'&&url.pathname==='/api/venues/google-photos'){const id=(url.searchParams.get('id')||'').slice(0,90);try{const data=JSON.parse(await readFile(new URL('./data/venue-directory-seed.json',import.meta.url),'utf8'));const venue=data.venues.find(v=>v.id===id);if(!venue)return send(res,404,{error:'Comercio no encontrado'});if(!process.env.GOOGLE_PLACES_API_KEY)return send(res,200,{photos:[],configured:false});const cached=placesPhotoCache.get(id);if(cached&&cached.until>Date.now())return send(res,200,cached.value);if(Date.now()<placesQuotaBlockedUntil)return send(res,200,{photos:[],configured:true,available:false,code:'GOOGLE_QUOTA',retryAfterSeconds:Math.ceil((placesQuotaBlockedUntil-Date.now())/1000)});const {findPlace}=await import('./integrations/establishment-media.mjs');const matches=await findPlace(venue.name,'Santo Domingo, República Dominicana');const normalize=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');const target=normalize(venue.name);const match=matches.find(p=>normalize(p.name)===target)||matches.find(p=>normalize(p.name).includes(target)&&target.length>7);if(!match){const value={photos:[],configured:true,match:false};placesPhotoCache.set(id,{value,until:Date.now()+PLACES_PHOTO_TTL});return send(res,200,value)}const value={photos:match.photos.slice(0,6).map(p=>({url:p.displayEndpoint,attribution:p.attribution,source:venue.mapsUrl})),configured:true,match:true};placesPhotoCache.set(id,{value,until:Date.now()+PLACES_PHOTO_TTL});return send(res,200,value)}catch(e){const message=String(e?.message||'');const code=/403|PERMISSION_DENIED|API_KEY|not enabled|billing/i.test(message)?'GOOGLE_ACCESS_DENIED':/429|RESOURCE_EXHAUSTED|quota/i.test(message)?'GOOGLE_QUOTA':/400|INVALID_ARGUMENT/i.test(message)?'GOOGLE_BAD_REQUEST':'GOOGLE_UNAVAILABLE';console.error('Google Places venue photos',id,code,message.replace(/AIza[0-9A-Za-z_-]+/g,'[REDACTED]').slice(0,400));if(code==='GOOGLE_QUOTA')placesQuotaBlockedUntil=Date.now()+PLACES_QUOTA_BACKOFF;return send(res,200,{photos:[],configured:code!=='GOOGLE_ACCESS_DENIED',available:false,code,message:'Fotos externas temporalmente no disponibles; se mantienen las imágenes verificadas del establecimiento.'})}}
  if(req.method==='GET'&&url.pathname==='/api/establishment-media/places-photo'){const name=url.searchParams.get('name')||'';try{const photo=await resolvePlacesPhoto(name);res.writeHead(302,{'location':photo.displayUrl,'cache-control':'no-store'});return res.end()}catch{return send(res,404,{error:'Foto no disponible'})}}
  if(req.method==='GET'&&url.pathname==='/api/dish-images'){const dish=(url.searchParams.get('dish')||'').slice(0,80);try{return send(res,200,{dish,images:await getDishImages(dish),note:'Reference images from Wikimedia Commons; not venue product photos'})}catch{return send(res,200,{dish,images:[],note:'No licensed reference image available'})}}
  if(req.method==='GET'&&url.pathname==='/api/venues/research'){try{return send(res,200,{venues:await researchRegisteredVenues(),mediaPolicy:'Candidates only. No automatic publication without rights verification.'})}catch(e){return send(res,502,{error:'Research unavailable'})}}
  if(req.method==='GET'&&url.pathname==='/api/venues/drinks'){try{const data=JSON.parse(await readFile(new URL('./data/verified-drinks.json',import.meta.url),'utf8'));return send(res,200,data)}catch{return send(res,503,{error:'Drink catalog unavailable'})}}
  if(req.method==='GET'&&url.pathname==='/data/venue-directory-seed.json'){try{const data=JSON.parse(await readFile(new URL('./data/venue-directory-seed.json',import.meta.url),'utf8'));return send(res,200,data)}catch{return send(res,503,{error:'Directory unavailable'})}}
  if(req.method==='GET'&&url.pathname==='/comercio.html'){try{const page=await readFile(new URL('./comercio.html',import.meta.url));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(page)}catch{return send(res,503,{error:'Storefront unavailable'})}}
  // Server-rendered business profiles: deep links work without client-side routing.
  const profileId=url.pathname.startsWith('/comercio/') ? url.pathname.slice('/comercio/'.length).replace(/\/$/,'') : (url.pathname==='/' ? url.searchParams.get('comercio') : null);
  if(req.method==='GET'&&profileId){
    const esc=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const safeUrl=(value)=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?esc(u.href):''}catch{return ''}};
    try{
      const catalog=JSON.parse(await readFile(new URL('./data/venue-directory-seed.json',import.meta.url),'utf8'));
      const v=(catalog.venues||[]).find(item=>item.id===profileId);
      if(!v)return send(res,404,{error:'Comercio no encontrado'});
      const formatHours=(value)=>String(value??'').replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g,(_,h,m)=>{const hour=Number(h);return (hour%12||12)+':'+m+' '+(hour<12?'AM':'PM')});
      const hours=Object.entries(v.openingHours||{}).map(([day,time])=>'<div class="line"><b>'+esc(day)+'</b><span>'+esc(formatHours(time))+'</span></div>').join('')||'<p>Pendiente de confirmación</p>';
      const action=(label,href,style='')=>href?'<a class="action '+style+'" href="'+href+'" target="_blank" rel="noopener noreferrer">'+label+'</a>':'';
      const cover=(v.photoUrl&&v.photoVerified)?'<img class="cover-image" src="'+safeUrl(v.photoUrl)+'" alt="Portada de '+esc(v.name)+'">':'';
      const verifiedPhotos=(v.gallery||[]).filter(p=>p.verified&&safeUrl(p.url));
      const storedPhotos=await listVenueMedia(v.id).catch(()=>[]);
      const profilePhoto=(v.logoUrl&&v.logoVerified?v.logoUrl:null)||(v.profilePhotoUrl&&v.profilePhotoVerified?v.profilePhotoUrl:null)||(verifiedPhotos[0]?.url||null);
      const storedLogo=storedPhotos.find(p=>p.kind==='logo')?.url;
      const logo=storedLogo?'<img src="'+esc(storedLogo)+'" alt="Logo de '+esc(v.name)+'">':profilePhoto?'<img src="'+safeUrl(profilePhoto)+'" alt="Foto de perfil de '+esc(v.name)+'">':'🏪';
      const gallery=[...storedPhotos.filter(p=>p.kind==='establishment').map(p=>'<img src="'+esc(p.url)+'" alt="'+esc(p.title||v.name)+'">'),...verifiedPhotos.map(p=>'<img src="'+safeUrl(p.url)+'" alt="'+esc(p.alt||v.name)+'">')].join('')||'<p>Fotografías pendientes de verificación.</p>';
      const products=[...storedPhotos.filter(p=>p.kind==='menu').map(p=>'<article><img src="'+esc(p.url)+'" alt="'+esc(p.title||'Menú')+'"><h3>'+esc(p.title||'Menú')+'</h3></article>'),...(v.products||[]).filter(p=>p.photoVerified&&safeUrl(p.photoUrl)).map(p=>'<article><img src="'+safeUrl(p.photoUrl)+'" alt="'+esc(p.name)+'"><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'')+'</p></article>')].join('')||'<p>Menú y productos pendientes de verificación.</p>';
      const page=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.name)} | SD Social</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#141629;font:16px system-ui,Arial,sans-serif}a{text-decoration:none;color:inherit}header{background:#111c34;color:white;padding:18px 5%;font-size:21px;font-weight:800}.wrap{max-width:1220px;margin:auto;padding:22px 22px 60px}.back{display:inline-block;margin-bottom:18px;color:#183c81}.identity{display:flex;align-items:center;gap:24px;padding:10px 4px 25px}.avatar{width:145px;height:145px;flex:none;border-radius:20px;background:#15172b;display:grid;place-items:center;color:white;font-size:48px;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}h1{font-size:clamp(28px,4vw,42px);margin:0 0 10px}.chip{display:inline-block;background:#e4ebfa;color:#142e69;padding:8px 14px;border-radius:20px;margin-right:8px;font-size:14px;font-weight:700}.address{margin-top:14px}.actions{display:flex;gap:10px;margin-left:auto;flex-wrap:wrap}.action{display:inline-block;background:#ff6415;color:white;padding:13px 19px;border-radius:28px;font-weight:750}.action.alt{background:#edf1fa;color:#18346c}.feature{display:grid;grid-template-columns:1.2fr 1fr;gap:8px;min-height:350px;margin:0 0 25px}.feature-main,.feature-side img{width:100%;height:100%;object-fit:cover;border-radius:12px}.feature-side{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:8px;min-height:350px}.feature-side img{height:170px}.photo-placeholder{display:grid;place-items:center;background:linear-gradient(120deg,#172447,#343a70);color:white;border-radius:12px;text-align:center;padding:24px;font-weight:650}.feature-main.photo-placeholder{min-height:350px}.section{background:white;padding:22px 24px;margin:18px 0;border-radius:14px;box-shadow:0 3px 16px #18213c0a}h2{margin:0 0 15px;font-size:24px;border-left:5px solid #ff691d;padding-left:14px}.media{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.media img{width:100%;height:190px;object-fit:cover;border-radius:12px}.menu-media{grid-template-columns:repeat(3,minmax(0,1fr))}.menu-media article{overflow:hidden;border-radius:12px;background:#f5f6f9}.menu-media article img{height:210px}.menu-media h3,.menu-media p{margin:10px 12px}.details{display:grid;grid-template-columns:1fr 1fr;gap:16px}.line{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;gap:12px}@media(max-width:800px){.identity{flex-wrap:wrap}.actions{margin-left:0;width:100%}.feature{grid-template-columns:1fr;min-height:0}.feature-main.photo-placeholder{min-height:230px}.feature-side{min-height:0}.feature-side img{height:130px}.media{grid-template-columns:repeat(2,minmax(0,1fr))}.menu-media{grid-template-columns:repeat(2,minmax(0,1fr))}.details{grid-template-columns:1fr}}@media(max-width:480px){.wrap{padding:15px}.avatar{width:95px;height:95px}.identity{gap:12px}.feature-side img{height:100px}.media img{height:140px}.menu-media{grid-template-columns:1fr}}</style></head><body data-venue-id="${esc(v.id)}"><header>📍 SD Social</header><main class="wrap"><a class="back" href="/">← Volver a comercios</a><section class="identity"><div class="avatar">${logo}</div><div><h1>${esc(v.name)}</h1><span class="chip">${esc(v.category)}</span><span class="chip">${esc(v.section)}</span><div class="address">📍 ${esc(v.address)}</div></div><div class="actions">${action("📍 Cómo llegar",safeUrl(v.mapsUrl))}${action("Sitio web",safeUrl(v.website),"alt")}</div></section><div class="feature" id="venue-feature"><div class="feature-main photo-placeholder">Fotografías del establecimiento pendientes de verificación</div><div class="feature-side" id="venue-feature-side"></div></div><section class="section"><h2>Fotos del establecimiento</h2><div class="media" id="venue-gallery">${gallery}</div></section><section class="section"><h2>Explora el menú y servicios</h2><div class="media menu-media">${products}</div>${action("Consultar menú oficial",safeUrl(v.menuUrl),"alt")}</section><div class="details"><section class="section"><h2>Descripción</h2><p>${esc(v.description||"Información pendiente de confirmar.")}</p><p>${esc(v.category)} · ${esc(v.section)}</p></section><section class="section"><h2>Horarios</h2>${hours}<h2>Precios</h2><p>${esc(v.priceRange||"Pendiente de confirmación")}</p></section></div><section class="section"><h2>Dirección y ubicación</h2><p>📍 ${esc(v.address)}</p>${action("Abrir Google Maps",safeUrl(v.mapsUrl))}</section></main><script>(async()=>{const gallery=document.getElementById("venue-gallery");const feature=document.getElementById("venue-feature");const side=document.getElementById("venue-feature-side");const add=(url,alt)=>{if(typeof url!=="string"||!(url.startsWith("https://")||url.startsWith("/api/establishment-media/places-photo?")))return;const img=document.createElement("img");img.src=url;img.alt=alt||"Fotografía del establecimiento";img.loading="lazy";img.onerror=()=>{img.remove();refresh()};gallery.appendChild(img)};const refresh=()=>{const imgs=[...gallery.querySelectorAll("img")].filter(i=>i.complete?i.naturalWidth>0:true);if(!imgs.length)return;feature.firstElementChild.replaceWith(imgs[0].cloneNode());feature.firstElementChild.className="feature-main";side.replaceChildren(...imgs.slice(1,5).map(i=>i.cloneNode()))};refresh();try{const r=await fetch("/api/venues/google-photos?id="+encodeURIComponent(document.body.dataset.venueId||""));if(!r.ok)return;const data=await r.json();if(!Array.isArray(data.photos)||!data.photos.length)return;gallery.querySelector("p")?.remove();for(const p of data.photos)add(p.url,"Foto del establecimiento");refresh()}catch{}})();</script></body></html>`;
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(page);
    }catch(e){return send(res,500,{error:'No se pudo cargar la ficha del comercio'})}
  }
  if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,service:'sd-social'});
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/investigador')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(url.pathname==='/' ? await readFile(new URL('./index.html',import.meta.url)) : html);}
  if(!rateLimit(req.socket.remoteAddress||'unknown'))return send(res,429,{error:'Too many requests'});
  if(url.pathname.startsWith('/api/admin/')){
    if(!token)return send(res,503,{error:'Admin not configured: set ADMIN_TOKEN in Railway'});
    if(!safeEq(req.headers.authorization||'', 'Bearer '+token))return send(res,401,{error:'Unauthorized'});
    if(req.method==='GET'&&url.pathname==='/api/admin/integrations')return send(res,200,integrationStatus());
    if(req.method==='POST'&&url.pathname==='/api/admin/discover'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)return send(res,413,{error:'Payload too large'});}
      try{const data=JSON.parse(body);if(typeof data.name!=='string'||data.name.trim().length<2)return send(res,400,{error:'Provide establishment name'});return send(res,200,await discoverEstablishmentMedia(data.name,data.city));}catch(e){return send(res,400,{error:e.message});}
    }
  }
  return send(res,404,{error:'Not found'});
});
if(process.env.NODE_ENV!=='test')server.listen(port,'0.0.0.0',()=>console.log('SD Social listening on '+port));
export {server};

provisionInitialSuperAdmin().catch(e=>console.error('Initial admin provisioning failed:',e.message));
