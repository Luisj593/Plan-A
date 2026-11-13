import http from 'node:http';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const port=Number(process.env.PORT||3000);
const companies=[];const campaigns=[];
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))};
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw Error('Datos demasiado grandes')}try{return JSON.parse(raw)}catch{throw Error('JSON inválido')}}
const clean=v=>String(v??'').trim();
http.createServer(async(req,res)=>{
const url=new URL(req.url,'http://localhost');
if(url.pathname==='/health')return send(res,200,{status:'ok',app:'NEXXUS',mode:'multi-company-prototype'});
if(url.pathname==='/api/companies'&&req.method==='GET')return send(res,200,{companies});
if(url.pathname==='/api/companies'&&req.method==='POST'){try{const d=await body(req);const name=clean(d.name),industry=clean(d.industry),description=clean(d.description),audience=clean(d.audience);if(!name||name.length>120||industry.length>100||description.length>1000||audience.length>500)return send(res,400,{error:'Datos de empresa inválidos'});const company={id:randomUUID(),name,industry,description,audience,createdAt:new Date().toISOString()};companies.push(company);return send(res,201,company)}catch(e){return send(res,400,{error:e.message})}}
if(url.pathname==='/api/campaigns'&&req.method==='GET'){const companyId=clean(url.searchParams.get('companyId'));if(!companyId)return send(res,400,{error:'Selecciona una empresa'});if(!companies.some(c=>c.id===companyId))return send(res,404,{error:'Empresa no encontrada'});return send(res,200,{campaigns:campaigns.filter(c=>c.companyId===companyId)})}
if(url.pathname==='/api/campaigns'&&req.method==='POST'){try{const d=await body(req);const companyId=clean(d.companyId),name=clean(d.name),platform=clean(d.platform),budget=Number(d.budget);if(!companies.some(c=>c.id===companyId))return send(res,400,{error:'Debes crear y seleccionar una empresa antes de crear campañas'});if(!name||name.length>120||!['Meta','Google','TikTok','LinkedIn'].includes(platform)||!Number.isFinite(budget)||budget<=0||budget>100000000)return send(res,400,{error:'Datos de campaña inválidos'});const campaign={id:randomUUID(),companyId,name,platform,budget,status:'Borrador',createdAt:new Date().toISOString()};campaigns.push(campaign);return send(res,201,campaign)}catch(e){return send(res,400,{error:e.message})}}
if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return fs.createReadStream(new URL('./index.html',import.meta.url)).pipe(res)}
return send(res,404,{error:'No encontrado'});
}).listen(port,'0.0.0.0');