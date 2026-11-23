"use client";
import { useState } from 'react';
import { Mountain, LoaderCircle } from 'lucide-react';
import { post, type User } from '@/lib/api';
export default function AuthForm({onSuccess}:{onSuccess:(user:User)=>void}) {
  const [register,setRegister]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');const values=Object.fromEntries(new FormData(event.currentTarget));
    try{const result=await post<{user:User}>(`/auth/${register?'register':'login'}`,values);onSuccess(result.user);}
    catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  return <div className="auth-form"><div className="auth-symbol"><Mountain size={34}/></div><h3>{register?'Your next escape starts here.':'Good to have you back.'}</h3><p>Save the places you love. Make room for your next adventure.</p><form onSubmit={submit}>
    {register&&<label>Full name<input name="name" required minLength={2} autoComplete="name" placeholder="Your full name"/></label>}
    <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" defaultValue="traveler@bandarban.demo"/></label>
    <label>Password<input name="password" type="password" minLength={8} maxLength={128} autoComplete={register?'new-password':'current-password'} required defaultValue="Bandarban123!"/></label>
    {error&&<p className="error" role="alert">{error}</p>}<button className="button full" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:null}{register?'Create account':'Sign in'}</button>
  </form><button className="text-button full" onClick={()=>{setRegister(!register);setError('');}}>{register?'Already have an account? Sign in':'New here? Create an account'}</button><p className="demo-note">Local demo account: traveler@bandarban.demo<br/>Password: Bandarban123! · Demo payments only</p></div>;
}
