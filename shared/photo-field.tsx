"use client";
import { useState } from 'react';
import { Upload,ImageIcon,LoaderCircle } from 'lucide-react';
import { api,API_URL } from './api';
export default function PhotoField({initialValue,label='Photo'}:{initialValue:string;label?:string}){
  const [value,setValue]=useState(initialValue),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function upload(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>5*1024*1024){setError('Please choose a photo smaller than 5 MB.');return;}
    const previous=value;setValue('');setBusy(true);setError('');try{const result=await api<{image:string}>('/manage/uploads',{method:'POST',headers:{'Content-Type':file.type},body:file});setValue(result.image);}catch(error){setValue(previous);setError((error as Error).message);}finally{setBusy(false);event.target.value='';}
  }
  return <div className="photo-field"><label>{label}<input name="image" value={value} required readOnly={busy} onChange={event=>setValue(event.target.value)} placeholder="HTTPS photo URL or upload a photo"/></label><div className="photo-upload-row"><img src={value.startsWith('/uploads/')?`${API_URL}${value}`:value.startsWith('/images/')?`http://localhost:3000${value}`:value} alt="Photo preview"/><label className="upload-control">{busy?<LoaderCircle className="spin" size={16}/>:<Upload size={16}/>}<span>{busy?'Uploading…':'Upload photo'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy}/></label></div><small>JPEG, PNG, or WebP · Up to 5 MB. Upload finishes before saving the form.</small>{error&&<p className="error" role="alert">{error}</p>}</div>;
}
