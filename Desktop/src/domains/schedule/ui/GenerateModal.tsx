import { useState, useEffect } from "react";

interface GenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGenerate: (timeLimitSec: number) => Promise<void>;
  isGenerating: boolean;
  onCancelGenerate?: () => void;
}

const PRESETS = [
  { label: "15 сек (Тест)", value: 15 },
  { label: "30 сек (Быстро)", value: 30 },
  { label: "60 сек (Стандарт)", value: 60 },
  { label: "180 сек (Глубокий)", value: 180 },
  { label: "300 сек (Максимум)", value: 300 },
];

export function GenerateModal({
  isOpen,
  onClose,
  onStartGenerate,
  isGenerating,
  onCancelGenerate,
}: GenerateModalProps) {
  const [timeLimitSec, setTimeLimitSec] = useState<number>(60);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  useEffect(() => {
    let timer: any = null;
    if (isGenerating) {
      setElapsedSec(0);
      timer = setInterval(() => {
        setElapsedSec(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedSec(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGenerating]);

  if (!isOpen) return null;

  const handleStart = () => {
    onStartGenerate(timeLimitSec);
  };

  const progressPercent = Math.min(100, Math.round((elapsedSec / timeLimitSec) * 100));

  return (
    <div className="modal-backdrop" onClick={isGenerating ? undefined : onClose}>
      <div className="modal-content generate-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚡ Генерация расписания (CP-SAT)</h2>
          {!isGenerating && (
            <button className="clear-search-btn" onClick={onClose}>
              ✕
            </button>
          )}
        </div>

        {isGenerating ? (
          <div className="generation-progress-body">
            <div className="spinner-large">⚡</div>
            <h3>Идёт математический расчёт расписания...</h3>
            <p className="muted">
              Поиск идеальных комбинаций слотов, минимизация окон учителей и оптимизация кривой СанПиН.
            </p>

            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="progress-timer-row">
              <span>Прошло: {elapsedSec} сек</span>
              <span>Лимит: {timeLimitSec} сек ({progressPercent}%)</span>
            </div>

            <div className="generation-modal-actions" style={{ marginTop: "20px" }}>
              <button
                type="button"
                className="btn btn-danger btn-large"
                onClick={onCancelGenerate}
              >
                ⛔ Остановить / Прервать генерацию
              </button>
            </div>
          </div>
        ) : (
          <div className="generate-settings-body">
            <div className="form-group">
              <label>⏱️ Время работы алгоритма (Лимит времени):</label>
              <div className="preset-buttons-row">
                {PRESETS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    className={`preset-btn ${timeLimitSec === p.value ? "active" : ""}`}
                    onClick={() => setTimeLimitSec(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="slider-wrapper" style={{ marginTop: "14px" }}>
                <input
                  type="range"
                  min="15"
                  max="300"
                  step="15"
                  value={timeLimitSec}
                  onChange={e => setTimeLimitSec(Number(e.target.value))}
                  className="time-range-slider"
                />
                <div className="slider-value-display">
                  Текущий лимит: <strong>{timeLimitSec} секунд</strong> (
                  {timeLimitSec <= 30
                    ? "Быстрый черновик"
                    : timeLimitSec <= 90
                    ? "Стандартная точность"
                    : "Максимальное качество и глубокая шлифовка"}
                  )
                </div>
              </div>
            </div>

            <div className="info-box-blue" style={{ marginTop: "16px" }}>
              <strong>💡 Как время влияет на качество:</strong>
              <br />
              В первые 5–15 секунд алгоритм находит базовый вариант (FEASIBLE). Последующие секунды используются для непрерывного снижения окон учителей, выравнивания кривой СанПиН и распределения нагрузки.
            </div>

            <div className="generation-modal-actions" style={{ marginTop: "24px" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary btn-large" onClick={handleStart}>
                🚀 Запустить генерацию ({timeLimitSec}с)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
