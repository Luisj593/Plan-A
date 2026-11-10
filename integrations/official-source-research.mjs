// Server-side discovery from a fixed list of official establishment websites.
// No arbitrary URL fetching, no Google image scraping, no unlicensed media storage.
const sources=[
 {name:"Onno’s Zona Colonial",url:"https://onnosdr.com/zona-colonial",address:"C. Hostos 157, Zona Colonial, Santo Domingo",phone:"+1 809-689-1183"},
 {name:"Jalao",url:"https://jalao.do/",address:"Calle El Conde, Zona Colonial, Santo Domingo",phone:"+1 809-792-1262"},
 {name:"Parada 77",url:"https://zonacolonial.do/directorio/",address:"C. Isabel La Católica 255, Santo Domingo",phone:""},
 {name:"El Sartén",url:"https://zonacolonial.do/directorio/",address:"C. Hostos 153, Santo Domingo",phone:""},
 {name:"Mosquito Social Club",url:"https://mosquitosocialclub.com/",address:"Plaza María de Toledo, Zona Colonial, Santo Domingo",phone:"+1 809-723-2376"},
 {name:"Safe Zone Bar & Lounge",url:"https://safezonerd.com/",address:"Calle Hostos 202, Zona Colonial, Santo Domingo",phone:"+1 849-653-4688"},
 {name:"Hasta La Tambora Café Lounge",url:"https://www.hastalatamboralounge.com/",address:"Calle La Atarazana #1, Zona Colonial, Santo Domingo",phone:"+1 809-706-4471"},
 {name:"La Posta Bar",url:"https://thebestofdr.do/store/la-posta/",address:"Av. Gustavo Mejía Ricart 122, Santo Domingo",phone:"+1 809-475-1007"}
];
const tag=(html,pattern)=>html.match(pattern)?.[1]?.replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim()||'';
const absolute=(src,base)=>{try{const u=new URL(src,base);return u.protocol==='https:'?u.href:null}catch{return null}};
const allowed=new Set(sources.map(s=>new URL(s.url).hostname));
async function getMetadata(source){
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),7500);
 try{
  const response=await fetch(source.url,{signal:ctrl.signal,redirect:'manual',headers:{'user-agent':'PlanA-MediaResearch/1.0 (+public metadata only)'}});
  if(!response.ok||!String(response.headers.get('content-type')).includes('text/html'))throw Error('Página no disponible');
  const html=(await response.text()).slice(0,400000);
  const image=tag(html,/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)||tag(html,/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  const logo=tag(html,/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i);
  const desc=tag(html,/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const socialLinks=[...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>absolute(m[1],source.url)).filter(Boolean).filter(u=>{try{return ['instagram.com','www.instagram.com','facebook.com','www.facebook.com','tiktok.com','www.tiktok.com','youtube.com','www.youtube.com'].includes(new URL(u).hostname)}catch{return false}}).filter((v,i,a)=>a.indexOf(v)===i).slice(0,12);
  const imageUrl=absolute(image,source.url),logoUrl=absolute(logo,source.url);
  const firstParty=!source.url.includes('zonacolonial.do/directorio')&&!source.url.includes('thebestofdr.do');
  const photo=firstParty?imageUrl:null;
  const icon=firstParty?logoUrl:null;
  return {...source,description:desc,socialLinks,mediaCandidates:[...(photo?[{type:'photo',url:photo}]:[]),...(icon?[{type:'site-icon',url:icon}]:[])].map(m=>({...m,source:source.url,rights:'unverified',approved:false})),status:'found'};
 }catch(e){return {...source,mediaCandidates:[],status:'unavailable',note:e.message}}finally{clearTimeout(timeout)}
}
let cache={expires:0,data:[]};
export async function researchRegisteredVenues(){
 if(Date.now()<cache.expires)return cache.data;
 const data=await Promise.all(sources.map(getMetadata));
 cache={expires:Date.now()+60*60*1000,data};
 return data;
}
