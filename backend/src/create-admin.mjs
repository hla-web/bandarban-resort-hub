import fs from 'node:fs';
const envFile=new URL('../.env',import.meta.url);if(fs.existsSync(envFile))process.loadEnvFile(envFile);
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { openDatabase } from './database.mjs';
import { registerSchema } from './validation.mjs';
const input=registerSchema.parse({name:process.env.ADMIN_NAME||'Platform Administrator',email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});
const db=await openDatabase();
try{if(await db.get('SELECT id FROM users WHERE email=?',[input.email]))throw new Error('An account with this email already exists.');await db.run('INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',[randomUUID(),input.name,input.email,await bcrypt.hash(input.password,12),'admin',new Date().toISOString()]);console.log('Administrator account created.');}finally{await db.close();}
