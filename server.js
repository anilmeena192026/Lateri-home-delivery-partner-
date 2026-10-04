const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const ROOT=__dirname, PUB=path.join(ROOT,'public'), DB=path.join(ROOT,'data.json');
const seed={
 users:[
  {id:'u1',name:'Admin',phone:'9999999999',role:'admin',pin:'1234'},
  {id:'u2',name:'Sharma General Store',phone:'9999999991',role:'shop',pin:'1111',shopId:'s1'},
  {id:'u3',name:'Delivery Partner 1',phone:'9999999992',role:'delivery',pin:'2222'},
  {id:'u4',name:'Demo Customer',phone:'9999999993',role:'customer',pin:'3333',address:'Lateri, Madhya Pradesh'}
 ],
 shops:[
  {id:'s1',name:'Sharma General Store',category:'Grocery',address:'Main Market, Lateri',open:true,eta:'30–40 min'},
  {id:'s2',name:'Gupta Kirana',category:'Grocery',address:'Bus Stand Road, Lateri',open:true,eta:'30–45 min'},
  {id:'s3',name:'Maa Food Corner',category:'Food',address:'Station Road, Lateri',open:true,eta:'25–35 min'}
 ],
 products:[
  {id:'p1',shopId:'s1',name:'Aashirvaad Atta 5kg',price:280,stock:20,unit:'pack'},
  {id:'p2',shopId:'s1',name:'Fortune Oil 1L',price:145,stock:30,unit:'bottle'},
  {id:'p3',shopId:'s1',name:'Tata Salt 1kg',price:28,stock:50,unit:'pack'},
  {id:'p4',shopId:'s2',name:'Amul Milk 1L',price:68,stock:25,unit:'packet'},
  {id:'p5',shopId:'s2',name:'Sugar 1kg',price:48,stock:40,unit:'pack'},
  {id:'p6',shopId:'s3',name:'Veg Thali',price:120,stock:15,unit:'plate'}
 ],
 orders:[]
};
if(!fs.existsSync(DB)) fs.writeFileSync(DB,JSON.stringify(seed,null,2));
function db(){return JSON.parse(fs.readFileSync(DB,'utf8'))} function save(x){fs.writeFileSync(DB,JSON.stringify(x,null,2))}
function send(res,status,obj,type='application/json'){res.writeHead(status,{'Content-Type':type,'Access-Control-Allow-Origin':'*'});res.end(type==='application/json'?JSON.stringify(obj):obj)}
function parseBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}})})}
function id(p){return p+crypto.randomBytes(4).toString('hex')}
function publicUser(u){let x={...u};delete x.pin;return x}
async function api(req,res){
 const url=new URL(req.url,'http://localhost'); const p=url.pathname; const method=req.method;
 if(method==='OPTIONS')return send(res,204,'','text/plain');
 if(p==='/api/login'&&method==='POST'){
  const b=await parseBody(req), d=db(); const u=d.users.find(x=>x.phone===b.phone&&x.pin===b.pin&&x.role===b.role);
  if(!u)return send(res,401,{error:'Invalid login'}); return send(res,200,{user:publicUser(u)});
 }
 const d=db();
 if(p==='/api/shops') return send(res,200,{shops:d.shops});
 if(p==='/api/products') {let sid=url.searchParams.get('shopId'); return send(res,200,{products:sid?d.products.filter(x=>x.shopId===sid):d.products});}
 if(p==='/api/orders'&&method==='GET') {let role=url.searchParams.get('role'),uid=url.searchParams.get('userId'),shop=url.searchParams.get('shopId');let o=d.orders;if(role==='shop')o=o.filter(x=>x.shopId===shop);if(role==='delivery')o=o.filter(x=>x.deliveryId===uid||x.status==='ready_for_delivery');if(role==='customer')o=o.filter(x=>x.customerId===uid);return send(res,200,{orders:o});}
 if(p==='/api/orders'&&method==='POST'){
  const b=await parseBody(req); if(!b.items?.length)return send(res,400,{error:'Cart empty'});
  let shop=d.shops.find(x=>x.id===b.shopId); if(!shop)return send(res,400,{error:'Shop not found'});
  let total=0; for(const item of b.items){let pr=d.products.find(x=>x.id===item.productId);if(!pr||pr.stock<item.qty)return send(res,400,{error:'Stock unavailable for '+(pr?.name||'item')});total+=pr.price*item.qty}
  for(const item of b.items){let pr=d.products.find(x=>x.id===item.productId);pr.stock-=item.qty}
  const order={id:id('ORD-'),customerId:b.customerId||'guest',customerName:b.customerName||'Customer',phone:b.phone||'',address:b.address||'Lateri, Madhya Pradesh',shopId:shop.id,shopName:shop.name,items:b.items,total,payment:b.payment||'COD',status:'placed',deliveryId:null,createdAt:new Date().toISOString()};d.orders.unshift(order);save(d);return send(res,201,{order});
 }
 if(p.startsWith('/api/orders/')&&method==='PATCH'){
  const oid=p.split('/').pop(), b=await parseBody(req), o=d.orders.find(x=>x.id===oid); if(!o)return send(res,404,{error:'Order not found'});
  if(b.status)o.status=b.status; if(b.deliveryId)o.deliveryId=b.deliveryId; save(d);return send(res,200,{order:o});
 }
 if(p==='/api/shop/products'&&method==='POST'){
  const b=await parseBody(req); if(!b.shopId||!b.name||!b.price)return send(res,400,{error:'shopId, name, price required'});const pr={id:id('P-'),shopId:b.shopId,name:b.name,price:Number(b.price),stock:Number(b.stock||0),unit:b.unit||'piece'};d.products.push(pr);save(d);return send(res,201,{product:pr});
 }
 if(p==='/api/shop/products'&&method==='PATCH'){
  const b=await parseBody(req),pr=d.products.find(x=>x.id===b.id);if(!pr)return send(res,404,{error:'Product not found'});['name','price','stock','unit'].forEach(k=>{if(b[k]!==undefined)pr[k]=k==='price'||k==='stock'?Number(b[k]):b[k]});save(d);return send(res,200,{product:pr});
 }
 if(p==='/api/admin/summary') return send(res,200,{shops:d.shops.length,products:d.products.length,orders:d.orders.length,revenue:d.orders.reduce((a,o)=>a+o.total,0),pending:d.orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length});
 send(res,404,{error:'Not found'});
}
const server=http.createServer((req,res)=>{if(req.url.startsWith('/api/'))return api(req,res).catch(e=>send(res,500,{error:e.message}));let file=req.url==='/'?'/index.html':req.url;file=path.normalize(file).replace(/^\.\./,'');let fp=path.join(PUB,file);if(!fs.existsSync(fp)||!fs.statSync(fp).isFile())fp=path.join(PUB,'index.html');let ext=path.extname(fp);let ct={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json'}[ext]||'application/octet-stream';send(res,200,fs.readFileSync(fp),ct)});
server.listen(process.env.PORT||3000,()=>console.log('Lateri Home Delivery Partner running on http://localhost:'+(process.env.PORT||3000)));
