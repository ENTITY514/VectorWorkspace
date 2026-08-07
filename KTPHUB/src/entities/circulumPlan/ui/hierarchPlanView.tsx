import React from "react";
import { Box, Typography, Paper } from "@mui/material";
import SubdirectoryArrowRightIcon from "@mui/icons-material/SubdirectoryArrowRight";
import { AcademicPlan } from "../model/types";

interface HierarchicalPlanViewProps {
  data: AcademicPlan;
}

const styles = {
  quarter: { p: 1, backgroundColor: "#1976d2", color: "white" },
  repetition: { p: 1, pl: 2, backgroundColor: "#fffde7", fontStyle: "italic" },
  section: {
    p: 1,
    pl: 2,
    backgroundColor: "#e3f2fd",
    borderTop: "2px solid #ccc",
  },
  topic: { p: 1, pl: 4, display: "flex", alignItems: "center", gap: 1 },
  objective: { p: 1, pl: 6, borderTop: "1px solid #eee", display: "flex" },
  idColumn: { width: "100px", flexShrink: 0, color: "#666" },
};

const HierarchicalPlanView: React.FC<HierarchicalPlanViewProps> = ({
  data,
}) => {
  if (!data || data.length === 0) {
    return <Typography>Нет данных для отображения.</Typography>;
  }

  return (
    <Paper elevation={3} sx={{ mt: 4 }}>
      {data.map((quarter, qIndex) => (
        <Box key={qIndex} sx={{ mb: 4 }}>
          <Box sx={styles.quarter}>
            <Typography variant="h5" component="h2">
              {quarter.name}
            </Typography>
          </Box>

          {/* ✅ ИЗМЕНЕНИЕ: Добавлена проверка || [] для защиты от сбоя */}
          {(quarter.repetitionInfo || []).map((info, rIndex) => (
            <Box key={rIndex} sx={styles.repetition}>
              <Typography>{info}</Typography>
            </Box>
          ))}

          {/* ✅ ИЗМЕНЕНИЕ: Добавлена проверка || [] для защиты от сбоя */}
          {(quarter.sections || []).map((section, sIndex) => (
            <Box key={sIndex}>
              <Box sx={styles.section}>
                <Typography variant="h6">{section.name}</Typography>
              </Box>
              {(section.topics || []).map((topic, tIndex) => (
                <Box key={tIndex}>
                  <Box sx={styles.topic}>
                    <SubdirectoryArrowRightIcon
                      fontSize="small"
                      color="disabled"
                    />
                    <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                      {topic.name}
                    </Typography>
                  </Box>
                  {(topic.objectives || []).map((objective) => (
                    <Box key={objective.id} sx={styles.objective}>
                      <Typography sx={styles.idColumn}>
                        {objective.id}
                      </Typography>
                      <Typography variant="body2">
                        {objective.description}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      ))}
    </Paper>
  );
};

export default HierarchicalPlanView;
