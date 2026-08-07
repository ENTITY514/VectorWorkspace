import { useCallback, useState } from "react";
import { SavedKtp } from "../../../entities/ktp/model/slice";
import { getKtpRepository } from "../../../shared/infrastructure/repositories";

export function usePublishKtp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const publish = useCallback(async (ktp: SavedKtp, meta?: {
    subject?: string;
    language?: string;
    sourceTupId?: string | null;
  }) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await getKtpRepository().upsert({
        title: ktp.name,
        className: ktp.className,
        grade: ktp.className,
        subject: meta?.subject ?? "",
        language: meta?.language ?? "ru",
        sourceTupId: meta?.sourceTupId ?? null,
        plan: ktp.plan,
        totalHours: ktp.totalHours,
        quarterWorkHours: ktp.quarterWorkHours,
        status: "published",
      });
      setSuccess(`КТП опубликовано: ${saved.title}`);
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка публикации";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { publish, loading, error, success };
}
