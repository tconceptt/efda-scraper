"use server";

import type { AnalyticsFilters } from "@/lib/queries";
import {
  getMonthlyByType,
  getTopAgents,
  getTopManufacturers,
  getAvgOrderValueTrend,
  getTopProductPriceSpreads,
  getProductVolumeGrowth,
  getProductVolumeDecline,
  getDosageFormMarketShare,
  searchProductsByName,
  getProductPriceTrendBySlug,
  getProductMonthlyVolumeBySlug,
} from "@/lib/queries";

export async function fetchMonthlyByType(filters?: AnalyticsFilters) {
  return getMonthlyByType(filters);
}

export async function fetchTopAgents(filters?: AnalyticsFilters) {
  return getTopAgents(20, filters);
}

export async function fetchTopManufacturers(filters?: AnalyticsFilters) {
  return getTopManufacturers(10, filters);
}

export async function fetchAvgOrderValue(filters?: AnalyticsFilters) {
  return getAvgOrderValueTrend(filters);
}

export async function fetchPriceSpreads(filters?: AnalyticsFilters) {
  return getTopProductPriceSpreads(15, filters);
}

export async function fetchProductGrowth(filters?: AnalyticsFilters) {
  return getProductVolumeGrowth(15, filters);
}

export async function fetchProductDecline(filters?: AnalyticsFilters) {
  return getProductVolumeDecline(15, filters);
}

export async function fetchMarketByCategory(filters?: AnalyticsFilters) {
  return getDosageFormMarketShare(filters);
}

export async function searchProducts(query: string) {
  return searchProductsByName(query);
}

export async function fetchProductPriceTrend(slug: string, filters?: AnalyticsFilters) {
  return getProductPriceTrendBySlug(slug, filters);
}

export async function fetchProductMonthlyVolume(slug: string, filters?: AnalyticsFilters) {
  return getProductMonthlyVolumeBySlug(slug, filters);
}
