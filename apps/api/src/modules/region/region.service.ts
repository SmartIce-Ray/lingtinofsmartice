// Region Service - CRUD + store/manager assignment for regions
// v1.0

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RegionService {
  private readonly logger = new Logger(RegionService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private validateUUID(id: string, label = 'id'): void {
    if (!UUID_REGEX.test(id)) {
      throw new BadRequestException(`Invalid ${label}: ${id}`);
    }
  }

  async listRegions() {
    if (this.supabase.isMockMode()) {
      return {
        data: [
          { id: 'mock-region-1', region_name: '绵阳区', region_code: 'mianyang', is_active: true, store_count: 4, manager_count: 0 },
          { id: 'mock-region-2', region_name: '常熟区', region_code: 'changshu', is_active: true, store_count: 3, manager_count: 0 },
        ],
        message: 'OK',
      };
    }

    const client = this.supabase.getClient();

    // Get all regions
    const { data: regions, error } = await client
      .from('master_region')
      .select('*')
      .eq('is_active', true)
      .order('region_name');

    if (error) throw error;

    // Get store counts per region
    const { data: stores } = await client
      .from('master_restaurant')
      .select('id, region_id')
      .eq('is_active', true)
      .not('region_id', 'is', null);

    // Get managers with managed_region_ids
    const { data: managers } = await client
      .from('master_employee')
      .select('id, managed_region_ids')
      .eq('role_code', 'administrator')
      .eq('is_active', true)
      .not('managed_region_ids', 'is', null);

    const storeCountMap = new Map<string, number>();
    for (const s of stores || []) {
      storeCountMap.set(s.region_id, (storeCountMap.get(s.region_id) || 0) + 1);
    }

    const managerCountMap = new Map<string, number>();
    for (const m of managers || []) {
      if (m.managed_region_ids) {
        for (const rid of m.managed_region_ids) {
          managerCountMap.set(rid, (managerCountMap.get(rid) || 0) + 1);
        }
      }
    }

    const enriched = (regions || []).map((r) => ({
      ...r,
      store_count: storeCountMap.get(r.id) || 0,
      manager_count: managerCountMap.get(r.id) || 0,
    }));

    return { data: enriched, message: 'OK' };
  }

  async createRegion(name: string, code?: string) {
    if (this.supabase.isMockMode()) {
      return { data: { id: 'mock-new', region_name: name, region_code: code || null }, message: '已创建' };
    }

    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('master_region')
      .insert({ region_name: name, region_code: code || null })
      .select()
      .single();

    if (error) throw error;

    this.logger.log(`Created region "${name}"`);
    return { data, message: '已创建' };
  }

  async updateRegion(id: string, name: string) {
    this.validateUUID(id, 'region_id');

    if (this.supabase.isMockMode()) {
      return { data: { id, region_name: name }, message: '已更新' };
    }

    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('master_region')
      .update({ region_name: name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { data, message: '已更新' };
  }

  async deleteRegion(id: string) {
    this.validateUUID(id, 'region_id');

    if (this.supabase.isMockMode()) {
      return { message: '已删除' };
    }

    const client = this.supabase.getClient();

    // Check no stores are assigned
    const { count } = await client
      .from('master_restaurant')
      .select('id', { count: 'exact', head: true })
      .eq('region_id', id)
      .eq('is_active', true);

    if (count && count > 0) {
      throw new BadRequestException(`该区域下还有 ${count} 家门店，请先移除门店再删除`);
    }

    // Soft delete
    const { error } = await client
      .from('master_region')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    // Remove from any manager's managed_region_ids
    const { data: managers } = await client
      .from('master_employee')
      .select('id, managed_region_ids')
      .not('managed_region_ids', 'is', null)
      .contains('managed_region_ids', [id]);

    if (managers && managers.length > 0) {
      for (const m of managers) {
        const updated = (m.managed_region_ids as string[]).filter((rid: string) => rid !== id);
        await client
          .from('master_employee')
          .update({ managed_region_ids: updated.length > 0 ? updated : null })
          .eq('id', m.id);
      }
    }

    this.logger.log(`Deleted region ${id}`);
    return { message: '已删除' };
  }

  async updateRegionStores(regionId: string, storeIds: string[]) {
    this.validateUUID(regionId, 'region_id');
    for (const sid of storeIds) {
      this.validateUUID(sid, 'store_id');
    }

    if (this.supabase.isMockMode()) {
      return { message: '已更新门店分配' };
    }

    const client = this.supabase.getClient();

    // Clear old assignments for this region
    await client
      .from('master_restaurant')
      .update({ region_id: null })
      .eq('region_id', regionId);

    // Set new assignments
    if (storeIds.length > 0) {
      await client
        .from('master_restaurant')
        .update({ region_id: regionId })
        .in('id', storeIds);
    }

    this.logger.log(`Updated region ${regionId} stores: ${storeIds.length} assigned`);
    return { message: '已更新门店分配' };
  }

  async updateRegionManagers(regionId: string, managerIds: string[]) {
    this.validateUUID(regionId, 'region_id');
    for (const mid of managerIds) {
      this.validateUUID(mid, 'manager_id');
    }

    if (this.supabase.isMockMode()) {
      return { message: '已更新管理员分配' };
    }

    const client = this.supabase.getClient();

    // Get all administrators who currently have this region in their managed_region_ids
    const { data: currentManagers } = await client
      .from('master_employee')
      .select('id, managed_region_ids')
      .eq('role_code', 'administrator')
      .eq('is_active', true)
      .not('managed_region_ids', 'is', null);

    // Remove regionId from managers no longer assigned
    for (const m of currentManagers || []) {
      const regions = m.managed_region_ids as string[];
      if (regions.includes(regionId) && !managerIds.includes(m.id)) {
        const updated = regions.filter((rid: string) => rid !== regionId);
        await client
          .from('master_employee')
          .update({ managed_region_ids: updated.length > 0 ? updated : null })
          .eq('id', m.id);
      }
    }

    // Add regionId to newly assigned managers
    for (const mid of managerIds) {
      const existing = currentManagers?.find((m) => m.id === mid);
      const currentRegions = (existing?.managed_region_ids as string[]) || [];
      if (!currentRegions.includes(regionId)) {
        await client
          .from('master_employee')
          .update({ managed_region_ids: [...currentRegions, regionId] })
          .eq('id', mid);
      }
    }

    this.logger.log(`Updated region ${regionId} managers: ${managerIds.length} assigned`);
    return { message: '已更新管理员分配' };
  }

  async getAllStores() {
    if (this.supabase.isMockMode()) {
      return { data: [], message: 'OK' };
    }

    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('master_restaurant')
      .select('id, restaurant_name, city, brand_id, region_id')
      .eq('is_active', true)
      .order('city')
      .order('restaurant_name');

    if (error) throw error;

    return { data: data || [], message: 'OK' };
  }

  async getUnassignedStores() {
    if (this.supabase.isMockMode()) {
      return { data: [], message: 'OK' };
    }

    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('master_restaurant')
      .select('id, restaurant_name, city, brand_id')
      .eq('is_active', true)
      .is('region_id', null)
      .order('city')
      .order('restaurant_name');

    if (error) throw error;

    return { data: data || [], message: 'OK' };
  }

  async listManagers() {
    if (this.supabase.isMockMode()) {
      return { data: [], message: 'OK' };
    }

    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('master_employee')
      .select('id, employee_name, username, managed_region_ids, managed_restaurant_ids')
      .eq('role_code', 'administrator')
      .eq('is_active', true)
      .order('employee_name');

    if (error) throw error;

    return { data: data || [], message: 'OK' };
  }
}
