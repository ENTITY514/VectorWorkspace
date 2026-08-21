## 1. Исправление кнопок управления окном (Titlebar)

- [x] 1.1 В `Titlebar.tsx` добавить детекцию Tauri (`"__TAURI_INTERNALS__" in window`) и рендерить блок `.titlebar-controls` только внутри Tauri.
- [x] 1.2 Убедиться, что кнопки окна остаются сиблингами элемента с `data-tauri-drag-region` (не перехватываются для перетаскивания) и вызывают `getCurrentWindow().minimize()/toggleMaximize()/close()`.
- [x] 1.3 Выдать явные разрешения окна в `src-tauri/capabilities/default.json` (`core:window:allow-minimize/maximize/unmaximize/toggle-maximize/close/start-dragging`), иначе вызовы API в Tauri v2 отклоняются по политике прав доступа и кнопки «молчат».

## 2. Сворачиваемый сайдбар

- [x] 2.1 В `MainLayout.tsx` добавить состояние `collapsed` (инициализация из `localStorage["vw-sidebar-collapsed"]`) и сохранять его при изменении.
- [x] 2.2 Передать `collapsed` в `Sidebar` через проп; в свёрнутом виде скрывать подписи пунктов, бренд и текст подвала, оставлять только иконки (узкая колонка ~64px), добавить `title`-подсказки.
- [x] 2.3 Добавить кнопку-«гамбургер» в `AppHeader` для переключения `collapsed`.
- [x] 2.4 Перенести переключатель сворачивания в бренд сайдбара (`Sidebar`): кликабельный `.sidebar-brand` с анимированным «шевроном» (влево = свернуть, вправо = развернуть, `rotate(180deg)` + `transition`), плавное сворачивание подписи (`max-width`/`opacity`). Убрать дублирующий «гамбургер» из `AppHeader`.

## 3. Заголовок приложения (AppHeader)

- [x] 3.1 Создать `AppHeader.tsx`: слева — «гамбургер» + название раздела (`h1`) + подзаголовок (`p`); справа — иконочный переключатель темы и `UserMenu`.
- [x] 3.2 Переиспользовать хук темы (`useTheme`) для иконочного переключателя (☀ в Light / ☾ в Dark, без текстовых подписей).
- [x] 3.3 В `MainLayout.tsx` заменить блок `page-head` на `AppHeader`, передав `view`, `onViewChange` (для навигации «Настройки») и `onToggleSidebar`.

## 4. Меню пользователя (UserMenu)

- [x] 4.1 Создать `UserMenu.tsx` с типом `UserMenuItem = { id; label; icon?; onSelect: () => void }`; базовый массив: Профиль, Настройки (`onSelect` → навигация на `settings`), Вход, Выход (заглушки).
- [x] 4.2 Реализовать выпадающее меню: кнопка-аватар (иконка/инициалы), `aria-haspopup`/`aria-expanded`, закрытие по клику вне (`mousedown`) и `Escape`.
- [x] 4.3 Связать «Настройки» с переходом на экран настроек через `onViewChange`.

## 5. Стили (Design System)

- [x] 5.1 В `styles.css` добавить стили `.app-header` (компактный, фон `--bg-surface`, нижняя граница `--border-subtle`), `.sidebar.collapsed` (узкая колонка, центрирование иконок), `.user-menu`/`.user-menu-item` (фон `--bg-surface-elevated`, бордер `--border-strong`, `focus-visible` кольцо), аватар (круг, 9999px).
- [x] 5.2 Убедиться, что новые стили используют токены и радиусы из Design System и не ломают адаптивность при 1024×768.

## 6. Проверка

- [x] 6.1 `npx tsc --noEmit` — без ошибок типов.
- [x] 6.2 `npx vite build` — сборка успешна.
