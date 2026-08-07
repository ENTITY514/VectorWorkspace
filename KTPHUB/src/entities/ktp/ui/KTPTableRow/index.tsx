import React from "react";
import {
  TableCell,
  IconButton,
  Tooltip,
  styled,
  TableRow,
  Box,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import MergeTypeIcon from '@mui/icons-material/MergeType';
import { SortableTableRow } from "../../../../components/sortableTableRow/sortableTableRow";
import { useAppDispatch, useAppSelector } from "../../../../shared/lib/hooks";
import {
  updateLesson,
  addHour,
  deleteLesson,
  addSor,
  splitAllObjectives,
  setQuarterWorkHours,
} from "../../model/slice";
import {
  IKtpLesson,
  LessonRowType,
  KtpPlan,
  ILessonObjective,
} from "../../model/types";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import CallSplitIcon from "@mui/icons-material/CallSplit";

interface KtpTableRowProps {
  lesson: IKtpLesson;
  prevLesson?: IKtpLesson;
  plan: KtpPlan;
}

const StyledTableCell = styled(TableCell)({
  borderRight: "1px solid #e0e0e0",
});

const StyledInput = styled("input")(({ theme }) => ({
  width: "100%",
  boxSizing: "border-box",
  backgroundColor: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  padding: "4px 8px",
  fontFamily: "inherit",
  fontSize: "inherit",
  color: "inherit",
  "&:hover": {
    borderBottom: `2px solid ${theme.palette.divider}`,
  },
  "&:focus": {
    outline: "none",
    borderBottom: `2px solid ${theme.palette.primary.main}`,
  },
}));

const getBackgroundColor = (rowType: LessonRowType, hasError?: boolean, isMerged?: boolean) => {
  if (isMerged) return "#e1bee7"; // Purple 100 for merged
  if (hasError) return "#ffcdd2"; // Red for error
  switch (rowType) {
    case LessonRowType.QUARTER_HEADER:
      return "#e0f2f1";
    case LessonRowType.SOCH:
    case LessonRowType.REPETITION:
      return "#e1f5fe";
    case LessonRowType.SOR:
      return "#fff9c4";
    default:
      return "#ffffff";
  }
};

const ObjectiveCell: React.FC<{ lesson: IKtpLesson }> = ({ lesson }) => {
  const dispatch = useAppDispatch();
  const [editingObjective, setEditingObjective] = React.useState<{
    objectiveId: string;
    description: string;
  } | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef: draggableRef,
    transform,
  } = useDraggable({
    id: `draggable-objective-${lesson.id}`,
    data: {
      type: "objective",
      lessonId: lesson.id,
    },
  });

  const { setNodeRef: droppableRef } = useDroppable({
    id: `droppable-objective-${lesson.id}`,
    data: {
      type: "objective",
      lessonId: lesson.id,
    },
  });

  const handleInputChange = (
    field: keyof IKtpLesson,
    value: string | number | ILessonObjective[]
  ) => {
    dispatch(updateLesson({ id: lesson.id, field, value }));
  };

  const handleObjectiveBlur = () => {
    if (editingObjective) {
      const newObjectives = lesson.objectives.map((o) =>
        o.id === editingObjective.objectiveId
          ? { ...o, description: editingObjective.description }
          : o
      );
      handleInputChange("objectives", newObjectives);
      setEditingObjective(null);
    }
  };

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <StyledTableCell ref={droppableRef}>
      <div ref={draggableRef} style={style} {...listeners} {...attributes}>
        {lesson.objectives.map((objective) => (
          <div
            key={objective.id}
            onDoubleClick={() =>
              setEditingObjective({
                objectiveId: objective.id,
                description: objective.description,
              })
            }
          >
            {editingObjective &&
            editingObjective.objectiveId === objective.id ? (
              <StyledInput
                type="text"
                value={editingObjective.description}
                onChange={(e) =>
                  setEditingObjective({
                    ...editingObjective,
                    description: e.target.value,
                  })
                }
                onBlur={handleObjectiveBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleObjectiveBlur();
                  }
                }}
                autoFocus
              />
            ) : (
              <>
                <span style={{ fontWeight: "bold" }}>{objective.id} </span>
                {objective.description}
              </>
            )}
          </div>
        ))}
      </div>
    </StyledTableCell>
  );
};

const NonSortableTableRow: React.FC<{
  children: React.ReactNode;
  sx?: any;
}> = ({ children, sx }) => {
  return (
    <TableRow sx={sx}>
      <TableCell sx={{ cursor: "default" }}></TableCell>
      {children}
    </TableRow>
  );
};

export const KtpTableRow: React.FC<KtpTableRowProps> = ({
  lesson,
  prevLesson,
  plan,
}) => {
  const dispatch = useAppDispatch();
  const { quarterWorkHours } = useAppSelector((state) => state.ktpEditor);

  const [isEditingSectionName, setIsEditingSectionName] = React.useState(false);
  const [isEditingLessonTopic, setIsEditingLessonTopic] = React.useState(false);
  const [isEditingDate, setIsEditingDate] = React.useState(false);
  const [isEditingNotes, setIsEditingNotes] = React.useState(false);
  const [isMergeDialogOpen, setMergeDialogOpen] = React.useState(false);
  const [mergeReason, setMergeReason] = React.useState("");

  const [localSectionName, setLocalSectionName] = React.useState(
    lesson.sectionName
  );
  const [localLessonTopic, setLocalLessonTopic] = React.useState(
    lesson.lessonTopic
  );
  const [localDate, setLocalDate] = React.useState(lesson.date);
  const [localNotes, setLocalNotes] = React.useState(lesson.notes);

  React.useEffect(() => {
    setLocalSectionName(lesson.sectionName);
  }, [lesson.sectionName]);

  React.useEffect(() => {
    setLocalLessonTopic(lesson.lessonTopic);
  }, [lesson.lessonTopic]);

  React.useEffect(() => {
    setLocalDate(lesson.date);
  }, [lesson.date]);

  React.useEffect(() => {
    setLocalNotes(lesson.notes);
  }, [lesson.notes]);

  const [isOddSection, setIsOddSection] = React.useState(false);

  React.useEffect(() => {
    const uniqueSections = Array.from(
      new Set(
        plan
          .filter((l) => l.rowType !== LessonRowType.QUARTER_HEADER)
          .map((l) => l.sectionName)
      )
    );
    const sectionIndex = uniqueSections.indexOf(lesson.sectionName);
    setIsOddSection(sectionIndex % 2 !== 0);
  }, [lesson.sectionName, plan]);

  const handleInputChange = (
    field: keyof IKtpLesson,
    value: string | number | ILessonObjective[]
  ) => {
    dispatch(updateLesson({ id: lesson.id, field, value }));
  };

  const handleInputBlur = (field: keyof IKtpLesson) => {
    switch (field) {
      case "sectionName":
        setIsEditingSectionName(false);
        handleInputChange("sectionName", localSectionName);
        break;
      case "lessonTopic":
        setIsEditingLessonTopic(false);
        handleInputChange("lessonTopic", localLessonTopic);
        break;
      case "date":
        setIsEditingDate(false);
        handleInputChange("date", localDate);
        break;
      case "notes":
        setIsEditingNotes(false);
        handleInputChange("notes", localNotes);
        break;
    }
  };

  const handleSplitAllObjectives = () => {
    dispatch(splitAllObjectives({ lessonId: lesson.id }));
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    field: keyof IKtpLesson
  ) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const isNewSection =
    !prevLesson ||
    (prevLesson.sectionName !== lesson.sectionName &&
      lesson.rowType !== LessonRowType.QUARTER_HEADER);
  const isNewTopic =
    !prevLesson || prevLesson.lessonTopic !== lesson.lessonTopic;

  const sectionHoursCount = React.useMemo(() => {
    if (lesson.rowType === LessonRowType.STANDARD) {
      return plan.filter(
        (l) =>
          l.sectionName === lesson.sectionName &&
          l.lessonNumber <= lesson.lessonNumber &&
          l.rowType === LessonRowType.STANDARD
      ).length;
    }
    return lesson.hoursInSection;
  }, [plan, lesson]);

  const handleAddHour = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch(addHour({ lessonId: lesson.id }));
  };

  const handleDeleteLesson = (event: React.MouseEvent) => {
    event.stopPropagation();
    const { id: lessonId, sectionName, objectives, rowType } = lesson;

    const lessonsInSection = plan.filter(
      (l) =>
        l.sectionName === sectionName &&
        (l.rowType === LessonRowType.STANDARD ||
          l.rowType === LessonRowType.SOCH ||
          l.rowType === LessonRowType.SOR)
    );

    if (lessonsInSection.length <= 1) {
      alert("Нельзя удалить последний урок в разделе.");
      return;
    }

    if (
      rowType === LessonRowType.STANDARD &&
      objectives &&
      objectives.length > 0
    ) {
      const otherObjectiveIds = new Set(
        plan
          .filter((l) => l.id !== lessonId && l.sectionName === sectionName)
          .flatMap((l) => l.objectives.map((o) => o.id))
      );

      const hasUniqueObjective = objectives.some(
        (o) => !otherObjectiveIds.has(o.id)
      );

      if (hasUniqueObjective) {
        alert(
          "Нельзя удалить урок, так как он содержит цель обучения, которой нет в других уроках этого раздела."
        );
        return;
      }
    }

    dispatch(deleteLesson({ lessonId }));
  };

  const currentIndex = plan.findIndex((l) => l.id === lesson.id);
  const nextLesson = plan[currentIndex + 1];
  const isSectionEnd =
    (!nextLesson ||
      nextLesson.sectionName !== lesson.sectionName ||
      nextLesson.rowType === LessonRowType.QUARTER_HEADER) &&
    lesson.rowType !== LessonRowType.QUARTER_HEADER &&
    lesson.rowType !== LessonRowType.SOCH &&
    lesson.rowType !== LessonRowType.REPETITION;

  const handleAddSor = () => {
    dispatch(addSor({ lessonId: lesson.id }));
  };

  const handleMergeNext = () => {
    setMergeDialogOpen(true);
  };

  const handleConfirmMerge = () => {
    if (nextLesson && lesson.date) {
      dispatch(updateLesson({ id: nextLesson.id, field: "date", value: lesson.date }));
      dispatch(updateLesson({ id: lesson.id, field: "notes", value: mergeReason }));
      dispatch(updateLesson({ id: nextLesson.id, field: "notes", value: mergeReason }));
      const cachedReasons = JSON.parse(localStorage.getItem("mergeReasons") || "[]");
      if (!cachedReasons.includes(mergeReason)) {
        const newCachedReasons = [mergeReason, ...cachedReasons].slice(0, 5);
        localStorage.setItem("mergeReasons", JSON.stringify(newCachedReasons));
      }
    }
    setMergeDialogOpen(false);
    setMergeReason("");
  };

  const handleQuarterHoursChange = (
    quarter: keyof typeof quarterWorkHours,
    value: string
  ) => {
    if (/^\d*$/.test(value)) {
      const hours = value === "" ? 0 : parseInt(value, 10);
      dispatch(setQuarterWorkHours({ quarter, hours }));
    }
  };

  const isMergedWithPrev = lesson.date && prevLesson?.date ? lesson.date === prevLesson.date : false;
  const isMergedWithNext = lesson.date && nextLesson?.date ? lesson.date === nextLesson.date : false;
  const isMerged = isMergedWithPrev || isMergedWithNext;

  const renderCells = () => {
    if (lesson.rowType === LessonRowType.QUARTER_HEADER) {
      const quarterNumber = lesson.sectionName.match(/\d+/)?.[0];
      const quarterKey = `q${quarterNumber}` as keyof typeof quarterWorkHours;
      const workHours = quarterWorkHours[quarterKey];

      const startIndex = plan.findIndex(l => l.id === lesson.id);
      const endIndex = plan.findIndex((l, index) => index > startIndex && l.rowType === LessonRowType.QUARTER_HEADER);
      const quarterLessons = plan.slice(startIndex + 1, endIndex === -1 ? plan.length : endIndex);
      const actualHours = quarterLessons.reduce((sum, l) => sum + l.hours, 0);

      const hoursMismatch = workHours - actualHours;
      const hasError = hoursMismatch !== 0;

      return (
        <TableCell colSpan={10} sx={{ p: 1, textAlign: "center", fontWeight: "bold", backgroundColor: getBackgroundColor(lesson.rowType, hasError) }}>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {lesson.sectionName}
              <TextField
                label="Часы"
                type="text"
                size="small"
                value={workHours || ""}
                onChange={(e) =>
                  handleQuarterHoursChange(
                    quarterKey,
                    e.target.value
                  )
                }
                onClick={(e) => e.stopPropagation()}
                sx={{ width: "100px", backgroundColor: "white" }}
              />
            </Box>
            {hasError && (
              <Typography variant="caption" color="error">
                {hoursMismatch > 0
                  ? `Запланировано на ${hoursMismatch} час(ов) больше, чем фактических.`
                  : `Фактических часов на ${-hoursMismatch} час(ов) больше, чем запланировано.`}
              </Typography>
            )}
          </Box>
        </TableCell>
      );
    }

    return (
      <>
        <StyledTableCell>{lesson.lessonNumber}</StyledTableCell>
        <StyledTableCell>{sectionHoursCount}</StyledTableCell>
        <StyledTableCell onDoubleClick={() => setIsEditingSectionName(true)}>
          {isEditingSectionName ? (
            <StyledInput
              type="text"
              value={localSectionName}
              onChange={(e) => setLocalSectionName(e.target.value)}
              onBlur={() => handleInputBlur("sectionName")}
              onKeyDown={(e) => handleKeyDown(e, "sectionName")}
              autoFocus
            />
          ) : isNewSection ? (
            localSectionName
          ) : (
            ""
          )}
        </StyledTableCell>
        <StyledTableCell onDoubleClick={() => setIsEditingLessonTopic(true)}>
          {isEditingLessonTopic ? (
            <StyledInput
              type="text"
              value={localLessonTopic}
              onChange={(e) => setLocalLessonTopic(e.target.value)}
              onBlur={() => handleInputBlur("lessonTopic")}
              onKeyDown={(e) => handleKeyDown(e, "lessonTopic")}
              autoFocus
            />
          ) : isNewTopic ? (
            localLessonTopic
          ) : (
            ""
          )}
        </StyledTableCell>
        <StyledTableCell>
          <ObjectiveCell lesson={lesson} />
        </StyledTableCell>
        <StyledTableCell>{lesson.hours}</StyledTableCell>
        <StyledTableCell onDoubleClick={() => setIsEditingDate(true)}>
          {isEditingDate ? (
            <StyledInput
              type="text"
              value={localDate}
              onChange={(e) => setLocalDate(e.target.value)}
              onBlur={() => handleInputBlur("date")}
              onKeyDown={(e) => handleKeyDown(e, "date")}
              autoFocus
            />
          ) : (
            isMergedWithPrev ? "" : localDate
          )}
        </StyledTableCell>
        <StyledTableCell onDoubleClick={() => setIsEditingNotes(true)}>
          {isEditingNotes ? (
            <StyledInput
              type="text"
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onBlur={() => handleInputBlur("notes")}
              onKeyDown={(e) => handleKeyDown(e, "notes")}
              autoFocus
            />
          ) : (
            localNotes
          )}
        </StyledTableCell>
        <StyledTableCell>
          <Tooltip title="Добавить час">
            <IconButton size="small" onClick={handleAddHour}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Удалить час">
            <span>
              <IconButton size="small" onClick={handleDeleteLesson}>
                <RemoveIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {lesson.objectives.length > 1 && (
            <Tooltip title="Разделить цели">
              <IconButton size="small" onClick={handleSplitAllObjectives}>
                <CallSplitIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {nextLesson && lesson.rowType === LessonRowType.STANDARD && nextLesson.rowType === LessonRowType.STANDARD && (
            <Tooltip title="Объединить со следующим уроком">
              <IconButton size="small" onClick={handleMergeNext}>
                <MergeTypeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </StyledTableCell>
      </>
    );
  };
  const rowBackgroundColor =
    lesson.rowType === LessonRowType.STANDARD
      ? isOddSection && !isMerged
        ? "#f5f5f5"
        : getBackgroundColor(lesson.rowType, false, isMerged)
      : getBackgroundColor(lesson.rowType);

  return (
    <>
      {lesson.rowType === LessonRowType.QUARTER_HEADER ? (
        <NonSortableTableRow sx={{ backgroundColor: rowBackgroundColor }}>
          {renderCells()}
        </NonSortableTableRow>
      ) : (
        <SortableTableRow
          id={lesson.id}
          sx={{
            backgroundColor: rowBackgroundColor,
          }}
        >
          {renderCells()}
        </SortableTableRow>
      )}

      {isSectionEnd && (
        <TableRow>
          <TableCell colSpan={10} sx={{ p: 0 }}>
            <Box
              sx={{
                width: "200px",
                height: "30px",
                backgroundColor: "#2196f3",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "0 0 15px 15px",
                margin: "0 auto",
                cursor: "pointer",
                zIndex: 1,
                "&:hover": {
                  backgroundColor: "#1565c0",
                },
              }}
              onClick={handleAddSor}
            >
              Добавить СОР
            </Box>
          </TableCell>
        </TableRow>
      )}
      <Dialog open={isMergeDialogOpen} onClose={() => setMergeDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Укажите причину объединения уроков</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Причина"
            type="text"
            fullWidth
            variant="standard"
            value={mergeReason}
            onChange={(e) => setMergeReason(e.target.value)}
          />
          <Typography variant="caption">Недавние причины:</Typography>
          <List dense>
            {JSON.parse(localStorage.getItem("mergeReasons") || "[]").map((reason: string) => (
              <ListItemButton key={reason} onClick={() => setMergeReason(reason)}>
                <ListItemText primary={reason} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeDialogOpen(false)}>Отмена</Button>
          <Button onClick={handleConfirmMerge}>Объединить</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};