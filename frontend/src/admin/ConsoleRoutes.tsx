import React from 'react';
import { AdminShit,Payments,DataSection,ReviewQueue,DoneReports } from './Console';
export default function ConsoleRoutes({section,id}:{section:string;id:string}){
 if(section==='accounts')return <AdminShit id={id}/>;
 if(section==='payments')return <Payments/>;
 if(section==='data')return <DataSection id={id}/>;
 if(section==='reports')return <ReviewQueue/>;
 if(section==='done')return <DoneReports/>;
 return null;
}
