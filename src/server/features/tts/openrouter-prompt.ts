export const OPENROUTER_G2P_SYSTEM_PROMPT = `Convert Japanese utterances into extended kana for TTS, read as natural Tokyo-dialect speech.

# Input
pages lists each page's utterances in playback order. Convert only target=true utterances; use target=false ones as context only. provider is the TTS engine that reads the utterance; follow its section below if there is one.

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
- Numbers: copy the digits (3.14:サンテンイチヨン, 6:ロッ|本:ポン, 20:ニジュッ|分:プン). To split a number into several phrases, rewrite it as kanji numerals and keep counters as separate words (1985年 → 千:セ'ン/九百:キューヒャク/八十五:ハチジューゴ|年:ネ'ン; 十:ジュー|月:ガツ, never 十月).

# Reading
- Katakana as pronounced: particle は→ワ, へ→エ, を→ヲ. Long vowels as ー (先生:センセー, でしょう:デショー), but keep verb/adjective endings (思う:オモウ, 美味しい:オイシイ).
- Choose homograph readings from context. Latin words as commonly said in Japanese (SQL:エスキューエル). Numbers as spoken (2日:フツカ, 6本:ロッポン).

# Accent (Tokyo)
- Nucleus on mora 1: H L L…; on mora n>1: L H…H(n) L…; flat: L H H…. Morae 1 and 2 always differ; no rise after a fall.
- About one phrase per bunsetsu. Particles, auxiliaries and helpers (ない, たい, ている/てる, ちゃう, そう, ます, のだ, では) stay in the preceding word's phrase (行きたくない:イキタク'ナイ); never make a phrase of particles or auxiliaries alone. Split a phrase that would need two falls.
- A noun followed directly by ある is two phrases: 関係ある → 関係:カンケー'/ある:ア'ル.
- Honorific helper verbs (いただく, くださる, 申し上げる) start their own phrase: お集まり:オアツマリ'/いただき:イタダキ'.
- After て, the helpers くる, おく, くれる and みる start their own phrase; the て-form keeps the verb's own accent: なってきた:ナ'ッ|テ/き:キ'|た:タ, 出しておいた:ダ'シ|テ/おい:オイ|た:タ', 試してみた:タメ'シ|テ/み:ミ'|た:タ.
- Odaka and flat differ before a particle: 犬が:イヌ'|ガ, 水が:ミズ|ガ', 昨日は:キノー'|ワ.
- After a flat word, より, だと and だけど keep their own nucleus (私より:ワタシ|ヨ'リ, 将棋だと:ショーギ|ダ'|ト, 上手(うわて)だけど:ウワテ|ダ'|ケド). から does so after a flat verb (行くから:イク|カ'ラ) but not after a flat noun (札幌から:サッポロ|カラ').
- ずつ takes the nucleus and the word before it loses its own: 一人ずつ:ヒトリ|ズ'ツ, 少しずつ:スコシ|ズ'ツ.
- Words ending in 中 (じゅう) are flat: 世界中の:セカイジュー|ノ', 今日中には:キョージュー|ニ'|ワ.
- Conjugation moves verb nuclei: 起きる:オキ'ル, 起きた:オ'キタ, 起きない:オキ'ナイ, 起きられなかった:オキラレ'ナカッタ; flat verbs stay flat (遊んで:アソンデ', 探した:サガシタ') and put the nucleus on ナ of ない (遊ばなかった:アソバナ'カッタ). ます/ました: nucleus on マ. です keeps an accented word's nucleus (猫です:ネ'コ|デス), otherwise デ'ス (学生です:ガクセー|デ'ス).
- Numeral + counter has its own accent: 1:イ'ッ|本:ポン, 3:サン|人:ニ'ン, 一:イチ|枚:マ'イ, 六:ロク'|年:ネン, 十:ジュー|月:ガツ'.
- A set compound takes one new nucleus (天気予報:テンキヨ'ホー, 年末年始:ネンマツネ'ンシ, 営業時間:エーギョージ'カン). Ad-hoc label compounds with 限定 or 半額 stay two phrases, each with its own accent: 季節限定の → 季節:キセツ'/限定:ゲンテー|の:ノ', 半額キャンペーンの → 半額:ハンガク'/キャンペーン:キャンペー'ン|の:ノ. Do not move nuclei for ？.

# VoiSona (provider=voisona only)
Split only in these cases; everywhere else follow the general rules. Each new phrase still has exactly one '.
- Numbers from 21 up with a nonzero ones digit: put the ones digit and its counter in a phrase of their own (2026年 → 二千:ニセン|二十:ニ'ジュー/六:ロク'|年:ネン; 29日 → 二十:ニ'ジュー/九:ク'|日:ニチ). Keep 11-19 whole (18度:ジューハチ'|度:ド).
- 倍 and くらい after a number get their own phrase: 1.5倍の → 1.5:イ'ッテンゴ/倍:バイ|の:ノ'; 20分くらいで → 20:ニジュッ|分:プン'/くらい:ク'ライ|で:デ.
- Negative tails get their own phrase: 上手じゃない → 上手:ジョーズ'|じゃ:ジャ/ない:ナ'イ; 繋がらなくなった → 繋がら:ツナガラ|なく:ナク'/なっ:ナ'ッ|た:タ.

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
