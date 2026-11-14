export function verifyUploadCertificate(certificateDetails, expected) {
  const fingerprint = /^(?:[\dA-F]{2}:){19}[\dA-F]{2}$/i
  if (!fingerprint.test(expected ?? ''))
    throw new Error('A Google Play registered upload certificate SHA-1 is required.')
  const matches = [...certificateDetails.matchAll(/^\s*SHA1:\s*([\dA-F:]+)\s*$/gim)]
  if (matches.length !== 1 || !fingerprint.test(matches[0][1]))
    throw new Error('Could not identify exactly one upload certificate.')
  if (matches[0][1].toUpperCase() !== expected.toUpperCase())
    throw new Error(
      'Android signing key does not match Google Play. Correct the saved signing credentials.'
    )
}
