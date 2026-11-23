"use client";
import { useEffect,useState } from 'react';
import { BedDouble,Check } from 'lucide-react';
import { assetURL, api } from '@/lib/api';
import { money } from '@/lib/resorts';
export type LiveRoom={id:string;name:string;type:string;price:number;capacity:number;description:string;amenities:string[];image:string};
export default function LiveRooms({resortId,onChoose}:{resortId:string;onChoose:(id:string)=>void}){
  const [rooms,setRooms]=useState<LiveRoom[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{let active=true;api<{rooms:LiveRoom[]}>(`/resorts/${resortId}`).then(data=>{if(active)setRooms(data.rooms);}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[resortId]);
  if(loading)return <p className="demo-note">Loading rooms from the hotel…</p>;
  if(error)return <p className="error" role="alert">{error}</p>;
  if(!rooms.length)return <p className="demo-note">This hotel has no open room types at the moment.</p>;
  return <div className="live-rooms">{rooms.map(room=><div className="live-room" key={room.id}><img src={assetURL(room.image||'/images/room.jpg')} alt={room.name}/><div><span className="eyebrow">{room.type}</span><h4>{room.name}</h4><span className="live-room-capacity"><BedDouble size={16}/>Up to {room.capacity} guests per room</span><p>{room.description}</p><div className="room-facilities">{room.amenities?.map(a=><span key={a}><Check size={12}/>{a}</span>)}</div><div className="live-room-bottom"><strong>{money(room.price)} <small>/ night</small></strong><button className="outline-button" onClick={()=>onChoose(room.id)}>Choose room</button></div></div></div>)}</div>;
}
