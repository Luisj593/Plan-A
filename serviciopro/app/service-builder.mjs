// API de armado de presupuesto y aceptación. Integrar al servidor después de adaptar autenticación.
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const isUuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export async function serviceBuilderRoute({pool,method,path,body={},user}){
 if(method==='GET'&&path==='/api/builder/options'){
  const r=await pool.query(`SELECT o.id,o.service_id,o.name,o.description,o.unit,o.unit_price_dop,o.requires_quote,s.name AS service,c.name AS category
  FROM sp_service_options o JOIN sp_services s ON s.id=o.service_id JOIN sp_categories c ON c.id=s.category_id
  WHERE o.active AND s.active AND c.active ORDER BY c.name,s.name,o.name`);
  return {status:200,data:r.rows};
 }
 if(!user||user.role!=='customer')throw error('Customer authentication required',403);
 if(method==='POST'&&path==='/api/builder/preview'){
  const items=body.items;
  if(!Array.isArray(items)||items.length<1||items.length>30)throw error('Select 1 to 30 options');
  if(items.some(i=>!isUuid(i.optionId)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100))throw error('Invalid item');
  const ids=items.map(i=>i.optionId);
  if(new Set(ids).size!==ids.length)throw error('Duplicate options');
  const r=await pool.query(`SELECT o.id,o.name,o.service_id,o.unit_price_dop,o.requires_quote,s.name AS service
  FROM sp_service_options o JOIN sp_services s ON s.id=o.service_id
  WHERE o.id=ANY($1::uuid[]) AND o.active AND s.active`,[ids]);
  if(r.rowCount!==ids.length)throw error('Option unavailable',409);
  const lookup=new Map(r.rows.map(x=>[x.id,x]));
  const lines=items.map(i=>{const o=lookup.get(i.optionId);const unit=o.unit_price_dop===null?null:Number(o.unit_price_dop);return {optionId:o.id,serviceId:o.service_id,name:o.name,service:o.service,quantity:i.quantity,unitPriceDop:unit,lineTotalDop:unit===null?null:Math.round(unit*i.quantity*100)/100,requiresQuote:o.requires_quote}});
  const subtotal=lines.reduce((sum,l)=>sum+(l.lineTotalDop||0),0);
  return {status:200,data:{lines,subtotalDop:subtotal,requiresManualQuote:lines.some(l=>l.requiresQuote),currency:'DOP',note:'No incluye cargos adicionales que deban informarse antes de confirmar'}};
 }
 if(method==='POST'&&path==='/api/builder/confirm'){
  if(!isUuid(body.providerId))throw error('Select a provider');
  if(typeof body.address!=='string'||!body.address.trim()||body.address.length>500)throw error('Invalid address');
  if(typeof body.description!=='string'||body.description.length>2000)throw error('Invalid description');
  const preview=await serviceBuilderRoute({pool,method:'POST',path:'/api/builder/preview',body,user});
  const lines=preview.data.lines;
  if(preview.data.requiresManualQuote)throw error('Manual quote required before final acceptance',409);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const provider=await client.query(`SELECT p.id FROM sp_provider_profiles p WHERE p.id=$1 AND p.verified=true AND p.accepting_jobs=true FOR UPDATE`,[body.providerId]);
   if(!provider.rowCount)throw error('Provider unavailable',409);
   const supported=await client.query('SELECT service_id FROM sp_provider_services WHERE provider_id=$1',[body.providerId]);
   const allowed=new Set(supported.rows.map(r=>r.service_id));
   if(lines.some(l=>!allowed.has(l.serviceId)))throw error('Provider does not offer all selected services',409);
   const ids=lines.map(l=>l.optionId);
   const current=await client.query(`SELECT id,service_id,unit_price_dop,requires_quote FROM sp_service_options WHERE id=ANY($1::uuid[]) AND active=true FOR UPDATE`,[ids]);
   if(current.rowCount!==lines.length)throw error('Options changed',409);
   const fresh=new Map(current.rows.map(r=>[r.id,r]));
   if(lines.some(l=>fresh.get(l.optionId).requires_quote||Number(fresh.get(l.optionId).unit_price_dop)!==l.unitPriceDop))throw error('Prices changed; refresh quote',409);
   const serviceId=lines[0].serviceId;
   // A request may include options from several services; service_id is a primary reference only.
   const request=await client.query(`INSERT INTO sp_service_requests(customer_user_id,service_id,address_text,description,status,selected_provider_id,estimated_total_dop,confirmed_at)
   VALUES($1,$2,$3,$4,'accepted',$5,$6,now()) RETURNING id,status,estimated_total_dop`,[user.userId,serviceId,body.address.trim(),body.description,body.providerId,preview.data.subtotalDop]);
   for(const l of lines)await client.query(`INSERT INTO sp_request_items(request_id,service_id,option_id,quantity,unit_price_dop) VALUES($1,$2,$3,$4,$5)`,[request.rows[0].id,l.serviceId,l.optionId,l.quantity,l.unitPriceDop]);
   await client.query('INSERT INTO sp_assignments(request_id,provider_id) VALUES($1,$2)',[request.rows[0].id,body.providerId]);
   await client.query(`INSERT INTO sp_request_events(request_id,actor_user_id,from_status,to_status) VALUES($1,$2,'requested','accepted')`,[request.rows[0].id,user.userId]);
   await client.query('COMMIT');
   return {status:201,data:{...request.rows[0],providerId:body.providerId,assigned:true}};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 return null;
}
