import React from "react";
import { PublishKtpButton } from "../../PublishKtp";
import { SavedKtp } from "../../../entities/ktp/model/slice";
import { KtpPlan } from "../../../entities/ktp/model/types";

interface EditorPublishActionProps {
  ktpId?: string;
  name: string;
  className: string;
  plan: KtpPlan;
  totalHours: number;
  quarterWorkHours: SavedKtp["quarterWorkHours"];
  sourceTupId?: string | null;
}

export const EditorPublishAction: React.FC<EditorPublishActionProps> = ({
  ktpId,
  name,
  className,
  plan,
  totalHours,
  quarterWorkHours,
  sourceTupId,
}) => {
  if (!ktpId || plan.length === 0) return null;

  const ktp: SavedKtp = {
    id: ktpId,
    name,
    className,
    plan,
    totalHours,
    quarterWorkHours,
  };

  return <PublishKtpButton ktp={ktp} sourceTupId={sourceTupId} />;
};
