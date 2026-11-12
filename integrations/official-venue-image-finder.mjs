import {readFile} from 'node:fs/promises';
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const attrs=(tag)=>{const out={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]);return out};
export async function findOfficialVenueImages(id){
 const catalog=JSON.parse(await readFile(new URL('../data/venue-directory-seed.json',import.meta.url),'utf8'));
 const venue=catalog.venues.find(v=>v.id===id);
 if(!venue)throw Error('Comercio no encontrado');
 if(!venue.website)return {venueId:id,name:venue.name,website:null,images:[],status:'no_official_website'};
 const target=new URL(venue.website);
 if(target.protocol!=='https:'||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(target.hostname))throw Error('Sitio oficial no permitido');
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),9000);
 let response;
 try{response=await fetch(target,{redirect:'manual',signal:controller.signal,headers:{'user-agent':'PlanA-OfficialMediaResearch/1.0 (+venue catalog research)','accept':'text/html'}})}finally{clearTimeout(timeout)}
 if(!response.ok)throw Error('No se pudo consultar la página oficial ('+response.status+')');
 if(!(response.headers.get('content-type')||'').includes('text/html'))throw Error('La fuente no es HTML');
 if(Number(response.headers.get('content-length')||0)>1500000)throw Error('Página demasiado grande');
 const html=(await response.text()).slice(0,1500000);const images=[];const seen=new Set();
 function add(raw,kind){try{const u=new URL(decode(raw),target);if(u.protocol!=='https:'||u.hostname!==target.hostname||seen.has(u.href))return;seen.add(u.href);images.push({url:u.href,kind,sourcePage:target.href,rights:'pending_review'})}catch{}}
 for(const match of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(match[0]);const key=(a.property||a.name||'').toLowerCase();if(['og:image','og:image:url','twitter:image','twitter:image:src'].includes(key)&&a.content)add(a.content,'cover')}
 for(const match of html.matchAll(/<img\b[^>]*>/gi)){const a=attrs(match[0]);const candidate=a['data-src']||a.src;if(candidate&&!/\.svg(?:\?|$)/i.test(candidate))add(candidate,'gallery')}
 return {venueId:id,name:venue.name,website:target.href,images:images.slice(0,16),status:images.length?'candidates_found':'no_images_found',notice:'Candidatas para revisión. No descargar ni publicar sin confirmar derechos.'};
}
