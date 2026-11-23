import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database.mjs';
import { seedDemo } from '../src/seed.mjs';
import { createApp } from '../src/app.mjs';
import { calculatePrice,calculateRefund } from '../src/validation.mjs';
process.env.DB_FILE=':memory:';

function client(base,portal='customer'){let cookie='';return async(path,method='GET',body,extra={})=>{
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-Requested-With':'ResortHub','X-Portal':portal,...(cookie?{Cookie:cookie}:{}),...extra},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return {status:response.status,body:await response.json()};
};}

test('connected admin, hotel, and customer workflow',async t=>{
  const uploads=fs.mkdtempSync(path.join(os.tmpdir(),'resort-hub-test-'));process.env.UPLOAD_DIR=uploads;
  const db=await openDatabase();await seedDemo(db);const app=createApp(db,{demoMode:true});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const admin=client(base,'admin'),owner=client(base,'hotel'),traveler=client(base),other=client(base),anonymous=client(base);
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();fs.rmSync(uploads,{recursive:true,force:true});});
  let roomId,bookingId,hotelId;
  const roomInput={name:'Sunrise Family Suite',type:'Suite',description:'A balcony, fresh mountain air, and room for everyone.',price:3600,capacity:4,inventory:3,enabled:true,image:'/images/room.jpg',amenities:['Wi-Fi','Balcony','Breakfast']};
  const bookingInput={resortId:'meghla',roomId:'',checkIn:'2099-01-10',checkOut:'2099-01-12',rooms:2,guests:5,name:'Test Traveler',phone:'+8801700000000',acceptPolicy:true,paymentMethod:'demo'};
  await t.test('only admin can create hotel credentials and public registration cannot choose a role',async()=>{
    assert.equal((await anonymous('/manage/overview')).status,401);
    assert.equal((await admin('/auth/login','POST',{email:'admin@bandarban.demo',password:'Bandarban123!'})).status,200);
    const register=await traveler('/auth/register','POST',{name:'Test Traveler',email:'test@example.com',password:'Testing123!',role:'admin'});assert.equal(register.status,201);assert.equal(register.body.user.role,'tourist');
    assert.equal((await traveler('/manage/hotel-accounts','POST',{})).status,403);
    const result=await admin('/manage/hotel-accounts','POST',{name:'Hotel Manager',email:'manager@example.com',password:'HotelPass123!',resortId:'meghla'});assert.equal(result.status,201);hotelId=result.body.user.id;
    assert.equal((await owner('/auth/login','POST',{email:'manager@example.com',password:'HotelPass123!'})).status,200);
    const overview=await owner('/manage/overview');assert.equal(overview.body.resorts.length,1);assert.equal(overview.body.resorts[0].id,'meghla');assert.deepEqual(overview.body.users,[]);
    assert.equal((await owner('/manage/resorts/sangu','PATCH',{name:'Unauthorized Hotel',area:'Elsewhere',location:'Somewhere',description:'This update must be rejected.'})).status,403);
  });
  await t.test('hotel-created room types, prices, photos and facilities appear through public API',async()=>{
    const created=await owner('/manage/resorts/meghla/rooms','POST',roomInput);assert.equal(created.status,201);roomId=created.body.id;bookingInput.roomId=roomId;
    const detail=await anonymous('/resorts/meghla');const room=detail.body.rooms.find(r=>r.id===roomId);assert.equal(room.name,roomInput.name);assert.equal(room.price,3600);assert.deepEqual(room.amenities,roomInput.amenities);
    const resorts=(await anonymous('/resorts')).body.resorts;assert.equal(resorts.find(r=>r.id==='meghla').price,3600);assert.ok(resorts.find(r=>r.id==='meghla').amenities.includes('Balcony'));
    assert.equal((await owner(`/manage/rooms/${roomId}`,'PATCH',{...roomInput,price:-1})).status,400);
  });
  await t.test('hotel photos upload through backend and are publicly accessible',async()=>{
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=','base64');
    assert.equal((await traveler('/manage/uploads','POST',png,{'Content-Type':'image/png'})).status,403);
    const upload=await owner('/manage/uploads','POST',png,{'Content-Type':'image/png'});assert.equal(upload.status,201);assert.ok(upload.body.image.startsWith('/uploads/'));
    assert.equal((await owner(`/manage/rooms/${roomId}`,'PATCH',{...roomInput,image:upload.body.image})).status,200);
    const room=(await anonymous('/resorts/meghla')).body.rooms.find(r=>r.id===roomId);assert.equal(room.image,upload.body.image);
    const image=await fetch(base+room.image);assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
    assert.equal((await owner('/manage/uploads','POST',Buffer.from('invalid-image-data'),{'Content-Type':'image/png'})).status,400);
  });
  await t.test('date blocks reduce availability and booking totals are calculated by backend',async()=>{
    const blocked=await owner(`/manage/rooms/${roomId}/blocks`,'POST',{checkIn:'2099-01-10',checkOut:'2099-01-12',count:1,note:'Maintenance'});assert.equal(blocked.status,201);
    const available=(await anonymous('/resorts/meghla/availability?checkIn=2099-01-10&checkOut=2099-01-12')).body.rooms.find(r=>r.id===roomId);assert.equal(available.available,2);
    const result=await traveler('/bookings','POST',{...bookingInput,total:1,advance:1});assert.equal(result.status,201);bookingId=result.body.booking.id;assert.equal(result.body.booking.total,15120);assert.equal(result.body.booking.advance,4536);assert.equal(result.body.booking.status,'Requested');
    assert.equal((await traveler('/bookings','POST',{...bookingInput,rooms:1,guests:2})).status,409);
    assert.equal((await owner(`/manage/rooms/${roomId}/blocks`,'POST',{checkIn:'2099-01-11',checkOut:'2099-01-13',count:1,note:'Overbooked'})).status,409);
    assert.equal((await owner(`/manage/rooms/${roomId}`,'PATCH',{...roomInput,inventory:2})).status,409);
  });
  await t.test('requests reach the right hotel and only that hotel can confirm them',async()=>{
    const overview=(await owner('/manage/overview')).body;assert.equal(overview.bookings[0].id,bookingId);assert.equal(overview.bookings[0].name,'Test Traveler');
    assert.equal((await traveler(`/manage/bookings/${bookingId}/decision`,'POST',{decision:'Confirmed'})).status,403);
    assert.equal((await owner(`/manage/bookings/${bookingId}/decision`,'POST',{decision:'Confirmed'})).status,200);
    assert.equal((await traveler('/bookings')).body.bookings[0].status,'Confirmed');
    assert.equal((await owner(`/manage/bookings/${bookingId}/decision`,'POST',{decision:'Declined'})).status,409);
  });
  await t.test('cancellation protects ownership, releases rooms, and creates one refund record',async()=>{
    await other('/auth/register','POST',{name:'Other Traveler',email:'other@example.com',password:'Testing123!'});
    assert.equal((await other(`/bookings/${bookingId}/cancel`,'POST')).status,403);
    const result=await traveler(`/bookings/${bookingId}/cancel`,'POST');assert.equal(result.status,200);assert.equal(result.body.refund,3629);assert.equal(result.body.cancellationFee,907);
    assert.equal((await traveler(`/bookings/${bookingId}/cancel`,'POST')).status,409);
    const available=(await anonymous('/resorts/meghla/availability?checkIn=2099-01-10&checkOut=2099-01-12')).body.rooms.find(r=>r.id===roomId);assert.equal(available.available,2);
    const payment=(await admin('/manage/overview')).body.payments.find(p=>p.booking_id===bookingId&&p.kind==='demo-refund');assert.equal(payment.status,'pending');
    assert.equal((await owner(`/manage/payments/${payment.id}/complete`,'POST')).status,403);
    assert.equal((await admin(`/manage/payments/${payment.id}/complete`,'POST')).status,200);
  });
  await t.test('declining returns the full demo advance and frees inventory',async()=>{
    const result=await traveler('/bookings','POST',{...bookingInput,checkIn:'2099-02-01',checkOut:'2099-02-03'});assert.equal(result.status,201);
    const id=result.body.booking.id;assert.equal((await owner(`/manage/bookings/${id}/decision`,'POST',{decision:'Declined'})).status,200);
    const overview=(await admin('/manage/overview')).body;const refund=overview.payments.find(p=>p.booking_id===id&&p.kind==='demo-refund');assert.equal(refund.amount,result.body.booking.advance);
    assert.equal((await traveler(`/bookings/${id}/cancel`,'POST')).status,409);
  });
  await t.test('sequential bookings count peak occupancy instead of adding separate nights',async()=>{
    const result=await owner('/manage/resorts/meghla/rooms','POST',{...roomInput,name:'Sequential Test Room',inventory:2});const id=result.body.id;
    for(const dates of [{checkIn:'2099-03-01',checkOut:'2099-03-02'},{checkIn:'2099-03-02',checkOut:'2099-03-03'}])assert.equal((await traveler('/bookings','POST',{...bookingInput,...dates,roomId:id,rooms:1,guests:2})).status,201);
    const available=(await anonymous('/resorts/meghla/availability?checkIn=2099-03-01&checkOut=2099-03-03')).body.rooms.find(r=>r.id===id);assert.equal(available.available,1);
    const results=await Promise.all([traveler('/bookings','POST',{...bookingInput,roomId:id,checkIn:'2099-03-01',checkOut:'2099-03-03',rooms:1,guests:2}),traveler('/bookings','POST',{...bookingInput,roomId:id,checkIn:'2099-03-01',checkOut:'2099-03-03',rooms:1,guests:2})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  });
  await t.test('invalid calendar dates, inverted stays, capacity excess, and untrusted origins are rejected',async()=>{
    for(const change of [{checkIn:'2099-02-30'},{checkOut:bookingInput.checkIn},{guests:40},{acceptPolicy:false}])assert.equal((await traveler('/bookings','POST',{...bookingInput,...change})).status,400);
    assert.equal((await anonymous('/auth/login','POST',{email:'admin@bandarban.demo',password:'Bandarban123!'},{Origin:'https://untrusted.example'})).status,403);
    assert.equal((await anonymous('/auth/login','POST',{email:'admin@bandarban.demo',password:'wrong'})).status,401);
  });
  await t.test('an admin password reset revokes hotel sessions',async()=>{
    assert.equal((await admin(`/manage/hotel-accounts/${hotelId}/password`,'PATCH',{password:'NewHotelPass123!'})).status,200);
    assert.equal((await owner('/manage/overview')).status,401);
    assert.equal((await owner('/auth/login','POST',{email:'manager@example.com',password:'HotelPass123!'})).status,401);
    assert.equal((await owner('/auth/login','POST',{email:'manager@example.com',password:'NewHotelPass123!'})).status,200);
  });
});

test('pricing and refund arithmetic stays in whole taka',()=>{
  assert.deepEqual(calculatePrice(6500,2,1),{subtotal:13000,serviceFee:650,total:13650,advance:4095,dueAtResort:9555});
  assert.deepEqual(calculateRefund(5000),{cancellationFee:1000,refund:4000});
});

test('SQLite records persist across database reopen',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'resort-hub-persistence-'));
  process.env.DB_FILE=path.join(folder,'test.sqlite');
  let db=await openDatabase();
  try{
    await db.run('INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',['persisted','Persistent User','persist@example.com','not-a-login-hash','tourist',new Date().toISOString()]);
    await db.close();db=await openDatabase();
    assert.equal((await db.get('SELECT name FROM users WHERE id=?',['persisted'])).name,'Persistent User');
  }finally{await db.close();fs.rmSync(folder,{recursive:true,force:true});process.env.DB_FILE=':memory:';}
});
