import { useMemo, useRef } from "react";
import { gsap, useGSAP } from "../../motion/gsapSetup";
import { motionDurations, motionEases } from "../../motion/motionTokens";
import { useMotionSettings } from "../../motion/MotionProvider";
import { cn } from "../../utils/cn";

type RollingTitleProps = {
  as?: "h1" | "h2" | "h3";
  className?: string;
  text: string;
};

export function RollingTitle({
  as: Tag = "h2",
  className,
  text,
}: RollingTitleProps): JSX.Element {
  const root = useRef<HTMLHeadingElement>(null);
  const { reducedMotion } = useMotionSettings();
  const lines = useMemo(
    () => text.split("\n").map((line) => line.split(" ")),
    [text],
  );

  useGSAP(
    () => {
      if (reducedMotion || !root.current) return;
      gsap.fromTo(
        root.current.querySelectorAll(".projecto-title-track"),
        // Start on the duplicate glyph so a throttled/background Electron
        // renderer never leaves the heading visually empty mid-reveal.
        { yPercent: -50 },
        {
          yPercent: 0,
          duration: motionDurations.editorial,
          ease: motionEases.editorial,
          stagger: { each: 0.022, from: "start" },
          clearProps: "transform",
        },
      );
    },
    { dependencies: [reducedMotion, text], scope: root, revertOnUpdate: true },
  );

  return (
    <Tag aria-label={text.replaceAll("\n", " ")} className={cn("projecto-rolling-title", className)} ref={root}>
      <span className="sr-only">{text.replaceAll("\n", " ")}</span>
      <span aria-hidden="true" className="projecto-title-visual">
        {lines.map((line, lineIndex) => (
          <span className="projecto-title-line" key={`line-${lineIndex}`}>
            {line.map((word, wordIndex) => (
              <span className="projecto-title-word" key={`${word}-${wordIndex}`}>
                {Array.from(word).map((character, characterIndex) => (
                  <span
                    className="projecto-title-mask"
                    key={`${character}-${characterIndex}`}
                  >
                    <span className="projecto-title-track">
                      <span>{character}</span>
                      <span>{character}</span>
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </span>
        ))}
      </span>
    </Tag>
  );
}
