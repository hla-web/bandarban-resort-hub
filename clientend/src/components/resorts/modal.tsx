"use client";
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement;
    const overflow=document.body.style.overflow; document.body.style.overflow='hidden';
    ref.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape')onClose();
      if(event.key==='Tab'){
        const elements=ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]');
        if(!elements?.length)return;
        const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey && (document.activeElement===first || document.activeElement===ref.current)){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus();};
  },[onClose]);
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal ${wide?'modal-wide':''}`}><header className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={22}/></button></header><div className="modal-body">{children}</div></div></div>;
}
