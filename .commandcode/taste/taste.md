# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# css
- Use Tailwind's group-hover CSS pattern (group-hover:opacity-100 with opacity-0 base, absolute positioning) instead of React state-based visibility (useState + onMouseEnter/onMouseLeave) for tooltip hover interactions. Confidence: 0.65

# border-glow
- Use BorderGlow's `backgroundColor` and `borderRadius` props instead of applying background, border, or border-radius classes to the inner wrapper div; the inner wrapper should be a transparent layout-only container (backdrop-blur-md p-5 flex flex-col h-full). Confidence: 0.70
- Remove the static base `border` from `.border-glow-card` in BorderGlow.css (set to `border: none`) to avoid visual conflict between the static outline and the animated colored glow border. Confidence: 0.70
- Replace the stacked 6-layer box-shadow on `.border-glow-card` with a single subtle shadow (`rgba(0, 0, 0, 0.4) 0px 8px 24px`) to avoid a visible glow/outline around card edges on dark page backgrounds. Confidence: 0.70

# date-format
- Format dates as dd-mm-yyyy using a helper: `const formatDate = (dateStr: string) => { const d = new Date(dateStr); const day = String(d.getDate()).padStart(2, '0'); const month = String(d.getMonth() + 1).padStart(2, '0'); const year = d.getFullYear(); return `${day}-${month}-${year}`; }`. Confidence: 0.65

# ui-patterns
- Use the existing InfoTooltip component (custom (i) icon popup) instead of native HTML title attributes for table header tooltips, matching the existing MMR column pattern. Confidence: 0.70

# data-fetching
- Fetch external links (partner, social media, discord) from the database (SystemSettings/global_settings config) instead of hardcoding them, so administrators can manage them dynamically. Confidence: 0.80

# css
- Use slide-in `::before` pseudo-element animation for all skewed buttons: nav tiles slide in `#3E3C40`, hero buttons slide in `#141414` (both use `right: 100%` → `left: 0; right: 0` transition). Confidence: 0.65

# supabase
- Use the `ranking_leaderboard` table instead of the `players` table for all Supabase operations throughout the project. Confidence: 0.65

# constants
- Centralize duplicated hardcoded values (IDs, URLs, config) into a single exported constant/config file instead of duplicating them across files, to prevent mismatches. Confidence: 0.75

# ui-feedback
- Use the `sonner` library (`toast.success()` / `toast.error()`) for user-facing success/error feedback instead of `alert()` or inline-only messages, with a dark-themed `<Toaster>` positioned bottom-right. Confidence: 0.85

# code-organization
- When making UI/style-only changes (Tailwind CSS, layout, visual polish), strictly preserve 100% of existing business logic, database queries, routing, state management, form handlers, and API calls — never refactor functional code during a visual overhaul. Confidence: 0.90

# css
- Style form inputs, textareas, and selects with dark backgrounds (`bg-[#181a20]`), colored focus rings (`focus:ring-2 focus:ring-{color}-600 focus:border-transparent`), and subtle border defaults for a sleek dark theme. Confidence: 0.70
- Use subtle glow effects (`shadow-[0_0_Xpx_rgba(...)]`) on status badges to visually distinguish states (published vs draft). Confidence: 0.65

# routing
- Catch-all `[slug]` routes should validate the slug against a known set of page identifiers and call `notFound()` (from `next/navigation`) for any unrecognized slug, so that truly invalid URLs render the custom 404 page (`not-found.tsx`) instead of showing fallback/placeholder content. Confidence: 0.80

