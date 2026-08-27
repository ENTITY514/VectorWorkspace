-- Add change_slot weight for minimal perturbation (warm-start)
ALTER TABLE schedule_weights ADD COLUMN change_slot INTEGER NOT NULL DEFAULT 0 CHECK (change_slot BETWEEN 0 AND 1000);
