import { Component, OnInit, OnDestroy } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";

import OLMap from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import VectorTileLayer from "ol/layer/VectorTile.js";
import OSM from "ol/source/OSM.js";
import VectorTileSource from "ol/source/VectorTile.js";
import MVT from "ol/format/MVT.js";
import { fromLonLat, get as getProjection } from "ol/proj.js";
import { register } from "ol/proj/proj4.js";
import proj4 from "proj4";
import { Style, Fill, Stroke, Circle } from "ol/style.js";
import { FeatureLike } from "ol/Feature";

// Example with ol-mapbox-style
import { applyStyle } from "ol-mapbox-style";
import { LayersComponent } from "../layers/layers.component";
import { TileMatrixSet, TileMatrix, OGCCollection } from "./map.interface";

// Register RD New projection for Netherlands
proj4.defs(
  "EPSG:28992",
  "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs"
);
register(proj4);

/*
interface TileMatrixSet {
  id: string;
  title?: string;
  supportedCRS: string;
  tileMatrix: TileMatrix[];
}

interface TileMatrix {
  id: string;
  scaleDenominator: number;
  topLeftCorner: number[];
  tileWidth: number;
  tileHeight: number;
  matrixWidth: number;
  matrixHeight: number;
}

interface OGCCollection {
  id: string;
  title: string;
  links: Array<{
    href: string;
    rel: string;
    type?: string;
  }>;
}
*/



@Component({
  selector: "app-map",
  imports: [LayersComponent],
  templateUrl: "./map.component.html",
  styleUrl: "./map.component.css",
})
export class MapComponent implements OnInit, OnDestroy {
  private map: OLMap = new OLMap();

  // PDOK OGC API configuration
  private readonly pdokBaseUrl =
    "https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1";
  private readonly collectionId = "brt-achtergrondkaart";
  private readonly tileMatrixSetId = "NetherlandsRDNewQuad";
  private readonly styleUrl =
    "https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1/styles/standaard__netherlandsrdnewquad?f=json";

  private brtLayer: VectorTileLayer | null = null;

  constructor(
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    console.log("MapComponent start initialization");
    this.initializeMap();
    /*

    // Add a layer
const newLayer = new TileLayer({...});
newLayer.set('name', 'My Layer');
this.layersComponent.addLayer(newLayer);

// Find and use a layer
const layer = this.layersComponent.findLayerByName('My Layer');
if (layer) {
  layer.setVisible(false);
}
  
    */
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.setTarget(undefined);
    }
  }

  private async initializeMap(): Promise<void> {
    try {
      // Set up RD New projection
      const rdProjection = getProjection("EPSG:28992");
      if (rdProjection) {
        rdProjection.setExtent([-285401.92, 22598.08, 595401.92, 903401.92]);
      }

      // Create base map with OSM as fallback
      this.map = new OLMap({
        target: "map",
        layers: [
          new TileLayer({
            source: new OSM(),
            properties: { name: "OpenStreetMap" },
          }),
        ],
        view: new View({
          projection: "EPSG:28992",
          center: [155000, 463000], // Center of Netherlands in RD coordinates
          zoom: 3,
          minZoom: 0,
          maxZoom: 19,
          extent: [-285401.92, 22598.08, 595401.92, 903401.92],
        }),
      });

      // Load PDOK BRT layer first
      await this.addPdokBrtLayer();

      // Switch to RD New projection for better PDOK integration
      //this.switchToRDNewProjection();

      console.log("Map initialization completed");
    } catch (error) {
      console.error("Error initializing map:", error);
    }
  }

  private async applyMapboxStyleToLayer(
    layer: VectorTileLayer,
    styleUrl: string
  ): Promise<void> {
    try {
      console.log("Applying Mapbox style to layer:", styleUrl);
      await applyStyle(layer, styleUrl);
      console.log("Mapbox style applied successfully");
    } catch (error) {
      console.error("Error applying Mapbox style:", error);
      // Apply fallback styling
      this.applyFallbackStyle(layer);
    }
  }

  /**
   * Apply fallback styling when ol-mapbox-style fails
   */
  private applyFallbackStyle(layer: VectorTileLayer): void {
    console.log("Applying fallback style");
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
        case "Polygon":
        case "MultiPolygon":
          return new Style({
            fill: new Fill({ color: "rgba(200, 200, 200, 0.6)" }),
            stroke: new Stroke({ color: "#666666", width: 1 }),
          });
        case "LineString":
        case "MultiLineString":
          return new Style({
            stroke: new Stroke({ color: "#333333", width: 1.5 }),
          });
        case "Point":
        case "MultiPoint":
          return new Style({
            image: new Circle({
              radius: 4,
              fill: new Fill({ color: "#ff0000" }),
              stroke: new Stroke({ color: "#ffffff", width: 1 }),
            }),
          });
        default:
          return new Style({
            stroke: new Stroke({ color: "#666666", width: 1 }),
            fill: new Fill({ color: "rgba(255, 255, 255, 0.8)" }),
          });
      }
    };
  }

  private async addPdokBrtLayer(): Promise<void> {
    try {
      // Get tile matrix set
      const tileMatrixSet = await this.getTileMatrixSet();
      console.log("Tile Matrix Set:", tileMatrixSet);

      if (tileMatrixSet) {
        // Create vector tile layer without style first
        this.brtLayer = this.createBrtVectorTileLayer(tileMatrixSet);

        // Add layer to map
        this.map.addLayer(this.brtLayer);
        console.log("BRT Achtergrondkaart layer added successfully");

        // Apply Mapbox style after layer is created
        await this.applyMapboxStyleToLayer(this.brtLayer, this.styleUrl);
      }
    } catch (error) {
      console.error("Error adding PDOK BRT layer:", error);
    }
  }

  private async getCollection(): Promise<OGCCollection | null> {
    try {
      const url = `${this.pdokBaseUrl}/collections/${this.collectionId}`;
      const response = await firstValueFrom(
        this.http.get<OGCCollection>(url, {
          headers: { Accept: "application/json" },
        })
      );
      return response;
    } catch (error) {
      console.error("Error fetching collection:", error);
      return null;
    }
  }

  private async getTileMatrixSet(): Promise<TileMatrixSet | null> {
    try {
      const url = `${this.pdokBaseUrl}/tileMatrixSets/${this.tileMatrixSetId}`;
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

  private createBrtVectorTileLayer(
    tileMatrixSet: TileMatrixSet
  ): VectorTileLayer {
    // Build tile URL template for vector tiles
    const tileUrlTemplate =
      "https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1/tiles/NetherlandsRDNewQuad/{z}/{y}/{x}?f=mvt";

    const vectorTileSource = new VectorTileSource({
      format: new MVT(),
      url: tileUrlTemplate,
      projection: "EPSG:28992",
      attributions: ["© PDOK"],
    });

    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      // Don't set style here - we'll apply it after layer creation
      properties: {
        name: "BRT Achtergrondkaart",
        type: "background",
      },
    });

    return vectorTileLayer;
  }

  private switchToRDNewProjection(): void {
    try {
      // Create new view with RD New projection
      const rdView = new View({
        projection: "EPSG:28992",
        center: [155000, 463000], // Center of Netherlands in RD coordinates
        zoom: 3,
        minZoom: 0,
        maxZoom: 19,
        extent: [-285401.92, 22598.08, 595401.92, 903401.92],
      });

      // Set the new view
      this.map.setView(rdView);

      console.log("Switched to RD New projection");
    } catch (error) {
      console.error("Error switching to RD New projection:", error);
    }
  }

  // Alternative method using raster tiles instead of vector tiles
  private async addPdokBrtRasterLayer(): Promise<void> {
    try {
      const tileMatrixSet = await this.getTileMatrixSet();

      if (tileMatrixSet) {
        // Build tile URL template for raster tiles (PNG)
        const tileUrlTemplate = `${this.pdokBaseUrl}/collections/${this.collectionId}/tiles/${this.tileMatrixSetId}/{z}/{y}/{x}?f=png`;

        // Create regular tile layer
        const brtTileLayer = new TileLayer({
          source: new OSM({
            url: tileUrlTemplate,
            attributions: ["© PDOK"],
            crossOrigin: "anonymous",
          }),
          properties: {
            name: "BRT Achtergrondkaart (Raster)",
            type: "background",
          },
        });

        this.map.addLayer(brtTileLayer);
        console.log("BRT raster layer added successfully");
      }
    } catch (error) {
      console.error("Error adding PDOK BRT raster layer:", error);
    }
  }

  // Utility method to get available collections
  public async getAvailableCollections(): Promise<void> {
    try {
      const url = `${this.pdokBaseUrl}/collections`;
      const response = await firstValueFrom(
        this.http.get<{ collections: OGCCollection[] }>(url, {
          headers: { Accept: "application/json" },
        })
      );

      console.log("Available collections:", response.collections);
    } catch (error) {
      console.error("Error fetching collections:", error);
    }
  }

  // Utility method to get available tile matrix sets
  public async getAvailableTileMatrixSets(): Promise<void> {
    try {
      const url = `${this.pdokBaseUrl}/tileMatrixSets`;
      const response = await firstValueFrom(
        this.http.get<{ tileMatrixSets: TileMatrixSet[] }>(url, {
          headers: { Accept: "application/json" },
        })
      );

      console.log("Available tile matrix sets:", response.tileMatrixSets);
    } catch (error) {
      console.error("Error fetching tile matrix sets:", error);
    }
  }
}
