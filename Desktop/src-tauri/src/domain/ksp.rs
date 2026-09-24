//! КСП по форме приказа МОН РК № 130.
//! Тема и цели — из урока КТП. Эталон длительности задаётся профилем; сумма этапов
//! должна сойтись с ним точно (ADR XII). Валидатор один — для UI, экспорта и MCP.

use serde::{Deserialize, Serialize};

use crate::domain::ids::KspId;
use crate::domain::invariants::LessonKind;

pub const DEFAULT_LESSON_MINUTES: i64 = 45;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KspStatus {
    Draft,
    Ready,
    Approved,
    Conducted,
    Archived,
}

impl KspStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            KspStatus::Draft => "draft",
            KspStatus::Ready => "ready",
            KspStatus::Approved => "approved",
            KspStatus::Conducted => "conducted",
            KspStatus::Archived => "archived",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "ready" => KspStatus::Ready,
            "approved" => KspStatus::Approved,
            "conducted" => KspStatus::Conducted,
            "archived" => KspStatus::Archived,
            _ => KspStatus::Draft,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StageType {
    Greeting,
    Warmup,
    Actualization,
    Theory,
    Practice,
    FormativeAssessment,
    Sor,
    Soch,
    Homework,
    Reflection,
    PhysicalMinute,
}

impl StageType {
    pub fn as_str(self) -> &'static str {
        match self {
            StageType::Greeting => "greeting",
            StageType::Warmup => "warmup",
            StageType::Actualization => "actualization",
            StageType::Theory => "theory",
            StageType::Practice => "practice",
            StageType::FormativeAssessment => "formative_assessment",
            StageType::Sor => "sor",
            StageType::Soch => "soch",
            StageType::Homework => "homework",
            StageType::Reflection => "reflection",
            StageType::PhysicalMinute => "physical_minute",
        }
    }

    pub fn title_ru(self) -> &'static str {
        match self {
            StageType::Greeting => "Приветствие, орг. момент",
            StageType::Warmup => "Целеполагание",
            StageType::Actualization => "Актуализация знаний",
            StageType::Theory => "Теоретический материал",
            StageType::Practice => "Практический материал",
            StageType::FormativeAssessment => "Формативное оценивание",
            StageType::Sor => "СОР",
            StageType::Soch => "СОЧ",
            StageType::Homework => "Домашнее задание",
            StageType::Reflection => "Рефлексия / завершение",
            StageType::PhysicalMinute => "Физкультминутка",
        }
    }

    pub fn default_assessment_mode(self) -> AssessmentMode {
        match self {
            StageType::Sor | StageType::Soch => AssessmentMode::Summative,
            StageType::Greeting | StageType::Homework | StageType::Reflection | StageType::PhysicalMinute | StageType::Warmup => {
                AssessmentMode::None
            }
            _ => AssessmentMode::Formative,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssessmentMode {
    None,
    Formative,
    Summative,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningObjectiveRef {
    pub code: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonGoals {
    pub all: String,
    pub most: String,
    pub some: String,
}

impl Default for LessonGoals {
    fn default() -> Self {
        Self { all: String::new(), most: String::new(), some: String::new() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValuesComponent {
    pub value_ids: Vec<String>,
    pub text: String,
}

impl Default for ValuesComponent {
    fn default() -> Self {
        Self { value_ids: Vec::new(), text: String::new() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KspHeader {
    pub section: String,
    pub topic: String,
    pub learning_objectives: Vec<LearningObjectiveRef>,
    pub planned_date: Option<String>,
    pub class_name: String,
    pub teacher_name: String,
    pub lesson_goals: LessonGoals,
    pub values_component: ValuesComponent,
    pub success_criteria: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRef {
    pub kind: String,
    pub display: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Descriptor {
    pub text: String,
    pub points: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageAssessment {
    pub mode: AssessmentMode,
    pub descriptors: Vec<Descriptor>,
    pub max_points: Option<i64>,
    pub feedback_method: String,
}

impl StageAssessment {
    pub fn for_type(t: StageType) -> Self {
        Self {
            mode: t.default_assessment_mode(),
            descriptors: Vec::new(),
            max_points: None,
            feedback_method: "teacher".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KspStage {
    pub id: String,
    #[serde(rename = "type")]
    pub stage_type: StageType,
    pub order: i64,
    pub duration_minutes: i64,
    pub teacher_actions: String,
    pub student_actions: String,
    pub resources: Vec<ResourceRef>,
    pub assessment: StageAssessment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeworkBlock {
    pub text: String,
    pub check_method: String,
    pub is_differentiated: bool,
}

impl Default for HomeworkBlock {
    fn default() -> Self {
        Self {
            text: String::new(),
            check_method: "фронтальная проверка на следующем уроке".into(),
            is_differentiated: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KspContent {
    pub schema_version: i64,
    pub lesson_duration: i64,
    pub header: KspHeader,
    pub stages: Vec<KspStage>,
    pub homework: HomeworkBlock,
}

impl KspContent {
    pub fn total_minutes(&self) -> i64 {
        self.stages.iter().map(|s| s.duration_minutes.max(0)).sum()
    }

    pub fn reindex(&mut self) {
        for (i, s) in self.stages.iter_mut().enumerate() {
            s.order = (i + 1) as i64;
        }
    }

    pub fn is_soch_dominant(&self) -> bool {
        let soch: i64 = self
            .stages
            .iter()
            .filter(|s| s.stage_type == StageType::Soch)
            .map(|s| s.duration_minutes.max(0))
            .sum();
        self.lesson_duration > 0 && soch * 2 >= self.lesson_duration
    }

    pub fn homework_is_satisfied(&self) -> bool {
        if self.is_soch_dominant() {
            return true;
        }
        if !self.homework.text.trim().is_empty() {
            return true;
        }
        self.stages.iter().any(|s| {
            s.stage_type == StageType::Homework
                && (!s.teacher_actions.trim().is_empty() || !s.student_actions.trim().is_empty())
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KspDocument {
    pub id: KspId,
    pub ktp_lesson_id: String,
    pub ktp_plan_id: String,
    pub teacher_id: String,
    pub class_name: String,
    pub status: KspStatus,
    pub language: String,
    pub schema_version: i64,
    pub is_approved: bool,
    pub content: KspContent,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueLevel {
    Blocking,
    Warning,
    Hint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub code: String,
    pub level: IssueLevel,
    pub message: String,
    pub stage_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub issues: Vec<ValidationIssue>,
    pub total_minutes: i64,
    pub lesson_duration: i64,
    pub can_mark_ready: bool,
}

pub fn validate_content(content: &KspContent, lesson_cancelled: bool) -> ValidationReport {
    let mut issues = Vec::new();
    if lesson_cancelled {
        issues.push(issue("V-01", IssueLevel::Blocking, "Урок КТП отменён — КСП создавать нельзя.", None));
    }
    if content.header.topic.trim().is_empty() {
        issues.push(issue("V-02", IssueLevel::Blocking, "Тема урока пуста. Возьмите её из КТП.", None));
    }
    let total = content.total_minutes();
    if total != content.lesson_duration {
        issues.push(issue(
            "V-03",
            IssueLevel::Blocking,
            format!(
                "Сумма этапов {total} мин, эталон {} мин. По приказу № 130 и ADR хронометраж обязан сойтись точно.",
                content.lesson_duration
            ),
            None,
        ));
    }
    for s in &content.stages {
        if s.teacher_actions.trim().is_empty() {
            issues.push(issue(
                "V-04",
                IssueLevel::Blocking,
                format!("{}: нет действий педагога.", s.stage_type.title_ru()),
                Some(s.id.clone()),
            ));
        }
        if s.assessment.mode == AssessmentMode::Summative {
            let sum: i64 = s.assessment.descriptors.iter().filter_map(|d| d.points).sum();
            if let Some(max) = s.assessment.max_points {
                if sum != max {
                    issues.push(issue(
                        "V-05",
                        IssueLevel::Blocking,
                        format!("{}: сумма баллов дескрипторов {sum} ≠ {max}.", s.stage_type.title_ru()),
                        Some(s.id.clone()),
                    ));
                }
            } else {
                issues.push(issue(
                    "V-05",
                    IssueLevel::Warning,
                    format!("{}: суммативное оценивание без max_points.", s.stage_type.title_ru()),
                    Some(s.id.clone()),
                ));
            }
        }
        if s.assessment.mode == AssessmentMode::Formative
            && s.assessment.descriptors.iter().any(|d| d.points.is_some())
        {
            issues.push(issue(
                "V-11",
                IssueLevel::Warning,
                format!("{}: у формативных дескрипторов не должно быть баллов.", s.stage_type.title_ru()),
                Some(s.id.clone()),
            ));
        }
    }
    if content.header.values_component.text.trim().is_empty()
        && content.header.values_component.value_ids.is_empty()
    {
        issues.push(issue("V-09", IssueLevel::Warning, "Не заполнен воспитательный компонент (FR-3.2).", None));
    }
    if content.header.learning_objectives.is_empty() {
        issues.push(issue("V-02", IssueLevel::Warning, "Нет целей обучения из КТП.", None));
    }
    let covered = content
        .stages
        .iter()
        .any(|s| !s.assessment.descriptors.is_empty());
    if !content.header.learning_objectives.is_empty() && !covered {
        issues.push(issue(
            "V-10",
            IssueLevel::Warning,
            "Ни одна цель не покрыта дескриптором.",
            None,
        ));
    }
    if !content.is_soch_dominant() {
        if !content.homework_is_satisfied() {
            issues.push(issue("V-13", IssueLevel::Warning, "Не указано домашнее задание.", None));
        } else if !content.homework.text.trim().is_empty() && content.homework.check_method.trim().is_empty() {
            issues.push(issue("V-13", IssueLevel::Warning, "У ДЗ нет способа проверки.", None));
        }
    }
    if let Some(first) = content.stages.first() {
        if first.stage_type != StageType::Greeting {
            issues.push(issue("V-14", IssueLevel::Hint, "Первым этапом обычно идёт приветствие.", Some(first.id.clone())));
        }
    }
    let practice: i64 = content
        .stages
        .iter()
        .filter(|s| s.stage_type == StageType::Practice || s.stage_type == StageType::FormativeAssessment)
        .map(|s| s.duration_minutes)
        .sum();
    if content.lesson_duration > 0 && practice * 100 / content.lesson_duration < 30 {
        issues.push(issue("V-15", IssueLevel::Hint, "Доля практики меньше 30 % времени урока.", None));
    }
    if !content.stages.iter().any(|s| !s.resources.is_empty()) {
        issues.push(issue("V-18", IssueLevel::Hint, "Не указаны ресурсы ни на одном этапе.", None));
    }

    let can_mark_ready = issues.iter().all(|i| i.level == IssueLevel::Hint);
    ValidationReport { issues, total_minutes: total, lesson_duration: content.lesson_duration, can_mark_ready }
}

fn issue(code: &str, level: IssueLevel, message: impl Into<String>, stage_id: Option<String>) -> ValidationIssue {
    ValidationIssue { code: code.into(), level, message: message.into(), stage_id }
}

pub fn date_key(raw: Option<&str>) -> String {
    raw.unwrap_or("")
        .trim()
        .split(['T', ' '])
        .next()
        .unwrap_or("")
        .to_string()
}

/// Тема, раздел, цели и дата — только из КТП (FR-3.1). Цели урока и ценности не трогаем.
pub fn apply_locked_header(header: &mut KspHeader, locked: &KspHeader) -> bool {
    let mut changed = false;
    if header.section.trim() != locked.section.trim() {
        header.section = locked.section.clone();
        changed = true;
    }
    if header.topic.trim() != locked.topic.trim() {
        header.topic = locked.topic.clone();
        changed = true;
    }
    if date_key(header.planned_date.as_deref()) != date_key(locked.planned_date.as_deref()) {
        header.planned_date = locked.planned_date.clone();
        changed = true;
    }
    let mut a: Vec<_> = header.learning_objectives.iter().map(|o| (o.code.trim(), o.text.trim())).collect();
    let mut b: Vec<_> = locked.learning_objectives.iter().map(|o| (o.code.trim(), o.text.trim())).collect();
    a.sort();
    b.sort();
    if a != b {
        header.learning_objectives = locked.learning_objectives.clone();
        changed = true;
    }
    changed
}

fn new_stage(stage_type: StageType, minutes: i64, teacher: &str, student: &str, resources: &str) -> KspStage {
    let mut assessment = StageAssessment::for_type(stage_type);
    if stage_type == StageType::Greeting {
        assessment.feedback_method = "none".into();
        assessment.descriptors.push(Descriptor {
            text: "Оценивание эмоционального состояния учащихся".into(),
            points: None,
        });
    }
    KspStage {
        id: uuid::Uuid::new_v4().to_string(),
        stage_type,
        order: 0,
        duration_minutes: minutes,
        teacher_actions: teacher.into(),
        student_actions: student.into(),
        resources: if resources.is_empty() {
            Vec::new()
        } else {
            vec![ResourceRef { kind: "note".into(), display: resources.into() }]
        },
        assessment,
    }
}

/// Каркас по типу урока КТП — как в рабочих КСП 8 класса (алгебра/геометрия).
pub fn draft_from_template(
    kind: LessonKind,
    header: KspHeader,
    duration: i64,
) -> KspContent {
    let mut stages = match kind {
        LessonKind::Sor => vec![
            new_stage(StageType::Greeting, 1, "Приветствует учеников.", "Приветствуют друг друга.", ""),
            new_stage(StageType::Actualization, 5, "Задаёт вопросы по предыдущей теме.", "Отвечают на вопросы.", ""),
            new_stage(StageType::FormativeAssessment, 12, "Раздаёт карточки для подготовки к СОР.", "Выполняют задания на карточках.", "карточки"),
            new_stage(StageType::Sor, 22, "Проводит суммативное оценивание за раздел.", "Выполняют задания СОР.", ""),
            new_stage(StageType::Homework, 2, "Даёт разъяснение по домашнему заданию.", "Записывают домашнее задание.", "доска, тетрадь"),
            new_stage(StageType::Reflection, 3, "Организует рефлексию и самооценку.", "Отвечают: что узнали, чему научились, что осталось непонятным.", ""),
        ],
        LessonKind::Soch => vec![
            new_stage(StageType::Greeting, 1, "Приветствует учеников, напоминает регламент работы.", "Приветствуют друг друга, готовят рабочие места.", ""),
            new_stage(StageType::Soch, 40, "Проводит суммативное оценивание за четверть.", "Выполняют задания СОЧ.", "приложение"),
            new_stage(StageType::Reflection, 4, "Собирает работы, фиксирует завершение.", "Сдают работы.", ""),
        ],
        _ => vec![
            new_stage(StageType::Greeting, 1, "Приветствует учеников.", "Приветствуют друг друга.", ""),
            new_stage(StageType::Actualization, 5, "Актуализирует опорные знания предыдущего урока.", "Отвечают на вопросы.", ""),
            new_stage(StageType::Theory, 15, "Объясняет новый материал, записывает ключевые формулы на доске.", "Записывают материал, задают вопросы.", "учебник"),
            new_stage(StageType::Practice, 17, "Организует решение заданий у доски и в тетради.", "Решают примеры, по очереди выходят к доске.", "учебник"),
            new_stage(StageType::Homework, 2, "Даёт разъяснение по домашнему заданию.", "Записывают домашнее задание, задают вопросы.", "доска, тетрадь"),
            new_stage(StageType::Reflection, 5, "Организует фиксирование нового содержания и самооценку.", "Отвечают: что узнали, чему научились, что осталось непонятным, над чем надо поработать.", ""),
        ],
    };
    let sum: i64 = stages.iter().map(|s| s.duration_minutes).sum();
    if sum != duration {
        if let Some(last) = stages.last_mut() {
            last.duration_minutes = (last.duration_minutes + duration - sum).max(1);
        }
    }
    let mut content = KspContent {
        schema_version: 1,
        lesson_duration: duration,
        header,
        stages,
        homework: HomeworkBlock {
            text: match kind {
                LessonKind::Soch => String::new(),
                _ => "Записать задания, указанные педагогом.".into(),
            },
            ..HomeworkBlock::default()
        },
    };
    content.reindex();
    content
}

/// Масштабирует минуты пропорционально текущим длительностям, сохраняя форму урока.
pub fn rebalance_time(content: &mut KspContent) {
    let n = content.stages.len();
    if n == 0 {
        return;
    }
    let target = content.lesson_duration.max(1);
    let weights: Vec<i64> = content.stages.iter().map(|s| s.duration_minutes.max(1)).collect();
    let weight_sum: i64 = weights.iter().sum();
    if weight_sum <= 0 {
        return;
    }

    let mut allocated = 0i64;
    for (i, s) in content.stages.iter_mut().enumerate() {
        if i + 1 == n {
            s.duration_minutes = (target - allocated).max(1);
        } else {
            let scaled = ((weights[i] as f64) * (target as f64) / (weight_sum as f64)).round() as i64;
            s.duration_minutes = scaled.max(1);
            allocated += s.duration_minutes;
        }
    }

    while content.total_minutes() > target {
        if let Some(s) = content.stages.iter_mut().rev().find(|s| s.duration_minutes > 1) {
            s.duration_minutes -= 1;
        } else {
            break;
        }
    }
    while content.total_minutes() < target {
        if let Some(s) = content.stages.last_mut() {
            s.duration_minutes += 1;
        } else {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header() -> KspHeader {
        KspHeader {
            section: "Квадратные уравнения".into(),
            topic: "Решение текстовых задач".into(),
            learning_objectives: vec![LearningObjectiveRef {
                code: "8.4.2.1".into(),
                text: "решать текстовые задачи с помощью квадратных уравнений".into(),
            }],
            planned_date: Some("2026-01-09".into()),
            class_name: "8".into(),
            teacher_name: "Бабич И.Д.".into(),
            lesson_goals: LessonGoals { all: "решает задачу".into(), most: String::new(), some: String::new() },
            values_component: ValuesComponent {
                value_ids: vec!["discipline".into()],
                text: "формирование самодисциплины".into(),
            },
            success_criteria: vec![],
        }
    }

    #[test]
    fn standard_template_hits_45() {
        let c = draft_from_template(LessonKind::Standard, header(), 45);
        assert_eq!(c.total_minutes(), 45);
        assert_eq!(c.stages.first().unwrap().stage_type, StageType::Greeting);
    }

    #[test]
    fn empty_teacher_actions_block() {
        let mut c = draft_from_template(LessonKind::Standard, header(), 45);
        c.stages[1].teacher_actions.clear();
        let r = validate_content(&c, false);
        assert!(r.issues.iter().any(|i| i.code == "V-04" && i.level == IssueLevel::Blocking));
    }

    #[test]
    fn duration_mismatch_is_blocking() {
        let mut c = draft_from_template(LessonKind::Standard, header(), 45);
        c.stages[0].duration_minutes = 10;
        let r = validate_content(&c, false);
        assert!(r.issues.iter().any(|i| i.code == "V-03"));
        assert!(!r.can_mark_ready);
    }

    #[test]
    fn rebalance_hits_target() {
        let mut c = draft_from_template(LessonKind::Standard, header(), 45);
        c.stages[0].duration_minutes = 20;
        rebalance_time(&mut c);
        assert_eq!(c.total_minutes(), 45);
    }

    #[test]
    fn rebalance_keeps_greeting_smaller_than_practice() {
        let mut c = draft_from_template(LessonKind::Standard, header(), 45);
        c.lesson_duration = 90;
        rebalance_time(&mut c);
        assert_eq!(c.total_minutes(), 90);
        let greeting = c.stages.iter().find(|s| s.stage_type == StageType::Greeting).unwrap();
        let practice = c.stages.iter().find(|s| s.stage_type == StageType::Practice).unwrap();
        assert!(greeting.duration_minutes < practice.duration_minutes);
    }

    #[test]
    fn soch_without_homework_block_is_ready_on_v13() {
        let c = draft_from_template(LessonKind::Soch, header(), 45);
        assert!(c.homework.text.is_empty());
        let r = validate_content(&c, false);
        assert!(!r.issues.iter().any(|i| i.code == "V-13"));
    }

    #[test]
    fn homework_stage_satisfies_v13() {
        let mut c = draft_from_template(LessonKind::Standard, header(), 45);
        c.homework.text.clear();
        let r = validate_content(&c, false);
        assert!(!r.issues.iter().any(|i| i.code == "V-13"));
    }

    #[test]
    fn apply_locked_header_updates_topic_only() {
        let mut h = header();
        h.lesson_goals.all = "своя цель".into();
        let locked = KspHeader {
            topic: "Новая тема из КТП".into(),
            section: h.section.clone(),
            learning_objectives: h.learning_objectives.clone(),
            planned_date: h.planned_date.clone(),
            class_name: h.class_name.clone(),
            teacher_name: h.teacher_name.clone(),
            lesson_goals: LessonGoals::default(),
            values_component: ValuesComponent::default(),
            success_criteria: vec![],
        };
        assert!(apply_locked_header(&mut h, &locked));
        assert_eq!(h.topic, "Новая тема из КТП");
        assert_eq!(h.lesson_goals.all, "своя цель");
    }
}
