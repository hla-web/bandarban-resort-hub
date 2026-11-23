import type { Metadata } from 'next';
import '../../../shared/management.css';
export const metadata:Metadata={title:'Resort Hub — Hotel partner portal',description:'Manage your rooms, facilities, rates, availability and booking requests.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-BD"><body>{children}</body></html>;}
