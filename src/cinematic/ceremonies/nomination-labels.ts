/** Drop only the redundant ordinal status, preserving real names/pair labels. */
export function removeNominationOrdinalLabels(root: ParentNode) {
  for (const label of root.querySelectorAll('.nom-label'))
    if (/^\s*0?\d+\s*NOMINATED\s*$/i.test(label.textContent ?? '')) label.remove()
}
