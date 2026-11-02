import { build } from 'esbuild'
import path from 'node:path'
const output = path.resolve('preview-export/preview')
await build({
  entryPoints:['scripts/f3-preview-entry.tsx'],
  outfile:path.join(output,'f3-preview.js'),
  bundle:true,
  platform:'browser',
  format:'iife',
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
  define:{
    'import.meta.env.BASE_URL':'"/bbmobilenew/"',
    'import.meta.env.DEV':'false',
    'import.meta.env.PROD':'true',
    'import.meta.env.MODE':'"release"',
  },
  loader:{
    '.webp':'dataurl','.png':'dataurl','.jpg':'dataurl',
    '.svg':'dataurl','.woff2':'dataurl','.mp3':'dataurl',
    '.css':'css',
  },
  logLevel:'info',
})
