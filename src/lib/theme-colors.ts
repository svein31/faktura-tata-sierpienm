export type ThemeMode="light"|"dark";
export type CustomColors={accent:string;backgrounds:Partial<Record<ThemeMode,string>>};
export const DEFAULT_COLORS:CustomColors={accent:"",backgrounds:{}};
export const validHex=(value:unknown):value is string=>typeof value==="string"&&/^#[a-f0-9]{6}$/i.test(value);
export function sanitizeColors(value:unknown):CustomColors{const input=(value&&typeof value==="object"?value:{}) as any;return {accent:validHex(input.accent)?input.accent:"",backgrounds:Object.fromEntries(["light","dark"].filter(mode=>validHex(input.backgrounds?.[mode])).map(mode=>[mode,input.backgrounds[mode]]))};}
const channels=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const luminance=(hex:string)=>channels(hex).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
export function contrastRatio(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function blend(a:string,b:string,t:number){const c=channels(a),d=channels(b);return "#"+c.map((v,i)=>Math.round((v+(d[i]-v)*t)*255).toString(16).padStart(2,"0")).join("");}
function contrastColor(color:string,surfaces:string[],ratio:number,fallback:string){if(surfaces.every(s=>contrastRatio(color,s)>=ratio))return color;for(let i=1;i<=100;i++){const next=blend(color,fallback,i/100);if(surfaces.every(s=>contrastRatio(next,s)>=ratio))return next;}return fallback;}
export function themePalette(mode:ThemeMode,colors:CustomColors){
 const background=colors.backgrounds[mode]||(mode==="dark"?"#151618":"#f6f7f8"),foreground=contrastRatio(background,"#000000")>contrastRatio(background,"#ffffff")?"#000000":"#ffffff";
 const toward=foreground==="#000000"?"#ffffff":"#000000",card=blend(background,toward,.04),muted=blend(background,toward,.09),surfaces=[background,card,muted];
 const primary=contrastColor(colors.accent||(mode==="dark"?"#95b1db":"#4669a8"),surfaces,4.6,foreground),mutedForeground=contrastColor(blend(foreground,background,.3),surfaces,4.6,foreground),border=contrastColor(blend(foreground,background,.65),surfaces,3.1,foreground),destructive=contrastColor("#dc3545",surfaces,4.6,foreground);
 const on=(c:string)=>contrastRatio(c,"#000000")>contrastRatio(c,"#ffffff")?"#000000":"#ffffff";
 return {background,foreground,card,"card-foreground":foreground,popover:card,"popover-foreground":foreground,primary,"primary-foreground":on(primary),secondary:muted,"secondary-foreground":foreground,muted,"muted-foreground":mutedForeground,accent:primary,"accent-foreground":on(primary),destructive,"destructive-foreground":on(destructive),border,input:border,ring:primary};
}
function hsl(hex:string){const [r,g,b]=channels(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,l=(max+min)/2;let h=0;if(delta)h=(max===r?(g-b)/delta+(g<b?6:0):max===g?(b-r)/delta+2:(r-g)/delta+4)*60;const s=delta===0?0:delta/(1-Math.abs(2*l-1));return `${h.toFixed(2)} ${(s*100).toFixed(2)}% ${(l*100).toFixed(2)}%`;}
export function applyCustomColors(mode:ThemeMode,colors:CustomColors){const root=document.documentElement;for(const [key,value] of Object.entries(themePalette(mode,colors))){if(!colors.accent&&!colors.backgrounds[mode])root.style.removeProperty("--"+key);else root.style.setProperty("--"+key,hsl(value));}}
