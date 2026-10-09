import { useCallback, useEffect, useRef, useState } from "react";

/** Interactions qui comptent comme une activité de l'utilisateur. */
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "pointerdown", "touchstart", "keydown", "wheel", "scroll"] as const;

export interface AutoLogoutOptions {
  /** Surveillance active (utilisateur connecté, écran concerné). */
  enabled: boolean;
  /** Inactivité avant l'avertissement (ms). */
  warnAfterMs: number;
  /** Durée du compte à rebours affiché avant la déconnexion (s). */
  countdownSeconds: number;
  /** Appelé une seule fois quand le compte à rebours atteint 0. */
  onTimeout: () => void;
}

/**
 * Déconnexion automatique après inactivité, avec avertissement préalable.
 *
 * Les délais sont calculés à partir de l'horodatage de la dernière interaction (et non
 * par minuteries cumulées) : une tablette mise en veille ou un onglet en arrière-plan
 * est déconnecté dès son réveil si le délai est dépassé. Pendant l'avertissement, bouger
 * la souris ne suffit pas : il faut confirmer avec « Rester connecté » (`stayActive`).
 */
export function useAutoLogout({ enabled, warnAfterMs, countdownSeconds, onTimeout }: AutoLogoutOptions) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
  const lastActivity = useRef(Date.now());
  const warningRef = useRef(false);
  const firedRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  /** Relance la surveillance (bouton « Rester connecté », nouvelle session). */
  const stayActive = useCallback(() => {
    lastActivity.current = Date.now();
    warningRef.current = false;
    firedRef.current = false;
    setWarningOpen(false);
    setSecondsLeft(countdownSeconds);
  }, [countdownSeconds]);

  useEffect(() => {
    if (!enabled) {
      warningRef.current = false;
      setWarningOpen(false);
      return;
    }
    stayActive();

    const onActivity = () => {
      if (!warningRef.current) lastActivity.current = Date.now();
    };
    const check = () => {
      const idle = Date.now() - lastActivity.current;
      if (idle < warnAfterMs) return;
      const left = Math.max(0, Math.ceil((warnAfterMs + countdownSeconds * 1000 - idle) / 1000));
      if (!warningRef.current) {
        warningRef.current = true;
        setWarningOpen(true);
      }
      setSecondsLeft(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeoutRef.current();
      }
    };
    const onVisible = () => document.visibilityState === "visible" && check();

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 1000);
    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, warnAfterMs, countdownSeconds, stayActive]);

  return { warningOpen, secondsLeft, stayActive };
}
