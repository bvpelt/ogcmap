import { Injectable, inject } from "@angular/core";
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  TileMatrixSet,
  TileMatrix,
  OGCCollection,
} from "../../map/map.interface";
import { SupportedLayer, LayerInfo } from "../layers.interface";
import VectorTileLayer from "ol/layer/VectorTile";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { Style, Fill, Stroke, Circle } from 'ol/style.js';
import { FeatureLike } from 'ol/Feature';
import { applyStyle } from 'ol-mapbox-style';


@Injectable({
  providedIn: 'root'
})
export class BgtlayerService {
  private readonly http = inject(HttpClient);
  
  // PDOK OGC API configuration
  private readonly pdokBgtBaseUrl = 'https://api.pdok.nl/lv/bgt/ogc/v1'; 
  private readonly collectionId = 'bgt';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';
  private readonly styleUrl = this.pdokBgtBaseUrl + '/styles/bgt_achtergrondvisualisatie__netherlandsrdnewquad?f=json';

  constructor() {}

  async createBgtLayer(): Promise<LayerInfo | null> {
    try {
      // Get tile matrix set
      const tileMatrixSet = await this.getTileMatrixSet();
      console.log("Tile Matrix Set:", tileMatrixSet);

      if (tileMatrixSet) {
        // Create vector tile layer
        const bgtLayer = this.createBgtVectorTileLayer(tileMatrixSet);
        
        // Create LayerInfo object
        const layerInfo: LayerInfo = {
          layer: bgtLayer,
          name: "BGT",
          visible: true,
          type: "vector-tile",
          projection: "EPSG:28992"
        };

        console.log("BGT layer created successfully");

        // Apply Mapbox style after layer is created
        await this.applyMapboxStyleToLayer(bgtLayer, this.styleUrl);
        
        return layerInfo;
      }
    } catch (error) {
      console.error("Error creating PDOK BRT layer:", error);
    }

    return null;
  }

  private async applyMapboxStyleToLayer(
    layer: VectorTileLayer,
    styleUrl: string
  ): Promise<void> {
    try {
      console.log('Applying Mapbox style to layer:', styleUrl);
      await applyStyle(layer, styleUrl);
      console.log('Mapbox style applied successfully');
    } catch (error) {
      console.error('Error applying Mapbox style:', error);
      // Apply fallback styling
      this.applyFallbackStyle(layer);
    }
  }

  /**
   * Apply fallback styling when ol-mapbox-style fails
   */
  private applyFallbackStyle(layer: VectorTileLayer): void {
    console.log('Applying fallback style');
    layer.setStyle(this.createFallbackStyleFunction());
  }

  /**
   * Create a simple fallback style function
   */
  private createFallbackStyleFunction(): (
    feature: FeatureLike,
    resolution: number
  ) => Style | Style[] {
    return (feature: FeatureLike, resolution: number) => {
      const geometryType = feature.getGeometry()?.getType();

      switch (geometryType) {
        case 'Polygon':
        case 'MultiPolygon':
          return new Style({
            fill: new Fill({ color: 'rgba(200, 200, 200, 0.6)' }),
            stroke: new Stroke({ color: '#666666', width: 1 }),
          });
        case 'LineString':
        case 'MultiLineString':
          return new Style({
            stroke: new Stroke({ color: '#333333', width: 1.5 }),
          });
        case 'Point':
        case 'MultiPoint':
          return new Style({
            image: new Circle({
              radius: 4,
              fill: new Fill({ color: '#ff0000' }),
              stroke: new Stroke({ color: '#ffffff', width: 1 }),
            }),
          });
        default:
          return new Style({
            stroke: new Stroke({ color: '#666666', width: 1 }),
            fill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
          });
      }
    };
  }

  private async getTileMatrixSet(): Promise<TileMatrixSet | null> {
    try {
      const url = `${this.pdokBgtBaseUrl}/tileMatrixSets/${this.tileMatrixSetId}`;
      const response = await firstValueFrom(
        this.http.get<TileMatrixSet>(url, {
          headers: { Accept: "application/json" },
        })
      );
      return response;
    } catch (error) {
      console.error("Error fetching tile matrix set:", error);
      return null;
    }
  }

  private createBgtVectorTileLayer(
    tileMatrixSet: TileMatrixSet
  ): VectorTileLayer {
    // Build tile URL template for vector tiles
    const bgtUrlTemplate = this.pdokBgtBaseUrl + '/tiles/NetherlandsRDNewQuad/{z}/{y}/{x}?f=mvt';

    const vectorTileSource = new VectorTileSource({
      format: new MVT(),
      url: bgtUrlTemplate,
      projection: "EPSG:28992",
      attributions: ["© PDOK"],
    });

    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      // Don't set style here - we'll apply it after layer creation
      properties: {
        name: "BGT",
        type: "background",
      },
    });

    return vectorTileLayer;
  }
}
