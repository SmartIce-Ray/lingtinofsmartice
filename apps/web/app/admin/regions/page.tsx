// Admin Region Management Page - CRUD regions, assign stores & managers
// v1.0

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { useAuth, getAuthHeaders } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api';
import { UserMenu } from '@/components/layout/UserMenu';

interface Region {
  id: string;
  region_name: string;
  region_code: string | null;
  is_active: boolean;
  store_count: number;
  manager_count: number;
}

interface Store {
  id: string;
  restaurant_name: string;
  city: string;
  brand_id: number | null;
  region_id: string | null;
}

interface Manager {
  id: string;
  employee_name: string;
  username: string;
  managed_region_ids: string[] | null;
  managed_restaurant_ids: string[] | null;
}

const SWR_REGIONS = '/api/regions';
const SWR_ALL_STORES = '/api/regions/all-stores';
const SWR_MANAGERS = '/api/regions/managers';

export default function RegionManagePage() {
  const { user } = useAuth();
  const router = useRouter();

  const { data: regionsData, isLoading } = useSWR<{ data: Region[] }>(SWR_REGIONS);
  const { data: allStoresData } = useSWR<{ data: Store[] }>(SWR_ALL_STORES);
  const { data: managersData } = useSWR<{ data: Manager[] }>(SWR_MANAGERS);

  const regions = regionsData?.data ?? [];
  const allStores = allStoresData?.data ?? [];
  const allManagers = managersData?.data ?? [];

  // UI state — all hooks BEFORE any conditional return
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);

  // Store/manager editing
  const [editingStoresForRegion, setEditingStoresForRegion] = useState<string | null>(null);
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  const [editingManagersForRegion, setEditingManagersForRegion] = useState<string | null>(null);
  const [selectedManagerIds, setSelectedManagerIds] = useState<Set<string>>(new Set());

  // Redirect non-super-admins (after all hooks)
  if (user && !user.isSuperAdmin) {
    router.replace('/admin/briefing');
    return null;
  }

  const unassignedCount = allStores.filter((s) => !s.region_id).length;

  const refreshAll = () => {
    mutate(SWR_REGIONS);
    mutate(SWR_ALL_STORES);
    mutate(SWR_MANAGERS);
  };

  // ── Region CRUD ──

  const openCreate = () => {
    setIsNew(true);
    setEditingId(null);
    setFormName('');
  };

  const openEdit = (r: Region) => {
    setIsNew(false);
    setEditingId(r.id);
    setFormName(r.region_name);
  };

  const closeForm = () => {
    setIsNew(false);
    setEditingId(null);
    setFormName('');
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const url = isNew
        ? getApiUrl('api/regions')
        : getApiUrl(`api/regions/${editingId}`);
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: formName.trim() }),
      });
      if (!res.ok) {
        alert('保存失败，请重试');
        return;
      }
      refreshAll();
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: Region) => {
    if (r.store_count > 0) {
      alert(`该区域下还有 ${r.store_count} 家门店，请先移除门店再删除`);
      return;
    }
    if (!confirm(`确定删除「${r.region_name}」？`)) return;
    const res = await fetch(getApiUrl(`api/regions/${r.id}`), {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(err?.message || '删除失败');
      return;
    }
    if (expandedId === r.id) setExpandedId(null);
    refreshAll();
  };

  // ── Store assignment ──

  const startEditStores = (regionId: string) => {
    setEditingStoresForRegion(regionId);
    // Pre-select stores currently in this region
    const regionStores = allStores.filter((s) => s.region_id === regionId);
    setSelectedStoreIds(new Set(regionStores.map((s) => s.id)));
  };

  const saveStores = async (regionId: string) => {
    setSaving(true);
    try {
      const res = await fetch(getApiUrl(`api/regions/${regionId}/stores`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ store_ids: Array.from(selectedStoreIds) }),
      });
      if (!res.ok) {
        alert('保存失败');
        return;
      }
      refreshAll();
      setEditingStoresForRegion(null);
    } finally {
      setSaving(false);
    }
  };

  // ── Manager assignment ──

  const startEditManagers = (regionId: string) => {
    setEditingManagersForRegion(regionId);
    const assigned = allManagers.filter(
      (m) => m.managed_region_ids?.includes(regionId)
    );
    setSelectedManagerIds(new Set(assigned.map((m) => m.id)));
  };

  const saveManagers = async (regionId: string) => {
    setSaving(true);
    try {
      const res = await fetch(getApiUrl(`api/regions/${regionId}/managers`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ manager_ids: Array.from(selectedManagerIds) }),
      });
      if (!res.ok) {
        alert('保存失败');
        return;
      }
      refreshAll();
      setEditingManagersForRegion(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
    }
    setEditingStoresForRegion(null);
    setEditingManagersForRegion(null);
  };

  // Helper: get available stores for a region (current region's + unassigned)
  const getAvailableStores = (regionId: string): Store[] => {
    return allStores.filter((s) => s.region_id === regionId || !s.region_id);
  };

  // Helper: group stores by city
  const groupByCity = (stores: Store[]): Map<string, Store[]> => {
    const map = new Map<string, Store[]>();
    for (const s of stores) {
      const city = s.city || '其他';
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(s);
    }
    return map;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">区域管理</h1>
        </div>
        <UserMenu />
      </header>

      <main className="p-4 space-y-4">
        {/* Action bar */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">
            {regions.length > 0 ? `${regions.length} 个区域` : '暂无区域'}
            {unassignedCount > 0 && (
              <span className="text-amber-600 ml-2">
                · {unassignedCount} 家门店未分配
              </span>
            )}
          </p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            + 新建区域
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        )}

        {/* Create/Edit form (inline, at top) */}
        {(isNew || editingId) && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-primary-200">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              {isNew ? '新建区域' : '编辑区域'}
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="区域名称，如：绵阳区"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <button
                onClick={closeForm}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && regions.length === 0 && !isNew && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="text-gray-500 text-sm">暂无区域</div>
            <div className="text-gray-400 text-xs mt-1">点击「新建区域」按城市划分门店管辖范围</div>
          </div>
        )}

        {/* Region cards */}
        {regions.map((r) => {
          const isExpanded = expandedId === r.id;
          const isEditingStores = editingStoresForRegion === r.id;
          const isEditingManagers = editingManagersForRegion === r.id;

          const regionStores = allStores.filter((s) => s.region_id === r.id);
          const regionManagers = allManagers.filter(
            (m) => m.managed_region_ids?.includes(r.id)
          );

          return (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Card header */}
              <button
                onClick={() => toggleExpand(r.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-gray-900">{r.region_name}</h3>
                  <span className="bg-primary-50 text-primary-600 text-xs px-2 py-0.5 rounded-full">
                    {r.store_count} 店
                  </span>
                  {r.manager_count > 0 && (
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {r.manager_count} 管理员
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                    className="text-xs px-2 py-1 rounded-lg text-primary-600 bg-primary-50 hover:bg-primary-100"
                  >
                    编辑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
                    disabled={r.store_count > 0}
                    className="text-xs px-2 py-1 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={r.store_count > 0 ? '请先移除门店' : '删除区域'}
                  >
                    删除
                  </button>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
                  {/* ── Stores section ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">门店</h4>
                      {!isEditingStores && (
                        <button
                          onClick={() => startEditStores(r.id)}
                          className="text-xs text-primary-600 hover:text-primary-700"
                        >
                          管理门店
                        </button>
                      )}
                    </div>

                    {!isEditingStores && regionStores.length === 0 && (
                      <p className="text-xs text-gray-400">暂无门店，点击「管理门店」分配</p>
                    )}

                    {!isEditingStores && regionStores.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {regionStores.map((s) => (
                          <span key={s.id} className="bg-gray-50 text-gray-700 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                            {s.restaurant_name}
                          </span>
                        ))}
                      </div>
                    )}

                    {isEditingStores && (
                      <StoreCheckboxList
                        stores={getAvailableStores(r.id)}
                        selectedIds={selectedStoreIds}
                        onToggle={(id) => {
                          const next = new Set(selectedStoreIds);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          setSelectedStoreIds(next);
                        }}
                        groupByCity={groupByCity}
                      />
                    )}

                    {isEditingStores && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => setEditingStoresForRegion(null)}
                          className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => saveStores(r.id)}
                          disabled={saving}
                          className="px-3 py-1.5 text-xs text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                          {saving ? '保存中...' : '保存'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Managers section ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">管理员</h4>
                      {!isEditingManagers && (
                        <button
                          onClick={() => startEditManagers(r.id)}
                          className="text-xs text-primary-600 hover:text-primary-700"
                        >
                          管理人员
                        </button>
                      )}
                    </div>

                    {!isEditingManagers && regionManagers.length === 0 && (
                      <p className="text-xs text-gray-400">暂无管理员，点击「管理人员」分配</p>
                    )}

                    {!isEditingManagers && regionManagers.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {regionManagers.map((m) => (
                          <span
                            key={m.id}
                            className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full"
                          >
                            {m.employee_name}
                          </span>
                        ))}
                      </div>
                    )}

                    {isEditingManagers && (
                      <div className="space-y-1">
                        {allManagers.length === 0 ? (
                          <p className="text-xs text-gray-400">暂无管理员账号</p>
                        ) : (
                          allManagers.map((m) => (
                            <label key={m.id} className="flex items-center gap-2 text-sm text-gray-700 py-1">
                              <input
                                type="checkbox"
                                checked={selectedManagerIds.has(m.id)}
                                onChange={() => {
                                  const next = new Set(selectedManagerIds);
                                  if (next.has(m.id)) next.delete(m.id);
                                  else next.add(m.id);
                                  setSelectedManagerIds(next);
                                }}
                                className="rounded"
                              />
                              {m.employee_name}
                              <span className="text-xs text-gray-400">@{m.username}</span>
                            </label>
                          ))
                        )}
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => setEditingManagersForRegion(null)}
                            className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => saveManagers(r.id)}
                            disabled={saving}
                            className="px-3 py-1.5 text-xs text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                          >
                            {saving ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}

// ── Sub-component: Store checkbox list grouped by city ──

function StoreCheckboxList({
  stores,
  selectedIds,
  onToggle,
  groupByCity,
}: {
  stores: Store[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  groupByCity: (stores: Store[]) => Map<string, Store[]>;
}) {
  if (stores.length === 0) {
    return <p className="text-xs text-gray-400">没有可分配的门店</p>;
  }

  const grouped = groupByCity(stores);

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([city, cityStores]) => (
        <div key={city}>
          <p className="text-xs text-gray-400 mb-1">{city}</p>
          {cityStores.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700 py-1 pl-2">
              <input
                type="checkbox"
                checked={selectedIds.has(s.id)}
                onChange={() => onToggle(s.id)}
                className="rounded"
              />
              {s.restaurant_name}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
