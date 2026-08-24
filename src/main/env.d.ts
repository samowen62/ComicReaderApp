/// <reference types="vite/client" />

declare module '*.ico?asset' {
  const src: string;
  export default src;
}

declare module '*.png?asset' {
  const src: string;
  export default src;
}
