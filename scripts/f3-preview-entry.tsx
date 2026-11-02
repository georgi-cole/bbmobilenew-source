import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, { createInitialGameState } from '../src/store/gameSlice'
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice'
import vipReducer, { loadVipState } from '../src/store/vipSlice'
import FinalThreeCompetitionBroadcast from '../src/components/FinalThreeCompetitionBroadcast/FinalThreeCompetitionBroadcast'

const global = window
let currentRoot = null
global.__f3Start = (options = {}) => {
  currentRoot?.unmount()
  const part = options.part || 1
  const vox = Boolean(options.vox)
  const viewer = options.viewer || 'jury'
  const initial = createInitialGameState({ seed: options.seed || 111 })
  const base = initial.players[0]
  const players = ['Dex', 'Aria', 'Ash'].map((name) => ({
    ...base,
    id: name.toLowerCase(),
    name,
    isUser: false,
    status: 'active',
    appearance: undefined,
    avatar: `assets/skins/${name}_avatar.webp`,
    stats: {
      ...base.stats,
      lohWins: name === 'Dex' ? 2 : name === 'Aria' ? 1 : 0,
      posWins: name === 'Aria' ? 3 : name === 'Dex' ? 1 : 0,
      timesNominated: name === 'Ash' ? 4 : name === 'Dex' ? 3 : 2,
    },
  }))
  players.push({
    ...base,
    id: 'user',
    name: 'You',
    isUser: true,
    status: viewer === 'jury' ? 'jury' : 'active',
    avatar: 'assets/skins/Character3_avatar.webp',
    appearance: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
  })
  if (viewer !== 'jury') players[2].status = 'jury'
  const part1WinnerId = viewer === 'qualified' ? 'user' : 'dex'
  const competitorIds = part === 1
    ? ['dex','aria','ash']
    : part === 2 && viewer === 'jury'
      ? ['aria','ash']
      : ['dex','aria']
  const expectedWinnerId = options.winnerId || competitorIds[competitorIds.length - 1]
  const game = {
    ...initial,
    gameId: 'f3-preview-verified-source',
    phase: part === 1 ? 'final3' : part === 2 ? 'final3_comp2' : 'final3_comp3',
    seed: options.seed || 111,
    week: 12,
    season: 4,
    players,
    lohId: 'dex',
    nomineeIds: [],
    tvFeed: [],
    spectatorActive: null,
    f3Part1WinnerId: part > 1 ? part1WinnerId : null,
    f3Part2WinnerId: part > 2 ? 'aria' : null,
    finalThree: {
      mode: vox ? 'vox_populi' : 'classic',
      stage: part === 1 ? 'part1' : part === 2 ? 'part2' : 'part3',
      openingSeen: true,
      blockRevealSeen: true,
      spectatorFinalPowerRevealSeen: false,
      participantIds: players.filter(p=>p.status==='active').map(p=>p.id),
      part1: part > 1 ? { participantIds: ['dex','aria','ash'], winnerId: part1WinnerId, seed: 10 } : null,
      part2: part > 2 ? { participantIds: ['aria','ash'], winnerId: 'aria', seed: 20 } : null,
      part3: null, finalPowerHolderId:null, nomineeIds:[], evicteeId:null,
    },
    voxPopuli: vox ? {...initial.voxPopuli, status:'active', immunityWinnerId:null} : initial.voxPopuli,
  }
  const store = configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, vip: vipReducer },
    preloadedState: {
      game,
      settings: {
        ...DEFAULT_SETTINGS,
        audio: { ...DEFAULT_SETTINGS.audio, sfxOn: false },
        gameUX: { ...DEFAULT_SETTINGS.gameUX, animationMode:'cinematic', animations: true },
        display: { ...DEFAULT_SETTINGS.display, reduceMotion:false },
      },
      vip: { ...loadVipState(), isActive:true, debugUnlocked:false },
    },
  })
  document.body.replaceChildren()
  document.body.style.cssText = 'margin:0;background:#040309;overflow:hidden'
  const host = document.createElement('div')
  document.body.appendChild(host)
  currentRoot = createRoot(host)
  global.__f3Done = false
  global.__f3State = store
  currentRoot.render(
    React.createElement(
      Provider,{store},
      React.createElement(FinalThreeCompetitionBroadcast,{
        part,competitorIds,expectedWinnerId,
        onDone:()=>{global.__f3Done=true},
      })
    )
  )
  return {part,competitorIds,expectedWinnerId,vox}
}
global.__f3Ready = true
