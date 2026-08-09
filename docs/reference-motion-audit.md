# Made With GSAP reference audit

Audited on 2026-08-09 against [Made With GSAP — Get Started](https://madewithgsap.com/get-started) at 1920×1080, 1440×900, 1280×800, 1024×768, 768×1024, and 390×844.

This document records the transferable visual and motion system. It does not authorize copying the reference brand, copy, media, or proprietary font files.

## Projecto baseline

Projecto is an Electron Forge application using React 18, TypeScript, React Router, Zustand, Tailwind, and Webpack. The renderer is a fixed desktop shell with a persistent sidebar, route header, independently scrolling main workspace, and persistent run-log drawer.

The live baseline window measured 1446×779. The sidebar was 264px wide, the route header 176px tall, and the main workspace used an independent `overflow: auto` container. Presentation currently uses Manrope plus Georgia, a warm paper-and-blue palette, rounded controls, and Framer Motion. Project opening, scanning, launches, terminals, diagnostics, billing, updates, and filesystem actions are exposed only through the typed preload API (`window.launchStack`) and must remain unchanged.

The real product does not currently contain a graph canvas or runtime code graph. The redesign therefore applies the reference language to Projecto's actual launcher, scanning, health, settings, logs, and project-detail workflows instead of inventing or replacing core product behavior.

## Reference visual system

### Computed palette and root tokens

The reference stylesheet exposes two related palettes. The active Get Started page uses the newer MWG2 surface tokens, while the legacy/global values retain the high-signal lime used throughout the site.

| Role | Measured value |
| --- | --- |
| Ink / legacy black | `#121212` |
| Active page black | `#0a0a0b` |
| Concrete / legacy white | `#f1f1f1` |
| Active light surface | `#f3f3f3` |
| Paper | `#ffffff` |
| Lime accent | `#c9fe6e` |
| Anthracite | `#232323` |
| Dark gray | `#323232` |
| Muted text | `#777777` |
| Secondary light text | `#999999` |

The reference root uses 12 columns, 25px outer margins, and 15px gutters on desktop. Large, medium, and small reference radii are 20px, 12px, and 4px. Projecto deliberately translates these down to 12px, 8px, 4px, and 2px so dense developer-tool controls remain precise and hard-edged.

### Typography

Computed styles identify proprietary `LayGrotesk` for display/body and `PPNeueMontrealMono` for labels and controls. Projecto must not copy those files. Use Inter Tight Variable as the geometric-grotesk substitute and retain JetBrains Mono for technical labels and commands.

| Reference role | Desktop measured | Tablet/mobile measured |
| --- | --- | --- |
| Body | 22px / 26.4px, weight 500 | 18px / 21.6px |
| Mono label | 13px / 19.37px, weight 500, uppercase | 13px / 19.37px |
| Large display | 120px / 114px, `-0.02em` | 65px at 768px; 44px at 390px |
| Medium heading | 65px / 66.3px, `-0.02em` | 40px / 40.8px |
| Small heading | 30px / 30.6px | responsive |

The reference uses weight 500 as the visual default. Hierarchy comes from scale, spacing, and inversion rather than many font weights.

### Geometry and spacing

- Fixed navigation: 100px tall with 25px padding on desktop; 80px tall with 15px padding at 768px and below.
- Desktop hero display: 120px type with `250px 25px 400px` padding; mobile display: 44px with `30px 15px 375px` padding.
- Primary CTA: 50px tall, 13px mono uppercase, 25px horizontal padding.
- The reference CTA is fully rounded at 25px. Projecto translates the motion and compact dimensions while using 2–4px control radii to preserve the requested hard-edged product geometry.
- Light sections are inset by a pseudo-element: 5px on desktop and 3px below 500px. Depth comes from surface inversion, overlap, and transform—not large shadows.
- Long-form sections use unusually large vertical intervals (150px and 300px are present) and reserve lime for conversion or active-state emphasis.

### Responsive measurements

| Viewport | Hero size | Header | Outer padding | Reference page height |
| --- | ---: | ---: | ---: | ---: |
| 1920×1080 | 120px | 100px | 25px | 3890px |
| 1440×900 | 120px | 100px | 25px | 3871px |
| 1280×800 | 120px | 100px | 25px | 3871px |
| 1024×768 | 120px | 100px | 25px | 3915px |
| 768×1024 | 65px | 80px | 15px | 3551px |
| 390×844 | 44px | 80px | 15px | 3486px |

The principal typography breakpoint is 768px. Navigation changes to its compact/menu composition around 1024px. Projecto uses four renderer bands (`>=1440`, `1024–1439`, `768–1023`, and `<768`) because an Electron window is continuously resizable.

## Reference motion language

### Loaded runtime

The page loads GSAP, ScrollTrigger, CustomEase, Lenis, SplitText, InertiaPlugin, Draggable, MorphSVGPlugin, and Matter.js. Source inspection shows that loading a library does not imply that every library is used on this route:

- No `CustomEase.create` call was found; the route uses GSAP's built-in ease family.
- No `Draggable.create` call was found on this route.
- Matter.js, SplitText, Observer, InertiaPlugin, and MorphSVG exist for broader site interactions, but are not all necessary for Projecto.
- Lenis is initialized as `new Lenis({ autoRaf: true })`.
- The source has no explicit `prefers-reduced-motion` branch. Projecto adds one because reduced motion is mandatory for a productive desktop tool.

### Measured ease family

The most frequent source values are:

| Ease | Occurrences | Use |
| --- | ---: | --- |
| `expo.inOut` | 16 | large state and position changes |
| `power4` | 10 | pointer-following and strong settling |
| `power3` / `power3.out` | 4 | medium reveals |
| `power1.inOut` | 3 | scrubbed surface scaling |
| `back.inOut(1.5)` | 3 | toggle and character-price rotation |
| `back.out(1.3)` | 3 | compact tactile entrances |

No extracted custom cubic curve is needed. Projecto centralizes an equivalent small family: `expo.inOut` for editorial transitions, `power4.out` for reveals, `power3.out` for panels, and `back.inOut(1.5)` only for tactile toggle movement.

### Measured duration family

The source clusters at 0.2s, 0.3s, 0.4s, 0.5s, 0.8s, and 1s. The dominant duration is 0.3s (15 occurrences), followed by 0.4s (12), 0.5s (9), and 1s (9). Projecto therefore uses:

- 0.18–0.22s for productive controls.
- 0.3–0.45s for panels, route masks, and state changes.
- 0.7–1s for high-impact onboarding and empty-state typography.

### Reusable interaction findings

#### Rolling links

The reference duplicates labels inside an overflow-hidden track. Fine-pointer hover adds an `on` state, physically translating the track; it resets after 400ms. There is no opacity crossfade. Projecto applies this only to important text actions and keeps the duplicate copy `aria-hidden`.

#### Pricing/state toggle

The measured indicator moves 12px over 0.2s with `back.inOut(1.5)`. Outgoing and incoming price characters rotate in 3D with 0.05s stagger over 0.45s. Projecto translates this to productive state toggles: a short sliding indicator plus a masked label change, without delaying the underlying state update.

#### Masked headings

The reference creates duplicate character glyphs and uses SplitText for character-level entrances. Projecto implements accessible rolling/masked primitives without the paid SplitText dependency: the semantic text remains intact, decorative copies are hidden from assistive technology, and animations scope to component refs.

#### Section reveals

The pricing surface scales vertically from its top origin as the image bottom moves from 90% to 60% of the viewport, scrubbed with `power1.inOut`. Projecto uses transform/clip reveals only on major light/dark section boundaries, never on every card.

#### Scroll and drag

The reference pins selected story sections and uses scrubbed progress. Projecto's main workspace is an independent nested scroll container, and its logs, lists, inputs, and Electron interactions must remain immediate. Lenis is intentionally not used in the dense app shell. Native scrolling is retained to prevent nested-scroll trapping and input latency.

## Projecto adaptation rules

1. Keep all preload, IPC, scanning, persistence, launching, terminal, update, and billing contracts unchanged.
2. Replace the warm paper/blue presentation with concrete, ink, charcoal, fog, paper, and rare lime tokens.
3. Use Inter Tight Variable at weight 500/700 and JetBrains Mono for micro labels and code.
4. Keep workspace type compact; reserve large display type for route identity, onboarding, and empty states.
5. Use hard 1px borders and 2–12px radii. Remove broad shadow-based depth.
6. Introduce scoped GSAP primitives and component cleanup through `@gsap/react`.
7. Keep native scrolling in the desktop shell; do not add Lenis to nested or operational containers.
8. Respect reduced motion in CSS and JavaScript, disabling stagger, parallax, large masks, and continuous motion without changing functionality.
9. Use lime for the primary action, active run, selected/current state, and progress—not as a decorative wash.
10. Validate at large, medium, and narrow Electron window sizes after implementation.

Projecto darkens functional muted copy from the reference `#777777` to `#5c5c5c` on concrete/paper surfaces and uses a darker destructive red. These are deliberate contrast corrections for dense, sub-18px application text and controls.
