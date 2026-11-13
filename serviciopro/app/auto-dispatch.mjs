// Automatic dispatch with transactional locking. Must be mounted after auth and schema migrations.
// Coverage and travel-time are not yet supported; do not deploy as a live matching engine.
const fail=(msg,status=409)=>Object.assign(new Error(msg),{status});
export async function dispatchProvider(client,{requestId,serviceIds,startsAt,endsAt}){
 if(!Array.isArray(serviceIds)||!serviceIds.length)throw fail('No services requested',400);
 const start=new Date(startsAt),end=new Date(endsAt);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>=end||start<=new Date())throw fail('Invalid future appointment',400);
 // One provider must support every requested service and have a covering availability slot.
 const providers=await client.query(`
 SELECT p.id FROM sp_provider_profiles p
 JOIN sp_users u ON u.id=p.user_id
 WHERE p.verified=true AND p.accepting_jobs=true
 AND (SELECT count(DISTINCT ps.service_id)::int FROM sp_provider_services ps WHERE ps.provider_id=p.id AND ps.service_id=ANY($1::uuid[]))=$2
 AND EXISTS (SELECT 1 FROM sp_provider_availability a WHERE a.provider_id=p.id AND a.starts_at<=$3 AND a.ends_at>=$4)
 ORDER BY p.id
 FOR UPDATE OF p SKIP LOCKED LIMIT 30`,[serviceIds,serviceIds.length,start.toISOString(),end.toISOString()]);
 for(const provider of providers.rows){
  const conflict=await client.query(`SELECT 1 FROM sp_provider_bookings WHERE provider_id=$1 AND status='reserved' AND starts_at<$3 AND ends_at>$2 LIMIT 1`,[provider.id,start.toISOString(),end.toISOString()]);
  if(conflict.rowCount)continue;
  await client.query(`INSERT INTO sp_provider_bookings(provider_id,request_id,starts_at,ends_at) VALUES($1,$2,$3,$4)`,[provider.id,requestId,start.toISOString(),end.toISOString()]);
  await client.query('INSERT INTO sp_assignments(request_id,provider_id) VALUES($1,$2)',[requestId,provider.id]);
  return {providerId:provider.id,startsAt:start.toISOString(),endsAt:end.toISOString()};
 }
 throw fail('No verified provider available for this time slot');
}
