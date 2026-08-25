use serde::{Deserialize, Serialize};

/// Тип кабинета — Hard: предметы с required_room_type допускаются только в пул этого типа.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RoomType {
    General,
    ChemistryLab,
    PhysicsLab,
    BiologyLab,
    Informatics,
    LanguageLab,
    Gym,
    Workshop,
}

impl RoomType {
    pub fn as_str(&self) -> &'static str {
        match self {
            RoomType::General => "General",
            RoomType::ChemistryLab => "ChemistryLab",
            RoomType::PhysicsLab => "PhysicsLab",
            RoomType::BiologyLab => "BiologyLab",
            RoomType::Informatics => "Informatics",
            RoomType::LanguageLab => "LanguageLab",
            RoomType::Gym => "Gym",
            RoomType::Workshop => "Workshop",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "General" => Some(RoomType::General),
            "ChemistryLab" => Some(RoomType::ChemistryLab),
            "PhysicsLab" => Some(RoomType::PhysicsLab),
            "BiologyLab" => Some(RoomType::BiologyLab),
            "Informatics" => Some(RoomType::Informatics),
            "LanguageLab" => Some(RoomType::LanguageLab),
            "Gym" => Some(RoomType::Gym),
            "Workshop" => Some(RoomType::Workshop),
            _ => None,
        }
    }
}

/// Смена класса — Hard: ограничивает доступные слоты.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Shift {
    First,
    Second,
}

impl Shift {
    pub fn as_str(&self) -> &'static str {
        match self {
            Shift::First => "First",
            Shift::Second => "Second",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "First" => Some(Shift::First),
            "Second" => Some(Shift::Second),
            _ => None,
        }
    }
}

/// Матрица доступности учителя: [day 0..5][period 0..7] → bool.
/// false = Hard запрет (солвер обязан x=0).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AvailabilityMatrix(pub [[bool; 8]; 6]);

impl Default for AvailabilityMatrix {
    fn default() -> Self {
        Self([[true; 8]; 6])
    }
}

impl AvailabilityMatrix {
    pub fn all_available() -> Self {
        Self::default()
    }

    pub fn from_json(s: &str) -> Result<Self, String> {
        let v: Vec<Vec<bool>> = serde_json::from_str(s).map_err(|e| e.to_string())?;
        if v.len() != 6 {
            return Err(format!("availability: expected 6 days, got {}", v.len()));
        }
        let mut m = [[false; 8]; 6];
        for (d, row) in v.iter().enumerate() {
            if row.len() != 8 {
                return Err(format!("availability day {}: expected 8 periods, got {}", d, row.len()));
            }
            for (p, &val) in row.iter().enumerate() {
                m[d][p] = val;
            }
        }
        Ok(Self(m))
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(&self.0).unwrap_or_else(|_| "[[true,true,true,true,true,true,true,true]]".to_string())
    }

    pub fn has_any_available(&self) -> bool {
        self.0.iter().any(|row| row.iter().any(|&v| v))
    }
}

/// Веса Soft-ограничений (0 = отключено, 1..1000 интенсивность).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Weights {
    pub window: u32,
    pub room_displacement: u32,
    pub sanpin_parabola: u32,
    pub alternation: u32,
    pub movement: u32,
    pub load_balance: u32,
}

impl Default for Weights {
    fn default() -> Self {
        Self {
            window: 200,
            room_displacement: 50,
            sanpin_parabola: 100,
            alternation: 80,
            movement: 20,
            load_balance: 30,
        }
    }
}

/// DTO учителя для API/БД.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleTeacher {
    pub id: String,
    pub full_name: String,
    pub base_room_id: Option<String>,
    pub max_daily_lessons: i64,
    pub availability_json: String,
}

/// DTO кабинета.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleRoom {
    pub id: String,
    pub name: String,
    pub room_type: String,
    pub capacity: i64,
    pub base_teacher_id: Option<String>,
    pub floor: Option<i64>,
}

/// DTO класса.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleClass {
    pub id: String,
    pub grade: i64,
    pub letter: String,
    pub headcount: i64,
    pub shift: String,
    pub class_type: String,
}

/// DTO предмета.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleSubject {
    pub id: String,
    pub name: String,
    pub sanitary_weight: i64,
    pub required_room_type: Option<String>,
    pub requires_split: bool,
    pub is_double_allowed: bool,
    pub related_subjects_json: String,
}

/// DTO правила деления.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleSubgroupRule {
    pub id: String,
    pub class_id: String,
    pub subject_id: String,
    pub group_count: i64,
}

/// DTO матрицы нагрузки.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCurriculum {
    pub id: String,
    pub class_id: String,
    pub subject_id: String,
    pub teacher_id: String,
    pub split_teacher2_id: Option<String>,
    pub hours_per_week: i64,
}

/// DTO весов (singleton id='default').
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleWeights {
    pub id: String,
    pub window: i64,
    pub room_displacement: i64,
    pub sanpin_parabola: i64,
    pub alternation: i64,
    pub movement: i64,
    pub load_balance: i64,
}

/// DTO слота расписания.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleSlot {
    pub id: String,
    pub class_id: String,
    pub subject_id: String,
    pub teacher_id: String,
    pub room_id: String,
    pub subgroup_label: Option<String>,
    pub day: i64,
    pub period: i64,
    pub is_double: bool,
    #[serde(default)]
    pub week: Option<i64>,
    #[serde(default)]
    pub source_subject: Option<String>,
    #[serde(default)]
    pub source_teacher: Option<String>,
    #[serde(default)]
    pub source_time: Option<String>,
    #[serde(default)]
    pub source_note: Option<String>,
}

/// Агрегат состояния вкладки «Расписание».
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleState {
    pub teachers: Vec<ScheduleTeacher>,
    pub rooms: Vec<ScheduleRoom>,
    pub classes: Vec<ScheduleClass>,
    pub subgroup_rules: Vec<ScheduleSubgroupRule>,
    pub subjects: Vec<ScheduleSubject>,
    pub curriculum: Vec<ScheduleCurriculum>,
    pub weights: ScheduleWeights,
    pub slots: Vec<ScheduleSlot>,
}
