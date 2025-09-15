import { Component,OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import OLMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import OSM from 'ol/source/OSM.js';
import VectorTileSource from 'ol/source/VectorTile.js';
import MVT from 'ol/format/MVT.js';
import { Style, Fill, Stroke, Text, Circle, Icon } from 'ol/style.js';
import { fromLonLat, get as getProjection } from 'ol/proj.js';
import { register } from 'ol/proj/proj4.js';
import proj4 from 'proj4';
import { FeatureLike } from 'ol/Feature';
import { Geometry } from 'ol/geom';

// Register RD New projection for Netherlands
proj4.defs('EPSG:28992', '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs');
register(proj4);

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

// Add these interfaces for PDOK/Mapbox GL style format
interface MapboxGLStyle {
  version: number;
  name?: string;
  metadata?: any;
  sources: { [key: string]: MapboxGLSource };
  layers: MapboxGLLayer[];
  glyphs?: string;
  sprite?: string;
}

interface MapboxGLSource {
  type: string;
  url?: string;
  tiles?: string[];
  minzoom?: number;
  maxzoom?: number;
}

interface MapboxGLLayer {
  id: string;
  type: 'background' | 'fill' | 'line' | 'symbol' | 'raster' | 'circle' | 'fill-extrusion' | 'heatmap' | 'hillshade';
  source?: string;
  'source-layer'?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: any[];
  layout?: any;
  paint?: any;
}


@Component({
  selector: 'app-map',
  imports: [],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent implements OnInit, OnDestroy {

  private map: OLMap = new OLMap();

  // PDOK OGC API configuration
  private readonly pdokBaseUrl = 'https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1';
  private readonly collectionId = 'brt-achtergrondkaart';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';
  private readonly styleUrl = 'https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1/styles/standaard__netherlandsrdnewquad?f=json';
  
    // Cache for parsed styles
  private styleCache: Map<string, Style | Style[]> = new Map();
  private pdokStyle: MapboxGLStyle | null = null;

  constructor(private http: HttpClient) {
    
  }

  ngOnInit(): void {
    console.log('MapComponent start initialization');
    this.initializeMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.setTarget(undefined);
    }
  }

  /*
  A View also has a projection. The projection determines the coordinate system of the center and the units for map resolution calculations. If not specified (like in the above snippet), the default projection is Spherical Mercator (EPSG:3857), with meters as map units.
  */
  private async initializeMap(): Promise<void> {
    try {
      // Set up RD New projection
      const rdProjection = getProjection('EPSG:28992');
      if (rdProjection) {
        rdProjection.setExtent([-285401.92, 22598.08, 595401.92, 903401.92]);
      }

      // Create base map with OSM as fallback
      this.map = new OLMap({
        target: 'map',
        layers: [
          new TileLayer({
            source: new OSM(),
            properties: { name: 'OpenStreetMap' }
          })
        ],
        view: new View({
          center: fromLonLat([5.3, 52.1]), // Center on Netherlands
          zoom: 7,
          projection: 'EPSG:28992' // 'EPSG:3857' // Start with Web Mercator
        }),
      });


      // Load PDOK style first, then create layer
      await this.loadPdokStyle();

      // Load PDOK BRT layer
      await this.addPdokBrtLayer();
      
      // Switch to RD New projection for better PDOK integration
      this.switchToRDNewProjection();
      
      console.log('Map initialization completed');
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  /**
   * Load and parse PDOK Mapbox GL style
   */
  private async loadPdokStyle(): Promise<void> {
    try {
      console.log('Loading PDOK style from:', this.styleUrl);
      
      const response = await firstValueFrom(
        this.http.get<MapboxGLStyle>(this.styleUrl, {
          headers: { 'Accept': 'application/json' }
        })
      );
      
      this.pdokStyle = response;
      console.log('PDOK style loaded:', this.pdokStyle);
      
      // Pre-process styles for better performance
      this.preprocessStyles();
      
    } catch (error) {
      console.error('Error loading PDOK style:', error);
      this.pdokStyle = null;
    }
  }

  /**
   * Preprocess Mapbox GL layers for OpenLayers conversion
   */
  private preprocessStyles(): void {
    if (!this.pdokStyle) return;

    // Clear existing cache
    this.styleCache.clear();

    // Process each layer in the style
    this.pdokStyle.layers.forEach(layer => {
      console.log("Processing layer: " + layer.id + " type: " + layer.type);
      const olStyle = this.convertMapboxLayerToOpenLayers(layer);
      if (olStyle) {
        this.styleCache.set(layer.id, olStyle);
      }
    });

    console.log(`Preprocessed ${this.styleCache.size} styles`);
  }

   /**
   * Convert Mapbox GL layer to OpenLayers style
   */
  private convertMapboxLayerToOpenLayers(layer: MapboxGLLayer): Style | Style[] | null {
    switch (layer.type) {
      case 'fill':
        return this.createFillStyle(layer);
      case 'line':
        return this.createLineStyle(layer);
      case 'symbol':
        return this.createSymbolStyle(layer);
      case 'circle':
        return this.createCircleStyle(layer);
      case 'background':
        return this.createBackgroundStyle(layer);
      default:
        console.warn(`Unsupported layer type: ${layer.type}`);
        return null;
    }
  }

  /**
   * Create fill style from Mapbox GL fill layer
   */
  private createFillStyle(layer: MapboxGLLayer): Style {
    const paint = layer.paint || {};
    
    return new Style({
      fill: new Fill({
        color: this.parseColor(paint['fill-color'] || '#000000', paint['fill-opacity'] || 1)
      }),
      stroke: paint['fill-outline-color'] ? new Stroke({
        color: this.parseColor(paint['fill-outline-color'], 1),
        width: 1
      }) : undefined
    });
  }

  /**
   * Create line style from Mapbox GL line layer
   */
  private createLineStyle(layer: MapboxGLLayer): Style {
    const paint = layer.paint || {};
    
    return new Style({
      stroke: new Stroke({
        color: this.parseColor(paint['line-color'] || '#000000', paint['line-opacity'] || 1),
        width: paint['line-width'] || 1,
        lineCap: paint['line-cap'] || 'round',
        lineJoin: paint['line-join'] || 'round',
        lineDash: paint['line-dasharray'] || undefined
      })
    });
  }

  /**
   * Create symbol/text style from Mapbox GL symbol layer
   */
  private createSymbolStyle(layer: MapboxGLLayer): Style {
    const layout = layer.layout || {};
    const paint = layer.paint || {};
    
    const textField = layout['text-field'];
    if (textField) {
      return new Style({
        text: new Text({
          text: textField,
          font: this.parseFont(layout['text-font'], layout['text-size']),
          fill: new Fill({
            color: this.parseColor(paint['text-color'] || '#000000', paint['text-opacity'] || 1)
          }),
          stroke: paint['text-halo-color'] ? new Stroke({
            color: this.parseColor(paint['text-halo-color'], 1),
            width: paint['text-halo-width'] || 0
          }) : undefined,
          offsetX: layout['text-offset'] ? layout['text-offset'][0] * 8 : 0,
          offsetY: layout['text-offset'] ? layout['text-offset'][1] * 8 : 0,
          textAlign: layout['text-anchor'] || 'center'
        })
      });
    }

    // Handle icon if no text
    const iconImage = layout['icon-image'];
    if (iconImage) {
      return new Style({
        image: new Icon({
          src: iconImage,
          scale: layout['icon-size'] || 1
        })
      });
    }

    return this.createDefaultPointStyle();
  }

  /**
   * Create circle style from Mapbox GL circle layer
   */
  private createCircleStyle(layer: MapboxGLLayer): Style {
    const paint = layer.paint || {};
    
    return new Style({
      image: new Circle({
        radius: paint['circle-radius'] || 5,
        fill: new Fill({
          color: this.parseColor(paint['circle-color'] || '#000000', paint['circle-opacity'] || 1)
        }),
        stroke: paint['circle-stroke-color'] ? new Stroke({
          color: this.parseColor(paint['circle-stroke-color'], paint['circle-stroke-opacity'] || 1),
          width: paint['circle-stroke-width'] || 0
        }) : undefined
      })
    });
  }

  /**
   * Create background style (used for raster layers)
   */
  private createBackgroundStyle(layer: MapboxGLLayer): Style {
    const paint = layer.paint || {};
    
    return new Style({
      fill: new Fill({
        color: this.parseColor(paint['background-color'] || '#f0f0f0', paint['background-opacity'] || 1)
      })
    });
  }

  /**
   * Parse color with opacity
   */
  private parseColor(color: any, opacity: number = 1): string {
    if (typeof color !== 'string') {
      return 'rgba(0, 0, 0, 1)';
    }

    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    // Handle rgb/rgba colors
    if (color.startsWith('rgb')) {
      if (opacity !== 1 && color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
      }
      return color;
    }

    // Handle named colors - basic conversion
    const namedColors: { [key: string]: string } = {
      'white': '#ffffff',
      'black': '#000000',
      'red': '#ff0000',
      'green': '#00ff00',
      'blue': '#0000ff'
    };

    if (namedColors[color.toLowerCase()]) {
      return this.parseColor(namedColors[color.toLowerCase()], opacity);
    }

    return color;
  }

  /**
   * Parse font definition
   */
  private parseFont(fontFamily: string[] = [], fontSize: number = 12): string {
    const family = fontFamily.length > 0 ? fontFamily.join(', ') : 'Arial, sans-serif';
    return `${fontSize}px ${family}`;
  }

  /**
   * Create default point style
   */
  private createDefaultPointStyle(): Style {
    return new Style({
      image: new Circle({
        radius: 3,
        fill: new Fill({ color: '#ff0000' }),
        stroke: new Stroke({ color: '#ffffff', width: 1 })
      })
    });
  }

  /**
 * Style function that uses PDOK styles
 */
private createPdokStyleFunction(): (feature: FeatureLike, resolution: number) => Style | Style[] {
  return (feature: FeatureLike, resolution: number) => {
    // Get feature properties - handle both Feature and RenderFeature
    const properties = feature.getProperties();
    const geometryType = feature.getGeometry()?.getType();
    const sourceLayer = properties['layer'] || properties['source-layer'];

    // Try to find matching style from PDOK
    if (this.pdokStyle) {
      // Find matching layers in style
      const matchingLayers = this.pdokStyle.layers.filter(layer => {
        // Match by source-layer if available
        if (sourceLayer && layer['source-layer']) {
          return layer['source-layer'] === sourceLayer;
        }
        
        // Match by geometry type
        if (geometryType) {
          switch (geometryType) {
            case 'Polygon':
            case 'MultiPolygon':
              return layer.type === 'fill';
            case 'LineString':
            case 'MultiLineString':
              return layer.type === 'line';
            case 'Point':
            case 'MultiPoint':
              return layer.type === 'circle' || layer.type === 'symbol';
            default:
              return false;
          }
        }
        
        return false;
      });

      // Return style for first matching layer
      if (matchingLayers.length > 0) {
        const styleKey = matchingLayers[0].id;
        const cachedStyle = this.styleCache.get(styleKey);
        if (cachedStyle) {
          return cachedStyle;
        }
      }
    }

    // Fallback to default styles
    return this.createDefaultStyleForGeometry(geometryType || '');
  };
}

  /**
   * Create default style based on geometry type
   */
  private createDefaultStyleForGeometry(geometryType: string): Style {
    switch (geometryType) {
      case 'Polygon':
      case 'MultiPolygon':
        return new Style({
          fill: new Fill({ color: 'rgba(0, 100, 255, 0.3)' }),
          stroke: new Stroke({ color: '#0064ff', width: 2 })
        });
      case 'LineString':
      case 'MultiLineString':
        return new Style({
          stroke: new Stroke({ color: '#ff6600', width: 2 })
        });
      case 'Point':
      case 'MultiPoint':
        return this.createDefaultPointStyle();
      default:
        return new Style({
          stroke: new Stroke({ color: '#666666', width: 1 }),
          fill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' })
        });
    }
  }

  private async addPdokBrtLayer(): Promise<void> {
    try {
      // Get collection metadata
     // const collection = await this.getCollection();
      //console.log('BRT Collection:', collection);

      // Get tile matrix set
      const tileMatrixSet = await this.getTileMatrixSet();
      console.log('Tile Matrix Set:', tileMatrixSet);

      if (tileMatrixSet) {
        // Create vector tile layer
        const brtLayer = this.createBrtVectorTileLayer(tileMatrixSet);
        
        // Add layer to map
        this.map.addLayer(brtLayer);
        console.log('BRT Achtergrondkaart layer added successfully');
      }
    } catch (error) {
      console.error('Error adding PDOK BRT layer:', error);
    }
  }

  private async getCollection(): Promise<OGCCollection | null> {
    try {
      const url = `${this.pdokBaseUrl}/collections/${this.collectionId}`;
      const response = await firstValueFrom(
        this.http.get<OGCCollection>(url, {
          headers: { 'Accept': 'application/json' }
        })
      );
      return response;
    } catch (error) {
      console.error('Error fetching collection:', error);
      return null;
    }
  }


  private async getTileMatrixSet(): Promise<TileMatrixSet | null> {
    try {
      const url = `${this.pdokBaseUrl}/tileMatrixSets/${this.tileMatrixSetId}`;
      const response = await firstValueFrom(
        this.http.get<TileMatrixSet>(url, {
          headers: { 'Accept': 'application/json' }
        })
      );
      return response;
    } catch (error) {
      console.error('Error fetching tile matrix set:', error);
      return null;
    }
  }

   private createBrtVectorTileLayer(tileMatrixSet: TileMatrixSet): VectorTileLayer {
    // Build tile URL template for vector tiles
    const tileUrlTemplate = 'https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1/tiles/NetherlandsRDNewQuad/{z}/{y}/{x}?f=mvt';
//    `${this.pdokBaseUrl}/collections/${this.collectionId}/tiles/${this.tileMatrixSetId}/{z}/{y}/{x}?f=mvt`;

    const vectorTileSource = new VectorTileSource({
      format: new MVT(),
      url: tileUrlTemplate,
      projection: 'EPSG:28992',
      attributions: ['© PDOK'],
    });

    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      style: this.createPdokStyleFunction(), // Use PDOK style function instead of simple style
      properties: {
        name: 'BRT Achtergrondkaart',
        type: 'background'
      }
    });

    return vectorTileLayer;
  }

  private switchToRDNewProjection(): void {
    try {
      // Create new view with RD New projection
      const rdView = new View({
        projection: 'EPSG:28992',
        center: [155000, 463000], // Center of Netherlands in RD coordinates
        zoom: 3,
        minZoom: 0,
        maxZoom: 19,
        extent: [-285401.92, 22598.08, 595401.92, 903401.92]
      });

      // Set the new view
      this.map.setView(rdView);
      
      console.log('Switched to RD New projection');
    } catch (error) {
      console.error('Error switching to RD New projection:', error);
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
            attributions: ['© PDOK'],
            crossOrigin: 'anonymous'
          }),
          properties: {
            name: 'BRT Achtergrondkaart (Raster)',
            type: 'background'
          }
        });

        this.map.addLayer(brtTileLayer);
        console.log('BRT raster layer added successfully');
      }
    } catch (error) {
      console.error('Error adding PDOK BRT raster layer:', error);
    }
  }


  // Utility method to get available collections
  public async getAvailableCollections(): Promise<void> {
    try {
      const url = `${this.pdokBaseUrl}/collections`;
      const response = await firstValueFrom(
        this.http.get<{ collections: OGCCollection[] }>(url, {
          headers: { 'Accept': 'application/json' }
        })
      );
      
      console.log('Available collections:', response.collections);
    } catch (error) {
      console.error('Error fetching collections:', error);
    }
  }


  // Utility method to get available tile matrix sets
  public async getAvailableTileMatrixSets(): Promise<void> {
    try {
      const url = `${this.pdokBaseUrl}/tileMatrixSets`;
      const response = await firstValueFrom(
        this.http.get<{ tileMatrixSets: TileMatrixSet[] }>(url, {
          headers: { 'Accept': 'application/json' }
        })
      );
      
      console.log('Available tile matrix sets:', response.tileMatrixSets);
    } catch (error) {
      console.error('Error fetching tile matrix sets:', error);
    }
  }

}
