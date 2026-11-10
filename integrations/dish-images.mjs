// Wikimedia Commons image candidates for named dishes; never claim they are photos from the venue.
const queries={
 'La Bandera JALAO':'La bandera dominicana food',
 'Mofongo a la crema':'mofongo',
 'Cóctel JALAO':'cocktail drink',
 'Tacos':'tacos food',
 'Bao buns':'bao buns food',
 'Cócteles artesanales':'cocktail drink',
 'Cóctel JALAO':'tropical rum cocktail',
 'El Mayimbe':'coconut mojito',
 'Sangría JALAO':'sangria',
 'Blue Hawaiian':'blue hawaiian cocktail',
 'Mojito de chinola':'passion fruit mojito',
 'Piña colada':'pina colada cocktail',
 'Dame Deo':'strawberry cocktail',
 'De Color de Rosa':'strawberry martini'
};
Object.assign(queries,{
 "Yaniqueque": "yaniqueque dominican",
 "Croquetas de yuca": "cassava croquettes",
 "Pastelitos de la casa": "dominican empanadas",
 "Croquetas de chivo": "meat croquettes",
 "Quesadilla de chivo": "quesadilla",
 "Chicharrón de cerdo": "chicharron pork",
 "Tabla JALAO": "dominican appetizer platter",
 "Cazuela de mariscos": "seafood stew",
 "Camarones criollos": "shrimp creole",
 "Salmón a la parrilla": "grilled salmon",
 "Ceviche con morir soñando": "shrimp ceviche",
 "Majarete": "majarete",
 "Flan de coco": "coconut flan",
 "Cinco leches": "tres leches cake",
 "Coco horneado": "coconut dessert",
 "Pudín de pan y ciruela": "bread pudding",
 "El Arretao": "old fashioned cocktail",
 "El Abimbao": "long island iced tea cocktail",
 "Mamajuana JALAO": "mamajuana dominican drink",
 "Daiquirí": "daiquiri cocktail",
 "Gin tonic": "gin tonic cocktail",
 "Margarita": "margarita cocktail",
 "Mojito fresa": "strawberry mojito",
 "Mojito tradicional": "mojito cocktail",
 "Sangría": "sangria wine",
 "Santo libre": "rum sprite cocktail",
 "Vodka tonic": "vodka tonic",
 "White Russian": "white russian cocktail",
 "Presidente": "Presidente Dominican beer bottle",
 "Presidente Black": "Presidente Black beer bottle",
 "Corona": "Corona beer bottle",
 "Heineken": "Heineken beer bottle",
 "Modelo": "Modelo beer bottle",
 "Chicharrones Hasta La Tambora": "fried pork chicharron",
 "Chimi de pierna Hasta La Tambora": "dominican chimi sandwich",
 "Quipes de res": "kibbeh fried",
 "Bollitos de yuca": "cassava cheese balls",
 "Pickles Hasta La Tambora": "pickled cucumbers",
 "Aceitunas Hasta La Tambora": "green olives",
 "Casabe gratinado": "cassava flatbread cheese"
});
const cache=new Map();
const normalized=s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!['food','drink','cocktail','plato','bebida','artesanales'].includes(w));
export async function getDishImages(dish){
 const query=queries[dish] || (String(dish||'').trim().slice(0,80)+' food drink');if(!query.trim())return [];
 const previous=cache.get(dish);if(previous&&previous.until>Date.now())return previous.items;
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'30',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640',format:'json'}).toString();
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);
 try{
  const res=await fetch(url,{signal:ctrl.signal,headers:{'user-agent':'PlanA/1.0 (dish reference image search)'}});
  if(!res.ok)throw Error('image service unavailable');
  const data=await res.json();
  const items=Object.values(data.query?.pages||{}).filter(p=>/\.(jpe?g|png|webp)$/i.test(p.title)).map(p=>{
   const info=p.imageinfo?.[0],meta=info?.extmetadata||{};
   return {url:info?.thumburl,source:info?.descriptionurl,title:p.title.replace(/^File:/,''),author:meta.Artist?.value?.replace(/<[^>]*>/g,'').slice(0,180)||'',license:meta.LicenseShortName?.value||'',licenseUrl:meta.LicenseUrl?.value||'',attributionRequired:meta.AttributionRequired?.value==='true'};
  }).filter(x=>x.url?.startsWith('https://')&&x.source?.startsWith('https://')&&/^(CC0|CC BY|Public domain)/i.test(x.license)).map(x=>({...x,score:normalized(query).filter(w=>normalized(x.title).includes(w)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  cache.set(dish,{items,until:Date.now()+6*3600000});return items;
 }finally{clearTimeout(timer)}
}
