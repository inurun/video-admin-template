export const OPENROUTER_G2P_SYSTEM_PROMPT = `Convert Japanese utterances into extended kana for TTS, read as natural Tokyo-dialect speech.

# Input
pages lists each page's utterances in playback order. Convert only target=true utterances; use target=false ones as context only.

# Format
Example: 猫が窓から外を見ている！ → 猫:ネ'コ|が:ガ/窓:マ'ド|から:カラ/外:ソ'ト|を:ヲ/見:ミ'|て:テ|いる:イル！
- Word = surface:reading. Words in one accent phrase are joined by |.
- A phrase ends with / (no pause), 、 (pause), ？ or ！. Put 、？！ exactly where the text has punctuation (、。… → 、, ?？ → ？, !！ → ！), same count; never add 、 anywhere else. A run of pause marks (……, 、、) is one 、. A sentence-final 。 or … may be dropped. Never end kana with /.
- ' marks the accent nucleus: exactly one per phrase, right after the nucleus mora. Flat phrase: ' after its last mora.

# Surface
- Copy the text verbatim (kanji, kana, latin, width, case). Surfaces concatenated must equal the text minus punctuation, brackets and spaces. Never put : | / ' 、 ？ ！ or spaces in a surface; ' goes in the reading only.
- Every character the reading covers is in the surface (なんだ:ナ'ンダ, never な:ナ'ン|だ:ダ).
- Skip brackets and symbols, except dictionary words containing them (e.g. （笑）): use that whole word as one surface.
- Word granularity is free.
- Numbers: copy the digits (3.14:サンテンイチヨン, 6:ロッ|本:ポン). To split a number into several phrases, rewrite it as kanji numerals and keep counters as separate words (1985年 → 千:セ'ン/九百:キューヒャク/八十五:ハチジューゴ|年:ネ'ン; 十:ジュー|月:ガツ, never 十月).

# Reading
- Katakana as pronounced: particle は→ワ, へ→エ, を→ヲ. Long vowels as ー (先生:センセー, でしょう:デショー), but keep verb/adjective endings (思う:オモウ, 美味しい:オイシイ).
- Choose homograph readings from context. Latin words as commonly said in Japanese (SQL:エスキューエル). Numbers as spoken (2日:フツカ, 6本:ロッポン).

# Accent (Tokyo)
- Nucleus on mora 1: H L L…; on mora n>1: L H…H(n) L…; flat: L H H…. Morae 1 and 2 always differ; no rise after a fall.
- About one phrase per bunsetsu. Particles, auxiliaries and helpers (ない, たい, ている, ておく, ちゃう, そう, ます, のだ, では) stay in the preceding word's phrase (行きたくない:イキタク'ナイ); never make a phrase of particles or auxiliaries alone. Split a phrase that would need two falls.
- Odaka and flat differ before a particle: 犬が:イヌ'|ガ, 水が:ミズ|ガ'.
- Conjugation moves verb nuclei: 起きる:オキ'ル, 起きた:オ'キタ, 起きない:オキ'ナイ; flat verbs stay flat (遊んで:アソンデ'). ます/ました: nucleus on マ. です keeps an accented word's nucleus (猫です:ネ'コ|デス), otherwise デ'ス (学生です:ガクセー|デ'ス).
- Numeral + counter has its own accent: 1:イ'ッ|本:ポン, 3:サン|人:ニ'ン.
- A compound takes one new nucleus (天気予報:テンキヨ'ホー). Do not move nuclei for ？.

# Dictionary
- fixed: always use its reading, even if unusual; accent = nucleus mora (0 = flat).
- contextual: pick the candidate whose examples fit the context.

# Check each target before output
1. Exactly one ' in every phrase: count the ' between each pair of / 、 ？ ！.
2. Surfaces concatenate to the text minus symbols; no character dropped.
3. 、？！ count and positions match the text.
4. fixed dictionary readings are used.

Return { "id", "kana" } (whole utterance) for every target. JSON only.`;

export const OPENROUTER_G2P_REPAIR_PROMPT = `# Repair
The input is items, not pages. Each item's previousKana failed validation; errors give the reasons.
- Fix only what errors point out; keep the readings and accents.
- surface_mismatch: a surface differs from the text. Copy it from the text verbatim.
- Return the whole corrected kana.`;

export function getOpenRouterG2pSystemPrompt(input: { repair: boolean }) {
  return input.repair
    ? `${OPENROUTER_G2P_SYSTEM_PROMPT}\n\n${OPENROUTER_G2P_REPAIR_PROMPT}`
    : OPENROUTER_G2P_SYSTEM_PROMPT;
}
