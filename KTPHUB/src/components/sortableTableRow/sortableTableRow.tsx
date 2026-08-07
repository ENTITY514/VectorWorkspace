import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow, TableCell, SxProps, Theme, styled } from "@mui/material";
import DragHandleIcon from "@mui/icons-material/DragHandle";

// Создаем компонент-ручку для перетаскивания
const DragHandle = styled("div")({
  cursor: "grab",
  padding: "8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
});

interface SortableTableRowProps {
  children: React.ReactNode;
  id: string;
  sx?: SxProps<Theme>;
}

export const SortableTableRow: React.FC<SortableTableRowProps> = ({
  children,
  id,
  sx,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1 : 0,
    position: "relative",
    display: "table-row",
    width: "100%",
  };

  const handleDragClick = (event: React.MouseEvent) => {
    // Останавливаем распространение события, чтобы не запускать dnd-kit при клике
    event.stopPropagation();
  };

  return (
    <TableRow ref={setNodeRef} style={style} sx={sx} {...attributes}>
      <TableCell
        sx={{ cursor: "grab" }}
        {...listeners}
        onClick={handleDragClick}
      >
        <DragHandle>
          <DragHandleIcon fontSize="small" />
        </DragHandle>
      </TableCell>
      {children}
    </TableRow>
  );
};
