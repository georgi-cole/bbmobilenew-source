import { readFile } from 'node:fs/promises'
import { verifyUploadCertificate } from './lib/android-upload-certificate.mjs'

if (process.argv.length !== 3) throw new Error('Pass the keytool certificate-details file.')
verifyUploadCertificate(
  await readFile(process.argv[2], 'utf8'),
  process.env.ANDROID_UPLOAD_CERTIFICATE_SHA1
)
console.log('Android signing certificate matches the Google Play upload key.')
