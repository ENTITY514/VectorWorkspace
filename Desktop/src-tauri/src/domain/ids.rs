//! Строгие идентификаторы (Newtype). Хранят нативный `uuid::Uuid` (16 байт, Copy),
//! а не строку в куче. Ошибка — на этапе компиляции, а не исполнения.
//! Сущности создаются раньше, чем контуры их используют — dead_code ожидаем до заполнения ядра.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;
use uuid::Uuid;

macro_rules! id_type {
    ($(#[$attr:meta])* $name:ident) => {
        $(#[$attr])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(Uuid);

        impl $name {
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }

            /// Возвращает нативный UUID (16 байт, без выделения).
            pub fn as_uuid(&self) -> Uuid {
                self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl From<Uuid> for $name {
            fn from(u: Uuid) -> Self {
                Self(u)
            }
        }

        impl From<$name> for Uuid {
            fn from(id: $name) -> Self {
                id.0
            }
        }

        impl FromStr for $name {
            type Err = uuid::Error;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Ok(Self(Uuid::from_str(s)?))
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}", self.0)
            }
        }
    };
}

id_type!(
    /// Идентификатор документа ТУП (алгебра и геометрия — разные документы).
    TupDocumentId
);
id_type!(
    /// Идентификатор цели обучения.
    ObjectiveId
);
id_type!(
    /// Идентификатор задачи предмета (Глава 1, п. 3).
    TupTaskId
);
id_type!(
    /// Идентификатор записи учебной нагрузки (Параграф 1).
    TupHourId
);
id_type!(
    /// Идентификатор четверти Долгосрочного плана (Параграф 3).
    TupQuarterId
);
id_type!(
    /// Идентификатор раздела Долгосрочного плана.
    TupSectionId
);
id_type!(
    /// Идентификатор темы Долгосрочного плана.
    TupTopicId
);
id_type!(
    /// Идентификатор плана КТП.
    KtpPlanId
);
id_type!(
    /// Идентификатор четверти КТП.
    KtpQuarterId
);
id_type!(
    /// Идентификатор урока КТП.
    KtpLessonId
);
id_type!(
    /// Идентификатор документа КСП.
    KspId
);
id_type!(
    /// Идентификатор спецификации СОР.
    SorSpecId
);
id_type!(
    /// Идентификатор спецификации СОЧ.
    SochSpecId
);
id_type!(
    /// Идентификатор учебника.
    TextbookId
);
id_type!(
    /// Идентификатор параграфа учебника.
    ParagraphId
);
id_type!(
    /// Идентификатор задания учебника.
    TaskUnitId
);
id_type!(
    /// Идентификатор школы.
    SchoolId
);
id_type!(
    /// Идентификатор должности в штате школы.
    StaffId
);
id_type!(
    /// Идентификатор профиля учителя.
    TeacherProfileId
);
id_type!(
    /// Идентификатор физического класса («7 А»).
    ClassId
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_is_copy_and_size_of_uuid() {
        let id = KtpLessonId::new();
        let copied = id; // Копия без переноса — доказывает Copy.
        assert_eq!(id, copied);
        // 16 байт, не 24 байта строки.
        assert_eq!(std::mem::size_of::<KtpLessonId>(), 16);
    }

    #[test]
    fn id_roundtrip_via_display_and_fromstr() {
        let id = KspId::new();
        let s = id.to_string();
        let parsed = KspId::from_str(&s).unwrap();
        assert_eq!(id, parsed);
    }

    #[test]
    fn id_serializes_as_string() {
        let id = ObjectiveId::new();
        let json = serde_json::to_string(&id).unwrap();
        let parsed: ObjectiveId = serde_json::from_str(&json).unwrap();
        assert_eq!(id, parsed);
        // Сериализация — строка UUID (transparent), не объект { "0": ... }.
        assert!(json.starts_with('"'));
    }

    #[test]
    fn invalid_str_fails() {
        assert!(KtpPlanId::from_str("not-a-uuid").is_err());
    }
}
