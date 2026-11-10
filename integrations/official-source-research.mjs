// Server-side discovery from a fixed list of official establishment websites.
// No arbitrary URL fetching, no Google image scraping, no unlicensed media storage.
const sources=[
 {name:"Onno’s Zona Colonial",url:"https://onnosdr.com/zona-colonial",address:"C. Hostos 157, Zona Colonial, Santo Domingo",phone:"+1 809-689-1183"},
 {name:"Jalao",url:"https://jalao.do/",address:"Calle El Conde, Zona Colonial, Santo Domingo",phone:"+1 809-792-1262"},
 {name:"Parada 77",url:"https://zonacolonial.do/directorio/",address:"C. Isabel La Católica 255, Santo Domingo",phone:""},
 {name:"El Sartén",url:"https://zonacolonial.do/directorio/",address:"C. Hostos 153, Santo Domingo",phone:""},
 {name:"Mosquito Social Club",url:"https://mosquitosocialclub.com/",address:"Plaza María de Toledo, Zona Colonial, Santo Domingo",phone:"+1 809-723-2376"}
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
  const imageUrl=absolute(image,source.url),logoUrl=absolute(logo,source.url);
  return {...source,description:desc,mediaCandidates:[...(imageUrl?[{type:'photo',url:imageUrl}]:[]),...(logoUrl?[{type:'site-icon',url:logoUrl}]:[])].map(m=>({...m,source:source.url,rights:'unverified',approved:false})),status:'found'};
 }catch(e){return {...source,mediaCandidates:[],status:'unavailable',note:e.message}}finally{clearTimeout(timeout)}
}
let cache={expires:0,data:[]};
export async function researchRegisteredVenues(){
 if(Date.now()<cache.expires)return cache.data;
 const data=await Promise.all(sources.map(getMetadata));
 cache={expires:Date.now()+60*60*1000,data};
 return data;
}
