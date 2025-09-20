import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";

// Type for supported layer types
export type SupportedLayer = TileLayer<any> | VectorTileLayer;

// Interface for layer with metadata
export interface LayerInfo {
  layer: SupportedLayer;
  name: string;
  visible: boolean;
  type: "tile" | "vector-tile";
  projection: string;
}