"use client";
import * as React from "react";
import { MotionConfig } from "framer-motion";
import {applyCustomColors,DEFAULT_COLORS,sanitizeColors,type CustomColors,type ThemeMode} from "@/lib/theme-colors";
type Theme="light"|"dark"|"system";
const STORAGE_KEY="fakturaprosto-theme",COLORS_KEY="fakturaprosto-colors";
const ThemeContext=React.createContext<{theme:Theme;resolved:ThemeMode;colors:CustomColors;setTheme:(t:Theme)=>void;setColors:(c:CustomColors)=>void;toggle:()=>void}|null>(null);
export function getInitialTheme():Theme{if(typeof window==="undefined")return "dark";try{const value=localStorage.getItem(STORAGE_KEY)||localStorage.getItem("fakturo-theme");if(value==="light"||value==="dark"||value==="system")return value;}catch{}return "dark";}
function getColors(){try{return sanitizeColors(JSON.parse(localStorage.getItem(COLORS_KEY)||"{}"));}catch{return DEFAULT_COLORS;}}
function resolve(theme:Theme):ThemeMode{return theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme;}
export function applyTheme(theme:Theme,colors=getColors()){const mode=resolve(theme),root=document.documentElement;root.classList.toggle("dark",mode==="dark");root.style.colorScheme=mode;applyCustomColors(mode,colors);return mode;}
export function ThemeProvider({children}:{children:React.ReactNode}){
 const [theme,setThemeState]=React.useState<Theme>("dark"),[resolved,setResolved]=React.useState<ThemeMode>("dark"),[colors,setColorsState]=React.useState<CustomColors>(DEFAULT_COLORS),themeRef=React.useRef<Theme>("dark"),colorsRef=React.useRef<CustomColors>(DEFAULT_COLORS);
 React.useEffect(()=>{const update=()=>{const t=getInitialTheme(),c=getColors();themeRef.current=t;colorsRef.current=c;setThemeState(t);setColorsState(c);setResolved(applyTheme(t,c));};update();document.documentElement.dataset.uiReady="true";const mq=matchMedia("(prefers-color-scheme: dark)"),system=()=>setResolved(applyTheme(themeRef.current,colorsRef.current)),storage=(e:StorageEvent)=>{if([STORAGE_KEY,COLORS_KEY,"fakturo-theme",null].includes(e.key))update();};mq.addEventListener("change",system);window.addEventListener("storage",storage);return()=>{delete document.documentElement.dataset.uiReady;mq.removeEventListener("change",system);window.removeEventListener("storage",storage);};},[]);
 const setTheme=React.useCallback((t:Theme)=>{try{localStorage.setItem(STORAGE_KEY,t);localStorage.removeItem("fakturo-theme");}catch{}themeRef.current=t;setThemeState(t);setResolved(applyTheme(t,colorsRef.current));},[]);
 const setColors=React.useCallback((c:CustomColors)=>{const next=sanitizeColors(c);try{localStorage.setItem(COLORS_KEY,JSON.stringify(next));}catch{}colorsRef.current=next;setColorsState(next);setResolved(applyTheme(themeRef.current,next));},[]);
 const toggle=React.useCallback(()=>setTheme(resolved==="dark"?"light":"dark"),[resolved,setTheme]);
 return <ThemeContext.Provider value={{theme,resolved,colors,setTheme,setColors,toggle}}><MotionConfig reducedMotion="user" transition={{type:"tween",duration:0.16,ease:"easeOut"}}>{children}</MotionConfig></ThemeContext.Provider>;
}
export function useTheme(){const context=React.useContext(ThemeContext);if(!context)throw new Error("useTheme must be used within ThemeProvider");return context;}
