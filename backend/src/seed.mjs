import fs from 'node:fs';
import bcrypt from 'bcryptjs';
export async function seedDemo(db) {
  if (await db.get('SELECT id FROM users LIMIT 1')) return;
  const hash = await bcrypt.hash('Bandarban123!', 12);
  await db.transaction(async (tx) => {
    for (const [id, name, email, role] of [
      ['demo-admin', 'Hub Administrator', 'admin@bandarban.demo', 'admin'],
      ['demo-owner', 'Ayesha Rahman', 'owner@bandarban.demo', 'owner'],
      ['demo-tourist', 'Shahriar Ahmed', 'traveler@bandarban.demo', 'tourist'],
    ]) await tx.run('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id,name,email,hash,role,new Date().toISOString()]);
    const resorts = JSON.parse(fs.readFileSync(new URL('../../shared/resorts.json', import.meta.url), 'utf8'));
    for (const resort of resorts) {
      await tx.run('INSERT INTO resorts (id, owner_id, name, area, location, price, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [resort.id,'demo-owner',resort.name,resort.area,resort.location,resort.price,'published',JSON.stringify(resort)]);
      await tx.run('INSERT INTO rooms (id, resort_id, name, price, capacity, inventory, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', [`${resort.id}-standard`,resort.id,resort.room,resort.price,resort.capacity,5,JSON.stringify({type:'Standard',description:resort.description,amenities:resort.amenities,image:'/images/room.jpg'})]);
    }
  });
}
