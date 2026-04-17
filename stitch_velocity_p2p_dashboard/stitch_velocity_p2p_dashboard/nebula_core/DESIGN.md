# Design System Strategy: High-Performance P2P Systems

## 1. Overview & Creative North Star: "The Kinetic Engine"
The Creative North Star for this system is **"The Kinetic Engine."** 

Unlike consumer applications that prioritize "friendliness," this system is a high-precision instrument. It treats data as a physical substance—flowing, pausing, and accelerating. We move beyond the "template" look by embracing a **Technical Brutalist** layout: intentional asymmetry, high-density information clusters, and a deep-space hierarchy. The UI should feel like a specialized terminal for an engineer—authoritative, silent, and blindingly fast.

To break the "standard dashboard" feel, we use **Tonal Recess**. Instead of pushing elements *out* at the user with shadows, we carve elements *into* the dark canvas using varied surface depths and light-emitting accents.

---

## 2. Colors: Luminance vs. Void
The palette is built on a "Void" foundation, where color is used solely to indicate energy or status.

*   **Primary Foundation:** The background uses `surface` (#131313). 
*   **The Neon Pulse:** `primary_container` (#39FF14) is our high-energy accent. It is reserved for active data flow, successful connections, and primary actions.
*   **The Data Stream:** `secondary_container` (#508EFF) represents the "Subtle Blue" utility. Use this for passive metrics, DHT status, and secondary background processes.
*   **The "No-Line" Rule:** Physical 1px borders are strictly prohibited for structural sectioning. To separate a "Transfers" list from the "Global Stats" sidebar, use a shift from `surface` to `surface_container_low`. 
*   **Surface Hierarchy & Nesting:** 
    *   **Level 0 (Base):** `surface` (#131313)
    *   **Level 1 (Sections):** `surface_container_low` (#1C1B1B)
    *   **Level 2 (In-set Cards):** `surface_container` (#201F1F)
    *   **Level 3 (Interactive/Active):** `surface_container_highest` (#353534)
*   **The "Glass & Gradient" Rule:** Floating modals or hover-state details must use Glassmorphism. Apply `surface_variant` at 60% opacity with a `40px` backdrop-blur. 
*   **Signature Textures:** For high-value metrics (e.g., Total Download Speed), apply a subtle linear gradient: `primary_fixed_dim` to `primary_container` at a 45-degree angle.

---

## 3. Typography: Technical Authority
We use a high-contrast scale to ensure that even in high-density views, the hierarchy is undeniable.

*   **Display & Headlines (Space Grotesk):** This font provides a wide, "engineered" look. Use `display-md` for massive throughput numbers (e.g., "42.8 MB/s") to give them physical weight.
*   **Titles & Labels (Inter):** Inter handles the "hard work." Use `label-md` or `label-sm` in All Caps with 0.05em letter spacing for metadata (e.g., "HASH", "PEERS", "RATIO").
*   **Hierarchy via Weight:** In this system, weight is more important than size. A `title-sm` in Bold is more authoritative than a `body-lg` in Regular. Use this to anchor the user's eye in dense data tables.

---

## 4. Elevation & Depth: Tonal Layering
In a dark, tech-heavy environment, traditional shadows feel "muddy." We use light and opacity to define space.

*   **The Layering Principle:** Instead of lifting a card with a shadow, "sink" the background. To highlight a specific torrent in a list, change its background to `surface_container_high` while the rest of the list remains `surface_container_low`.
*   **Ambient Shadows:** If an element must float (e.g., a right-click context menu), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6)`.
*   **The "Ghost Border" Fallback:** For input fields or button boundaries, use the `outline_variant` token at **15% opacity**. It should be felt, not seen—a "whisper" of a boundary that prevents the UI from feeling cluttered.
*   **Glow as Depth:** For critical status (e.g., an error), use a `0 0 12px` glow using the `error` (#FFB4AB) color at 20% opacity rather than a thick border.

---

## 5. Components: High-Density Instrumentation

*   **Buttons:**
    *   **Primary:** Solid `primary_container` (#39FF14) with `on_primary_fixed` text. Sharp `DEFAULT` (0.25rem) corners to maintain the "tech" feel.
    *   **Tertiary (Ghost):** No background. `primary` text. Use for low-priority actions like "Clear Finished."
*   **Neon Progress Bars:**
    *   Track: `surface_container_highest`.
    *   Fill: `primary_container` (#39FF14). 
    *   *Signature Detail:* Add a `1px` right-aligned "cap" on the fill with a white `surface_bright` color to simulate a leading edge of data moving through a pipe.
*   **Cards & Lists:** 
    *   **Forbidden:** Divider lines. 
    *   **Required:** Vertical whitespace. Use the 16px or 24px spacing slots. Separate individual torrent entries by shifting background tones (`surface_container_low` vs `surface_container_lowest`).
*   **Status Indicators:** Small 6px circles. Use `primary_fixed` for Active, `secondary_container` for Seeding, and `error` for Stalled.
*   **Data Grids (The Core):** Use `label-sm` for headers. Rows should have a hover state of `surface_bright` at 5% opacity. This "lights up" the data as the user scans it.
*   **Node Map (Custom Component):** A P2P app needs a peer visualization. Use a canvas element with `secondary_container` lines at 10% opacity, connecting nodes that pulse with `primary_container` when data packets are exchanged.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use monospaced numerals (Inter features tabular num alignment) for all fluctuating data like speeds and file sizes to prevent "jitter."
*   **Do** embrace density. This is a pro tool. Users want to see 20+ torrents at once, not 5.
*   **Do** use "Optical Alignment." Icons should be visually centered, even if mathematically they aren't, especially inside small `surface_container` circles.

### Don't:
*   **Don't** use pure #000000 or pure white #FFFFFF. Use the `surface` and `on_surface` tokens to maintain the high-end "charcoal and neon" aesthetic.
*   **Don't** use large border-radii. Keep it to `DEFAULT` (4px) or `sm` (2px). Rounded "pill" shapes are for social apps; sharp, precise corners are for P2P engines.
*   **Don't** hide critical data behind tooltips. If the "Hash" or "Tracker Status" is important, find a way to fit it into the high-density grid using a smaller typography scale (`label-sm`).