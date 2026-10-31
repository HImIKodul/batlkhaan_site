import React,{useState} from 'react';
import { AppShell, PageContainer, go } from '../components/AppShell';
import { Button, Card, RadioGroup, SectionHeader, StatusBadge } from '../components/UI';
import { ComingSoonState,EmptyState,ErrorState,LoadingState,OfflineState } from '../components/ApiState';

const diagnosisStates=[
 ['Эрх шаардлагатай','300,000₮','Шинэ маркетингийн оношилгоо бүр нэг удаагийн тусдаа эрх шаарддаг.','warning'],
 ['Эрх нээлттэй','Эхлүүлэхэд бэлэн','Төлбөр баталгаажсан бөгөөд эрх хараахан ашиглагдаагүй.','success'],
 ['Үргэлжилж байна','Хадгалсан явц','Өмнөх хариултын явцаас үргэлжлүүлнэ.','info'],
 ['Түр зогссон','Хадгалсан','Дахин төлбөр шаардахгүй; ижил оношилгоог үргэлжлүүлнэ.','neutral'],
 ['Дууссан','Тайлан бэлэн','Энэ оношилгоо өөрийн тусдаа үр дүн, зөвлөмж, хэрэгжүүлэх төлөвлөгөөтэй.','success'],
 ['Нягтлах шаардлагатай','Тусгай тэмдэглэгээ','Зөрүүтэй эсвэл хангалтгүй нотолгоотой хэсгийг тайлбартай харуулна.','warning'],
 ['Боломжит мэдээлэл дууссан','Байгаа мэдээллээр хаасан','Асууж болох баталгаатай зам дууссан үед үр дүнг тусад нь тэмдэглэнэ.','neutral'],
 ['Цуцлагдсан','Хаалттай','Шинэ үр дүн үүсгэхгүй; түүхийн бүртгэлд үлдэнэ.','danger'],
] as const;

const paymentStates=[
 ['Төлбөр эхлээгүй','300,000₮','Нэхэмжлэх үүсээгүй.'],
 ['Нэхэмжлэх үүссэн','CREATED','КьюПэй код болон боломжит банкны холбоосууд харагдана.'],
 ['Төлбөр хүлээгдэж байна','PENDING','Систем төлбөрийн баталгаажуулалтыг хүлээнэ.'],
 ['Төлбөр амжилттай','PAID','Нэг тусдаа маркетингийн оношилгооны эрх идэвхжинэ.'],
 ['Төлбөр амжилтгүй','FAILED','Эрх нээгдэхгүй; шинэ нэхэмжлэх үүсгэж болно.'],
 ['Төлбөр цуцлагдсан','CANCELLED','Нэхэмжлэх хаагдсан; дахин оролдож болно.'],
] as const;

const reportStates=[
 ['Үр дүн байхгүй','Алдаа биш','Оношилгооны хэсэг рүү чиглүүлнэ.'],
 ['Боловсруулж байна','Түр төлөв','Сонгосон дууссан оношилгооны баталгаажсан өгөгдлийг бэлтгэнэ.'],
 ['Тайлан бэлэн','Бодит өгөгдөл','Дүгнэлт, нотолгоо, ангилал, шалтгаан, зөвлөмж, хэрэгжүүлэх дараалал харагдана.'],
 ['Өгөгдөл дутуу','Шууд тэмдэглэнэ','Дутуу утгыг 0 гэж үзэхгүй, хиймлээр нөхөхгүй.'],
] as const;

export default function States(){
 const [choice,setChoice]=useState<string|number|null>(null);
 const [saved,setSaved]=useState(false);
 const [retrying,setRetrying]=useState(false);
 const [retryCount,setRetryCount]=useState(0);
 const retry=()=>{setRetrying(true);window.setTimeout(()=>{setRetrying(false);setRetryCount(x=>x+1)},650)};
 const options=['Огт шалгадаггүй','Заримдаа шалгадаг','Ихэнхдээ шалгадаг','Тогтмол шалгадаг','Мэдэхгүй'];
 return <AppShell route="states"><PageContainer className="mmri-support-page mmri-support-states">
  <SectionHeader eyebrow="ДОТООД ЧАНАРЫН ШАЛГАЛТ" title="Системийн төлөвийн лавлах" description="Хөгжүүлэлт, чанарын шалгалт болон харагдацын буцаалтын шалгалтад зориулсан. Доорх төлөвүүд бодит сервер, хэрэглэгчийн дэлгэцийн гэрээтэй нийцнэ." action={<Button variant="secondary" onClick={()=>go('analysis')}>Оношилгоо нээх</Button>}/>
  <div className="mmri-support-callout"><div><strong>Жишээ орчин</strong><span>Энэ дэлгэцийн тоо, текст нь зөвхөн дэлгэцийн төлөв шалгах жишээ; хэрэглэгчийн бодит оношилгооны үр дүн биш.</span></div><StatusBadge tone="info">ХӨГЖҮҮЛЭЛТ / ЧАНАР</StatusBadge></div>

  <section className="mmri-support-register"><header><span>01</span><div><h2>Оношилгооны төлөв</h2><p>Эрх, үргэлжлүүлэх явц болон дууссан тайлан тусдаа ойлголт байна.</p></div></header><div className="mmri-support-state-grid">{diagnosisStates.map(([name,value,detail,tone])=><Card key={name} className="mmri-support-state-card"><StatusBadge tone={tone}>{name}</StatusBadge><strong>{value}</strong><p>{detail}</p></Card>)}</div></section>

  <section className="mmri-support-register"><header><span>02</span><div><h2>Төлбөрийн серверийн төлөв</h2><p>Серверт тодорхойлоогүй нэмэлт нэхэмжлэхийн төлөвийг хэрэглэгчийн дэлгэц зохиож харуулахгүй.</p></div></header><div className="mmri-support-state-grid">{paymentStates.map(([name,value,detail])=><Card key={name} className="mmri-support-state-card"><span className="eyebrow">{name}</span><strong>{value}</strong><p>{detail}</p></Card>)}</div><div className="mmri-support-section-actions"><Button onClick={()=>go('billing')}>Төлбөр ба эрх нээх</Button></div></section>

  <section className="mmri-support-register"><header><span>03</span><div><h2>Асуултын сонголт</h2><p>Сонголт хийх нь илгээсэн гэсэн үг биш. Баталгаажуулсны дараа хадгалалтын төлөв өөрчлөгдөнө.</p></div></header><Card className="mmri-support-question-demo" tone="focal"><span className="eyebrow">ЖИШЭЭ АСУУЛТ</span><h3>Маркетингийн чухал шийдвэр гаргахдаа тухайн шийдвэр бизнесийн гол зорилгод туслах эсэхийг шалгадаг уу?</h3><RadioGroup name="state-demo-answer" value={choice} onValueChange={value=>{setChoice(value);setSaved(false)}} label="Жишээ асуултын хариулт" options={options.map((label,index)=>({value:index,label,prefix:String.fromCharCode(65+index)}))}/><div className="mmri-support-question-demo-meta"><span>{choice==null?'Сонголт хийгдээгүй':`Сонгосон: ${options[Number(choice)]}`}</span><StatusBadge tone={saved?'success':'neutral'}>{saved?'Хадгалагдсан':'Баталгаажаагүй'}</StatusBadge></div><div className="mmri-support-card-actions"><Button variant="secondary" onClick={()=>{setChoice(null);setSaved(false)}}>Сонголт цэвэрлэх</Button><Button disabled={choice==null||saved} onClick={()=>setSaved(true)}>Хариултаа баталгаажуулах</Button></div></Card></section>

  <section className="mmri-support-register"><header><span>04</span><div><h2>Тайлангийн төлөв</h2><p>Хоосон болон дутуу мэдээлэл нь алдаа мэт эсвэл хиймэл оноо мэт харагдахгүй.</p></div></header><div className="mmri-support-state-grid">{reportStates.map(([name,value,detail])=><Card key={name} className="mmri-support-state-card"><span className="eyebrow">{name}</span><strong>{value}</strong><p>{detail}</p></Card>)}</div></section>

  <section className="mmri-support-register"><header><span>05</span><div><h2>Системийн ерөнхий төлөв</h2><p>Ачаалал, хоосон, алдаа, сүлжээгүй болон удахгүй төлөв нэг ижил дахин ашиглах бүрэлдэхүүн ашиглана.</p></div></header><div className="mmri-support-api-grid"><div><span>Ачаалж байна</span><LoadingState className="compact" description="Шаардлагатай мэдээллийг бэлтгэж байна."/></div><div><span>Хоосон</span><EmptyState className="compact" action={<Button onClick={()=>go('analysis')}>Оношилгоо руу</Button>}/></div><div><span>Алдаа</span>{retrying?<LoadingState className="compact" label="Дахин холбогдож байна..." description="Холболтын төлөвийг шалгаж байна."/>:<ErrorState className="compact" message={retryCount?`Холболт сэргээгдээгүй байна. Дахин оролдсон: ${retryCount}.`:'Сүлжээний холболтоо шалгаад дахин оролдоно уу.'} onRetry={retry}/>}</div><div><span>Сүлжээгүй</span><OfflineState className="compact" onRetry={retry}/></div><div><span>Удахгүй</span><ComingSoonState className="compact" description="Нээгдэх хүртэл бодит мэт оноо, график эсвэл идэвхтэй худалдан авах үйлдэл харуулахгүй."/></div></div></section>
 </PageContainer></AppShell>;
}
