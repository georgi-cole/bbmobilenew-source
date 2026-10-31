import { execFileSync } from 'node:child_process'

/** Preserve executable .command entries when a Mac ZIP is created on Windows. */
export function setMacArchiveScriptModes(archive) {
  const code = `
import json, stat, sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'a') as package:
    scripts = [entry.filename for entry in package.infolist() if entry.filename.endswith('.command')]
    if not scripts:
        raise RuntimeError('The Mac package has no command runner')
    for name in scripts:
        entry = package.getinfo(name)
        entry.create_system = 3
        entry.external_attr = (stat.S_IFREG | 0o755) << 16
    package.comment = package.comment
with zipfile.ZipFile(sys.argv[1]) as package:
    for name in scripts:
        entry = package.getinfo(name)
        if entry.create_system != 3 or not ((entry.external_attr >> 16) & stat.S_IXUSR):
            raise RuntimeError('The Mac runner is not executable')
print(json.dumps({'executableScripts': scripts}))
`
  return JSON.parse(
    execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', code, archive], {
      encoding: 'utf8',
      windowsHide: true,
    })
  )
}
