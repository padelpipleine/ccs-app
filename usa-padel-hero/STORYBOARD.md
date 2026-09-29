# USA Padel × Skechers hero loop: storyboard

Draft for approval. Nothing is built yet. Once you confirm the shots and the open questions at the bottom, I'll build `hero.html` to this exact document and update the timings here if anything moves.

## Stage and grid

All positions are in a fixed 1600 × 900 stage (16:9). The stage scales uniformly to fit its container, so the composition is the same at 360 px and at 1200 px wide.

| Element | Position (stage px) |
|---|---|
| Safe area | x 96–1504, y 72–828 |
| Court outline (20 × 10 m, plan view, long axis horizontal) | x 96–1504, y 98–802 (70.4 px per metre) |
| Left baseline | x 96 |
| Service lines (6.95 m each side of the net) | x 311 and x 1289 |
| Net | x 800, crimson |
| Centre service line | y 450, from x 311 to x 1289 |

The service lines split the court into four zones, read left to right:

| Zone | x range | Holds |
|---|---|---|
| A. Left back court | 96–311 | Logo plate (shot 2) |
| B. Left service area | 311–800 | `1,110` |
| C. Right service area | 800–1289 | `~460,000` |
| D. Right back court | 1289–1504 | `250+` |

So the court reads left to right: who we are, then how big we are.

**Colours:** navy `#1B3361` field, white lines and type, crimson `#B41E45` only on the net line. There are no fills behind text except the white logo plate.
**Type:** Montserrat 800 for numbers and the headline. Inter 400 for captions, descriptor and partner line. Everything is in sentence case.
**Easing:** ease-out cubic `1 − (1 − t)³` for arrivals and ease-in-out for fades. There is no overshoot or bounce anywhere.

---

## Shot 1: Court (0.0–2.0 s)

The navy field is empty for 0.2 s, which gives the loop a clean restart point. Then the court is drawn in white at 55% opacity with a 2 px stroke. Each line draws from one end to the other and eases out.

| Time | Line |
|---|---|
| 0.20–1.10 | Outline, drawn as one continuous stroke from the top-left corner, clockwise |
| 0.85–1.35 | Net, crimson, top to bottom |
| 1.10–1.60 | Left and right service lines, top to bottom, 0.08 s apart |
| 1.45–1.95 | Centre service line, left to right |

## Shot 2: Federation (2.0–4.0 s)

| Time | Action |
|---|---|
| 2.00–2.60 | White logo plate (220 × 150, 6 px radius, logo placed as an image and not recoloured) fades in and settles 16 px upward into place. Its top-left corner is at (128, 130), inside zone A. |
| 2.45–2.95 | Descriptor fades in below the plate at x 128, y ≈ 318, Inter 400, 22 px, white at 80%, max width 560, two lines: "National governing body for padel in the United States. Founded 1993." |
| 2.95–4.00 | Hold |

The logo plate stays on screen until the fade to navy at the end of the loop.

## Shot 3: Scale (4.0–8.0 s)

The descriptor fades out at 4.00–4.35, so the scene moves from who we are to how big we are.

Each stat is centred in its zone. The number sits just above the centre service line (y 450) and the caption sits just below it, so the court line acts as the scoreboard rule. Numbers are Montserrat 800, 64 px, white, with tabular figures so the width never jitters. Captions are Inter 400, 20 px, white at 80%, wrapped to the zone width.

| Time | Zone | Number | Caption |
|---|---|---|---|
| 4.20–5.60 | B | `0` → `1,110` | "active courts across 38 states, up 62% in a year" |
| 4.80–6.20 | C | `~0` → `~460,000` | "active players" |
| 5.40–6.80 | D | `0+` → `250+` | "sanctioned events a year" |

- Each caption fades in over 0.3 s, starting 0.15 s after its count begins.
- Counts ease out, so they are fast at first and settle onto the final value. The tilde and plus are fixed from the first frame.
- `~460,000` counts in steps of 1,000 so the low digits don't blur.
- Nothing scales, slides or bounces. Only the digits change.

6.80–8.00: all three stats hold.

## Shot 4: Headline (8.0–10.0 s)

| Time | Action |
|---|---|
| 8.00–8.40 | All numbers and captions fade out together |
| 8.00–8.60 | Court lines, including the net, dim from 55% to 20% so the headline reads cleanly over them |
| 8.40–9.00 | Line 1 fades in and rises 12 px: "You saw pickleball early." |
| 8.90–9.50 | Line 2 fades in and rises 12 px: "Let's do it again." |
| 9.50–10.00 | Hold |

The headline is Montserrat 800, 80 px, white, 1.08 line height. Its left edge sits on the left baseline (x 96), with first-line baselines at about y 410 and y 496. Line 1 measures about 1,150 px, so it ends near x 1,250, well inside the safe area. Because the stage scales uniformly, the headline can't clip at any container size.

## Shot 5: The empty slot (10.0–12.0 s)

| Time | Action |
|---|---|
| 10.00–10.50 | A thin white rectangle (1.5 px stroke, 360 × 120, 3:1, sharp corners, empty) draws itself as one stroke. It starts at its bottom-left corner on the baseline x (96, 690), runs right along the bottom edge, then continues round the rest of the rectangle. Its top-left is at (96, 570). |
| 10.25–10.55 | Caption fades in to the right of the rectangle, vertically centred on it, at x 492: "Official Footwear Partner of USA Padel". It's Inter 400, 24 px, white. |
| 10.50–11.70 | Hold for 1.2 s on the full composition: court at 20%, logo plate, headline, rectangle, caption |
| 11.70–12.00 | Everything fades to the empty navy field (ease-in) |
| 12.00 | The loop restarts at shot 1 on an identical navy frame, with no jump |

The rectangle contains no mark, text, silhouette or product.

---

## Reduced motion

With `prefers-reduced-motion: reduce`, the page shows the shot 5 hold frame (t = 11.0 s) as a static composition and starts no animation loop. That frame contains the court at 20%, the logo plate, the headline, the empty rectangle and the partner caption. The three stats don't appear in the static frame (see question 4).

## Small containers

Uniform scaling keeps the layout intact, but at 360 px wide the stage scale is 0.225, so 20 px captions would render at about 4.5 px. Below a 640 px container width I'd enlarge only the Inter text (descriptor, captions and partner caption) up to a 9 px rendered minimum. That text rewraps inside its zone widths, and nothing else moves. The Montserrat numbers and headline keep their uniform scale.

## Build notes

These notes shape the build but aren't shots.

- **Structure:** a single inline SVG with a `viewBox` of 1600 × 900. About 20 elements, one `requestAnimationFrame` loop and no libraries.
- **Deterministic frames:** every frame is a pure function `render(t)` of loop time, so the `render.js` step can seek frame by frame at 30 fps with no drift.
- **Logo:** embedded as a base64 PNG, downsized to about 600 px wide, so the file stays self-contained and under 400 KB.
- **Fonts:** the animation waits for Google Fonts to load before starting, so the first frames aren't drawn in a fallback face.
- **Background tabs:** the loop pauses when the page is hidden.

---

## Open questions (please confirm or correct)

1. **Which "baseline"?** In plan view with the long axis horizontal, the baselines are the short end lines, which are vertical. I've read "left-aligned to the court's baseline" as the headline and the shoe rectangle sharing the left end line (x 96) as their left edge. For shot 5, "along the baseline" then means the rectangle starts on that line and draws its long bottom edge first. If you meant a horizontal line, I'd rotate the court or use the bottom sideline instead.
2. **Three zones.** The court naturally has four zones between its lines. I've put the logo in the left back court and the three stats in the left service area, the right service area and the right back court. The alternative is to shrink the logo plate to above the court and use only the service areas plus one back court, but that crowds the top margin.
3. **Shot 5 timing.** A 1.2 s hold plus a fade doesn't fit in 2.0 s once the rectangle has to draw itself. I've compressed the draw to 0.5 s and the fade to 0.3 s. The other option is a 12.5 s loop, with the fade taking 11.7–12.2.
4. **Final frame for reduced motion.** It has no stats. Should the static version keep `1,110 / ~460,000 / 250+` in small type along the bottom, or stay as specified?
5. **Logo file.** `USA Padel MAIN LOGO.png` is not in the working directory or on this branch. Please commit it to `usa-padel-hero/` on `claude/amazing-bardeen-12du54`. If you'd rather I use the image you attached in chat, I can, but it's a flattened webp and may not have a transparent background (that's harmless on the white plate).
