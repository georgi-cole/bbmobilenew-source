export type CharacterAssetPath = `assets/characters/${string}`

export interface CharacterPresetAssets {
  thumbnail: CharacterAssetPath
  portrait: CharacterAssetPath
  body: CharacterAssetPath
}

/** Describes visible artwork. These fields never edit Player gameplay attributes. */
export interface CharacterTraits {
  ageAppearance: 'young-adult' | 'middle-adult' | 'older-adult'
  build: 'slim' | 'average' | 'athletic' | 'fuller' | 'broad'
  browShape: 'straight' | 'arched' | 'rounded' | 'strong' | 'other'
  eyeColor: 'brown' | 'blue' | 'green' | 'hazel' | 'gray' | 'other'
  facialHair: 'none' | 'stubble' | 'beard' | 'moustache'
  hairColor: 'dark' | 'brown' | 'blonde' | 'red' | 'silver' | 'other'
  hairLength: 'bald' | 'short' | 'medium' | 'long'
  skinTone: 'light' | 'light-medium' | 'medium' | 'medium-deep' | 'deep'
}

/** A released, locally renderable art revision. Non-selectable revisions remain readable by saves. */
export interface CharacterPreset {
  id: string
  revision: number
  displayLabel: string
  selectable: boolean
  assets: CharacterPresetAssets
  traits: CharacterTraits
}
