/**
 * S&OP Supply Capacity Page
 *
 * Displays network hierarchy with drill-down to individual shop locations.
 * Networks are organized by parent company (e.g., "Eagle Railcar") with
 * expandable shop locations showing city/state and monthly capacity.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  BuildingStorefrontIcon,
  BuildingOffice2Icon,
  CubeIcon,
  MapPinIcon,
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  ALL_NETWORKS,
  AITX_NETWORK,
  THIRD_PARTY_NETWORKS,
  getSystemTotalCapacity,
  getAitxTotalCapacity,
  getThirdPartyTotalCapacity,
} from '../constants/shopNetworks';
import type { ShopNetwork, ShopLocation } from '../constants/shopNetworks';

type ViewFilter = 'all' | 'aitx' | 'thirdParty';

interface NetworkRowProps {
  network: ShopNetwork;
  isExpanded: boolean;
  onToggle: () => void;
}

function NetworkRow({ network, isExpanded, onToggle }: NetworkRowProps) {
  const totalMonthlyCapacity = network.locations.reduce(
    (sum, loc) => sum + loc.monthlyCapacity,
    0
  );
  const totalAnnualCapacity = totalMonthlyCapacity * 12;

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        network.isAitxInternal ? 'border-blue-200' : 'border-steel-200'
      }`}
    >
      {/* Network Header */}
      <div
        onClick={onToggle}
        className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
          network.isAitxInternal
            ? 'bg-blue-50 hover:bg-blue-100'
            : 'bg-steel-50 hover:bg-steel-100'
        }`}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDownIcon className="h-5 w-5 text-steel-500" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-steel-500" />
          )}
          <div
            className={`p-2 rounded-lg ${
              network.isAitxInternal ? 'bg-blue-100' : 'bg-emerald-100'
            }`}
          >
            <BuildingOffice2Icon
              className={`h-5 w-5 ${
                network.isAitxInternal ? 'text-blue-600' : 'text-emerald-600'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-steel-900">{network.name}</h3>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded ${
                  network.isAitxInternal
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {network.isAitxInternal ? 'AITX Internal' : '3rd Party'}
              </span>
            </div>
            <p className="text-xs text-steel-500">
              {network.locations.length} locations | Cost Index: {network.costIndex}x
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-xs text-steel-500 uppercase">Monthly Capacity</p>
            <p className="text-lg font-bold text-steel-900">
              {totalMonthlyCapacity.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-steel-500 uppercase">Annual Target</p>
            <p className="text-lg font-bold text-steel-900">
              {network.annualTargetVolume.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-steel-500 uppercase">Annual Capacity</p>
            <p className="text-lg font-bold text-steel-900">
              {totalAnnualCapacity.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Shop Locations */}
      {isExpanded && (
        <div className="border-t border-steel-200">
          <table className="min-w-full">
            <thead className="bg-steel-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-steel-700 uppercase">
                  Location
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-steel-700 uppercase">
                  City, State
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-steel-700 uppercase">
                  Region
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-steel-700 uppercase">
                  Tank Qualified
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-steel-700 uppercase">
                  Monthly Cap.
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-steel-700 uppercase">
                  Annual Cap.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {network.locations.map((location) => (
                <tr key={location.code} className="hover:bg-steel-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <BuildingStorefrontIcon className="h-4 w-4 text-steel-400" />
                      <div>
                        <div className="font-medium text-steel-900 text-sm">
                          {location.name}
                        </div>
                        <div className="text-xs text-steel-500">{location.code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-steel-700">
                      <MapPinIcon className="h-4 w-4 text-steel-400" />
                      {location.city}, {location.state}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-steel-700">{location.region}</td>
                  <td className="px-4 py-3 text-center">
                    {location.tankQualified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">
                        <CheckCircleIcon className="h-3 w-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-steel-100 text-steel-600 text-xs font-medium rounded">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-sm font-medium ${
                        network.isAitxInternal
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {location.monthlyCapacity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-steel-900">
                    {(location.monthlyCapacity * 12).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-steel-100">
              <tr>
                <td colSpan={4} className="px-4 py-2 font-semibold text-steel-700 text-sm">
                  {network.name} Total
                </td>
                <td className="px-4 py-2 text-right font-bold text-steel-900">
                  {totalMonthlyCapacity}
                </td>
                <td className="px-4 py-2 text-right font-bold text-steel-900">
                  {totalAnnualCapacity.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SOPCapacityPage() {
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(
    new Set(['aitx'])
  );
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

  // Get system capacity stats
  const systemCapacity = getSystemTotalCapacity();
  const aitxCapacity = getAitxTotalCapacity();
  const thirdPartyCapacity = getThirdPartyTotalCapacity();

  // Filter networks based on view filter
  const filteredNetworks = useMemo(() => {
    if (viewFilter === 'aitx') {
      return [AITX_NETWORK];
    }
    if (viewFilter === 'thirdParty') {
      return THIRD_PARTY_NETWORKS;
    }
    return ALL_NETWORKS;
  }, [viewFilter]);

  // Count statistics
  const totalLocations = ALL_NETWORKS.reduce(
    (sum, net) => sum + net.locations.length,
    0
  );
  const tankQualifiedLocations = ALL_NETWORKS.reduce(
    (sum, net) => sum + net.locations.filter((loc) => loc.tankQualified).length,
    0
  );

  const toggleNetwork = (networkId: string) => {
    setExpandedNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(networkId)) {
        next.delete(networkId);
      } else {
        next.add(networkId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedNetworks(new Set(ALL_NETWORKS.map((n) => n.id)));
  };

  const collapseAll = () => {
    setExpandedNetworks(new Set());
  };

  return (
    <div className="p-6 max-w-full mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-steel-900">S&OP Supply Capacity</h1>
        <p className="text-steel-500 mt-1">
          Network hierarchy showing shop locations and monthly capacity targets. Drill down
          from parent companies to individual shop locations.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="card p-4 border-l-4 border-l-rail-500">
          <div className="flex items-center gap-3">
            <div className="bg-rail-100 rounded-lg p-2">
              <CubeIcon className="h-5 w-5 text-rail-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">System Capacity</p>
              <p className="text-xl font-bold text-steel-900">
                {systemCapacity.annual.toLocaleString()}
              </p>
              <p className="text-xs text-steel-500">
                {systemCapacity.monthly}/mo
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-lg p-2">
              <BuildingStorefrontIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">AITX Internal</p>
              <p className="text-xl font-bold text-steel-900">
                {aitxCapacity.annual.toLocaleString()}
              </p>
              <p className="text-xs text-steel-500">
                {systemCapacity.aitxPercent}% of total
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 rounded-lg p-2">
              <BuildingOffice2Icon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">3rd Party</p>
              <p className="text-xl font-bold text-steel-900">
                {thirdPartyCapacity.annual.toLocaleString()}
              </p>
              <p className="text-xs text-steel-500">
                {systemCapacity.thirdPartyPercent}% of total
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 rounded-lg p-2">
              <MapPinIcon className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Total Locations</p>
              <p className="text-xl font-bold text-steel-900">{totalLocations}</p>
              <p className="text-xs text-steel-500">
                {ALL_NETWORKS.length} networks
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4 border-l-4 border-l-green-500">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 rounded-lg p-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-steel-500 uppercase">Tank Qualified</p>
              <p className="text-xl font-bold text-steel-900">
                {tankQualifiedLocations}
              </p>
              <p className="text-xs text-steel-500">
                {Math.round((tankQualifiedLocations / totalLocations) * 100)}% of
                locations
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-6">
        {/* Filter Toggle */}
        <div className="flex items-center bg-steel-100 rounded-lg p-1">
          <button
            onClick={() => setViewFilter('all')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewFilter === 'all'
                ? 'bg-white text-steel-900 shadow-sm'
                : 'text-steel-600 hover:text-steel-900'
            }`}
          >
            All Networks
          </button>
          <button
            onClick={() => setViewFilter('aitx')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewFilter === 'aitx'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-steel-600 hover:text-steel-900'
            }`}
          >
            AITX Only
          </button>
          <button
            onClick={() => setViewFilter('thirdParty')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewFilter === 'thirdParty'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-steel-600 hover:text-steel-900'
            }`}
          >
            3rd Party Only
          </button>
        </div>

        {/* Expand/Collapse Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowsPointingOutIcon className="h-4 w-4" />
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowsPointingInIcon className="h-4 w-4" />
            Collapse All
          </button>
        </div>
      </div>

      {/* Network List */}
      <div className="space-y-4">
        {filteredNetworks.map((network) => (
          <NetworkRow
            key={network.id}
            network={network}
            isExpanded={expandedNetworks.has(network.id)}
            onToggle={() => toggleNetwork(network.id)}
          />
        ))}
      </div>

      {/* Summary Footer */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 bg-blue-50 border-blue-200">
          <h4 className="text-sm font-medium text-blue-800 mb-3">
            AITX Internal Summary
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-600">Locations:</span>
              <span className="font-semibold text-blue-900">
                {AITX_NETWORK.locations.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">Monthly Capacity:</span>
              <span className="font-semibold text-blue-900">
                {aitxCapacity.monthly.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">Annual Capacity:</span>
              <span className="font-semibold text-blue-900">
                {aitxCapacity.annual.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">Annual Target:</span>
              <span className="font-semibold text-blue-900">
                {AITX_NETWORK.annualTargetVolume.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="card p-4 bg-emerald-50 border-emerald-200">
          <h4 className="text-sm font-medium text-emerald-800 mb-3">
            3rd Party Summary
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-emerald-600">Networks:</span>
              <span className="font-semibold text-emerald-900">
                {THIRD_PARTY_NETWORKS.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-600">Locations:</span>
              <span className="font-semibold text-emerald-900">
                {THIRD_PARTY_NETWORKS.reduce(
                  (sum, net) => sum + net.locations.length,
                  0
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-600">Monthly Capacity:</span>
              <span className="font-semibold text-emerald-900">
                {thirdPartyCapacity.monthly.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-600">Annual Capacity:</span>
              <span className="font-semibold text-emerald-900">
                {thirdPartyCapacity.annual.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="card p-4 bg-rail-50 border-rail-200">
          <h4 className="text-sm font-medium text-rail-800 mb-3">System Total</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-rail-600">All Networks:</span>
              <span className="font-semibold text-rail-900">
                {ALL_NETWORKS.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-rail-600">All Locations:</span>
              <span className="font-semibold text-rail-900">{totalLocations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-rail-600">Monthly Capacity:</span>
              <span className="font-semibold text-rail-900">
                {systemCapacity.monthly.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-rail-600">Annual Capacity:</span>
              <span className="font-semibold text-rail-900">
                {systemCapacity.annual.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
