import React from 'react';
import { Button } from './UI';
import { go } from './AppShell';
import { Icon } from './Icon';

export function DemoNotice({title='Жишээ харагдац'}:{title?:string}){
 return <div className="demo-notice"><span><Icon name="info" size={17}/></span><div><b>{title}</b><p>Доорх мэдээлэл нь бүтээгдэхүүний ажиллагааг тайлбарлах жишээ бөгөөд бодит байгууллагын үр дүн биш.</p></div><Button variant="secondary" onClick={()=>go('login')}>Нэвтэрч бодит үнэлгээ хийх</Button></div>
}
