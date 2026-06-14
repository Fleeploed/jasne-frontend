/**
 * Maximum Dynamic Type scaling for Help text. Previously hard-clamped to 1,
 * which disabled OS font scaling entirely and left large-font users unable to
 * read the guides. 1.6 lets text grow well past the largest standard iOS size
 * (~1.35x) into the lower accessibility range while keeping dense layouts
 * (the OAMP status form, single-line truncated rows) intact.
 */
export const HELP_TEXT_SCALE = 1.6;
