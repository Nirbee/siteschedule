declare module "heic-decode" {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray; // RGBA
  }
  function decode(options: { buffer: Buffer | Uint8Array }): Promise<DecodedImage>;
  export default decode;
}
