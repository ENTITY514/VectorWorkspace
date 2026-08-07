import { useCallback, useEffect, useState } from "react";
import {
  getKtpRepository,
  KtpListFilters,
  KtpMeta,
} from "../../../shared/infrastructure/repositories";

export function useKtpCatalog(initialFilters: KtpListFilters = { onlyPublished: true }) {
  const [filters, setFilters] = useState<KtpListFilters>(initialFilters);
  const [items, setItems] = useState<KtpMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (next = filters, forceNetwork = false) => {
      setLoading(true);
      setError(null);
      try {
        const repo = getKtpRepository();
        if (forceNetwork) await repo.invalidateLocalCache();
        const list = await repo.listMeta({ ...next, onlyPublished: true });
        setItems(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить каталог КТП");
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  return {
    items,
    filters,
    setFilters,
    loading,
    error,
    reload: () => load(filters, true),
  };
}
