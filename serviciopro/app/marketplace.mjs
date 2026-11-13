// Router del marketplace. Importar y montar desde server.mjs después de migraciones.
import {randomUUID} from 'node:crypto';
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const required=(value,name,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw bad('Invalid '+name);return value.trim()};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const can=(user,roles)=>roles.includes(user.role);
export async function marketplaceRoute({pool,method,path,body,user}){
 if(method==='GET'&&path==='/api/marketplace/categories'){
  const r=await pool.query('SELECT id,slug,name FROM sp_categories WHERE active=true ORDER BY name');return {status:200,data:r.rows};
 }
 if(method==='GET'&&path==='/api/marketplace/services'){
  const r=await pool.query('SELECT s.id,s.name,s.pricing_model,s.base_price_dop,c.name AS category FROM sp_services s JOIN sp_categories c ON c.id=s.category_id WHERE s.active=true AND c.active=true ORDER BY c.name,s.name');return {status:200,data:r.rows};
 }
 if(!user)throw bad('Unauthorized',401);
 if(method==='POST'&&path==='/api/marketplace/requests'){
  if(!can(user,['customer']))throw bad('Customer role required',403);
  if(!uuid(body.serviceId))throw bad('Invalid serviceId');
  const service=await pool.query('SELECT pricing_model,base_price_dop FROM sp_services WHERE id=$1 AND active=true',[body.serviceId]);
  if(!service.rowCount)throw bad('Service unavailable',404);
  const r=await pool.query(`INSERT INTO sp_service_requests(customer_user_id,service_id,address_text,description,fixed_price_dop)
  VALUES($1,$2,$3,$4,$5) RETURNING id,status,fixed_price_dop`,[user.userId,body.serviceId,required(body.address,'address'),required(body.description,'description',2000),service.rows[0].pricing_model==='fixed'?service.rows[0].base_price_dop:null]);
  return {status:201,data:r.rows[0]};
 }
 if(method==='GET'&&path==='/api/marketplace/requests'){
  const r=await pool.query('SELECT r.id,r.status,r.created_at,r.fixed_price_dop,s.name AS service FROM sp_service_requests r JOIN sp_services s ON s.id=r.service_id WHERE r.customer_user_id=$1 ORDER BY r.created_at DESC LIMIT 100',[user.userId]);
  return {status:200,data:r.rows};
 }
 if(method==='POST'&&path==='/api/marketplace/quotes'){
  if(!can(user,['provider']))throw bad('Provider role required',403);
  if(!uuid(body.requestId))throw bad('Invalid requestId');
  const amount=Number(body.amountDop);
  if(!Number.isFinite(amount)||amount<0||amount>10000000)throw bad('Invalid amount');
  const client=await pool.connect();try{
   await client.query('BEGIN');
   const p=await client.query('SELECT id FROM sp_provider_profiles WHERE user_id=$1 AND verified=true AND accepting_jobs=true',[user.userId]);
   if(!p.rowCount)throw bad('Provider not verified',403);
   const request=await client.query(`SELECT r.id FROM sp_service_requests r JOIN sp_services s ON s.id=r.service_id
   JOIN sp_provider_services ps ON ps.service_id=s.id AND ps.provider_id=$2
   WHERE r.id=$1 AND r.status='requested' AND s.pricing_model='quote' FOR UPDATE OF r`,[body.requestId,p.rows[0].id]);
   if(!request.rowCount)throw bad('Request not available for quote',409);
   const q=await client.query('INSERT INTO sp_quotes(request_id,provider_id,amount_dop,notes) VALUES($1,$2,$3,$4) RETURNING id,amount_dop,status',[body.requestId,p.rows[0].id,amount,typeof body.notes==='string'?body.notes.slice(0,2000):null]);
   await client.query('COMMIT');return {status:201,data:q.rows[0]};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 if(method==='POST'&&path==='/api/marketplace/accept-quote'){
  if(!can(user,['customer']))throw bad('Customer role required',403);
  if(!uuid(body.requestId)||!uuid(body.quoteId))throw bad('Invalid identifiers');
  const client=await pool.connect();try{
   await client.query('BEGIN');
   const r=await client.query(`SELECT r.id FROM sp_service_requests r JOIN sp_services s ON s.id=r.service_id
   WHERE r.id=$1 AND r.customer_user_id=$2 AND r.status='requested' AND s.pricing_model='quote' FOR UPDATE OF r`,[body.requestId,user.userId]);
   if(!r.rowCount)throw bad('Request not available',409);
   const q=await client.query(`SELECT id,provider_id FROM sp_quotes WHERE id=$1 AND request_id=$2 AND status='pending'`,[body.quoteId,body.requestId]);
   if(!q.rowCount)throw bad('Quote not available',409);
   await client.query(`UPDATE sp_service_requests SET status='accepted',accepted_quote_id=$1,updated_at=now() WHERE id=$2`,[body.quoteId,body.requestId]);
   await client.query(`UPDATE sp_quotes SET status=CASE WHEN id=$1 THEN 'accepted' ELSE 'rejected' END WHERE request_id=$2 AND status='pending'`,[body.quoteId,body.requestId]);
   await client.query('INSERT INTO sp_assignments(request_id,provider_id) VALUES($1,$2)',[body.requestId,q.rows[0].provider_id]);
   await client.query('INSERT INTO sp_request_events(request_id,actor_user_id,from_status,to_status) VALUES($1,$2,$3,$4)',[body.requestId,user.userId,'requested','accepted']);
   await client.query('COMMIT');return {status:200,data:{requestId:body.requestId,status:'accepted'}};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 return null;
}
