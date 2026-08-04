declare module "jsqr" {
  interface QRCode {
    data: string;
    chunks: Array<{
      type: number;
      data: string;
    }>;
    version: number;
    location: {
      topRightFinderPattern: {
        x: number;
        y: number;
      };
      topLeftFinderPattern: {
        x: number;
        y: number;
      };
      bottomLeftFinderPattern: {
        x: number;
        y: number;
      };
      bottomRightAlignmentPattern?: {
        x: number;
        y: number;
      };
    };
  }

  function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number
  ): QRCode | null;

  export default jsQR;
}
