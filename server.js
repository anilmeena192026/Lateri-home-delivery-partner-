import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const DB=path.join(__dirname,'data','db.json');
const publicDir=path.join(__dirname,'public');
fs.mkdirSync(path.dirname(DB),{recursive:true});
const seed={users:[],shops:[{id:'shop_1',name:'Lateri Fresh Mart',phone:'9999999999',address:'Main Market, Lateri',lat:24.0582,lng:77.4058,open:true}],products:[
{id:'p1',shopId:'shop_1',name:'Aashirvaad Atta 5kg',price:299,stock:20,category:'Grocery',emoji:'🌾'},
{id:'p2',shopId:'shop_1',name:'Fortune Sunflower Oil 1L',price:145,stock:25,category:'Grocery',emoji:'🫗'},
{id:'p3',shopId:'shop_1',name:'Tata Salt 1kg',price:30,stock:50,category:'Grocery',emoji:'🧂'},
{id:'p4',shopId:'shop_1',name:'Amul Milk 1L',price:68,stock:30,category:'Dairy',emoji:'🥛'},
{id:'p5',shopId:'shop_1',name:'Parle-G Biscuits',price:20,stock:60,category:'Snacks',emoji:'🍪'},
{id:'p6',shopId:'shop_1',name:'Maggi 2-Minute Noodles',price:15,stock:70,category:'Snacks',emoji:'🍜'}],orders:[],otp:{},delivery:[]};
function load(){try{return JSON.parse(fs.readFileSync(DB,'utf8'))}catch{fs.writeFileSync(DB,JSON.stringify(seed,null,2));return structuredClone(seed)}}
let db=load();
function save(){fs.writeFileSync(DB,JSON.stringify(db,null,2))}
const sessions=new Map();
const attempts=new Map();
const STATUS=['PLACED','CONFIRMED','PACKED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
const roles=['CUSTOMER','ADMIN','SHOP','DELIVERY'];
function id(p='id'){return p+'_'+crypto.randomBytes(7).toString('hex')}
function publicUser(u){return u&&{id:u.id,name:u.name,phone:u.phone,address:u.address||'',role:u.role||'CUSTOMER'}}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'GET,POST,PUT,PATCH,OPTIONS'});res.end(JSON.stringify(data))}
async function body(req){let s='';for await(const c of req)s+=c;if(s.length>1e6)throw Error('Payload too large');try{return s?JSON.parse(s):{}}catch{throw Error('Invalid JSON')}}
function token(){return crypto.randomBytes(32).toString('hex')}
function auth(req){const t=(req.headers.authorization||'').replace(/^Bearer\s+/,'');const a=sessions.get(t);return a?{token:t,...a}:null}
function requireAuth(req,res,rolesAllowed){const a=auth(req);if(!a)return json(res,401,{error:'Login required'});if(rolesAllowed&&!rolesAllowed.includes(a.role))return json(res,403,{error:'Access denied'});return a}
function safeOrder(o){return {...o,items:o.items.map(x=>({...x})),history:o.history.map(x=>({...x}))}}
function setSession(userId,role){const t=token();sessions.set(t,{userId,role,createdAt:Date.now()});return t}
function customerFor(req){const a=auth(req);return a&&db.users.find(u=>u.id===a.userId)}
function now(){return new Date().toISOString()}
async function api(req,res){
 const u=new URL(req.url,'http://localhost');const p=u.pathname;
 if(req.method==='OPTIONS')return json(res,204,{});
 if(p==='/api/health')return json(res,200,{ok:true,service:'Lateri Home Delivery Partner',version:'2.0.0',time:now()});
 if(p==='/api/catalog'&&req.method==='GET')return json(res,200,{shops:db.shops,products:db.products.filter(x=>x.stock>0)});
 if(p==='/api/auth/request-otp'&&req.method==='POST'){
   const b=await body(req),phone=String(b.phone||'').replace(/\D/g,''); if(!/^\d{10}$/.test(phone))return json(res,400,{error:'10 digit mobile number required'});
   const a=attempts.get(phone)||{count:0,at:0};if(Date.now()-a.at<60000&&a.count>=5)return json(res,429,{error:'Too many OTP requests. Try again in 1 minute.'});
   attempts.set(phone,{count:a.count+1,at:Date.now()});const code=process.env.DEMO_OTP===undefined?'123456':process.env.DEMO_OTP;
   if(!code)return json(res,501,{error:'SMS provider is not configured. Set DEMO_OTP for testing or connect your SMS provider.'});
   db.otp[phone]={code:String(code),expires:Date.now()+300000};save();return json(res,200,{ok:true,message:'OTP generated/sent',demoOtp:process.env.NODE_ENV==='production'?undefined:String(code)});
 }
 if(p==='/api/auth/verify-otp'&&req.method==='POST'){
   const b=await body(req),phone=String(b.phone||'').replace(/\D/g,'');const rec=db.otp[phone];if(!rec||rec.expires<Date.now()||rec.code!==String(b.otp||''))return json(res,401,{error:'Invalid or expired OTP'});
   let user=db.users.find(x=>x.phone===phone);if(!user){user={id:id('usr'),phone,name:String(b.name||'Customer').slice(0,80),address:'',role:'CUSTOMER',createdAt:now()};db.users.push(user)}delete db.otp[phone];save();return json(res,200,{token:setSession(user.id,user.role),user:publicUser(user)});
 }
 if(p==='/api/auth/staff-login'&&req.method==='POST'){
   const b=await body(req),role=String(b.role||'').toUpperCase(),password=String(b.password||'');if(!roles.includes(role)||role==='CUSTOMER')return json(res,400,{error:'Invalid staff role'});
   const expected=role==='ADMIN'?process.env.ADMIN_PASSWORD:role==='SHOP'?process.env.SHOP_ADMIN_PASSWORD:process.env.DELIVERY_ADMIN_PASSWORD;
   const fallback=role==='ADMIN'?'admin123':role==='SHOP'?'shop123':'delivery123';if(password!==(expected||fallback))return json(res,401,{error:'Invalid credentials'});
   return json(res,200,{token:setSession(role.toLowerCase(),role),user:{id:role.toLowerCase(),name:role+' User',phone:'',address:'',role}});
 }
 const a=auth(req),user=customerFor(req);
 if(p==='/api/me'&&req.method==='GET'){if(!user)return json(res,401,{error:'Login required'});return json(res,200,{user:publicUser(user)})}
 if(p==='/api/me'&&req.method==='PUT'){if(!user)return json(res,401,{error:'Login required'});const b=await body(req);user.name=String(b.name??user.name).slice(0,80);user.address=String(b.address??user.address).slice(0,250);save();return json(res,200,{user:publicUser(user)})}
 if(p==='/api/orders'&&req.method==='POST'){
   if(!user)return json(res,401,{error:'Login required'});const b=await body(req);if(!Array.isArray(b.items)||!b.items.length)return json(res,400,{error:'Cart is empty'});if(!String(b.address||user.address).trim())return json(res,400,{error:'Delivery address required'});
   const items=[];let subtotal=0;for(const x of b.items){const pr=db.products.find(z=>z.id===x.productId);const qty=Math.max(1,Math.min(99,Number(x.qty)||1));if(!pr||pr.stock<qty)return json(res,400,{error:`Stock unavailable for ${pr?.name||'item'}`});items.push({productId:pr.id,shopId:pr.shopId,name:pr.name,price:pr.price,qty});subtotal+=pr.price*qty}
   for(const i of items)db.products.find(x=>x.id===i.productId).stock-=i.qty;const fee=subtotal>=499?0:30;const t=now();const order={id:id('ORD'),userId:user.id,items,subtotal,deliveryFee:fee,total:subtotal+fee,paymentMethod:String(b.paymentMethod||'COD'),paymentStatus:'PENDING',status:'PLACED',address:String(b.address||user.address).slice(0,250),customerName:user.name,customerPhone:user.phone,deliveryBoyId:null,createdAt:t,updatedAt:t,history:[{status:'PLACED',at:t}]};db.orders.unshift(order);save();return json(res,201,{order:safeOrder(order)})
 }
 if(p==='/api/orders'&&req.method==='GET'){if(!user)return json(res,401,{error:'Login required'});return json(res,200,{orders:db.orders.filter(o=>o.userId===user.id).map(safeOrder)})}
 const om=p.match(/^\/api\/orders\/([^/]+)$/);if(om&&req.method==='GET'){if(!user)return json(res,401,{error:'Login required'});const o=db.orders.find(x=>x.id===om[1]&&x.userId===user.id);if(!o)return json(res,404,{error:'Order not found'});return json(res,200,{order:safeOrder(o)})}
 if(p==='/api/shop/orders'&&req.method==='GET'){if(!requireAuth(req,res,['SHOP','ADMIN']))return;return json(res,200,{orders:db.orders.map(safeOrder)})}
 if(p==='/api/delivery/orders'&&req.method==='GET'){if(!requireAuth(req,res,['DELIVERY','ADMIN']))return;return json(res,200,{orders:db.orders.filter(o=>['PACKED','OUT_FOR_DELIVERY'].includes(o.status)).map(safeOrder)})}
 if(p==='/api/admin/orders'&&req.method==='GET'){if(!requireAuth(req,res,['ADMIN']))return;return json(res,200,{orders:db.orders.map(safeOrder)})}
 const sm=p.match(/^\/api\/(?:admin|shop)\/orders\/([^/]+)$/);if(sm&&req.method==='PATCH'){
   const aa=requireAuth(req,res,['ADMIN','SHOP']);if(!aa)return;const b=await body(req),o=db.orders.find(x=>x.id===sm[1]);if(!o)return json(res,404,{error:'Order not found'});if(!STATUS.includes(b.status))return json(res,400,{error:'Invalid status'});
   o.status=b.status;o.updatedAt=now();o.history.push({status:b.status,at:o.updatedAt});if(b.status==='DELIVERED')o.paymentStatus=o.paymentMethod==='COD'?'PAID':o.paymentStatus;save();return json(res,200,{order:safeOrder(o)})
 }
 const dm=p.match(/^\/api\/delivery\/orders\/([^/]+)$/);if(dm&&req.method==='PATCH'){
   const aa=requireAuth(req,res,['DELIVERY','ADMIN']);if(!aa)return;const b=await body(req),o=db.orders.find(x=>x.id===dm[1]);if(!o)return json(res,404,{error:'Order not found'});if(!['OUT_FOR_DELIVERY','DELIVERED'].includes(b.status))return json(res,400,{error:'Delivery can only set OUT_FOR_DELIVERY or DELIVERED'});o.status=b.status;o.updatedAt=now();o.history.push({status:b.status,at:o.updatedAt});if(b.lat&&b.lng)o.deliveryLocation={lat:Number(b.lat),lng:Number(b.lng),at:o.updatedAt};if(b.status==='DELIVERED'&&o.paymentMethod==='COD')o.paymentStatus='PAID';save();return json(res,200,{order:safeOrder(o)})
 }
 if(p==='/api/admin/products'&&req.method==='POST'){if(!requireAuth(req,res,['ADMIN','SHOP']))return;const b=await body(req);const pr={id:id('p'),shopId:String(b.shopId||'shop_1'),name:String(b.name||'New Product').slice(0,100),price:Math.max(0,Number(b.price)||0),stock:Math.max(0,Number(b.stock)||0),category:String(b.category||'General').slice(0,40),emoji:String(b.emoji||'🛍️')};db.products.push(pr);save();return json(res,201,{product:pr})}
 if(p==='/api/admin/stats'&&req.method==='GET'){if(!requireAuth(req,res,['ADMIN']))return;const revenue=db.orders.filter(o=>o.status==='DELIVERED').reduce((a,o)=>a+o.total,0);return json(res,200,{users:db.users.length,products:db.products.length,orders:db.orders.length,revenue})}
 return null;
}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/api/')){const handled=await api(req,res);if(handled!==null)return}let file=req.url==='/'?'/index.html':req.url.split('?')[0];const fp=path.join(publicDir,path.normalize(file));if(!fp.startsWith(publicDir))return res.writeHead(403).end();if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())return res.writeHead(404).end('Not found');res.writeHead(200,{'content-type':mime[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res)}catch(e){console.error(e);json(res,500,{error:e.message||'Server error'})}});
server.listen(PORT,()=>console.log(`Lateri Home Delivery Partner v1 running on http://localhost:${PORT}`));
