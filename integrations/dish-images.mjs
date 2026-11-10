// Wikimedia Commons image candidates for named dishes; never claim they are photos from the venue.
const queries={
 'La Bandera JALAO':'La bandera dominicana food',
 'Mofongo a la crema':'mofongo',
 'Cóctel JALAO':'cocktail drink',
 'Tacos':'tacos food',
 'Bao buns':'bao buns food',
 'Cócteles artesanales':'cocktail drink'
};
const cache=new Map();
export async function getDishImages(dish){
 const query=queries[dish];if(!query)return [];
 const previous=cache.get(dish);if(previous&&previous.until>Date.now())return previous.items;
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:'filetype:bitmap '+query,gsrnamespace:'6',gsrlimit:'15',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640',format:'json'}).toString();
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),6500);
 try{
  const res=await fetch(url,{signal:ctrl.signal,headers:{'user-agent':'PlanA/1.0 (dish reference image search)'}});
  if(!res.ok)throw Error('image service unavailable');
  const data=await res.json();
  const items=Object.values(data.query?.pages||{}).filter(p=>/\.(jpe?g|png|webp)$/i.test(p.title)).map(p=>{
   const info=p.imageinfo?.[0],meta=info?.extmetadata||{};
   return {url:info?.thumburl,source:info?.descriptionurl,title:p.title.replace(/^File:/,''),author:meta.Artist?.value?.replace(/<[^>]*>/g,'').slice(0,180)||'',license:meta.LicenseShortName?.value||'',attributionRequired:meta.AttributionRequired?.value==='true'};
  }).filter(x=>x.url?.startsWith('https://')&&x.source?.startsWith('https://')&&x.license&&!/non-free|fair use/i.test(x.license));
  cache.set(dish,{items,until:Date.now()+6*3600000});return items;
 }finally{clearTimeout(timer)}
}
