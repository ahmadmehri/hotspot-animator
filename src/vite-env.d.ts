/// <reference types="vite/client" />

declare module "upng-js" {
  interface UPNGModule {
    encode(
      buffers: ArrayBuffer[],
      width: number,
      height: number,
      colors: number,
      delays?: number[]
    ): ArrayBuffer;
  }

  const UPNG: UPNGModule;
  export default UPNG;
}
