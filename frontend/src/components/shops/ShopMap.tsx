/**
 * Shop Map Component
 *
 * Interactive Leaflet map displaying shop locations with:
 * - Clustered markers for dense areas
 * - Popup info on click
 * - Filter by region/network
 * - Color coding by network type
 */

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Shop } from '../../types';

// Fix for default marker icons in webpack/vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons by type
const createIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

const MARKER_COLORS = {
  aitxInternal: '#1b4af5', // rail-600
  thirdParty: '#f59e0b', // amber-500
  inactive: '#94a3b8', // steel-400
};

interface ShopMapProps {
  shops: Shop[];
  onShopClick?: (shop: Shop) => void;
  selectedShopId?: string | null;
  height?: string;
  showControls?: boolean;
}

// Component to fit bounds when shops change
function FitBounds({ shops }: { shops: Shop[] }) {
  const map = useMap();

  useEffect(() => {
    const validShops = shops.filter(s => s.latitude && s.longitude);
    if (validShops.length === 0) return;

    const bounds = L.latLngBounds(
      validShops.map(s => [s.latitude!, s.longitude!] as [number, number])
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }
  }, [shops, map]);

  return null;
}

export default function ShopMap({
  shops,
  onShopClick,
  selectedShopId,
  height = '400px',
  showControls = true,
}: ShopMapProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [showInactive, setShowInactive] = useState(false);

  // Filter shops with valid coordinates
  const mappableShops = useMemo(() => {
    return shops.filter(shop => {
      const hasCoords = shop.latitude != null && shop.longitude != null;
      const matchesRegion = !selectedRegion || shop.region === selectedRegion;
      const matchesNetwork = !selectedNetwork || shop.network === selectedNetwork;
      const matchesActive = showInactive || shop.isActive;
      return hasCoords && matchesRegion && matchesNetwork && matchesActive;
    });
  }, [shops, selectedRegion, selectedNetwork, showInactive]);

  // Get unique regions and networks for filters
  const regions = useMemo(() => {
    return [...new Set(shops.map(s => s.region).filter(Boolean))].sort();
  }, [shops]);

  const networks = useMemo(() => {
    return [...new Set(shops.map(s => s.network).filter(Boolean))].sort();
  }, [shops]);

  // Default center (US center)
  const defaultCenter: [number, number] = [39.8283, -98.5795];
  const defaultZoom = 4;

  // Get marker icon based on shop type
  const getMarkerIcon = (shop: Shop) => {
    if (!shop.isActive) return createIcon(MARKER_COLORS.inactive);
    if (shop.isAitxInternal) return createIcon(MARKER_COLORS.aitxInternal);
    return createIcon(MARKER_COLORS.thirdParty);
  };

  if (mappableShops.length === 0 && shops.length > 0) {
    return (
      <div className="bg-steel-50 border border-steel-200 rounded-lg p-8 text-center" style={{ height }}>
        <p className="text-steel-600 font-medium">No shops with location data</p>
        <p className="text-sm text-steel-500 mt-1">
          Add latitude and longitude coordinates to shops to display them on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter Controls */}
      {showControls && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select
            value={selectedRegion}
            onChange={e => setSelectedRegion(e.target.value)}
            className="input-field max-w-[160px]"
          >
            <option value="">All Regions</option>
            {regions.map(region => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>

          <select
            value={selectedNetwork}
            onChange={e => setSelectedNetwork(e.target.value)}
            className="input-field max-w-[160px]"
          >
            <option value="">All Networks</option>
            {networks.map(network => (
              <option key={network} value={network}>{network}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-steel-300 text-rail-600"
            />
            <span className="text-steel-600">Show inactive</span>
          </label>

          <div className="flex-1" />

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-steel-500">
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: MARKER_COLORS.aitxInternal }}
              />
              AITX
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: MARKER_COLORS.thirdParty }}
              />
              3rd Party
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: MARKER_COLORS.inactive }}
              />
              Inactive
            </div>
          </div>
        </div>
      )}

      {/* Map Container */}
      <div className="rounded-lg overflow-hidden border border-steel-200" style={{ height }}>
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds shops={mappableShops} />

          {mappableShops.map(shop => (
            <Marker
              key={shop.id}
              position={[shop.latitude!, shop.longitude!]}
              icon={getMarkerIcon(shop)}
              eventHandlers={{
                click: () => onShopClick?.(shop),
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="font-semibold text-steel-900">{shop.name}</div>
                  <div className="text-xs text-steel-500 mb-2">{shop.code}</div>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-steel-500">Location:</span>
                      <span className="text-steel-900">{shop.city}, {shop.state}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-steel-500">Region:</span>
                      <span className="text-steel-900">{shop.region || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-steel-500">Network:</span>
                      <span className="text-steel-900">{shop.network || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-steel-500">Capacity:</span>
                      <span className="text-steel-900">{shop.capacity} cars/mo</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-steel-500">Status:</span>
                      <span className={shop.isActive ? 'text-green-600' : 'text-red-600'}>
                        {shop.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {onShopClick && (
                    <button
                      onClick={() => onShopClick(shop)}
                      className="mt-3 w-full text-center text-sm text-rail-600 hover:text-rail-700 font-medium"
                    >
                      View Details →
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-steel-500">
        <span>
          Showing {mappableShops.length} of {shops.length} shops
        </span>
        {mappableShops.length < shops.length && (
          <span>
            {shops.length - mappableShops.length} shops without coordinates
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Mini map for use in cards or compact spaces
 */
export function ShopMapMini({
  latitude,
  longitude,
  shopName,
  height = '150px',
}: {
  latitude: number;
  longitude: number;
  shopName?: string;
  height?: string;
}) {
  if (!latitude || !longitude) {
    return (
      <div
        className="bg-steel-100 rounded flex items-center justify-center text-steel-400 text-sm"
        style={{ height }}
      >
        No location
      </div>
    );
  }

  return (
    <div className="rounded overflow-hidden" style={{ height }}>
      <MapContainer
        center={[latitude, longitude]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
        zoomControl={false}
        dragging={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]}>
          {shopName && (
            <Popup>
              <span className="font-medium">{shopName}</span>
            </Popup>
          )}
        </Marker>
      </MapContainer>
    </div>
  );
}
