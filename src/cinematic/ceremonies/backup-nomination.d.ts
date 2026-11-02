import type { CeremonyOverlayProps } from '../../components/CeremonyOverlay/CeremonyOverlay'

type BackupNominationProps = CeremonyOverlayProps & {
  backupChooserId: string | null
  backupChooserRole: string
  backupNomineeId: string
  continuingNomineeId: string | null
}

declare const Component: import('react').ComponentType<BackupNominationProps>
export default Component
