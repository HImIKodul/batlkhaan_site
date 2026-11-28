import React from 'react';
import { AdminShit,Payments,DataSection,ReviewQueue,DoneReports } from './Console';
export default function ConsoleRoutes({section,id,meEmail}:{section:string;id:string;meEmail:string}){
 if(section==='accounts')return <AdminShit id={id} meEmail={meEmail}/>;
 if(section==='payments')return <Payments/>;
 if(section==='data')return <DataSection id={id}/>;
 if(section==='reports')return <ReviewQueue/>;
 if(section==='done')return <DoneReports/>;
 return null;
}
