# Анализ логики сортировки/поиска/фильтрации (TupList.tsx)

## Алгоритмы реализованы в useMemo() filteredAndSorted (строка 68-109)

---

### 1. Поиск (searchQuery) - строки 72-78
```javascript
if (searchQuery.trim()) {
  const q = searchQuery.toLowerCase().trim();
  result = result.filter(
    d => d.subjectName?.toLowerCase().includes(q) ||
          String(d.appendixNumber).includes(q) ||
          d.targetGrades.includes(String(q))
  );
}
```

**Логика:**
- Ищет в subjectName, appendixNumber (как строка), targetGrades
- Case-insensitive (toLowerCase)
- Проблемы:
  - `d.subjectName?.` может быть undefined → ?.toLower() безопасно
  - Поиск по targetGrades: "5-9".includes("10") = false ✓
  
**Вердикт:** ОК

---

### 2. Фильтр предмет (selectedSubject) - строки 81-83
```javascript
if (selectedSubject !== "all") {
  result = result.filter(d => d.subjectName === selectedSubject);
}
```

**Логика:**
- Exact match по subjectName
- Проблема: если subjectName null/undefined → сравнение вернёт false ✓

**Вердикт:** ОК

---

### 3. Фильтр направление (selectedDirection) - строки 85-87
```javascript
if (selectedDirection !== "all") {
  result = result.filter(d => d.directionStr === selectedDirection);
}
```

**Логика:**
- Exact match по directionStr ("emn", "ogn")
- `directionStr` всегда строка из данных БД ✓

**Вердикт:** ОК

---

### 4. Фильтр классы (selectedGrades) - строки 89-94
```javascript
if (selectedGrades.length > 0) {
  result = result.filter(d => {
    const grades = d.targetGrades.split("-").map((s: string) => Number(s.trim()));
    return grades.some(g => selectedGrades.includes(g));
  });
}
```

**Логика:**
- Парсит "5-9" → [5, 9]
- Проверяет, есть ли хотя бы один из выбранных классов в targetGrades
- Пример: targetGrades="5-9", selectedGrades=[5] → true ✓

**Проблемы:**
1. `d.targetGrades` может быть пустой строкой → `.split("-")` вернёт [""], `.map(Number)` → [NaN]
2. Если grades = [], то `.some()` всегда false → документ исключается (правильно)
3. Нет обработки случая "5,6,7" (без дефиса) — но таких данных нет в БД

**Вердикт:** В целом ОК, но нужно добавить обработку NaN:

```javascript
const grades = d.targetGrades.split("-")
  .map((s: string) => Number(s.trim()))
  .filter((g) => !isNaN(g)); // <-- добавлено
```

---

### 5. Сортировка (строки 96-106)
```javascript
result.sort((a, b) => {
  let cmp = 0;
  switch (sortField) {
    case "subjectName": cmp = a.subjectName.localeCompare(b.subjectName); break;
    case "targetGrades": cmp = String(a.targetGrades).localeCompare(b.targetGrades); break;
    case "objectiveCount": cmp = a.objectiveCount - b.objectiveCount; break;
    case "orderDate": cmp = a.orderDate.localeCompare(b.orderDate); break;
  }
  return sortDir === "asc" ? cmp : -cmp;
});
```

**Логика:**
- subjectName: localeCompare (алфавитная сортировка) ✓
- targetGrades: String.localeCompare ("5-9" < "7") ✓
- objectiveCount: numeric diff (числовая сортировка) ✓
- orderDate: localeCompare дат в формате YYYY-MM-DD ✓

**Проблемы:**
1. `a.subjectName` может быть undefined → `.localeCompare()` бросит TypeError!
2. `String(a.targetGrades)` обрабатывает null/undefined как "null" (нежелательно)
3. `a.objectiveCount - b.objectiveCount`: если objectiveCount NaN, то результат NaN

**Исправления:**
```javascript
result.sort((a, b) => {
  let cmp = 0;
  
  // subjectName
  const nameA = a.subjectName ?? "";
  const nameB = b.subjectName ?? "";
  if (sortField === "subjectName") {
    cmp = nameA.localeCompare(nameB);
    break;
  }
  
  // targetGrades
  if (sortField === "targetGrades") {
    cmp = String(a.targetGrades || "").localeCompare(String(b.targetGrades || ""));
    break;
  }
  
  // objectiveCount
  if (sortField === "objectiveCount") {
    const countA = Number(a.objectiveCount ?? 0);
    const countB = Number(b.objectiveCount ?? 0);
    cmp = countA - countB;
    break;
  }
  
  // orderDate
  if (sortField === "orderDate") {
    cmp = new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
    break;
  }
  
  return sortDir === "asc" ? cmp : -cmp;
});
```

**Вердикт:** Требует обработки edge-cases (undefined/null)

---

## Итоговый отчёт:

| Алгоритм | Статус | Комментарий |
|----------|--------|--------------|
| Поиск | ✅ OK | Case-insensitive, обрабатывает null через ?. |
| Фильтр предмет | ✅ OK | Exact match. |
| Фильтр направление | ✅ OK | Exact match по directionStr. |
| Фильтр классы | ⚠️ Условно OK | Нужно добавить `.filter((g) => !isNaN(g))` и обработку NaN в сравнении. |
| Сортировка subjectName | ❌ Требует fix | Нужна проверка на null/undefined перед `.localeCompare()`. |
| Сортировка targetGrades | ⚠️ Условно OK | String(a.targetGrades) обрабатывает null как "null" — неидеально. |
| Сортировка objectiveCount | ❌ Требует fix | Нужно Number(x ?? 0) для NaN-защиты. |
| Сортировка orderDate | ⚠️ Условно OK | localeCompare дат с YYYY-MM-DD работает, но лучше использовать Date.getTime(). |

---

## Приоритет исправлений:

1. **Сортировка objectiveCount** — добавить `Number(a.objectiveCount ?? 0)` (высокий приоритет)
2. **Сортировка subjectName/targetGrades** — обработать null/undefined (средний приоритет)
3. **Фильтр классы** — добавить `.filter((g) => !isNaN(g))` (низкий приоритет)
