import { build } from 'esbuild'
import path from 'node:path'
const output = path.resolve('preview-export/preview')
await build({
  entryPoints:['scripts/f3-preview-entry.tsx'],
  outfile:path.join(output,'f3-preview.js'),
  bundle:true,
  platform:'browser',
  format:'iife',
  jsx:'automatic',
  target:'es2022',
  minify:false,
  sourcemap:false,
  plugins:[{
    name:'preview-artwork-only',
    setup(bundle) {
      bundle.onResolve({filter:/^\.\/competitionBroadcastArtwork$/}, args=>{
        if(args.importer.endsWith('FinalThreeCompetitionBroadcast.tsx')){
          return {path:path.resolve('scripts/f3-preview-artwork.ts')}
        }
      })
    }
  }],
  // Vite normally injects this object. The standalone review bundle must
  // define it explicitly; otherwise the production modules crash on launch.
  define: {
    'import.meta.env': JSON.stringify({
      BASE_URL: '/bbmobilenew/',
      DEV: false,
      PROD: true,
      MODE: 'release',
      VITE_BUILD_TARGET: 'web',
      VITE_AUDIO_DEBUG: 'false',
    }),
  },
  loader:{
    '.webp':'dataurl','.png':'dataurl','.jpg':'dataurl',
    '.svg':'dataurl','.woff2':'dataurl','.mp3':'dataurl',
    '.css':'css',
  },
  logLevel:'info',
})
