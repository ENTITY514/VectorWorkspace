import { useCallback, useState } from "react";
import { parseAcademicPlan } from "../../../shared/api/circulumPlanParser";
import { AcademicPlan } from "../../../entities/circulumPlan/model/types";
import {
  getTupCatalogRepository,
  ProgramKind,
  TupStatus,
} from "../../../shared/infrastructure/repositories";

export interface AdminTupFormState {
  title: string;
  subject: string;
  grade: string;
  language: string;
  programKind: ProgramKind;
  academicYear: string;
  status: TupStatus;
}

const initialForm: AdminTupFormState = {
  title: "",
  subject: "",
  grade: "",
  language: "ru",
  programKind: "tup",
  academicYear: "",
  status: "published",
};

export function useAdminTupUpload() {
  const [form, setForm] = useState<AdminTupFormState>(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<AcademicPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateField = useCallback(
    <K extends keyof AdminTupFormState>(key: K, value: AdminTupFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const onFileSelected = useCallback(async (nextFile: File | null) => {
    setFile(nextFile);
    setPlan(null);
    setError(null);
    setSuccess(null);
    if (!nextFile) return;

    try {
      const parsed = await parseAcademicPlan(nextFile);
      setPlan(parsed);
      setForm((prev) => ({
        ...prev,
        title: prev.title || nextFile.name.replace(/\.[^.]+$/, ""),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка парсинга файла");
    }
  }, []);

  const submit = useCallback(async () => {
    if (!plan || !file) {
      setError("Сначала загрузите и успешно распарсите файл ТУП");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const repo = getTupCatalogRepository();
      const saved = await repo.adminUpsert({
        ...form,
        planData: plan,
        file,
      });
      setSuccess(`ТУП сохранён: ${saved.title}`);
      setFile(null);
      setPlan(null);
      setForm(initialForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения ТУП");
    } finally {
      setLoading(false);
    }
  }, [file, form, plan]);

  return {
    form,
    file,
    plan,
    error,
    success,
    loading,
    updateField,
    onFileSelected,
    submit,
  };
}
