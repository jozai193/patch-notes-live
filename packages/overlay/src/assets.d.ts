declare module '*.css';
declare module '*.md?raw' {
  const source: string;
  export default source;
}

interface ImportMeta {
  readonly env: { readonly PROD: boolean };
  glob(
    pattern: string,
    options: { query: string; import: string; eager: boolean },
  ): Record<string, unknown>;
}
