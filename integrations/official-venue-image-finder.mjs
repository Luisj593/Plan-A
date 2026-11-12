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
 function add(raw,kind){try{if(!raw||/^(data:|blob:|javascript:)/i.test(raw))return;const u=new URL(decode(raw.trim()),page);if(u.protocol!=='https:'||seen.has(u.href)||/\.svg(?:[?#]|$)/i.test(u.pathname))return;seen.add(u.href);images.push({url:u.href,kind,sourcePage:page.href,rights:'pending_review'})}catch{}}
 function srcset(value,kind){for(const part of String(value||'').split(',')){const url=part.trim().split(/\s+/)[0];if(url)add(url,kind)}}
 for(const match of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(match[0]);const key=(a.property||a.name||'').toLowerCase();if(['og:image','og:image:url','twitter:image','twitter:image:src'].includes(key)&&a.content)add(a.content,'cover')}
 for(const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)){const a=attrs(match[0]);for(const key of ['data-src','data-original','data-lazy-src','data-image','data-image-src','data-flickity-lazyload','src'])if(a[key])add(a[key],'gallery');for(const key of ['srcset','data-srcset','data-lazy-srcset'])if(a[key])srcset(a[key],'gallery')}
 // Site builders frequently use CSS background images and JSON image metadata.
 for(const match of html.matchAll(/(?:background-image\s*:\s*|background\s*:\s*)url\(\s*['"]?([^)'"]+)/gi))add(match[1],'gallery');
 for(const match of html.matchAll(/\b(?:data-bg|data-background|data-background-image|data-image-url)\s*=\s*["']([^"']+)["']/gi))add(match[1],'gallery');
 for(const match of html.matchAll(/"(?:(?:image|imageUrl|thumbnailUrl|contentUrl|originalUrl))"\s*:\s*"((?:https?:)?\\?\/[^"]+)"/gi)){const raw=match[1].replace(/\\\//g,'/');add(raw,'gallery')}

 // Extract actual menu entries separately from image URLs. Many menu pages use
 // h4 + price + description while photographs are loaded by client-side scripts.
 const strip=fragment=>decode(String(fragment||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
 const products=[];let section='Menú';
 const headings=[...html.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
 for(let i=0;i<headings.length;i++){
  const h=headings[i],level=Number(h[1]),name=strip(h[2]);
  if(level===2||level===3){if(name)section=name.slice(0,120);continue}
  if(!name||name.length>110)continue;
  const segment=html.slice(h.index+h[0].length,headings[i+1]?.index??Math.min(html.length,h.index+2400)).slice(0,2200);
  const plain=strip(segment);
  const priceMatch=plain.match(/(?:RD\$\s*)?(\d{2,5})(?:\.00)?(?:\s|$)/);
  if(!priceMatch)continue;
  const price=Number(priceMatch[1]);
  if(price<50||price>100000)continue;
  const description=plain.slice((priceMatch.index||0)+priceMatch[0].length).trim().slice(0,500);
  if(!products.some(p=>p.name.toLowerCase()===name.toLowerCase()))products.push({name,price,description,section,category:/cocktail|coctel|bebida|drink|mocktail|vino|cerveza/i.test(section)?'bebidas':'general',sourcePage:page.href});
 }
 // Preserve all distinct candidates rather than truncating galleries at 24.
 const social=/(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.watch)$/i.test(target.hostname);
 return {venueId:id,name:venue.name,website:page.href,images:images.slice(0,120),products:products.slice(0,250),status:images.length?'candidates_found':'no_images_found',notice:images.length?'Imágenes públicas candidatas: revisa los derechos antes de agregar.':social?'La red social no expone fotografías públicas en esta página. Para galerías completas se requiere conexión autorizada con Meta.':'No se encontraron imágenes públicas en la página.'};
}
