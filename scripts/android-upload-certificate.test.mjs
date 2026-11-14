import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyUploadCertificate } from './lib/android-upload-certificate.mjs'

const registered = '65:B5:34:95:6A:38:CF:CA:4D:8C:A2:1C:B0:E9:C6:7C:DA:A8:91:12'
const previousAutomation = '54:E6:AD:90:FB:01:E7:71:74:86:DA:EA:45:86:38:BB:A1:20:F5:07'

test('accepts the registered certificate with Windows or Unix keytool output', () => {
  for (const newline of ['\n', '\r\n'])
    verifyUploadCertificate(
      `Alias name: bigeye${newline}Certificate fingerprints:${newline}\t SHA1: ${registered.toLowerCase()}${newline}\t SHA256: public${newline}`,
      registered
    )
})

test('rejects the previously saved automation key before building or publishing', () => {
  assert.throws(
    () => verifyUploadCertificate(`SHA1: ${previousAutomation}\n`, registered),
    /does not match Google Play/
  )
})

test('missing expected certificates, malformed output and ambiguous aliases fail closed', () => {
  assert.throws(
    () => verifyUploadCertificate(`SHA1: ${registered}`, undefined),
    /registered upload certificate/
  )
  for (const output of ['', 'SHA1: 65:B5', `SHA1: ${registered}\nSHA1: ${registered}\n`])
    assert.throws(() => verifyUploadCertificate(output, registered), /exactly one/)
})
