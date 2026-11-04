declare module '*.css';

interface ImportMeta { readonly env:{readonly PROD:boolean}; glob(pattern:string,options:{query:string;import:string;eager:boolean}):Record<string,unknown>; }
