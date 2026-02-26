// useManagedScope - Derive data scope for admin pages based on managedRestaurantIds
// If managedRestaurantIds is set, queries are scoped to those stores only.
// If null (HQ admin), all stores are visible.

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function useManagedScope() {
  const { user } = useAuth();
  const managedIds = user?.managedRestaurantIds ?? null;

  return useMemo(() => {
    const isScoped = managedIds !== null && managedIds.length > 0;
    // Query param to append to API calls: &managed_ids=uuid1,uuid2,...
    const managedIdsParam = isScoped
      ? `&managed_ids=${managedIds.join(',')}`
      : '';

    return {
      managedIds,        // null = see all, [...] = scoped
      isScoped,          // true if regional manager
      managedIdsParam,   // query string fragment for API calls
      storeCount: isScoped ? managedIds.length : null,
    };
  }, [managedIds]);
}
