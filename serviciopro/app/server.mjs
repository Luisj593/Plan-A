import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
if (!SECRET || SECRET.length < 32 || !DATABASE_URL) throw new Error('Set DATABASE_URL and JWT_SECRET (32+ chars)');
const pool = new Pool({connectionString:DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined});
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
const read=async req=>{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw Object.assign(new Error('Payload too large'),{status:413});}try{return JSON.parse(raw||'{}')}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}};
const required=(v,name)=>{if(typeof v!=='string'||!v.trim()||v.length>250)throw Object.assign(new Error('Invalid '+name),{status:400});return v.trim()};
const auth=req=>{try{const token=(req.headers.authorization||'').replace(/^Bearer /,'');const user=jwt.verify(token,SECRET,{algorithms:['HS256']});if(!user.companyId||!user.userId)throw Error();return user}catch{throw Object.assign(new Error('Unauthorized'),{status:401})}};
const sendError=(res,e)=>json(res,e.status||500,{error:e.status?e.message:'Internal server error'});
const server=http.createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost');const path=url.pathname;
if(req.method==='GET'&&path==='/health')return json(res,200,{status:'ok'});
if(req.method==='GET'&&path==='/'){const html=await readFile(new URL('./public/index.html',import.meta.url));res.writeHead(200,{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff'});return res.end(html);}
if(req.method==='POST'&&path==='/api/register'){const b=await read(req),company=required(b.company,'company'),name=required(b.name,'name'),email=required(b.email,'email').toLowerCase(),password=b.password;
if(!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<12)return json(res,400,{error:'Valid email and 12+ character password required'});
const client=await pool.connect();try{await client.query('BEGIN');const c=await client.query('INSERT INTO sp_companies(name) VALUES($1) RETURNING id',[company]);const hash=await bcrypt.hash(password,12);const u=await client.query("INSERT INTO sp_users(company_id,email,name,role,password_hash) VALUES($1,$2,$3,'admin',$4) RETURNING id",[c.rows[0].id,email,name,hash]);await client.query('COMMIT');return json(res,201,{companyId:c.rows[0].id,userId:u.rows[0].id})}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
if(req.method==='POST'&&path==='/api/login'){const b=await read(req);const r=await pool.query('SELECT id,company_id,role,password_hash FROM sp_users WHERE email=$1 AND company_id=$2',[required(b.email,'email').toLowerCase(),required(b.companyId,'companyId')]);if(!r.rows[0]||!await bcrypt.compare(String(b.password||''),r.rows[0].password_hash))return json(res,401,{error:'Invalid credentials'});const u=r.rows[0];return json(res,200,{token:jwt.sign({userId:u.id,companyId:u.company_id,role:u.role},SECRET,{expiresIn:'8h',algorithm:'HS256'})})}
if(!path.startsWith('/api/'))return json(res,404,{error:'Not found'});
const user=auth(req);
if(req.method==='GET'&&path==='/api/summary'){const [customers,orders]=await Promise.all([pool.query('SELECT count(*)::int AS total FROM sp_customers WHERE company_id=$1',[user.companyId]),pool.query('SELECT status,count(*)::int AS total FROM sp_work_orders WHERE company_id=$1 GROUP BY status',[user.companyId])]);return json(res,200,{customers:customers.rows[0].total,orders:orders.rows})}
if(req.method==='GET'&&path==='/api/customers'){const r=await pool.query('SELECT id,name,phone,email,address,created_at FROM sp_customers WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200',[user.companyId]);return json(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/customers'){if(!['admin','supervisor'].includes(user.role))return json(res,403,{error:'Forbidden'});const b=await read(req);const r=await pool.query('INSERT INTO sp_customers(company_id,name,phone,email,address) VALUES($1,$2,$3,$4,$5) RETURNING id,name,phone,email,address',[user.companyId,required(b.name,'name'),b.phone||null,b.email||null,b.address||null]);return json(res,201,r.rows[0])}
if(req.method==='GET'&&path==='/api/orders'){const r=await pool.query('SELECT o.id,o.title,o.description,o.status,o.created_at,c.name AS customer FROM sp_work_orders o JOIN sp_customers c ON c.id=o.customer_id AND c.company_id=o.company_id WHERE o.company_id=$1 ORDER BY o.created_at DESC LIMIT 200',[user.companyId]);return json(res,200,r.rows)}
if(req.method==='POST'&&path==='/api/orders'){if(!['admin','supervisor'].includes(user.role))return json(res,403,{error:'Forbidden'});const b=await read(req);const r=await pool.query('INSERT INTO sp_work_orders(company_id,customer_id,title,description) VALUES($1,$2,$3,$4) RETURNING id,title,status',[user.companyId,required(b.customerId,'customerId'),required(b.title,'title'),b.description||null]);return json(res,201,r.rows[0])}
return json(res,404,{error:'Not found'});
}catch(e){if(e.code==='23503')return json(res,400,{error:'Customer not found in this company'});if(e.code==='23505')return json(res,409,{error:'Duplicate record'});console.error(e.message);sendError(res,e)}});
server.listen(PORT,()=>console.log('ServicioPro listening on',PORT));
