/** Decorative travelling edge light for a glass panel (CSS: components/glass.css `.mmri-rim`). The parent must be `position:relative`
 * with a border-radius; the sheen is masked to the 1-2px perimeter and only a transform animates. */
export function RimSheen({className=''}:{className?:string}){
 return <span className={`mmri-rim ${className}`.trim()} aria-hidden="true"><i/></span>;
}
