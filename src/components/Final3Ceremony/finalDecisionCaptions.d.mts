/** Keeps complete thoughts and balanced clauses inside a measured text surface. */
export function paginateCeremonyCaption(
  text: string | null | undefined,
  fits: (candidate: string) => boolean
): string[]
