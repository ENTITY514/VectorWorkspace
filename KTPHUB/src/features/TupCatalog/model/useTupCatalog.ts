import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTupCatalogRepository,
  TupListFilters,
  TupMeta,
} from "../../../shared/infrastructure/repositories";

export function useTupCatalog(initialFilters: TupListFilters = {}) {
  const [filters, setFilters] = useState<TupListFilters>(initialFilters);
  const [items, setItems] = useState<TupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextFilters = filters, forceNetwork = false) => {
    setLoading(true);
    setError(null);
    try {
      const repo = getTupCatalogRepository();
      if (forceNetwork) await repo.invalidateLocalCache();
      const list = await repo.listMeta(nextFilters);
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить каталог ТУП");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const filterOptions = useMemo(() => {
    const subjects = Array.from(new Set(items.map((i) => i.subject).filter(Boolean)));
    const grades = Array.from(new Set(items.map((i) => i.grade).filter(Boolean)));
    const years = Array.from(new Set(items.map((i) => i.academicYear).filter(Boolean)));
    return { subjects, grades, years };
  }, [items]);

  return {
    items,
    filters,
    setFilters,
    loading,
    error,
    filterOptions,
    reload: () => load(filters, true),
  };
}
