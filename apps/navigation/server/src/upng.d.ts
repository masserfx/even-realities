declare module 'upng-js' {
  function encode(bufs: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer;
  function decode(buf: ArrayBuffer): { width: number; height: number; ctype: number; depth: number; frames: ArrayBuffer[] };
  export = { encode, decode };
}
