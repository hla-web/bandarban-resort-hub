import type { MouseEventHandler } from 'react';
export default function Brand({onClick}:{onClick?:MouseEventHandler<HTMLAnchorElement>}) {
  return <a className="brand" href="#home" onClick={onClick} aria-label="Bandarban Resort Hub home"><svg className="brand-mountains" viewBox="0 0 86 48" fill="none" aria-hidden="true"><path d="M3 40 25 14 47 40M23 40 48 3 81 40M5 44h77M35 21l5 4 8-10 8 11 5-3M19 22l6 7 5-3" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/><path d="m58 8 4-4m-4 0 4 4" stroke="currentColor" strokeWidth="1.2"/></svg><span>Bandarban<span>Resort Hub</span></span></a>;
}
