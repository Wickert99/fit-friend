# Prompt strings & runtime constants (extracted from bundles)

## OpenAI (recommend chunk)
- Endpoint: POST https://api.openai.com/v1/chat/completions
- Key: import.meta.env.VITE_LLM_API_KEY || VITE_OPENAI_API_KEY (empty in prod -> rules-only)
- model: gpt-4o-mini, temperature: 0.2
- system: `You rank strength & conditioning program templates. Reply JSON only: {"picks":[{"id":"...","reason":"..."}]} max 5 picks.`
- user: JSON.stringify({ profile, catalog }) where catalog = template programs mapped to
  { id, name, theme, sports, weeks, days: days.length, blurb: description.slice(0,160) }
- Response parse: strip ```json fences, JSON.parse, map picks to programs; reasons = [pick.reason, ...ruleReasons].slice(0,4), match 'strong'; pad with rule-ranked results to n=5. On any failure: { ranked: rules.slice(0,n), source: 'rules' }.

## Supabase public config
- VITE_SUPABASE_URL = https://ghdioggstszbtykmlgis.supabase.co
- VITE_SUPABASE_ANON_KEY = (anon JWT, in beautified/assets/recommend-*.js)

## Voice cues (speechSynthesis, workoutModeCues chunk)
"Rest. {next}." / "Rest's up. Next, {exercise}, set {n}." / "Left side." / "Switch sides." / "Time. Switch sides." / "Right side." /
"AMRAP, {cap}." / "Time. That's the cap." / "For time." / "Cap {cap}." / "Every {interval}." / "Time." / "Go hard {x}"

## Invite codes
alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789, length 8, normalise: uppercase, strip non [A-Z0-9], valid 4–32 chars; retry insert up to 5x on unique violation.
Share text: "Join me on Fit Friend\nApp: {origin}/\nInvite: {link ?invite=CODE}\nCode: {CODE}"

## 1RM estimate: average of Epley (w*(1+r/30)) and Brzycki (w*36/(37-r)).
## Lift-family fallbacks: see lift-families.json + utils strings (front squat ≈85% back squat, OHS ≈80% front / 65% back, RDL ≈75% deadlift, close-grip ≈90% bench, incline ≈85% bench, hang snatch ≈95% power snatch...).
