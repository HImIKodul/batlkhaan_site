import React,{useState} from 'react';
import { currentFact,nextFact } from '../data/factDeck';

/** One interesting fact on the login page. The whole card is a button (mouse, touch, Enter and Space show the next fact). It sits OUTSIDE the login form, so it can never submit it. Only the fact text is shown. */
export default function FactCard(){
 const [fact,setFact]=useState(()=>currentFact());
 return <button type="button" className="auth-fact" onClick={()=>setFact(nextFact())} aria-label="Сонирхолтой баримт. Дараагийн баримтыг харахын тулд дарна уу.">
  <span className="auth-fact__kicker">Та мэдэх үү?</span>
  <span className="auth-fact__swap" key={fact.id} aria-live="polite"><span className="auth-fact__text">{fact.text}</span></span>
  <span className="auth-fact__hint" aria-hidden="true">Дараагийн баримт ›</span>
 </button>;
}
