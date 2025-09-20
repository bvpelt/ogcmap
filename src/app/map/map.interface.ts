
export interface TileMatrixSet {
  id: string;
  title?: string;
  supportedCRS: string;
  tileMatrix: TileMatrix[];
}

export interface TileMatrix {
  id: string;
  scaleDenominator: number;
  topLeftCorner: number[];
  tileWidth: number;
  tileHeight: number;
  matrixWidth: number;
  matrixHeight: number;
}

export interface OGCCollection {
  id: string;
  title: string;
  links: Array<{
    href: string;
    rel: string;
    type?: string;
  }>;
}
