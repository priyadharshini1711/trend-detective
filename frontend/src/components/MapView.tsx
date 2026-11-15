import { useEffect } from 'react';
import { CircleMarker, LayersControl, MapContainer, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { diverging } from '../lib/colors';
import type { Palette } from '../lib/variables';

export interface GridCell { lat: number; lon: number; half: [number, number]; slope?: number; p?: number; err?: string; place?: string }

interface Props {
  lat: number; lon: number; onPick: (lat: number, lon: number) => void;
  cells: GridCell[]; palette: Palette; scale: number; unit: string; onCell?: (c: GridCell) => void;
  flyKey: string;
}

function Clicker({ onPick }: { onPick: Props['onPick'] }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, ((e.latlng.lng + 540) % 360) - 180) });
  return null;
}
function Fly({ lat, lon, flyKey, zoom }: { lat: number; lon: number; flyKey: string; zoom: number }) {
  const map = useMap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { map.flyTo([lat, lon], zoom, { duration: 1.2 }); }, [flyKey]);
  return null;
}

export default function MapView({ lat, lon, onPick, cells, palette, scale, unit, onCell, flyKey }: Props) {
  const zoom = cells.length ? Math.max(2, Math.min(6, Math.round(8 - Math.log2(cells[0].half[0] * 2 * Math.sqrt(cells.length))))) : 4;
  return (
    <MapContainer center={[lat, lon]} zoom={3} minZoom={2} worldCopyJump className="map">
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="NASA Blue Marble (GIBS)">
          <TileLayer maxNativeZoom={8} maxZoom={12}
            attribution='Imagery: NASA EOSDIS GIBS / Blue Marble'
            url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="NASA Black Marble (city lights)">
          <TileLayer maxNativeZoom={8} maxZoom={12} attribution='Imagery: NASA EOSDIS GIBS / Black Marble'
            url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Dark streets">
          <TileLayer attribution='Tiles &copy; Esri' maxNativeZoom={16}
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="Place labels">
          <TileLayer attribution='Labels &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
        </LayersControl.Overlay>
      </LayersControl>
      <Clicker onPick={onPick} />
      <Fly lat={lat} lon={lon} flyKey={flyKey} zoom={zoom} />
      {cells.map((c, i) => {
        const sig = c.p !== undefined && c.p < 0.05;
        const fill = c.slope === undefined ? '#555' : diverging(palette, c.slope / (scale || 1));
        return (
          <Rectangle key={i} bounds={[[c.lat - c.half[0], c.lon - c.half[1]], [c.lat + c.half[0], c.lon + c.half[1]]]}
            eventHandlers={{ click: () => onCell?.(c) }}
            pathOptions={{ color: sig ? '#fff' : '#cfd6e6', weight: sig ? 1.5 : 0.6, dashArray: sig ? undefined : '3 3',
              fillColor: fill, fillOpacity: c.slope === undefined ? 0.15 : sig ? 0.78 : 0.3 }}>
            <Tooltip sticky>
              <b>{c.lat.toFixed(1)}°, {c.lon.toFixed(1)}°</b><br />
              {c.err ? `⚠ ${c.err}` : c.slope === undefined ? 'loading…' :
                <>{(c.slope * 10 >= 0 ? '+' : '') + (c.slope * 10).toPrecision(2)} {unit}/decade<br />{sig ? `significant (p=${c.p!.toFixed(3)})` : `not significant yet (p=${c.p!.toFixed(2)})`}<br /><i>click to investigate</i></>}
            </Tooltip>
          </Rectangle>
        );
      })}
      <CircleMarker center={[lat, lon]} radius={9} pathOptions={{ color: '#ffc24b', weight: 3, fillColor: '#ffc24b', fillOpacity: 0.35 }} />
      <CircleMarker center={[lat, lon]} radius={2.5} pathOptions={{ color: '#fff', weight: 0, fillColor: '#fff', fillOpacity: 1 }} />
    </MapContainer>
  );
}
