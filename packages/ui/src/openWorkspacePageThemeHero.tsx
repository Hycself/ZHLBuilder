import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { resolveTheme } from "@/useTheme.js";
import type { Theme } from "@/useTheme.js";

interface ThemeHeroPalette {
  panel: string;
  meshBase: string;
  meshLight: string;
  glowPrimary: string;
  glowSecondary: string;
  heading: string;
  description: string;
}

function getThemeHeroPalette(theme: Theme): ThemeHeroPalette {
  switch (theme) {
    case "light":
      return {
        meshBase: "#E7F3F5",
        meshLight: "#7CC8D5",
        panel:
          "bg-background before:absolute before:inset-0 before:content-[''] before:bg-surface",
        glowPrimary: "bg-[#9AD4DD]/45 mix-blend-multiply",
        glowSecondary: "bg-[#DCEBF0]/80 mix-blend-multiply",
        heading: "text-[#16202E]",
        description: "text-[#4E5C6E]",
      };
    case "zai-light":
      return {
        meshBase: "#E7F3F5",
        meshLight: "#7CC8D5",
        panel:
          "bg-background before:absolute before:inset-0 before:content-[''] before:bg-surface",
        glowPrimary: "bg-[#9AD4DD]/45 mix-blend-multiply",
        glowSecondary: "bg-[#DCEBF0]/80 mix-blend-multiply",
        heading: "text-[#16202E]",
        description: "text-[#4E5C6E]",
      };
    case "zai-dark":
      return {
        meshBase: "#0E2A33",
        meshLight: "#D36B46",
        panel:
          "bg-background before:absolute before:inset-0 before:content-[''] before:bg-surface",
        glowPrimary: "bg-[#D36B46]/22 mix-blend-screen",
        glowSecondary: "bg-[#67E8F9]/16 mix-blend-screen",
        heading: "text-[#E6EDF6]",
        description: "text-[#A8B7C9]",
      };
    case "dark":
    case "system":
    default:
      return {
        meshBase: "#0C1A22",
        meshLight: "#D36B46",
        panel:
          "bg-background before:absolute before:inset-0 before:content-[''] before:bg-surface",
        glowPrimary: "bg-cyan-300/22 mix-blend-screen",
        glowSecondary: "bg-cyan-400/18 mix-blend-screen",
        heading: "text-slate-50",
        description: "text-slate-200/72",
      };
  }
}

export function useResolvedThemeHeroPalette(): ThemeHeroPalette {
  const theme = useZCodeStore((state) => state.theme);
  const resolvedTheme =
    theme === "system" ? (resolveTheme(theme) === "dark" ? "dark" : "light") : theme;

  return getThemeHeroPalette(resolvedTheme);
}

export function ThemeHeroVisual(props: {
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}) {
  const palette = useResolvedThemeHeroPalette();

  return (
    <div className={cn("relative overflow-hidden", palette.panel, props.className)}>
      <div
        className={cn(
          "pointer-events-none absolute left-[-12%] top-[18%] h-[42rem] w-[42rem] rounded-full blur-3xl",
          palette.glowPrimary,
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute right-[-18%] bottom-[-14%] h-[36rem] w-[36rem] rounded-full blur-3xl",
          palette.glowSecondary,
        )}
      />
      {props.children ? (
        <div className={cn("relative z-10", props.contentClassName)}>{props.children}</div>
      ) : null}
    </div>
  );
}
