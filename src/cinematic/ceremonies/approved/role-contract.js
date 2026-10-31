export const ROLE_PACKS = {
  a: {
    label: 'Role A',
    poses: {
      ceremonyFront: 'cinema_standA',
      decisionBack: 'cinema_decisionA',
      royalSeated: 'cinema_seatedA',
    },
  },
  b: {
    label: 'Role B',
    poses: { ceremonyFront: 'cinema_standB', decisionBack: 'cinema_decisionB' },
  },
  c: { label: 'Role C', poses: { ceremonyFront: 'cinema_standC', exitBack: 'cinema_exitC' } },
}
export const ROLE_CASTS = [
  ['a', 'b', 'c'],
  ['b', 'a', 'c'],
]
