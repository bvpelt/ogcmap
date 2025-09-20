import { Component, OnInit, computed, signal } from "@angular/core";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import { SupportedLayer, LayerInfo } from "./layers.interface";
import { BrtlayerService } from "./serices/brtlayer.service";
import { BgtlayerService } from "./serices/bgtlayer.service";
/*
// Type for supported layer types
type SupportedLayer = TileLayer<any> | VectorTileLayer;

// Interface for layer with metadata
interface LayerInfo {
  layer: SupportedLayer;
  name: string;
  visible: boolean;
  type: "tile" | "vector-tile";
  projection: string;
}
*/

@Component({
  selector: "app-layers",
  imports: [],
  templateUrl: "./layers.component.html",
  styleUrl: "./layers.component.css",
})
export class LayersComponent implements OnInit {
  constructor(private brtlayerService: BrtlayerService,
    private bgtlayerService: BgtlayerService
  ) {}

  ngOnInit(): void {
    console.log("LayersComponent start initialization");
    this.brtlayerService.createBrtLayer().then((layerInfo) => {
      if (layerInfo) {
        this.addLayer(layerInfo.layer);
        console.log("BRT layer added to LayersComponent");
      } else {
        console.error("Failed to create BRT layer");
      }
    });

     this.bgtlayerService.createBgtLayer().then((layerInfo) => {
      if (layerInfo) {
        this.addLayer(layerInfo.layer);
        console.log("BGT layer added to LayersComponent");
      } else {
        console.error("Failed to create BGT layer");
      }
    });
    console.log("LayersComponent initialized");
  }

  // Private array of layers using signals (Angular best practice)
  private readonly _layers = signal<SupportedLayer[]>([]);

  // Public readonly access to layers
  readonly layers = this._layers.asReadonly();

  // Computed property for layers with EPSG:28992 projection only
  readonly rdLayers = computed(() =>
    this._layers().filter(
      (layer) => this.getLayerProjection(layer) === "EPSG:28992"
    )
  );

  // Alternative: private array without signals (traditional approach)
  // private layers: SupportedLayer[] = [];
  /**
   * Add a new layer to the collection
   */
  addLayer(layer: SupportedLayer): void {
    this._layers.update((currentLayers) => [...currentLayers, layer]);
  }

  /**
   * Remove a layer by reference
   */
  removeLayer(layer: SupportedLayer): void {
    this._layers.update((currentLayers) =>
      currentLayers.filter((l) => l !== layer)
    );
  }

  /**
   * Find layer by name (assumes layer has a 'name' property)
   */
  findLayerByName(name: string): SupportedLayer | undefined {
    return this._layers().find((layer) => {
      const layerName = layer.get("name") || layer.getProperties()?.["name"];
      return layerName === name;
    });
  }

  /**
   * Get all layer names
   */
  getLayerNames(): string[] {
    return this._layers().map(
      (layer) =>
        layer.get("name") || layer.getProperties()?.["name"] || "Unnamed Layer"
    );
  }

  /**
   * Set layer visibility by name
   */
  setLayerVisibility(name: string, visible: boolean): void {
    const layer = this.findLayerByName(name);
    if (layer) {
      layer.setVisible(visible);
    }
  }

  /**
   * Get layer projection (helper method)
   */
  private getLayerProjection(layer: SupportedLayer): string {
    const source = layer.getSource();
    if (
      source &&
      "getProjection" in source &&
      typeof source.getProjection === "function"
    ) {
      const projection = source.getProjection();
      return projection ? projection.getCode() : "EPSG:3857";
    }
    return "EPSG:3857"; // Default fallback
  }

  /**
   * Get layer information with metadata
   */
  getLayerInfo(): LayerInfo[] {
    return this._layers().map((layer) => ({
      layer,
      name: layer.get("name") || "Unnamed Layer",
      visible: layer.getVisible(),
      type: layer instanceof VectorTileLayer ? "vector-tile" : "tile",
      projection: this.getLayerProjection(layer),
    }));
  }

  /**
   * Filter layers by projection
   */
  getLayersByProjection(projection: string): SupportedLayer[] {
    return this._layers().filter(
      (layer) => this.getLayerProjection(layer) === projection
    );
  }

  /**
   * Get EPSG:28992 layers specifically
   */
  getRDLayers(): SupportedLayer[] {
    return this.getLayersByProjection("EPSG:28992");
  }

  /**
   * Clear all layers
   */
  clearLayers(): void {
    this._layers.set([]);
  }

  /**
   * Get layer count
   */
  getLayerCount(): number {
    return this._layers().length;
  }

  /**
   * Check if layer exists by name
   */
  hasLayer(name: string): boolean {
    return this.findLayerByName(name) !== undefined;
  }

  /**
   * Handle checkbox change event
   */
  onLayerVisibilityChange(name: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.setLayerVisibility(name, checkbox.checked);
  }
}
