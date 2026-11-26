/* Colour rules for the payment QR code. The background is always solid white.
   The approved category colours are too light to be QR modules (1.9:1 to 3.8:1 on white), so modules use a deep shade of the same hue (8:1).
   A digital decode does not prove that banking-app cameras read a colour: a category is coloured for customers only after a real banking-app scan,
   by listing it in VITE_MMRI_COLOR_QR_AREAS (comma separated, empty by default). Every other case is black. */
export const QR_BLACK='#000000';
export const QR_INK:Readonly<Record<string,string>>={marketing:'#165b45',it:'#1a5577',finance:'#674b16',people:'#55458c',operations:'#8f275f'};
export const QR_MIN_CONTRAST=7;
/** Densest symbol that may be coloured (version 15). Above it a module is under 3 CSS px in the 260 px box. */
export const QR_MAX_COLOR_MODULES=77;

export function contrastOnWhite(hex:string):number{
 const [r,g,b]=[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});
 return 1.05/(0.2126*r+0.7152*g+0.0722*b+0.05);
}
export const approvedQrAreas=(raw:string|undefined):ReadonlySet<string>=>new Set((raw??'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>x in QR_INK));
/** The module colour for one symbol. `preview` is the per-device switch used to scan an unapproved colour during the controlled test. */
export function qrInk(area:string,modules:number,approved:ReadonlySet<string>,preview=false):string{
 const ink=QR_INK[area];
 return ink&&(preview||approved.has(area))&&modules<=QR_MAX_COLOR_MODULES&&contrastOnWhite(ink)>=QR_MIN_CONTRAST?ink:QR_BLACK;
}
