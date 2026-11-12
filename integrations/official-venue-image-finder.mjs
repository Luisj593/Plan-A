import {readFile} from 'node:fs/promises';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const attrs=(tag)=>{const out={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]);return out};
export async function findOfficialVenueImages(id,sourceUrl){
 const catalog=JSON.parse(await readFile(new URL('../data/venue-directory-seed.json',import.meta.url),'utf8'));
 const venue=catalog.venues.find(v=>v.id===id);
 if(!venue)throw Error('Comercio no encontrado');
 if(!sourceUrl&&!venue.website)return {venueId:id,name:venue.name,website:null,images:[],status:'no_official_website'};
 const target=new URL(sourceUrl||venue.website);
 if(target.protocol!=='https:'||target.port||target.username||target.password||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(target.hostname)||isIP(target.hostname))throw Error('URL HTTPS pública requerida');
 async function validatePublicUrl(u){
  if(u.protocol!=='https:'||u.port||u.username||u.password||isIP(u.hostname)||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname))throw Error('La URL debe ser HTTPS pública');
  const resolved=await lookup(u.hostname,{all:true});
  if(!resolved.length||resolved.some(x=>x.family===4&&(/^(0|10|127|169\.254|192\.168)\./.test(x.address)||/^172\.(1[6-9]|2[0-9]|3[01])\./.test(x.address)||/^22[4-9]\./.test(x.address)||/^23\d\./.test(x.address))||x.family===6&&(/^(::1|fc|fd|fe80|::ffff:)/i.test(x.address))))throw Error('Origen de redirección no permitido');
 }
 let page=target,response;
 for(let hop=0;hop<5;hop++){
  await validatePublicUrl(page);
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{response=await fetch(page,{redirect:'manual',signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; PlanAResearch/1.0)','accept':'text/html,application/xhtml+xml'}})}finally{clearTimeout(timeout)}
  if(![301,302,303,307,308].includes(response.status))break;
  const location=response.headers.get('location');
  if(!location)throw Error('La fuente redirige sin destino');
  const next=new URL(location,page);
  if((next.hostname==='instagram.com'||next.hostname.endsWith('.instagram.com')||next.hostname==='facebook.com'||next.hostname.endsWith('.facebook.com'))&&['/accounts/login','/challenge','/auth','/login','/checkpoint'].some(path=>next.pathname.startsWith(path)))throw Error('Instagram o Facebook requiere iniciar sesión. Para extraer galerías completas conecta una cuenta autorizada de Meta.');
  page=next;
 }
 if([301,302,303,307,308].includes(response.status))throw Error('La página tiene demasiadas redirecciones');
 if(response.status===401||response.status===403||response.status===429)throw Error('La fuente limita el acceso automatizado (HTTP '+response.status+'). Prueba una página pública diferente.');
 if(!response.ok)throw Error('No se pudo consultar la página indicada (HTTP '+response.status+')');
 if(!(response.headers.get('content-type')||'').includes('text/html'))throw Error('La URL no devuelve una página HTML');
 if(Number(response.headers.get('content-length')||0)>1500000)throw Error('Página demasiado grande');
 const html=(await response.text()).slice(0,1500000);const images=[];const seen=new Set();
 function add(raw,kind){try{const u=new URL(decode(raw),page);if(u.protocol!=='https:'||seen.has(u.href))return;seen.add(u.href);images.push({url:u.href,kind,sourcePage:page.href,rights:'pending_review'})}catch{}}
 for(const match of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(match[0]);const key=(a.property||a.name||'').toLowerCase();if(['og:image','og:image:url','twitter:image','twitter:image:src'].includes(key)&&a.content)add(a.content,'cover')}
 for(const match of html.matchAll(/<img\b[^>]*>/gi)){const a=attrs(match[0]);const candidate=a['data-src']||a['data-original']||a['data-lazy-src']||a.src;if(candidate&&!/\.svg(?:\?|$)/i.test(candidate))add(candidate,'gallery')}
 // Some public social pages expose preview images through JSON-LD or srcset.
 const social=/(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.watch)$/i.test(target.hostname);
 return {venueId:id,name:venue.name,website:page.href,images:images.slice(0,24),status:images.length?'candidates_found':'no_images_found',notice:images.length?'Imágenes públicas candidatas: revisa los derechos antes de agregar.':social?'La red social no expone fotografías públicas en esta página. Para galerías completas se requiere conexión autorizada con Meta.':'No se encontraron imágenes públicas en la página.'};
}
