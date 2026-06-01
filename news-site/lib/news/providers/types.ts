// Shared query shape passed to every provider's fetch function.
export type ProviderQuery = {
  category: string; // normalized category id (general/world/business/…)
  query: string; // free-text search ("" = top headlines by category)
  lang: string; // 2-letter
  country: string; // 2-letter
  page: number;
};
