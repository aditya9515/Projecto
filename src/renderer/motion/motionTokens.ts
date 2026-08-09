export const motionDurations = {
  instant: 0.18,
  fast: 0.22,
  normal: 0.4,
  reveal: 0.8,
  editorial: 1,
} as const;

export const motionEases = {
  interaction: "power3.out",
  reveal: "power4.out",
  editorial: "expo.inOut",
  tactile: "back.inOut(1.5)",
} as const;
