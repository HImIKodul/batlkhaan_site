import { GlassStage } from './components/GlassStage';
import React, { useEffect, useState } from 'react';
import { restoreSession } from './api/client';
import { AppShell,PageContainer,type RouteName } from './components/AppShell';
import { ErrorState,SkeletonScreen,type SkeletonVariant } from './components/ApiState';

const Landing=React.lazy(()=>import('./pages/Landing'));
const Login=React.lazy(()=>import('./pages/Login'));
const Profile=React.lazy(()=>import('./pages/Profile'));
const Results=React.lazy(()=>import('./pages/Results'));
const Priorities=React.lazy(()=>import('./pages/Priorities'));
const Report=React.lazy(()=>import('./pages/Report'));
const Settings=React.lazy(()=>import('./pages/Settings'));
const Billing=React.lazy(()=>import('./pages/Billing'));
const DiagnosisHub=React.lazy(()=>import('./pages/DiagnosisHub'));
const States=React.lazy(()=>import('./pages/States'));
const AdminApp=React.lazy(()=>import('./admin/AdminApp'));
const ForgotPassword=React.lazy(()=>import('./pages/ForgotPassword'));
const ResetPassword=React.lazy(()=>import('./pages/ResetPassword'));
const Privacy=React.lazy(()=>import('./pages/Privacy'));
const Terms=React.lazy(()=>import('./pages/Terms'));

const routes:Record<RouteName,React.ComponentType>={
 home:Landing,login:Login,analysis:DiagnosisHub,profile:Profile,assessment:Results,results:Results,
 priorities:Priorities,report:Report,settings:Settings,billing:Billing,states:States,
 forgot:ForgotPassword,reset:ResetPassword,privacy:Privacy,terms:Terms
};

const qaRouteEnabled=typeof window!=='undefined'&&['localhost','127.0.0.1','::1'].includes(window.location.hostname);

const analysisViews:Record<string,RouteName>={
 diagnosis:'analysis',company:'profile',priorities:'priorities',implementation:'priorities',progress:'report',account:'settings',states:'states'
};

function getRoute():RouteName{
 const hash=window.location.hash.replace(/^#\/?/,'');
 const [rawPath='',rawQuery='']=hash.split('?');
 const path=rawPath||'home';
 if(path==='analysis'){
  const view=new URLSearchParams(rawQuery).get('view')||'diagnosis';
  const resolved=analysisViews[view]??'analysis';
  return resolved==='states'&&!qaRouteEnabled?'home':resolved;
 }
 const aliases:Record<string,RouteName>={
  '':'home',home:'home',dashboard:'home',company:'profile',history:'report',account:'settings',diagnosis:'analysis',questions:'assessment',
  assessment:'assessment',results:'results',priorities:'priorities',plan:'priorities',comparison:'report',settings:'settings',billing:'billing',report:'report',login:'login',
  'forgot-password':'forgot','reset-password':'reset',privacy:'privacy',terms:'terms'
 };
 const v=(aliases[path]??path) as RouteName;
 if(v==='states'&&!qaRouteEnabled)return 'home';
 return routes[v]?v:'home';
}

function currentHash(){return window.location.hash||'#/'}

const routeSkeletons:Record<RouteName,SkeletonVariant>={
 home:'dashboard',login:'form',billing:'payment',analysis:'dashboard',profile:'form',assessment:'questionnaire',results:'generic',priorities:'generic',report:'report',settings:'form',states:'generic',forgot:'form',reset:'form',privacy:'generic',terms:'generic'
};

function RouteFallback({route}:{route:RouteName}){
 return <AppShell route={route}><PageContainer className="mmri-route-loading mmri-route-loading--lazy"><div className="mmri-boot-skeleton-shell"><SkeletonScreen variant={routeSkeletons[route]} label="Хуудсыг ачаалж байна."/></div></PageContainer></AppShell>;
}

const routeLabels:Record<RouteName,string>={
 home:'Нүүр',login:'Нэвтрэх',billing:'Төлбөр ба эрх',analysis:'Оношилгоо',profile:'Байгууллагын мэдээлэл',assessment:'Оношилгооны асуулт',results:'Оношилгооны үр дүн',priorities:'Тэргүүлэх асуудал',report:'Тайлан',settings:'Миний бүртгэл',states:'Туршилтын төлөвүүд',forgot:'Нууц үг сэргээх',reset:'Шинэ нууц үг тогтоох',privacy:'Нууцлалын бодлого',terms:'Үйлчилгээний нөхцөл'
};

function locationLabel(route:RouteName,hash:string){
 if(route==='settings'){
  const query=hash.split('?')[1]||'';
  const section=new URLSearchParams(query).get('section');
  return section==='payments'?'Төлбөрийн түүх':'Тохиргоо';
 }
 return routeLabels[route];
}

class RouteErrorBoundary extends React.Component<{route:RouteName;locationKey:string;children:React.ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:unknown){console.error('MMRI route render failed',error)}
 componentDidUpdate(previous:{route:RouteName;locationKey:string}){
  if(this.state.failed&&previous.locationKey!==this.props.locationKey)this.setState({failed:false});
 }
 render(){
  if(!this.state.failed)return this.props.children;
  return <AppShell route={this.props.route}><PageContainer className="mmri-route-error"><ErrorState title="Хуудсыг нээж чадсангүй" message="Хуудасны код эсвэл шинэ хувилбарыг ачаалах үед алдаа гарлаа. Хуудсыг дахин ачаалж үргэлжлүүлнэ үү." onRetry={()=>window.location.reload()}/></PageContainer></AppShell>;
 }
}

export default function App(){
 const [route,setRoute]=useState<RouteName>(getRoute());
 const [locationKey,setLocationKey]=useState(currentHash);
 const [sessionReady,setSessionReady]=useState(false);
 useEffect(()=>{let live=true;void restoreSession().finally(()=>{if(live)setSessionReady(true)});return()=>{live=false}},[]);
 useEffect(()=>{
  const h=()=>{setRoute(getRoute());setLocationKey(currentHash());window.scrollTo({top:0,behavior:'instant' as ScrollBehavior})};
  window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h)
 },[]);
 useEffect(()=>{
  if(!sessionReady)return;
  const label=locationLabel(route,locationKey);
  document.title=`${label} · MMRI`;
  const focus=()=>{const target=document.querySelector<HTMLElement>('[data-route-heading],#main-content h1,#main-content');if(!target)return;if(target.tagName==='H1'&&!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true})};
  const timer=window.setTimeout(focus,0);
  return()=>window.clearTimeout(timer);
 },[route,locationKey,sessionReady]);
 if(/^#\/admin(\/|$|\?)/.test(locationKey))return <React.Suspense fallback={<main className="route-stage mmri-route-loading"/>}><AdminApp/></React.Suspense>;
 if(!sessionReady)return <main className="route-stage mmri-route-loading"><div className="mmri-boot-skeleton-shell"><SkeletonScreen variant="dashboard" label="Системийн мэдээллийг ачаалж байна."/></div></main>;
 const Page=routes[route];
 const label=locationLabel(route,locationKey);
 return <><GlassStage route={route}/><div className="mmri-visually-hidden" role="status" aria-live="polite" aria-atomic="true">{label} хуудас нээгдлээ</div><RouteErrorBoundary route={route} locationKey={locationKey}><React.Suspense fallback={<RouteFallback route={route}/>}><div className="route-stage" key={`${route}-${locationKey}`}><Page/></div></React.Suspense></RouteErrorBoundary></>
}
