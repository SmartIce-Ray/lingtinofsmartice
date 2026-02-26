// Region Controller - CRUD + store/manager assignment endpoints
// v1.1 - Added super admin guard on write operations

import { Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException, ForbiddenException } from '@nestjs/common';
import { RegionService } from './region.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('regions')
export class RegionController {
  constructor(private readonly service: RegionService) {}

  private requireSuperAdmin(user: JwtPayload): void {
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('需要超级管理员权限');
    }
  }

  private requireAdmin(user: JwtPayload): void {
    if (user?.roleCode !== 'administrator') {
      throw new ForbiddenException('需要管理员权限');
    }
  }

  // GET /api/regions — list all regions with store/manager counts
  @Get()
  async listRegions(@CurrentUser() user: JwtPayload) {
    this.requireAdmin(user);
    return this.service.listRegions();
  }

  // GET /api/regions/stores-unassigned — list stores not assigned to any region
  @Get('stores-unassigned')
  async getUnassignedStores(@CurrentUser() user: JwtPayload) {
    this.requireAdmin(user);
    return this.service.getUnassignedStores();
  }

  // GET /api/regions/all-stores — list all active stores with region_id
  @Get('all-stores')
  async getAllStores(@CurrentUser() user: JwtPayload) {
    this.requireAdmin(user);
    return this.service.getAllStores();
  }

  // GET /api/regions/managers — list all administrators
  @Get('managers')
  async listManagers(@CurrentUser() user: JwtPayload) {
    this.requireAdmin(user);
    return this.service.listManagers();
  }

  // POST /api/regions — create a new region (super admin only)
  @Post()
  async createRegion(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; code?: string },
  ) {
    this.requireSuperAdmin(user);
    if (!body.name?.trim()) throw new BadRequestException('区域名称不能为空');
    return this.service.createRegion(body.name.trim(), body.code?.trim());
  }

  // PATCH /api/regions/:id — update region name (super admin only)
  @Patch(':id')
  async updateRegion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    this.requireSuperAdmin(user);
    if (!body.name?.trim()) throw new BadRequestException('区域名称不能为空');
    return this.service.updateRegion(id, body.name.trim());
  }

  // DELETE /api/regions/:id — delete a region (super admin only)
  @Delete(':id')
  async deleteRegion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    this.requireSuperAdmin(user);
    return this.service.deleteRegion(id);
  }

  // PATCH /api/regions/:id/stores — update store assignments (super admin only)
  @Patch(':id/stores')
  async updateRegionStores(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { store_ids: string[] },
  ) {
    this.requireSuperAdmin(user);
    if (!Array.isArray(body.store_ids)) throw new BadRequestException('store_ids must be an array');
    return this.service.updateRegionStores(id, body.store_ids);
  }

  // PATCH /api/regions/:id/managers — update manager assignments (super admin only)
  @Patch(':id/managers')
  async updateRegionManagers(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { manager_ids: string[] },
  ) {
    this.requireSuperAdmin(user);
    if (!Array.isArray(body.manager_ids)) throw new BadRequestException('manager_ids must be an array');
    return this.service.updateRegionManagers(id, body.manager_ids);
  }
}
