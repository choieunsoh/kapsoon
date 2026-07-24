// The opacity at which --color-accent, composited over --color-bg (#101114), clears WCAG 2.2
// 1.4.11's 3:1 for a graphical object that carries meaning. Measured 3.17:1; 0.5 — what the trend
// and spend bars used before — is 2.47:1 and fails.
//
// This lives in its own module rather than beside any one chart because it is a PROOF, not a taste
// call: it is the output of sRGB alpha-compositing arithmetic against two specific tokens, and it
// binds every chart drawn in the accent. Once held privately by the weekday grid, it went unseen by the two
// sibling charts, which drifted to 0.5 and failed. Anything that recedes an accent-on-background
// mark imports this; anything that changes --color-accent or --color-bg re-derives it.
export const ACCENT_INK_FLOOR = 0.62;
