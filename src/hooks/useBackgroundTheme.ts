/**
 * useBackgroundTheme.ts
 *
 * React hook that resolves and exposes the dynamic background theme.
 *
 * Usage:
 *   const { url, key, reason } = useBackgroundTheme();
 *
 * When attachToRoot is true the resolved URL is written to the CSS custom
 * property --intro-bg-image on <html> (documentElement) so global styles can consume it.
 */
import { useState, useEffect } from 'react';
import { getNextThemeBoundaryDelay, resolveTheme, timeOfDayKey } from '../utils/backgroundTheme';
import type { ResolvedTheme, ThemeKey } from '../utils/backgroundTheme';
import { resolveSkinAsset } from '../utils/skinAssets';

interface BackgroundState {
  url: string | null;
  key: ThemeKey | null;
  reason: string | null;
}

interface UseBackgroundThemeOptions {
  attachToRoot?: boolean;
}

function resolveInitialBackground(): BackgroundState {
  const fallbackKey = timeOfDayKey(new Date());
  const fallbackAsset = resolveSkinAsset(fallbackKey);

  return {
    url: fallbackAsset.url,
    key: fallbackAsset.key,
    reason: 'fallback:initial-render',
  };
}

export default function useBackgroundTheme(
  opts: UseBackgroundThemeOptions = {},
): BackgroundState {
  const [state, setState] = useState<BackgroundState>(() => resolveInitialBackground());

  const { attachToRoot } = opts;

  useEffect(() => {
    let cancelled = false;
    let resolving = false;
    let lastForegroundRefreshAt = 0;
    let boundaryTimer: number | undefined;

    const applyTheme = (resolved: ResolvedTheme) => {
      if (cancelled) return;
      setState({ url: resolved.url, key: resolved.key, reason: resolved.reason });
      if (attachToRoot) {
        document.documentElement.style.setProperty('--intro-bg-image', `url("${resolved.url}")`);
      }
    };

    const refresh = async (foreground = false) => {
      if (cancelled || resolving) return;
      const now = Date.now();
      if (foreground && now - lastForegroundRefreshAt < 1000) return;
      if (foreground) lastForegroundRefreshAt = now;
      resolving = true;
      try {
        applyTheme(await resolveTheme());
      } catch (error) {
        if (cancelled) return;
        const fallbackKey = timeOfDayKey(new Date());
        const fallbackAsset = resolveSkinAsset(fallbackKey);
        const fallbackReason = `resolveTheme:error:${error instanceof Error ? error.message : String(error)}`;
        console.warn('[useBackgroundTheme] resolver failed; using emergency fallback', {
          error, fallbackKey, fallbackAsset,
        });
        applyTheme({
          key: fallbackAsset.key,
          url: fallbackAsset.url,
          reason: fallbackReason,
          assetFile: fallbackAsset.file,
          assetSource: fallbackAsset.source,
          platform: 'web',
          permissionStatus: 'unknown',
        });
      } finally {
        resolving = false;
      }
    };

    const scheduleBoundaryRefresh = () => {
      if (boundaryTimer != null) window.clearTimeout(boundaryTimer);
      boundaryTimer = window.setTimeout(() => {
        void refresh();
        scheduleBoundaryRefresh();
      }, getNextThemeBoundaryDelay(new Date()) + 50);
    };

    const refreshOnForeground = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };

    void refresh();
    scheduleBoundaryRefresh();
    document.addEventListener('visibilitychange', refreshOnForeground);
    window.addEventListener('focus', refreshOnForeground);
    window.addEventListener('pageshow', refreshOnForeground);

    return () => {
      cancelled = true;
      if (boundaryTimer != null) window.clearTimeout(boundaryTimer);
      document.removeEventListener('visibilitychange', refreshOnForeground);
      window.removeEventListener('focus', refreshOnForeground);
      window.removeEventListener('pageshow', refreshOnForeground);
      if (attachToRoot) {
        document.documentElement.style.removeProperty('--intro-bg-image');
      }
    };
  }, [attachToRoot]);

  return state;
}
