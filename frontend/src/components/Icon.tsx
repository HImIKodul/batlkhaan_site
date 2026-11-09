import React from 'react';

/**
 * MMRI icon system v2.
 * All icons share the same 24×24 grid, rounded stroke geometry and optical weight.
 * Keep icons monochrome; category/state color is supplied by the surrounding UI.
 */
const paths:Record<string,React.ReactNode>={
  logo:<><path d="M5.5 17.5V7.2L12 12.3l6.5-5.1v10.3"/><path d="M5.5 18.5h13"/><circle cx="12" cy="12" r="9.2"/></>,
  home:<><path d="m3.6 10.7 8.4-7 8.4 7"/><path d="M5.7 9.7v10.1h12.6V9.7"/><path d="M9.2 19.8v-6.2h5.6v6.2"/></>,
  chart:<><path d="M4 19.5V12"/><path d="M9.4 19.5V7.8"/><path d="M14.8 19.5V4.5"/><path d="M20 19.5V10"/></>,
  list:<><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
  target:<><circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="3.8"/><path d="M12 3.7V1.8M20.3 12h1.9M12 20.3v1.9M3.7 12H1.8"/></>,
  user:<><circle cx="12" cy="8" r="3.6"/><path d="M4.6 20.2c1.1-3.7 3.6-5.5 7.4-5.5s6.3 1.8 7.4 5.5"/></>,
  check:<path d="m5.2 12.3 4 4 9.6-9.6"/>,
  arrow:<><path d="M4.5 12h15"/><path d="m14 6.5 5.5 5.5-5.5 5.5"/></>,
  back:<><path d="M19.5 12h-15"/><path d="M10 6.5 4.5 12l5.5 5.5"/></>,
  menu:<path d="M4 7h16M4 12h16M4 17h16"/>,
  close:<path d="m6 6 12 12M18 6 6 18"/>,
  clock:<><circle cx="12" cy="12" r="8.6"/><path d="M12 7.3v5l3.4 2"/></>,
  info:<><circle cx="12" cy="12" r="8.7"/><path d="M12 10.8v5.2M12 7.5h.01"/></>,
  alert:<><path d="M12 3.2 2.9 20h18.2L12 3.2Z"/><path d="M12 9.2v5M12 17.2h.01"/></>,
  search:<><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 4 4"/></>,
  file:<><path d="M6 2.8h7.7l4.3 4.3v14.1H6z"/><path d="M13.5 2.8v4.6h4.6M9 12h6M9 16h6"/></>,
  play:<><circle cx="12" cy="12" r="8.7"/><path d="m10 8.3 5.8 3.7-5.8 3.7Z"/></>,
  spark:<><path d="m4 17.8 4.5-5.3 4 3 7.2-9"/><path d="M15.7 6.5h4v4"/></>,
  trend:<><path d="m3.5 17.5 5-5.1 4 3.7 7.9-8.3"/><path d="M15.8 7.8h4.6v4.6"/></>,
  lock:<><rect x="5.3" y="10.3" width="13.4" height="10" rx="2.2"/><path d="M8.4 10.3V7.4a3.6 3.6 0 0 1 7.2 0v2.9"/></>,
  unlock:<><rect x="5.3" y="10.3" width="13.4" height="10" rx="2.2"/><path d="M8.4 10.3V7.4a3.6 3.6 0 0 1 6.7-1.9"/></>,
  refresh:<><path d="M19.5 7.1v4.4h-4.4"/><path d="M4.5 16.9v-4.4h4.4"/><path d="M18.1 10a6.7 6.7 0 0 0-11.4-3L4.5 10M5.9 14a6.7 6.7 0 0 0 11.4 3l2.2-3"/></>,
  offline:<><path d="M3.3 8.5a13.4 13.4 0 0 1 17.4 0M6.5 12a8.5 8.5 0 0 1 6-2.2M16.8 10.8c.5.3.9.7 1.3 1.2M9.7 15.2a3.8 3.8 0 0 1 4.5 0M12 19h.01M4 4l16 16"/></>,

  /* Category icons */
  megaphone:<><path d="M4 10.2v3.6c0 1.1.9 2 2 2h2.3L10 20h3l-1.7-4.2H13l6.8-3.1V7.3L13 10.2H6c-1.1 0-2 .9-2 2Z"/><path d="M13 10.2v5.6"/><path d="M20 8.4h1.7M19.2 5.1l1.2-1.1M19.2 15.9l1.2 1.1"/></>,
  server:<><rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9.4h17M3.5 14.7h17"/><path d="M7 6.7h.01M7 12h.01M7 17.3h.01M10.5 6.7h6.4M10.5 12h6.4M10.5 17.3h6.4"/></>,
  coins:<><ellipse cx="8.3" cy="6.5" rx="4.8" ry="2.3"/><path d="M3.5 6.5v4c0 1.3 2.1 2.3 4.8 2.3s4.8-1 4.8-2.3v-4"/><ellipse cx="15.7" cy="13.7" rx="4.8" ry="2.3"/><path d="M10.9 13.7v4c0 1.3 2.1 2.3 4.8 2.3s4.8-1 4.8-2.3v-4"/><path d="M3.5 10.5v3.2c0 1.3 2.1 2.3 4.8 2.3.6 0 1.1 0 1.6-.1"/></>,
  people:<><circle cx="12" cy="7.2" r="3"/><circle cx="5.8" cy="9.4" r="2.2"/><circle cx="18.2" cy="9.4" r="2.2"/><path d="M6.1 20c.7-4 2.7-6 5.9-6s5.2 2 5.9 6"/><path d="M2.4 19.2c.4-2.8 1.8-4.4 4.2-4.7M21.6 19.2c-.4-2.8-1.8-4.4-4.2-4.7"/></>,
  gear:<><circle cx="12" cy="12" r="3.2"/><path d="M19.2 14.4a7.5 7.5 0 0 0 .1-4.8l2-1.5-2-3.4-2.4 1a8 8 0 0 0-4.1-2.4L12.4 1h-4l-.5 2.3a8 8 0 0 0-4.1 2.4l-2.4-1-2 3.4 2 1.5a7.5 7.5 0 0 0 .1 4.8l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 4 2.3l.5 2.4h4l.5-2.4a8 8 0 0 0 4-2.3l2.4 1 2-3.4-2.1-1.5Z" transform="translate(1.5 0) scale(.88)"/></>,


  chip:<><rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1.2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></>,
  bank:<><path d="M3 9h18L12 3 3 9Z"/><path d="M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 21h18M2 18h20"/></>,
  factory:<><path d="M3 21V10l6 3V9l6 4V5h6v16H3Z"/><path d="M7 17h2M12 17h2M17 17h2M18 5V2"/></>,
  radar:<><circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.15"/><path d="M12 12 18.2 6.2M12 3.4v1.8M20.6 12h-1.8M12 20.6v-1.8M3.4 12h1.8"/></>,
  report:<><path d="M5 3h14v18H5z"/><path d="M8 16v-3M12 16V9M16 16v-5M8 6.5h8"/></>,
  card:<><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9h18M7 15h4"/></>,
  receipt:<><path d="M6 3.2h12v17.6l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3V3.2Z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
  download:<><path d="M12 3.2v11.6"/><path d="m7.3 10.6 4.7 4.7 4.7-4.7"/><path d="M5 20.5h14"/></>,
  phone:<path d="M6.5 3.2h3l1.5 4-2 1.5a16 16 0 0 0 6.3 6.3l1.5-2 4 1.5v3c0 1.4-1.1 2.5-2.5 2.5C10.5 20 4 13.5 4 5.7c0-1.4 1.1-2.5 2.5-2.5Z"/>,
  mail:<><rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="m4 7 8 6 8-6"/></>,
  trophy:<><path d="M8 4h8v4c0 3-1.8 5-4 5s-4-2-4-5V4Z"/><path d="M8 6H4v1c0 3 2 5 5 5M16 6h4v1c0 3-2 5-5 5M12 13v4M8 21h8M10 17h4"/></>,
  compass:<><circle cx="12" cy="12" r="8.8"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z"/></>,
  grid:<><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></>,
  route:<><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h4a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3H9a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3h8"/></>,
  building:<><path d="M4 21V5.2L12 2l8 3.2V21"/><path d="M8 8h1M8 12h1M8 16h1M15 8h1M15 12h1M15 16h1M2 21h20M11 21v-4h2v4"/></>,
  language:<><circle cx="12" cy="12" r="8.8"/><path d="M3.2 12h17.6M12 3.2a14.3 14.3 0 0 1 0 17.6M12 3.2a14.3 14.3 0 0 0 0 17.6"/></>,
  question:<><circle cx="12" cy="12" r="8.8"/><path d="M9.7 9a2.5 2.5 0 1 1 4.7 1.2c-.5.9-1.5 1.2-2 1.9-.3.4-.4.8-.4 1.4M12 17h.01"/></>,
  brain:<><path d="M9.5 4.1A3 3 0 0 0 4.6 6.4 3.2 3.2 0 0 0 3.4 12a3.3 3.3 0 0 0 2.1 5.7A3 3 0 0 0 10 20V4.2ZM14.5 4.1a3 3 0 0 1 4.9 2.3 3.2 3.2 0 0 1 1.2 5.6 3.3 3.3 0 0 1-2.1 5.7A3 3 0 0 1 14 20V4.2Z"/><path d="M8.2 9a2 2 0 0 1-2-2M8.2 15a2 2 0 0 0-2 2M15.8 9a2 2 0 0 0 2-2M15.8 15a2 2 0 0 1 2 2M10 12H8M16 12h-2"/></>,
  clipboard:<><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10.5l2 2 4-4M9 16h6"/></>,
  wallet:<><path d="M4 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z"/></>,
  shield:<><path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  layers:<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  bolt:<path d="m13 2-8 12h6l-1 8 9-13h-6V2Z"/>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  flag:<><path d="M5 21V4"/><path d="M5 5h11l-2 4 2 4H5"/></>,
  link:<><path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></>,
  logout:<><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="m14 8 4 4-4 4M18 12H8"/></>,
  sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon:<path d="M20 15.5A8.5 8.5 0 1 1 8.5 4 7 7 0 0 0 20 15.5Z"/>,
  layout:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></>,
  expand:<><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><path d="m3 8 5-5M21 8l-5-5M3 16l5 5M21 16l-5 5"/></>,
  bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
};

export function Icon({name,size=20,className=''}:{name:string;size?:number;className?:string}){
  return <svg
    className={`icon ${className}`.trim()}
    data-icon={name}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    vectorEffect="non-scaling-stroke"
    focusable="false"
    aria-hidden="true"
  >{paths[name]||paths.info}</svg>;
}
