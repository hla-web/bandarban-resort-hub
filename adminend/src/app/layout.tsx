import type { Metadata } from 'next';
import '../../../shared/management.css';
export const metadata:Metadata={title:'Resort Hub — Admin workspace',description:'Manage hotel partners, resort listings, bookings and refunds.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-BD"><body>{children}</body></html>;}
