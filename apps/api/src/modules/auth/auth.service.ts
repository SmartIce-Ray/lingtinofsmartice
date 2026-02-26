// Auth Service - Handle user authentication and JWT tokens
// v1.3 - Added region-based managed restaurant resolution

import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../common/supabase/supabase.service';
import * as bcrypt from 'bcrypt';

export interface JwtPayload {
  sub: string;          // user id
  username: string;
  employeeName: string;
  restaurantId: string;
  restaurantName: string;
  roleCode: string;
  managedRestaurantIds?: string[] | null;  // regional manager scope
  managedRegionIds?: string[] | null;      // region-based scope
  isSuperAdmin?: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  employeeName: string;
  restaurantId: string;
  restaurantName: string;
  roleCode: string;
  managedRestaurantIds: string[] | null;  // null = HQ admin (see all)
  managedRegionIds: string[] | null;      // region-based scope
  isSuperAdmin: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<AuthUser | null> {
    this.logger.log(`Validating user: ${username}`);

    if (this.supabase.isMockMode()) {
      // Mock mode: accept any user with password "test123"
      if (password === 'test123') {
        return {
          id: 'mock-user-id',
          username,
          employeeName: 'Mock User',
          restaurantId: 'demo-restaurant-id',
          restaurantName: '测试店铺',
          roleCode: 'manager',
          managedRestaurantIds: null,
          managedRegionIds: null,
          isSuperAdmin: false,
        };
      }
      return null;
    }

    const client = this.supabase.getClient();

    // Find user by username with restaurant info
    const { data: user, error } = await client
      .from('master_employee')
      .select(`
        id, username, password_hash, employee_name, restaurant_id, role_code, is_active,
        managed_restaurant_ids, managed_brand_id, managed_region_ids, is_super_admin,
        master_restaurant:restaurant_id (restaurant_name)
      `)
      .eq('username', username)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      this.logger.warn(`User not found: ${username}, error: ${error?.message || 'no data'}`);
      return null;
    }

    // Verify password
    if (!user.password_hash) {
      this.logger.warn(`User ${username} has no password set`);
      return null;
    }

    // Support both bcrypt hash and plain text passwords
    // Bcrypt hashes start with $2a$, $2b$, or $2y$
    const isBcryptHash = user.password_hash.startsWith('$2');
    let isValid: boolean;

    if (isBcryptHash) {
      isValid = await bcrypt.compare(password, user.password_hash);
    } else {
      // Plain text comparison for legacy passwords
      isValid = password === user.password_hash;
    }

    if (!isValid) {
      this.logger.warn(`Invalid password for user: ${username}`);
      return null;
    }

    // Extract restaurant name from joined data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restaurantData = user.master_restaurant as any;
    const restaurantName = restaurantData?.restaurant_name || '未知店铺';

    // Resolve managed restaurant scope for administrator role
    const managedRestaurantIds = await this.resolveManagedRestaurants(
      client, user.managed_restaurant_ids, user.managed_region_ids, user.managed_brand_id,
    );

    this.logger.log(`User validated: ${username} (restaurant: ${user.restaurant_id}, managed: ${managedRestaurantIds ? managedRestaurantIds.length + ' stores' : 'all'})`);

    return {
      id: user.id,
      username: user.username,
      employeeName: user.employee_name,
      restaurantId: user.restaurant_id,
      restaurantName,
      roleCode: user.role_code,
      managedRestaurantIds,
      managedRegionIds: user.managed_region_ids || null,
      isSuperAdmin: user.is_super_admin === true,
    };
  }

  async login(user: AuthUser) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      employeeName: user.employeeName,
      restaurantId: user.restaurantId,
      restaurantName: user.restaurantName,
      roleCode: user.roleCode,
      managedRestaurantIds: user.managedRestaurantIds,
      managedRegionIds: user.managedRegionIds,
      isSuperAdmin: user.isSuperAdmin,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        employeeName: user.employeeName,
        restaurantId: user.restaurantId,
        restaurantName: user.restaurantName,
        roleCode: user.roleCode,
        managedRestaurantIds: user.managedRestaurantIds,
        managedRegionIds: user.managedRegionIds,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
  }

  // Resolve managed restaurants: IDs array > region_ids > brand_id lookup > null (HQ, see all)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resolveManagedRestaurants(client: any, managedIds: string[] | null, regionIds: string[] | null, brandId: number | null): Promise<string[] | null> {
    // Priority 1: explicit managed_restaurant_ids
    if (managedIds && managedIds.length > 0) {
      return managedIds;
    }

    // Priority 2: managed_region_ids → look up restaurants in those regions
    if (regionIds && regionIds.length > 0) {
      const { data: restaurants } = await client
        .from('master_restaurant')
        .select('id')
        .in('region_id', regionIds)
        .eq('is_active', true);
      if (restaurants && restaurants.length > 0) {
        return restaurants.map((r: { id: string }) => r.id);
      }
    }

    // Priority 3: managed_brand_id → look up restaurants under that brand
    if (brandId) {
      const { data: restaurants } = await client
        .from('master_restaurant')
        .select('id')
        .eq('brand_id', brandId)
        .eq('is_active', true);
      if (restaurants && restaurants.length > 0) {
        return restaurants.map((r: { id: string }) => r.id);
      }
    }

    // Priority 4: null → HQ admin, sees everything
    return null;
  }

  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }
}
