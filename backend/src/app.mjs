import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { registerSchema,loginSchema,bookingSchema,datesSchema,roomSchema,resortSchema,nightsBetween,calculatePrice,calculateRefund } from './validation.mjs';

export function createApp(db, options = {}) {
  const production = process.env.NODE_ENV === 'production';
  const demoMode = options.demoMode ?? (!production && process.env.DEMO_MODE !== 'false');
  const secret = process.env.JWT_SECRET || (!production ? randomBytes(48).toString('hex') : '');
  if (secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3002').split(',').map(s=>s.trim());
  const uploadDirectory=process.env.UPLOAD_DIR||fileURLToPath(new URL('../.data/uploads',import.meta.url));
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || origins.includes(origin)), credentials: true }));
  app.use(express.json({ limit: '64kb' }));
  app.use((req,res,next) => {
    res.set('X-Content-Type-Options','nosniff');
    res.set('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && (req.get('X-Requested-With') !== 'ResortHub' || (req.get('Origin') && !origins.includes(req.get('Origin'))))) return res.status(403).json({error:'Request origin could not be verified.'});
    next();
  });
  const fail = (status,message) => Object.assign(new Error(message),{status});
  const publicUser = ({id,name,email,role}) => ({id,name,email,role});
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: production, path: '/', maxAge: 86400000 };
  const cookieName=req=>`resort_session_${['admin','hotel'].includes(req.get('X-Portal'))?req.get('X-Portal'):'customer'}`;
  const setSession = (req,res,user) => res.cookie(cookieName(req),jwt.sign({sub:user.id,v:user.session_version||0},secret,{expiresIn:'1d',issuer:'bandarban-resort-hub',audience:'resort-hub-apps'}),cookieOptions);
  const auth = async (req,res,next) => {
    try {
      const rawCookie = req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(req)+'='));
      const token = rawCookie && decodeURIComponent(rawCookie.slice(cookieName(req).length+1));
      if (!token) throw new Error();
      const claim = jwt.verify(token,secret,{issuer:'bandarban-resort-hub',audience:'resort-hub-apps'});
      req.user = await db.get('SELECT id,name,email,role,session_version FROM users WHERE id = ?',[claim.sub]);
      if (!req.user || (claim.v||0)!==req.user.session_version) throw new Error();
      req.user=publicUser(req.user);
      next();
    } catch { next(fail(401,'Please sign in to continue.')); }
  };
  const roles = (...allowed) => (req,res,next) => allowed.includes(req.user.role) ? next() : next(fail(403,'You do not have permission to perform this action.'));
  const limiter = new Map();
  const rateLimit = (req,res,next) => {
    const key=req.ip; const now=Date.now();
    if(limiter.size>1000) for(const [key,value] of limiter) if(value.reset<now) limiter.delete(key);
    const entry=limiter.get(key); const current=entry && entry.reset>now ? entry : {count:0,reset:now+900000};
    current.count++; limiter.set(key,current);
    if(current.count>30) return next(fail(429,'Too many attempts. Please try again in 15 minutes.'));
    next();
  };
  const resortJSON = (row) => ({...JSON.parse(row.metadata),id:row.id,name:row.name,area:row.area,location:row.location,price:row.price,status:row.status,ownerId:row.owner_id});
  async function publicResort(row){
    const base=resortJSON(row);const rooms=(await db.all('SELECT * FROM rooms WHERE resort_id=? AND enabled=1 ORDER BY price',[row.id])).map(roomJSON);
    return {...base,room:rooms[0]?.name||'No open rooms',capacity:rooms.length?Math.max(...rooms.map(r=>r.capacity)):0,roomTypeCount:rooms.length,amenities:[...new Set([...base.amenities,...rooms.flatMap(r=>r.amenities||[])]) ]};
  }
  const roomJSON = row => ({...row,...JSON.parse(row.metadata)});
  const bookingJSON = row => ({id:row.id,resortId:row.resort_id,roomId:row.room_id,room:row.room_name,resortName:row.resort_name,userName:row.guest_name,userEmail:row.user_email,phone:row.phone,checkIn:row.check_in,checkOut:row.check_out,guests:row.guests,rooms:row.room_count,name:row.guest_name,total:row.total,advance:row.advance,status:row.status,refund:row.refund,createdAt:row.created_at});
  const bookingsQuery = 'SELECT b.*,r.name AS resort_name,rm.name AS room_name,u.email AS user_email FROM bookings b JOIN resorts r ON r.id=b.resort_id JOIN rooms rm ON rm.id=b.room_id JOIN users u ON u.id=b.user_id';
  const ownsResort = async (user,id) => {
    const resort=await db.get('SELECT * FROM resorts WHERE id = ?',[id]);
    if(!resort) throw fail(404,'Resort not found.');
    if(user.role!=='admin' && resort.owner_id!==user.id) throw fail(403,'You can only manage your own resorts.');
    return resort;
  };
  function peakUsage(intervals,from='0000-01-01',to='9999-12-31') {
    const points=new Map();
    for(const row of intervals){const start=row.startAt<from?from:row.startAt;const end=row.endAt>to?to:row.endAt;if(start>=end)continue;points.set(start,(points.get(start)||0)+Number(row.count));points.set(end,(points.get(end)||0)-Number(row.count));}
    let count=0,peak=0;for(const key of [...points.keys()].sort()){count+=points.get(key);peak=Math.max(peak,count);}return peak;
  }
  async function usage(tx,roomId,from,to){
    const bookings=await tx.all("SELECT check_in AS startAt,check_out AS endAt,room_count AS count FROM bookings WHERE room_id=? AND status IN ('Requested','Confirmed') AND check_in<? AND check_out>?",[roomId,to,from]);
    const blocks=await tx.all('SELECT start_date AS startAt,end_date AS endAt,blocked_count AS count FROM room_blocks WHERE room_id=? AND start_date<? AND end_date>?',[roomId,to,from]);
    return peakUsage([...bookings,...blocks],from,to);
  }
  app.use('/uploads',express.static(uploadDirectory,{dotfiles:'deny',setHeaders:res=>{res.set('Content-Security-Policy',"default-src 'none'; sandbox");res.set('X-Content-Type-Options','nosniff');}}));
  app.post('/api/manage/uploads',auth,roles('admin','owner'),express.raw({type:['image/jpeg','image/png','image/webp'],limit:'5mb'}),(req,res)=>{
    const bytes=req.body;
    if(!Buffer.isBuffer(bytes)||bytes.length<12)throw fail(400,'Upload a JPEG, PNG, or WebP image.');
    let extension;
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)extension='jpg';
    else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))extension='png';
    else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')extension='webp';
    else throw fail(400,'Image content must be JPEG, PNG, or WebP.');
    fs.mkdirSync(uploadDirectory,{recursive:true});const filename=`${randomUUID()}.${extension}`;fs.writeFileSync(path.join(uploadDirectory,filename),bytes,{flag:'wx'});
    res.status(201).json({image:`/uploads/${filename}`});
  });
  app.get('/api/health',(req,res)=>res.json({status:'ok',demoMode,database:db.dialect}));
  app.post('/api/auth/register',rateLimit,async(req,res)=>{
    const input=registerSchema.parse(req.body);
    const hash=await bcrypt.hash(input.password,12);
    const user={id:randomUUID(),name:input.name,email:input.email,role:'tourist'};
    try { await db.run('INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',[user.id,user.name,user.email,hash,user.role,new Date().toISOString()]); }
    catch(error) { if(error.code==='ER_DUP_ENTRY'||String(error.message).includes('UNIQUE constraint')) throw fail(409,'An account with this email already exists.'); throw error; }
    setSession(req,res,user); res.status(201).json({user});
  });
  app.post('/api/auth/login',rateLimit,async(req,res)=>{
    const input=loginSchema.parse(req.body); const user=await db.get('SELECT * FROM users WHERE email = ?',[input.email]);
    if(!user || !(await bcrypt.compare(input.password,user.password_hash))) throw fail(401,'Email or password is incorrect.');
    setSession(req,res,user);res.json({user:publicUser(user)});
  });
  app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user}));
  app.post('/api/auth/logout',(req,res)=>{res.clearCookie(cookieName(req),{...cookieOptions,maxAge:undefined});res.json({ok:true});});
  app.get('/api/resorts',async(req,res)=>{
    let rows=await db.all("SELECT * FROM resorts WHERE status = 'published'");
    if(req.query.q) rows=rows.filter(r=>`${r.name} ${r.area} ${r.location}`.toLowerCase().includes(String(req.query.q).toLowerCase()));
    res.json({resorts:await Promise.all(rows.map(publicResort))});
  });
  app.get('/api/resorts/:id',async(req,res)=>{
    const row=await db.get("SELECT * FROM resorts WHERE id=? AND status='published'",[req.params.id]);
    if(!row) throw fail(404,'Resort not found.');
    const rooms=await db.all('SELECT * FROM rooms WHERE resort_id=? AND enabled=1',[row.id]);
    res.json({resort:await publicResort(row),rooms:rooms.map(roomJSON)});
  });
  app.get('/api/resorts/:id/availability',async(req,res)=>{
    const input=datesSchema.parse(req.query);
    if(!await db.get("SELECT id FROM resorts WHERE id=? AND status='published'",[req.params.id]))throw fail(404,'Resort not found.');
    const rooms=await db.all('SELECT * FROM rooms WHERE resort_id=? AND enabled=1',[req.params.id]);
    const result=[];
    for(const room of rooms){
      const used=await usage(db,room.id,input.checkIn,input.checkOut);
      result.push({...roomJSON(room),available:Math.max(0,room.inventory-used),pricing:calculatePrice(room.price,nightsBetween(input.checkIn,input.checkOut),1)});
    }
    res.json({rooms:result});
  });
  app.get('/api/bookings',auth,async(req,res)=>res.json({bookings:(await db.all(`${bookingsQuery} WHERE b.user_id=? ORDER BY b.created_at DESC`,[req.user.id])).map(bookingJSON)}));
  app.post('/api/bookings',auth,async(req,res)=>{
    if(!demoMode) throw fail(503,'Live payments are not configured. Booking is unavailable.');
    const input=bookingSchema.parse(req.body);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const nights=nightsBetween(input.checkIn,input.checkOut);
    if(input.checkIn<today || nights>30) throw fail(400,'Choose a future stay of up to 30 nights.');
    const booking=await db.transaction(async tx=>{
      const room=await tx.get(`SELECT rm.*,r.status AS resort_status FROM rooms rm JOIN resorts r ON r.id=rm.resort_id WHERE rm.id=?${db.dialect==='mysql'?' FOR UPDATE':''}`,[input.roomId]);
      if(!room || room.resort_id!==input.resortId || !room.enabled || room.resort_status!=='published') throw fail(404,'This room is not available.');
      if(input.guests>room.capacity*input.rooms) throw fail(400,'Please add enough rooms for your guests.');
      const used=await usage(tx,room.id,input.checkIn,input.checkOut);
      if(used+input.rooms>room.inventory) throw fail(409,'There are not enough rooms for these dates. Please choose other dates.');
      const pricing=calculatePrice(room.price,nights,input.rooms);
      const id=`BRH-${randomUUID().slice(0,8).toUpperCase()}`;
      const createdAt=new Date().toISOString();
      await tx.run('INSERT INTO bookings (id,user_id,resort_id,room_id,check_in,check_out,guests,room_count,guest_name,phone,total,advance,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,req.user.id,room.resort_id,room.id,input.checkIn,input.checkOut,input.guests,input.rooms,input.name,input.phone,pricing.total,pricing.advance,'Requested',createdAt]);
      await tx.run('INSERT INTO payments (id,booking_id,amount,kind,status,created_at) VALUES (?,?,?,?,?,?)',[randomUUID(),id,pricing.advance,'demo-advance','simulated',createdAt]);
      return {id,...pricing,status:'Requested',demoMode:true};
    });
    res.status(201).json({booking});
  });
  app.post('/api/bookings/:id/cancel',auth,async(req,res)=>{
    const result=await db.transaction(async tx=>{
      const booking=await tx.get(`SELECT * FROM bookings WHERE id=?${db.dialect==='mysql'?' FOR UPDATE':''}`,[req.params.id]);
      if(!booking) throw fail(404,'Booking not found.');
      if(booking.user_id!==req.user.id && req.user.role!=='admin') throw fail(403,'This booking belongs to another traveler.');
      if(!['Requested','Confirmed'].includes(booking.status)) throw fail(409,'This booking is already closed.');
      if(booking.check_in<=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) throw fail(400,'Online cancellation is available before the check-in date.');
      const refund=calculateRefund(booking.advance);
      await tx.run("UPDATE bookings SET status='Cancelled',refund=? WHERE id=?",[refund.refund,booking.id]);
      await tx.run('INSERT INTO payments (id,booking_id,amount,kind,status,created_at) VALUES (?,?,?,?,?,?)',[randomUUID(),booking.id,refund.refund,'demo-refund','pending',new Date().toISOString()]);
      return {...refund,status:'Cancelled'};
    });res.json(result);
  });
  app.get('/api/manage/overview',auth,roles('admin','owner'),async(req,res)=>{
    const own=req.user.role==='owner';
    const resorts=await db.all(`SELECT * FROM resorts${own?' WHERE owner_id=?':''}`,own?[req.user.id]:[]);
    const bookings=await db.all(`${bookingsQuery}${own?' WHERE r.owner_id=?':''} ORDER BY b.created_at DESC`,own?[req.user.id]:[]);
    const users=own?[]:await db.all('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC');
    const rooms=await db.all(`SELECT rm.*,r.name AS resort_name FROM rooms rm JOIN resorts r ON r.id=rm.resort_id${own?' WHERE r.owner_id=?':''}`,own?[req.user.id]:[]);
    const payments=await db.all(`SELECT p.*,r.name AS resort_name FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN resorts r ON r.id=b.resort_id${own?' WHERE r.owner_id=?':''} ORDER BY p.created_at DESC`,own?[req.user.id]:[]);
    const blocks=await db.all(`SELECT rb.*,rm.name AS room_name,r.name AS resort_name FROM room_blocks rb JOIN rooms rm ON rm.id=rb.room_id JOIN resorts r ON r.id=rm.resort_id${own?' WHERE r.owner_id=?':''}`,own?[req.user.id]:[]);
    res.json({resorts:resorts.map(resortJSON),bookings:bookings.map(bookingJSON),users,rooms:rooms.map(roomJSON),payments,blocks,demoMode});
  });
  app.patch('/api/manage/resorts/:id',auth,roles('admin','owner'),async(req,res)=>{
    const input=resortSchema.parse(req.body); const resort=await ownsResort(req.user,req.params.id);
    const metadata={...JSON.parse(resort.metadata),...input};
    await db.run('UPDATE resorts SET name=?,area=?,location=?,metadata=? WHERE id=?',[input.name,input.area,input.location,JSON.stringify(metadata),resort.id]);
    res.json({ok:true});
  });
  app.post('/api/manage/resorts',auth,roles('admin','owner'),async(req,res)=>{
    const input=resortSchema.parse(req.body);const id=randomUUID();
    const metadata={id,price:2500,rating:0,reviews:0,tag:'New retreat',capacity:2,room:'Standard Double',...input};
    await db.transaction(async tx=>{
      await tx.run('INSERT INTO resorts (id,owner_id,name,area,location,price,status,metadata) VALUES (?,?,?,?,?,?,?,?)',[id,req.user.id,input.name,input.area,input.location,2500,'pending',JSON.stringify(metadata)]);
      await tx.run('INSERT INTO rooms (id,resort_id,name,price,capacity,inventory,metadata) VALUES (?,?,?,?,?,?,?)',[`${id}-standard`,id,'Standard Double',2500,2,3,JSON.stringify({type:'Standard',description:'A comfortable room for your stay.',amenities:['Wi-Fi'],image:'/images/room.jpg'})]);
    });res.status(201).json({id});
  });
  app.patch('/api/manage/resorts/:id/status',auth,roles('admin'),async(req,res)=>{
    const {status}=z.object({status:z.enum(['published','pending','hidden'])}).parse(req.body);
    await ownsResort(req.user,req.params.id);await db.run('UPDATE resorts SET status=? WHERE id=?',[status,req.params.id]);res.json({ok:true});
  });
  app.post('/api/manage/resorts/:id/rooms',auth,roles('admin','owner'),async(req,res)=>{
    const input=roomSchema.parse(req.body);await ownsResort(req.user,req.params.id);const id=randomUUID();
    await db.transaction(async tx=>{
      await tx.run('INSERT INTO rooms (id,resort_id,name,price,capacity,inventory,enabled,metadata) VALUES (?,?,?,?,?,?,?,?)',[id,req.params.id,input.name,input.price,input.capacity,input.inventory,input.enabled?1:0,JSON.stringify({type:input.type,description:input.description,image:input.image,amenities:input.amenities})]);
      const lowest=await tx.get('SELECT MIN(price) AS price FROM rooms WHERE resort_id=? AND enabled=1',[req.params.id]);if(lowest.price!==null)await tx.run('UPDATE resorts SET price=? WHERE id=?',[lowest.price,req.params.id]);
    });res.status(201).json({id});
  });
  app.patch('/api/manage/rooms/:id',auth,roles('admin','owner'),async(req,res)=>{
    const input=roomSchema.parse(req.body);
    await db.transaction(async tx=>{
      const room=await tx.get(`SELECT * FROM rooms WHERE id=?${db.dialect==='mysql'?' FOR UPDATE':''}`,[req.params.id]);
      if(!room) throw fail(404,'Room not found.');await ownsResort(req.user,room.resort_id);
      // Inventory reductions must not invalidate existing reservations, including future overlaps.
      const existing=await tx.all("SELECT check_in AS startAt,check_out AS endAt,room_count AS count,guests FROM bookings WHERE room_id=? AND status IN ('Requested','Confirmed')",[room.id]);
      const blocks=await tx.all('SELECT start_date AS startAt,end_date AS endAt,blocked_count AS count FROM room_blocks WHERE room_id=?',[room.id]);
      for(const booking of existing) if(booking.guests>input.capacity*booking.count) throw fail(409,'Capacity is too small for an existing booking.');
      if(input.inventory<peakUsage([...existing,...blocks])) throw fail(409,'Inventory cannot be lower than existing reservations and blocked rooms.');
      await tx.run('UPDATE rooms SET name=?,price=?,capacity=?,inventory=?,enabled=?,metadata=? WHERE id=?',[input.name,input.price,input.capacity,input.inventory,input.enabled?1:0,JSON.stringify({type:input.type,description:input.description,image:input.image,amenities:input.amenities}),room.id]);
      const lowest=await tx.get('SELECT MIN(price) AS price FROM rooms WHERE resort_id=? AND enabled=1',[room.resort_id]);
      if(lowest.price!==null) await tx.run('UPDATE resorts SET price=? WHERE id=?',[lowest.price,room.resort_id]);
    });res.json({ok:true});
  });
  app.post('/api/manage/hotel-accounts',auth,roles('admin'),async(req,res)=>{
    const input=registerSchema.safeExtend({resortId:z.string().min(1).max(191)}).parse(req.body);
    const hash=await bcrypt.hash(input.password,12);const id=randomUUID();
    try { await db.transaction(async tx=>{
      const resort=await tx.get('SELECT id FROM resorts WHERE id=?',[input.resortId]);if(!resort)throw fail(404,'Select an existing resort.');
      await tx.run('INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',[id,input.name,input.email,hash,'owner',new Date().toISOString()]);
      await tx.run('UPDATE resorts SET owner_id=? WHERE id=?',[id,input.resortId]);
    }); } catch(error){if(error.code==='ER_DUP_ENTRY'||String(error.message).includes('UNIQUE constraint'))throw fail(409,'This email is already in use.');throw error;}
    res.status(201).json({user:{id,name:input.name,email:input.email,role:'owner'},resortId:input.resortId});
  });
  app.patch('/api/manage/hotel-accounts/:id/password',auth,roles('admin'),async(req,res)=>{
    const {password}=z.object({password:z.string().min(8).max(128)}).parse(req.body);
    const owner=await db.get("SELECT id FROM users WHERE id=? AND role='owner'",[req.params.id]);if(!owner)throw fail(404,'Hotel account not found.');
    await db.run('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',[await bcrypt.hash(password,12),owner.id]);res.json({ok:true});
  });
  app.post('/api/manage/bookings/:id/decision',auth,roles('admin','owner'),async(req,res)=>{
    const {decision}=z.object({decision:z.enum(['Confirmed','Declined'])}).parse(req.body);
    await db.transaction(async tx=>{
      const booking=await tx.get(`SELECT * FROM bookings WHERE id=?${db.dialect==='mysql'?' FOR UPDATE':''}`,[req.params.id]);
      if(!booking)throw fail(404,'Request not found.');await ownsResort(req.user,booking.resort_id);
      if(booking.status!=='Requested')throw fail(409,'This request has already been reviewed.');
      await tx.run('UPDATE bookings SET status=?,refund=? WHERE id=?',[decision,decision==='Declined'?booking.advance:0,booking.id]);
      if(decision==='Declined')await tx.run('INSERT INTO payments (id,booking_id,amount,kind,status,created_at) VALUES (?,?,?,?,?,?)',[randomUUID(),booking.id,booking.advance,'demo-refund','pending',new Date().toISOString()]);
    });res.json({ok:true});
  });
  app.post('/api/manage/rooms/:id/blocks',auth,roles('admin','owner'),async(req,res)=>{
    const input=datesSchema.safeExtend({count:z.number().int().min(1).max(100),note:z.string().trim().max(200).default('Unavailable')}).parse(req.body);
    const id=randomUUID();
    await db.transaction(async tx=>{
      const room=await tx.get(`SELECT * FROM rooms WHERE id=?${db.dialect==='mysql'?' FOR UPDATE':''}`,[req.params.id]);
      if(!room)throw fail(404,'Room not found.');await ownsResort(req.user,room.resort_id);
      if(await usage(tx,room.id,input.checkIn,input.checkOut)+input.count>room.inventory)throw fail(409,'This block overlaps existing reservations or unavailable rooms.');
      await tx.run('INSERT INTO room_blocks (id,room_id,start_date,end_date,blocked_count,note) VALUES (?,?,?,?,?,?)',[id,room.id,input.checkIn,input.checkOut,input.count,input.note]);
    });res.status(201).json({id});
  });
  app.delete('/api/manage/blocks/:id',auth,roles('admin','owner'),async(req,res)=>{
    const block=await db.get('SELECT rb.*,rm.resort_id FROM room_blocks rb JOIN rooms rm ON rm.id=rb.room_id WHERE rb.id=?',[req.params.id]);
    if(!block)throw fail(404,'Block not found.');await ownsResort(req.user,block.resort_id);await db.run('DELETE FROM room_blocks WHERE id=?',[block.id]);res.json({ok:true});
  });
  app.post('/api/manage/payments/:id/complete',auth,roles('admin'),async(req,res)=>{
    const payment=await db.get("SELECT * FROM payments WHERE id=? AND kind='demo-refund'",[req.params.id]);
    if(!payment) throw fail(404,'Refund not found.');
    if(payment.status==='simulated') throw fail(409,'This demo refund has already been completed.');
    await db.run("UPDATE payments SET status='simulated' WHERE id=?",[payment.id]);res.json({ok:true});
  });
  app.use((req,res)=>res.status(404).json({error:'API route not found.'}));
  app.use((error,req,res,next)=>{
    if(error instanceof z.ZodError) return res.status(400).json({error:error.issues.map(issue=>`${issue.path.join('.') || 'Input'}: ${issue.message}`).join('; ')});
    if(error.type==='entity.too.large')return res.status(413).json({error:'Image uploads must be 5 MB or smaller.'});
    if(error.type==='entity.parse.failed') return res.status(400).json({error:'Invalid JSON body.'});
    if(!error.status) console.error(error);
    res.status(error.status || 500).json({error:error.status?error.message:'Something went wrong. Please try again.'});
  });
  return app;
}
